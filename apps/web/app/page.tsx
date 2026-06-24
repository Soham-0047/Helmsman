"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AGENTS, STAGES } from "../lib/agents";
import { BENCH } from "../lib/insights";
import { AgentIcon, Anchor, UIcon } from "../components/icons";
import { TopNav } from "../components/shell";
import { Button, CountUp, Pill, Reveal, ThemeToggle, useInView } from "../components/ui";

const RECEIPTS = [
  "bug · segfault on null ptr · classified in 0.8s",
  "duplicate · #482 → #119 · flagged by retriever",
  "security · API key in logs · priority 9/10",
  "needs_info · “it doesn't work” · drafted a reply",
  "feature · TOML config · routed to discussion",
  "regression · parser hang · repro in 3.1s",
];

const STATS = [
  { to: 80, suffix: "%", decimals: 0, label: "of maintainer time lost to triage, not code" },
  { to: 7, suffix: "", decimals: 0, label: "specialist agents per issue, one human gate" },
  { to: 11.4, suffix: "s", decimals: 1, label: "median time to a full, voice-matched draft" },
  { to: 0, suffix: "", decimals: 0, label: "issues posted to GitHub without your approval" },
];

const WITHOUT = [
  "Hours a week reading, labeling and de-duping issues",
  "Paraphrased duplicates slip through and fragment threads",
  "Reporters wait days for a first reply",
  "Context-switching away from the code you actually ship",
];
const WITH = [
  "Every new issue arrives classified, deduped and drafted",
  "The retriever catches paraphrased dupes a keyword search misses",
  "A voice-matched reply is waiting the moment you open it",
  "You approve, edit, or reject — and stay in the code",
];

const MODELS: Record<string, string> = {
  classifier: "qwen3-8b",
  retriever: "qwen3-8b · pgvector",
  reproducer: "qwen2.5-coder-7b",
  source_analyzer: "qwen3-long-context",
  prioritizer: "qwen3-8b",
  voice_profiler: "qwen3-32b · thinking",
  responder: "qwen3-32b · reasoning",
};

interface Feature {
  icon: string;
  span: string;
  t: string;
  d: string;
  badge?: string;
  href?: string;
}
const FEATURES: Feature[] = [
  { icon: "sparkles", span: "bento-3", t: "Seven specialist agents", d: "Classifier, Retriever, Reproducer, Source, Prioritizer, Voice, Responder — each a focused call, orchestrated explicitly. No black-box mega-prompt." },
  { icon: "message", span: "bento-3", t: "Replies in your voice", d: "A voice profiler learns your tone, cadence and sign-off from past comments, so every draft reads like you wrote it — not a bot." },
  { icon: "chart", span: "bento-2", t: "Insights & ROI", d: "See the hours of triage you’ve bought back, duplicate-catch rate and trends.", badge: "New", href: "/insights" },
  { icon: "bolt", span: "bento-2", t: "Automation rules", d: "Auto-close confident duplicates, label by type, fast-track security — gate as backstop.", badge: "New", href: "/automations" },
  { icon: "inbox", span: "bento-2", t: "Backlog triage", d: "Point it at years of unanswered issues and clear the backlog in minutes.", badge: "New", href: "/backlog" },
  { icon: "gauge", span: "bento-3", t: "A real control plane", d: "Every prompt and provider lives in a separate, audited admin service. Swap models, ship prompt revisions and toggle flags with no redeploy." },
  { icon: "shield", span: "bento-3", t: "Audited end to end", d: "Each issue is a governed case advancing through seven stages. Every transition, model call and decision is written to an immutable log." },
];

