// Gateway pipeline orchestrator. The gateway is the conductor:
//   1. create a Maestro Case (UiPath or local simulator)
//   2. stream the seven-agent pipeline from the FastAPI runtime (NDJSON)
//   3. for each event: persist to the case, advance the Maestro stage, write the
//      audit trail, and fan out over SSE to the dashboard
//   4. stop at "Pending Approval" — the human gate. Nothing is posted yet.
import { admin } from "./admin.ts";
import { config } from "./config.ts";
import { maestro } from "./uipath/maestro.ts";
import { sseHub } from "./lib/sse.ts";
import { getStore } from "./db/store.ts";
import type { AgentEvent, CaseRecord, IssueRef, RepoRef, Stage } from "./types.ts";

export interface PipelineExtras {
  seedCorpus?: { github_issue_number: number; content: string }[];
  sourceFiles?: { path: string; content: string }[];
}

async function evaluateFlags(repo: RepoRef): Promise<Record<string, boolean>> {
  const ctx = { userId: repo.id, repo: repo.full_name };
  const keys = [
    "helmsman.use_long_context_analyzer",
    "helmsman.voice_self_check",
    "helmsman.auto_close_duplicates",
    "helmsman.rpa_dry_run",
  ];
  const out: Record<string, boolean> = {};
  for (const k of keys) out[k] = await admin.isFlagEnabled(k, ctx);
  return out;
}

async function* readNdjson(res: Response): AsyncGenerator<AgentEvent> {
  if (!res.body) return;
  const reader = (res.body as any).getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line) as AgentEvent;
    }
  }
  if (buf.trim()) yield JSON.parse(buf.trim()) as AgentEvent;
}

export async function runPipelineForCase(
  caseRec: CaseRecord,
  repo: RepoRef,
  issue: IssueRef,
  extras: PipelineExtras = {}
): Promise<CaseRecord> {
  const store = await getStore();
  const flags = await evaluateFlags(repo);

  const body = {
    case_id: caseRec.id,
    repo: {
      github_id: repo.github_id,
      owner: repo.owner,
      name: repo.name,
      full_name: repo.full_name,
      default_branch: repo.default_branch,
      head_sha: repo.head_sha,
    },
    issue,
    voice_profile: repo.voice_profile ?? null,
    flags,
    seed_corpus: extras.seedCorpus ?? [],
    source_files: extras.sourceFiles ?? [],
  };

  let res: Response;
  try {
    res = await fetch(`${config.agentsUrl}/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`runtime ${res.status}`);
  } catch (e) {
    const ev: AgentEvent = {
      type: "agent_error",
      case_id: caseRec.id,
      error: `agent runtime unreachable: ${(e as Error).message}`,
    };
    sseHub.publish(caseRec.id, ev);
    await store.appendAudit({
      case_id: caseRec.id,
      actor_type: "system",
      actor_name: "gateway",
      action: "pipeline_error",
      output: { error: (e as Error).message },
    });
    return caseRec;
  }

  const outputs: Record<string, unknown> = { ...caseRec.pipeline_outputs };

  for await (const ev of readNdjson(res)) {
    sseHub.publish(caseRec.id, ev);

    if (ev.type === "stage" && ev.stage) {
      await advanceStage(caseRec, ev.stage);
    } else if (ev.type === "agent_complete" && ev.agent) {
      outputs[ev.agent] = ev.output;
      await store.updateCase(caseRec.id, { pipeline_outputs: { ...outputs } });
      await store.appendAudit({
        case_id: caseRec.id,
        actor_type: "agent",
        actor_name: ev.agent,
        action: ev.status === "loaded" ? "profile_loaded" : "model_call",
        input: { model: ev.model, provider: ev.provider },
        output: ev.output,
      });
    } else if (ev.type === "agent_error") {
      await store.appendAudit({
        case_id: caseRec.id,
        actor_type: "system",
        actor_name: ev.agent ?? "runtime",
        action: "agent_error",
        output: { error: ev.error },
      });
    } else if (ev.type === "pipeline_complete" && ev.output) {
      const r = ev.output as any;
      await store.updateCase(caseRec.id, {
        classification: r.classification ?? null,
        priority_score: r.priority_score ?? null,
        draft_response: r.draft_response ?? "",
        recommended_action: r.recommended_action ?? null,
        pipeline_outputs: r.pipeline_outputs ?? outputs,
      });
    }
  }

  return (await store.getCase(caseRec.id))!;
}

async function advanceStage(caseRec: CaseRecord, stage: Stage): Promise<void> {
  const store = await getStore();
  try {
    if (caseRec.uipath_case_id) await maestro.advance(caseRec.uipath_case_id, stage);
  } catch (e) {
    // illegal transitions are logged but don't break the pipeline
    console.warn(`[maestro] ${(e as Error).message}`);
  }
  await store.updateCase(caseRec.id, { current_stage: stage });
  await store.appendAudit({
    case_id: caseRec.id,
    actor_type: "system",
    actor_name: "maestro",
    action: "stage_advance",
    output: { stage },
  });
}
