-- Private "How did it go?" feedback after members meet.
-- Seen only by the member who gave it; used to tune their own future suggestions,
-- and in aggregate (counts only) by administrators.
CREATE TABLE IF NOT EXISTS meeting_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  met TEXT NOT NULL,
  rating TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, subject_type, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON meeting_feedback(user_id);
