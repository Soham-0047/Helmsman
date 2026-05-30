// `npm run db:schema` — apply db/schema.sql to DATABASE_URL (live mode).
// In demo mode there is no database; this is a no-op with guidance.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { env, fail, ok, ROOT, step, warn } from "./lib.mjs";

const url = env.DATABASE_URL;
if (!url) {
  warn("DATABASE_URL is not set — demo mode uses an in-memory store, no schema needed.");
  warn("For real pgvector: `docker compose up -d` then set DATABASE_URL and re-run.");
  process.exit(0);
}

const sql = readFileSync(resolve(ROOT, "db/schema.sql"), "utf8");
step("applying db/schema.sql …");
try {
  const pg = await import("pg");
  const client = new pg.default.Client({ connectionString: url });
  await client.connect();
  await client.query(sql);
  await client.end();
  ok("schema applied (tables, pgvector indexes, helper functions)");
} catch (e) {
  fail(`schema apply failed: ${e.message}`);
  fail("If `pg` is missing, run `npm install`. If pgvector is missing, use the docker-compose Postgres image.");
  process.exit(1);
}
