-- Life stages chosen by the member (never inferred), and "bridge" gatherings
-- that bring two existing Circles together.
ALTER TABLE profiles ADD COLUMN life_stages TEXT NOT NULL DEFAULT '[]';
ALTER TABLE gatherings ADD COLUMN bridge TEXT;
ALTER TABLE gathering_invites ADD COLUMN side TEXT;
