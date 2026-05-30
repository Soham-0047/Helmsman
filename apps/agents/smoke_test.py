"""Offline smoke test for the agent runtime. Run:  .venv/bin/python smoke_test.py

Validates the seven-agent pipeline end-to-end with NO API keys (local fallbacks):
  - fix-001 (segfault bug): full pipeline, source analysis picks src/lexer.ts
  - fix-005 (paraphrased crash): Context Retriever flags it as a duplicate of #101
"""
import asyncio
import json
from pathlib import Path

from app.pipeline import run_pipeline_collected
from app.schemas import Issue, PipelineRequest, Repo, VoiceProfile
from app.agents.voice_profiler import compute_fallback

ROOT = Path(__file__).resolve().parents[2]
FIX = json.loads((ROOT / "db/seed/fixtures.json").read_text())
SRC = json.loads((ROOT / "db/seed/source_files.json").read_text())
VOICE = json.loads((ROOT / "db/seed/voice_corpus.json").read_text())


def issue_from(fx) -> Issue:
    return Issue(
        number=fx["github_issue_number"], title=fx["title"], body=fx["body"],
        author=fx["author"], author_is_contributor=fx.get("author_is_contributor", False),
        reactions=fx.get("reactions", 0), age_hours=fx.get("age_hours", 0),
        existing_labels=fx.get("existing_labels", []),
    )


def corpus():
    return [{"github_issue_number": i["github_issue_number"], "content": f"{i['title']}\n{i['body']}"}
            for i in FIX["issues"]]


async def run_one(fixture_id: str):
    fx = next(i for i in FIX["issues"] if i["id"] == fixture_id)
    repo = Repo(**FIX["repo"])
    vp = compute_fallback(VOICE["maintainer_login"], VOICE["comments"])
    req = PipelineRequest(
        case_id=f"smoke-{fixture_id}", repo=repo, issue=issue_from(fx),
        voice_profile=vp,
        flags={"helmsman.use_long_context_analyzer": True, "helmsman.voice_self_check": True},
        seed_corpus=corpus(), source_files=SRC["files"],
    )
    res = await run_pipeline_collected(req)
    print(f"\n{'='*70}\n{fixture_id} — {fx['title']}\n{'='*70}")
    print(f"classification : {res.classification}  (expected {fx['expected_classification']})")
    print(f"priority       : {res.priority_score}/10")
    print(f"action         : {res.recommended_action}")
    rt = res.pipeline_outputs.get("retriever", {})
    print(f"duplicate_of   : {rt.get('likely_duplicate_of')}  (top_cosine={rt.get('top_cosine')})")
    src = res.pipeline_outputs.get("source_analyzer", {})
    if src:
        print(f"likely_files   : {src.get('likely_files')}")
    print(f"total_ms       : {res.total_ms}")
    print(f"--- DRAFT ---\n{res.draft_response}\n")
    return res, fx


async def main():
    print("Voice fingerprint:")
    vp = compute_fallback(VOICE["maintainer_login"], VOICE["comments"])
    print(json.dumps(vp.model_dump(), indent=2)[:600])

    ok = True
    res1, fx1 = await run_one("fix-001")
    if res1.classification != "bug":
        print("!! fix-001 expected bug"); ok = False
    src_files = res1.pipeline_outputs.get("source_analyzer", {}).get("likely_files", [])
    if "src/lexer.ts" not in src_files:
        print(f"!! fix-001 expected src/lexer.ts in likely_files, got {src_files}"); ok = False

    res5, fx5 = await run_one("fix-005")
    dup = res5.pipeline_outputs.get("retriever", {}).get("likely_duplicate_of")
    if dup != 101:
        print(f"!! fix-005 expected duplicate_of 101, got {dup}"); ok = False
    if res5.classification != "duplicate":
        print(f"!! fix-005 expected effective classification duplicate, got {res5.classification}"); ok = False

    # fix-017 is a CONCEPTUAL paraphrase (different words, same root cause). The
    # offline hashing embedder scores it below the precision-first duplicate gate,
    # so it's a known offline miss (caught in live mode with bge-small + re-ranker).
    res17, fx17 = await run_one("fix-017")
    dup17 = res17.pipeline_outputs.get("retriever", {}).get("likely_duplicate_of")
    if dup17 == 102:
        print("(bonus) fix-017 also flagged as duplicate of #102")
    else:
        print(f"(note) fix-017 not flagged offline (conceptual paraphrase, cosine below gate) — expected with the hashing embedder")

    print("\n" + ("CORE SMOKE CHECKS PASSED ✅" if ok else "SOME CHECKS FAILED ❌"))


if __name__ == "__main__":
    asyncio.run(main())
