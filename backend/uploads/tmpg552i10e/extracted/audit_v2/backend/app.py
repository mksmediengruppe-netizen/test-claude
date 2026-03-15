"""
Super Agent v5.0 — Backend API Server
Автономный AI-инженер с мультиагентной системой, SSH executor,
browser agent, долговременной памятью, file versioning, rate limiting,
contracts validation, self-healing 2.0, LangGraph StateGraph.
"""

import os
import sys
import json
import time
import uuid
import hashlib
import secrets
import threading
import zipfile
import tarfile
import tempfile
import mimetypes
import re
from datetime import datetime, timezone
from functools import wraps
from flask import Flask, request, jsonify, Response, stream_with_context
import requests as http_requests

# Add backend dir to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agent_loop import AgentLoop, MultiAgentLoop
from ssh_executor import SSHExecutor, ssh_pool
from browser_agent import BrowserAgent
from memory import get_memory, MemoryEntry, MemoryType
from file_versioning import get_version_store
from rate_limiter import get_rate_limiter, ToolContracts

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max

# ── Configuration ──────────────────────────────────────────────
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions"

DATA_DIR = os.environ.get("DATA_DIR", "/var/www/super-agent/backend/data")
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/var/www/super-agent/backend/uploads")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

DB_FILE = os.path.join(DATA_DIR, "database.json")
_lock = threading.Lock()

# Active agent loops (for stop functionality)
_active_agents = {}
_agents_lock = threading.Lock()

# Singletons for new modules
_vector_memory = None
_version_store = None
_rate_limiter = None

def _get_memory():
    global _vector_memory
    if _vector_memory is None:
        _vector_memory = get_memory()
    return _vector_memory

def _get_versions():
    global _version_store
    if _version_store is None:
        _version_store = get_version_store()
    return _version_store

def _get_rate_limiter():
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = get_rate_limiter()
    return _rate_limiter

# ── Model Configurations ──────────────────────────────────────
MODEL_CONFIGS = {
    "original": {
        "name": "Оригинал",
        "emoji": "🔴",
        "coding": {"model": "x-ai/grok-code-fast-1", "name": "Grok Code Fast 1", "input_price": 0.20, "output_price": 1.50},
        "planner": {"model": "anthropic/claude-sonnet-4", "name": "Claude Sonnet 4.5", "input_price": 3.00, "output_price": 15.00},
        "tools": {"model": "z-ai/glm-4.6", "name": "GLM 4.6", "input_price": 0.35, "output_price": 1.50},
        "quality": 72.1,
        "monthly_cost": "$2,200"
    },
    "premium": {
        "name": "Премиум",
        "emoji": "🟢",
        "coding": {"model": "minimax/minimax-m2.5", "name": "MiniMax M2.5", "input_price": 0.27, "output_price": 0.95},
        "planner": {"model": "anthropic/claude-sonnet-4", "name": "Claude Sonnet 4.5", "input_price": 3.00, "output_price": 15.00},
        "tools": {"model": "z-ai/glm-4.6", "name": "GLM 4.6", "input_price": 0.35, "output_price": 1.50},
        "quality": 80.2,
        "monthly_cost": "$1,750"
    },
    "budget": {
        "name": "Бюджет",
        "emoji": "🔵",
        "coding": {"model": "deepseek/deepseek-v3.2", "name": "DeepSeek V3.2", "input_price": 0.26, "output_price": 0.38},
        "planner": {"model": "deepseek/deepseek-r1", "name": "DeepSeek R1", "input_price": 0.40, "output_price": 1.75},
        "tools": {"model": "z-ai/glm-4.6", "name": "GLM 4.6", "input_price": 0.35, "output_price": 1.50},
        "quality": 75.8,
        "monthly_cost": "$750"
    }
}

CHAT_MODELS = {
    "qwen3": {"model": "qwen/qwen3-235b-a22b", "name": "Qwen3 235B", "lang": "RU ⭐⭐⭐⭐⭐", "input_price": 0.10, "output_price": 0.60},
    "deepseek": {"model": "deepseek/deepseek-v3.2", "name": "DeepSeek V3.2", "lang": "RU ⭐⭐⭐⭐⭐", "input_price": 0.26, "output_price": 0.38},
    "gpt5nano": {"model": "openai/gpt-4.1-nano", "name": "GPT-5 Nano", "lang": "RU ⭐⭐⭐⭐", "input_price": 0.05, "output_price": 0.40},
}

# ── File processing constants ─────────────────────────────────
TEXT_EXTENSIONS = {
    '.py', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.scss', '.less',
    '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
    '.md', '.txt', '.rst', '.csv', '.tsv', '.log',
    '.sh', '.bash', '.zsh', '.bat', '.cmd', '.ps1',
    '.sql', '.graphql', '.gql',
    '.java', '.kt', '.scala', '.groovy',
    '.c', '.cpp', '.h', '.hpp', '.cs',
    '.go', '.rs', '.rb', '.php', '.pl', '.pm',
    '.swift', '.m', '.mm', '.r', '.R', '.jl',
    '.lua', '.vim', '.el',
    '.dockerfile', '.dockerignore', '.gitignore', '.env', '.env.example',
    '.vue', '.svelte', '.astro', '.tf', '.hcl',
    '.proto', '.thrift', '.makefile', '.cmake', '.lock', '.sum',
}

SKIP_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp',
    '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.exe', '.dll', '.so', '.dylib', '.bin',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.pyc', '.pyo', '.class', '.o', '.obj',
    '.db', '.sqlite', '.sqlite3',
}

SKIP_DIRS = {
    'node_modules', '.git', '__pycache__', '.venv', 'venv',
    'dist', 'build', '.next', '.nuxt', 'vendor',
    '.idea', '.vscode', '.DS_Store',
}


