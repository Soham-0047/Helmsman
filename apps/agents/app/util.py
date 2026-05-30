"""Small shared utilities: tolerant JSON extraction, keyword helpers."""
from __future__ import annotations

import json
import re
from typing import Any, Optional

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def extract_json(text: str) -> Optional[dict[str, Any]]:
    """Pull the first JSON object out of a model response.

    Handles: raw JSON, ```json fenced blocks, and prose-wrapped objects. Returns
    None if nothing parseable is found (the caller then uses its fallback).
    """
    if not text:
        return None
    text = text.strip()

    # 1) direct parse
    try:
        v = json.loads(text)
        if isinstance(v, dict):
            return v
    except Exception:
        pass

    # 2) fenced block
    m = _FENCE_RE.search(text)
    if m:
        try:
            v = json.loads(m.group(1).strip())
            if isinstance(v, dict):
                return v
        except Exception:
            pass

    # 3) first balanced {...}
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                candidate = text[start : i + 1]
                try:
                    v = json.loads(candidate)
                    if isinstance(v, dict):
                        return v
                except Exception:
                    return None
    return None


SEVERITY_KEYWORDS = (
    "crash",
    "segfault",
    "segmentation fault",
    "data loss",
    "corrupt",
    "security",
    "vulnerab",
    "regression",
    "broken",
    "fatal",
    "oom",
    "memory leak",
    "deadlock",
    "hang",
    "exploit",
)

SECURITY_KEYWORDS = (
    "security",
    "vulnerab",
    "cve",
    "exploit",
    "injection",
    "xss",
    "csrf",
    "token",
    "secret",
    "credential",
    "dependency",
    "advisory",
    "audit",
    "lodash",
    "prototype pollution",
)

SPAM_KEYWORDS = (
    "buy",
    "cheap",
    "followers",
    "click here",
    "limited time",
    "offer",
    "stars overnight",
    "http://",
    "promo",
    "discount",
)


def count_hits(text: str, keywords) -> list[str]:
    low = text.lower()
    return [k for k in keywords if k in low]


def extract_code_blocks(body: str) -> list[str]:
    """Regex pre-filter for fenced/indented code blocks (Agent 3 input)."""
    blocks = re.findall(r"```[\w]*\n?(.*?)```", body, re.DOTALL)
    if blocks:
        return [b.strip() for b in blocks if b.strip()]
    # fall back to indented lines that look like code/stack traces
    lines = [ln for ln in body.splitlines() if re.match(r"^\s{4,}\S", ln) or "Error" in ln or "at " in ln]
    return ["\n".join(lines)] if lines else []
