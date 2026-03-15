# Микросервисная архитектура E-Commerce платформы

## Обзор архитектуры

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              КЛИЕНТЫ                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   Web    │  │  Mobile  │  │   PWA    │  │  Admin   │  │ Partners │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
└───────┼────────────┼────────────┼────────────┼────────────┼─────────────────┘
        │            │            │            │            │
        └────────────┴────────────┴────────────┴────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY (Kong/NGINX)                           │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  • Аутентификация и авторизация (JWT/OAuth2)                          │   │
│  │  • Rate Limiting                                                      │   │
│  │  • Load Balancing                                                     │   │
│  │  • Request/Response Transformation                                   │   │
│  │  • SSL Termination                                                    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Service Mesh │   │   CDN / Cache │   │   WAF / DDoS  │
│  (Istio/Link) │   │   (Redis/Varnish)│   │  Protection   │
└───────────────┘   └───────────────┘   └───────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        МИКРОСЕРВИСЫ (Core Services)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   User       │  │   Product    │  │   Order      │  │   Payment    │    │
│  │   Service    │  │   Service    │  │   Service    │  │   Service    │    │
│  │              │  │              │  │              │  │              │    │
│  │ • Auth       │  │ • Catalog    │  │ • Cart       │  │ • Stripe     │    │
│  │ • Profile    │  │ • Search     │  │ • Checkout   │  │ • PayPal     │    │
│  │ • Addresses  │  │ • Inventory  │  │ • Orders     │  │ • Webhooks   │    │
│  │ • Wishlist   │  │ • Categories │  │ • History    │  │ • Refunds    │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                 │                 │            │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐    │
│  │   Cart       │  │   Catalog    │  │   Shipping   │  │   Notification│   │
│  │   Service    │  │   Service    │  │   Service    │  │   Service     │   │
│  │              │  │              │  │              │  │               │   │
│  │ • Items      │  │ • Products   │  │ • Carriers   │  │ • Email       │   │
│  │ • Quantity   │  │ • Variants   │  │ • Tracking   │  │ • SMS         │   │
│  │ • Coupons    │  │ • Pricing    │  │ • Rates      │  │ • Push        │   │
│  │ • Session    │  │ • Reviews    │  │ • Labels     │  │ • In-app      │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                 │                 │            │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐    │
│  │   Review     │  │   Search     │  │   Analytics  │  │   Report     │   │
│  │   Service    │  │   Service    │  │   Service    │  │   Service    │   │
│  │              │  │              │  │              │  │              │   │
│  │ • Ratings    │  │ • Elastic    │  │ • Events     │  │ • Sales      │   │
│  │ • Comments   │  │ • Filters    │  │ • Metrics    │  │ • Inventory  │   │
│  │ • Moderation │  │ • Autocomplete│ │ • Dashboards │  │ • Financial  │   │
│  │ • Photos     │  │ • Facets     │  │ • Reports    │  │ • Export     │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MESSAGE BROKER (Apache Kafka / RabbitMQ)                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Topics:                                                               │   │
│  │  • user.created          • product.updated    • order.created        │   │
│  │  • user.updated          • inventory.changed  • order.paid           │   │
│  │  • cart.updated          • price.changed      • order.shipped        │   │
│  │  • payment.completed     • review.submitted   • notification.send    │   │
│  │  • payment.failed        • search.indexed     • analytics.event      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Event Store  │   │  Task Queue   │   │  Dead Letter  │
│  (Event Sourcing)│  (Celery/Bull) │  │  Queue (DLQ)   │
└───────────────┘   └───────────────┘   └───────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        БАЗЫ ДАННЫХ (Data Layer)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   PostgreSQL     │  │     MongoDB      │  │     Redis        │          │
│  │   (Relational)   │  │   (Document)     │  │    (Cache)       │          │
│  │                  │  │                  │  │                  │          │
│  │ • Users          │  │ • Products       │  │ • Sessions       │          │
│  │ • Orders         │  │ • Catalog        │  │ • Cart           │          │
│  │ • Payments       │  │ • Reviews        │  │ • Rate Limits    │          │
│  │ • Addresses      │  │ • Analytics      │  │ • Hot Data       │          │
│  │ • Transactions   │  │ • Logs           │  │ • Pub/Sub        │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   Elasticsearch  │  │    TimescaleDB   │  │     S3/MinIO     │          │
│  │   (Search)       │  │   (Time Series)  │  │   (Object Store) │          │
│  │                  │  │                  │  │                  │          │
│  │ • Product Search │  │ • Metrics        │  │ • Images         │          │
│  │ • Full-text      │  │ • Analytics      │  │ • Documents      │          │
│  │ • Aggregations   │  │ • Logs           │  │ • Backups        │          │
│  │ • Facets         │  │ • Monitoring     │  │ • Exports        │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ИНФРАСТРУКТУРА (Infrastructure)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   Kubernetes     │  │   Docker         │  │   Helm Charts    │          │
│  │   (Orchestration)│  │   (Container)    │  │   (Package Mgmt) │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   Prometheus     │  │   Grafana        │  │   ELK Stack      │          │
│  │   (Metrics)      │  │   (Dashboards)   │  │   (Logs)         │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   Jaeger/Zipkin  │  │   Vault/Secrets  │  │   Terraform      │          │
│  │   (Tracing)      │  │   (Security)     │  │   (IaC)          │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Детальное описание компонентов

