"""
Agent Loop — Ядро автономного агента.
AI получает набор инструментов (tools), сам решает какой вызвать,
выполняет действия (SSH, файлы, браузер), проверяет результат, итерирует.

Архитектура:
1. Пользователь даёт задачу
2. AI-планировщик разбивает на шаги
3. На каждом шаге AI выбирает tool и параметры
4. Tool выполняется реально (SSH, SFTP, HTTP)
5. Результат возвращается AI
6. AI решает: продолжить, исправить, или завершить
7. Все действия стримятся пользователю в реальном времени
"""

import json
import time
import re
import traceback
from datetime import datetime, timezone
import requests as http_requests

from ssh_executor import SSHExecutor, ssh_pool
from browser_agent import BrowserAgent


# ── Tool Definitions for AI ──────────────────────────────────────

TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "ssh_execute",
            "description": "Execute a shell command on a remote server via SSH. Use for: installing packages, running scripts, checking services, deploying code, managing processes, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "host": {
                        "type": "string",
                        "description": "Server IP or hostname to connect to"
                    },
                    "command": {
                        "type": "string",
                        "description": "Shell command to execute on the server"
                    },
                    "username": {
                        "type": "string",
                        "description": "SSH username (default: root)",
                        "default": "root"
                    },
                    "password": {
                        "type": "string",
                        "description": "SSH password for authentication"
                    }
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
                    "host": {
                        "type": "string",
                        "description": "Server IP or hostname"
                    },
                    "path": {
                        "type": "string",
                        "description": "Absolute path where to create/write the file"
                    },
                    "content": {
                        "type": "string",
                        "description": "Full content of the file to write"
                    },
                    "username": {
                        "type": "string",
                        "description": "SSH username (default: root)",
                        "default": "root"
                    },
                    "password": {
                        "type": "string",
                        "description": "SSH password"
                    }
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
                    "host": {
                        "type": "string",
                        "description": "Server IP or hostname"
                    },
                    "path": {
                        "type": "string",
                        "description": "Absolute path of the file to read"
                    },
                    "username": {
                        "type": "string",
                        "description": "SSH username (default: root)",
                        "default": "root"
                    },
                    "password": {
                        "type": "string",
                        "description": "SSH password"
                    }
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
                    "url": {
                        "type": "string",
                        "description": "URL to navigate to"
                    }
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
                    "url": {
                        "type": "string",
                        "description": "URL to check"
                    }
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
                    "url": {
                        "type": "string",
                        "description": "URL to get text from"
                    }
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
                    "url": {
                        "type": "string",
                        "description": "API endpoint URL"
                    },
                    "method": {
                        "type": "string",
                        "description": "HTTP method (GET, POST, PUT, DELETE)",
                        "default": "GET"
                    },
                    "data": {
                        "type": "object",
                        "description": "JSON data to send (for POST/PUT)"
                    }
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
                    "summary": {
                        "type": "string",
                        "description": "Summary of what was accomplished"
                    }
                },
                "required": ["summary"]
            }
        }
    }
]


AGENT_SYSTEM_PROMPT = """Ты — Super Agent v4.0, автономный AI-инженер. Ты ВЫПОЛНЯЕШЬ задачи, а не просто описываешь их.

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

ФОРМАТ ОТВЕТА:
Кратко опиши что собираешься делать, затем вызови нужный инструмент.
Не пиши длинных объяснений — ДЕЙСТВУЙ."""


