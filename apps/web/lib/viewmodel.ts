// Adapter: the gateway returns rich CaseRecord objects; the UI renders a flatter
// "CaseVM" view model. toView() maps one to the other and derives the bits the
// design needs (findings table, completed agents, voice %). MOCK_CASES /
// FIXTURES / EVENT_STREAM are the offline fallback so the UI is still alive when
// the gateway is unreachable (and power the landing/standalone demo).
import { AGENTS } from "./agents";
import type { CaseRecord, NodeKey, NodeState } from "./types";

export interface Finding {
  v: string;
  mono?: boolean;
}

export interface CaseVM {
  id: string;
  num: number;
  caseId: string;
  title: string;
  author: string;
  classification: string;
  priority: number;
  stage: string;
  reactions: number;
  repo: string;
  signals: string[];
  findings: Record<string, Finding>;
  voice: number; // 0–100
  draft: string;
  latencies: Partial<Record<NodeKey, number>>;
  completed: NodeKey[];
  skipped: NodeKey[];
  running?: boolean;
}

/** Map a gateway CaseRecord into the flat view model the components consume. */
export function toView(c: CaseRecord): CaseVM {
  const out = c.pipeline_outputs || {};
  const findings: Record<string, Finding> = {};
  const dup = out.retriever?.likely_duplicate_of;
  if (dup)
    findings["Duplicate of"] = {
      v: `#${dup}${out.retriever?.duplicate_confidence != null ? ` (conf ${out.retriever.duplicate_confidence})` : ""}`,
    };
  if (out.reproducer)
    findings["Reproduction"] = {
      v: `${out.reproducer.has_reproduction ? "reproducible" : "needs info"}${
        out.reproducer.environment?.runtime ? ` · ${out.reproducer.environment.runtime}` : ""
      }`,
    };
  if (out.source_analyzer?.likely_files?.length)
    findings["Likely files"] = { v: out.source_analyzer.likely_files.join(", "), mono: true };
  if (out.source_analyzer?.hypothesis)
    findings["Hypothesis"] = { v: out.source_analyzer.hypothesis };
  const rec = c.recommended_action || out.responder?.recommended_action;
  if (rec) findings["Recommended"] = { v: rec };

  const completed = AGENTS.map((a) => a.id).filter((id) => out[id] != null);
  const voiceScore = out.responder?.voice_match_score;

  return {
    id: c.id,
    num: c.github_issue_number,
    caseId: c.uipath_case_id || "—",
    title: c.issue.title,
    author: c.issue.author,
    classification: c.classification || out.classifier?.category || "bug",
    priority: c.priority_score ?? 0,
    stage: c.current_stage,
    reactions: c.issue.reactions ?? 0,
    repo: c.repo_full_name,
    signals: out.prioritizer?.signals || [],
    findings,
    voice: voiceScore != null ? Math.round(voiceScore * 100) : 0,
    draft: c.draft_response || "",
    latencies: {},
    completed,
    skipped: [],
  };
}

/** Derive per-node visual states, preferring live SSE states when present. */
export function deriveStates(
  vm: CaseVM,
  live?: Partial<Record<NodeKey, NodeState>>
): Record<NodeKey, NodeState> {
  const states = {} as Record<NodeKey, NodeState>;
  for (const a of AGENTS) {
    if (live && live[a.id]) states[a.id] = live[a.id]!;
    else if (vm.skipped.includes(a.id)) states[a.id] = "skipped";
    else if (vm.completed.includes(a.id) || vm.latencies[a.id]) states[a.id] = "complete";
    else states[a.id] = "idle";
  }
  return states;
}

/* ============================================================
   Offline fallback / demo data
   ============================================================ */
const DRAFT_482 = `Thanks for the detailed report, @octobyte — and for the minimal repro. 🙏

I dug into this. The crash happens because the tokenizer dereferences \`config.block\` before checking it exists, so an **empty config block** triggers a null read:

\`\`\`ts
// src/parser/tokenizer.ts
- const entries = config.block.entries;
+ const entries = config.block?.entries ?? [];
\`\`\`

This looks like a regression from #471. I'll get a patch up shortly. In the
meantime, adding an empty \`{}\` to the block is a safe workaround.

Could you confirm which Node version you saw this on? Repro passed for me on
**node 20.11**.`;

