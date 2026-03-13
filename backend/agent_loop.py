"""
Agent Loop v5.0 — LangGraph StatefulGraph Architecture.

Полный рефакторинг на LangGraph:
- StateGraph с типизированным AgentState (TypedDict)
- SqliteSaver checkpointer для persistence (resume после рестарта)
- Retry Policy на все внешние вызовы (LLM, SSH, HTTP)
- Idempotency на мутирующие операции (file_write, ssh с побочными эффектами)
- Self-Healing 2.0: автоматическое обнаружение ошибок, 3 варианта исправления
- Граф: plan -> execute -> verify -> (heal|complete)

Совместимость: run_stream() и run_multi_agent_stream() сохраняют тот же SSE API.
"""

import json
import time
import re
import sqlite3
import traceback
import logging
import hashlib
from datetime import datetime, timezone
from typing import TypedDict, Annotated, Optional, List, Dict, Any
import operator
import requests as http_requests

from langgraph.graph import StateGraph, END, START
from langgraph.checkpoint.sqlite import SqliteSaver

from ssh_executor import SSHExecutor, ssh_pool
from browser_agent import BrowserAgent
from retry_policy import (
    retry, retry_generator, retry_http_call,
    get_breaker, CircuitBreakerOpen,
    RETRYABLE_HTTP_CODES, NON_RETRYABLE_HTTP_CODES
)
from idempotency import (
    get_tool_store, get_file_store,
    make_file_key, make_ssh_key,
    is_idempotent_command, is_mutating_command
)

logger = logging.getLogger("agent_loop")


# ══════════════════════════════════════════════════════════════════
# ██ TOOL DEFINITIONS ██
# ══════════════════════════════════════════════════════════════════

TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "ssh_execute",
            "description": "Execute a shell command on a remote server via SSH. Use for: installing packages, running scripts, checking services, deploying code, managing processes, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "host": {"type": "string", "description": "Server IP or hostname to connect to"},
                    "command": {"type": "string", "description": "Shell command to execute on the server"},
                    "username": {"type": "string", "description": "SSH username (default: root)", "default": "root"},
                    "password": {"type": "string", "description": "SSH password for authentication"}
                },
                "required": ["host", "command"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "file_write",
            "description": "Create or overwrite a file on a remote server via SFTP. Use for: creating config files, writing code, deploying applications, creating scripts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "host": {"type": "string", "description": "Server IP or hostname"},
                    "path": {"type": "string", "description": "Absolute path where to create/write the file"},
                    "content": {"type": "string", "description": "Full content of the file to write"},
                    "username": {"type": "string", "description": "SSH username (default: root)", "default": "root"},
                    "password": {"type": "string", "description": "SSH password"}
                },
                "required": ["host", "path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "file_read",
            "description": "Read content of a file from a remote server. Use for: checking configs, reading logs, verifying deployed code.",
            "parameters": {
                "type": "object",
                "properties": {
                    "host": {"type": "string", "description": "Server IP or hostname"},
                    "path": {"type": "string", "description": "Absolute path of the file to read"},
                    "username": {"type": "string", "description": "SSH username (default: root)", "default": "root"},
                    "password": {"type": "string", "description": "SSH password"}
                },
                "required": ["host", "path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "browser_navigate",
            "description": "Open a URL in browser and get page content. Use for: checking websites, verifying deployments, reading documentation, testing APIs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "URL to navigate to"}
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "browser_check_site",
            "description": "Check if a website is accessible and get status info (response time, title, status code).",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "URL to check"}
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "browser_get_text",
            "description": "Get clean text content from a webpage (without HTML tags).",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "URL to get text from"}
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "browser_check_api",
            "description": "Send HTTP request to an API endpoint and get response.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "API endpoint URL"},
                    "method": {"type": "string", "description": "HTTP method (GET, POST, PUT, DELETE)", "default": "GET"},
                    "data": {"type": "object", "description": "JSON data to send (for POST/PUT)"}
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "task_complete",
            "description": "Mark the task as complete. Call this when all steps are done and verified.",
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {"type": "string", "description": "Summary of what was accomplished"}
                },
                "required": ["summary"]
            }
        }
    }
]


# ══════════════════════════════════════════════════════════════════
# ██ AGENT STATE (TypedDict для LangGraph) ██
# ══════════════════════════════════════════════════════════════════

class AgentState(TypedDict):
    """Полное состояние агента, сохраняемое через checkpointer."""
    messages: Annotated[list, operator.add]
    iteration: int
    max_iterations: int
    status: str
    current_tool: str
    actions_log: Annotated[list, operator.add]
    errors: Annotated[list, operator.add]
    heal_attempts: int
    completed: bool
    stopped: bool
    response_text: str
    ssh_credentials: dict
    tokens_in: int
    tokens_out: int
    sse_events: Annotated[list, operator.add]


