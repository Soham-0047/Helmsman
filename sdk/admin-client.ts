/**
 * admin-client.ts — Helmsman's consumer SDK for the Admin Service control plane.
 *
 * Single file, zero runtime deps (Node 20+ global fetch). Drop it into any
 * consumer; the Express gateway imports it as `sdk/admin-client`. It mirrors
 * the Admin Service's public surface:
 *   - renderPrompt(key, vars)        -> versioned prompt, {{var}}/${var} filled
 *   - withFailover(kind, fn)         -> walk the provider fallback chain
 *   - withProviderFailover(id, fn)   -> walk one provider's keys only
 *   - isFlagEnabled(key, ctx)        -> local flag evaluation
 *   - report(id, outcome)            -> feed health back to the dashboard
 *
 * LOCAL FALLBACK (the bit the prompt asked for): when the Admin Service is
 * unreachable, the network errors, or `localFallback` is set, every read falls
 * back to a bundled local registry (prompts/registry.json shape + a local
 * provider chain derived from env + config/flags.json). This is what lets
 * `npm run demo` run with no Admin Service, no keys, no network.
 *
 * Caching: 60s TTL with stale-while-revalidate — a stale value is returned
 * immediately while a refresh runs in the background.
 */

// ----------------------------- Types ---------------------------------------

export type ProviderKind =
  | "llm"
  | "vision"
  | "audio"
  | "embedding"
  | "search"
  | "parsing"
  | string;

export interface ProviderInstance {
  id: string;
  providerId: string; // "qwen" | "openrouter" | "groq" | "ollama" | "mock" | ...
  kind: ProviderKind;
  baseURL: string;
  auth: "bearer" | "apiKey" | "none";
  authHeader?: string;
  priority: number;
  status?: "healthy" | "degraded" | "down" | "unknown";
  values: Record<string, string>; // { apiKey, model, ... } — decrypted by /public/*
}

export interface RouteResult {
  primary: ProviderInstance | null;
  chain: ProviderInstance[];
}

export interface PromptVariant {
  version: string;
  active: boolean;
  content: string;
}

export interface PromptRecord {
  key: string;
  description?: string;
  tags?: string[];
  model?: string;
  variables?: string[];
  variants: PromptVariant[];
}

export type FlagStrategy = "on" | "off" | "percent" | "allowlist" | "condition";

export interface FlagDef {
  key: string;
  strategy: FlagStrategy;
  enabled?: boolean;
  percent?: number;
  allowlist?: string[];
  condition?: Record<string, unknown>;
}

export interface FlagContext {
  userId?: string;
  email?: string;
  [k: string]: unknown;
}

export interface ReportOutcome {
  ok: boolean;
  latencyMs?: number;
  reason?: string;
}

export interface LocalRegistry {
  prompts?: PromptRecord[];
  providers?: ProviderInstance[];
  flags?: FlagDef[];
}

export interface AdminClientConfig {
  baseURL?: string;
  serviceToken?: string;
  ttlMs?: number;
  /** Force local-only — never touch the network. */
  localFallback?: boolean;
  /** Inlined local data (highest precedence for fallback). */
  localRegistry?: LocalRegistry;
  /** Or a path to a prompts/registry.json-shaped file (Node only). */
  localRegistryPath?: string;
  fetchImpl?: typeof fetch;
  /** Network timeout per request (ms). */
  requestTimeoutMs?: number;
  onReport?: (id: string, outcome: ReportOutcome) => void;
  logger?: (level: "debug" | "info" | "warn", msg: string, meta?: unknown) => void;
}

// ----------------------------- Cache ----------------------------------------

interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
  refreshing?: boolean;
}

// ----------------------------- Client ---------------------------------------

export class AdminClient {
  private cfg: Required<
    Omit<AdminClientConfig, "localRegistry" | "localRegistryPath" | "onReport" | "logger" | "fetchImpl">
  > &
    Pick<AdminClientConfig, "localRegistry" | "localRegistryPath" | "onReport" | "logger" | "fetchImpl">;
  private cache = new Map<string, CacheEntry<unknown>>();
  private localLoaded?: LocalRegistry;

