// Shared helpers for the npm orchestration scripts.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// minimal .env loader (no dep) — returns the merged env
export function loadEnv() {
  const env = { ...process.env };
  const f = resolve(ROOT, ".env");
  if (existsSync(f)) {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith("#")) {
        let v = m[2];
        // strip an inline comment (unquoted values only), then surrounding quotes
        if (!/^["']/.test(v)) v = v.replace(/\s+#.*$/, "");
        v = v.trim().replace(/^["']|["']$/g, "");
        if (env[m[1]] === undefined || env[m[1]] === "") env[m[1]] = v;
      }
    }
  }
  return env;
}

export const env = loadEnv();
export const GATEWAY = env.GATEWAY_URL || "http://localhost:8080";
export const AGENTS = env.AGENTS_URL || "http://localhost:8000";
export const ADMIN = env.ADMIN_URL || "http://localhost:4001";

// ---- pretty logging ----
const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  accent: "\x1b[38;5;141m", green: "\x1b[32m", yellow: "\x1b[33m",
  red: "\x1b[31m", blue: "\x1b[34m", gray: "\x1b[90m",
};
export const c = C;
export const log = (m = "") => console.log(m);
export const step = (m) => console.log(`${C.accent}▸${C.reset} ${m}`);
export const ok = (m) => console.log(`${C.green}✓${C.reset} ${m}`);
export const warn = (m) => console.log(`${C.yellow}!${C.reset} ${m}`);
export const fail = (m) => console.log(`${C.red}✗${C.reset} ${m}`);
export const banner = (m) =>
  console.log(`\n${C.accent}${C.bold}━━━ ${m} ━━━${C.reset}`);

export const venvPython = () => {
  const p = resolve(ROOT, "apps/agents/.venv/bin/python");
  return existsSync(p) ? p : null;
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function isUp(url) {
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function waitFor(url, label, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isUp(url)) return true;
    await sleep(500);
  }
  throw new Error(`${label} did not become healthy at ${url} within ${timeoutMs}ms`);
}

// spawn the agent runtime (uvicorn) — returns the child process
export function spawnRuntime() {
  const py = venvPython();
  if (!py) throw new Error("agent venv missing — run `npm run agents:install` (or `npm run setup`) first");
  const child = spawn(py, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", env.AGENTS_PORT || "8000", "--log-level", "warning"], {
    cwd: resolve(ROOT, "apps/agents"),
    stdio: "ignore",
    env,
  });
  return child;
}

// spawn the gateway (tsx) — returns the child process
export function spawnGateway() {
  const child = spawn(process.execPath, ["--import", "tsx", resolve(ROOT, "apps/gateway/src/index.ts")], {
    cwd: resolve(ROOT, "apps/gateway"),
    stdio: "ignore",
    env,
  });
  return child;
}

export async function postJson(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) throw new Error(`${url} -> ${r.status}: ${await r.text()}`);
  return r.json();
}

export async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}
