/* ============================================================
   Helmsman — Case review (HITL gate) + markdown
   Used full-page on /case/[id] and condensed in the dashboard panel.
   ============================================================ */

const { useState, useEffect, useRef } = React;

/* ---- tiny GitHub-flavored markdown renderer ---- */
function mdToHtml(src) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])@([a-z0-9_-]+)/gi, '$1<span class="md-mention">@$2</span>')
    .replace(/(#\d+)/g, '<span class="md-issue">$1</span>');
  const out = [];
  const parts = src.split(/```/);
  parts.forEach((chunk, i) => {
    if (i % 2 === 1) {
      const lines = chunk.replace(/^\n/, "").split("\n");
      let lang = "";
      if (lines[0] && !lines[0].includes(" ") && lines[0].length < 12) lang = lines.shift();
      const code = lines.join("\n").replace(/\n$/, "");
      const colored = esc(code)
        .replace(/^([+].*)$/gm, '<span class="md-add">$1</span>')
        .replace(/^([-].*)$/gm, '<span class="md-del">$1</span>')
        .replace(/(\/\/.*)$/gm, '<span class="md-cmt">$1</span>');
      out.push(`<pre class="md-pre"><div class="md-lang">${lang || "code"}</div><code>${colored}</code></pre>`);
    } else {
      chunk.split(/\n{2,}/).forEach((para) => {
        const p = para.trim();
        if (!p) return;
        out.push(`<p>${inline(p).replace(/\n/g, "<br/>")}</p>`);
      });
    }
  });
  return out.join("");
}

function MarkdownPreview({ text }) {
  return <div className="md-body" dangerouslySetInnerHTML={{ __html: mdToHtml(text) }} />;
}

/* derive pipeline node states from a case */
function caseStates(c) {
  const states = {};
  let activeSet = false;
  for (const a of HELM.AGENTS) {
    if (c.skipped?.includes(a.id)) { states[a.id] = "skipped"; continue; }
    if (c.latencies?.[a.id]) { states[a.id] = "complete"; continue; }
    if (!activeSet && ["Drafting", "Investigation", "Classification"].includes(c.stage)) {
      states[a.id] = "active"; activeSet = true;
    } else states[a.id] = "idle";
  }
  return states;
}

function stageTone(stage) {
  return {
    "Pending Approval": "accent", "Approved": "green", "Executed": "green",
    "Drafting": "amber", "Investigation": "blue", "Classification": "blue", "Intake": null,
  }[stage];
}

/* ---- voice match bar ---- */
function VoiceBar({ pct }) {
  const [w, setW] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setW(pct)); return () => cancelAnimationFrame(id); }, [pct]);
  return (
    <div>
      <div className="row between" style={{ marginBottom: 7 }}>
        <span className="t-sm text-secondary">Voice match</span>
        <span className="mono t-sm" style={{ color: "var(--accent)", fontWeight: 600 }}>{pct}%</span>
      </div>
      <div style={{ height: 7, borderRadius: 999, background: "var(--elevated)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${w}%`, borderRadius: 999, transition: "width 1s var(--ease)",
          background: "linear-gradient(90deg, var(--blue), var(--accent))" }} />
      </div>
    </div>
  );
}