  constructor(config: AdminClientConfig = {}) {
    this.cfg = {
      baseURL: config.baseURL ?? process.env.ADMIN_URL ?? "http://localhost:4001",
      serviceToken: config.serviceToken ?? process.env.ADMIN_SERVICE_TOKEN ?? "",
      ttlMs: config.ttlMs ?? Number(process.env.ADMIN_SDK_TTL_MS ?? 60_000),
      localFallback:
        config.localFallback ?? process.env.ADMIN_LOCAL_FALLBACK === "true",
      requestTimeoutMs: config.requestTimeoutMs ?? 4000,
      localRegistry: config.localRegistry,
      localRegistryPath: config.localRegistryPath,
      onReport: config.onReport,
      logger: config.logger,
      fetchImpl: config.fetchImpl,
    };
  }

  private log(level: "debug" | "info" | "warn", msg: string, meta?: unknown) {
    if (this.cfg.logger) this.cfg.logger(level, msg, meta);
  }

  // -------- low-level GET with cache + stale-while-revalidate + fallback ----

  private async getCached<T>(
    cacheKey: string,
    path: string,
    fallback: () => T
  ): Promise<T> {
    const now = monotonic();
    const hit = this.cache.get(cacheKey) as CacheEntry<T> | undefined;

    if (this.cfg.localFallback) {
      return fallback();
    }

    if (hit) {
      const fresh = now - hit.fetchedAt < this.cfg.ttlMs;
      if (fresh) return hit.value;
      // stale-while-revalidate: kick off a refresh, return stale now
      if (!hit.refreshing) {
        hit.refreshing = true;
        void this.fetchJson<T>(path)
          .then((v) => this.cache.set(cacheKey, { value: v, fetchedAt: monotonic() }))
          .catch((e) => this.log("warn", `revalidate failed ${path}`, e))
          .finally(() => {
            const cur = this.cache.get(cacheKey) as CacheEntry<T> | undefined;
            if (cur) cur.refreshing = false;
          });
      }
      return hit.value;
    }

    try {
      const v = await this.fetchJson<T>(path);
      this.cache.set(cacheKey, { value: v, fetchedAt: now });
      return v;
    } catch (e) {
      this.log("warn", `admin unreachable for ${path} — using local fallback`, e);
      const v = fallback();
      // cache the fallback briefly so we don't hammer a down service
      this.cache.set(cacheKey, { value: v, fetchedAt: now });
      return v;
    }
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const f = this.cfg.fetchImpl ?? fetch;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.cfg.requestTimeoutMs);
    try {
      const res = await f(`${this.cfg.baseURL}${path}`, {
        ...init,
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${this.cfg.serviceToken}`,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
      if (!res.ok) throw new Error(`admin ${path} -> ${res.status}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(t);
    }
  }

  // -------- local registry loading -----------------------------------------

  private loadLocal(): LocalRegistry {
    if (this.localLoaded) return this.localLoaded;
    let reg: LocalRegistry = {};
    if (this.cfg.localRegistry) {
      reg = this.cfg.localRegistry;
    } else if (this.cfg.localRegistryPath) {
      try {
        // Node-only; guarded so the file can be bundled for browsers too.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require("node:fs") as typeof import("node:fs");
        const raw = JSON.parse(fs.readFileSync(this.cfg.localRegistryPath, "utf8"));
        reg = { prompts: raw.prompts ?? [], providers: raw.providers, flags: raw.flags };
      } catch (e) {
        this.log("warn", "could not read localRegistryPath", e);
      }
    }
    if (!reg.providers || reg.providers.length === 0) {
      reg.providers = defaultProviderChainFromEnv();
    }
    if (!reg.flags || reg.flags.length === 0) {
      reg.flags = DEFAULT_FLAGS;
    }
    this.localLoaded = reg;
    return reg;
  }

  // -------- Prompts ---------------------------------------------------------

  async getPrompt(key: string): Promise<PromptRecord | null> {
    return this.getCached<PromptRecord | null>(
      `prompt:${key}`,
      `/public/prompts/${encodeURIComponent(key)}`,
      () => this.loadLocal().prompts?.find((p) => p.key === key) ?? null
    );
  }

  /** Active variant content for a key, variables substituted. */
  async renderPrompt(key: string, vars: Record<string, unknown> = {}): Promise<string> {
    const rec = await this.getPrompt(key);
    if (!rec) throw new Error(`Prompt not found: ${key}`);
    const variant =
      rec.variants.find((v) => v.active) ?? rec.variants[rec.variants.length - 1];
    if (!variant) throw new Error(`Prompt ${key} has no variants`);
    return interpolate(variant.content, vars);
  }

  // -------- Providers / routing --------------------------------------------

  async route(kind: ProviderKind = "llm"): Promise<RouteResult> {
    return this.getCached<RouteResult>(
      `route:${kind}`,
      `/public/providers/route?kind=${encodeURIComponent(kind)}`,
      () => {
        const chain = (this.loadLocal().providers ?? [])
          .filter((p) => p.kind === kind)
          .sort((a, b) => a.priority - b.priority);
        return { primary: chain[0] ?? null, chain };
      }
    );
  }

  async providers(kind: ProviderKind = "llm"): Promise<ProviderInstance[]> {
    const r = await this.route(kind);
    return r.chain;
  }

  /**
   * Cross-provider failover: try every healthy provider of `kind` in chain
   * order, reporting each outcome. Throws if all fail.
   */
  async withFailover<T>(
    kind: ProviderKind,
    fn: (p: ProviderInstance) => Promise<T>
  ): Promise<T> {
    const { chain } = await this.route(kind);
    return this.walk(chain, fn, `no providers for kind=${kind}`);
  }

  /** Per-provider failover: only that provider's keys, in priority order. */
  async withProviderFailover<T>(
    providerId: string,
    fn: (p: ProviderInstance) => Promise<T>
  ): Promise<T> {
    const all = await this.providers("llm");
    const chain = all
      .filter((p) => p.providerId === providerId)
      .sort((a, b) => a.priority - b.priority);
    return this.walk(chain, fn, `no instances for provider=${providerId}`);
  }

  private async walk<T>(
    chain: ProviderInstance[],
    fn: (p: ProviderInstance) => Promise<T>,
    emptyMsg: string
  ): Promise<T> {
    if (chain.length === 0) throw new Error(emptyMsg);
    let lastErr: unknown;
    for (const p of chain) {
      const start = monotonic();
      try {
        const out = await fn(p);
        void this.report(p.id, { ok: true, latencyMs: Math.round(monotonic() - start) });
        return out;
      } catch (e) {
        lastErr = e;
        void this.report(p.id, {
          ok: false,
          latencyMs: Math.round(monotonic() - start),
          reason: (e as Error)?.message ?? "error",
        });
        this.log("warn", `provider ${p.providerId} (${p.id}) failed, trying next`, e);
      }
    }
    throw new Error(
      `All providers failed. Last error: ${(lastErr as Error)?.message ?? lastErr}`
    );
  }

  async report(id: string, outcome: ReportOutcome): Promise<void> {
    this.cfg.onReport?.(id, outcome);
    if (this.cfg.localFallback) return;
    try {
      await this.fetchJson(`/public/providers/${encodeURIComponent(id)}/report`, {
        method: "POST",
        body: JSON.stringify(outcome),
      });
    } catch (e) {
      this.log("debug", "report failed (non-fatal)", e);
    }
  }

  // -------- Flags -----------------------------------------------------------

  async getFlags(): Promise<FlagDef[]> {
    return this.getCached<FlagDef[]>(
      "flags",
      "/public/flags",
      () => this.loadLocal().flags ?? []
    );
  }

  async isFlagEnabled(key: string, ctx: FlagContext = {}): Promise<boolean> {
    const flags = await this.getFlags();
    const def = flags.find((f) => f.key === key);
    if (!def) return false;
    return evaluateFlag(def, ctx);
  }
}

export function createAdminClient(config: AdminClientConfig = {}): AdminClient {
  return new AdminClient(config);
}

// ----------------------------- Helpers --------------------------------------

/** Substitute {{var}} and ${var}. Missing vars become "". */
export function interpolate(tpl: string, vars: Record<string, unknown>): string {
  const get = (name: string) => {
    const v = vars[name.trim()];
    if (v === undefined || v === null) return "";
    return typeof v === "string" ? v : JSON.stringify(v);
  };
  return tpl
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, n) => get(n))
    .replace(/\$\{\s*([\w.]+)\s*\}/g, (_m, n) => get(n));
}