### 1. API Gateway
**Технологии:** Kong, NGINX, AWS API Gateway, Traefik

**Функции:**
- Единая точка входа для всех клиентов
- Аутентификация и авторизация (JWT, OAuth2, API Keys)
- Rate Limiting и Throttling
- Load Balancing между инстансами сервисов
- Request/Response трансформация
- SSL Termination
- Логирование и мониторинг запросов

### 2. Микросервисы

#### User Service
- **БД:** PostgreSQL
- **Кэш:** Redis
- **Функции:** Регистрация, авторизация, профиль, адреса, wishlist

#### Product Service
- **БД:** MongoDB (продукты), PostgreSQL (инвентарь)
- **Поиск:** Elasticsearch
- **Функции:** Каталог, поиск, фильтрация, категории, цены

#### Order Service
- **БД:** PostgreSQL
- **Очередь:** Kafka
- **Функции:** Корзина, чекаут, заказы, история

#### Payment Service
- **Интеграции:** Stripe, PayPal
- **БД:** PostgreSQL
- **Функции:** Оплаты, вебхуки, возвраты

#### Cart Service
- **БД:** Redis (быстрый доступ)
- **Функции:** Товары в корзине, купоны, сессии

#### Shipping Service
- **Интеграции:** FedEx, UPS, DHL
- **БД:** PostgreSQL
- **Функции:** Доставка, трекинг, тарифы

#### Notification Service
- **Каналы:** Email (SendGrid), SMS (Twilio), Push (Firebase)
- **Очередь:** Kafka
- **Функции:** Уведомления о заказах, промо-рассылки

#### Review Service
- **БД:** MongoDB
- **Функции:** Отзывы, рейтинги, модерация, фото

#### Search Service
- **Поиск:** Elasticsearch
- **Функции:** Полнотекстовый поиск, автодополнение, фасеты

#### Analytics Service
- **БД:** TimescaleDB, ClickHouse
- **Очередь:** Kafka
- **Функции:** Сбор событий, метрики, дашборды

#### Report Service
- **БД:** PostgreSQL (реплика)
- **Функции:** Отчёты по продажам, инвентарю, финансам

### 3. Message Broker
**Технологии:** Apache Kafka, RabbitMQ

**Topics:**
- `user.*` - события пользователей
- `product.*` - события продуктов
- `order.*` - события заказов
- `payment.*` - события оплат
- `notification.*` - уведомления
- `analytics.*` - аналитические события

### 4. Базы данных

| Тип БД | Технология | Назначение |
|--------|-----------|-----------|
| Relational | PostgreSQL | Транзакционные данные (пользователи, заказы, платежи) |
| Document | MongoDB | Каталог, отзывы, аналитика |
| Cache | Redis | Сессии, корзина, rate limiting, кэширование |
| Search | Elasticsearch | Полнотекстовый поиск продуктов |
| Time Series | TimescaleDB | Метрики, логи, аналитика |
| Object Store | S3/MinIO | Изображения, документы, бэкапы |

### 5. Инфраструктура

**Оркестрация:**
- Kubernetes + Docker
- Helm Charts для деплоя
- GitOps (ArgoCD/Flux)

