-- Blockyard database tables.
-- You don't need to run this: the Worker creates these tables by itself the first time it runs
-- (and adds new columns when you update). It's here so you can see how the data is stored.

CREATE TABLE games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  creator TEXT NOT NULL,
  descr TEXT NOT NULL DEFAULT '',
  style TEXT NOT NULL,
  theme TEXT NOT NULL,
  w INTEGER NOT NULL,
  h INTEGER NOT NULL,
  data TEXT NOT NULL,
  edit_hash TEXT NOT NULL,
  creator_hash TEXT NOT NULL,
  plays INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  user_id TEXT,
  kind TEXT NOT NULL DEFAULT '2d',
  visibility TEXT NOT NULL DEFAULT 'public',
  reward INTEGER NOT NULL DEFAULT 0,
  project_id TEXT,
  thumb TEXT);
CREATE INDEX games_new ON games (hidden, created_at DESC);
CREATE INDEX games_top ON games (hidden, plays DESC);
CREATE INDEX games_liked ON games (hidden, likes DESC);
CREATE INDEX games_creator ON games (creator_hash, created_at);
CREATE INDEX games_user ON games (user_id, created_at);
CREATE INDEX games_list ON games (kind, visibility, hidden, created_at DESC);

CREATE TABLE likes (game_id TEXT NOT NULL,
  who TEXT NOT NULL, PRIMARY KEY (game_id, who));

CREATE TABLE plays (game_id TEXT NOT NULL,
  who TEXT NOT NULL,
  at INTEGER NOT NULL, PRIMARY KEY (game_id, who));

CREATE TABLE reports (game_id TEXT NOT NULL,
  who TEXT NOT NULL,
  reason TEXT NOT NULL,
  at INTEGER NOT NULL, PRIMARY KEY (game_id, who));
CREATE INDEX reports_who ON reports (who, at);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_lower TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  pw_salt TEXT NOT NULL,
  rec_hash TEXT NOT NULL,
  progress TEXT NOT NULL DEFAULT '{}',
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  look TEXT NOT NULL DEFAULT '{}',
  econ INTEGER NOT NULL DEFAULT 0);

CREATE TABLE sessions (token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires INTEGER NOT NULL);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE events (kind TEXT NOT NULL,
  who TEXT NOT NULL,
  at INTEGER NOT NULL);
CREATE INDEX events_who ON events (kind, who, at);

CREATE TABLE daily (date TEXT NOT NULL,
  user_id TEXT NOT NULL,
  progress REAL NOT NULL,
  won INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL, PRIMARY KEY (date, user_id));
CREATE INDEX daily_rank ON daily (date, progress DESC, at);

CREATE TABLE projects (id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  game_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL);
CREATE INDEX projects_owner ON projects (owner_id, updated_at DESC);

CREATE TABLE collabs (project_id TEXT NOT NULL,
  user_id TEXT NOT NULL, PRIMARY KEY (project_id, user_id));
CREATE INDEX collabs_user ON collabs (user_id);

CREATE TABLE servers (code TEXT PRIMARY KEY,
  world TEXT NOT NULL,
  private INTEGER NOT NULL DEFAULT 0,
  owner_id TEXT,
  players INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL,
  created_at INTEGER NOT NULL);
-- added later by the server itself: bots, bot_skill, and perms (who is a Builder / Admin in a private server)
CREATE INDEX servers_world ON servers (world, private, updated);

CREATE TABLE presence (user_id TEXT PRIMARY KEY,
  world TEXT NOT NULL,
  code TEXT NOT NULL,
  at INTEGER NOT NULL);

CREATE TABLE chat_reports (id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter TEXT NOT NULL,
  reporter_name TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target TEXT NOT NULL,
  room TEXT NOT NULL,
  reason TEXT NOT NULL,
  messages TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  at INTEGER NOT NULL);
CREATE INDEX chat_reports_open ON chat_reports (status, at);

CREATE TABLE wallets (user_id TEXT PRIMARY KEY,
  coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0));

CREATE TABLE inventory (user_id TEXT NOT NULL,
  item TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 0), PRIMARY KEY (user_id, item));

CREATE TABLE stock (item TEXT PRIMARY KEY,
  left INTEGER NOT NULL CHECK (left >= 0));

CREATE TABLE ledger (user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  why TEXT NOT NULL,
  at INTEGER NOT NULL);
CREATE INDEX ledger_user ON ledger (user_id, why, at);

