import express from "express";
import cors from "cors";
import { config } from "./config.ts";
import { admin } from "./admin.ts";
import { getStore } from "./db/store.ts";
import { MAESTRO_MODE } from "./uipath/maestro.ts";
import { demoRouter } from "./routes/demo.ts";
import { casesRouter } from "./routes/cases.ts";
import { reposRouter } from "./routes/repos.ts";
import { authRouter } from "./routes/auth.ts";
import { webhooksRouter } from "./routes/webhooks.ts";

const app = express();

app.use(cors({ origin: [config.webUrl, "http://localhost:3000"], credentials: true }));
// Capture the raw body so the webhook route can verify the HMAC signature.
app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  })
);

app.get("/health", async (_req, res) => {
  let runtime: unknown = null;
  try {
    const r = await fetch(`${config.agentsUrl}/health`);
    runtime = await r.json();
  } catch {
    runtime = { ok: false, note: "agent runtime not reachable" };
  }
  const store = await getStore();
  res.json({
    ok: true,
    service: "helmsman-gateway",
    mode: config.mode,
    store: store.kind(),
    maestro: MAESTRO_MODE,
    admin_local_fallback: config.adminLocalFallback,
    runtime,
  });
});

// Platform-layer panel data for the dashboard: which prompts/providers/flags
// Helmsman is using from the Admin Service control plane.
app.get("/api/admin/info", async (_req, res) => {
  const flags = await admin.getFlags();
  const route = await admin.route("llm");
  res.json({
    admin_url: config.adminUrl,
    local_fallback: config.adminLocalFallback,
    maestro: MAESTRO_MODE,
    provider_chain: route.chain.map((p) => ({ id: p.id, providerId: p.providerId, priority: p.priority })),
    flags: flags.map((f) => ({ key: f.key, strategy: f.strategy })),
    prompt_keys: [
      "helmsman.classifier.v1",
      "helmsman.retriever.rerank.v1",
      "helmsman.reproducer.v1",
      "helmsman.source_analyzer.v1",
      "helmsman.voice_profiler.v1",
      "helmsman.responder.v2",
      "helmsman.prioritizer.v1",
    ],
  });
});

app.use("/demo", demoRouter);
app.use("/api/cases", casesRouter);
app.use("/api/repos", reposRouter);
app.use("/auth", authRouter);
app.use("/webhooks", webhooksRouter);

app.use((req, res) => res.status(404).json({ error: `no route ${req.method} ${req.path}` }));

async function start() {
  await getStore(); // init store (pg or memory)
  app.listen(config.port, () => {
    console.log(`\n  Helmsman gateway → http://localhost:${config.port}`);
    console.log(`  mode=${config.mode}  maestro=${MAESTRO_MODE}  admin_fallback=${config.adminLocalFallback}`);
    console.log(`  runtime=${config.agentsUrl}  web=${config.webUrl}\n`);
  });
}

start();
