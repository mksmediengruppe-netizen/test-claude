-- Схема базы данных для системы бронирования отелей
-- Создание базы данных
CREATE DATABASE IF NOT EXISTS hotel_booking_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hotel_booking_system;

-- Таблица отелей
CREATE TABLE hotels (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    address VARCHAR(500) NOT NULL,
    city VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20),
    phone VARCHAR(30),
    email VARCHAR(255),
    website VARCHAR(255),
    rating DECIMAL(3,2) CHECK (rating >= 0 AND rating <= 5),
    star_rating TINYINT CHECK (star_rating >= 1 AND star_rating <= 5),
    check_in_time TIME DEFAULT '15:00:00',
    check_out_time TIME DEFAULT '11:00:00',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_hotels_city (city),
    INDEX idx_hotels_country (country),
    INDEX idx_hotels_rating (rating),
    INDEX idx_hotels_active (is_active),
    INDEX idx_hotels_name (name)
);

-- Таблица типов номеров
CREATE TABLE room_types (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    hotel_id BIGINT NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    max_occupancy TINYINT NOT NULL,
    base_price DECIMAL(10,2) NOT NULL,
    size_sqm DECIMAL(8,2),
    bed_type VARCHAR(50),
    amenities JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE,
    INDEX idx_room_types_hotel (hotel_id),
    INDEX idx_room_types_occupancy (max_occupancy),
    INDEX idx_room_types_price (base_price)
);

-- Таблица номеров
CREATE TABLE rooms (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    hotel_id BIGINT NOT NULL,
    room_type_id BIGINT NOT NULL,
    room_number VARCHAR(20) NOT NULL,
    floor_number TINYINT,
    is_available BOOLEAN DEFAULT TRUE,
    is_maintenance BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE,
    FOREIGN KEY (room_type_id) REFERENCES room_types(id) ON DELETE CASCADE,
    UNIQUE KEY uk_hotel_room (hotel_id, room_number),
    INDEX idx_rooms_hotel (hotel_id),
    INDEX idx_rooms_type (room_type_id),
    INDEX idx_rooms_available (is_available),
    INDEX idx_rooms_maintenance (is_maintenance)
);

-- Таблица пользователей
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(30),
    password_hash VARCHAR(255) NOT NULL,
    date_of_birth DATE,
    nationality VARCHAR(100),
    passport_number VARCHAR(50),
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_users_email (email),
    INDEX idx_users_name (first_name, last_name),
    INDEX idx_users_active (is_active),
    INDEX idx_users_verified (is_verified)
);

-- Таблица бронирований
CREATE TABLE bookings (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    hotel_id BIGINT NOT NULL,
    room_id BIGINT NOT NULL,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    adults_count TINYINT NOT NULL DEFAULT 1,
    children_count TINYINT DEFAULT 0,
    total_price DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status ENUM('pending', 'confirmed', 'cancelled', 'completed', 'no_show') DEFAULT 'pending',
    special_requests TEXT,
    payment_status ENUM('pending', 'paid', 'refunded', 'partial') DEFAULT 'pending',
    cancellation_reason TEXT,
    cancelled_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE RESTRICT,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT,
    
    CHECK (check_out_date > check_in_date),
    CHECK (adults_count > 0),
    CHECK (children_count >= 0),
    
    INDEX idx_bookings_user (user_id),
    INDEX idx_bookings_hotel (hotel_id),
    INDEX idx_bookings_room (room_id),
    INDEX idx_bookings_dates (check_in_date, check_out_date),
    INDEX idx_bookings_status (status),
    INDEX idx_bookings_payment (payment_status),
    INDEX idx_bookings_created (created_at)
);

-- Таблица платежей
CREATE TABLE payments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    booking_id BIGINT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_method ENUM('credit_card', 'debit_card', 'paypal', 'bank_transfer', 'cash', 'crypto') NOT NULL,
    payment_status ENUM('pending', 'completed', 'failed', 'refunded', 'partial_refund') DEFAULT 'pending',
    transaction_id VARCHAR(255),
    gateway_response JSON,
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    
    INDEX idx_payments_booking (booking_id),
    INDEX idx_payments_status (payment_status),
    INDEX idx_payments_method (payment_method),
    INDEX idx_payments_processed (processed_at),
    INDEX idx_payments_transaction (transaction_id)
);

