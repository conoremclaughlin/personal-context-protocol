-- =====================================================
-- Add backend column to agent_identities
-- Tracks which CLI backend (claude, codex, gemini) each agent uses
-- =====================================================

-- Add column to main table
ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS backend TEXT;

-- Add column to history table
ALTER TABLE agent_identity_history ADD COLUMN IF NOT EXISTS backend TEXT;

-- Update archive trigger to include backend
CREATE OR REPLACE FUNCTION archive_agent_identity_on_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name
     OR OLD.role IS DISTINCT FROM NEW.role
     OR OLD.description IS DISTINCT FROM NEW.description
     OR OLD.values IS DISTINCT FROM NEW.values
     OR OLD.relationships IS DISTINCT FROM NEW.relationships
     OR OLD.capabilities IS DISTINCT FROM NEW.capabilities
     OR OLD.metadata IS DISTINCT FROM NEW.metadata
     OR OLD.soul IS DISTINCT FROM NEW.soul
     OR OLD.heartbeat IS DISTINCT FROM NEW.heartbeat
     OR OLD.backend IS DISTINCT FROM NEW.backend THEN

    INSERT INTO agent_identity_history (
      identity_id, user_id, agent_id,
      name, role, description, values, relationships, capabilities, metadata,
      soul, heartbeat, backend,
      version, created_at, change_type
    ) VALUES (
      OLD.id, OLD.user_id, OLD.agent_id,
      OLD.name, OLD.role, OLD.description, OLD.values, OLD.relationships, OLD.capabilities, OLD.metadata,
      OLD.soul, OLD.heartbeat, OLD.backend,
      OLD.version, OLD.created_at, 'update'
    );

    NEW.version := OLD.version + 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update delete trigger to include backend
CREATE OR REPLACE FUNCTION archive_agent_identity_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO agent_identity_history (
    identity_id, user_id, agent_id,
    name, role, description, values, relationships, capabilities, metadata,
    soul, heartbeat, backend,
    version, created_at, change_type
  ) VALUES (
    OLD.id, OLD.user_id, OLD.agent_id,
    OLD.name, OLD.role, OLD.description, OLD.values, OLD.relationships, OLD.capabilities, OLD.metadata,
    OLD.soul, OLD.heartbeat, OLD.backend,
    OLD.version, OLD.created_at, 'delete'
  );

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Backfill existing agents with known backends
-- =====================================================

COMMENT ON COLUMN agent_identities.backend IS 'CLI backend for this agent: claude, codex, gemini. Used by sb CLI to auto-resolve which tool to launch.';
