"""Model router — the explicit, framework-free model invocation layer.

Walks a provider fallback chain (Qwen Cloud -> OpenRouter free -> Groq -> local
Ollama) calling each OpenAI-compatible /chat/completions endpoint over httpx.
NO LangChain / LlamaIndex — orchestration is custom and visible.

If no remote provider is configured or every provider fails, complete() raises
NoRemoteModelError. Each agent catches that and falls back to its deterministic
local heuristic (see agents/*.py), which is what makes `npm run demo` produce
real, sensible output with zero API keys. The router NEVER calls a paid
endpoint unless HELMSMAN_ALLOW_PAID=true.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

import httpx

from .config import settings


class NoRemoteModelError(RuntimeError):
    """No remote LLM provider was reachable; caller should use its fallback."""


@dataclass
class Provider:
    id: str
    provider_id: str
    base_url: str
    api_key: str
    priority: int
    paid: bool = False
    # canonical-slug -> this provider's model id
    model_map: dict[str, str] | None = None

    def resolve_model(self, slug: str) -> str:
        if self.model_map and slug in self.model_map:
            return self.model_map[slug]
        if self.model_map and "*" in self.model_map:
            return self.model_map["*"]
        return slug


@dataclass
class CompletionResult:
    text: str
    provider_id: str
    model: str
    latency_ms: int


# Map Helmsman's canonical Qwen slugs onto each provider's catalog.
_QWEN_MAP = {
    "qwen3-8b": settings.model_small,
    "qwen3-32b": settings.model_reasoning,
    "qwen2.5-coder-7b": settings.model_coder,
    "qwen3-long-context": settings.model_longctx,
}
_OPENROUTER_MAP = {
    "qwen3-8b": "qwen/qwen3-8b",
    "qwen3-32b": "qwen/qwen-2.5-72b-instruct:free",
    "qwen2.5-coder-7b": "qwen/qwen-2.5-coder-32b-instruct:free",
    "qwen3-long-context": "qwen/qwen-2.5-72b-instruct:free",
}
_GROQ_MAP = {"*": "llama-3.3-70b-versatile"}
_OLLAMA_MAP = {
    "qwen3-8b": "qwen2.5",
    "qwen3-32b": "qwen2.5",
    "qwen2.5-coder-7b": "qwen2.5-coder",
    "qwen3-long-context": "qwen2.5",
}


def build_chain() -> list[Provider]:
    chain: list[Provider] = []
    pr = 100
    if settings.qwen_api_key:
        chain.append(Provider("qwen-primary", "qwen", settings.qwen_base_url, settings.qwen_api_key, pr, model_map=_QWEN_MAP))
        pr += 10
    if settings.openrouter_api_key:
        chain.append(Provider("openrouter-free", "openrouter", settings.openrouter_base_url, settings.openrouter_api_key, pr, model_map=_OPENROUTER_MAP))
        pr += 10
    if settings.groq_api_key:
        chain.append(Provider("groq-llama", "groq", settings.groq_base_url, settings.groq_api_key, pr, model_map=_GROQ_MAP))
        pr += 10
    if settings.ollama_base_url:
        chain.append(Provider("ollama-local", "ollama", settings.ollama_base_url, "", pr, model_map=_OLLAMA_MAP))
        pr += 10
    return sorted(chain, key=lambda p: p.priority)


class ModelRouter:
    def __init__(self) -> None:
        self.chain = build_chain()
        self._report_sink = None  # optional callback(provider_id, ok, latency, reason)

    def has_remote(self) -> bool:
        return any(p for p in self.chain if (settings.allow_paid or not p.paid))

    def describe(self) -> list[str]:
        return [f"{p.provider_id}({p.id})" for p in self.chain] or ["local-fallback-only"]

    async def complete(
        self,
        *,
        model: str,
        system: str,
        user: str,
        json_mode: bool = True,
        thinking: bool = False,
        temperature: float = 0.2,
        max_tokens: int = 2048,
        timeout: float = 40.0,
    ) -> CompletionResult:
        usable = [p for p in self.chain if (settings.allow_paid or not p.paid)]
        if not usable:
            raise NoRemoteModelError("no remote LLM providers configured")

        last_err: Exception | None = None
        async with httpx.AsyncClient(timeout=timeout) as client:
            for p in usable:
                resolved = p.resolve_model(model)
                started = time.monotonic()
                try:
                    text = await self._call(client, p, resolved, system, user, json_mode, thinking, temperature, max_tokens)
                    latency = int((time.monotonic() - started) * 1000)
                    self._report(p.id, True, latency, None)
                    return CompletionResult(text=text, provider_id=p.provider_id, model=resolved, latency_ms=latency)
                except Exception as e:  # noqa: BLE001 — try next provider
                    last_err = e
                    latency = int((time.monotonic() - started) * 1000)
                    self._report(p.id, False, latency, str(e))
                    continue
        raise NoRemoteModelError(f"all providers failed: {last_err}")

    async def _call(self, client, p: Provider, model: str, system: str, user: str, json_mode: bool, thinking: bool, temperature: float, max_tokens: int) -> str:
        headers = {"Content-Type": "application/json"}
        if p.api_key:
            headers["Authorization"] = f"Bearer {p.api_key}"
        if p.provider_id == "openrouter":
            headers["HTTP-Referer"] = "https://github.com/helmsman"
            headers["X-Title"] = "Helmsman"

        body: dict = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        if thinking and p.provider_id == "qwen":
            # DashScope compatible mode toggles reasoning via enable_thinking.
            body["enable_thinking"] = True

        r = await client.post(f"{p.base_url.rstrip('/')}/chat/completions", headers=headers, json=body)
        if r.status_code >= 400:
            # one retry without response_format for providers that reject it
            if json_mode and r.status_code in (400, 422):
                body.pop("response_format", None)
                r = await client.post(f"{p.base_url.rstrip('/')}/chat/completions", headers=headers, json=body)
            if r.status_code >= 400:
                raise httpx.HTTPStatusError(f"{p.provider_id} -> {r.status_code}: {r.text[:200]}", request=r.request, response=r)
        data = r.json()
        choice = data["choices"][0]["message"]
        return choice.get("content") or ""

    def _report(self, provider_id: str, ok: bool, latency_ms: int, reason: str | None) -> None:
        if self._report_sink:
            try:
                self._report_sink(provider_id, ok, latency_ms, reason)
            except Exception:
                pass


router = ModelRouter()
