"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { AgentEvent, NodeKey, NodeState, Stage } from "./types";

const EVENT_TYPES = [
  "stage",
  "agent_start",
  "agent_complete",
  "agent_skipped",
  "agent_error",
  "pipeline_complete",
];

export interface StreamState {
  events: AgentEvent[];
  nodeStates: Partial<Record<NodeKey, NodeState>>;
  latencies: Partial<Record<NodeKey, number>>;
  stage: Stage | null;
  complete: boolean;
}

export function useCaseStream(caseId: string | null, onComplete?: () => void): StreamState {
  const [state, setState] = useState<StreamState>({
    events: [],
    nodeStates: {},
    latencies: {},
    stage: null,
    complete: false,
  });
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    if (!caseId) return;
    setState({ events: [], nodeStates: {}, latencies: {}, stage: null, complete: false });
    const es = new EventSource(api.streamUrl(caseId));

    const handle = (ev: AgentEvent) => {
      setState((prev) => {
        const nodeStates = { ...prev.nodeStates };
        const latencies = { ...prev.latencies };
        let stage = prev.stage;
        let complete = prev.complete;
        if (ev.type === "agent_start" && ev.agent) nodeStates[ev.agent] = "active";
        else if (ev.type === "agent_complete" && ev.agent) {
          nodeStates[ev.agent] = ev.status === "loaded" ? "loaded" : "complete";
          if (ev.latency_ms != null) latencies[ev.agent] = ev.latency_ms;
        } else if (ev.type === "agent_skipped" && ev.agent) nodeStates[ev.agent] = "skipped";
        else if (ev.type === "agent_error" && ev.agent) nodeStates[ev.agent] = "error";
        else if (ev.type === "stage" && ev.stage) stage = ev.stage;
        else if (ev.type === "pipeline_complete") {
          complete = true;
          setTimeout(() => completeRef.current?.(), 50);
        }
        return { events: [...prev.events, ev], nodeStates, latencies, stage, complete };
      });
    };

    for (const t of EVENT_TYPES) {
      es.addEventListener(t, (e) => {
        try {
          handle(JSON.parse((e as MessageEvent).data));
        } catch {
          /* ignore */
        }
      });
    }
    es.onerror = () => {
      // gateway closes the stream when idle; EventSource auto-reconnects.
    };
    return () => es.close();
  }, [caseId]);

  return state;
}
