-- Rename legacy git-worktree table from workspaces -> studios.
-- This keeps workspace_containers as the product/team concept.

DO $$
BEGIN
  IF to_regclass('public.workspaces') IS NOT NULL
     AND to_regclass('public.studios') IS NULL THEN
    EXECUTE 'ALTER TABLE public.workspaces RENAME TO studios';
  END IF;
END $$;

-- Rename constraints for clarity (safe if already renamed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspaces_identity_id_fkey'
      AND conrelid = 'public.studios'::regclass
  ) THEN
    ALTER TABLE public.studios RENAME CONSTRAINT workspaces_identity_id_fkey TO studios_identity_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspaces_session_id_fkey'
      AND conrelid = 'public.studios'::regclass
  ) THEN
    ALTER TABLE public.studios RENAME CONSTRAINT workspaces_session_id_fkey TO studios_session_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspaces_user_id_fkey'
      AND conrelid = 'public.studios'::regclass
  ) THEN
    ALTER TABLE public.studios RENAME CONSTRAINT workspaces_user_id_fkey TO studios_user_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspaces_work_type_check'
      AND conrelid = 'public.studios'::regclass
  ) THEN
    ALTER TABLE public.studios RENAME CONSTRAINT workspaces_work_type_check TO studios_work_type_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspaces_status_check'
      AND conrelid = 'public.studios'::regclass
  ) THEN
    ALTER TABLE public.studios RENAME CONSTRAINT workspaces_status_check TO studios_status_check;
  END IF;
END $$;

-- Rename indexes for clarity (safe if already renamed)
ALTER INDEX IF EXISTS idx_workspaces_agent_id RENAME TO idx_studios_agent_id;
ALTER INDEX IF EXISTS idx_workspaces_branch RENAME TO idx_studios_branch;
ALTER INDEX IF EXISTS idx_workspaces_session_id RENAME TO idx_studios_session_id;
ALTER INDEX IF EXISTS idx_workspaces_status RENAME TO idx_studios_status;
ALTER INDEX IF EXISTS idx_workspaces_user_id RENAME TO idx_studios_user_id;
ALTER INDEX IF EXISTS workspaces_branch_key RENAME TO studios_branch_key;
ALTER INDEX IF EXISTS workspaces_worktree_path_key RENAME TO studios_worktree_path_key;

-- Rename update trigger for clarity
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_workspaces_updated_at'
      AND tgrelid = 'public.studios'::regclass
  ) THEN
    ALTER TRIGGER update_workspaces_updated_at ON public.studios RENAME TO update_studios_updated_at;
  END IF;
END $$;

-- Update table comment
COMMENT ON TABLE public.studios IS 'Tracks git worktree studios for parallel agent work. Studios are separate from sessions and can outlive them.';
