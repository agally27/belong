-- Optional notification emails. Everything is opt-in; nothing is emailed by default.
CREATE TABLE IF NOT EXISTS email_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  categories TEXT NOT NULL DEFAULT '[]',
  frequency TEXT NOT NULL DEFAULT 'instant',
  last_digest_at TEXT,
  updated_at TEXT NOT NULL
);

-- Outbox: rows are written in the same transaction as the event, then sent afterwards,
-- so an action that rolls back never sends an email.
CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  href TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox(status, created_at);
CREATE INDEX IF NOT EXISTS idx_email_outbox_user ON email_outbox(user_id, category, created_at);