# ── Database Layer ─────────────────────────────────────────────
def _load_db():
    """Load entire database from JSON file."""
    try:
        with open(DB_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {
            "users": {
                "admin": {
                    "id": "admin",
                    "email": "ym@mksmedia.ru",
                    "password_hash": hashlib.sha256("qwerty1985".encode()).hexdigest(),
                    "name": "Администратор",
                    "role": "admin",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "is_active": True,
                    "monthly_limit": 999999,
                    "total_spent": 0.0,
                    "settings": {
                        "variant": "premium",
                        "chat_model": "qwen3",
                        "enhanced_mode": False,
                        "design_pro": False,
                        "language": "ru"
                    }
                }
            },
            "sessions": {},
            "chats": {},
            "ssh_servers": {},
            "analytics": {
                "total_requests": 0,
                "total_tokens_in": 0,
                "total_tokens_out": 0,
                "total_cost": 0.0,
                "daily_stats": {}
            },
            "memory": {
                "episodic": [],
                "semantic": {},
                "procedural": {}
            }
        }


def _save_db(db):
    """Save database atomically."""
    tmp = DB_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    os.replace(tmp, DB_FILE)


def db_read():
    with _lock:
        return _load_db()


def db_write(db):
    with _lock:
        _save_db(db)


# ── Authentication ─────────────────────────────────────────────
def require_auth(f):
    """Decorator to require valid session token."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        if not token:
            token = request.cookies.get("session_token", "")
        if not token:
            return jsonify({"error": "Unauthorized"}), 401
        db = db_read()
        session = db["sessions"].get(token)
        if not session:
            return jsonify({"error": "Invalid session"}), 401
        if time.time() > session.get("expires_at", 0):
            del db["sessions"][token]
            db_write(db)
            return jsonify({"error": "Session expired"}), 401
        request.user_id = session["user_id"]
        request.user = db["users"].get(session["user_id"], {})
        return f(*args, **kwargs)
    return decorated


def require_admin(f):
    """Decorator to require admin role."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403
        return f(*args, **kwargs)
    return decorated


@app.route("/api/auth/login", methods=["POST"])
def login():
    """Authenticate user and return session token."""
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    db = db_read()
    password_hash = hashlib.sha256(password.encode()).hexdigest()

    user = None
    user_id = None
    for uid, u in db["users"].items():
        if u["email"].lower() == email and u["password_hash"] == password_hash:
            user = u
            user_id = uid
            break

    if not user:
        return jsonify({"error": "Invalid credentials"}), 401

    if not user.get("is_active", True):
        return jsonify({"error": "Account is blocked"}), 403

    token = secrets.token_hex(32)
    db["sessions"][token] = {
        "user_id": user_id,
        "created_at": time.time(),
        "expires_at": time.time() + 86400 * 7  # 7 days
    }
    db_write(db)

    return jsonify({
        "token": token,
        "user": {
            "id": user_id,
            "email": user["email"],
            "name": user["name"],
            "role": user.get("role", "user"),
            "settings": user.get("settings", {})
        }
    })


@app.route("/api/auth/logout", methods=["POST"])
@require_auth
def logout():
    """Invalidate session."""
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    db = db_read()
    db["sessions"].pop(token, None)
    db_write(db)
    return jsonify({"ok": True})


@app.route("/api/auth/me", methods=["GET"])
@require_auth
def get_me():
    """Get current user info."""
    user = request.user
    return jsonify({
        "id": request.user_id,
        "email": user["email"],
        "name": user["name"],
        "role": user.get("role", "user"),
        "settings": user.get("settings", {}),
        "total_spent": user.get("total_spent", 0.0),
        "monthly_limit": user.get("monthly_limit", 999999)
    })


# ── Settings ───────────────────────────────────────────────────
@app.route("/api/settings", methods=["GET"])
@require_auth
def get_settings():
    """Get user settings and available configurations."""
    user = request.user
    return jsonify({
        "settings": user.get("settings", {}),
        "model_configs": {
            k: {
                "name": v["name"],
                "emoji": v["emoji"],
                "coding_model": v["coding"]["name"],
                "quality": v["quality"],
                "monthly_cost": v["monthly_cost"]
            } for k, v in MODEL_CONFIGS.items()
        },
        "chat_models": {
            k: {
                "name": v["name"],
                "lang": v["lang"]
            } for k, v in CHAT_MODELS.items()
        }
    })


@app.route("/api/settings", methods=["PUT"])
@require_auth
def update_settings():
    """Update user settings."""
    data = request.get_json() or {}
    db = db_read()
    user = db["users"].get(request.user_id, {})

    allowed_keys = {"variant", "chat_model", "enhanced_mode", "design_pro", "language",
                    "ssh_host", "ssh_user", "ssh_password", "github_token", "n8n_url", "n8n_api_key"}

    settings = user.get("settings", {})
    for key in allowed_keys:
        if key in data:
            settings[key] = data[key]

    user["settings"] = settings
    db["users"][request.user_id] = user
    db_write(db)

    return jsonify({"ok": True, "settings": settings})


# ── SSH Server Management ──────────────────────────────────────
@app.route("/api/ssh/servers", methods=["GET"])
@require_auth
def list_ssh_servers():
    """List saved SSH servers for current user."""
    db = db_read()
    servers = db.get("ssh_servers", {})
    user_servers = {k: v for k, v in servers.items() if v.get("user_id") == request.user_id}
    # Hide passwords in response
    safe_servers = {}
    for k, v in user_servers.items():
        safe_servers[k] = {**v, "password": "***" if v.get("password") else None}
    return jsonify({"servers": safe_servers})


@app.route("/api/ssh/servers", methods=["POST"])
@require_auth
def add_ssh_server():
    """Add a new SSH server."""
    data = request.get_json() or {}
    server_id = str(uuid.uuid4())[:8]

    db = db_read()
    if "ssh_servers" not in db:
        db["ssh_servers"] = {}

    db["ssh_servers"][server_id] = {
        "id": server_id,
        "user_id": request.user_id,
        "name": data.get("name", data.get("host", "Server")),
        "host": data.get("host", ""),
        "port": data.get("port", 22),
        "username": data.get("username", "root"),
        "password": data.get("password", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    db_write(db)
    return jsonify({"ok": True, "server_id": server_id}), 201


@app.route("/api/ssh/servers/<server_id>", methods=["DELETE"])
@require_auth
def delete_ssh_server(server_id):
    """Delete an SSH server."""
    db = db_read()
    servers = db.get("ssh_servers", {})
    if server_id in servers and servers[server_id].get("user_id") == request.user_id:
        del servers[server_id]
        db["ssh_servers"] = servers
        db_write(db)
        return jsonify({"ok": True})
    return jsonify({"error": "Server not found"}), 404


@app.route("/api/ssh/test", methods=["POST"])
@require_auth
def test_ssh_connection():
    """Test SSH connection to a server."""
    data = request.get_json() or {}
    host = data.get("host", "")
    username = data.get("username", "root")
    password = data.get("password", "")
    port = data.get("port", 22)

    if not host:
        return jsonify({"error": "Host is required"}), 400

    try:
        ssh = SSHExecutor(host=host, username=username, password=password, port=port, timeout=10)
        result = ssh.connect()
        if result["success"]:
            # Get server info
            info = ssh.execute_command("uname -a && hostname && uptime")
            ssh.disconnect()
            return jsonify({
                "success": True,
                "message": f"Connected to {host}",
                "server_info": info.get("stdout", "")
            })
        else:
            return jsonify({"success": False, "error": result.get("error", "Connection failed")})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


# ── Chats ──────────────────────────────────────────────────────
@app.route("/api/chats", methods=["GET"])
@require_auth
def list_chats():
    """List all chats for current user."""
    db = db_read()
    user_chats = []
    for chat_id, chat in db["chats"].items():
        if chat.get("user_id") == request.user_id:
            user_chats.append({
                "id": chat_id,
                "title": chat.get("title", "Новый чат"),
                "created_at": chat.get("created_at", ""),
                "updated_at": chat.get("updated_at", ""),
                "message_count": len(chat.get("messages", [])),
                "total_cost": chat.get("total_cost", 0.0),
                "model_used": chat.get("model_used", ""),
                "variant": chat.get("variant", "premium")
            })

    user_chats.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return jsonify({"chats": user_chats})


@app.route("/api/chats", methods=["POST"])
@require_auth
def create_chat():
    """Create a new chat."""
    data = request.get_json() or {}
    chat_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()

    db = db_read()
    user_settings = db["users"].get(request.user_id, {}).get("settings", {})

    chat = {
        "id": chat_id,
        "user_id": request.user_id,
        "title": data.get("title", "Новый чат"),
        "created_at": now,
        "updated_at": now,
        "messages": [],
        "total_cost": 0.0,
        "total_tokens_in": 0,
        "total_tokens_out": 0,
        "variant": user_settings.get("variant", "premium"),
        "model_used": "",
        "files": [],
        "agent_actions": []
    }

    db["chats"][chat_id] = chat
    db_write(db)

    return jsonify({"chat": chat}), 201


@app.route("/api/chats/<chat_id>", methods=["GET"])
@require_auth
def get_chat(chat_id):
    """Get chat with all messages."""
    db = db_read()
    chat = db["chats"].get(chat_id)
    if not chat or chat.get("user_id") != request.user_id:
        if request.user.get("role") != "admin":
            return jsonify({"error": "Chat not found"}), 404
    return jsonify({"chat": chat})


@app.route("/api/chats/<chat_id>", methods=["DELETE"])
@require_auth
def delete_chat(chat_id):
    """Delete a chat."""
    db = db_read()
    chat = db["chats"].get(chat_id)
    if not chat:
        return jsonify({"error": "Chat not found"}), 404
    if chat.get("user_id") != request.user_id and request.user.get("role") != "admin":
        return jsonify({"error": "Access denied"}), 403

    del db["chats"][chat_id]
    db_write(db)
    return jsonify({"ok": True})


@app.route("/api/chats/<chat_id>/rename", methods=["PUT"])
@require_auth
def rename_chat(chat_id):
    """Rename a chat."""
    data = request.get_json() or {}
    db = db_read()
    chat = db["chats"].get(chat_id)
    if not chat or chat.get("user_id") != request.user_id:
        return jsonify({"error": "Chat not found"}), 404

    chat["title"] = data.get("title", chat["title"])
    chat["updated_at"] = datetime.now(timezone.utc).isoformat()
    db["chats"][chat_id] = chat
    db_write(db)
    return jsonify({"ok": True})


# ── File Upload ────────────────────────────────────────────────
def is_text_file(filename):
    name_lower = filename.lower()
    _, ext = os.path.splitext(name_lower)
    if ext in TEXT_EXTENSIONS:
        return True
    if ext in SKIP_EXTENSIONS:
        return False
    basename = os.path.basename(name_lower)
    text_names = {
        'makefile', 'dockerfile', 'vagrantfile', 'gemfile', 'rakefile',
        'procfile', 'readme', 'license', 'changelog', 'authors',
    }
    return basename in text_names or not ext


def read_file_content(filepath, max_size=100000):
    try:
        size = os.path.getsize(filepath)
        if size > max_size:
            with open(filepath, 'r', errors='replace') as f:
                return f"[File too large: {size} bytes, first {max_size} bytes]\n" + f.read(max_size)
        with open(filepath, 'r', errors='replace') as f:
            content = f.read()
        if '\x00' in content[:1000]:
            return None
        return content
    except Exception:
        return None


def process_directory(dirpath, base_path=""):
    result = []
    file_count = 0
    max_files = 50
    max_total_chars = 200000
    total_chars = 0

    for root, dirs, files in os.walk(dirpath):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        dirs.sort()
        files.sort()

        for fname in files:
            if file_count >= max_files:
                result.append(f"\n... [{file_count}+ files, showing first {max_files}]")
                return result, file_count

            fpath = os.path.join(root, fname)
            rel_path = os.path.relpath(fpath, dirpath)
            if base_path:
                rel_path = os.path.join(base_path, rel_path)

            if is_text_file(fname):
                content = read_file_content(fpath)
                if content is not None:
                    if total_chars + len(content) > max_total_chars:
                        remaining = max_total_chars - total_chars
                        if remaining > 500:
                            content = content[:remaining] + "\n... [truncated]"
                        else:
                            result.append(f"\n... [Content limit reached at {file_count} files]")
                            return result, file_count
                    _, ext = os.path.splitext(fname)
                    lang = ext.lstrip('.') if ext else 'text'
                    result.append(f"\n### File: `{rel_path}`\n```{lang}\n{content}\n```")
                    total_chars += len(content)
                    file_count += 1

    return result, file_count


def process_uploaded_file(file_storage):
    filename = file_storage.filename or "unknown"
    _, ext = os.path.splitext(filename.lower())

    tmp_dir = tempfile.mkdtemp(dir=UPLOAD_DIR)
    filepath = os.path.join(tmp_dir, filename)
    file_storage.save(filepath)

    if ext == '.zip':
        extract_dir = os.path.join(tmp_dir, "extracted")
        os.makedirs(extract_dir, exist_ok=True)
        try:
            with zipfile.ZipFile(filepath, 'r') as zf:
                zf.extractall(extract_dir)
            parts, count = process_directory(extract_dir, filename)
            return f"📦 **Архив: {filename}** ({count} файлов)\n" + "\n".join(parts)
        except Exception as e:
            return f"❌ Ошибка при распаковке {filename}: {str(e)}"

    elif ext in ('.tar', '.gz', '.tgz', '.bz2'):
        extract_dir = os.path.join(tmp_dir, "extracted")
        os.makedirs(extract_dir, exist_ok=True)
        try:
            with tarfile.open(filepath, 'r:*') as tf:
                tf.extractall(extract_dir)
            parts, count = process_directory(extract_dir, filename)
            return f"📦 **Архив: {filename}** ({count} файлов)\n" + "\n".join(parts)
        except Exception as e:
            return f"❌ Ошибка при распаковке {filename}: {str(e)}"

    elif is_text_file(filename):
        content = read_file_content(filepath)
        if content:
            lang = ext.lstrip('.') if ext else 'text'
            return f"📄 **Файл: {filename}**\n```{lang}\n{content}\n```"
        return f"📄 **Файл: {filename}** [не удалось прочитать]"

    return f"📎 **Файл: {filename}** ({ext or 'unknown'} — бинарный файл, пропущен)"


@app.route("/api/upload", methods=["POST"])
@require_auth
def upload_file():
    """Upload file(s) and return processed content."""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400

    files = request.files.getlist('file')
    results = []
    for f in files:
        if f.filename:
            content = process_uploaded_file(f)
            results.append(content)

    return jsonify({"content": "\n\n".join(results), "file_count": len(results)})


# ══════════════════════════════════════════════════════════════════
# ██ Parse SSH from message text ██
# ══════════════════════════════════════════════════════════════════

def _parse_ssh_from_message(message):
    """
    Parse SSH credentials from user message text.
    Supports formats:
      - root@192.168.1.1 mypassword ...
      - user@hostname password ...
      - root@10.0.0.1 P@ssw0rd! сходи посмотри ...
    Returns dict with host, username, password or None.
    """
    if not message:
        return None

    # Pattern: user@host password
    # IP: digits and dots, or hostname
    # Password: non-space string (can contain special chars)
    m = re.match(
        r'^\s*([a-zA-Z0-9_.-]+)@([a-zA-Z0-9._-]+)\s+(\S+)\s*(.*)',
        message
    )
    if m:
        username = m.group(1)
        host = m.group(2)
        password = m.group(3)
        # Validate host looks like IP or hostname
        if re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', host) or '.' in host:
            return {
                "host": host,
                "username": username,
                "password": password
            }

    # Pattern: just IP password (assume root)
    m = re.match(
        r'^\s*(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+(\S+)\s*(.*)',
        message
    )
    if m:
        host = m.group(1)
        password = m.group(2)
        return {
            "host": host,
            "username": "root",
            "password": password
        }

    return None


# ══════════════════════════════════════════════════════════════════
# ██ AGENT LOOP — CORE: AI plans, executes, verifies autonomously ██
# ══════════════════════════════════════════════════════════════════

@app.route("/api/chats/<chat_id>/send", methods=["POST"])
@require_auth
def send_message(chat_id):
    "Send message and get AI response via SSE streaming with agent loop."
    # Rate limiting check
    rl = _get_rate_limiter()
    allowed, rl_info = rl.check_message(request.user_id)
    if not allowed:
        return jsonify({
            "error": "Rate limit exceeded",
            "retry_after": rl_info.get("retry_after", 60),
            "remaining": 0
        }), 429

    db = db_read()
    chat = db["chats"].get(chat_id)
    if not chat or chat.get("user_id") != request.user_id:
        return jsonify({"error": "Chat not found"}), 404

    data = request.get_json() or {}
    user_message = data.get("message", "").strip()
    file_content = data.get("file_content", "")

    if not user_message and not file_content:
        return jsonify({"error": "Message required"}), 400

    # Get user settings
    user_settings = db["users"].get(request.user_id, {}).get("settings", {})
    variant = user_settings.get("variant", "premium")
    enhanced = user_settings.get("enhanced_mode", False)
    chat_model = user_settings.get("chat_model", "qwen3")

    # Get SSH credentials from user settings
    ssh_credentials = {
        "host": user_settings.get("ssh_host", ""),
        "username": user_settings.get("ssh_user", "root"),
        "password": user_settings.get("ssh_password", ""),
    }

    # ── Parse SSH credentials from message text ──
    # Formats: "root@IP password ...", "user@IP password ...", "IP password ..."
    ssh_from_msg = _parse_ssh_from_message(user_message)
    if ssh_from_msg:
        # Merge: message SSH overrides settings SSH
        if ssh_from_msg.get("host"):
            ssh_credentials["host"] = ssh_from_msg["host"]
        if ssh_from_msg.get("username"):
            ssh_credentials["username"] = ssh_from_msg["username"]
        if ssh_from_msg.get("password"):
            ssh_credentials["password"] = ssh_from_msg["password"]

    # Save user message
    now = datetime.now(timezone.utc).isoformat()
    user_msg = {
        "id": str(uuid.uuid4())[:8],
        "role": "user",
        "content": user_message,
        "timestamp": now,
        "file_content": file_content[:500] if file_content else None
    }
    chat["messages"].append(user_msg)
    chat["updated_at"] = now

    # Auto-title from first message
    if len(chat["messages"]) == 1 and chat["title"] == "Новый чат":
        chat["title"] = user_message[:50] + ("..." if len(user_message) > 50 else "")

    db["chats"][chat_id] = chat
    db_write(db)

    # Determine which model to use
    config = MODEL_CONFIGS.get(variant, MODEL_CONFIGS["premium"])
    model = config["coding"]["model"]
    model_name = config["coding"]["name"]
    # Separate model for Agent Mode (must support OpenAI tool calling)
    agent_model = config["tools"]["model"]
    agent_model_name = config["tools"]["name"]

    # Detect if this is an agent task (needs SSH/files/browser) or simple chat
    # Agent keywords — actions that require real execution on servers
    agent_keywords = [
        "создай", "разверни", "деплой", "установи", "настрой", "запусти",
        "подключись", "ssh", "проверь сайт",
        "скачай", "обнови", "перезапусти", "удали", "скопируй",
        "create", "deploy", "install", "setup", "run", "connect",
        "check", "restart", "update", "build",
        "напиши и разверни", "сделай сайт", "сделай приложение",
        "выполни", "команд", "apt", "pip", "npm", "git",
        "nginx", "systemd", "docker", "service",
        "сходи", "папк", "директор",
        "лог", "процесс", "порт", "диск",
        "uptime", "top", "ls ", "cat ", "mkdir",
    ]
    # Keywords that indicate analysis/review tasks — NOT agent tasks
    analysis_keywords = [
        "изучи", "проанализируй", "анализ", "документ", "оцени",
        "сравни", "опиши", "расскажи", "объясни", "что думаешь",
        "что не хватает", "что добавить", "review", "analyze",
        "аудит", "ревью", "проверку кода", "code review",
    ]
    msg_lower = user_message.lower()
    is_analysis = any(kw in msg_lower for kw in analysis_keywords)
    is_agent_task = any(kw in msg_lower for kw in agent_keywords)

    # If it looks like analysis/review AND no explicit SSH in message — prefer chat mode
    if is_analysis and not ssh_from_msg:
        is_agent_task = False

    # If SSH credentials were parsed from message — it's definitely an agent task
    if ssh_from_msg:
        is_agent_task = True

    # Also check if SSH credentials are configured
    has_ssh = bool(ssh_credentials.get("host") and ssh_credentials.get("password"))

    # Build chat history for context
    history = [{"role": m["role"], "content": m["content"]} for m in chat["messages"][-10:]]

    def generate():
        full_response = ""

        # Send metadata — show agent model name when in agent mode
        active_model_name = agent_model_name if (is_agent_task and has_ssh) else model_name
        yield f"data: {json.dumps({'type': 'meta', 'variant': variant, 'model': active_model_name, 'enhanced': enhanced, 'agent_mode': is_agent_task and has_ssh})}\n\n"

        if is_agent_task and has_ssh:
            # ═══ AGENT MODE: Real execution with SSH/Browser/Files ═══
            yield f"data: {json.dumps({'type': 'agent_mode', 'text': 'Запускаю автономный агент...'})}\n\n"

            if enhanced:
                # Multi-agent pipeline
                agent = MultiAgentLoop(
                    model=agent_model,
                    api_key=OPENROUTER_API_KEY,
                    api_url=OPENROUTER_BASE_URL,
                    ssh_credentials=ssh_credentials
                )
            else:
                # Single agent loop
                agent = AgentLoop(
                    model=agent_model,
                    api_key=OPENROUTER_API_KEY,
                    api_url=OPENROUTER_BASE_URL,
                    ssh_credentials=ssh_credentials
                )

            # Register agent for stop functionality
            with _agents_lock:
                _active_agents[chat_id] = agent

            try:
                if enhanced:
                    event_gen = agent.run_multi_agent_stream(user_message, history, file_content)
                else:
                    event_gen = agent.run_stream(user_message, history, file_content)

                for event in event_gen:
                    yield event
                    # Capture text content
                    try:
                        event_data = json.loads(event.replace("data: ", "").strip())
                        if event_data.get("type") == "content":
                            full_response += event_data.get("text", "")
                    except:
                        pass

                # Get token counts from agent
                tokens_in = agent.total_tokens_in
                tokens_out = agent.total_tokens_out

            finally:
                with _agents_lock:
                    _active_agents.pop(chat_id, None)

        else:
            # ═══ CHAT MODE: Simple text response (no SSH needed) ═══
            # Use chat model for simple questions, coding model for code tasks
            code_keywords = ["код", "code", "функци", "class", "function", "html", "css", "js", "python", "api"]
            is_code = any(kw in user_message.lower() for kw in code_keywords)

            if is_code:
                active_model = model
                system_prompt = """Ты — Senior Full-Stack Developer. Ты пишешь production-ready код.
Правила:
- Чистый, читаемый код с комментариями
- Современные паттерны и best practices
- Полная обработка ошибок
- Если задача про лендинг/сайт — создавай красивый дизайн с градиентами, анимациями
Всегда возвращай полный код файлов. Каждый файл оборачивай в ```language filename.ext

Если пользователь хочет чтобы ты ВЫПОЛНИЛ задачу на сервере (создал файлы, запустил команды) — 
скажи ему настроить SSH подключение в настройках (иконка ⚙️), указав хост, логин и пароль сервера.
После этого ты сможешь автоматически выполнять команды на сервере."""
            else:
                active_model = CHAT_MODELS.get(chat_model, CHAT_MODELS["qwen3"])["model"]
                system_prompt = """Ты — полезный AI-ассистент Super Agent v4.0. Отвечай на русском языке.
Ты умеешь:
- Писать код и создавать приложения
- Подключаться к серверам по SSH и выполнять команды
- Создавать и редактировать файлы на серверах
- Проверять сайты через браузер
- Деплоить приложения автоматически

Если пользователь хочет чтобы ты выполнил задачу на сервере — попроси его настроить SSH в настройках (⚙️).
Отвечай кратко и по делу."""

            messages = [{"role": "system", "content": system_prompt}]
            for msg in history:
                messages.append({"role": msg["role"], "content": msg["content"]})

            if file_content:
                # Truncate file content to avoid exceeding API limits
                fc = file_content
                if len(fc) > 30000:
                    fc = fc[:30000] + f"\n... [обрезано, всего {len(file_content)} символов]"
                messages[-1]["content"] = f"{fc}\n\n---\n\nЗадача:\n{user_message}"

            # Stream response
            headers = {
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://minimax.mksitdev.ru",
                "X-Title": "Super Agent v4.0"
            }

            payload = {
                "model": active_model,
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": 16000,
                "stream": True
            }

            tokens_in = 0
            tokens_out = 0

            try:
                resp = http_requests.post(
                    OPENROUTER_BASE_URL,
                    headers=headers,
                    json=payload,
                    stream=True,
                    timeout=120
                )
                resp.raise_for_status()

                for line in resp.iter_lines():
                    if not line:
                        continue
                    line_str = line.decode("utf-8", errors="replace")
                    if not line_str.startswith("data: "):
                        continue
                    payload_str = line_str[6:]
                    if payload_str.strip() == "[DONE]":
                        break
                    try:
                        chunk = json.loads(payload_str)
                        choices = chunk.get("choices", [])
                        if choices:
                            delta = choices[0].get("delta", {})
                            text = delta.get("content", "")
                            if text:
                                full_response += text
                                yield f"data: {json.dumps({'type': 'content', 'text': text})}\n\n"

                        usage = chunk.get("usage")
                        if usage:
                            tokens_in += usage.get("prompt_tokens", 0)
                            tokens_out += usage.get("completion_tokens", 0)
                    except json.JSONDecodeError:
                        continue

            except Exception as e:
                error_msg = f"❌ Ошибка API: {str(e)}"
                yield f"data: {json.dumps({'type': 'error', 'text': error_msg})}\n\n"
                full_response = error_msg

        # Calculate cost
        cost_in = (tokens_in / 1_000_000) * config["coding"]["input_price"]
        cost_out = (tokens_out / 1_000_000) * config["coding"]["output_price"]
        total_cost = round(cost_in + cost_out, 4)

        # Save assistant message
        db2 = db_read()
        chat2 = db2["chats"].get(chat_id, chat)
        assistant_msg = {
            "id": str(uuid.uuid4())[:8],
            "role": "assistant",
            "content": full_response,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "model": model_name,
            "variant": variant,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost": total_cost,
            "enhanced": enhanced,
            "agent_mode": is_agent_task and has_ssh
        }
        chat2["messages"].append(assistant_msg)
        chat2["total_cost"] = round(chat2.get("total_cost", 0) + total_cost, 4)
        chat2["total_tokens_in"] = chat2.get("total_tokens_in", 0) + tokens_in
        chat2["total_tokens_out"] = chat2.get("total_tokens_out", 0) + tokens_out
        chat2["model_used"] = model_name
        chat2["variant"] = variant
        db2["chats"][chat_id] = chat2

        # Update user spending
        user2 = db2["users"].get(request.user_id, {})
        user2["total_spent"] = round(user2.get("total_spent", 0) + total_cost, 4)
        db2["users"][request.user_id] = user2

        # Update global analytics
        analytics = db2.get("analytics", {})
        analytics["total_requests"] = analytics.get("total_requests", 0) + 1
        analytics["total_tokens_in"] = analytics.get("total_tokens_in", 0) + tokens_in
        analytics["total_tokens_out"] = analytics.get("total_tokens_out", 0) + tokens_out
        analytics["total_cost"] = round(analytics.get("total_cost", 0) + total_cost, 4)

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        daily = analytics.get("daily_stats", {})
        if today not in daily:
            daily[today] = {"requests": 0, "cost": 0.0, "tokens_in": 0, "tokens_out": 0}
        daily[today]["requests"] += 1
        daily[today]["cost"] = round(daily[today]["cost"] + total_cost, 4)
        daily[today]["tokens_in"] += tokens_in
        daily[today]["tokens_out"] += tokens_out
        analytics["daily_stats"] = daily
        db2["analytics"] = analytics

        # Save memory (episodic) — legacy JSON memory
        memory = db2.get("memory", {"episodic": [], "semantic": {}, "procedural": {}})
        memory["episodic"].append({
            "task": user_message[:200],
            "result_preview": full_response[:200],
            "cost": total_cost,
            "variant": variant,
            "enhanced": enhanced,
            "agent_mode": is_agent_task and has_ssh,
            "timestamp": now,
            "user_id": request.user_id,
            "success": "❌" not in full_response[:100]
        })
        if len(memory["episodic"]) > 1000:
            memory["episodic"] = memory["episodic"][-1000:]
        db2["memory"] = memory

        # Save to vector memory (long-term, cross-chat)
        try:
            vmem = _get_memory()
            vmem.store_from_conversation(
                user_message=user_message,
                assistant_response=full_response[:500],
                chat_id=chat_id,
                user_id=request.user_id
            )
        except Exception:
            pass  # Non-critical

        db_write(db2)

        # Send completion event
        yield f"data: {json.dumps({'type': 'done', 'tokens_in': tokens_in, 'tokens_out': tokens_out, 'cost': total_cost, 'model': model_name})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# ── Stop Agent ─────────────────────────────────────────────────
@app.route("/api/chats/<chat_id>/stop", methods=["POST"])
@require_auth
def stop_agent(chat_id):
    """Stop a running agent loop."""
    with _agents_lock:
        agent = _active_agents.get(chat_id)
        if agent:
            agent.stop()
            return jsonify({"ok": True, "message": "Agent stop requested"})
    return jsonify({"ok": False, "message": "No active agent for this chat"})


# ── Quick Chat (non-streaming for simple questions) ────────────
@app.route("/api/chat/quick", methods=["POST"])
@require_auth
def quick_chat():
    """Quick non-streaming chat response."""
    data = request.get_json() or {}
    message = data.get("message", "")
    user_settings = request.user.get("settings", {})
    chat_model_key = user_settings.get("chat_model", "qwen3")
    chat_model = CHAT_MODELS.get(chat_model_key, CHAT_MODELS["qwen3"])

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }

    resp = http_requests.post(OPENROUTER_BASE_URL, headers=headers, json={
        "model": chat_model["model"],
        "messages": [
            {"role": "system", "content": "Ты — полезный AI-ассистент. Отвечай кратко и по делу на русском языке."},
            {"role": "user", "content": message}
        ],
        "temperature": 0.5,
        "max_tokens": 2000
    }, timeout=30)

    result = resp.json()
    choices = result.get("choices", [])
    content = choices[0].get("message", {}).get("content", "Ошибка") if choices else "Ошибка: пустой ответ"
    return jsonify({"response": content})


# ── Analytics ──────────────────────────────────────────────────
@app.route("/api/analytics", methods=["GET"])
@require_auth
def get_analytics():
    """Get analytics for current user."""
    db = db_read()
    user = db["users"].get(request.user_id, {})

    user_chats = [c for c in db["chats"].values() if c.get("user_id") == request.user_id]
    user_cost = sum(c.get("total_cost", 0) for c in user_chats)
    user_messages = sum(len(c.get("messages", [])) for c in user_chats)
    user_tokens_in = sum(c.get("total_tokens_in", 0) for c in user_chats)
    user_tokens_out = sum(c.get("total_tokens_out", 0) for c in user_chats)

    chat_stats = []
    for c in user_chats:
        chat_stats.append({
            "id": c["id"],
            "title": c.get("title", ""),
            "cost": c.get("total_cost", 0),
            "messages": len(c.get("messages", [])),
            "variant": c.get("variant", ""),
            "model": c.get("model_used", ""),
            "created_at": c.get("created_at", "")
        })

    daily_data = {}
    for c in user_chats:
        for msg in c.get("messages", []):
            if msg.get("role") == "assistant":
                day = msg.get("timestamp", "")[:10]
                if day:
                    if day not in daily_data:
                        daily_data[day] = {"cost": 0, "requests": 0}
                    daily_data[day]["cost"] += msg.get("cost", 0)
                    daily_data[day]["requests"] += 1

    avg_task_cost = user_cost / max(len([m for c in user_chats for m in c.get("messages", []) if m.get("role") == "assistant"]), 1)
    programmer_hourly = 50
    programmer_task_time = 2
    programmer_cost = programmer_hourly * programmer_task_time
    savings_percent = round((1 - avg_task_cost / programmer_cost) * 100, 1) if programmer_cost > 0 else 0

    return jsonify({
        "user": {
            "total_cost": round(user_cost, 4),
            "total_cost_rub": round(user_cost * 105, 2),
            "total_chats": len(user_chats),
            "total_messages": user_messages,
            "tokens_in": user_tokens_in,
            "tokens_out": user_tokens_out,
            "monthly_limit": user.get("monthly_limit", 999999),
            "monthly_limit_rub": round(user.get("monthly_limit", 999999) * 105, 2),
            "limit_used_percent": round(user_cost / max(user.get("monthly_limit", 999999), 1) * 100, 1)
        },
        "chats": chat_stats,
        "daily": daily_data,
        "comparison": {
            "agent_avg_cost": round(avg_task_cost, 4),
            "programmer_avg_cost": programmer_cost,
            "savings_percent": max(savings_percent, 0),
            "savings_text": f"Экономия {max(savings_percent, 0)}% по сравнению с программистом"
        }
    })


# ── Admin Panel ────────────────────────────────────────────────
@app.route("/api/admin/users", methods=["GET"])
@require_auth
@require_admin
def admin_list_users():
    """List all users (admin only)."""
    db = db_read()
    users = []
    for uid, u in db["users"].items():
        user_chats = [c for c in db["chats"].values() if c.get("user_id") == uid]
        total_cost = sum(c.get("total_cost", 0) for c in user_chats)
        total_chats = len(user_chats)
        total_messages = sum(len(c.get("messages", [])) for c in user_chats)

        users.append({
            "id": uid,
            "email": u["email"],
            "name": u["name"],
            "role": u.get("role", "user"),
            "is_active": u.get("is_active", True),
            "created_at": u.get("created_at", ""),
            "total_spent": round(total_cost, 4),
            "total_spent_rub": round(total_cost * 105, 2),
            "total_chats": total_chats,
            "total_messages": total_messages,
            "monthly_limit": u.get("monthly_limit", 999999),
            "monthly_limit_rub": round(u.get("monthly_limit", 999999) * 105, 2),
            "budget_used_percent": round(total_cost / max(u.get("monthly_limit", 999999), 0.01) * 100, 1),
            "permissions": u.get("permissions", {
                "can_use_ssh": True,
                "can_use_browser": True,
                "can_use_enhanced": u.get("role") == "admin",
                "can_export": True,
                "can_upload_files": True,
                "max_chats": 100,
                "max_messages_per_day": 500
            }),
            "settings": u.get("settings", {})
        })

    return jsonify({"users": users})


@app.route("/api/admin/users", methods=["POST"])
@require_auth
@require_admin
def admin_create_user():
    """Create a new user (admin only)."""
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    name = data.get("name", email.split("@")[0])
    role = data.get("role", "user")  # admin, user, viewer
    monthly_limit = data.get("monthly_limit", 100)
    permissions = data.get("permissions", {})

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    db = db_read()

    for u in db["users"].values():
        if u["email"].lower() == email:
            return jsonify({"error": "Email already exists"}), 409

    user_id = str(uuid.uuid4())[:8]
    db["users"][user_id] = {
        "id": user_id,
        "email": email,
        "password_hash": hashlib.sha256(password.encode()).hexdigest(),
        "name": name,
        "role": role,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_active": True,
        "monthly_limit": monthly_limit,
        "total_spent": 0.0,
        "permissions": {
            "can_use_ssh": permissions.get("can_use_ssh", role in ("admin", "user")),
            "can_use_browser": permissions.get("can_use_browser", role in ("admin", "user")),
            "can_use_enhanced": permissions.get("can_use_enhanced", role == "admin"),
            "can_export": permissions.get("can_export", True),
            "can_upload_files": permissions.get("can_upload_files", True),
            "max_chats": permissions.get("max_chats", 100),
            "max_messages_per_day": permissions.get("max_messages_per_day", 500),
        },
        "settings": {
            "variant": "premium",
            "chat_model": "qwen3",
            "enhanced_mode": False,
            "design_pro": False,
            "language": "ru"
        }
    }
    db_write(db)
    return jsonify({"ok": True, "user_id": user_id}), 201


@app.route("/api/admin/users/<user_id>", methods=["PUT"])
@require_auth
@require_admin
def admin_update_user(user_id):
    """Update user details — role, name, limit, permissions (admin only)."""
    data = request.get_json() or {}
    db = db_read()
    user = db["users"].get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Update allowed fields
    if "name" in data:
        user["name"] = data["name"]
    if "role" in data:
        user["role"] = data["role"]
    if "monthly_limit" in data:
        user["monthly_limit"] = data["monthly_limit"]
    if "is_active" in data:
        user["is_active"] = data["is_active"]
    if "password" in data and data["password"]:
        user["password_hash"] = hashlib.sha256(data["password"].encode()).hexdigest()

    # Update permissions
    if "permissions" in data:
        perms = user.get("permissions", {})
        for key in ("can_use_ssh", "can_use_browser", "can_use_enhanced",
                     "can_export", "can_upload_files", "max_chats", "max_messages_per_day"):
            if key in data["permissions"]:
                perms[key] = data["permissions"][key]
        user["permissions"] = perms

    db["users"][user_id] = user
    db_write(db)
    return jsonify({"ok": True})


@app.route("/api/admin/users/<user_id>", methods=["DELETE"])
@require_auth
@require_admin
def admin_delete_user(user_id):
    """Delete a user and all their chats (admin only)."""
    db = db_read()
    if user_id not in db["users"]:
        return jsonify({"error": "User not found"}), 404
    if user_id == request.user_id:
        return jsonify({"error": "Cannot delete yourself"}), 400

    # Delete user's chats
    chats_to_delete = [cid for cid, c in db["chats"].items() if c.get("user_id") == user_id]
    for cid in chats_to_delete:
        del db["chats"][cid]

    # Delete user's sessions
    sessions_to_delete = [sid for sid, s in db["sessions"].items() if s.get("user_id") == user_id]
    for sid in sessions_to_delete:
        del db["sessions"][sid]

    del db["users"][user_id]
    db_write(db)
    return jsonify({"ok": True})


@app.route("/api/admin/users/<user_id>/toggle", methods=["POST"])
@require_auth
@require_admin
def admin_toggle_user(user_id):
    """Block/unblock user (admin only)."""
    db = db_read()
    user = db["users"].get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    user["is_active"] = not user.get("is_active", True)
    db["users"][user_id] = user
    db_write(db)
    return jsonify({"ok": True, "is_active": user["is_active"]})


@app.route("/api/admin/users/<user_id>/limit", methods=["PUT"])
@require_auth
@require_admin
def admin_set_limit(user_id):
    """Set user monthly limit (admin only)."""
    data = request.get_json() or {}
    db = db_read()
    user = db["users"].get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    user["monthly_limit"] = data.get("limit", 100)
    db["users"][user_id] = user
    db_write(db)
    return jsonify({"ok": True})


@app.route("/api/admin/users/<user_id>/chats", methods=["GET"])
@require_auth
@require_admin
def admin_user_chats(user_id):
    """View user's chats (admin only)."""
    db = db_read()
    user_chats = [c for c in db["chats"].values() if c.get("user_id") == user_id]
    user_chats.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return jsonify({"chats": user_chats})


@app.route("/api/admin/chats", methods=["GET"])
@require_auth
@require_admin
def admin_all_chats():
    """View ALL chats from all users with full messages (admin only)."""
    db = db_read()
    all_chats = []
    for chat_id, chat in db["chats"].items():
        user = db["users"].get(chat.get("user_id", ""), {})
        all_chats.append({
            "id": chat_id,
            "title": chat.get("title", "Untitled"),
            "user_id": chat.get("user_id", ""),
            "user_email": user.get("email", "unknown"),
            "user_name": user.get("name", "unknown"),
            "variant": chat.get("variant", ""),
            "model": chat.get("model", ""),
            "total_cost": chat.get("total_cost", 0),
            "messages": chat.get("messages", []),
            "message_count": len(chat.get("messages", [])),
            "created_at": chat.get("created_at", ""),
            "updated_at": chat.get("updated_at", "")
        })
    all_chats.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return jsonify({"chats": all_chats})


@app.route("/api/admin/chats/<chat_id>", methods=["GET"])
@require_auth
@require_admin
def admin_get_chat(chat_id):
    """View a specific chat with full messages (admin only)."""
    db = db_read()
    chat = db["chats"].get(chat_id)
    if not chat:
        return jsonify({"error": "Chat not found"}), 404
    user = db["users"].get(chat.get("user_id", ""), {})
    chat["user_email"] = user.get("email", "unknown")
    chat["user_name"] = user.get("name", "unknown")
    return jsonify({"chat": chat})


@app.route("/api/admin/chats/<chat_id>", methods=["DELETE"])
@require_auth
@require_admin
def admin_delete_chat(chat_id):
    """Delete a chat (admin only)."""
    db = db_read()
    if chat_id in db["chats"]:
        del db["chats"][chat_id]
        db_write(db)
        return jsonify({"ok": True})
    return jsonify({"error": "Chat not found"}), 404


@app.route("/api/admin/stats", methods=["GET"])
@require_auth
@require_admin
def admin_stats():
    """Get system-wide statistics (admin only)."""
    db = db_read()
    analytics = db.get("analytics", {})

    total_users = len(db["users"])
    total_chats = len(db["chats"])
    total_messages = sum(len(c.get("messages", [])) for c in db["chats"].values())
    active_users = len(set(c.get("user_id") for c in db["chats"].values()))

    total_cost = analytics.get("total_cost", 0)
    return jsonify({
        "total_users": total_users,
        "active_users": active_users,
        "total_chats": total_chats,
        "total_messages": total_messages,
        "total_cost": total_cost,
        "total_cost_rub": round(total_cost * 105, 2),
        "total_requests": analytics.get("total_requests", 0),
        "total_tokens_in": analytics.get("total_tokens_in", 0),
        "total_tokens_out": analytics.get("total_tokens_out", 0),
        "daily_stats": analytics.get("daily_stats", {}),
        "memory_episodes": len(db.get("memory", {}).get("episodic", []))
    })


# ── Memory API ─────────────────────────────────────────────────
@app.route("/api/memory/search", methods=["POST"])
@require_auth
def search_memory():
    """Search memory — both legacy episodic and vector memory."""
    data = request.get_json() or {}
    query = data.get("query", "").lower()
    limit = data.get("limit", 5)

    # Legacy episodic search
    db = db_read()
    episodes = db.get("memory", {}).get("episodic", [])
    legacy_results = []
    for ep in reversed(episodes):
        task = ep.get("task", "").lower()
        score = sum(1 for word in query.split() if word in task)
        if score > 0:
            legacy_results.append({**ep, "relevance": score, "source": "episodic"})
    legacy_results.sort(key=lambda x: x["relevance"], reverse=True)

    # Vector memory search (cross-chat)
    vector_results = []
    try:
        vmem = _get_memory()
        vector_results = vmem.search(query, limit=limit, user_id=request.user_id)
        for vr in vector_results:
            vr["source"] = "vector"
    except Exception:
        pass

    return jsonify({
        "results": legacy_results[:limit],
        "vector_results": vector_results[:limit]
    })


@app.route("/api/memory/context", methods=["POST"])
@require_auth
def get_memory_context():
    """Get relevant memory context for a query (cross-chat learning)."""
    data = request.get_json() or {}
    query = data.get("query", "")
    if not query:
        return jsonify({"context": ""})

    try:
        vmem = _get_memory()
        context = vmem.get_relevant_context(query, user_id=request.user_id)
        return jsonify({"context": context})
    except Exception as e:
        return jsonify({"context": "", "error": str(e)})


@app.route("/api/memory/stats", methods=["GET"])
@require_auth
def memory_stats():
    """Get memory statistics."""
    try:
        vmem = _get_memory()
        return jsonify(vmem.get_stats())
    except Exception as e:
        return jsonify({"error": str(e)})


# ── File Versioning API ─────────────────────────────────────────────
@app.route("/api/versions/files", methods=["GET"])
@require_auth
def list_versioned_files():
    """List all versioned files."""
    host = request.args.get("host", None)
    try:
        store = _get_versions()
        files = store.get_all_files(host=host)
        return jsonify({"files": files})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/versions/history", methods=["GET"])
@require_auth
def file_version_history():
    """Get version history for a file."""
    host = request.args.get("host", "")
    path = request.args.get("path", "")
    if not host or not path:
        return jsonify({"error": "host and path required"}), 400

    try:
        store = _get_versions()
        history = store.get_history(host, path)
        return jsonify({"history": history})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/versions/diff", methods=["GET"])
@require_auth
def file_version_diff():
    """Get diff between two versions."""
    host = request.args.get("host", "")
    path = request.args.get("path", "")
    v_from = int(request.args.get("from", 0))
    v_to = int(request.args.get("to", 0))

    if not host or not path or not v_from or not v_to:
        return jsonify({"error": "host, path, from, to required"}), 400

    try:
        store = _get_versions()
        diff = store.get_diff(host, path, v_from, v_to)
        return jsonify({"diff": diff})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/versions/rollback", methods=["POST"])
@require_auth
def file_version_rollback():
    """Rollback a file to a previous version."""
    data = request.get_json() or {}
    host = data.get("host", "")
    path = data.get("path", "")
    version = data.get("version", 0)

    if not host or not path or not version:
        return jsonify({"error": "host, path, version required"}), 400

    try:
        store = _get_versions()
        result = store.rollback(host, path, version)
        if result:
            return jsonify({"ok": True, "result": result})
        return jsonify({"error": "Version not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/versions/stats", methods=["GET"])
@require_auth
def file_version_stats():
    """Get file versioning statistics."""
    try:
        store = _get_versions()
        return jsonify(store.get_stats())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Rate Limiting API ──────────────────────────────────────────────
@app.route("/api/rate-limit/status", methods=["GET"])
@require_auth
def rate_limit_status():
    """Get current rate limit status for user."""
    rl = _get_rate_limiter()
    ip = request.remote_addr or "unknown"
    usage = rl.get_all_usage(user_id=request.user_id, ip=ip)
    return jsonify(usage)


# ── Export ─────────────────────────────────────────────────────
@app.route("/api/chats/<chat_id>/export", methods=["GET"])
@require_auth
def export_chat(chat_id):
    """Export chat as ZIP with all generated files."""
    db = db_read()
    chat = db["chats"].get(chat_id)
    if not chat or (chat.get("user_id") != request.user_id and request.user.get("role") != "admin"):
        return jsonify({"error": "Chat not found"}), 404

    files = {}
    for msg in chat.get("messages", []):
        if msg.get("role") == "assistant":
            content = msg.get("content", "")
            pattern = r'```(\w+)\s+([\w\-./]+\.\w+)\n(.*?)```'
            matches = re.findall(pattern, content, re.DOTALL)
            for lang, filename, code in matches:
                files[filename] = code

            if not matches:
                pattern2 = r'```(\w+)\n(.*?)```'
                matches2 = re.findall(pattern2, content, re.DOTALL)
                for i, (lang, code) in enumerate(matches2):
                    ext_map = {'html': '.html', 'css': '.css', 'javascript': '.js', 'js': '.js',
                               'python': '.py', 'py': '.py', 'json': '.json', 'sql': '.sql'}
                    ext = ext_map.get(lang, f'.{lang}')
                    files[f"file_{i+1}{ext}"] = code

    if not files:
        return jsonify({"error": "No code files found in chat"}), 404

    zip_path = os.path.join(UPLOAD_DIR, f"export_{chat_id}.zip")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for fname, content in files.items():
            zf.writestr(fname, content)

    with open(zip_path, 'rb') as f:
        zip_data = f.read()

    os.remove(zip_path)

    return Response(
        zip_data,
        mimetype='application/zip',
        headers={'Content-Disposition': f'attachment; filename=super-agent-{chat_id}.zip'}
    )


# ── Health Check ───────────────────────────────────────────────
@app.route("/api/health", methods=["GET"])
def health():
    # Get stats from new modules
    mem_stats = {}
    ver_stats = {}
    try:
        mem_stats = _get_memory().get_stats()
    except Exception:
        pass
    try:
        ver_stats = _get_versions().get_stats()
    except Exception:
        pass

    return jsonify({
        "status": "ok",
        "version": "5.0",
        "name": "Super Agent",
        "features": [
            "langgraph_stategraph", "retry_policy", "idempotency",
            "self_healing_2.0", "vector_memory", "file_versioning",
            "rate_limiting", "contracts", "cross_chat_learning",
            "ssh_executor", "file_manager", "browser_agent",
            "agent_loop", "multi_agent"
        ],
        "memory": mem_stats,
        "versioning": ver_stats,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })


@app.route("/api/models", methods=["GET"])
def list_models():
    """Public endpoint to list available model configurations."""
    return jsonify({
        "configs": {
            k: {
                "name": v["name"],
                "emoji": v["emoji"],
                "quality": v["quality"],
                "monthly_cost": v["monthly_cost"],
                "coding_model": v["coding"]["name"]
            } for k, v in MODEL_CONFIGS.items()
        },
        "chat_models": {
            k: {"name": v["name"], "lang": v["lang"]}
            for k, v in CHAT_MODELS.items()
        }
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3501, debug=True)
