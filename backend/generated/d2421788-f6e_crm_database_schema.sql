-- =====================================================
-- CRM SYSTEM DATABASE ARCHITECTURE
-- Version: 1.0
-- Description: Полная архитектура БД для CRM системы
-- =====================================================

-- Сброс существующей схемы (для чистой установки)
-- DROP SCHEMA IF EXISTS crm CASCADE;
-- CREATE SCHEMA crm;
-- SET search_path TO crm, public;

-- =====================================================
-- 1. ТАБЛИЦА ПОЛЬЗОВАТЕЛЕЙ (USERS)
-- =====================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user', 'viewer')),
    phone VARCHAR(20),
    avatar_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);

-- =====================================================
-- 2. ТАБЛИЦА КОМПАНИЙ (COMPANIES)
-- =====================================================
CREATE TABLE companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    inn VARCHAR(20),
    kpp VARCHAR(20),
    ogrn VARCHAR(20),
    legal_address TEXT,
    actual_address TEXT,
    website VARCHAR(255),
    industry VARCHAR(100),
    company_size VARCHAR(50) CHECK (company_size IN ('1-10', '11-50', '51-200', '201-500', '500+')),
    description TEXT,
    logo_url VARCHAR(500),
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_companies_name ON companies(name);
CREATE INDEX idx_companies_owner ON companies(owner_id);
CREATE INDEX idx_companies_industry ON companies(industry);

-- =====================================================
-- 3. ТАБЛИЦА КОНТАКТОВ (CONTACTS)
-- =====================================================
CREATE TABLE contacts (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(20),
    mobile_phone VARCHAR(20),
    position VARCHAR(100),
    department VARCHAR(100),
    linkedin_url VARCHAR(255),
    avatar_url VARCHAR(500),
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id),
    is_primary BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contacts_name ON contacts(last_name, first_name);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_company ON contacts(company_id);
CREATE INDEX idx_contacts_owner ON contacts(owner_id);

-- =====================================================
-- 4. ТАБЛИЦА СДЕЛОК (DEALS)
-- =====================================================
CREATE TABLE deals (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'RUB',
    stage VARCHAR(50) NOT NULL CHECK (stage IN (
        'new', 'qualification', 'proposal', 'negotiation', 
        'won', 'lost', 'archived'
    )),
    probability INTEGER DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
    expected_close_date DATE,
    actual_close_date DATE,
    lead_source VARCHAR(50) CHECK (lead_source IN (
        'website', 'referral', 'cold_call', 'email', 
        'social_media', 'advertisement', 'other'
    )),
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id),
    lost_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deals_stage ON deals(stage);
CREATE INDEX idx_deals_owner ON deals(owner_id);
CREATE INDEX idx_deals_company ON deals(company_id);
CREATE INDEX idx_deals_contact ON deals(contact_id);
CREATE INDEX idx_deals_close_date ON deals(expected_close_date);
CREATE INDEX idx_deals_amount ON deals(amount);

-- =====================================================
-- 5. ТАБЛИЦА ЗАДАЧ (TASKS)
-- =====================================================
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending', 'in_progress', 'completed', 'cancelled'
    )),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN (
        'low', 'medium', 'high', 'urgent'
    )),
    due_date TIMESTAMP,
    completed_at TIMESTAMP,
    task_type VARCHAR(50) CHECK (task_type IN (
        'call', 'email', 'meeting', 'follow_up', 'demo', 'other'
    )),
    deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id),
    reminder_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_deal ON tasks(deal_id);

