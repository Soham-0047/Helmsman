// UiPath Maestro Case bridge.
//
// In live mode this drives a real UiPath Automation Cloud Maestro Case via the
// Orchestrator API: create a case instance, advance stages, and trigger the
// approval transition + RPA job. In demo mode (UIPATH_LOCAL_SIMULATOR=true) a
// local simulator advances the exact same seven-stage state machine and records
// transitions — so the orchestration logic, audit trail, and stage progression
// are identical whether or not UiPath credentials are present.
import crypto from "node:crypto";
import { config } from "../config.ts";
import { STAGES, type Stage } from "../types.ts";

export interface MaestroCase {
  caseId: string;
  stage: Stage;
  simulated: boolean;
}

// transition guard: stages only move forward along the defined order
function canAdvance(from: Stage, to: Stage): boolean {
  return STAGES.indexOf(to) >= STAGES.indexOf(from);
}

class LocalMaestro {
  private cases = new Map<string, Stage>();

  async createCase(repoFullName: string, issueNumber: number): Promise<MaestroCase> {
    const caseId = `sim-${crypto.randomUUID().slice(0, 8)}`;
    this.cases.set(caseId, "Intake");
    return { caseId, stage: "Intake", simulated: true };
  }

  async advance(caseId: string, to: Stage): Promise<MaestroCase> {
    const from = this.cases.get(caseId) ?? "Intake";
    if (!canAdvance(from, to)) {
      throw new Error(`illegal Maestro transition ${from} -> ${to}`);
    }
    this.cases.set(caseId, to);
    return { caseId, stage: to, simulated: true };
  }
}

class RemoteMaestro {
  private token = "";
  private tokenExp = 0;

  private async auth(): Promise<string> {
    const now = Date.now();
    if (this.token && now < this.tokenExp) return this.token;
    const r = await fetch(`${config.uipath.orchUrl}/identity_/connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.uipath.clientId,
        client_secret: config.uipath.clientSecret,
        scope: "OR.Execution OR.Jobs",
      }),
    });
    if (!r.ok) throw new Error(`uipath auth ${r.status}`);
    const data = (await r.json()) as { access_token: string; expires_in: number };
    this.token = data.access_token;
    this.tokenExp = now + (data.expires_in - 60) * 1000;
    return this.token;
  }

  async createCase(repoFullName: string, issueNumber: number): Promise<MaestroCase> {
    const token = await this.auth();
    // Start a Maestro Case instance for the configured process key.
    const r = await fetch(`${config.uipath.orchUrl}/${config.uipath.tenant}/orchestrator_/t/maestro/cases`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        processKey: config.uipath.processKey,
        input: { repo: repoFullName, issueNumber },
      }),
    });
    if (!r.ok) throw new Error(`uipath createCase ${r.status}`);
    const data = (await r.json()) as { caseId: string; stage: string };
    return { caseId: data.caseId, stage: (data.stage as Stage) ?? "Intake", simulated: false };
  }

  async advance(caseId: string, to: Stage): Promise<MaestroCase> {
    const token = await this.auth();
    const r = await fetch(
      `${config.uipath.orchUrl}/${config.uipath.tenant}/orchestrator_/t/maestro/cases/${caseId}/transition`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ toStage: to }),
      }
    );
    if (!r.ok) throw new Error(`uipath advance ${r.status}`);
    return { caseId, stage: to, simulated: false };
  }
}

const useRemote = !config.uipath.useSimulator && !!config.uipath.orchUrl;
export const maestro = useRemote ? new RemoteMaestro() : new LocalMaestro();
export const MAESTRO_MODE = useRemote ? "uipath-cloud" : "local-simulator";
