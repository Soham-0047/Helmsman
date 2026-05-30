# Alibaba Cloud Deployment Proof

> Qwen / Global AI Hackathon requires the backend to be **deployed on Alibaba
> Cloud** with a short recording proving it. This file is the runbook + the
> evidence checklist. Fill the `‹…›` placeholders after you provision the ECS
> instance; capture the listed screenshots for the 3-minute Qwen video.

## ECS instance

| Field | Value |
|---|---|
| Provider | Alibaba Cloud Elastic Compute Service (ECS) |
| Instance type | `ecs.t6-c1m2.large` (2 vCPU / 2 GiB) — free-tier eligible |
| Region | `ap-southeast-1` (Singapore) ‹or your free-tier region› |
| Image | Ubuntu 22.04 LTS 64-bit |
| Public IP | ‹fill after launch, e.g. 47.250.x.x› |
| Security group | inbound 22 (SSH), 80 (HTTP), 443 (HTTPS) |
| Model access | Qwen via Alibaba Cloud **Model Studio** (DashScope) — same cloud, OpenAI-compatible endpoint |

The agent runtime calls Qwen models through Model Studio's compatible endpoint
(`QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1`), so both
**compute and models run on Alibaba Cloud**.

## Deploy

```bash
ssh root@‹PUBLIC_IP›
export REPO_URL=https://github.com/‹you›/helmsman.git
curl -fsSL "$REPO_URL/raw/main/deployment/deploy-alibaba.sh" | REPO_URL="$REPO_URL" bash
# the script installs Node 20 + Python 3.11 + nginx, runs `npm run setup`,
# starts all three services under pm2, and wires the nginx reverse proxy.
```

For a real (non-demo) deployment, before the build set in `/opt/helmsman/.env`:

```dotenv
HELMSMAN_MODE=live
NODE_ENV=production
QWEN_API_KEY=‹Model Studio API key›
DATABASE_URL=‹Supabase Postgres URL›
ADMIN_URL=‹your Admin Service URL›
ADMIN_SERVICE_TOKEN=‹…›
ADMIN_LOCAL_FALLBACK=false
GITHUB_CLIENT_ID=‹…›
GITHUB_CLIENT_SECRET=‹…›
GITHUB_WEBHOOK_SECRET=‹…›
TOKEN_ENCRYPTION_KEY=‹openssl rand -hex 32›
```

## Verify (run these on the box and on the video)

```bash
# 1) all three services healthy
curl -s http://localhost/health | jq           # gateway → reports runtime + maestro mode
curl -s http://localhost:8000/health | jq       # FastAPI agent runtime (Qwen providers listed)

# 2) the seven-agent pipeline fires against a fixture, end-to-end, on the server
curl -s -X POST "http://localhost/demo/run?wait=1" \
  -H 'Content-Type: application/json' -d '{"fixtureId":"fix-001"}' | jq '.case | {stage:.current_stage, classification, priority_score, draft:.draft_response}'

# 3) prove Qwen is actually being called (live mode): the runtime health shows
#    providers: ["qwen(qwen-primary)"] and remote_llm: true
curl -s http://localhost:8000/health | jq '.providers, .remote_llm'

# 4) pm2 shows all three processes online
pm2 status
```

Expected `/demo/run` result: stage `Pending Approval`, classification `bug`,
a drafted reply — produced by the seven agents running on the ECS box.

## Evidence checklist (capture for the Qwen 3-min video)

- [ ] Alibaba Cloud ECS console showing the running instance + public IP
- [ ] `curl http://localhost/health` output (gateway + runtime healthy)
- [ ] `/health` on the runtime showing `providers: ["qwen(...)"]`, `remote_llm: true`
- [ ] `pm2 status` with `helmsman-agents`, `helmsman-gateway`, `helmsman-web` online
- [ ] Browser at `http://‹PUBLIC_IP›/dashboard` running a live pipeline
- [ ] Model Studio console showing API usage from the demo run
- [ ] 15-second clip of the **Admin Service** dashboard — "every prompt and
      provider Helmsman uses is versioned and routed here" (the platform-layer moment)

## Fly.io fallback (if ECS free-tier limits bite during the demo)

```bash
fly launch --no-deploy   # generates fly.toml
fly secrets set QWEN_API_KEY=… DATABASE_URL=… HELMSMAN_MODE=live
fly deploy
```

The same three-process layout runs on a single Fly machine; point `WEB_URL` /
`GATEWAY_URL` at the `*.fly.dev` host. Alibaba ECS remains the primary, video-of-record deployment.
