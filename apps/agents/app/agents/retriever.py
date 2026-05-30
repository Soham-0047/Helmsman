"""Agent 2 — Context Retriever. Re-ranks pgvector candidates, flags duplicates.

Model: qwen3-8b. Prompt key: helmsman.retriever.rerank.v1.
The pipeline pre-fills ctx.candidates by embedding the new issue (title+body,
single chunk) with bge-small and querying top-5 by cosine from issue_embeddings.
This agent re-ranks them and decides likely_duplicate_of. The raw-cosine > gate
acts as a hard duplicate trigger (settings.dup_threshold).
"""
from __future__ import annotations

from ..config import settings
from ..schemas import RankedCandidate, RetrieverOutput
from .base import AgentRun, run_llm_agent
from .context import PipelineCtx

PROMPT_KEY = "helmsman.retriever.rerank.v1"
MODEL = "qwen3-8b"


def _candidates_block(ctx: PipelineCtx) -> str:
    if not ctx.candidates:
        return "(no prior issues indexed for this repo)"
    lines = []
    for c in ctx.candidates:
        snippet = c.content.strip().replace("\n", " ")
        if len(snippet) > 240:
            snippet = snippet[:240] + "…"
        lines.append(f"- #{c.issue_number} (cosine {c.similarity:.3f}): {snippet}")
    return "\n".join(lines)


def _is_duplicate(top_cos: float, second_cos: float) -> bool:
    """Hard duplicate gate. With a real embedder (bge-small), near-duplicates
    score very high so an absolute threshold suffices. With the offline hashing
    embedder, a true duplicate is a clear OUTLIER above its neighbors."""
    if settings.using_local_embeddings:
        return top_cos >= settings.dup_local_floor and (top_cos - second_cos) >= settings.dup_local_gap
    return top_cos >= settings.dup_threshold


def _dup_decision(ctx: PipelineCtx) -> tuple[int | None, float, float]:
    """Return (duplicate_of_or_None, confidence, top_overall_cosine).

    An issue can only be a duplicate of an EARLIER issue (lower number) — you
    can't duplicate something filed after you. So we only consider candidates
    that predate the current issue, and require that candidate to be a clear,
    high-similarity outlier above the rest.
    """
    cands = ctx.candidates
    if not cands:
        return None, 0.0, 0.0
    top_overall = cands[0].similarity
    earlier = [c for c in cands if c.issue_number < ctx.issue.number]
    if not earlier:
        return None, 0.0, top_overall
    top_e = earlier[0]  # candidates are sorted desc by similarity
    others = [c.similarity for c in cands if c.issue_number != top_e.issue_number]
    second = max(others) if others else 0.0
    if _is_duplicate(top_e.similarity, second):
        return top_e.issue_number, round(min(0.99, 0.5 + top_e.similarity), 3), top_overall
    return None, 0.0, top_overall


def fallback(ctx: PipelineCtx) -> RetrieverOutput:
    ranked = [
        RankedCandidate(issue_number=c.issue_number, relatedness=round(c.similarity, 3),
                        reason="cosine similarity (re-ranker unavailable)")
        for c in ctx.candidates
    ]
    dup, conf, top_cos = _dup_decision(ctx)
    return RetrieverOutput(ranked=ranked, likely_duplicate_of=dup, duplicate_confidence=conf, top_cosine=round(top_cos, 3))


async def run(ctx: PipelineCtx) -> AgentRun:
    variables = {
        "issue_number": ctx.issue.number,
        "issue_title": ctx.issue.title,
        "issue_body": ctx.issue.body,
        "candidates_block": _candidates_block(ctx),
    }
    run = await run_llm_agent(
        prompt_key=PROMPT_KEY,
        model_slug=MODEL,
        variables=variables,
        output_cls=RetrieverOutput,
        fallback=lambda: fallback(ctx),
        max_tokens=700,
    )
    out: RetrieverOutput = run.output  # type: ignore[assignment]
    dup, conf, top_cos = _dup_decision(ctx)
    out.top_cosine = round(top_cos, 3)
    # Reject a model-proposed duplicate that is not actually one of the retrieved
    # candidates (the re-ranker can hallucinate an issue number that was never
    # surfaced by vector search). Only real candidates may be flagged.
    candidate_numbers = {c.issue_number for c in ctx.candidates}
    if out.likely_duplicate_of is not None and out.likely_duplicate_of not in candidate_numbers:
        out.likely_duplicate_of = None
        out.duplicate_confidence = 0.0
    # Enforce the earlier-only hard gate regardless of what the model returned
    # (the model may propose a duplicate of a LATER issue, which we reject).
    if out.likely_duplicate_of is not None and out.likely_duplicate_of >= ctx.issue.number:
        out.likely_duplicate_of = None
        out.duplicate_confidence = 0.0
    if out.likely_duplicate_of is None and dup is not None:
        out.likely_duplicate_of = dup
        out.duplicate_confidence = conf
    ctx.retriever = out
    return run