class AgentLoop:
    """
    Autonomous agent loop that:
    1. Takes user task
    2. Calls AI to plan next action
    3. Executes the action (SSH, file, browser)
    4. Returns result to AI
    5. Repeats until task_complete or max iterations
    """

    MAX_ITERATIONS = 25  # Safety limit
    MAX_TOOL_OUTPUT = 10000  # Max chars from tool output to send back to AI

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

    def stop(self):
        """Request the agent loop to stop."""
        self._stop_requested = True

    def _call_ai(self, messages, tools=None):
        """Call AI model with tool definitions."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://minimax.mksitdev.ru",
            "X-Title": "Super Agent v4.0"
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

        try:
            resp = http_requests.post(
                self.api_url,
                headers=headers,
                json=payload,
                timeout=120
            )
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
            finish_reason = choices[0].get("finish_reason", "")

            return content, tool_calls, None
        except Exception as e:
            return None, None, str(e)

    def _call_ai_stream(self, messages, tools=None):
        """Call AI model with streaming for text content."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://minimax.mksitdev.ru",
            "X-Title": "Super Agent v4.0"
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

        try:
            resp = http_requests.post(
                self.api_url,
                headers=headers,
                json=payload,
                stream=True,
                timeout=120
            )
            resp.raise_for_status()

            content = ""
            tool_calls_data = {}  # id -> {name, arguments}

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

                    # Text content
                    text = delta.get("content", "")
                    if text:
                        content += text
                        yield {"type": "text_delta", "text": text}

                    # Tool calls
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

                    # Usage in final chunk
                    usage = chunk.get("usage")
                    if usage:
                        self.total_tokens_in += usage.get("prompt_tokens", 0)
                        self.total_tokens_out += usage.get("completion_tokens", 0)

                except json.JSONDecodeError:
                    continue

            # Convert tool_calls_data to list format
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
            yield {"type": "error", "error": str(e)}

    def _execute_tool(self, tool_name, arguments):
        """Execute a tool and return the result."""
        try:
            args = json.loads(arguments) if isinstance(arguments, str) else arguments
        except json.JSONDecodeError:
            return {"success": False, "error": f"Invalid JSON arguments: {arguments}"}

        # Get SSH credentials from args or defaults
        host = args.get("host", self.ssh_credentials.get("host", ""))
        username = args.get("username", self.ssh_credentials.get("username", "root"))
        password = args.get("password", self.ssh_credentials.get("password", ""))

        try:
            if tool_name == "ssh_execute":
                command = args.get("command", "")
                if not host or not command:
                    return {"success": False, "error": "host and command are required"}

                ssh = ssh_pool.get_connection(host=host, username=username, password=password)
                result = ssh.execute_command(command, timeout=90)
                return result

            elif tool_name == "file_write":
                path = args.get("path", "")
                content = args.get("content", "")
                if not host or not path:
                    return {"success": False, "error": "host and path are required"}

                ssh = ssh_pool.get_connection(host=host, username=username, password=password)
                result = ssh.file_write(path, content)
                return result

            elif tool_name == "file_read":
                path = args.get("path", "")
                if not host or not path:
                    return {"success": False, "error": "host and path are required"}

                ssh = ssh_pool.get_connection(host=host, username=username, password=password)
                result = ssh.file_read(path)
                # Truncate large files
                if result.get("success") and len(result.get("content", "")) > self.MAX_TOOL_OUTPUT:
                    result["content"] = result["content"][:self.MAX_TOOL_OUTPUT] + "\n... [truncated]"
                return result

            elif tool_name == "browser_navigate":
                url = args.get("url", "")
                if not url:
                    return {"success": False, "error": "url is required"}
                result = self.browser.navigate(url)
                # Truncate HTML
                if result.get("html") and len(result["html"]) > self.MAX_TOOL_OUTPUT:
                    result["html"] = result["html"][:self.MAX_TOOL_OUTPUT] + "... [truncated]"
                return result

            elif tool_name == "browser_check_site":
                url = args.get("url", "")
                if not url:
                    return {"success": False, "error": "url is required"}
                return self.browser.check_site(url)

            elif tool_name == "browser_get_text":
                url = args.get("url", "")
                if not url:
                    return {"success": False, "error": "url is required"}
                result = self.browser.get_text(url)
                if result.get("text") and len(result["text"]) > self.MAX_TOOL_OUTPUT:
                    result["text"] = result["text"][:self.MAX_TOOL_OUTPUT] + "... [truncated]"
                return result

            elif tool_name == "browser_check_api":
                url = args.get("url", "")
                method = args.get("method", "GET")
                data = args.get("data")
                if not url:
                    return {"success": False, "error": "url is required"}
                return self.browser.check_api(url, method=method, data=data)

            elif tool_name == "task_complete":
                summary = args.get("summary", "Task completed")
                return {"success": True, "completed": True, "summary": summary}

            else:
                return {"success": False, "error": f"Unknown tool: {tool_name}"}

        except Exception as e:
            return {"success": False, "error": f"Tool execution error: {str(e)}"}

    def run_stream(self, user_message, chat_history=None, file_content=None):
        """
        Run the agent loop with streaming.
        Yields SSE events for real-time display.
        """
        if chat_history is None:
            chat_history = []

        # Build initial messages
        messages = [{"role": "system", "content": AGENT_SYSTEM_PROMPT}]

        # Add chat history (last 10)
        for msg in chat_history[-10:]:
            messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})

        # Build user message with file content
        full_message = user_message
        if file_content:
            full_message = f"{file_content}\n\n---\n\nЗадача:\n{user_message}"

        # Add SSH credentials hint if available
        if self.ssh_credentials.get("host"):
            creds_hint = f"\n\n[Доступные серверы: {self.ssh_credentials['host']} (user: {self.ssh_credentials.get('username', 'root')})]"
            full_message += creds_hint

        messages.append({"role": "user", "content": full_message})

        # Agent loop
        iteration = 0
        full_response_text = ""

        while iteration < self.MAX_ITERATIONS and not self._stop_requested:
            iteration += 1

            # Yield iteration info
            yield self._sse({"type": "agent_iteration", "iteration": iteration, "max": self.MAX_ITERATIONS})

            # Call AI with tools (streaming)
            tool_calls_received = None
            ai_text = ""

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
                    # No tool calls — AI is done talking
                    break

                elif event["type"] == "error":
                    yield self._sse({"type": "error", "text": f"AI Error: {event['error']}"})
                    return

            # If no tool calls, the agent is done
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

                # Parse args for display
                try:
                    tool_args = json.loads(tool_args_str)
                except:
                    tool_args = {}

                # Yield tool start event
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

                    # Add to messages
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

                # Log action
                self.actions_log.append({
                    "iteration": iteration,
                    "tool": tool_name,
                    "args": self._sanitize_args(tool_args),
                    "success": result.get("success", False),
                    "elapsed": elapsed,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })

                # Yield tool result event
                result_preview = self._preview_result(tool_name, result)
                yield self._sse({
                    "type": "tool_result",
                    "tool": tool_name,
                    "success": result.get("success", False),
                    "preview": result_preview,
                    "elapsed": elapsed
                })

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
            if stdout:
                lines = stdout.split("\n")
                if len(lines) > 50:
                    return "\n".join(lines[:50]) + f"\n... [ещё {len(lines) - 50} строк]"
                return stdout[:3000]
            return "✅ Команда выполнена (пустой вывод)"

        elif tool_name in ("file_write",):
            path = result.get("path", "")
            size = result.get("size", 0)
            return f"✅ Файл создан: {path} ({size} байт)"

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


