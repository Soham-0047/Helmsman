/* ============================================================
   Helmsman — app root: theme provider + hash router
   ============================================================ */

const { useState, useEffect, useCallback } = React;

function useHashRoute() {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#/, "") || "/");
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.replace(/^#/, "") || "/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const nav = useCallback((path) => {
    window.location.hash = path;
    document.querySelector("#root")?.scrollTo?.(0, 0);
  }, []);
  return [route, nav];
}

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("helm-theme") || "dark");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("helm-theme", theme);
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

function Router() {
  const [route, nav] = useHashRoute();
  const seg = route.split("/").filter(Boolean); // e.g. ["case","c482"]

  let view;
  if (route === "/" || route === "") view = <Landing onNav={nav} />;
  else if (seg[0] === "dashboard") view = <Dashboard onNav={nav} gatewayError={route.includes("demo")} />;
  else if (seg[0] === "connect") view = <Connect onNav={nav} />;
  else if (seg[0] === "case") view = <CaseRoute onNav={nav} caseId={seg[1] || "c482"} />;
  else if (seg[0] === "pipeline") view = <Pipeline onNav={nav} caseId={seg[1] || "c482"} />;
  else view = <Landing onNav={nav} />;

  return <div style={{ height: "100%" }}>{view}</div>;
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Router />
      </ToastProvider>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
