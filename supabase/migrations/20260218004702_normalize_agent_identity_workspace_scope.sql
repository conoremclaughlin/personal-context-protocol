-- Normalize agent_identities workspace scoping after workspace-container rollout.
-- 1) If a user+agent has both legacy NULL-workspace row(s) and scoped row(s),
--    re-point identity references to the newest scoped row and delete NULL row(s).
-- 2) Backfill remaining NULL-workspace rows to the user's personal workspace when safe.
-- 3) Add a partial unique index to prevent multiple NULL-workspace rows per user+agent.

DO $$
DECLARE
  rec RECORD;
  personal_workspace_id UUID;
BEGIN
  -- Step 1: Collapse legacy NULL-workspace duplicate identities.
  FOR rec IN
    SELECT
      legacy.id AS legacy_identity_id,
      scoped.id AS scoped_identity_id
    FROM agent_identities legacy
    JOIN LATERAL (
      SELECT s.id
      FROM agent_identities s
      WHERE s.user_id = legacy.user_id
        AND s.agent_id = legacy.agent_id
        AND s.workspace_id IS NOT NULL
      ORDER BY s.updated_at DESC NULLS LAST
      LIMIT 1
    ) scoped ON TRUE
    WHERE legacy.workspace_id IS NULL
  LOOP
    UPDATE sessions SET identity_id = rec.scoped_identity_id WHERE identity_id = rec.legacy_identity_id;
    UPDATE memories SET identity_id = rec.scoped_identity_id WHERE identity_id = rec.legacy_identity_id;
    UPDATE activity_stream SET identity_id = rec.scoped_identity_id WHERE identity_id = rec.legacy_identity_id;
    UPDATE mcp_tokens SET identity_id = rec.scoped_identity_id WHERE identity_id = rec.legacy_identity_id;
    UPDATE studios SET identity_id = rec.scoped_identity_id WHERE identity_id = rec.legacy_identity_id;
    UPDATE agent_inbox
      SET recipient_identity_id = rec.scoped_identity_id
      WHERE recipient_identity_id = rec.legacy_identity_id;
    UPDATE agent_inbox
      SET sender_identity_id = rec.scoped_identity_id
      WHERE sender_identity_id = rec.legacy_identity_id;
    UPDATE artifacts
      SET created_by_identity_id = rec.scoped_identity_id
      WHERE created_by_identity_id = rec.legacy_identity_id;
    UPDATE artifact_history
      SET changed_by_identity_id = rec.scoped_identity_id
      WHERE changed_by_identity_id = rec.legacy_identity_id;
    UPDATE artifact_comments
      SET created_by_identity_id = rec.scoped_identity_id
      WHERE created_by_identity_id = rec.legacy_identity_id;

    DELETE FROM agent_identities WHERE id = rec.legacy_identity_id;
  END LOOP;

  -- Step 2: Backfill remaining NULL-workspace identities to personal workspace when possible.
  FOR rec IN
    SELECT id, user_id, agent_id
    FROM agent_identities
    WHERE workspace_id IS NULL
  LOOP
    personal_workspace_id := NULL;

    SELECT wc.id
    INTO personal_workspace_id
    FROM workspace_containers wc
    JOIN workspace_members wm ON wm.workspace_id = wc.id
    WHERE wm.user_id = rec.user_id
      AND wc.type = 'personal'
      AND wc.archived_at IS NULL
    ORDER BY wc.created_at ASC
    LIMIT 1;

    IF personal_workspace_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM agent_identities existing
        WHERE existing.user_id = rec.user_id
          AND existing.agent_id = rec.agent_id
          AND existing.workspace_id = personal_workspace_id
      ) THEN
        UPDATE agent_identities
        SET workspace_id = personal_workspace_id
        WHERE id = rec.id;
      END IF;
    END IF;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS agent_identities_user_agent_null_workspace_key
  ON agent_identities(user_id, agent_id)
  WHERE workspace_id IS NULL;
