"use client";
// Full-page live pipeline view. Seven agents in an SVG-connected flow; a token
// travels along the connector as each agent fires (offset-path animation). The
// timeline below logs every agent event chronologically, streamed over SSE.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "../../../../components/Brand";
import { ThemeToggle } from "../../../../components/ThemeToggle";
import { PipelineStepper } from "../../../../components/PipelineStepper";
import { MarkdownPreview } from "../../../../components/MarkdownPreview";
import { api } from "../../../../lib/api";
import type { CaseRecord } from "../../../../lib/types";
import { useCaseStream } from "../../../../lib/useCaseStream";

export default function PipelinePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [c, setC] = useState<CaseRecord | null>(null);
  const stream = useCaseStream(id, () => api.getCase(id).then((r) => setC(r.case)));

  useEffect(() => {
    api.getCase(id).then((r) => setC(r.case)).catch(() => {});
  }, [id]);

  return (
    <>
      <nav className="nav">
        <Link href="/dashboard"><Logo /></Link>
        <div className="row" style={{ gap: 12 }}>
          <Link href={`/case/${id}`} className="btn btn-ghost">← Case review</Link>
          <ThemeToggle />
        </div>
      </nav>

      <div className="container" style={{ padding: "32px 24px" }}>
        <div className="label">Live pipeline · case {id.slice(0, 8)}</div>
        <h2 style={{ margin: "4px 0 6px" }}>{c?.issue.title ?? "Loading…"}</h2>
        <div className="wrap" style={{ marginBottom: 28 }}>
          {c?.classification && <span className="pill">{c.classification}</span>}
          {c?.priority_score != null && <span className="tag">priority {c.priority_score}/10</span>}
          <span className="tag">{stream.stage ?? c?.current_stage}</span>
        </div>

        <div className="card" style={{ padding: "36px 24px", marginBottom: 24, overflowX: "auto" }}>
          <PipelineStepper states={stream.nodeStates} latencies={stream.latencies} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="card">
            <div className="label" style={{ marginBottom: 10 }}>Event timeline</div>
            <div className="stack" style={{ gap: 0, maxHeight: 360, overflowY: "auto" }}>
              {stream.events.length === 0 && <span className="muted">Waiting for events…</span>}
              {stream.events.map((e, i) => (
                <div className="timeline-item" key={i}>
                  <span className="mono muted" style={{ minWidth: 110 }}>{e.type}</span>
                  <span style={{ flex: 1 }}>
                    {e.agent ? <b>{e.agent}</b> : e.stage ? <b>{e.stage}</b> : ""}{" "}
                    {e.message || (e.model ? `· ${e.model} (${e.provider})` : "")}
                    {e.latency_ms != null && e.latency_ms > 0 ? <span className="mono muted"> {e.latency_ms}ms</span> : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="label" style={{ marginBottom: 10 }}>Assembled draft</div>
            {c?.draft_response ? (
              <MarkdownPreview source={c.draft_response} />
            ) : (
              <span className="muted">The draft appears when the Responder completes.</span>
            )}
            {c && (c.current_stage === "Pending Approval") && (
              <Link href={`/case/${id}`} className="btn btn-green" style={{ marginTop: 12 }}>
                Review & approve →
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
