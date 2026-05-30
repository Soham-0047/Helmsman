"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Logo } from "../../components/Brand";
import { ThemeToggle } from "../../components/ThemeToggle";
import { CaseReview } from "../../components/CaseReview";
import { api, priorityBand } from "../../lib/api";
import type { CaseRecord } from "../../lib/types";

export default function Dashboard() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [admin, setAdmin] = useState<any>(null);
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [fixtureId, setFixtureId] = useState("fix-001");
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { cases } = await api.listCases({ limit: 50 });
      setCases(cases);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  const runDemo = useCallback(
    async (id: string) => {
      setRunning(true);
      setErr(null);
      try {
        const r = await api.runDemo(id, { wait: false });
        setSelected(r.case.id);
        await refresh();
        // poll list a few times as the async pipeline advances
        [400, 1000, 2000].forEach((t) => setTimeout(refresh, t));
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setRunning(false);
      }
    },
    [refresh]
  );

  useEffect(() => {
    api.adminInfo().then(setAdmin).catch(() => {});
    api.demoFixtures().then((f) => {
      setFixtures(f.issues || []);
      setFixtureId(f.default || "fix-001");
    }).catch(() => {});
    refresh();
    // auto-run when arriving from the landing CTA (?demo=1)
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1") {
      setTimeout(() => runDemo("fix-001"), 300);
    }
  }, [refresh, runDemo]);

  return (
    <div className="app-shell">
      {/* ---- sidebar ---- */}
      <aside className="sidebar">
        <Link href="/"><Logo /></Link>
        <div className="stack" style={{ marginTop: 24 }}>
          <span className="label">Pipeline</span>
          <Link href="/dashboard" className="row" style={{ gap: 8, fontWeight: 600 }}>⚓ Cases</Link>
          <Link href="/connect" className="row muted" style={{ gap: 8 }}>＋ Connect repo</Link>
        </div>

        <div className="divider" />
        <span className="label">Control plane</span>
        <div className="card" style={{ padding: 12, marginTop: 8, fontSize: 12 }}>
          <div className="muted" style={{ marginBottom: 6 }}>Admin Service</div>
          <div className="row between"><span>Routing</span><span className="tag">{admin?.local_fallback ? "local fallback" : "live"}</span></div>
          <div className="row between" style={{ marginTop: 4 }}><span>Maestro</span><span className="tag">{admin?.maestro ?? "…"}</span></div>
          <div style={{ marginTop: 8 }} className="muted">Prompts ({admin?.prompt_keys?.length ?? 0})</div>
          <div className="wrap" style={{ marginTop: 4 }}>
            {(admin?.prompt_keys || []).slice(0, 7).map((k: string) => (
              <span key={k} className="tag" style={{ fontSize: 10 }}>{k.replace("helmsman.", "")}</span>
            ))}
          </div>
          <div style={{ marginTop: 8 }} className="muted">Flags</div>
          <div className="wrap" style={{ marginTop: 4 }}>
            {(admin?.flags || []).map((f: any) => (
              <span key={f.key} className="tag" style={{ fontSize: 10 }}>{f.key.replace("helmsman.", "")}: {f.strategy}</span>
            ))}
          </div>
        </div>
        <ThemeToggle />
      </aside>

      {/* ---- feed ---- */}
      <main className="feed">
        <div className="row between" style={{ marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>Issue triage</h2>
            <span className="muted" style={{ fontSize: 13 }}>{cases.length} cases · human-in-the-loop</span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <select className="btn" value={fixtureId} onChange={(e) => setFixtureId(e.target.value)} style={{ padding: "8px 10px" }}>
              {fixtures.map((f) => (
                <option key={f.id} value={f.id}>#{f.number} · {f.title.slice(0, 40)}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={() => runDemo(fixtureId)} disabled={running}>
              {running ? "Running…" : "▶ Run pipeline"}
            </button>
          </div>
        </div>

        {err && <div className="card" style={{ borderColor: "var(--red)", marginBottom: 12 }}>Gateway error: {err}. Is <span className="mono">npm run dev</span> running?</div>}

        {cases.length === 0 && !err && (
          <div className="card" style={{ textAlign: "center", padding: 48 }}>
            <p className="muted">No cases yet. Pick a fixture issue and hit <b>Run pipeline</b> to watch the seven agents fire.</p>
          </div>
        )}

        <div className="stack" style={{ gap: 0 }}>
          {cases.map((c) => {
            const band = priorityBand(c.priority_score);
            const pending = c.current_stage === "Pending Approval";
            return (
              <div
                key={c.id}
                className={`case-card ${pending ? "pending" : ""}`}
                onClick={() => setSelected(c.id)}
                style={{ borderColor: selected === c.id ? "var(--accent)" : undefined }}
              >
                <span className={`strip strip-${band}`} />
                <div className="row between">
                  <span className="mono muted" style={{ fontSize: 12 }}>#{c.github_issue_number}</span>
                  <span className="tag">{c.current_stage}</span>
                </div>
                <div style={{ fontWeight: 600, margin: "4px 0" }}>{c.issue.title}</div>
                <div className="wrap">
                  {c.classification && <span className="pill">{c.classification}</span>}
                  {c.priority_score != null && <span className="tag">priority {c.priority_score}/10</span>}
                  <span className="muted" style={{ fontSize: 12 }}>@{c.issue.author}</span>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* ---- detail panel ---- */}
      <aside className={`detail-panel ${selected ? "" : "closed"}`}>
        {selected && (
          <>
            <div className="row between" style={{ padding: "14px 18px 0" }}>
              <span className="label">Case review</span>
              <button className="btn btn-ghost" onClick={() => setSelected(null)}>✕</button>
            </div>
            <CaseReview caseId={selected} onChanged={refresh} />
          </>
        )}
      </aside>
    </div>
  );
}
