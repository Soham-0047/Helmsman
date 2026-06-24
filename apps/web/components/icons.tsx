// Monochrome, glyph-style icons (stroke 1.6). Ported from the design system.
import type { ReactNode } from "react";

function Svg({ size = 18, sw = 1.6, children }: { size?: number; sw?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// --- brand mark: anchor ---
export function Anchor({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="4.5" r="2" />
      <line x1="12" y1="6.5" x2="12" y2="21" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <path d="M4 13.5a8 8 0 0 0 16 0" />
      <line x1="4" y1="13.5" x2="4" y2="11.5" />
      <line x1="20" y1="13.5" x2="20" y2="11.5" />
    </svg>
  );
}

// --- agent glyphs (keyed by AGENTS[].icon) ---
const AGENT_ICONS: Record<string, (s: number) => ReactNode> = {
  tag: (s) => (
    <Svg size={s}>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H11l9 9-6.5 6.5L4.5 11V6.5z" />
      <circle cx="7.5" cy="9" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  ),
  layers: (s) => (
    <Svg size={s}>
      <path d="M12 3 3 8l9 5 9-5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </Svg>
  ),
  flask: (s) => (
    <Svg size={s}>
      <path d="M9 3h6" />
      <path d="M10 3v6L5 19a1.5 1.5 0 0 0 1.4 2h11.2A1.5 1.5 0 0 0 19 19l-5-10V3" />
      <path d="M7.5 14h9" />
    </Svg>
  ),
  code: (s) => (
    <Svg size={s}>
      <polyline points="8 7 3 12 8 17" />
      <polyline points="16 7 21 12 16 17" />
      <line x1="13" y1="5" x2="11" y2="19" />
    </Svg>
  ),
  bars: (s) => (
    <Svg size={s}>
      <line x1="6" y1="20" x2="6" y2="13" />
      <line x1="12" y1="20" x2="12" y2="5" />
      <line x1="18" y1="20" x2="18" y2="10" />
    </Svg>
  ),
  wave: (s) => (
    <Svg size={s}>
      <line x1="4" y1="12" x2="4" y2="12" />
      <line x1="8" y1="9" x2="8" y2="15" />
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="16" y1="8" x2="16" y2="16" />
      <line x1="20" y1="11" x2="20" y2="13" />
    </Svg>
  ),
  message: (s) => (
    <Svg size={s}>
      <path d="M4 5h16v11H8l-4 4V5z" />
      <line x1="8" y1="10" x2="16" y2="10" />
    </Svg>
  ),
};

export function AgentIcon({ name, size = 16 }: { name: string; size?: number }) {
  return <>{(AGENT_ICONS[name] || AGENT_ICONS.tag)(size)}</>;
}

// --- UI icons ---
const Icons: Record<string, (s: number) => ReactNode> = {
  close: (s) => (
    <Svg size={s}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </Svg>
  ),
  check: (s) => (
    <Svg size={s} sw={2}>
      <polyline points="4 12 9 17 20 6" />
    </Svg>
  ),
  chevronRight: (s) => (
    <Svg size={s}>
      <polyline points="9 6 15 12 9 18" />
    </Svg>
  ),
  chevronLeft: (s) => (
    <Svg size={s}>
      <polyline points="15 6 9 12 15 18" />
    </Svg>
  ),
  arrowRight: (s) => (
    <Svg size={s}>
      <line x1="4" y1="12" x2="20" y2="12" />
      <polyline points="14 6 20 12 14 18" />
    </Svg>
  ),
  plus: (s) => (
    <Svg size={s}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Svg>
  ),
  play: (s) => (
    <Svg size={s}>
      <path d="M7 5l12 7-12 7V5z" fill="currentColor" stroke="none" />
    </Svg>
  ),
  sun: (s) => (
    <Svg size={s}>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4.5" />
      <line x1="12" y1="19.5" x2="12" y2="22" />
      <line x1="2" y1="12" x2="4.5" y2="12" />
      <line x1="19.5" y1="12" x2="22" y2="12" />
      <line x1="4.9" y1="4.9" x2="6.6" y2="6.6" />
      <line x1="17.4" y1="17.4" x2="19.1" y2="19.1" />
      <line x1="4.9" y1="19.1" x2="6.6" y2="17.4" />
      <line x1="17.4" y1="6.6" x2="19.1" y2="4.9" />
    </Svg>
  ),
  moon: (s) => (
    <Svg size={s}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z" />
    </Svg>
  ),
  github: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.4 9.4 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2z" />
    </svg>
  ),
  docs: (s) => (
    <Svg size={s}>
      <path d="M6 3h9l4 4v14H6V3z" />
      <polyline points="14 3 14 8 19 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </Svg>
  ),
  externalLink: (s) => (
    <Svg size={s}>
      <path d="M14 4h6v6" />
      <line x1="20" y1="4" x2="11" y2="13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Svg>
  ),
  grip: (s) => (
    <Svg size={s} sw={1.4}>
      <circle cx="9" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="17" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="17" r="1" fill="currentColor" stroke="none" />
    </Svg>
  ),
  heart: (s) => (
    <Svg size={s}>
      <path d="M12 20s-7-4.5-7-9.5A3.5 3.5 0 0 1 12 7a3.5 3.5 0 0 1 7 3.5C19 15.5 12 20 12 20z" />
    </Svg>
  ),
  menu: (s) => (
    <Svg size={s}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </Svg>
  ),
  chevronDown: (s) => (
    <Svg size={s}>
      <polyline points="6 9 12 15 18 9" />
    </Svg>
  ),
  chart: (s) => (
    <Svg size={s}>
      <path d="M4 4v16h16" />
      <path d="M8 14l3-3 3 2 4-5" />
    </Svg>
  ),
  bolt: (s) => (
    <Svg size={s}>
      <path d="M13 3 5 13h5l-1 8 8-11h-5l1-7z" />
    </Svg>
  ),
  inbox: (s) => (
    <Svg size={s}>
      <path d="M4 13h4l1.5 3h5L16 13h4" />
      <path d="M4 13 6 5h12l2 8v6H4v-6z" />
    </Svg>
  ),
  shield: (s) => (
    <Svg size={s}>
      <path d="M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3z" />
      <polyline points="9 12 11 14 15 9.5" />
    </Svg>
  ),
  clock: (s) => (
    <Svg size={s}>
      <circle cx="12" cy="12" r="8.5" />
      <polyline points="12 7 12 12 16 14" />
    </Svg>
  ),
  sparkles: (s) => (
    <Svg size={s}>
      <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4z" />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
    </Svg>
  ),
  gauge: (s) => (
    <Svg size={s}>
      <path d="M4 15a8 8 0 0 1 16 0" />
      <line x1="12" y1="15" x2="15.5" y2="10.5" />
      <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  ),
  bell: (s) => (
    <Svg size={s}>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </Svg>
  ),
  users: (s) => (
    <Svg size={s}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8" />
      <path d="M17 14.2A5.5 5.5 0 0 1 20.5 20" />
    </Svg>
  ),
  lock: (s) => (
    <Svg size={s}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  ),
  repeat: (s) => (
    <Svg size={s}>
      <polyline points="17 2 21 6 17 10" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 22 3 18 7 14" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </Svg>
  ),
  filter: (s) => (
    <Svg size={s}>
      <path d="M3 5h18l-7 8v6l-4-2v-4L3 5z" />
    </Svg>
  ),
  trendUp: (s) => (
    <Svg size={s}>
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="15 7 21 7 21 13" />
    </Svg>
  ),
  target: (s) => (
    <Svg size={s}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </Svg>
  ),
  quote: (s) => (
    <Svg size={s}>
      <path d="M9 7H5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2v2a2 2 0 0 1-2 2" />
      <path d="M19 7h-4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2v2a2 2 0 0 1-2 2" />
    </Svg>
  ),
  pause: (s) => (
    <Svg size={s} sw={2}>
      <line x1="9" y1="5" x2="9" y2="19" />
      <line x1="15" y1="5" x2="15" y2="19" />
    </Svg>
  ),
  arrowDown: (s) => (
    <Svg size={s}>
      <line x1="12" y1="4" x2="12" y2="20" />
      <polyline points="6 14 12 20 18 14" />
    </Svg>
  ),
  branch: (s) => (
    <Svg size={s}>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="8" r="2.2" />
      <path d="M6 8.2v7.6" />
      <path d="M18 10.2c0 4-4 3.3-6 5.2" />
    </Svg>
  ),
};

export function UIcon({ name, size = 16 }: { name: string; size?: number }) {
  return <>{(Icons[name] || Icons.check)(size)}</>;
}
