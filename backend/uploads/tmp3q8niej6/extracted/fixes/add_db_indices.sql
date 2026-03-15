-- Скрипт добавления индексов для оптимизации производительности БД
-- Автор: MiniMax Agent
-- Применять через: psql -h localhost -U ai_dev_user -d ai_dev_platform -f add_db_indices.sql

-- =====================================================
-- ИНДЕКСЫ ДЛЯ ТАБЛИЦЫ tasks
-- =====================================================

-- Индекс для фильтрации по статусу (частый запрос)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_status
ON tasks(status);

-- Индекс для фильтрации по проекту
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_project_id
ON tasks(project_id);

-- Составной индекс для фильтрации активных задач проекта
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_project_status
ON tasks(project_id, status);

-- Индекс для сортировки по дате создания
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_created_at
ON tasks(created_at DESC);

-- =====================================================
-- ИНДЕКСЫ ДЛЯ ТАБЛИЦЫ task_steps
-- =====================================================

-- Индекс для связи с задачей (внешний ключ)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_steps_task_id
ON task_steps(task_id);

-- Индекс для фильтрации по статусу шага
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_steps_status
ON task_steps(status);

-- Составной индекс для получения шагов задачи по порядку
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_steps_task_order
ON task_steps(task_id, step_order);

-- =====================================================
-- ИНДЕКСЫ ДЛЯ ТАБЛИЦЫ agent_runs
-- =====================================================

-- Индекс для связи с шагом
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_step_id
ON agent_runs(step_id);

-- Индекс для фильтрации по статусу
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_status
ON agent_runs(status);

-- Индекс для отслеживания времени
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_started_at
ON agent_runs(started_at DESC);

-- =====================================================
-- ИНДЕКСЫ ДЛЯ ТАБЛИЦЫ artifacts
-- =====================================================

-- Индекс для связи с agent_run
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_artifacts_agent_run_id
ON artifacts(agent_run_id);

-- Индекс для фильтрации по типу артефакта
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_artifacts_type
ON artifacts(artifact_type);

-- =====================================================
-- ИНДЕКСЫ ДЛЯ ТАБЛИЦЫ approvals
-- =====================================================

-- Индекс для связи с задачей
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approvals_task_id
ON approvals(task_id);

-- Индекс для фильтрации по статусу
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approvals_status
ON approvals(status);

-- Индекс для получения ожидающих одобрений
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approvals_pending
ON approvals(status) WHERE status = 'pending';

-- =====================================================
-- ПРОВЕРКА СОЗДАННЫХ ИНДЕКСОВ
-- =====================================================

-- Показать все созданные индексы
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
