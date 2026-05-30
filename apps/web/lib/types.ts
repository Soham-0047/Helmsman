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
  { key: "classifier", label: "Classifier", icon: "◈" },
  { key: "retriever", label: "Retriever", icon: "⌕" },
  { key: "reproducer", label: "Reproducer", icon: "↻" },
  { key: "source_analyzer", label: "Source", icon: "{}" },
  { key: "prioritizer", label: "Prioritizer", icon: "▲" },
  { key: "voice_profiler", label: "Voice", icon: "♪" },
  { key: "responder", label: "Responder", icon: "✎" },
] as const;
export type NodeKey = (typeof PIPELINE_NODES)[number]["key"];

export interface CaseRecord {
  id: string;
  repo_id: string;
  repo_full_name: string;
  github_issue_number: number;
  uipath_case_id: string | null;
  current_stage: Stage;
  classification: string | null;
  priority_score: number | null;
  pipeline_outputs: Record<string, any>;
  draft_response: string;
  recommended_action: string | null;
  approved_action: any;
  issue: {
    number: number;
    title: string;
    body: string;
    author: string;
    author_is_contributor: boolean;
    reactions: number;
    age_hours: number;
    existing_labels: string[];
  };
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  executed_at: string | null;
  completed_at: string | null;
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
  agent?: NodeKey;
  stage?: Stage;
  status?: string;
  output?: Record<string, any>;
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
  input?: any;
  output?: any;
  occurred_at: string;
}
