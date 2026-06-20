"""Model router — the explicit, framework-free model invocation layer.

Walks a provider fallback chain (Qwen Cloud -> OpenRouter free -> Groq -> local
Ollama) calling each OpenAI-compatible /chat/completions endpoint over httpx.
NO LangChain / LlamaIndex — orchestration is custom and visible.

Resilience (added):
  * ONE shared, connection-pooled AsyncClient (reused across calls; closed on
    shutdown) instead of a fresh client per request.
  * Bounded retries with exponential backoff + jitter on TRANSIENT failures
    (429 / 5xx / timeouts / connect errors), honoring a Retry-After header,
    before falling through to the next provider.
  * A global concurrency semaphore so a burst of agents can't open unbounded
    sockets against a provider.
  * Per-provider success/latency reporting + metrics counters.

If no remote provider is configured or every provider exhausts its retries,
complete() raises NoRemoteModelError. Each agent catches that and falls back to
its deterministic local heuristic. The router NEVER calls a paid endpoint unless
HELMSMAN_ALLOW_PAID=true.
"""
from __future__ import annotations

import asyncio
import random
import time
from dataclasses import dataclass

import httpx

from .config import settings
from .metrics import metrics


class NoRemoteModelError(RuntimeError):
    """No remote LLM provider was reachable; caller should use its fallback."""


# HTTP statuses worth retrying on the SAME provider before failing over.
_RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}
# httpx exception types that indicate a transient network problem.
_RETRYABLE_EXC = (
    httpx.TimeoutException,
    httpx.ConnectError,
    httpx.ReadError,
    httpx.WriteError,
    httpx.RemoteProtocolError,
    httpx.PoolTimeout,
)


class _Transient(Exception):
    """Wraps a retryable failure, carrying an optional server Retry-After (s)."""

    def __init__(self, msg: str, retry_after: float | None = None) -> None:
        super().__init__(msg)
        self.retry_after = retry_after


@dataclass
class Provider:
    id: str
    provider_id: str
    base_url: str
    api_key: str
    priority: int
    paid: bool = False
    model_map: dict[str, str] | None = None  # canonical-slug -> provider model id

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
    attempts: int = 1


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


def backoff_delay(attempt: int, retry_after: float | None = None, *, jitter: float = 1.0) -> float:
    """Seconds to wait before retry `attempt` (1-based).

    Exponential base*2^(n-1) capped at backoff_max, honoring a server Retry-After
    when larger. `jitter` in [0,1] scales the random component; pass 0 for a
    deterministic value (used by tests).
    """
    base = settings.llm_backoff_base_ms / 1000.0
    cap = settings.llm_backoff_max_ms / 1000.0
    exp = min(cap, base * (2 ** max(0, attempt - 1)))
    # full jitter: random in [exp/2, exp]; deterministic midpoint when jitter=0
    rand = random.random() if jitter else 0.5
    delay = exp * (0.5 + 0.5 * rand * jitter)
    if retry_after is not None:
        delay = max(delay, retry_after)
    return min(delay, cap if retry_after is None else max(cap, retry_after))


def _parse_retry_after(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return float(value)  # delta-seconds form
    except ValueError:
        return None


class ModelRouter:
    def __init__(self) -> None:
        self.chain = build_chain()
        self._report_sink = None  # optional callback(provider_id, ok, latency, reason)
        self._client: httpx.AsyncClient | None = None
        self._sem = asyncio.Semaphore(max(1, settings.llm_max_concurrency))

    # ---- lifecycle -------------------------------------------------------
    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            limits = httpx.Limits(
                max_connections=max(4, settings.llm_max_concurrency * 2),
                max_keepalive_connections=settings.llm_max_concurrency,
                keepalive_expiry=30.0,
            )
            self._client = httpx.AsyncClient(limits=limits)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
        self._client = None

    def has_remote(self) -> bool:
        return any(p for p in self.chain if (settings.allow_paid or not p.paid))

    def describe(self) -> list[str]:
        return [f"{p.provider_id}({p.id})" for p in self.chain] or ["local-fallback-only"]

    # ---- main entry ------------------------------------------------------
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
        client = self._get_client()
        for p in usable:
            resolved = p.resolve_model(model)
            attempts = max(1, settings.llm_max_attempts)
            for attempt in range(1, attempts + 1):
                metrics.incr("llm.attempt")
                started = time.monotonic()
                try:
                    async with self._sem:
                        text = await self._call(client, p, resolved, system, user, json_mode, thinking, temperature, max_tokens, timeout)
                    latency = int((time.monotonic() - started) * 1000)
                    metrics.incr("llm.success")
                    metrics.observe(f"llm.{p.provider_id}", latency)
                    self._report(p.id, True, latency, None)
                    return CompletionResult(text=text, provider_id=p.provider_id, model=resolved, latency_ms=latency, attempts=attempt)
                except _Transient as e:
                    last_err = e
                    latency = int((time.monotonic() - started) * 1000)
                    self._report(p.id, False, latency, str(e))
                    if attempt < attempts:
                        metrics.incr("llm.retry")
                        await asyncio.sleep(backoff_delay(attempt, e.retry_after))
                        continue
                    metrics.incr("llm.provider_exhausted")
                    break  # next provider
                except Exception as e:  # noqa: BLE001 — non-retryable: fail this provider over
                    last_err = e
                    latency = int((time.monotonic() - started) * 1000)
                    metrics.incr("llm.provider_fail")
                    self._report(p.id, False, latency, str(e))
                    break  # next provider
        metrics.incr("llm.giveup")
        raise NoRemoteModelError(f"all providers failed: {last_err}")

    async def _call(self, client, p: Provider, model: str, system: str, user: str, json_mode: bool, thinking: bool, temperature: float, max_tokens: int, timeout: float) -> str:
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
            body["enable_thinking"] = True

        url = f"{p.base_url.rstrip('/')}/chat/completions"
        try:
            r = await client.post(url, headers=headers, json=body, timeout=timeout)
        except _RETRYABLE_EXC as e:
            raise _Transient(f"{p.provider_id} transport: {type(e).__name__}") from e

        if r.status_code >= 400:
            # one in-place retry without response_format for providers that reject it
            if json_mode and r.status_code in (400, 422):
                body.pop("response_format", None)
                try:
                    r = await client.post(url, headers=headers, json=body, timeout=timeout)
                except _RETRYABLE_EXC as e:
                    raise _Transient(f"{p.provider_id} transport: {type(e).__name__}") from e
            if r.status_code in _RETRYABLE_STATUS:
                raise _Transient(
                    f"{p.provider_id} -> {r.status_code}",
                    retry_after=_parse_retry_after(r.headers.get("Retry-After")),
                )
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
