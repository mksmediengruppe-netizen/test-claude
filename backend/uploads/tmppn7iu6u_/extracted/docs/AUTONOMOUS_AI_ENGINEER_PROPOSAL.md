# 🤖 Альтернативная архитектура: Автономный AI-Инженер

**Цель:** Создать систему, которая полностью автономно решает любые задачи:
- Ходит на серверы по SSH, настраивает
- Работает с сайтами, меняет картинки, контент
- Создаёт и редактирует workflow в n8n
- Пишет код, создаёт приложения
- Отлаживает, тестирует, деплоит

---

## 📊 Анализ текущих рейтингов OpenRouter (Март 2026)

### ТОП моделей по использованию

| Категория | #1 Модель | Провайдер | Доля рынка |
|-----------|-----------|-----------|------------|
| **Кодинг** | Grok Code Fast 1 | xAI | 31.2% |
| **Python** | gpt-oss-120b | OpenAI | 12.2% |
| **Tool Calls** | GLM 4.6 | Z-AI | 12.4% |
| **Vision** | Gemini 2.5 Flash Lite | Google | 37.1% |
| **Общий** | Google | - | 23.4% |

### Лучшие модели для агентов (по функциям)

| Задача | Рекомендуемая модель | Цена in/out | Почему |
|--------|---------------------|-------------|--------|
| **Планирование** | Claude Sonnet 4.5 | $3/$15 | 1M контекст, лучшее reasoning |
| **Кодинг** | Grok Code Fast 1 | $0.20/$1.50 | #1 в coding, быстрый |
| **Отладка** | DeepSeek R1 0528 | $0.40/$1.75 | Открытое reasoning, дешёвый |
| **Tool Calls** | GLM 4.6 | $0.35/$1.50 | #1 по tool calling |
| **Vision/UI** | Gemini 2.5 Flash | $0.30/$2.50 | Видео+аудио+изображения |
| **Быстрые задачи** | GPT-5 Nano | $0.05/$0.40 | Ультра-дешёвый |
| **Computer Use** | Claude Opus 4.5 | $5/$25 | Браузер, spreadsheets |

---

## 🏗️ ПРЕДЛАГАЕМАЯ АРХИТЕКТУРА

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        🧠 ORCHESTRATOR (Мозг системы)                       │
│                                                                             │
│   Модель: Claude Sonnet 4.5 ($3/$15, 1M context)                           │
│   Задачи: Планирование, декомпозиция, принятие решений                     │
│                                                                             │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│   │   Memory    │  │   Context   │  │    Goal     │  │   History   │       │
│   │   Manager   │  │   Builder   │  │   Tracker   │  │   Analyzer  │       │
│   └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
│   🖥️ COMPUTER USE     │ │   💻 CODE AGENT       │ │   🔧 INFRA AGENT      │
│                       │ │                       │ │                       │
│ Модель: Claude        │ │ Модель: Grok Code     │ │ Модель: DeepSeek R1   │
│ Opus 4.5              │ │ Fast 1                │ │                       │
│ Цена: $5/$25          │ │ Цена: $0.20/$1.50     │ │ Цена: $0.40/$1.75     │
│                       │ │                       │ │                       │
│ ✓ Browser automation  │ │ ✓ Генерация кода      │ │ ✓ SSH команды         │
│ ✓ n8n редактирование  │ │ ✓ Рефакторинг         │ │ ✓ Docker/K8s          │
│ ✓ CMS работа          │ │ ✓ Тестирование        │ │ ✓ CI/CD pipelines     │
│ ✓ Формы, картинки     │ │ ✓ Code review         │ │ ✓ Мониторинг          │
│                       │ │                       │ │                       │
│ Tools:                │ │ Tools:                │ │ Tools:                │
│ - Browser Use API     │ │ - File operations     │ │ - SSH executor        │
│ - Playwright          │ │ - Git operations      │ │ - Ansible runner      │
│ - Screenshot OCR      │ │ - Test runner         │ │ - Terraform           │
└───────────────────────┘ └───────────────────────┘ └───────────────────────┘
                    │                 │                 │
                    └─────────────────┼─────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          🛠️ TOOL LAYER                                      │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Browser Use  │  │  SSH Client  │  │  Git Client  │  │  n8n API     │    │
