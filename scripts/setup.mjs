// `npm run setup` — one command to get from clone to runnable.
//   1. install Node deps (web + gateway workspaces)   2. create Python venv + deps
//   3. validate env (named errors)                    4. apply DB schema (live only)
//   5. seed fixtures + push prompt registry           6. print next steps
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { banner, c, env, fail, log, ok, ROOT, step } from "./lib.mjs";

function run(cmd, args, label) {
  step(label);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) {
    fail(`${label} failed (exit ${r.status}).`);
    process.exit(r.status ?? 1);
  }
}

banner("Helmsman setup");

// 1) Node deps
if (!existsSync(resolve(ROOT, "node_modules"))) {
  run("npm", ["install"], "installing Node dependencies (web + gateway)");
} else {
  ok("Node dependencies present");
}

// 2) Python runtime
run("node", ["scripts/install-agents.mjs"], "installing the Python agent runtime");

// 3) Env validation (non-fatal in demo)
step("validating environment");
const envCheck = spawnSync("node", ["scripts/check-env.mjs"], { cwd: ROOT, stdio: "inherit", env });
if (envCheck.status !== 0 && (env.HELMSMAN_MODE || "demo") === "live") process.exit(1);

// 4) DB schema (only meaningful with DATABASE_URL)
run("node", ["scripts/apply-schema.mjs"], "applying database schema");

// 5) Seed
run("node", ["scripts/seed-fixtures.mjs"], "seeding fixture corpus");
run("node", ["scripts/seed-prompts.mjs"], "registering prompts + flags");

banner("setup complete");
log(`${c.green}✓${c.reset} Helmsman is ready.\n`);
log(`  ${c.bold}npm run demo${c.reset}   ${c.dim}— fire the 7-agent pipeline on a fixture issue (no setup needed)${c.reset}`);
log(`  ${c.bold}npm run dev${c.reset}    ${c.dim}— start web (3000) + gateway (8080) + agents (8000)${c.reset}`);
log(`  ${c.bold}npm run benchmark${c.reset} ${c.dim}— Agent Society A/B (pipeline vs single-agent baseline)${c.reset}\n`);
