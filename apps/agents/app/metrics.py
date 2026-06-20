"""In-process metrics — counters + latency percentiles, no external deps.

The runtime is a single-process asyncio app, so a plain dict registry is enough.
Surfaced at GET /metrics so "how efficient is it" is answerable at runtime:
LLM call/retry/fallback counts, provider success rates, embedding cache-hit rate,
and p50/p95/max latency per operation.
"""
from __future__ import annotations

import time
from collections import defaultdict


def _rate(counters: dict[str, int], num: str, den: str) -> float:
    d = counters.get(den, 0)
    return round(counters.get(num, 0) / d, 3) if d else 0.0


class Metrics:
    def __init__(self) -> None:
        self.counters: dict[str, int] = defaultdict(int)
        self._lat: dict[str, list[int]] = defaultdict(list)
        self.started = time.time()

    def incr(self, name: str, n: int = 1) -> None:
        self.counters[name] += n

    def observe(self, name: str, ms: int) -> None:
        arr = self._lat[name]
        arr.append(int(ms))
        # keep memory bounded — last 2000 samples per series
        if len(arr) > 2000:
            del arr[: len(arr) - 2000]

    @staticmethod
    def _pct(sorted_arr: list[int], p: float) -> int:
        if not sorted_arr:
            return 0
        i = min(len(sorted_arr) - 1, int(round((p / 100.0) * (len(sorted_arr) - 1))))
        return sorted_arr[i]

    def snapshot(self) -> dict:
        lat: dict[str, dict] = {}
        for k, a in self._lat.items():
            if not a:
                continue
            s = sorted(a)
            lat[k] = {
                "count": len(s),
                "p50": self._pct(s, 50),
                "p95": self._pct(s, 95),
                "max": s[-1],
                "avg": round(sum(s) / len(s), 1),
            }
        c = self.counters
        return {
            "uptime_s": round(time.time() - self.started, 1),
            "counters": dict(c),
            "latency_ms": lat,
            "derived": {
                "llm_success_rate": _rate(c, "llm.success", "llm.attempt"),
                "llm_fallback_rate": _rate(c, "agent.fallback", "agent.run"),
                "llm_retry_rate": _rate(c, "llm.retry", "llm.attempt"),
                "embed_cache_hit_rate": _rate(c, "embed.cache_hit", "embed.lookups"),
            },
        }

    def reset(self) -> None:
        self.counters.clear()
        self._lat.clear()
        self.started = time.time()


metrics = Metrics()
