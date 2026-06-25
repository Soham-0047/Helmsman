// Service layer: repo connect (+ voice profiling), opening a case and running
// the pipeline, and the human approval flow that triggers RPA execution.
import { admin } from "./admin.ts";
import { config } from "./config.ts";
import { getStore } from "./db/store.ts";
import { executeApprovedAction } from "./github/actions.ts";
import { maestro } from "./uipath/maestro.ts";
import { runPipelineForCase, type PipelineExtras } from "./pipeline.ts";
import { sseHub } from "./lib/sse.ts";
import { decrypt } from "./lib/crypto.ts";
import { editRatio } from "./lib/editdist.ts";
import type { ApprovedAction, CaseRecord, FeedbackEvent, IssueRef, RepoRef, Stage, Verdict } from "./types.ts";

// Minimum number of actually-shipped replies before we let online learning
// override the connect-time voice profile — below this the signal is too thin
// and the historical fingerprint stays the stable floor.
const VOICE_REFRESH_MIN_DRAFTS = 3;

export async function refreshVoiceProfile(repo: RepoRef, login: string, comments: string[]): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${config.agentsUrl}/agents/voice-profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maintainer_login: login, comments }),
    });
    if (!r.ok) throw new Error(`voice-profile ${r.status}`);
    const data = (await r.json()) as { voice_profile: Record<string, unknown> };
    const store = await getStore();
    await store.setVoiceProfile(repo.id, data.voice_profile);
    return data.voice_profile;
  } catch (e) {
    console.warn(`[voice] profiling failed: ${(e as Error).message}`);
    return null;
  }
}

// =============================================================================
// Closed learning loop — the return path. Every helper below is best-effort:
// a failure here must NEVER break an approval or an RPA execution, so each is
// wrapped and only logs. See db/schema.sql (feedback_events) and the README.
// =============================================================================

/** Persist one maintainer decision as a labeled training example. */
async function recordFeedbackSafe(event: FeedbackEvent): Promise<void> {
  try {
    if (!(await admin.isFlagEnabled("helmsman.feedback_capture", { userId: event.repo_id }))) return;
    const store = await getStore();
    await store.recordFeedback(event);
  } catch (e) {
    console.warn(`[learn] feedback capture failed: ${(e as Error).message}`);
  }
}

/**
 * Feed a resolved issue back into the per-repo RAG corpus so the Context
 * Retriever can recognize future duplicates of issues already handled.
 *
 * CRITICAL: the runtime's vector store keys by `str(github_id or full_name)` —
 * the SAME id the pipeline used to *search* (apps/agents/app/pipeline.py) — not
 * our DB UUID. The content format matches the seed corpus (`title\nbody`) so a
 * paraphrased re-file scores against it the same way.
 */
