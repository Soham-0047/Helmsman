"""Agent 4 — Source Analyzer. Forms a defect hypothesis from full file contents.

Model: qwen3-long-context (bugs only; flag helmsman.use_long_context_analyzer).
Prompt key: helmsman.source_analyzer.v1.

File selection is a DETERMINISTIC heuristic (not an LLM call): score every
candidate file by token overlap between its path and the bug description, take
the top 3, then load all three into ONE long-context call. In live mode the
gateway supplies the file tree + contents from the GitHub API; in demo mode the
pipeline request carries a small synthetic source tree.
"""
from __future__ import annotations

import re

from ..schemas import RelevantLine, SourceAnalyzerOutput
from .base import AgentRun, run_llm_agent
from .context import PipelineCtx

PROMPT_KEY = "helmsman.source_analyzer.v1"
MODEL = "qwen3-long-context"

_TOK = re.compile(r"[a-z0-9]+")


def _toks(s: str) -> set[str]:
    return {t for t in _TOK.findall(s.lower()) if len(t) > 2}


def select_files(bug_summary: str, files: list[dict], k: int = 3) -> list[dict]:
    """Score by path/filename token overlap with the bug summary; top-k."""
    bug = _toks(bug_summary)
    scored = []
    for f in files:
        path = f.get("path", "")
        # weight the basename higher than the directory
        base = path.split("/")[-1]
        score = 3 * len(bug & _toks(base)) + len(bug & _toks(path))
        # small content signal (a few keywords appearing in the file)
        content = f.get("content", "")
        score += min(3, len(bug & _toks(content[:2000])))
        scored.append((score, f))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [f for _, f in scored[:k]]


def _files_block(files: list[dict]) -> str:
    parts = []
    for f in files:
        parts.append(f"=== {f.get('path')} ===\n{f.get('content','')}")
    return "\n\n".join(parts) if parts else "(no source files available)"


def fallback(ctx: PipelineCtx, selected: list[dict]) -> SourceAnalyzerOutput:
    if not selected:
        return SourceAnalyzerOutput(hypothesis="No source files were available to analyze.", confidence=0.0)
    bug = _toks(ctx.issue.title + " " + ctx.issue.body)
    top = selected[0]
    content = top.get("content", "")
    lines = content.splitlines()

    # Prefer an explicit code-comment that explains intent near a suspect line;
    # otherwise pick the line with the most lexical overlap with the bug report.
    best_i, best_score, comment_hint = 0, -1, ""
    for i, ln in enumerate(lines):
        low = ln.lower()
        sc = len(bug & _toks(ln))
        if any(m in low for m in ("// bug", "# bug", "fixme", "todo", "note:")):
            sc += 4  # an explanatory comment is a strong signal
        if sc > best_score:
            best_score, best_i = sc, i
            m = re.search(r"(?://|#)\s*(.+)$", ln)
            comment_hint = m.group(1).strip() if m else ""
    lo = max(1, best_i - 1)
    hi = min(len(lines), best_i + 4)

    reason = comment_hint or "this is where the relevant input handling lives"
    explanation = (comment_hint or "Highest lexical overlap with the bug report.")[:160]
    return SourceAnalyzerOutput(
        likely_files=[f.get("path") for f in selected],
        hypothesis=(f"The most likely location is {top.get('path')} around line {best_i + 1}: {reason}."),
        relevant_lines=[RelevantLine(file=top.get("path"), line_range=f"{lo}-{hi}", explanation=explanation)],
        confidence=0.45,
        suggested_fix_direction="Add a guard / correct the handling at the cited range.",
    )


async def run(ctx: PipelineCtx) -> AgentRun:
    bug_summary = f"{ctx.issue.title}. {ctx.issue.body}"
    if ctx.reproducer and ctx.reproducer.actual_behavior:
        bug_summary += f" Actual: {ctx.reproducer.actual_behavior}"
    selected = select_files(bug_summary, ctx.source_files, k=3)
    variables = {
        "repo_full_name": ctx.repo.full_name,
        "commit_sha": ctx.repo.head_sha,
        "bug_summary": bug_summary,
        "files_block": _files_block(selected),
    }
    run = await run_llm_agent(
        prompt_key=PROMPT_KEY,
        model_slug=MODEL,
        variables=variables,
        output_cls=SourceAnalyzerOutput,
        fallback=lambda: fallback(ctx, selected),
        max_tokens=900,
    )
    ctx.source = run.output  # type: ignore[assignment]
    return run
