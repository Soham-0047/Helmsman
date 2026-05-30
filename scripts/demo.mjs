// `npm run demo` — fire the full seven-agent pipeline against a fixture issue,
// stream the play-by-play, then walk the human approval gate + RPA execution.
// Zero external setup: spawns the gateway + agent runtime if they aren't already
// running, and runs fully offline on local fallbacks.
import {
  AGENTS, GATEWAY, banner, c, getJson, isUp, log, ok, postJson,
  sleep, spawnGateway, spawnRuntime, step, waitFor, warn,
} from "./lib.mjs";

const fixtureId = process.argv[2] || process.env.DEMO_FIXTURE_ID || "fix-001";
const spawned = [];

const NODE_LABELS = {
  classifier: "1 Classifier", retriever: "2 Context Retriever", reproducer: "3 Reproducer",
  source_analyzer: "4 Source Analyzer", prioritizer: "7 Prioritizer",
  voice_profiler: "5 Voice Profiler", responder: "6 Responder",
};

async function ensureServices() {
  if (!(await isUp(AGENTS))) {
    step("starting agent runtime (FastAPI)…");
    spawned.push(spawnRuntime());
    await waitFor(AGENTS, "agent runtime");
  }
  if (!(await isUp(GATEWAY))) {
    step("starting gateway (Express)…");
    spawned.push(spawnGateway());
    await waitFor(GATEWAY, "gateway");
  }
  ok("services up");
}

function printEvent(ev) {
  if (ev.type === "stage") {
    log(`\n${c.accent}${c.bold}━ stage: ${ev.stage}${c.reset}${ev.message ? c.dim + "  " + ev.message + c.reset : ""}`);
  } else if (ev.type === "agent_start") {
    process.stdout.write(`  ${c.dim}▸ ${NODE_LABELS[ev.agent] || ev.agent} …${c.reset}`);
  } else if (ev.type === "agent_complete") {
    const meta = ev.status === "loaded" ? "loaded from profile" : `${ev.model} via ${ev.provider} · ${ev.latency_ms}ms`;
    const summary = summarize(ev.agent, ev.output);
    log(`\r  ${c.green}✓${c.reset} ${NODE_LABELS[ev.agent] || ev.agent} ${c.dim}(${meta})${c.reset}${summary ? "\n      " + summary : ""}`);
  } else if (ev.type === "agent_skipped") {
    log(`  ${c.gray}∅ ${NODE_LABELS[ev.agent] || ev.agent} — ${ev.message}${c.reset}`);
  } else if (ev.type === "agent_error") {
    warn(`agent error: ${ev.error}`);
  }
}

function summarize(agent, o = {}) {
  switch (agent) {
    case "classifier": return `${c.bold}${o.category}${c.reset} (conf ${o.confidence}) — ${o.rationale}`;
    case "retriever": return o.likely_duplicate_of ? `likely duplicate of #${o.likely_duplicate_of}` : `top cosine ${o.top_cosine}`;
    case "reproducer": return `reproducible=${o.has_reproduction}, env=${o.environment?.runtime}`;
    case "source_analyzer": return `likely files: ${(o.likely_files || []).join(", ")}`;
    case "prioritizer": return `priority ${o.score}/10 → ${o.recommended_action}`;
    case "voice_profiler": return `tone=${o.tone}, depth=${o.technical_depth}/5`;
    case "responder": return `action=${o.recommended_action}, voice match=${o.voice_match_score ?? "—"}`;
    default: return "";
  }
}

async function streamPipeline(caseId) {
  const res = await fetch(`${GATEWAY}/api/cases/${caseId}/stream`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const dl = block.split("\n").find((l) => l.startsWith("data:"));
      if (!dl) continue;
      let ev;
      try { ev = JSON.parse(dl.slice(5).trim()); } catch { continue; }
      printEvent(ev);
      if (ev.type === "pipeline_complete") { await reader.cancel(); return; }
    }
  }
}

async function main() {
  banner("Helmsman demo · seven-agent issue triage");
  await ensureServices();

  const admin = await getJson(`${GATEWAY}/api/admin/info`).catch(() => null);
  if (admin) {
    log(`${c.dim}control plane: prompts via Admin Service (${admin.local_fallback ? "local fallback" : "live"}), `
      + `routing ${admin.provider_chain?.map((p) => p.providerId).join(" → ") || "local"}, maestro ${admin.maestro}${c.reset}`);
  }

  step(`opening a Maestro Case for fixture ${c.bold}${fixtureId}${c.reset}`);
  const run = await postJson(`${GATEWAY}/demo/run?wait=0`, { fixtureId });
  const caseId = run.case.id;
  log(`${c.dim}case ${caseId} · issue #${run.case.github_issue_number}: ${run.case.issue?.title || ""}${c.reset}`);

  await streamPipeline(caseId);

  const { case: done } = await getJson(`${GATEWAY}/api/cases/${caseId}`);
  banner("assembled draft (pending your approval)");
  log(`${c.dim}classification ${done.classification} · priority ${done.priority_score}/10 · action ${done.recommended_action}${c.reset}\n`);
  log(done.draft_response.split("\n").map((l) => "  " + l).join("\n"));

  banner("human-in-the-loop gate");
  log(`${c.dim}Nothing has been posted to GitHub. Simulating maintainer approval…${c.reset}`);
  await sleep(600);
  const ap = await postJson(`${GATEWAY}/api/cases/${caseId}/approve`, {});
  const req = ap.rpa.requests[0];
  ok(`approved → UiPath RPA ${ap.rpa.dryRun ? "DRY-RUN" : "executed"}: ${req.method} ${req.path}`);
  log(`${c.dim}case stage is now ${ap.case.current_stage}.${c.reset}`);

  const { audit } = await getJson(`${GATEWAY}/api/cases/${caseId}/audit`);
  banner("audit trail");
  for (const e of audit) log(`  ${c.dim}${e.actor_type.padEnd(7)}${c.reset} ${e.actor_name.padEnd(15)} ${e.action}`);

  banner("done");
  ok(`Full pipeline ran in under a second on local fallbacks. Open ${c.bold}http://localhost:3000/dashboard${c.reset} for the live UI (run \`npm run dev\`).`);
}

main()
  .catch((e) => { console.error(`\n${c.red}demo failed:${c.reset} ${e.message}`); process.exitCode = 1; })
  .finally(async () => {
    if (spawned.length) {
      await sleep(200);
      for (const ch of spawned) { try { ch.kill("SIGTERM"); } catch {} }
    }
  });
