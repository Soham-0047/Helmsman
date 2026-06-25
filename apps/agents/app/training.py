"""Custom-training dataset builder — the export end of the closed learning loop.

The gateway accumulates one `feedback_events` row per maintainer decision
(approve / edit / reject), each carrying the issue, the AI's original draft, and
what the maintainer actually shipped. This module turns that raw behavioral log
into standard, fine-tune-ready corpora — with ZERO extra labeling effort, because
the maintainer's edit *is* the label:

  * **SFT** (supervised fine-tuning), chat format: teach a model to answer issues
    in this maintainer's voice. One example per shipped reply.
        {"messages": [{"role": "system", ...}, {"role": "user", ...},
                      {"role": "assistant", "content": <what the maintainer sent>}]}

  * **DPO / preference pairs**: teach a model what the maintainer *prefers*. Every
    edited draft is a free preference pair — the shipped text is `chosen`, the
    AI's original is `rejected`.
        {"prompt": <issue>, "chosen": <final>, "rejected": <ai draft>}

Pure functions, no I/O, no framework — just data shaping, so it is trivially
unit-tested (tests/test_robustness.py) and identical offline and live. Actual
fine-tuning is an out-of-band job (DashScope / any provider); Helmsman's job is
to hand you a clean corpus, not to run the trainer.
"""
from __future__ import annotations

import json
from typing import Any

# Verdicts that represent a reply the maintainer actually shipped.
_SHIPPED = {"approved", "edited"}
# Below this edit ratio an "edited" draft is effectively the AI's — too close to
# be a meaningful preference signal (e.g. a one-word tweak or markdown reflow).
DPO_MIN_EDIT_RATIO = 0.05


def _voice_lines(voice: dict[str, Any]) -> str:
    """Render a voice fingerprint into compact, instruction-style bullet lines."""
    if not voice:
        return "- (no voice fingerprint available; write clearly and concisely)"
    parts: list[str] = []
    tone = voice.get("tone")
    if tone:
        parts.append(f"- tone: {tone}")
    avg = voice.get("avg_sentence_length")
    if avg:
        parts.append(f"- average sentence length: ~{avg} words")
    depth = voice.get("technical_depth")
    if depth:
        parts.append(f"- technical depth: {depth}/5")
    if "uses_code_blocks" in voice:
        parts.append(f"- uses code blocks: {'yes' if voice.get('uses_code_blocks') else 'no'}")
    ef = voice.get("emoji_frequency")
    if ef:
        parts.append(f"- emoji frequency: ~{ef} per reply")
    openings = voice.get("typical_opening_patterns") or []
    if openings:
        parts.append(f"- typical openings: {', '.join(map(str, openings[:3]))}")
    closing = voice.get("preferred_closing")
    if closing:
        parts.append(f"- preferred closing: {closing}")
    hedges = voice.get("hedging_phrases") or []
    if hedges:
        parts.append(f"- characteristic hedges: {', '.join(map(str, hedges[:5]))}")
    return "\n".join(parts) if parts else "- (sparse voice fingerprint)"


def _system_prompt(repo_full_name: str, login: str, voice: dict[str, Any]) -> str:
    repo = repo_full_name or "this repository"
    who = login or "the maintainer"
    return (
        f"You are @{who}, a maintainer of the open-source project {repo}. "
        "Reply to the GitHub issue below the way you personally would — match your own "
        "voice exactly. Be honest: if information is missing, ask for it; never invent a "
        "fix you are not sure of, and never promise a timeline.\n\n"
        "Your voice fingerprint:\n" + _voice_lines(voice)
    )


def _user_prompt(ev: dict[str, Any], repo_full_name: str) -> str:
    num = ev.get("issue_number")
    title = (ev.get("issue_title") or "").strip()
    body = (ev.get("issue_body") or "").strip()
    cls = ev.get("classification") or "issue"
    head = f"Issue #{num}" if num is not None else "Issue"
    repo = f" in {repo_full_name}" if repo_full_name else ""
    out = f"{head} [{cls}]{repo}: {title}".rstrip()
    if body:
        out += f"\n\n{body}"
    return out


def build_sft(
    events: list[dict[str, Any]],
    repo_full_name: str = "",
    login: str = "maintainer",
    voice: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """One chat example per shipped reply (approved or edited, non-empty final)."""
    voice = voice or {}
    system = _system_prompt(repo_full_name, login, voice)
    out: list[dict[str, Any]] = []
    for ev in events:
        if ev.get("verdict") not in _SHIPPED:
            continue
        final = (ev.get("final_draft") or "").strip()
        if not final:
            continue
        out.append(
            {
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": _user_prompt(ev, repo_full_name)},
                    {"role": "assistant", "content": final},
                ]
            }
        )
    return out


def build_dpo(
    events: list[dict[str, Any]],
    repo_full_name: str = "",
    login: str = "maintainer",
    voice: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Preference pairs: the maintainer's edit is the label.

    chosen = what they shipped, rejected = the AI's original draft. Only emitted
    when the two genuinely differ (edit ratio above a floor) so trivial tweaks
    and markdown reflows don't pollute the preference signal.
    """
    voice = voice or {}
    system = _system_prompt(repo_full_name, login, voice)
    out: list[dict[str, Any]] = []
    for ev in events:
        ai = (ev.get("ai_draft") or "").strip()
        final = (ev.get("final_draft") or "").strip()
        if not ai or not final or ai == final:
            continue
        ratio = ev.get("edit_ratio")
        if isinstance(ratio, (int, float)) and ratio < DPO_MIN_EDIT_RATIO:
            continue
        out.append(
            {
                "system": system,
                "prompt": _user_prompt(ev, repo_full_name),
                "chosen": final,
                "rejected": ai,
            }
        )
    return out


def dataset_stats(events: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate signal for the Learning view: counts, edit-rate, ship rate."""
    total = len(events)
    approved = sum(1 for e in events if e.get("verdict") == "approved")
    edited = sum(1 for e in events if e.get("verdict") == "edited")
    rejected = sum(1 for e in events if e.get("verdict") == "rejected")
    ratios = [
        e["edit_ratio"]
        for e in events
        if isinstance(e.get("edit_ratio"), (int, float))
    ]
    shipped = approved + edited
    return {
        "total": total,
        "approved": approved,
        "edited": edited,
        "rejected": rejected,
        # share of shipped replies the maintainer had to edit (should fall as we learn)
        "edit_rate": round(edited / shipped, 4) if shipped else 0.0,
        # share of drafts shippable without rejection
        "acceptance_rate": round(shipped / total, 4) if total else 0.0,
        "avg_edit_ratio": round(sum(ratios) / len(ratios), 4) if ratios else 0.0,
    }


def to_jsonl(rows: list[dict[str, Any]]) -> str:
    """Serialize rows to newline-delimited JSON (the standard fine-tune format)."""
    return "\n".join(json.dumps(r, ensure_ascii=False) for r in rows)


def build_dataset(
    events: list[dict[str, Any]],
    repo_full_name: str = "",
    login: str = "maintainer",
    voice: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build both corpora + stats in one pass. Returns ready-to-download JSONL."""
    sft = build_sft(events, repo_full_name, login, voice)
    dpo = build_dpo(events, repo_full_name, login, voice)
    return {
        "sft_jsonl": to_jsonl(sft),
        "dpo_jsonl": to_jsonl(dpo),
        "counts": {"sft": len(sft), "dpo": len(dpo)},
        "stats": dataset_stats(events),
    }
