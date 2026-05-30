import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <span className="logo">
      <svg className="mark" width={size} height={size} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="14" stroke="var(--accent)" strokeWidth="2" />
        <circle cx="16" cy="16" r="3" fill="var(--accent)" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line
            key={a}
            x1="16"
            y1="16"
            x2={16 + 13 * Math.cos((a * Math.PI) / 180)}
            y2={16 + 13 * Math.sin((a * Math.PI) / 180)}
            stroke="var(--accent)"
            strokeWidth={a % 90 === 0 ? 2 : 1}
            opacity={a % 90 === 0 ? 1 : 0.4}
          />
        ))}
      </svg>
      Helmsman
    </span>
  );
}

export function Nav() {
  return (
    <nav className="nav">
      <Link href="/">
        <Logo />
      </Link>
      <div className="row" style={{ gap: 14 }}>
        <Link href="/dashboard" className="muted" style={{ fontSize: 14, fontWeight: 600 }}>
          Dashboard
        </Link>
        <Link href="/connect" className="btn btn-primary" style={{ padding: "8px 16px" }}>
          Connect a repo
        </Link>
        <ThemeToggle />
      </div>
    </nav>
  );
}
