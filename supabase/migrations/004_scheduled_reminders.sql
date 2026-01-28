-- =====================================================
-- SCHEDULED REMINDERS TABLE
-- For user-created reminders and recurring tasks
-- =====================================================

CREATE TABLE scheduled_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Reminder content
  title TEXT NOT NULL,
  description TEXT,

  -- Scheduling
  cron_expression TEXT,                    -- NULL for one-time reminders
  next_run_at TIMESTAMPTZ NOT NULL,        -- When to trigger next
  last_run_at TIMESTAMPTZ,                 -- When it last ran

  -- Delivery
  delivery_channel TEXT NOT NULL DEFAULT 'telegram',  -- 'telegram', 'whatsapp', 'email'
  delivery_target TEXT,                    -- Platform-specific ID (chat_id, phone, email)

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'failed')),
  run_count INTEGER DEFAULT 0,
  max_runs INTEGER,                        -- NULL = unlimited for recurring

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- HEARTBEAT STATE TABLE
-- Tracks last check times for various systems per user
-- =====================================================

CREATE TABLE heartbeat_state (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Last check timestamps for different systems
  last_checks JSONB DEFAULT '{}'::jsonb,   -- {"email": timestamp, "calendar": timestamp, ...}

  -- Quiet hours (user preference)
  quiet_start TIME,                        -- e.g., '23:00'
  quiet_end TIME,                          -- e.g., '08:00'
  timezone TEXT DEFAULT 'UTC',

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- REMINDER HISTORY TABLE
-- Tracks delivery attempts and results
-- =====================================================

CREATE TABLE reminder_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id UUID NOT NULL REFERENCES scheduled_reminders(id) ON DELETE CASCADE,

  -- Execution details
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'failed', 'skipped')),
  error_message TEXT,

  -- Response tracking
  response_received BOOLEAN DEFAULT FALSE,
  response_at TIMESTAMPTZ,
  response_content TEXT
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Find due reminders efficiently
CREATE INDEX idx_scheduled_reminders_next_run
  ON scheduled_reminders(next_run_at)
  WHERE status = 'active';

-- User's reminders
CREATE INDEX idx_scheduled_reminders_user_id ON scheduled_reminders(user_id);

-- Reminder history lookup
CREATE INDEX idx_reminder_history_reminder_id ON reminder_history(reminder_id);
CREATE INDEX idx_reminder_history_triggered_at ON reminder_history(triggered_at DESC);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at
CREATE TRIGGER update_scheduled_reminders_updated_at
  BEFORE UPDATE ON scheduled_reminders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_heartbeat_state_updated_at
  BEFORE UPDATE ON heartbeat_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE scheduled_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE heartbeat_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_history ENABLE ROW LEVEL SECURITY;

-- Users can manage their own reminders
CREATE POLICY "Users can view own reminders"
  ON scheduled_reminders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reminders"
  ON scheduled_reminders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reminders"
  ON scheduled_reminders FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reminders"
  ON scheduled_reminders FOR DELETE
  USING (auth.uid() = user_id);

-- Heartbeat state
CREATE POLICY "Users can view own heartbeat state"
  ON heartbeat_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own heartbeat state"
  ON heartbeat_state FOR ALL
  USING (auth.uid() = user_id);

-- Reminder history
CREATE POLICY "Users can view own reminder history"
  ON reminder_history FOR SELECT
  USING (reminder_id IN (SELECT id FROM scheduled_reminders WHERE user_id = auth.uid()));

-- Service role bypass
CREATE POLICY "Service role full access to scheduled_reminders"
  ON scheduled_reminders FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to heartbeat_state"
  ON heartbeat_state FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to reminder_history"
  ON reminder_history FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- HELPER FUNCTION: Calculate next run time from cron
-- =====================================================

-- Note: For complex cron parsing, we'll handle this in application code
-- This is a simple helper for common cases
CREATE OR REPLACE FUNCTION calculate_next_run(
  cron_expr TEXT,
  from_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS TIMESTAMPTZ AS $$
BEGIN
  -- For now, return a simple interval-based calculation
  -- Full cron parsing will be done in application code
  CASE cron_expr
    WHEN '* * * * *' THEN RETURN from_time + INTERVAL '1 minute';
    WHEN '*/5 * * * *' THEN RETURN from_time + INTERVAL '5 minutes';
    WHEN '*/15 * * * *' THEN RETURN from_time + INTERVAL '15 minutes';
    WHEN '*/30 * * * *' THEN RETURN from_time + INTERVAL '30 minutes';
    WHEN '0 * * * *' THEN RETURN from_time + INTERVAL '1 hour';
    WHEN '0 0 * * *' THEN RETURN from_time + INTERVAL '1 day';
    WHEN '0 0 * * 0' THEN RETURN from_time + INTERVAL '1 week';
    ELSE RETURN from_time + INTERVAL '1 day';  -- Default daily
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE scheduled_reminders IS 'User-created reminders and recurring tasks. Supports one-time and cron-based scheduling.';
COMMENT ON TABLE heartbeat_state IS 'Tracks per-user heartbeat check times and quiet hours preferences.';
COMMENT ON TABLE reminder_history IS 'Audit log of reminder delivery attempts and user responses.';
COMMENT ON COLUMN scheduled_reminders.cron_expression IS 'Standard cron syntax (minute hour day month weekday). NULL for one-time reminders.';
COMMENT ON COLUMN scheduled_reminders.delivery_channel IS 'Platform to deliver reminder: telegram, whatsapp, or email.';
COMMENT ON COLUMN heartbeat_state.last_checks IS 'JSON object tracking last check times: {"email": "2024-01-27T12:00:00Z", "calendar": "2024-01-27T11:30:00Z"}';
