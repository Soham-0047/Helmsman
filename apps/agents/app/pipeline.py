"""The seven-agent pipeline — explicit, custom orchestration (no framework).

Control flow (the branching is the Agent Society story):
  Intake
  -> Classification   : Classifier
  -> Investigation     : Context Retriever (always) ; then, by classification:
       bug        -> Reproducer + Source Analyzer(flagged) + Prioritizer
       feature/question -> Prioritizer only (skip Reproducer + Source Analyzer)
       duplicate  -> Prioritizer only (Retriever already found the original)
       spam       -> stop; flag for dismissal
       needs_info -> Prioritizer only
  -> Drafting          : Voice Profiler (loaded) -> Responder (+ self-check)
  -> Pending Approval  : human gate (the case stops here for maintainer review)

Yields typed AgentEvents as it goes; the gateway persists them, advances the
Maestro Case stage, and fans them out over SSE.
"""
from __future__ import annotations

import time
from typing import AsyncIterator

from .agents import (
    classifier,
    prioritizer,
    reproducer,
    responder,
    retriever,
    source_analyzer,
)
from .agents.base import AgentRun
from .agents.context import PipelineCtx
from .schemas import AgentEvent, PipelineRequest, PipelineResult, VoiceProfile
from .util import extract_code_blocks
from .vectorstore import ensure_seeded, store

# Canonical node order for the dashboard pipeline view (7 nodes).
NODE_ORDER = [
    "classifier",
    "retriever",
    "reproducer",
    "source_analyzer",
    "prioritizer",
    "voice_profiler",
    "responder",
]
AGENT_STAGE = {
    "classifier": "Classification",
    "retriever": "Investigation",
    "reproducer": "Investigation",
    "source_analyzer": "Investigation",
    "prioritizer": "Investigation",
    "voice_profiler": "Drafting",
    "responder": "Drafting",
}


def _ev(case_id: str, **kw) -> AgentEvent:
    return AgentEvent(case_id=case_id, **kw)


def _complete_ev(case_id: str, agent: str, run: AgentRun) -> AgentEvent:
    return _ev(
        case_id,
        type="agent_complete",
        agent=agent,
        stage=AGENT_STAGE[agent],
        output=run.output.model_dump(),
        model=run.used_model,
        provider=run.provider,
        latency_ms=run.latency_ms,
        message=("fallback" if run.fell_back else None),
    )


