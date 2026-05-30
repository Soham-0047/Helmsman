// The five RPA-executed GitHub actions. These are what makes Helmsman an RPA
// solution, not just an LLM wrapper: on maintainer approval, UiPath RPA reads
// the approved action from the Maestro Case and executes exactly ONE of these
// against the GitHub REST API. Nothing here runs without explicit approval.
//
// When the feature flag helmsman.rpa_dry_run is ON (default until a real OAuth
// token is connected), each action logs the exact request it WOULD make and
// returns it, without touching GitHub. This is what keeps the demo safe.
import { config } from "../config.ts";
import type { ApprovedAction, CaseRecord } from "../types.ts";

export interface ExecContext {
  owner: string;
  repo: string;
  issueNumber: number;
  token?: string; // maintainer OAuth token (decrypted) — omitted in dry-run
  dryRun: boolean;
}

export interface ActionResult {
  action: string;
  dryRun: boolean;
  requests: { method: string; path: string; body?: unknown }[];
  responses?: unknown[];
  ok: boolean;
}

async function ghCall(ctx: ExecContext, method: string, path: string, body?: unknown) {
  const url = `${config.github.apiBase}${path}`;
  const r = await fetch(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${ctx.token}`,
      "Content-Type": "application/json",
      "User-Agent": "Helmsman",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`github ${method} ${path} -> ${r.status}: ${await r.text()}`);
  return r.json();
}

function dispatch(ctx: ExecContext, requests: { method: string; path: string; body?: unknown }[]) {
  const result: ActionResult = { action: "", dryRun: ctx.dryRun, requests, ok: true };
  if (ctx.dryRun) {
    for (const req of requests) {
      console.log(`[RPA dry-run] ${req.method} ${req.path}`, req.body ? JSON.stringify(req.body).slice(0, 200) : "");
    }
    return Promise.resolve(result);
  }
  return Promise.all(requests.map((req) => ghCall(ctx, req.method, req.path, req.body))).then((responses) => {
    result.responses = responses;
    return result;
  });
}

const base = (ctx: ExecContext) => `/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.issueNumber}`;

// 1) post_comment
export async function post_comment(ctx: ExecContext, body: string): Promise<ActionResult> {
  const res = await dispatch(ctx, [{ method: "POST", path: `${base(ctx)}/comments`, body: { body } }]);
  return { ...res, action: "post_comment" };
}

// 2) apply_labels
export async function apply_labels(ctx: ExecContext, labels: string[]): Promise<ActionResult> {
  const res = await dispatch(ctx, [{ method: "POST", path: `${base(ctx)}/labels`, body: { labels } }]);
  return { ...res, action: "apply_labels" };
}

// 3) close_issue
export async function close_issue(ctx: ExecContext, reason: "completed" | "not_planned" = "completed"): Promise<ActionResult> {
  const res = await dispatch(ctx, [
    { method: "PATCH", path: base(ctx), body: { state: "closed", state_reason: reason } },
  ]);
  return { ...res, action: "close_issue" };
}

// 4) close_as_duplicate_of — comment + label + close
export async function close_as_duplicate_of(ctx: ExecContext, otherNumber: number, body?: string): Promise<ActionResult> {
  const comment = body || `Closing as a duplicate of #${otherNumber}. Let's track this on #${otherNumber}.`;
  const res = await dispatch(ctx, [
    { method: "POST", path: `${base(ctx)}/comments`, body: { body: comment } },
    { method: "POST", path: `${base(ctx)}/labels`, body: { labels: ["duplicate"] } },
    { method: "PATCH", path: base(ctx), body: { state: "closed", state_reason: "not_planned" } },
  ]);
  return { ...res, action: "close_as_duplicate_of" };
}

// 5) request_more_info — comment + needs-more-info label
export async function request_more_info(ctx: ExecContext, body: string): Promise<ActionResult> {
  const res = await dispatch(ctx, [
    { method: "POST", path: `${base(ctx)}/comments`, body: { body } },
    { method: "POST", path: `${base(ctx)}/labels`, body: { labels: ["needs-more-info"] } },
  ]);
  return { ...res, action: "request_more_info" };
}

/** Dispatch the maintainer-approved action through the right RPA executor. */
export async function executeApprovedAction(
  caseRec: CaseRecord,
  action: ApprovedAction,
  opts: { token?: string; dryRun: boolean }
): Promise<ActionResult> {
  const [owner, repo] = caseRec.repo_full_name.split("/");
  const ctx: ExecContext = {
    owner,
    repo,
    issueNumber: caseRec.github_issue_number,
    token: opts.token,
    dryRun: opts.dryRun,
  };
  const p = action.params as any;
  switch (action.type) {
    case "post_comment":
      return post_comment(ctx, p.body ?? caseRec.draft_response);
    case "apply_labels":
      return apply_labels(ctx, p.labels ?? []);
    case "close_issue":
      return close_issue(ctx, p.reason ?? "completed");
    case "close_as_duplicate_of":
      return close_as_duplicate_of(ctx, p.other_number, p.body ?? caseRec.draft_response);
    case "request_more_info":
      return request_more_info(ctx, p.body ?? caseRec.draft_response);
    default:
      throw new Error(`unknown action type: ${(action as any).type}`);
  }
}
