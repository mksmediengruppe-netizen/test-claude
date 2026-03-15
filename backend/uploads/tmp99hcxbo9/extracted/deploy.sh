#!/bin/bash
# Super Agent v4.0 — Deploy Script
# Deploys to server 2.56.240.170

set -e

SERVER="root@2.56.240.170"
SSHPASS_CMD="sshpass -p 'WJljz4QdfW*Jfdf'"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
REMOTE_DIR="/var/www/super-agent"

echo "═══════════════════════════════════════════"
echo "  Super Agent v4.0 — Deployment"
echo "═══════════════════════════════════════════"

# Step 1: Create directory structure on server
echo "[1/6] Creating directory structure..."
$SSHPASS_CMD ssh $SSH_OPTS $SERVER "
    mkdir -p $REMOTE_DIR/backend/data
    mkdir -p $REMOTE_DIR/backend/uploads
    mkdir -p $REMOTE_DIR/frontend
"

# Step 2: Copy backend files
echo "[2/6] Copying backend files..."
$SSHPASS_CMD scp $SSH_OPTS /home/ubuntu/super-agent/backend/app.py $SERVER:$REMOTE_DIR/backend/
$SSHPASS_CMD scp $SSH_OPTS /home/ubuntu/super-agent/backend/wsgi.py $SERVER:$REMOTE_DIR/backend/
$SSHPASS_CMD scp $SSH_OPTS /home/ubuntu/super-agent/backend/requirements.txt $SERVER:$REMOTE_DIR/backend/

# Step 3: Copy frontend files
echo "[3/6] Copying frontend files..."
$SSHPASS_CMD scp $SSH_OPTS /home/ubuntu/super-agent/frontend/index.html $SERVER:$REMOTE_DIR/frontend/
$SSHPASS_CMD scp $SSH_OPTS /home/ubuntu/super-agent/frontend/style.css $SERVER:$REMOTE_DIR/frontend/
$SSHPASS_CMD scp $SSH_OPTS /home/ubuntu/super-agent/frontend/app.js $SERVER:$REMOTE_DIR/frontend/

# Step 4: Copy nginx config
echo "[4/6] Copying nginx config..."
$SSHPASS_CMD scp $SSH_OPTS /home/ubuntu/super-agent/nginx-super-agent.conf $SERVER:/etc/nginx/sites-available/minimax.mksitdev.ru

# Step 5: Setup Python venv and install deps
echo "[5/6] Setting up Python environment..."
$SSHPASS_CMD ssh $SSH_OPTS $SERVER "
    cd $REMOTE_DIR/backend
    
    # Create venv if not exists
    if [ ! -d venv ]; then
        python3 -m venv venv
    fi
    
    # Install dependencies
    $REMOTE_DIR/backend/venv/bin/pip install -r requirements.txt
    
    # Set permissions
    chmod -R 755 $REMOTE_DIR
"

# Step 6: Copy and enable systemd service, restart everything
echo "[6/6] Configuring services..."
$SSHPASS_CMD scp $SSH_OPTS /home/ubuntu/super-agent/backend/super-agent-api.service $SERVER:/etc/systemd/system/

$SSHPASS_CMD ssh $SSH_OPTS $SERVER "
    # Enable nginx site
    ln -sf /etc/nginx/sites-available/minimax.mksitdev.ru /etc/nginx/sites-enabled/
    
    # Test nginx config
    nginx -t
    
    # Reload systemd
    systemctl daemon-reload
    
    # Restart services
    systemctl enable super-agent-api
    systemctl restart super-agent-api
    systemctl reload nginx
    
    echo 'Deployment complete!'
    echo 'Backend status:'
    systemctl status super-agent-api --no-pager -l || true
"

echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ Deployment Complete!"
echo "  URL: http://minimax.mksitdev.ru"
echo "  API: http://minimax.mksitdev.ru/api/health"
echo "═══════════════════════════════════════════"
