-- ==================== Database Initialization Script ====================
-- This script runs automatically when PostgreSQL container starts for the first time

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create initial users (optional)
INSERT INTO users (username, email, created_at) VALUES
    ('admin', 'admin@example.com', NOW()),
    ('user1', 'user1@example.com', NOW()),
    ('user2', 'user2@example.com', NOW())
ON CONFLICT (username) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Grant permissions (if needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Display success message
DO $$
BEGIN
    RAISE NOTICE 'Database initialized successfully!';
END $$;