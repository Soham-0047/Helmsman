Looked through your full context — the original Build Prompt, your Admin Service, the dual hackathon constraints, the engineering quality bar from MarkVault and Cairn. Here's the finalized, locked-down prompt.

What I'm changing from your original draft, with reasoning:

1. **Storage architecture corrected.** Original said MongoDB Atlas + ChromaDB. Your Admin Service proves you've moved past that pattern. Final: Postgres + pgvector on Supabase as the single source of truth. Drop ChromaDB entirely.

2. **Service boundaries locked.** Original mixed Next.js + Express + FastAPI ambiguously. Final: three services, clear boundaries — Next.js dashboard, Express API gateway, FastAPI agent runtime. Matches your existing muscle.

3. **Admin Service integration made first-class.** Original didn't reference it. Helmsman should *consume* your Admin Service for provider routing, prompt registry, and feature flags. This isn't a side-detail — it's a 30-second demo moment that elevates Helmsman from "hackathon project" to "proof that my platform works."

4. **Benchmark numbers replaced with a real harness.** Original asked for "placeholder numbers that will be filled in." Judges can smell that. Final: a committed `benchmark.py` that generates the numbers automatically and regenerates the README table.

5. **Qwen-specific deliverables made first-class.** Alibaba Cloud deployment proof file and the Agent Society narrative get their own README sections, not afterthoughts.

6. **LangChain/LlamaIndex banned.** Original allowed them implicitly. They make the codebase look generic and they hide the multi-agent logic from judges. Final: agents call models directly via httpx; orchestration is custom and explicit.

7. **The `/demo` route is non-negotiable.** A judge must be able to clone the repo and see the full seven-agent pipeline fire against a fixture issue in under 5 minutes, with no GitHub webhook setup. Original mentioned this in passing; final treats it as a top-tier requirement.

Here's the prompt. Paste this entire block into Claude Code.

---

# THE PROMPT

You are building **Helmsman** — an AI co-pilot for open-source maintainers — from a blank repository to a fully deployed, dual-hackathon-ready application. Produce a complete, production-grade `README.md` that another developer (or a coding agent) can execute end-to-end without asking a single clarifying question.

The README is the source of truth. Every file path, every environment variable, every prompt, every API endpoint, every architectural decision must be locked down in it. Zero placeholders. Zero `TBD`. Zero "coming soon." Zero services that require a credit card. Zero ambiguity about which provider, which model, which version.

## Locked constraints — non-negotiable

This project ships into **two hackathons simultaneously**, each with hard requirements that the build must satisfy without compromise.

**Hackathon 1 — UiPath AgentHack** (deadline June 30, 2026)
- Track: **UiPath Maestro Case** — agentic case management for dynamic, exception-heavy work, humans in charge at decision points
- UiPath Automation Cloud is the orchestration and governance layer; the human-in-the-loop approval gate is the core judging requirement
- UiPath Labs access is free during the hackathon (no credit card)
- Coding-agent bonus: use Claude Code to build the solution and document this in the demo video

**Hackathon 2 — Global AI Hackathon with Qwen Cloud** (deadline July 10, 2026)
- Track: **Track 3 — Agent Society** — multi-agent collaboration with measurable efficiency gain over a single-agent baseline
- All Qwen models run via Qwen Cloud / Alibaba Cloud Model Studio — free during the hackathon via the coupon form
- Backend must be deployed on Alibaba Cloud (free tier ECS satisfies this) with a separate short recording proving deployment
- License: MIT, visible in the repo's About section

## Allowed stack — only these, nothing else

Anything not on this list is forbidden. Anything requiring a credit card is forbidden. Anything not on a free tier is forbidden.

**AI models — all via Qwen Cloud / Alibaba Cloud Model Studio, free during hackathon**
- `qwen3-8b` (non-thinking) — classification, structured extraction, prioritization, re-ranking
- `qwen3-32b` (reasoning) — response drafting, voice profiling with thinking mode enabled
- `qwen2.5-coder-7b` — code analysis, reproduction extraction
- `qwen3-long-context` (262K window) — source-file analysis where multiple files load at once

