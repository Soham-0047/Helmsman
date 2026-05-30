import { Router } from "express";
import { getStore } from "../db/store.ts";
import { refreshVoiceProfile } from "../service.ts";
import { demoVoiceCorpus } from "../demo/fixtures.ts";

export const reposRouter = Router();

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
