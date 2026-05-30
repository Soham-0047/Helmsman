"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "../../components/Brand";
import { ThemeToggle } from "../../components/ThemeToggle";
import { api } from "../../lib/api";

const STEPS = ["Connect GitHub", "Pick a repo", "Profile your voice"];
const CHECKLIST = [
  "Repository linked",
  "Historical issues indexed for duplicate detection",
  "Maintainer voice fingerprint built",
  "Webhook armed · issues will flow into triage",
];

export default function Connect() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function connectDemo() {
    setBusy(true);
    setError(null);
    setStep(1);
    try {
      await api.connectRepo({ owner: "helmsman-demo", name: "fastlane-parser" });
      setStep(2);
      // staggered checklist reveal
      for (let i = 0; i < CHECKLIST.length; i++) {
        await new Promise((r) => setTimeout(r, 600));
        setDone(i + 1);
      }
      await new Promise((r) => setTimeout(r, 700));
      router.push("/dashboard?demo=1");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <nav className="nav">
        <Link href="/"><Logo /></Link>
        <ThemeToggle />
      </nav>
      <div className="container" style={{ maxWidth: 640, padding: "60px 24px", textAlign: "center" }}>
        {/* step indicator */}
        <div className="row" style={{ justifyContent: "center", gap: 0, marginBottom: 40 }}>
          {STEPS.map((s, i) => (
            <div key={s} className="row" style={{ gap: 0 }}>
              <div className="stack" style={{ alignItems: "center", gap: 6, width: 120 }}>
                <svg width="40" height="40" viewBox="0 0 40 40">
                  <circle cx="20" cy="20" r="17" fill="none" stroke={i <= step ? "var(--accent)" : "var(--border)"} strokeWidth="2" />
                  {i < step ? (
                    <path d="M13 20 l5 5 l9 -11" fill="none" stroke="var(--accent)" strokeWidth="2.5"
                      strokeDasharray="30" strokeDashoffset="0" style={{ transition: "stroke-dashoffset .4s" }} />
                  ) : (
                    <text x="20" y="25" textAnchor="middle" fontSize="14" fontWeight="700" fill={i <= step ? "var(--accent)" : "var(--text-muted)"}>{i + 1}</text>
                  )}
                </svg>
                <span className="label" style={{ fontSize: 11, color: i <= step ? "var(--text-primary)" : "var(--text-muted)" }}>{s}</span>
              </div>
            </div>
          ))}
        </div>

        {step < 2 ? (
          <>
            <h1 style={{ marginBottom: 12 }}>Connect a repository</h1>
            <p className="muted" style={{ marginBottom: 28 }}>
              Helmsman watches new issues and runs the seven-agent pipeline. You stay in control —
              nothing is posted without your approval.
            </p>
            <div className="stack" style={{ maxWidth: 360, margin: "0 auto" }}>
              <a className="btn btn-primary" href={`${api.gateway}/auth/github/start`} style={{ justifyContent: "center", padding: 14 }}>
                <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" /></svg>
                Connect with GitHub
              </a>
              <div className="muted" style={{ fontSize: 13 }}>— or —</div>
              <button className="btn" onClick={connectDemo} disabled={busy} style={{ justifyContent: "center", padding: 14 }}>
                {busy ? "Connecting…" : "▶ Run on the demo repo (no setup)"}
              </button>
              {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error} — is the gateway running?</p>}
            </div>
          </>
        ) : (
          <div className="card" style={{ textAlign: "left", animation: "rise .4s ease" }}>
            <h2 style={{ marginBottom: 4 }}>helmsman-demo/fastlane-parser</h2>
            <p className="muted" style={{ marginBottom: 20 }}>Setting things up…</p>
            <div className="stack">
              {CHECKLIST.map((item, i) => (
                <div key={item} className="row" style={{ gap: 10, opacity: i < done ? 1 : 0.35, transition: "opacity .4s" }}>
                  <span style={{ color: i < done ? "var(--green)" : "var(--text-muted)" }}>{i < done ? "✓" : "○"}</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
            {done >= CHECKLIST.length && <p className="pill" style={{ marginTop: 20 }}>⚓ Helmsman is ready</p>}
          </div>
        )}
      </div>
    </>
  );
}
