"""Agent 6 — Responder. Drafts the maintainer-voiced reply from all upstream outputs.

Model: qwen3-32b (reasoning). Prompt key: helmsman.responder.v2.
Voice fingerprint is injected into the prompt. When helmsman.voice_self_check is
enabled and a real model is available, a self-check pass scores the draft against
the fingerprint and returns a revised draft (helmsman.responder.selfcheck.v1).

The fallback assembles a genuinely voice-matched reply from the fingerprint's
opening/closing patterns and the upstream findings — never a generic stub.
"""
from __future__ import annotations

import json

from pydantic import BaseModel

from ..admin_client import admin
from ..model_router import NoRemoteModelError, router
from ..util import extract_json
from ..schemas import ResponderOutput
from .base import AgentRun, JSON_SYSTEM, run_llm_agent
from .context import PipelineCtx

PROMPT_KEY = "helmsman.responder.v2"
SELFCHECK_KEY = "helmsman.responder.selfcheck.v1"
MODEL = "qwen3-32b"


class _SelfCheck(BaseModel):
    voice_match_score: float = 0.7
    issues: list[str] = []
    revised_draft: str = ""


def _summaries(ctx: PipelineCtx) -> dict:
    r = ctx.retriever
    rep = ctx.reproducer
    src = ctx.source
    pri = ctx.prioritizer
    return {
        "retriever_summary": (
            f"likely duplicate of #{r.likely_duplicate_of} (conf {r.duplicate_confidence})"
            if r and r.likely_duplicate_of else (f"top related cosine {r.top_cosine}" if r else "n/a")
        ),
        "reproducer_summary": (
            f"has_repro={rep.has_reproduction}; actual='{rep.actual_behavior}'; missing={rep.missing_information}"
            if rep else "n/a"
        ),
        "source_summary": (f"{src.hypothesis} (files: {', '.join(src.likely_files)})" if src and src.hypothesis else "n/a"),
        "priority_summary": (f"score {pri.score}/10, action {pri.recommended_action}" if pri else "n/a"),
    }


def _greeting(vp, mention: str) -> str:
    pats = " ".join(vp.typical_opening_patterns).lower()
    if "thank" in pats:
        base = "Thanks for the report"
    elif "good catch" in pats:
        base = "Good catch"
    else:
        base = "Thanks for raising this"
    return f"{base}, {mention}"