│  │  (Cloud)     │  │  (paramiko)  │  │  (gitpython) │  │  (REST)      │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ File System  │  │  Docker API  │  │  DB Client   │  │  S3/MinIO    │    │
│  │  (aiofiles)  │  │  (docker-py) │  │  (asyncpg)   │  │  (boto3)     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 УМНЫЙ MULTI-MODEL ROUTER (v2.0)

### Tier-система на базе OpenRouter

```python
from enum import Enum
from dataclasses import dataclass

class TaskType(Enum):
    PLANNING = "planning"
    CODING = "coding"
    BROWSER = "browser"
    INFRA = "infra"
    QUICK = "quick"
    VISION = "vision"
    REASONING = "reasoning"

@dataclass
class ModelConfig:
    name: str
    provider: str
    cost_input: float  # per 1M tokens
    cost_output: float
    context_window: int
    strengths: list[str]

# Оптимальная конфигурация на март 2026
TIER_MODELS = {
    # === TIER 1: FRONTIER (для критических задач) ===
    "frontier": {
        "planner": ModelConfig(
            name="anthropic/claude-sonnet-4.5",
            provider="anthropic",
            cost_input=3.0, cost_output=15.0,
            context_window=1_000_000,
            strengths=["reasoning", "planning", "1M context"]
        ),
        "computer_use": ModelConfig(
            name="anthropic/claude-opus-4.5",
            provider="anthropic",
            cost_input=5.0, cost_output=25.0,
            context_window=200_000,
            strengths=["browser", "spreadsheets", "GUI"]
        ),
    },

    # === TIER 2: PERFORMANCE (основная работа) ===
    "performance": {
        "coding": ModelConfig(
            name="x-ai/grok-code-fast-1",
            provider="xai",
            cost_input=0.20, cost_output=1.50,
            context_window=256_000,
            strengths=["coding", "fast", "agentic"]
        ),
        "reasoning": ModelConfig(
            name="deepseek/deepseek-r1-0528",
            provider="deepseek",
            cost_input=0.40, cost_output=1.75,
            context_window=164_000,
            strengths=["reasoning", "debugging", "analysis"]
        ),
        "tool_calls": ModelConfig(
            name="z-ai/glm-4.6",
            provider="zhipu",
            cost_input=0.35, cost_output=1.50,
            context_window=203_000,
            strengths=["tool_calling", "agents", "200K context"]
        ),
        "vision": ModelConfig(
            name="google/gemini-2.5-flash",
            provider="google",
            cost_input=0.30, cost_output=2.50,
            context_window=1_050_000,
            strengths=["vision", "video", "audio", "multimodal"]
        ),
    },

    # === TIER 3: BUDGET (для простых задач) ===
    "budget": {
        "classifier": ModelConfig(
            name="openai/gpt-5-nano",
            provider="openai",
            cost_input=0.05, cost_output=0.40,
            context_window=400_000,
            strengths=["fast", "classification", "cheap"]
        ),
        "quick_coding": ModelConfig(
            name="qwen/qwen3-coder-480b-a35b",
            provider="qwen",
            cost_input=0.22, cost_output=0.95,
            context_window=262_000,
            strengths=["coding", "function_calling", "free_tier"]
        ),
        "fast_vision": ModelConfig(
            name="google/gemini-2.5-flash-lite",
            provider="google",
            cost_input=0.10, cost_output=0.40,
            context_window=1_050_000,
            strengths=["vision", "ultra-fast", "cheap"]
        ),
    },

    # === TIER 4: FREE (для тестирования/fallback) ===
    "free": {
        "reasoning": "deepseek/deepseek-r1-0528:free",
        "coding": "kwaipilot/kat-coder-pro-v1:free",
        "vision": "nvidia/nemotron-nano-12b-2-vl:free",
    }
}
```

