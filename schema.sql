-- Blockyard database tables.
-- You don't need to run this: the Worker creates these tables by itself the first time it runs.
-- It's here so you can see how the data is stored.

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, creator TEXT NOT NULL, descr TEXT NOT NULL DEFAULT '',
  style TEXT NOT NULL, theme TEXT NOT NULL, w INTEGER NOT NULL, h INTEGER NOT NULL, data TEXT NOT NULL,
  edit_hash TEXT NOT NULL, creator_hash TEXT NOT NULL,
  plays INTEGER NOT NULL DEFAULT 0, likes INTEGER NOT NULL DEFAULT 0, reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);

CREATE INDEX IF NOT EXISTS games_new ON games (hidden, created_at DESC);

CREATE INDEX IF NOT EXISTS games_top ON games (hidden, plays DESC);

CREATE INDEX IF NOT EXISTS games_liked ON games (hidden, likes DESC);

CREATE INDEX IF NOT EXISTS games_creator ON games (creator_hash, created_at);

CREATE TABLE IF NOT EXISTS likes (game_id TEXT NOT NULL, who TEXT NOT NULL, PRIMARY KEY (game_id, who));

CREATE TABLE IF NOT EXISTS plays (game_id TEXT NOT NULL, who TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (game_id, who));

CREATE TABLE IF NOT EXISTS reports (game_id TEXT NOT NULL, who TEXT NOT NULL, reason TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (game_id, who));

CREATE INDEX IF NOT EXISTS reports_who ON reports (who, at);