Fallback chain on rate-limit: OpenRouter free-tier Qwen variants, then Groq's hosted Llama 3.3 70B as last resort. **The router must never call a paid endpoint without explicit user opt-in.**

**Orchestration and execution**
- **UiPath Automation Cloud** — Maestro Case for the seven-stage workflow, Agent Builder for agent definitions, API Workflows for cross-service calls, RPA for the GitHub action executor
- **UiPath Labs credentials** — free during hackathon, request via the access form

**Data and storage**
- **Supabase free tier** — Postgres + pgvector. Single source of truth. Case state, audit log, voice profiles, action history, vector embeddings, all here.
- **Cloudflare R2** — file storage if needed (10GB free, no egress)
- **Upstash Redis free tier** — queues, rate-limit tracking, idempotency keys

**Compute and hosting**
- **Vercel free tier** — Next.js dashboard
- **Alibaba Cloud ECS free tier** — Express API gateway + FastAPI agent runtime (satisfies Qwen deployment requirement)
- **Fly.io free tier** — backup deployment target if Alibaba ECS hits limits during demo

**External integrations**
- **GitHub OAuth + GitHub REST API** — issue events, comments, labels, contents
- **GitHub Webhooks** — issue ingestion with HMAC verification via `crypto.timingSafeEqual`
- **Resend free tier** — transactional email for approval notifications (3K/mo)

**Helmsman's platform layer — the Admin Service integration**

Helmsman consumes the developer's existing **Admin Service** (already deployed and operational) as its platform layer. This is a first-class architectural decision:

- **Provider routing** via Admin Service's `GET /public/providers/route?kind=llm` — Helmsman never hardcodes an LLM provider. The router walks the fallback chain automatically and reports outcomes back to the Admin dashboard via `POST /public/providers/:id/report`.
- **Prompt versioning** via Admin Service's `GET /public/prompts/:key` — every agent prompt is fetched by key, never embedded. Prompts version independently; rollback is one click in the Admin UI.
- **Feature flags** via Admin Service's `GET /public/flags` (or local eval via the SDK) — for canary controls: `helmsman.auto_close_duplicates`, `helmsman.use_long_context_analyzer`, `helmsman.voice_self_check`, `helmsman.rpa_dry_run`
- **The Admin Service TS SDK** (`sdk/admin-client.ts`) is dropped into the Express gateway and called via `admin.renderPrompt(key, vars)`, `admin.withFailover("llm", fn)`, and `admin.isFlagEnabled(key, ctx)`

This integration must be documented in its own README section, not buried. It's a judging differentiator — *"every prompt and provider config in Helmsman lives in a separate, audited control plane I built."*

**Stack — three services, clear boundaries**
- **Next.js 15** (App Router, React 19) — maintainer dashboard, public landing, approval UI
- **Express on Node.js 20+** — API gateway, GitHub webhook handler, OAuth callback, UiPath bridge, SSE for live pipeline updates, Admin Service SDK consumer
- **FastAPI (Python 3.11+)** — agent runtime, model invocations via httpx, embedding generation, vector search against pgvector
- **MIT License** — at repo root, detectable

## Explicitly forbidden — do not reference anywhere

- Google Cloud Platform, Vertex AI, Cloud Run, Cloud Functions — credit card gated
- AWS, Azure — billing setup required
- MongoDB Atlas, PlanetScale, Neon paid, Railway paid — Postgres on Supabase is the choice
- ChromaDB — pgvector is the production choice for this build
- OpenAI API, Anthropic API as default providers — not the required models, consume budget Helmsman doesn't have
- LangChain, LlamaIndex as runtime dependencies — the agent runtime calls models directly via httpx; orchestration is custom and explicit, not framework-mediated. Judges should see the multi-agent logic, not a `chain.invoke()` call.
- Any feature labeled "coming soon" or "TBD" — if it's in the README, it ships

