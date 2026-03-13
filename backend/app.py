"""
Super Agent v4.0 — Backend API Server
Автономный AI-инженер с мультиагентной системой, долговременной памятью,
Design Pro модулем, админ-панелью и аналитикой.
"""

import os
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

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max

# ── Configuration ──────────────────────────────────────────────
OPENROUTER_API_KEY = os.environ.get(
    "OPENROUTER_API_KEY",
    "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",
)
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions"

DATA_DIR = os.environ.get("DATA_DIR", "/var/www/super-agent/backend/data")
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/var/www/super-agent/backend/uploads")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

DB_FILE = os.path.join(DATA_DIR, "database.json")
_lock = threading.Lock()

# ── Model Configurations ──────────────────────────────────────
MODEL_CONFIGS = {
    "original": {
        "name": "Оригинал",
        "emoji": "🔴",
        "coding": {"model": "x-ai/grok-3-fast", "name": "Grok Code Fast 1", "input_price": 0.20, "output_price": 1.50},
        "planner": {"model": "anthropic/claude-sonnet-4", "name": "Claude Sonnet 4.5", "input_price": 3.00, "output_price": 15.00},
        "tools": {"model": "zhipu-ai/glm-4-plus", "name": "GLM 4.6", "input_price": 0.35, "output_price": 1.50},
        "quality": 72.1,
        "monthly_cost": "$2,200"
    },
    "premium": {
        "name": "Премиум",
        "emoji": "🟢",
        "coding": {"model": "minimax/minimax-m1", "name": "MiniMax M2.5", "input_price": 0.27, "output_price": 0.95},
        "planner": {"model": "anthropic/claude-sonnet-4", "name": "Claude Sonnet 4.5", "input_price": 3.00, "output_price": 15.00},
        "tools": {"model": "zhipu-ai/glm-4-plus", "name": "GLM 4.6", "input_price": 0.35, "output_price": 1.50},
        "quality": 80.2,
        "monthly_cost": "$1,750"
    },
    "budget": {
        "name": "Бюджет",
        "emoji": "🔵",
        "coding": {"model": "deepseek/deepseek-chat", "name": "DeepSeek V3.2", "input_price": 0.26, "output_price": 0.38},
        "planner": {"model": "deepseek/deepseek-reasoner", "name": "DeepSeek R1", "input_price": 0.40, "output_price": 1.75},
        "tools": {"model": "zhipu-ai/glm-4-plus", "name": "GLM 4.6", "input_price": 0.35, "output_price": 1.50},
        "quality": 75.8,
        "monthly_cost": "$750"
    }
}

