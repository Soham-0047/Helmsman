"""Environment configuration for the agent runtime.

Loads the repo-root .env (so the whole monorepo shares one file) and exposes a
typed settings object. Every external dependency is optional: when a key is
absent the runtime degrades to a local fallback (mock model, in-memory vector
store, local prompt registry) so `npm run demo` runs fully offline.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

try:
    from dotenv import load_dotenv

    # repo root is apps/agents/app/config.py -> parents[3]
    _root = Path(__file__).resolve().parents[3]
    load_dotenv(_root / ".env")
    load_dotenv(_root / "apps" / "agents" / ".env", override=False)
except Exception:  # dotenv is optional
    _root = Path(__file__).resolve().parents[3]


def _b(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


@dataclass
class Settings:
    root: Path = field(default_factory=lambda: _root)
    mode: str = field(default_factory=lambda: os.getenv("HELMSMAN_MODE", "demo"))
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "info"))
    port: int = field(default_factory=lambda: int(os.getenv("AGENTS_PORT", "8000")))

    # Admin Service
    admin_url: str = field(default_factory=lambda: os.getenv("ADMIN_URL", "http://localhost:4001"))
    admin_token: str = field(default_factory=lambda: os.getenv("ADMIN_SERVICE_TOKEN", "demo-service-token"))
    admin_local_fallback: bool = field(default_factory=lambda: _b("ADMIN_LOCAL_FALLBACK", True))

    # Database (pgvector)
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", ""))

    # Qwen / Model Studio
    qwen_api_key: str = field(default_factory=lambda: os.getenv("QWEN_API_KEY", ""))
    qwen_base_url: str = field(
        default_factory=lambda: os.getenv(
            "QWEN_BASE_URL", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
        )
    )
    model_small: str = field(default_factory=lambda: os.getenv("QWEN_MODEL_SMALL", "qwen3-8b"))
    model_reasoning: str = field(default_factory=lambda: os.getenv("QWEN_MODEL_REASONING", "qwen3-32b"))
    model_coder: str = field(default_factory=lambda: os.getenv("QWEN_MODEL_CODER", "qwen2.5-coder-7b"))
    model_longctx: str = field(default_factory=lambda: os.getenv("QWEN_MODEL_LONGCTX", "qwen3-long-context"))

    # Fallback chain
    openrouter_api_key: str = field(default_factory=lambda: os.getenv("OPENROUTER_API_KEY", ""))
    openrouter_base_url: str = field(
        default_factory=lambda: os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    )
    groq_api_key: str = field(default_factory=lambda: os.getenv("GROQ_API_KEY", ""))
    groq_base_url: str = field(
        default_factory=lambda: os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
    )
    ollama_base_url: str = field(default_factory=lambda: os.getenv("OLLAMA_BASE_URL", ""))
    allow_paid: bool = field(default_factory=lambda: _b("HELMSMAN_ALLOW_PAID", False))

    # Router resilience / efficiency
    llm_max_attempts: int = field(default_factory=lambda: int(os.getenv("HELMSMAN_LLM_MAX_ATTEMPTS", "3")))
    llm_max_concurrency: int = field(default_factory=lambda: int(os.getenv("HELMSMAN_LLM_MAX_CONCURRENCY", "8")))
    llm_backoff_base_ms: int = field(default_factory=lambda: int(os.getenv("HELMSMAN_LLM_BACKOFF_BASE_MS", "250")))
    llm_backoff_max_ms: int = field(default_factory=lambda: int(os.getenv("HELMSMAN_LLM_BACKOFF_MAX_MS", "8000")))
    embed_cache_size: int = field(default_factory=lambda: int(os.getenv("HELMSMAN_EMBED_CACHE_SIZE", "4096")))

    # Embeddings
    embeddings_api_url: str = field(default_factory=lambda: os.getenv("EMBEDDINGS_API_URL", ""))
    embeddings_api_key: str = field(default_factory=lambda: os.getenv("EMBEDDINGS_API_KEY", ""))
    embedding_model: str = field(default_factory=lambda: os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5"))
    embedding_dim: int = field(default_factory=lambda: int(os.getenv("EMBEDDING_DIM", "384")))

    internal_token: str = field(default_factory=lambda: os.getenv("INTERNAL_SERVICE_TOKEN", "helmsman-internal-token"))

    @property
    def registry_path(self) -> Path:
        return self.root / "prompts" / "registry.json"

    @property
    def flags_path(self) -> Path:
        return self.root / "config" / "flags.json"

    @property
    def has_any_remote_llm(self) -> bool:
        return bool(self.qwen_api_key or self.openrouter_api_key or self.groq_api_key or self.ollama_base_url)

    @property
    def dup_threshold(self) -> float:
        """Cosine gate above which the Context Retriever flags a likely duplicate.

        0.92 is calibrated for bge-small (near-duplicates score very high). The
        offline hashing embedder produces lower similarities for paraphrases, so
        when no real embeddings API is configured we use a calibrated 0.55 gate
        so the demo still demonstrates duplicate detection. Override with
        HELMSMAN_DUP_THRESHOLD.
        """
        raw = os.getenv("HELMSMAN_DUP_THRESHOLD")
        if raw:
            return float(raw)
        return 0.92 if self.embeddings_api_url else 0.55

    @property
    def using_local_embeddings(self) -> bool:
        return not self.embeddings_api_url

    # Offline-embedder duplicate gate: a true duplicate is a clear cosine
    # OUTLIER above its neighbors (the hashing embedder can't hit 0.92). With
    # bge-small the absolute dup_threshold gate is used instead.
    @property
    def dup_local_floor(self) -> float:
        # Precision-first: only flag a duplicate when one candidate is BOTH highly
        # similar in absolute terms AND a clear outlier above the rest. The hashing
        # embedder can't cleanly separate "duplicate" from "same component" on a
        # dense corpus, so we accept lower recall to avoid false positives (a
        # missed duplicate is just classified as its base type, like the baseline;
        # a false duplicate actively hurts). bge-small + the Qwen re-ranker lift
        # recall substantially in live mode.
        return float(os.getenv("HELMSMAN_DUP_LOCAL_FLOOR", "0.50"))

    @property
    def dup_local_gap(self) -> float:
        return float(os.getenv("HELMSMAN_DUP_LOCAL_GAP", "0.18"))

    # Hybrid retrieval (offline / in-memory store): fuse dense cosine with sparse
    # TF-IDF lexical similarity. The dup gate then runs on the fused score with a
    # precision-first floor (calibrated so paraphrase duplicates pass while the
    # top non-duplicate stays below it — no false positives on the fixture set).
    @property
    def hybrid_vector_weight(self) -> float:
        return float(os.getenv("HELMSMAN_HYBRID_VECTOR_WEIGHT", "0.5"))

    @property
    def classifier_escalation_threshold(self) -> float:
        """Below this classifier confidence, get a reasoning-model second opinion."""
        return float(os.getenv("HELMSMAN_CLASSIFIER_ESCALATION_THRESHOLD", "0.6"))

    @property
    def dup_hybrid_floor(self) -> float:
        return float(os.getenv("HELMSMAN_DUP_HYBRID_FLOOR", "0.40"))

    @property
    def dup_hybrid_gap(self) -> float:
        return float(os.getenv("HELMSMAN_DUP_HYBRID_GAP", "0.05"))


settings = Settings()
