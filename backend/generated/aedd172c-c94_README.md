# Flask + PostgreSQL + Redis + Nginx Docker Stack

Полный стек для запуска Flask приложения с PostgreSQL, Redis и Nginx через Docker Compose.

## 📁 Структура проекта

```
.
├── docker-compose.yml          # Основной Docker Compose файл
├── .env                        # Переменные окружения (создайте из .env.example)
├── .env.example                # Пример переменных окружения
├── nginx/
│   └── nginx.conf             # Конфигурация Nginx
├── app/
│   ├── Dockerfile             # Dockerfile для Flask
│   ├── requirements.txt       # Python зависимости
│   └── app.py                 # Flask приложение
└── README.md                  # Этот файл
```

## 🚀 Быстрый старт

### 1. Клонирование и настройка

```bash
# Создайте структуру директорий
mkdir -p app nginx/conf.d nginx/ssl

# Скопируйте файлы в соответствующие директории
# docker-compose.yml -> корень проекта
# .env.example -> .env (отредактируйте значения)
# nginx.conf -> nginx/nginx.conf
# Dockerfile.flask -> app/Dockerfile
# requirements.txt -> app/requirements.txt
# app.py -> app/app.py
```

### 2. Настройка переменных окружения

```bash
# Скопируйте пример и отредактируйте
cp .env.example .env

# Отредактируйте .env и измените пароли!
nano .env
```

**Обязательно измените:**
- `SECRET_KEY` - секретный ключ Flask
- `POSTGRES_PASSWORD` - пароль PostgreSQL
- `REDIS_PASSWORD` - пароль Redis

### 3. Запуск стека

```bash
# Запуск всех сервисов
docker-compose up -d

# Просмотр логов
docker-compose logs -f

# Проверка статуса
docker-compose ps
```

### 4. Проверка работоспособности

```bash
# Health check
curl http://localhost/health

# Главная страница
curl http://localhost/

# Статистика
curl http://localhost/api/stats

# Создать пользователя
curl -X POST http://localhost/api/users \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "email": "test@example.com"}'

# Получить пользователей
curl http://localhost/api/users
```

## 📋 Доступные эндпоинты

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/` | Информация о приложении |
| GET | `/health` | Health check (DB + Redis) |
| GET | `/api/users` | Получить всех пользователей |
| POST | `/api/users` | Создать нового пользователя |
| GET | `/api/stats` | Статистика приложения |
| POST | `/api/cache/clear` | Очистить Redis кеш |

## 🔧 Управление

```bash
# Остановка сервисов
docker-compose down

# Остановка с удалением volumes
docker-compose down -v

# Рестарт сервисов
docker-compose restart

# Обновление и пересборка
docker-compose up -d --build

# Просмотр логов конкретного сервиса
docker-compose logs -f flask
docker-compose logs -f postgres
docker-compose logs -f redis
docker-compose logs -f nginx

# Вход в контейнер
docker-compose exec flask bash
docker-compose exec postgres psql -U postgres -d appdb
docker-compose exec redis redis-cli -a your-redis-password
```

## 🗄️ Работа с базой данных

```bash
# Подключение к PostgreSQL
docker-compose exec postgres psql -U postgres -d appdb

# SQL команды
\dt                    # Показать таблицы
\du                    # Показать пользователей
SELECT * FROM users;   # Показать всех пользователей
```

## 📊 Работа с Redis

```bash
# Подключение к Redis
docker-compose exec redis redis-cli -a your-redis-password

# Redis команды
KEYS *                 # Показать все ключи
GET users:all          # Получить значение ключа
FLUSHALL               # Очистить всю базу
```

## 🔒 SSL/HTTPS (опционально)

Для включения HTTPS:

1. Создайте директорию `nginx/ssl`
2. Положите сертификаты:
   - `nginx/ssl/cert.pem` - сертификат
   - `nginx/ssl/key.pem` - приватный ключ
3. Раскомментируйте HTTPS секцию в `nginx/nginx.conf`
4. Перезапустите nginx:
   ```bash
   docker-compose restart nginx
   ```

## 📈 Мониторинг

```bash
# Использование ресурсов
docker stats

# Логи всех сервисов
docker-compose logs

# Проверка health status
docker-compose ps
```

## 🐛 Troubleshooting

### Проблема: Контейнеры не запускаются

```bash
# Проверьте логи
docker-compose logs

# Удалите volumes и запустите заново
docker-compose down -v
docker-compose up -d
```

### Проблема: Нет подключения к базе данных

```bash
# Проверьте статус PostgreSQL
docker-compose ps postgres

# Проверьте логи
docker-compose logs postgres

# Проверьте подключение
docker-compose exec flask ping -c 3 postgres
```

### Проблема: Redis недоступен

```bash
# Проверьте статус Redis
docker-compose ps redis

# Проверьте подключение
docker-compose exec redis redis-cli ping
```

## 🔐 Безопасность

- ✅ Измените все пароли по умолчанию в `.env`
- ✅ Используйте HTTPS в продакшене
- ✅ Ограничьте доступ к портам базы данных
- ✅ Регулярно обновляйте образы Docker
- ✅ Используйте secrets для чувствительных данных

## 📦 Порты

| Сервис | Порт | Описание |
|--------|------|----------|
| Nginx HTTP | 80 | Веб-сервер |
| Nginx HTTPS | 443 | Веб-сервер SSL |
| Flask | 5000 | Flask приложение (внутренний) |
| PostgreSQL | 5432 | База данных |
| Redis | 6379 | Кеш |

## 📝 Лицензия

MIT License

## 🤝 Поддержка

При возникновении проблем проверьте логи:
```bash
docker-compose logs -f
```
