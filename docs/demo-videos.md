# Demo Videos

Two separate recordings, one per hackathon. Same codebase — only the framing changes.

| Video | Length | Audience | Link |
|---|---|---|---|
| UiPath AgentHack | 5 min | Maestro Case / human-in-the-loop | ‹paste link› |
| Qwen Global AI Hackathon | 3 min | Agent Society / Alibaba deploy | ‹paste link› |

---

## UiPath AgentHack — 5 minutes

**Thesis:** agentic case management for exception-heavy work, human in charge at the decision point.

1. **(0:00) The problem** — maintainers spend 60–80% of their time on triage. Show the landing page.
2. **(0:30) Connect a repo** — `/connect`, OAuth (or demo repo). Mention the voice profile being built.
3. **(1:00) An issue arrives → a Maestro Case opens.** On the dashboard, click **Run pipeline** on the segfault issue. Switch to the **pipeline view** and narrate the case advancing **Intake → Classification → Investigation → Drafting → Pending Approval** — one stage per agent group, the token animating between agents.
4. **(2:30) The human gate.** Open `/case/[id]`. This is the core judging requirement: the maintainer **approves / edits / rejects**. Edit a line in the draft to show control. Point out: *nothing has been posted to GitHub.*
5. **(3:30) Approve → UiPath RPA executes.** Show the stage flip to **Approved → Executed** and the RPA action (dry-run log or the real GitHub comment). Emphasize: the RPA executor is what posts — not the LLM.
6. **(4:15) Audit trail.** Show `audit_log`: every stage transition, every agent call, the human decision, the RPA result. Map components to UiPath: Agent Builder, Maestro, API Workflows, RPA.
7. **(4:45) Coding-agent disclosure.** "This was built with Claude Code." Show a snippet of the generated README/code.

## Qwen Global AI Hackathon — 3 minutes (Track 3: Agent Society)

**Thesis:** multi-agent collaboration with a measurable efficiency gain over a single agent.

1. **(0:00) Seven specialists, not one generalist.** Show the message-passing diagram; name each agent and its Qwen model (`qwen3-8b`, `qwen3-32b`, `qwen2.5-coder-7b`, `qwen3-long-context`).
2. **(0:40) Run the A/B.** `npm run benchmark`. Show the live table: classification accuracy, response quality (LLM-judge), voice similarity, time — **baseline vs. the seven-agent pipeline.**
3. **(1:30) Why the pipeline wins.** Duplicate detection (the single agent has no retrieval), source-grounded drafting, and voice matching. Show a duplicate being caught (fix-005 → #101).
4. **(2:10) Running on Alibaba Cloud.** Show the ECS console + `curl http://‹IP›/health` with Qwen providers listed (see `deployment/alibaba_cloud_proof.md`).
5. **(2:40) The control plane.** 15-second Admin Service clip — "every prompt and provider Helmsman uses is versioned and routed through a separate, audited control plane I built first."

---

## Recording the offline demo (no accounts needed)

```bash
npm run setup
npm run demo          # narrated CLI: 7 agents → draft → approval → RPA dry-run → audit
npm run dev           # then open http://localhost:3000 for the live UI
npm run benchmark     # the Agent Society A/B table
```
