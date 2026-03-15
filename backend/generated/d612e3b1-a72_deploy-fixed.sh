#!/bin/bash
# Super Agent v6.0 — Deploy Script (FIXED)
# Deploys to server 2.56.240.170

set -e

# Configuration
SERVER="root@2.56.240.170"
SSHPASS_CMD="sshpass -p '${DEPLOY_PASSWORD}'"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
REMOTE_DIR="/var/www/super-agent"
BACKUP_DIR="/var/www/backups/super-agent-backup-$(date +%Y%m%d-%H%M%S)"
LOG_FILE="/var/log/super-agent/deploy-$(date +%Y%m%d-%H%M%S).log"

# Create log directory
mkdir -p /var/log/super-agent

# Redirect all output to log file
exec > >(tee -a "$LOG_FILE")
exec 2>&1

echo "═══════════════════════════════════════════"
echo "  Super Agent v6.0 — Deployment"
echo "═══════════════════════════════════════════"
echo "Started at: $(date)"

# Rollback function
rollback() {
    echo "❌ Deployment failed! Rolling back..."
    $SSHPASS_CMD ssh $SSH_OPTS $SERVER "
        if [ -d $BACKUP_DIR ]; then
            rm -rf $REMOTE_DIR
            mv $BACKUP_DIR $REMOTE_DIR
            systemctl restart super-agent-api
            echo 'Rollback completed'
        else
            echo 'No backup found, cannot rollback'
        fi
    "
}

# Set trap for rollback on error
trap rollback ERR

# Step 0: Create backup
echo "[0/7] Creating backup..."
$SSHPASS_CMD ssh $SSH_OPTS $SERVER "
    if [ -d $REMOTE_DIR ]; then
        mkdir -p /var/www/backups
        cp -r $REMOTE_DIR $BACKUP_DIR
        echo 'Backup created: $BACKUP_DIR'
    else
        echo 'No existing installation, skipping backup'
    fi
"

# Step 1: Create directory structure on server
echo "[1/7] Creating directory structure..."
$SSHPASS_CMD ssh $SSH_OPTS $SERVER "
    mkdir -p $REMOTE_DIR/backend/data || exit 1
    mkdir -p $REMOTE_DIR/backend/uploads || exit 1
    mkdir -p $REMOTE_DIR/frontend || exit 1
    echo 'Directories created successfully'
"

# Step 2: Copy backend files
echo "[2/7] Copying backend files..."
for file in app.py wsgi.py requirements.txt; do
    if [ ! -f "/home/ubuntu/super-agent/backend/$file" ]; then
        echo "❌ Error: /home/ubuntu/super-agent/backend/$file not found!"
        exit 1
    fi
    $SSHPASS_CMD scp $SSH_OPTS /home/ubuntu/super-agent/backend/$file $SERVER:$REMOTE_DIR/backend/
done
echo "Backend files copied successfully"

# Step 3: Copy frontend files
echo "[3/7] Copying frontend files..."
for file in index.html style.css app.js; do
    if [ ! -f "/home/ubuntu/super-agent/frontend/$file" ]; then
        echo "❌ Error: /home/ubuntu/super-agent/frontend/$file not found!"
        exit 1
    fi
    $SSHPASS_CMD scp $SSH_OPTS /home/ubuntu/super-agent/frontend/$file $SERVER:$REMOTE_DIR/frontend/
done
echo "Frontend files copied successfully"

# Step 4: Copy nginx config
echo "[4/7] Copying nginx config..."
if [ ! -f "/home/ubuntu/super-agent/nginx-super-agent.conf" ]; then
    echo "❌ Error: nginx-super-agent.conf not found!"
    exit 1
fi
$SSHPASS_CMD scp $SSH_OPTS /home/ubuntu/super-agent/nginx-super-agent.conf $SERVER:/etc/nginx/sites-available/minimax.mksitdev.ru

# Test nginx config
if ! $SSHPASS_CMD ssh $SSH_OPTS $SERVER "nginx -t"; then
    echo "❌ Nginx configuration test failed!"
    exit 1
fi
echo "Nginx config validated successfully"

# Step 5: Setup Python venv and install deps
echo "[5/7] Setting up Python environment..."
$SSHPASS_CMD ssh $SSH_OPTS $SERVER "
    cd $REMOTE_DIR/backend
    
    # Create venv if not exists
    if [ ! -d venv ]; then
        python3 -m venv venv
    fi
    
    # Install dependencies
    ./venv/bin/pip install -r requirements.txt
    
    # Set permissions
    chmod -R 755 $REMOTE_DIR
    
    echo 'Python environment setup completed'
"

# Step 6: Copy and enable systemd service
echo "[6/7] Configuring services..."
if [ ! -f "/home/ubuntu/super-agent/backend/super-agent-api.service" ]; then
    echo "❌ Error: super-agent-api.service not found!"
    exit 1
fi
$SSHPASS_CMD scp $SSH_OPTS /home/ubuntu/super-agent/backend/super-agent-api.service $SERVER:/etc/systemd/system/

$SSHPASS_CMD ssh $SSH_OPTS $SERVER "
    # Enable nginx site
    ln -sf /etc/nginx/sites-available/minimax.mksitdev.ru /etc/nginx/sites-enabled/
    
    # Reload systemd
    systemctl daemon-reload
    
    # Enable and restart services
    systemctl enable super-agent-api
    systemctl restart super-agent-api
    systemctl reload nginx
    
    echo 'Services restarted'
"

# Step 7: Health checks
echo "[7/7] Performing health checks..."
sleep 10

# Check backend health
HEALTH=$(curl -sf http://localhost:3501/api/health || echo "FAILED")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo "✅ Backend health check passed"
else
    echo "❌ Backend health check failed"
    echo "Response: $HEALTH"
    $SSHPASS_CMD ssh $SSH_OPTS $SERVER "systemctl status super-agent-api --no-pager -l"
    exit 1
fi

# Check frontend
HTTP_CODE=$(curl -sf -o /dev/null -w '%{http_code}' http://localhost/ || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Frontend loads OK (HTTP $HTTP_CODE)"
else
    echo "❌ Frontend failed (HTTP $HTTP_CODE)"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ Deployment Complete!"
echo "  URL: http://minimax.mksitdev.ru"
echo "  API: http://minimax.mksitdev.ru/api/health"
echo "  Log: $LOG_FILE"
echo "  Backup: $BACKUP_DIR"
echo "═══════════════════════════════════════════"
echo "Completed at: $(date)"
