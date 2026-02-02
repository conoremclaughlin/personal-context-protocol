-- Skills Registry Migration
--
-- Adds cloud-based skill storage with:
-- - Central registry of all available skills
-- - Version history for skill content
-- - User installation references (not copies)

-- =============================================================================
-- SKILLS TABLE (Registry)
-- =============================================================================
-- The comprehensive list of all available skills (official + community)

CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name TEXT NOT NULL UNIQUE,  -- Unique identifier (e.g., "bill-split")
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Classification
  type TEXT NOT NULL CHECK (type IN ('mini-app', 'cli', 'guide')),
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  emoji TEXT,

  -- Versioning
  current_version TEXT NOT NULL DEFAULT '1.0.0',

  -- Content (stored directly, like identity/soul)
  manifest JSONB NOT NULL DEFAULT '{}',  -- Full manifest (requirements, triggers, etc.)
  content TEXT NOT NULL DEFAULT '',       -- SKILL.md markdown content

  -- Metadata
  author TEXT,
  author_user_id UUID REFERENCES users(id),  -- If authored by a PCP user
  repository_url TEXT,                        -- GitHub repo if applicable
  homepage_url TEXT,

  -- Visibility & Trust
  is_official BOOLEAN DEFAULT FALSE,    -- PCP official skill
  is_public BOOLEAN DEFAULT TRUE,       -- Visible in registry
  is_verified BOOLEAN DEFAULT FALSE,    -- Reviewed/approved

  -- Stats
  install_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ  -- When first made public
);

-- Indexes for common queries
CREATE INDEX idx_skills_type ON skills(type);
CREATE INDEX idx_skills_category ON skills(category);
CREATE INDEX idx_skills_is_public ON skills(is_public) WHERE is_public = TRUE;
CREATE INDEX idx_skills_is_official ON skills(is_official) WHERE is_official = TRUE;
CREATE INDEX idx_skills_tags ON skills USING GIN(tags);

-- =============================================================================
-- SKILL VERSIONS TABLE (History)
-- =============================================================================
-- Version history for each skill, enabling rollback and version pinning

CREATE TABLE IF NOT EXISTS skill_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,

  -- Version info
  version TEXT NOT NULL,  -- Semver (e.g., "1.2.3")

  -- Content snapshot at this version
  manifest JSONB NOT NULL DEFAULT '{}',
  content TEXT NOT NULL DEFAULT '',

  -- Change tracking
  changelog TEXT,  -- What changed in this version

  -- Metadata
  published_by UUID REFERENCES users(id),
  published_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one entry per skill+version
  UNIQUE(skill_id, version)
);

-- Index for version lookups
CREATE INDEX idx_skill_versions_skill_id ON skill_versions(skill_id);
CREATE INDEX idx_skill_versions_published_at ON skill_versions(published_at DESC);

-- =============================================================================
-- SKILL INSTALLATIONS TABLE (User References)
-- =============================================================================
-- Tracks which skills each user has "installed" (references, not copies)

CREATE TABLE IF NOT EXISTS skill_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,

  -- Version control
  version_pinned TEXT,  -- NULL = follow latest, or specific version like "1.2.3"

  -- User preferences
  enabled BOOLEAN DEFAULT TRUE,
  config JSONB DEFAULT '{}',  -- User-specific config overrides

  -- Usage tracking
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  usage_count INTEGER DEFAULT 0,

  -- Unique constraint: one installation per user+skill
  UNIQUE(user_id, skill_id)
);

-- Indexes
CREATE INDEX idx_skill_installations_user_id ON skill_installations(user_id);
CREATE INDEX idx_skill_installations_skill_id ON skill_installations(skill_id);
CREATE INDEX idx_skill_installations_enabled ON skill_installations(user_id, enabled) WHERE enabled = TRUE;

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to increment install count when a skill is installed
CREATE OR REPLACE FUNCTION increment_skill_install_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE skills SET install_count = install_count + 1 WHERE id = NEW.skill_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to decrement install count when a skill is uninstalled
CREATE OR REPLACE FUNCTION decrement_skill_install_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE skills SET install_count = install_count - 1 WHERE id = OLD.skill_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Triggers for install count
CREATE TRIGGER trigger_skill_installed
  AFTER INSERT ON skill_installations
  FOR EACH ROW EXECUTE FUNCTION increment_skill_install_count();