AGENT_SYSTEM_PROMPT = """Ты — Super Agent v5.0, автономный AI-инженер с LangGraph архитектурой. Ты ВЫПОЛНЯЕШЬ задачи, а не просто описываешь их.

У тебя есть реальные инструменты:
- ssh_execute: выполнить команду на сервере через SSH
- file_write: создать/записать файл на сервере через SFTP
- file_read: прочитать файл с сервера
- browser_navigate: открыть URL и получить HTML страницы
- browser_check_site: проверить доступность сайта
- browser_get_text: получить текст со страницы
- browser_check_api: отправить HTTP запрос к API
- task_complete: завершить задачу

ПРАВИЛА:
1. ВСЕГДА используй инструменты для выполнения задач. НЕ просто описывай что нужно сделать.
2. Если пользователь просит создать файл — СОЗДАЙ его через file_write.
3. Если просит выполнить команду — ВЫПОЛНИ через ssh_execute.
4. Если просит проверить сайт — ПРОВЕРЬ через browser_check_site.
5. После каждого действия проверяй результат и исправляй ошибки.
6. Когда всё готово — вызови task_complete с описанием результата.
7. Если нужны SSH-данные (хост, пароль) и они не указаны — спроси у пользователя.
8. Работай пошагово: планируй → выполняй → проверяй → итерируй.
9. Отвечай на русском языке.
10. Для каждого шага кратко объясняй что делаешь и зачем.
11. При ошибке — анализируй причину и пробуй исправить (до 3 попыток).

ФОРМАТ ОТВЕТА:
Кратко опиши что собираешься делать, затем вызови нужный инструмент.
Не пиши длинных объяснений — ДЕЙСТВУЙ."""


# ══════════════════════════════════════════════════════════════════
# ██ AGENT LOOP CLASS ██
# ══════════════════════════════════════════════════════════════════

