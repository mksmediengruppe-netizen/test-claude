-- ============================================================================
-- СХЕМА БАЗЫ ДАННЫХ: СИСТЕМА БРОНИРОВАНИЯ ОТЕЛЕЙ
-- Версия: 1.0
-- Описание: Полная схема для управления отелями, номерами, бронированиями
-- ============================================================================

-- Удаление существующих таблиц (в правильном порядке)
DROP TABLE IF EXISTS booking_history CASCADE;
DROP TABLE IF EXISTS booking_rooms CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS hotel_amenities CASCADE;
DROP TABLE IF EXISTS amenities CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS room_types CASCADE;
DROP TABLE IF EXISTS hotels CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================================
-- ТАБЛИЦА: ПОЛЬЗОВАТЕЛИ
-- ============================================================================
CREATE TABLE users (
    user_id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    passport_number VARCHAR(50),
    nationality VARCHAR(100),
    role VARCHAR(20) NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin', 'manager', 'staff')),
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- Индексы для users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_name ON users(last_name, first_name);

-- ============================================================================
-- ТАБЛИЦА: ТИПЫ НОМЕРОВ
-- ============================================================================
CREATE TABLE room_types (
    room_type_id SERIAL PRIMARY KEY,
    type_name VARCHAR(100) NOT NULL,
    description TEXT,
    base_price DECIMAL(10, 2) NOT NULL,
    max_occupancy INTEGER NOT NULL CHECK (max_occupancy > 0),
    bed_count INTEGER NOT NULL CHECK (bed_count > 0),
    bed_type VARCHAR(50) NOT NULL, -- 'single', 'double', 'queen', 'king'
    size_sqm INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для room_types
CREATE INDEX idx_room_types_name ON room_types(type_name);
CREATE INDEX idx_room_types_price ON room_types(base_price);

-- ============================================================================
-- ТАБЛИЦА: ОТЕЛИ
-- ============================================================================
CREATE TABLE hotels (
    hotel_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    chain_name VARCHAR(100),
    star_rating INTEGER CHECK (star_rating BETWEEN 1 AND 5),
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state_province VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    phone VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    check_in_time TIME DEFAULT '14:00:00',
    check_out_time TIME DEFAULT '11:00:00',
    cancellation_policy TEXT,
    pet_policy VARCHAR(100),
    smoking_policy VARCHAR(50) DEFAULT 'non-smoking',
    manager_id BIGINT REFERENCES users(user_id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для hotels
CREATE INDEX idx_hotels_name ON hotels(name);
CREATE INDEX idx_hotels_city ON hotels(city);
CREATE INDEX idx_hotels_country ON hotels(country);
CREATE INDEX idx_hotels_star_rating ON hotels(star_rating);
CREATE INDEX idx_hotels_is_active ON hotels(is_active);
CREATE INDEX idx_hotels_location ON hotels(latitude, longitude);
CREATE INDEX idx_hotels_manager ON hotels(manager_id);

-- GIN индекс для полнотекстового поиска
CREATE INDEX idx_hotels_description_fts ON hotels USING gin(to_tsvector('english', description));

-- ============================================================================
-- ТАБЛИЦА: НОМЕРА
-- ============================================================================
CREATE TABLE rooms (
    room_id SERIAL PRIMARY KEY,
    hotel_id INTEGER NOT NULL REFERENCES hotels(hotel_id) ON DELETE CASCADE,
    room_type_id INTEGER NOT NULL REFERENCES room_types(room_type_id),
    room_number VARCHAR(20) NOT NULL,
    floor_number INTEGER,
    price_per_night DECIMAL(10, 2) NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    is_maintenance BOOLEAN DEFAULT FALSE,
    smoking_allowed BOOLEAN DEFAULT FALSE,
    view_type VARCHAR(50), -- 'city', 'sea', 'mountain', 'garden', 'pool'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(hotel_id, room_number)
);

-- Индексы для rooms
CREATE INDEX idx_rooms_hotel_id ON rooms(hotel_id);
CREATE INDEX idx_rooms_room_type_id ON rooms(room_type_id);
CREATE INDEX idx_rooms_is_available ON rooms(is_available);
CREATE INDEX idx_rooms_price ON rooms(price_per_night);
CREATE INDEX idx_rooms_number ON rooms(room_number);
CREATE INDEX idx_rooms_hotel_available ON rooms(hotel_id, is_available);

-- ============================================================================
-- ТАБЛИЦА: УДОБСТВА (AMENITIES)
-- ============================================================================
CREATE TABLE amenities (
    amenity_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL, -- 'room', 'hotel', 'service', 'facility'
    icon VARCHAR(50),
    description TEXT
);

-- Индексы для amenities
CREATE INDEX idx_amenities_category ON amenities(category);
CREATE INDEX idx_amenities_name ON amenities(name);

-- ============================================================================
-- ТАБЛИЦА: УДОБСТВА ОТЕЛЕЙ (MANY-TO-MANY)
-- ============================================================================
CREATE TABLE hotel_amenities (
    hotel_id INTEGER NOT NULL REFERENCES hotels(hotel_id) ON DELETE CASCADE,
    amenity_id INTEGER NOT NULL REFERENCES amenities(amenity_id) ON DELETE CASCADE,
    is_free BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (hotel_id, amenity_id)
);

-- Индексы для hotel_amenities
CREATE INDEX idx_hotel_amenities_hotel ON hotel_amenities(hotel_id);
CREATE INDEX idx_hotel_amenities_amenity ON hotel_amenities(amenity_id);

-- ============================================================================
-- ТАБЛИЦА: БРОНИРОВАНИЯ
-- ============================================================================
CREATE TABLE bookings (
    booking_id BIGSERIAL PRIMARY KEY,
    booking_number VARCHAR(20) UNIQUE NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    hotel_id INTEGER NOT NULL REFERENCES hotels(hotel_id),
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    adult_count INTEGER NOT NULL CHECK (adult_count > 0),
    child_count INTEGER DEFAULT 0 CHECK (child_count >= 0),
    total_amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(30) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
    payment_status VARCHAR(30) NOT NULL DEFAULT 'unpaid'
        CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded', 'failed')),
    special_requests TEXT,
    guest_notes TEXT,
    cancellation_reason TEXT,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    checked_in_at TIMESTAMP WITH TIME ZONE,
    checked_out_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_dates CHECK (check_out_date > check_in_date)
);

-- Индексы для bookings
CREATE INDEX idx_bookings_user_id ON bookings(user_id);
CREATE INDEX idx_bookings_hotel_id ON bookings(hotel_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX idx_bookings_dates ON bookings(check_in_date, check_out_date);
CREATE INDEX idx_bookings_created_at ON bookings(created_at);
CREATE INDEX idx_bookings_booking_number ON bookings(booking_number);
CREATE INDEX idx_bookings_check_in ON bookings(check_in_date);
CREATE INDEX idx_bookings_check_out ON bookings(check_out_date);

-- Композитный индекс для поиска доступных бронирований
CREATE INDEX idx_bookings_hotel_dates_status ON bookings(hotel_id, check_in_date, check_out_date, status);

-- ============================================================================
-- ТАБЛИЦА: НОМЕРА В БРОНИРОВАНИИ (MANY-TO-MANY)
-- ============================================================================
CREATE TABLE booking_rooms (
    booking_room_id BIGSERIAL PRIMARY KEY,
    booking_id BIGINT NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
    room_id INTEGER NOT NULL REFERENCES rooms(room_id),
    room_type_id INTEGER NOT NULL REFERENCES room_types(room_type_id),
    price_per_night DECIMAL(10, 2) NOT NULL,
    nights_count INTEGER NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для booking_rooms
CREATE INDEX idx_booking_rooms_booking_id ON booking_rooms(booking_id);
CREATE INDEX idx_booking_rooms_room_id ON booking_rooms(room_id);
CREATE INDEX idx_booking_rooms_dates ON booking_rooms(booking_id, room_id);

-- ============================================================================
-- ТАБЛИЦА: ПЛАТЕЖИ
-- ============================================================================
CREATE TABLE payments (
    payment_id BIGSERIAL PRIMARY KEY,
    booking_id BIGINT NOT NULL REFERENCES bookings(booking_id),
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_method VARCHAR(50) NOT NULL, -- 'credit_card', 'debit_card', 'paypal', 'bank_transfer', 'cash'
    payment_gateway VARCHAR(50),
    transaction_id VARCHAR(255),
    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled')),
    payment_date TIMESTAMP WITH TIME ZONE,
    refunded_amount DECIMAL(12, 2) DEFAULT 0,
    refund_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для payments
CREATE INDEX idx_payments_booking_id ON payments(booking_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_payment_date ON payments(payment_date);
CREATE INDEX idx_payments_transaction_id ON payments(transaction_id);
CREATE INDEX idx_payments_created_at ON payments(created_at);

-- ============================================================================
-- ТАБЛИЦА: ОТЗЫВЫ
-- ============================================================================
CREATE TABLE reviews (
    review_id BIGSERIAL PRIMARY KEY,
    booking_id BIGINT NOT NULL REFERENCES bookings(booking_id),
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    hotel_id INTEGER NOT NULL REFERENCES hotels(hotel_id),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    cleanliness_rating INTEGER CHECK (cleanliness_rating BETWEEN 1 AND 5),
    location_rating INTEGER CHECK (location_rating BETWEEN 1 AND 5),
    service_rating INTEGER CHECK (service_rating BETWEEN 1 AND 5),
    value_rating INTEGER CHECK (value_rating BETWEEN 1 AND 5),
    title VARCHAR(255),
    comment TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    is_visible BOOLEAN DEFAULT TRUE,
    staff_response TEXT,
    staff_response_date TIMESTAMP WITH TIME ZONE,
    helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_review_per_booking UNIQUE (booking_id)
);

-- Индексы для reviews
CREATE INDEX idx_reviews_hotel_id ON reviews(hotel_id);
CREATE INDEX idx_reviews_user_id ON reviews(user_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);
CREATE INDEX idx_reviews_is_visible ON reviews(is_visible);
CREATE INDEX idx_reviews_created_at ON reviews(created_at);
CREATE INDEX idx_reviews_booking_id ON reviews(booking_id);

-- ============================================================================
-- ТАБЛИЦА: ИСТОРИЯ ИЗМЕНЕНИЙ БРОНИРОВАНИЙ
-- ============================================================================
CREATE TABLE booking_history (
    history_id BIGSERIAL PRIMARY KEY,
    booking_id BIGINT NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
    changed_by BIGINT REFERENCES users(user_id),
    action VARCHAR(50) NOT NULL, -- 'created', 'updated', 'cancelled', 'confirmed', 'checked_in', 'checked_out'
    field_changed VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    change_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для booking_history
CREATE INDEX idx_booking_history_booking_id ON booking_history(booking_id);
CREATE INDEX idx_booking_history_action ON booking_history(action);
CREATE INDEX idx_booking_history_created_at ON booking_history(created_at);
CREATE INDEX idx_booking_history_changed_by ON booking_history(changed_by);

-- ============================================================================
-- ТРИГГЕРЫ ДЛЯ АВТОМАТИЧЕСКОГО ОБНОВЛЕНИЯ updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Применение триггера ко всем таблицам с полем updated_at
CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_room_types_updated_at BEFORE UPDATE ON room_types
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

-- ============================================================================
-- ФУНКЦИЯ ГЕНЕРАЦИИ НОМЕРА БРОНИРОВАНИЯ
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_booking_number()
RETURNS VARCHAR AS $$
DECLARE
    booking_num VARCHAR(20);
    timestamp_part VARCHAR(12);
    random_part VARCHAR(6);
BEGIN
    timestamp_part := TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDDHH24MI');
    random_part := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    booking_num := 'BK' || timestamp_part || random_part;
    RETURN booking_num;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ВСТАВКА НАЧАЛЬНЫХ ДАННЫХ (Справочники)
-- ============================================================================

-- Типы номеров
INSERT INTO room_types (type_name, description, base_price, max_occupancy, bed_count, bed_type, size_sqm) VALUES
('Standard Single', 'Комфортный одноместный номер', 50.00, 1, 1, 'single', 18),
('Standard Double', 'Комфортный двухместный номер', 70.00, 2, 1, 'double', 22),
('Deluxe Room', 'Улучшенный номер с дополнительными удобствами', 100.00, 2, 1, 'queen', 28),
('Suite', 'Номер категории люкс с отдельной гостиной', 180.00, 3, 2, 'king', 45),
('Family Room', 'Семейный номер для проживания с детьми', 150.00, 4, 2, 'double', 40),
('Presidential Suite', 'Президентский люкс', 500.00, 6, 3, 'king', 80);

-- Удобства
INSERT INTO amenities (name, category, icon, description) VALUES
-- Удобства в номере
('Free Wi-Fi', 'room', 'wifi', 'Бесплатный высокоскоростной интернет'),
('Air Conditioning', 'room', 'ac', 'Кондиционер'),
('TV', 'room', 'tv', 'Плоский телевизор с кабельными каналами'),
('Mini Bar', 'room', 'bar', 'Мини-бар'),
('Safe', 'room', 'safe', 'Сейф для ценностей'),
('Hair Dryer', 'room', 'hairdryer', 'Фен'),
('Bathtub', 'room', 'bath', 'Ванна'),
('Balcony', 'room', 'balcony', 'Балкон или терраса'),
('Kitchenette', 'room', 'kitchen', 'Мини-кухня'),
-- Удобства отеля
('Swimming Pool', 'hotel', 'pool', 'Бассейн'),
('Fitness Center', 'hotel', 'fitness', 'Фитнес-центр'),
('Spa', 'hotel', 'spa', 'СПА-центр'),
('Restaurant', 'hotel', 'restaurant', 'Ресторан'),
('Bar', 'hotel', 'bar', 'Бар'),
('Parking', 'hotel', 'parking', 'Парковка'),
('24/7 Reception', 'hotel', 'reception', 'Круглосуточная стойка регистрации'),
('Elevator', 'hotel', 'elevator', 'Лифт'),
('Business Center', 'hotel', 'business', 'Бизнес-центр'),
('Conference Room', 'hotel', 'conference', 'Конференц-зал'),
-- Услуги
('Room Service', 'service', 'roomservice', 'Обслуживание в номере'),
('Laundry Service', 'service', 'laundry', 'Прачечная'),
('Airport Shuttle', 'service', 'shuttle', 'Трансфер из/в аэропорт'),
('Car Rental', 'service', 'car', 'Аренда автомобиля'),
('Concierge', 'service', 'concierge', 'Консьерж-сервис'),
('Massage', 'service', 'massage', 'Массаж'),
('Tour Desk', 'service', 'tour', 'Экскурсионное бюро');

-- ============================================================================
-- ПОЛЕЗНЫЕ VIEWS
-- ============================================================================

-- View: Активные бронирования с деталями
CREATE VIEW v_active_bookings AS
SELECT 
    b.booking_id,
    b.booking_number,
    b.user_id,
    u.first_name,
    u.last_name,
    u.email,
    b.hotel_id,
    h.name AS hotel_name,
    b.check_in_date,
    b.check_out_date,
    b.adult_count,
    b.child_count,
    b.total_amount,
    b.status,
    b.payment_status,
    COUNT(br.room_id) AS rooms_count,
    b.created_at
FROM bookings b
JOIN users u ON b.user_id = u.user_id
JOIN hotels h ON b.hotel_id = h.hotel_id
LEFT JOIN booking_rooms br ON b.booking_id = br.booking_id
WHERE b.status IN ('pending', 'confirmed', 'checked_in')
GROUP BY b.booking_id, u.first_name, u.last_name, u.email, h.name;

-- View: Доступные номера для поиска
CREATE VIEW v_available_rooms AS
SELECT 
    r.room_id,
    r.hotel_id,
    h.name AS hotel_name,
    h.city,
    h.country,
    h.star_rating,
    r.room_type_id,
    rt.type_name,
    r.room_number,
    r.price_per_night,
    rt.max_occupancy,
    rt.bed_count,
    rt.bed_type,
    r.view_type,
    r.is_available
FROM rooms r
JOIN hotels h ON r.hotel_id = h.hotel_id
JOIN room_types rt ON r.room_type_id = rt.room_type_id
WHERE r.is_available = TRUE 
  AND r.is_maintenance = FALSE
  AND h.is_active = TRUE;

-- View: Статистика отзывов по отелям
CREATE VIEW v_hotel_reviews_stats AS
SELECT 
    h.hotel_id,
    h.name AS hotel_name,
    h.city,
    COUNT(r.review_id) AS total_reviews,
    ROUND(AVG(r.rating)::numeric, 2) AS average_rating,
    ROUND(AVG(r.cleanliness_rating)::numeric, 2) AS avg_cleanliness,
    ROUND(AVG(r.location_rating)::numeric, 2) AS avg_location,
    ROUND(AVG(r.service_rating)::numeric, 2) AS avg_service,
    ROUND(AVG(r.value_rating)::numeric, 2) AS avg_value
FROM hotels h
LEFT JOIN reviews r ON h.hotel_id = r.hotel_id AND r.is_visible = TRUE
GROUP BY h.hotel_id, h.name, h.city;

-- ============================================================================
-- КОММЕНТАРИИ К ТАБЛИЦАМ
-- ============================================================================
COMMENT ON TABLE users IS 'Пользователи системы (клиенты, администраторы, персонал)';
COMMENT ON TABLE hotels IS 'Информация об отелях';
COMMENT ON TABLE room_types IS 'Типы номеров с базовыми характеристиками';
COMMENT ON TABLE rooms IS 'Физические номера в отелях';
COMMENT ON TABLE amenities IS 'Справочник удобств и услуг';
COMMENT ON TABLE hotel_amenities IS 'Связь отелей с удобствами (many-to-many)';
COMMENT ON TABLE bookings IS 'Бронирования номеров';
COMMENT ON TABLE booking_rooms IS 'Детализация бронирования по номерам';
COMMENT ON TABLE payments IS 'Платежи по бронированиям';
COMMENT ON TABLE reviews IS 'Отзывы гостей';
COMMENT ON TABLE booking_history IS 'История изменений бронирований (аудит)';

-- ============================================================================
-- КОНЕЦ СХЕМЫ
-- ============================================================================
