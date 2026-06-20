"""Vector store for the per-repo RAG corpus (issue_embeddings).

Live: pgvector on Supabase via asyncpg, using the match_issue_embeddings()
SQL function from db/schema.sql.
Offline/demo: an in-memory HYBRID index — dense cosine (hashing embedder) fused
with a sparse TF-IDF lexical score computed over the repo corpus. Fusing the two
lifts duplicate recall for paraphrases (shared rare terms register even when the
dense vector is lukewarm) without sacrificing precision. Same interface either
way, so Agent 2 doesn't care.

Each Candidate carries cosine / lexical / hybrid so the retriever can gate on the
right signal: hybrid offline, raw bge-small cosine in live mode.
"""
from __future__ import annotations

import asyncio
import math
from collections import Counter
from dataclasses import dataclass, field

from .config import settings
from .embeddings import _tokens, cosine, embed_one, embed_texts


@dataclass
class Candidate:
    issue_number: int
    content: str
    similarity: float  # ranking score (== hybrid offline, == cosine live)
    cosine: float = 0.0
    lexical: float = 0.0
    hybrid: float = 0.0


def _tf(tokens: list[str]) -> dict[str, float]:
    return dict(Counter(tokens))


def _tfidf_cosine(q_tf: dict[str, float], d_tf: dict[str, float], idf: dict[str, float]) -> float:
    """Cosine over sublinear-TF * IDF weighted sparse vectors, bounded [0,1]."""
    if not q_tf or not d_tf:
        return 0.0

    def weights(tf: dict[str, float]) -> dict[str, float]:
        return {t: (1.0 + math.log(c)) * idf.get(t, 1.0) for t, c in tf.items()}

    qw, dw = weights(q_tf), weights(d_tf)
    qn = math.sqrt(sum(v * v for v in qw.values())) or 1.0
    dn = math.sqrt(sum(v * v for v in dw.values())) or 1.0
    small, big = (qw, dw) if len(qw) <= len(dw) else (dw, qw)
    dot = sum(v * big.get(t, 0.0) for t, v in small.items())
    return dot / (qn * dn)


class InMemoryStore:
    def __init__(self) -> None:
        # repo -> list of (num, content, vec, tf)
        self._by_repo: dict[str, list[tuple[int, str, list[float], dict[str, float]]]] = {}
        self._df: dict[str, Counter] = {}  # repo -> token -> doc frequency

    async def index_many(self, repo_id: str, items: list[dict]) -> int:
        if not items:
            return 0
        texts = [it["content"] for it in items]
        vecs = await embed_texts(texts)
        bucket = self._by_repo.setdefault(repo_id, [])
        df = self._df.setdefault(repo_id, Counter())
        existing = {n for (n, _, _, _) in bucket}
        added = 0
        for it, v in zip(items, vecs):
            num = int(it["github_issue_number"])
            if num in existing:
                continue
            toks = _tokens(it["content"])
            tf = _tf(toks)
            bucket.append((num, it["content"], v, tf))
            for t in set(toks):
                df[t] += 1
            added += 1
        return added

    def _idf(self, repo_id: str) -> dict[str, float]:
        df = self._df.get(repo_id, Counter())
        n = max(1, len(self._by_repo.get(repo_id, [])))
        return {t: math.log((n + 1) / (c + 1)) + 1.0 for t, c in df.items()}

    async def search(self, repo_id: str, query: str, k: int = 5, exclude: int | None = None) -> list[Candidate]:
        bucket = self._by_repo.get(repo_id, [])
        if not bucket:
            return []
        qv = await embed_one(query)
        q_tf = _tf(_tokens(query))
        idf = self._idf(repo_id)
        w = settings.hybrid_vector_weight
        scored: list[Candidate] = []
        for (num, content, vec, tf) in bucket:
            if num == exclude:
                continue
            cos = cosine(qv, vec)
            lex = _tfidf_cosine(q_tf, tf, idf)
            hyb = w * cos + (1.0 - w) * lex
            scored.append(Candidate(num, content, hyb, round(cos, 4), round(lex, 4), round(hyb, 4)))
        scored.sort(key=lambda c: c.hybrid, reverse=True)
        return scored[:k]


class PgVectorStore:
    def __init__(self, dsn: str) -> None:
        self.dsn = dsn
        self._pool = None

    async def _get_pool(self):
        if self._pool is None:
            import asyncpg  # imported lazily so demo mode needs no driver

            self._pool = await asyncpg.create_pool(self.dsn, min_size=1, max_size=4)
        return self._pool

    async def index_many(self, repo_id: str, items: list[dict]) -> int:
        if not items:
            return 0
        pool = await self._get_pool()
        vecs = await embed_texts([it["content"] for it in items])
        added = 0
        async with pool.acquire() as conn:
            for it, v in zip(items, vecs):
                vec_literal = "[" + ",".join(f"{x:.6f}" for x in v) + "]"
                await conn.execute(
                    """
                    INSERT INTO issue_embeddings (repo_id, github_issue_number, content, embedding)
                    VALUES ($1, $2, $3, $4::vector)
                    ON CONFLICT (repo_id, github_issue_number) DO UPDATE
                      SET content = EXCLUDED.content, embedding = EXCLUDED.embedding
                    """,
                    repo_id,
                    int(it["github_issue_number"]),
                    it["content"],
                    vec_literal,
                )
                added += 1
        return added

    async def search(self, repo_id: str, query: str, k: int = 5, exclude: int | None = None) -> list[Candidate]:
        pool = await self._get_pool()
        qv = await embed_one(query)
        vec_literal = "[" + ",".join(f"{x:.6f}" for x in qv) + "]"
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT github_issue_number, content, similarity "
                "FROM match_issue_embeddings($1, $2::vector, $3)",
                repo_id,
                vec_literal,
                k + (1 if exclude is not None else 0),
            )
        # Live mode leans on bge-small's strong cosine; lexical is left to the DB's
        # high-quality embeddings. hybrid == cosine here so the retriever's live
        # gate (absolute dup_threshold) is unchanged.
        out = [
            Candidate(r["github_issue_number"], r["content"], float(r["similarity"]),
                      cosine=float(r["similarity"]), lexical=0.0, hybrid=float(r["similarity"]))
            for r in rows
        ]
        if exclude is not None:
            out = [c for c in out if c.issue_number != exclude]
        return out[:k]


def _make_store():
    if settings.database_url and settings.mode == "live":
        try:
            return PgVectorStore(settings.database_url)
        except Exception:
            pass
    return InMemoryStore()


store = _make_store()

# A tiny lock so concurrent pipeline runs don't double-seed the in-memory store.
_seed_lock = asyncio.Lock()


async def ensure_seeded(repo_id: str, corpus: list[dict]) -> int:
    if not corpus:
        return 0
    async with _seed_lock:
        return await store.index_many(repo_id, corpus)