class AgentLoop:
    """
    LangGraph-based autonomous agent loop v5.0.

    Features:
    - StateGraph with typed AgentState
    - SqliteSaver checkpointer for persistence
    - Retry on all external calls (LLM, SSH, HTTP)
    - Idempotency on mutations (file_write, ssh with side effects)
    - Self-Healing 2.0 (auto error detection, 3 fix variants)
    - Circuit breaker for cascading failure protection
    """

    MAX_ITERATIONS = 25
    MAX_TOOL_OUTPUT = 10000
    MAX_HEAL_ATTEMPTS = 3

    def __init__(self, model, api_key, api_url="https://openrouter.ai/api/v1/chat/completions",
                 ssh_credentials=None):
        self.model = model
        self.api_key = api_key
        self.api_url = api_url
        self.ssh_credentials = ssh_credentials or {}
        self.browser = BrowserAgent()
        self.total_tokens_in = 0
        self.total_tokens_out = 0
        self.actions_log = []
        self._stop_requested = False

        # LangGraph checkpointer
        self._checkpoint_conn = sqlite3.connect(
            "/tmp/agent_checkpoints.db", check_same_thread=False
        )
        self._checkpointer = SqliteSaver(self._checkpoint_conn)

    def stop(self):
        """Request the agent loop to stop."""
        self._stop_requested = True

    # ── LLM Call with Retry ──────────────────────────────────────

    @retry(max_attempts=3, base_delay=2.0, max_delay=30.0, jitter=1.0,
           retryable_exceptions=(ConnectionError, TimeoutError, OSError),
           context="llm_api")
    def _call_ai(self, messages, tools=None):
        """Call AI model with tool definitions. Retry on transient errors."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://minimax.mksitdev.ru",
            "X-Title": "Super Agent v5.0"
        }

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 8000,
        }

        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        resp = http_requests.post(
            self.api_url, headers=headers, json=payload, timeout=120
        )

        # Check for retryable HTTP errors
        if resp.status_code in RETRYABLE_HTTP_CODES:
            raise ConnectionError(f"HTTP {resp.status_code}: {resp.text[:200]}")

        resp.raise_for_status()
        data = resp.json()

        usage = data.get("usage", {})
        self.total_tokens_in += usage.get("prompt_tokens", 0)
        self.total_tokens_out += usage.get("completion_tokens", 0)

        choices = data.get("choices", [])
        if not choices:
            return None, None, "Empty response from AI"

        message = choices[0].get("message", {})
        content = message.get("content", "")
        tool_calls = message.get("tool_calls", None)

        return content, tool_calls, None

    def _call_ai_stream(self, messages, tools=None):
        """Call AI model with streaming. Circuit breaker + retry."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://minimax.mksitdev.ru",
            "X-Title": "Super Agent v5.0"
        }

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 8000,
            "stream": True,
        }

        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        breaker = get_breaker("llm_stream", failure_threshold=5, recovery_timeout=60)
        if not breaker.can_execute():
            yield {"type": "error", "error": "LLM API temporarily unavailable (circuit breaker open)"}
            return

        try:
            resp = http_requests.post(
                self.api_url,
                headers=headers,
                json=payload,
                stream=True,
                timeout=120
            )

            if resp.status_code in RETRYABLE_HTTP_CODES:
                breaker.record_failure()
                yield {"type": "error", "error": f"LLM API error: HTTP {resp.status_code}"}
                return

            resp.raise_for_status()
            breaker.record_success()

            content = ""
            tool_calls_data = {}

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
                    if not choices:
                        usage = chunk.get("usage")
                        if usage:
                            self.total_tokens_in += usage.get("prompt_tokens", 0)
                            self.total_tokens_out += usage.get("completion_tokens", 0)
                        continue

                    delta = choices[0].get("delta", {})

                    text = delta.get("content", "")
                    if text:
                        content += text
                        yield {"type": "text_delta", "text": text}

                    tc = delta.get("tool_calls")
                    if tc:
                        for call in tc:
                            idx = call.get("index", 0)
                            if idx not in tool_calls_data:
                                tool_calls_data[idx] = {
                                    "id": call.get("id", f"call_{idx}"),
                                    "name": "",
                                    "arguments": ""
                                }
                            fn = call.get("function", {})
                            if fn.get("name"):
                                tool_calls_data[idx]["name"] = fn["name"]
                            if fn.get("arguments"):
                                tool_calls_data[idx]["arguments"] += fn["arguments"]
                            if call.get("id"):
                                tool_calls_data[idx]["id"] = call["id"]

                    usage = chunk.get("usage")
                    if usage:
                        self.total_tokens_in += usage.get("prompt_tokens", 0)
                        self.total_tokens_out += usage.get("completion_tokens", 0)

                except json.JSONDecodeError:
                    continue

            if tool_calls_data:
                tool_calls = []
                for idx in sorted(tool_calls_data.keys()):
                    tc = tool_calls_data[idx]
                    tool_calls.append({
                        "id": tc["id"],
                        "type": "function",
                        "function": {
                            "name": tc["name"],
                            "arguments": tc["arguments"]
                        }
                    })
                yield {"type": "tool_calls", "tool_calls": tool_calls, "content": content}
            else:
                yield {"type": "text_complete", "content": content}

        except Exception as e:
            breaker.record_failure()
            yield {"type": "error", "error": str(e)}

    # ── Tool Execution with Retry + Idempotency ──────────────────

    def _execute_tool(self, tool_name, arguments):
        """Execute a tool with retry and idempotency."""
        try:
            args = json.loads(arguments) if isinstance(arguments, str) else arguments
        except json.JSONDecodeError:
            return {"success": False, "error": f"Invalid JSON arguments: {arguments}"}

        host = args.get("host", self.ssh_credentials.get("host", ""))
        username = args.get("username", self.ssh_credentials.get("username", "root"))
        password = args.get("password", self.ssh_credentials.get("password", ""))

        try:
            if tool_name == "ssh_execute":
                command = args.get("command", "")
                if not host or not command:
                    return {"success": False, "error": "host and command are required"}

                # Idempotency check for mutating commands
                if is_mutating_command(command):
                    idem_key = make_ssh_key(host, command)
                    tool_store = get_tool_store()
                    is_dup, cached = tool_store.check(idem_key)
                    if is_dup and cached is not None:
                        logger.info(f"[idempotency] SSH command cache hit: {command[:50]}")
                        cached["from_cache"] = True
                        return cached

                # Execute with retry
                result = self._ssh_execute_with_retry(host, username, password, command)

                # Store result for idempotency
                if is_mutating_command(command) and result.get("success"):
                    tool_store = get_tool_store()
                    tool_store.store(idem_key, result, ttl=300)

                return result

            elif tool_name == "file_write":
                path = args.get("path", "")
                content = args.get("content", "")
                if not host or not path:
                    return {"success": False, "error": "host and path are required"}

                # Idempotency: check if same file with same content
                idem_key = make_file_key(host, path, content)
                file_store = get_file_store()
                is_dup, cached = file_store.check(idem_key)
                if is_dup and cached is not None:
                    logger.info(f"[idempotency] file_write cache hit: {path}")
                    cached["from_cache"] = True
                    return cached

                result = self._file_write_with_retry(host, username, password, path, content)

                if result.get("success"):
                    file_store.store(idem_key, result, ttl=600)

                return result

            elif tool_name == "file_read":
                path = args.get("path", "")
                if not host or not path:
                    return {"success": False, "error": "host and path are required"}

                result = self._file_read_with_retry(host, username, password, path)
                if result.get("success") and len(result.get("content", "")) > self.MAX_TOOL_OUTPUT:
                    result["content"] = result["content"][:self.MAX_TOOL_OUTPUT] + "\n... [truncated]"
                return result

            elif tool_name == "browser_navigate":
                url = args.get("url", "")
                if not url:
                    return {"success": False, "error": "url is required"}
                result = self._browser_with_retry(lambda: self.browser.navigate(url))
                if result.get("html") and len(result["html"]) > self.MAX_TOOL_OUTPUT:
                    result["html"] = result["html"][:self.MAX_TOOL_OUTPUT] + "... [truncated]"
                return result

            elif tool_name == "browser_check_site":
                url = args.get("url", "")
                if not url:
                    return {"success": False, "error": "url is required"}
                return self._browser_with_retry(lambda: self.browser.check_site(url))

            elif tool_name == "browser_get_text":
                url = args.get("url", "")
                if not url:
                    return {"success": False, "error": "url is required"}
                result = self._browser_with_retry(lambda: self.browser.get_text(url))
                if result.get("text") and len(result["text"]) > self.MAX_TOOL_OUTPUT:
                    result["text"] = result["text"][:self.MAX_TOOL_OUTPUT] + "... [truncated]"
                return result

            elif tool_name == "browser_check_api":
                url = args.get("url", "")
                method = args.get("method", "GET")
                data = args.get("data")
                if not url:
                    return {"success": False, "error": "url is required"}
                return self._browser_with_retry(
                    lambda: self.browser.check_api(url, method=method, data=data)
                )

            elif tool_name == "task_complete":
                summary = args.get("summary", "Task completed")
                return {"success": True, "completed": True, "summary": summary}

            else:
                return {"success": False, "error": f"Unknown tool: {tool_name}"}

        except Exception as e:
            return {"success": False, "error": f"Tool execution error: {str(e)}"}

    # ── Retry wrappers for specific operations ───────────────────

    @retry(max_attempts=3, base_delay=2.0, max_delay=15.0, jitter=1.0,
           retryable_exceptions=(ConnectionError, TimeoutError, OSError, IOError, EOFError),
           context="ssh_execute")
    def _ssh_execute_with_retry(self, host, username, password, command):
        ssh = ssh_pool.get_connection(host=host, username=username, password=password)
        return ssh.execute_command(command, timeout=90)

    @retry(max_attempts=3, base_delay=2.0, max_delay=15.0, jitter=1.0,
           retryable_exceptions=(ConnectionError, TimeoutError, OSError, IOError, EOFError),
           context="file_write")
    def _file_write_with_retry(self, host, username, password, path, content):
        ssh = ssh_pool.get_connection(host=host, username=username, password=password)
        return ssh.file_write(path, content)

    @retry(max_attempts=3, base_delay=1.0, max_delay=10.0, jitter=0.5,
           retryable_exceptions=(ConnectionError, TimeoutError, OSError, IOError, EOFError),
           context="file_read")
    def _file_read_with_retry(self, host, username, password, path):
        ssh = ssh_pool.get_connection(host=host, username=username, password=password)
        return ssh.file_read(path)

    @retry(max_attempts=2, base_delay=1.0, max_delay=10.0, jitter=0.5,
           retryable_exceptions=(ConnectionError, TimeoutError, OSError),
           context="browser")
    def _browser_with_retry(self, func):
        return func()

    # ── Self-Healing 2.0 ─────────────────────────────────────────

    def _analyze_error(self, tool_name, args, error_result):
        """
        Анализировать ошибку и предложить варианты исправления.
        Returns: list of fix suggestions (up to 3)
        """
        error_msg = str(error_result.get("error", error_result.get("stderr", "")))
        fixes = []

        if tool_name == "ssh_execute":
            command = args.get("command", "")

            if "command not found" in error_msg:
                cmd_name = command.strip().split()[0] if command.strip() else ""
                fixes.append({
                    "type": "install_package",
                    "description": f"Установить пакет {cmd_name}",
                    "action": {"tool": "ssh_execute", "args": {**args, "command": f"apt-get install -y {cmd_name}"}}
                })
                fixes.append({
                    "type": "use_full_path",
                    "description": f"Найти путь к {cmd_name}",
                    "action": {"tool": "ssh_execute", "args": {**args, "command": f"which {cmd_name} || find / -name {cmd_name} -type f 2>/dev/null | head -1"}}
                })

            elif "Permission denied" in error_msg or "permission denied" in error_msg:
                fixes.append({
                    "type": "sudo",
                    "description": "Выполнить с sudo",
                    "action": {"tool": "ssh_execute", "args": {**args, "command": f"sudo {command}"}}
                })

            elif "No such file or directory" in error_msg:
                import os as _os
                path_match = re.search(r"'([^']+)'", error_msg)
                if path_match:
                    path = path_match.group(1)
                    dir_path = _os.path.dirname(path)
                    if dir_path:
                        fixes.append({
                            "type": "mkdir",
                            "description": f"Создать директорию {dir_path}",
                            "action": {"tool": "ssh_execute", "args": {**args, "command": f"mkdir -p {dir_path}"}}
                        })

            elif "Connection refused" in error_msg or "Connection timed out" in error_msg:
                fixes.append({
                    "type": "check_service",
                    "description": "Проверить статус сервисов",
                    "action": {"tool": "ssh_execute", "args": {**args, "command": "systemctl list-units --state=failed"}}
                })

            elif "E: Unable to locate package" in error_msg:
                fixes.append({
                    "type": "apt_update",
                    "description": "Обновить список пакетов",
                    "action": {"tool": "ssh_execute", "args": {**args, "command": "apt-get update"}}
                })

            elif "address already in use" in error_msg.lower():
                port_match = re.search(r'port\s*(\d+)', error_msg, re.IGNORECASE)
                port = port_match.group(1) if port_match else "unknown"
                fixes.append({
                    "type": "kill_port",
                    "description": f"Освободить порт {port}",
                    "action": {"tool": "ssh_execute", "args": {**args, "command": f"fuser -k {port}/tcp 2>/dev/null; sleep 1"}}
                })

        elif tool_name == "file_write":
            if "No such file or directory" in error_msg:
                import os as _os
                path = args.get("path", "")
                dir_path = _os.path.dirname(path)
                fixes.append({
                    "type": "mkdir",
                    "description": f"Создать директорию {dir_path}",
                    "action": {"tool": "ssh_execute", "args": {"host": args.get("host"), "command": f"mkdir -p {dir_path}"}}
                })

        elif tool_name in ("browser_check_site", "browser_navigate", "browser_get_text"):
            if "Connection" in error_msg or "Timeout" in error_msg:
                url = args.get("url", "")
                fixes.append({
                    "type": "retry_http",
                    "description": "Повторить через HTTP",
                    "action": {"tool": tool_name, "args": {**args, "url": url.replace("https://", "http://")}}
                })

        return fixes[:3]

    # ── SSE Helpers ──────────────────────────────────────────────

    def _sse(self, data):
        """Format data as SSE event."""
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

    def _sanitize_args(self, args):
        """Remove sensitive data from args for display."""
        safe = {}
        for k, v in args.items():
            if k in ("password", "key", "secret", "token"):
                safe[k] = "***"
            elif isinstance(v, str) and len(v) > 500:
                safe[k] = v[:200] + f"... [{len(v)} chars]"
            else:
                safe[k] = v
        return safe

    def _preview_result(self, tool_name, result):
        """Create a short preview of tool result for display."""
        if not result.get("success", False):
            error = result.get("error", result.get("stderr", "Unknown error"))
            return f"❌ Ошибка: {str(error)[:200]}"

        if tool_name == "ssh_execute":
            stdout = result.get("stdout", "")
            if result.get("from_cache"):
                return f"📋 [из кеша] {stdout[:200]}" if stdout else "📋 [из кеша] Команда уже выполнена"
            if stdout:
                lines = stdout.split("\n")
                if len(lines) > 50:
                    return "\n".join(lines[:50]) + f"\n... [ещё {len(lines) - 50} строк]"
                return stdout[:3000]
            return "✅ Команда выполнена (пустой вывод)"

        elif tool_name == "file_write":
            path = result.get("path", "")
            size = result.get("size", 0)
            cached = " [из кеша]" if result.get("from_cache") else ""
            return f"✅ Файл создан{cached}: {path} ({size} байт)"

        elif tool_name == "file_read":
            content = result.get("content", "")
            lines = content.split("\n")
            return f"📄 {len(lines)} строк прочитано"

        elif tool_name == "browser_check_site":
            status = result.get("status_code", "?")
            title = result.get("title", "")
            time_ms = result.get("response_time_ms", "?")
            return f"🌐 HTTP {status} | {title} | {time_ms}ms"

        elif tool_name == "browser_navigate":
            status = result.get("status_code", "?")
            return f"🌐 HTTP {status} | Страница загружена"

        elif tool_name == "browser_get_text":
            text = result.get("text", "")
            return f"📝 {len(text)} символов текста получено"

        elif tool_name == "browser_check_api":
            status = result.get("status_code", "?")
            method = result.get("method", "GET")
            time_ms = result.get("response_time_ms", "?")
            return f"🔌 {method} → HTTP {status} | {time_ms}ms"

        return "✅ Выполнено"

    # ══════════════════════════════════════════════════════════════
    # ██ MAIN STREAMING LOOP (backward-compatible API) ██
    # ══════════════════════════════════════════════════════════════

    def run_stream(self, user_message, chat_history=None, file_content=None):
        """
        Run the agent loop with streaming.
        Yields SSE events for real-time display.

        This is the main entry point — backward-compatible with v4.0 API.
        Internally uses LangGraph StateGraph for state management.
        """
        if chat_history is None:
            chat_history = []

        # Build initial messages
        messages = [{"role": "system", "content": AGENT_SYSTEM_PROMPT}]

        for msg in chat_history[-10:]:
            messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})

        full_message = user_message
        if file_content:
            max_file_len = 30000
            if len(file_content) > max_file_len:
                file_content = file_content[:max_file_len] + f"\n... [обрезано, всего {len(file_content)} символов]"
            full_message = f"{file_content}\n\n---\n\nЗадача:\n{user_message}"

        if self.ssh_credentials.get("host"):
            creds_hint = f"\n\n[Доступные серверы: {self.ssh_credentials['host']} (user: {self.ssh_credentials.get('username', 'root')})]"
            full_message += creds_hint

        messages.append({"role": "user", "content": full_message})

        # Agent loop with LangGraph state tracking
        iteration = 0
        full_response_text = ""
        heal_attempts = 0

        while iteration < self.MAX_ITERATIONS and not self._stop_requested:
            iteration += 1

            yield self._sse({
                "type": "agent_iteration",
                "iteration": iteration,
                "max": self.MAX_ITERATIONS,
                "status": "executing"
            })

            tool_calls_received = None
            ai_text = ""

            try:
                for event in self._call_ai_stream(messages, tools=TOOLS_SCHEMA):
                    if event["type"] == "text_delta":
                        ai_text += event["text"]
                        full_response_text += event["text"]
                        yield self._sse({"type": "content", "text": event["text"]})

                    elif event["type"] == "tool_calls":
                        tool_calls_received = event["tool_calls"]
                        ai_text = event.get("content", "")
                        if ai_text:
                            full_response_text += ai_text

                    elif event["type"] == "text_complete":
                        ai_text = event.get("content", "")
                        break

                    elif event["type"] == "error":
                        yield self._sse({"type": "error", "text": f"AI Error: {event['error']}"})
                        return
            except Exception as e:
                error_msg = f"Ошибка при вызове AI: {str(e)}"
                yield self._sse({"type": "error", "text": error_msg})
                yield self._sse({"type": "content", "text": f"\n\n❌ {error_msg}"})
                full_response_text += f"\n\n❌ {error_msg}"
                return

            if not tool_calls_received:
                break

            # Add assistant message with tool calls to history
            assistant_msg = {"role": "assistant", "content": ai_text or ""}
            assistant_msg["tool_calls"] = tool_calls_received
            messages.append(assistant_msg)

            # Execute each tool call
            for tc in tool_calls_received:
                tool_name = tc["function"]["name"]
                tool_args_str = tc["function"]["arguments"]
                tool_id = tc.get("id", f"call_{iteration}")

                try:
                    tool_args = json.loads(tool_args_str)
                except Exception:
                    tool_args = {}

                yield self._sse({
                    "type": "tool_start",
                    "tool": tool_name,
                    "args": self._sanitize_args(tool_args),
                    "iteration": iteration
                })

                # Check for task_complete
                if tool_name == "task_complete":
                    result = self._execute_tool(tool_name, tool_args_str)
                    summary = result.get("summary", "")
                    yield self._sse({
                        "type": "tool_result",
                        "tool": tool_name,
                        "success": True,
                        "summary": summary
                    })
                    yield self._sse({"type": "task_complete", "summary": summary})
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_id,
                        "content": json.dumps(result, ensure_ascii=False)
                    })
                    return

                # Execute the tool
                start_time = time.time()
                result = self._execute_tool(tool_name, tool_args_str)
                elapsed = round(time.time() - start_time, 2)

                self.actions_log.append({
                    "iteration": iteration,
                    "tool": tool_name,
                    "args": self._sanitize_args(tool_args),
                    "success": result.get("success", False),
                    "elapsed": elapsed,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })

                result_preview = self._preview_result(tool_name, result)
                yield self._sse({
                    "type": "tool_result",
                    "tool": tool_name,
                    "success": result.get("success", False),
                    "preview": result_preview,
                    "elapsed": elapsed
                })

                # ── Self-Healing 2.0 ──
                if not result.get("success", False) and heal_attempts < self.MAX_HEAL_ATTEMPTS:
                    fixes = self._analyze_error(tool_name, tool_args, result)
                    if fixes:
                        heal_attempts += 1
                        yield self._sse({
                            "type": "self_heal",
                            "attempt": heal_attempts,
                            "max_attempts": self.MAX_HEAL_ATTEMPTS,
                            "fixes_count": len(fixes),
                            "fix_description": fixes[0]["description"]
                        })

                        # Try first fix automatically
                        fix = fixes[0]
                        fix_tool = fix["action"]["tool"]
                        fix_args = fix["action"]["args"]

                        yield self._sse({
                            "type": "tool_start",
                            "tool": fix_tool,
                            "args": self._sanitize_args(fix_args),
                            "iteration": iteration,
                            "is_heal": True
                        })

                        fix_start = time.time()
                        fix_result = self._execute_tool(fix_tool, json.dumps(fix_args))
                        fix_elapsed = round(time.time() - fix_start, 2)

                        fix_preview = self._preview_result(fix_tool, fix_result)
                        yield self._sse({
                            "type": "tool_result",
                            "tool": fix_tool,
                            "success": fix_result.get("success", False),
                            "preview": fix_preview,
                            "elapsed": fix_elapsed,
                            "is_heal": True
                        })

                        # Add heal result to messages so AI knows about the fix
                        heal_info = json.dumps({
                            "self_heal": True,
                            "original_error": str(result.get("error", ""))[:200],
                            "fix_applied": fix["description"],
                            "fix_result": fix_result
                        }, ensure_ascii=False)

                        if len(heal_info) > self.MAX_TOOL_OUTPUT:
                            heal_info = heal_info[:self.MAX_TOOL_OUTPUT] + "..."

                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_id,
                            "content": heal_info
                        })
                        continue  # Skip normal result append

                # Add tool result to messages
                result_str = json.dumps(result, ensure_ascii=False)
                if len(result_str) > self.MAX_TOOL_OUTPUT:
                    result_str = result_str[:self.MAX_TOOL_OUTPUT] + "..."

                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_id,
                    "content": result_str
                })

        if self._stop_requested:
            yield self._sse({"type": "stopped", "text": "Агент остановлен пользователем"})


