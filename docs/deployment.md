# Deploying Helmsman (free tiers, no GitHub auth)

Helmsman is three services. This guide deploys all three on **free tiers**, with
**no GitHub OAuth/app connection** — you either deploy from your local machine via
CLI, or point Render at the **public repo URL** (no account linking).

| Service | Folder | Stack | Host | How |
|---|---|---|---|---|
| **web** | `apps/web` | Next.js 15 | **Vercel** (or Netlify) | CLI from your laptop — no Git connection |
| **gateway** | `apps/gateway` | Express + tsx (Node 20) | **Render** | "Public Git Repository" — paste the repo URL |
| **agents** | `apps/agents` | FastAPI (Python 3.11) | **Render** | "Public Git Repository" — paste the repo URL |

> **The big win: deploy in `demo` mode and you need ZERO external accounts or API
> keys.** No Supabase, no Qwen, no UiPath, no GitHub OAuth. The agents use a local
> mock model + in-memory vector store, the gateway uses the local Admin fallback and
> the local UiPath Maestro simulator. Everything in `npm run demo` runs in the cloud
> the same way. Add real keys later only when you want `live` mode.

---

## Architecture & traffic

```
Browser ──HTTPS──▶ web (Vercel)
   │
   └──HTTPS + SSE──▶ gateway (Render)  ──HTTP──▶ agents (Render)
```

- The **browser** talks only to the **gateway** (REST + Server-Sent Events). It
  finds the gateway via the build-time env `NEXT_PUBLIC_GATEWAY_URL`.
- The **gateway** calls the **agents** runtime over HTTP via `AGENTS_URL`.
- The **gateway** restricts CORS to exactly `WEB_URL` (plus localhost), so that
  value must be your deployed Vercel URL.

This creates one ordering wrinkle (web URL ↔ gateway URL depend on each other).
The deploy order below handles it with one gateway redeploy at the end.

---

## Port wiring (important — read once)

Render injects a dynamic `$PORT` and expects each service to bind to it. Helmsman's
services read their own port vars, so the **start commands bridge `$PORT`**:

- gateway reads `GATEWAY_PORT` → start with `GATEWAY_PORT=$PORT npm run start`
- agents read `AGENTS_PORT`, and uvicorn takes `--port` → start with
  `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

These exact commands are in the steps below — you don't need to do anything extra.

---

## Step 1 — Deploy the agents runtime (Render)

1. Go to **render.com** → **New +** → **Web Service**.
2. Choose **"Public Git Repository"** and paste your public repo URL
   (e.g. `https://github.com/<you>/Helmsman`). Click **Continue**. *(No GitHub
   account connection or OAuth — Render just clones the public URL.)*
3. Configure:
   - **Name**: `helmsman-agents`
   - **Language / Runtime**: `Python 3`
   - **Root Directory**: `apps/agents`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: **Free**
4. **Environment Variables**:
   | Key | Value |
   |---|---|
   | `HELMSMAN_MODE` | `demo` |
   | `ADMIN_LOCAL_FALLBACK` | `true` |
   | `PYTHON_VERSION` | `3.11.9` |
5. **Create Web Service**. When it's live, copy the URL, e.g.
   `https://helmsman-agents.onrender.com`. Verify: open `…/health` (or `…/`) — you
   should get a JSON OK response.

---

## Step 2 — Deploy the gateway (Render)

1. **New +** → **Web Service** → **Public Git Repository** → same repo URL.
2. Configure:
   - **Name**: `helmsman-gateway`
   - **Language / Runtime**: `Node`
   - **Root Directory**: `apps/gateway`
   - **Build Command**: `npm install`
   - **Start Command**: `GATEWAY_PORT=$PORT npm run start`
   - **Instance Type**: **Free**
3. **Environment Variables**:
   | Key | Value |
   |---|---|
   | `HELMSMAN_MODE` | `demo` |
   | `NODE_ENV` | `production` |
   | `NODE_VERSION` | `20` |
   | `ADMIN_LOCAL_FALLBACK` | `true` |
   | `UIPATH_LOCAL_SIMULATOR` | `true` |
   | `AGENTS_URL` | the agents URL from Step 1 |
   | `WEB_URL` | `http://localhost:3000` *(placeholder — fixed in Step 4)* |
   | `GATEWAY_URL` | leave blank for now, or set after first deploy |
