# AI Dev Team Platform: Руководство по улучшению до 10/10

**Версия:** 1.0
**Дата:** 2026-03-12
**Автор:** MiniMax Agent
**Целевая система:** AI Dev Team Platform (12 микросервисов)

---

## Содержание

1. [Обзор текущего состояния](#1-обзор-текущего-состояния)
2. [Критические исправления безопасности](#2-критические-исправления-безопасности)
3. [Исправление deprecated API](#3-исправление-deprecated-api)
4. [Observability и мониторинг](#4-observability-и-мониторинг)
5. [Оптимизация базы данных](#5-оптимизация-базы-данных)
6. [Тестирование и CI/CD](#6-тестирование-и-cicd)
7. [Архитектурные улучшения](#7-архитектурные-улучшения)
8. [DevOps и инфраструктура](#8-devops-и-инфраструктура)
9. [Чеклист готовности](#9-чеклист-готовности)

---

## 1. Обзор текущего состояния

### 1.1 Архитектура системы

```
┌─────────────────────────────────────────────────────────────────┐
│                         NGINX (Reverse Proxy)                   │
└─────────────────────────────────────────────────────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                       ▼
    ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
    │  Web UI      │       │  Chat API    │       │ Orchestrator │
    │  (Frontend)  │       │              │       │     API      │
    └──────────────┘       └──────────────┘       └──────────────┘
                                    │                       │
                    ┌───────────────┴───────────────────────┤
                    ▼                                       ▼
            ┌──────────────┐                       ┌──────────────┐
            │ Task Runner  │                       │   Planner    │
            │              │                       │   Worker     │
            └──────────────┘                       └──────────────┘
                    │
    ┌───────────────┼───────────────┬───────────────┐
    ▼               ▼               ▼               ▼
┌────────┐   ┌────────────┐   ┌──────────┐   ┌──────────────┐
│ Coding │   │    QA      │   │   SSH    │   │   Browser    │
│ Worker │   │   Worker   │   │  Worker  │   │   Worker     │
└────────┘   └────────────┘   └──────────┘   └──────────────┘
                    │
    ┌───────────────┴───────────────┐
    ▼                               ▼
┌──────────────┐           ┌──────────────┐
│   Memory     │           │   Approval   │
│   Service    │           │   Service    │
└──────────────┘           └──────────────┘
        │                           │
        └─────────────┬─────────────┘
                      ▼
    ┌─────────────────────────────────────┐
    │     PostgreSQL  │  Redis  │  MinIO  │
    └─────────────────────────────────────┘
```

### 1.2 Текущая оценка: 7.5/10

| Категория | Текущий балл | Целевой балл | Gap |
|-----------|--------------|--------------|-----|
| Безопасность | 6/10 | 10/10 | -4 |
| Код | 8/10 | 10/10 | -2 |
| Архитектура | 8/10 | 10/10 | -2 |
| Observability | 5/10 | 10/10 | -5 |
| DevOps | 7/10 | 10/10 | -3 |
| Тестирование | 6/10 | 10/10 | -4 |

### 1.3 Найденные файлы с проблемами

| Файл | Проблема | Строки |
|------|----------|--------|
| `libs/shared/dto.py` | datetime.utcnow | 72, 176, 190 |
| `libs/shared/models.py` | datetime.utcnow | 78, 105, 106, 166, 192, 211, 215, 235 |
| `apps/memory-service/app/main.py` | @app.on_event | 246 |
| `apps/chat-api/app/main.py` | @app.on_event | 165, 176 |
| `apps/approval-service/app/main.py` | @app.on_event | 12 |
| `apps/task-runner/app/main.py` | @app.on_event | 569 |
| `apps/orchestrator-api/app/main.py` | @app.on_event | 33 |
| `apps/planner-worker/app/main.py` | @app.on_event | 54 |
| `.env` | Plaintext secrets | Весь файл |

---

## 2. Критические исправления безопасности

### 2.1 Миграция секретов из .env в Docker Secrets

**Проблема:** Все API ключи хранятся в plaintext в файле `.env`

**Текущее состояние (ОПАСНО!):**
```bash
# .env
OPENAI_API_KEY=sk-proj-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
GITHUB_TOKEN=ghp_xxx
POSTGRES_PASSWORD=xxx
```

#### Шаг 1: Создать секреты
```bash
mkdir -p /root/ai-dev-team-platform/secrets
echo "sk-proj-xxx" > secrets/openai_api_key
echo "sk-ant-xxx" > secrets/anthropic_api_key
chmod 600 secrets/*
```

#### Шаг 2: Обновить docker-compose.yml
```yaml
secrets:
  openai_api_key:
    file: ./secrets/openai_api_key
  anthropic_api_key:
    file: ./secrets/anthropic_api_key

services:
  orchestrator-api:
    secrets:
      - openai_api_key
      - anthropic_api_key
    environment:
      OPENAI_API_KEY_FILE: /run/secrets/openai_api_key
```

#### Шаг 3: Код для чтения секретов
```python
# libs/shared/config.py

from pathlib import Path
from functools import lru_cache

def read_secret(secret_name: str, env_var: str = None) -> str:
    """Читает секрет из Docker Secrets или env variable"""
    # Docker Secrets path
    secret_path = Path(f"/run/secrets/{secret_name}")
    if secret_path.exists():
        return secret_path.read_text().strip()

    # Fallback на environment variable
    return os.getenv(env_var or secret_name.upper(), "")

@lru_cache
def get_openai_api_key() -> str:
    return read_secret("openai_api_key", "OPENAI_API_KEY")
```

---

### 2.2 Rate Limiting

**Установка:**
```bash
pip install slowapi
```

**Реализация:**
```python
# libs/shared/rate_limit.py

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

# Использование
@app.post("/api/chat")
@limiter.limit("20/minute")
async def chat(request: Request):
    ...
```

---

## 3. Исправление deprecated API

### 3.1 datetime.utcnow() → datetime.now(timezone.utc)

**Проблема:** `datetime.utcnow()` deprecated в Python 3.12+

#### Исправление для models.py
```python
# БЫЛО:
from datetime import datetime
created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

# СТАЛО:
from datetime import datetime, timezone

def utc_now():
    return datetime.now(timezone.utc)

created_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    default=utc_now
)
```

#### Скрипт автоматического исправления
```python
#!/usr/bin/env python3
# fix_datetime.py

import re
from pathlib import Path

def fix_file(filepath: str):
    path = Path(filepath)
    content = path.read_text()

    # Добавляем timezone в импорт
    if 'from datetime import' in content and 'timezone' not in content:
        content = re.sub(
            r'from datetime import datetime',
            'from datetime import datetime, timezone',
            content
        )

    # Заменяем datetime.utcnow
    content = re.sub(
        r'default=datetime\.utcnow(?!\()',
        'default=lambda: datetime.now(timezone.utc)',
        content
    )

    content = re.sub(
        r'default_factory=datetime\.utcnow',
        'default_factory=lambda: datetime.now(timezone.utc)',
        content
    )

    path.write_text(content)
    print(f"Fixed: {filepath}")

# Применить
fix_file('libs/shared/dto.py')
fix_file('libs/shared/models.py')
```

---

### 3.2 @app.on_event('startup') → lifespan

**Проблема:** `@app.on_event` deprecated в FastAPI 0.100+

#### Паттерн миграции
```python
# ═══════════════════════════════════════════════════════
# БЫЛО (deprecated):
# ═══════════════════════════════════════════════════════

app = FastAPI()

@app.on_event("startup")
async def startup_event():
    await init_database()
    await connect_redis()

@app.on_event("shutdown")
async def shutdown_event():
    await close_database()


# ═══════════════════════════════════════════════════════
# СТАЛО (современный подход):
# ═══════════════════════════════════════════════════════

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # STARTUP
    await init_database()
    await connect_redis()
    logger.info("Application started")

    yield  # Приложение работает

    # SHUTDOWN
    await close_database()
    await disconnect_redis()

app = FastAPI(lifespan=lifespan)
```

#### Пример для orchestrator-api
```python
# apps/orchestrator-api/app/main.py

from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Orchestrator API...")
    await init_db()
    await redis_pool.connect()
    app.state.config = load_config()

    yield

    logger.info("Shutting down...")
    await redis_pool.disconnect()
    await close_db()

app = FastAPI(
    title="Orchestrator API",
    version="0.5.0",
    lifespan=lifespan
)
```

---

## 4. Observability и мониторинг

### 4.1 Structured Logging (JSON)

```bash
pip install structlog
```

```python
# libs/shared/logging_config.py

import structlog

def setup_logging(service_name: str):
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.add_log_level,
            structlog.processors.JSONRenderer()
        ],
    )
    structlog.contextvars.bind_contextvars(service=service_name)

def get_logger(name: str = None):
    return structlog.get_logger(name)

# Использование
logger = get_logger()
logger.info("Task created", task_id="123", priority="high")
```

**Вывод:**
```json
{"timestamp": "2026-03-12T15:30:00Z", "level": "info", "service": "orchestrator-api", "event": "Task created", "task_id": "123", "priority": "high"}
```

---

### 4.2 Prometheus Metrics

```bash
pip install prometheus-fastapi-instrumentator
```

```python
# libs/shared/metrics.py

from prometheus_client import Counter, Histogram
from prometheus_fastapi_instrumentator import Instrumentator

# Custom metrics
llm_requests_total = Counter(
    'llm_requests_total',
    'Total LLM API requests',
    ['provider', 'model', 'status']
)

llm_request_duration = Histogram(
    'llm_request_duration_seconds',
    'LLM request duration',
    ['provider', 'model'],
    buckets=[0.1, 0.5, 1, 2, 5, 10, 30, 60]
)

llm_cost_total = Counter(
    'llm_cost_dollars_total',
    'Total cost in dollars',
    ['provider', 'model']
)

def setup_metrics(app):
    Instrumentator().instrument(app).expose(app, endpoint="/metrics")
```

---

### 4.3 Sentry Error Tracking

```bash
pip install sentry-sdk[fastapi]
```

```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    environment="production",
    traces_sample_rate=0.1,
    integrations=[FastApiIntegration()],
)
```

---

## 5. Оптимизация базы данных

### 5.1 SQL скрипт индексов

```sql
-- migrations/003_add_performance_indices.sql

-- TASKS
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_status
ON tasks(status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_project_status
ON tasks(project_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_priority_created
ON tasks(priority DESC, created_at DESC);

-- TASK_STEPS
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_steps_task_id
ON task_steps(task_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_steps_task_order
ON task_steps(task_id, step_order);

-- AGENT_RUNS
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_step_id
ON agent_runs(step_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_started
ON agent_runs(started_at DESC);

-- APPROVALS
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approvals_pending
ON approvals(status, requested_at DESC)
WHERE status = 'pending';

-- ARTIFACTS
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_artifacts_agent_run
ON artifacts(agent_run_id);
```

### 5.2 Connection Pooling (PgBouncer)

```yaml
# docker-compose.yml

services:
  pgbouncer:
    image: edoburu/pgbouncer:1.21.0
    environment:
      DATABASE_URL: "postgres://user:pass@postgres:5432/ai_dev_platform"
      POOL_MODE: transaction
      MAX_CLIENT_CONN: 1000
      DEFAULT_POOL_SIZE: 50
    ports:
      - "6432:6432"
```

---

## 6. Тестирование и CI/CD

### 6.1 Структура тестов

```
tests/
├── conftest.py
├── unit/
│   ├── test_model_router.py
│   ├── test_security_utils.py
│   └── test_self_healing.py
├── integration/
│   ├── test_orchestrator_api.py
│   └── test_database.py
└── e2e/
    └── test_full_workflow.py
```

### 6.2 Пример теста

```python
# tests/unit/test_security_utils.py

import pytest
from libs.shared.security_utils import validate_path, is_dangerous_command

class TestSecurityUtils:

    @pytest.mark.parametrize("path,expected", [
        ("/workspace/code/main.py", True),
        ("../../../etc/passwd", False),
        ("/workspace/../etc/passwd", False),
    ])
    def test_validate_path(self, path, expected):
        assert validate_path(path, base_dir="/workspace") == expected

    @pytest.mark.parametrize("command,is_dangerous", [
        ("ls -la", False),
        ("rm -rf /", True),
        ("DROP DATABASE production", True),
    ])
    def test_dangerous_command_detection(self, command, is_dangerous):
        assert is_dangerous_command(command) == is_dangerous
```

### 6.3 GitHub Actions CI/CD

```yaml
# .github/workflows/ci.yml

name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install ruff mypy black
      - run: ruff check .
      - run: black --check .
      - run: mypy libs/shared

  test:
    runs-on: ubuntu-latest
    needs: lint
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      - run: pip install pytest pytest-cov
      - run: pytest --cov=libs --cov-report=xml

  build:
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:latest
```

### 6.4 Pre-commit Hooks

```yaml
# .pre-commit-config.yaml

repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.3.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: check-yaml
      - id: detect-private-key
```

---

## 7. Архитектурные улучшения

### 7.1 Message Queue (RabbitMQ)

```yaml
# docker-compose.yml

services:
  rabbitmq:
    image: rabbitmq:3.12-management
    ports:
      - "5672:5672"
      - "15672:15672"
```

```python
# libs/shared/message_queue.py

import aio_pika

class MessageBroker:
    async def connect(self):
        self.connection = await aio_pika.connect_robust(self.url)
        self.channel = await self.connection.channel()
        await self.channel.declare_queue("tasks.new", durable=True)

    async def publish(self, queue: str, message: dict):
        await self.channel.default_exchange.publish(
            aio_pika.Message(body=json.dumps(message).encode()),
            routing_key=queue,
        )
```

### 7.2 Caching Layer

```python
# libs/shared/cache.py

from redis.asyncio import Redis

class CacheManager:
    def __init__(self, redis: Redis):
        self.redis = redis

    async def get(self, key: str):
        data = await self.redis.get(key)
        return json.loads(data) if data else None

    async def set(self, key: str, value, ttl: int = 3600):
        await self.redis.set(key, json.dumps(value), ex=ttl)

# Декоратор для кэширования LLM ответов
def cached(prefix: str, ttl: int = 86400):
    def decorator(func):
        async def wrapper(*args, **kwargs):
            key = f"{prefix}:{hash(str(args)+str(kwargs))}"
            cached = await cache.get(key)
            if cached:
                return cached
            result = await func(*args, **kwargs)
            await cache.set(key, result, ttl)
            return result
        return wrapper
    return decorator
```

### 7.3 API Versioning

```python
from fastapi import APIRouter, FastAPI

router_v1 = APIRouter()
router_v2 = APIRouter()

@router_v1.get("/tasks")
async def get_tasks_v1():
    return {"tasks": [...]}

@router_v2.get("/tasks")
async def get_tasks_v2():
    return {"data": {"tasks": [...]}, "meta": {"total": 100}}

app = FastAPI()
app.include_router(router_v1, prefix="/api/v1")
app.include_router(router_v2, prefix="/api/v2")
```

### 7.4 Feature Flags

```python
# libs/shared/feature_flags.py

class FeatureFlags:
    def __init__(self, redis: Redis):
        self.redis = redis

    async def is_enabled(self, flag: str, user_id: str = None) -> bool:
        return await self.redis.get(f"ff:{flag}") == b"1"

    async def get_percentage_rollout(self, flag: str, user_id: str, pct: int) -> bool:
        return hash(f"{flag}:{user_id}") % 100 < pct

# Использование
if await flags.get_percentage_rollout("new_ui", user.id, 10):
    return new_response()
return old_response()
```

---

## 8. DevOps и инфраструктура

### 8.1 Secure Dockerfile

```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip wheel --wheel-dir /wheels -r requirements.txt

FROM python:3.12-slim
RUN groupadd -r app && useradd -r -g app app
COPY --from=builder /wheels /wheels
RUN pip install /wheels/* && rm -rf /wheels
WORKDIR /app
COPY --chown=app:app . .
USER app

HEALTHCHECK --interval=30s --timeout=10s \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0"]
```

### 8.2 Kubernetes Helm Values

```yaml
# helm/values.yaml

services:
  orchestratorApi:
    replicas: 2
    resources:
      requests: {memory: "256Mi", cpu: "100m"}
      limits: {memory: "512Mi", cpu: "500m"}
    autoscaling:
      enabled: true
      minReplicas: 2
      maxReplicas: 10
      targetCPU: 70

  codingWorker:
    replicas: 5
    resources:
      requests: {memory: "1Gi", cpu: "500m"}
      limits: {memory: "2Gi", cpu: "2000m"}
```

### 8.3 Terraform

```hcl
resource "kubernetes_namespace" "ai_dev" {
  metadata { name = "ai-dev-platform" }
}

resource "helm_release" "postgresql" {
  name       = "postgresql"
  namespace  = kubernetes_namespace.ai_dev.metadata[0].name
  repository = "https://charts.bitnami.com/bitnami"
  chart      = "postgresql"
}
```

---

## 9. Чеклист готовности

### Production Readiness

```
[ ] БЕЗОПАСНОСТЬ
    [ ] Секреты в Vault/Docker Secrets
    [ ] Rate limiting включён
    [ ] HTTPS везде
    [ ] Container security scan

[ ] КОД
    [ ] datetime.utcnow исправлен
    [ ] @app.on_event → lifespan
    [ ] Type hints 100%
    [ ] Тесты >80% coverage

[ ] OBSERVABILITY
    [ ] JSON logging
    [ ] Prometheus metrics
    [ ] Grafana dashboards
    [ ] Sentry

[ ] БАЗА ДАННЫХ
    [ ] Индексы созданы
    [ ] Connection pooling
    [ ] Бэкапы автоматизированы

[ ] CI/CD
    [ ] GitHub Actions
    [ ] Pre-commit hooks
    [ ] Feature flags

[ ] ИНФРАСТРУКТУРА
    [ ] Helm charts
    [ ] HPA настроен
    [ ] DR план готов
```

---

## Приоритетный план выполнения

| Неделя | Задачи | Приоритет |
|--------|--------|-----------|
| 1-2 | Секреты, Rate limiting, Deprecated fixes | Критично |
| 3-4 | Prometheus, Sentry, JSON logging | Важно |
| 5-6 | Тесты, CI/CD, Pre-commit | Важно |
| 7-8 | Message Queue, Caching, API versioning | Средне |
| 9+ | Kubernetes, DR planning | Низко |

---

## Полезные команды

```bash
# Поиск deprecated кода
grep -rn "datetime.utcnow" --include="*.py" .
grep -rn "@app.on_event" --include="*.py" .

# Тесты
pytest --cov=libs --cov-report=html

# Линтинг
ruff check . --fix && black . && mypy libs/shared

# Docker
docker-compose build --parallel

# БД миграции
alembic upgrade head
```

---

**Документ подготовлен:** MiniMax Agent
**Дата:** 2026-03-12