-- Таблица отзывов
CREATE TABLE reviews (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    booking_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    hotel_id BIGINT NOT NULL,
    rating TINYINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    comment TEXT,
    staff_rating TINYINT CHECK (staff_rating >= 1 AND staff_rating <= 5),
    cleanliness_rating TINYINT CHECK (cleanliness_rating >= 1 AND cleanliness_rating <= 5),
    comfort_rating TINYINT CHECK (comfort_rating >= 1 AND comfort_rating <= 5),
    location_rating TINYINT CHECK (location_rating >= 1 AND location_rating <= 5),
    facilities_rating TINYINT CHECK (facilities_rating >= 1 AND facilities_rating <= 5),
    is_verified BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE,
    
    UNIQUE KEY uk_booking_review (booking_id),
    INDEX idx_reviews_hotel (hotel_id),
    INDEX idx_reviews_user (user_id),
    INDEX idx_reviews_rating (rating),
    INDEX idx_reviews_public (is_public),
    INDEX idx_reviews_created (created_at)
);

-- Таблица цен номеров по датам (динамическое ценообразование)
CREATE TABLE room_pricing (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    room_type_id BIGINT NOT NULL,
    date DATE NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    is_available BOOLEAN DEFAULT TRUE,
    min_stay_nights TINYINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (room_type_id) REFERENCES room_types(id) ON DELETE CASCADE,
    
    UNIQUE KEY uk_room_type_date (room_type_id, date),
    INDEX idx_pricing_room_type (room_type_id),
    INDEX idx_pricing_date (date),
    INDEX idx_pricing_price (price),
    INDEX idx_pricing_available (is_available)
);

-- Таблица услуг отеля
CREATE TABLE hotel_services (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    hotel_id BIGINT NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10,2),
    is_free BOOLEAN DEFAULT FALSE,
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE,
    INDEX idx_services_hotel (hotel_id),
    INDEX idx_services_category (category),
    INDEX idx_services_price (price)
);

-- Таблица заказанных услуг
CREATE TABLE booking_services (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    booking_id BIGINT NOT NULL,
    service_id BIGINT NOT NULL,
    quantity TINYINT DEFAULT 1,
    price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) GENERATED ALWAYS AS (quantity * price) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES hotel_services(id) ON DELETE CASCADE,
    
    INDEX idx_booking_services_booking (booking_id),
    INDEX idx_booking_services_service (service_id)
);

-- Таблица логов активности
CREATE TABLE activity_logs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NULL,
    booking_id BIGINT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id BIGINT,
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
    
    INDEX idx_logs_user (user_id),
    INDEX idx_logs_booking (booking_id),
    INDEX idx_logs_action (action),
    INDEX idx_logs_entity (entity_type, entity_id),
    INDEX idx_logs_created (created_at)
);

-- Таблица сезонов для ценообразования
CREATE TABLE seasons (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    hotel_id BIGINT NOT NULL,
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    price_multiplier DECIMAL(4,3) DEFAULT 1.000,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE,
    
    CHECK (end_date >= start_date),
    CHECK (price_multiplier > 0),
    
    INDEX idx_seasons_hotel (hotel_id),
    INDEX idx_seasons_dates (start_date, end_date),
    INDEX idx_seasons_active (is_active)
);

-- Создание представлений (Views)

-- View для детальной информации о бронированиях
CREATE VIEW booking_details AS
SELECT 
    b.id,
    b.check_in_date,
    b.check_out_date,
    b.total_price,
    b.status,
    b.payment_status,
    u.first_name,
    u.last_name,
    u.email,
    h.name as hotel_name,
    h.city as hotel_city,
    r.room_number,
    rt.name as room_type_name,
    DATEDIFF(b.check_out_date, b.check_in_date) as nights_stay
FROM bookings b
JOIN users u ON b.user_id = u.id
JOIN hotels h ON b.hotel_id = h.id
JOIN rooms r ON b.room_id = r.id
JOIN room_types rt ON r.room_type_id = rt.id;