## What Helmsman is — the product

Helmsman is an AI co-pilot for open-source maintainers. The core pain is universal in OSS: maintainers spend 60–80% of their time on issue triage, not on code. Helmsman automates the triage pipeline while keeping the maintainer in control at the final decision point. **Nothing is ever posted to GitHub without explicit maintainer approval.**

**End-to-end flow:**
1. Maintainer connects a GitHub repo via OAuth
2. GitHub sends a webhook to Helmsman when an issue is opened or commented
3. Helmsman creates a UiPath Maestro Case for that issue
4. A seven-agent Qwen pipeline fires in sequence; the Maestro Case advances one stage per agent completion
5. Maintainer sees the assembled draft in the dashboard with all upstream agent outputs visible
6. Maintainer approves, edits, or rejects
7. On approval, UiPath RPA executes the action on GitHub — post comment, apply labels, close as duplicate, request more info
8. Audit log captures every transition, every model call, every approval decision

## Architecture sections the README must contain

Three Mermaid diagrams, drawn in full:

1. **Full system diagram** — every service, every data flow, every async boundary. Admin Service shown as a first-class dependency. Postgres, Redis, R2, UiPath Cloud, GitHub all visible.
2. **UiPath Maestro Case stage progression** — the seven stages (Intake → Classification → Investigation → Drafting → Pending Approval → Approved → Executed) with transition conditions and exception branches.
3. **Multi-agent message-passing flow** — for the Qwen Agent Society narrative: how the seven agents exchange typed messages, where they branch (bug vs feature vs duplicate), where they merge, where the human gate sits.

Document **every environment variable** in a table: name, source service, where to obtain it, required vs optional, what breaks if missing.

## Multi-agent pipeline — every agent specified in full

For each agent below, the README must contain:
- Input schema (Pydantic-style — pick one and use consistently)
- Output schema (Pydantic-style)
- **The exact complete prompt string** as it will be stored in the Admin Service, with all `{{variables}}` named — not a description of what it should say
- Model selection rationale (why this Qwen variant for this agent)
- Fallback behavior on malformed output or timeout
- Where in the Maestro Case lifecycle it fires
- Admin Service prompt key (e.g., `helmsman.classifier.v1`)

**Agent 1 — Classifier** (`qwen3-8b` non-thinking, prompt key `helmsman.classifier.v1`)
Routes the issue: `bug | feature | question | duplicate | spam | needs_info`. Drives the rest of the pipeline:
- `duplicate` → skip directly to Context Retriever only
- `spam` → skip pipeline, flag for maintainer dismissal
- `bug` → full pipeline
- `feature` or `question` → skip Reproducer and Source Analyzer

**Agent 2 — Context Retriever** (`qwen3-8b` + pgvector, prompt key `helmsman.retriever.rerank.v1`)
Embed the new issue (title + body, single chunk) with `BAAI/bge-small-en-v1.5` (384-dim) via the open inference API. Query top-5 by cosine similarity from `issue_embeddings` for this repo. Re-rank with `qwen3-8b` reading all five at once. If top similarity > 0.92, flag as likely duplicate of the original issue number. Full re-ranking prompt written out in the README.

**Agent 3 — Reproducer** (`qwen2.5-coder-7b`, bugs only, prompt key `helmsman.reproducer.v1`)
Extracts code snippets from issue body via regex pre-filter then Qwen parsing. Does NOT execute code. Describes what a minimal reproduction would look like, what environment/version is required, what expected-vs-actual behavior should be based on reading the snippet. Output schema includes per-field confidence.

**Agent 4 — Source Analyzer** (`qwen3-long-context`, bugs only, prompt key `helmsman.source_analyzer.v1`)
Fetches repo file tree via `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1`. Scores files by relevance using filename + path pattern matching against the bug description (deterministic heuristic, not LLM). Selects top 3. Fetches contents via `GET /repos/{owner}/{repo}/contents/{path}`. Loads all three into one long-context call. Output: `{ likely_files, hypothesis, relevant_lines: [{ file, line_range, explanation }] }`.