def fallback(ctx: PipelineCtx) -> ResponderOutput:
    vp = ctx.voice_profile
    issue = ctx.issue
    cls = ctx.classification.category if ctx.classification else "bug"
    mention = f"@{issue.author}" if issue.author and issue.author != "unknown" else "there"
    closing = vp.preferred_closing or "Thanks!"
    greet = _greeting(vp, mention)

    parts: list[str] = []
    action = "needs_maintainer_decision"
    labels: list[str] = []

    if cls == "spam":
        return ResponderOutput(draft_markdown="", suggested_labels=["spam"],
                               recommended_action="needs_maintainer_decision", voice_match_score=None,
                               draft_quality="fallback")

    if cls == "needs_info":
        missing = ctx.reproducer.missing_information if ctx.reproducer else []
        ask = missing or ["the version you're on", "the exact command or input",
                          "what you expected vs. what happened", "any error text"]
        parts.append(f"{greet} — I'd like to help, but I need a bit more to go on.")
        parts.append("Could you share:")
        parts.append("\n".join(f"- {m}" for m in ask))
        action = "request_more_info"
        labels = ["needs-more-info"]

    elif ctx.retriever and ctx.retriever.likely_duplicate_of:
        dup = ctx.retriever.likely_duplicate_of
        parts.append(f"Hi {mention} — this looks like the same problem as #{dup}.")
        parts.append(f"I'm going to track the fix on #{dup} and close this as a duplicate; please subscribe there for updates.")
        action = "close_as_duplicate"
        labels = ["duplicate"]

    elif cls == "bug":
        parts.append(f"{greet} — nice clean repro.")
        top_file = ctx.source.likely_files[0] if ctx.source and ctx.source.likely_files else ""
        line = ""
        if ctx.source and ctx.source.relevant_lines:
            line = f" (around {ctx.source.relevant_lines[0].line_range})"
        actual = ctx.reproducer.actual_behavior if ctx.reproducer else ""
        if top_file:
            parts.append(f"Looking at it, the most likely culprit is `{top_file}`{line} — that's where the relevant handling lives.")
        if actual:
            parts.append(f"We should be handling that cleanly rather than ending in `{actual.strip().rstrip('.')}`.")
        if ctx.prioritizer and ctx.prioritizer.recommended_action == "respond_now":
            parts.append("This one's high on my list — I'll get a fix in for the next patch.")
        else:
            parts.append("I'll dig in and follow up here.")
        action = "post_comment"
        labels = ["bug"]

    elif cls == "feature":
        parts.append(f"{greet} — reasonable ask.")
        parts.append("I'd want to keep it opt-in so it doesn't add weight for the common case, but the approach makes sense. A PR is welcome if you'd like to take it; otherwise I'll queue it up.")
        action = "post_comment"
        labels = ["enhancement"]

    else:  # question
        parts.append(f"{greet} — good question.")
        parts.append("The short version: check the relevant section of the docs for the option you need. If that doesn't cover your case, share a snippet and I'll point you to the exact API.")
        action = "post_comment"
        labels = ["question"]

    parts.append(closing)
    draft = "\n\n".join(p for p in parts if p)
    # rough voice-match heuristic for display (the self-check overwrites this when a model runs)
    score = 0.62
    if "thank" in draft.lower() and vp.tone in ("warm", "casual"):
        score += 0.12
    if closing and closing.lower() in draft.lower():
        score += 0.1
    if vp.uses_code_blocks and "`" in draft:
        score += 0.06
    return ResponderOutput(draft_markdown=draft, suggested_labels=labels,
                           recommended_action=action, voice_match_score=round(min(0.95, score), 2),  # type: ignore[arg-type]
                           draft_quality="fallback")


async def _self_check(ctx: PipelineCtx, draft: str) -> tuple[str, float | None]:
    """Run the self-check pass; returns (draft, voice_match_score)."""
    try:
        prompt = admin.render_prompt(SELFCHECK_KEY, {
            "voice_profile": json.dumps(ctx.voice_profile.model_dump()),
            "draft_markdown": draft,
        })
        res = await router.complete(model=MODEL, system=JSON_SYSTEM, user=prompt, json_mode=True, max_tokens=1200)
        data = extract_json(res.text) or {}
        chk = _SelfCheck.model_validate(data)
        return (chk.revised_draft or draft), chk.voice_match_score
    except (NoRemoteModelError, Exception):
        return draft, None


async def run(ctx: PipelineCtx) -> AgentRun:
    vp = ctx.voice_profile
    variables = {
        "maintainer_login": ctx.repo.owner,
        "voice_profile": json.dumps(vp.model_dump()),
        "repo_full_name": ctx.repo.full_name,
        "issue_number": ctx.issue.number,
        "classification": ctx.classification.category if ctx.classification else "unknown",
        "issue_title": ctx.issue.title,
        "issue_body": ctx.issue.body,
        "tone": vp.tone,
        "avg_sentence_length": vp.avg_sentence_length,
        "technical_depth": vp.technical_depth,
        **_summaries(ctx),
    }
    run = await run_llm_agent(
        prompt_key=PROMPT_KEY,
        model_slug=MODEL,
        variables=variables,
        output_cls=ResponderOutput,
        fallback=lambda: fallback(ctx),
        max_tokens=1400,
    )
    out: ResponderOutput = run.output  # type: ignore[assignment]
    if run.fell_back:
        out.draft_quality = "fallback"

    # Self-check pass (flag-gated, only meaningful with a real model)
    if ctx.flag("helmsman.voice_self_check", True) and not run.fell_back:
        revised, score = await _self_check(ctx, out.draft_markdown)
        out.draft_markdown = revised
        if score is not None:
            out.voice_match_score = score

    ctx.responder = out
    return run
