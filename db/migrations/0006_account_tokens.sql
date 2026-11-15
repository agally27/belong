-- Email verification and password reset.
-- Tokens are random and stored only as a SHA-256 hash; each is single-use and expires.
ALTER TABLE users ADD COLUMN email_verified_at TEXT;

CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, purpose);

-- Accounts created before verification existed are treated as verified.
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;