-- =====================================================
-- 6. ТАБЛИЦА ВЗАИМОДЕЙСТВИЙ (INTERACTIONS)
-- =====================================================
CREATE TABLE interactions (
    id SERIAL PRIMARY KEY,
    interaction_type VARCHAR(50) NOT NULL CHECK (interaction_type IN (
        'call', 'email', 'meeting', 'note', 'sms', 'whatsapp', 'other'
    )),
    subject VARCHAR(255),
    content TEXT,
    direction VARCHAR(20) CHECK (direction IN ('inbound', 'outbound')),
    duration_minutes INTEGER,
    interaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_interactions_type ON interactions(interaction_type);
CREATE INDEX idx_interactions_date ON interactions(interaction_date);
CREATE INDEX idx_interactions_contact ON interactions(contact_id);
CREATE INDEX idx_interactions_deal ON interactions(deal_id);

-- =====================================================
-- 7. ТАБЛИЦА ФАЙЛОВ (FILES)
-- =====================================================
CREATE TABLE files (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT,
    mime_type VARCHAR(100),
    file_type VARCHAR(50) CHECK (file_type IN (
        'document', 'image', 'video', 'audio', 'other'
    )),
    deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    uploaded_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_files_deal ON files(deal_id);
CREATE INDEX idx_files_contact ON files(contact_id);
CREATE INDEX idx_files_company ON files(company_id);
CREATE INDEX idx_files_type ON files(file_type);

-- =====================================================
-- 8. ТАБЛИЦА ТЕГОВ (TAGS)
-- =====================================================
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    color VARCHAR(7) DEFAULT '#007bff',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tags_name ON tags(name);

-- =====================================================
-- 9. ТАБЛИЦА СВЯЗИ ТЕГОВ (TAG_RELATIONS)
-- =====================================================
CREATE TABLE tag_relations (
    id SERIAL PRIMARY KEY,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN (
        'company', 'contact', 'deal'
    )),
    entity_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tag_id, entity_type, entity_id)
);

CREATE INDEX idx_tag_relations_tag ON tag_relations(tag_id);
CREATE INDEX idx_tag_relations_entity ON tag_relations(entity_type, entity_id);

-- =====================================================
-- 10. ТАБЛИЦА КОММЕНТАРИЕВ (COMMENTS)
-- =====================================================
CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN (
        'deal', 'contact', 'company', 'task'
    )),
    entity_id INTEGER NOT NULL,
    parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comments_entity ON comments(entity_type, entity_id);
CREATE INDEX idx_comments_author ON comments(author_id);
CREATE INDEX idx_comments_parent ON comments(parent_id);

-- =====================================================
-- 11. ТАБЛИЦА УВЕДОМЛЕНИЙ (NOTIFICATIONS)
-- =====================================================
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    notification_type VARCHAR(50) CHECK (notification_type IN (
        'task', 'deal', 'mention', 'system', 'reminder'
    )),
    is_read BOOLEAN DEFAULT false,
    link_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_type ON notifications(notification_type);
CREATE INDEX idx_notifications_created ON notifications(created_at);

-- =====================================================
-- 12. ТАБЛИЦА НАСТРОЕК (SETTINGS)
-- =====================================================
CREATE TABLE settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(20) DEFAULT 'string' CHECK (setting_type IN (
        'string', 'integer', 'boolean', 'json'
    )),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, setting_key)
);

CREATE INDEX idx_settings_user ON settings(user_id);
CREATE INDEX idx_settings_key ON settings(setting_key);

-- =====================================================
-- 13. ТАБЛИЦА АУДИТА (AUDIT_LOG)
-- =====================================================
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL CHECK (action IN (
        'create', 'update', 'delete', 'login', 'logout'
    )),
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- =====================================================
-- 14. ТАБЛИЦА КАЛЕНДАРЯ (CALENDAR_EVENTS)
-- =====================================================
CREATE TABLE calendar_events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    all_day BOOLEAN DEFAULT false,
    location VARCHAR(255),
    event_type VARCHAR(50) CHECK (event_type IN (
        'meeting', 'call', 'demo', 'follow_up', 'reminder', 'other'
    )),
    deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    attendees TEXT[], -- Массив ID участников
    reminder_minutes INTEGER DEFAULT 15,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_calendar_start ON calendar_events(start_time);
CREATE INDEX idx_calendar_owner ON calendar_events(owner_id);
CREATE INDEX idx_calendar_deal ON calendar_events(deal_id);