export const MOCK_CASES: CaseVM[] = [
  {
    id: "c482", num: 482, caseId: "CASE-7F3A", title: "Segfault when config block is empty",
    author: "octobyte", classification: "bug", priority: 8, stage: "Pending Approval",
    reactions: 12, repo: "helmsman-demo/fastlane-parser",
    signals: ["security-sensitive: no", "many reactions", "regression", "core path"],
    findings: {
      "Duplicate of": { v: "#119 (conf 0.87)" },
      Reproduction: { v: "reproducible · node 20.11" },
      "Likely files": { v: "src/parser/tokenizer.ts, src/index.ts", mono: true },
      Hypothesis: { v: "Null check missing when config block is empty" },
      Recommended: { v: "comment + label: needs-info" },
    },
    voice: 92, draft: DRAFT_482,
    latencies: { classifier: 812, retriever: 1240, reproducer: 3180, source_analyzer: 2010, prioritizer: 640, voice_profiler: 720, responder: 1880 },
    completed: ["classifier", "retriever", "reproducer", "source_analyzer", "prioritizer", "voice_profiler", "responder"],
    skipped: [],
  },
  {
    id: "c507", num: 507, caseId: "CASE-9B2D", title: "API key printed in debug logs on startup",
    author: "securnaut", classification: "security", priority: 9, stage: "Pending Approval",
    reactions: 4, repo: "helmsman-demo/fastlane-parser",
    signals: ["security-sensitive", "credential exposure", "core maintainer pinged"],
    findings: {
      "Duplicate of": { v: "none" },
      "Likely files": { v: "src/logger.ts", mono: true },
      Hypothesis: { v: "Logger interpolates full env on boot" },
      Recommended: { v: "label: security · redact + patch" },
    },
    voice: 88,
    draft: `Thank you for the responsible disclosure, @securnaut. Confirming this is valid — the boot logger interpolates \`process.env\` verbatim. We'll redact and ship a patch release today. Marking as security-sensitive and moving this off the public tracker for the fix.`,
    latencies: { classifier: 760, retriever: 980, prioritizer: 590, voice_profiler: 700, responder: 1520 },
    completed: ["classifier", "retriever", "prioritizer", "voice_profiler", "responder"],
    skipped: ["reproducer", "source_analyzer"],
  },
  {
    id: "c511", num: 511, caseId: "CASE-3C8E", title: "Add support for TOML config files",
    author: "maplewren", classification: "feature", priority: 5, stage: "Drafting",
    reactions: 23, repo: "helmsman-demo/fastlane-parser",
    signals: ["many reactions", "roadmap-adjacent"],
    findings: {
      "Duplicate of": { v: "partial · #350 (conf 0.61)" },
      "Likely files": { v: "src/config/index.ts", mono: true },
      Recommended: { v: "label: feature · discuss scope" },
    },
    voice: 85,
    draft: `Appreciate the proposal, @maplewren — TOML keeps coming up. This overlaps with #350; let's consolidate there. I'm open to it behind a \`--config-format\` flag. Want to sketch the parser interface first?`,
    latencies: { classifier: 690, retriever: 1100, prioritizer: 610, voice_profiler: 680 },
    completed: ["classifier", "retriever", "prioritizer", "voice_profiler"],
    skipped: ["reproducer", "source_analyzer"],
  },
  {
    id: "c498", num: 498, caseId: "CASE-2A1F", title: "it doesn't work after update",
    author: "newbie_dev", classification: "needs_info", priority: 2, stage: "Approved",
    reactions: 0, repo: "helmsman-demo/fastlane-parser",
    signals: ["low signal", "no repro provided"],
    findings: {
      Reproduction: { v: "not reproducible · insufficient detail" },
      Recommended: { v: "comment + label: needs-info" },
    },
    voice: 90,
    draft: `Sorry you're hitting trouble, @newbie_dev! I'm not able to reproduce from the description. Could you share: your version (\`fastlane --version\`), the exact command, and the full error output? That'll help me pin it down quickly.`,
    latencies: { classifier: 720, retriever: 880, prioritizer: 560, voice_profiler: 690, responder: 1340 },
    completed: ["classifier", "retriever", "prioritizer", "voice_profiler", "responder"],
    skipped: ["reproducer", "source_analyzer"],
  },
  {
    id: "c463", num: 463, caseId: "CASE-5D7C", title: "Duplicate: parser hangs on nested arrays",
    author: "loopfox", classification: "duplicate", priority: 3, stage: "Executed",
    reactions: 1, repo: "helmsman-demo/fastlane-parser",
    signals: ["exact duplicate"],
    findings: {
      "Duplicate of": { v: "#119 (conf 0.94)" },
      Recommended: { v: "comment + close as duplicate" },
    },
    voice: 91,
    draft: `Thanks @loopfox — this is the same root cause as #119, which is already being tracked. Closing as a duplicate so the discussion stays in one place. Please follow #119 for updates!`,
    latencies: { classifier: 700, retriever: 1010, prioritizer: 540, voice_profiler: 660, responder: 1190 },
    completed: ["classifier", "retriever", "prioritizer", "voice_profiler", "responder"],
    skipped: ["reproducer", "source_analyzer"],
  },
];

