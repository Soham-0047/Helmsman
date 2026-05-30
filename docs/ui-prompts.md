# Helmsman — Claude Design prompts (per route)

Five prompts, one per route. Each is **self-contained** — paste it into Claude
(design/artifact mode) on its own. Paste the **Shared design system** block at the
top of every prompt so all five screens come out coherent. Aesthetic target:
**refined dev-tool — Linear / Vercel / Raycast.**

> Tip: generate them in this order — Dashboard first (it defines the app shell and
> the most components), then Case review, Pipeline, Connect, Landing. Reuse the
> tokens and components Claude builds for the Dashboard in the later prompts.

---

## 0 · Shared design system (paste at the top of EVERY prompt)

```
DESIGN SYSTEM — use these exact tokens and rules on every screen.

Product: Helmsman — an AI co-pilot for open-source maintainers. A seven-agent
pipeline triages each new GitHub issue (classify → find duplicates → reproduce →
analyze source → prioritize → profile the maintainer's voice → draft a reply),
then stops at a human approval gate. Nothing is posted to GitHub without the
maintainer's explicit approval. The product personality is: precise, calm,
trustworthy, keyboard-driven, dense-but-legible. Think Linear / Vercel / Raycast,
NOT a flashy marketing site.

Visual language:
- Dark-first, with a light theme. Default to dark.
- DARK tokens:  bg #09090E · surface #10101A · elevated #181825 · border #242438
  · text #EDEDF5 · text-secondary #8080A0 · text-muted #404058
  · accent (indigo) #7C6AF7 · green #22C55E · amber #F59E0B · red #EF4444 · blue #3B82F6
- LIGHT tokens: bg #F8F8FC · surface #FFFFFF · elevated #F0F0F8 · border #DDDDF0
  · text #0D0D1A · text-secondary #4A4A6A · accent #5B4FD4
- ONE accent color (indigo). Use color only to carry meaning (status, priority,
  agent state). Everything else is neutral greys. No rainbow UI.
- Type: Inter for UI, JetBrains Mono for code/IDs/numbers/latencies. Tight heading
  tracking (-0.02em). Clear type scale: 32/24/18/15/13/11px. Body 15px, line-height 1.6.
- Spacing on an 8px grid. 1px hairline borders (not heavy shadows). Subtle elevation
  only — NO glassmorphism, NO blur, NO big gradients.
- Radii: 8px controls, 12px cards, 999px pills. Buttons are compact (height ~34px).
- Motion is subtle and fast (120–200ms ease). Respect prefers-reduced-motion.
- Status colors are consistent everywhere: green=done/approved, amber=mid priority/
  in-progress, red=high priority/error, indigo=active/running, grey=idle/skipped.

Reusable components to define once and reuse: AppShell (sidebar + content),
Button (primary/secondary/ghost/danger/success), Tag (small mono chip), Pill
(accent chip), StatusDot, PriorityBadge, Card, KeyValue list, Toast, Skeleton.

The seven agents (use these labels + monochrome glyph-style icons, NOT emoji):
Classifier, Retriever, Reproducer, Source, Prioritizer, Voice, Responder.

The seven Maestro case stages (a linear progression):
Intake → Classification → Investigation → Drafting → Pending Approval → Approved → Executed.

Output: a single responsive React + TypeScript artifact using Tailwind. Functional,
accessible (keyboard focus rings, aria labels), with realistic mock data. No backend.
```

---

## 1 · Landing — route `/`

