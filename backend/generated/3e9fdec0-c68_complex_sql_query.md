# Сложный SQL-запрос с JOIN трёх таблиц

## SQL-запрос

```sql
SELECT 
    u.id AS user_id,
    u.name AS user_name,
    u.email,
    COUNT(o.id) AS total_orders,
    SUM(oi.quantity * p.price) AS total_spent,
    AVG(p.price) AS avg_product_price,
    MAX(o.order_date) AS last_order_date
FROM 
    users u
LEFT JOIN 
    orders o ON u.id = o.user_id
LEFT JOIN 
    order_items oi ON o.id = oi.order_id
LEFT JOIN 
    products p ON oi.product_id = p.id
WHERE 
    u.status = 'active'
    AND o.order_date >= '2024-01-01'
GROUP BY 
    u.id, u.name, u.email
HAVING 
    COUNT(o.id) >= 3
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
    u.id AS user_id,
    u.name AS user_name,
    u.email,
    COUNT(o.id) AS total_orders,
    SUM(oi.quantity * p.price) AS total_spent,
    AVG(p.price) AS avg_product_price,
    MAX(o.order_date) AS last_order_date
```
- Выбираем поля из таблицы `users` с алиасами для удобства
- **COUNT(o.id)** — подсчитывает количество заказов для каждого пользователя
- **SUM(oi.quantity * p.price)** — суммирует общую сумму потраченных денег (количество × цена)
- **AVG(p.price)** — вычисляет среднюю цену купленных товаров
- **MAX(o.order_date)** — находит дату последнего заказа
- **AS** — задаёт псевдонимы для столбцов в результате

---

### 2. FROM и JOIN — объединение таблиц
```sql
FROM 
    users u
LEFT JOIN 
    orders o ON u.id = o.user_id
LEFT JOIN 
    order_items oi ON o.id = oi.order_id
LEFT JOIN 
    products p ON oi.product_id = p.id
```

| Тип JOIN | Описание |
|----------|----------|
| **LEFT JOIN** | Возвращает все записи из левой таблицы (users) и совпадающие из правой. Если совпадений нет — NULL |
| **INNER JOIN** | Возвращает только записи с совпадениями в обеих таблицах |
| **RIGHT JOIN** | Возвращает все записи из правой таблицы и совпадающие из левой |

**Логика объединения:**
1. `users u` — основная таблица, алиас `u`
2. Присоединяем `orders o` по условию `u.id = o.user_id` (связь пользователь → заказы)
3. Присоединяем `order_items oi` по условию `o.id = oi.order_id` (заказ → товары в заказе)
4. Присоединяем `products p` по условию `oi.product_id = p.id` (товары → информация о товаре)

---

### 3. WHERE — фильтрация до группировки
```sql
WHERE 
    u.status = 'active'
    AND o.order_date >= '2024-01-01'
```
- Фильтрует записи **ДО** применения GROUP BY
- **u.status = 'active'** — только активные пользователи
- **o.order_date >= '2024-01-01'** — только заказы с 2024 года
- Используются индексы для быстрого поиска

---

### 4. GROUP BY — группировка
```sql
GROUP BY 
    u.id, u.name, u.email
```
- Группирует результаты по указанным полям
- Все поля в SELECT, не использующие агрегатные функции, должны быть в GROUP BY
- Агрегатные функции (COUNT, SUM, AVG, MAX, MIN) применяются к каждой группе

**Пример результата группировки:**
| user_id | user_name | total_orders | total_spent |
|---------|-----------|--------------|-------------|
| 1 | Иван | 5 | 15000 |
| 2 | Мария | 3 | 8500 |

---

### 5. HAVING — фильтрация после группировки
```sql
HAVING 
    COUNT(o.id) >= 3
    AND SUM(oi.quantity * p.price) > 1000
```
- Фильтрует **ПОСЛЕ** группировки (в отличие от WHERE)
- **COUNT(o.id) >= 3** — только пользователи с 3+ заказами
- **SUM(...) > 1000** — только потратившие более 1000
- Можно использовать агрегатные функции

**Разница WHERE vs HAVING:**
| WHERE | HAVING |
|-------|-------|
| Фильтрует строки ДО группировки | Фильтрует группы ПОСЛЕ группировки |
| Не может использовать агрегатные функции | Может использовать агрегатные функции |
| Работает быстрее (меньше данных) | Работает медленнее (больше данных) |

---

### 6. ORDER BY — сортировка
```sql
ORDER BY 
    total_spent DESC,
    total_orders DESC
```
- Сортирует результат по указанным полям
- **DESC** — по убыванию (от большего к меньшему)
- **ASC** — по возрастанию (по умолчанию)
- Можно сортировать по нескольким полям с приоритетом

**Логика сортировки:**
1. Сначала по `total_spent` DESC (кто больше потратил)
2. При равенстве — по `total_orders` DESC (кто больше заказов)

---

### 7. LIMIT — ограничение количества строк
```sql
LIMIT 10;
```
- Возвращает только первые 10 записей
- Полезно для пагинации и топ-списков
- Можно использовать с OFFSET: `LIMIT 10 OFFSET 20` (строки 21-30)

---

## Схема таблиц

### users
| id | name | email | status |
|----|------|-------|--------|
| 1 | Иван | ivan@mail.ru | active |
| 2 | Мария | maria@mail.ru | active |

### orders
| id | user_id | order_date |
|----|---------|------------|
| 101 | 1 | 2024-03-15 |
| 102 | 1 | 2024-04-20 |
| 103 | 2 | 2024-02-10 |

### order_items
| id | order_id | product_id | quantity |
|----|----------|------------|----------|
| 1 | 101 | 501 | 2 |
| 2 | 101 | 502 | 1 |
| 3 | 102 | 501 | 3 |

### products
| id | name | price |
|----|------|-------|
| 501 | Телефон | 500 |
| 502 | Чехол | 100 |

---

## Порядок выполнения SQL-запроса

```
1. FROM / JOIN      → Определение источника данных и объединение таблиц
2. WHERE            → Фильтрация строк
3. GROUP BY         → Группировка данных
4. HAVING           → Фильтрация групп
5. SELECT           → Выборка и вычисление значений
6. ORDER BY         → Сортировка результатов
7. LIMIT            → Ограничение количества строк
```

---

## Оптимизация запроса

### Индексы для ускорения:
```sql
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_orders_user_date ON orders(user_id, order_date);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
```

### Советы по производительности:
1. ✅ Используйте LEFT JOIN вместо подзапросов
2. ✅ Фильтруйте в WHERE, а не в HAVING (когда возможно)
3. ✅ Создавайте индексы на полях JOIN и WHERE
4. ✅ Избегайте SELECT * — выбирайте только нужные поля
5. ✅ Используйте LIMIT для больших таблиц

---

## Варианты запроса для разных задач

### Топ-10 пользователей по количеству заказов:
```sql
SELECT u.name, COUNT(o.id) AS orders_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name
ORDER BY orders_count DESC
LIMIT 10;
```

### Самые популярные товары:
```sql
SELECT p.name, SUM(oi.quantity) AS total_sold
FROM products p
JOIN order_items oi ON p.id = oi.product_id
GROUP BY p.id, p.name
HAVING SUM(oi.quantity) > 10
ORDER BY total_sold DESC;
```

### Пользователи без заказов:
```sql
SELECT u.name, u.email
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE o.id IS NULL;
```
