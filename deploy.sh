#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Super Agent v6.0 — Deployment Script
# Server: 2.56.240.170 (minimax.mksitdev.ru)
# ═══════════════════════════════════════════════════════════════
#
# Architecture:
#   Docker nginx (port 80/443) → static frontend files (bind mount)
#   Docker nginx → proxy /api/ → super-agent-api (port 3501)
#   Host nginx is DISABLED (masked) — do NOT enable it
#
# Usage:
#   ./deploy.sh              — deploy all (frontend + backend)
#   ./deploy.sh frontend     — deploy frontend only
#   ./deploy.sh backend      — deploy backend only
#   ./deploy.sh restart      — restart backend service only
#
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────
SERVER="root@2.56.240.170"
SERVER_IP="2.56.240.170"
SSH_PASS='WJljz4QdfW*Jfdf'
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
REMOTE_DIR="/var/www/super-agent"
DOCKER_NGINX="ai-dev-team-platform-nginx-1"

LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_FRONTEND="${LOCAL_DIR}/frontend"
LOCAL_BACKEND="${LOCAL_DIR}/backend"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

ssh_cmd() {
    sshpass -p "$SSH_PASS" ssh $SSH_OPTS "$SERVER" "$1"
}

scp_file() {
    sshpass -p "$SSH_PASS" scp $SSH_OPTS "$1" "${SERVER}:$2"
}

check_connection() {
    log_info "Checking SSH connection..."
    if ! ssh_cmd "echo ok" &>/dev/null; then
        log_error "Cannot connect to server $SERVER_IP"
        exit 1
    fi
    log_info "SSH connection OK"
}

# ── Deploy Frontend ───────────────────────────────────────────
deploy_frontend() {
    log_info "Deploying Frontend..."

    for f in index.html app.js style.css; do
        if [ ! -f "${LOCAL_FRONTEND}/$f" ]; then
            log_error "Missing file: ${LOCAL_FRONTEND}/$f"
            exit 1
        fi
    done

    ssh_cmd "
        BK=${REMOTE_DIR}/frontend/backup_\$(date +%Y%m%d_%H%M%S)
        mkdir -p \$BK
        cp ${REMOTE_DIR}/frontend/index.html ${REMOTE_DIR}/frontend/app.js ${REMOTE_DIR}/frontend/style.css \$BK/ 2>/dev/null || true
        cd ${REMOTE_DIR}/frontend && ls -dt backup_* 2>/dev/null | tail -n +6 | xargs rm -rf 2>/dev/null || true
    "

    scp_file "${LOCAL_FRONTEND}/index.html" "${REMOTE_DIR}/frontend/index.html"
    scp_file "${LOCAL_FRONTEND}/app.js"     "${REMOTE_DIR}/frontend/app.js"
    scp_file "${LOCAL_FRONTEND}/style.css"  "${REMOTE_DIR}/frontend/style.css"

    ssh_cmd "docker exec ${DOCKER_NGINX} nginx -s reload"
    log_info "Frontend deployed"
}

# ── Deploy Backend ────────────────────────────────────────────
deploy_backend() {
    log_info "Deploying Backend..."

    for f in app.py agent_loop.py; do
        if [ ! -f "${LOCAL_BACKEND}/$f" ]; then
            log_error "Missing file: ${LOCAL_BACKEND}/$f"
            exit 1
        fi
    done

    log_info "Validating Python syntax..."
    for f in app.py agent_loop.py; do
        if ! python3 -c "import ast; ast.parse(open('${LOCAL_BACKEND}/$f').read())" 2>/dev/null; then
            log_error "Syntax error in $f — aborting!"
            exit 1
        fi
    done

    ssh_cmd "
        BK=${REMOTE_DIR}/backend/backup_\$(date +%Y%m%d_%H%M%S)
        mkdir -p \$BK
        cp ${REMOTE_DIR}/backend/app.py ${REMOTE_DIR}/backend/agent_loop.py \$BK/ 2>/dev/null || true
        cd ${REMOTE_DIR}/backend && ls -dt backup_* 2>/dev/null | tail -n +6 | xargs rm -rf 2>/dev/null || true
    "

    scp_file "${LOCAL_BACKEND}/app.py"        "${REMOTE_DIR}/backend/app.py"
    scp_file "${LOCAL_BACKEND}/agent_loop.py" "${REMOTE_DIR}/backend/agent_loop.py"

    for f in file_generator.py database.py browser_agent.py; do
        if [ -f "${LOCAL_BACKEND}/$f" ]; then
            scp_file "${LOCAL_BACKEND}/$f" "${REMOTE_DIR}/backend/$f"
        fi
    done

    ssh_cmd "systemctl restart super-agent-api"
    sleep 2

    if ssh_cmd "systemctl is-active super-agent-api" | grep -q "active"; then
        log_info "Backend service is running"
    else
        log_error "Backend service failed! Check: journalctl -u super-agent-api -n 50"
        exit 1
    fi
    log_info "Backend deployed"
}

restart_backend() {
    log_info "Restarting Backend..."
    ssh_cmd "systemctl restart super-agent-api"
    sleep 2
    if ssh_cmd "systemctl is-active super-agent-api" | grep -q "active"; then
        log_info "Backend restarted OK"
    else
        log_error "Backend failed to start!"
        exit 1
    fi
}

health_check() {
    log_info "Running health check..."
    HTTP_FE=$(curl -sk -o /dev/null -w "%{http_code}" "https://minimax.mksitdev.ru/" 2>/dev/null)
    HTTP_API=$(curl -sk -o /dev/null -w "%{http_code}" "https://minimax.mksitdev.ru/api/health" 2>/dev/null)
    SVC=$(ssh_cmd "systemctl is-active super-agent-api" 2>/dev/null)

    [ "$HTTP_FE"  = "200"    ] && log_info "Frontend: OK" || log_warn "Frontend: HTTP $HTTP_FE"
    [ "$HTTP_API" = "200"    ] && log_info "API: OK"      || log_warn "API: HTTP $HTTP_API"
    [ "$SVC"      = "active" ] && log_info "Service: OK"  || log_warn "Service: $SVC"
}

# ── Main ──────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════"
echo "  Super Agent v6.0 — Deployment"
echo "  Server: ${SERVER_IP} (minimax.mksitdev.ru)"
echo "═══════════════════════════════════════════════════"

check_connection

case "${1:-all}" in
    frontend) deploy_frontend ;;
    backend)  deploy_backend  ;;
    restart)  restart_backend ;;
    all)      deploy_frontend; deploy_backend ;;
    *)        log_error "Usage: $0 [all|frontend|backend|restart]"; exit 1 ;;
esac

echo ""
health_check
echo ""
log_info "Done! https://minimax.mksitdev.ru"
