"use client";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const t = (localStorage.getItem("helmsman-theme") as "dark" | "light") || "dark";
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  function toggle(e: React.MouseEvent) {
    const next = theme === "dark" ? "light" : "dark";
    // expanding-circle reveal from the click point
    const reveal = document.createElement("div");
    reveal.className = "theme-reveal";
    reveal.style.setProperty("--x", `${e.clientX}px`);
    reveal.style.setProperty("--y", `${e.clientY}px`);
    document.body.appendChild(reveal);
    requestAnimationFrame(() => {
      document.documentElement.setAttribute("data-theme", next);
      reveal.style.background = "var(--bg)";
    });
    setTimeout(() => reveal.remove(), 520);
    localStorage.setItem("helmsman-theme", next);
    setTheme(next);
  }

  return (
    <button className="btn btn-ghost" onClick={toggle} aria-label="Toggle theme" title="Toggle theme">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        {theme === "dark" ? (
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
          </>
        )}
      </svg>
    </button>
  );
}
