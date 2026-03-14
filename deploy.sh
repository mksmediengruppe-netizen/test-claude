#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  Super Agent v6.0 — Deploy Script
#
#  Server:   root@2.56.240.170
#  Frontend: /var/www/super-agent/frontend/  ← nginx root для minimax.mksitdev.ru
#  Backend:  /var/www/super-agent/backend/   ← systemd: super-agent-api
#  Site:     https://minimax.mksitdev.ru
# ═══════════════════════════════════════════════════════════

set -e

SERVER="root@2.56.240.170"
PASS="WJljz4QdfW*Jfdf"
REMOTE_DIR="/var/www/super-agent"
SERVICE="super-agent-api"

echo "═══════════════════════════════════════════"
echo "  Super Agent v6.0 — Deployment"
echo "═══════════════════════════════════════════"

# Step 1: Deploy frontend
echo "[1/3] Deploying frontend..."
sshpass -p "$PASS" scp -o StrictHostKeyChecking=no \
  frontend/app.js frontend/index.html frontend/style.css \
  "$SERVER:$REMOTE_DIR/frontend/"

# Step 2: Deploy backend
echo "[2/3] Deploying backend..."
sshpass -p "$PASS" scp -o StrictHostKeyChecking=no \
  backend/app.py \
  "$SERVER:$REMOTE_DIR/backend/"

# Step 3: Restart backend service
echo "[3/3] Restarting $SERVICE..."
sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no "$SERVER" \
  "systemctl restart $SERVICE && sleep 2 && systemctl is-active $SERVICE && echo 'Service OK'"

echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ Deploy complete!"
echo "  URL: https://minimax.mksitdev.ru"
echo "═══════════════════════════════════════════"
