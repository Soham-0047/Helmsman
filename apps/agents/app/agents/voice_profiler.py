"""Agent 5 — Voice Profiler. Builds a reusable style fingerprint.

Model: qwen3-32b (thinking). Prompt key: helmsman.voice_profiler.v1.
Fires once on repo connection and is refreshed after each approved response.
Not a per-issue pipeline stage.

The offline fallback computes the fingerprint EMPIRICALLY from the comment
samples (sentence length, code-block usage, emoji rate, hedging, openings,
closings) — so even with no model it produces a real, useful profile.
"""
from __future__ import annotations

import re
from collections import Counter

from ..schemas import VoiceProfile
from .base import AgentRun, run_llm_agent

PROMPT_KEY = "helmsman.voice_profiler.v1"
MODEL = "qwen3-32b"

_EMOJI = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F0FF←-⇿✀-➿]"
)
_HEDGES = ["i think", "i'd", "i would", "maybe", "probably", "likely", "i suspect",
           "i believe", "should", "might", "let me", "i'll", "perhaps", "looks like"]
_WARM = ["thanks", "thank you", "appreciate", "welcome", "kind words", "nice", "great", "glad", "happy to"]


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


def compute_fallback(login: str, comments: list[str]) -> VoiceProfile:
    if not comments:
        return VoiceProfile(preferred_closing="Thanks!", example_phrases=[])

    all_text = "\n".join(comments).lower()
    sent_lengths = []
    openings: Counter = Counter()
    closing_candidates: list[str] = []
    emoji_total = 0
    code_blocks = 0

    for c in comments:
        sents = _sentences(c)
        for s in sents:
            sent_lengths.append(len(s.split()))
        if sents:
            openings[" ".join(sents[0].split()[:3]).rstrip(".,!")] += 1
            # only multi-sentence comments contribute a real "closing"; keep short ones
            if len(sents) >= 2 and len(sents[-1].split()) <= 12:
                closing_candidates.append(sents[-1].strip())
        emoji_total += len(_EMOJI.findall(c))
        if "```" in c or re.search(r"`[^`]+`", c):
            code_blocks += 1

    avg_len = round(sum(sent_lengths) / max(1, len(sent_lengths)), 1)
    hedges = [h for h in _HEDGES if h in all_text][:6]
    warm_hits = sum(all_text.count(w) for w in _WARM)
    tone = "warm" if warm_hits >= max(3, len(comments) // 2) else "technical"
    depth = 3
    if code_blocks >= len(comments) // 2:
        depth = 4
    if any(t in all_text for t in ("microtask", "event loop", "encoding", "utf-8", "teardown", "listener")):
        depth = max(depth, 4)

    example_phrases = []
    for c in comments[:6]:
        s = _sentences(c)
        if s:
            example_phrases.append(s[0][:80])

    return VoiceProfile(
        avg_sentence_length=avg_len,
        uses_code_blocks=code_blocks > 0,
        hedging_phrases=hedges,
        typical_opening_patterns=[o for o, _ in openings.most_common(3)],
        tone=tone,  # type: ignore[arg-type]
        emoji_frequency=round(emoji_total / len(comments), 2),
        technical_depth=depth,
        preferred_closing=_pick_closing(closing_candidates),
        example_phrases=example_phrases[:5],
    )


def _pick_closing(cands: list[str]) -> str:
    if not cands:
        return "Thanks!"
    warm = [c for c in cands if any(w in c.lower() for w in ("thank", "appreciate", "welcome", "glad", "cheers"))]
    pool = warm or cands
    return min(pool, key=len)


async def run(login: str, comments: list[str]) -> AgentRun:
    block = "\n---\n".join(c.strip() for c in comments[:100]) if comments else "(no comments available)"
    variables = {"maintainer_login": login, "comments_block": block}
    return await run_llm_agent(
        prompt_key=PROMPT_KEY,
        model_slug=MODEL,
        variables=variables,
        output_cls=VoiceProfile,
        fallback=lambda: compute_fallback(login, comments),
        thinking=True,
        max_tokens=900,
    )
