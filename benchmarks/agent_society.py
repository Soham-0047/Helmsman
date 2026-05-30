"""Agent Society A/B benchmark (Qwen Track 3 qualifying section).

Runs the SAME fixture issues through two systems and measures the efficiency
gain of multi-agent collaboration over a single-agent baseline:

  (a) baseline  — one qwen3-8b call asked to triage + label + prioritize + draft
  (b) pipeline  — the seven-agent Helmsman pipeline

Metrics (per the spec):
  - classification accuracy   (vs. ground-truth expected_classification)
  - response quality          (1-5, LLM-judge: qwen3-32b, or heuristic offline)
  - voice similarity          (cosine: draft embedding vs. maintainer golden reply)
  - end-to-end time per issue

Writes benchmarks/results.json. `npm run benchmark` then regenerates the README
table. Runs against the FastAPI runtime (AGENTS_URL); works fully offline on the
deterministic fallbacks (clearly labeled in the output) or on real Qwen when keys
are present.
"""
from __future__ import annotations

import json
import os
import statistics
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
AGENTS = os.getenv("AGENTS_URL", "http://localhost:8000")

main = json.loads((ROOT / "db/seed/fixtures.json").read_text())
extra = json.loads((ROOT / "benchmarks/fixtures/extra.json").read_text())
source_files = json.loads((ROOT / "db/seed/source_files.json").read_text())["files"]
voice_corpus = json.loads((ROOT / "db/seed/voice_corpus.json").read_text())

REPO = main["repo"]
ISSUES = main["issues"] + extra["issues"]
CORPUS = [{"github_issue_number": i["github_issue_number"], "content": f"{i['title']}\n{i['body']}"} for i in ISSUES]


def issue_payload(fx: dict) -> dict:
    return {
        "number": fx["github_issue_number"],
        "title": fx["title"],
        "body": fx.get("body", ""),
        "author": fx.get("author", "user"),
        "author_is_contributor": fx.get("author_is_contributor", False),
        "reactions": fx.get("reactions", 0),
        "age_hours": fx.get("age_hours", 0),
        "existing_labels": fx.get("existing_labels", []),
    }


