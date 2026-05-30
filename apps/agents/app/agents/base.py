"""Shared agent runner.

Every agent follows the same contract:
  1. fetch its versioned prompt from the Admin Service (by key) and interpolate
  2. call the model via the router (custom, framework-free)
  3. parse JSON tolerantly and validate against the agent's Pydantic schema
  4. on no-remote-model / timeout / malformed output -> deterministic fallback

The fallback is not a stub: it is the documented degraded behavior for each
agent, and it is what makes the offline demo produce real, sensible output.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable, Optional, Type, TypeVar

from pydantic import BaseModel

from ..admin_client import admin
from ..model_router import NoRemoteModelError, router
from ..util import extract_json

JSON_SYSTEM = (
    "You are a precise component in a multi-agent system. Output ONLY a single "
    "valid JSON object with no markdown fences and no commentary."
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
    started = time.monotonic()
    try:
        prompt = admin.render_prompt(prompt_key, variables)
    except Exception:
        # prompt registry unreachable AND no local copy — degrade gracefully
        out = fallback()
        return AgentRun(out, "local-fallback", "local", _ms(started), True)

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
        data = extract_json(res.text)
        if data is None:
            raise ValueError("model returned no parseable JSON")
        output = output_cls.model_validate(data)
        return AgentRun(output, res.model, res.provider_id, res.latency_ms, False, data)
    except NoRemoteModelError:
        out = fallback()
        return AgentRun(out, "local-fallback", "local", _ms(started), True)
    except Exception:
        # malformed output or validation failure -> documented fallback
        out = fallback()
        return AgentRun(out, "local-fallback", "local", _ms(started), True)


def _ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)
