-- Task groups, unified tasks table, and permissions columns
--
-- 1. Creates task_groups table (autonomous work containers)
-- 2. Makes project_tasks.project_id nullable (standalone tasks don't need a project)
-- 3. Absorbs legacy `tasks` rows into project_tasks
-- 4. Drops legacy `tasks` table
-- 5. Renames project_tasks → tasks (canonical task table, all MCP tools already route here)
-- 6. Adds task_group_id FK to the renamed table
-- 7. Adds permissions jsonb columns to agent_identities and studios
--
-- See spec: pcp://specs/sb-autonomy-stack (v4)

-- ---------------------------------------------------------------------------
-- 1. Create task_groups
-- ---------------------------------------------------------------------------

CREATE TABLE task_groups (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  identity_id   uuid        REFERENCES agent_identities(id) ON DELETE SET NULL,
  project_id    uuid        REFERENCES projects(id) ON DELETE SET NULL,

  title         text        NOT NULL,
  description   text,
  status        text        NOT NULL DEFAULT 'active',
  priority      text        NOT NULL DEFAULT 'normal',
  tags          text[]      NOT NULL DEFAULT '{}',
  metadata      jsonb       NOT NULL DEFAULT '{}',

  -- Autonomous work fields
  autonomous        boolean      NOT NULL DEFAULT false,
  max_sessions      int,
  sessions_used     int          NOT NULL DEFAULT 0,
  context_summary   text,
  next_run_after    timestamptz,
  output_target     text,
  output_status     text,
  thread_key        text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE task_groups
  ADD CONSTRAINT task_groups_status_check
    CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  ADD CONSTRAINT task_groups_priority_check
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  ADD CONSTRAINT task_groups_output_target_check
    CHECK (output_target IS NULL OR output_target IN ('spec', 'pr', 'report', 'proposal')),
  ADD CONSTRAINT task_groups_output_status_check
    CHECK (output_status IS NULL OR output_status IN ('ready_for_review', 'needs_more_work', 'blocked'));

CREATE INDEX idx_task_groups_user_id     ON task_groups(user_id);
CREATE INDEX idx_task_groups_identity_id ON task_groups(identity_id) WHERE identity_id IS NOT NULL;
CREATE INDEX idx_task_groups_project_id  ON task_groups(project_id)  WHERE project_id  IS NOT NULL;
CREATE INDEX idx_task_groups_autonomous  ON task_groups(user_id, identity_id, next_run_after)
  WHERE autonomous = true AND status = 'active';

CREATE TRIGGER update_task_groups_updated_at
  BEFORE UPDATE ON task_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE task_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_groups_service_access" ON task_groups
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. Make project_id nullable (standalone tasks don't need a project)
-- ---------------------------------------------------------------------------

ALTER TABLE project_tasks ALTER COLUMN project_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Absorb legacy tasks rows into project_tasks
-- ---------------------------------------------------------------------------

INSERT INTO project_tasks (
  user_id,
  project_id,
  title,
  description,
  status,
  priority,
  tags,
  completed_at,
  created_at,
  updated_at
)
SELECT
  t.user_id,
  NULL,
  t.title,
  t.description,
  t.status,
  COALESCE(t.priority, 'medium'),
  COALESCE(t.tags, '{}'),
  t.completed_at,
  t.created_at,
  t.updated_at
FROM tasks t;

-- ---------------------------------------------------------------------------
-- 4. Drop legacy tasks table
-- ---------------------------------------------------------------------------

DROP TABLE tasks;

-- ---------------------------------------------------------------------------
-- 5. Rename project_tasks → tasks
-- ---------------------------------------------------------------------------

ALTER TABLE project_tasks RENAME TO tasks;

-- Rename constraints
ALTER TABLE tasks RENAME CONSTRAINT project_tasks_pkey TO tasks_pkey;
ALTER TABLE tasks RENAME CONSTRAINT project_tasks_project_id_fkey TO tasks_project_id_fkey;
ALTER TABLE tasks RENAME CONSTRAINT project_tasks_user_id_fkey TO tasks_user_id_fkey;

-- Rename indexes
ALTER INDEX idx_project_tasks_created  RENAME TO idx_tasks_created;
ALTER INDEX idx_project_tasks_priority RENAME TO idx_tasks_priority;
ALTER INDEX idx_project_tasks_project  RENAME TO idx_tasks_project;
ALTER INDEX idx_project_tasks_status   RENAME TO idx_tasks_status;
ALTER INDEX idx_project_tasks_user     RENAME TO idx_tasks_user;

-- Rename triggers
ALTER TRIGGER trigger_project_task_completed    ON tasks RENAME TO trigger_task_completed;
ALTER TRIGGER trigger_project_tasks_updated_at  ON tasks RENAME TO trigger_tasks_updated_at;

-- ---------------------------------------------------------------------------
-- 6. Add task_group_id FK
-- ---------------------------------------------------------------------------

ALTER TABLE tasks
  ADD COLUMN task_group_id uuid REFERENCES task_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_tasks_task_group_id ON tasks(task_group_id) WHERE task_group_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. Permissions columns on agent_identities and studios
-- ---------------------------------------------------------------------------

ALTER TABLE agent_identities
  ADD COLUMN permissions jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN agent_identities.permissions IS
  'Per-backend spawn policy. E.g. {"claude":"dangerous","codex":"dangerous","gemini":"interactive"}';

ALTER TABLE studios
  ADD COLUMN permissions jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN studios.permissions IS
  'Per-studio permission overrides. Studio permissions take precedence over agent permissions.';
