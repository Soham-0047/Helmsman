import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// repo root is apps/gateway/src -> ../../..
export const ROOT = resolve(__dirname, "../../..");
loadEnv({ path: resolve(ROOT, ".env") });

const bool = (v: string | undefined, d: boolean) =>
  v === undefined ? d : ["1", "true", "yes", "on"].includes(v.toLowerCase());

export const config = {
  root: ROOT,
  mode: process.env.HELMSMAN_MODE ?? "demo",
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.GATEWAY_PORT ?? 8080),
  webUrl: process.env.WEB_URL ?? "http://localhost:3000",
  gatewayUrl: process.env.GATEWAY_URL ?? "http://localhost:8080",
  agentsUrl: process.env.AGENTS_URL ?? "http://localhost:8000",

  databaseUrl: process.env.DATABASE_URL ?? "",

  adminUrl: process.env.ADMIN_URL ?? "http://localhost:4001",
  adminToken: process.env.ADMIN_SERVICE_TOKEN ?? "demo-service-token",
  adminLocalFallback: bool(process.env.ADMIN_LOCAL_FALLBACK, true),
  adminTtlMs: Number(process.env.ADMIN_SDK_TTL_MS ?? 60000),

  github: {
    clientId: process.env.GITHUB_CLIENT_ID ?? "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    scopes: process.env.GITHUB_OAUTH_SCOPES ?? "repo,read:user",
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "demo-webhook-secret",
    demoToken: process.env.GITHUB_DEMO_TOKEN ?? "",
    apiBase: "https://api.github.com",
  },

  tokenEncryptionKey:
    process.env.TOKEN_ENCRYPTION_KEY ??
    "0000000000000000000000000000000000000000000000000000000000000000",

  uipath: {
    orchUrl: process.env.UIPATH_ORCH_URL ?? "",
    tenant: process.env.UIPATH_TENANT ?? "",
    clientId: process.env.UIPATH_CLIENT_ID ?? "",
    clientSecret: process.env.UIPATH_CLIENT_SECRET ?? "",
    processKey: process.env.UIPATH_MAESTRO_PROCESS_KEY ?? "helmsman-issue-case",
    useSimulator: bool(process.env.UIPATH_LOCAL_SIMULATOR, true),
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.RESEND_FROM ?? "Helmsman <onboarding@resend.dev>",
  },

  rpaDryRunDefault: true,
  internalToken: process.env.INTERNAL_SERVICE_TOKEN ?? "helmsman-internal-token",
  registryPath: resolve(ROOT, "prompts/registry.json"),
  flagsPath: resolve(ROOT, "config/flags.json"),
};

export type Config = typeof config;
