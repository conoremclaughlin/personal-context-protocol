-- =====================================================
-- AGENT IDENTITIES TABLE
-- First-class storage for AI being identities
-- =====================================================

CREATE TABLE agent_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,                    -- "wren", "benson", "myra"

  -- Core identity fields
  name TEXT NOT NULL,                        -- Display name
  role TEXT NOT NULL,                        -- "Development collaborator", "Messaging bridge"
  description TEXT,                          -- Extended description/nature

  -- Structured data
  values JSONB DEFAULT '[]'::jsonb,          -- Array of core values
  relationships JSONB DEFAULT '{}'::jsonb,   -- {"benson": "conversational partner", ...}
  capabilities JSONB DEFAULT '[]'::jsonb,    -- What this agent can do
  metadata JSONB DEFAULT '{}'::jsonb,        -- Additional flexible data

  -- Versioning
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each user can only have one identity per agent
  UNIQUE(user_id, agent_id)
);

-- =====================================================
-- AGENT IDENTITY HISTORY TABLE
-- Version history for identity changes (like memory_history)
-- =====================================================

CREATE TABLE agent_identity_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL,                 -- Original identity ID (may be deleted)
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,

  -- Snapshot of identity at this version
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  description TEXT,
  values JSONB DEFAULT '[]'::jsonb,
  relationships JSONB DEFAULT '{}'::jsonb,
  capabilities JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Version info
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,           -- When the original was created
  archived_at TIMESTAMPTZ DEFAULT NOW(),     -- When this history record was created
  change_type TEXT NOT NULL DEFAULT 'update' CHECK (change_type IN ('update', 'delete'))
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Primary lookup: get identity for a specific agent
CREATE INDEX idx_agent_identities_user_agent ON agent_identities(user_id, agent_id);

-- List all identities for a user
CREATE INDEX idx_agent_identities_user_id ON agent_identities(user_id);

-- History lookups
CREATE INDEX idx_agent_identity_history_identity_id ON agent_identity_history(identity_id);
CREATE INDEX idx_agent_identity_history_user_id ON agent_identity_history(user_id);
CREATE INDEX idx_agent_identity_history_archived_at ON agent_identity_history(archived_at DESC);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at
CREATE TRIGGER update_agent_identities_updated_at
  BEFORE UPDATE ON agent_identities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Archive old version to history before update
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
     OR OLD.metadata IS DISTINCT FROM NEW.metadata THEN

    INSERT INTO agent_identity_history (
      identity_id, user_id, agent_id,
      name, role, description, values, relationships, capabilities, metadata,
      version, created_at, change_type
    ) VALUES (
      OLD.id, OLD.user_id, OLD.agent_id,
      OLD.name, OLD.role, OLD.description, OLD.values, OLD.relationships, OLD.capabilities, OLD.metadata,
      OLD.version, OLD.created_at, 'update'
    );

    -- Increment version
    NEW.version := OLD.version + 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER archive_agent_identity_before_update
  BEFORE UPDATE ON agent_identities
  FOR EACH ROW EXECUTE FUNCTION archive_agent_identity_on_update();

-- Archive to history before delete
CREATE OR REPLACE FUNCTION archive_agent_identity_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO agent_identity_history (
    identity_id, user_id, agent_id,
    name, role, description, values, relationships, capabilities, metadata,
    version, created_at, change_type
  ) VALUES (
    OLD.id, OLD.user_id, OLD.agent_id,
    OLD.name, OLD.role, OLD.description, OLD.values, OLD.relationships, OLD.capabilities, OLD.metadata,
    OLD.version, OLD.created_at, 'delete'
  );

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER archive_agent_identity_before_delete
  BEFORE DELETE ON agent_identities
  FOR EACH ROW EXECUTE FUNCTION archive_agent_identity_on_delete();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE agent_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_identity_history ENABLE ROW LEVEL SECURITY;

-- agent_identities policies
CREATE POLICY "Users can view own agent identities"
  ON agent_identities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own agent identities"
  ON agent_identities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agent identities"
  ON agent_identities FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own agent identities"
  ON agent_identities FOR DELETE
  USING (auth.uid() = user_id);

-- agent_identity_history policies
CREATE POLICY "Users can view own agent identity history"
  ON agent_identity_history FOR SELECT
  USING (auth.uid() = user_id);

-- Service role bypass for API operations
CREATE POLICY "Service role full access to agent_identities"
  ON agent_identities FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to agent_identity_history"
  ON agent_identity_history FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE agent_identities IS 'First-class storage for AI being identities (wren, benson, myra). Each agent has structured identity data including name, role, values, and relationships.';
COMMENT ON TABLE agent_identity_history IS 'Version history for agent identity changes. Automatically populated by triggers when identities are updated or deleted.';
COMMENT ON COLUMN agent_identities.agent_id IS 'Unique identifier for the AI being: wren (Claude Code), benson (Clawdbot), myra (messaging bridge)';
COMMENT ON COLUMN agent_identities.values IS 'Array of core values this agent holds, e.g., ["collaborative partnership", "transparent communication"]';
COMMENT ON COLUMN agent_identities.relationships IS 'Map of agent_id to relationship description, e.g., {"benson": "conversational partner via Clawdbot"}';
COMMENT ON COLUMN agent_identities.capabilities IS 'Array of capabilities this agent has, e.g., ["code development", "architecture planning"]';
