#!/usr/bin/env bash
# Helmsman — Alibaba Cloud ECS deployment script (satisfies the Qwen "deployed on
# Alibaba Cloud" requirement). Run ON the ECS instance after SSH'ing in.
#
#   curl -fsSL https://raw.githubusercontent.com/<you>/helmsman/main/deployment/deploy-alibaba.sh | bash
# or: git clone <repo> && cd helmsman && bash deployment/deploy-alibaba.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/<your-username>/helmsman.git}"
APP_DIR="${APP_DIR:-/opt/helmsman}"

echo "▸ installing system deps (Node 20, Python 3.11, nginx)…"
sudo apt-get update -y
sudo apt-get install -y curl git python3 python3-venv python3-pip nginx
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo npm i -g pm2

echo "▸ fetching Helmsman…"
sudo mkdir -p "$APP_DIR" && sudo chown "$USER" "$APP_DIR"
[ -d "$APP_DIR/.git" ] || git clone "$REPO_URL" "$APP_DIR"
cd "$APP_DIR" && git pull --ff-only || true

echo "▸ configuring env…"
[ -f .env ] || cp .env.example .env
# In production set HELMSMAN_MODE=live and fill QWEN_API_KEY, DATABASE_URL, etc.
sed -i 's/^NODE_ENV=.*/NODE_ENV=production/' .env || true

echo "▸ installing + building…"
npm run setup
npm --workspace apps/web run build

echo "▸ starting services with pm2…"
pm2 delete helmsman-agents helmsman-gateway helmsman-web 2>/dev/null || true
pm2 start "apps/agents/.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000" \
  --name helmsman-agents --cwd "$APP_DIR/apps/agents"
pm2 start "node --import tsx src/index.ts" --name helmsman-gateway --cwd "$APP_DIR/apps/gateway"
pm2 start "npm run start" --name helmsman-web --cwd "$APP_DIR/apps/web"
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1 | bash || true

echo "▸ nginx reverse proxy (80 → web 3000, /api & /webhooks & /auth & /demo → gateway 8080)…"
sudo tee /etc/nginx/sites-available/helmsman >/dev/null <<'NGINX'
server {
  listen 80 default_server;
  server_name _;
  location /api/      { proxy_pass http://127.0.0.1:8080; proxy_set_header Host $host; proxy_buffering off; }
  location /webhooks/ { proxy_pass http://127.0.0.1:8080; proxy_set_header Host $host; }
  location /auth/     { proxy_pass http://127.0.0.1:8080; proxy_set_header Host $host; }
  location /demo/     { proxy_pass http://127.0.0.1:8080; proxy_set_header Host $host; }
  location /health    { proxy_pass http://127.0.0.1:8080; }
  location /          { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/helmsman /etc/nginx/sites-enabled/helmsman
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo "✓ Helmsman deployed. Public URL: http://$(curl -s ifconfig.me)/"
echo "  verify: curl http://localhost/health"
pm2 status
