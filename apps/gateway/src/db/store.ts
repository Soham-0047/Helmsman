import crypto from "node:crypto";
import { config } from "../config.ts";
import type { AuditEntry, CaseRecord, IssueRef, RepoRef, Stage } from "../types.ts";

export interface NewCaseInput {
  repo: RepoRef;
  issue: IssueRef;
  uipath_case_id?: string | null;
}

export interface CaseFilter {
  repo_id?: string;
  stage?: string;
  limit?: number;
}

export interface Store {
  init(): Promise<void>;
  kind(): string;
  upsertRepo(repo: Omit<RepoRef, "id">): Promise<RepoRef>;
  getRepo(id: string): Promise<RepoRef | null>;
  getRepoByFullName(fullName: string): Promise<RepoRef | null>;
  listRepos(): Promise<RepoRef[]>;
  setVoiceProfile(repoId: string, profile: Record<string, unknown>): Promise<void>;

  createCase(input: NewCaseInput): Promise<CaseRecord>;
  getCase(id: string): Promise<CaseRecord | null>;
  findCase(repoId: string, issueNumber: number): Promise<CaseRecord | null>;
  deleteCase(id: string): Promise<void>;
  listCases(filter: CaseFilter): Promise<CaseRecord[]>;
  updateCase(id: string, patch: Partial<CaseRecord>): Promise<CaseRecord>;

  appendAudit(entry: Omit<AuditEntry, "id" | "occurred_at">): Promise<void>;
  listAudit(caseId: string): Promise<AuditEntry[]>;
}

const now = () => new Date().toISOString();

// --------------------------- In-memory store --------------------------------

class MemoryStore implements Store {
  private repos = new Map<string, RepoRef>();
  private cases = new Map<string, CaseRecord>();
  private audit: AuditEntry[] = [];
  private auditSeq = 1;

  async init() {}
  kind() {
    return "memory";
  }

  async upsertRepo(repo: Omit<RepoRef, "id">): Promise<RepoRef> {
    const existing = [...this.repos.values()].find((r) => r.full_name === repo.full_name);
    if (existing) {
      Object.assign(existing, repo);
      return existing;
    }
    const rec: RepoRef = { id: crypto.randomUUID(), ...repo };
    this.repos.set(rec.id, rec);
    return rec;
  }
  async getRepo(id: string) {
    return this.repos.get(id) ?? null;
  }
  async getRepoByFullName(fullName: string) {
    return [...this.repos.values()].find((r) => r.full_name === fullName) ?? null;
  }
  async listRepos() {
    return [...this.repos.values()];
  }
  async setVoiceProfile(repoId: string, profile: Record<string, unknown>) {
    const r = this.repos.get(repoId);
    if (r) r.voice_profile = profile;
  }

  async createCase(input: NewCaseInput): Promise<CaseRecord> {
    const existing = await this.findCase(input.repo.id, input.issue.number);
    if (existing) return existing;
    const ts = now();
    const rec: CaseRecord = {
      id: crypto.randomUUID(),
      repo_id: input.repo.id,
      repo_full_name: input.repo.full_name,
      github_issue_number: input.issue.number,
      uipath_case_id: input.uipath_case_id ?? null,
      current_stage: "Intake",
      classification: null,
      priority_score: null,
      pipeline_outputs: {},
      draft_response: "",
      approved_action: null,
      recommended_action: null,
      issue: input.issue,
      created_at: ts,
      updated_at: ts,
      approved_at: null,
      executed_at: null,
      completed_at: null,
    };
    this.cases.set(rec.id, rec);
    return rec;
  }
  async getCase(id: string) {
    return this.cases.get(id) ?? null;
  }
  async findCase(repoId: string, issueNumber: number) {
    return (
      [...this.cases.values()].find(
        (c) => c.repo_id === repoId && c.github_issue_number === issueNumber
      ) ?? null
    );
  }
  async listCases(filter: CaseFilter) {
    let list = [...this.cases.values()];
    if (filter.repo_id) list = list.filter((c) => c.repo_id === filter.repo_id);
    if (filter.stage) list = list.filter((c) => c.current_stage === filter.stage);
    list.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    return list.slice(0, filter.limit ?? 100);
  }
  async updateCase(id: string, patch: Partial<CaseRecord>) {
    const rec = this.cases.get(id);
    if (!rec) throw new Error(`case not found: ${id}`);
    Object.assign(rec, patch, { updated_at: now() });
    return rec;
  }
  async deleteCase(id: string) {
    this.cases.delete(id);
    this.audit = this.audit.filter((a) => a.case_id !== id);
  }