export function evaluateFlag(def: FlagDef, ctx: FlagContext): boolean {
  switch (def.strategy) {
    case "on":
      return true;
    case "off":
      return false;
    case "percent": {
      const pct = def.percent ?? 0;
      const id = ctx.userId ?? ctx.email;
      if (!id) return pct >= 100;
      return hashToBucket(`${def.key}:${id}`) < pct;
    }
    case "allowlist": {
      const list = def.allowlist ?? [];
      return list.includes(String(ctx.userId)) || list.includes(String(ctx.email));
    }
    case "condition": {
      const cond = def.condition ?? {};
      return Object.entries(cond).every(([k, expected]) => {
        const actual = ctx[k];
        if (expected && typeof expected === "object" && "$in" in (expected as object)) {
          const arr = (expected as { $in: unknown[] }).$in;
          return arr.includes(actual);
        }
        return actual === expected;
      });
    }
    default:
      return def.enabled ?? false;
  }
}

/** Deterministic 0-99 bucket from a string (FNV-1a). */
function hashToBucket(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h) % 100;
}

function monotonic(): number {
  // performance.now if available (monotonic), else wall clock.
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Number(process.hrtime.bigint() / 1_000_000n);
}

/**
 * Build a provider fallback chain from env when the Admin Service is offline.
 * Order = priority (lower first): Qwen -> OpenRouter -> Groq -> Ollama -> Mock.
 * The Mock provider is ALWAYS present and last so the demo never dead-ends.
 * Paid endpoints are excluded unless HELMSMAN_ALLOW_PAID=true.
 */
