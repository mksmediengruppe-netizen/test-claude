# Docker Compose Stack: Nginx + Flask + PostgreSQL + Redis

Полный стек для запуска Flask приложения с Nginx, PostgreSQL и Redis.

## 📁 Структура проекта

```
project/
├── docker-compose.yml          # Основной Docker Compose файл
├── .env                        # Переменные окружения (создайте из .env.example)
├── .env.example                # Пример переменных окружения
├── nginx.conf                  # Конфигурация Nginx
├── init.sql                    # Инициализация PostgreSQL
├── requirements.txt            # Python зависимости
├── app.py                      # Flask приложение
└── flask_app/
    ├── Dockerfile              # Dockerfile для Flask
    └── (другие файлы приложения)
```

## 🚀 Быстрый старт

### 1. Клонирование и настройка

```bash
# Скопируйте пример переменных окружения
cp .env.example .env

# Отредактируйте .env при необходимости
nano .env
```

### 2. Запуск стека

```bash
# Запуск всех сервисов
docker-compose up -d

# Просмотр логов
docker-compose logs -f

# Остановка всех сервисов
docker-compose down

# Остановка с удалением volumes
docker-compose down -v
```

### 3. Проверка работоспособности

```bash
# Проверка здоровья всех сервисов
curl http://localhost/health

# Проверка Flask API
curl http://localhost/api/users

# Создание пользователя
curl -X POST http://localhost/api/users \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "email": "test@example.com"}'

# Получение статистики
curl http://localhost/api/stats
```

## 🔧 Управление сервисами

### PostgreSQL

```bash
# Подключение к базе данных
docker-compose exec postgres psql -U app_user -d app_db

# Резервное копирование
docker-compose exec postgres pg_dump -U app_user app_db > backup.sql

# Восстановление
docker-compose exec -T postgres psql -U app_user app_db < backup.sql
```

### Redis

```bash
# Подключение к Redis CLI
docker-compose exec redis redis-cli -a redis_password

# Команды Redis
> KEYS *
> GET users:all
> FLUSHDB
```

### Flask

```bash
# Просмотр логов
docker-compose logs -f flask

# Перезапуск Flask
docker-compose restart flask

# Выполнение команд внутри контейнера
docker-compose exec flask python -c "print('Hello')"
```

### Nginx

```bash
# Перезагрузка конфигурации
docker-compose exec nginx nginx -s reload

# Проверка конфигурации
docker-compose exec nginx nginx -t

# Просмотр логов
docker-compose logs -f nginx
```

## 📊 Мониторинг

```bash
# Статус всех контейнеров
docker-compose ps

# Использование ресурсов
docker stats

# Логи всех сервисов
docker-compose logs

# Логи конкретного сервиса
docker-compose logs -f postgres
```

## 🔐 Безопасность

### Измените пароли по умолчанию в `.env`:

```bash
POSTGRES_PASSWORD=ваш_надежный_пароль
REDIS_PASSWORD=ваш_надежный_пароль
SECRET_KEY=ваш_секретный_ключ
```

### Настройка HTTPS (опционально)

1. Создайте директорию `nginx/ssl/`
2. Поместите сертификаты `cert.pem` и `key.pem`
3. Раскомментируйте HTTPS блок в `nginx.conf`
4. Перезапустите Nginx:
```bash
docker-compose restart nginx
```

## 🛠️ Разработка

### Режим разработки

Измените в `.env`:
```bash
FLASK_ENV=development
FLASK_DEBUG=True
```

### Горячая перезагрузка

Flask приложение монтируется как volume, поэтому изменения кода применяются автоматически.

### Добавление новых зависимостей

1. Добавьте в `requirements.txt`
2. Пересоберите контейнер:
```bash
docker-compose up -d --build flask
```

## 📝 Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `POSTGRES_DB` | Имя базы данных | `app_db` |
| `POSTGRES_USER` | Пользователь PostgreSQL | `app_user` |
| `POSTGRES_PASSWORD` | Пароль PostgreSQL | `app_password` |
| `REDIS_PASSWORD` | Пароль Redis | `redis_password` |
| `FLASK_ENV` | Окружение Flask | `production` |
| `FLASK_DEBUG` | Режим отладки | `False` |
| `SECRET_KEY` | Секретный ключ Flask | - |
| `APP_PORT` | Порт Flask | `5000` |
| `NGINX_PORT` | Порт Nginx HTTP | `80` |
| `NGINX_SSL_PORT` | Порт Nginx HTTPS | `443` |

## 🐛 Troubleshooting

### Проблема: Контейнеры не запускаются

```bash
# Проверьте логи
docker-compose logs

# Проверьте свободные порты
netstat -tulpn | grep -E ':(80|443|5432|6379|5000)'

# Очистите и перезапустите
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
docker-compose exec postgres pg_isready -U app_user
```

### Проблема: Redis недоступен

```bash
# Проверьте статус Redis
docker-compose ps redis

# Проверьте подключение
docker-compose exec redis redis-cli -a redis_password ping
```

## 📚 Дополнительные ресурсы

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Flask Documentation](https://flask.palletsprojects.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Redis Documentation](https://redis.io/documentation)
- [Nginx Documentation](https://nginx.org/en/docs/)

## 📄 Лицензия

MIT License