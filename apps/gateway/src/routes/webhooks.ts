import { Router } from "express";
import { config } from "../config.ts";
import { verifyWebhookSignature } from "../lib/crypto.ts";
import { alreadyProcessed, idempotencyKey } from "../lib/idempotency.ts";
import { getStore } from "../db/store.ts";
import { openCaseAndRun } from "../service.ts";
import type { IssueRef } from "../types.ts";

export const webhooksRouter = Router();

// POST /webhooks/github — GitHub issue/issue_comment ingestion.
// Raw body is captured in index.ts (express.json verify) for HMAC.
webhooksRouter.post("/github", async (req, res) => {
  const event = req.header("X-GitHub-Event");
  const delivery = req.header("X-GitHub-Delivery") ?? "";
  const signature = req.header("X-Hub-Signature-256");
  const raw: Buffer = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body));

  // Per-repo secret if we know the repo; otherwise the global fallback secret.
  const payload = req.body ?? {};
  const secret = config.github.webhookSecret;

  if (!verifyWebhookSignature(raw, signature, secret)) {
    return res.status(401).json({ error: "invalid signature" });
  }

  // Idempotency: {delivery_id}:{event_type} — drop retries.
  const idk = idempotencyKey(delivery, event ?? "unknown");
  if (await alreadyProcessed(idk)) {
    return res.status(200).json({ ok: true, deduped: true });
  }

  if (event !== "issues" && event !== "issue_comment") {
    return res.status(202).json({ ok: true, ignored: event });
  }
  const action = payload.action;
  if (event === "issues" && action !== "opened" && action !== "reopened") {
    return res.status(202).json({ ok: true, ignored: `issues.${action}` });
  }
  if (event === "issue_comment" && action !== "created") {
    return res.status(202).json({ ok: true, ignored: `issue_comment.${action}` });
  }

  // Acknowledge fast, process async (GitHub expects a quick 2xx).
  res.status(202).json({ ok: true, accepted: true });

  try {
    const store = await getStore();
    const r = payload.repository;
    const repo =
      (await store.getRepoByFullName(r.full_name)) ??
      (await store.upsertRepo({
        github_id: r.id,
        owner: r.owner.login,
        name: r.name,
        full_name: r.full_name,
        default_branch: r.default_branch ?? "main",
        head_sha: "HEAD",
        voice_profile: null,
      }));

    const gh = payload.issue;
    const issue: IssueRef = {
      number: gh.number,
      title: gh.title,
      body: gh.body ?? "",
      author: gh.user?.login ?? "unknown",
      author_is_contributor: gh.author_association === "MEMBER" || gh.author_association === "OWNER",
      reactions: gh.reactions?.total_count ?? 0,
      age_hours: (Date.now() - new Date(gh.created_at).getTime()) / 3.6e6,
      existing_labels: (gh.labels ?? []).map((l: any) => (typeof l === "string" ? l : l.name)),
    };

    // In live mode the runtime queries pgvector for duplicates; seed_corpus is
    // left empty here (historical issues are indexed at connect time).
    await openCaseAndRun(repo, issue, {});
  } catch (e) {
    console.error("[webhook] processing error:", (e as Error).message);
  }
});
