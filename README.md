# Super Agent v6.0

Автономный AI-инженер с мультимодальной поддержкой, LangGraph StateGraph, Self-Healing 2.0, векторной памятью и полным набором инструментов для разработки.

## Архитектура

```
┌─────────────────────────────────────────────────┐
│                  Frontend (SPA)                  │
│   HTML5 + CSS3 + Vanilla JS + PWA               │
│   marked.js + highlight.js + mermaid.js         │
├─────────────────────────────────────────────────┤
│                  Nginx (reverse proxy)           │
│   HTTPS/SSL (Let's Encrypt) + WebSocket         │
├─────────────────────────────────────────────────┤
│              Backend (Flask + Gunicorn)           │
│   ┌─────────┐ ┌──────────┐ ┌──────────────┐    │
│   │ Agent   │ │ Model    │ │ Security     │    │
│   │ Loop    │ │ Router   │ │ (bcrypt,     │    │
│   │ (Lang-  │ │ (3 var-  │ │  Fernet,     │    │
│   │  Graph) │ │  iants)  │ │  RBAC)       │    │
│   └─────────┘ └──────────┘ └──────────────┘    │
│   ┌─────────┐ ┌──────────┐ ┌──────────────┐    │
│   │ MCP Hub │ │ Web      │ │ Observa-     │    │
│   │ (conn-  │ │ Tools    │ │ bility       │    │
│   │  ectors)│ │          │ │ (metrics)    │    │
│   └─────────┘ └──────────┘ └──────────────┘    │
├─────────────────────────────────────────────────┤
│              Storage Layer                       │
│   SQLite (WAL) + JSON fallback                  │
│   Qdrant Vector Memory                          │
└─────────────────────────────────────────────────┘
```

## Ключевые возможности

| Функция | Описание |
|---------|----------|
| **LangGraph StateGraph** | Многоагентный граф с Architect → Coder → Reviewer → QA |
| **Self-Healing 2.0** | Автоматическое исправление ошибок с retry policy |
| **Мультимодальность** | 3 варианта: Original (MiniMax), Premium (Qwen), Budget (DeepSeek) |
| **Векторная память** | Qdrant для долгосрочной памяти и cross-chat learning |
| **MCP Коннекторы** | GitHub, SSH, Web Scraping, Qdrant, Email, S3 |
| **Пользовательские агенты** | Создание кастомных агентов с системными промптами |
| **Canvas** | Визуальный редактор для работы с кодом и документами |
| **Безопасность** | bcrypt хеширование, Fernet шифрование, RBAC, GDPR |
| **Аудит** | Полный журнал действий с фильтрацией и экспортом |
| **PWA** | Работает как приложение на мобильных устройствах |

## Технологический стек

**Backend:** Python 3.11, Flask, Gunicorn (gevent), LangGraph, OpenRouter API

**Frontend:** HTML5, CSS3, Vanilla JS, marked.js, highlight.js, mermaid.js

**Storage:** SQLite (WAL mode), Qdrant Vector DB

**Infrastructure:** Nginx, Let's Encrypt SSL, systemd, Ubuntu 22.04

## Быстрый старт

### Требования

- Python 3.10+
- Node.js 18+ (для разработки)
- Qdrant (опционально, для векторной памяти)

### Установка

```bash
# Клонировать репозиторий
git clone https://github.com/mksmediengruppe-netizen/super-agent.git
cd super-agent

# Создать виртуальное окружение
python3 -m venv backend/venv
source backend/venv/bin/activate

# Установить зависимости
pip install -r backend/requirements.txt

# Настроить переменные окружения
export OPENROUTER_API_KEY="sk-or-v1-..."
export DATA_DIR="./backend/data"

# Запустить
cd backend
gunicorn wsgi:app --bind 0.0.0.0:3501 --workers 2 --worker-class gevent
```

### Переменные окружения

