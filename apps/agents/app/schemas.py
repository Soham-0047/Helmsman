"""Pydantic v2 I/O schemas for every agent + the pipeline envelope.

These are the typed message contracts referenced in the README's "Multi-agent
message-passing flow". The TypeScript side (gateway/web) mirrors these shapes in
apps/gateway/src/types.ts.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

Classification = Literal["bug", "feature", "question", "duplicate", "spam", "needs_info"]
RecommendedAction = Literal[
    "respond_now", "respond_soon", "low_priority", "close_as_duplicate", "request_more_info"
]
ResponderAction = Literal[
    "post_comment", "request_more_info", "close_as_duplicate", "needs_maintainer_decision"
]
Tone = Literal["formal", "casual", "technical", "warm"]


# --------------------------- shared inputs ----------------------------------


class Issue(BaseModel):
    number: int
    title: str
    body: str = ""
    author: str = "unknown"
    author_is_contributor: bool = False
    reactions: int = 0
    age_hours: float = 0.0
    existing_labels: list[str] = Field(default_factory=list)


class Repo(BaseModel):
    github_id: int = 0
    owner: str
    name: str
    full_name: str
    default_branch: str = "main"
    head_sha: str = "HEAD"


# --------------------------- Agent 1: Classifier ----------------------------


class ClassifierOutput(BaseModel):
    category: Classification
    confidence: float = 0.0
    rationale: str = ""
    signals: list[str] = Field(default_factory=list)


# --------------------------- Agent 2: Context Retriever ---------------------


class RankedCandidate(BaseModel):
    issue_number: int
    relatedness: float
    reason: str = ""


class RetrieverOutput(BaseModel):
    ranked: list[RankedCandidate] = Field(default_factory=list)
    likely_duplicate_of: Optional[int] = None
    duplicate_confidence: float = 0.0
    top_cosine: float = 0.0  # highest raw cosine from pgvector, for the 0.92 gate


# --------------------------- Agent 3: Reproducer ----------------------------


class ReproEnvironment(BaseModel):
    runtime: str = "unknown"
    os: str = "unknown"
    package_version: str = "unknown"


class ReproConfidence(BaseModel):
    steps: float = 0.0
    environment: float = 0.0
    expected_actual: float = 0.0


class ReproducerOutput(BaseModel):
    has_reproduction: bool = False
    minimal_repro_steps: list[str] = Field(default_factory=list)
    environment: ReproEnvironment = Field(default_factory=ReproEnvironment)
    expected_behavior: str = ""
    actual_behavior: str = ""
    missing_information: list[str] = Field(default_factory=list)
    confidence: ReproConfidence = Field(default_factory=ReproConfidence)


# --------------------------- Agent 4: Source Analyzer -----------------------


class RelevantLine(BaseModel):
    file: str
    line_range: str
    explanation: str = ""


class SourceAnalyzerOutput(BaseModel):
    likely_files: list[str] = Field(default_factory=list)
    hypothesis: str = ""
    relevant_lines: list[RelevantLine] = Field(default_factory=list)
    confidence: float = 0.0
    suggested_fix_direction: str = ""


# --------------------------- Agent 5: Voice Profiler ------------------------


class VoiceProfile(BaseModel):
    avg_sentence_length: float = 18.0
    uses_code_blocks: bool = True
    hedging_phrases: list[str] = Field(default_factory=list)
    typical_opening_patterns: list[str] = Field(default_factory=list)
    tone: Tone = "technical"
    emoji_frequency: float = 0.0
    technical_depth: int = 3
    preferred_closing: str = ""
    example_phrases: list[str] = Field(default_factory=list)


# --------------------------- Agent 6: Responder -----------------------------


class ResponderOutput(BaseModel):
    draft_markdown: str = ""
    suggested_labels: list[str] = Field(default_factory=list)
    recommended_action: ResponderAction = "needs_maintainer_decision"
    voice_match_score: Optional[float] = None
    draft_quality: Literal["model", "fallback"] = "model"


# --------------------------- Agent 7: Prioritizer ---------------------------


class PrioritizerOutput(BaseModel):
    score: int = 5
    signals: list[str] = Field(default_factory=list)
    recommended_action: RecommendedAction = "respond_soon"


# --------------------------- Pipeline envelope ------------------------------


class PipelineRequest(BaseModel):
    case_id: str
    repo: Repo
    issue: Issue
    voice_profile: Optional[VoiceProfile] = None
    flags: dict[str, bool] = Field(default_factory=dict)
    # Optional in-memory RAG corpus to seed the vector store for this run
    # (demo mode passes the fixture set so duplicate detection works offline).
    seed_corpus: list[dict[str, Any]] = Field(default_factory=list)
    # Optional source files for the Source Analyzer in offline/demo mode.
    source_files: list[dict[str, str]] = Field(default_factory=list)


class AgentEvent(BaseModel):
    type: Literal[
        "stage", "agent_start", "agent_complete", "agent_skipped", "agent_error", "pipeline_complete"
    ]
    case_id: str
    agent: Optional[str] = None
    stage: Optional[str] = None
    status: Optional[str] = None
    output: Optional[dict[str, Any]] = None
    model: Optional[str] = None
    provider: Optional[str] = None
    latency_ms: Optional[int] = None
    error: Optional[str] = None
    message: Optional[str] = None


class PipelineResult(BaseModel):
    case_id: str
    classification: Optional[str] = None
    priority_score: Optional[int] = None
    draft_response: str = ""
    recommended_action: Optional[str] = None
    pipeline_outputs: dict[str, Any] = Field(default_factory=dict)
    total_ms: int = 0
    events: list[AgentEvent] = Field(default_factory=list)


# --------------------------- Benchmark schemas ------------------------------


class BaselineOutput(BaseModel):
    category: str = "needs_info"
    labels: list[str] = Field(default_factory=list)
    priority: int = 5
    draft_markdown: str = ""


class JudgeOutput(BaseModel):
    score: int = 1
    reasoning: str = ""