def cosine(a, b):
    import math

    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def main_run():
    client = httpx.Client(timeout=120.0)

    health = client.get(f"{AGENTS}/health").json()
    mode = "real-models" if health.get("remote_llm") else "local-fallback (deterministic)"
    print(f"runtime: {health.get('providers')} · mode: {mode} · embeddings: {health.get('embeddings')}")
    print(f"benchmarking {len(ISSUES)} issues (baseline vs 7-agent pipeline)…\n")

    # one shared voice profile (built once on connect, as in production)
    vp = client.post(f"{AGENTS}/agents/voice-profile",
                     json={"maintainer_login": voice_corpus["maintainer_login"], "comments": voice_corpus["comments"]}).json()["voice_profile"]

    repo = {"github_id": REPO["github_id"], "owner": REPO["owner"], "name": REPO["name"],
            "full_name": REPO["full_name"], "default_branch": REPO["default_branch"], "head_sha": REPO["head_sha"]}

    rows = []
    for idx, fx in enumerate(ISSUES, 1):
        issue = issue_payload(fx)
        expected = fx["expected_classification"]
        golden = fx.get("golden_response", "")

        # (a) baseline
        t0 = time.monotonic()
        b = client.post(f"{AGENTS}/baseline/run", json={"repo": repo, "issue": issue}).json()["output"]
        b_ms = int((time.monotonic() - t0) * 1000)

        # (b) seven-agent pipeline
        t0 = time.monotonic()
        p = client.post(f"{AGENTS}/pipeline/run-sync", json={
            "case_id": f"bench-{fx['github_issue_number']}", "repo": repo, "issue": issue,
            "voice_profile": vp, "flags": {"helmsman.use_long_context_analyzer": True, "helmsman.voice_self_check": True},
            "seed_corpus": CORPUS, "source_files": source_files,
        }).json()
        p_ms = int((time.monotonic() - t0) * 1000)

        b_class = b.get("category")
        p_class = p.get("classification")
        b_draft = b.get("draft_markdown", "")
        p_draft = p.get("draft_response", "")

        # response quality (judge)
        b_q = client.post(f"{AGENTS}/judge/quality", json={"issue": issue, "draft_markdown": b_draft}).json()["output"]["score"]
        p_q = client.post(f"{AGENTS}/judge/quality", json={"issue": issue, "draft_markdown": p_draft}).json()["output"]["score"]

        # voice similarity (only when a golden reply exists)
        b_v = p_v = None
        if golden.strip():
            if b_draft.strip():
                e = client.post(f"{AGENTS}/embed", json={"texts": [b_draft, golden]}).json()["embeddings"]
                b_v = round(cosine(e[0], e[1]), 4)
            if p_draft.strip():
                e = client.post(f"{AGENTS}/embed", json={"texts": [p_draft, golden]}).json()["embeddings"]
                p_v = round(cosine(e[0], e[1]), 4)

        rows.append({
            "number": fx["github_issue_number"], "expected": expected,
            "baseline_class": b_class, "pipeline_class": p_class,
            "baseline_correct": b_class == expected, "pipeline_correct": p_class == expected,
            "baseline_quality": b_q, "pipeline_quality": p_q,
            "baseline_voice": b_v, "pipeline_voice": p_v,
            "baseline_ms": b_ms, "pipeline_ms": p_ms,
        })
        mark = lambda ok: "✓" if ok else "✗"
        print(f"  [{idx:>2}/{len(ISSUES)}] #{fx['github_issue_number']:<4} {expected:<10} "
              f"baseline {mark(b_class == expected)} {b_class:<10} | pipeline {mark(p_class == expected)} {p_class}")

    client.close()

    def agg(key_correct, key_q, key_v, key_ms):
        acc = sum(1 for r in rows if r[key_correct]) / len(rows)
        q = statistics.mean(r[key_q] for r in rows)
        vs = [r[key_v] for r in rows if r[key_v] is not None]
        v = statistics.mean(vs) if vs else 0.0
        ms = statistics.mean(r[key_ms] for r in rows)
        return {"classification_accuracy": round(acc, 4), "avg_quality": round(q, 3),
                "avg_voice_sim": round(v, 4), "avg_ms": round(ms, 1)}

    baseline = agg("baseline_correct", "baseline_quality", "baseline_voice", "baseline_ms")
    pipeline = agg("pipeline_correct", "pipeline_quality", "pipeline_voice", "pipeline_ms")

    results = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "n_issues": len(ISSUES),
        "mode": mode,
        "runtime_providers": health.get("providers"),
        "metrics": {
            "classification_accuracy": {"baseline": baseline["classification_accuracy"], "pipeline": pipeline["classification_accuracy"]},
            "response_quality_1to5": {"baseline": baseline["avg_quality"], "pipeline": pipeline["avg_quality"]},
            "voice_similarity_cosine": {"baseline": baseline["avg_voice_sim"], "pipeline": pipeline["avg_voice_sim"]},
            "avg_ms_per_issue": {"baseline": baseline["avg_ms"], "pipeline": pipeline["avg_ms"]},
        },
        "deltas": {
            "classification_accuracy_pp": round((pipeline["classification_accuracy"] - baseline["classification_accuracy"]) * 100, 1),
            "quality_abs": round(pipeline["avg_quality"] - baseline["avg_quality"], 3),
            "voice_sim_abs": round(pipeline["avg_voice_sim"] - baseline["avg_voice_sim"], 4),
        },
        "per_issue": rows,
    }
    out = ROOT / "benchmarks/results.json"
    out.write_text(json.dumps(results, indent=2))

    print("\n── summary ──")
    print(f"  classification accuracy : baseline {baseline['classification_accuracy']*100:.0f}%  →  pipeline {pipeline['classification_accuracy']*100:.0f}%  ({results['deltas']['classification_accuracy_pp']:+} pp)")
    print(f"  response quality (1-5)  : baseline {baseline['avg_quality']:.2f}  →  pipeline {pipeline['avg_quality']:.2f}  ({results['deltas']['quality_abs']:+})")
    print(f"  voice similarity        : baseline {baseline['avg_voice_sim']:.3f}  →  pipeline {pipeline['avg_voice_sim']:.3f}  ({results['deltas']['voice_sim_abs']:+})")
    print(f"  avg time per issue      : baseline {baseline['avg_ms']:.0f}ms  →  pipeline {pipeline['avg_ms']:.0f}ms")
    print(f"\nwrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main_run()
