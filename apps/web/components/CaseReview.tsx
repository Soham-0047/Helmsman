"use client";
// Human-in-the-loop gate. Reviews the seven agents' output and approves / saves /
// rejects the drafted reply. Used full-page on /case/[id] and condensed in the
// dashboard side panel. Wired to the real gateway, with an optional `initial` VM
// so it renders instantly (and works offline against mock data).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { stageTone } from "../lib/agents";
import { api } from "../lib/api";
import type { NodeKey } from "../lib/types";
import { useCaseStream } from "../lib/useCaseStream";
import { deriveStates, toView, type CaseVM } from "../lib/viewmodel";
import { UIcon } from "./icons";
import { MarkdownPreview } from "./MarkdownPreview";
import {
  Button,
  ClassPill,
  KeyValue,
  PipelineStepper,
  PriorityGauge,
  Skeleton,
  Tag,
  useNarrow,
  useToast,
} from "./ui";

/* ---- voice match bar ---- */
function VoiceBar({ pct }: { pct: number }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return (
    <div>
      <div className="row between" style={{ marginBottom: 7 }}>
        <span className="t-sm text-secondary">Voice match</span>
        <span className="mono t-sm" style={{ color: "var(--accent)", fontWeight: 600 }}>
          {pct}%
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 999, background: "var(--elevated)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${w}%`,
            borderRadius: 999,
            transition: "width 1s var(--ease)",
            background: "linear-gradient(90deg, var(--blue), var(--accent))",
          }}
        />
      </div>
    </div>
  );
}

