/* ============================================================
   Helmsman — UI primitives
   ============================================================ */
const { useState, useEffect, useRef, useCallback, createContext, useContext } = React;

/* ---- theme context (provided in app.jsx) ---- */
const ThemeContext = createContext({ theme: "dark", toggle: () => {} });
const useTheme = () => useContext(ThemeContext);

/* ---- toast context ---- */
const ToastContext = createContext({ push: () => {} });
const useToast = () => useContext(ToastContext);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((node) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, node }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => <div key={t.id} className="toast">{t.node}</div>)}
      </div>
    </ToastContext.Provider>
  );
}

/* ---- Button ---- */
function Button({ variant = "secondary", size, busy, icon, iconRight, block, children, ...rest }) {
  const cls = ["btn", `btn-${variant}`];
  if (size === "lg") cls.push("btn-lg");
  if (block) cls.push("btn-block");
  return (
    <button className={cls.join(" ")} {...rest}>
      {busy ? <span className="spinner" /> : icon}
      {children}
      {iconRight}
    </button>
  );
}

/* ---- Logo ---- */
function Logo({ size = 17, onClick, muted }) {
  return (
    <button onClick={onClick} aria-label="Helmsman home"
      style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 680, fontSize: size, letterSpacing: "-0.02em", color: "var(--text)" }}>
      <span style={{ color: muted ? "var(--text-secondary)" : "var(--accent)", display: "inline-flex" }}><Anchor size={size + 2} /></span>
      Helmsman
    </button>
  );
}

/* ---- Tag / Pill / Dot ---- */
function Tag({ tone, mono = true, children, style }) {
  const t = tone ? `tag-${tone}` : "";
  return <span className={`tag ${t}`} style={mono ? style : { ...style, fontFamily: "var(--font-ui)" }}>{children}</span>;
}
function Pill({ neutral, children, style }) {
  return <span className={`pill ${neutral ? "pill-neutral" : ""}`} style={style}>{children}</span>;
}
function StatusDot({ tone = "grey", pulse }) {
  return <span className={`dot dot-${tone} ${pulse ? "dot-pulse" : ""}`} style={pulse ? { color: `var(--${tone === "accent" ? "accent" : tone})` } : null} />;
}

/* ---- classification pill ---- */
function ClassPill({ value }) {
  const tone = { bug: "red", security: "red", feature: "blue", question: "amber", needs_info: "amber" }[value];
  const label = value.replace("_", "-");
  if (value === "duplicate") return <Pill neutral>duplicate</Pill>;
  return <Tag tone={tone}>{label}</Tag>;
}

/* ---- priority badge ---- */
function PriorityBadge({ p }) {
  const b = HELM.band(p);
  return <Tag tone={b}>priority {p}/10</Tag>;
}

/* ---- circular priority gauge ---- */
function PriorityGauge({ p, size = 96, animate = true }) {
  const [val, setVal] = useState(animate ? 0 : p);
  useEffect(() => {
    if (!animate) { setVal(p); return; }
    const id = requestAnimationFrame(() => setVal(p));
    return () => cancelAnimationFrame(id);
  }, [p, animate]);
  const b = HELM.band(p);
  const color = `var(--${b})`;
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - val / 10);
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 1s var(--ease)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span className="mono" style={{ fontSize: size * 0.3, fontWeight: 600, color }}>{p}</span>
        <span className="t-xs text-muted" style={{ marginTop: -2 }}>/ 10</span>
      </div>
    </div>
  );
}

/* ---- key/value list ---- */
function KeyValue({ rows }) {
  return (
    <dl className="kv">
      {Object.entries(rows).map(([k, o]) => (
        <React.Fragment key={k}>
          <dt>{k}</dt>
          <dd className={o.mono ? "mono" : ""} style={o.mono ? { fontSize: 12.5 } : null}>{o.v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/* ---- Skeleton ---- */
function Skeleton({ w = "100%", h = 12, r = 6, style }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

/* ---- Theme toggle button ---- */
function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button className="btn btn-ghost" onClick={toggle} aria-label="Toggle theme"
      style={{ width: 34, padding: 0 }}>
      <UIcon name={theme === "dark" ? "sun" : "moon"} size={16} />
    </button>
  );
}

/* ============================================================
   Pipeline stepper — the seven agents
   node states: idle | active | complete | skipped | error | context
   ============================================================ */
function NodeRing({ state, children }) {
  const map = {
    idle:     { bd: "var(--border-strong)", bg: "var(--surface)", fg: "var(--text-muted)" },
    active:   { bd: "var(--accent)",        bg: "var(--accent-soft)", fg: "var(--accent)" },
    complete: { bd: "var(--green)",         bg: "var(--green-soft)",  fg: "var(--green)" },
    context:  { bd: "var(--blue)",          bg: "var(--blue-soft)",   fg: "var(--blue)" },
    error:    { bd: "var(--red)",           bg: "var(--red-soft)",    fg: "var(--red)" },
    skipped:  { bd: "var(--border)",        bg: "transparent",        fg: "var(--text-muted)" },
  };
  const s = map[state] || map.idle;
  return (
    <div style={{
      position: "relative", width: 38, height: 38, borderRadius: 10, flex: "none",
      display: "flex", alignItems: "center", justifyContent: "center",
      border: `1.5px ${state === "skipped" ? "dashed" : "solid"} ${s.bd}`,
      background: s.bg, color: s.fg,
      opacity: state === "skipped" ? 0.55 : 1,
      transition: "all 0.25s var(--ease)",
    }}>
      {state === "active" && (
        <span style={{ position: "absolute", inset: -1.5, borderRadius: 10, border: "1.5px solid transparent", borderTopColor: "var(--accent)", animation: "spin 0.9s linear infinite" }} />
      )}
      {state === "complete" ? <UIcon name="check" size={17} /> : children}
    </div>
  );
}

function PipelineStepper({ states = {}, latencies = {}, compact = false, showLatency = true }) {
  return (
    <div className="row" style={{ width: "100%", overflowX: "auto", padding: compact ? "4px 0" : "8px 0" }}>
      {HELM.AGENTS.map((a, i) => {
        const st = states[a.id] || "idle";
        return (
          <React.Fragment key={a.id}>
            <div className="col" style={{ alignItems: "center", gap: 6, flex: "none", width: compact ? 60 : 78 }}>
              <NodeRing state={st}><AgentIcon name={a.icon} size={17} /></NodeRing>
              <span className="t-xs" style={{ color: st === "idle" || st === "skipped" ? "var(--text-muted)" : "var(--text-secondary)", fontWeight: 500, textAlign: "center", lineHeight: 1.2 }}>{a.label}</span>
              {showLatency && st === "complete" && latencies[a.id] && (
                <span className="mono t-xs text-muted" style={{ marginTop: -3 }}>{latencies[a.id]}ms</span>
              )}
            </div>
            {i < HELM.AGENTS.length - 1 && (
              <div style={{ flex: 1, minWidth: compact ? 10 : 18, height: 1.5, background: states[HELM.AGENTS[i+1]?.id] && states[HELM.AGENTS[i+1].id] !== "idle" ? "var(--border-strong)" : "var(--border)", marginTop: compact ? -16 : -24, borderRadius: 2 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

Object.assign(window, {
  ThemeContext, useTheme, ToastContext, useToast, ToastProvider,
  Button, Logo, Tag, Pill, StatusDot, ClassPill, PriorityBadge, PriorityGauge,
  KeyValue, Skeleton, ThemeToggle, NodeRing, PipelineStepper,
});
