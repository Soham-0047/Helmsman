-- ============================================================================
-- Helmsman — Postgres + pgvector schema (Supabase free tier)
-- Single source of truth: case state, audit log, voice profiles, action
-- history, vector embeddings. Apply with:  npm run db:schema
-- (or auto-applied by docker-compose on first boot via /docker-entrypoint-initdb.d)
--
-- NOTE vs. the original spec DDL: `repos` referenced `maintainers(id)` but was
-- declared first — a forward reference that fails on a clean database. Tables
-- are reordered here so foreign keys resolve. pgvector extension + ivfflat
-- `lists` tuning + updated_at triggers + uipath_case_id linkage added.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- maintainers: humans connected via GitHub OAuth (created FIRST — repos FKs it)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maintainers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id            BIGINT UNIQUE NOT NULL,
  username             TEXT NOT NULL,
  email                TEXT,
  oauth_token_encrypted TEXT NOT NULL,        -- AES-256-GCM, see gateway/src/lib/crypto.ts
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- repos: connected GitHub repositories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS repos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id        BIGINT UNIQUE NOT NULL,
  owner            TEXT NOT NULL,
  name             TEXT NOT NULL,
  installation_id  BIGINT,
  webhook_secret   TEXT NOT NULL,             -- per-repo HMAC secret for /webhooks/github
  connected_at     TIMESTAMPTZ DEFAULT NOW(),
  voice_profile    JSONB,                      -- written by Agent 5 (Voice Profiler)
  stats            JSONB DEFAULT '{}'::jsonb,  -- {open_cases, approved, avg_pipeline_ms, ...}
  maintainer_id    UUID REFERENCES maintainers(id)
);

CREATE INDEX IF NOT EXISTS idx_repos_maintainer ON repos (maintainer_id);

-- ---------------------------------------------------------------------------
-- cases: one per GitHub issue — the Maestro Case mirror in our own DB
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cases (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id              UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  github_issue_number  INTEGER NOT NULL,
  uipath_case_id       TEXT,                   -- Maestro Case instance id (or sim id)
  current_stage        TEXT NOT NULL DEFAULT 'Intake',
  classification       TEXT,
  priority_score       INTEGER,
  pipeline_outputs     JSONB DEFAULT '{}'::jsonb,  -- {classifier:{...}, retriever:{...}, ...}
  draft_response       TEXT,
  approved_action      JSONB,                  -- {type, params} the RPA executor consumes
  embedding            vector(384),            -- BAAI/bge-small-en-v1.5
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  approved_at          TIMESTAMPTZ,
  executed_at          TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  UNIQUE (repo_id, github_issue_number)
);

CREATE INDEX IF NOT EXISTS idx_cases_repo_stage ON cases (repo_id, current_stage);
-- ivfflat needs rows to build lists well; lists=100 is fine up to ~100k rows.
CREATE INDEX IF NOT EXISTS idx_cases_embedding
  ON cases USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ---------------------------------------------------------------------------
-- audit_log: append-only, every state transition / model call / human decision
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGSERIAL PRIMARY KEY,
  case_id      UUID REFERENCES cases(id) ON DELETE CASCADE,
  actor_type   TEXT NOT NULL CHECK (actor_type IN ('agent', 'human', 'system')),
  actor_name   TEXT NOT NULL,                  -- 'classifier' | '@maintainer' | 'uipath' | ...
  action       TEXT NOT NULL,                  -- 'stage_advance' | 'model_call' | 'approve' | ...
  input        JSONB,
  output       JSONB,
  occurred_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_case ON audit_log (case_id, occurred_at);

-- ---------------------------------------------------------------------------
-- issue_embeddings: RAG corpus per repo (historical issues for duplicate detect)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS issue_embeddings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id              UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  github_issue_number  INTEGER NOT NULL,
  content              TEXT NOT NULL,
  embedding            vector(384) NOT NULL,
  indexed_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (repo_id, github_issue_number)
);

CREATE INDEX IF NOT EXISTS idx_embeddings_repo ON issue_embeddings (repo_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_vector
  ON issue_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ---------------------------------------------------------------------------
-- feedback_events: the CLOSED LEARNING LOOP. One row per maintainer decision
-- (approve / edit / reject). This is the highest-signal data in the system —
-- the (AI draft -> human final) pair that the forward pipeline used to discard.
-- It feeds three return paths: (1) online voice-profile refinement, (2) the
-- compounding RAG corpus, (3) the exportable SFT/DPO fine-tuning dataset
-- (GET /api/repos/:id/dataset). See apps/gateway/src/service.ts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback_events (
  id                  BIGSERIAL PRIMARY KEY,
  case_id             UUID REFERENCES cases(id) ON DELETE CASCADE,
  repo_id             UUID REFERENCES repos(id) ON DELETE CASCADE,
  verdict             TEXT NOT NULL CHECK (verdict IN ('approved', 'edited', 'rejected')),
  issue_number        INTEGER,
  issue_title         TEXT,
  issue_body          TEXT,
  classification      TEXT,
  ai_draft            TEXT,                 -- the ORIGINAL model output (snapshot)
  final_draft         TEXT,                 -- what the human actually shipped
  edit_ratio          REAL,                 -- normalized Levenshtein 0 (identical) .. 1 (rewritten)
  recommended_action  TEXT,                 -- what the pipeline recommended
  approved_action     TEXT,                 -- the action the human approved (type)
  action_overridden   BOOLEAN DEFAULT FALSE,-- did the human pick a different action?
  reject_reason       TEXT,                 -- structured enum + optional free text
  voice_match         REAL,                 -- responder's self-reported voice score, if any
  voice_rating        INTEGER,              -- optional human 1-5 rating of the draft's voice
  occurred_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_repo ON feedback_events (repo_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_feedback_case ON feedback_events (case_id);

-- ---------------------------------------------------------------------------
-- idempotency: dedupe webhook deliveries ({delivery_id}:{event_type}).
-- Backed by Redis in live mode; this table is the durable fallback.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  idempotency_key  TEXT PRIMARY KEY,           -- "{delivery_id}:{event_type}"
  received_at      TIMESTAMPTZ DEFAULT NOW(),
  case_id          UUID REFERENCES cases(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- updated_at trigger for cases
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cases_updated_at ON cases;
CREATE TRIGGER trg_cases_updated_at
  BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper: cosine-similarity duplicate search used by Agent 2 (Context Retriever)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_issue_embeddings(
  p_repo_id UUID,
  p_query   vector(384),
  p_limit   INTEGER DEFAULT 5
)
RETURNS TABLE (github_issue_number INTEGER, content TEXT, similarity FLOAT) AS $$
  SELECT e.github_issue_number,
         e.content,
         1 - (e.embedding <=> p_query) AS similarity
  FROM issue_embeddings e
  WHERE e.repo_id = p_repo_id
  ORDER BY e.embedding <=> p_query
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;
