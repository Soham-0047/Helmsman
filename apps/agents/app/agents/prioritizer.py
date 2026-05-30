"""Agent 7 — Prioritizer. Weighted-rubric triage score (1-10).

Model: qwen3-8b (structured). Prompt key: helmsman.prioritizer.v1.
Rubric weights are LOCKED by spec: severity 30%, known contributor 20%,
reactions 15%, age 15%, security/dependency 20%. The deterministic computation
below IS the documented fallback, so a priority always exists even with no model.
Runs in the Investigation stage in parallel with the bug-only agents.
"""
from __future__ import annotations

from ..schemas import PrioritizerOutput
from ..util import count_hits, SECURITY_KEYWORDS, SEVERITY_KEYWORDS
from .base import AgentRun, run_llm_agent
from .context import PipelineCtx

PROMPT_KEY = "helmsman.prioritizer.v1"
MODEL = "qwen3-8b"


def compute_rubric(ctx: PipelineCtx) -> PrioritizerOutput:
    issue = ctx.issue
    blob = f"{issue.title}\n{issue.body}"
    sev_hits = count_hits(blob, SEVERITY_KEYWORDS)
    sec_hits = count_hits(blob, SECURITY_KEYWORDS)

    sev = min(1.0, 0.4 * len(sev_hits))
    contrib = 1.0 if issue.author_is_contributor else 0.0
    react = min(1.0, issue.reactions / 12.0)
    age = min(1.0, issue.age_hours / 240.0)
    sec = 1.0 if sec_hits else 0.0

    weighted = 0.30 * sev + 0.20 * contrib + 0.15 * react + 0.15 * age + 0.20 * sec
    score = max(1, min(10, round(weighted * 10)))

    signals: list[str] = []
    if sev_hits:
        signals.append(f"severity: {', '.join(sev_hits[:3])}")
    if contrib:
        signals.append("reporter is a known contributor")
    if issue.reactions:
        signals.append(f"{issue.reactions} reactions")
    if age >= 0.5:
        signals.append("aging without response")
    if sec_hits:
        signals.append(f"security/dependency: {', '.join(sec_hits[:2])}")

    # action: severity/security override lifts urgency regardless of raw score
    cls = ctx.classification.category if ctx.classification else "bug"
    dup = ctx.retriever.likely_duplicate_of if ctx.retriever else None
    if dup:
        action = "close_as_duplicate"
    elif cls == "needs_info":
        action = "request_more_info"
    elif sec or sev >= 1.0 or score >= 8:
        action = "respond_now"
    elif score >= 4:
        action = "respond_soon"
    else:
        action = "low_priority"

    return PrioritizerOutput(score=score, signals=signals or ["routine"], recommended_action=action)  # type: ignore[arg-type]


async def run(ctx: PipelineCtx) -> AgentRun:
    issue = ctx.issue
    sec_hits = count_hits(f"{issue.title}\n{issue.body}", SECURITY_KEYWORDS)
    variables = {
        "issue_number": issue.number,
        "issue_title": issue.title,
        "issue_body": issue.body,
        "classification": ctx.classification.category if ctx.classification else "unknown",
        "reporter_is_contributor": "yes" if issue.author_is_contributor else "no",
        "reaction_count": issue.reactions,
        "age_hours": round(issue.age_hours, 1),
        "has_security_signal": "yes" if sec_hits else "no",
    }
    run = await run_llm_agent(
        prompt_key=PROMPT_KEY,
        model_slug=MODEL,
        variables=variables,
        output_cls=PrioritizerOutput,
        fallback=lambda: compute_rubric(ctx),
        max_tokens=400,
    )
    ctx.prioritizer = run.output  # type: ignore[assignment]
    return run
