/* ============================================================
   Helmsman — mock data
   ============================================================ */
(function () {
  // The seven agents, in pipeline order.
  const AGENTS = [
    { id: "classifier",  label: "Classifier",  icon: "tag",     desc: "Labels the issue type" },
    { id: "retriever",   label: "Retriever",   icon: "layers",  desc: "Finds duplicates & context" },
    { id: "reproducer",  label: "Reproducer",  icon: "flask",   desc: "Attempts a repro" },
    { id: "source",      label: "Source",      icon: "code",    desc: "Analyzes the codebase" },
    { id: "prioritizer", label: "Prioritizer", icon: "bars",    desc: "Scores priority 0–10" },
    { id: "voice",       label: "Voice",       icon: "wave",    desc: "Matches your tone" },
    { id: "responder",   label: "Responder",   icon: "message", desc: "Drafts the reply" },
  ];

  const STAGES = ["Intake", "Classification", "Investigation", "Drafting", "Pending Approval", "Approved", "Executed"];

  // classification -> pill color class
  const CLASS_COLOR = {
    bug: "tag-red", security: "tag-red", feature: "tag-blue",
    question: "tag-amber", needs_info: "tag-amber", duplicate: "pill-neutral",
  };

  function band(p) { return p >= 8 ? "red" : p >= 4 ? "amber" : "green"; }

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

  const CASES = [
    {
      id: "c482", num: 482, caseId: "CASE-7F3A", title: "Segfault when config block is empty",
      author: "octobyte", classification: "bug", priority: 8, stage: "Pending Approval",
      reactions: 12, repo: "fastlane-parser",
      signals: ["security-sensitive: no", "many reactions", "regression", "core path"],
      findings: {
        "Duplicate of": { v: "#119 (conf 0.87)", mono: false },
        "Reproduction": { v: "reproducible · node 20.11", mono: false },
        "Likely files": { v: "src/parser/tokenizer.ts, src/index.ts", mono: true },
        "Hypothesis": { v: "Null check missing when config block is empty", mono: false },
        "Recommended": { v: "comment + label: needs-info", mono: false },
      },
      voice: 92, draft: DRAFT_482,
      latencies: { classifier: 812, retriever: 1240, reproducer: 3180, source: 2010, prioritizer: 640, voice: 720, responder: 1880 },
      skipped: [],
    },
    {
      id: "c507", num: 507, caseId: "CASE-9B2D", title: "API key printed in debug logs on startup",
      author: "securnaut", classification: "security", priority: 9, stage: "Pending Approval",
      reactions: 4, repo: "fastlane-parser",
      signals: ["security-sensitive", "credential exposure", "core maintainer pinged"],
      findings: {
        "Duplicate of": { v: "none", mono: false },
        "Likely files": { v: "src/logger.ts", mono: true },
        "Hypothesis": { v: "Logger interpolates full env on boot", mono: false },
        "Recommended": { v: "label: security · redact + patch", mono: false },
      },
      voice: 88,
      draft: `Thank you for the responsible disclosure, @securnaut. Confirming this is valid — the boot logger interpolates \`process.env\` verbatim. We'll redact and ship a patch release today. Marking as security-sensitive and moving this off the public tracker for the fix.`,
      latencies: { classifier: 760, retriever: 980, prioritizer: 590, voice: 700, responder: 1520 },
      skipped: ["reproducer", "source"],
    },
    {
      id: "c511", num: 511, caseId: "CASE-3C8E", title: "Add support for TOML config files",
      author: "maplewren", classification: "feature", priority: 5, stage: "Drafting",
      reactions: 23, repo: "fastlane-parser",
      signals: ["many reactions", "roadmap-adjacent"],
      findings: {
        "Duplicate of": { v: "partial · #350 (conf 0.61)", mono: false },
        "Likely files": { v: "src/config/index.ts", mono: true },
        "Recommended": { v: "label: feature · discuss scope", mono: false },
      },
      voice: 85,
      draft: `Appreciate the proposal, @maplewren — TOML keeps coming up. This overlaps with #350; let's consolidate there. I'm open to it behind a \`--config-format\` flag. Want to sketch the parser interface first?`,
      latencies: { classifier: 690, retriever: 1100, prioritizer: 610, voice: 680 },
      skipped: ["reproducer", "source"],
    },
    {
      id: "c498", num: 498, caseId: "CASE-2A1F", title: "it doesn't work after update",
      author: "newbie_dev", classification: "needs_info", priority: 2, stage: "Approved",
      reactions: 0, repo: "fastlane-parser",
      signals: ["low signal", "no repro provided"],
      findings: {
        "Reproduction": { v: "not reproducible · insufficient detail", mono: false },
        "Recommended": { v: "comment + label: needs-info", mono: false },
      },
      voice: 90,
      draft: `Sorry you're hitting trouble, @newbie_dev! I'm not able to reproduce from the description. Could you share: your version (\`fastlane --version\`), the exact command, and the full error output? That'll help me pin it down quickly.`,
      latencies: { classifier: 720, retriever: 880, prioritizer: 560, voice: 690, responder: 1340 },
      skipped: ["reproducer", "source"],
    },
    {
      id: "c463", num: 463, caseId: "CASE-5D7C", title: "Duplicate: parser hangs on nested arrays",
      author: "loopfox", classification: "duplicate", priority: 3, stage: "Executed",
      reactions: 1, repo: "fastlane-parser",
      signals: ["exact duplicate"],
      findings: {
        "Duplicate of": { v: "#119 (conf 0.94)", mono: false },
        "Recommended": { v: "comment + close as duplicate", mono: false },
      },
      voice: 91,
      draft: `Thanks @loopfox — this is the same root cause as #119, which is already being tracked. Closing as a duplicate so the discussion stays in one place. Please follow #119 for updates!`,
      latencies: { classifier: 700, retriever: 1010, prioritizer: 540, voice: 660, responder: 1190 },
      skipped: ["reproducer", "source"],
    },
  ];

  const FIXTURES = [
    { num: 519, title: "Crash parsing UTF-16 BOM in header" },
    { num: 521, title: "Feature: emit source maps" },
    { num: 524, title: "Docs typo in quickstart" },
    { num: 527, title: "Memory leak in watch mode" },
  ];

  // event stream for the live pipeline (case 482)
  const EVENT_STREAM = [
    { t: 0,    type: "stage",            agent: null,          msg: "Intake → Classification" },
    { t: 220,  type: "agent_start",      agent: "classifier",  msg: "qwen-max (model-studio)" },
    { t: 1040, type: "agent_complete",   agent: "classifier",  msg: "bug · confidence 0.94", lat: 812 },
    { t: 1100, type: "stage",            agent: null,          msg: "Classification → Investigation" },
    { t: 1240, type: "agent_start",      agent: "retriever",    msg: "embedding search · 1,204 issues" },
    { t: 2500, type: "context_loaded",   agent: "retriever",    msg: "matched #119 (0.87)" },
    { t: 2560, type: "agent_complete",   agent: "retriever",    msg: "1 duplicate candidate", lat: 1240 },
    { t: 2700, type: "agent_start",      agent: "reproducer",   msg: "sandbox · node 20.11" },
    { t: 5900, type: "agent_complete",   agent: "reproducer",   msg: "reproducible ✓", lat: 3180 },
    { t: 6000, type: "agent_start",      agent: "source",       msg: "reading src/parser/*" },
    { t: 8050, type: "agent_complete",   agent: "source",       msg: "tokenizer.ts:142 null deref", lat: 2010 },
    { t: 8150, type: "stage",            agent: null,           msg: "Investigation → Drafting" },
    { t: 8250, type: "agent_start",      agent: "prioritizer",  msg: "scoring signals" },
    { t: 8900, type: "agent_complete",   agent: "prioritizer",  msg: "priority 8/10", lat: 640 },
    { t: 9000, type: "agent_start",      agent: "voice",        msg: "profiling @maintainer tone" },
    { t: 9720, type: "agent_complete",   agent: "voice",        msg: "voice match 92%", lat: 720 },
    { t: 9820, type: "agent_start",      agent: "responder",    msg: "qwen-max (model-studio)" },
    { t: 11700,type: "agent_complete",   agent: "responder",    msg: "draft assembled", lat: 1880 },
    { t: 11800,type: "stage",            agent: null,           msg: "Drafting → Pending Approval" },
    { t: 11900,type: "pipeline_complete",agent: null,           msg: "awaiting human approval" },
  ];

  window.HELM = {
    AGENTS, STAGES, CLASS_COLOR, CASES, FIXTURES, EVENT_STREAM, band,
    PROMPTS: ["classifier","retriever","reproducer","source_analyzer","prioritizer","voice_profiler","responder"],
  };
})();