-- =====================================================
-- 15. ТАБЛИЦА ПИПЕЛАЙНОВ (PIPELINES)
-- =====================================================
CREATE TABLE pipelines (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pipelines_active ON pipelines(is_active);

-- =====================================================
-- 16. ТАБЛИЦА ЭТАПОВ ПИПЕЛАЙНА (PIPELINE_STAGES)
-- =====================================================
CREATE TABLE pipeline_stages (
    id SERIAL PRIMARY KEY,
    pipeline_id INTEGER REFERENCES pipelines(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL,
    probability INTEGER DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
    color VARCHAR(7) DEFAULT '#6c757d',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(pipeline_id, order_index)
);

CREATE INDEX idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id);
CREATE INDEX idx_pipeline_stages_order ON pipeline_stages(order_index);

-- =====================================================
-- 17. ТАБЛИЦА ОТЧЁТОВ (REPORTS)
-- =====================================================
CREATE TABLE reports (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    report_type VARCHAR(50) CHECK (report_type IN (
        'sales', 'deals', 'tasks', 'activities', 'custom'
    )),
    config JSONB NOT NULL,
    is_public BOOLEAN DEFAULT false,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reports_type ON reports(report_type);
CREATE INDEX idx_reports_public ON reports(is_public);

-- =====================================================
-- 18. ТАБЛИЦА ИНТЕГРАЦИЙ (INTEGRATIONS)
-- =====================================================
CREATE TABLE integrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    integration_type VARCHAR(50) NOT NULL CHECK (integration_type IN (
        'email', 'calendar', 'telephony', 'messenger', 'other'
    )),
    config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_integrations_type ON integrations(integration_type);
CREATE INDEX idx_integrations_active ON integrations(is_active);

-- =====================================================
-- ТРИГГЕРЫ ДЛЯ АВТОМАТИЧЕСКОГО ОБНОВЛЕНИЯ UPDATED_AT
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Применяем триггер ко всем таблицам с полем updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON deals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON calendar_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pipelines_updated_at BEFORE UPDATE ON pipelines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pipeline_stages_updated_at BEFORE UPDATE ON pipeline_stages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ВСТАВКА НАЧАЛЬНЫХ ДАННЫХ
-- =====================================================

-- Создание дефолтного пайплайна
INSERT INTO pipelines (name, description, is_default, is_active) VALUES
('Основной воронка продаж', 'Стандартный пайплайн для управления сделками', true, true);

-- Создание этапов пайплайна
INSERT INTO pipeline_stages (pipeline_id, name, description, order_index, probability, color) VALUES
(1, 'Новая сделка', 'Только созданная сделка', 1, 10, '#6c757d'),
(1, 'Квалификация', 'Проверка потенциального клиента', 2, 20, '#17a2b8'),
(1, 'Предложение', 'Отправка коммерческого предложения', 3, 40, '#ffc107'),
(1, 'Переговоры', 'Обсуждение условий сделки', 4, 60, '#fd7e14'),
(1, 'Договор', 'Подписание договора', 5, 80, '#20c997'),
(1, 'Успешно', 'Сделка закрыта успешно', 6, 100, '#28a745'),
(1, 'Потеряно', 'Сделка закрыта без результата', 7, 0, '#dc3545');

-- Создание базовых тегов
INSERT INTO tags (name, color, description) VALUES
('VIP клиент', '#dc3545', 'Особо важные клиенты'),
('Горячий лид', '#fd7e14', 'Клиенты с высокой вероятностью покупки'),
('Холодный лид', '#6c757d', 'Клиенты требующие прогрева'),
('Потенциальный', '#17a2b8', 'Клиенты с потенциалом'),
('Постоянный', '#28a745', 'Регулярно покупающие клиенты');

-- =====================================================
-- ПОЛЕЗНЫЕ VIEWS
-- =====================================================

-- View: Статистика сделок по этапам
CREATE VIEW v_deals_by_stage AS
SELECT 
    stage,
    COUNT(*) as deal_count,
    SUM(amount) as total_amount,
    AVG(amount) as avg_amount,
    AVG(probability) as avg_probability
FROM deals
WHERE stage NOT IN ('archived')
GROUP BY stage;

-- View: Задачи на сегодня
CREATE VIEW v_tasks_today AS
SELECT 
    t.*,
    u.first_name || ' ' || u.last_name as assigned_to_name
FROM tasks t
JOIN users u ON t.assigned_to = u.id
WHERE DATE(t.due_date) = CURRENT_DATE
  AND t.status != 'completed'
ORDER BY t.priority DESC, t.due_date ASC;

-- View: Сделки с полной информацией
CREATE VIEW v_deals_full AS
SELECT 
    d.*,
    c.name as company_name,
    COALESCE(cont.first_name || ' ' || cont.last_name, '') as contact_name,
    u.first_name || ' ' || u.last_name as owner_name
FROM deals d
LEFT JOIN companies c ON d.company_id = c.id
LEFT JOIN contacts cont ON d.contact_id = cont.id
LEFT JOIN users u ON d.owner_id = u.id;

-- =====================================================
-- КОНЕЦ СХЕМЫ
-- =====================================================

-- Проверка создания всех таблиц
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
