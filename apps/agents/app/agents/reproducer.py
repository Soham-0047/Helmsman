"""Agent 3 — Reproducer. Reads bug reports, reasons about minimal reproduction.

Model: qwen2.5-coder-7b (bugs only). Prompt key: helmsman.reproducer.v1.
Never executes code. The pipeline pre-fills ctx.code_blocks via a regex
pre-filter (util.extract_code_blocks); this agent reasons over them.
"""
from __future__ import annotations

import re

from ..schemas import ReproConfidence, ReproducerOutput, ReproEnvironment
from .base import AgentRun, run_llm_agent
from .context import PipelineCtx

PROMPT_KEY = "helmsman.reproducer.v1"
MODEL = "qwen2.5-coder-7b"

_VER_RE = re.compile(r"\b(v?\d+\.\d+(?:\.\d+)?)\b")
_NODE_RE = re.compile(r"node[\s:]*v?(\d+(?:\.\d+)*)", re.I)
_PY_RE = re.compile(r"python[\s:]*(\d+(?:\.\d+)*)", re.I)
_OS_RE = re.compile(r"\b(macos|mac os|windows|linux|ubuntu|debian|win(?:dows)? ?\d+)\b", re.I)


def _first_meaningful(block: str) -> str:
    """First non-empty, non-code-fence line of a section."""
    for ln in block.strip().splitlines():
        s = ln.strip()
        if not s or s.startswith("```") or s == "`":
            continue
        return s.strip("`").strip()
    return ""


def _section(body: str, label: str) -> str:
    m = re.search(rf"#+\s*{label}\s*\n+(.+?)(?:\n#+|\Z)", body, re.I | re.DOTALL)
    if m:
        return _first_meaningful(m.group(1))
    m = re.search(rf"{label}[:\-]\s*(.+)", body, re.I)
    return m.group(1).strip().strip("`") if m else ""


def fallback(ctx: PipelineCtx) -> ReproducerOutput:
    body = ctx.issue.body or ""
    low = body.lower()
    has_code = bool(ctx.code_blocks)
    has_steps_header = "steps to reproduce" in low or "repro" in low

    steps: list[str] = []
    if ctx.code_blocks:
        first = ctx.code_blocks[0].strip().splitlines()
        steps = [ln.strip() for ln in first if ln.strip()][:6]
    if not steps:
        numbered = re.findall(r"^\s*\d+[.)]\s*(.+)$", body, re.M)
        steps = [s.strip() for s in numbered][:6]

    runtime = "unknown"
    if (m := _NODE_RE.search(body)):
        runtime = f"node {m.group(1)}"
    elif (m := _PY_RE.search(body)):
        runtime = f"python {m.group(1)}"
    os_m = _OS_RE.search(body)
    pkg = ""
    for v in _VER_RE.findall(body):
        if v.lower().lstrip("v") not in (runtime.split()[-1] if " " in runtime else ""):
            pkg = v
            break

    expected = _section(body, "expected") or _section(body, "expected behavior")
    actual = _section(body, "actual") or _section(body, "actual behavior")

    missing: list[str] = []
    if not pkg:
        missing.append("exact package version")
    if runtime == "unknown":
        missing.append("runtime/version")
    if not steps:
        missing.append("a minimal reproduction")
    if not (expected and actual):
        missing.append("expected vs. actual behavior")

    return ReproducerOutput(
        has_reproduction=has_code and (has_steps_header or bool(steps)),
        minimal_repro_steps=steps or (["See the snippet in the issue body."] if has_code else []),
        environment=ReproEnvironment(
            runtime=runtime,
            os=(os_m.group(1) if os_m else "unknown"),
            package_version=pkg or "unknown",
        ),
        expected_behavior=expected or ("A clear error instead of the reported failure." if has_code else ""),
        actual_behavior=actual or "",
        missing_information=missing,
        confidence=ReproConfidence(
            steps=0.75 if steps else 0.2,
            environment=0.7 if runtime != "unknown" or pkg else 0.3,
            expected_actual=0.7 if (expected and actual) else 0.3,
        ),
    )


async def run(ctx: PipelineCtx) -> AgentRun:
    variables = {
        "issue_number": ctx.issue.number,
        "issue_title": ctx.issue.title,
        "issue_body": ctx.issue.body,
        "code_blocks": "\n---\n".join(ctx.code_blocks) if ctx.code_blocks else "(no code blocks found)",
    }
    run = await run_llm_agent(
        prompt_key=PROMPT_KEY,
        model_slug=MODEL,
        variables=variables,
        output_cls=ReproducerOutput,
        fallback=lambda: fallback(ctx),
        max_tokens=800,
    )
    ctx.reproducer = run.output  # type: ignore[assignment]
    return run
