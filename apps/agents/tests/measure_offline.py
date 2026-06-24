"""Offline, in-process replica of the benchmark's classification metric.

Runs the full seven-agent pipeline (deterministic fallbacks, no network) over
the same 50 fixtures the Agent-Society benchmark uses, and reports:
  - overall classification accuracy (pipeline_class == expected_classification)
  - duplicate recall (how many expected duplicates were caught by the retriever)
  - duplicate false positives (non-duplicates wrongly flagged as duplicate)

This is the lever for the retrieval/dup-gate work: it measures the same number
the benchmark reports, but in-process so it's fast and needs no running server.

Run: apps/agents/.venv/bin/python -m tests.measure_offline   (from apps/agents)
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402
from app.pipeline import run_pipeline_collected  # noqa: E402
from app.schemas import Issue, PipelineRequest, Repo  # noqa: E402

main = json.loads((ROOT / "db/seed/fixtures.json").read_text())
extra = json.loads((ROOT / "benchmarks/fixtures/extra.json").read_text())
source_files = json.loads((ROOT / "db/seed/source_files.json").read_text())["files"]

REPO = main["repo"]
ISSUES = main["issues"] + extra["issues"]
CORPUS = [{"github_issue_number": i["github_issue_number"], "content": f"{i['title']}\n{i['body']}"} for i in ISSUES]


async def main_run() -> None:
    repo = Repo(
        owner=REPO.get("owner", "helmsman-demo"),
        name=REPO.get("name", "fastlane-parser"),
        full_name=REPO.get("full_name", "helmsman-demo/fastlane-parser"),
        head_sha=REPO.get("head_sha", "HEAD"),
    )
    correct = 0
    dup_total = dup_caught = dup_false_pos = 0
    misses: list[str] = []
    for fx in ISSUES:
        issue = Issue(
            number=fx["github_issue_number"],
            title=fx["title"],
            body=fx.get("body", ""),
            author=fx.get("author", "user"),
            author_is_contributor=fx.get("author_is_contributor", False),
            reactions=fx.get("reactions", 0),
            age_hours=fx.get("age_hours", 0.0),
            existing_labels=fx.get("existing_labels", []),
        )
        req = PipelineRequest(
            case_id=f"m-{issue.number}",
            repo=repo,
            issue=issue,
            seed_corpus=CORPUS,
            source_files=source_files,
        )
        res = await run_pipeline_collected(req)
        expected = fx["expected_classification"]
        got = res.classification
        if got == expected:
            correct += 1
        else:
            misses.append(f"#{issue.number} expected={expected} got={got}")
        if expected == "duplicate":
            dup_total += 1
            if got == "duplicate":
                dup_caught += 1
        elif got == "duplicate":
            dup_false_pos += 1

    n = len(ISSUES)
    print(f"classification accuracy: {correct}/{n} = {100*correct/n:.1f}%")
    print(f"duplicate recall:        {dup_caught}/{dup_total} caught")
    print(f"duplicate false-positives: {dup_false_pos}")
    print(f"remote LLM present: {settings.has_any_remote_llm} (want False for offline run)")
    print("misses:")
    for m in misses:
        print("  ", m)


if __name__ == "__main__":
    asyncio.run(main_run())