```
[PASTE SHARED DESIGN SYSTEM]

Build the LANDING / marketing page for Helmsman. It must read like a serious
developer product launch, not a hackathon demo. Calm, confident, lots of negative
space, restrained motion.

Sections, top to bottom:

1. Sticky top nav: left = anchor logo "⚓ Helmsman" wordmark (small nautical mark
   + bold wordmark); right = "Docs", "GitHub" link, theme toggle, and a primary
   button "Open dashboard". Hairline bottom border, slight bg blur on scroll.

2. Hero (centered, generous vertical padding):
   - A small pill above the headline: "AI co-pilot for open-source maintainers".
   - Headline: "Maintainers spend 80% of their time on triage. Helmsman gives it
     back." Large, tight tracking, words fade/rise in sequentially (subtle).
   - Subhead (max ~620px): "A seven-agent pipeline triages every new GitHub issue —
     classify, dedupe, reproduce, analyze source, and draft a reply in your voice —
     then waits for you to approve."
   - Two buttons: primary "▶ Run the live demo" → /dashboard?demo=1, secondary
     "Connect a repo" → /connect.
   - NO loud background gradient. At most a very faint radial accent glow, low opacity.

3. A thin horizontal auto-scrolling "receipts" ticker showing triage results, each
   with a green check + mono detail. Examples:
   "✓ bug · segfault on null ptr · classified in 0.8s",
   "✓ duplicate · #482 → #119 · flagged by retriever",
   "✓ security · API key in logs · priority 9/10",
   "✓ needs_info · 'it doesn't work' · drafted a reply".
   Masked fade on both edges. Pauses on hover.

4. "What it does" — 4 feature cards in a responsive grid, hairline borders, hover
   raises border to accent:
   - "Seven specialist agents" — Classifier, Retriever, Reproducer, Source, Voice,
     Responder, Prioritizer. Each a focused call, orchestrated explicitly.
   - "Human-in-the-loop, always" — Nothing posts to GitHub without your approval.
     You approve, edit, or reject the assembled draft at the gate.
   - "A real control plane" — Every prompt and provider lives in a separate, audited
     admin service. Swap models, ship prompt revisions, toggle flags without redeploy.
   - "Audited end to end" — Each issue is a governed case advancing through seven
     stages. Every transition, model call, and decision is logged.

5. "Lifecycle" section: render the 7 stages (Intake → … → Executed) as a clean
   horizontal stepper of numbered chips with connecting arrows, wrapping on mobile.
   Caption: "Seven governed stages, one human gate."

6. A subtle stat row or quote strip is optional — keep it minimal.

7. Footer: "MIT licensed", small wordmark, two tags ("UiPath AgentHack · Maestro
   Case", "Global AI Hackathon · Qwen"), hairline top border.

Make the hero and feature cards feel premium through spacing and type, not effects.
```

---

## 2 · Connect — route `/connect`

```
[PASTE SHARED DESIGN SYSTEM]

Build the CONNECT / onboarding screen — where a maintainer links a GitHub repo
before triage begins. Single centered column (max ~640px), top nav with logo +
theme toggle. Calm and reassuring; this is a trust moment.

A. A 3-step progress indicator at the top, horizontal: numbered circles connected
   by a line. Steps: "Connect GitHub" → "Pick a repo" → "Profile your voice".
   Completed steps show a checkmark in accent; current step is filled accent;
   future steps are muted/outlined. Animate the checkmark draw on completion.

B. Step 1 (default) card:
   - H1 "Connect a repository".
   - Subhead: "Helmsman watches new issues and runs the seven-agent pipeline. You
     stay in control — nothing is posted without your approval."
   - Primary full-width button with GitHub mark: "Connect with GitHub".
   - A subtle "— or —" divider.
   - Secondary full-width button: "▶ Run on the demo repo (no setup)".
   - Inline error slot (red, small) for "couldn't reach the gateway".

C. After "demo repo" is clicked → transition to a setup card titled
   "helmsman-demo/fastlane-parser" with subtitle "Setting things up…" and a
   staggered checklist that reveals one item at a time (each goes muted ○ → green ✓):
     1. "Repository linked"
     2. "Historical issues indexed for duplicate detection"
     3. "Maintainer voice fingerprint built"
     4. "Webhook armed · issues will flow into triage"
   When all four complete, show a pill "⚓ Helmsman is ready" and auto-advance
   (the real app routes to /dashboard?demo=1 — show a "Go to dashboard →" button).

Keep it elegant: hairline card, generous padding, tasteful reveal animation,
reduced-motion fallback (instant states). Include both dark and light.
```

---

## 3 · Dashboard — route `/dashboard` (most important — build this first)