### Логика выбора модели

```python
def select_model(task: str, context: dict) -> ModelConfig:
    """Умный выбор модели на основе задачи."""

    # 1. Классификация задачи (GPT-5 Nano — дешёвый)
    task_type = classify_task(task)  # $0.0001 за классификацию

    # 2. Оценка сложности
    complexity = estimate_complexity(task, context)

    # 3. Выбор tier
    if complexity == "critical" or task_type == TaskType.PLANNING:
        tier = "frontier"
    elif complexity in ("hard", "medium"):
        tier = "performance"
    else:
        tier = "budget"

    # 4. Выбор конкретной модели
    if task_type == TaskType.BROWSER:
        return TIER_MODELS["frontier"]["computer_use"]
    elif task_type == TaskType.CODING:
        return TIER_MODELS[tier].get("coding", TIER_MODELS["performance"]["coding"])
    elif task_type == TaskType.VISION:
        return TIER_MODELS[tier].get("vision", TIER_MODELS["performance"]["vision"])
    elif task_type == TaskType.REASONING:
        return TIER_MODELS[tier].get("reasoning", TIER_MODELS["performance"]["reasoning"])
    else:
        return TIER_MODELS["budget"]["classifier"]
```

---

## 🌐 BROWSER AUTOMATION LAYER

### Рекомендация: Browser Use + Claude Opus

```python
from browser_use import BrowserUseCloud
from anthropic import Anthropic

class AutonomousBrowserAgent:
    """
    Агент для работы с веб-интерфейсами.
    Может:
    - Редактировать n8n workflows
    - Менять картинки на сайтах
    - Заполнять формы
    - Работать с CMS (WordPress, Bitrix)
    """

    def __init__(self):
        self.browser = BrowserUseCloud(
            api_key="...",
            stealth=True,  # Антидетект
            proxy_country="RU",
            captcha_solver=True
        )
        self.llm = Anthropic()  # Claude Opus 4.5 для computer use

    async def execute_task(self, task: str, context: dict):
        """
        Пример: "Зайди в n8n, найди workflow 'lead-processing',
                 добавь ноду Telegram после HTTP Request"
        """

        # 1. Планирование действий
        plan = await self._plan_browser_actions(task, context)

        # 2. Выполнение с computer use
        result = await self.browser.run_task(
            task=task,
            model="claude-opus-4.5",  # Computer Use
            max_steps=50,
            screenshot_mode="viewport",
            on_step=self._log_step
        )

        return result

    async def change_website_image(self, url: str, selector: str, new_image: str):
        """Меняет картинку на сайте через CMS."""
        return await self.browser.run_task(
            task=f"""
            1. Войди в админку сайта {url}
            2. Найди изображение по селектору {selector}
            3. Замени на новое изображение: {new_image}
            4. Сохрани изменения
            """,
            model="claude-opus-4.5"
        )

    async def edit_n8n_workflow(self, workflow_name: str, changes: dict):
        """Редактирует n8n workflow через UI."""
        return await self.browser.run_task(
            task=f"""
            1. Открой n8n интерфейс
            2. Найди workflow "{workflow_name}"
            3. Внеси изменения: {changes}
            4. Сохрани и активируй workflow
            """,
            model="claude-opus-4.5"
        )
```

---

## 🖥️ SSH/INFRA AGENT

