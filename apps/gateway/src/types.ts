// TS mirror of the case/agent contracts (Python side: apps/agents/app/schemas.py).

export const STAGES = [
  "Intake",
  "Classification",
  "Investigation",
  "Drafting",
  "Pending Approval",
  "Approved",
  "Executed",
] as const;
export type Stage = (typeof STAGES)[number];

export const PIPELINE_NODES = [
  "classifier",
  "retriever",
  "reproducer",
  "source_analyzer",
  "prioritizer",
  "voice_profiler",
  "responder",
] as const;
export type PipelineNode = (typeof PIPELINE_NODES)[number];

export interface RepoRef {
  id: string;
  github_id: number;
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
  head_sha: string;
  voice_profile?: Record<string, unknown> | null;
}

export interface IssueRef {
  number: number;
  title: string;
  body: string;
  author: string;
  author_is_contributor: boolean;
  reactions: number;
  age_hours: number;
  existing_labels: string[];
}

export interface CaseRecord {
  id: string;
  repo_id: string;
  repo_full_name: string;
  github_issue_number: number;
  uipath_case_id: string | null;
  current_stage: Stage;
  classification: string | null;
  priority_score: number | null;
  pipeline_outputs: Record<string, unknown>;
  draft_response: string;
  approved_action: ApprovedAction | null;
  recommended_action: string | null;
  issue: IssueRef;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  executed_at: string | null;
  completed_at: string | null;
}

export interface ApprovedAction {
  type:
    | "post_comment"
    | "apply_labels"
    | "close_issue"
    | "close_as_duplicate_of"
    | "request_more_info";
  params: Record<string, unknown>;
}

export interface AgentEvent {
  type:
    | "stage"
    | "agent_start"
    | "agent_complete"
    | "agent_skipped"
    | "agent_error"
    | "pipeline_complete";
  case_id: string;
  agent?: PipelineNode;
  stage?: Stage;
  status?: string;
  output?: Record<string, unknown>;
  model?: string;
  provider?: string;
  latency_ms?: number;
  error?: string;
  message?: string;
}

export interface AuditEntry {
  id: number;
  case_id: string;
  actor_type: "agent" | "human" | "system";
  actor_name: string;
  action: string;
  input?: unknown;
  output?: unknown;
  occurred_at: string;
}

// ---- Closed learning loop ---------------------------------------------------
// One row per maintainer decision. The (ai_draft -> final_draft) pair is the
// training signal the forward pipeline used to discard. See db/schema.sql.
export type Verdict = "approved" | "edited" | "rejected";

export interface FeedbackEvent {
  id?: number;
  case_id: string;
  repo_id: string;
  verdict: Verdict;
  issue_number?: number | null;
  issue_title?: string | null;
  issue_body?: string | null;
  classification?: string | null;
  ai_draft?: string | null;
  final_draft?: string | null;
  edit_ratio?: number | null; // 0 = identical, 1 = fully rewritten
  recommended_action?: string | null;
  approved_action?: string | null;
  action_overridden?: boolean;
  reject_reason?: string | null;
  voice_match?: number | null;
  voice_rating?: number | null;
  occurred_at?: string;
}
