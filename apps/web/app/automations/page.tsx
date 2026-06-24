"use client";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_RULES, loadRules, RULE_ACTIVITY, saveRules, type Rule, type RuleMode } from "../../lib/automations";
import { UIcon } from "../../components/icons";
import { AppShell } from "../../components/shell";
import { Reveal, Tag, useToast } from "../../components/ui";

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <span role="switch" aria-checked={on} className={`switch ${on ? "on" : ""}`} onClick={onClick} />;
}

function ModeToggle({ mode, onChange }: { mode: RuleMode; onChange: (m: RuleMode) => void }) {
  const opt = (m: RuleMode, label: string) => (
    <button
      onClick={() => onChange(m)}
      className="t-xs"
      style={{
        padding: "4px 10px",
        borderRadius: 6,
        fontWeight: 600,
        background: mode === m ? "var(--accent-soft)" : "transparent",
        color: mode === m ? "var(--accent)" : "var(--text-muted)",
        border: `1px solid ${mode === m ? "var(--accent-line)" : "var(--border)"}`,
        transition: "all 0.13s var(--ease)",
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="row gap-6">
      {opt("auto", "Auto-run")}
      {opt("suggest", "Review first")}
    </div>
  );
}

function RuleCard({ rule, onPatch }: { rule: Rule; onPatch: (p: Partial<Rule>) => void }) {
  return (
    <div className={`rule-card ${rule.enabled ? "on" : ""}`} style={{ opacity: rule.enabled ? 1 : 0.62, transition: "opacity 0.18s var(--ease)" }}>
      <div className="row between gap-12" style={{ alignItems: "flex-start" }}>
        <div className="row gap-12" style={{ alignItems: "flex-start" }}>
          <span className="feat-ic" style={{ width: 34, height: 34, marginBottom: 0, flex: "none" }}>
            <UIcon name={rule.icon} size={16} />
          </span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>{rule.name}</div>
            <p className="t-sm text-secondary" style={{ marginTop: 3, maxWidth: 460 }}>
              {rule.desc}
            </p>
          </div>
        </div>
        <Switch on={rule.enabled} onClick={() => onPatch({ enabled: !rule.enabled })} />
      </div>

      <div className="cond-flow" style={{ marginTop: 14 }}>
        <span className="t-xs text-muted mono">WHEN</span>
        {rule.conditions.map((c) => (
          <span key={c} className="cond-chip">
            {c}
          </span>
        ))}
        <span style={{ color: "var(--text-muted)", display: "inline-flex" }}>
          <UIcon name="arrowRight" size={14} />
        </span>
        <span className="t-xs text-muted mono">THEN</span>
        <span className="cond-chip act">{rule.action}</span>
      </div>

      {rule.threshold != null && rule.enabled && (
        <div style={{ marginTop: 14 }}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <span className="t-xs text-secondary">{rule.thresholdLabel}</span>
            <span className="mono t-xs" style={{ color: "var(--accent)" }}>
              {rule.threshold}%
            </span>
          </div>
          <input
            type="range"
            className="rng"
            min={50}
            max={99}
            value={rule.threshold}
            onChange={(e) => onPatch({ threshold: Number(e.target.value) })}
          />
        </div>
      )}

      {rule.enabled && (
        <div className="row between" style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <ModeToggle mode={rule.mode} onChange={(m) => onPatch({ mode: m })} />
          <span className="t-xs text-muted mono">fired {rule.fired}× / 30d</span>
        </div>
      )}
    </div>
  );
}

export default function Automations() {
  const { push } = useToast();
  const [rules, setRules] = useState<Rule[]>(DEFAULT_RULES);

  useEffect(() => {
    setRules(loadRules());
  }, []);

  const patch = (id: string, p: Partial<Rule>) => {
    setRules((rs) => {
      const next = rs.map((r) => (r.id === id ? { ...r, ...p } : r));
      saveRules(next);
      if (p.enabled != null) {
        const r = next.find((x) => x.id === id);
        push(
          <span className="row gap-8">
            <UIcon name={p.enabled ? "check" : "pause"} size={14} /> {r?.name} {p.enabled ? "enabled" : "paused"}
          </span>
        );
      }
      return next;
    });
  };

  const active = rules.filter((r) => r.enabled).length;
  const autoCount = rules.filter((r) => r.enabled && r.mode === "auto").length;
  const automated = useMemo(() => rules.filter((r) => r.enabled).reduce((a, r) => a + r.fired, 0), [rules]);

  const byId = (id: string) => DEFAULT_RULES.find((r) => r.id === id);

  return (
    <AppShell active="automations">
      <main className="grow" style={{ overflowY: "auto" }}>
        <div className="hm-feed-inner col gap-16 page-in" style={{ maxWidth: 980 }}>
          <div className="row between wrap gap-12">
            <div>
              <h2 className="t-h2">Automations</h2>
              <p className="t-sm text-secondary" style={{ marginTop: 2 }}>
                Policies that act on the pipeline’s findings — {active} active · {autoCount} auto-run.
              </p>
            </div>
          </div>

          <div
            className="card"
            style={{ borderColor: "var(--accent-line)", background: "var(--accent-soft)", padding: "12px 16px" }}
          >
            <span className="row gap-10 t-sm" style={{ color: "var(--accent)" }}>
              <UIcon name="lock" size={15} />
              <span style={{ color: "var(--text-secondary)" }}>
                Automations only ever run the same audited RPA actions you’d approve by hand. Anything set to{" "}
                <b style={{ color: "var(--text)" }}>Review first</b> lands in your approval queue — never posted automatically.
              </span>
            </span>
          </div>

          <div className="auto-grid">
            <div className="col gap-12">
              {rules.map((r, i) => (
                <Reveal key={r.id} delay={i * 50}>
                  <RuleCard rule={r} onPatch={(p) => patch(r.id, p)} />
                </Reveal>
              ))}
            </div>

            <div className="col gap-12">
              <div className="card card-pad">
                <div className="t-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 12 }}>
                  This month
                </div>
                <div className="col gap-12">
                  <div className="row between">
                    <span className="t-sm text-secondary">Actions automated</span>
                    <span className="mono" style={{ fontSize: 18, fontWeight: 660 }}>
                      {automated}
                    </span>
                  </div>
                  <div className="row between">
                    <span className="t-sm text-secondary">Active rules</span>
                    <span className="mono t-sm">{active}/{rules.length}</span>
                  </div>
                  <div className="row between">
                    <span className="t-sm text-secondary">Gate backstop</span>
                    <Tag tone="green">always on</Tag>
                  </div>
                </div>
              </div>

              <div className="card card-pad">
                <div className="t-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 8 }}>
                  Recent activity
                </div>
                <div className="col">
                  {RULE_ACTIVITY.map((ev, i) => {
                    const r = byId(ev.ruleId);
                    return (
                      <div
                        key={i}
                        className="row gap-10"
                        style={{ padding: "9px 0", borderTop: i ? "1px solid var(--border)" : "none", alignItems: "flex-start" }}
                      >
                        <span style={{ color: "var(--accent)", display: "inline-flex", marginTop: 1 }}>
                          <UIcon name={r?.icon ?? "bolt"} size={14} />
                        </span>
                        <div className="grow">
                          <div className="t-sm">
                            <span className="mono text-muted">#{ev.issue}</span> {ev.text}
                          </div>
                          <div className="t-xs text-muted">{r?.name}</div>
                        </div>
                        <span className="t-xs text-muted" style={{ flex: "none" }}>
                          {ev.ago}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
