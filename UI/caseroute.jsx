/* ============================================================
   Helmsman — /case/[id] full page (wraps CaseReview)
   ============================================================ */
function CaseRoute({ onNav, caseId }) {
  const c = HELM.CASES.find((x) => x.id === caseId) || HELM.CASES[0];
  return (
    <div className="col" style={{ height: "100%", overflowY: "auto" }}>
      <TopNav onNav={onNav}
        left={<button className="btn btn-ghost" onClick={() => onNav("/dashboard")} style={{ marginLeft: 4 }}><UIcon name="chevronLeft" size={15} /> Dashboard</button>}
        right={<ThemeToggle />} />
      <div style={{ flex: 1, padding: "32px 24px 80px" }}>
        <div className="card rise" style={{ maxWidth: 900, margin: "0 auto", overflow: "visible" }}>
          <CaseReview caseData={c} onPipeline={() => onNav("/pipeline/" + c.id)} />
        </div>
      </div>
    </div>
  );
}
Object.assign(window, { CaseRoute });