  async appendAudit(entry: Omit<AuditEntry, "id" | "occurred_at">) {
    this.audit.push({ ...entry, id: this.auditSeq++, occurred_at: now() });
  }
  async listAudit(caseId: string) {
    return this.audit.filter((a) => a.case_id === caseId);
  }
}

// --------------------------- Postgres store ---------------------------------
// Live mode (DATABASE_URL set). Mirrors db/schema.sql. Lazily imports pg so
// demo mode needs no driver.

class PgStore implements Store {
  private pool: any;
  constructor(private dsn: string) {}
  kind() {
    return "postgres";
  }
  async init() {
    const { default: pg } = await import("pg");
    this.pool = new pg.Pool({ connectionString: this.dsn, max: 5 });
    await this.pool.query("SELECT 1");
  }
  private q(text: string, params: unknown[] = []) {
    return this.pool.query(text, params);
  }

  async upsertRepo(repo: Omit<RepoRef, "id">): Promise<RepoRef> {
    const { rows } = await this.q(
      `INSERT INTO repos (github_id, owner, name, webhook_secret, voice_profile)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (github_id) DO UPDATE SET owner=EXCLUDED.owner, name=EXCLUDED.name
       RETURNING id`,
      [repo.github_id, repo.owner, repo.name, "demo-secret", repo.voice_profile ?? null]
    );
    return { id: rows[0].id, ...repo };
  }
  async getRepo(id: string) {
    const { rows } = await this.q(`SELECT * FROM repos WHERE id=$1`, [id]);
    return rows[0] ? this.rowToRepo(rows[0]) : null;
  }
  async getRepoByFullName(fullName: string) {
    const [owner, name] = fullName.split("/");
    const { rows } = await this.q(`SELECT * FROM repos WHERE owner=$1 AND name=$2`, [owner, name]);
    return rows[0] ? this.rowToRepo(rows[0]) : null;
  }
  async listRepos() {
    const { rows } = await this.q(`SELECT * FROM repos ORDER BY connected_at DESC`);
    return rows.map((r: any) => this.rowToRepo(r));
  }
  async setVoiceProfile(repoId: string, profile: Record<string, unknown>) {
    await this.q(`UPDATE repos SET voice_profile=$2 WHERE id=$1`, [repoId, profile]);
  }
  private rowToRepo(r: any): RepoRef {
    return {
      id: r.id,
      github_id: Number(r.github_id),
      owner: r.owner,
      name: r.name,
      full_name: `${r.owner}/${r.name}`,
      default_branch: "main",
      head_sha: "HEAD",
      voice_profile: r.voice_profile,
    };
  }

