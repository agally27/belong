-- Local matching, availability and companion-proposed gatherings.
-- Location stays coarse: a postcode DISTRICT (e.g. "BS3") and that district's
-- published centre point. Full postcodes and device locations are never stored.

ALTER TABLE profiles ADD COLUMN district TEXT;
ALTER TABLE profiles ADD COLUMN lat REAL;
ALTER TABLE profiles ADD COLUMN lng REAL;
ALTER TABLE profiles ADD COLUMN radius_miles INTEGER NOT NULL DEFAULT 10;
ALTER TABLE profiles ADD COLUMN online_ok INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN availability TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS gatherings (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  area TEXT,
  slot TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  respond_by TEXT NOT NULL,
  min_size INTEGER NOT NULL DEFAULT 3,
  max_size INTEGER NOT NULL DEFAULT 6,
  status TEXT NOT NULL DEFAULT 'proposed',
  circle_id TEXT REFERENCES circles(id) ON DELETE SET NULL,
  reminded_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gathering_invites (
  gathering_id TEXT NOT NULL REFERENCES gatherings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'invited',
  reason TEXT NOT NULL DEFAULT '',
  responded_at TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (gathering_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_gathering_invites_user ON gathering_invites(user_id, status);

ALTER TABLE conversations ADD COLUMN gathering_id TEXT REFERENCES gatherings(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_gathering ON conversations(gathering_id);
