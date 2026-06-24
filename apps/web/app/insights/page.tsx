"use client";
import { useEffect, useState } from "react";
import type { Tone } from "../../lib/agents";
import { api } from "../../lib/api";
import { BENCH, DEMO_INSIGHTS, deriveInsights, MIN_SAVED_PER_ISSUE, type InsightsData } from "../../lib/insights";
import { UIcon } from "../../components/icons";
import { AppShell } from "../../components/shell";
import { CountUp, Reveal, StatusDot, Tag, useInView } from "../../components/ui";

const toneColor = (t: Tone) => (t ? `var(--${t})` : "var(--text-muted)");

/* ---------------- donut ---------------- */
function Donut({ slices, total, size = 168 }: { slices: { color: string; value: number; label: string }[]; total: number; size?: number }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  const r = (size - 22) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div ref={ref} style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg className="donut" width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--elevated)" strokeWidth="13" />
        {slices.map((s, i) => {
          const full = (s.value / (total || 1)) * c;
          const shown = inView ? full : 0;
          const off = -acc;
          acc += full;
          const pct = Math.round((s.value / (total || 1)) * 100);
          return (
            <circle
              key={i}
              className="donut-seg"
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="13"
              strokeDasharray={`${shown} ${c - shown}`}
              strokeDashoffset={off}
              strokeLinecap="butt"
              style={{ transition: `stroke-dasharray 0.9s var(--ease) ${i * 0.06}s` }}
            >
              <title>{`${s.label}: ${s.value} (${pct}%)`}</title>
            </circle>
          );
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span className="mono" style={{ fontSize: 26, fontWeight: 680, letterSpacing: "-0.02em" }}>
          <CountUp to={total} />
        </span>
        <span className="t-xs text-muted">issues</span>
      </div>
    </div>
  );
}

/* ---------------- 14-day area chart ---------------- */
function Area({ data }: { data: number[] }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  const w = 340,
    h = 130;
  const max = Math.max(...data, 1);
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => [i * step, h - (v / max) * (h - 22) - 8] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const last = pts[pts.length - 1];
  return (
    <div ref={ref}>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block", height: 130 }}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#areaFill)" style={{ opacity: inView ? 1 : 0, transition: "opacity 0.8s var(--ease) 0.3s" }} />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={inView ? 0 : len}
          style={{ transition: "stroke-dashoffset 1.2s var(--ease)" }}
        />
        <circle cx={last[0]} cy={last[1]} r="3.5" fill="var(--accent)" style={{ opacity: inView ? 1 : 0, transition: "opacity 0.4s var(--ease) 1s" }} />
      </svg>
    </div>
  );
}

function BenchBars() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  return (
    <div ref={ref} className="col gap-4">
      {BENCH.rows.map((r) => (
        <div key={r.metric} className="bench-row">
          <div>
            <div className="t-sm" style={{ fontWeight: 550 }}>
              {r.metric}
            </div>
            {r.raw ? <div className="mono t-xs text-muted">{r.raw}</div> : null}
          </div>
          <div className="bench-bars">
            <div className="bench-bar base" style={{ width: inView ? `${(r.base / r.max) * 100}%` : 0 }}>
              1 agent · {r.base}
              {r.unit}
            </div>
            <div className="bench-bar pipe" style={{ width: inView ? `${(r.pipe / r.max) * 100}%` : 0, transitionDelay: "0.12s" }}>
              7 agents · {r.pipe}
              {r.unit}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Kpi({ icon, val, decimals, prefix, suffix, label }: { icon: string; val: number; decimals?: number; prefix?: string; suffix?: string; label: string }) {
  return (
    <div className="kpi pop-in">
      <span className="kpi-ic">
        <UIcon name={icon} size={16} />
      </span>
      <div className="kpi-val tnum">
        <CountUp to={val} decimals={decimals} prefix={prefix} suffix={suffix} />
      </div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

export default function Insights() {
  const [data, setData] = useState<InsightsData>(DEMO_INSIGHTS);
  const [live, setLive] = useState(false);

  useEffect(() => {
    api
      .listCases({ limit: 200 })
      .then(({ cases }) => {
        if (cases?.length) {
          setData(
            deriveInsights(
              cases.map((c) => ({
                classification: c.classification ?? "bug",
                priority: c.priority_score ?? 0,
                stage: c.current_stage,
              }))
            )
          );
          setLive(true);
        }
      })
      .catch(() => {});
  }, []);

  const slices = data.classes.map((c) => ({ color: toneColor(c.tone), value: c.value, label: c.label }));
  const prTotal = data.priority.high + data.priority.mid + data.priority.low || 1;
  const maxAgentMs = Math.max(...data.agentMs.map((a) => a.ms), 1);

  return (
    <AppShell active="insights">
      <main className="grow" style={{ overflowY: "auto" }}>
        <div className="hm-feed-inner col gap-20 page-in" style={{ maxWidth: 1000 }}>
          <div className="row between wrap gap-12">
            <div>
              <h2 className="t-h2">Insights</h2>
              <p className="t-sm text-secondary" style={{ marginTop: 2 }}>
                What triage automation is buying you back.
              </p>
            </div>
            <Tag tone={live ? "green" : "amber"}>
              <StatusDot tone={live ? "green" : "amber"} /> {live ? "live" : "demo data"}
            </Tag>
          </div>

          {/* KPI row */}
          <div className="kpi-grid">
            <Kpi icon="inbox" val={data.triaged} label="Issues triaged" />
            <Kpi icon="clock" val={data.hoursSaved} suffix=" h" label={`Maintainer time saved · ~${MIN_SAVED_PER_ISSUE} min/issue`} />
            <Kpi icon="layers" val={data.duplicatesCaught} label="Duplicates caught & closed" />
            <Kpi icon="bolt" val={data.draftSeconds} decimals={1} suffix=" s" label="Median time to a drafted reply" />
          </div>

          {/* ROI banner */}
          <Reveal>
            <div className="cta-banner" style={{ padding: "30px 28px", textAlign: "left" }}>
              <div className="row between wrap gap-16">
                <div>
                  <div className="lp-eyebrow" style={{ marginBottom: 8 }}>
                    <UIcon name="trendUp" size={13} /> Return on triage
                  </div>
                  <div style={{ fontSize: "min(30px, 7vw)", fontWeight: 670, letterSpacing: "-0.02em" }}>
                    ≈ <CountUp to={data.hoursSaved} className="grad-text" /> hours back
                  </div>
                  <p className="t-sm text-secondary" style={{ marginTop: 6, maxWidth: 460 }}>
                    {data.triaged.toLocaleString()} issues triaged × ~{MIN_SAVED_PER_ISSUE} min of manual triage each — time you spent on code instead.
                  </p>
                </div>
                <div className="col gap-8" style={{ minWidth: 180 }}>
                  <div className="row between">
                    <span className="t-sm text-secondary">Auto-handled</span>
                    <span className="mono t-sm" style={{ color: "var(--green)" }}>
                      <CountUp to={data.autoHandled} /> issues
                    </span>
                  </div>
                  <div className="row between">
                    <span className="t-sm text-secondary">Avg priority</span>
                    <span className="mono t-sm">{data.avgPriority.toFixed(1)}/10</span>
                  </div>
                  <div className="row between">
                    <span className="t-sm text-secondary">Pending you</span>
                    <span className="mono t-sm" style={{ color: "var(--accent)" }}>
                      {data.pending}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* charts */}
          <div className="chart-grid">
            <Reveal>
              <div className="card card-pad" style={{ height: "100%" }}>
                <div className="t-sm text-secondary" style={{ fontWeight: 600, marginBottom: 14 }}>
                  Triage volume · last 14 days
                </div>
                <Area data={data.volume} />
                <div className="row between t-xs text-muted" style={{ marginTop: 6 }}>
                  <span>14d ago</span>
                  <span>today</span>
                </div>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <div className="card card-pad" style={{ height: "100%" }}>
                <div className="t-sm text-secondary" style={{ fontWeight: 600, marginBottom: 14 }}>
                  Classification mix
                </div>
                <div className="row gap-20 wrap" style={{ justifyContent: "center" }}>
                  <Donut slices={slices} total={data.triaged} />
                  <div className="col gap-3" style={{ minWidth: 160 }}>
                    {data.classes.map((c) => (
                      <div key={c.key} className="row between gap-10 legend-row" title={`${c.label}: ${c.value} issues`}>
                        <span className="row gap-8 t-sm">
                          <span className="dot" style={{ background: toneColor(c.tone) }} />
                          {c.label}
                        </span>
                        <span className="mono t-sm text-secondary">
                          {c.value} · {Math.round((c.value / (data.triaged || 1)) * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal>
              <div className="card card-pad" style={{ height: "100%" }}>
                <div className="t-sm text-secondary" style={{ fontWeight: 600, marginBottom: 14 }}>
                  Priority distribution
                </div>
                <div className="seg" style={{ marginBottom: 14 }}>
                  <span style={{ width: `${(data.priority.high / prTotal) * 100}%`, background: "var(--red)" }} />
                  <span style={{ width: `${(data.priority.mid / prTotal) * 100}%`, background: "var(--amber)" }} />
                  <span style={{ width: `${(data.priority.low / prTotal) * 100}%`, background: "var(--green)" }} />
                </div>
                <div className="col gap-8">
                  {[
                    { l: "High · 8–10", v: data.priority.high, c: "red" },
                    { l: "Medium · 4–7", v: data.priority.mid, c: "amber" },
                    { l: "Low · 1–3", v: data.priority.low, c: "green" },
                  ].map((p) => (
                    <div key={p.l} className="row between legend-row" title={`${p.l}: ${p.v} issues`}>
                      <span className="row gap-8 t-sm">
                        <span className="dot" style={{ background: `var(--${p.c})` }} /> {p.l}
                      </span>
                      <span className="mono t-sm text-secondary">{p.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <div className="card card-pad" style={{ height: "100%" }}>
                <div className="t-sm text-secondary" style={{ fontWeight: 600, marginBottom: 14 }}>
                  Avg latency per agent
                </div>
                <div className="col gap-4">
                  {data.agentMs.map((a) => (
                    <div key={a.id} className="h-bar-row" title={`${a.label}: ${a.ms} ms average`}>
                      <span className="t-xs text-secondary" style={{ textAlign: "right" }}>
                        {a.label}
                      </span>
                      <div className="h-bar-track">
                        <HBar pct={(a.ms / maxAgentMs) * 100} />
                      </div>
                      <span className="mono t-xs text-muted" style={{ textAlign: "right" }}>
                        {a.ms}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>

          {/* benchmark */}
          <Reveal>
            <div className="card card-pad">
              <div className="row between wrap gap-10" style={{ marginBottom: 6 }}>
                <div>
                  <div className="t-sm" style={{ fontWeight: 600 }}>
                    Seven agents vs. one
                  </div>
                  <p className="t-xs text-muted" style={{ marginTop: 2 }}>
                    Agent-Society A/B · {BENCH.nIssues} fixtures · {BENCH.mode}
                  </p>
                </div>
                <Tag>baseline = single {`qwen3-8b`} call</Tag>
              </div>
              <BenchBars />
            </div>
          </Reveal>

          <p className="t-xs text-muted" style={{ textAlign: "center", paddingBottom: 8 }}>
            {live
              ? "Derived live from your connected repositories."
              : "Demo figures — connect a repo to populate with your own triage history."}
          </p>
        </div>
      </main>
    </AppShell>
  );
}

function HBar({ pct }: { pct: number }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.5);
  return (
    <div
      ref={ref}
      className="h-bar-fill"
      style={{ width: inView ? `${pct}%` : 0, background: "linear-gradient(90deg, var(--accent), #9d8bff)" }}
    />
  );
}