| Переменная | Описание | По умолчанию |
|-----------|----------|-------------|
| `OPENROUTER_API_KEY` | API ключ OpenRouter | — |
| `DATA_DIR` | Директория для данных | `/var/www/super-agent/backend/data` |
| `UPLOAD_DIR` | Директория для загрузок | `/var/www/super-agent/backend/uploads` |
| `SECRET_KEY` | Секретный ключ для JWT | auto-generated |

## Структура проекта

```
super-agent/
├── backend/
│   ├── app.py              # Основное Flask-приложение (API endpoints)
│   ├── wsgi.py             # WSGI entry point
│   ├── agent_loop.py       # LangGraph StateGraph агентный цикл
│   ├── model_router.py     # Маршрутизация моделей (3 варианта)
│   ├── security.py         # Безопасность (bcrypt, Fernet, RBAC, GDPR)
│   ├── database.py         # SQLite хранилище с миграцией из JSON
│   ├── mcp_hub.py          # MCP коннекторы
│   ├── web_tools.py        # Веб-инструменты (scraping, search)
│   ├── observability.py    # Метрики и мониторинг
│   ├── memory.py           # Векторная память (Qdrant)
│   ├── project_manager.py  # Управление проектами и Canvas
│   ├── file_versioning.py  # Версионирование файлов
│   ├── retry_policy.py     # Политика повторных попыток
│   ├── idempotency.py      # Идемпотентность операций
│   ├── rate_limiter.py     # Rate limiting
│   ├── evals.py            # Оценка качества ответов
│   ├── requirements.txt    # Python зависимости
│   └── tests/              # Unit-тесты
│       ├── conftest.py
│       ├── test_security.py
│       ├── test_api.py
│       └── test_modules.py
├── frontend/
│   ├── index.html          # Главная страница (SPA)
│   ├── app.js              # Основная логика фронтенда
│   ├── style.css           # Стили
│   ├── sw.js               # Service Worker (PWA)
│   └── manifest.json       # PWA манифест
├── .github/
│   └── workflows/
│       └── ci-cd.yml       # CI/CD pipeline
└── README.md
```

## API Endpoints

### Аутентификация
- `POST /api/auth/login` — Вход в систему
- `POST /api/auth/register` — Регистрация
- `GET /api/auth/me` — Текущий пользователь

### Чаты
- `GET /api/chats` — Список чатов
- `POST /api/chats` — Создать чат
- `POST /api/chats/:id/message` — Отправить сообщение (streaming)
- `DELETE /api/chats/:id` — Удалить чат

### Агенты
- `GET /api/agents` — Список агентов
- `POST /api/agents` — Создать кастомного агента
- `DELETE /api/agents/:id` — Удалить агента

### Коннекторы
- `GET /api/connectors` — Список коннекторов
- `POST /api/connectors/:id` — Включить/выключить коннектор

### GDPR
- `GET /api/gdpr/export` — Экспорт данных пользователя
- `POST /api/gdpr/anonymize` — Анонимизация данных
- `DELETE /api/gdpr/delete` — Удаление всех данных

### Аудит
- `GET /api/audit/logs` — Журнал аудита
- `GET /api/audit/export` — Экспорт журнала

### Система
- `GET /api/health` — Статус системы
- `GET /api/analytics` — Аналитика

## Деплой

Проект развёрнут на сервере `2.56.240.170` и доступен по адресу:

**https://minimax.mksitdev.ru**

### Systemd сервис

```bash
systemctl status super-agent-api
systemctl restart super-agent-api
journalctl -u super-agent-api -f
```

### Бэкап

```bash
# Бэкап SQLite базы
cp /var/www/super-agent/backend/data/database.sqlite /backup/database_$(date +%Y%m%d).sqlite

# Бэкап загруженных файлов
tar czf /backup/uploads_$(date +%Y%m%d).tar.gz /var/www/super-agent/backend/uploads/
```

## Лицензия

Proprietary. MKS Mediengruppe / Netizen.

## Версия

**v6.0** — Март 2026