export const FIXTURES = [
  { num: 519, title: "Crash parsing UTF-16 BOM in header" },
  { num: 521, title: "Feature: emit source maps" },
  { num: 524, title: "Docs typo in quickstart" },
  { num: 527, title: "Memory leak in watch mode" },
];

export interface DemoEvent {
  t: number;
  type: string;
  agent: NodeKey | null;
  msg: string;
  lat?: number;
}

// Scripted stream for the standalone pipeline demo (used when no live SSE).
export const EVENT_STREAM: DemoEvent[] = [
  { t: 0, type: "stage", agent: null, msg: "Intake → Classification" },
  { t: 220, type: "agent_start", agent: "classifier", msg: "qwen-max (model-studio)" },
  { t: 1040, type: "agent_complete", agent: "classifier", msg: "bug · confidence 0.94", lat: 812 },
  { t: 1100, type: "stage", agent: null, msg: "Classification → Investigation" },
  { t: 1240, type: "agent_start", agent: "retriever", msg: "embedding search · 1,204 issues" },
  { t: 2500, type: "context_loaded", agent: "retriever", msg: "matched #119 (0.87)" },
  { t: 2560, type: "agent_complete", agent: "retriever", msg: "1 duplicate candidate", lat: 1240 },
  { t: 2700, type: "agent_start", agent: "reproducer", msg: "sandbox · node 20.11" },
  { t: 5900, type: "agent_complete", agent: "reproducer", msg: "reproducible ✓", lat: 3180 },
  { t: 6000, type: "agent_start", agent: "source_analyzer", msg: "reading src/parser/*" },
  { t: 8050, type: "agent_complete", agent: "source_analyzer", msg: "tokenizer.ts:142 null deref", lat: 2010 },
  { t: 8150, type: "stage", agent: null, msg: "Investigation → Drafting" },
  { t: 8250, type: "agent_start", agent: "prioritizer", msg: "scoring signals" },
  { t: 8900, type: "agent_complete", agent: "prioritizer", msg: "priority 8/10", lat: 640 },
  { t: 9000, type: "agent_start", agent: "voice_profiler", msg: "profiling @maintainer tone" },
  { t: 9720, type: "agent_complete", agent: "voice_profiler", msg: "voice match 92%", lat: 720 },
  { t: 9820, type: "agent_start", agent: "responder", msg: "qwen-max (model-studio)" },
  { t: 11700, type: "agent_complete", agent: "responder", msg: "draft assembled", lat: 1880 },
  { t: 11800, type: "stage", agent: null, msg: "Drafting → Pending Approval" },
  { t: 11900, type: "pipeline_complete", agent: null, msg: "awaiting human approval" },
];