class MultiAgentLoop(AgentLoop):
    """
    Extended agent loop with multi-agent architecture:
    Architect → Coder → Reviewer → QA
    Each agent has its own system prompt and can use tools.
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

            # Yield agent start
            yield self._sse({
                "type": "agent_start",
                "agent": agent_info["name"],
                "emoji": agent_info["emoji"],
                "role": agent_key
            })

            # Build messages for this agent
            messages = [{
                "role": "system",
                "content": AGENT_SYSTEM_PROMPT + "\n\n" + agent_info["prompt_suffix"]
            }]

            # Add previous agents' results as context
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

            # Run agent loop for this agent (max 8 iterations per agent)
            agent_text = ""
            agent_iteration = 0
            max_agent_iterations = 8

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

                # Process tool calls
                assistant_msg = {"role": "assistant", "content": ai_text or ""}
                assistant_msg["tool_calls"] = tool_calls_received
                messages.append(assistant_msg)

                for tc in tool_calls_received:
                    tool_name = tc["function"]["name"]
                    tool_args_str = tc["function"]["arguments"]
                    tool_id = tc.get("id", f"call_{agent_iteration}")

                    try:
                        tool_args = json.loads(tool_args_str)
                    except:
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

                    result_str = json.dumps(result, ensure_ascii=False)
                    if len(result_str) > self.MAX_TOOL_OUTPUT:
                        result_str = result_str[:self.MAX_TOOL_OUTPUT] + "..."

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_id,
                        "content": result_str
                    })

            agent_results[agent_key] = agent_text

            # Yield agent complete
            yield self._sse({
                "type": "agent_complete",
                "agent": agent_info["name"],
                "role": agent_key
            })