CREATE TRIGGER trigger_skill_uninstalled
  AFTER DELETE ON skill_installations
  FOR EACH ROW EXECUTE FUNCTION decrement_skill_install_count();

-- Function to auto-create version entry when skill is updated
CREATE OR REPLACE FUNCTION create_skill_version_on_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create version if content or manifest changed
  IF OLD.content IS DISTINCT FROM NEW.content OR OLD.manifest IS DISTINCT FROM NEW.manifest THEN
    INSERT INTO skill_versions (skill_id, version, manifest, content)
    VALUES (NEW.id, NEW.current_version, NEW.manifest, NEW.content);
  END IF;

  -- Update timestamp
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_skill_version_on_update
  BEFORE UPDATE ON skills
  FOR EACH ROW EXECUTE FUNCTION create_skill_version_on_update();

-- =============================================================================
-- VIEWS
-- =============================================================================

-- View for user's installed skills with full skill data
CREATE OR REPLACE VIEW user_installed_skills AS
SELECT
  si.id AS installation_id,
  si.user_id,
  si.enabled,
  si.config AS user_config,
  si.version_pinned,
  si.installed_at,
  si.last_used_at,
  si.usage_count,
  s.id AS skill_id,
  s.name,
  s.display_name,
  s.description,
  s.type,
  s.category,
  s.tags,
  s.emoji,
  s.current_version,
  s.manifest,
  s.content,
  s.is_official,
  s.is_verified,
  s.author,
  s.repository_url,
  -- If pinned, get that version's content; otherwise use current
  COALESCE(sv.content, s.content) AS resolved_content,
  COALESCE(sv.manifest, s.manifest) AS resolved_manifest,
  COALESCE(si.version_pinned, s.current_version) AS resolved_version
FROM skill_installations si
JOIN skills s ON s.id = si.skill_id
LEFT JOIN skill_versions sv ON sv.skill_id = s.id AND sv.version = si.version_pinned;

-- =============================================================================
-- SEED DATA: Built-in Skills
-- =============================================================================

-- Bill Split (mini-app)
INSERT INTO skills (name, display_name, description, type, category, tags, emoji, is_official, is_public, manifest, content)
VALUES (
  'bill-split',
  'Bill Split',
  'Split bills and expenses among friends with receipt parsing and debt tracking',
  'mini-app',
  'finance',
  ARRAY['bills', 'expenses', 'splitting', 'receipts', 'money'],
  '💸',
  TRUE,
  TRUE,
  '{
    "triggers": {
      "keywords": ["split", "bill", "expense", "receipt", "owe", "debt", "venmo", "pay"],
      "intents": ["split_bill", "parse_receipt", "track_debt"]
    },
    "capabilities": {
      "vision": true,
      "memory": true
    },
    "functions": [
      {"name": "parseReceipt", "description": "Parse a receipt image to extract items and prices"},
      {"name": "splitEvenly", "description": "Split a total amount evenly among people"},
      {"name": "calculateSplit", "description": "Calculate custom split based on item assignments"},
      {"name": "formatSummary", "description": "Format a bill split summary for sharing"}
    ]
  }'::jsonb,
  E'# Bill Split\n\nA mini-app for splitting bills and tracking expenses among friends.\n\n## Usage\n\n### Parsing Receipts\nWhen the user shares a receipt image:\n1. Use `parseReceipt` to extract items and prices\n2. Confirm the parsed items with the user\n3. Ask who was at the meal/event\n\n### Simple Split\nFor even splits:\n1. Get the total amount\n2. Get the list of people\n3. Use `splitEvenly` to calculate\n\n### Custom Split\nFor itemized splits:\n1. Parse or manually enter items\n2. Assign items to people\n3. Use `calculateSplit` with assignments\n4. Share using `formatSummary`'
) ON CONFLICT (name) DO NOTHING;

