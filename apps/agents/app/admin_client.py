"""Python consumer for the Admin Service — the runtime's control-plane client.

Mirrors sdk/admin-client.ts: pulls versioned prompts and feature flags by key,
with a local fallback to prompts/registry.json + config/flags.json when the
Admin Service is unreachable (demo mode / ADMIN_LOCAL_FALLBACK=true).

The runtime fetches every agent prompt through this client, so prompts version
independently in the Admin UI and never live in the Python source.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, Optional

import httpx

from .config import settings

_VAR_RE_MUSTACHE = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")
_VAR_RE_DOLLAR = re.compile(r"\$\{\s*([\w.]+)\s*\}")


def interpolate(template: str, variables: dict[str, Any]) -> str:
    """Substitute {{var}} and ${var}; missing vars render as empty string."""

    def repl(name: str) -> str:
        v = variables.get(name)
        if v is None:
            return ""
        return v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)

    out = _VAR_RE_MUSTACHE.sub(lambda m: repl(m.group(1)), template)
    out = _VAR_RE_DOLLAR.sub(lambda m: repl(m.group(1)), out)
    return out


class AdminClient:
    def __init__(self, ttl_s: float = 60.0) -> None:
        self.base = settings.admin_url.rstrip("/")
        self.token = settings.admin_token
        self.local_only = settings.admin_local_fallback
        self.ttl_s = ttl_s
        self._cache: dict[str, tuple[float, Any]] = {}
        self._local: Optional[dict[str, Any]] = None
        self._flags_local: Optional[list[dict[str, Any]]] = None

    # ---------------- local registry ----------------

    def _load_local(self) -> dict[str, Any]:
        if self._local is None:
            try:
                self._local = json.loads(settings.registry_path.read_text())
            except Exception:
                self._local = {"prompts": []}
        return self._local

    def _load_local_flags(self) -> list[dict[str, Any]]:
        if self._flags_local is None:
            try:
                self._flags_local = json.loads(settings.flags_path.read_text()).get("flags", [])
            except Exception:
                self._flags_local = []
        return self._flags_local

    def _local_prompt(self, key: str) -> Optional[dict[str, Any]]:
        for p in self._load_local().get("prompts", []):
            if p.get("key") == key:
                return p
        return None

    # ---------------- network with cache ----------------

    def _get(self, cache_key: str, path: str, fallback):
        now = time.monotonic()
        hit = self._cache.get(cache_key)
        if hit and now - hit[0] < self.ttl_s:
            return hit[1]
        if self.local_only:
            return fallback()
        try:
            r = httpx.get(
                f"{self.base}{path}",
                headers={"Authorization": f"Bearer {self.token}"},
                timeout=4.0,
            )
            r.raise_for_status()
            val = r.json()
            self._cache[cache_key] = (now, val)
            return val
        except Exception:
            val = fallback()
            self._cache[cache_key] = (now, val)
            return val

    # ---------------- prompts ----------------

    def get_prompt(self, key: str) -> Optional[dict[str, Any]]:
        return self._get(f"prompt:{key}", f"/public/prompts/{key}", lambda: self._local_prompt(key))

    def render_prompt(self, key: str, variables: dict[str, Any] | None = None) -> str:
        rec = self.get_prompt(key)
        if not rec:
            raise KeyError(f"Prompt not found: {key}")
        variants = rec.get("variants", [])
        active = next((v for v in variants if v.get("active")), variants[-1] if variants else None)
        if not active:
            raise KeyError(f"Prompt {key} has no variants")
        return interpolate(active["content"], variables or {})

    def prompt_model(self, key: str) -> Optional[str]:
        rec = self.get_prompt(key)
        return rec.get("model") if rec else None

    # ---------------- flags ----------------

    def get_flags(self) -> list[dict[str, Any]]:
        return self._get("flags", "/public/flags", self._load_local_flags)

    def is_flag_enabled(self, key: str, ctx: dict[str, Any] | None = None) -> bool:
        ctx = ctx or {}
        for f in self.get_flags():
            if f.get("key") == key:
                return _eval_flag(f, ctx)
        return False


def _eval_flag(f: dict[str, Any], ctx: dict[str, Any]) -> bool:
    strat = f.get("strategy", "off")
    if strat == "on":
        return True
    if strat == "off":
        return False
    if strat == "percent":
        pct = f.get("percent", 0)
        ident = ctx.get("userId") or ctx.get("email")
        if not ident:
            return pct >= 100
        return _bucket(f"{f.get('key')}:{ident}") < pct
    if strat == "allowlist":
        allow = f.get("allowlist", [])
        return str(ctx.get("userId")) in allow or str(ctx.get("email")) in allow
    if strat == "condition":
        cond = f.get("condition", {})
        for k, expected in cond.items():
            actual = ctx.get(k)
            if isinstance(expected, dict) and "$in" in expected:
                if actual not in expected["$in"]:
                    return False
            elif actual != expected:
                return False
        return True
    return bool(f.get("enabled", False))


def _bucket(s: str) -> int:
    h = 0x811C9DC5
    for ch in s:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return abs(h) % 100


admin = AdminClient()
