# Схема базы данных - Система бронирования отелей

## 📊 Обзор

| Метрика | Значение |
|---------|----------|
| Таблицы | 12 |
| Внешние ключи | 15 |
| Индексы | 40+ |
| Триггеры | 3 |
| Хранимые процедуры | 2 |
| Представления (Views) | 2 |

---

## 🏨 Основные таблицы

### 1. HOTELS (Отели)
**Назначение:** Хранит информацию об отелях

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT PK | Первичный ключ |
| name | VARCHAR(255) | Название отеля |
| description | TEXT | Описание |
| address | VARCHAR(500) | Адрес |
| city | VARCHAR(100) | Город |
| country | VARCHAR(100) | Страна |
| postal_code | VARCHAR(20) | Почтовый индекс |
| phone | VARCHAR(30) | Телефон |
| email | VARCHAR(255) | Email |
| website | VARCHAR(255) | Сайт |
| rating | DECIMAL(3,2) | Рейтинг (0-5) |
| star_rating | TINYINT | Количество звёзд (1-5) |
| check_in_time | TIME | Время заезда |
| check_out_time | TIME | Время выезда |
| is_active | BOOLEAN | Активен ли отель |

**Индексы:**
- idx_hotels_city (city)
- idx_hotels_country (country)
- idx_hotels_rating (rating)
- idx_hotels_active (is_active)
- idx_hotels_name (name)

---

### 2. ROOM_TYPES (Типы номеров)
**Назначение:** Категории номеров в отеле

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT PK | Первичный ключ |
| hotel_id | BIGINT FK | Ссылка на HOTELS |
| name | VARCHAR(100) | Название типа |
| description | TEXT | Описание |
| max_occupancy | TINYINT | Макс. гостей |
| base_price | DECIMAL(10,2) | Базовая цена |
| size_sqm | DECIMAL(8,2) | Площадь (м²) |
| bed_type | VARCHAR(50) | Тип кровати |
| amenities | JSON | Удобства |

**Индексы:**
- idx_room_types_hotel (hotel_id)
- idx_room_types_occupancy (max_occupancy)
- idx_room_types_price (base_price)

---

### 3. ROOMS (Номера)
**Назначение:** Конкретные номера в отеле

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT PK | Первичный ключ |
| hotel_id | BIGINT FK | Ссылка на HOTELS |
| room_type_id | BIGINT FK | Ссылка на ROOM_TYPES |
| room_number | VARCHAR(20) | Номер комнаты |
| floor_number | TINYINT | Этаж |
| is_available | BOOLEAN | Доступен |
| is_maintenance | BOOLEAN | На ремонте |

**Индексы:**
- uk_hotel_room (hotel_id, room_number) - УНИКАЛЬНЫЙ
- idx_rooms_hotel (hotel_id)
- idx_rooms_type (room_type_id)
- idx_rooms_available (is_available)

---

### 4. USERS (Пользователи)
**Назначение:** Информация о клиентах

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT PK | Первичный ключ |
| first_name | VARCHAR(100) | Имя |
| last_name | VARCHAR(100) | Фамилия |
| email | VARCHAR(255) | Email (уникальный) |
| phone | VARCHAR(30) | Телефон |
| password_hash | VARCHAR(255) | Хеш пароля |
| date_of_birth | DATE | Дата рождения |
| nationality | VARCHAR(100) | Гражданство |
| passport_number | VARCHAR(50) | Номер паспорта |
| is_verified | BOOLEAN | Верифицирован |
| is_active | BOOLEAN | Активен |

**Индексы:**
- idx_users_email (email)
- idx_users_name (first_name, last_name)
- idx_users_active (is_active)

---

### 5. BOOKINGS (Бронирования)
**Назначение:** Основная таблица бронирований

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT PK | Первичный ключ |
| user_id | BIGINT FK | Ссылка на USERS |
| hotel_id | BIGINT FK | Ссылка на HOTELS |
| room_id | BIGINT FK | Ссылка на ROOMS |
| check_in_date | DATE | Дата заезда |
| check_out_date | DATE | Дата выезда |
| adults_count | TINYINT | Взрослых |
| children_count | TINYINT | Детей |
| total_price | DECIMAL(10,2) | Общая цена |
| currency | VARCHAR(3) | Валюта |
| status | ENUM | Статус бронирования |
| payment_status | ENUM | Статус оплаты |
| special_requests | TEXT | Особые пожелания |

