-- Backfill workspace constitution (shared_values, process) from user_identity
--
-- Copies data from user_identity to workspaces when:
--   1. The workspace columns are NULL (never populated), OR
--   2. The user_identity record is newer than the workspace record
--
-- This ensures that any edits made via the old save_user_identity path
-- (which wrote to user_identity first) are promoted to the canonical
-- workspace-level storage.

-- Case 1: workspace fields are NULL but user_identity has content
UPDATE public.workspaces w
SET
  shared_values = COALESCE(w.shared_values, ui.shared_values_md),
  process = COALESCE(w.process, ui.process_md)
FROM public.user_identity ui
WHERE ui.workspace_id = w.id
  AND (
    (w.shared_values IS NULL AND ui.shared_values_md IS NOT NULL)
    OR (w.process IS NULL AND ui.process_md IS NOT NULL)
  );

-- Case 2: user_identity was updated more recently than the workspace
-- (someone used save_user_identity without workspaceId, or the sync
-- to workspaces failed/wasn't wired up at the time)
UPDATE public.workspaces w
SET
  shared_values = CASE
    WHEN ui.shared_values_md IS NOT NULL AND ui.updated_at > w.updated_at
    THEN ui.shared_values_md
    ELSE w.shared_values
  END,
  process = CASE
    WHEN ui.process_md IS NOT NULL AND ui.updated_at > w.updated_at
    THEN ui.process_md
    ELSE w.process
  END
FROM public.user_identity ui
WHERE ui.workspace_id = w.id
  AND ui.updated_at > w.updated_at
  AND (ui.shared_values_md IS NOT NULL OR ui.process_md IS NOT NULL);

-- Also handle user_identity records with NULL workspace_id:
-- These are legacy global records. Match them to the user's personal workspace.
UPDATE public.workspaces w
SET
  shared_values = COALESCE(w.shared_values, ui.shared_values_md),
  process = COALESCE(w.process, ui.process_md)
FROM public.user_identity ui
WHERE ui.workspace_id IS NULL
  AND ui.user_id = w.user_id
  AND w.slug = 'personal'
  AND (
    (w.shared_values IS NULL AND ui.shared_values_md IS NOT NULL)
    OR (w.process IS NULL AND ui.process_md IS NOT NULL)
  );
