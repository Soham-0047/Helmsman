"""Unit tests for the robustness/efficiency additions to the agent runtime.

These cover the deterministic pieces (no network): router backoff schedule,
embedding LRU cache, TF-IDF + hybrid retrieval, the earlier-only duplicate gate,
and tolerant JSON parsing / self-repair validation.

Run: apps/agents/.venv/bin/python -m pytest apps/agents/tests -q
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

# Make `import app.*` work when run from the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import embeddings  # noqa: E402
from app.agents import retriever as ret  # noqa: E402
from app.agents.base import _parse_validate  # noqa: E402
from app.config import settings  # noqa: E402
from app.metrics import metrics  # noqa: E402
from app.model_router import backoff_delay  # noqa: E402
from app.schemas import ClassifierOutput  # noqa: E402
from app.util import extract_json  # noqa: E402
from app.vectorstore import Candidate, InMemoryStore, _tfidf_cosine  # noqa: E402


# ---------------- router backoff ----------------
def test_backoff_grows_and_caps():
    base = settings.llm_backoff_base_ms / 1000.0
    cap = settings.llm_backoff_max_ms / 1000.0
    d1 = backoff_delay(1, jitter=0)
    d2 = backoff_delay(2, jitter=0)
    d3 = backoff_delay(3, jitter=0)
    assert d1 < d2 < d3                      # exponential growth
    assert abs(d1 - base * 0.5) < 1e-9       # jitter=0 -> floor of the jitter window (exp*0.5)
    assert backoff_delay(20, jitter=0) <= cap  # capped


def test_backoff_honors_retry_after():
    # a server Retry-After larger than the computed backoff wins
    assert backoff_delay(1, retry_after=5.0, jitter=0) >= 5.0


def test_backoff_jitter_in_bounds():
    cap = settings.llm_backoff_max_ms / 1000.0
    for _ in range(50):
        d = backoff_delay(3, jitter=1.0)
        assert 0.0 <= d <= cap


# ---------------- embedding cache ----------------
def test_embedding_cache_hit_and_identity():
    metrics.reset()
    txt = "a parser segfault on a null byte in the header"
    v1 = asyncio.run(embeddings.embed_one(txt))
    v2 = asyncio.run(embeddings.embed_one(txt))
    assert v1 == v2                                   # deterministic
    assert metrics.counters.get("embed.cache_hit", 0) >= 1
    # only one real (local) embed despite two lookups
    assert metrics.counters.get("embed.local", 0) == 1


# ---------------- TF-IDF + hybrid retrieval ----------------
def test_tfidf_cosine_bounds_and_overlap():
    idf = {"null": 2.0, "byte": 2.0, "crash": 2.0, "the": 1.0}
    a = {"null": 1.0, "byte": 1.0, "crash": 1.0}
    assert _tfidf_cosine(a, a, idf) == 1.0 or abs(_tfidf_cosine(a, a, idf) - 1.0) < 1e-9
    assert _tfidf_cosine(a, {"unrelated": 1.0}, idf) == 0.0
    partial = _tfidf_cosine(a, {"null": 1.0, "byte": 1.0}, idf)
    assert 0.0 < partial < 1.0


def test_bm25_normalized_bounds_and_length_norm():
    from app.vectorstore import _bm25_normalized

    idf = {"websocket": 2.5, "memory": 1.2, "the": 0.1}
    q = {"websocket": 1.0, "memory": 1.0}
    q_len, avgdl, k1, b = 2.0, 5.0, 1.4, 0.75

    # a document identical to the query self-normalizes to 1.0
    assert _bm25_normalized(q, q, q_len, q_len, idf, avgdl, k1, b) >= 0.99
    # no token overlap -> 0
    assert _bm25_normalized(q, {"unrelated": 1.0}, 1.0, q_len, idf, avgdl, k1, b) == 0.0
    # partial overlap lands strictly inside (0, 1)
    partial = _bm25_normalized(q, {"websocket": 1.0}, 1.0, q_len, idf, avgdl, k1, b)
    assert 0.0 < partial < 1.0
    # length normalization: same matched terms, but a longer (padded) doc scores lower
    short = _bm25_normalized(q, {"websocket": 1.0, "memory": 1.0}, 2.0, q_len, idf, avgdl, k1, b)
    long = _bm25_normalized(
        q, {"websocket": 1.0, "memory": 1.0, "x": 1.0, "y": 1.0, "z": 1.0, "w": 1.0}, 6.0, q_len, idf, avgdl, k1, b
    )
    assert short > long
    # a rarer shared term (higher idf) corroborates more than a common one
    rare = _bm25_normalized({"websocket": 1.0}, {"websocket": 1.0}, 1.0, 1.0, idf, avgdl, k1, b)
    common = _bm25_normalized({"the": 1.0}, {"the": 1.0}, 1.0, 1.0, idf, avgdl, k1, b)
    assert rare >= common  # self-normalized identical match; rare term is never weaker


def test_dup_gate_requires_cosine_corroboration(monkeypatch):
    # The precision guard: a lexical-only match (high hybrid, weak cosine) must not
    # be flagged a duplicate. Mirrors the real #229->#116 keyword false positive.
    monkeypatch.setattr(type(settings), "using_local_embeddings", property(lambda s: True))
    cands = [
        Candidate(116, "x", 0.406, cosine=0.387, lexical=0.425, hybrid=0.406),  # lexical-driven, weak cosine
        Candidate(101, "x", 0.150, cosine=0.20, lexical=0.10, hybrid=0.150),
    ]
    dup, _, _ = ret._dup_decision(_ctx(229, cands))
    assert dup is None  # rejected: cosine 0.387 below the corroboration floor


def test_inmemory_hybrid_ranks_paraphrase_duplicate_first():
    store = InMemoryStore()
    corpus = [
        {"github_issue_number": 1, "content": "App crashes with a segfault when the file starts with a null byte"},
        {"github_issue_number": 2, "content": "Add support for TOML configuration files"},
        {"github_issue_number": 3, "content": "Docs typo in the quickstart guide"},
    ]
    asyncio.run(store.index_many("r", corpus))
    res = asyncio.run(store.search("r", "Crash with no message on a file that begins with a NUL", k=3))
    assert res[0].issue_number == 1                  # the paraphrase duplicate ranks first
    assert res[0].hybrid >= res[1].hybrid            # sorted by hybrid
    assert res[0].lexical > 0.0                      # lexical signal contributed


# ---------------- duplicate gate (earlier-only gap) ----------------
def _ctx(number: int, cands):
    return SimpleNamespace(candidates=cands, issue=SimpleNamespace(number=number))


def test_dup_gate_uses_earlier_only_gap(monkeypatch):
    # Regression test for the fix: a LATER sibling duplicate must not shrink the gap.
    monkeypatch.setattr(type(settings), "using_local_embeddings", property(lambda s: True))
    cands = [
        Candidate(105, "x", 0.414, cosine=0.49, lexical=0.34, hybrid=0.414),  # earlier, true original
        Candidate(223, "x", 0.376, cosine=0.43, lexical=0.32, hybrid=0.376),  # LATER sibling dup
        Candidate(101, "x", 0.324, cosine=0.42, lexical=0.22, hybrid=0.324),  # earlier runner-up
    ]
    dup, conf, _ = ret._dup_decision(_ctx(208, cands))
    assert dup == 105 and conf > 0.5                 # flagged despite the later sibling


def test_dup_gate_precision_floor(monkeypatch):
    # A best earlier candidate below the floor must NOT be flagged.
    monkeypatch.setattr(type(settings), "using_local_embeddings", property(lambda s: True))
    cands = [
        Candidate(110, "x", 0.364, cosine=0.40, lexical=0.33, hybrid=0.364),  # below 0.40 floor
        Candidate(101, "x", 0.20, cosine=0.25, lexical=0.15, hybrid=0.20),
    ]
    dup, _, _ = ret._dup_decision(_ctx(225, cands))
    assert dup is None


# ---------------- prioritizer rubric (log-scaled signals, locked weights) ----------------
def _prio_ctx(title, body, reactions=0, age=0.0, contrib=False):
    issue = SimpleNamespace(
        title=title, body=body, reactions=reactions, age_hours=age,
        author_is_contributor=contrib, number=1,
    )
    return SimpleNamespace(issue=issue, classification=SimpleNamespace(category="bug"), retriever=None)


def test_prioritizer_security_override_and_log_scaling():
    from app.agents.prioritizer import _log_saturate, compute_rubric

    # security signal forces respond_now regardless of an otherwise-modest score
    sec = compute_rubric(_prio_ctx("Security: API key leaked", "token printed in logs"))
    assert sec.recommended_action == "respond_now"

    # reactions contribute with diminishing returns and stay monotonic
    low = compute_rubric(_prio_ctx("Bug", "x", reactions=2)).score
    mid = compute_rubric(_prio_ctx("Bug", "x", reactions=10)).score
    hi = compute_rubric(_prio_ctx("Bug", "x", reactions=50)).score
    assert low <= mid <= hi

    # the saturation curve is concave, bounded, and zero at zero
    assert _log_saturate(0, 30) == 0.0
    assert 0.0 < _log_saturate(5, 30) < _log_saturate(40, 30) <= 1.0
    assert _log_saturate(10_000, 30) == 1.0
    # concavity: the first 5 reactions buy more than the next 25
    assert _log_saturate(5, 30) > (_log_saturate(30, 30) - _log_saturate(5, 30))


# ---------------- JSON parse / self-repair validation ----------------
def test_extract_json_variants():
    assert extract_json('{"a": 1}') == {"a": 1}
    assert extract_json('```json\n{"a": 2}\n```') == {"a": 2}
    assert extract_json('here you go: {"a": 3} thanks') == {"a": 3}
    assert extract_json("not json at all") is None


def test_parse_validate_against_schema():
    good = '{"category": "bug", "confidence": 0.9, "rationale": "x", "signals": ["crash"]}'
    out = _parse_validate(good, ClassifierOutput)
    assert out is not None and out.category == "bug"
    # malformed -> None (caller then triggers the self-repair retry / fallback)
    assert _parse_validate("{not valid", ClassifierOutput) is None


# ---------------- router retry (proves transient failures recover) ----------------
class _FakeResp:
    def __init__(self, status, payload=None, headers=None):
        self.status_code = status
        self._p = payload or {}
        self.headers = headers or {}
        self.request = None

    def json(self):
        return self._p

    @property
    def text(self):
        return "error body"


async def test_router_retries_on_503_then_succeeds(monkeypatch):
    """A 503 on the first attempt must be retried on the SAME provider and then
    succeed — without falling through to a fallback. This is the core resilience
    guarantee for transient provider hiccups."""
    from app import model_router as mr

    r = mr.ModelRouter()
    r.chain = [mr.Provider("test", "qwen", "http://x", "k", 100)]
    calls = {"n": 0}

    class FakeClient:
        is_closed = False

        async def post(self, url, **kw):
            calls["n"] += 1
            if calls["n"] == 1:
                return _FakeResp(503, headers={"Retry-After": "0"})
            return _FakeResp(200, {"choices": [{"message": {"content": '{"ok": 1}'}}]})

    monkeypatch.setattr(r, "_get_client", lambda: FakeClient())

    async def _no_sleep(*a, **k):
        return None

    monkeypatch.setattr(mr.asyncio, "sleep", _no_sleep)

    res = await r.complete(model="qwen3-8b", system="s", user="u")
    assert res.text == '{"ok": 1}'
    assert res.attempts == 2          # retried exactly once
    assert calls["n"] == 2


async def test_router_fails_over_to_next_provider(monkeypatch):
    """When the first provider exhausts its retries, the router fails over to the
    next provider in the chain rather than giving up."""
    from app import model_router as mr

    r = mr.ModelRouter()
    r.chain = [
        mr.Provider("p1", "qwen", "http://a", "k", 100),
        mr.Provider("p2", "groq", "http://b", "k", 110),
    ]
    seen = []

    class FakeClient:
        is_closed = False

        async def post(self, url, **kw):
            seen.append(url)
            if url.startswith("http://a"):
                return _FakeResp(503)               # p1 always 503 -> exhausts retries
            return _FakeResp(200, {"choices": [{"message": {"content": '{"ok": 1}'}}]})

    monkeypatch.setattr(r, "_get_client", lambda: FakeClient())

    async def _no_sleep(*a, **k):
        return None

    monkeypatch.setattr(mr.asyncio, "sleep", _no_sleep)

    res = await r.complete(model="qwen3-8b", system="s", user="u")
    assert res.provider_id == "groq"
    assert any(u.startswith("http://b") for u in seen)
