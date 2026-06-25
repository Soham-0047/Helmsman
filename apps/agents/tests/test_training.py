"""Unit tests for the closed learning loop's training-data engine.

Covers the dataset builders (SFT / DPO / stats) and the compounding RAG corpus
(a resolved issue, once indexed, becomes searchable for future duplicates).

Run: apps/agents/.venv/bin/python -m pytest apps/agents/tests/test_training.py -q
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import training  # noqa: E402
from app.vectorstore import InMemoryStore  # noqa: E402


def _events():
    return [
        # shipped verbatim — SFT yes, DPO no (no preference signal)
        {
            "verdict": "approved",
            "issue_number": 1,
            "issue_title": "Crash on empty file",
            "issue_body": "It throws.",
            "classification": "bug",
            "ai_draft": "Thanks, can you share a repro?",
            "final_draft": "Thanks, can you share a repro?",
            "edit_ratio": 0.0,
        },
        # edited — SFT yes, DPO yes (chosen=final, rejected=ai)
        {
            "verdict": "edited",
            "issue_number": 2,
            "issue_title": "Feature: dark mode",
            "issue_body": "Please add it.",
            "classification": "feature",
            "ai_draft": "We will add this soon.",
            "final_draft": "Good idea — opened #99 to track it. No timeline yet.",
            "edit_ratio": 0.8,
        },
        # rejected — neither (no shipped text, no chosen for a pair)
        {
            "verdict": "rejected",
            "issue_number": 3,
            "issue_title": "spam",
            "issue_body": "buy now",
            "classification": "spam",
            "ai_draft": "Closing as spam.",
            "final_draft": None,
            "edit_ratio": None,
            "reject_reason": "tone too formal",
        },
        # edited but trivially (below DPO floor) — SFT yes, DPO no
        {
            "verdict": "edited",
            "issue_number": 4,
            "issue_title": "typo",
            "issue_body": "docs typo",
            "classification": "question",
            "ai_draft": "Fixed, thanks!",
            "final_draft": "Fixed, thanks.",
            "edit_ratio": 0.02,
        },
    ]


def test_build_sft_only_shipped():
    voice = {"tone": "warm", "avg_sentence_length": 14, "technical_depth": 3}
    sft = training.build_sft(_events(), "acme/widgets", "octocat", voice)
    # approved(1) + edited(2) + edited-trivial(4) = 3 shipped; rejected excluded
    assert len(sft) == 3
    ex = sft[1]
    roles = [m["role"] for m in ex["messages"]]
    assert roles == ["system", "user", "assistant"]
    assert "octocat" in ex["messages"][0]["content"]
    assert "warm" in ex["messages"][0]["content"]  # voice fingerprint embedded
    assert ex["messages"][2]["content"] == "Good idea — opened #99 to track it. No timeline yet."


def test_build_dpo_pairs_from_edits():
    dpo = training.build_dpo(_events(), "acme/widgets", "octocat", {})
    # only the meaningfully-edited row (#2) qualifies
    assert len(dpo) == 1
    pair = dpo[0]
    assert pair["chosen"] == "Good idea — opened #99 to track it. No timeline yet."
    assert pair["rejected"] == "We will add this soon."
    assert pair["chosen"] != pair["rejected"]


def test_dataset_stats():
    s = training.dataset_stats(_events())
    assert s["total"] == 4
    assert s["approved"] == 1
    assert s["edited"] == 2
    assert s["rejected"] == 1
    # shipped = 3, edited = 2 -> edit_rate = 2/3
    assert abs(s["edit_rate"] - round(2 / 3, 4)) < 1e-9
    assert abs(s["acceptance_rate"] - round(3 / 4, 4)) < 1e-9


def test_build_dataset_emits_valid_jsonl():
    out = training.build_dataset(_events(), "acme/widgets", "octocat", {"tone": "casual"})
    assert out["counts"] == {"sft": 3, "dpo": 1}
    # every line must be parseable JSON
    for line in out["sft_jsonl"].splitlines():
        obj = json.loads(line)
        assert "messages" in obj
    for line in out["dpo_jsonl"].splitlines():
        obj = json.loads(line)
        assert obj["chosen"] and obj["rejected"]


def test_empty_feedback_is_safe():
    out = training.build_dataset([], "acme/widgets", "octocat", {})
    assert out["counts"] == {"sft": 0, "dpo": 0}
    assert out["sft_jsonl"] == ""
    assert out["stats"]["total"] == 0


def test_resolved_case_becomes_searchable():
    """The compounding-corpus guarantee: index a resolved issue, then a
    paraphrased re-file must retrieve it. This is what makes dedup improve."""
    store = InMemoryStore()
    repo = "12345"  # str(github_id), matching the pipeline's key
    # seed corpus has nothing about websockets
    asyncio.run(store.index_many(repo, [
        {"github_issue_number": 10, "content": "Docs typo in the README install section"},
    ]))
    found_before = asyncio.run(store.search(repo, "WebSocket disconnects after 30 seconds idle", k=3))
    assert all(c.issue_number != 77 for c in found_before)

    # maintainer resolves a new websocket issue -> we feed it back
    asyncio.run(store.index_many(repo, [
        {"github_issue_number": 77, "content": "WebSocket connection drops after 30s of inactivity"},
    ]))
    found_after = asyncio.run(store.search(repo, "WebSocket connection drops when idle", k=3))
    assert found_after, "corpus should return candidates"
    assert found_after[0].issue_number == 77, "the resolved issue should now be the top match"


def test_index_many_is_idempotent():
    store = InMemoryStore()
    repo = "r1"
    item = [{"github_issue_number": 5, "content": "same issue text"}]
    a = asyncio.run(store.index_many(repo, item))
    b = asyncio.run(store.index_many(repo, item))  # re-resolving the same case
    assert a == 1
    assert b == 0  # no duplicate row