4. **Create Web Service**. Copy the URL, e.g.
   `https://helmsman-gateway.onrender.com`.

---

## Step 3 — Deploy the web app (Vercel CLI, no Git connection)

From your laptop, in the repo root:

```bash
npm i -g vercel            # once
cd apps/web
vercel login               # email / GitHub-less options available
# First deploy (creates the project, no Git integration):
vercel deploy --yes
# Set the gateway URL so the dashboard knows where to call:
vercel env add NEXT_PUBLIC_GATEWAY_URL production
#   → paste: https://helmsman-gateway.onrender.com   (your Step-2 URL)
# Build & ship to production:
vercel deploy --prod --yes
```

Vercel prints your production URL, e.g. `https://helmsman.vercel.app`. Because we
deploy from the local folder, **no GitHub repo is connected**.

> **Netlify instead?** From `apps/web`:
> ```bash
> npm i -g netlify-cli && netlify deploy --build
> # build command: next build   ·   publish dir: .next
> # then: netlify env:set NEXT_PUBLIC_GATEWAY_URL https://helmsman-gateway.onrender.com
> # netlify deploy --build --prod
> ```
> Add `@netlify/plugin-nextjs` (Netlify auto-detects Next 15) if prompted.

---

## Step 4 — Close the CORS loop (one gateway redeploy)

The gateway only accepts browser calls from `WEB_URL`. Now that you have the real
Vercel URL:

1. Render → `helmsman-gateway` → **Environment** → set
   `WEB_URL = https://helmsman.vercel.app` (your Step-3 URL, **no trailing slash**).
2. Optionally set `GATEWAY_URL` to the gateway's own URL.
3. **Manual Deploy → Deploy latest commit** (or just **Save** — Render redeploys on
   env change).

Open your Vercel URL → **Run pipeline**. The seven agents should stream live and
stop at the approval gate. 🎉

---

## Free-tier gotchas

- **Render free services sleep** after ~15 min idle and cold-start in ~50s. The
  first request after a nap is slow; the agents service may also cold-start when the
  gateway first calls it. Fine for demos — hit the gateway URL once to warm it before
  presenting. (Vercel has no cold-start for static/SSR.)
- **SSE over Render free**: streaming works, but a sleeping service won't stream
  until it wakes. Warm both Render services first.
- **No trailing slashes** on `WEB_URL` / `AGENTS_URL` / `GATEWAY_URL` — they're used
  for exact CORS origin matching and URL concatenation.
- **Region**: put both Render services in the same region to keep gateway→agents
  latency low.

---

## Optional: Render Blueprint (`render.yaml`)

A `render.yaml` is committed at the repo root so you can create **both Render
services at once** via **New + → Blueprint** (point it at the public repo URL). You
still set `WEB_URL` after the web deploy (Step 4) and deploy the web app via Vercel.

---

## Going `live` (later)

Demo mode needs nothing. To switch to real services, set `HELMSMAN_MODE=live` and
fill the relevant vars from [`.env.example`](../.env.example) on the **gateway** and
**agents** services:

- **Supabase** (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) — free
  Postgres + pgvector. Run the schema: `npm run db:schema`.
- **Qwen / Model Studio** (`QWEN_API_KEY`, `QWEN_BASE_URL`) — free during the
  hackathon; or the free fallback chain (`OPENROUTER_API_KEY`, `GROQ_API_KEY`).
- **Admin Service** (`ADMIN_URL`, `ADMIN_SERVICE_TOKEN`, `ADMIN_LOCAL_FALLBACK=false`).
- **UiPath** (`UIPATH_*`, `UIPATH_LOCAL_SIMULATOR=false`) for real Maestro Cases.
- **GitHub OAuth** (`GITHUB_CLIENT_ID/SECRET`) only if you want real repo connect +
  webhooks. Callback URL = `${GATEWAY_URL}/auth/github/callback`.

Each added integration is independent — add one at a time and redeploy.
```
