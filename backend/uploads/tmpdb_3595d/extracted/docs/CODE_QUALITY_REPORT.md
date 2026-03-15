# 🔍 Отчёт о качестве кода AI Dev Team Platform

**Дата:** 2026-03-12
**Версия системы:** 0.12.1 (M12-senior)
**Автор:** MiniMax Agent

---

## 📊 Общая оценка

| Категория | Текущая оценка | Целевая | Критичность |
|-----------|----------------|---------|-------------|
| **Безопасность** | 6.5/10 | 9/10 | 🔴 КРИТИЧНО |
| **Архитектура** | 7.0/10 | 9/10 | 🟡 ВАЖНО |
| **Обработка ошибок** | 5.5/10 | 8/10 | 🔴 КРИТИЧНО |
| **Производительность** | 7.5/10 | 9/10 | 🟡 ВАЖНО |
| **Дублирование кода** | 6.0/10 | 8/10 | 🟡 ВАЖНО |
| **Типизация** | 6.5/10 | 8/10 | 🟢 ЖЕЛАТЕЛЬНО |

**ИТОГО: 6.5/10** → Цель: **8.5/10**

---

## 🔴 КРИТИЧЕСКИЕ ПРОБЛЕМЫ

### 1. SQL Injection уязвимости

**Файлы с проблемами:**
- `apps/chat-api/app/routers/factory.py`
- `apps/chat-api/app/routers/search.py`
- `apps/chat-api/app/routers/portfolio.py`
- `apps/chat-api/app/routers/cto.py`
- `apps/chat-api/app/routers/templates.py`

**Пример плохого кода:**
```python
# ❌ ОПАСНО: f-string в SQL запросе
rows = conn.execute(text(f"""
    SELECT * FROM tasks {where} ORDER BY created_at DESC
"""))

# ❌ ОПАСНО: динамическое построение SET clause
conn.execute(text(f"UPDATE cto_tasks SET {set_clause}, updated_at = :updated_at WHERE id = :task_id"), updates)
```

**Правильное решение:**
```python
# ✅ БЕЗОПАСНО: использовать safe_sql.py
from libs.shared.safe_sql import build_safe_update, build_safe_select

query, params = build_safe_update(
    table="cto_tasks",
    updates={"status": "done"},
    conditions=[("id", "=", task_id)]
)
conn.execute(text(query), params)
```

**Статус:** У вас уже есть `libs/shared/safe_sql.py`, но он не используется везде!

---

### 2. Молчаливое проглатывание ошибок

**Найдено 20+ мест с паттерном `except Exception: pass`**

**Проблемные файлы:**
- `libs/shared/provider_manager.py` (3 места)
- `libs/shared/memory_layers_v2.py`
- `libs/shared/cache.py`
- `libs/shared/memory_client.py`
- `libs/shared/self_healing.py`

**Пример плохого кода:**
```python
# ❌ ПЛОХО: ошибка теряется
try:
    await provider.health_check()
except Exception:
    pass  # Что случилось? Никто не знает!
```

**Правильное решение:**
```python
# ✅ ХОРОШО: использовать error_handling.py
from libs.shared.error_handling import safe_execute, ErrorSeverity

result = await safe_execute(
    provider.health_check,
    context={"provider": provider.name},
    severity=ErrorSeverity.WARNING,
    default_return=False
)
```

---

### 3. Секреты в открытом виде (.env)

**Статус:** ⚠️ Всё ещё не исправлено с предыдущего аудита

```bash
# ❌ В .env видны API ключи в plaintext
OPENAI_API_KEY=sk-proj-xxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

**Решение:**
1. Использовать Docker Secrets или Kubernetes Secrets
2. Или HashiCorp Vault
3. Или AWS Secrets Manager

---

## 🟡 ВАЖНЫЕ ПРОБЛЕМЫ

### 4. God Objects — Слишком большие файлы

| Файл | Строк | Проблема |
|------|-------|----------|
| `chat-api/app/deps.py` | 2257 | God Object — слишком много функций |
| `chat-api/app/routers/conversations.py` | 1970 | Нужно разбить на модули |
| `ui_builder.py` | 1422 | Смешана логика UI и бизнес-логика |
| `memory-service/app/main.py` | 1400 | Весь сервис в одном файле |
| `model_router.py` | 1371 | Приемлемо, но на грани |

**Рекомендация:** Файлы > 500 строк нужно рефакторить

---

### 5. Дублирование модулей

**Проблема:** Существуют две версии memory layers:
- `libs/shared/memory_layers.py`
- `libs/shared/memory_layers_v2.py`

**В коде:**
```python
# deps.py использует старую версию
from libs.shared.memory_layers import (...)

# memory_layers_v2.py ссылается сам на себя (!)
from libs.shared.memory_layers_v2 import MemoryManager
```

**Решение:** Мигрировать на v2 и удалить старую версию

---

### 6. Глобальные переменные (Anti-pattern)

**Найдено 15+ `global` переменных:**
- `http_pool.py`: `global _client`
- `provider_manager.py`: `global _manager`
- `cache.py`: `global _redis_client`
- `llm_client.py`: `global _async_client`, `global _sync_client`
- `rate_limiter.py`: `global _limiter`
- `model_router.py`: `global _router`

**Проблема:** Сложно тестировать, race conditions в async коде

**Решение:** Использовать Dependency Injection или Context Variables
```python
# ✅ ЛУЧШЕ: contextvars
from contextvars import ContextVar

