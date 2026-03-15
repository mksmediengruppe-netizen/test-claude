# Сложный SQL-запрос с JOIN трёх таблиц

## SQL-запрос

```sql
SELECT 
    u.username AS customer_name,
    u.email,
    COUNT(o.order_id) AS total_orders,
    SUM(oi.quantity * p.price) AS total_spent,
    AVG(p.price) AS avg_product_price,
    MAX(o.order_date) AS last_order_date
FROM 
    users u
INNER JOIN 
    orders o ON u.user_id = o.user_id
INNER JOIN 
    order_items oi ON o.order_id = oi.order_id
INNER JOIN 
    products p ON oi.product_id = p.product_id
WHERE 
    o.order_date >= '2024-01-01'
    AND o.status != 'cancelled'
GROUP BY 
    u.user_id,
    u.username,
    u.email
HAVING 
    COUNT(o.order_id) >= 3
    AND SUM(oi.quantity * p.price) > 1000
ORDER BY 
    total_spent DESC,
    total_orders DESC
LIMIT 10;
```

---

## Подробное объяснение каждой части

### 1. SELECT — выборка данных
```sql
SELECT 
    u.username AS customer_name,
    u.email,
    COUNT(o.order_id) AS total_orders,
    SUM(oi.quantity * p.price) AS total_spent,
    AVG(p.price) AS avg_product_price,
    MAX(o.order_date) AS last_order_date
```

| Выражение | Описание |
|-----------|----------|
| `u.username AS customer_name` | Выбирает имя пользователя и переименовывает колонку в `customer_name` |
| `u.email` | Выбирает email пользователя |
| `COUNT(o.order_id)` | Подсчитывает количество заказов для каждого пользователя |
| `SUM(oi.quantity * p.price)` | Суммирует общую потраченную сумму (количество × цена) |
| `AVG(p.price)` | Вычисляет среднюю цену купленных товаров |
| `MAX(o.order_date)` | Находит дату последнего заказа |

---

### 2. FROM и JOIN — объединение таблиц
```sql
FROM users u
INNER JOIN orders o ON u.user_id = o.user_id
INNER JOIN order_items oi ON o.order_id = oi.order_id
INNER JOIN products p ON oi.product_id = p.product_id
```

| JOIN | Описание |
|------|----------|
| `FROM users u` | Основная таблица — пользователи (алиас `u`) |
| `INNER JOIN orders o` | Присоединяет таблицу заказов по `user_id` |
| `INNER JOIN order_items oi` | Присоединяет позиции заказа по `order_id` |
| `INNER JOIN products p` | Присоединяет товары по `product_id` |

**INNER JOIN** возвращает только те строки, для которых есть совпадения во всех таблицах.

---

### 3. WHERE — фильтрация до группировки
```sql
WHERE 
    o.order_date >= '2024-01-01'
    AND o.status != 'cancelled'
```

| Условие | Описание |
|---------|----------|
| `o.order_date >= '2024-01-01'` | Только заказы с 2024 года |
| `o.status != 'cancelled'` | Исключает отменённые заказы |

**WHERE** фильтрует строки **ДО** группировки.

---

### 4. GROUP BY — группировка данных
```sql
GROUP BY 
    u.user_id,
    u.username,
    u.email
```

Группирует результаты по уникальным пользователям. Все агрегатные функции (`COUNT`, `SUM`, `AVG`, `MAX`) вычисляются **внутри каждой группы**.

---

### 5. HAVING — фильтрация после группировки
```sql
HAVING 
    COUNT(o.order_id) >= 3
    AND SUM(oi.quantity * p.price) > 1000
```

| Условие | Описание |
|---------|----------|
| `COUNT(o.order_id) >= 3` | Только пользователи с 3+ заказами |
| `SUM(oi.quantity * p.price) > 1000` | Только потратившие более $1000 |

**HAVING** фильтрует группы **ПОСЛЕ** группировки (в отличие от WHERE).

---

### 6. ORDER BY — сортировка результатов
```sql
ORDER BY 
    total_spent DESC,
    total_orders DESC
```

| Условие | Описание |
|---------|----------|
| `total_spent DESC` | Сортировка по общей сумме по убыванию |
| `total_orders DESC` | При равной сумме — по количеству заказов |

---

### 7. LIMIT — ограничение количества строк
```sql
LIMIT 10;
```

Возвращает только первые 10 записей (топ-10 клиентов по расходам).

---

## Порядок выполнения SQL-запроса

```
1. FROM / JOIN      → Определение источника данных
2. WHERE            → Фильтрация строк
3. GROUP BY         → Группировка
4. HAVING           → Фильтрация групп
5. SELECT           → Выборка и вычисление значений
6. ORDER BY         → Сортировка
7. LIMIT            → Ограничение результата
```

---

## Пример результата

| customer_name | email | total_orders | total_spent | avg_product_price | last_order_date |
|---------------|-------|--------------|-------------|------------------|-----------------|
| Иван Петров | ivan@mail.ru | 5 | 3450.00 | 115.00 | 2024-03-15 |
| Мария Сидорова | maria@gmail.com | 4 | 2890.50 | 96.35 | 2024-03-10 |
| Алексей Козлов | alex@yandex.ru | 3 | 1567.00 | 78.35 | 2024-02-28 |

---

## Ключевые отличия

| WHERE | HAVING |
|-------|--------|
| Фильтрует строки ДО группировки | Фильтрует группы ПОСЛЕ группировки |
| Не может использовать агрегатные функции | Может использовать агрегатные функции |
| Применяется к отдельным записям | Применяется к результатам группировки |
