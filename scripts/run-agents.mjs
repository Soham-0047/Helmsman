// `npm run dev:agents` — run the FastAPI runtime with hot reload, logs inline.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { env, fail, ROOT, venvPython } from "./lib.mjs";

const py = venvPython();
if (!py) {
  fail("agent venv missing. Run `npm run agents:install` (or `npm run setup`) first.");
  process.exit(1);
}
const child = spawn(
  py,
  ["-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", env.AGENTS_PORT || "8000", "--reload"],
  { cwd: resolve(ROOT, "apps/agents"), stdio: "inherit", env }
);
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
