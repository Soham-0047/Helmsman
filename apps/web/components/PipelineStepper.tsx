"use client";
import { Fragment } from "react";
import { PIPELINE_NODES, type NodeKey } from "../lib/types";

export type NodeState = "idle" | "active" | "complete" | "error" | "skipped" | "loaded";

export function PipelineStepper({
  states,
  latencies = {},
  compact = false,
}: {
  states: Partial<Record<NodeKey, NodeState>>;
  latencies?: Partial<Record<NodeKey, number>>;
  compact?: boolean;
}) {
  return (
    <div className="pipeline-flow" style={{ justifyContent: compact ? "flex-start" : "center" }}>
      {PIPELINE_NODES.map((n, i) => {
        const state = states[n.key] ?? "idle";
        const prev = i > 0 ? PIPELINE_NODES[i - 1].key : null;
        const prevDone = prev ? states[prev] === "complete" || states[prev] === "loaded" : true;
        const flowing = state === "active" && prevDone;
        return (
          <Fragment key={n.key}>
            {i > 0 && (
              <div className={`connector ${prevDone ? "flowing" : ""}`}>
                {flowing && <span className="token" key={`${n.key}-${Date.now()}`} />}
              </div>
            )}
            <div className={`node ${state}`} title={`${n.label}: ${state}`}>
              <div className="node-dot" style={{ position: "relative" }}>
                {state === "complete" || state === "loaded" ? "✓" : n.icon}
              </div>
              <div className="node-label">{n.label}</div>
              {latencies[n.key] != null && state === "complete" && (
                <div className="node-label mono" style={{ fontSize: 10, opacity: 0.7 }}>
                  {latencies[n.key]}ms
                </div>
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
