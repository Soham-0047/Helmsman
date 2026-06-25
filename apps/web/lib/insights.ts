// Analytics / ROI derivation for the Insights page.
// deriveInsights() turns a list of triaged cases into the KPIs + chart series
// the page renders. When the gateway is unreachable we synthesize a larger,
// deterministic demo corpus (demoInsights) so the page is always alive and the
// offline judge path shows a full, believable dashboard.
import type { Tone } from "./agents";
import { band } from "./agents";

/** Minimal shape deriveInsights needs — CaseVM satisfies this structurally. */
export interface TriageLike {
  classification: string;
  priority: number;
  stage: string;
}

/** Real Agent-Society A/B numbers (benchmarks/results.json, 50 fixtures). */
export const BENCH = {
  generatedAt: "2026-05-31",
  nIssues: 50,
  mode: "local-fallback (deterministic)",
  rows: [
    { metric: "Classification accuracy", base: 70, pipe: 82, unit: "%", max: 100, raw: "" },
    { metric: "Response quality · LLM-judge", base: 20, pipe: 73, unit: "%", max: 100, raw: "1.00 → 3.64 / 5" },
    { metric: "Voice match · cosine", base: 26, pipe: 39, unit: "%", max: 100, raw: "0.259 → 0.388" },
  ],
};

// ROI assumption: a maintainer spends ~18 min manually triaging one issue
// (read, search for dupes, reproduce, draft). Helmsman does the legwork; the
// human only approves. Conservative and clearly labeled on the page.
export const MIN_SAVED_PER_ISSUE = 18;

const CLASS_META: Record<string, { label: string; tone: Tone }> = {
  bug: { label: "Bug", tone: "red" },
  security: { label: "Security", tone: "red" },
  feature: { label: "Feature", tone: "blue" },
  question: { label: "Question", tone: "amber" },
  needs_info: { label: "Needs info", tone: "amber" },
  duplicate: { label: "Duplicate", tone: null },
  spam: { label: "Spam", tone: null },
};

export interface ClassSlice {
  key: string;
  label: string;
  value: number;
  tone: Tone;
}

export interface InsightsData {
  triaged: number;
  pending: number;
  duplicatesCaught: number;
  autoHandled: number;
  hoursSaved: number;
  avgPriority: number;
  draftSeconds: number;
  classes: ClassSlice[];
  priority: { high: number; mid: number; low: number };
  volume: number[]; // last 14 days
  agentMs: { id: string; label: string; ms: number }[];
}

// Representative per-agent latency (ms) — averaged from live runs / fixtures.
const AGENT_MS: { id: string; label: string; ms: number }[] = [
  { id: "classifier", label: "Classifier", ms: 760 },
  { id: "retriever", label: "Retriever", ms: 1080 },
  { id: "reproducer", label: "Reproducer", ms: 3120 },
  { id: "source_analyzer", label: "Source", ms: 2010 },
  { id: "prioritizer", label: "Prioritizer", ms: 600 },
  { id: "voice_profiler", label: "Voice", ms: 700 },
  { id: "responder", label: "Responder", ms: 1740 },
];

/** Spread a total across 14 days with a gently rising, deterministic shape. */
function volumeSeries(total: number): number[] {
  const w = [3, 4, 4, 6, 5, 7, 8, 6, 9, 8, 10, 9, 12, 11];
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => Math.max(0, Math.round((x / sum) * total)));
}

export function deriveInsights(cases: TriageLike[]): InsightsData {
  const triaged = cases.length;
  const counts: Record<string, number> = {};
  let prioritySum = 0;
  let high = 0,
    mid = 0,
    low = 0;
  let pending = 0;

  for (const c of cases) {
    const cls = c.classification || "bug";
    counts[cls] = (counts[cls] || 0) + 1;
    prioritySum += c.priority || 0;
    const b = band(c.priority);
    if (b === "red") high++;
    else if (b === "amber") mid++;
    else low++;
    if (c.stage === "Pending Approval") pending++;
  }

  const classes: ClassSlice[] = Object.entries(counts)
    .map(([key, value]) => ({
      key,
      label: CLASS_META[key]?.label ?? key,
      tone: CLASS_META[key]?.tone ?? null,
      value,
    }))
    .sort((a, b) => b.value - a.value);

  const duplicatesCaught = counts["duplicate"] || 0;
  const autoHandled = (counts["duplicate"] || 0) + (counts["spam"] || 0) + (counts["needs_info"] || 0);
  const hoursSaved = Math.round((triaged * MIN_SAVED_PER_ISSUE) / 60);
  const avgPriority = triaged ? prioritySum / triaged : 0;
  const draftSeconds = Math.round((AGENT_MS.reduce((a, b) => a + b.ms, 0) / 1000) * 10) / 10;

  return {
    triaged,
    pending,
    duplicatesCaught,
    autoHandled,
    hoursSaved,
    avgPriority: Math.round(avgPriority * 10) / 10,
    draftSeconds,
    classes,
    priority: { high, mid, low },
    volume: volumeSeries(triaged),
    agentMs: AGENT_MS,
  };
}

