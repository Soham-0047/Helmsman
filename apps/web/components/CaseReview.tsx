"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, priorityBand } from "../lib/api";
import type { CaseRecord } from "../lib/types";
import { useCaseStream } from "../lib/useCaseStream";
import { MarkdownPreview } from "./MarkdownPreview";
import { PipelineStepper } from "./PipelineStepper";
import { PriorityGauge } from "./PriorityGauge";

export function CaseReview({ caseId, onChanged }: { caseId: string; onChanged?: () => void }) {
  const [c, setC] = useState<CaseRecord | null>(null);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [split, setSplit] = useState(50);

  const refresh = async () => {
    const { case: cc } = await api.getCase(caseId);
    setC(cc);
    setDraft(cc.draft_response || "");
  };

  const stream = useCaseStream(caseId, () => {
    refresh();
    onChanged?.();
  });

  useEffect(() => {
    refresh(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  };

  async function approve() {
    setBusy(true);
    try {
      const r = await api.approve(caseId, { editedDraft: draft });
      const rpa = r.rpa;
      flash(
        rpa.dryRun
          ? `Approved · RPA dry-run → ${rpa.requests[0]?.method} ${rpa.requests[0]?.path}`
          : `Approved · posted to GitHub ✓`
      );
      await refresh();
      onChanged?.();
    } catch (e) {
      flash(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  async function saveDraft() {
    await api.saveDraft(caseId, draft);
    flash("Draft saved");
    onChanged?.();
  }
  async function reject() {
    await api.reject(caseId, "Rejected from dashboard");
    flash("Case rejected");
    await refresh();
    onChanged?.();
  }

  // draggable split divider
  const dragging = useRef(false);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return;
      const host = document.getElementById("editor-host");
      if (!host) return;
      const r = host.getBoundingClientRect();
      setSplit(Math.max(20, Math.min(80, ((e.clientX - r.left) / r.width) * 100)));
    };
    const up = () => (dragging.current = false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  if (!c) return <div className="skeleton" style={{ height: 300, margin: 16 }} />;

  const out = c.pipeline_outputs || {};
  const cls = c.classification || out.classifier?.category;
  const dup = out.retriever?.likely_duplicate_of;
  const voiceScore = out.responder?.voice_match_score;
  const band = priorityBand(c.priority_score);
  const isPending = c.current_stage === "Pending Approval";
  const isDone = c.current_stage === "Executed" || c.current_stage === "Approved";

  return (
    <div style={{ padding: 18 }}>
      <div className="row between" style={{ marginBottom: 4 }}>
        <span className="label">Issue #{c.github_issue_number}</span>
        <span className="tag mono">{c.uipath_case_id}</span>
      </div>
      <h3 style={{ marginBottom: 6 }}>{c.issue.title}</h3>
      <div className="wrap" style={{ marginBottom: 14 }}>
        <span className="muted" style={{ fontSize: 13 }}>@{c.issue.author}</span>
        <span className="tag">{c.current_stage}</span>
        {cls && <span className="pill">{cls}</span>}
        {c.issue.reactions > 0 && <span className="tag">👍 {c.issue.reactions}</span>}
      </div>

      <PipelineStepper states={stream.nodeStates} latencies={stream.latencies} compact />

      <div className="row" style={{ gap: 18, alignItems: "center", margin: "16px 0" }}>
        <PriorityGauge score={c.priority_score} />
        <div className="stack" style={{ gap: 6 }}>
          <div className="label">Priority signals</div>
          <div className="wrap">
            {(out.prioritizer?.signals || []).slice(0, 4).map((s: string, i: number) => (
              <span key={i} className="tag">{s}</span>
            ))}
            {!out.prioritizer && <span className="muted" style={{ fontSize: 13 }}>computing…</span>}
          </div>
        </div>
      </div>

      {/* upstream findings */}
      <div className="card" style={{ padding: 14, marginBottom: 14, background: "var(--bg)" }}>
        <div className="label" style={{ marginBottom: 8 }}>Agent findings</div>
        <div className="kv">
          {dup && (<><span className="k">Duplicate of</span><span>#{dup} (conf {out.retriever?.duplicate_confidence})</span></>)}
          {out.reproducer && (<><span className="k">Reproduction</span><span>{out.reproducer.has_reproduction ? "reproducible" : "needs info"} · {out.reproducer.environment?.runtime}</span></>)}
          {out.source_analyzer?.likely_files?.length > 0 && (<><span className="k">Likely files</span><span className="mono" style={{ fontSize: 12 }}>{out.source_analyzer.likely_files.join(", ")}</span></>)}
          {out.source_analyzer?.hypothesis && (<><span className="k">Hypothesis</span><span style={{ fontSize: 13 }}>{out.source_analyzer.hypothesis}</span></>)}
          <span className="k">Recommended</span><span>{c.recommended_action || out.responder?.recommended_action || "—"}</span>
        </div>
      </div>

      {/* voice confidence */}
      {voiceScore != null && (
        <div style={{ marginBottom: 14 }}>
          <div className="row between" style={{ marginBottom: 4 }}>
            <span className="label">Voice match</span>
            <span className="mono" style={{ fontSize: 13 }}>{Math.round(voiceScore * 100)}%</span>
          </div>
          <div className="confbar"><span style={{ width: `${Math.round(voiceScore * 100)}%` }} /></div>
        </div>
      )}

      {/* draft editor split */}
      <div className="label" style={{ marginBottom: 6 }}>Draft reply (editable)</div>
      <div id="editor-host" className="editor-split" style={{ gridTemplateColumns: `${split}% 6px ${100 - split - 1}%` }}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
        <div
          style={{ cursor: "col-resize", background: "var(--border)" }}
          onMouseDown={() => (dragging.current = true)}
        />
        <MarkdownPreview source={draft} />
      </div>

      <div className="row" style={{ gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button className="btn btn-green" onClick={approve} disabled={busy || isDone}>
          {busy ? "Working…" : isDone ? "✓ Executed" : "Approve & Post"}
        </button>
        <button className="btn" onClick={saveDraft} disabled={busy || isDone}>Save edits</button>
        <button className="btn btn-danger" onClick={reject} disabled={busy || isDone}>Reject</button>
        <Link href={`/case/${caseId}/pipeline`} className="btn btn-ghost" style={{ marginLeft: "auto" }}>
          Pipeline view →
        </Link>
      </div>

      {isPending && (
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Human gate · nothing is posted to GitHub until you approve.
        </p>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