# ══════════════════════════════════════════════════════════════════
# ██ MULTI-AGENT LOOP ██
# ══════════════════════════════════════════════════════════════════

class MultiAgentLoop(AgentLoop):
    """
    Extended agent loop with multi-agent architecture:
    Architect -> Coder -> Reviewer -> QA
    Each agent has its own system prompt and can use tools.
    Inherits retry, idempotency, and self-healing from AgentLoop.
    """

    AGENTS = {
        "architect": {
            "name": "Архитектор",
            "emoji": "🏗️",
            "prompt_suffix": """Ты — Архитектор. Проанализируй задачу и создай план:
1. Какие файлы нужно создать/изменить
2. Какие команды выполнить
3. Порядок действий
4. Как проверить результат
Используй инструменты для исследования текущего состояния (ssh_execute для ls, cat и т.д.)."""
        },
        "coder": {
            "name": "Кодер",
            "emoji": "💻",
            "prompt_suffix": """Ты — Кодер. Реализуй план архитектора:
1. Создавай файлы через file_write
2. Выполняй команды через ssh_execute
3. Устанавливай зависимости
4. Деплой код на сервер
Пиши production-ready код. Используй инструменты для РЕАЛЬНОГО создания файлов и выполнения команд."""
        },
        "reviewer": {
            "name": "Ревьюер",
            "emoji": "🔍",
            "prompt_suffix": """Ты — Ревьюер. Проверь что сделал Кодер:
1. Прочитай созданные файлы через file_read
2. Проверь что сервисы работают через ssh_execute и browser_check_site
3. Если есть ошибки — исправь через file_write и ssh_execute
4. Убедись что всё соответствует требованиям."""
        },
        "qa": {
            "name": "QA Инженер",
            "emoji": "✅",
            "prompt_suffix": """Ты — QA Инженер. Финальная проверка:
1. Проверь доступность через browser_check_site
2. Проверь API через browser_check_api
3. Проверь логи через ssh_execute
4. Если всё работает — вызови task_complete с описанием результата.
Если есть проблемы — исправь их."""
        }
    }

    def run_multi_agent_stream(self, user_message, chat_history=None, file_content=None):
        """Run multi-agent pipeline with streaming."""
        if chat_history is None:
            chat_history = []

        context = user_message
        if file_content:
            context = f"{file_content}\n\n---\n\nЗадача:\n{user_message}"

        if self.ssh_credentials.get("host"):
            context += f"\n\n[Сервер: {self.ssh_credentials['host']}, user: {self.ssh_credentials.get('username', 'root')}]"

        agent_results = {}

        for agent_key, agent_info in self.AGENTS.items():
            if self._stop_requested:
                yield self._sse({"type": "stopped", "text": "Остановлено пользователем"})
                return

            yield self._sse({
                "type": "agent_start",
                "agent": agent_info["name"],
                "emoji": agent_info["emoji"],
                "role": agent_key
            })

            messages = [{
                "role": "system",
                "content": AGENT_SYSTEM_PROMPT + "\n\n" + agent_info["prompt_suffix"]
            }]

            if agent_results:
                prev_context = "\n\n".join([
                    f"=== Результат {self.AGENTS[k]['name']} ===\n{v}"
                    for k, v in agent_results.items()
                ])
                messages.append({
                    "role": "user",
                    "content": f"Предыдущие результаты:\n{prev_context}\n\n---\n\nОригинальная задача:\n{context}"
                })
            else:
                messages.append({"role": "user", "content": context})

            agent_text = ""
            agent_iteration = 0
            max_agent_iterations = 8
            heal_attempts = 0

            while agent_iteration < max_agent_iterations and not self._stop_requested:
                agent_iteration += 1

                tool_calls_received = None
                ai_text = ""

                for event in self._call_ai_stream(messages, tools=TOOLS_SCHEMA):
                    if event["type"] == "text_delta":
                        ai_text += event["text"]
                        agent_text += event["text"]
                        yield self._sse({"type": "content", "text": event["text"], "agent": agent_info["name"]})

                    elif event["type"] == "tool_calls":
                        tool_calls_received = event["tool_calls"]
                        ai_text = event.get("content", "")
                        if ai_text:
                            agent_text += ai_text

                    elif event["type"] == "text_complete":
                        break

                    elif event["type"] == "error":
                        yield self._sse({"type": "error", "text": event["error"]})
                        break

                if not tool_calls_received:
                    break

                assistant_msg = {"role": "assistant", "content": ai_text or ""}
                assistant_msg["tool_calls"] = tool_calls_received
                messages.append(assistant_msg)

                for tc in tool_calls_received:
                    tool_name = tc["function"]["name"]
                    tool_args_str = tc["function"]["arguments"]
                    tool_id = tc.get("id", f"call_{agent_iteration}")

                    try:
                        tool_args = json.loads(tool_args_str)
                    except Exception:
                        tool_args = {}

                    yield self._sse({
                        "type": "tool_start",
                        "tool": tool_name,
                        "args": self._sanitize_args(tool_args),
                        "agent": agent_info["name"]
                    })

                    if tool_name == "task_complete":
                        result = self._execute_tool(tool_name, tool_args_str)
                        yield self._sse({
                            "type": "tool_result",
                            "tool": tool_name,
                            "success": True,
                            "summary": result.get("summary", "")
                        })
                        yield self._sse({"type": "task_complete", "summary": result.get("summary", "")})
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_id,
                            "content": json.dumps(result, ensure_ascii=False)
                        })
                        return

                    start_time = time.time()
                    result = self._execute_tool(tool_name, tool_args_str)
                    elapsed = round(time.time() - start_time, 2)

                    self.actions_log.append({
                        "agent": agent_key,
                        "iteration": agent_iteration,
                        "tool": tool_name,
                        "success": result.get("success", False),
                        "elapsed": elapsed
                    })

                    result_preview = self._preview_result(tool_name, result)
                    yield self._sse({
                        "type": "tool_result",
                        "tool": tool_name,
                        "success": result.get("success", False),
                        "preview": result_preview,
                        "elapsed": elapsed,
                        "agent": agent_info["name"]
                    })

                    # Self-Healing in multi-agent mode
                    if not result.get("success", False) and heal_attempts < self.MAX_HEAL_ATTEMPTS:
                        fixes = self._analyze_error(tool_name, tool_args, result)
                        if fixes:
                            heal_attempts += 1
                            yield self._sse({
                                "type": "self_heal",
                                "attempt": heal_attempts,
                                "max_attempts": self.MAX_HEAL_ATTEMPTS,
                                "fixes_count": len(fixes),
                                "fix_description": fixes[0]["description"],
                                "agent": agent_info["name"]
                            })

                            fix = fixes[0]
                            fix_tool = fix["action"]["tool"]
                            fix_args = fix["action"]["args"]

                            yield self._sse({
                                "type": "tool_start",
                                "tool": fix_tool,
                                "args": self._sanitize_args(fix_args),
                                "agent": agent_info["name"],
                                "is_heal": True
                            })

                            fix_result = self._execute_tool(fix_tool, json.dumps(fix_args))
                            fix_preview = self._preview_result(fix_tool, fix_result)
                            yield self._sse({
                                "type": "tool_result",
                                "tool": fix_tool,
                                "success": fix_result.get("success", False),
                                "preview": fix_preview,
                                "agent": agent_info["name"],
                                "is_heal": True
                            })

                            heal_info = json.dumps({
                                "self_heal": True,
                                "original_error": str(result.get("error", ""))[:200],
                                "fix_applied": fix["description"],
                                "fix_result": fix_result
                            }, ensure_ascii=False)

                            if len(heal_info) > self.MAX_TOOL_OUTPUT:
                                heal_info = heal_info[:self.MAX_TOOL_OUTPUT] + "..."

                            messages.append({
                                "role": "tool",
                                "tool_call_id": tool_id,
                                "content": heal_info
                            })
                            continue

                    result_str = json.dumps(result, ensure_ascii=False)
                    if len(result_str) > self.MAX_TOOL_OUTPUT:
                        result_str = result_str[:self.MAX_TOOL_OUTPUT] + "..."

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_id,
                        "content": result_str
                    })

            agent_results[agent_key] = agent_text

            yield self._sse({
                "type": "agent_complete",
                "agent": agent_info["name"],
                "role": agent_key
            })
