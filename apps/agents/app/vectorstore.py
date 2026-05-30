"""Vector store for the per-repo RAG corpus (issue_embeddings).

Live: pgvector on Supabase via asyncpg, using the match_issue_embeddings()
SQL function from db/schema.sql.
Offline/demo: an in-memory cosine index seeded from the fixture corpus passed in
the pipeline request. Same interface either way, so Agent 2 doesn't care.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass

from .config import settings
from .embeddings import cosine, embed_one, embed_texts


@dataclass
class Candidate:
    issue_number: int
    content: str
    similarity: float


class InMemoryStore:
    def __init__(self) -> None:
        self._by_repo: dict[str, list[tuple[int, str, list[float]]]] = {}

    async def index_many(self, repo_id: str, items: list[dict]) -> int:
        if not items:
            return 0
        texts = [it["content"] for it in items]
        vecs = await embed_texts(texts)
        bucket = self._by_repo.setdefault(repo_id, [])
        existing = {n for (n, _, _) in bucket}
        added = 0
        for it, v in zip(items, vecs):
            num = int(it["github_issue_number"])
            if num in existing:
                continue
            bucket.append((num, it["content"], v))
            added += 1
        return added

    async def search(self, repo_id: str, query: str, k: int = 5, exclude: int | None = None) -> list[Candidate]:
        bucket = self._by_repo.get(repo_id, [])
        if not bucket:
            return []
        qv = await embed_one(query)
        scored = [
            Candidate(num, content, cosine(qv, vec))
            for (num, content, vec) in bucket
            if num != exclude
        ]
        scored.sort(key=lambda c: c.similarity, reverse=True)
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
        out = [Candidate(r["github_issue_number"], r["content"], float(r["similarity"])) for r in rows]
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
