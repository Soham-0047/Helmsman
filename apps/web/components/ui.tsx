"use client";
// Helmsman UI primitives + theme/toast providers. Ported from the design system
// to typed TSX. Everything is class-driven off globals.css tokens.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AGENTS, band } from "../lib/agents";
import type { NodeKey, NodeState } from "../lib/types";
import { Anchor, AgentIcon, UIcon } from "./icons";

/* ============================================================
   Theme
   ============================================================ */
type ThemeCtx = { theme: string; toggle: (e?: { clientX: number; clientY: number }) => void };
const ThemeContext = createContext<ThemeCtx>({ theme: "dark", toggle: () => {} });
export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const t = localStorage.getItem("helmsman-theme") || "dark";
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  const toggle = useCallback(
    (e?: { clientX: number; clientY: number }) => {
      setTheme((prev) => {
        const next = prev === "dark" ? "light" : "dark";
        const apply = () => {
          document.documentElement.setAttribute("data-theme", next);
          localStorage.setItem("helmsman-theme", next);
        };
        // Circle-wipe reveal from the click point (progressive enhancement).
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        if (e && !reduce) {
          const el = document.createElement("div");
          el.className = "theme-reveal";
          el.style.setProperty("--x", `${e.clientX}px`);
          el.style.setProperty("--y", `${e.clientY}px`);
          document.body.appendChild(el);
          requestAnimationFrame(apply);
          setTimeout(() => el.remove(), 550);
        } else {
          apply();
        }
        return next;
      });
    },
    []
  );

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      className="btn btn-ghost"
      onClick={(e) => toggle({ clientX: e.clientX, clientY: e.clientY })}
      aria-label="Toggle theme"
      style={{ width: 34, padding: 0 }}
    >
      <UIcon name={theme === "dark" ? "sun" : "moon"} size={16} />
    </button>
  );
}

/* ============================================================
   Toast
   ============================================================ */
type ToastCtx = { push: (node: ReactNode) => void };
const ToastContext = createContext<ToastCtx>({ push: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: string; node: ReactNode }[]>([]);
  const push = useCallback((node: ReactNode) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, node }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.node}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ============================================================
   Button
   ============================================================ */
type ButtonProps = {
  variant?: "primary" | "secondary" | "ghost" | "success" | "danger";
  size?: "lg";
  busy?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
  children?: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = "secondary",
  size,
  busy,
  icon,
  iconRight,
  block,
  children,
  ...rest
}: ButtonProps) {
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

/* ============================================================
   Logo
   ============================================================ */
export function Logo({
  size = 17,
  onClick,
  muted,
}: {
  size?: number;
  onClick?: () => void;
  muted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label="Helmsman home"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontWeight: 680,
        fontSize: size,
        letterSpacing: "-0.02em",
        color: "var(--text)",
      }}
    >
      <span style={{ color: muted ? "var(--text-secondary)" : "var(--accent)", display: "inline-flex" }}>
        <Anchor size={size + 2} />
      </span>
      Helmsman
    </button>
  );
}

/* ============================================================
   Tag / Pill / Dot
   ============================================================ */
type ToneStr = "accent" | "green" | "amber" | "red" | "blue" | null;

export function Tag({
  tone,
  mono = true,
  children,
  style,
}: {
  tone?: ToneStr;
  mono?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const t = tone ? `tag-${tone}` : "";
  return (
    <span className={`tag ${t}`} style={mono ? style : { ...style, fontFamily: "var(--font-ui)" }}>
      {children}
    </span>
  );
}

export function Pill({
  neutral,
  children,
  style,
}: {
  neutral?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return <span className={`pill ${neutral ? "pill-neutral" : ""}`} style={style}>{children}</span>;
}

export function StatusDot({ tone = "grey", pulse }: { tone?: string; pulse?: boolean }) {
  return (
    <span
      className={`dot dot-${tone} ${pulse ? "dot-pulse" : ""}`}
      style={pulse ? { color: `var(--${tone === "accent" ? "accent" : tone})` } : undefined}
    />
  );
}

export function ClassPill({ value }: { value: string }) {
  const tone = (
    { bug: "red", security: "red", feature: "blue", question: "amber", needs_info: "amber" } as Record<string, ToneStr>
  )[value];
  if (value === "duplicate") return <Pill neutral>duplicate</Pill>;
  return <Tag tone={tone ?? null}>{value.replace("_", "-")}</Tag>;
}

export function PriorityBadge({ p }: { p: number }) {
  return <Tag tone={band(p)}>priority {p}/10</Tag>;
}

/* ============================================================
   Circular priority gauge
   ============================================================ */
export function PriorityGauge({
  p,
  size = 96,
  animate = true,
}: {
  p: number;
  size?: number;
  animate?: boolean;
}) {
  const [val, setVal] = useState(animate ? 0 : p);
  useEffect(() => {
    if (!animate) {
      setVal(p);
      return;
    }
    const id = requestAnimationFrame(() => setVal(p));
    return () => cancelAnimationFrame(id);
  }, [p, animate]);
  const color = `var(--${band(p)})`;
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - val / 10);
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 1s var(--ease)" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="mono" style={{ fontSize: size * 0.3, fontWeight: 600, color }}>
          {p}
        </span>
        <span className="t-xs text-muted" style={{ marginTop: -2 }}>
          / 10
        </span>
      </div>
    </div>
  );
}

