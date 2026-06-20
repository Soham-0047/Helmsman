"use client";
import { useRouter } from "next/navigation";
import { STAGES } from "../lib/agents";
import { Anchor, UIcon } from "../components/icons";
import { TopNav } from "../components/shell";
import { Button, Pill, Reveal, ThemeToggle } from "../components/ui";

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

function HeroWord({ children, delay }: { children: string; delay: number }) {
  return (
    <span style={{ display: "inline-block", animation: `risein 0.6s var(--ease) ${delay}s both`, marginRight: "0.28em" }}>
      {children}
    </span>
  );
}

function Ticker() {
  const items = [...RECEIPTS, ...RECEIPTS];
  return (
    <div className="ticker">
      <div className="ticker-track">
        {items.map((r, i) => (
          <span key={i} className="ticker-item">
            <span style={{ color: "var(--green)", display: "inline-flex" }}>
              <UIcon name="check" size={14} />
            </span>
            <span className="mono t-sm text-secondary">{r}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  const router = useRouter();
  const head = "Maintainers spend 80% of their time on triage. Helmsman gives it back.".split(" ");
  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <TopNav
        blur
        right={
          <>
            <a className="btn btn-ghost nav-hide-sm" href="https://github.com" target="_blank" rel="noreferrer">
              Docs
            </a>
            <a className="btn btn-ghost" aria-label="GitHub" href="https://github.com" target="_blank" rel="noreferrer">
              <UIcon name="github" size={16} />
            </a>
            <ThemeToggle />
            <Button variant="primary" onClick={() => router.push("/dashboard")}>
              Dashboard
            </Button>
          </>
        }
      />

      {/* hero */}
      <section style={{ position: "relative", textAlign: "center", padding: "96px 24px 64px", overflow: "hidden" }}>
        <div className="hero-glow" />
        <div style={{ position: "relative", maxWidth: 820, margin: "0 auto" }} className="col gap-24">
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Pill>
              <span style={{ display: "inline-flex" }}>
                <Anchor size={13} />
              </span>{" "}
              AI co-pilot for open-source maintainers
            </Pill>
          </div>
          <h1
            className="t-display"
            style={{ fontSize: "min(54px, 8.5vw)", lineHeight: 1.08, fontWeight: 680, maxWidth: 880, margin: "0 auto" }}
          >
            {head.map((w, i) => (
              <HeroWord key={i} delay={0.1 + i * 0.05}>
                {w}
              </HeroWord>
            ))}
          </h1>
          <p
            className="text-secondary"
            style={{ fontSize: 17, maxWidth: 620, margin: "0 auto", animation: "fadein 0.8s 0.7s both" }}
          >
            A seven-agent pipeline triages every new GitHub issue — classify, dedupe, reproduce, analyze source, and
            draft a reply in your voice — then waits for you to approve.
          </p>
          <div className="row center gap-10 hero-cta" style={{ animation: "fadein 0.8s 0.9s both" }}>
            <Button variant="primary" size="lg" icon={<UIcon name="play" size={15} />} onClick={() => router.push("/dashboard?demo=1")}>
              Run the live demo
            </Button>
            <Button variant="secondary" size="lg" onClick={() => router.push("/connect")}>
              Connect a repo
            </Button>
          </div>
        </div>
      </section>

      <Ticker />

      {/* features */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "72px 24px 24px" }}>
        <div className="feat-grid">
          {FEATURES.map((f, i) => (
            <Reveal key={i} delay={i * 90}>
              <div className="card feat-card card-pad" style={{ height: "100%" }}>
                <div className="feat-num mono">0{i + 1}</div>
                <h3 className="t-h3" style={{ margin: "14px 0 8px" }}>
                  {f.t}
                </h3>
                <p className="t-sm text-secondary">{f.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* lifecycle */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "56px 24px 24px", textAlign: "center" }}>
        <Reveal>
          <h2 className="t-h3 text-secondary" style={{ fontWeight: 550, marginBottom: 28 }}>
            Seven governed stages, one human gate
          </h2>
          <div className="row wrap center gap-6" style={{ rowGap: 14 }}>
            {STAGES.map((s, i) => (
              <span key={s} className="row gap-6" style={{ flexWrap: "wrap" }}>
                <div className="lifecycle-chip">
                  <span className="mono t-xs" style={{ color: i === 4 ? "var(--accent)" : "var(--text-muted)" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="t-sm" style={{ color: i === 4 ? "var(--accent)" : "var(--text)", fontWeight: i === 4 ? 600 : 500 }}>
                    {s}
                  </span>
                </div>
                {i < STAGES.length - 1 && (
                  <span style={{ color: "var(--text-muted)", display: "inline-flex" }}>
                    <UIcon name="chevronRight" size={14} />
                  </span>
                )}
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* footer */}
      <footer style={{ borderTop: "1px solid var(--border)", marginTop: 64, padding: "28px 24px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }} className="row between wrap gap-16">
          <div className="row gap-12">
            <span className="t-sm text-muted">⚓ Helmsman · MIT licensed</span>
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
