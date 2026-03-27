-- Per-Sender Session Isolation
--
-- Adds contact_id to sessions and memories so that external contacts
-- (Telegram/WhatsApp senders) get isolated conversation history and
-- memories when talking to a shared SB.
--
-- All columns nullable — existing rows stay NULL (backward compatible).
-- NULL contact_id = owner/system/inter-agent context.

-- ============================================================================
-- 1. Sessions: per-contact isolation
-- ============================================================================

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id);

-- Composite index for contact-scoped active session lookups
CREATE INDEX IF NOT EXISTS idx_sessions_contact_lookup
  ON sessions(user_id, agent_id, contact_id)
  WHERE status = 'active';

-- ============================================================================
-- 2. Memories: per-contact scoping
-- ============================================================================

ALTER TABLE memories ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id);

-- Composite index for contact-scoped memory queries
CREATE INDEX IF NOT EXISTS idx_memories_contact_lookup
  ON memories(user_id, agent_id, contact_id);

-- ============================================================================
-- 3. Memory history: include contact_id for audit trail
-- ============================================================================

ALTER TABLE memory_history ADD COLUMN IF NOT EXISTS contact_id uuid;

-- ============================================================================
-- 4. Update archive triggers to include contact_id
-- ============================================================================

CREATE OR REPLACE FUNCTION public.archive_memory_on_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO memory_history (
    memory_id, user_id, content, source, salience, topics, metadata,
    version, created_at, change_type, summary, topic_key, contact_id
  ) VALUES (
    OLD.id, OLD.user_id, OLD.content, OLD.source, OLD.salience, OLD.topics,
    OLD.metadata, OLD.version, OLD.created_at, 'delete', OLD.summary, OLD.topic_key, OLD.contact_id
  );
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.archive_memory_on_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content
     OR OLD.salience IS DISTINCT FROM NEW.salience
     OR OLD.topics IS DISTINCT FROM NEW.topics
     OR OLD.summary IS DISTINCT FROM NEW.summary
     OR OLD.topic_key IS DISTINCT FROM NEW.topic_key THEN
    INSERT INTO memory_history (
      memory_id, user_id, content, source, salience, topics, metadata,
      version, created_at, change_type, summary, topic_key, contact_id
    ) VALUES (
      OLD.id, OLD.user_id, OLD.content, OLD.source, OLD.salience, OLD.topics,
      OLD.metadata, OLD.version, OLD.created_at, 'update', OLD.summary, OLD.topic_key, OLD.contact_id
    );
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$function$;
