"""Agent 1 — Classifier. Routes the issue into one of six categories.

Model: qwen3-8b (non-thinking). Prompt key: helmsman.classifier.v1.
Drives the pipeline:
  duplicate -> Context Retriever only
  spam      -> skip pipeline, flag for dismissal
  bug       -> full pipeline
  feature/question -> skip Reproducer + Source Analyzer
"""
from __future__ import annotations

import re

from ..config import settings
from ..metrics import metrics
from ..schemas import ClassifierOutput
from ..util import count_hits, SEVERITY_KEYWORDS, SPAM_KEYWORDS
from .base import AgentRun, run_llm_agent
from .context import PipelineCtx

PROMPT_KEY = "helmsman.classifier.v1"
MODEL = "qwen3-8b"
ESCALATION_MODEL = "qwen3-32b"  # reasoning model for low-confidence second opinions

_FEATURE = ("add ", "support ", "feature request", "would be great", "would be nice",
            "could we", "could you add", "please add", "enhancement", "feature:", "ability to")
_QUESTION_LEAD = ("how ", "how do", "how can", "what ", "where ", "does ", "do you",
                  "can i", "can you", "is there", "is it possible", "why ")
_DUP_SIGNAL = ("duplicate of", "dup of", "same as #", "same issue as")
_BUG_WORDS = ("crash", "segfault", "error", "leak", "broken", "break", "hang",
              "fails", "failing", "exception", "regression", "vulnerab", "incorrect",
              "wrong", "unexpected", "enoent", "stack trace", "off in", "one day off")


def _short_and_vague(title: str, body: str) -> bool:
    words = len((title + " " + body).split())
    vague = any(p in body.lower() for p in ("doesnt work", "doesn't work", "not working",
                                            "sometimes", "pls fix", "please fix", "help"))
    return words < 18 and (vague or len(body.split()) < 6)


def fallback(ctx: PipelineCtx) -> ClassifierOutput:
    title = ctx.issue.title or ""
    body = ctx.issue.body or ""
    blob = f"{title}\n{body}".lower()
    signals: list[str] = []

    spam_hits = count_hits(blob, SPAM_KEYWORDS)
    if len(spam_hits) >= 2:
        return ClassifierOutput(category="spam", confidence=0.7, rationale="Promotional/off-topic markers.", signals=spam_hits[:4])

    if _short_and_vague(title, body):
        return ClassifierOutput(category="needs_info", confidence=0.6,
                                rationale="Too little detail to act on.", signals=["vague", "no repro"])

    if re.search(r"#\d+", body) and any(s in blob for s in _DUP_SIGNAL):
        m = re.search(r"#(\d+)", body)
        return ClassifierOutput(category="duplicate", confidence=0.7,
                                rationale=f"Explicitly references #{m.group(1)}.", signals=["explicit reference"])

    sev = count_hits(blob, SEVERITY_KEYWORDS)
    if any(f in blob for f in _FEATURE) and not sev:
        signals.append("feature request phrasing")
        return ClassifierOutput(category="feature", confidence=0.62, rationale="Requests new functionality.", signals=signals)

    is_question = (any(blob.startswith(q) or q in blob[:40] for q in _QUESTION_LEAD) or title.strip().endswith("?"))
    if is_question and not any(w in blob for w in _BUG_WORDS):
        return ClassifierOutput(category="question", confidence=0.6, rationale="Usage/how-to question, no defect claimed.", signals=["interrogative"])

    # default: treat as a bug (most untyped OSS reports are)
    if sev:
        signals.extend(sev[:3])
    if any(w in blob for w in _BUG_WORDS):
        signals.append("defect language")
    return ClassifierOutput(category="bug", confidence=0.58 if signals else 0.5,
                            rationale="Describes broken or unexpected behavior.", signals=signals or ["defect language"])


async def run(ctx: PipelineCtx) -> AgentRun:
    variables = {
        "repo_full_name": ctx.repo.full_name,
        "issue_number": ctx.issue.number,
        "issue_title": ctx.issue.title,
        "issue_body": ctx.issue.body,
        "existing_labels": ", ".join(ctx.issue.existing_labels) or "(none)",
    }
    run = await run_llm_agent(
        prompt_key=PROMPT_KEY,
        model_slug=MODEL,
        variables=variables,
        output_cls=ClassifierOutput,
        fallback=lambda: fallback(ctx),
        max_tokens=400,
    )
    ctx.classification = run.output  # type: ignore[assignment]

    # Confidence-gated escalation: classification drives the whole pipeline, so a
    # low-confidence label is the most expensive place to be wrong. When the small
    # model is genuinely unsure, get a second opinion from the reasoning model
    # (thinking mode) and keep whichever is more confident. Fires only with a real
    # model present (offline the first call falls back and escalation is skipped).
    cls: ClassifierOutput = run.output  # type: ignore[assignment]
    if (
        not run.fell_back
        and ctx.flag("helmsman.classifier_escalation", True)
        and cls.confidence < settings.classifier_escalation_threshold
    ):
        metrics.incr("classifier.escalation")
        run2 = await run_llm_agent(
            prompt_key=PROMPT_KEY,
            model_slug=ESCALATION_MODEL,
            variables=variables,
            output_cls=ClassifierOutput,
            fallback=lambda: cls,
            thinking=True,
            max_tokens=500,
        )
        cand: ClassifierOutput = run2.output  # type: ignore[assignment]
        if not run2.fell_back and cand.confidence > cls.confidence:
            metrics.incr("classifier.escalation_changed")
            ctx.classification = cand
            return run2

    return run
