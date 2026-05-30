import { Nav } from "../components/Brand";
import { MagneticButton } from "../components/MagneticButton";

const HEADLINE = "Maintainers spend 80% of their time on triage. Helmsman gives it back.".split(" ");

const RECEIPTS = [
  "✓ bug · segfault on null ptr · classified in 0.8s",
  "✓ duplicate · #482 → #119 · flagged by retriever",
  "✓ feature · YAML config · routed, low priority",
  "✓ security · API key in logs · priority 9/10",
  "✓ needs_info · 'it doesn't work' · drafted a reply",
  "✓ question · streaming support · pointed to docs",
];

const FEATURES = [
  {
    t: "Seven specialist agents",
    d: "Classifier, Retriever, Reproducer, Source Analyzer, Voice Profiler, Responder, Prioritizer — each a focused Qwen call, orchestrated explicitly. No framework, no chain.invoke().",
  },
  {
    t: "Human-in-the-loop, always",
    d: "Nothing is ever posted to GitHub without your approval. The maintainer approves, edits, or rejects the assembled draft at the gate.",
  },
  {
    t: "A real control plane",
    d: "Every prompt and provider lives in a separate, audited Admin Service. Swap models, ship prompt revisions, toggle features — without redeploying Helmsman.",
  },
  {
    t: "UiPath Maestro orchestration",
    d: "Each issue is a Maestro Case advancing through seven governed stages. On approval, UiPath RPA executes the action on GitHub. Every transition is audited.",
  },
];

const STAGES = ["Intake", "Classification", "Investigation", "Drafting", "Pending Approval", "Approved", "Executed"];

export default function Landing() {
  return (
    <>
      <Nav />
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-content">
          <div className="pill" style={{ marginBottom: 24 }}>
            ⚓ AI co-pilot for open-source maintainers
          </div>
          <h1 className="display" style={{ marginBottom: 24 }}>
            {HEADLINE.map((w, i) => (
              <span key={i} className="word" style={{ animationDelay: `${i * 80}ms`, marginRight: "0.25em" }}>
                {w}
              </span>
            ))}
          </h1>
          <p className="muted" style={{ fontSize: 18, maxWidth: 620, margin: "0 auto 32px" }}>
            Helmsman runs a seven-agent pipeline over every new issue — triage, duplicate detection,
            reproduction, source analysis, and a draft reply in your voice — then waits for you to approve.
          </p>
          <div className="row" style={{ justifyContent: "center", gap: 14 }}>
            <MagneticButton href="/dashboard?demo=1">▶ Run the live demo</MagneticButton>
            <MagneticButton href="/connect" className="btn">
              Connect a repo
            </MagneticButton>
          </div>
        </div>
      </section>

      <div className="ticker">
        <div className="ticker-track">
          {[...RECEIPTS, ...RECEIPTS].map((r, i) => {
            const [tick, ...rest] = r.split(" ");
            return (
              <span className="receipt" key={i}>
                <b>{tick}</b> {rest.join(" ")}
              </span>
            );
          })}
        </div>
      </div>

      <section className="container" style={{ padding: "80px 24px" }}>
        <div className="label" style={{ marginBottom: 8 }}>What it does</div>
        <h2 style={{ marginBottom: 32 }}>Triage that keeps you in command.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {FEATURES.map((f) => (
            <div className="glass" key={f.t} style={{ padding: 22 }}>
              <h3 style={{ marginBottom: 8 }}>{f.t}</h3>
              <p className="muted">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container" style={{ padding: "0 24px 80px" }}>
        <div className="label" style={{ marginBottom: 8 }}>The Maestro Case lifecycle</div>
        <h2 style={{ marginBottom: 24 }}>Seven governed stages, one human gate.</h2>
        <div className="wrap" style={{ gap: 10 }}>
          {STAGES.map((s, i) => (
            <span key={s} className="row" style={{ gap: 10 }}>
              <span className="tag" style={{ padding: "8px 14px", fontSize: 13 }}>
                {i + 1}. {s}
              </span>
              {i < STAGES.length - 1 && <span className="muted">→</span>}
            </span>
          ))}
        </div>
      </section>

      <footer className="container" style={{ padding: "32px 24px 60px", borderTop: "1px solid var(--border)" }}>
        <div className="row between" style={{ flexWrap: "wrap", gap: 12 }}>
          <span className="muted">MIT licensed · Built with Claude Code</span>
          <div className="wrap">
            <span className="tag">UiPath AgentHack · Maestro Case</span>
            <span className="tag">Global AI Hackathon · Qwen · Track 3</span>
          </div>
        </div>
      </footer>
    </>
  );
}
