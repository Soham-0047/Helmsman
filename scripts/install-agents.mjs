// Create the Python venv for the agent runtime and install requirements.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fail, ok, ROOT, step } from "./lib.mjs";

const agentsDir = resolve(ROOT, "apps/agents");
const venv = resolve(agentsDir, ".venv");
const py = resolve(venv, "bin/python");

function findPython() {
  for (const cand of ["python3.11", "python3.12", "python3", "python"]) {
    const r = spawnSync(cand, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return cand;
  }
  return null;
}

if (!existsSync(py)) {
  const python = findPython();
  if (!python) {
    fail("Python 3.11+ not found on PATH. Install Python 3.11+ and retry.");
    process.exit(1);
  }
  step(`creating venv with ${python}`);
  const v = spawnSync(python, ["-m", "venv", venv], { stdio: "inherit" });
  if (v.status !== 0) {
    fail("venv creation failed");
    process.exit(1);
  }
}

step("installing agent runtime requirements (fastapi, httpx, pydantic, numpy, asyncpg)…");
const pip = spawnSync(py, ["-m", "pip", "install", "-q", "--upgrade", "pip"], { stdio: "inherit" });
const r = spawnSync(py, ["-m", "pip", "install", "-q", "-r", resolve(agentsDir, "requirements.txt")], { stdio: "inherit" });
if (r.status !== 0) {
  fail("pip install failed");
  process.exit(1);
}
ok("agent runtime ready");
