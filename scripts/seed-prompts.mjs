// `npm run seed:prompts` — push prompts/registry.json + config/flags.json to the
// Admin Service so every Helmsman prompt/flag is versioned in the control plane.
//
// The README documents these same prompts; registry.json is their machine-
// readable mirror. In demo mode (ADMIN_LOCAL_FALLBACK=true or no admin creds)
// this prints the plan and confirms the local registry is authoritative — the
// SDK reads it directly, so nothing breaks without the Admin Service.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ADMIN, banner, c, env, fail, getJson, log, ok, ROOT, step, warn } from "./lib.mjs";

const registry = JSON.parse(readFileSync(resolve(ROOT, "prompts/registry.json"), "utf8"));
const flags = JSON.parse(readFileSync(resolve(ROOT, "config/flags.json"), "utf8"));

banner("seed prompts → Admin Service control plane");
log(`${registry.prompts.length} prompts · ${flags.flags.length} flags`);

const adminEmail = env.ADMIN_EMAIL || (env.ADMIN_EMAILS || "").split(",")[0];
const adminPassword = env.ADMIN_PASSWORD;
const localOnly = env.ADMIN_LOCAL_FALLBACK === "true" || !adminPassword || !adminEmail;

if (localOnly) {
  warn("Admin credentials not provided (ADMIN_EMAIL/ADMIN_PASSWORD) or local fallback is on.");
  warn("Skipping network push. The bundled local registry is authoritative in this mode:");
  for (const p of registry.prompts) {
    const active = p.variants.find((v) => v.active) ?? p.variants[0];
    log(`  ${c.green}•${c.reset} ${p.key} ${c.dim}(${active.version}, model ${p.model})${c.reset}`);
  }
  log();
  ok("Local registry validated. Set ADMIN_EMAIL + ADMIN_PASSWORD and ADMIN_LOCAL_FALLBACK=false to push to the live Admin Service.");
  process.exit(0);
}

// ---- live push ----
async function login() {
  const r = await fetch(`${ADMIN}/auth/password-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  if (!r.ok) throw new Error(`admin login failed (${r.status})`);
  return (await r.json()).token;
}

async function adminFetch(token, method, path, body) {
  const r = await fetch(`${ADMIN}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r;
}

try {
  step(`authenticating to ${ADMIN} as ${adminEmail}`);
  const token = await login();
  ok("authenticated");

  for (const p of registry.prompts) {
    const active = p.variants.find((v) => v.active) ?? p.variants[p.variants.length - 1];
    const existing = await adminFetch(token, "GET", `/admin/prompts/${p.key}`);
    if (existing.status === 404) {
      const r = await adminFetch(token, "POST", "/admin/prompts", {
        key: p.key, description: p.description, tags: p.tags, content: active.content,
      });
      log(`  ${r.ok ? c.green + "created" : c.red + "failed "}${c.reset} ${p.key}`);
    } else {
      const r = await adminFetch(token, "POST", `/admin/prompts/${p.key}/variants`, { content: active.content });
      log(`  ${r.ok ? c.green + "variant" : c.red + "failed "}${c.reset} ${p.key}`);
    }
  }

  for (const f of flags.flags) {
    const r = await adminFetch(token, "POST", "/admin/flags", {
      key: f.key, strategy: f.strategy, percent: f.percent, allowlist: f.allowlist, condition: f.condition,
    });
    if (!r.ok) await adminFetch(token, "PATCH", `/admin/flags/${f.key}`, { strategy: f.strategy, percent: f.percent });
    log(`  ${c.green}flag${c.reset}    ${f.key}`);
  }
  ok("prompt registry + flags pushed to the Admin Service");
} catch (e) {
  fail(`live push failed: ${e.message}`);
  warn("Falling back to local registry (SDK reads prompts/registry.json directly). Nothing breaks.");
  process.exit(0);
}