const FAQS = [
  { q: "Does Helmsman post to GitHub on its own?", a: "Never without your say-so. The pipeline only ever assembles a draft and stops at a human approval gate. On approval, an audited UiPath RPA action — the same one you’d take by hand — executes the change." },
  { q: "Why seven agents instead of one big prompt?", a: "Because specialists win. On the same 50 fixtures, the pipeline beats a single-agent baseline by +10pp classification accuracy and nearly 4× response quality — mostly from real duplicate retrieval and voice-matched drafting a single call can’t do." },
  { q: "What happens when a model is down or returns junk?", a: "Every agent has a deterministic local fallback and the router retries with backoff before failing over. The offline demo runs with no API keys at all — byte-for-byte reproducible." },
  { q: "Can I change prompts or swap models without redeploying?", a: "Yes. Prompts, provider routing and feature flags all live in a separate, versioned control plane. Roll a prompt forward or back, or canary a flag, from the admin UI." },
  { q: "Does it work on my existing backlog, or only new issues?", a: "Both. New issues flow in by webhook; Backlog triage runs the same pipeline across your open backlog and opens a governed case for each." },
];

function HeroWord({ children, delay }: { children: string; delay: number }) {
  const grad = children.replace(/[.,]/g, "") === "Helmsman";
  return (
    <span
      className={grad ? "grad-text" : undefined}
      style={{ display: "inline-block", animation: `risein 0.6s var(--ease) ${delay}s both`, marginRight: "0.28em" }}
    >
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

/* Auto-playing 7-agent pipeline preview */
function MiniPipeline() {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  const [step, setStep] = useState(-1); // nodes started; AGENTS.length+1 = gate reached
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!inView) return;
    let i = -1;
    const tick = () => {
      i++;
      setStep(i);
      if (i > AGENTS.length) {
        timer.current = setTimeout(() => {
          i = -1;
          setStep(-1);
          timer.current = setTimeout(tick, 700);
        }, 2400);
        return;
      }
      timer.current = setTimeout(tick, 760);
    };
    timer.current = setTimeout(tick, 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [inView]);

  const gateOn = step >= AGENTS.length;
  const caption =
    step < 0
      ? "Idle — waiting for an issue"
      : gateOn
      ? "Awaiting your approval — nothing posted yet"
      : `${AGENTS[Math.min(step, AGENTS.length - 1)].label} · ${MODELS[AGENTS[Math.min(step, AGENTS.length - 1)].id]}`;

  return (
    <div ref={ref} className="minipipe">
      <div className="row between wrap gap-10" style={{ marginBottom: 18 }}>
        <span className="row gap-8 t-sm">
          <span className="dot dot-accent dot-pulse" /> <span className="mono text-secondary">#482 · Segfault when config block is empty</span>
        </span>
        <span className="tag tag-accent">live trace</span>
      </div>
      <div className="minipipe-track">
        {AGENTS.map((a, i) => {
          const state = step > i ? "done" : step === i ? "on" : "";
          return (
            <div key={a.id} style={{ display: "contents" }}>
              <div className="minipipe-node">
                <div className={`minipipe-ring ${state}`}>
                  {state === "done" ? <UIcon name="check" size={16} /> : <AgentIcon name={a.icon} size={16} />}
                </div>
                <span className="t-xs" style={{ color: state ? "var(--text-secondary)" : "var(--text-muted)", textAlign: "center", lineHeight: 1.15 }}>
                  {a.label}
                </span>
              </div>
              <div className={`minipipe-conn ${step === i + 1 ? "lit" : ""}`} style={{ background: step > i ? "var(--accent-line)" : undefined }} />
            </div>
          );
        })}
        <div className="minipipe-node">
          <div className={`minipipe-ring ${gateOn ? "on" : ""}`} style={gateOn ? { borderColor: "var(--accent)" } : undefined}>
            <UIcon name="lock" size={15} />
          </div>
          <span className="t-xs" style={{ color: gateOn ? "var(--accent)" : "var(--text-muted)", textAlign: "center", fontWeight: gateOn ? 600 : 500 }}>
            You
          </span>
        </div>
      </div>
      <div className="t-sm text-secondary" style={{ marginTop: 16, textAlign: "center", minHeight: 20 }}>
        {caption}
      </div>
    </div>
  );
}

function BenchBars() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  return (
    <div ref={ref} className="col gap-4">
      {BENCH.rows.map((r) => (
        <div key={r.metric} className="bench-row">
          <div>
            <div className="t-sm" style={{ fontWeight: 550 }}>
              {r.metric}
            </div>
            {r.raw ? <div className="mono t-xs text-muted">{r.raw}</div> : null}
          </div>
          <div className="bench-bars">
            <div className="bench-bar base" style={{ width: inView ? `${(r.base / r.max) * 100}%` : 0 }}>
              1 agent · {r.base}
              {r.unit}
            </div>
            <div className="bench-bar pipe" style={{ width: inView ? `${(r.pipe / r.max) * 100}%` : 0, transitionDelay: "0.12s" }}>
              7 agents · {r.pipe}
              {r.unit}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div>
      {FAQS.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className="faq-item">
            <button className={`faq-q ${isOpen ? "open" : ""}`} onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}>
              {f.q}
              <span className="chev">
                <UIcon name="chevronDown" size={18} />
              </span>
            </button>
            <div className={`faq-a ${isOpen ? "open" : ""}`}>{f.a}</div>
          </div>
        );
      })}
    </div>
  );
}

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: React.ReactNode; sub?: string }) {
  return (
    <Reveal>
      <div className="lp-eyebrow" style={{ marginBottom: 14 }}>
        <UIcon name="sparkles" size={13} /> {eyebrow}
      </div>
      <h2 className="lp-section-title">{title}</h2>
      {sub && <p className="lp-section-sub">{sub}</p>}
    </Reveal>
  );
}

