# 🏨 Схема базы данных: Система бронирования отелей

## 📊 Обзор

Полная реляционная схема базы данных для системы бронирования отелей с поддержкой:
- Управления пользователями и ролями
- Каталога отелей и номеров
- Системы бронирований
- Обработки платежей
- Отзывов и рейтингов
- Динамического ценообразования
- Аудита активности

---

## 📋 Структура базы данных

### 🗂️ Справочные таблицы

| Таблица | Описание | Записей |
|---------|----------|---------|
| `countries` | Страны (ISO коды) | ~250 |
| `cities` | Города с координатами | ~10,000+ |
| `room_types` | Типы номеров | 7 |
| `amenities` | Удобства (Wi-Fi, бассейн и т.д.) | 20+ |

### 👥 Основные таблицы

| Таблица | Описание | Ключевые поля |
|---------|----------|---------------|
| `users` | Пользователи системы | user_id, email, role |
| `hotels` | Отели | hotel_id, owner_id, city_id, star_rating |
| `rooms` | Номера | room_id, hotel_id, room_type_id, base_price |
| `bookings` | Бронирования | booking_id, user_id, hotel_id, status |
| `booking_rooms` | Связь бронирования с номерами | booking_room_id, booking_id, room_id |
| `payments` | Платежи | payment_id, booking_id, amount, status |
| `reviews` | Отзывы и рейтинги | review_id, booking_id, rating |

### 🔗 Связующие таблицы

| Таблица | Описание |
|---------|----------|
| `hotel_amenities` | Удобства отелей |
| `room_amenities` | Удобства номеров |
| `hotel_images` | Изображения отелей |
| `room_images` | Изображения номеров |

### 💰 Дополнительные таблицы

| Таблица | Описание |
|---------|----------|
| `room_pricing` | Динамическое ценообразование |
| `activity_log` | Лог активности (аудит) |

---

## 🔗 ER Диаграмма (Связи)

```
USERS ──┬──> BOOKINGS ──┬──> BOOKING_ROOMS ──> ROOMS ──> ROOM_TYPES
        │               │
        │               └──> PAYMENTS
        │
        ├──> REVIEWS ──> HOTELS ──┬──> ROOMS
        │                         │
        └──> HOTELS (owner)       ├──> HOTEL_AMENITIES ──> AMENITIES
                                  │
                                  └──> HOTEL_IMAGES

COUNTRIES ──> CITIES ──> HOTELS

ROOMS ──> ROOM_IMAGES
ROOMS ──> ROOM_PRICING
```

### Типы связей

| Связь | Тип | Описание |
|-------|-----|----------|
| User → Bookings | 1:N | Один пользователь может иметь много бронирований |
| Hotel → Rooms | 1:N | Один отель имеет много номеров |
| Booking → Booking_Rooms | 1:N | Одно бронирование может включать несколько номеров |
| Room → Booking_Rooms | 1:N | Один номер может быть в нескольких бронированиях |
| Hotel → Reviews | 1:N | Один отель может иметь много отзывов |
| Booking → Reviews | 1:1 | Одно бронирование = один отзыв |
| Booking → Payments | 1:N | Одно бронирование может иметь несколько платежей |

---

## 📊 Индексы

### Первичные ключи (PK)
Все таблицы имеют автоинкрементный первичный ключ `*_id`

### Уникальные индексы (UK)
- `users.email` - уникальный email
- `bookings.booking_reference` - уникальный код бронирования
- `countries.country_code` - ISO код страны
- `amenities.amenity_name` - название удобства
- `rooms(hotel_id, room_number)` - уникальный номер в отеле
- `reviews(booking_id)` - один отзыв на бронирование

### Внешние ключи (FK)
Все связи между таблицами обеспечены внешними ключами с CASCADE/RESTRICT

### Оптимизационные индексы

#### Поиск и фильтрация
```sql
-- Пользователи
INDEX idx_email (email)
INDEX idx_name (last_name, first_name)
INDEX idx_role (role)

-- Отели
INDEX idx_hotel_name (hotel_name)
INDEX idx_city_id (city_id)
INDEX idx_star_rating (star_rating)
INDEX idx_location (latitude, longitude)
FULLTEXT idx_search (hotel_name, description)

-- Номера
INDEX idx_base_price (base_price)
INDEX idx_max_occupancy (max_occupancy)
INDEX idx_is_active (is_active)

-- Бронирования
INDEX idx_dates (check_in_date, check_out_date)
INDEX idx_status (status)
INDEX idx_user_status (user_id, status)
INDEX idx_hotel_dates (hotel_id, check_in_date, check_out_date)

-- Отзывы
INDEX idx_rating (rating)
INDEX idx_is_verified (is_verified)
```

#### Сортировка и пагинация
```sql
INDEX idx_created_at (created_at)  -- bookings, payments, reviews
```

