"use client";
// AppShell (sidebar + content) and TopNav for non-shell routes.
// ControlPlane pulls live admin state from the gateway, falling back to defaults.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PROMPT_KEYS } from "../lib/agents";
import { api } from "../lib/api";
import { Anchor, UIcon } from "./icons";
import { Logo, StatusDot, Tag, ThemeToggle } from "./ui";

interface AdminInfo {
  local_fallback?: boolean;
  maestro?: string;
  prompt_keys?: string[];
  flags?: { key: string; strategy: string }[];
}

interface MetricsSnapshot {
  counters?: Record<string, number>;
  derived?: {
    llm_success_rate?: number;
    llm_fallback_rate?: number;
    llm_retry_rate?: number;
    embed_cache_hit_rate?: number;
  };
  latency_ms?: Record<string, { p50: number; p95: number; max: number; avg: number; count: number }>;
}

const pct = (x: number | undefined) => `${Math.round((x ?? 0) * 100)}%`;

export function ControlPlane() {
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);

  useEffect(() => {
    api.adminInfo().then(setAdmin).catch(() => {});
    const poll = () => api.metrics().then(setMetrics).catch(() => {});
    poll();
    // live-refresh while the panel is mounted so it ticks during a pipeline run
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, []);

  const routingLive = admin ? !admin.local_fallback : false;
  const prompts = admin?.prompt_keys?.length ? admin.prompt_keys.map((k) => k.replace("helmsman.", "")) : PROMPT_KEYS;
  const flags = admin?.flags?.length
    ? admin.flags.map((f) => ({ key: f.key.replace("helmsman.", ""), strategy: f.strategy }))
    : [
        { key: "shadow_mode", strategy: "off" },
        { key: "auto_label", strategy: "on" },
      ];

  return (
    <div className="card" style={{ padding: 13, background: "var(--bg)", borderRadius: 10 }}>
      <div
        className="t-xs text-muted"
        style={{ textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 10 }}
      >
        Control plane
      </div>
      <div className="col gap-10">
        <div className="row between">
          <span className="t-sm text-secondary">Routing</span>
          <Tag tone={routingLive ? "green" : "amber"}>
            <StatusDot tone={routingLive ? "green" : "amber"} /> {routingLive ? "live" : "local fallback"}
          </Tag>
        </div>
        <div className="row between">
          <span className="t-sm text-secondary">Maestro</span>
          <Tag tone="accent">
            <StatusDot tone="accent" /> {admin?.maestro ?? "connected"}
          </Tag>
        </div>
        <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />
        <div>
          <div className="t-xs text-secondary" style={{ marginBottom: 7 }}>
            Prompts <span className="text-muted">({prompts.length})</span>
          </div>
          <div className="row wrap gap-4">
            {prompts.slice(0, 7).map((p) => (
              <span key={p} className="tag" style={{ fontSize: 10, padding: "1px 5px" }}>
                {p}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="t-xs text-secondary" style={{ marginBottom: 7 }}>
            Flags
          </div>
          <div className="row wrap gap-4">
            {flags.map((f) => (
              <span key={f.key} className="tag" style={{ fontSize: 10, padding: "1px 5px" }}>
                {f.key}:{" "}
                <span style={{ color: f.strategy === "on" ? "var(--green)" : "var(--text-muted)" }}>
                  {f.strategy}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* live runtime efficiency (proxied from the agent runtime /metrics) */}
        {metrics?.counters && (metrics.counters["pipeline.runs"] || metrics.counters["embed.lookups"]) ? (
          <>
            <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />
            <div>
              <div className="t-xs text-secondary" style={{ marginBottom: 7 }}>
                Runtime <span className="text-muted">· live</span>
              </div>
              <div className="col gap-8">
                <MetricBar label="Embed cache" value={metrics.derived?.embed_cache_hit_rate ?? 0} tone="green" />
                <div className="row between">
                  <span className="t-xs text-muted">Model calls</span>
                  <span className="mono t-xs">
                    {metrics.counters["llm.attempt"] ?? 0}
                    {(metrics.counters["llm.attempt"] ?? 0) > 0 && (
                      <span className="text-muted"> · {pct(metrics.derived?.llm_success_rate)} remote</span>
                    )}
                  </span>
                </div>
                {(metrics.counters["llm.retry"] ?? 0) > 0 && (
                  <div className="row between">
                    <span className="t-xs text-muted">Retries</span>
                    <span className="mono t-xs">{metrics.counters["llm.retry"]}</span>
                  </div>
                )}
                <div className="row between">
                  <span className="t-xs text-muted">Pipelines</span>
                  <span className="mono t-xs">{metrics.counters["pipeline.runs"] ?? 0}</span>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function MetricBar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="row between" style={{ marginBottom: 4 }}>
        <span className="t-xs text-muted">{label}</span>
        <span className="mono t-xs" style={{ color: `var(--${tone})` }}>
          {pct(value)}
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 999, background: "var(--elevated)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${Math.round((value ?? 0) * 100)}%`,
            background: `var(--${tone})`,
            borderRadius: 999,
            transition: "width 0.6s var(--ease)",
          }}
        />
      </div>
    </div>
  );
}

function NavItem({
  active,
  glyph,
  label,
  onClick,
}: {
  active?: boolean;
  glyph: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="row gap-10"
      style={{
        width: "100%",
        padding: "7px 10px",
        borderRadius: 8,
        textAlign: "left",
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-secondary)",
        fontSize: 13.5,
        fontWeight: active ? 600 : 500,
        transition: "background 0.12s var(--ease), color 0.12s var(--ease)",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--elevated)";
          e.currentTarget.style.color = "var(--text)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--text-secondary)";
        }
      }}
    >
      <span style={{ display: "inline-flex", width: 18 }}>{glyph}</span>
      <span className="grow">{label}</span>
    </button>
  );
}

function SidebarBody({ active, onNavigate }: { active: string; onNavigate: (path: string) => void }) {
  return (
    <>
      <div style={{ padding: "2px 6px 16px" }}>
        <Logo onClick={() => onNavigate("/")} />
      </div>

      <div
        className="t-xs text-muted"
        style={{ textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, padding: "0 10px 6px" }}
      >
        Triage
      </div>
      <div className="col gap-4" style={{ marginBottom: 14 }}>
        <NavItem active={active === "cases"} glyph={<Anchor size={16} />} label="Cases" onClick={() => onNavigate("/dashboard")} />
        <NavItem active={active === "backlog"} glyph={<UIcon name="inbox" size={16} />} label="Backlog" onClick={() => onNavigate("/backlog")} />
      </div>

      <div
        className="t-xs text-muted"
        style={{ textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, padding: "0 10px 6px" }}
      >
        Workspace
      </div>
      <div className="col gap-4" style={{ marginBottom: 14 }}>
        <NavItem active={active === "insights"} glyph={<UIcon name="chart" size={16} />} label="Insights" onClick={() => onNavigate("/insights")} />
        <NavItem active={active === "automations"} glyph={<UIcon name="bolt" size={16} />} label="Automations" onClick={() => onNavigate("/automations")} />
        <NavItem active={active === "connect"} glyph={<UIcon name="plus" size={16} />} label="Connect repo" onClick={() => onNavigate("/connect")} />
      </div>

      <div style={{ height: 1, background: "var(--border)", margin: "0 6px 16px" }} />

      <ControlPlane />

      <div className="grow" />
      <div className="row between" style={{ padding: "8px 6px 0" }}>
        <span className="t-xs text-muted mono">v1.0 · MIT</span>
        <ThemeToggle />
      </div>
    </>
  );
}

export function AppShell({ active = "cases", children }: { active?: string; children: ReactNode }) {
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const go = (path: string) => {
    setDrawer(false);
    router.push(path);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* mobile top bar (shown < 900px via CSS) */}
      <div className="hm-mobilebar">
        <button className="btn btn-ghost" style={{ width: 36, padding: 0 }} aria-label="Open menu" onClick={() => setDrawer(true)}>
          <UIcon name="menu" size={18} />
        </button>
        <Logo size={16} onClick={() => router.push("/")} />
        <ThemeToggle />
      </div>

      {/* mobile drawer */}
      {drawer && (
        <>
          <div className="hm-backdrop" onClick={() => setDrawer(false)} />
          <aside className="hm-drawer">
            <SidebarBody active={active} onNavigate={go} />
          </aside>
        </>
      )}

      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        <aside
          className="hm-sidebar"
          style={{
            width: "var(--sb-w)",
            flex: "none",
            background: "var(--surface)",
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            padding: "16px 12px",
          }}
        >
          <SidebarBody active={active} onNavigate={go} />
        </aside>

        <div className="grow" style={{ display: "flex", minWidth: 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function TopNav({
  left,
  right,
  blur,
}: {
  left?: ReactNode;
  right?: ReactNode;
  blur?: boolean;
}) {
  const router = useRouter();
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: 56,
        flex: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 22px",
        borderBottom: "1px solid var(--border)",
        background: blur ? "color-mix(in oklch, var(--bg), transparent 25%)" : "var(--bg)",
        backdropFilter: blur ? "saturate(180%) blur(12px)" : "none",
      }}
    >
      <div className="row gap-16">
        <Logo onClick={() => router.push("/")} />
        {left}
      </div>
      <div className="row gap-8">{right}</div>
    </header>
  );
}

export { Link };
