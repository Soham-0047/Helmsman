import { Router } from "express";
import { config } from "../config.ts";
import { getStore } from "../db/store.ts";
import { refreshVoiceProfile } from "../service.ts";
import { demoVoiceCorpus } from "../demo/fixtures.ts";
import type { FeedbackEvent } from "../types.ts";

export const reposRouter = Router();

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const DPO_MIN_EDIT_RATIO = 0.05;

/** Aggregate captured feedback into the metrics the Learning view renders. */
function summarizeLearning(eventsDesc: FeedbackEvent[]) {
  const events = [...eventsDesc].reverse(); // oldest -> newest for trends
  const approved = events.filter((e) => e.verdict === "approved").length;
  const edited = events.filter((e) => e.verdict === "edited").length;
  const rejected = events.filter((e) => e.verdict === "rejected").length;
  const total = events.length;
  const shipped = approved + edited;

  const ratios = events
    .map((e) => e.edit_ratio)
    .filter((r): r is number => typeof r === "number");
  const avgEditRatio = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;

  const editTrend = events
    .filter((e) => typeof e.edit_ratio === "number")
    .map((e) => round3(Number(e.edit_ratio)));
  const voiceTrend = events
    .map((e) => e.voice_match)
    .filter((v): v is number => typeof v === "number")
    .map((v) => round3(v));

  const reasonCounts: Record<string, number> = {};
  for (const e of events) {
    if (e.verdict === "rejected" && e.reject_reason)
      reasonCounts[e.reject_reason] = (reasonCounts[e.reject_reason] ?? 0) + 1;
  }
  const rejectReasons = Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  const sft = events.filter(
    (e) => (e.verdict === "approved" || e.verdict === "edited") && !!e.final_draft?.trim()
  ).length;
  const dpo = events.filter(
    (e) =>
      !!e.ai_draft?.trim() &&
      !!e.final_draft?.trim() &&
      e.ai_draft !== e.final_draft &&
      (typeof e.edit_ratio !== "number" || e.edit_ratio >= DPO_MIN_EDIT_RATIO)
  ).length;

  return {
    total,
    approved,
    edited,
    rejected,
    editRate: shipped ? round3(edited / shipped) : 0,
    acceptanceRate: total ? round3(shipped / total) : 0,
    avgEditRatio: round3(avgEditRatio),
    corpusContributed: shipped, // resolved issues fed back into the dedup corpus
    datasetExamples: { sft, dpo },
    editTrend,
    voiceTrend,
    rejectReasons,
  };
}

// GET /api/repos
reposRouter.get("/", async (_req, res) => {
  const store = await getStore();
  const repos = await store.listRepos();
  res.json({ repos });
});

// POST /api/repos/connect { owner, name, github_id?, default_branch?, head_sha? }
reposRouter.post("/connect", async (req, res) => {
  try {
    const store = await getStore();
    const owner = req.body?.owner;
    const name = req.body?.name;
    if (!owner || !name) return res.status(400).json({ error: "owner and name required" });
    const full_name = `${owner}/${name}`;
    const repo = await store.upsertRepo({
      github_id: req.body?.github_id ?? Math.floor(Math.random() * 1e9),
      owner,
      name,
      full_name,
      default_branch: req.body?.default_branch ?? "main",
      head_sha: req.body?.head_sha ?? "HEAD",
      voice_profile: null,
    });
    // Kick off voice profiling. In demo we use the bundled corpus; in live the
    // gateway would fetch the maintainer's last 100 closed-issue comments.
    const vc = demoVoiceCorpus();
    const vp = await refreshVoiceProfile(repo, owner, vc.comments);
    res.json({ ok: true, repo: { ...repo, voice_profile: vp } });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/repos/:id/learning — closed-loop metrics for the Learning view.
reposRouter.get("/:id/learning", async (req, res) => {
  try {
    const store = await getStore();
    const repo = await store.getRepo(req.params.id);
    if (!repo) return res.status(404).json({ error: "repo not found" });
    const events = await store.listFeedback(req.params.id, 2000);
    res.json({ ok: true, learning: summarizeLearning(events), voice_profile: repo.voice_profile ?? null });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/repos/:id/dataset?format=sft|dpo — download a fine-tuning corpus
// built from captured maintainer feedback. The runtime owns the shaping.
reposRouter.get("/:id/dataset", async (req, res) => {
  // Bound the runtime call so a wedged (accepting-but-unresponsive) agents
  // runtime returns a clean 502 instead of hanging the connection.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), Number(process.env.AGENTS_FETCH_TIMEOUT_MS ?? 30000));
  try {
    const store = await getStore();
    const repo = await store.getRepo(req.params.id);
    if (!repo) return res.status(404).json({ error: "repo not found" });
    const format = (req.query.format as string) === "dpo" ? "dpo" : "sft";
    const events = await store.listFeedback(req.params.id, 5000);

    const r = await fetch(`${config.agentsUrl}/dataset/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repo_full_name: repo.full_name,
        maintainer_login: repo.owner,
        voice_profile: repo.voice_profile ?? {},
        events,
      }),
      signal: ac.signal,
    });
    if (!r.ok) throw new Error(`runtime ${r.status}`);
    const built = (await r.json()) as {
      sft_jsonl: string;
      dpo_jsonl: string;
      counts: { sft: number; dpo: number };
    };
    const jsonl = format === "dpo" ? built.dpo_jsonl : built.sft_jsonl;
    const fname = `helmsman-${repo.owner}-${repo.name}-${format}.jsonl`;
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.setHeader("X-Dataset-Count", String(format === "dpo" ? built.counts.dpo : built.counts.sft));
    res.send(jsonl);
  } catch (e) {
    const msg = ac.signal.aborted ? "agents runtime timed out" : (e as Error).message;
    res.status(502).json({ error: `dataset build failed: ${msg}` });
  } finally {
    clearTimeout(timer);
  }
});

// POST /api/repos/:id/voice-profile/refresh
reposRouter.post("/:id/voice-profile/refresh", async (req, res) => {
  try {
    const store = await getStore();
    const repo = await store.getRepo(req.params.id);
    if (!repo) return res.status(404).json({ error: "repo not found" });
    const comments = req.body?.comments ?? demoVoiceCorpus().comments;
    const login = req.body?.login ?? repo.owner;
    const vp = await refreshVoiceProfile(repo, login, comments);
    res.json({ ok: true, voice_profile: vp });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
