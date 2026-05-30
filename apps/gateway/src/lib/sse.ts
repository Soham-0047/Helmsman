import type { Response } from "express";
import type { AgentEvent } from "../types.ts";

/**
 * Tiny per-case SSE hub. The gateway publishes pipeline events here; the
 * dashboard subscribes via GET /api/cases/:id/stream. A short ring buffer per
 * case lets a late subscriber (e.g. the pipeline view opened mid-run) replay
 * what it missed.
 */
class SSEHub {
  private subscribers = new Map<string, Set<Response>>();
  private buffers = new Map<string, AgentEvent[]>();
  private readonly bufferLimit = 200;

  subscribe(caseId: string, res: Response): void {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    res.write(`: connected to case ${caseId}\n\n`);

    // replay buffered events so a late subscriber catches up
    for (const ev of this.buffers.get(caseId) ?? []) {
      res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
    }

    let set = this.subscribers.get(caseId);
    if (!set) {
      set = new Set();
      this.subscribers.set(caseId, set);
    }
    set.add(res);

    const ka = setInterval(() => res.write(`: keep-alive\n\n`), 15000);
    res.on("close", () => {
      clearInterval(ka);
      set?.delete(res);
    });
  }

  publish(caseId: string, ev: AgentEvent): void {
    const buf = this.buffers.get(caseId) ?? [];
    buf.push(ev);
    if (buf.length > this.bufferLimit) buf.shift();
    this.buffers.set(caseId, buf);

    const payload = `event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`;
    for (const res of this.subscribers.get(caseId) ?? []) {
      res.write(payload);
    }
  }

  clearBuffer(caseId: string): void {
    this.buffers.delete(caseId);
  }
}

export const sseHub = new SSEHub();
