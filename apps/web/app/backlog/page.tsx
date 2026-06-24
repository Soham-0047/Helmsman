"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { band } from "../../lib/agents";
import { UIcon } from "../../components/icons";
import { AppShell } from "../../components/shell";
import { Button, ClassPill, PriorityBadge, Tag, useToast } from "../../components/ui";

type Status = "queued" | "scanning" | "done";

interface BLItem {
  num: number;
  title: string;
  ageDays: number;
  reactions: number;
  cls: string;
  priority: number;
  action: string;
  resolvable?: "duplicate" | "needs_info" | "spam";
}

// A representative slice of a long-neglected backlog with predetermined
// triage outcomes (the offline demo path; a connected repo runs the live pipeline).
const BACKLOG: BLItem[] = [
  { num: 142, title: "Parser hangs on deeply nested arrays", ageDays: 412, reactions: 18, cls: "bug", priority: 8, action: "label bug · ready to answer" },
  { num: 156, title: "Same crash as #142 with nested arrays", ageDays: 388, reactions: 2, cls: "duplicate", priority: 3, action: "close as duplicate of #142", resolvable: "duplicate" },
  { num: 173, title: "Add YAML config support", ageDays: 360, reactions: 41, cls: "feature", priority: 6, action: "label feature · discuss scope" },
  { num: 188, title: "it crashes pls fix", ageDays: 340, reactions: 0, cls: "needs_info", priority: 2, action: "request version + repro", resolvable: "needs_info" },
  { num: 201, title: "Token leak: API key printed at debug level", ageDays: 297, reactions: 6, cls: "security", priority: 9, action: "fast-track · notify maintainer" },
  { num: 214, title: "🔥🔥 BUY CHEAP FOLLOWERS 🔥🔥", ageDays: 281, reactions: 0, cls: "spam", priority: 1, action: "close as spam", resolvable: "spam" },
  { num: 229, title: "Duplicate of the YAML request #173", ageDays: 260, reactions: 1, cls: "duplicate", priority: 3, action: "close as duplicate of #173", resolvable: "duplicate" },
  { num: 233, title: "How do I pass a custom delimiter?", ageDays: 244, reactions: 3, cls: "question", priority: 3, action: "answer from docs" },
  { num: 251, title: "Memory grows unbounded in watch mode", ageDays: 210, reactions: 27, cls: "bug", priority: 7, action: "label bug · ready to answer" },
  { num: 268, title: "Broken after upgrading to v3", ageDays: 188, reactions: 5, cls: "needs_info", priority: 4, action: "request repro steps", resolvable: "needs_info" },
  { num: 279, title: "Support source maps in output", ageDays: 165, reactions: 33, cls: "feature", priority: 5, action: "label feature · roadmap" },
  { num: 290, title: "Regression: trailing comma rejected", ageDays: 142, reactions: 14, cls: "bug", priority: 7, action: "label bug · ready to answer" },
  { num: 303, title: "Same as #290, trailing commas", ageDays: 120, reactions: 1, cls: "duplicate", priority: 2, action: "close as duplicate of #290", resolvable: "duplicate" },
  { num: 318, title: "Docs link 404s in quickstart", ageDays: 96, reactions: 4, cls: "bug", priority: 3, action: "label docs · ready to answer" },
  { num: 331, title: "spammy promo wall of text", ageDays: 70, reactions: 0, cls: "spam", priority: 1, action: "close as spam", resolvable: "spam" },
  { num: 347, title: "Feature: pluggable validators", ageDays: 41, reactions: 22, cls: "feature", priority: 6, action: "label feature · discuss scope" },
];

const REPO_OPEN = 1284; // the repo's full open backlog (demo)
const MIN_PER_ISSUE = 18;

