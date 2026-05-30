/* ============================================================
   Helmsman — icons (monochrome, glyph-style, stroke 1.6)
   ============================================================ */
const Svg = (p) => React.createElement("svg", {
  width: p.size || 18, height: p.size || 18, viewBox: "0 0 24 24",
  fill: "none", stroke: "currentColor", strokeWidth: p.sw || 1.6,
  strokeLinecap: "round", strokeLinejoin: "round",
  "aria-hidden": "true", ...p.rest,
}, p.children);

// --- brand mark: anchor ---
function Anchor({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
const AGENT_ICONS = {
  tag: (s) => <Svg size={s}><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H11l9 9-6.5 6.5L4.5 11V6.5z" /><circle cx="7.5" cy="9" r="1.1" fill="currentColor" stroke="none" /></Svg>,
  layers: (s) => <Svg size={s}><path d="M12 3 3 8l9 5 9-5-9-5z" /><path d="M3 13l9 5 9-5" /></Svg>,
  flask: (s) => <Svg size={s}><path d="M9 3h6" /><path d="M10 3v6L5 19a1.5 1.5 0 0 0 1.4 2h11.2A1.5 1.5 0 0 0 19 19l-5-10V3" /><path d="M7.5 14h9" /></Svg>,
  code: (s) => <Svg size={s}><polyline points="8 7 3 12 8 17" /><polyline points="16 7 21 12 16 17" /><line x1="13" y1="5" x2="11" y2="19" /></Svg>,
  bars: (s) => <Svg size={s}><line x1="6" y1="20" x2="6" y2="13" /><line x1="12" y1="20" x2="12" y2="5" /><line x1="18" y1="20" x2="18" y2="10" /></Svg>,
  wave: (s) => <Svg size={s}><line x1="4" y1="12" x2="4" y2="12" /><line x1="8" y1="9" x2="8" y2="15" /><line x1="12" y1="5" x2="12" y2="19" /><line x1="16" y1="8" x2="16" y2="16" /><line x1="20" y1="11" x2="20" y2="13" /></Svg>,
  message: (s) => <Svg size={s}><path d="M4 5h16v11H8l-4 4V5z" /><line x1="8" y1="10" x2="16" y2="10" /></Svg>,
};
function AgentIcon({ name, size = 16 }) { return (AGENT_ICONS[name] || AGENT_ICONS.tag)(size); }

// --- UI icons ---
const Icons = {
  close: (s) => <Svg size={s}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></Svg>,
  check: (s) => <Svg size={s} sw={2}><polyline points="4 12 9 17 20 6" /></Svg>,
  chevronRight: (s) => <Svg size={s}><polyline points="9 6 15 12 9 18" /></Svg>,
  chevronLeft: (s) => <Svg size={s}><polyline points="15 6 9 12 15 18" /></Svg>,
  arrowRight: (s) => <Svg size={s}><line x1="4" y1="12" x2="20" y2="12" /><polyline points="14 6 20 12 14 18" /></Svg>,
  plus: (s) => <Svg size={s}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Svg>,
  play: (s) => <Svg size={s}><path d="M7 5l12 7-12 7V5z" fill="currentColor" stroke="none" /></Svg>,
  sun: (s) => <Svg size={s}><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="4.5" /><line x1="12" y1="19.5" x2="12" y2="22" /><line x1="2" y1="12" x2="4.5" y2="12" /><line x1="19.5" y1="12" x2="22" y2="12" /><line x1="4.9" y1="4.9" x2="6.6" y2="6.6" /><line x1="17.4" y1="17.4" x2="19.1" y2="19.1" /><line x1="4.9" y1="19.1" x2="6.6" y2="17.4" /><line x1="17.4" y1="6.6" x2="19.1" y2="4.9" /></Svg>,
  moon: (s) => <Svg size={s}><path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z" /></Svg>,
  github: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.4 9.4 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2z" /></svg>,
  docs: (s) => <Svg size={s}><path d="M6 3h9l4 4v14H6V3z" /><polyline points="14 3 14 8 19 8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="16" x2="15" y2="16" /></Svg>,
  externalLink: (s) => <Svg size={s}><path d="M14 4h6v6" /><line x1="20" y1="4" x2="11" y2="13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Svg>,
  grip: (s) => <Svg size={s} sw={1.4}><circle cx="9" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="17" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="1" fill="currentColor" stroke="none"/></Svg>,
  heart: (s) => <Svg size={s}><path d="M12 20s-7-4.5-7-9.5A3.5 3.5 0 0 1 12 7a3.5 3.5 0 0 1 7 3.5C19 15.5 12 20 12 20z" /></Svg>,
};
function UIcon({ name, size = 16 }) { return (Icons[name] || Icons.check)(size); }

Object.assign(window, { Anchor, AgentIcon, UIcon, AGENT_ICONS, Icons });
