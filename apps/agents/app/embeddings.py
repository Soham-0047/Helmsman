"""Embeddings — BAAI/bge-small-en-v1.5 (384-dim).

Live: calls an OpenAI-compatible embeddings endpoint (EMBEDDINGS_API_URL).
Offline/demo: a deterministic hashing bag-of-words+bigrams embedder. It is not
state-of-the-art, but cosine similarity between texts that share vocabulary is
high enough that the fixture duplicate pairs (e.g. #105->#101, #117->#102)
surface correctly without any API key.
"""
from __future__ import annotations

import re
from collections import OrderedDict
from typing import Iterable

import httpx
import numpy as np

from .config import settings
from .metrics import metrics

# Process-local LRU cache: text -> 384-d vector. Embedding the same issue/query
# text repeatedly (corpus re-seeds, duplicate benchmark passes, the responder
# re-embedding a draft) is common, and embedding is pure for a given text — so
# caching is both safe and a real efficiency win. Bounded by HELMSMAN_EMBED_CACHE_SIZE.
_CACHE: "OrderedDict[str, list[float]]" = OrderedDict()
_CACHE_MAX = max(0, settings.embed_cache_size)


def _cache_get(text: str) -> list[float] | None:
    v = _CACHE.get(text)
    if v is not None:
        _CACHE.move_to_end(text)
    return v


def _cache_put(text: str, vec: list[float]) -> None:
    if _CACHE_MAX <= 0:
        return
    _CACHE[text] = vec
    _CACHE.move_to_end(text)
    while len(_CACHE) > _CACHE_MAX:
        _CACHE.popitem(last=False)

_DIM = settings.embedding_dim
_TOKEN_RE = re.compile(r"[a-z0-9_]+")
_STOP = {
    "the", "a", "an", "is", "are", "to", "of", "and", "or", "in", "on", "it",
    "i", "my", "this", "that", "for", "with", "when", "if", "but", "not", "no",
    "you", "your", "me", "we", "they", "he", "she", "as", "at", "by", "be",
}


def _tokens(text: str) -> list[str]:
    toks = [t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOP and len(t) > 1]
    return toks


def _hash(s: str) -> int:
    h = 0x811C9DC5
    for ch in s:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h % _DIM


def _char_trigrams(token: str) -> list[str]:
    s = f"#{token}#"
    return [s[i : i + 3] for i in range(len(s) - 2)]


def _local_embed(text: str) -> np.ndarray:
    """Hashing embedder: word unigrams + bigrams + character trigrams.

    Char trigrams matter a lot here — they let morphological/paraphrase overlap
    ("crash"/"crashes", "start"/"starts") register similarity even when exact
    tokens differ, which is what makes offline duplicate detection work. Word
    features stay dominant so unrelated issues still score low.
    """
    vec = np.zeros(_DIM, dtype=np.float32)
    toks = _tokens(text)
    for t in toks:
        vec[_hash(t)] += 1.0
        for g in _char_trigrams(t):
            vec[_hash("c:" + g)] += 0.35
    for a, b in zip(toks, toks[1:]):
        vec[_hash(a + "_" + b)] += 0.5
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec /= norm
    return vec


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Return a 384-dim embedding per input text, with an LRU cache in front.

    Only the cache MISSES are sent to the API / local embedder; results are
    cached so repeated text (corpus re-seeds, repeated queries) is free.
    """
    if not texts:
        return []
    metrics.incr("embed.lookups", len(texts))

    out: list[list[float] | None] = [None] * len(texts)
    misses: list[int] = []
    for i, t in enumerate(texts):
        cached = _cache_get(t)
        if cached is not None:
            out[i] = cached
            metrics.incr("embed.cache_hit")
        else:
            misses.append(i)

    if misses:
        miss_texts = [texts[i] for i in misses]
        if settings.embeddings_api_url:
            try:
                vecs = await _api_embed(miss_texts)
                metrics.incr("embed.api", len(miss_texts))
            except Exception:
                vecs = [_local_embed(t).tolist() for t in miss_texts]
                metrics.incr("embed.local", len(miss_texts))
        else:
            vecs = [_local_embed(t).tolist() for t in miss_texts]
            metrics.incr("embed.local", len(miss_texts))
        for idx, vec in zip(misses, vecs):
            out[idx] = vec
            _cache_put(texts[idx], vec)

    return [v if v is not None else _local_embed(texts[i]).tolist() for i, v in enumerate(out)]


async def embed_one(text: str) -> list[float]:
    return (await embed_texts([text]))[0]


async def _api_embed(texts: list[str]) -> list[list[float]]:
    headers = {"Content-Type": "application/json"}
    if settings.embeddings_api_key:
        headers["Authorization"] = f"Bearer {settings.embeddings_api_key}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{settings.embeddings_api_url.rstrip('/')}/embeddings",
            headers=headers,
            json={"model": settings.embedding_model, "input": texts},
        )
        r.raise_for_status()
        data = r.json()
        return [row["embedding"] for row in data["data"]]


def cosine(a: Iterable[float], b: Iterable[float]) -> float:
    av = np.asarray(list(a), dtype=np.float32)
    bv = np.asarray(list(b), dtype=np.float32)
    na, nb = np.linalg.norm(av), np.linalg.norm(bv)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(av, bv) / (na * nb))