async function indexResolvedCase(repo: RepoRef | null, caseRec: CaseRecord, finalDraft: string): Promise<void> {
  try {
    if (!(await admin.isFlagEnabled("helmsman.index_resolved_cases", { userId: caseRec.repo_id }))) return;
    const title = caseRec.issue?.title ?? "";
    const body = caseRec.issue?.body ?? "";
    const content = [title, body].filter(Boolean).join("\n").trim() || (finalDraft ?? "").trim();
    if (!content) return;
    const vecRepoId = String(repo?.github_id || repo?.full_name || caseRec.repo_full_name || caseRec.repo_id);
    await fetch(`${config.agentsUrl}/vector/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repo_id: vecRepoId,
        issues: [{ github_issue_number: caseRec.github_issue_number, content }],
      }),
    });
  } catch (e) {
    console.warn(`[learn] corpus index failed: ${(e as Error).message}`);
  }
}

/**
 * Online voice learning: once enough real replies have been shipped, re-profile
 * the maintainer's voice from what they ACTUALLY sent (feedback_events) rather
 * than the frozen connect-time corpus. Gated by flag + a minimum sample floor.
 */
async function maybeRefreshVoice(repo: RepoRef | null): Promise<void> {
  try {
    if (!repo) return;
    if (!(await admin.isFlagEnabled("helmsman.voice_online_refresh", { userId: repo.id }))) return;
    const store = await getStore();
    const drafts = await store.listRecentApprovedDrafts(repo.id, 100);
    if (drafts.length < VOICE_REFRESH_MIN_DRAFTS) return;
    await refreshVoiceProfile(repo, repo.owner, drafts);
  } catch (e) {
    console.warn(`[learn] voice refresh failed: ${(e as Error).message}`);
  }
}

/** Create the Maestro Case + DB case (no pipeline run yet). */
export async function openCase(repo: RepoRef, issue: IssueRef): Promise<CaseRecord> {
  const store = await getStore();
  const mc = await maestro.createCase(repo.full_name, issue.number);
  const caseRec = await store.createCase({ repo, issue, uipath_case_id: mc.caseId });
  await store.appendAudit({
    case_id: caseRec.id,
    actor_type: "system",
    actor_name: "gateway",
    action: "case_opened",
    output: { uipath_case_id: mc.caseId, issue: issue.number },
  });
  return caseRec;
}

/** Open a case and run the seven-agent pipeline to completion (awaited). */
export async function openCaseAndRun(
  repo: RepoRef,
  issue: IssueRef,
  extras: PipelineExtras = {}
): Promise<CaseRecord> {
  const caseRec = await openCase(repo, issue);
  return runPipelineForCase(caseRec, repo, issue, extras);
}

function buildAction(caseRec: CaseRecord, override?: ApprovedAction): ApprovedAction {
  if (override) return override;
  const rec = caseRec.recommended_action;
  const outputs = caseRec.pipeline_outputs as any;
  const dupOf = outputs?.retriever?.likely_duplicate_of;
  const draft = caseRec.draft_response;
  switch (rec) {
    case "close_as_duplicate":
    case "close_as_duplicate_of":
      return { type: "close_as_duplicate_of", params: { other_number: dupOf, body: draft } };
    case "request_more_info":
      return { type: "request_more_info", params: { body: draft } };
    case "post_comment":
    default:
      return { type: "post_comment", params: { body: draft } };
  }
}

export interface ApproveResult {
  case: CaseRecord;
  action: ApprovedAction;
  rpa: unknown;
}

export async function approveCase(
  caseId: string,
  opts: {
    action?: ApprovedAction;
    editedDraft?: string;
    actor?: string;
    maintainerTokenEnc?: string;
    rating?: number;
  }
): Promise<ApproveResult> {
  const store = await getStore();
  const caseRec = await store.getCase(caseId);
  if (!caseRec) throw new Error("case not found");

  // Snapshot the ORIGINAL model draft before the human's edit overwrites it —
  // the (ai_draft -> final_draft) pair is the learning loop's core signal.
  const aiDraft = String((caseRec.pipeline_outputs as any)?.responder?.draft_markdown ?? "");

  if (opts.editedDraft !== undefined) {
    await store.updateCase(caseId, { draft_response: opts.editedDraft });
    caseRec.draft_response = opts.editedDraft;
  }
  const finalDraft = caseRec.draft_response ?? "";

  const defaultAction = buildAction(caseRec);
  const action = opts.action ?? defaultAction;
  // An override is more than a different action *kind*: keeping the type but
  // retargeting the duplicate (other_number) or supplying a different body is
  // also the maintainer overruling the AI — capture all of it as training signal.
  const ap = (action.params ?? {}) as Record<string, unknown>;
  const dp = (defaultAction.params ?? {}) as Record<string, unknown>;
  const actionOverridden =
    action.type !== defaultAction.type ||
    ap.other_number !== dp.other_number ||
    ap.body !== dp.body;
  const actor = opts.actor ?? "@maintainer";

  // ---- Approved ----
  await advance(caseRec, "Approved");
  await store.updateCase(caseId, { approved_at: new Date().toISOString(), approved_action: action });
  await store.appendAudit({
    case_id: caseId,
    actor_type: "human",
    actor_name: actor,
    action: "approve",
    input: action,
  });

  // ---- RPA execution (dry-run unless a real token is connected & flag off) ----
  const dryRun = await admin.isFlagEnabled("helmsman.rpa_dry_run", { userId: caseRec.repo_id });
  let token: string | undefined;
  if (!dryRun && opts.maintainerTokenEnc) {
    try {
      token = decrypt(opts.maintainerTokenEnc);
    } catch {
      /* fall back to dry-run if token can't be decrypted */
    }
  }
  const effectiveDryRun = dryRun || !token;
  const rpa = await executeApprovedAction(caseRec, action, { token, dryRun: effectiveDryRun });

  await store.appendAudit({
    case_id: caseId,
    actor_type: "system",
    actor_name: "uipath-rpa",
    action: "rpa_execute",
    input: action,
    output: rpa,
  });

  // ---- Executed ----
  await advance(caseRec, "Executed");
  const finalCase = await store.updateCase(caseId, {
    executed_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });

  // ---- Closed learning loop (best-effort; never blocks the approval) --------
  // The RPA action has already executed by this point, so NOTHING below may
  // throw out of approveCase — that would report a real, posted action as a
  // failure. The repo read is the one unwrapped call that feeds the helpers
  // (which are themselves wrapped), so it must swallow its own errors too.
  const verdict: Verdict = aiDraft && finalDraft !== aiDraft ? "edited" : "approved";
  const repo = await store.getRepo(caseRec.repo_id).catch(() => null);
  await recordFeedbackSafe({
    case_id: caseId,
    repo_id: caseRec.repo_id,
    verdict,
    issue_number: caseRec.github_issue_number,
    issue_title: caseRec.issue?.title ?? null,
    issue_body: caseRec.issue?.body ?? null,
    classification: caseRec.classification,
    ai_draft: aiDraft || null,
    final_draft: finalDraft || null,
    edit_ratio: aiDraft ? editRatio(aiDraft, finalDraft) : null,
    recommended_action: caseRec.recommended_action,
    approved_action: action.type,
    action_overridden: actionOverridden,
    voice_match: (caseRec.pipeline_outputs as any)?.responder?.voice_match_score ?? null,
    voice_rating: typeof opts.rating === "number" ? opts.rating : null,
  });
  // Compound the dedup corpus, then re-learn the voice from what shipped.
  await indexResolvedCase(repo, caseRec, finalDraft);
  await maybeRefreshVoice(repo);

  return { case: finalCase, action, rpa };
}

export async function rejectCase(
  caseId: string,
  actor = "@maintainer",
  reason = "",
  rating?: number
): Promise<CaseRecord> {
  const store = await getStore();
  const caseRec = await store.getCase(caseId);
  if (!caseRec) throw new Error("case not found");
  await store.appendAudit({
    case_id: caseId,
    actor_type: "human",
    actor_name: actor,
    action: "reject",
    input: { reason, rating },
  });

  // A rejection is a negative training example: the AI's draft was not shippable.
  const aiDraft = String((caseRec.pipeline_outputs as any)?.responder?.draft_markdown ?? "");
  await recordFeedbackSafe({
    case_id: caseId,
    repo_id: caseRec.repo_id,
    verdict: "rejected",
    issue_number: caseRec.github_issue_number,
    issue_title: caseRec.issue?.title ?? null,
    issue_body: caseRec.issue?.body ?? null,
    classification: caseRec.classification,
    ai_draft: aiDraft || null,
    final_draft: null,
    edit_ratio: null,
    recommended_action: caseRec.recommended_action,
    reject_reason: reason || null,
    voice_match: (caseRec.pipeline_outputs as any)?.responder?.voice_match_score ?? null,
    voice_rating: typeof rating === "number" ? rating : null,
  });

  sseHub.publish(caseId, { type: "stage", case_id: caseId, stage: caseRec.current_stage, status: "rejected", message: reason || "Rejected by maintainer" });
  return caseRec;
}

async function advance(caseRec: CaseRecord, stage: Stage): Promise<void> {
  const store = await getStore();
  try {
    if (caseRec.uipath_case_id) await maestro.advance(caseRec.uipath_case_id, stage);
  } catch (e) {
    console.warn(`[maestro] ${(e as Error).message}`);
  }
  await store.updateCase(caseRec.id, { current_stage: stage });
  caseRec.current_stage = stage;
  await store.appendAudit({
    case_id: caseRec.id,
    actor_type: "system",
    actor_name: "maestro",
    action: "stage_advance",
    output: { stage },
  });
  sseHub.publish(caseRec.id, { type: "stage", case_id: caseRec.id, stage, status: "entered" });
}