/* ---- split draft editor with draggable divider ---- */
function DraftEditor({ value, onChange, condensed }) {
  const [split, setSplit] = useState(54);
  const [tab, setTab] = useState("edit"); // for condensed
  const wrapRef = useRef(null);
  const drag = useRef(false);

  useEffect(() => {
    const move = (e) => {
      if (!drag.current || !wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      const pct = ((e.clientX - r.left) / r.width) * 100;
      setSplit(Math.min(78, Math.max(28, pct)));
    };
    const up = () => { drag.current = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, []);

  if (condensed) {
    return (
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="row" style={{ borderBottom: "1px solid var(--border)" }}>
          {["edit", "preview"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className="t-sm"
              style={{ padding: "8px 14px", color: tab === t ? "var(--text)" : "var(--text-muted)", fontWeight: tab === t ? 600 : 500,
                borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent", textTransform: "capitalize" }}>{t}</button>
          ))}
        </div>
        {tab === "edit"
          ? <textarea className="md-textarea" value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} style={{ minHeight: 200 }} />
          : <div style={{ padding: "14px 16px", maxHeight: 320, overflowY: "auto" }}><MarkdownPreview text={value} /></div>}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="card" style={{ display: "flex", overflow: "hidden", height: 380, position: "relative" }}>
      <div style={{ width: `${split}%`, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div className="md-editor-head">draft.md</div>
        <textarea className="md-textarea" value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} style={{ flex: 1 }} />
      </div>
      <div onMouseDown={() => { drag.current = true; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }}
        style={{ width: 7, flex: "none", cursor: "col-resize", background: "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>
        <span style={{ color: "var(--text-muted)" }}><UIcon name="grip" size={14} /></span>
      </div>
      <div style={{ width: `${100 - split}%`, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div className="md-editor-head">preview</div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}><MarkdownPreview text={value} /></div>
      </div>
    </div>
  );
}

/* ============================================================
   CaseReview
   ============================================================ */
function CaseReview({ caseData, condensed = false, onClose, onAction, onPipeline }) {
  const c = caseData;
  const [draft, setDraft] = useState(c.draft);
  const [status, setStatus] = useState(c.stage);
  const { push } = useToast();
  useEffect(() => { setDraft(c.draft); setStatus(c.stage); }, [c.id]);

  const executed = status === "Executed";
  const states = caseStates(c);

  const approve = () => {
    setStatus("Executed");
    push(<><span style={{ color: "var(--green)" }}><UIcon name="check" size={15} /></span><span>Approved · <span className="mono">RPA dry-run → POST /repos/.../issues/{c.num}/comments</span></span></>);
    onAction?.("approved");
  };
  const save = () => { push(<><span style={{ color: "var(--accent)" }}><UIcon name="check" size={15} /></span><span>Draft saved</span></>); };
  const reject = () => { push(<><span style={{ color: "var(--red)" }}><UIcon name="close" size={14} /></span><span>Rejected · case archived, nothing posted</span></>); onAction?.("rejected"); };

  const pad = condensed ? 16 : 28;

  return (
    <div className="col" style={{ height: condensed ? "100%" : "auto" }}>
      {/* header bar (condensed panel only) */}
      {condensed && (
        <div className="row between" style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", flex: "none" }}>
          <span className="t-sm" style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Case review</span>
          <button className="btn btn-ghost" style={{ width: 30, height: 30, padding: 0 }} onClick={onClose} aria-label="Close panel"><UIcon name="close" size={16} /></button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: condensed ? "auto" : "visible", padding: pad }} className="col gap-20">
        {/* 1. issue header */}
        <div className="col gap-10">
          <div className="row between">
            <span className="mono t-sm text-secondary">Issue #{c.num}</span>
            <Tag tone="accent">{c.caseId}</Tag>
          </div>
          <h3 className={condensed ? "t-h3" : "t-h2"} style={{ textWrap: "pretty" }}>{c.title}</h3>
          <div className="row wrap gap-8">
            <span className="t-sm text-muted">@{c.author}</span>
            <Tag tone={stageTone(status)}>{status}</Tag>
            <ClassPill value={c.classification} />
            {c.reactions > 0 && <span className="tag"><span style={{ color: "var(--red)", display: "inline-flex" }}><UIcon name="heart" size={11} /></span> {c.reactions}</span>}
          </div>
        </div>

        {/* 2. pipeline stepper */}
        <div className="card card-pad" style={{ padding: condensed ? 14 : 18 }}>
          <PipelineStepper states={states} latencies={c.latencies} compact={condensed} />
        </div>

        {/* 3. priority + signals */}
        <div className="row gap-20" style={{ alignItems: "center", flexWrap: condensed ? "wrap" : "nowrap" }}>
          <PriorityGauge p={c.priority} size={condensed ? 80 : 96} />
          <div className="grow">
            <div className="t-sm text-secondary" style={{ marginBottom: 9 }}>Priority signals</div>
            <div className="row wrap gap-6">
              {c.signals.map((s) => <span key={s} className="tag" style={{ fontFamily: "var(--font-ui)" }}>{s}</span>)}
            </div>
          </div>
        </div>

        {/* 4. findings */}
        <div className="card card-pad" style={{ padding: condensed ? 16 : 20 }}>
          <div className="t-sm text-secondary" style={{ marginBottom: 13, fontWeight: 600 }}>Agent findings</div>
          <KeyValue rows={c.findings} />
        </div>

        {/* 5. voice */}
        <VoiceBar pct={c.voice} />

        {/* 6. draft */}
        <div>
          <div className="row between" style={{ marginBottom: 10 }}>
            <span className="t-sm text-secondary" style={{ fontWeight: 600 }}>Draft reply <span className="text-muted" style={{ fontWeight: 400 }}>(editable)</span></span>
          </div>
          <DraftEditor value={draft} onChange={setDraft} condensed={condensed} />
        </div>

        {/* 7. actions */}
        <div className="col gap-10">
          <div className="row wrap gap-8 between">
            <div className="row gap-8 wrap">
              {executed
                ? <Button variant="success" disabled icon={<UIcon name="check" size={15} />}>Executed</Button>
                : <Button variant="success" icon={<UIcon name="check" size={15} />} onClick={approve}>Approve &amp; Post</Button>}
              <Button variant="secondary" onClick={save} disabled={executed}>Save edits</Button>
              <Button variant="danger" onClick={reject} disabled={executed}>Reject</Button>
            </div>
            {!condensed && onPipeline && (
              <Button variant="ghost" iconRight={<UIcon name="arrowRight" size={15} />} onClick={onPipeline}>Pipeline view</Button>
            )}
          </div>
          <p className="t-xs text-muted row gap-6">
            <span style={{ color: "var(--accent)", display: "inline-flex" }}><Anchor size={13} /></span>
            Human gate · nothing is posted to GitHub until you approve.
          </p>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CaseReview, MarkdownPreview, mdToHtml, caseStates, stageTone, VoiceBar, DraftEditor });
