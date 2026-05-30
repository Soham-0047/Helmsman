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
import type { ApprovedAction, CaseRecord, IssueRef, RepoRef, Stage } from "./types.ts";

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
  opts: { action?: ApprovedAction; editedDraft?: string; actor?: string; maintainerTokenEnc?: string }
): Promise<ApproveResult> {
  const store = await getStore();
  const caseRec = await store.getCase(caseId);
  if (!caseRec) throw new Error("case not found");

  if (opts.editedDraft !== undefined) {
    await store.updateCase(caseId, { draft_response: opts.editedDraft });
    caseRec.draft_response = opts.editedDraft;
  }

  const action = buildAction(caseRec, opts.action);
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

  return { case: finalCase, action, rpa };
}

export async function rejectCase(caseId: string, actor = "@maintainer", reason = ""): Promise<CaseRecord> {
  const store = await getStore();
  const caseRec = await store.getCase(caseId);
  if (!caseRec) throw new Error("case not found");
  await store.appendAudit({
    case_id: caseId,
    actor_type: "human",
    actor_name: actor,
    action: "reject",
    input: { reason },
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