```
[PASTE SHARED DESIGN SYSTEM]

Build the DASHBOARD — the maintainer's triage cockpit. This is the core screen and
defines the app shell. Three-column layout, full height:

LEFT SIDEBAR (~220px, sticky, surface bg, hairline right border):
- Logo "⚓ Helmsman" at top (links home).
- Nav group "Pipeline": "Cases" (active, with anchor glyph), "Connect repo" (＋).
- Divider.
- "Control plane" section — a compact card showing live admin state:
    Routing: <tag "live" or "local fallback">
    Maestro: <tag "connected">
    Prompts (7): a wrap of small mono tags (classifier, retriever, reproducer,
      source_analyzer, prioritizer, voice_profiler, responder)
    Flags: small tags like "shadow_mode: off", "auto_label: on"
- Theme toggle pinned at the bottom.

CENTER FEED (flex, the main column):
- Header row: H2 "Issue triage" + subtext "<N> cases · human-in-the-loop". On the
  right: a fixture <select> ("#<number> · <title>") and a primary button
  "▶ Run pipeline" (shows "Running…" + spinner while busy).
- A gateway-error banner slot (red hairline card) shown only on error.
- Empty state card (centered) when no cases: "No cases yet. Pick a fixture issue
  and hit Run pipeline to watch the seven agents fire."
- A vertical list of CASE CARDS. Each card:
    - A 3px left priority strip colored by band: red=high (8–10), amber=mid (4–7),
      green=low (0–3).
    - Top row: mono issue number "#482" (muted) on the left, current-stage Tag on
      the right (e.g. "Investigation", "Pending Approval").
    - Bold issue title.
    - A wrap of metadata: classification Pill (bug/feature/security/question/
      needs_info/duplicate), a "priority 8/10" Tag, "@author" muted.
    - Cards selectable (selected = accent border). Cards in "Pending Approval"
      pulse a soft accent glow on the left edge to draw the eye to the human gate.
    - New cards animate in (slide/fade from top).
  Show ~5 realistic mock cases spanning classifications and priorities.

RIGHT DETAIL PANEL (~380px, slides in when a case is selected; collapses to 0 when
closed; on mobile it becomes a full-screen overlay):
- Header: "Case review" label + close ✕.
- Embed the CaseReview component (see prompt 4) in a condensed form: issue header,
  the 7-node pipeline stepper (compact), priority gauge + signals, agent findings,
  voice-match bar, the editable draft, and Approve / Save edits / Reject buttons.

Interactions: clicking a card opens the panel; "Run pipeline" prepends a new
"running" case that advances through stages. Keyboard: j/k to move selection,
Enter to open. Include realistic mock data and both themes.
```

---

## 4 · Case review / HITL gate — route `/case/[id]`

