"use client";
// Full-page live pipeline view. Seven agents in a connected flow; a token travels
// along the connector as each agent fires. Header + draft come from the real case
// (gateway, mock fallback); the event log/animation replays the streamed sequence
// so the visualization always plays for a viewer who opens it after the run.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AGENTS, stageTone } from "../../../../lib/agents";
import { api } from "../../../../lib/api";
import type { NodeKey, NodeState } from "../../../../lib/types";
import { EVENT_STREAM, MOCK_CASES, toView, type CaseVM } from "../../../../lib/viewmodel";
import { AgentIcon, UIcon } from "../../../../components/icons";
import { MarkdownPreview } from "../../../../components/MarkdownPreview";
import { TopNav } from "../../../../components/shell";
import { Button, ClassPill, NodeRing, PriorityBadge, StatusDot, Tag, ThemeToggle } from "../../../../components/ui";

const EVENT_CHIP: Record<string, string | null> = {
  agent_start: "blue",
  agent_complete: "green",
  context_loaded: "blue",
  agent_skipped: null,
  stage: "accent",
  pipeline_complete: "green",
};

function PipelineFlow({
  states,
  latencies,
  flowing,
  reduced,
}: {
  states: Partial<Record<NodeKey, NodeState>>;
  latencies: Partial<Record<NodeKey, number>>;
  flowing: number | null;
  reduced: boolean;
}) {
  return (
    <div className="row" style={{ width: "100%", overflowX: "auto", padding: "10px 4px", alignItems: "flex-start" }}>
      {AGENTS.map((a, i) => {
        const st = states[a.id] || "idle";
        const next = AGENTS[i + 1];
        const connActive = states[a.id] === "complete";
        return (
          <span key={a.id} className="row" style={{ display: "contents" }}>
            <div className="col" style={{ alignItems: "center", gap: 7, flex: "none", width: 92 }}>
              <NodeRing state={st}>
                <AgentIcon name={a.icon} size={19} />
              </NodeRing>
              <span
                className="t-xs"
                style={{
                  color: st === "idle" || st === "skipped" ? "var(--text-muted)" : "var(--text-secondary)",
                  fontWeight: 500,
                  textAlign: "center",
                }}
              >
                {a.label}
              </span>
              <span className="mono t-xs text-muted" style={{ minHeight: 14 }}>
                {st === "complete" && latencies[a.id] ? latencies[a.id] + "ms" : ""}
              </span>
            </div>
            {next && (
              <div
                style={{
                  flex: 1,
                  minWidth: 24,
                  height: 2,
                  marginTop: 18,
                  position: "relative",
                  borderRadius: 2,
                  background: connActive ? "var(--accent-line)" : "var(--border)",
                  transition: "background 0.3s var(--ease)",
                }}
              >
                {!reduced && flowing === i && <span className="flow-token" />}
              </div>
            )}
          </span>
        );
      })}
    </div>
  );
}