---

## 🎯 Хранимые процедуры

### 1. `check_room_availability`
Проверка доступности номеров по датам и количеству гостей

**Параметры:**
- `p_hotel_id` - ID отеля
- `p_check_in` - Дата заезда
- `p_check_out` - Дата выезда
- `p_guest_count` - Количество гостей

**Возвращает:** Список доступных номеров с ценами

### 2. `get_booking_stats`
Статистика бронирований за период

**Параметры:**
- `p_start_date` - Начальная дата
- `p_end_date` - Конечная дата
- `p_hotel_id` - ID отеля (опционально)

**Возвращает:** Агрегированную статистику по статусам и выручке

---

## 👁️ Представления (Views)

### 1. `hotel_stats`
Статистика отеля:
- Общее количество номеров
- Активные номера
- Всего бронирований
- Подтверждённые/отменённые бронирования
- Средний рейтинг
- Количество отзывов

### 2. `available_rooms`
Список всех активных номеров с информацией об отеле и типе

---

## ⚡ Триггеры

### 1. `before_booking_insert`
Автоматическая генерация уникального reference кода бронирования в формате: `BKYYYYMMDDXXXX`

### 2. `after_booking_update`
Логирование изменений статуса бронирования в таблицу `activity_log`

---

## 🔐 Безопасность

### Роли пользователей
- `guest` - обычный гость
- `admin` - администратор системы
- `staff` - сотрудник отеля

### Статусы бронирования
- `pending` - ожидает подтверждения
- `confirmed` - подтверждено
- `checked_in` - заселён
- `checked_out` - выселен
- `cancelled` - отменено
- `no_show` - не явился

### Статусы платежей
- `pending` - ожидает оплаты
- `partial` - частично оплачено
- `paid` - оплачено
- `refunded` - возвращено
- `failed` - ошибка оплаты

---

## 📈 Масштабируемость

### Оптимизация для больших объёмов данных
1. **Партиционирование** таблицы `bookings` по дате
2. **Шардирование** по `hotel_id` для крупных систем
3. **Read replicas** для аналитических запросов
4. **Кэширование** популярных отелей и номеров

### Рекомендуемые настройки MySQL
```ini
innodb_buffer_pool_size = 4G
innodb_log_file_size = 512M
query_cache_size = 256M
max_connections = 500
```

---

## 🚀 Начальные данные

### Типы номеров (предустановлены)
- Standard
- Deluxe
- Suite
- Family Room
- Single
- Twin
- Presidential Suite

### Удобства (предустановлены)
- Wi-Fi, Air Conditioning, TV, Mini Bar
- Swimming Pool, Fitness Center, Spa
- Restaurant, Bar, Parking
- 24/7 Reception, Room Service
- Airport Shuttle, Laundry

---

## 📝 Примеры запросов

### Поиск доступных номеров
```sql
CALL check_room_availability(1, '2024-06-01', '2024-06-05', 2);
```

### Статистика отеля
```sql
SELECT * FROM hotel_stats WHERE hotel_id = 1;
```

### Топ отелей по рейтингу
```sql
SELECT h.hotel_name, hs.average_rating, hs.total_reviews
FROM hotels h
JOIN hotel_stats hs ON h.hotel_id = hs.hotel_id
WHERE h.is_active = TRUE
ORDER BY hs.average_rating DESC, hs.total_reviews DESC
LIMIT 10;
```

### Бронирования пользователя
```sql
SELECT b.*, h.hotel_name, h.city_id
FROM bookings b
JOIN hotels h ON b.hotel_id = h.hotel_id
WHERE b.user_id = 123
ORDER BY b.created_at DESC;
```

---

## 📦 Технические характеристики

| Характеристика | Значение |
|----------------|----------|
| СУБД | MySQL 8.0+ / PostgreSQL 12+ |
| Движок | InnoDB |
| Кодировка | UTF-8 (utf8mb4) |
| Коллизия | utf8mb4_unicode_ci |
| Таблиц | 15 |
| Индексов | 25+ |
| Представлений | 3 |
| Хранимых процедур | 2 |
| Триггеров | 2 |

---

## ✅ Особенности реализации

1. **Нормализация** - 3NF для минимизации дублирования
2. **Целостность данных** - FK constraints + CHECK constraints
3. **Производительность** - Оптимизированные индексы для частых запросов
4. **Аудит** - Полный лог изменений в `activity_log`
5. **Гибкость** - Поддержка динамического ценообразования
6. **Масштабируемость** - Готова к шардингу и репликации
7. **i18n** - Поддержка UTF-8 для мультиязычности

---

## 📞 Поддержка

Для вопросов и предложений по схеме базы данных обращайтесь к разработчику.

---

*Документация сгенерирована автоматически*
*Версия схемы: 1.0*
*Дата создания: 2024*