-- View для статистики отелей
CREATE VIEW hotel_statistics AS
SELECT 
    h.id,
    h.name,
    h.city,
    h.rating,
    COUNT(DISTINCT r.id) as total_rooms,
    COUNT(DISTINCT b.id) as total_bookings,
    AVG(rev.rating) as avg_review_rating,
    COUNT(DISTINCT rev.id) as total_reviews,
    SUM(CASE WHEN b.status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_bookings,
    SUM(CASE WHEN b.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_bookings
FROM hotels h
LEFT JOIN rooms r ON h.id = r.hotel_id
LEFT JOIN bookings b ON h.id = b.hotel_id
LEFT JOIN reviews rev ON h.id = rev.hotel_id
GROUP BY h.id, h.name, h.city, h.rating;

-- Создание триггеров

-- Триггер для обновления рейтинга отеля при добавлении отзыва
DELIMITER //
CREATE TRIGGER update_hotel_rating_after_review
AFTER INSERT ON reviews
FOR EACH ROW
BEGIN
    UPDATE hotels 
    SET rating = (
        SELECT AVG(rating) 
        FROM reviews 
        WHERE hotel_id = NEW.hotel_id AND is_public = TRUE
    )
    WHERE id = NEW.hotel_id;
END//
DELIMITER ;

-- Триггер для логирования изменений статуса бронирования
DELIMITER //
CREATE TRIGGER log_booking_status_change
AFTER UPDATE ON bookings
FOR EACH ROW
BEGIN
    IF OLD.status != NEW.status THEN
        INSERT INTO activity_logs (booking_id, action, entity_type, entity_id, old_values, new_values)
        VALUES (
            NEW.id,
            'STATUS_CHANGE',
            'booking',
            NEW.id,
            JSON_OBJECT('status', OLD.status),
            JSON_OBJECT('status', NEW.status)
        );
    END IF;
END//
DELIMITER ;

-- Создание хранимых процедур

-- Процедура для проверки доступности номеров
DELIMITER //
CREATE PROCEDURE check_room_availability(
    IN p_hotel_id BIGINT,
    IN p_check_in DATE,
    IN p_check_out DATE,
    IN p_adults TINYINT,
    IN p_children TINYINT
)
BEGIN
    SELECT 
        r.id as room_id,
        r.room_number,
        rt.name as room_type_name,
        rt.max_occupancy,
        rt.base_price,
        rp.price as dynamic_price,
        CASE 
            WHEN r.is_available = 0 OR r.is_maintenance = 1 THEN FALSE
            WHEN EXISTS (
                SELECT 1 FROM bookings b 
                WHERE b.room_id = r.id 
                AND b.status IN ('confirmed', 'pending')
                AND (
                    (p_check_in BETWEEN b.check_in_date AND b.check_out_date - INTERVAL 1 DAY) OR
                    (p_check_out BETWEEN b.check_in_date + INTERVAL 1 DAY AND b.check_out_date) OR
                    (b.check_in_date BETWEEN p_check_in AND p_check_out - INTERVAL 1 DAY)
                )
            ) THEN FALSE
            ELSE TRUE
        END as is_available
    FROM rooms r
    JOIN room_types rt ON r.room_type_id = rt.id
    LEFT JOIN room_pricing rp ON rt.id = rp.room_type_id AND rp.date = p_check_in
    WHERE r.hotel_id = p_hotel_id
    AND rt.max_occupancy >= (p_adults + p_children)
    ORDER BY rt.base_price;
END//
DELIMITER ;

-- Процедура для создания бронирования
DELIMITER //
CREATE PROCEDURE create_booking(
    IN p_user_id BIGINT,
    IN p_hotel_id BIGINT,
    IN p_room_id BIGINT,
    IN p_check_in DATE,
    IN p_check_out DATE,
    IN p_adults TINYINT,
    IN p_children TINYINT,
    IN p_total_price DECIMAL(10,2),
    IN p_special_requests TEXT
)
BEGIN
    DECLARE v_is_available BOOLEAN;
    
    -- Проверка доступности номера
    SELECT 
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM bookings b 
                WHERE b.room_id = p_room_id 
                AND b.status IN ('confirmed', 'pending')
                AND (
                    (p_check_in BETWEEN b.check_in_date AND b.check_out_date - INTERVAL 1 DAY) OR
                    (p_check_out BETWEEN b.check_in_date + INTERVAL 1 DAY AND b.check_out_date) OR
                    (b.check_in_date BETWEEN p_check_in AND p_check_out - INTERVAL 1 DAY)
                )
            ) THEN FALSE
            ELSE TRUE
        END INTO v_is_available;
    
    IF v_is_available THEN
        INSERT INTO bookings (
            user_id, hotel_id, room_id, check_in_date, check_out_date,
            adults_count, children_count, total_price, status, special_requests
        ) VALUES (
            p_user_id, p_hotel_id, p_room_id, p_check_in, p_check_out,
            p_adults, p_children, p_total_price, 'pending', p_special_requests
        );
        
        SELECT LAST_INSERT_ID() as booking_id, TRUE as success;
    ELSE
        SELECT NULL as booking_id, FALSE as success;
    END IF;
END//
DELIMITER ;