```
[PASTE SHARED DESIGN SYSTEM]

Build the CASE REVIEW screen — the human-in-the-loop approval gate. This is where
the maintainer reviews everything the seven agents produced and approves, edits, or
rejects the drafted reply. NOTHING posts to GitHub until they act here — make that
guarantee visible and reassuring. Top nav: logo + "← Dashboard" + theme toggle.
Centered content (max ~900px) inside one large card.

Layout, top to bottom:

1. Header row: label "Issue #482" on the left, a mono Tag with the UiPath case id
   (e.g. "CASE-7F3A") on the right. Then the issue title (H3). Then a metadata wrap:
   "@author" · current-stage Tag · classification Pill · "👍 12" reactions tag.

2. The seven-agent PIPELINE STEPPER (horizontal, compact): seven nodes
   (Classifier, Retriever, Reproducer, Source, Prioritizer, Voice, Responder)
   connected by thin connectors. Node states: idle (grey outline), active (indigo,
   spinner ring), complete (green check fill), skipped (dashed, dim), error (red),
   "context loaded" (blue). Show per-node latency in mono under finished nodes.

3. Priority block: a circular PRIORITY GAUGE (animated stroke, 0–10, colored by
   band red/amber/green) next to a "Priority signals" list of small tags
   (e.g. "security-sensitive", "many reactions", "core maintainer pinged",
   "regression").

4. "Agent findings" — a clean key/value card (label column muted, value column):
     Duplicate of      #119 (conf 0.87)
     Reproduction      reproducible · node 20.11
     Likely files      src/parser/tokenizer.ts, src/index.ts   (mono)
     Hypothesis        Null check missing when config block is empty
     Recommended       comment + label: needs-info
   Only show rows that have data.

5. "Voice match" — a label + percentage (e.g. 92%) and a thin gradient progress bar.

6. "Draft reply (editable)" — a split editor: a monospace <textarea> on the left
   and a live rendered Markdown PREVIEW on the right, separated by a draggable
   col-resize divider. The draft is real GitHub-style markdown (greeting, findings,
   a code suggestion fenced block, a closing question). On mobile, stack vertically.

7. Action bar: success button "Approve & Post" (primary action), secondary
   "Save edits", danger ghost "Reject", and a right-aligned ghost link
   "Pipeline view →" (to /case/[id]/pipeline). When already executed, the approve
   button becomes a disabled "✓ Executed".

8. A small muted caption under the actions: "Human gate · nothing is posted to
   GitHub until you approve."

9. A toast (bottom center) for results, e.g. "Approved · RPA dry-run → POST
   /repos/.../issues/482/comments" or "Draft saved".

Make the approval moment feel weighty and safe. Realistic mock data, both themes,
keyboard-accessible buttons.
```

---

## 5 · Live pipeline — route `/case/[id]/pipeline`

```
[PASTE SHARED DESIGN SYSTEM]

Build the LIVE PIPELINE view — a full-page real-time visualization of the seven
agents firing on one issue, streamed event by event. This is the "wow" screen for
a demo, but keep it tasteful (dev-tool, not arcade). Top nav: logo + "← Case
review" + theme toggle. Centered content (max ~1100px).

1. Header: a label "Live pipeline · case 7f3a91…" (mono, truncated id), then the
   issue title (H2), then a wrap: classification Pill, "priority 8/10" Tag, and the
   current-stage Tag that updates live.

2. The hero element — a horizontal PIPELINE FLOW of the seven agent nodes
   (Classifier → Retriever → Reproducer → Source → Prioritizer → Voice →
   Responder) connected by thin connectors. As each agent fires:
     - the node goes idle → active (indigo ring + spinner) → complete (green check),
     - a small glowing TOKEN dot travels along the connector from the just-finished
       node to the next (offset-path animation), making data flow visible,
     - finished nodes show their latency in mono (e.g. "812ms").
   Branching note: Reproducer/Source can be skipped for non-bug issues (render as
   dashed dim nodes). Put this flow in a roomy card.

3. Below, a two-column grid:
   LEFT — "Event timeline": a scrollable, chronological log streamed from the
   pipeline. Each row: a mono event-type chip (agent_start, agent_complete,
   agent_skipped, stage, pipeline_complete), then bold agent/stage name, then a
   message or "· qwen-max (model-studio)" model/provider, then latency in mono.
   Newest appended at the bottom, auto-scroll, subtle row-enter animation.
   RIGHT — "Assembled draft": shows the markdown draft as it becomes available
   ("The draft appears when the Responder completes."). When the case reaches
   "Pending Approval", show a success button "Review & approve →" linking to
   /case/[id].

Drive it with a mock event stream that plays out over a few seconds on load
(staggered timeouts) so the animation is visible. Respect prefers-reduced-motion
(skip the token travel, just snap states). Both themes. Realistic agent outputs.
```

---

### How to use these with Claude design

1. Open Claude, paste **one** prompt (including the shared block at its top).
2. Iterate in that conversation: "tighten the spacing", "make the case cards denser",
   "add a light-theme toggle", "show the pending-approval pulse".
3. Move to the next route in a fresh conversation, pasting the shared block again so
   tokens stay identical across screens.
4. When you like a screen, ask Claude to "export the Tailwind tokens as CSS variables"
   so they map cleanly back onto Helmsman's existing `globals.css` token names
   (bg/surface/elevated/border/accent/...), which already match this system.
```
