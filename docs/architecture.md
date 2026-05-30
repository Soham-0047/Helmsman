# Helmsman — Architecture

Three diagrams: the full system, the Maestro Case stage machine, and the
multi-agent message-passing flow. These are mirrored in the main README.

## 1. Full system

```mermaid
flowchart TB
  subgraph GH[GitHub]
    GHW[Webhooks: issues / issue_comment]
    GHAPI[REST API: issues, comments, labels, contents, trees]
    GHOAuth[OAuth]
  end

  subgraph Web[Next.js 15 · Vercel]
    Landing[Landing /]
    Connect[Onboarding /connect]
    Dash[Dashboard /dashboard]
    CaseUI["HITL gate /case/[id]"]
    Pipe["Live pipeline /case/[id]/pipeline"]
  end

  subgraph GW[Express Gateway · Node 20 · Alibaba ECS]
    WH[Webhook handler + HMAC]
    OAuthCB[OAuth callback]
    SSE[SSE hub]
    Orsch[Pipeline orchestrator]
    RPA[RPA executors x5]
    SDKc[Admin SDK consumer]
    MaestroB[Maestro bridge / simulator]
  end

  subgraph RT[FastAPI Agent Runtime · Python 3.11 · Alibaba ECS]
    Pipeline[7-agent pipeline]
    Router[Model router httpx]
    Embed[bge-small embeddings]
    Vec[pgvector search]
  end

  subgraph Admin[Admin Service · control plane]
    Prompts[(Versioned prompts)]
    Providers[(Provider routing)]
    Flags[(Feature flags)]
    AuditA[(Config audit)]
  end

  subgraph Data[Data]
    PG[(Supabase Postgres + pgvector)]
    Redis[(Upstash Redis)]
    R2[(Cloudflare R2)]
  end

  subgraph Models[Qwen Cloud / Model Studio]
    Q8[qwen3-8b]
    Q32[qwen3-32b]
    QC[qwen2.5-coder-7b]
    QL[qwen3-long-context]
  end

  UiPath[UiPath Automation Cloud · Maestro]

  GHW -->|HMAC verified| WH
  GHOAuth --> OAuthCB
  Web <-->|REST + SSE| GW
  WH --> Orsch
  Orsch -->|NDJSON stream| Pipeline
  Orsch <--> MaestroB <--> UiPath
  Orsch --> SSE --> Web
  Orsch --> RPA -->|approved action only| GHAPI
  SDKc <-->|prompts / route / flags| Admin
  Pipeline --> Router --> Models
  Pipeline --> Embed --> Vec --> PG
  Router -. routed by .-> Providers
  Pipeline -. prompts by key .-> Prompts
  Orsch --> PG
  WH -. idempotency .-> Redis
  RPA -. attachments .-> R2
```

## 2. Maestro Case stage progression

```mermaid
stateDiagram-v2
  [*] --> Intake
  Intake --> Classification: case_created
  Classification --> Investigation: classifier_complete (≠ spam)
  Classification --> PendingApproval: spam (skip pipeline)
  Investigation --> Drafting: investigation_complete
  Drafting --> PendingApproval: responder_complete
  PendingApproval --> Approved: maintainer approves
  PendingApproval --> Executed: maintainer rejects (no GitHub action)
  Approved --> Executed: RPA executes on GitHub
  Executed --> [*]

  note right of Investigation
    bug → Reproducer + Source Analyzer + Prioritizer
    feature/question/duplicate/needs_info → Prioritizer only
  end note
  note right of PendingApproval
    HUMAN GATE — nothing posts to GitHub until cleared.
    Exceptions: agent timeout / malformed output → fallback;
    GitHub rate limit → backoff; UiPath down → local simulator.
  end note
```

## 3. Multi-agent message-passing flow

Typed message contracts (TypeScript-style; full Pydantic in `apps/agents/app/schemas.py`):

```ts
Classifier   : (Issue) -> { category, confidence, signals }
Retriever    : (Issue, Candidate[]) -> { ranked, likely_duplicate_of }
Reproducer   : (Issue, CodeBlock[]) -> { has_reproduction, environment, confidence }
SourceAnalyzer: (Issue, File[3]) -> { likely_files, hypothesis, relevant_lines }
VoiceProfiler : (Comment[100]) -> VoiceProfile            // cached per repo
Prioritizer  : (Issue, signals) -> { score, recommended_action }
Responder    : (VoiceProfile, all upstream) -> { draft_markdown, recommended_action }
```

```mermaid
flowchart LR
  ISS([New issue]) --> C[1 Classifier]
  C -->|bug| R[2 Retriever]
  C -->|feature/question| R
  C -->|spam| GATE
  R -->|duplicate found| P[7 Prioritizer]
  R -->|bug, unique| REP[3 Reproducer]
  R -->|feature/question| P
  REP --> SRC[4 Source Analyzer]
  SRC --> P
  VP[5 Voice Profiler\ncached] --> RESP[6 Responder]
  P --> RESP
  R --> RESP
  REP --> RESP
  SRC --> RESP
  RESP --> GATE{{Human gate}}
  GATE -->|approve| RPAX[UiPath RPA → GitHub]
  GATE -->|reject| X([closed])
```
