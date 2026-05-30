// Validates environment configuration with NAMED errors (no silent failures).
// In demo mode everything has a working fallback, so this only warns. In live
// mode, the vars a feature needs are required and a missing one fails the check.
import { banner, c, env, fail, log, ok, warn } from "./lib.mjs";

const mode = env.HELMSMAN_MODE || "demo";

// var -> { service, where, requiredInLive, breaks }
const SPEC = {
  DATABASE_URL: { service: "Supabase", where: "supabase.com → Project → Settings → Database", requiredInLive: true, breaks: "pgvector storage; runtime falls back to in-memory" },
  ADMIN_SERVICE_TOKEN: { service: "Admin Service", where: "Admin Service backend/.env SERVICE_TOKEN", requiredInLive: true, breaks: "auth to the control plane; SDK uses local registry fallback" },
  QWEN_API_KEY: { service: "Alibaba Model Studio", where: "modelstudio.console.alibabacloud.com → API-KEY", requiredInLive: false, breaks: "real Qwen calls; agents use deterministic local fallbacks" },
  OPENROUTER_API_KEY: { service: "OpenRouter", where: "openrouter.ai/keys", requiredInLive: false, breaks: "fallback LLM tier 1" },
  GROQ_API_KEY: { service: "Groq", where: "console.groq.com/keys", requiredInLive: false, breaks: "fallback LLM tier 2" },
  GITHUB_CLIENT_ID: { service: "GitHub OAuth", where: "github.com/settings/developers", requiredInLive: true, breaks: "repo connect via OAuth; demo repo path still works" },
  GITHUB_CLIENT_SECRET: { service: "GitHub OAuth", where: "github.com/settings/developers", requiredInLive: true, breaks: "OAuth token exchange" },
  GITHUB_WEBHOOK_SECRET: { service: "GitHub", where: "repo webhook settings", requiredInLive: true, breaks: "webhook HMAC verification" },
  TOKEN_ENCRYPTION_KEY: { service: "self", where: "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"", requiredInLive: true, breaks: "OAuth token encryption at rest" },
  UIPATH_ORCH_URL: { service: "UiPath Cloud", where: "cloud.uipath.com", requiredInLive: false, breaks: "real Maestro Cases; local simulator used otherwise" },
  RESEND_API_KEY: { service: "Resend", where: "resend.com/api-keys", requiredInLive: false, breaks: "approval emails; logged to console otherwise" },
};

banner(`environment check · mode=${mode}`);
let missingRequired = 0;
const pad = (s, n) => (s + " ".repeat(n)).slice(0, n);

log(`${c.dim}${pad("VARIABLE", 24)}${pad("STATUS", 12)}SERVICE${c.reset}`);
for (const [name, info] of Object.entries(SPEC)) {
  const val = env[name];
  const present = val && val.length > 0 && !/^(demo-|change-me|0{16,})/.test(val);
  const requiredNow = mode === "live" && info.requiredInLive;
  let status;
  if (present) status = `${c.green}set${c.reset}        `;
  else if (requiredNow) { status = `${c.red}MISSING${c.reset}    `; missingRequired++; }
  else status = `${c.yellow}fallback${c.reset}   `;
  log(`${pad(name, 24)}${status}${c.dim}${info.service}${c.reset}`);
  if (!present && requiredNow) {
    log(`  ${c.red}↳ required in live mode${c.reset} — get it at ${info.where}`);
    log(`  ${c.dim}  without it: ${info.breaks}${c.reset}`);
  }
}

log();
if (missingRequired > 0) {
  fail(`${missingRequired} required variable(s) missing for live mode. Fill them in .env or set HELMSMAN_MODE=demo.`);
  process.exit(1);
}
if (mode === "demo") ok("demo mode — all external services have working local fallbacks. You're ready to `npm run demo`.");
else ok("live mode — all required variables present.");