export default function PipelinePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const reduced =
    typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [c, setC] = useState<CaseVM | null>(MOCK_CASES.find((x) => x.id === id) ?? null);
  const [log, setLog] = useState<typeof EVENT_STREAM>([]);
  const [states, setStates] = useState<Partial<Record<NodeKey, NodeState>>>({});
  const [stage, setStage] = useState("Intake");
  const [flowing, setFlowing] = useState<number | null>(null);
  const [showDraft, setShowDraft] = useState(false);
  const [pending, setPending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    api
      .getCase(id)
      .then((r) => setC(toView(r.case)))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    setLog([]);
    setStates({});
    setStage("Intake");
    setFlowing(null);
    setShowDraft(false);
    setPending(false);
    const speed = reduced ? 0.18 : 1;
    EVENT_STREAM.forEach((ev) => {
      const tm = setTimeout(() => {
        setLog((l) => [...l, ev]);
        if (ev.type === "agent_start") setStates((s) => ({ ...s, [ev.agent!]: "active" }));
        if (ev.type === "context_loaded") setStates((s) => ({ ...s, [ev.agent!]: "loaded" }));
        if (ev.type === "agent_complete") {
          setStates((s) => ({ ...s, [ev.agent!]: "complete" }));
          const idx = AGENTS.findIndex((a) => a.id === ev.agent);
          if (idx >= 0 && idx < AGENTS.length - 1) {
            setFlowing(idx);
            timers.current.push(setTimeout(() => setFlowing((f) => (f === idx ? null : f)), 850));
          }
          if (ev.agent === "responder") setShowDraft(true);
        }
        if (ev.type === "stage") setStage(ev.msg.split("→").pop()!.trim());
        if (ev.type === "pipeline_complete") {
          setStage("Pending Approval");
          setPending(true);
        }
      }, ev.t * speed + 300);
      timers.current.push(tm);
    });
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [id, reduced]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const draft = c?.draft || "";

  return (
    <div className="col" style={{ height: "100%", overflowY: "auto" }}>
      <TopNav
        left={
          <Button variant="ghost" icon={<UIcon name="chevronLeft" size={15} />} onClick={() => router.push(`/case/${id}`)}>
            Case review
          </Button>
        }
        right={<ThemeToggle />}
      />

      <div style={{ flex: 1, padding: "30px 24px 80px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }} className="col gap-20">
          <div className="col gap-10">
            <span className="mono t-sm text-secondary">Live pipeline · case {id.slice(0, 8)}…</span>
            <h2 className="t-h2" style={{ textWrap: "pretty" }}>
              {c?.title ?? "Loading…"}
            </h2>
            <div className="row wrap gap-8">
              {c && <ClassPill value={c.classification} />}
              {c && <PriorityBadge p={c.priority} />}
              <Tag tone={stageTone(stage)}>{pending ? <><StatusDot tone="accent" pulse /> {stage}</> : stage}</Tag>
            </div>
          </div>

          {/* hero flow */}
          <div className="card card-pad" style={{ padding: "22px 24px" }}>
            <PipelineFlow states={states} latencies={c?.latencies ?? {}} flowing={flowing} reduced={reduced} />
          </div>

          {/* two columns */}
          <div className="pl-grid">
            {/* event timeline */}
            <div className="card" style={{ display: "flex", flexDirection: "column", height: 420, overflow: "hidden" }}>
              <div className="row between" style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", flex: "none" }}>
                <span className="t-sm" style={{ fontWeight: 600 }}>
                  Event timeline
                </span>
                <span className="mono t-xs text-muted">{log.length} events</span>
              </div>
              <div ref={logRef} style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                {log.map((ev, i) => {
                  const ag = AGENTS.find((a) => a.id === ev.agent);
                  return (
                    <div key={i} className="rise row gap-10" style={{ padding: "7px 16px", animationDuration: "0.25s" }}>
                      <span
                        className={`tag ${EVENT_CHIP[ev.type] ? "tag-" + EVENT_CHIP[ev.type] : ""}`}
                        style={{ flex: "none", minWidth: 116, justifyContent: "center" }}
                      >
                        {ev.type}
                      </span>
                      <span className="grow t-sm" style={{ minWidth: 0 }}>
                        {ag && <span style={{ fontWeight: 600 }}>{ag.label} </span>}
                        <span className="text-secondary">{ev.msg}</span>
                      </span>
                      {ev.lat && (
                        <span className="mono t-xs text-muted" style={{ flex: "none" }}>
                          {ev.lat}ms
                        </span>
                      )}
                    </div>
                  );
                })}
                {!pending && (
                  <div className="row gap-8" style={{ padding: "7px 16px", color: "var(--text-muted)" }}>
                    <span className="spinner" style={{ width: 12, height: 12 }} />
                    <span className="t-sm">streaming…</span>
                  </div>
                )}
              </div>
            </div>

            {/* assembled draft */}
            <div className="card" style={{ display: "flex", flexDirection: "column", height: 420, overflow: "hidden" }}>
              <div className="row between" style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", flex: "none" }}>
                <span className="t-sm" style={{ fontWeight: 600 }}>
                  Assembled draft
                </span>
                {c && c.voice > 0 && <Tag tone="accent">{c.voice}% voice</Tag>}
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
                {showDraft && draft ? (
                  <div className="rise">
                    <MarkdownPreview source={draft} />
                  </div>
                ) : (
                  <div
                    className="col gap-10"
                    style={{ color: "var(--text-muted)", height: "100%", justifyContent: "center", alignItems: "center", textAlign: "center" }}
                  >
                    <span style={{ color: "var(--text-muted)" }}>
                      <AgentIcon name="message" size={26} />
                    </span>
                    <span className="t-sm">The draft appears when the Responder completes.</span>
                  </div>
                )}
              </div>
              {pending && (
                <div style={{ padding: 14, borderTop: "1px solid var(--border)", flex: "none" }} className="rise">
                  <Button
                    variant="success"
                    block
                    iconRight={<UIcon name="arrowRight" size={15} />}
                    onClick={() => router.push(`/case/${id}`)}
                  >
                    Review &amp; approve
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
