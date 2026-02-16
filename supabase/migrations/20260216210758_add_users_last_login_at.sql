-- Add last_login_at to users table for login tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