export function defaultProviderChainFromEnv(env = process.env): ProviderInstance[] {
  const chain: ProviderInstance[] = [];
  let priority = 100;
  const push = (p: Omit<ProviderInstance, "priority" | "kind" | "status">) =>
    chain.push({ ...p, kind: "llm", priority: (priority += 10), status: "unknown" });

  if (env.QWEN_API_KEY) {
    push({
      id: "qwen-primary",
      providerId: "qwen",
      baseURL: env.QWEN_BASE_URL ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      auth: "bearer",
      values: { apiKey: env.QWEN_API_KEY },
    });
  }
  if (env.OPENROUTER_API_KEY) {
    push({
      id: "openrouter-free",
      providerId: "openrouter",
      baseURL: env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      auth: "bearer",
      values: { apiKey: env.OPENROUTER_API_KEY },
    });
  }
  if (env.GROQ_API_KEY) {
    push({
      id: "groq-llama",
      providerId: "groq",
      baseURL: env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
      auth: "bearer",
      values: { apiKey: env.GROQ_API_KEY },
    });
  }
  if (env.OLLAMA_BASE_URL) {
    push({
      id: "ollama-local",
      providerId: "ollama",
      baseURL: env.OLLAMA_BASE_URL,
      auth: "none",
      values: { model: "qwen2.5-coder" },
    });
  }
  // Always-on local mock — deterministic, offline, never fails.
  chain.push({
    id: "mock-local",
    providerId: "mock",
    kind: "llm",
    baseURL: "local://mock",
    auth: "none",
    priority: priority + 1000,
    status: "healthy",
    values: {},
  });
  return chain;
}

export const DEFAULT_FLAGS: FlagDef[] = [
  { key: "helmsman.auto_close_duplicates", strategy: "off" },
  { key: "helmsman.use_long_context_analyzer", strategy: "on" },
  { key: "helmsman.voice_self_check", strategy: "on" },
  { key: "helmsman.rpa_dry_run", strategy: "on" },
];