/* ---- split draft editor with draggable divider ---- */
function DraftEditor({
  value,
  onChange,
  condensed,
}: {
  value: string;
  onChange: (v: string) => void;
  condensed?: boolean;
}) {
  const [split, setSplit] = useState(54);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const narrow = useNarrow(760);
  // On phones the side-by-side split is too cramped — fall back to tabs.
  const tabbed = condensed || narrow;

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current || !wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      const pct = ((e.clientX - r.left) / r.width) * 100;
      setSplit(Math.min(78, Math.max(28, pct)));
    };
    const up = () => {
      drag.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  if (tabbed) {
    return (
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="row" style={{ borderBottom: "1px solid var(--border)" }}>
          {(["edit", "preview"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="t-sm"
              style={{
                padding: "8px 14px",
                color: tab === t ? "var(--text)" : "var(--text-muted)",
                fontWeight: tab === t ? 600 : 500,
                borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
                textTransform: "capitalize",
              }}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === "edit" ? (
          <textarea
            className="md-textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            style={{ minHeight: 200 }}
          />
        ) : (
          <div style={{ padding: "14px 16px", maxHeight: 320, overflowY: "auto" }}>
            <MarkdownPreview source={value} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="card" style={{ display: "flex", overflow: "hidden", height: 380, position: "relative" }}>
      <div style={{ width: `${split}%`, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div className="md-editor-head">draft.md</div>
        <textarea
          className="md-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          style={{ flex: 1 }}
        />
      </div>
      <div
        onMouseDown={() => {
          drag.current = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
        style={{
          width: 7,
          flex: "none",
          cursor: "col-resize",
          background: "var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderLeft: "1px solid var(--border)",
          borderRight: "1px solid var(--border)",
        }}
      >
        <span style={{ color: "var(--text-muted)" }}>
          <UIcon name="grip" size={14} />
        </span>
      </div>
      <div style={{ width: `${100 - split}%`, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div className="md-editor-head">preview</div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
          <MarkdownPreview source={value} />
        </div>
      </div>
    </div>
  );
}

export interface CaseReviewProps {
  caseId: string;
  initial?: CaseVM;
  condensed?: boolean;
  onClose?: () => void;
  onAction?: (action: "approved" | "rejected" | "saved") => void;
  onChanged?: () => void;
}

export function CaseReview({ caseId, initial, condensed = false, onClose, onAction, onChanged }: CaseReviewProps) {
  const router = useRouter();
  const { push } = useToast();
  const [vm, setVm] = useState<CaseVM | null>(initial ?? null);
  const [draft, setDraft] = useState(initial?.draft ?? "");
  const [override, setOverride] = useState<string | null>(null); // local stage override after approve/reject
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const { case: cc } = await api.getCase(caseId);
      const v = toView(cc);
      setVm(v);
      setDraft((d) => (d ? d : v.draft));
    } catch {
      // offline / unknown id — keep the seed vm if we have one
    }
  };

  const stream = useCaseStream(caseId, () => {
    refresh();
    onChanged?.();
  });

  useEffect(() => {
    setVm(initial ?? null);
    setDraft(initial?.draft ?? "");
    setOverride(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  if (!vm) {
    return (
      <div className="col gap-12" style={{ padding: condensed ? 16 : 28 }}>
        <Skeleton w="40%" h={14} />
        <Skeleton w="70%" h={22} />
        <Skeleton h={120} r={12} style={{ marginTop: 8 }} />
        <Skeleton h={180} r={12} />
      </div>
    );
  }

  const status = override ?? stream.stage ?? vm.stage;
  const executed = status === "Executed";
  const states = deriveStates(vm, stream.nodeStates);
  const latencies = { ...vm.latencies, ...stream.latencies } as Partial<Record<NodeKey, number>>;
  const pad = condensed ? 16 : 28;

  const approve = async () => {
    setBusy(true);
    try {
      const r = await api.approve(caseId, { editedDraft: draft });
      const rpa = r?.rpa;
      const msg =
        rpa?.dryRun || !rpa
          ? `RPA dry-run → ${rpa?.requests?.[0]?.method ?? "POST"} ${rpa?.requests?.[0]?.path ?? `/repos/.../issues/${vm.num}/comments`}`
          : "posted to GitHub ✓";
      push(
        <>
          <span style={{ color: "var(--green)" }}>
            <UIcon name="check" size={15} />
          </span>
          <span>
            Approved · <span className="mono">{msg}</span>
          </span>
        </>
      );
    } catch {
      push(
        <>
          <span style={{ color: "var(--green)" }}>
            <UIcon name="check" size={15} />
          </span>
          <span>
            Approved · <span className="mono">RPA dry-run → POST /repos/.../issues/{vm.num}/comments</span>
          </span>
        </>
      );
    } finally {
      setBusy(false);
      setOverride("Executed");
      onAction?.("approved");
      onChanged?.();
    }
  };

  const save = async () => {
    try {
      await api.saveDraft(caseId, draft);
    } catch {
      /* offline */
    }
    push(
      <>
        <span style={{ color: "var(--accent)" }}>
          <UIcon name="check" size={15} />
        </span>
        <span>Draft saved</span>
      </>
    );
    onAction?.("saved");
    onChanged?.();
  };

  const reject = async () => {
    try {
      await api.reject(caseId, "Rejected from dashboard");
    } catch {
      /* offline */
    }
    push(
      <>
        <span style={{ color: "var(--red)" }}>
          <UIcon name="close" size={14} />
        </span>
        <span>Rejected · case archived, nothing posted</span>
      </>
    );
    onAction?.("rejected");
    onChanged?.();
  };

  return (
    <div className="col" style={{ height: condensed ? "100%" : "auto" }}>
      {condensed && (
        <div
          className="row between"
          style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", flex: "none" }}
        >
          <span className="t-sm" style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
            Case review
          </span>
          <button
            className="btn btn-ghost"
            style={{ width: 30, height: 30, padding: 0 }}
            onClick={onClose}
            aria-label="Close panel"
          >
            <UIcon name="close" size={16} />
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: condensed ? "auto" : "visible", padding: pad }} className="col gap-20">
        {/* 1. issue header */}
        <div className="col gap-10">
          <div className="row between">
            <span className="mono t-sm text-secondary">Issue #{vm.num}</span>
            <Tag tone="accent">{vm.caseId}</Tag>
          </div>
          <h3 className={condensed ? "t-h3" : "t-h2"} style={{ textWrap: "pretty" }}>
            {vm.title}
          </h3>
          <div className="row wrap gap-8">
            <span className="t-sm text-muted">@{vm.author}</span>
            <Tag tone={stageTone(status)}>{status}</Tag>
            <ClassPill value={vm.classification} />
            {vm.reactions > 0 && (
              <span className="tag">
                <span style={{ color: "var(--red)", display: "inline-flex" }}>
                  <UIcon name="heart" size={11} />
                </span>{" "}
                {vm.reactions}
              </span>
            )}
          </div>
        </div>

        {/* 2. pipeline stepper */}
        <div className="card card-pad" style={{ padding: condensed ? 14 : 18 }}>
          <PipelineStepper states={states} latencies={latencies} compact={condensed} />
        </div>

        {/* 3. priority + signals */}
        <div className="row gap-20" style={{ alignItems: "center", flexWrap: condensed ? "wrap" : "nowrap" }}>
          <PriorityGauge p={vm.priority} size={condensed ? 80 : 96} />
          <div className="grow">
            <div className="t-sm text-secondary" style={{ marginBottom: 9 }}>
              Priority signals
            </div>
            <div className="row wrap gap-6">
              {vm.signals.length === 0 && <span className="t-sm text-muted">computing…</span>}
              {vm.signals.map((s) => (
                <span key={s} className="tag" style={{ fontFamily: "var(--font-ui)" }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 4. findings */}
        {Object.keys(vm.findings).length > 0 && (
          <div className="card card-pad" style={{ padding: condensed ? 16 : 20 }}>
            <div className="t-sm text-secondary" style={{ marginBottom: 13, fontWeight: 600 }}>
              Agent findings
            </div>
            <KeyValue rows={vm.findings} />
          </div>
        )}

        {/* 5. voice */}
        {vm.voice > 0 && <VoiceBar pct={vm.voice} />}

        {/* 6. draft */}
        <div>
          <div className="row between" style={{ marginBottom: 10 }}>
            <span className="t-sm text-secondary" style={{ fontWeight: 600 }}>
              Draft reply <span className="text-muted" style={{ fontWeight: 400 }}>(editable)</span>
            </span>
          </div>
          <DraftEditor value={draft} onChange={setDraft} condensed={condensed} />
        </div>

        {/* 7. actions */}
        <div className="col gap-10">
          <div className="row wrap gap-8 between">
            <div className="row gap-8 wrap">
              {executed ? (
                <Button variant="success" disabled icon={<UIcon name="check" size={15} />}>
                  Executed
                </Button>
              ) : (
                <Button variant="success" busy={busy} icon={busy ? null : <UIcon name="check" size={15} />} onClick={approve}>
                  Approve &amp; Post
                </Button>
              )}
              <Button variant="secondary" onClick={save} disabled={executed || busy}>
                Save edits
              </Button>
              <Button variant="danger" onClick={reject} disabled={executed || busy}>
                Reject
              </Button>
            </div>
            {!condensed && (
              <Button
                variant="ghost"
                iconRight={<UIcon name="arrowRight" size={15} />}
                onClick={() => router.push(`/case/${caseId}/pipeline`)}
              >
                Pipeline view
              </Button>
            )}
          </div>
          <p className="t-xs text-muted row gap-6">
            <span style={{ color: "var(--accent)", display: "inline-flex" }}>
              <UIcon name="check" size={12} />
            </span>
            Human gate · nothing is posted to GitHub until you approve.
          </p>
        </div>
      </div>
    </div>
  );
}