**Статусы бронирования:** pending, confirmed, cancelled, completed, no_show

**Индексы:**
- idx_bookings_user (user_id)
- idx_bookings_hotel (hotel_id)
- idx_bookings_room (room_id)
- idx_bookings_dates (check_in_date, check_out_date)
- idx_bookings_status (status)

---

### 6. PAYMENTS (Платежи)
**Назначение:** История платежей

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT PK | Первичный ключ |
| booking_id | BIGINT FK | Ссылка на BOOKINGS |
| amount | DECIMAL(10,2) | Сумма |
| currency | VARCHAR(3) | Валюта |
| payment_method | ENUM | Способ оплаты |
| payment_status | ENUM | Статус платежа |
| transaction_id | VARCHAR(255) | ID транзакции |
| gateway_response | JSON | Ответ шлюза |
| processed_at | TIMESTAMP | Обработано |

**Способы оплаты:** credit_card, debit_card, paypal, bank_transfer, cash, crypto

---

### 7. REVIEWS (Отзывы)
**Назначение:** Отзывы гостей

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT PK | Первичный ключ |
| booking_id | BIGINT FK | Ссылка на BOOKINGS |
| user_id | BIGINT FK | Ссылка на USERS |
| hotel_id | BIGINT FK | Ссылка на HOTELS |
| rating | TINYINT | Общая оценка (1-5) |
| title | VARCHAR(255) | Заголовок |
| comment | TEXT | Комментарий |
| staff_rating | TINYINT | Оценка персонала |
| cleanliness_rating | TINYINT | Оценка чистоты |
| comfort_rating | TINYINT | Оценка комфорта |
| location_rating | TINYINT | Оценка расположения |
| facilities_rating | TINYINT | Оценка удобств |
| is_public | BOOLEAN | Опубликован |

---

### 8. ROOM_PRICING (Цены номеров)
**Назначение:** Динамическое ценообразование

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT PK | Первичный ключ |
| room_type_id | BIGINT FK | Ссылка на ROOM_TYPES |
| date | DATE | Дата |
| price | DECIMAL(10,2) | Цена |
| is_available | BOOLEAN | Доступен |
| min_stay_nights | TINYINT | Мин. ночей |

**Индексы:**
- uk_room_type_date (room_type_id, date) - УНИКАЛЬНЫЙ
- idx_pricing_date (date)

---

### 9. HOTEL_SERVICES (Услуги отеля)
**Назначение:** Дополнительные услуги

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT PK | Первичный ключ |
| hotel_id | BIGINT FK | Ссылка на HOTELS |
| name | VARCHAR(100) | Название услуги |
| description | TEXT | Описание |
| price | DECIMAL(10,2) | Цена |
| is_free | BOOLEAN | Бесплатно |
| category | VARCHAR(50) | Категория |

---

### 10. BOOKING_SERVICES (Заказанные услуги)
**Назначение:** Связь бронирования с услугами

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT PK | Первичный ключ |
| booking_id | BIGINT FK | Ссылка на BOOKINGS |
| service_id | BIGINT FK | Ссылка на HOTEL_SERVICES |
| quantity | TINYINT | Количество |
| price | DECIMAL(10,2) | Цена |
| total_price | GENERATED | Вычисляемое поле |

---

### 11. SEASONS (Сезоны)
**Назначение:** Сезонные коэффициенты цен

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT PK | Первичный ключ |
| hotel_id | BIGINT FK | Ссылка на HOTELS |
| name | VARCHAR(100) | Название сезона |
| start_date | DATE | Начало |
| end_date | DATE | Конец |
| price_multiplier | DECIMAL(4,3) | Коэффициент цены |
| is_active | BOOLEAN | Активен |

---

### 12. ACTIVITY_LOGS (Логи активности)
**Назначение:** Аудит действий