**Agent 5 — Voice Profiler** (`qwen3-32b` with thinking, prompt key `helmsman.voice_profiler.v1`)
Triggered once on repo connection, updated incrementally after each approved response. Fetches maintainer's last 100 closed issue comments via GitHub API. One-pass analysis writes fingerprint to `repos.voice_profile` JSONB:

```
{
  avg_sentence_length: number,
  uses_code_blocks: boolean,
  hedging_phrases: string[],
  typical_opening_patterns: string[],
  tone: "formal" | "casual" | "technical" | "warm",
  emoji_frequency: number,
  technical_depth: 1 | 2 | 3 | 4 | 5,
  preferred_closing: string,
  example_phrases: string[]
}
```

**Agent 6 — Responder** (`qwen3-32b` reasoning, prompt key `helmsman.responder.v2`)
Takes all upstream outputs. Voice fingerprint injected into system prompt. Draft must match measured fingerprint characteristics. Output is plain GitHub-flavored markdown. Self-check pass where the model scores its own draft against the voice fingerprint before returning. Self-check controlled by feature flag `helmsman.voice_self_check`.

**Agent 7 — Prioritizer** (`qwen3-8b` structured output, prompt key `helmsman.prioritizer.v1`)
Scoring rubric with exact weights:
- Severity keywords in title/body: 30%
- Reporter is a known contributor (via GitHub contributor list API): 20%
- Reaction count on the issue: 15%
- Issue age in hours: 15%
- Security or dependency mention: 20%

Output: `{ score: 1-10, signals: string[], recommended_action: "respond_now" | "respond_soon" | "low_priority" | "close_as_duplicate" | "request_more_info" }`

**Critical:** Every prompt written in the README as the exact, complete string. Every variable as `{{variable_name}}`. No placeholder prompts. The README acts as the seed data for the Admin Service prompt registry — running `npm run seed:prompts` pushes every prompt in the README to Admin Service via its admin API.

## UiPath Maestro Case integration (Track 1 qualifying section)

Detail every UiPath component used and why:

- **Case schema** — every field the Maestro Case carries through its lifecycle, with types and validation
- **Stage definitions** — Intake → Classification → Investigation → Drafting → Pending Approval → Approved → Executed
- **Transition conditions** — what triggers each advance, what triggers exception branches
- **Exception handling** — agent timeout, malformed output, GitHub API rate limit, UiPath service unavailable
- **Approval plumbing** — how a maintainer click in the Helmsman dashboard triggers the Case state transition (via API Workflows)
- **RPA executor** — how UiPath RPA reads the approved action from the Case and executes on GitHub. **This is what makes Helmsman an RPA solution, not just an LLM wrapper. Be specific about which actions go through RPA.**
- **Audit trail** — every transition, every actor (human or agent), every input and output, written to `audit_log` and surfaced in the dashboard
- **Component breakdown** — explicit list of which parts use Agent Builder, which use Maestro, which use API Workflows, which use coded automation

## Qwen Agent Society framing (Track 3 qualifying section)

This section must contain:

