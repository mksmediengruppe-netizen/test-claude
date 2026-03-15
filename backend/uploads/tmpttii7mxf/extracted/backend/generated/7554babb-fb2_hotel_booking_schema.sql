-- ============================================
-- СХЕМА БАЗЫ ДАННЫХ: СИСТЕМА БРОНИРОВАНИЯ ОТЕЛЕЙ
-- ============================================
-- Версия: 1.0
-- СУБД: PostgreSQL / MySQL
-- ============================================

-- Удаление существующих таблиц (в правильном порядке)
DROP TABLE IF EXISTS booking_rooms CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS hotel_amenities CASCADE;
DROP TABLE IF EXISTS amenities CASCADE;
DROP TABLE IF EXISTS hotels CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS room_types CASCADE;
DROP TABLE IF EXISTS countries CASCADE;
DROP TABLE IF EXISTS cities CASCADE;

-- ============================================
-- СПРАВОЧНЫЕ ТАБЛИЦЫ
-- ============================================

-- Страны
CREATE TABLE countries (
    country_id INT PRIMARY KEY AUTO_INCREMENT,
    country_code CHAR(2) NOT NULL UNIQUE,  -- ISO 3166-1 alpha-2
    country_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_country_code (country_code),
    INDEX idx_country_name (country_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Города
CREATE TABLE cities (
    city_id INT PRIMARY KEY AUTO_INCREMENT,
    country_id INT NOT NULL,
    city_name VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (country_id) REFERENCES countries(country_id) ON DELETE RESTRICT,
    INDEX idx_city_name (city_name),
    INDEX idx_country_id (country_id),
    INDEX idx_location (latitude, longitude)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Типы номеров
CREATE TABLE room_types (
    room_type_id INT PRIMARY KEY AUTO_INCREMENT,
    type_name VARCHAR(50) NOT NULL,
    description TEXT,
    base_capacity INT NOT NULL DEFAULT 2,
    max_capacity INT NOT NULL DEFAULT 4,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_type_name (type_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Удобства (amenities)
CREATE TABLE amenities (
    amenity_id INT PRIMARY KEY AUTO_INCREMENT,
    amenity_name VARCHAR(100) NOT NULL UNIQUE,
    amenity_icon VARCHAR(50),
    category VARCHAR(50),  -- room, hotel, service
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_amenity_name (amenity_name),
    INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ОСНОВНЫЕ ТАБЛИЦЫ
-- ============================================

-- Пользователи
CREATE TABLE users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    avatar_url VARCHAR(500),
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    role ENUM('guest', 'admin', 'staff') DEFAULT 'guest',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NULL,
    INDEX idx_email (email),
    INDEX idx_name (last_name, first_name),
    INDEX idx_phone (phone),
    INDEX idx_role (role),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Отели
CREATE TABLE hotels (
    hotel_id INT PRIMARY KEY AUTO_INCREMENT,
    owner_id INT NOT NULL,
    city_id INT NOT NULL,
    hotel_name VARCHAR(200) NOT NULL,
    description TEXT,
    address VARCHAR(500) NOT NULL,
    postal_code VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    star_rating TINYINT CHECK (star_rating BETWEEN 1 AND 5),
    check_in_time TIME DEFAULT '14:00:00',
    check_out_time TIME DEFAULT '11:00:00',
    cancellation_policy TEXT,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(20),
    website_url VARCHAR(500),
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    FOREIGN KEY (city_id) REFERENCES cities(city_id) ON DELETE RESTRICT,
    INDEX idx_hotel_name (hotel_name),
    INDEX idx_city_id (city_id),
    INDEX idx_owner_id (owner_id),
    INDEX idx_star_rating (star_rating),
    INDEX idx_location (latitude, longitude),
    INDEX idx_is_active (is_active),
    INDEX idx_is_verified (is_verified),
    FULLTEXT idx_search (hotel_name, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Связь отелей с удобствами
CREATE TABLE hotel_amenities (
    hotel_amenity_id INT PRIMARY KEY AUTO_INCREMENT,
    hotel_id INT NOT NULL,
    amenity_id INT NOT NULL,
    is_free BOOLEAN DEFAULT TRUE,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id) ON DELETE CASCADE,
    FOREIGN KEY (amenity_id) REFERENCES amenities(amenity_id) ON DELETE CASCADE,
    UNIQUE KEY uk_hotel_amenity (hotel_id, amenity_id),
    INDEX idx_hotel_id (hotel_id),
    INDEX idx_amenity_id (amenity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Номера
CREATE TABLE rooms (
    room_id INT PRIMARY KEY AUTO_INCREMENT,
    hotel_id INT NOT NULL,
    room_type_id INT NOT NULL,
    room_number VARCHAR(20) NOT NULL,
    floor_number INT,
    area_sqm DECIMAL(6, 2),
    base_price DECIMAL(10, 2) NOT NULL,
    currency CHAR(3) DEFAULT 'USD',
    max_occupancy INT NOT NULL,
    bed_count INT DEFAULT 1,
    bed_type VARCHAR(50),  -- single, double, queen, king, twin
    has_balcony BOOLEAN DEFAULT FALSE,
    has_sea_view BOOLEAN DEFAULT FALSE,
    has_mountain_view BOOLEAN DEFAULT FALSE,
    has_city_view BOOLEAN DEFAULT FALSE,
    smoking_allowed BOOLEAN DEFAULT FALSE,
    pet_friendly BOOLEAN DEFAULT FALSE,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id) ON DELETE CASCADE,
    FOREIGN KEY (room_type_id) REFERENCES room_types(room_type_id) ON DELETE RESTRICT,
    UNIQUE KEY uk_hotel_room (hotel_id, room_number),
    INDEX idx_hotel_id (hotel_id),
    INDEX idx_room_type_id (room_type_id),
    INDEX idx_base_price (base_price),
    INDEX idx_max_occupancy (max_occupancy),
    INDEX idx_is_active (is_active),
    INDEX idx_features (has_balcony, has_sea_view, pet_friendly)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Удобства номеров (можно расширить)
CREATE TABLE room_amenities (
    room_amenity_id INT PRIMARY KEY AUTO_INCREMENT,
    room_id INT NOT NULL,
    amenity_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (amenity_id) REFERENCES amenities(amenity_id) ON DELETE CASCADE,
    UNIQUE KEY uk_room_amenity (room_id, amenity_id),
    INDEX idx_room_id (room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- БРОНИРОВАНИЯ
-- ============================================

-- Бронирования
CREATE TABLE bookings (
    booking_id INT PRIMARY KEY AUTO_INCREMENT,
    booking_reference VARCHAR(20) NOT NULL UNIQUE,
    user_id INT NOT NULL,
    hotel_id INT NOT NULL,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    guest_count INT NOT NULL,
    children_count INT DEFAULT 0,
    special_requests TEXT,
    status ENUM('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show') DEFAULT 'pending',
    total_amount DECIMAL(12, 2) NOT NULL,
    currency CHAR(3) DEFAULT 'USD',
    payment_status ENUM('pending', 'partial', 'paid', 'refunded', 'failed') DEFAULT 'pending',
    cancellation_reason TEXT,
    cancelled_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id) ON DELETE RESTRICT,
    INDEX idx_booking_reference (booking_reference),
    INDEX idx_user_id (user_id),
    INDEX idx_hotel_id (hotel_id),
    INDEX idx_dates (check_in_date, check_out_date),
    INDEX idx_status (status),
    INDEX idx_payment_status (payment_status),
    INDEX idx_created_at (created_at),
    INDEX idx_user_status (user_id, status),
    INDEX idx_hotel_dates (hotel_id, check_in_date, check_out_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Связь бронирований с номерами
CREATE TABLE booking_rooms (
    booking_room_id INT PRIMARY KEY AUTO_INCREMENT,
    booking_id INT NOT NULL,
    room_id INT NOT NULL,
    price_per_night DECIMAL(10, 2) NOT NULL,
    nights_count INT NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE RESTRICT,
    INDEX idx_booking_id (booking_id),
    INDEX idx_room_id (room_id),
    INDEX idx_room_dates (room_id, 
        (SELECT check_in_date FROM bookings WHERE booking_id = booking_rooms.booking_id),
        (SELECT check_out_date FROM bookings WHERE booking_id = booking_rooms.booking_id)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ПЛАТЕЖИ
-- ============================================

CREATE TABLE payments (
    payment_id INT PRIMARY KEY AUTO_INCREMENT,
    booking_id INT NOT NULL,
    user_id INT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    currency CHAR(3) DEFAULT 'USD',
    payment_method ENUM('credit_card', 'debit_card', 'paypal', 'bank_transfer', 'cash', 'crypto') NOT NULL,
    payment_gateway VARCHAR(50),
    transaction_id VARCHAR(255),
    status ENUM('pending', 'processing', 'completed', 'failed', 'refunded', 'partial_refund') DEFAULT 'pending',
    failure_reason TEXT,
    refunded_amount DECIMAL(12, 2) DEFAULT 0,
    refunded_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE RESTRICT,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    INDEX idx_booking_id (booking_id),
    INDEX idx_user_id (user_id),
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_payment_method (payment_method)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ОТЗЫВЫ И РЕЙТИНГИ
-- ============================================

CREATE TABLE reviews (
    review_id INT PRIMARY KEY AUTO_INCREMENT,
    booking_id INT NOT NULL,
    user_id INT NOT NULL,
    hotel_id INT NOT NULL,
    rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    cleanliness_rating TINYINT CHECK (cleanliness_rating BETWEEN 1 AND 5),
    location_rating TINYINT CHECK (location_rating BETWEEN 1 AND 5),
    service_rating TINYINT CHECK (service_rating BETWEEN 1 AND 5),
    value_rating TINYINT CHECK (value_rating BETWEEN 1 AND 5),
    title VARCHAR(200),
    comment TEXT,
    is_verified BOOLEAN DEFAULT FALSE,  -- подтверждённый отзыв после проживания
    is_visible BOOLEAN DEFAULT TRUE,
    admin_response TEXT,
    admin_response_at TIMESTAMP NULL,
    helpful_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id) ON DELETE CASCADE,
    INDEX idx_hotel_id (hotel_id),
    INDEX idx_user_id (user_id),
    INDEX idx_rating (rating),
    INDEX idx_created_at (created_at),
    INDEX idx_is_visible (is_visible),
    INDEX idx_is_verified (is_verified),
    UNIQUE KEY uk_booking_review (booking_id)  -- один отзыв на бронирование
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ДОПОЛНИТЕЛЬНЫЕ ТАБЛИЦЫ
-- ============================================

-- Изображения отелей
CREATE TABLE hotel_images (
    image_id INT PRIMARY KEY AUTO_INCREMENT,
    hotel_id INT NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    alt_text VARCHAR(255),
    is_primary BOOLEAN DEFAULT FALSE,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id) ON DELETE CASCADE,
    INDEX idx_hotel_id (hotel_id),
    INDEX idx_is_primary (is_primary)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Изображения номеров
CREATE TABLE room_images (
    image_id INT PRIMARY KEY AUTO_INCREMENT,
    room_id INT NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    alt_text VARCHAR(255),
    is_primary BOOLEAN DEFAULT FALSE,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
    INDEX idx_room_id (room_id),
    INDEX idx_is_primary (is_primary)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Динамические цены (сезонные, специальные предложения)
CREATE TABLE room_pricing (
    pricing_id INT PRIMARY KEY AUTO_INCREMENT,
    room_id INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    currency CHAR(3) DEFAULT 'USD',
    min_stay_nights INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
    INDEX idx_room_id (room_id),
    INDEX idx_date_range (start_date, end_date),
    INDEX idx_is_active (is_active),
    CONSTRAINT chk_date_order CHECK (end_date >= start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Лог активности (аудит)
CREATE TABLE activity_log (
    log_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    entity_type VARCHAR(50) NOT NULL,  -- booking, payment, review, hotel
    entity_id INT NOT NULL,
    action VARCHAR(50) NOT NULL,  -- create, update, delete, cancel
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- VIEWS (ПРЕДСТАВЛЕНИЯ)
-- ============================================

-- Статистика отеля
CREATE VIEW hotel_stats AS
SELECT 
    h.hotel_id,
    h.hotel_name,
    COUNT(DISTINCT r.room_id) AS total_rooms,
    COUNT(DISTINCT CASE WHEN r.is_active = TRUE THEN r.room_id END) AS active_rooms,
    COUNT(DISTINCT b.booking_id) AS total_bookings,
    COUNT(DISTINCT CASE WHEN b.status = 'confirmed' THEN b.booking_id END) AS confirmed_bookings,
    COUNT(DISTINCT CASE WHEN b.status = 'cancelled' THEN b.booking_id END) AS cancelled_bookings,
    COALESCE(AVG(rvw.rating), 0) AS average_rating,
    COUNT(DISTINCT rvw.review_id) AS total_reviews
FROM hotels h
LEFT JOIN rooms r ON h.hotel_id = r.hotel_id
LEFT JOIN bookings b ON h.hotel_id = b.hotel_id
LEFT JOIN reviews rvw ON h.hotel_id = rvw.hotel_id
GROUP BY h.hotel_id, h.hotel_name;

-- Доступные номера на даты
CREATE VIEW available_rooms AS
SELECT 
    r.room_id,
    r.hotel_id,
    h.hotel_name,
    r.room_number,
    r.room_type_id,
    rt.type_name,
    r.base_price,
    r.max_occupancy,
    r.currency
FROM rooms r
JOIN hotels h ON r.hotel_id = h.hotel_id
JOIN room_types rt ON r.room_type_id = rt.room_type_id
WHERE r.is_active = TRUE
AND h.is_active = TRUE;

-- ============================================
-- TRIGGERS (ТРИГГЕРЫ)
-- ============================================

DELIMITER //

-- Триггер для генерации уникального reference кода бронирования
CREATE TRIGGER before_booking_insert
BEFORE INSERT ON bookings
FOR EACH ROW
BEGIN
    IF NEW.booking_reference IS NULL OR NEW.booking_reference = '' THEN
        SET NEW.booking_reference = CONCAT('BK', DATE_FORMAT(NOW(), '%Y%m%d'), LPAD(FLOOR(RAND() * 10000), 4, '0'));
    END IF;
END//

-- Триггер для логирования изменений бронирований
CREATE TRIGGER after_booking_update
AFTER UPDATE ON bookings
FOR EACH ROW
BEGIN
    IF OLD.status != NEW.status THEN
        INSERT INTO activity_log (entity_type, entity_id, action, old_values, new_values)
        VALUES ('booking', NEW.booking_id, 'status_change', 
                JSON_OBJECT('status', OLD.status), 
                JSON_OBJECT('status', NEW.status));
    END IF;
END//

DELIMITER ;

-- ============================================
-- STORED PROCEDURES (ХРАНИМЫЕ ПРОЦЕДУРЫ)
-- ============================================

DELIMITER //

-- Проверка доступности номеров
CREATE PROCEDURE check_room_availability(
    IN p_hotel_id INT,
    IN p_check_in DATE,
    IN p_check_out DATE,
    IN p_guest_count INT
)
BEGIN
    SELECT 
        r.room_id,
        r.room_number,
        r.room_type_id,
        rt.type_name,
        r.base_price,
        r.max_occupancy,
        r.currency,
        COUNT(br.booking_room_id) AS booking_count
    FROM rooms r
    JOIN room_types rt ON r.room_type_id = rt.room_type_id
    LEFT JOIN booking_rooms br ON r.room_id = br.room_id
    LEFT JOIN bookings b ON br.booking_id = b.booking_id
        AND b.status NOT IN ('cancelled', 'no_show')
        AND (
            (p_check_in < b.check_out_date) AND 
            (p_check_out > b.check_in_date)
        )
    WHERE r.hotel_id = p_hotel_id
    AND r.is_active = TRUE
    AND r.max_occupancy >= p_guest_count
    GROUP BY r.room_id, r.room_number, r.room_type_id, rt.type_name, r.base_price, r.max_occupancy, r.currency
    HAVING booking_count = 0
    ORDER BY r.base_price;
END//

-- Получение статистики бронирований за период
CREATE PROCEDURE get_booking_stats(
    IN p_start_date DATE,
    IN p_end_date DATE,
    IN p_hotel_id INT
)
BEGIN
    SELECT 
        b.status,
        COUNT(*) AS booking_count,
        SUM(b.total_amount) AS total_revenue,
        AVG(b.total_amount) AS avg_booking_value
    FROM bookings b
    WHERE b.check_in_date BETWEEN p_start_date AND p_end_out_date
    AND (p_hotel_id IS NULL OR b.hotel_id = p_hotel_id)
    GROUP BY b.status;
END//

DELIMITER ;

-- ============================================
-- INITIAL DATA (НАЧАЛЬНЫЕ ДАННЫЕ)
-- ============================================

-- Вставка типов номеров
INSERT INTO room_types (type_name, description, base_capacity, max_capacity) VALUES
('Standard', 'Стандартный номер', 2, 2),
('Deluxe', 'Улучшенный номер', 2, 3),
('Suite', 'Номер люкс', 2, 4),
('Family Room', 'Семейный номер', 4, 6),
('Single', 'Одноместный номер', 1, 1),
('Twin', 'Двухместный номер с раздельными кроватями', 2, 2),
('Presidential Suite', 'Президентский люкс', 4, 8);

-- Вставка удобств
INSERT INTO amenities (amenity_name, amenity_icon, category) VALUES
('Wi-Fi', 'wifi', 'room'),
('Air Conditioning', 'snowflake', 'room'),
('TV', 'tv', 'room'),
('Mini Bar', 'wine-bottle', 'room'),
('Safe', 'lock', 'room'),
('Hair Dryer', 'wind', 'room'),
('Swimming Pool', 'water', 'hotel'),
('Fitness Center', 'dumbbell', 'hotel'),
('Spa', 'spa', 'hotel'),
('Restaurant', 'utensils', 'hotel'),
('Bar', 'cocktail', 'hotel'),
('Parking', 'car', 'hotel'),
('24/7 Reception', 'clock', 'service'),
('Room Service', 'concierge-bell', 'service'),
('Airport Shuttle', 'plane', 'service'),
('Laundry', 'tshirt', 'service'),
('Business Center', 'briefcase', 'hotel'),
('Kids Club', 'baby', 'hotel'),
('Beach Access', 'umbrella-beach', 'hotel'),
('Pet Friendly', 'paw', 'hotel');

-- ============================================
-- КОНЕЦ СХЕМЫ
-- ============================================
