// Pipeline agents, stages, and small display helpers shared across the UI.
// Agent ids match the runtime NodeKey values so they line up 1:1 with the SSE
// stream's nodeStates and with case.pipeline_outputs keys.
import type { NodeKey } from "./types";

export interface AgentDef {
  id: NodeKey;
  label: string;
  icon: string; // key into AGENT_ICONS in components/icons.tsx
  desc: string;
}

export const AGENTS: AgentDef[] = [
  { id: "classifier", label: "Classifier", icon: "tag", desc: "Labels the issue type" },
  { id: "retriever", label: "Retriever", icon: "layers", desc: "Finds duplicates & context" },
  { id: "reproducer", label: "Reproducer", icon: "flask", desc: "Attempts a repro" },
  { id: "source_analyzer", label: "Source", icon: "code", desc: "Analyzes the codebase" },
  { id: "prioritizer", label: "Prioritizer", icon: "bars", desc: "Scores priority 0–10" },
  { id: "voice_profiler", label: "Voice", icon: "wave", desc: "Matches your tone" },
  { id: "responder", label: "Responder", icon: "message", desc: "Drafts the reply" },
];

export const STAGES = [
  "Intake",
  "Classification",
  "Investigation",
  "Drafting",
  "Pending Approval",
  "Approved",
  "Executed",
] as const;

export const PROMPT_KEYS = [
  "classifier",
  "retriever",
  "reproducer",
  "source_analyzer",
  "prioritizer",
  "voice_profiler",
  "responder",
];

export type Band = "red" | "amber" | "green";
export function band(p: number | null | undefined): Band {
  const v = p ?? 0;
  return v >= 8 ? "red" : v >= 4 ? "amber" : "green";
}

export type Tone = "accent" | "green" | "amber" | "red" | "blue" | null;
export function stageTone(stage: string): Tone {
  return (
    {
      "Pending Approval": "accent",
      Approved: "green",
      Executed: "green",
      Drafting: "amber",
      Investigation: "blue",
      Classification: "blue",
      Intake: null,
    } as Record<string, Tone>
  )[stage] ?? null;
}