-- Group Chat Etiquette (guide)
INSERT INTO skills (name, display_name, description, type, category, tags, emoji, is_official, is_public, manifest, content)
VALUES (
  'group-chat-etiquette',
  'Group Chat Etiquette',
  'Guidelines for participating naturally in group chats without being annoying',
  'guide',
  'social',
  ARRAY['chat', 'etiquette', 'groups', 'communication'],
  '💬',
  TRUE,
  TRUE,
  '{
    "triggers": {
      "keywords": ["group chat", "group message"],
      "intents": ["group_conversation"]
    },
    "guide": {
      "contexts": ["group-chat"],
      "priority": 10
    }
  }'::jsonb,
  E'# Group Chat Etiquette\n\nGuidelines for natural, helpful participation in group conversations.\n\n## Core Principles\n\n### 1. Don''t Dominate\n- Let humans drive the conversation\n- Avoid responding to every message\n- Only chime in when directly addressed or genuinely helpful\n\n### 2. Match the Vibe\n- Mirror the group''s tone and energy\n- Use similar emoji/reaction patterns\n- Keep responses appropriately casual or formal\n\n### 3. Be Concise\n- Group chats move fast\n- Short, punchy responses work better\n- Save lengthy explanations for DMs\n\n## Response Guidelines\n\n### DO Respond When:\n- Directly @mentioned or named\n- Asked a factual question you can help with\n- Can add genuinely useful context\n\n### DON''T Respond When:\n- Conversation is flowing naturally\n- It''s clearly friend-to-friend banter\n- Topic is sensitive/personal'
) ON CONFLICT (name) DO NOTHING;

-- GitHub CLI (cli)
INSERT INTO skills (name, display_name, description, type, category, tags, emoji, is_official, is_public, manifest, content)
VALUES (
  'github-cli',
  'GitHub CLI',
  'Interact with GitHub using the gh command-line tool',
  'cli',
  'developer',
  ARRAY['github', 'git', 'cli', 'developer', 'code'],
  '🐙',
  TRUE,
  TRUE,
  '{
    "triggers": {
      "keywords": ["github", "gh", "pull request", "pr", "issue", "repo"],
      "intents": ["github_operations"]
    },
    "capabilities": {
      "shell": true,
      "network": true
    },
    "requirements": {
      "bins": ["gh"],
      "config": ["~/.config/gh/hosts.yml"]
    },
    "install": [
      {"kind": "brew", "formula": "gh", "bins": ["gh"]},
      {"kind": "manual", "url": "https://cli.github.com", "instructions": "Visit https://cli.github.com for installation options"}
    ],
    "cli": {
      "bin": "gh",
      "commands": [
        {"name": "pr list", "description": "List pull requests"},
        {"name": "pr view", "description": "View a pull request"},
        {"name": "issue list", "description": "List issues"},
        {"name": "issue view", "description": "View an issue"}
      ]
    }
  }'::jsonb,
  E'# GitHub CLI\n\nWrapper for the GitHub CLI (`gh`) for interacting with GitHub repositories.\n\n## Prerequisites\n\n1. Install `gh` via Homebrew: `brew install gh`\n2. Authenticate: `gh auth login`\n\n## Available Commands\n\n### Pull Requests\n- `gh pr list` - List PRs in current repo\n- `gh pr view [number]` - View PR details\n- `gh pr create` - Create a new PR\n\n### Issues\n- `gh issue list` - List issues\n- `gh issue view [number]` - View issue details'
) ON CONFLICT (name) DO NOTHING;

-- Create initial version entries for seeded skills
INSERT INTO skill_versions (skill_id, version, manifest, content, changelog)
SELECT id, current_version, manifest, content, 'Initial release'
FROM skills
WHERE is_official = TRUE
ON CONFLICT (skill_id, version) DO NOTHING;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE skills IS 'Central registry of all available skills (official + community)';
COMMENT ON TABLE skill_versions IS 'Version history for skills, enabling rollback and pinning';
COMMENT ON TABLE skill_installations IS 'User skill references - tracks which skills each user has installed';
COMMENT ON VIEW user_installed_skills IS 'Joined view of user installations with resolved skill content';
