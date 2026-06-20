"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { band, stageTone } from "../../lib/agents";
import { api } from "../../lib/api";
import { FIXTURES, MOCK_CASES, toView, type CaseVM } from "../../lib/viewmodel";
import { CaseReview } from "../../components/CaseReview";
import { Anchor, UIcon } from "../../components/icons";
import { AppShell } from "../../components/shell";
import { Button, ClassPill, PriorityBadge, StatusDot, Tag, useNarrow } from "../../components/ui";

interface Fixture {
  id: string;
  number: number;
  title: string;
}

function CaseCard({
  c,
  selected,
  focused,
  onClick,
  isNew,
  idx,
}: {
  c: CaseVM;
  selected: boolean;
  focused: boolean;
  onClick: () => void;
  isNew: boolean;
  idx: number;
}) {
  const stripColor = { red: "var(--red)", amber: "var(--amber)", green: "var(--green)" }[band(c.priority)];
  const pending = c.stage === "Pending Approval";
  return (
    <button
      onClick={onClick}
      className={isNew ? "rise" : "card-in"}
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "var(--surface)",
        borderRadius: "var(--r-card)",
        border: `1px solid ${selected ? "var(--accent)" : focused ? "var(--border-strong)" : "var(--border)"}`,
        padding: "14px 16px 14px 19px",
        overflow: "hidden",
        boxShadow: pending ? "inset 3px 0 0 0 var(--accent)" : "none",
        transition: "border-color 0.13s var(--ease), box-shadow 0.13s var(--ease), transform 0.13s var(--ease)",
        animation: pending && !selected ? "pendingGlow 2.4s var(--ease) infinite" : undefined,
        animationDelay: isNew ? undefined : `${Math.min(idx * 45, 270)}ms`,
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.borderColor = "var(--border-strong)";
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.borderColor = focused ? "var(--border-strong)" : "var(--border)";
      }}
    >
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: stripColor }} />
      <div className="row between" style={{ marginBottom: 7 }}>
        <span className="mono t-sm text-muted">#{c.num}</span>
        <div className="row gap-8">
          {c.running && (
            <span className="row gap-6 t-xs" style={{ color: "var(--accent)" }}>
              <span className="spinner" style={{ width: 11, height: 11 }} /> running
            </span>
          )}
          <Tag tone={stageTone(c.stage)}>{c.stage}</Tag>
        </div>
      </div>
      <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 9, letterSpacing: "-0.01em", textWrap: "pretty" }}>
        {c.title}
      </div>
      <div className="row wrap gap-6">
        <ClassPill value={c.classification} />
        <PriorityBadge p={c.priority} />
        <span className="t-xs text-muted" style={{ alignSelf: "center" }}>
          @{c.author}
        </span>
      </div>
    </button>
  );
}

function GatewayBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="card"
      style={{ borderColor: "color-mix(in oklch, var(--red), transparent 55%)", background: "var(--red-soft)", padding: "12px 16px" }}
    >
      <div className="row between gap-12">
        <span className="row gap-8 t-sm" style={{ color: "var(--red)" }}>
          <StatusDot tone="red" /> Gateway unreachable · showing local sample data. Start{" "}
          <span className="mono">npm run dev</span> to go live.
        </span>
        <button className="btn btn-ghost" style={{ height: 26, padding: "0 8px", color: "var(--red)" }} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const narrow = useNarrow(720);
  const [cases, setCases] = useState<CaseVM[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [fixtures, setFixtures] = useState<Fixture[]>(FIXTURES.map((f) => ({ id: `fix-${f.num}`, number: f.num, title: f.title })));
  const [fixtureId, setFixtureId] = useState<string>("fix-001");
  const [running, setRunning] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [newId, setNewId] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const refresh = useCallback(async () => {
    try {
      const { cases } = await api.listCases({ limit: 50 });
      setCases(cases.map(toView));
      setOnline(true);
      setBannerOpen(false);
    } catch {
      setOnline(false);
      setBannerOpen(true);
      setCases((prev) => (prev.length ? prev : MOCK_CASES));
    }
  }, []);

  // ---- offline simulation: prepend a case and advance its stages ----
  const simulateRun = useCallback(() => {
    const fx = fixtures.find((f) => f.id === fixtureId) ?? fixtures[0];
    const id = `c${fx.number}`;
    const fresh: CaseVM = {
      id, num: fx.number, caseId: "CASE-" + Math.random().toString(16).slice(2, 6).toUpperCase(),
      title: fx.title, author: "newreporter", classification: "bug", priority: 7, stage: "Intake",
      reactions: 2, repo: "helmsman-demo/fastlane-parser", running: true,
      signals: ["new report", "awaiting analysis", "regression"],
      findings: {
        Reproduction: { v: "reproducible · node 20.11" },
        "Likely files": { v: "src/parser/index.ts", mono: true },
        Recommended: { v: "comment + label: bug" },
      },
      voice: 89,
      draft: `Thanks for the report! I've reproduced this and traced it to the parser entry path. A fix is on the way — I'll link the PR here shortly. Could you confirm your platform so I can add a regression test?`,
      latencies: {}, completed: [], skipped: [],
    };
    setCases((cs) => [fresh, ...cs.filter((c) => c.id !== id)]);
    setNewId(id);
    setFocusIdx(0);
    const seq: { at: number; stage: string; completed: CaseVM["completed"]; lat: CaseVM["latencies"]; done?: boolean }[] = [
      { at: 500, stage: "Classification", completed: ["classifier"], lat: { classifier: 812 } },
      { at: 1500, stage: "Investigation", completed: ["classifier", "retriever"], lat: { retriever: 1240 } },
      { at: 2600, stage: "Investigation", completed: ["classifier", "retriever", "reproducer", "source_analyzer"], lat: { reproducer: 3180, source_analyzer: 2010 } },
      { at: 3600, stage: "Drafting", completed: ["classifier", "retriever", "reproducer", "source_analyzer", "prioritizer", "voice_profiler"], lat: { prioritizer: 640, voice_profiler: 720 } },
      { at: 4600, stage: "Pending Approval", completed: ["classifier", "retriever", "reproducer", "source_analyzer", "prioritizer", "voice_profiler", "responder"], lat: { responder: 1880 }, done: true },
    ];
    seq.forEach((step) => {
      const tm = setTimeout(() => {
        setCases((cs) =>
          cs.map((c) =>
            c.id === id
              ? { ...c, stage: step.stage, completed: step.completed, latencies: { ...c.latencies, ...step.lat }, running: !step.done }
              : c
          )
        );
        if (step.done) setRunning(false);
      }, step.at);
      timers.current.push(tm);
    });
  }, [fixtures, fixtureId]);

  const runPipeline = useCallback(async () => {
    if (running) return;
    setRunning(true);
    if (online) {
      try {
        const r = await api.runDemo(fixtureId, { wait: false });
        setSelId(r.case.id);
        setNewId(r.case.id);
        await refresh();
        [400, 1000, 2000, 3500].forEach((t) => timers.current.push(setTimeout(refresh, t)));
        setTimeout(() => setRunning(false), 3600);
        return;
      } catch {
        setOnline(false);
        setBannerOpen(true);
      }
    }
    simulateRun();
  }, [running, online, fixtureId, refresh, simulateRun]);

  // ---- initial load + fixtures + ?demo=1 autorun ----
  useEffect(() => {
    refresh();
    api
      .demoFixtures()
      .then((f) => {
        if (f?.issues?.length) {
          setFixtures(f.issues.map((x: any) => ({ id: x.id, number: x.number, title: x.title })));
          setFixtureId(f.default || f.issues[0].id);
        }
      })
      .catch(() => {});
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1") {
      timers.current.push(setTimeout(() => runPipeline(), 500));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const selected = cases.find((c) => c.id === selId) ?? null;
  const panelOpen = !!selected;

  // keyboard j/k/enter/esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
      if (e.key === "j") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(cases.length - 1, i + 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        const c = cases[focusIdx];
        if (c) setSelId(c.id);
      } else if (e.key === "Escape") setSelId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cases, focusIdx]);

  const onAction = (action: "approved" | "rejected" | "saved") => {
    if (!selected) return;
    if (action === "approved") {
      setCases((cs) => cs.map((c) => (c.id === selected.id ? { ...c, stage: "Executed", running: false } : c)));
    } else if (action === "rejected") {
      setSelId(null);
      setCases((cs) => cs.filter((c) => c.id !== selected.id));
    }
  };

  return (
    <AppShell active="cases">
      <main className="grow" style={{ display: "flex", flexDirection: "column", minWidth: 0, overflowY: "auto" }}>
        <div className="hm-feed-inner col gap-16">
          <div className="row between wrap gap-12">
            <div>
              <h2 className="t-h2">Issue triage</h2>
              <p className="t-sm text-secondary" style={{ marginTop: 2 }}>
                {cases.length} cases · human-in-the-loop
              </p>
            </div>
            <div className="row gap-8">
              <div className="hm-select">
                <select value={fixtureId} onChange={(e) => setFixtureId(e.target.value)} aria-label="Fixture issue">
                  {fixtures.map((f) => (
                    <option key={f.id} value={f.id}>
                      #{f.number} · {f.title}
                    </option>
                  ))}
                </select>
                <span className="hm-select-ic">
                  <UIcon name="chevronRight" size={14} />
                </span>
              </div>
              <Button variant="primary" busy={running} icon={running ? null : <UIcon name="play" size={14} />} onClick={runPipeline}>
                {running ? "Running…" : "Run pipeline"}
              </Button>
            </div>
          </div>

          {bannerOpen && <GatewayBanner onDismiss={() => setBannerOpen(false)} />}

          {cases.length === 0 ? (
            <div className="card" style={{ padding: 48, textAlign: "center" }}>
              <div style={{ color: "var(--text-muted)", display: "inline-flex", marginBottom: 14 }}>
                <Anchor size={30} />
              </div>
              <h3 className="t-h3" style={{ marginBottom: 6 }}>
                No cases yet
              </h3>
              <p className="t-sm text-secondary" style={{ maxWidth: 360, margin: "0 auto" }}>
                Pick a fixture issue and hit Run pipeline to watch the seven agents fire.
              </p>
            </div>
          ) : (
            <div className="col gap-10">
              {cases.map((c, i) => (
                <CaseCard
                  key={c.id}
                  c={c}
                  idx={i}
                  selected={c.id === selId}
                  focused={i === focusIdx && !panelOpen}
                  isNew={c.id === newId}
                  onClick={() => {
                    setSelId(c.id);
                    setFocusIdx(i);
                  }}
                />
              ))}
            </div>
          )}
          <p className="t-xs text-muted row gap-6" style={{ justifyContent: "center", paddingTop: 4 }}>
            <span className="mono">j</span>/<span className="mono">k</span> to move · <span className="mono">↵</span> to
            open · <span className="mono">esc</span> to close
          </p>
        </div>
      </main>

      <aside
        style={{
          flex: "none",
          borderLeft: panelOpen ? "1px solid var(--border)" : "none",
          background: "var(--surface)",
          overflow: "hidden",
          width: panelOpen ? (narrow ? "100vw" : "var(--panel-w)") : 0,
          position: narrow && panelOpen ? "fixed" : "relative",
          inset: narrow && panelOpen ? 0 : "auto",
          zIndex: narrow ? 120 : "auto",
          boxShadow: panelOpen && !narrow ? "var(--shadow-panel)" : "none",
          transition: narrow ? "none" : "width 0.28s var(--ease)",
        }}
      >
        {selected && (
          <CaseReview
            key={selected.id}
            caseId={selected.id}
            initial={selected}
            condensed
            onClose={() => setSelId(null)}
            onAction={onAction}
            onChanged={online ? refresh : undefined}
          />
        )}
      </aside>
    </AppShell>
  );
}
