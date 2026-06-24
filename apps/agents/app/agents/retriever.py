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


def _is_duplicate(top_score: float, second_score: float) -> bool:
    """Hard duplicate gate.

    Live (bge-small): near-duplicates score very high in cosine, so an absolute
    threshold suffices. Offline (hashing embedder): gate on the FUSED hybrid
    score — a true duplicate must clear a precision-first floor AND be an outlier
    above the runner-up. Lexical TF-IDF fusion lifts paraphrase duplicates that
    share rare terms above the dense-only score, recovering recall the cosine
    gate alone missed, while the floor keeps the top non-duplicate out."""
    if settings.using_local_embeddings:
        return (
            top_score >= settings.dup_hybrid_floor
            and (top_score - second_score) >= settings.dup_hybrid_gap
        )
    return top_score >= settings.dup_threshold


def _dup_decision(ctx: PipelineCtx) -> tuple[int | None, float, float]:
    """Return (duplicate_of_or_None, confidence, top_overall_cosine).

    An issue can only be a duplicate of an EARLIER issue (lower number) — you
    can't duplicate something filed after you. So we only consider candidates
    that predate the current issue, and require that candidate to be a clear,
    high-similarity outlier above the rest. The gating signal is the hybrid score
    offline and the raw cosine in live mode (see _is_duplicate)."""
    cands = ctx.candidates
    if not cands:
        return None, 0.0, 0.0

    local = settings.using_local_embeddings

    def gate_score(c) -> float:
        return c.hybrid if local else c.cosine

    top_overall_cos = cands[0].cosine
    earlier = [c for c in cands if c.issue_number < ctx.issue.number]
    if not earlier:
        return None, 0.0, top_overall_cos
    top_e = max(earlier, key=gate_score)  # the best earlier candidate by the gate signal
    # Offline precision guard: require dense (semantic) corroboration so a pair
    # that only shares a category keyword can't be flagged on the lexical signal
    # alone. True restatements clear this comfortably (see dup_cosine_floor).
    if local and top_e.cosine < settings.dup_cosine_floor:
        return None, 0.0, top_overall_cos
    # The outlier gap is measured against the runner-up among EARLIER candidates
    # only. A *later* sibling duplicate (same root issue filed afterwards) must not
    # shrink the gap — that's evidence of a duplicate cluster, not against one.
    others = [gate_score(c) for c in earlier if c.issue_number != top_e.issue_number]
    second = max(others) if others else 0.0
    if _is_duplicate(gate_score(top_e), second):
        return top_e.issue_number, round(min(0.99, 0.5 + top_e.cosine), 3), top_overall_cos
    return None, 0.0, top_overall_cos


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