_router_var: ContextVar[ModelRouter] = ContextVar('router')

def get_router() -> ModelRouter:
    try:
        return _router_var.get()
    except LookupError:
        router = ModelRouter()
        _router_var.set(router)
        return router
```

---

### 7. Hardcoded магические числа

```python
# ❌ ПЛОХО
await asyncio.sleep(300)  # Что такое 300? Почему 300?
time_module.sleep(60)
time.sleep(min(2 ** attempt, 30))

# ✅ ХОРОШО
MEMORY_CLEANUP_INTERVAL_SEC = 300
RATE_LIMIT_CHECK_INTERVAL_SEC = 60
MAX_RETRY_DELAY_SEC = 30

await asyncio.sleep(MEMORY_CLEANUP_INTERVAL_SEC)
```

---

### 8. TODO-заглушки в production коде

**webapp_builder.py содержит placeholder код:**
```python
models_sql = f"-- TODO: Add tables for {', '.join(entities)}"
routes=routes_code or "# TODO: Add routes"
schemas_code or "# TODO: Add Pydantic models"
```

**Это значит:** Генератор webapp может создавать неполный код!

---

## 🟢 ЖЕЛАТЕЛЬНЫЕ УЛУЧШЕНИЯ

### 9. Слабая типизация (105 файлов с typing)

**Проблема:** Много `Any` типов вместо конкретных:
```python
openai_client: Optional[Any] = None  # Какой именно клиент?
_memory_store: dict[str, Any] = {}   # Что хранится?
```

**Решение:** Создать строгие типы
```python
from openai import AsyncOpenAI
from typing import TypedDict

class MemoryEntry(TypedDict):
    key: str
    value: str
    expires_at: datetime

openai_client: Optional[AsyncOpenAI] = None
_memory_store: dict[str, MemoryEntry] = {}
```

---

### 10. Отсутствие централизованного конфига

Конфигурация разбросана по .env и hardcoded значениям в коде.

**Решение:** Pydantic Settings
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    openai_model_cheap: str = "gpt-4.1-mini"
    openai_model_main: str = "gpt-5.4"
    memory_cleanup_interval: int = 300
    max_retry_delay: int = 30

    class Config:
        env_file = ".env"

settings = Settings()
```

---

## 📋 ПЛАН ИСПРАВЛЕНИЯ

### Неделя 1: Критические проблемы
| # | Задача | Приоритет | Сложность |
|---|--------|-----------|-----------|
| 1 | Заменить f-string SQL на safe_sql.py | 🔴 | Средняя |
| 2 | Заменить `except: pass` на error_handling | 🔴 | Низкая |
| 3 | Перенести секреты в Docker Secrets | 🔴 | Средняя |

### Неделя 2: Важные проблемы
| # | Задача | Приоритет | Сложность |
|---|--------|-----------|-----------|
| 4 | Разбить deps.py на модули | 🟡 | Высокая |
| 5 | Удалить memory_layers.py, оставить v2 | 🟡 | Средняя |
| 6 | Заменить global на ContextVar | 🟡 | Средняя |
| 7 | Вынести магические числа в константы | 🟡 | Низкая |

### Неделя 3: Улучшения
| # | Задача | Приоритет | Сложность |
|---|--------|-----------|-----------|
| 8 | Удалить TODO-заглушки из webapp_builder | 🟢 | Средняя |
| 9 | Улучшить типизацию (Any → конкретные типы) | 🟢 | Высокая |
| 10 | Создать централизованный Settings класс | 🟢 | Средняя |

---

## 📊 Метрики для отслеживания

После исправлений запустите:

```bash
# Проверка SQL injection
grep -r 'execute.*f"' apps/ --include='*.py' | wc -l  # Цель: 0

# Проверка except pass
grep -r 'except.*:$' apps/ libs/ --include='*.py' -A1 | grep -c 'pass'  # Цель: 0

# Размер файлов > 500 строк
find . -name '*.py' -exec wc -l {} \; | awk '$1 > 500' | wc -l  # Цель: < 5

# Global переменные
grep -r 'global ' libs/ apps/ --include='*.py' | wc -l  # Цель: 0
```

---

## ✅ ЧТО УЖЕ ХОРОШО

1. **✅ Есть safe_sql.py** — нужно только использовать везде
2. **✅ Есть error_handling.py** — отличный модуль, не используется
3. **✅ Есть structured_logging.py** — маскирует credentials в логах
4. **✅ Есть security_utils.py** — детектит sensitive data
5. **✅ Есть тесты** — test_full_system.py проверяет hardcoded secrets
6. **✅ Multi-Model Router** — отлично спроектирован
7. **✅ Phase-aware routing** — умная экономия на моделях

---

**После исправления всех проблем ожидаемая оценка: 8.5-9.0/10**