CHAT_MODELS = {
    "qwen3": {"model": "qwen/qwen3-235b-a22b", "name": "Qwen3 235B", "lang": "RU ⭐⭐⭐⭐⭐", "input_price": 0.10, "output_price": 0.60},
    "deepseek": {"model": "deepseek/deepseek-chat", "name": "DeepSeek V3.2", "lang": "RU ⭐⭐⭐⭐⭐", "input_price": 0.26, "output_price": 0.38},
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
        "files": []
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
        # Admin can see all chats
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


# ── Multi-Agent System ─────────────────────────────────────────
class AgentOrchestrator:
    """Orchestrates multi-agent code generation pipeline."""

    AGENT_ROLES = {
        "architect": {
            "name": "Architect",
            "emoji": "🏗️",
            "system_prompt": """Ты — Senior Software Architect. Твоя задача:
1. Проанализировать требования пользователя
2. Определить архитектуру решения
3. Разбить задачу на подзадачи для Coder
4. Указать технологии, паттерны, структуру файлов
Отвечай кратко и структурированно. Формат: JSON с полями plan, files, technologies."""
        },
        "coder": {
            "name": "Coder",
            "emoji": "💻",
            "system_prompt": """Ты — Senior Full-Stack Developer. Ты пишешь production-ready код.
Правила:
- Чистый, читаемый код с комментариями
- Современные паттерны и best practices
- Полная обработка ошибок
- Адаптивный дизайн (mobile-first)
- Семантический HTML, CSS переменные
- Если задача про лендинг/сайт — создавай красивый дизайн с градиентами, анимациями, hover-эффектами
Всегда возвращай полный код файлов. Каждый файл оборачивай в ```language filename.ext"""
        },
        "reviewer": {
            "name": "Reviewer",
            "emoji": "🔍",
            "system_prompt": """Ты — Senior Code Reviewer. Проверяешь код на:
1. Баги и уязвимости
2. Производительность
3. Чистоту кода
4. Соответствие требованиям
5. Адаптивность и доступность
Если находишь проблемы — предложи исправленный код. Если код хороший — подтверди."""
        },
        "qa": {
            "name": "QA Engineer",
            "emoji": "✅",
            "system_prompt": """Ты — QA Engineer. Проверяешь финальный результат:
1. Все ли требования выполнены?
2. Работает ли код корректно?
3. Есть ли edge cases?
4. Адаптивность на мобильных?
Если всё ок — верни финальный код без изменений. Если есть проблемы — исправь и верни."""
        }
    }

    def __init__(self, variant="premium", enhanced=False, chat_model="qwen3"):
        self.variant = variant
        self.enhanced = enhanced
        self.chat_model = chat_model
        self.config = MODEL_CONFIGS.get(variant, MODEL_CONFIGS["premium"])
        self.total_tokens_in = 0
        self.total_tokens_out = 0
        self.total_cost = 0.0

    def _get_model_for_role(self, role):
        """Get the appropriate model for agent role."""
        if role == "coder":
            return self.config["coding"]["model"]
        elif role == "architect":
            return self.config["planner"]["model"]
        elif role in ("reviewer", "qa"):
            return self.config["coding"]["model"]
        elif role == "chat":
            return CHAT_MODELS.get(self.chat_model, CHAT_MODELS["qwen3"])["model"]
        return self.config["coding"]["model"]

    def _call_model(self, model, messages, stream=False):
        """Call OpenRouter API."""
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://minimax.mksitdev.ru",
            "X-Title": "Super Agent v4.0"
        }

        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": 16000,
            "stream": stream
        }

        try:
            resp = http_requests.post(
                OPENROUTER_BASE_URL,
                headers=headers,
                json=payload,
                stream=stream,
                timeout=120
            )
            resp.raise_for_status()

            if stream:
                return resp
            else:
                data = resp.json()
                choices = data.get("choices", [])
                choice = choices[0] if choices else {}
                content = choice.get("message", {}).get("content", "")
                usage = data.get("usage", {})
                self.total_tokens_in += usage.get("prompt_tokens", 0)
                self.total_tokens_out += usage.get("completion_tokens", 0)
                return content
        except Exception as e:
            return f"❌ Ошибка API: {str(e)}"

    def _stream_agent_response(self, role, model, messages):
        """Stream response from an agent, yielding SSE events."""
        agent = self.AGENT_ROLES.get(role, {})
        agent_name = agent.get("name", role)
        agent_emoji = agent.get("emoji", "🤖")

        # Send agent start event
        yield f"data: {json.dumps({'type': 'agent_start', 'agent': agent_name, 'emoji': agent_emoji, 'role': role})}\n\n"

        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://minimax.mksitdev.ru",
            "X-Title": "Super Agent v4.0"
        }

        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": 16000,
            "stream": True
        }

        full_content = ""
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
                            full_content += text
                            yield f"data: {json.dumps({'type': 'content', 'text': text, 'agent': agent_name})}\n\n"

                    # Track usage from final chunk (may come with empty choices)
                    usage = chunk.get("usage")
                    if usage:
                        self.total_tokens_in += usage.get("prompt_tokens", 0)
                        self.total_tokens_out += usage.get("completion_tokens", 0)
                except json.JSONDecodeError:
                    continue

        except Exception as e:
            error_msg = f"❌ Ошибка: {str(e)}"
            yield f"data: {json.dumps({'type': 'error', 'text': error_msg})}\n\n"
            full_content = error_msg

        # Send agent complete event
        yield f"data: {json.dumps({'type': 'agent_complete', 'agent': agent_name, 'role': role})}\n\n"

        return full_content

    def process_task_stream(self, user_message, chat_history=None, file_content=None):
        """Process a task through the agent pipeline with streaming."""
        if chat_history is None:
            chat_history = []

        # Build context
        context = user_message
        if file_content:
            context = f"{file_content}\n\n---\n\nЗадача пользователя:\n{user_message}"

        if self.enhanced:
            # Enhanced mode: 4 agents pipeline
            yield from self._enhanced_pipeline(context, chat_history)
        else:
            # Fast mode: single coder agent
            yield from self._fast_pipeline(context, chat_history)

    def _fast_pipeline(self, context, chat_history):
        """Single agent (Coder) pipeline."""
        model = self._get_model_for_role("coder")
        agent = self.AGENT_ROLES["coder"]

        messages = [{"role": "system", "content": agent["system_prompt"]}]

        # Add chat history (last 10 messages)
        for msg in chat_history[-10:]:
            messages.append({
                "role": msg.get("role", "user"),
                "content": msg.get("content", "")
            })

        messages.append({"role": "user", "content": context})

        # Stream coder response
        yield from self._stream_agent_response("coder", model, messages)

    def _enhanced_pipeline(self, context, chat_history):
        """4-agent pipeline: Architect → Coder → Reviewer → QA."""
        # Step 1: Architect
        arch_model = self._get_model_for_role("architect")
        arch_agent = self.AGENT_ROLES["architect"]
        arch_messages = [
            {"role": "system", "content": arch_agent["system_prompt"]},
            {"role": "user", "content": context}
        ]

        arch_content = ""
        for event in self._stream_agent_response("architect", arch_model, arch_messages):
            yield event
            # Capture content for next agent
            try:
                data = json.loads(event.replace("data: ", "").strip())
                if data.get("type") == "content":
                    arch_content += data.get("text", "")
            except (json.JSONDecodeError, ValueError):
                pass

        # Step 2: Coder
        code_model = self._get_model_for_role("coder")
        code_agent = self.AGENT_ROLES["coder"]
        code_messages = [
            {"role": "system", "content": code_agent["system_prompt"]},
            {"role": "user", "content": f"Архитектурный план:\n{arch_content}\n\nОригинальная задача:\n{context}\n\nНапиши полный код по этому плану."}
        ]

        code_content = ""
        for event in self._stream_agent_response("coder", code_model, code_messages):
            yield event
            try:
                data = json.loads(event.replace("data: ", "").strip())
                if data.get("type") == "content":
                    code_content += data.get("text", "")
            except (json.JSONDecodeError, ValueError):
                pass

        # Step 3: Reviewer
        rev_model = self._get_model_for_role("reviewer")
        rev_agent = self.AGENT_ROLES["reviewer"]
        rev_messages = [
            {"role": "system", "content": rev_agent["system_prompt"]},
            {"role": "user", "content": f"Проверь этот код:\n{code_content}\n\nОригинальная задача:\n{context}"}
        ]

        rev_content = ""
        for event in self._stream_agent_response("reviewer", rev_model, rev_messages):
            yield event
            try:
                data = json.loads(event.replace("data: ", "").strip())
                if data.get("type") == "content":
                    rev_content += data.get("text", "")
            except (json.JSONDecodeError, ValueError):
                pass

        # Step 4: QA
        qa_model = self._get_model_for_role("qa")
        qa_agent = self.AGENT_ROLES["qa"]
        qa_messages = [
            {"role": "system", "content": qa_agent["system_prompt"]},
            {"role": "user", "content": f"Код после ревью:\n{rev_content}\n\nОригинальная задача:\n{context}\n\nПроверь и верни финальную версию."}
        ]

        for event in self._stream_agent_response("qa", qa_model, qa_messages):
            yield event


