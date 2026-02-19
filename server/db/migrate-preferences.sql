-- Add preferences column to users table (idempotent)
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}' NOT NULL;

-- Backfill existing users with Jenny's defaults
UPDATE users SET preferences = '{"cardSort":"C,D,S,H:asc","tableColor":"#0f1923"}'
WHERE preferences = '{}' OR preferences IS NULL;
