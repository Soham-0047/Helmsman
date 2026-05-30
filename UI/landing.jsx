/* ============================================================
   Helmsman — Landing / marketing (route /)
   ============================================================ */

const RECEIPTS = [
  "bug · segfault on null ptr · classified in 0.8s",
  "duplicate · #482 → #119 · flagged by retriever",
  "security · API key in logs · priority 9/10",
  "needs_info · “it doesn't work” · drafted a reply",
  "feature · TOML config · routed to discussion",
  "regression · parser hang · repro in 3.1s",
];

const FEATURES = [
  { t: "Seven specialist agents", d: "Classifier, Retriever, Reproducer, Source, Prioritizer, Voice, Responder — each a focused call, orchestrated explicitly." },
  { t: "Human-in-the-loop, always", d: "Nothing posts to GitHub without your approval. You approve, edit, or reject the assembled draft at the gate." },
  { t: "A real control plane", d: "Every prompt and provider lives in a separate, audited admin service. Swap models, ship prompt revisions, toggle flags without redeploy." },
  { t: "Audited end to end", d: "Each issue is a governed case advancing through seven stages. Every transition, model call, and decision is logged." },
];

function HeroWord({ children, delay }) {
  return <span style={{ display: "inline-block", animation: `risein 0.6s var(--ease) ${delay}s both`, marginRight: "0.28em" }}>{children}</span>;
}

function Ticker() {
  const items = [...RECEIPTS, ...RECEIPTS];
  return (
    <div className="ticker">
      <div className="ticker-track">
        {items.map((r, i) => (
          <span key={i} className="ticker-item">
            <span style={{ color: "var(--green)", display: "inline-flex" }}><UIcon name="check" size={14} /></span>
            <span className="mono t-sm text-secondary">{r}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Landing({ onNav }) {
  const head = "Maintainers spend 80% of their time on triage. Helmsman gives it back.".split(" ");
  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <TopNav onNav={onNav} blur
        right={<>
          <button className="btn btn-ghost">Docs</button>
          <button className="btn btn-ghost" aria-label="GitHub"><UIcon name="github" size={16} /></button>
          <ThemeToggle />
          <Button variant="primary" onClick={() => onNav("/dashboard")}>Open dashboard</Button>
        </>} />

      {/* hero */}
      <section style={{ position: "relative", textAlign: "center", padding: "96px 24px 64px", overflow: "hidden" }}>
        <div className="hero-glow" />
        <div style={{ position: "relative", maxWidth: 820, margin: "0 auto" }} className="col gap-24" >
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Pill><span style={{ display: "inline-flex" }}><Anchor size={13} /></span> AI co-pilot for open-source maintainers</Pill>
          </div>
          <h1 className="t-display" style={{ fontSize: "min(54px, 8.5vw)", lineHeight: 1.08, fontWeight: 680, maxWidth: 880, margin: "0 auto" }}>
            {head.map((w, i) => <HeroWord key={i} delay={0.1 + i * 0.05}>{w}</HeroWord>)}
          </h1>
          <p className="text-secondary" style={{ fontSize: 17, maxWidth: 620, margin: "0 auto", animation: "fadein 0.8s 0.7s both" }}>
            A seven-agent pipeline triages every new GitHub issue — classify, dedupe, reproduce, analyze source, and draft a reply in your voice — then waits for you to approve.
          </p>
          <div className="row center gap-10" style={{ animation: "fadein 0.8s 0.9s both" }}>
            <Button variant="primary" size="lg" icon={<UIcon name="play" size={15} />} onClick={() => onNav("/connect")}>Run the live demo</Button>
            <Button variant="secondary" size="lg" onClick={() => onNav("/connect")}>Connect a repo</Button>
          </div>
        </div>
      </section>

      {/* ticker */}
      <Ticker />

      {/* features */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "72px 24px 24px" }}>
        <div className="feat-grid">
          {FEATURES.map((f, i) => (
            <div key={i} className="card feat-card card-pad">
              <div className="feat-num mono">0{i + 1}</div>
              <h3 className="t-h3" style={{ margin: "14px 0 8px" }}>{f.t}</h3>
              <p className="t-sm text-secondary">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* lifecycle */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "56px 24px 24px", textAlign: "center" }}>
        <h2 className="t-h3 text-secondary" style={{ fontWeight: 550, marginBottom: 28 }}>Seven governed stages, one human gate</h2>
        <div className="row wrap center gap-6" style={{ rowGap: 14 }}>
          {HELM.STAGES.map((s, i) => (
            <React.Fragment key={s}>
              <div className="lifecycle-chip">
                <span className="mono t-xs" style={{ color: i === 4 ? "var(--accent)" : "var(--text-muted)" }}>{String(i + 1).padStart(2, "0")}</span>
                <span className="t-sm" style={{ color: i === 4 ? "var(--accent)" : "var(--text)", fontWeight: i === 4 ? 600 : 500 }}>{s}</span>
              </div>
              {i < HELM.STAGES.length - 1 && <span style={{ color: "var(--text-muted)", display: "inline-flex" }}><UIcon name="chevronRight" size={14} /></span>}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* footer */}
      <footer style={{ borderTop: "1px solid var(--border)", marginTop: 64, padding: "28px 24px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }} className="row between wrap gap-16">
          <div className="row gap-12">
            <Logo size={15} onClick={() => onNav("/")} />
            <span className="t-sm text-muted">MIT licensed</span>
          </div>
          <div className="row gap-8 wrap">
            <span className="tag">UiPath AgentHack · Maestro Case</span>
            <span className="tag">Global AI Hackathon · Qwen</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
Object.assign(window, { Landing });
