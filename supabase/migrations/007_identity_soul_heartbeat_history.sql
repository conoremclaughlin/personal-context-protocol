-- =====================================================
-- Add soul and heartbeat columns to agent_identities
-- and agent_identity_history, and fix archive triggers
-- =====================================================

-- Add columns to main table (if not already present)
ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS soul TEXT;
ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS heartbeat TEXT;

-- Add columns to history table
ALTER TABLE agent_identity_history ADD COLUMN IF NOT EXISTS soul TEXT;
ALTER TABLE agent_identity_history ADD COLUMN IF NOT EXISTS heartbeat TEXT;

-- Fix the archive trigger to include soul and heartbeat
CREATE OR REPLACE FUNCTION archive_agent_identity_on_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only archive if content actually changed (not just updated_at)
  IF OLD.name IS DISTINCT FROM NEW.name
     OR OLD.role IS DISTINCT FROM NEW.role
     OR OLD.description IS DISTINCT FROM NEW.description
     OR OLD.values IS DISTINCT FROM NEW.values
     OR OLD.relationships IS DISTINCT FROM NEW.relationships
     OR OLD.capabilities IS DISTINCT FROM NEW.capabilities
     OR OLD.metadata IS DISTINCT FROM NEW.metadata
     OR OLD.soul IS DISTINCT FROM NEW.soul
     OR OLD.heartbeat IS DISTINCT FROM NEW.heartbeat THEN

    INSERT INTO agent_identity_history (
      identity_id, user_id, agent_id,
      name, role, description, values, relationships, capabilities, metadata,
      soul, heartbeat,
      version, created_at, change_type
    ) VALUES (
      OLD.id, OLD.user_id, OLD.agent_id,
      OLD.name, OLD.role, OLD.description, OLD.values, OLD.relationships, OLD.capabilities, OLD.metadata,
      OLD.soul, OLD.heartbeat,
      OLD.version, OLD.created_at, 'update'
    );

    -- Increment version
    NEW.version := OLD.version + 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix the delete trigger too
CREATE OR REPLACE FUNCTION archive_agent_identity_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO agent_identity_history (
    identity_id, user_id, agent_id,
    name, role, description, values, relationships, capabilities, metadata,
    soul, heartbeat,
    version, created_at, change_type
  ) VALUES (
    OLD.id, OLD.user_id, OLD.agent_id,
    OLD.name, OLD.role, OLD.description, OLD.values, OLD.relationships, OLD.capabilities, OLD.metadata,
    OLD.soul, OLD.heartbeat,
    OLD.version, OLD.created_at, 'delete'
  );

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