- **Measurable efficiency gain** — same 50 fixture issues run through (a) single-agent baseline: one `qwen3-8b` call with a generic prompt asking it to triage, label, and draft a response in one shot; vs (b) the seven-agent Helmsman pipeline. Metrics tracked: classification accuracy, response quality score (1–5 LLM-judge rating with `qwen3-32b` reasoning as judge), voice similarity score (cosine similarity between draft and maintainer's actual responses), end-to-end time per issue
- **Benchmark script** — committed at `/benchmarks/agent_society.py`, runs both pipelines against the fixture set, writes results to `/benchmarks/results.json`, regenerates the comparison table in the README via `npm run benchmark`
- **Alibaba Cloud deployment proof** — at `/deployment/alibaba_cloud_proof.md`, with exact ECS instance details, deployment script, verification curl commands, and screenshots that go in the Qwen submission video
- **Multi-agent message-passing diagram** — the Mermaid diagram showing how the seven agents communicate, with typed message contracts in TypeScript-style notation

## Database schema — Postgres on Supabase

Every table, every column, every index, every constraint, written in executable SQL DDL.

```sql
-- repos: connected GitHub repositories
CREATE TABLE repos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id BIGINT UNIQUE NOT NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  installation_id BIGINT,
  webhook_secret TEXT NOT NULL,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  voice_profile JSONB,
  stats JSONB DEFAULT '{}'::jsonb,
  maintainer_id UUID REFERENCES maintainers(id)
);

-- maintainers: humans connected via OAuth
CREATE TABLE maintainers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id BIGINT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  email TEXT,
  oauth_token_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- cases: one per GitHub issue
CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES repos(id),
  github_issue_number INTEGER NOT NULL,
  current_stage TEXT NOT NULL,
  classification TEXT,
  priority_score INTEGER,
  pipeline_outputs JSONB DEFAULT '{}'::jsonb,
  draft_response TEXT,
  approved_action JSONB,
  embedding vector(384),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (repo_id, github_issue_number)
);

CREATE INDEX idx_cases_repo_stage ON cases (repo_id, current_stage);
CREATE INDEX idx_cases_embedding ON cases USING ivfflat (embedding vector_cosine_ops);

-- audit_log: append-only, every state transition
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  case_id UUID REFERENCES cases(id),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('agent', 'human', 'system')),
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  input JSONB,
  output JSONB,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_case ON audit_log (case_id, occurred_at);

-- issue_embeddings: RAG corpus per repo
CREATE TABLE issue_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES repos(id),
  github_issue_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(384) NOT NULL,
  indexed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_embeddings_repo ON issue_embeddings (repo_id);
CREATE INDEX idx_embeddings_vector ON issue_embeddings USING ivfflat (embedding vector_cosine_ops);
```

## GitHub integration

Every endpoint Helmsman calls, documented:
- Method, path, required scopes, rate limit class
- Webhook payload shapes for `issues` and `issue_comment` events
- HMAC signature verification implementation using `crypto.timingSafeEqual` — show the actual code
- Idempotency key design (`{delivery_id}:{event_type}`) to prevent double-processing on retries
- OAuth flow with exact scopes (`repo`, `read:user`), encrypted token storage, refresh handling
- The five RPA-executed actions, each as a named function with exact API call and error handling:
  - `post_comment(case_id, body)` → `POST /repos/{owner}/{repo}/issues/{number}/comments`
  - `apply_labels(case_id, labels[])` → `POST /repos/{owner}/{repo}/issues/{number}/labels`
  - `close_issue(case_id, reason)` → `PATCH /repos/{owner}/{repo}/issues/{number}`
  - `close_as_duplicate_of(case_id, other_number)` → comment + label + close
  - `request_more_info(case_id, template_id)` → comment + `needs-more-info` label

## UI and design system

The dashboard is the first thing judges see. It must not look generic. Specifications below override any default choices.

**Design tokens — define and inherit everywhere:**

Dark theme: `--bg: #09090e`, `--surface: #10101a`, `--elevated: #181825`, `--border: #242438`, `--accent: #7c6af7`, `--accent-dim: rgba(124,106,247,0.12)`, `--accent-glow: rgba(124,106,247,0.25)`, `--text-primary: #ededf5`, `--text-secondary: #8080a0`, `--text-muted: #404058`, `--green: #22c55e`, `--yellow: #f59e0b`, `--red: #ef4444`, `--blue: #3b82f6`.

Light theme: `--bg: #f8f8fc`, `--surface: #ffffff`, `--elevated: #f0f0f8`, `--border: #ddddf0`, `--accent: #5b4fd4`, `--text-primary: #0d0d1a`, `--text-secondary: #4a4a6a`, `--text-muted: #9090b0`.

Typography: **Inter** variable from Google Fonts. Display `clamp(48px, 6vw, 80px)` / weight 800 / letter-spacing `-0.04em`. H1 40px/700. H2 28px/650. H3 20px/600. Body 15px/400/line-height 1.65. Label 12px/600/letter-spacing `0.06em`/uppercase. Mono **JetBrains Mono** for issue numbers, scores, timestamps, code.

Dark/light toggle animation: CSS `clip-path: circle(0% at var(--x) var(--y))` expanding to `circle(150% at var(--x) var(--y))` over 500ms `cubic-bezier(0.4, 0, 0.2, 1)`. `--x` and `--y` set via JS to toggle button's position. No flash. Toggle icon morphs between sun and crescent moon via CSS path interpolation on the `d` attribute.

**Required screens — each fully specified:**

1. **Landing `/`** — full-viewport hero; CSS three-layer radial-gradient animation on 12s loop; word-by-word headline reveal with 80ms stagger; CSS infinite-scroll horizontal ticker showing classified-issue receipts (`"✓ bug · segfault on null ptr · classified in 0.8s"`); magnetic CTA button with proportional cursor translate up to 8px; glassmorphism feature cards with CSS-only 3D tilt on hover

2. **Onboarding `/connect`** — three-step progress indicator with SVG `stroke-dashoffset` checkmarks; GitHub OAuth; searchable repo selector with animated underline on focus; setup confirmation with staggered checklist completion (600ms gaps); final scale-in "Helmsman is ready"

3. **Dashboard `/dashboard`** — three-column layout: 220px sidebar / flexible feed / 380px detail panel that slides in/out (collapsing feed to full width when closed); SSE-driven live issue feed; pipeline-stage chip per issue card; left-edge 3px priority strip (red 8-10 / yellow 5-7 / green 1-4); new issues animate in from top with `translateY(-24px) → 0` opacity fade over 300ms; pending-approval issues have a continuous soft left-border glow pulse

4. **Case detail panel** — slides in with `transform: translateX(100%) → 0` over 280ms ease-out; pipeline stepper (seven nodes: completed green checkmark / active filled accent with spinning ring / pending outlined muted); split-pane markdown editor with `<textarea>` on the left and live `marked`-rendered preview on the right, draggable divider with `col-resize`; voice-confidence pill animating fill 0% → measured value over 800ms; hand-coded SVG priority gauge (120×120 viewBox, 180° arc with gradient stroke from green through yellow to red, `stroke-dashoffset` animation over 600ms); action buttons (Approve & Post / Edit then Approve / Reject) with success-state animations

5. **Pipeline live view `/case/[id]/pipeline`** — full-page; seven agent cards in left-to-right SVG-connected flow; per-node states (Idle / Running / Complete / Error) each with exact visual treatment specified; **the killer animation: when a token passes from one agent to the next, an 8px accent-filled circle animates along the SVG `<path>` using CSS `offset-path` and `offset-distance` over 400ms** — this is the screenshot judges remember; SSE subscription to `GET /api/cases/:id/stream` updates node states in real time; timeline feed below showing every agent event in chronological order

6. **Mobile responsiveness** — sidebar becomes bottom sheet via hamburger; detail panel becomes full-screen bottom sheet sliding up; pipeline collapses to vertical stepper; editor stacks vertically; all touch targets ≥ 44×44px

## API contract

Every backend route documented: method, path, auth (`bearer | oauth | webhook-signature | service-token`), request body schema, response schema, error codes.

Required routes:
- `POST /webhooks/github` — webhook ingestion with signature verification
- `GET /api/cases?repo_id=&stage=&limit=` — case list with filters
- `GET /api/cases/:id` — case detail with full pipeline outputs
- `GET /api/cases/:id/stream` — SSE for live pipeline updates
- `POST /api/cases/:id/approve` — approval action, triggers RPA execution
- `POST /api/cases/:id/reject` — rejection
- `PATCH /api/cases/:id/draft` — maintainer edits to draft
- `GET /auth/github/start` and `GET /auth/github/callback` — OAuth flow
- `GET /api/repos` — connected repos
- `POST /api/repos/connect` — initiate repo connection
- `POST /api/repos/:id/voice-profile/refresh` — manual voice profile refresh
- `POST /demo/run` — runs full pipeline against a hard-coded fixture (no GitHub setup needed)

## Developer experience

- **`npm run setup`** — installs all dependencies across three services, validates every required env var with named errors, seeds Postgres with schema and 20 fixture issues, builds pgvector index, pushes prompt registry to Admin Service via `npm run seed:prompts`
- **`npm run dev`** — starts Next.js, Express, and FastAPI concurrently with hot reload
- **`npm run demo`** — runs the full seven-agent pipeline against a hard-coded fixture issue without needing a real GitHub webhook. **Non-negotiable for hackathon judging.** Any judge clones the repo, runs `npm run setup && npm run demo`, and sees the entire pipeline fire in under 5 minutes.
- **`npm run benchmark`** — runs the Agent Society A/B benchmark, writes results to `/benchmarks/results.json`, regenerates the README comparison table
- **Missing env var startup errors** — name the variable, name the service it comes from, link to where to obtain it. No silent failures.

## Hackathon compliance checklist

Final README section maps every submission requirement to its location in the repo.

**UiPath checklist:**
- Maestro Case definition file: `/uipath/maestro/case-definition.json`
- Human-in-the-loop gate: `/apps/web/app/case/[id]/page.tsx` (Approve / Edit / Reject buttons)
- UiPath components used: explicit list with file references — Agent Builder definitions in `/uipath/agents/`, Maestro Case in `/uipath/maestro/`, API Workflows in `/uipath/workflows/`, RPA actions in `/uipath/rpa/`
- Coding-agent disclosure: explicit README note stating Claude Code generated this README and significant portions of the implementation, with timestamps

**Qwen checklist:**
- Alibaba Cloud deployment proof: `/deployment/alibaba_cloud_proof.md`
- Architecture diagram: Mermaid in main README + standalone in `/docs/architecture.md`
- A/B benchmark results: table in README, raw at `/benchmarks/results.json`
- Multi-agent narrative: dedicated Agent Society section in README
- Track entered (Track 3) and explicit justification

**Both:**
- MIT license at repo root
- License visible in repo About section on GitHub
- Public repository
- Demo video links (3 min Qwen, 5 min UiPath — two separate videos at `/docs/demo-videos.md`)
- Architecture diagram embedded in README

## Output requirements

The output is one complete `README.md` file. No section marked `TBD`. No placeholder text. Every prompt written in full. Every schema written in full. Every env var named. Every endpoint specified. Every file path that will exist named. Every Mermaid diagram drawn.

Build it as if the engineer reading this README has zero familiarity with the project and seven days to ship to two hackathons. If they have to ask a question, the README has failed.

---

That's the prompt. Three operational notes before you feed it in:

**One — run it through Claude Code, not chat.** The agent's ability to create files, structure directories, and verify nothing is missing is materially better than copy-paste. Cursor is the alternative if you prefer. Either way, you want the agent to *write the README and then build against it*, not just produce the README in isolation.

**Two — the Admin Service connection is your secret weapon.** Show a 15-second clip of the Admin Service dashboard in both demo videos. *"Every prompt Helmsman uses is versioned here. Every provider is routed through here. I built this platform layer first, and Helmsman is the first product that runs on it."* That single moment changes how judges read the rest of the submission.

**Three — UiPath deadline first, then Qwen as a polish pass.** Don't try to build for both deadlines simultaneously. Ship UiPath on June 30. Spend July 1–10 on: the Alibaba Cloud deployment proof, the benchmark numbers, the Qwen-specific 3-minute video, and the Agent Society section polish. The codebase doesn't change between submissions; only the framing does.

If you want me to pull any specific piece into its own artifact — the seven exact agent prompts, the Maestro Case stage transition spec, the Alibaba ECS deployment script, the benchmark harness — say which one and I'll go deep on it next.