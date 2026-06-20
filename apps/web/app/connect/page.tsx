"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { Anchor, UIcon } from "../../components/icons";
import { TopNav } from "../../components/shell";
import { Button, Pill, ThemeToggle } from "../../components/ui";

const STEPS = ["Connect GitHub", "Pick a repo", "Profile your voice"];
const SETUP_ITEMS = [
  "Repository linked",
  "Historical issues indexed for duplicate detection",
  "Maintainer voice fingerprint built",
  "Webhook armed · issues will flow into triage",
];

type Phase = 0 | "setup" | "done";

function StepIndicator({ phase }: { phase: 0 | 1 | "done" }) {
  const stepState = (i: number) => {
    if (phase === "done") return "done";
    if (phase === 0) return i === 0 ? "current" : "todo";
    return i === 0 ? "done" : i === 1 ? "current" : "todo";
  };
  return (
    <div className="row center" style={{ gap: 0, marginBottom: 36 }}>
      {STEPS.map((s, i) => {
        const st = stepState(i);
        return (
          <span key={s} className="row" style={{ gap: 0 }}>
            <div className="col" style={{ alignItems: "center", gap: 8, flex: "none" }}>
              <div className={`step-circle ${st === "done" ? "done" : st === "current" ? "current" : ""}`}>
                {st === "done" ? <UIcon name="check" size={15} /> : i + 1}
              </div>
              <span
                className="t-xs"
                style={{
                  color: st === "todo" ? "var(--text-muted)" : "var(--text)",
                  fontWeight: st === "current" ? 600 : 500,
                  maxWidth: 90,
                  textAlign: "center",
                }}
              >
                {s}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  width: 56,
                  height: 1.5,
                  background: st === "done" ? "var(--accent)" : "var(--border)",
                  marginTop: -20,
                  borderRadius: 2,
                  transition: "background 0.3s var(--ease)",
                }}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

export default function Connect() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(0);
  const [revealed, setRevealed] = useState(0);
  const [error, setError] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const startDemo = () => {
    setError(false);
    setPhase("setup");
    setRevealed(0);
    // best-effort real connect; the checklist plays out regardless
    api.connectRepo({ owner: "helmsman-demo", name: "fastlane-parser" }).catch(() => {});
    SETUP_ITEMS.forEach((_, i) => {
      const tm = setTimeout(() => {
        setRevealed(i + 1);
        if (i === SETUP_ITEMS.length - 1) setTimeout(() => setPhase("done"), 700);
      }, 700 + i * 850);
      timers.current.push(tm);
    });
  };

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const indicatorPhase = phase === 0 ? 0 : phase === "done" ? "done" : 1;

  return (
    <div className="col" style={{ height: "100%", overflowY: "auto" }}>
      <TopNav right={<ThemeToggle />} />
      <div style={{ flex: 1, padding: "48px 24px 80px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <StepIndicator phase={indicatorPhase} />

          {phase === 0 && (
            <div className="card card-pad rise" style={{ padding: 32 }}>
              <h1 className="t-h2" style={{ marginBottom: 8 }}>
                Connect a repository
              </h1>
              <p className="text-secondary" style={{ marginBottom: 24 }}>
                Helmsman watches new issues and runs the seven-agent pipeline. You stay in control — nothing is posted
                without your approval.
              </p>
              <a
                className="btn btn-primary btn-lg btn-block"
                href={`${api.gateway}/auth/github/start`}
                onClick={(e) => {
                  // if the gateway isn't reachable the user can fall back to demo
                  e.preventDefault();
                  setError(true);
                }}
              >
                <UIcon name="github" size={17} /> Connect with GitHub
              </a>
              {error && (
                <p className="t-sm" style={{ color: "var(--red)", marginTop: 10 }}>
                  Couldn&apos;t reach the gateway. Try the demo repo below.
                </p>
              )}
              <div className="divider-or" style={{ margin: "22px 0" }}>
                or
              </div>
              <Button variant="secondary" size="lg" block icon={<UIcon name="play" size={15} />} onClick={startDemo}>
                Run on the demo repo (no setup)
              </Button>
            </div>
          )}

          {(phase === "setup" || phase === "done") && (
            <div className="card card-pad rise" style={{ padding: 32 }}>
              <div className="row gap-10" style={{ marginBottom: 4 }}>
                <span style={{ color: "var(--accent)", display: "inline-flex" }}>
                  <Anchor size={18} />
                </span>
                <h1 className="t-h3 mono">helmsman-demo/fastlane-parser</h1>
              </div>
              <p className="t-sm text-secondary" style={{ marginBottom: 18 }}>
                {phase === "done" ? "All set." : "Setting things up…"}
              </p>
              <div>
                {SETUP_ITEMS.map((item, i) => {
                  const done = revealed > i;
                  const visible = revealed >= i;
                  if (!visible && phase !== "done") return null;
                  return (
                    <div key={i} className="check-item rise" style={{ animationDuration: "0.3s" }}>
                      <span className={`check-ring ${done ? "done" : ""}`}>
                        {done ? (
                          <UIcon name="check" size={13} />
                        ) : (
                          <span className="spinner" style={{ width: 11, height: 11, color: "var(--accent)" }} />
                        )}
                      </span>
                      <span className="t-sm" style={{ color: done ? "var(--text)" : "var(--text-secondary)" }}>
                        {item}
                      </span>
                    </div>
                  );
                })}
              </div>

              {phase === "done" && (
                <div className="rise" style={{ marginTop: 22 }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                    <Pill>
                      <span style={{ display: "inline-flex" }}>
                        <Anchor size={13} />
                      </span>{" "}
                      Helmsman is ready
                    </Pill>
                  </div>
                  <Button
                    variant="primary"
                    size="lg"
                    block
                    iconRight={<UIcon name="arrowRight" size={15} />}
                    onClick={() => router.push("/dashboard?demo=1")}
                  >
                    Go to dashboard
                  </Button>
                </div>
              )}
            </div>
          )}

          <p className="t-xs text-muted" style={{ textAlign: "center", marginTop: 20 }}>
            This is a demo · no GitHub account is touched.
          </p>
        </div>
      </div>
    </div>
  );
}
