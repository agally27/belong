-- BELONG initial schema.
-- Written in a portable SQL subset that runs unchanged on SQLite (local dev)
-- and PostgreSQL / Supabase (production). Conventions:
--   * ids are TEXT (UUID v4 generated in the application)
--   * timestamps are TEXT in ISO-8601 UTC (lexicographically sortable)
--   * booleans are INTEGER 0/1
--   * structured values are TEXT containing JSON
-- See docs/DATABASE.md for the migration path to native PG types.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  is_demo INTEGER NOT NULL DEFAULT 0,
  onboarded_at TEXT,
  last_active_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  pronouns TEXT,
  age_range TEXT,
  bio TEXT,
  area TEXT,
  region TEXT,
  hue INTEGER NOT NULL DEFAULT 260,
  interests TEXT NOT NULL DEFAULT '[]',
  "values" TEXT NOT NULL DEFAULT '[]',
  personality TEXT NOT NULL DEFAULT '{}',
  social_prefs TEXT NOT NULL DEFAULT '{}',
  looking_for TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'warm',
  style TEXT NOT NULL DEFAULT 'lavender',
  proactivity TEXT NOT NULL DEFAULT 'balanced',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companion_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_companion_messages_user ON companion_messages(user_id, created_at);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  topics TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'conversation',
  status TEXT NOT NULL DEFAULT 'proposed',
  share_for_matching INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id, status);

CREATE TABLE IF NOT EXISTS intentions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topics TEXT NOT NULL DEFAULT '[]',
  mode TEXT NOT NULL DEFAULT 'moment',
  status TEXT NOT NULL DEFAULT 'proposed',
  shared INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intentions_user ON intentions(user_id, status);

CREATE TABLE IF NOT EXISTS consents (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  granted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  topic TEXT NOT NULL,
  label TEXT NOT NULL,
  strength REAL NOT NULL DEFAULT 0.6,
  source_type TEXT NOT NULL,
  source_id TEXT,
  temporary INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_signals_user ON signals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_signals_topic ON signals(topic, status);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score REAL NOT NULL,
  dimensions TEXT NOT NULL DEFAULT '{}',
  reasons TEXT NOT NULL DEFAULT '[]',
  a_state TEXT NOT NULL DEFAULT 'new',
  b_state TEXT NOT NULL DEFAULT 'new',
  status TEXT NOT NULL DEFAULT 'suggested',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_a, user_b)
);
CREATE INDEX IF NOT EXISTS idx_matches_b ON matches(user_b);

CREATE TABLE IF NOT EXISTS introductions (
  id TEXT PRIMARY KEY,
  match_id TEXT REFERENCES matches(id) ON DELETE SET NULL,
  requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  a_decision TEXT NOT NULL DEFAULT 'pending',
  b_decision TEXT NOT NULL DEFAULT 'pending',
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  reasons TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_intros_a ON introductions(user_a, status);
CREATE INDEX IF NOT EXISTS idx_intros_b ON introductions(user_b, status);

CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  introduction_id TEXT REFERENCES introductions(id) ON DELETE SET NULL,
  shared_topics TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  UNIQUE (user_a, user_b)
);
CREATE INDEX IF NOT EXISTS idx_connections_b ON connections(user_b);

CREATE TABLE IF NOT EXISTS circles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL,
  area TEXT,
  capacity INTEGER NOT NULL DEFAULT 6,
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS circle_members (
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL,
  PRIMARY KEY (circle_id, user_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  connection_id TEXT UNIQUE REFERENCES connections(id) ON DELETE CASCADE,
  circle_id TEXT UNIQUE REFERENCES circles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  simulated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS conversation_reads (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reported_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL DEFAULT 'profile',
  context_id TEXT,
  reason TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL,
  area TEXT,
  format TEXT NOT NULL DEFAULT 'in_person',
  starts_at TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 8,
  host_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  circle_id TEXT REFERENCES circles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'going',
  created_at TEXT NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  href TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  price_pence INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GBP',
  billing_interval TEXT NOT NULL DEFAULT 'month',
  features TEXT NOT NULL DEFAULT '[]',
  limits TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'active',
  provider TEXT NOT NULL DEFAULT 'mock',
  provider_ref TEXT,
  started_at TEXT NOT NULL,
  renews_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  props TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_name ON analytics_events(name, created_at);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