```python
import asyncssh
from typing import Optional

class InfrastructureAgent:
    """
    Агент для работы с серверами.
    Может:
    - Подключаться по SSH
    - Настраивать сервисы
    - Управлять Docker/K8s
    - Деплоить приложения
    """

    def __init__(self, llm_client):
        self.llm = llm_client  # DeepSeek R1 для reasoning
        self.connections: dict[str, asyncssh.SSHClientConnection] = {}

    async def execute_on_server(
        self,
        host: str,
        task: str,
        context: Optional[dict] = None
    ):
        """
        Пример: "Установи nginx, настрой reverse proxy для app:3000"
        """

        # 1. Планируем команды
        commands = await self._plan_commands(task, context)

        # 2. Подключаемся
        conn = await self._get_connection(host)

        # 3. Выполняем с проверкой каждого шага
        results = []
        for cmd in commands:
            # Проверка безопасности
            if not self._is_safe_command(cmd):
                raise SecurityError(f"Опасная команда: {cmd}")

            result = await conn.run(cmd)
            results.append({
                "command": cmd,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "exit_code": result.exit_status
            })

            # Если ошибка — reasoning для исправления
            if result.exit_status != 0:
                fix = await self._reason_about_error(cmd, result.stderr)
                if fix:
                    results.append(await conn.run(fix))

        return results

    async def configure_service(self, host: str, service: str, config: dict):
        """Настройка сервиса через SSH."""
        task = f"""
        Настрой {service} на сервере с параметрами:
        {config}

        Убедись, что сервис запущен и работает.
        """
        return await self.execute_on_server(host, task)

    async def deploy_application(self, host: str, repo: str, branch: str = "main"):
        """Деплой приложения."""
        task = f"""
        1. Склонируй репозиторий {repo} (ветка {branch})
        2. Установи зависимости
        3. Собери приложение
        4. Запусти через Docker или systemd
        5. Проверь, что приложение отвечает
        """
        return await self.execute_on_server(host, task)
```

---

## 💻 CODE AGENT

```python
class CodeAgent:
    """
    Агент для написания и редактирования кода.
    Модель: Grok Code Fast 1 (31% рынка кодинга)
    """

    def __init__(self):
        self.llm = OpenRouterClient(model="x-ai/grok-code-fast-1")
        self.debugger = OpenRouterClient(model="deepseek/deepseek-r1-0528")

    async def write_code(self, task: str, language: str, context: dict):
        """Генерация кода."""
        response = await self.llm.complete(
            system=f"You are an expert {language} developer. Write production-ready code.",
            user=task,
            context=context
        )

        # Валидация и автофикс
        code = response.content
        if errors := await self._validate_code(code, language):
            code = await self._fix_errors(code, errors)

        return code

    async def debug_code(self, code: str, error: str):
        """Отладка с reasoning (DeepSeek R1)."""
        response = await self.debugger.complete(
            system="Analyze the error step by step. Show your reasoning.",
            user=f"Code:\n{code}\n\nError:\n{error}\n\nFix it.",
            temperature=0.1  # Детерминированный
        )
        return response.content

    async def review_code(self, code: str, criteria: list[str]):
        """Code review."""
        return await self.llm.complete(
            system="You are a senior code reviewer.",
            user=f"Review this code for: {criteria}\n\nCode:\n{code}"
        )
```

---

## 📊 СРАВНЕНИЕ С ТЕКУЩЕЙ СИСТЕМОЙ

