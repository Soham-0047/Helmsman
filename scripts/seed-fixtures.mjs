// `npm run seed:fixtures` — seed the 20 fixture issues as the per-repo RAG
// corpus (issue_embeddings) so duplicate detection has history to match against.
// Demo mode seeds the in-memory store at pipeline time, so this is a no-op there.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AGENTS, env, isUp, ok, ROOT, step, warn } from "./lib.mjs";

const fixtures = JSON.parse(readFileSync(resolve(ROOT, "db/seed/fixtures.json"), "utf8"));
const corpus = fixtures.issues.map((i) => ({
  github_issue_number: i.github_issue_number,
  content: `${i.title}\n${i.body}`,
}));

if (!env.DATABASE_URL) {
  warn("DATABASE_URL not set — demo mode seeds the in-memory corpus on each `npm run demo`.");
  warn(`(${corpus.length} fixture issues are bundled in db/seed/fixtures.json.)`);
  process.exit(0);
}

if (!(await isUp(AGENTS))) {
  warn(`agent runtime not reachable at ${AGENTS}. Start it (\`npm run dev\`) then re-run, or it will be indexed on first webhook.`);
  process.exit(0);
}

step(`indexing ${corpus.length} fixture issues into pgvector via the runtime`);
const repoId = String(fixtures.repo.github_id);
const r = await fetch(`${AGENTS}/vector/index`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ repo_id: repoId, issues: corpus }),
});
const data = await r.json();
ok(`indexed ${data.indexed} issue embeddings (repo ${fixtures.repo.full_name})`);
