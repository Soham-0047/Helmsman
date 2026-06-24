// Automation rules — the policy layer on top of the pipeline.
// Rules never bypass the human gate unless explicitly set to "auto", and even
// then the action is the same audited RPA action a maintainer would approve.
// Persisted to localStorage so edits survive a reload in the demo.

export type RuleMode = "auto" | "suggest";

export interface Rule {
  id: string;
  icon: string; // UIcon name
  name: string;
  desc: string;
  conditions: string[]; // chips shown in the "When" flow
  action: string; // chip shown in the "Then" flow
  enabled: boolean;
  mode: RuleMode; // auto = execute after pipeline; suggest = pre-fill the gate
  threshold?: number; // 0–100, for rules with a confidence/priority gate
  thresholdLabel?: string;
  fired: number; // times fired in the last 30 days (demo seed)
}

export const DEFAULT_RULES: Rule[] = [
  {
    id: "close-dupes",
    icon: "layers",
    name: "Auto-close confident duplicates",
    desc: "When the Retriever is highly confident an issue restates an earlier one, comment with the link and close it.",
    conditions: ["class = duplicate", "dup confidence ≥ threshold"],
    action: "comment + close as duplicate",
    enabled: true,
    mode: "suggest",
    threshold: 90,
    thresholdLabel: "Duplicate confidence",
    fired: 31,
  },
  {
    id: "auto-label",
    icon: "tag",
    name: "Auto-label by classification",
    desc: "Apply the matching label (bug / feature / question …) the moment the Classifier returns a confident label.",
    conditions: ["classifier confidence ≥ threshold"],
    action: "apply type label",
    enabled: true,
    mode: "auto",
    threshold: 75,
    thresholdLabel: "Classifier confidence",
    fired: 214,
  },
  {
    id: "request-info",
    icon: "message",
    name: "Request info on vague reports",
    desc: "When a report is too thin to act on, post a voice-matched template asking for version, repro and logs.",
    conditions: ["class = needs_info"],
    action: "comment + label needs-info",
    enabled: true,
    mode: "auto",
    fired: 47,
  },
  {
    id: "fast-track-security",
    icon: "shield",
    name: "Fast-track security reports",
    desc: "Boost priority, label security-sensitive and notify the maintainer immediately — never auto-respond.",
    conditions: ["security signal detected"],
    action: "boost priority + notify",
    enabled: true,
    mode: "suggest",
    fired: 9,
  },
  {
    id: "silence-spam",
    icon: "close",
    name: "Silence spam",
    desc: "Close advertising / gibberish without a comment so it never reaches your inbox.",
    conditions: ["class = spam", "classifier confidence ≥ threshold"],
    action: "close, no comment",
    enabled: true,
    mode: "auto",
    threshold: 85,
    thresholdLabel: "Spam confidence",
    fired: 23,
  },
  {
    id: "surface-hot",
    icon: "trendUp",
    name: "Surface high-priority issues",
    desc: "Pin issues scoring 8+ to the top of triage and ping the on-call maintainer.",
    conditions: ["priority ≥ threshold"],
    action: "pin + notify on-call",
    enabled: false,
    mode: "suggest",
    threshold: 80,
    thresholdLabel: "Priority (×10)",
    fired: 0,
  },
];

const KEY = "helmsman-automations";

export function loadRules(): Rule[] {
  if (typeof window === "undefined") return DEFAULT_RULES;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_RULES;
    const saved = JSON.parse(raw) as Rule[];
    // merge: keep defaults' copy/labels, overlay saved enabled/mode/threshold
    return DEFAULT_RULES.map((d) => {
      const s = saved.find((x) => x.id === d.id);
      return s ? { ...d, enabled: s.enabled, mode: s.mode, threshold: s.threshold ?? d.threshold } : d;
    });
  } catch {
    return DEFAULT_RULES;
  }
}

export function saveRules(rules: Rule[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify(rules.map((r) => ({ id: r.id, enabled: r.enabled, mode: r.mode, threshold: r.threshold })))
    );
  } catch {
    /* ignore */
  }
}

export interface RuleEvent {
  ruleId: string;
  issue: number;
  text: string;
  ago: string;
}

// Seeded recent activity for the rule firing log.
export const RULE_ACTIVITY: RuleEvent[] = [
  { ruleId: "auto-label", issue: 531, text: "labeled bug", ago: "2m" },
  { ruleId: "close-dupes", issue: 463, text: "closed as duplicate of #119", ago: "14m" },
  { ruleId: "fast-track-security", issue: 507, text: "boosted to 9/10 · pinged @maintainer", ago: "31m" },
  { ruleId: "request-info", issue: 498, text: "asked reporter for version + repro", ago: "1h" },
  { ruleId: "auto-label", issue: 528, text: "labeled feature", ago: "1h" },
  { ruleId: "silence-spam", issue: 525, text: "closed silently", ago: "2h" },
  { ruleId: "auto-label", issue: 524, text: "labeled docs", ago: "3h" },
  { ruleId: "close-dupes", issue: 519, text: "closed as duplicate of #142", ago: "4h" },
];
