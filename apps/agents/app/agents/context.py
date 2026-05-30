"""Shared mutable context threaded through the pipeline."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from ..schemas import (
    ClassifierOutput,
    Issue,
    PrioritizerOutput,
    Repo,
    ReproducerOutput,
    ResponderOutput,
    RetrieverOutput,
    SourceAnalyzerOutput,
    VoiceProfile,
)
from ..vectorstore import Candidate


@dataclass
class PipelineCtx:
    case_id: str
    repo_id: str
    repo: Repo
    issue: Issue
    voice_profile: VoiceProfile
    flags: dict[str, bool] = field(default_factory=dict)

    # extra agent inputs assembled along the way
    candidates: list[Candidate] = field(default_factory=list)
    code_blocks: list[str] = field(default_factory=list)
    source_files: list[dict] = field(default_factory=list)  # [{path, content}]

    # agent outputs (populated as the pipeline advances)
    classification: Optional[ClassifierOutput] = None
    retriever: Optional[RetrieverOutput] = None
    reproducer: Optional[ReproducerOutput] = None
    source: Optional[SourceAnalyzerOutput] = None
    prioritizer: Optional[PrioritizerOutput] = None
    responder: Optional[ResponderOutput] = None

    def flag(self, key: str, default: bool = False) -> bool:
        return bool(self.flags.get(key, default))