/* ============================================================
   Key/value + Skeleton
   ============================================================ */
export function KeyValue({ rows }: { rows: Record<string, { v: ReactNode; mono?: boolean }> }) {
  return (
    <dl className="kv">
      {Object.entries(rows).map(([k, o]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd className={o.mono ? "mono" : ""} style={o.mono ? { fontSize: 12.5 } : undefined}>
            {o.v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Skeleton({ w = "100%", h = 12, r = 6, style }: { w?: number | string; h?: number; r?: number; style?: CSSProperties }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

/* ============================================================
   Pipeline stepper — the seven agents
   node states: idle | active | complete | loaded | skipped | error
   ============================================================ */
export function NodeRing({ state, children }: { state: NodeState; children?: ReactNode }) {
  const map: Record<string, { bd: string; bg: string; fg: string }> = {
    idle: { bd: "var(--border-strong)", bg: "var(--surface)", fg: "var(--text-muted)" },
    active: { bd: "var(--accent)", bg: "var(--accent-soft)", fg: "var(--accent)" },
    complete: { bd: "var(--green)", bg: "var(--green-soft)", fg: "var(--green)" },
    loaded: { bd: "var(--blue)", bg: "var(--blue-soft)", fg: "var(--blue)" },
    error: { bd: "var(--red)", bg: "var(--red-soft)", fg: "var(--red)" },
    skipped: { bd: "var(--border)", bg: "transparent", fg: "var(--text-muted)" },
  };
  const s = map[state] || map.idle;
  return (
    <div
      style={{
        position: "relative",
        width: 38,
        height: 38,
        borderRadius: 10,
        flex: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: `1.5px ${state === "skipped" ? "dashed" : "solid"} ${s.bd}`,
        background: s.bg,
        color: s.fg,
        opacity: state === "skipped" ? 0.55 : 1,
        transition: "all 0.25s var(--ease)",
      }}
    >
      {state === "active" && (
        <span
          style={{
            position: "absolute",
            inset: -1.5,
            borderRadius: 10,
            border: "1.5px solid transparent",
            borderTopColor: "var(--accent)",
            animation: "spin 0.9s linear infinite",
          }}
        />
      )}
      {state === "complete" ? <UIcon name="check" size={17} /> : children}
    </div>
  );
}

export function PipelineStepper({
  states = {},
  latencies = {},
  compact = false,
  showLatency = true,
}: {
  states?: Partial<Record<NodeKey, NodeState>>;
  latencies?: Partial<Record<NodeKey, number>>;
  compact?: boolean;
  showLatency?: boolean;
}) {
  return (
    <div className="row" style={{ width: "100%", overflowX: "auto", padding: compact ? "4px 0" : "8px 0" }}>
      {AGENTS.map((a, i) => {
        const st = states[a.id] || "idle";
        const next = AGENTS[i + 1];
        return (
          <div key={a.id} style={{ display: "contents" }}>
            <div className="col" style={{ alignItems: "center", gap: 6, flex: "none", width: compact ? 60 : 78 }}>
              <NodeRing state={st}>
                <AgentIcon name={a.icon} size={17} />
              </NodeRing>
              <span
                className="t-xs"
                style={{
                  color: st === "idle" || st === "skipped" ? "var(--text-muted)" : "var(--text-secondary)",
                  fontWeight: 500,
                  textAlign: "center",
                  lineHeight: 1.2,
                }}
              >
                {a.label}
              </span>
              {showLatency && st === "complete" && latencies[a.id] && (
                <span className="mono t-xs text-muted" style={{ marginTop: -3 }}>
                  {latencies[a.id]}ms
                </span>
              )}
            </div>
            {next && (
              <div
                style={{
                  flex: 1,
                  minWidth: compact ? 10 : 18,
                  height: 1.5,
                  background:
                    states[next.id] && states[next.id] !== "idle" ? "var(--border-strong)" : "var(--border)",
                  marginTop: compact ? -16 : -24,
                  borderRadius: 2,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   Reveal — animate children in when scrolled into view
   ============================================================ */
export function Reveal({
  children,
  delay = 0,
  className = "",
  style,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${shown ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms`, ...style }}>
      {children}
    </div>
  );
}

/* ============================================================
   useInView — fire once when an element scrolls into view
   ============================================================ */
export function useInView<T extends HTMLElement = HTMLDivElement>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
          }
        });
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/* ============================================================
   CountUp — animate a number up when scrolled into view
   ============================================================ */
export function CountUp({
  to,
  decimals = 0,
  duration = 1100,
  prefix = "",
  suffix = "",
  className,
  style,
}: {
  to: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.5);
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const reduce =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setVal(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setVal(to * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setVal(to);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);
  const text = val.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <span ref={ref} className={className} style={style}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

// Reusable hooks-free utility: detect narrow viewport.
export function useNarrow(bp = 720) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < bp);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [bp]);
  return narrow;
}

// Re-export so callers can `import { ... } from "../components/ui"`.
export { useRef, useEffect, useState };