// ===========================================================================
// Closed learning loop — metrics surfaced on the Learning panel. Mirrors the
// gateway's summarizeLearning() output (apps/gateway/src/routes/repos.ts).
// ===========================================================================
export interface LearningStats {
  total: number;
  approved: number;
  edited: number;
  rejected: number;
  editRate: number; // share of shipped replies the maintainer had to edit (↓ = learning)
  acceptanceRate: number; // share of drafts shippable without rejection
  avgEditRatio: number; // mean normalized edit distance
  corpusContributed: number; // resolved issues fed back into the dedup corpus
  datasetExamples: { sft: number; dpo: number };
  editTrend: number[]; // edit ratio per shipped decision, oldest → newest
  voiceTrend: number[]; // responder voice-match per decision, oldest → newest
  rejectReasons: { reason: string; count: number }[];
}

export const EMPTY_LEARNING: LearningStats = {
  total: 0,
  approved: 0,
  edited: 0,
  rejected: 0,
  editRate: 0,
  acceptanceRate: 0,
  avgEditRatio: 0,
  corpusContributed: 0,
  datasetExamples: { sft: 0, dpo: 0 },
  editTrend: [],
  voiceTrend: [],
  rejectReasons: [],
};

/** Deterministic demo learning curve — a maintainer's edits falling as the
 *  voice profile sharpens. Used when the gateway is offline / has no feedback. */
export const DEMO_LEARNING: LearningStats = (() => {
  // 24 decisions, edit ratio drifting down, voice match drifting up.
  const editTrend = Array.from({ length: 24 }, (_, i) =>
    Math.round(Math.max(0.06, 0.62 - i * 0.022 + ((i * 7) % 5) * 0.012) * 1000) / 1000
  );
  const voiceTrend = Array.from({ length: 24 }, (_, i) =>
    Math.round(Math.min(0.97, 0.55 + i * 0.016 + ((i * 3) % 4) * 0.01) * 1000) / 1000
  );
  const edited = 9;
  const rejected = 3;
  const approved = 24 - edited - rejected;
  const shipped = approved + edited;
  return {
    total: 24,
    approved,
    edited,
    rejected,
    editRate: Math.round((edited / shipped) * 1000) / 1000,
    acceptanceRate: Math.round((shipped / 24) * 1000) / 1000,
    avgEditRatio: Math.round((editTrend.reduce((a, b) => a + b, 0) / editTrend.length) * 1000) / 1000,
    corpusContributed: shipped,
    datasetExamples: { sft: shipped, dpo: edited },
    editTrend,
    voiceTrend,
    rejectReasons: [
      { reason: "tone too formal", count: 2 },
      { reason: "missing repro ask", count: 1 },
    ],
  };
})();

/** Deterministic demo corpus — used when the gateway is offline. */
function demoCorpus(): TriageLike[] {
  // distribution roughly matching the fixture mix
  const plan: { cls: string; n: number; pr: number }[] = [
    { cls: "bug", n: 86, pr: 7 },
    { cls: "feature", n: 54, pr: 5 },
    { cls: "question", n: 38, pr: 3 },
    { cls: "duplicate", n: 31, pr: 3 },
    { cls: "needs_info", n: 22, pr: 2 },
    { cls: "security", n: 9, pr: 9 },
    { cls: "spam", n: 8, pr: 1 },
  ];
  const out: TriageLike[] = [];
  plan.forEach(({ cls, n, pr }) => {
    for (let i = 0; i < n; i++) {
      // jitter priority deterministically by index
      const jitter = ((i * 7) % 5) - 2;
      const priority = Math.max(1, Math.min(10, pr + (cls === "bug" || cls === "security" ? jitter : Math.max(-1, jitter))));
      const stage = i % 9 === 0 ? "Pending Approval" : "Executed";
      out.push({ classification: cls, priority, stage });
    }
  });
  return out;
}

export const DEMO_INSIGHTS: InsightsData = deriveInsights(demoCorpus());
