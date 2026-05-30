"""Benchmark agents: single-agent baseline + LLM-judge.

These exist for the Agent Society A/B (benchmarks/agent_society.py). The baseline
is intentionally the naive one-shot approach; its offline fallback is generic on
purpose so the seven-agent pipeline's specificity and duplicate-catching show up
in the metrics. Both have offline fallbacks so the benchmark runs with no keys.
"""
from __future__ import annotations

from ..schemas import BaselineOutput, Issue, JudgeOutput, Repo
from ..util import count_hits, SEVERITY_KEYWORDS
from .base import AgentRun, run_llm_agent

BASELINE_KEY = "helmsman.baseline.single.v1"
JUDGE_KEY = "helmsman.judge.response_quality.v1"


def _baseline_fallback(issue: Issue) -> BaselineOutput:
    blob = f"{issue.title}\n{issue.body}".lower()
    if any(w in blob for w in ("buy", "cheap", "followers", "click here")):
        cat = "spam"
    elif len((issue.title + issue.body).split()) < 12:
        cat = "needs_info"
    elif any(w in blob for w in ("add ", "support ", "feature", "would be")):
        cat = "feature"
    elif blob.strip().endswith("?") or blob.startswith(("how", "what", "does", "can ")):
        cat = "question"
    else:
        cat = "bug"
    # No corpus -> the single agent cannot detect duplicates. That gap is the point.
    pri = 7 if count_hits(blob, SEVERITY_KEYWORDS) else 4
    draft = (
        f"Thanks for opening this. We've noted it and will look into the issue. "
        f"If you can provide more details that would help us investigate."
    )
    return BaselineOutput(category=cat, labels=[cat], priority=pri, draft_markdown=draft)


async def run_baseline(repo: Repo, issue: Issue) -> AgentRun:
    variables = {
        "repo_full_name": repo.full_name,
        "issue_number": issue.number,
        "issue_title": issue.title,
        "issue_body": issue.body,
    }
    return await run_llm_agent(
        prompt_key=BASELINE_KEY,
        model_slug="qwen3-8b",
        variables=variables,
        output_cls=BaselineOutput,
        fallback=lambda: _baseline_fallback(issue),
        max_tokens=900,
    )


def _judge_fallback(issue: Issue, draft: str) -> JudgeOutput:
    """Heuristic quality proxy: specificity + actionability + length sanity."""
    if not draft.strip():
        return JudgeOutput(score=1, reasoning="empty draft")
    d = draft.lower()
    issue_terms = {t for t in (issue.title.lower().split()) if len(t) > 4}
    overlap = len(issue_terms & set(d.split()))
    score = 2
    if overlap >= 2:
        score += 1  # references the specific issue
    if any(k in d for k in ("#", "src/", "`", "line", "version", "reproduce", "duplicate")):
        score += 1  # concrete/actionable
    if 40 <= len(draft.split()) <= 220:
        score += 1  # right length, not a one-liner or a wall
    generic = ("thanks for opening", "we've noted it", "look into the issue", "provide more details that would help")
    if sum(g in d for g in generic) >= 2:
        score -= 1  # boilerplate penalty
    return JudgeOutput(score=max(1, min(5, score)), reasoning="heuristic proxy (no judge model available)")


async def run_judge(issue: Issue, draft: str) -> AgentRun:
    variables = {
        "issue_title": issue.title,
        "issue_body": issue.body,
        "draft_markdown": draft,
    }
    return await run_llm_agent(
        prompt_key=JUDGE_KEY,
        model_slug="qwen3-32b",
        variables=variables,
        output_cls=JudgeOutput,
        fallback=lambda: _judge_fallback(issue, draft),
        max_tokens=300,
    )