| Поле | Тип | Описание |
|------|-----|----------|
| id | BIGINT PK | Первичный ключ |
| user_id | BIGINT FK | Ссылка на USERS |
| booking_id | BIGINT FK | Ссылка на BOOKINGS |
| action | VARCHAR(100) | Действие |
| entity_type | VARCHAR(50) | Тип сущности |
| entity_id | BIGINT | ID сущности |
| old_values | JSON | Старые значения |
| new_values | JSON | Новые значения |
| ip_address | VARCHAR(45) | IP адрес |
| created_at | TIMESTAMP | Время |

---

## 🔗 Связи между таблицами

```
HOTELS
  ├─→ ROOM_TYPES (1:N)
  ├─→ ROOMS (1:N)
  ├─→ BOOKINGS (1:N)
  ├─→ REVIEWS (1:N)
  ├─→ HOTEL_SERVICES (1:N)
  └─→ SEASONS (1:N)

ROOM_TYPES
  ├─→ ROOMS (1:N)
  └─→ ROOM_PRICING (1:N)

ROOMS
  └─→ BOOKINGS (1:N)

USERS
  ├─→ BOOKINGS (1:N)
  ├─→ REVIEWS (1:N)
  └─→ ACTIVITY_LOGS (1:N)

BOOKINGS
  ├─→ PAYMENTS (1:N)
  ├─→ REVIEWS (1:1)
  ├─→ BOOKING_SERVICES (1:N)
  └─→ ACTIVITY_LOGS (1:N)

HOTEL_SERVICES
  └─→ BOOKING_SERVICES (1:N)
```

---

## 🚀 Хранимые процедуры

### check_room_availability
Проверяет доступность номеров на заданные даты

**Параметры:**
- p_hotel_id - ID отеля
- p_check_in - Дата заезда
- p_check_out - Дата выезда
- p_adults - Количество взрослых
- p_children - Количество детей

### create_booking
Создаёт новое бронирование с проверкой доступности

**Параметры:**
- p_user_id - ID пользователя
- p_hotel_id - ID отеля
- p_room_id - ID номера
- p_check_in - Дата заезда
- p_check_out - Дата выезда
- p_adults - Количество взрослых
- p_children - Количество детей
- p_total_price - Общая цена
- p_special_requests - Особые пожелания

---

## 🔔 Триггеры

### update_hotel_rating_after_review
Автоматически обновляет рейтинг отеля при добавлении нового отзыва

### log_booking_status_change
Логирует изменения статуса бронирования в таблицу activity_logs

---

## 📊 Представления (Views)

### booking_details
Детальная информация о бронированиях с данными пользователя, отеля и номера

### hotel_statistics
Статистика по отелям: количество номеров, бронирований, средний рейтинг

---

## 🎯 Ключевые особенности

1. **Нормализация:** Таблицы нормализованы до 3NF
2. **Индексы:** Оптимизированы для частых запросов
3. **Ограничения:** CHECK constraints для валидации данных
4. **JSON:** Использование JSON для гибких данных (amenities, gateway_response)
5. **Аудит:** Полная история действий в activity_logs
6. **Динамическое ценообразование:** Поддержка сезонных цен и цен по датам
7. **Мультивалютность:** Поддержка разных валют
8. **Статусы:** Детальные статусы для бронирований и платежей

---

## 📝 Примеры запросов

### Поиск доступных номеров
```sql
CALL check_room_availability(1, '2024-06-01', '2024-06-05', 2, 0);
```

### Создание бронирования
```sql
CALL create_booking(1, 1, 5, '2024-06-01', '2024-06-05', 2, 0, 500.00, 'Номер с видом на море');
```

### Статистика отеля
```sql
SELECT * FROM hotel_statistics WHERE id = 1;
```

### Детали бронирования
```sql
SELECT * FROM booking_details WHERE id = 1;
```

---

## 🔧 Установка

1. Импортируйте SQL файл:
```bash
mysql -u root -p < hotel_booking_schema.sql
```

2. База данных будет создана автоматически с именем `hotel_booking_system`

3. Все таблицы, индексы, триггеры и процедуры будут созданы

---

## 📄 Лицензия

MIT License - свободно использовать в коммерческих и некоммерческих проектах.