# ── Chat/Send Message (SSE Streaming) ─────────────────────────
@app.route("/api/chats/<chat_id>/send", methods=["POST"])
@require_auth
def send_message(chat_id):
    """Send message and get AI response via SSE streaming."""
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

    # Create orchestrator
    orchestrator = AgentOrchestrator(variant=variant, enhanced=enhanced, chat_model=chat_model)

    # Build chat history for context
    history = [{"role": m["role"], "content": m["content"]} for m in chat["messages"][-10:]]

    def generate():
        full_response = ""
        config = MODEL_CONFIGS.get(variant, MODEL_CONFIGS["premium"])
        model_name = config["coding"]["name"]

        # Send metadata
        yield f"data: {json.dumps({'type': 'meta', 'variant': variant, 'model': model_name, 'enhanced': enhanced})}\n\n"

        # Stream agent responses
        for event in orchestrator.process_task_stream(user_message, history, file_content):
            yield event
            # Capture content
            try:
                event_data = json.loads(event.replace("data: ", "").strip())
                if event_data.get("type") == "content":
                    full_response += event_data.get("text", "")
            except (json.JSONDecodeError, ValueError):
                pass

        # Calculate cost
        tokens_in = orchestrator.total_tokens_in
        tokens_out = orchestrator.total_tokens_out
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
            "enhanced": enhanced
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

        # Save memory (episodic)
        memory = db2.get("memory", {"episodic": [], "semantic": {}, "procedural": {}})
        memory["episodic"].append({
            "task": user_message[:200],
            "result_preview": full_response[:200],
            "cost": total_cost,
            "variant": variant,
            "enhanced": enhanced,
            "timestamp": now,
            "user_id": request.user_id,
            "success": "❌" not in full_response[:100]
        })
        # Keep last 1000 episodes
        if len(memory["episodic"]) > 1000:
            memory["episodic"] = memory["episodic"][-1000:]
        db2["memory"] = memory

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

    # User stats
    user_chats = [c for c in db["chats"].values() if c.get("user_id") == request.user_id]
    user_cost = sum(c.get("total_cost", 0) for c in user_chats)
    user_messages = sum(len(c.get("messages", [])) for c in user_chats)
    user_tokens_in = sum(c.get("total_tokens_in", 0) for c in user_chats)
    user_tokens_out = sum(c.get("total_tokens_out", 0) for c in user_chats)

    # Per-chat stats
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

    # Daily breakdown
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

    # Comparison: programmer vs agent
    avg_task_cost = user_cost / max(len([m for c in user_chats for m in c.get("messages", []) if m.get("role") == "assistant"]), 1)
    programmer_hourly = 50  # $50/hour average
    programmer_task_time = 2  # 2 hours average
    programmer_cost = programmer_hourly * programmer_task_time
    savings_percent = round((1 - avg_task_cost / programmer_cost) * 100, 1) if programmer_cost > 0 else 0

    return jsonify({
        "user": {
            "total_cost": round(user_cost, 4),
            "total_chats": len(user_chats),
            "total_messages": user_messages,
            "tokens_in": user_tokens_in,
            "tokens_out": user_tokens_out,
            "monthly_limit": user.get("monthly_limit", 999999),
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
        # Calculate user spending
        user_chats = [c for c in db["chats"].values() if c.get("user_id") == uid]
        total_cost = sum(c.get("total_cost", 0) for c in user_chats)
        total_chats = len(user_chats)

        users.append({
            "id": uid,
            "email": u["email"],
            "name": u["name"],
            "role": u.get("role", "user"),
            "is_active": u.get("is_active", True),
            "created_at": u.get("created_at", ""),
            "total_spent": round(total_cost, 4),
            "total_chats": total_chats,
            "monthly_limit": u.get("monthly_limit", 999999),
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
    role = data.get("role", "user")
    monthly_limit = data.get("monthly_limit", 100)

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    db = db_read()

    # Check duplicate email
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

    return jsonify({
        "total_users": total_users,
        "active_users": active_users,
        "total_chats": total_chats,
        "total_messages": total_messages,
        "total_cost": analytics.get("total_cost", 0),
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
    """Search episodic memory for similar tasks."""
    data = request.get_json() or {}
    query = data.get("query", "").lower()
    limit = data.get("limit", 5)

    db = db_read()
    episodes = db.get("memory", {}).get("episodic", [])

    # Simple keyword search (in production would use vector similarity)
    results = []
    for ep in reversed(episodes):
        task = ep.get("task", "").lower()
        score = sum(1 for word in query.split() if word in task)
        if score > 0:
            results.append({**ep, "relevance": score})

    results.sort(key=lambda x: x["relevance"], reverse=True)
    return jsonify({"results": results[:limit]})


# ── Export ─────────────────────────────────────────────────────
@app.route("/api/chats/<chat_id>/export", methods=["GET"])
@require_auth
def export_chat(chat_id):
    """Export chat as ZIP with all generated files."""
    db = db_read()
    chat = db["chats"].get(chat_id)
    if not chat or (chat.get("user_id") != request.user_id and request.user.get("role") != "admin"):
        return jsonify({"error": "Chat not found"}), 404

    # Extract code blocks from messages
    files = {}
    for msg in chat.get("messages", []):
        if msg.get("role") == "assistant":
            content = msg.get("content", "")
            # Find code blocks with filenames
            pattern = r'```(\w+)\s+([\w\-./]+\.\w+)\n(.*?)```'
            matches = re.findall(pattern, content, re.DOTALL)
            for lang, filename, code in matches:
                files[filename] = code

            # Also find generic code blocks
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

    # Create ZIP
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
    return jsonify({
        "status": "ok",
        "version": "4.0",
        "name": "Super Agent",
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
