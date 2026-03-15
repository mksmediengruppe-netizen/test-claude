-- ============================================
-- СХЕМА БАЗЫ ДАННЫХ: СИСТЕМА БРОНИРОВАНИЯ ОТЕЛЕЙ
-- ============================================
-- Версия: 1.0
-- СУБД: PostgreSQL (совместимо с MySQL)
-- ============================================

-- Удаление существующих таблиц (в правильном порядке)
DROP TABLE IF EXISTS bookings_rooms CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS room_amenities CASCADE;
DROP TABLE IF EXISTS hotel_amenities CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS room_types CASCADE;
DROP TABLE IF EXISTS amenities CASCADE;
DROP TABLE IF EXISTS hotels CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================
-- ТАБЛИЦА: ПОЛЬЗОВАТЕЛИ (users)
-- ============================================
CREATE TABLE users (
    user_id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    nationality VARCHAR(50),
    passport_number VARCHAR(50),
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_name ON users(last_name, first_name);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_active ON users(is_active);

-- ============================================
-- ТАБЛИЦА: УДОБСТВА (amenities)
-- ============================================
CREATE TABLE amenities (
    amenity_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    name_en VARCHAR(100),
    description TEXT,
    icon VARCHAR(50),
    category VARCHAR(50) -- 'room', 'hotel', 'service'
);

-- Индексы для amenities
CREATE INDEX idx_amenities_category ON amenities(category);

-- ============================================
-- ТАБЛИЦА: ОТЕЛИ (hotels)
-- ============================================
CREATE TABLE hotels (
    hotel_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    description TEXT,
    description_en TEXT,
    address VARCHAR(500) NOT NULL,
    city VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    phone VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    star_rating INTEGER CHECK (star_rating BETWEEN 1 AND 5),
    rating_average DECIMAL(3, 2) DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    check_in_time TIME DEFAULT '14:00:00',
    check_out_time TIME DEFAULT '11:00:00',
    cancellation_policy TEXT,
    pet_policy VARCHAR(100),
    images JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для hotels
CREATE INDEX idx_hotels_city ON hotels(city);
CREATE INDEX idx_hotels_country ON hotels(country);
CREATE INDEX idx_hotels_location ON hotels(latitude, longitude);
CREATE INDEX idx_hotels_rating ON hotels(rating_average DESC);
CREATE INDEX idx_hotels_stars ON hotels(star_rating);
CREATE INDEX idx_hotels_active ON hotels(is_active);
CREATE INDEX idx_hotels_name ON hotels(name);

-- Полнотекстовый поиск
CREATE INDEX idx_hotels_search ON hotels USING GIN(to_tsvector('russian', name || ' ' || description));

-- ============================================
-- ТАБЛИЦА: ТИПЫ НОМЕРОВ (room_types)
-- ============================================
CREATE TABLE room_types (
    room_type_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    name_en VARCHAR(100),
    description TEXT,
    description_en TEXT,
    base_capacity INTEGER NOT NULL, -- Базовая вместимость
    max_capacity INTEGER NOT NULL, -- Максимальная вместимость
    size_sqm INTEGER, -- Площадь в кв.м.
    beds_config JSONB, -- Конфигурация кроватей
    images JSONB
);

-- ============================================
-- ТАБЛИЦА: НОМЕРА (rooms)
-- ============================================
CREATE TABLE rooms (
    room_id SERIAL PRIMARY KEY,
    hotel_id INTEGER NOT NULL REFERENCES hotels(hotel_id) ON DELETE CASCADE,
    room_type_id INTEGER NOT NULL REFERENCES room_types(room_type_id),
    room_number VARCHAR(20) NOT NULL,
    floor INTEGER,
    view_type VARCHAR(50), -- 'sea', 'city', 'garden', 'mountain'
    smoking_allowed BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hotel_id, room_number)
);

-- Индексы для rooms
CREATE INDEX idx_rooms_hotel ON rooms(hotel_id);
CREATE INDEX idx_rooms_type ON rooms(room_type_id);
CREATE INDEX idx_rooms_active ON rooms(is_active);
CREATE INDEX idx_rooms_view ON rooms(view_type);

-- ============================================
-- ТАБЛИЦА: УДОБСТВА ОТЕЛЕЙ (hotel_amenities)
-- ============================================
CREATE TABLE hotel_amenities (
    hotel_id INTEGER NOT NULL REFERENCES hotels(hotel_id) ON DELETE CASCADE,
    amenity_id INTEGER NOT NULL REFERENCES amenities(amenity_id) ON DELETE CASCADE,
    is_free BOOLEAN DEFAULT TRUE,
    description TEXT,
    PRIMARY KEY (hotel_id, amenity_id)
);

-- Индексы для hotel_amenities
CREATE INDEX idx_hotel_amenities_hotel ON hotel_amenities(hotel_id);
CREATE INDEX idx_hotel_amenities_amenity ON hotel_amenities(amenity_id);

-- ============================================
-- ТАБЛИЦА: УДОБСТВА НОМЕРОВ (room_amenities)
-- ============================================
CREATE TABLE room_amenities (
    room_id INTEGER NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
    amenity_id INTEGER NOT NULL REFERENCES amenities(amenity_id) ON DELETE CASCADE,
    is_free BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (room_id, amenity_id)
);

-- Индексы для room_amenities
CREATE INDEX idx_room_amenities_room ON room_amenities(room_id);
CREATE INDEX idx_room_amenities_amenity ON room_amenities(amenity_id);

-- ============================================
-- ТАБЛИЦА: БРОНИРОВАНИЯ (bookings)
-- ============================================
CREATE TABLE bookings (
    booking_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    hotel_id INTEGER NOT NULL REFERENCES hotels(hotel_id),
    booking_number VARCHAR(20) NOT NULL UNIQUE,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    adults INTEGER NOT NULL CHECK (adults > 0),
    children INTEGER DEFAULT 0 CHECK (children >= 0),
    infants INTEGER DEFAULT 0 CHECK (infants >= 0),
    total_amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'RUB',
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid'
        CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded')),
    special_requests TEXT,
    guest_name VARCHAR(255),
    guest_email VARCHAR(255),
    guest_phone VARCHAR(20),
    cancellation_date TIMESTAMP,
    cancellation_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    CHECK (check_out_date > check_in_date)
);

-- Индексы для bookings
CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_hotel ON bookings(hotel_id);
CREATE INDEX idx_bookings_dates ON bookings(check_in_date, check_out_date);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_payment ON bookings(payment_status);
CREATE INDEX idx_bookings_number ON bookings(booking_number);
CREATE INDEX idx_bookings_created ON bookings(created_at DESC);

-- Составной индекс для поиска доступных бронирований
CREATE INDEX idx_bookings_search ON bookings(hotel_id, check_in_date, check_out_date, status);

-- ============================================
-- ТАБЛИЦА: НОМЕРА В БРОНИРОВАНИИ (bookings_rooms)
-- ============================================
CREATE TABLE bookings_rooms (
    booking_room_id BIGSERIAL PRIMARY KEY,
    booking_id BIGINT NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
    room_id INTEGER NOT NULL REFERENCES rooms(room_id),
    room_type_id INTEGER NOT NULL REFERENCES room_types(room_type_id),
    price_per_night DECIMAL(10, 2) NOT NULL,
    price_total DECIMAL(10, 2) NOT NULL,
    guests_count INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для bookings_rooms
CREATE INDEX idx_bookings_rooms_booking ON bookings_rooms(booking_id);
CREATE INDEX idx_bookings_rooms_room ON bookings_rooms(room_id);
CREATE INDEX idx_bookings_rooms_dates ON bookings_rooms(booking_id, room_id);

-- ============================================
-- ТАБЛИЦА: ПЛАТЕЖИ (payments)
-- ============================================
CREATE TABLE payments (
    payment_id BIGSERIAL PRIMARY KEY,
    booking_id BIGINT NOT NULL REFERENCES bookings(booking_id),
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'RUB',
    payment_method VARCHAR(50) NOT NULL, -- 'card', 'paypal', 'bank_transfer', 'cash'
    payment_gateway VARCHAR(50),
    transaction_id VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled')),
    payment_date TIMESTAMP,
    refund_date TIMESTAMP,
    refund_amount DECIMAL(12, 2),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для payments
CREATE INDEX idx_payments_booking ON payments(booking_id);
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_transaction ON payments(transaction_id);
CREATE INDEX idx_payments_date ON payments(payment_date DESC);

-- ============================================
-- ТАБЛИЦА: ОТЗЫВЫ (reviews)
-- ============================================
CREATE TABLE reviews (
    review_id BIGSERIAL PRIMARY KEY,
    booking_id BIGINT NOT NULL REFERENCES bookings(booking_id),
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    hotel_id INTEGER NOT NULL REFERENCES hotels(hotel_id),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title VARCHAR(255),
    text TEXT NOT NULL,
    pros TEXT,
    cons TEXT,
    staff_rating INTEGER CHECK (staff_rating BETWEEN 1 AND 5),
    cleanliness_rating INTEGER CHECK (cleanliness_rating BETWEEN 1 AND 5),
    location_rating INTEGER CHECK (location_rating BETWEEN 1 AND 5),
    value_rating INTEGER CHECK (value_rating BETWEEN 1 AND 5),
    is_verified BOOLEAN DEFAULT FALSE, -- Подтверждённое проживание
    is_published BOOLEAN DEFAULT TRUE,
    response_text TEXT,
    response_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(booking_id) -- Один отзыв на бронирование
);

-- Индексы для reviews
CREATE INDEX idx_reviews_hotel ON reviews(hotel_id);
CREATE INDEX idx_reviews_user ON reviews(user_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);
CREATE INDEX idx_reviews_published ON reviews(is_published);
CREATE INDEX idx_reviews_created ON reviews(created_at DESC);
CREATE INDEX idx_reviews_verified ON reviews(is_verified);

-- ============================================
-- ТАБЛИЦА: ЦЕНЫ (room_prices) - для динамического ценообразования
-- ============================================
CREATE TABLE room_prices (
    price_id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    price_per_night DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'RUB',
    min_stay_nights INTEGER DEFAULT 1,
    max_stay_nights INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (date_to >= date_from)
);

-- Индексы для room_prices
CREATE INDEX idx_room_prices_room ON room_prices(room_id);
CREATE INDEX idx_room_prices_dates ON room_prices(date_from, date_to);
CREATE INDEX idx_room_prices_active ON room_prices(is_active);

-- ============================================
-- ТАБЛИЦА: БЛОКИРОВКИ ДАТ (room_blocks) - для закрытия дат
-- ============================================
CREATE TABLE room_blocks (
    block_id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    reason VARCHAR(255),
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (date_to >= date_from)
);

-- Индексы для room_blocks
CREATE INDEX idx_room_blocks_room ON room_blocks(room_id);
CREATE INDEX idx_room_blocks_dates ON room_blocks(date_from, date_to);

-- ============================================
-- ТРИГГЕРЫ ДЛЯ АВТОМАТИЧЕСКОГО ОБНОВЛЕНИЯ updated_at
-- ============================================

-- Функция для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Применение триггера к таблицам
CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_hotels_updated_at BEFORE UPDATE ON hotels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_rooms_updated_at BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_bookings_updated_at BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_reviews_updated_at BEFORE UPDATE ON reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_room_prices_updated_at BEFORE UPDATE ON room_prices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ВЬЮ: ДОСТУПНЫЕ НОМЕРА ДЛЯ ЗАДАННЫХ ДАТ
-- ============================================
CREATE OR REPLACE VIEW available_rooms AS
SELECT 
    r.room_id,
    r.hotel_id,
    r.room_type_id,
    r.room_number,
    r.floor,
    r.view_type,
    rt.name AS room_type_name,
    rt.base_capacity,
    rt.max_capacity,
    rt.size_sqm,
    h.name AS hotel_name,
    h.city,
    h.country,
    h.star_rating,
    h.rating_average
FROM rooms r
JOIN room_types rt ON r.room_type_id = rt.room_type_id
JOIN hotels h ON r.hotel_id = h.hotel_id
WHERE r.is_active = TRUE
  AND h.is_active = TRUE
  AND NOT EXISTS (
      -- Исключаем забронированные номера
      SELECT 1 FROM bookings_rooms br
      JOIN bookings b ON br.booking_id = b.booking_id
      WHERE br.room_id = r.room_id
        AND b.status IN ('confirmed', 'checked_in')
        AND b.check_in_date <= CURRENT_DATE
        AND b.check_out_date > CURRENT_DATE
  )
  AND NOT EXISTS (
      -- Исключаем заблокированные даты
      SELECT 1 FROM room_blocks rb
      WHERE rb.room_id = r.room_id
        AND rb.date_from <= CURRENT_DATE
        AND rb.date_to >= CURRENT_DATE
  );

-- ============================================
-- ВЬЮ: СТАТИСТИКА ОТЕЛЯ
-- ============================================
CREATE OR REPLACE VIEW hotel_statistics AS
SELECT 
    h.hotel_id,
    h.name AS hotel_name,
    h.city,
    h.star_rating,
    h.rating_average,
    h.rating_count,
    COUNT(DISTINCT r.room_id) AS total_rooms,
    COUNT(DISTINCT rt.room_type_id) AS room_types_count,
    COUNT(DISTINCT b.booking_id) AS total_bookings,
    COUNT(DISTINCT CASE WHEN b.status = 'confirmed' THEN b.booking_id END) AS confirmed_bookings,
    COUNT(DISTINCT CASE WHEN b.status = 'cancelled' THEN b.booking_id END) AS cancelled_bookings,
    COALESCE(SUM(CASE WHEN b.payment_status = 'paid' THEN b.total_amount ELSE 0 END), 0) AS total_revenue,
    COALESCE(AVG(rv.rating), 0) AS average_review_rating,
    COUNT(DISTINCT rv.review_id) AS total_reviews
FROM hotels h
LEFT JOIN rooms r ON h.hotel_id = r.hotel_id AND r.is_active = TRUE
LEFT JOIN room_types rt ON r.room_type_id = rt.room_type_id
LEFT JOIN bookings b ON h.hotel_id = b.hotel_id
LEFT JOIN reviews rv ON h.hotel_id = rv.hotel_id AND rv.is_published = TRUE
GROUP BY h.hotel_id, h.name, h.city, h.star_rating, h.rating_average, h.rating_count;

-- ============================================
-- ВСТАВКА ТЕСТОВЫХ ДАННЫХ (опционально)
-- ============================================

-- Вставка удобств
INSERT INTO amenities (name, name_en, category) VALUES
('Wi-Fi', 'Wi-Fi', 'room'),
('Кондиционер', 'Air Conditioning', 'room'),
('Телевизор', 'TV', 'room'),
('Мини-бар', 'Mini Bar', 'room'),
('Сейф', 'Safe', 'room'),
('Фен', 'Hair Dryer', 'room'),
('Бассейн', 'Swimming Pool', 'hotel'),
('Спа-центр', 'Spa Center', 'hotel'),
('Фитнес-центр', 'Fitness Center', 'hotel'),
('Ресторан', 'Restaurant', 'hotel'),
('Парковка', 'Parking', 'hotel'),
('Трансфер', 'Airport Transfer', 'service'),
('Услуга прачечной', 'Laundry Service', 'service'),
('Консьерж', 'Concierge', 'service');

-- Вставка типов номеров
INSERT INTO room_types (name, name_en, base_capacity, max_capacity, size_sqm) VALUES
('Стандарт', 'Standard', 2, 2, 20),
('Стандарт Улучшенный', 'Standard Plus', 2, 3, 25),
('Делюкс', 'Deluxe', 2, 3, 30),
('Семейный', 'Family', 4, 5, 45),
('Люкс', 'Suite', 2, 4, 50),
('Президентский люкс', 'Presidential Suite', 4, 6, 80);

-- ============================================
-- КОММЕНТАРИИ К ТАБЛИЦАМ
-- ============================================

COMMENT ON TABLE users IS 'Пользователи системы (клиенты)';
COMMENT ON TABLE hotels IS 'Отели';
COMMENT ON TABLE rooms IS 'Номера в отелях';
COMMENT ON TABLE room_types IS 'Типы номеров';
COMMENT ON TABLE amenities IS 'Удобства и услуги';
COMMENT ON TABLE hotel_amenities IS 'Удобства отелей';
COMMENT ON TABLE room_amenities IS 'Удобства в номерах';
COMMENT ON TABLE bookings IS 'Бронирования';
COMMENT ON TABLE bookings_rooms IS 'Номера в бронированиях';
COMMENT ON TABLE payments IS 'Платежи';
COMMENT ON TABLE reviews IS 'Отзывы гостей';
COMMENT ON TABLE room_prices IS 'Цены на номера (динамическое ценообразование)';
COMMENT ON TABLE room_blocks IS 'Блокировки дат для номеров';

-- ============================================
-- КОНЕЦ СХЕМЫ
-- ============================================
