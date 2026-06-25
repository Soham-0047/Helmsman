import type { AuditEntry, CaseRecord } from "./types";
import type { LearningStats } from "./insights";

export const GATEWAY =
  process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

export const api = {
  gateway: GATEWAY,
  health: () => j<any>("/health"),
  adminInfo: () => j<any>("/api/admin/info"),
  metrics: () => j<any>("/api/metrics"),

  listCases: (params: { repo_id?: string; stage?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.repo_id) q.set("repo_id", params.repo_id);
    if (params.stage) q.set("stage", params.stage);
    if (params.limit) q.set("limit", String(params.limit));
    return j<{ cases: CaseRecord[] }>(`/api/cases?${q}`);
  },
  getCase: (id: string) => j<{ case: CaseRecord }>(`/api/cases/${id}`),
  getAudit: (id: string) => j<{ audit: AuditEntry[] }>(`/api/cases/${id}/audit`),
  streamUrl: (id: string) => `${GATEWAY}/api/cases/${id}/stream`,

  approve: (id: string, body: { editedDraft?: string; action?: any; rating?: number } = {}) =>
    j<any>(`/api/cases/${id}/approve`, { method: "POST", body: JSON.stringify(body) }),
  reject: (id: string, reason = "", rating?: number) =>
    j<any>(`/api/cases/${id}/reject`, { method: "POST", body: JSON.stringify({ reason, rating }) }),
  saveDraft: (id: string, draft: string) =>
    j<any>(`/api/cases/${id}/draft`, { method: "PATCH", body: JSON.stringify({ draft }) }),

  listRepos: () => j<{ repos: any[] }>("/api/repos"),
  connectRepo: (body: { owner: string; name: string }) =>
    j<any>("/api/repos/connect", { method: "POST", body: JSON.stringify(body) }),

  // Closed learning loop: metrics for the Learning view + dataset download URL.
  learning: (repoId: string) =>
    j<{ ok: boolean; learning: LearningStats; voice_profile: any }>(`/api/repos/${repoId}/learning`),
  datasetUrl: (repoId: string, format: "sft" | "dpo") =>
    `${GATEWAY}/api/repos/${repoId}/dataset?format=${format}`,

  demoFixtures: () => j<any>("/demo/fixtures"),
  runDemo: (fixtureId?: string, opts: { wait?: boolean } = {}) =>
    j<{ ok: boolean; case: CaseRecord; stream_url: string }>(
      `/demo/run?wait=${opts.wait === false ? 0 : 1}`,
      { method: "POST", body: JSON.stringify({ fixtureId }) }
    ),
};

export function priorityBand(score: number | null): "high" | "mid" | "low" {
  if (score == null) return "low";
  if (score >= 8) return "high";
  if (score >= 5) return "mid";
  return "low";
}
