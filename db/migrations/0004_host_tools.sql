-- Host tools: cancelling events, and removing someone from a Circle.
ALTER TABLE events ADD COLUMN status TEXT NOT NULL DEFAULT 'scheduled';

CREATE TABLE IF NOT EXISTS circle_removals (
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  removed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (circle_id, user_id)
);
