import { Router } from "express";
import { getStore } from "../db/store.ts";
import { sseHub } from "../lib/sse.ts";
import { approveCase, rejectCase } from "../service.ts";

export const casesRouter = Router();

// GET /api/cases?repo_id=&stage=&limit=
casesRouter.get("/", async (req, res) => {
  const store = await getStore();
  const cases = await store.listCases({
    repo_id: req.query.repo_id as string | undefined,
    stage: req.query.stage as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  res.json({ cases });
});

// GET /api/cases/:id
casesRouter.get("/:id", async (req, res) => {
  const store = await getStore();
  const c = await store.getCase(req.params.id);
  if (!c) return res.status(404).json({ error: "case not found" });
  res.json({ case: c });
});

// GET /api/cases/:id/audit
casesRouter.get("/:id/audit", async (req, res) => {
  const store = await getStore();
  const audit = await store.listAudit(req.params.id);
  res.json({ audit });
});

// GET /api/cases/:id/stream — SSE live pipeline updates
casesRouter.get("/:id/stream", (req, res) => {
  sseHub.subscribe(req.params.id, res);
});

// POST /api/cases/:id/approve { action?, editedDraft? }
casesRouter.post("/:id/approve", async (req, res) => {
  try {
    const result = await approveCase(req.params.id, {
      action: req.body?.action,
      editedDraft: req.body?.editedDraft,
      actor: req.body?.actor,
      maintainerTokenEnc: req.body?.maintainerTokenEnc,
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ ok: false, error: (e as Error).message });
  }
});

// POST /api/cases/:id/reject { reason? }
casesRouter.post("/:id/reject", async (req, res) => {
  try {
    const c = await rejectCase(req.params.id, req.body?.actor, req.body?.reason);
    res.json({ ok: true, case: c });
  } catch (e) {
    res.status(400).json({ ok: false, error: (e as Error).message });
  }
});

// PATCH /api/cases/:id/draft { draft }
casesRouter.patch("/:id/draft", async (req, res) => {
  const store = await getStore();
  const c = await store.getCase(req.params.id);
  if (!c) return res.status(404).json({ error: "case not found" });
  const updated = await store.updateCase(req.params.id, { draft_response: req.body?.draft ?? "" });
  await store.appendAudit({
    case_id: req.params.id,
    actor_type: "human",
    actor_name: req.body?.actor ?? "@maintainer",
    action: "edit_draft",
    output: { length: (req.body?.draft ?? "").length },
  });
  res.json({ ok: true, case: updated });
});
