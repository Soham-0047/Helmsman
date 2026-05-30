/* ============================================================
   Helmsman — AppShell (sidebar + content)
   ============================================================ */

function ControlPlane() {
  return (
    <div className="card" style={{ padding: 13, background: "var(--bg)", borderRadius: 10 }}>
      <div className="t-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 10 }}>Control plane</div>
      <div className="col gap-10">
        <div className="row between">
          <span className="t-sm text-secondary">Routing</span>
          <Tag tone="green"><StatusDot tone="green" /> live</Tag>
        </div>
        <div className="row between">
          <span className="t-sm text-secondary">Maestro</span>
          <Tag tone="accent"><StatusDot tone="accent" /> connected</Tag>
        </div>
        <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />
        <div>
          <div className="t-xs text-secondary" style={{ marginBottom: 7 }}>Prompts <span className="text-muted">(7)</span></div>
          <div className="row wrap gap-4">
            {HELM.PROMPTS.map((p) => <span key={p} className="tag" style={{ fontSize: 10, padding: "1px 5px" }}>{p}</span>)}
          </div>
        </div>
        <div>
          <div className="t-xs text-secondary" style={{ marginBottom: 7 }}>Flags</div>
          <div className="row wrap gap-4">
            <span className="tag" style={{ fontSize: 10, padding: "1px 5px" }}>shadow_mode: <span style={{ color: "var(--text-muted)" }}>off</span></span>
            <span className="tag" style={{ fontSize: 10, padding: "1px 5px" }}>auto_label: <span style={{ color: "var(--green)" }}>on</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavItem({ active, glyph, label, badge, onClick }) {
  return (
    <button onClick={onClick} className="row gap-10"
      style={{
        width: "100%", padding: "7px 10px", borderRadius: 8, textAlign: "left",
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-secondary)",
        fontSize: 13.5, fontWeight: active ? 600 : 500,
        transition: "background 0.12s var(--ease), color 0.12s var(--ease)",
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = "var(--elevated)"; e.currentTarget.style.color = "var(--text)"; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; } }}>
      <span style={{ display: "inline-flex", width: 18 }}>{glyph}</span>
      <span className="grow">{label}</span>
      {badge}
    </button>
  );
}

function AppShell({ active = "cases", onNav, children }) {
  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* sidebar */}
      <aside style={{
        width: "var(--sb-w)", flex: "none", background: "var(--surface)",
        borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column",
        padding: "16px 12px",
      }}>
        <div style={{ padding: "2px 6px 16px" }}>
          <Logo onClick={() => onNav("/")} />
        </div>

        <div className="t-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, padding: "0 10px 6px" }}>Pipeline</div>
        <div className="col gap-4" style={{ marginBottom: 16 }}>
          <NavItem active={active === "cases"} glyph={<Anchor size={16} />} label="Cases" onClick={() => onNav("/dashboard")} />
          <NavItem active={active === "connect"} glyph={<UIcon name="plus" size={16} />} label="Connect repo" onClick={() => onNav("/connect")} />
        </div>

        <div style={{ height: 1, background: "var(--border)", margin: "0 6px 16px" }} />

        <ControlPlane />

        <div className="grow" />
        <div className="row between" style={{ padding: "8px 6px 0" }}>
          <span className="t-xs text-muted mono">v1.0 · MIT</span>
          <ThemeToggle />
        </div>
      </aside>

      {/* content */}
      <div className="grow" style={{ display: "flex", minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

/* simple top nav for non-shell routes (landing/connect/case/pipeline) */
function TopNav({ onNav, left, right, blur }) {
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50, height: 56, flex: "none",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 22px", borderBottom: "1px solid var(--border)",
      background: blur ? "color-mix(in oklch, var(--bg), transparent 25%)" : "var(--bg)",
      backdropFilter: blur ? "saturate(180%) blur(12px)" : "none",
    }}>
      <div className="row gap-16">
        <Logo onClick={() => onNav("/")} />
        {left}
      </div>
      <div className="row gap-8">{right}</div>
    </header>
  );
}

Object.assign(window, { AppShell, TopNav, ControlPlane, NavItem });
