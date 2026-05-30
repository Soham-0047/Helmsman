"use client";
import { useEffect, useState } from "react";

// Hand-coded 180° arc gauge (120×120 viewBox), gradient green→yellow→red,
// stroke-dashoffset fill animation over 600ms.
const R = 48;
const CX = 60;
const CY = 64;
const ARC = Math.PI * R; // length of the semicircle

export function PriorityGauge({ score }: { score: number | null }) {
  const s = score ?? 0;
  const [offset, setOffset] = useState(ARC);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOffset(ARC * (1 - s / 10)));
    return () => cancelAnimationFrame(id);
  }, [s]);

  const color = s >= 8 ? "var(--red)" : s >= 5 ? "var(--yellow)" : "var(--green)";

  return (
    <svg width="120" height="78" viewBox="0 0 120 78" aria-label={`priority ${s} of 10`}>
      <defs>
        <linearGradient id="gauge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--green)" />
          <stop offset="50%" stopColor="var(--yellow)" />
          <stop offset="100%" stopColor="var(--red)" />
        </linearGradient>
      </defs>
      <path
        d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
        fill="none"
        stroke="var(--border)"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        className="gauge-arc"
        d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
        fill="none"
        stroke="url(#gauge)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={ARC}
        strokeDashoffset={offset}
      />
      <text x={CX} y={CY - 8} textAnchor="middle" fontSize="26" fontWeight="800" fill={color} className="mono">
        {s || "—"}
      </text>
      <text x={CX} y={CY + 8} textAnchor="middle" fontSize="9" fill="var(--text-secondary)" letterSpacing="0.1em">
        / 10
      </text>
    </svg>
  );
}
