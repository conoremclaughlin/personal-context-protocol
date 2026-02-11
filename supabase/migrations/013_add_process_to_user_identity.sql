-- Add process_md to user_identity for shared team operational process.
-- PROCESS.md describes how agents work as a team: tool conventions, phase usage,
-- handoff protocol, memory conventions. Shared across all agents.
--
-- Also updates history table and triggers to track process_md changes.

ALTER TABLE user_identity ADD COLUMN process_md TEXT;
ALTER TABLE user_identity_history ADD COLUMN process_md TEXT;

-- Replace the version trigger to include process_md in change detection and archiving
CREATE OR REPLACE FUNCTION create_user_identity_version_on_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create history if content actually changed
  IF OLD.user_profile_md IS DISTINCT FROM NEW.user_profile_md
     OR OLD.shared_values_md IS DISTINCT FROM NEW.shared_values_md
     OR OLD.process_md IS DISTINCT FROM NEW.process_md THEN

    -- Archive the old version
    INSERT INTO user_identity_history (
      identity_id, user_id, user_profile_md, shared_values_md, process_md,
      version, created_at, change_type
    ) VALUES (
      OLD.id, OLD.user_id, OLD.user_profile_md, OLD.shared_values_md, OLD.process_md,
      OLD.version, OLD.created_at, 'update'
    );

    -- Increment version
    NEW.version = OLD.version + 1;
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace the delete trigger to include process_md
CREATE OR REPLACE FUNCTION archive_user_identity_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_identity_history (
    identity_id, user_id, user_profile_md, shared_values_md, process_md,
    version, created_at, change_type
  ) VALUES (
    OLD.id, OLD.user_id, OLD.user_profile_md, OLD.shared_values_md, OLD.process_md,
    OLD.version, OLD.created_at, 'delete'
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN user_identity.process_md IS 'PROCESS.md content - shared team operational process (tool conventions, phase usage, handoff protocol).';