**Мониторинг:**
- Prometheus (метрики)
- Grafana (дашборды)
- Jaeger/Zipkin (tracing)
- ELK Stack (логи)

**Безопасность:**
- HashiCorp Vault (secrets)
- OAuth2/OIDC (auth)
- TLS везде
- Network policies

**CI/CD:**
- GitHub Actions / GitLab CI
- Docker Registry
- Automated testing

## Потоки данных

### 1. Создание заказа
```
Client → API Gateway → Order Service
                              ↓
                         Kafka (order.created)
                              ↓
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   Payment Service      Inventory Service    Notification Service
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                         Kafka (order.completed)
                              ↓
                    Analytics Service (event)
```

### 2. Обновление продукта
```
Admin → API Gateway → Product Service
                              ↓
                         MongoDB (update)
                              ↓
                         Kafka (product.updated)
                              ↓
                    Elasticsearch (reindex)
                              ↓
                    Cache invalidation (Redis)
```

### 3. Поиск продуктов
```
Client → API Gateway → Search Service
                              ↓
                    Elasticsearch (query)
                              ↓
                         Redis (cache)
                              ↓
                         Response
```

## Масштабирование

**Горизонтальное масштабирование:**
- Stateless сервисы масштабируются автоматически (HPA)
- Stateful сервисы используют шардирование

**Вертикальное масштабирование:**
- Базы данных: read replicas, connection pooling
- Кэш: Redis Cluster

## Резервирование и отказоустойчивость

- **High Availability:** Multiple replicas, multi-zone deployment
- **Circuit Breakers:** Resilience4j, Hystrix
- **Retries with Backoff:** Exponential backoff
- **Dead Letter Queues:** Failed messages processing
- **Health Checks:** Liveness/Readiness probes
- **Graceful Shutdown:** Zero-downtime deployments

## Безопасность

- **Authentication:** JWT, OAuth2, OpenID Connect
- **Authorization:** RBAC, ABAC
- **API Security:** Rate limiting, input validation, SQL injection prevention
- **Data Encryption:** TLS in transit, at rest encryption
- **Secrets Management:** Vault, Kubernetes Secrets
- **Network Security:** Service mesh mTLS, network policies

## Мониторинг и наблюдаемость

**Метрики:**
- Request rate, latency, error rate (RED)
- Resource utilization (CPU, memory, disk)
- Business metrics (orders, revenue, conversion)

**Логирование:**
- Structured logging (JSON)
- Centralized log aggregation (ELK)
- Log correlation (trace ID)

**Tracing:**
- Distributed tracing (Jaeger/Zipkin)
- Request flow across services
- Performance bottleneck identification

## Технологический стек

| Слой | Технологии |
|------|-----------|
| API Gateway | Kong, NGINX, Traefik |
| Service Mesh | Istio, Linkerd |
| Message Broker | Apache Kafka, RabbitMQ |
| Databases | PostgreSQL, MongoDB, Redis, Elasticsearch |
| Search | Elasticsearch, OpenSearch |
| Cache | Redis, Memcached |
| Container | Docker, containerd |
| Orchestration | Kubernetes |
| CI/CD | GitHub Actions, GitLab CI, ArgoCD |
| Monitoring | Prometheus, Grafana, Jaeger |
| Logging | ELK Stack, Loki |
| Security | Vault, OAuth2, mTLS |
| IaC | Terraform, Helm |

## Преимущества архитектуры

1. **Масштабируемость:** Каждый сервис масштабируется независимо
2. **Отказоустойчивость:** Изоляция сбоев между сервисами
3. **Гибкость:** Легко добавлять новые функции
4. **Технологическое разнообразие:** Оптимальные технологии для каждого сервиса
5. **Независимые команды:** Параллельная разработка
6. **Быстрый деплой:** Continuous Delivery
7. **Наблюдаемость:** Полная прозрачность системы

## Вызовы и решения

| Вызов | Решение |
|-------|---------|
| Распределённые транзакции | Saga pattern, eventual consistency |
| Сложность деплоя | Kubernetes, Helm, GitOps |
| Отладка | Distributed tracing, centralized logging |
| Data consistency | Event sourcing, CQRS |
| Performance | Caching, read replicas, CDN |
| Security | Service mesh, mTLS, zero-trust |