| Аспект | Текущая система | Предлагаемая |
|--------|-----------------|--------------|
| **Orchestrator** | gpt-5.4 | Claude Sonnet 4.5 (1M контекст) |
| **Кодинг** | minimax-m2.5 | Grok Code Fast 1 (#1 в рейтинге) |
| **Reasoning** | deepseek-r1 | DeepSeek R1 0528 (улучшенный) |
| **Browser** | computer-use-preview | Claude Opus 4.5 + Browser Use |
| **Tool Calls** | gpt-4.1-nano | GLM 4.6 (#1 по tool calling) |
| **Vision** | - | Gemini 2.5 Flash |
| **Стоимость/запрос** | ~$0.032 | ~$0.025 (экономия 22%) |

---

## 🛠️ РЕКОМЕНДУЕМЫЙ СТЕК

### Инфраструктура
| Компонент | Технология | Почему |
|-----------|------------|--------|
| **LLM Gateway** | OpenRouter | 605 моделей, единый API |
| **Browser Automation** | Browser Use Cloud | Stealth, CAPTCHA, 195 стран |
| **Workflow Engine** | n8n (self-hosted) | Уже используете |
| **Memory** | Redis + PostgreSQL | Быстрый кэш + персистентность |
| **Queue** | Redis Streams / BullMQ | Для распределения задач |
| **Secrets** | HashiCorp Vault | Безопасность API ключей |

### Python зависимости
```python
# requirements.txt
openai>=1.50.0           # OpenRouter compatible
anthropic>=0.45.0        # Claude computer use
browser-use>=2.1.0       # Browser automation
asyncssh>=2.14.0         # SSH operations
aiofiles>=23.0.0         # Async file I/O
redis>=5.0.0             # Caching & queues
asyncpg>=0.29.0          # PostgreSQL async
pydantic>=2.5.0          # Data validation
structlog>=24.0.0        # Structured logging
```

---

## 💰 РАСЧЁТ СТОИМОСТИ

### Типичная сессия работы

| Этап | Модель | Токены | Стоимость |
|------|--------|--------|-----------|
| Классификация | GPT-5 Nano | 500 in / 100 out | $0.00007 |
| Планирование | Claude Sonnet 4.5 | 2000 in / 1000 out | $0.021 |
| Кодинг (3 итерации) | Grok Code Fast 1 | 6000 in / 3000 out | $0.0057 |
| Browser automation | Claude Opus 4.5 | 4000 in / 2000 out | $0.070 |
| Верификация | DeepSeek R1 | 2000 in / 500 out | $0.00168 |
| **ИТОГО** | | ~18K токенов | **~$0.10** |

### Сравнение с GPT-5 Pro везде

| Подход | Стоимость/сессия | Экономия |
|--------|------------------|----------|
| GPT-5 Pro везде | ~$0.85 | - |
| Текущая система | ~$0.15 | 82% |
| **Предлагаемая** | **~$0.10** | **88%** |

---

## 🚀 ROADMAP ВНЕДРЕНИЯ

### Фаза 1: Browser Automation (1-2 недели)
- [ ] Интегрировать Browser Use Cloud
- [ ] Настроить Claude Opus 4.5 для computer use
- [ ] Создать агенты для n8n и CMS

### Фаза 2: Обновить Model Router (1 неделя)
- [ ] Добавить новые модели из OpenRouter
- [ ] Реализовать tier-систему v2.0
- [ ] Настроить fallback на бесплатные модели

### Фаза 3: Улучшить Code Agent (1 неделя)
- [ ] Заменить coding model на Grok Code Fast 1
- [ ] Добавить GLM 4.6 для tool calling
- [ ] Интегрировать Gemini для vision задач

### Фаза 4: Тестирование и оптимизация (2 недели)
- [ ] Benchmark на реальных задачах
- [ ] Оптимизация стоимости
- [ ] Документация

---

## ✅ ИТОГО: КЛЮЧЕВЫЕ РЕКОМЕНДАЦИИ

1. **Browser Use Cloud** — для полной автономности работы с веб-интерфейсами (n8n, CMS, формы)

2. **Claude Opus 4.5** — единственная модель с настоящим Computer Use для GUI

3. **Grok Code Fast 1** — #1 в кодинге, заменить на него основной coding agent

4. **GLM 4.6** — #1 по tool calling, использовать для агентных задач

5. **Gemini 2.5 Flash** — для всех vision задач (скриншоты, OCR, видео)

6. **OpenRouter** — единый gateway на 605 моделей с автоматическим fallback

7. **DeepSeek R1 (free)** — для reasoning/debugging без затрат

**Ожидаемый результат:** Система, которая может полностью автономно выполнять 95% задач DevOps/разработчика.
