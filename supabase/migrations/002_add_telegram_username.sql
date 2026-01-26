-- Add telegram_username column for easier user identification
-- Users typically know their username but not their numeric telegram_id

ALTER TABLE users
ADD COLUMN telegram_username VARCHAR(255) UNIQUE;

-- Index for lookups by telegram username
CREATE INDEX idx_users_telegram_username ON users(telegram_username);
