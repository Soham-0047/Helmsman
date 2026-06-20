"""FastAPI agent runtime — HTTP surface for the gateway, demo, and benchmark.

Endpoints:
  GET  /health                 liveness + provider chain description
  POST /pipeline/run           run the 7-agent pipeline, STREAM NDJSON events
  POST /pipeline/run-sync      run the pipeline, return the final result
  POST /agents/voice-profile   Agent 5 standalone (repo connect)
  POST /embed                  embeddings (bge-small / local fallback)
  POST /vector/index           index issue embeddings into the RAG corpus
  POST /baseline/run           single-agent baseline (benchmark)
  POST /judge/quality          LLM-judge quality score (benchmark)
"""
from __future__ import annotations

import contextlib
import json

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .agents import benchmark as bench
from .agents.voice_profiler import run as run_voice
from .config import settings
from .metrics import metrics
from .model_router import router as model_router
from .pipeline import NODE_ORDER, run_pipeline, run_pipeline_collected
from .schemas import Issue, PipelineRequest, Repo
from .vectorstore import store


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    # Pooled HTTP client is created lazily; close it cleanly on shutdown.
    yield
    await model_router.aclose()


app = FastAPI(title="Helmsman Agent Runtime", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    return {
        "ok": True,
        "service": "helmsman-agents",
        "mode": settings.mode,
        "providers": model_router.describe(),
        "remote_llm": model_router.has_remote(),
        "embeddings": "api" if settings.embeddings_api_url else "local-hash",
        "vector_store": type(store).__name__,
        "node_order": NODE_ORDER,
        "dup_threshold": settings.dup_threshold,
    }


@app.get("/metrics")
async def get_metrics() -> dict:
    """Runtime efficiency snapshot: call/retry/fallback counters, provider
    success rate, embedding cache-hit rate, and p50/p95/max latency per op."""
    return metrics.snapshot()


@app.post("/metrics/reset")
async def reset_metrics() -> dict:
    metrics.reset()
    return {"ok": True}


@app.post("/pipeline/run")
async def pipeline_run(req: PipelineRequest):
    """Stream the pipeline as newline-delimited JSON events (the gateway relays
    these to the browser over SSE and persists each to the case)."""

    async def gen():
        async for ev in run_pipeline(req):
            yield json.dumps(ev.model_dump(exclude_none=True)) + "\n"

    return StreamingResponse(gen(), media_type="application/x-ndjson")


@app.post("/pipeline/run-sync")
async def pipeline_run_sync(req: PipelineRequest) -> dict:
    result = await run_pipeline_collected(req)
    return result.model_dump()


class VoiceRequest(BaseModel):
    maintainer_login: str
    comments: list[str] = []


@app.post("/agents/voice-profile")
async def voice_profile(req: VoiceRequest) -> dict:
    run = await run_voice(req.maintainer_login, req.comments)
    return {
        "voice_profile": run.output.model_dump(),
        "model": run.used_model,
        "provider": run.provider,
        "latency_ms": run.latency_ms,
        "fell_back": run.fell_back,
    }


class EmbedRequest(BaseModel):
    texts: list[str]


@app.post("/embed")
async def embed(req: EmbedRequest) -> dict:
    from .embeddings import embed_texts

    vecs = await embed_texts(req.texts)
    return {"embeddings": vecs, "dim": settings.embedding_dim}


class IndexRequest(BaseModel):
    repo_id: str
    issues: list[dict]  # [{github_issue_number, content}]


@app.post("/vector/index")
async def vector_index(req: IndexRequest) -> dict:
    added = await store.index_many(req.repo_id, req.issues)
    return {"indexed": added}


class BaselineRequest(BaseModel):
    repo: Repo
    issue: Issue


@app.post("/baseline/run")
async def baseline_run(req: BaselineRequest) -> dict:
    run = await bench.run_baseline(req.repo, req.issue)
    return {
        "output": run.output.model_dump(),
        "model": run.used_model,
        "provider": run.provider,
        "latency_ms": run.latency_ms,
        "fell_back": run.fell_back,
    }


class JudgeRequest(BaseModel):
    issue: Issue
    draft_markdown: str


@app.post("/judge/quality")
async def judge_quality(req: JudgeRequest) -> dict:
    run = await bench.run_judge(req.issue, req.draft_markdown)
    return {"output": run.output.model_dump(), "model": run.used_model, "fell_back": run.fell_back}


def main() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=False)


if __name__ == "__main__":
    main()