  async createCase(input: NewCaseInput): Promise<CaseRecord> {
    const { rows } = await this.q(
      `INSERT INTO cases (repo_id, github_issue_number, uipath_case_id, current_stage)
       VALUES ($1,$2,$3,'Intake')
       ON CONFLICT (repo_id, github_issue_number) DO UPDATE SET updated_at=NOW()
       RETURNING id, created_at, updated_at`,
      [input.repo.id, input.issue.number, input.uipath_case_id ?? null]
    );
    const r = rows[0];
    return {
      id: r.id,
      repo_id: input.repo.id,
      repo_full_name: input.repo.full_name,
      github_issue_number: input.issue.number,
      uipath_case_id: input.uipath_case_id ?? null,
      current_stage: "Intake",
      classification: null,
      priority_score: null,
      pipeline_outputs: {},
      draft_response: "",
      approved_action: null,
      recommended_action: null,
      issue: input.issue,
      created_at: r.created_at,
      updated_at: r.updated_at,
      approved_at: null,
      executed_at: null,
      completed_at: null,
    };
  }
  async getCase(id: string) {
    const { rows } = await this.q(`SELECT * FROM cases WHERE id=$1`, [id]);
    return rows[0] ? this.rowToCase(rows[0]) : null;
  }
  async findCase(repoId: string, issueNumber: number) {
    const { rows } = await this.q(`SELECT * FROM cases WHERE repo_id=$1 AND github_issue_number=$2`, [
      repoId,
      issueNumber,
    ]);
    return rows[0] ? this.rowToCase(rows[0]) : null;
  }
  async listCases(filter: CaseFilter) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.repo_id) {
      params.push(filter.repo_id);
      where.push(`repo_id=$${params.length}`);
    }
    if (filter.stage) {
      params.push(filter.stage);
      where.push(`current_stage=$${params.length}`);
    }
    params.push(filter.limit ?? 100);
    const { rows } = await this.q(
      `SELECT * FROM cases ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY updated_at DESC LIMIT $${params.length}`,
      params
    );
    return rows.map((r: any) => this.rowToCase(r));
  }
  async updateCase(id: string, patch: Partial<CaseRecord>) {
    const cols: string[] = [];
    const params: unknown[] = [id];
    const map: Record<string, string> = {
      current_stage: "current_stage",
      classification: "classification",
      priority_score: "priority_score",
      pipeline_outputs: "pipeline_outputs",
      draft_response: "draft_response",
      approved_action: "approved_action",
      approved_at: "approved_at",
      executed_at: "executed_at",
      completed_at: "completed_at",
    };
    for (const [k, col] of Object.entries(map)) {
      if (k in patch) {
        params.push((patch as any)[k]);
        cols.push(`${col}=$${params.length}`);
      }
    }
    if (cols.length) await this.q(`UPDATE cases SET ${cols.join(", ")} WHERE id=$1`, params);
    return (await this.getCase(id))!;
  }
  async deleteCase(id: string) {
    await this.q(`DELETE FROM cases WHERE id=$1`, [id]); // audit_log cascades
  }
  private rowToCase(r: any): CaseRecord {
    return {
      id: r.id,
      repo_id: r.repo_id,
      repo_full_name: "",
      github_issue_number: r.github_issue_number,
      uipath_case_id: r.uipath_case_id,
      current_stage: r.current_stage as Stage,
      classification: r.classification,
      priority_score: r.priority_score,
      pipeline_outputs: r.pipeline_outputs ?? {},
      draft_response: r.draft_response ?? "",
      approved_action: r.approved_action,
      recommended_action: r.pipeline_outputs?.responder?.recommended_action ?? null,
      issue: { number: r.github_issue_number, title: "", body: "", author: "", author_is_contributor: false, reactions: 0, age_hours: 0, existing_labels: [] },
      created_at: r.created_at,
      updated_at: r.updated_at,
      approved_at: r.approved_at,
      executed_at: r.executed_at,
      completed_at: r.completed_at,
    };
  }

  async appendAudit(entry: Omit<AuditEntry, "id" | "occurred_at">) {
    await this.q(
      `INSERT INTO audit_log (case_id, actor_type, actor_name, action, input, output)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [entry.case_id, entry.actor_type, entry.actor_name, entry.action, entry.input ?? null, entry.output ?? null]
    );
  }
  async listAudit(caseId: string) {
    const { rows } = await this.q(`SELECT * FROM audit_log WHERE case_id=$1 ORDER BY occurred_at ASC`, [caseId]);
    return rows as AuditEntry[];
  }
}

let _store: Store | null = null;

export async function getStore(): Promise<Store> {
  if (_store) return _store;
  if (config.databaseUrl && config.mode === "live") {
    try {
      const pg = new PgStore(config.databaseUrl);
      await pg.init();
      _store = pg;
      return pg;
    } catch (e) {
      console.warn("[store] Postgres unavailable, using in-memory store:", (e as Error).message);
    }
  }
  const mem = new MemoryStore();
  await mem.init();
  _store = mem;
  return mem;
}
