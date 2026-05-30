// The Admin Service SDK, dropped into the gateway. Configured to fall back to
// the bundled local registry (prompts/registry.json + config/flags.json) when
// the Admin Service is unreachable — so the gateway works fully offline.
import { readFileSync } from "node:fs";
import { createAdminClient, type LocalRegistry } from "../../../sdk/admin-client.ts";
import { config } from "./config.ts";

function loadLocalRegistry(): LocalRegistry {
  const reg: LocalRegistry = {};
  try {
    const raw = JSON.parse(readFileSync(config.registryPath, "utf8"));
    reg.prompts = raw.prompts ?? [];
  } catch {
    reg.prompts = [];
  }
  try {
    const flags = JSON.parse(readFileSync(config.flagsPath, "utf8"));
    reg.flags = (flags.flags ?? []).map((f: any) => ({
      key: f.key,
      strategy: f.strategy,
      percent: f.percent,
      allowlist: f.allowlist,
      condition: f.condition,
    }));
  } catch {
    /* SDK supplies DEFAULT_FLAGS */
  }
  return reg;
}

export const admin = createAdminClient({
  baseURL: config.adminUrl,
  serviceToken: config.adminToken,
  ttlMs: config.adminTtlMs,
  localFallback: config.adminLocalFallback,
  localRegistry: loadLocalRegistry(),
  logger: (level, msg) => {
    if (level !== "debug") console.log(`[admin:${level}] ${msg}`);
  },
});
