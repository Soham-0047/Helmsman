"use client";
import Link from "next/link";
import { useRef } from "react";

export function MagneticButton({
  href,
  children,
  className = "btn btn-primary",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  function move(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = ((e.clientX - (r.left + r.width / 2)) / r.width) * 16;
    const dy = ((e.clientY - (r.top + r.height / 2)) / r.height) * 16;
    el.style.transform = `translate(${Math.max(-8, Math.min(8, dx))}px, ${Math.max(-8, Math.min(8, dy))}px)`;
  }
  function reset() {
    if (ref.current) ref.current.style.transform = "translate(0,0)";
  }
  return (
    <Link
      ref={ref}
      href={href}
      className={className}
      onMouseMove={move}
      onMouseLeave={reset}
      style={{ transition: "transform 0.2s cubic-bezier(0.2,0.7,0.2,1)", fontSize: 16, padding: "14px 26px" }}
    >
      {children}
    </Link>
  );
}