const NAV = [
  { id: "features", label: "Features" },
  { id: "pipeline", label: "Pipeline" },
  { id: "benchmarks", label: "Benchmarks" },
  { id: "faq", label: "FAQ" },
];

function ScrollProgress({ targetRef }: { targetRef: React.RefObject<HTMLDivElement | null> }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      setPct(max > 0 ? (el.scrollTop / max) * 100 : 0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [targetRef]);
  return <div className="scroll-prog" style={{ width: `${pct}%` }} />;
}

function NavLinks() {
  const [active, setActive] = useState("");
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive((e.target as HTMLElement).id)),
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    NAV.forEach((n) => {
      const el = document.getElementById(n.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);
  return (
    <nav className="lp-nav nav-hide-sm">
      {NAV.map((n) => (
        <a key={n.id} href={`#${n.id}`} className={active === n.id ? "active" : ""}>
          {n.label}
        </a>
      ))}
    </nav>
  );
}

export default function Landing() {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const head = "Maintainers spend 80% of their time on triage. Helmsman gives it back.".split(" ");
  return (
    <div ref={scrollRef} style={{ height: "100%", overflowY: "auto" }}>
      <ScrollProgress targetRef={scrollRef} />
      <TopNav
        blur
        left={<NavLinks />}
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
      <section style={{ position: "relative", textAlign: "center", padding: "104px 24px 56px", overflow: "hidden" }}>
        <div className="hero-aurora" aria-hidden>
          <b />
          <b />
        </div>
        <div className="hero-glow" />
        <div className="hero-orbit" aria-hidden>
          <span className="float" style={{ width: 360, height: 360, opacity: 0.5 }} />
          <span className="float" style={{ width: 560, height: 560, opacity: 0.32, animationDelay: "1.5s" }} />
          <span className="float" style={{ width: 760, height: 760, opacity: 0.18, animationDelay: "3s" }} />
        </div>
        <div style={{ position: "relative", maxWidth: 860, margin: "0 auto" }} className="col gap-24">
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Pill>
              <span style={{ display: "inline-flex" }}>
                <Anchor size={13} />
              </span>{" "}
              AI co-pilot for open-source maintainers
            </Pill>
          </div>
          <h1 className="t-display" style={{ fontSize: "min(56px, 8.5vw)", lineHeight: 1.08, fontWeight: 680, maxWidth: 880, margin: "0 auto" }}>
            {head.map((w, i) => (
              <HeroWord key={i} delay={0.1 + i * 0.05}>
                {w}
              </HeroWord>
            ))}
          </h1>
          <p className="text-secondary" style={{ fontSize: 17.5, maxWidth: 640, margin: "0 auto", animation: "fadein 0.8s 0.7s both" }}>
            A seven-agent pipeline triages every new GitHub issue — classify, dedupe, reproduce, analyze source, and draft
            a reply in your voice — then waits for you to approve.
          </p>
          <div className="row center gap-10 hero-cta" style={{ animation: "fadein 0.8s 0.9s both" }}>
            <Button variant="primary" size="lg" icon={<UIcon name="play" size={15} />} onClick={() => router.push("/dashboard?demo=1")}>
              Run the live demo
            </Button>
            <Button variant="secondary" size="lg" onClick={() => router.push("/connect")}>
              Connect a repo
            </Button>
          </div>
          <div className="row center gap-8 t-xs text-muted" style={{ animation: "fadein 0.8s 1.1s both" }}>
            <UIcon name="lock" size={12} /> Nothing is posted to GitHub without your approval
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 6, animation: "fadein 1s 1.4s both" }}>
            <a href="#features" className="scroll-cue" aria-label="Scroll to features">
              <span className="t-xs">scroll</span>
              <UIcon name="chevronDown" size={18} />
            </a>
          </div>
        </div>
      </section>

      {/* stat band */}
      <section className="lp-section" style={{ paddingTop: 24, paddingBottom: 24 }}>
        <div className="stat-band">
          {STATS.map((s, i) => (
            <Reveal key={i} delay={i * 70}>
              <div className="stat-card">
                <div className="stat-num grad-text">
                  <CountUp to={s.to} decimals={s.decimals} suffix={s.suffix} />
                </div>
                <div className="stat-label">{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <Ticker />

      {/* problem */}
      <section className="lp-section">
        <SectionHead
          eyebrow="The triage tax"
          title="Maintainers don't quit because of hard bugs. They quit from the inbox."
          sub="60–80% of a maintainer's time goes to reading, labeling and de-duplicating issues — not writing code. Helmsman does the legwork and hands you the decision."
        />
        <Reveal>
          <div className="compare-grid" style={{ marginTop: 32 }}>
            <div className="compare-col">
              <div className="row gap-8" style={{ marginBottom: 8 }}>
                <span style={{ color: "var(--red)", display: "inline-flex" }}>
                  <UIcon name="close" size={16} />
                </span>
                <span style={{ fontWeight: 600 }}>Without Helmsman</span>
              </div>
              {WITHOUT.map((l) => (
                <div key={l} className="compare-line">
                  <span className="compare-ic" style={{ color: "var(--text-muted)" }}>
                    <UIcon name="close" size={14} />
                  </span>
                  {l}
                </div>
              ))}
            </div>
            <div className="compare-col good">
              <div className="row gap-8" style={{ marginBottom: 8 }}>
                <span style={{ color: "var(--accent)", display: "inline-flex" }}>
                  <Anchor size={16} />
                </span>
                <span style={{ fontWeight: 600 }}>With Helmsman</span>
              </div>
              {WITH.map((l) => (
                <div key={l} className="compare-line" style={{ color: "var(--text)" }}>
                  <span className="compare-ic" style={{ color: "var(--green)" }}>
                    <UIcon name="check" size={14} />
                  </span>
                  {l}
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* live pipeline preview */}
      <section className="lp-section" style={{ paddingTop: 24 }}>
        <SectionHead
          eyebrow="Watch it think"
          title="Seven agents fire on every issue — in seconds."
          sub="Each agent is a focused, typed call. The pipeline routes around itself: duplicates skip reproduction, spam stops early. It all ends at one place — you."
        />
        <Reveal delay={60}>
          <div style={{ marginTop: 28 }}>
            <MiniPipeline />
          </div>
        </Reveal>
      </section>

      {/* features bento */}
      <section id="features" className="lp-section" style={{ paddingTop: 24 }}>
        <SectionHead eyebrow="The product" title="Everything a maintainer needs to take back the inbox." />
        <div className="bento" style={{ marginTop: 32 }}>
          {FEATURES.map((f, i) => (
            <Reveal key={f.t} delay={i * 50} className={f.span}>
              <div
                className="bento-card"
                style={{ height: "100%", cursor: f.href ? "pointer" : "default" }}
                onClick={f.href ? () => router.push(f.href!) : undefined}
              >
                {f.badge && <span className="feat-badge">{f.badge}</span>}
                <span className="feat-ic">
                  <UIcon name={f.icon} size={18} />
                </span>
                <h3 className="t-h3" style={{ marginBottom: 8 }}>
                  {f.t}
                </h3>
                <p className="t-sm text-secondary">{f.d}</p>
                {f.href && (
                  <span className="row gap-6 t-sm" style={{ color: "var(--accent)", marginTop: 14, fontWeight: 550 }}>
                    Explore <UIcon name="arrowRight" size={14} />
                  </span>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* benchmarks */}
      <section id="benchmarks" className="lp-section" style={{ paddingTop: 24 }}>
        <SectionHead
          eyebrow="Proof, not vibes"
          title="Seven specialists beat one generalist."
          sub={`Same ${BENCH.nIssues} issues through a single ${"qwen3-8b"} call vs. the Helmsman pipeline. The gain comes from real duplicate retrieval and voice-matched drafting a single shot can't do.`}
        />
        <Reveal delay={60}>
          <div className="card card-pad" style={{ marginTop: 28 }}>
            <BenchBars />
            <p className="t-xs text-muted" style={{ marginTop: 14 }}>
              Agent-Society A/B · {BENCH.mode} · regenerated by <span className="mono">npm run benchmark</span>. Response
              quality is an LLM-judge score (1–5); voice match is cosine to the maintainer's real comments.
            </p>
          </div>
        </Reveal>
      </section>

      {/* agents */}
      <section id="pipeline" className="lp-section" style={{ paddingTop: 24 }}>
        <SectionHead eyebrow="Under the hood" title="Meet the crew." sub="Each agent runs the right Qwen model for its job — small and fast where the task is bounded, reasoning where it's hard." />
        <div className="agents-grid" style={{ marginTop: 32 }}>
          {AGENTS.map((a, i) => (
            <Reveal key={a.id} delay={i * 40}>
              <div className="agent-card">
                <div className="row gap-10" style={{ marginBottom: 10 }}>
                  <span className="feat-ic" style={{ width: 34, height: 34, marginBottom: 0 }}>
                    <AgentIcon name={a.icon} size={16} />
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{a.label}</div>
                    <div className="mono t-xs text-muted">{MODELS[a.id]}</div>
                  </div>
                </div>
                <p className="t-sm text-secondary">{a.desc}</p>
              </div>
            </Reveal>
          ))}
          <Reveal delay={AGENTS.length * 40}>
            <div className="agent-card" style={{ borderColor: "var(--accent-line)", background: "var(--accent-soft)" }}>
              <div className="row gap-10" style={{ marginBottom: 10 }}>
                <span className="feat-ic" style={{ width: 34, height: 34, marginBottom: 0 }}>
                  <UIcon name="lock" size={16} />
                </span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>You</div>
                  <div className="mono t-xs text-muted">the human gate</div>
                </div>
              </div>
              <p className="t-sm text-secondary">Approve, edit, or reject the assembled draft. The final call is always yours.</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* lifecycle */}
      <section className="lp-section" style={{ paddingTop: 24, textAlign: "center" }}>
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

      {/* governance band */}
      <section className="lp-section" style={{ paddingTop: 24 }}>
        <div className="tri-grid">
          {[
            { icon: "lock", t: "Human-in-the-loop, always", d: "The pipeline drafts; you decide. Nothing reaches GitHub until you approve the exact action." },
            { icon: "gauge", t: "Controlled, not hardcoded", d: "Prompts, providers and flags live in a versioned control plane. Change behavior with no redeploy." },
            { icon: "shield", t: "Fully audited", d: "Every transition, model call and human decision is written to an immutable log you can replay." },
          ].map((c, i) => (
            <Reveal key={c.t} delay={i * 60}>
              <div className="card feat-card card-pad" style={{ height: "100%" }}>
                <span className="feat-ic">
                  <UIcon name={c.icon} size={18} />
                </span>
                <h3 className="t-h3" style={{ marginBottom: 8 }}>
                  {c.t}
                </h3>
                <p className="t-sm text-secondary">{c.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* faq */}
      <section id="faq" className="lp-section" style={{ paddingTop: 24, maxWidth: 760 }}>
        <SectionHead eyebrow="Questions" title="The things maintainers ask first." />
        <Reveal delay={60}>
          <div style={{ marginTop: 24 }}>
            <Faq />
          </div>
        </Reveal>
      </section>

      {/* final CTA */}
      <section className="lp-section" style={{ paddingTop: 24 }}>
        <Reveal>
          <div className="cta-banner">
            <div className="lp-eyebrow" style={{ justifyContent: "center", marginBottom: 14 }}>
              <Anchor size={13} /> Take back the inbox
            </div>
            <h2 className="lp-section-title" style={{ margin: "0 auto", maxWidth: 620 }}>
              Stop triaging. Start <span className="grad-text">approving</span>.
            </h2>
            <p className="lp-section-sub" style={{ margin: "12px auto 0" }}>
              Run the full seven-agent pipeline on a fixture issue — no keys, no setup, no GitHub account touched.
            </p>
            <div className="row center gap-10 hero-cta" style={{ marginTop: 26 }}>
              <Button variant="primary" size="lg" icon={<UIcon name="play" size={15} />} onClick={() => router.push("/dashboard?demo=1")}>
                Run the live demo
              </Button>
              <Button variant="secondary" size="lg" iconRight={<UIcon name="arrowRight" size={15} />} onClick={() => router.push("/connect")}>
                Connect a repo
              </Button>
            </div>
          </div>
        </Reveal>
      </section>

      {/* footer */}
      <footer className="lp-footer">
        <div className="lp-footer-cols">
          <div>
            <div className="row gap-8" style={{ marginBottom: 12 }}>
              <span style={{ color: "var(--accent)", display: "inline-flex" }}>
                <Anchor size={18} />
              </span>
              <span style={{ fontWeight: 680, fontSize: 16, letterSpacing: "-0.02em" }}>Helmsman</span>
            </div>
            <p className="t-sm text-secondary" style={{ maxWidth: 280 }}>
              An AI co-pilot for open-source maintainers. Seven agents triage; you decide.
            </p>
          </div>
          <div>
            <div className="t-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 8 }}>
              Product
            </div>
            <a className="fl" href="#features">Features</a>
            <a className="fl" onClick={() => router.push("/insights")}>Insights</a>
            <a className="fl" onClick={() => router.push("/automations")}>Automations</a>
            <a className="fl" onClick={() => router.push("/backlog")}>Backlog triage</a>
          </div>
          <div>
            <div className="t-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 8 }}>
              Learn
            </div>
            <a className="fl" href="#pipeline">The pipeline</a>
            <a className="fl" href="#benchmarks">Benchmarks</a>
            <a className="fl" href="#faq">FAQ</a>
            <a className="fl" href="https://github.com" target="_blank" rel="noreferrer">Docs</a>
          </div>
          <div>
            <div className="t-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 8 }}>
              Built for
            </div>
            <a className="fl" href="https://github.com" target="_blank" rel="noreferrer">UiPath AgentHack</a>
            <a className="fl" href="https://github.com" target="_blank" rel="noreferrer">Qwen Global AI</a>
            <a className="fl" href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
          </div>
        </div>
        <div className="lp-footer-bar">
          <div className="row between wrap gap-12" style={{ maxWidth: 1080, margin: "0 auto", padding: "16px 24px" }}>
            <span className="t-sm text-muted">⚓ Helmsman · MIT licensed</span>
            <div className="row gap-8 wrap">
              <span className="tag">UiPath AgentHack · Maestro Case</span>
              <span className="tag">Global AI Hackathon · Qwen</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