CREATE TABLE level_progress (user_id TEXT NOT NULL,
  level TEXT NOT NULL,
  stars INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  best REAL, PRIMARY KEY (user_id, level));

CREATE TABLE claims (user_id TEXT NOT NULL,
  what TEXT NOT NULL,
  at INTEGER NOT NULL, PRIMARY KEY (user_id, what));

CREATE TABLE trades (id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  give TEXT NOT NULL,
  want TEXT NOT NULL,
  give_coins INTEGER NOT NULL DEFAULT 0,
  want_coins INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  done_at INTEGER);
CREATE INDEX trades_to ON trades (to_id, status, created_at);
CREATE INDEX trades_from ON trades (from_id, status, created_at);

CREATE TABLE trade_done (id TEXT PRIMARY KEY);


-- Site settings: the admin announcement, and the key live-room tickets are signed with when SALT is missing.
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Difficulty votes from players who beat a level (10 votes send it to the admin to rate). games.suggested marks ones already sent.
CREATE TABLE IF NOT EXISTS diff_votes (game_id TEXT NOT NULL, user_id TEXT NOT NULL, stars INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (game_id, user_id));
-- Which level is the daily challenge each day ('admin' picked, 'top' player level, or 'auto' = Blockyard's own course).
CREATE TABLE IF NOT EXISTS daily_pick (date TEXT PRIMARY KEY, game_id TEXT, how TEXT NOT NULL DEFAULT 'auto');
-- The Reseller shop: items players are selling (the item is held here until it sells or is taken down).
CREATE TABLE IF NOT EXISTS listings (id TEXT PRIMARY KEY, seller TEXT NOT NULL, item TEXT NOT NULL, price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', buyer TEXT, at INTEGER NOT NULL, sold_at INTEGER);
CREATE INDEX IF NOT EXISTS listings_item ON listings (item, status, price);
CREATE INDEX IF NOT EXISTS listings_seller ON listings (seller, status);
-- creator shops: what players bought in someone's 3D world (only works in that world)
CREATE TABLE IF NOT EXISTS world_items (user_id TEXT NOT NULL, game_id TEXT NOT NULL, item TEXT NOT NULL, price INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, game_id, item));

-- groups (update 19): groups, members, bans, channels, messages, polls, votes, reactions, what you have read
CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_lower TEXT NOT NULL UNIQUE, descr TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#3a86ff',
    owner_id TEXT NOT NULL, open INTEGER NOT NULL DEFAULT 1, code TEXT NOT NULL, members INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, last_at INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS groups_open ON groups (open, members);
CREATE UNIQUE INDEX IF NOT EXISTS groups_code ON groups (code);
CREATE TABLE IF NOT EXISTS group_members (group_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', notify INTEGER NOT NULL DEFAULT 2,
    joined_at INTEGER NOT NULL, PRIMARY KEY (group_id, user_id));
CREATE INDEX IF NOT EXISTS group_members_user ON group_members (user_id);
CREATE TABLE IF NOT EXISTS group_bans (group_id TEXT NOT NULL, user_id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (group_id, user_id));
CREATE TABLE IF NOT EXISTS group_channels (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'text', pos INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS group_channels_g ON group_channels (group_id, pos);
CREATE TABLE IF NOT EXISTS group_msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL, channel_id INTEGER NOT NULL, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
    reply_to INTEGER NOT NULL DEFAULT 0, poll_id INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS group_msgs_c ON group_msgs (channel_id, id);
CREATE INDEX IF NOT EXISTS group_msgs_g ON group_msgs (group_id, at);
CREATE TABLE IF NOT EXISTS group_polls (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL, question TEXT NOT NULL, options TEXT NOT NULL, multi INTEGER NOT NULL DEFAULT 0, ends_at INTEGER NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS group_votes (poll_id INTEGER NOT NULL, user_id TEXT NOT NULL, opt INTEGER NOT NULL, PRIMARY KEY (poll_id, user_id, opt));
CREATE TABLE IF NOT EXISTS group_reacts (msg_id INTEGER NOT NULL, user_id TEXT NOT NULL, e TEXT NOT NULL, PRIMARY KEY (msg_id, user_id, e));
CREATE TABLE IF NOT EXISTS group_reads (user_id TEXT NOT NULL, channel_id INTEGER NOT NULL, last_id INTEGER NOT NULL, PRIMARY KEY (user_id, channel_id));
