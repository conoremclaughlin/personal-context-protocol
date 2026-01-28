-- =====================================================
-- ENABLE PG_CRON AND PG_NET FOR HEARTBEAT SCHEDULING
-- =====================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- =====================================================
-- HEARTBEAT CRON JOB
-- Uses pg_net.http_post for simpler HTTP calls
-- Runs every 5 minutes
-- =====================================================

-- Note: In production, set the API URL via Supabase Edge Functions or environment
-- For now, we create a placeholder that stores the URL in a config table

CREATE TABLE IF NOT EXISTS pcp_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default API URL (update this in production)
INSERT INTO pcp_config (key, value)
VALUES ('api_url', 'http://localhost:3000')
ON CONFLICT (key) DO NOTHING;

-- Create heartbeat trigger function using net.http_post
CREATE OR REPLACE FUNCTION trigger_heartbeat()
RETURNS void AS $$
DECLARE
  api_url TEXT;
BEGIN
  -- Get the API URL from config
  SELECT value INTO api_url FROM pcp_config WHERE key = 'api_url';

  -- Make HTTP POST request using net schema
  PERFORM net.http_post(
    url := api_url || '/api/admin/heartbeat',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"source": "pg_cron"}'::jsonb
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule cron job (runs every 5 minutes)
SELECT cron.schedule(
  'pcp-heartbeat',
  '*/5 * * * *',
  'SELECT trigger_heartbeat();'
);

-- =====================================================
-- RLS FOR CONFIG TABLE
-- =====================================================

ALTER TABLE pcp_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage config"
  ON pcp_config FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE pcp_config IS 'Configuration key-value store for PCP system settings';
COMMENT ON FUNCTION trigger_heartbeat() IS 'Triggers the heartbeat endpoint via HTTP POST, called by pg_cron every 5 minutes';