async def run_pipeline(req: PipelineRequest) -> AsyncIterator[AgentEvent]:
    started = time.monotonic()
    case_id = req.case_id
    repo_id = str(req.repo.github_id or req.repo.full_name)

    ctx = PipelineCtx(
        case_id=case_id,
        repo_id=repo_id,
        repo=req.repo,
        issue=req.issue,
        voice_profile=req.voice_profile or VoiceProfile(),
        flags=req.flags,
        code_blocks=extract_code_blocks(req.issue.body or ""),
        source_files=req.source_files,
    )

    # Seed the in-memory/pgvector corpus for duplicate detection.
    if req.seed_corpus:
        await ensure_seeded(repo_id, req.seed_corpus)

    yield _ev(case_id, type="stage", stage="Intake", status="entered",
              message=f"Case opened for issue #{req.issue.number}")

    # ---- Classification -------------------------------------------------
    yield _ev(case_id, type="stage", stage="Classification", status="entered")
    yield _ev(case_id, type="agent_start", agent="classifier", stage="Classification")
    crun = await classifier.run(ctx)
    yield _complete_ev(case_id, "classifier", crun)
    category = ctx.classification.category if ctx.classification else "bug"

    # Spam short-circuit
    if category == "spam":
        for a in ("retriever", "reproducer", "source_analyzer", "prioritizer", "voice_profiler", "responder"):
            yield _ev(case_id, type="agent_skipped", agent=a, stage=AGENT_STAGE[a],
                      message="skipped: issue classified as spam")
        yield _ev(case_id, type="stage", stage="Pending Approval", status="entered",
                  message="Flagged as spam — awaiting maintainer dismissal")
        yield _final_event(ctx, started)
        return

    # ---- Investigation --------------------------------------------------
    yield _ev(case_id, type="stage", stage="Investigation", status="entered")

    # Context Retriever (always): embed + vector search, then re-rank.
    yield _ev(case_id, type="agent_start", agent="retriever", stage="Investigation")
    query = f"{ctx.issue.title}\n{ctx.issue.body}"
    ctx.candidates = await store.search(repo_id, query, k=5, exclude=ctx.issue.number)
    rrun = await retriever.run(ctx)
    yield _complete_ev(case_id, "retriever", rrun)

    is_duplicate = bool(ctx.retriever and ctx.retriever.likely_duplicate_of)

    # Bug-only agents
    if category == "bug" and not is_duplicate:
        yield _ev(case_id, type="agent_start", agent="reproducer", stage="Investigation")
        rep = await reproducer.run(ctx)
        yield _complete_ev(case_id, "reproducer", rep)

        if ctx.flag("helmsman.use_long_context_analyzer", True):
            yield _ev(case_id, type="agent_start", agent="source_analyzer", stage="Investigation")
            srun = await source_analyzer.run(ctx)
            yield _complete_ev(case_id, "source_analyzer", srun)
        else:
            yield _ev(case_id, type="agent_skipped", agent="source_analyzer", stage="Investigation",
                      message="skipped: helmsman.use_long_context_analyzer is off")
    else:
        reason = "skipped: duplicate" if is_duplicate else f"skipped: classification={category}"
        yield _ev(case_id, type="agent_skipped", agent="reproducer", stage="Investigation", message=reason)
        yield _ev(case_id, type="agent_skipped", agent="source_analyzer", stage="Investigation", message=reason)

    # Prioritizer (all non-spam)
    yield _ev(case_id, type="agent_start", agent="prioritizer", stage="Investigation")
    prun = await prioritizer.run(ctx)
    yield _complete_ev(case_id, "prioritizer", prun)

    # ---- Drafting -------------------------------------------------------
    yield _ev(case_id, type="stage", stage="Drafting", status="entered")
    # Voice Profiler node: profile is loaded (computed on repo connect), not re-run per issue.
    yield _ev(case_id, type="agent_complete", agent="voice_profiler", stage="Drafting",
              output=ctx.voice_profile.model_dump(), model="profile-cache", provider="cache",
              latency_ms=0, status="loaded", message="voice fingerprint loaded from repo profile")

    yield _ev(case_id, type="agent_start", agent="responder", stage="Drafting")
    resp = await responder.run(ctx)
    yield _complete_ev(case_id, "responder", resp)

    # ---- Pending Approval (human gate) ----------------------------------
    yield _ev(case_id, type="stage", stage="Pending Approval", status="entered",
              message="Draft ready — awaiting maintainer approval")
    yield _final_event(ctx, started)


def _final_event(ctx: PipelineCtx, started: float) -> AgentEvent:
    result = assemble_result(ctx, started)
    return AgentEvent(
        case_id=ctx.case_id,
        type="pipeline_complete",
        output=result.model_dump(),
        latency_ms=result.total_ms,
    )


def assemble_result(ctx: PipelineCtx, started: float) -> PipelineResult:
    outputs: dict = {}
    if ctx.classification:
        outputs["classifier"] = ctx.classification.model_dump()
    if ctx.retriever:
        outputs["retriever"] = ctx.retriever.model_dump()
    if ctx.reproducer:
        outputs["reproducer"] = ctx.reproducer.model_dump()
    if ctx.source:
        outputs["source_analyzer"] = ctx.source.model_dump()
    if ctx.prioritizer:
        outputs["prioritizer"] = ctx.prioritizer.model_dump()
    outputs["voice_profiler"] = ctx.voice_profile.model_dump()
    if ctx.responder:
        outputs["responder"] = ctx.responder.model_dump()

    classification = ctx.classification.category if ctx.classification else None
    if ctx.retriever and ctx.retriever.likely_duplicate_of:
        classification = "duplicate"

    return PipelineResult(
        case_id=ctx.case_id,
        classification=classification,
        priority_score=ctx.prioritizer.score if ctx.prioritizer else None,
        draft_response=ctx.responder.draft_markdown if ctx.responder else "",
        recommended_action=(ctx.responder.recommended_action if ctx.responder
                            else (ctx.prioritizer.recommended_action if ctx.prioritizer else None)),
        pipeline_outputs=outputs,
        total_ms=int((time.monotonic() - started) * 1000),
    )


async def run_pipeline_collected(req: PipelineRequest) -> PipelineResult:
    """Run the pipeline and return the final result (used by demo/benchmark)."""
    events: list[AgentEvent] = []
    result: PipelineResult | None = None
    async for ev in run_pipeline(req):
        events.append(ev)
        if ev.type == "pipeline_complete" and ev.output:
            result = PipelineResult.model_validate(ev.output)
    if result is None:
        result = PipelineResult(case_id=req.case_id)
    result.events = events
    return result
