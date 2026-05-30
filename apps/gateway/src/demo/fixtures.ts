// Loads the bundled demo data (db/seed/*.json) so /demo/run and `npm run demo`
// fire the full pipeline against a real fixture issue with no GitHub setup.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../config.ts";
import type { IssueRef, RepoRef } from "../types.ts";

const seedDir = resolve(config.root, "db/seed");
const read = (f: string) => JSON.parse(readFileSync(resolve(seedDir, f), "utf8"));

const fixtures = read("fixtures.json");
const sourceFiles = read("source_files.json");
const voiceCorpus = read("voice_corpus.json");

export const DEMO_FIXTURE_ID = process.env.DEMO_FIXTURE_ID ?? "fix-001";

export function demoRepo(): RepoRef {
  const r = fixtures.repo;
  return {
    id: "demo-repo",
    github_id: r.github_id,
    owner: r.owner,
    name: r.name,
    full_name: r.full_name,
    default_branch: r.default_branch,
    head_sha: r.head_sha,
    voice_profile: null,
  };
}

export function demoMaintainer() {
  return fixtures.maintainer;
}

export function demoIssue(fixtureId: string): { issue: IssueRef; raw: any } {
  const fx = fixtures.issues.find((i: any) => i.id === fixtureId) ?? fixtures.issues[0];
  return {
    raw: fx,
    issue: {
      number: fx.github_issue_number,
      title: fx.title,
      body: fx.body,
      author: fx.author,
      author_is_contributor: fx.author_is_contributor ?? false,
      reactions: fx.reactions ?? 0,
      age_hours: fx.age_hours ?? 0,
      existing_labels: fx.existing_labels ?? [],
    },
  };
}

export function allFixtureIssues() {
  return fixtures.issues;
}

export function demoCorpus(): { github_issue_number: number; content: string }[] {
  return fixtures.issues.map((i: any) => ({
    github_issue_number: i.github_issue_number,
    content: `${i.title}\n${i.body}`,
  }));
}

export function demoSourceFiles(): { path: string; content: string }[] {
  return sourceFiles.files;
}

export function demoVoiceCorpus(): { login: string; comments: string[] } {
  return { login: voiceCorpus.maintainer_login, comments: voiceCorpus.comments };
}
