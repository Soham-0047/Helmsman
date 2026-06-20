"""Shared agent runner.

Every agent follows the same contract:
  1. fetch its versioned prompt from the Admin Service (by key) and interpolate
  2. call the model via the router (custom, framework-free)
  3. parse JSON tolerantly and validate against the agent's Pydantic schema
  4. if the output is malformed/invalid AND a model is reachable, do ONE
     corrective "self-repair" retry (cheaper than a fallback, recovers most
     transient JSON glitches), then
  5. on no-remote-model / repeated failure -> deterministic fallback

The fallback is not a stub: it is the documented degraded behavior for each
agent, and it is what makes the offline demo produce real, sensible output.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable, Optional, Type, TypeVar

from pydantic import BaseModel

from ..admin_client import admin
from ..metrics import metrics
from ..model_router import NoRemoteModelError, router
from ..util import extract_json

JSON_SYSTEM = (
    "You are a precise component in a multi-agent system. Output ONLY a single "
    "valid JSON object with no markdown fences and no commentary."
)
REPAIR_SYSTEM = (
    "You convert a malformed/partial model response into ONE valid JSON object "
    "that conforms to the requested schema. Output ONLY the JSON object — no "
    "prose, no code fences. Preserve the original content; only fix structure."
)

T = TypeVar("T", bound=BaseModel)


@dataclass
class AgentRun:
    output: BaseModel
    used_model: str
    provider: str
    latency_ms: int
    fell_back: bool
    raw: Optional[dict] = None


def _parse_validate(text: str, output_cls: Type[T]) -> Optional[T]:
    data = extract_json(text)
    if data is None:
        return None
    try:
        return output_cls.model_validate(data)
    except Exception:
        return None


def _repair_prompt(original_user: str, bad_text: str, output_cls: Type[T]) -> str:
    fields = ", ".join(output_cls.model_fields.keys())
    snippet = (bad_text or "").strip()[:1500]
    return (
        f"The following response was supposed to be a single JSON object with keys: {fields}.\n"
        f"It was not valid. Repair it into one valid JSON object with exactly those keys.\n\n"
        f"--- original task (for context) ---\n{original_user[:1200]}\n\n"
        f"--- malformed response ---\n{snippet}\n\n"
        f"Return ONLY the corrected JSON object."
    )


async def run_llm_agent(
    *,
    prompt_key: str,
    model_slug: str,
    variables: dict[str, Any],
    output_cls: Type[T],
    fallback: Callable[[], T],
    thinking: bool = False,
    max_tokens: int = 2048,
    temperature: float = 0.2,
) -> AgentRun:
    metrics.incr("agent.run")
    started = time.monotonic()

    def _fb() -> AgentRun:
        metrics.incr("agent.fallback")
        return AgentRun(fallback(), "local-fallback", "local", _ms(started), True)

    try:
        prompt = admin.render_prompt(prompt_key, variables)
    except Exception:
        # prompt registry unreachable AND no local copy — degrade gracefully
        return _fb()

    try:
        res = await router.complete(
            model=model_slug,
            system=JSON_SYSTEM,
            user=prompt,
            json_mode=True,
            thinking=thinking,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    except NoRemoteModelError:
        return _fb()

    output = _parse_validate(res.text, output_cls)
    if output is not None:
        return AgentRun(output, res.model, res.provider_id, res.latency_ms, False, output.model_dump())

    # One corrective self-repair pass before giving up to the local fallback.
    try:
        metrics.incr("llm.repair")
        res2 = await router.complete(
            model=model_slug,
            system=REPAIR_SYSTEM,
            user=_repair_prompt(prompt, res.text, output_cls),
            json_mode=True,
            thinking=False,
            max_tokens=max_tokens,
            temperature=0.0,
        )
        repaired = _parse_validate(res2.text, output_cls)
        if repaired is not None:
            metrics.incr("llm.repair_ok")
            return AgentRun(repaired, res2.model, res2.provider_id, res2.latency_ms, False, repaired.model_dump())
    except NoRemoteModelError:
        pass
    except Exception:
        pass

    return _fb()


def _ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)