export default function Backlog() {
  const { push } = useToast();
  const [status, setStatus] = useState<Record<number, Status>>({});
  const [running, setRunning] = useState(false);
  const [resolved, setResolved] = useState<Set<number>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const triageAll = () => {
    if (running) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRunning(true);
    setStatus({});
    setResolved(new Set());
    let delay = 250;
    BACKLOG.forEach((b) => {
      timers.current.push(setTimeout(() => setStatus((s) => ({ ...s, [b.num]: "scanning" })), delay));
      delay += 340;
      timers.current.push(setTimeout(() => setStatus((s) => ({ ...s, [b.num]: "done" })), delay));
      delay += 110;
    });
    timers.current.push(setTimeout(() => setRunning(false), delay + 250));
  };

  const doneCount = useMemo(() => Object.values(status).filter((s) => s === "done").length, [status]);
  const allDone = doneCount === BACKLOG.length && BACKLOG.length > 0;
  const progress = Math.round((doneCount / BACKLOG.length) * 100);

  const triagedItems = BACKLOG.filter((b) => status[b.num] === "done");
  const counts = useMemo(() => {
    const c = { duplicate: 0, needs_info: 0, spam: 0, ready: 0 };
    triagedItems.forEach((b) => {
      if (b.resolvable === "duplicate") c.duplicate++;
      else if (b.resolvable === "needs_info") c.needs_info++;
      else if (b.resolvable === "spam") c.spam++;
      else c.ready++;
    });
    return c;
  }, [triagedItems]);

  const autoResolvable = counts.duplicate + counts.needs_info + counts.spam;
  const hoursSaved = Math.round((doneCount * MIN_PER_ISSUE) / 60);

  const applyBulk = (kind: "duplicate" | "needs_info" | "spam", label: string) => {
    const targets = BACKLOG.filter((b) => b.resolvable === kind && status[b.num] === "done" && !resolved.has(b.num));
    if (!targets.length) return;
    setResolved((r) => new Set([...r, ...targets.map((t) => t.num)]));
    push(
      <span className="row gap-8">
        <UIcon name="check" size={14} /> Queued {targets.length} {label} for approval
      </span>
    );
  };

  const Kpi = ({ icon, value, label, tone }: { icon: string; value: string | number; label: string; tone?: string }) => (
    <div className="kpi">
      <span className="kpi-ic" style={tone ? { background: `var(--${tone}-soft)`, color: `var(--${tone})`, borderColor: `var(--${tone})` } : undefined}>
        <UIcon name={icon} size={16} />
      </span>
      <div className="kpi-val tnum">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );

  return (
    <AppShell active="backlog">
      <main className="grow" style={{ overflowY: "auto" }}>
        <div className="hm-feed-inner col gap-16 page-in" style={{ maxWidth: 920 }}>
          <div className="row between wrap gap-12">
            <div>
              <h2 className="t-h2">Backlog triage</h2>
              <p className="t-sm text-secondary" style={{ marginTop: 2, maxWidth: 520 }}>
                New issues are caught by webhook — but the backlog is where maintainers drown. Run the seven-agent
                pipeline across years of unanswered reports in minutes.
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              busy={running}
              icon={running ? null : <UIcon name={allDone ? "repeat" : "play"} size={15} />}
              onClick={triageAll}
            >
              {running ? "Triaging…" : allDone ? "Re-run" : "Triage backlog"}
            </Button>
          </div>

          {/* KPIs */}
          <div className="kpi-grid">
            <Kpi icon="inbox" value={REPO_OPEN.toLocaleString()} label="Open issues in repo" />
            <Kpi icon="sparkles" value={`${doneCount}/${BACKLOG.length}`} label="Triaged this batch" tone={allDone ? "green" : undefined} />
            <Kpi icon="bolt" value={autoResolvable} label="Auto-resolvable" tone="accent" />
            <Kpi icon="clock" value={`${hoursSaved} h`} label="Maintainer time saved" />
          </div>

          {/* progress */}
          {(running || doneCount > 0) && (
            <div className="card card-pad pop-in">
              <div className="row between" style={{ marginBottom: 8 }}>
                <span className="t-sm" style={{ fontWeight: 600 }}>
                  {allDone ? "Batch complete" : "Triaging backlog…"}
                </span>
                <span className="mono t-sm text-secondary">{progress}%</span>
              </div>
              <div className="bl-prog">
                <div className="bl-prog-fill" style={{ width: `${progress}%` }} />
              </div>

              {allDone && (
                <div className="col gap-10" style={{ marginTop: 16 }}>
                  <div className="row wrap gap-8">
                    {counts.duplicate > 0 && (
                      <Button variant="secondary" icon={<UIcon name="layers" size={14} />} onClick={() => applyBulk("duplicate", "duplicate closures")}>
                        Close {counts.duplicate} duplicates
                      </Button>
                    )}
                    {counts.needs_info > 0 && (
                      <Button variant="secondary" icon={<UIcon name="message" size={14} />} onClick={() => applyBulk("needs_info", "info requests")}>
                        Request info on {counts.needs_info}
                      </Button>
                    )}
                    {counts.spam > 0 && (
                      <Button variant="secondary" icon={<UIcon name="close" size={14} />} onClick={() => applyBulk("spam", "spam closures")}>
                        Close {counts.spam} spam
                      </Button>
                    )}
                    <span className="t-sm text-secondary row gap-6" style={{ alignSelf: "center" }}>
                      <UIcon name="lock" size={13} /> {counts.ready} ready for you to answer
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* list */}
          <div className="col gap-8">
            {BACKLOG.map((b) => {
              const st: Status = status[b.num] ?? "queued";
              const isResolved = resolved.has(b.num);
              return (
                <div key={b.num} className={`bl-row ${st === "scanning" ? "scanning" : st === "done" ? "done" : ""}`} style={isResolved ? { opacity: 0.5 } : undefined}>
                  <div className="col" style={{ alignItems: "flex-start", gap: 2 }}>
                    <span className="mono t-sm text-muted">#{b.num}</span>
                    <span className="t-xs text-muted">{b.ageDays}d</span>
                  </div>

                  <div className="grow" style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 550, fontSize: 14, marginBottom: st === "done" ? 7 : 0 }}>{b.title}</div>
                    {st === "done" && (
                      <div className="row wrap gap-6 pop-in">
                        <ClassPill value={b.cls} />
                        <PriorityBadge p={b.priority} />
                        <span className="cond-chip act" style={{ fontSize: 11 }}>
                          {isResolved ? "queued ✓" : b.action}
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{ flex: "none" }}>
                    {st === "queued" && <span className="t-xs text-muted">queued</span>}
                    {st === "scanning" && (
                      <span className="row gap-6 t-xs" style={{ color: "var(--accent)" }}>
                        <span className="spinner" style={{ width: 12, height: 12 }} /> analyzing
                      </span>
                    )}
                    {st === "done" && !isResolved && (
                      <span style={{ color: "var(--green)", display: "inline-flex" }}>
                        <UIcon name="check" size={16} />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="t-xs text-muted" style={{ textAlign: "center", paddingBottom: 8 }}>
            Demo batch of {BACKLOG.length}. On a connected repo, Helmsman pages through the entire open backlog and
            opens a governed case for each — nothing is closed or posted without your approval.
          </p>
        </div>
      </main>
    </AppShell>
  );
}
