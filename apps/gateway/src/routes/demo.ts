import { Router } from "express";
import {
  DEMO_FIXTURE_ID,
  allFixtureIssues,
  demoCorpus,
  demoIssue,
  demoRepo,
  demoSourceFiles,
  demoVoiceCorpus,
} from "../demo/fixtures.ts";
import { getStore } from "../db/store.ts";
import { openCase, openCaseAndRun, refreshVoiceProfile } from "../service.ts";
import { runPipelineForCase } from "../pipeline.ts";
import { sseHub } from "../lib/sse.ts";

export const demoRouter = Router();

// GET /demo/fixtures — list the bundled issues a judge can run.
demoRouter.get("/fixtures", (_req, res) => {
  res.json({
    default: DEMO_FIXTURE_ID,
    issues: allFixtureIssues().map((i: any) => ({
      id: i.id,
      number: i.github_issue_number,
      title: i.title,
      expected: i.expected_classification,
    })),
  });
});

// POST /demo/run { fixtureId? } — full pipeline against a fixture, no GitHub.
// The single most important route for hackathon judging.
demoRouter.post("/run", async (req, res) => {
  try {
    const fixtureId = (req.body?.fixtureId as string) || DEMO_FIXTURE_ID;
    const store = await getStore();

    // ensure the demo repo is connected and has a voice profile
    let repo = await store.getRepoByFullName(demoRepo().full_name);
    if (!repo) {
      repo = await store.upsertRepo({
        github_id: demoRepo().github_id,
        owner: demoRepo().owner,
        name: demoRepo().name,
        full_name: demoRepo().full_name,
        default_branch: demoRepo().default_branch,
        head_sha: demoRepo().head_sha,
        voice_profile: null,
      });
    }
    if (!repo.voice_profile) {
      const vc = demoVoiceCorpus();
      const vp = await refreshVoiceProfile(repo, vc.login, vc.comments);
      repo.voice_profile = vp;
    }

    const { issue } = demoIssue(fixtureId);
    const extras = { seedCorpus: demoCorpus(), sourceFiles: demoSourceFiles() };

    // For repeatable demos: replace any prior case for this fixture so the
    // audit trail / stages start clean each run. Distinct fixtures still
    // accumulate as separate cases in the dashboard.
    const prior = await store.findCase(repo.id, issue.number);
    if (prior) {
      await store.deleteCase(prior.id);
      sseHub.clearBuffer(prior.id);
    }

    // wait=1 (default for CLI / quick checks): run to completion, return final case.
    // wait=0 (dashboard): create the case, return its id immediately, run async so
    // the client can subscribe to SSE and watch the pipeline animate live.
    const wait = String(req.query.wait ?? "1") !== "0";
    if (wait) {
      const caseRec = await openCaseAndRun(repo, issue, extras);
      return res.json({ ok: true, fixtureId, case: caseRec, stream_url: `/api/cases/${caseRec.id}/stream` });
    }
    const caseRec = await openCase(repo, issue);
    res.json({ ok: true, fixtureId, case: caseRec, stream_url: `/api/cases/${caseRec.id}/stream` });
    // fire-and-forget; events fan out over SSE and persist to the case
    void runPipelineForCase(caseRec, repo, issue, extras).catch((e) =>
      console.error("[demo/run async]", (e as Error).message)
    );
  } catch (e) {
    console.error("[demo/run]", e);
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});
