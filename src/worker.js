// Blockyard backend: a Cloudflare Worker with a D1 database and a Durable Object for live rooms.
// Accounts, coins and items, trading, published levels and worlds, projects you build with friends,
// multiplayer servers with chat, the daily challenge, and admin tools.
// Everything that is not /api/... is a normal file from the public folder.
//
// Settings (in wrangler.jsonc "vars", or Cloudflare > your Worker > Settings > Variables and Secrets):
//   ADMIN_USERNAME       your Blockyard username. That account gets the Admin page. Comma-separate for more than one.
//   SALT (secret)        any long random text. Makes stored passwords harder to crack. Set it once, never change it.
//   MAX_VERIFY_STEPS     optional. Longest 2D run the server checks, in 1/120ths of a second (default 14400 = 2 minutes).
//   MAX_VERIFY_STEPS_3D  optional. Longest 3D run, in 1/60ths of a second (default 18000 = 5 minutes).

import { normalizeLevel, toWire, cleanText, isRude, LIMITS } from '../public/js/format.js';
import { builtinWorld } from '../public/js/worlds3d.js';
import { dailyCourse, todayUTC } from '../public/js/endless.js';
import { json, fail, body, sha256, randomId, needUser, isAdmin, DAY, HttpError, signTicket, readTicket, enc, hex, readCookie, withCookie, isConstraint } from './util.js';
import { findItem } from '../public/js/cosmetics.js';
import { ECON_SCHEMA, seedStock, econRoute, migrateUser, accountExtras, coinStmts, verify, maxSteps, maxSteps3d, publicItems, REWARD, DEFAULT_LOOK, cleanLook, getWallet, itemStmts } from './econ.js';
export { Room } from './room.js';

const PAGE = 24;
const SESSION_DAYS = 90;
const LIMITS_PER = { publishHour: 5, publishDay: 20, reportsDay: 20, loginFails: 10, signupsDay: 5, projects: 60, collaborators: 8, privateServers: 5 };
const HIDE_AFTER_REPORTS = 3;
const ROOM_SIZE = 16;
const VIS = ['public', 'unlisted', 'private'];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, creator TEXT NOT NULL, descr TEXT NOT NULL DEFAULT '',
    style TEXT NOT NULL, theme TEXT NOT NULL, w INTEGER NOT NULL, h INTEGER NOT NULL, data TEXT NOT NULL,
    edit_hash TEXT NOT NULL, creator_hash TEXT NOT NULL,
    plays INTEGER NOT NULL DEFAULT 0, likes INTEGER NOT NULL DEFAULT 0, reports INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS games_new ON games (hidden, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS games_top ON games (hidden, plays DESC)',
  'CREATE INDEX IF NOT EXISTS games_liked ON games (hidden, likes DESC)',
  'CREATE INDEX IF NOT EXISTS games_creator ON games (creator_hash, created_at)',
  'CREATE TABLE IF NOT EXISTS likes (game_id TEXT NOT NULL, who TEXT NOT NULL, PRIMARY KEY (game_id, who))',
  'CREATE TABLE IF NOT EXISTS plays (game_id TEXT NOT NULL, who TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (game_id, who))',
  'CREATE TABLE IF NOT EXISTS reports (game_id TEXT NOT NULL, who TEXT NOT NULL, reason TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (game_id, who))',
  'CREATE INDEX IF NOT EXISTS reports_who ON reports (who, at)',
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, name_lower TEXT NOT NULL UNIQUE, pw_hash TEXT NOT NULL, pw_salt TEXT NOT NULL,
    rec_hash TEXT NOT NULL, progress TEXT NOT NULL DEFAULT '{}', banned INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  'CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)',
  'CREATE TABLE IF NOT EXISTS events (kind TEXT NOT NULL, who TEXT NOT NULL, at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS events_who ON events (kind, who, at)',
  `CREATE TABLE IF NOT EXISTS daily (date TEXT NOT NULL, user_id TEXT NOT NULL, progress REAL NOT NULL, won INTEGER NOT NULL DEFAULT 0,
    at INTEGER NOT NULL, PRIMARY KEY (date, user_id))`,
  'CREATE INDEX IF NOT EXISTS daily_rank ON daily (date, progress DESC, at)',
  // projects: levels and worlds saved on the server, which friends can build together
  `CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL,
    game_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS projects_owner ON projects (owner_id, updated_at DESC)',
  'CREATE TABLE IF NOT EXISTS collabs (project_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (project_id, user_id))',
  'CREATE INDEX IF NOT EXISTS collabs_user ON collabs (user_id)',
  // live servers and who is where
  `CREATE TABLE IF NOT EXISTS servers (code TEXT PRIMARY KEY, world TEXT NOT NULL, private INTEGER NOT NULL DEFAULT 0, owner_id TEXT,
    players INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS servers_world ON servers (world, private, updated)',
  'CREATE TABLE IF NOT EXISTS presence (user_id TEXT PRIMARY KEY, world TEXT NOT NULL, code TEXT NOT NULL, at INTEGER NOT NULL)',
  `CREATE TABLE IF NOT EXISTS chat_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, reporter TEXT NOT NULL, reporter_name TEXT NOT NULL,
    target_id TEXT NOT NULL, target TEXT NOT NULL, room TEXT NOT NULL, reason TEXT NOT NULL, messages TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open', at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS chat_reports_open ON chat_reports (status, at)',
  'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  ...ECON_SCHEMA,
];
// columns added after the first version
const COLUMNS = [
  'ALTER TABLE games ADD COLUMN user_id TEXT',
  "ALTER TABLE games ADD COLUMN kind TEXT NOT NULL DEFAULT '2d'",
  "ALTER TABLE games ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'",
  'ALTER TABLE games ADD COLUMN reward INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE games ADD COLUMN project_id TEXT',
  'ALTER TABLE games ADD COLUMN thumb TEXT',
  "ALTER TABLE users ADD COLUMN look TEXT NOT NULL DEFAULT '{}'",
  'ALTER TABLE users ADD COLUMN econ INTEGER NOT NULL DEFAULT 0',
];

// Tables are created automatically the first time the Worker runs.
let ready = null;
function ensureSchema(db) {
  if (!ready) {
    ready = (async () => {
      await db.batch(SCHEMA.map((s) => db.prepare(s)));
      for (const c of COLUMNS) { try { await db.prepare(c).run(); } catch (e) { /* already there */ } }
      await db.batch([
        db.prepare('CREATE INDEX IF NOT EXISTS games_user ON games (user_id, created_at)'),
        db.prepare('CREATE INDEX IF NOT EXISTS games_list ON games (kind, visibility, hidden, created_at DESC)'),
        ...seedStock(db),
      ]);
    })().catch((e) => { ready = null; throw e; });
    ready.then(() => { ready = Promise.resolve(); }, () => {});
  }
  return ready;
}

// The key that signs room tickets: SALT, or (if SALT was never set) a random key saved in the database.
let secretCache = null;
async function roomSecret(env) {
  if (env.SALT) return env.SALT;
  if (secretCache) return secretCache;
  await ensureSchema(env.DB);
  await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('room_key', ?)").bind(randomId(40)).run();
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'room_key'").first();
  secretCache = r.value;
  return secretCache;
}
async function getSetting(db, key) { const r = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first(); return r ? r.value : ''; }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (url.pathname === '/api/room') return await connectRoom(request, env, url);
      return await handle(request, env, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Something went wrong on the server. Try again in a bit.' }, 500);
    }
  },
};

async function handle(request, env, url) {
  const path = url.pathname.slice(4); // strip "/api"
  const method = request.method;
  if (path === '/health') return json({ ok: true, db: !!env.DB, accounts: true, rooms: !!env.ROOMS });
  if (!env.DB) fail(503, 'The database is not connected yet. Check the D1 binding named DB.');
  await ensureSchema(env.DB);
  const db = env.DB;
  const ctx = { db, env, request, url, ip: await visitorId(request, env), user: await sessionUser(db, request, env) };
  let m;

  // accounts
  if (path === '/auth/signup' && method === 'POST') return signup(ctx, await body(request));
  if (path === '/auth/login' && method === 'POST') return login(ctx, await body(request));
  if (path === '/auth/recover' && method === 'POST') return recover(ctx, await body(request));
  if (path === '/auth/logout' && method === 'POST') return logout(ctx);
  if (path === '/me' && method === 'GET') return me(ctx);
  if (path === '/me' && method === 'DELETE') return deleteMe(ctx);
  if (path === '/me/progress' && method === 'PUT') return saveProgress(ctx, await body(request));
  if (path === '/me/games' && method === 'GET') return myGames(ctx);

  // coins, shop, trades, rewards
  const e = await econRoute(ctx, path, method);
  if (e) return e;

  // players
  if (path === '/users' && method === 'GET') return findUsers(ctx);
  if ((m = path.match(/^\/users\/([A-Za-z0-9_]{3,16})$/)) && method === 'GET') return profile(ctx, m[1]);

  // published levels and worlds
  if (path === '/games' && method === 'GET') return listGames(ctx);
  if (path === '/games' && method === 'POST') return publish(ctx, await body(request));
  if ((m = path.match(/^\/games\/([A-Za-z0-9]{8})$/))) {
    if (method === 'GET') return getGame(ctx, m[1]);
    if (method === 'PUT') return updateGame(ctx, m[1], await body(request));
    if (method === 'DELETE') return deleteGame(ctx, m[1]);
  }
  if ((m = path.match(/^\/games\/([A-Za-z0-9]{8})\/(play|like|report)$/)) && method === 'POST') return gameAction(ctx, m[1], m[2]);

  // projects (building, alone or together)
  if (path === '/projects' && method === 'GET') return listProjects(ctx);
  if (path === '/projects' && method === 'POST') return newProject(ctx, await body(request));
  if ((m = path.match(/^\/projects\/([A-Za-z0-9]{10})$/))) {
    if (method === 'GET') return getProject(ctx, m[1]);
    if (method === 'PUT') return saveProject(ctx, m[1], await body(request));
    if (method === 'DELETE') return deleteProject(ctx, m[1]);
  }
  if ((m = path.match(/^\/projects\/([A-Za-z0-9]{10})\/collab$/)) && method === 'POST') return collab(ctx, m[1], await body(request));

  // multiplayer
  if (path === '/online' && method === 'GET') return online(ctx);
  if (path === '/servers' && method === 'GET') return listServers(ctx);
  if (path === '/servers' && method === 'POST') return privateServer(ctx, await body(request));
  if (path === '/rooms/join' && method === 'POST') return joinPlay(ctx, await body(request));
  if (path === '/rooms/edit' && method === 'POST') return joinEdit(ctx, await body(request));

  // daily challenge
  if (path === '/daily' && method === 'GET') return getDaily(ctx);
  if (path === '/daily' && method === 'POST') return postDaily(ctx, await body(request));

  if (path.startsWith('/admin/')) return admin(ctx, path.slice(6), method);
  fail(404, 'Unknown address.');
}

/* ---------------- helpers ---------------- */
// An anonymous ID per visitor (a scrambled IP address), used only to stop spam.
async function visitorId(request, env) {
  return (await sha256((request.headers.get('CF-Connecting-IP') || 'local') + '|' + (env.SALT || 'blockyard'))).slice(0, 32);
}
async function hashPassword(password, salt, env) {
  const key = await crypto.subtle.importKey('raw', enc(password + '|' + (env.SALT || '')), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc(salt), iterations: 10000 }, key, 256));
}
function sameText(a, b) {
  const x = enc(a), y = enc(b);
  return x.length === y.length && crypto.subtle.timingSafeEqual(x, y);
}
async function countEvents(db, kind, who, since) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM events WHERE kind = ? AND who = ? AND at > ?').bind(kind, who, since).first();
  return r.n;
}
async function addEvent(db, kind, who) {
  const now = Date.now();
  await db.batch([
    db.prepare('INSERT INTO events (kind, who, at) VALUES (?, ?, ?)').bind(kind, who, now),
    db.prepare('DELETE FROM events WHERE at < ?').bind(now - 2 * DAY),
  ]);
}
const lookOf = (text) => { try { const l = JSON.parse(text || '{}'); return { color: /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : DEFAULT_LOOK.color, hat: String(l.hat || 'none').slice(0, 20), trail: String(l.trail || 'none').slice(0, 20) }; } catch (e) { return { ...DEFAULT_LOOK }; } };

/* ---------------- accounts ---------------- */
async function sessionUser(db, request, env) {
  const auth = request.headers.get('authorization') || '';
  let token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '', viaCookie = false;
  if (!token) { token = readCookie(request); viaCookie = !!token; }
  if (!token || token.length > 100) return null;
  const hash = await sha256(token);
  const row = await db.prepare(`SELECT u.id, u.name, u.banned, s.expires FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires > ?`).bind(hash, Date.now()).first();
  if (!row || row.banned) return null;
  // logins you keep using never run out
  if (row.expires - Date.now() < (SESSION_DAYS - 30) * DAY) await db.prepare('UPDATE sessions SET expires = ? WHERE token_hash = ?').bind(Date.now() + SESSION_DAYS * DAY, hash).run();
  return { id: row.id, name: row.name, token, viaCookie, admin: isAdmin(env, row) };
}
// "Keep me logged in": the login also goes in a cookie. Otherwise only this tab remembers it.
const remember = (resp, input, token) => (input && input.remember === false ? resp : withCookie(resp, token, SESSION_DAYS));
async function newSession(db, userId) {
  const token = randomId(40);
  await db.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)').bind(await sha256(token), userId, Date.now() + SESSION_DAYS * DAY).run();
  return token;
}
function checkName(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_]{3,16}$/.test(name)) fail(400, 'Usernames are 3 to 16 letters, numbers or _ (no spaces).');
  if (isRude(name)) fail(400, 'Pick a different username. That one has a blocked word in it.');
}
function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 6 || pw.length > 72) fail(400, 'Passwords need 6 to 72 characters.');
}
async function account(ctx, u, extra = {}) {
  const { db, env } = ctx;
  if (!u.econ) await migrateUser(db, u.id, u.progress);
  return { ...extra, user: { id: u.id, name: u.name, admin: isAdmin(env, u) }, progress: JSON.parse(u.progress || '{}'), ...(await accountExtras(db, u.id)) };
}
async function signup(ctx, input) {
  const { db, env, ip } = ctx;
  checkName(input.name); checkPassword(input.password);
  if (await countEvents(db, 'signup', ip, Date.now() - DAY) >= LIMITS_PER.signupsDay) fail(429, 'Too many new accounts from here today. Try again tomorrow.');
  const taken = await db.prepare('SELECT id FROM users WHERE name_lower = ?').bind(input.name.toLowerCase()).first();
  if (taken) fail(409, 'That username is taken. Try another one.');
  const id = randomId(12), salt = randomId(16), recovery = randomId(4) + '-' + randomId(4) + '-' + randomId(4);
  let progress = '{}';
  if (input.progress && typeof input.progress === 'object') {
    // guest progress comes along (stars on the map, stats), but coins only come from checked runs
    const p = { ...input.progress, coins: 0, owned: [] };
    const t = JSON.stringify(p); if (t.length < 64000) progress = t;
  }
  const look = input.progress && input.progress.equip ? JSON.stringify(cleanLook(input.progress.equip, {})) : '{}';
  await db.prepare('INSERT INTO users (id, name, name_lower, pw_hash, pw_salt, rec_hash, progress, created_at, look, econ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)')
    .bind(id, input.name, input.name.toLowerCase(), await hashPassword(input.password, salt, env), salt, await sha256(recovery.toUpperCase() + (env.SALT || '')), progress, Date.now(), look).run();
  await addEvent(db, 'signup', ip);
  const token = await newSession(db, id);
  return remember(json(await account(ctx, { id, name: input.name, progress, econ: 1 }, { token, recovery }), 201), input, token);
}
async function tooManyFails(ctx) {
  if (await countEvents(ctx.db, 'fail', ctx.ip, Date.now() - 15 * 60e3) >= LIMITS_PER.loginFails) fail(429, 'Too many wrong tries. Wait 15 minutes and try again.');
}
async function login(ctx, input) {
  const { db, env, ip } = ctx;
  await tooManyFails(ctx);
  const u = await db.prepare('SELECT * FROM users WHERE name_lower = ?').bind(String(input.name || '').toLowerCase()).first();
  if (!u || !sameText(u.pw_hash, await hashPassword(String(input.password || ''), u.pw_salt, env))) {
    await addEvent(db, 'fail', ip);
    fail(401, 'Wrong username or password.');
  }
  if (u.banned) fail(403, 'This account is banned.');
  const token = await newSession(db, u.id);
  return remember(json(await account(ctx, u, { token })), input, token);
}
async function recover(ctx, input) {
  const { db, env, ip } = ctx;
  await tooManyFails(ctx);
  checkPassword(input.password);
  const u = await db.prepare('SELECT * FROM users WHERE name_lower = ?').bind(String(input.name || '').toLowerCase()).first();
  const code = String(input.recovery || '').trim().toUpperCase();
  if (!u || !sameText(u.rec_hash, await sha256(code + (env.SALT || '')))) {
    await addEvent(db, 'fail', ip);
    fail(401, "That username and recovery code don't match.");
  }
  if (u.banned) fail(403, 'This account is banned.');
  const salt = randomId(16), recovery = randomId(4) + '-' + randomId(4) + '-' + randomId(4);
  await db.batch([
    db.prepare('UPDATE users SET pw_hash = ?, pw_salt = ?, rec_hash = ? WHERE id = ?').bind(await hashPassword(input.password, salt, env), salt, await sha256(recovery.toUpperCase() + (env.SALT || '')), u.id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
  ]);
  const token = await newSession(db, u.id);
  return remember(json(await account(ctx, u, { token, recovery })), input, token);
}
async function logout(ctx) {
  if (ctx.user) await ctx.db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(ctx.user.token)).run();
  // only clear the cookie if it belongs to the account that's logging out
  const c = readCookie(ctx.request);
  return !c || !ctx.user || c === ctx.user.token ? withCookie(json({ ok: true }), '', 0) : json({ ok: true });
}
async function me(ctx) {
  const user = needUser(ctx);
  const u = await ctx.db.prepare('SELECT id, name, progress, econ FROM users WHERE id = ?').bind(user.id).first();
  // logged in by cookie only: hand the page its login back. Switching accounts: move the cookie too.
  const out = json(await account(ctx, u, user.viaCookie ? { token: user.token } : {}));
  if (!user.viaCookie && ctx.request.headers.get('x-remember') === '1' && readCookie(ctx.request) !== user.token) return withCookie(out, user.token, SESSION_DAYS);
  return out;
}
async function saveProgress(ctx, input) {
  const user = needUser(ctx);
  if (!input.progress || typeof input.progress !== 'object' || Array.isArray(input.progress)) fail(400, 'Progress data is broken.');
  const text = JSON.stringify(input.progress);
  if (text.length > 64000) fail(413, 'Progress data is too big.');
  await ctx.db.prepare('UPDATE users SET progress = ? WHERE id = ?').bind(text, user.id).run();
  return json({ ok: true });
}
async function deleteMe(ctx) {
  const user = needUser(ctx);
  const { db } = ctx;
  const mineG = 'SELECT id FROM games WHERE user_id = ?';
  await db.batch([
    ...['likes', 'plays', 'reports'].map((t) => db.prepare(`DELETE FROM ${t} WHERE game_id IN (${mineG})`).bind(user.id)),
    db.prepare(`UPDATE projects SET game_id = NULL WHERE game_id IN (${mineG})`).bind(user.id),
    db.prepare('DELETE FROM games WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM collabs WHERE project_id IN (SELECT id FROM projects WHERE owner_id = ?)').bind(user.id),
    db.prepare('DELETE FROM projects WHERE owner_id = ?').bind(user.id),
    ...['sessions', 'daily', 'wallets', 'inventory', 'level_progress', 'claims', 'collabs', 'presence'].map((t) => db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(user.id)),
    db.prepare("UPDATE trades SET status = 'cancelled' WHERE status = 'open' AND (from_id = ? OR to_id = ?)").bind(user.id, user.id),
    db.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  return withCookie(json({ ok: true }), '', 0);
}

/* ---------------- players ---------------- */
async function findUsers(ctx) {
  needUser(ctx);
  const q = (ctx.url.searchParams.get('q') || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16);
  if (!q) return json({ users: [] });
  const { results } = await ctx.db.prepare('SELECT name, look FROM users WHERE name_lower LIKE ? AND banned = 0 ORDER BY name_lower LIMIT 10').bind(q + '%').all();
  return json({ users: results.map((u) => ({ name: u.name, look: lookOf(u.look) })) });
}
async function profile(ctx, name) {
  const { db } = ctx;
  const u = await db.prepare('SELECT id, name, created_at, banned FROM users WHERE name_lower = ?').bind(name.toLowerCase()).first();
  if (!u || u.banned) fail(404, 'No player with that name.');
  const [items, games, here] = await Promise.all([
    publicItems(db, u.id),
    db.prepare("SELECT * FROM games WHERE user_id = ? AND hidden = 0 AND visibility = 'public' ORDER BY created_at DESC LIMIT 24").bind(u.id).all(),
    db.prepare('SELECT p.world, p.code, s.private FROM presence p JOIN servers s ON s.code = p.code WHERE p.user_id = ? AND p.at > ?').bind(u.id, Date.now() - 6 * 3600e3).first(),
  ]);
  let playing = null;
  if (here) {
    const pub = builtinWorld(here.world) || (await db.prepare("SELECT 1 FROM games WHERE id = ? AND visibility = 'public' AND hidden = 0").bind(here.world).first());
    playing = pub ? { world: here.world, code: here.private ? null : here.code, name: worldName(here.world) } : { world: null, code: null, name: null };
  }
  return json({ name: u.name, since: u.created_at, ...items, games: games.results.map(row), playing });
}
const worldName = (id) => { const b = builtinWorld(id); return b ? b.name : null; };

/* ---------------- levels and worlds ---------------- */
function checkLevel(input) {
  let level;
  try { level = normalizeLevel(input.level); } catch (e) { fail(400, e.message); }
  return level;
}
async function checkFields(ctx, input) {
  const { env } = ctx;
  const kind = input.kind === '3d' ? '3d' : '2d';
  const desc = cleanText(input.desc, LIMITS.desc);
  const visibility = VIS.includes(input.visibility) ? input.visibility : 'public';
  if (kind === '2d') {
    const level = checkLevel(input);
    if (isRude(level.n) || isRude(desc)) fail(400, 'Something in the name or description has a blocked word.');
    // The creator has to have beaten it: replay their run and see if it reaches the goal.
    const run = await verify(env, { type: '2d', level, replay: String(input.replay || ''), opts: { maxSteps: maxSteps(env) } });
    if (!run.won) fail(400, "Your recorded run didn't reach the goal. Beat your level in Test, then publish right away.");
    return { kind, desc, visibility, name: level.n, style: level.style, theme: level.theme, w: level.w, h: level.h, data: toWire(level) };
  }
  // the heavy part (checking every block, replaying the run) happens in a Durable Object
  const w = await verify(env, { type: 'publish3d', world: input.world, replay: String(input.replay || ''), opts: { maxSteps: maxSteps3d(env) } });
  if (isRude(w.world.n) || isRude(desc)) fail(400, 'Something in the name or description has a blocked word.');
  if (w.world.mode === 'obby' && !(w.run && w.run.won)) fail(400, "Your recorded run didn't reach the goal. Beat your obby in Test, then publish right away.");
  return { kind, desc, visibility, name: w.world.n, style: w.world.mode, theme: w.world.sky, w: w.blocks, h: w.coins, data: w.world, thumb: w.thumb };
}
function row(g) {
  return {
    id: g.id, kind: g.kind || '2d', name: g.name, creator: g.creator, descr: g.descr, style: g.style, theme: g.theme, plays: g.plays, likes: g.likes,
    created_at: g.created_at, visibility: g.visibility || 'public', reward: g.reward || 0, level: (g.kind || '2d') === '2d' ? JSON.parse(g.data) : undefined,
    world: g.kind === '3d' && g.withWorld ? JSON.parse(g.data) : undefined, blocks: g.kind === '3d' ? g.w : undefined,
    coins: g.kind === '3d' ? g.h : undefined, thumb: g.kind === '3d' ? g.thumb || '' : undefined,
  };
}
async function listGames(ctx) {
  const { db, url } = ctx;
  const kind = url.searchParams.get('kind') === '3d' ? '3d' : '2d';
  const sort = { new: 'created_at DESC', top: 'plays DESC, created_at DESC', liked: 'likes DESC, created_at DESC', reward: 'reward DESC, plays DESC' }[url.searchParams.get('sort')] || 'created_at DESC';
  const style = url.searchParams.get('style');
  const q = (url.searchParams.get('q') || '').trim().slice(0, 40);
  const creator = (url.searchParams.get('creator') || '').trim().slice(0, 20);
  const page = Math.max(0, Math.min(200, parseInt(url.searchParams.get('page') || '0', 10) || 0));
  const where = ['hidden = 0', "visibility = 'public'", 'kind = ?'], args = [kind];
  if (['rush', 'adventure', 'obby', 'hangout'].includes(style)) { where.push('style = ?'); args.push(style); }
  if (url.searchParams.get('rewarding') === '1') where.push('reward > 0');
  if (creator) { where.push('creator = ? COLLATE NOCASE'); args.push(creator); }
  if (q) {
    const like = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    where.push("(name LIKE ? ESCAPE '\\' OR creator LIKE ? ESCAPE '\\')"); args.push(like, like);
  }
  const cols = kind === '3d' ? 'id, kind, name, creator, descr, style, theme, plays, likes, created_at, visibility, reward, w, h, thumb' : '*';
  const { results } = await db.prepare(`SELECT ${cols} FROM games WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT ? OFFSET ?`).bind(...args, PAGE + 1, page * PAGE).all();
  return json({ games: results.slice(0, PAGE).map(row), more: results.length > PAGE });
}
async function myGames(ctx) {
  const user = needUser(ctx);
  const { results } = await ctx.db.prepare('SELECT * FROM games WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').bind(user.id).all();
  return json({ games: results.map((g) => ({ ...row({ ...g, withWorld: false }), hidden: !!g.hidden, project: g.project_id })) });
}
async function canSeeGame(ctx, g) {
  if ((g.visibility || 'public') !== 'private') return true;
  const u = ctx.user;
  if (!u) return false;
  if (u.admin || g.user_id === u.id) return true;
  if (!g.project_id) return false;
  return !!(await projectAccess(ctx.db, g.project_id, u));
}
async function getGame(ctx, id) {
  const g = await ctx.db.prepare('SELECT * FROM games WHERE id = ? AND hidden = 0').bind(id).first();
  if (!g || !(await canSeeGame(ctx, g))) fail(404, 'That game was not found. It may have been removed, or it is private.');
  return json({ game: row({ ...g, withWorld: true }) });
}
async function publish(ctx, input) {
  const user = needUser(ctx);
  const { db, ip } = ctx;
  const now = Date.now();
  const hour = await db.prepare('SELECT COUNT(*) AS n FROM games WHERE user_id = ? AND created_at > ?').bind(user.id, now - 3600e3).first();
  if (hour.n >= LIMITS_PER.publishHour) fail(429, `You can publish ${LIMITS_PER.publishHour} games an hour. Take a break and try again later.`);
  const day = await db.prepare('SELECT COUNT(*) AS n FROM games WHERE user_id = ? AND created_at > ?').bind(user.id, now - DAY).first();
  if (day.n >= LIMITS_PER.publishDay) fail(429, `You can publish ${LIMITS_PER.publishDay} games a day. Try again tomorrow.`);
  const f = await checkFields(ctx, input);
  let project = null;
  if (input.project) { const p = await projectAccess(db, String(input.project), user); if (p) project = p.row.id; }
  const id = randomId(8);
  const stmts = [db.prepare(`INSERT INTO games (id, name, creator, descr, style, theme, w, h, data, edit_hash, creator_hash, user_id, created_at, updated_at, kind, visibility, project_id, thumb)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, f.name, user.name, f.desc, f.style, f.theme, f.w, f.h, JSON.stringify(f.data), ip, user.id, now, now, f.kind, f.visibility, project, f.thumb || null)];
  if (project) stmts.push(db.prepare('UPDATE projects SET game_id = ? WHERE id = ?').bind(id, project));
  await db.batch(stmts);
  return json({ id }, 201);
}
// Who can change a published game: whoever published it, an admin, a collaborator on its project,
// or (for levels from before accounts) the browser with the secret edit key.
async function ownGame(ctx, id) {
  const g = await ctx.db.prepare('SELECT id, user_id, edit_hash, project_id, kind FROM games WHERE id = ?').bind(id).first();
  if (!g) fail(404, 'That game was not found. It may have been removed.');
  if (ctx.user && (g.user_id === ctx.user.id || ctx.user.admin)) return g;
  if (ctx.user && g.project_id && await projectAccess(ctx.db, g.project_id, ctx.user)) return g;
  const key = ctx.request.headers.get('x-edit-key');
  if (key && g.edit_hash && g.edit_hash === await sha256(key)) return g;
  fail(403, 'You can only change games you published.');
}
async function updateGame(ctx, id, input) {
  const g = await ownGame(ctx, id);
  if (input.only === 'visibility') {
    if (!VIS.includes(input.visibility)) fail(400, 'Pick public, unlisted or private.');
    await ctx.db.prepare('UPDATE games SET visibility = ? WHERE id = ?').bind(input.visibility, id).run();
    return json({ ok: true, id });
  }
  const f = await checkFields(ctx, { ...input, kind: g.kind || '2d' });
  // a changed game has to be checked by an admin again before it pays coins
  const old = await ctx.db.prepare('SELECT data, reward FROM games WHERE id = ?').bind(id).first();
  const reward = old && old.data === JSON.stringify(f.data) ? old.reward : 0;
  await ctx.db.prepare('UPDATE games SET name = ?, descr = ?, style = ?, theme = ?, w = ?, h = ?, data = ?, visibility = ?, thumb = ?, reward = ?, updated_at = ? WHERE id = ?')
    .bind(f.name, f.desc, f.style, f.theme, f.w, f.h, JSON.stringify(f.data), f.visibility, f.thumb || null, reward, Date.now(), id).run();
  return json({ ok: true, id });
}
async function deleteGame(ctx, id) {
  await ownGame(ctx, id);
  await removeGame(ctx.db, id);
  return json({ ok: true });
}
function removeGame(db, id) {
  return db.batch([
    ...['games WHERE id', 'likes WHERE game_id', 'plays WHERE game_id', 'reports WHERE game_id'].map((t) => db.prepare(`DELETE FROM ${t} = ?`).bind(id)),
    db.prepare('UPDATE projects SET game_id = NULL WHERE game_id = ?').bind(id),
  ]);
}
async function gameAction(ctx, id, action) {
  const { db } = ctx;
  const game = await db.prepare('SELECT id, visibility, user_id, project_id FROM games WHERE id = ? AND hidden = 0').bind(id).first();
  if (!game || !(await canSeeGame(ctx, game))) fail(404, 'That game was not found. It may have been removed.');
  if (action === 'play') {
    const r = await db.prepare('INSERT OR IGNORE INTO plays (game_id, who, at) VALUES (?, ?, ?)').bind(id, ctx.ip, Date.now()).run();
    if (r.meta.changes) await db.prepare('UPDATE games SET plays = plays + 1 WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  const user = needUser(ctx);
  const who = 'u:' + user.id;
  if (action === 'like') {
    const r = await db.prepare('INSERT OR IGNORE INTO likes (game_id, who) VALUES (?, ?)').bind(id, who).run();
    if (r.meta.changes) await db.prepare('UPDATE games SET likes = likes + 1 WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  const input = await body(ctx.request);
  const reason = ['rude', 'personal', 'broken', 'copied', 'other'].includes(input.reason) ? input.reason : 'other';
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM reports WHERE who = ? AND at > ?').bind(who, Date.now() - DAY).first();
  if (recent.n >= LIMITS_PER.reportsDay) fail(429, 'You have sent a lot of reports today. Try again tomorrow.');
  const r = await db.prepare('INSERT OR IGNORE INTO reports (game_id, who, reason, at) VALUES (?, ?, ?, ?)').bind(id, who, reason, Date.now()).run();
  if (r.meta.changes) {
    await db.prepare(`UPDATE games SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= ${HIDE_AFTER_REPORTS} THEN 1 ELSE hidden END WHERE id = ?`).bind(id).run();
  }
  return json({ ok: true });
}

/* ---------------- projects ---------------- */
// Returns { row, role } when this player may open the project, otherwise null.
async function projectAccess(db, id, user) {
  if (!user) return null;
  const row = await db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  if (!row) return null;
  if (row.owner_id === user.id) return { row, role: 'owner' };
  const c = await db.prepare('SELECT 1 FROM collabs WHERE project_id = ? AND user_id = ?').bind(id, user.id).first();
  if (c) return { row, role: 'collab' };
  if (user.admin) return { row, role: 'admin' };
  return null;
}
function projectData(kind, data) {
  if (!data || typeof data !== 'object') fail(400, 'Project data is broken.');
  const text = JSON.stringify(data);
  if (text.length > 400000) fail(413, 'That project is too big.');
  if (kind === '2d') {
    const w = data.w | 0, h = data.h | 0;
    if (w < 16 || w > 400 || h < 10 || h > 40 || typeof data.d !== 'string' || data.d.length !== w * h) fail(400, 'Level data is broken.');
  } else if (typeof data.b !== 'string') fail(400, 'World data is broken.');
  return text;
}
async function listProjects(ctx) {
  const user = needUser(ctx);
  const { db } = ctx;
  const [mine, shared] = await Promise.all([
    db.prepare(`SELECT p.id, p.kind, p.name, p.game_id, p.updated_at, (SELECT COUNT(*) FROM collabs c WHERE c.project_id = p.id) AS friends
      FROM projects p WHERE p.owner_id = ? ORDER BY p.updated_at DESC LIMIT 100`).bind(user.id).all(),
    db.prepare(`SELECT p.id, p.kind, p.name, p.game_id, p.updated_at, u.name AS owner FROM collabs c JOIN projects p ON p.id = c.project_id
      JOIN users u ON u.id = p.owner_id WHERE c.user_id = ? ORDER BY p.updated_at DESC LIMIT 100`).bind(user.id).all(),
  ]);
  return json({ mine: mine.results, shared: shared.results });
}
async function newProject(ctx, input) {
  const user = needUser(ctx);
  const { db } = ctx;
  const kind = input.kind === '3d' ? '3d' : '2d';
  const n = await db.prepare('SELECT COUNT(*) AS n FROM projects WHERE owner_id = ?').bind(user.id).first();
  if (n.n >= LIMITS_PER.projects) fail(429, `You can keep ${LIMITS_PER.projects} projects. Delete an old one first.`);
  const text = projectData(kind, input.data);
  const name = cleanText(input.name || (input.data && input.data.n), 40) || (kind === '3d' ? 'My world' : 'My level');
  const id = randomId(10), now = Date.now();
  await db.prepare('INSERT INTO projects (id, owner_id, kind, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, user.id, kind, name, text, now, now).run();
  return json({ project: { id, kind, name, owner: user.name, role: 'owner', data: JSON.parse(text), collaborators: [], updated_at: now } }, 201);
}
async function getProject(ctx, id) {
  const user = needUser(ctx);
  const a = await projectAccess(ctx.db, id, user);
  if (!a) fail(404, 'That project was not found, or it is not shared with you.');
  const [owner, c] = await Promise.all([
    ctx.db.prepare('SELECT name FROM users WHERE id = ?').bind(a.row.owner_id).first(),
    ctx.db.prepare('SELECT u.name FROM collabs c JOIN users u ON u.id = c.user_id WHERE c.project_id = ? ORDER BY u.name_lower').bind(id).all(),
  ]);
  const r = a.row;
  return json({ project: { id: r.id, kind: r.kind, name: r.name, data: JSON.parse(r.data), game: r.game_id, owner: owner ? owner.name : '?', role: a.role, collaborators: c.results.map((x) => x.name), updated_at: r.updated_at } });
}
async function saveProject(ctx, id, input) {
  const user = needUser(ctx);
  const a = await projectAccess(ctx.db, id, user);
  if (!a) fail(404, 'That project was not found, or it is not shared with you.');
  const text = input.data ? projectData(a.row.kind, input.data) : a.row.data;
  const name = cleanText(input.name || (input.data && input.data.n), 40) || a.row.name;
  await ctx.db.prepare('UPDATE projects SET data = ?, name = ?, updated_at = ? WHERE id = ?').bind(text, name, Date.now(), id).run();
  return json({ ok: true });
}
async function deleteProject(ctx, id) {
  const user = needUser(ctx);
  const a = await projectAccess(ctx.db, id, user);
  if (!a || (a.role !== 'owner' && a.role !== 'admin')) fail(403, 'Only the owner can delete a project.');
  await ctx.db.batch([ctx.db.prepare('DELETE FROM collabs WHERE project_id = ?').bind(id), ctx.db.prepare('DELETE FROM projects WHERE id = ?').bind(id)]);
  return json({ ok: true });
}
async function collab(ctx, id, input) {
  const user = needUser(ctx);
  const { db } = ctx;
  const a = await projectAccess(db, id, user);
  if (!a) fail(404, 'That project was not found.');
  if (input.action === 'leave') {
    await db.prepare('DELETE FROM collabs WHERE project_id = ? AND user_id = ?').bind(id, user.id).run();
    return json({ ok: true });
  }
  if (a.role !== 'owner') fail(403, 'Only the owner can change who builds here.');
  const u = await db.prepare('SELECT id, name, banned FROM users WHERE name_lower = ?').bind(String(input.name || '').toLowerCase()).first();
  if (!u || u.banned) fail(404, 'No player with that name.');
  if (u.id === user.id) fail(400, "You're the owner already.");
  if (input.action === 'add') {
    const n = await db.prepare('SELECT COUNT(*) AS n FROM collabs WHERE project_id = ?').bind(id).first();
    if (n.n >= LIMITS_PER.collaborators) fail(429, `Up to ${LIMITS_PER.collaborators} friends can build on one project.`);
    await db.prepare('INSERT OR IGNORE INTO collabs (project_id, user_id) VALUES (?, ?)').bind(id, u.id).run();
  } else if (input.action === 'remove') {
    await db.prepare('DELETE FROM collabs WHERE project_id = ? AND user_id = ?').bind(id, u.id).run();
    if (ctx.env.ROOMS) await ctx.env.ROOMS.get(ctx.env.ROOMS.idFromName('e:' + id)).fetch(`https://room/kick?uid=${u.id}&why=${encodeURIComponent('The owner removed you from this project.')}`).catch(() => {});
  } else fail(400, 'Unknown action.');
  const c = await db.prepare('SELECT u.name FROM collabs c JOIN users u ON u.id = c.user_id WHERE c.project_id = ? ORDER BY u.name_lower').bind(id).all();
  return json({ collaborators: c.results.map((x) => x.name) });
}

/* ---------------- multiplayer ---------------- */
// Is this a world people can join? Built-in ids, or a published 3D game.
async function worldInfo(ctx, id) {
  const b = builtinWorld(id);
  if (b) return { id, name: b.name, mode: b.mode, builtin: true };
  if (!/^[A-Za-z0-9]{8}$/.test(id)) fail(404, 'That world was not found.');
  const g = await ctx.db.prepare("SELECT id, name, style, visibility, user_id, project_id FROM games WHERE id = ? AND kind = '3d' AND hidden = 0").bind(id).first();
  if (!g || !(await canSeeGame(ctx, g))) fail(404, 'That world was not found. It may have been removed, or it is private.');
  return { id, name: g.name, mode: g.style, builtin: false };
}
const FRESH = 10 * 60e3;
async function online(ctx) {
  const { results } = await ctx.db.prepare(`SELECT s.world, SUM(s.players) AS n, MAX(g.visibility) AS visibility FROM servers s LEFT JOIN games g ON g.id = s.world
    WHERE s.updated > ? AND s.players > 0 GROUP BY s.world`).bind(Date.now() - FRESH).all();
  const worlds = {};
  let total = 0;
  for (const r of results) { total += r.n; if (builtinWorld(r.world) || r.visibility === 'public') worlds[r.world] = r.n; }
  return json({ worlds, total, announce: await getSetting(ctx.db, 'announce') });
}
async function listServers(ctx) {
  const world = String(ctx.url.searchParams.get('world') || '');
  await worldInfo(ctx, world);
  const { results } = await ctx.db.prepare('SELECT code, players FROM servers WHERE world = ? AND private = 0 AND updated > ? AND players > 0 ORDER BY players DESC LIMIT 30').bind(world, Date.now() - FRESH).all();
  let mine = [];
  if (ctx.user) mine = (await ctx.db.prepare('SELECT code, players FROM servers WHERE world = ? AND private = 1 AND owner_id = ? ORDER BY created_at DESC').bind(world, ctx.user.id).all()).results;
  return json({ servers: results, mine, size: ROOM_SIZE });
}
async function privateServer(ctx, input) {
  const user = needUser(ctx);
  const w = await worldInfo(ctx, String(input.world || ''));
  const n = await ctx.db.prepare('SELECT COUNT(*) AS n FROM servers WHERE owner_id = ? AND private = 1').bind(user.id).first();
  if (n.n >= LIMITS_PER.privateServers) {
    // recycle the oldest one
    await ctx.db.prepare('DELETE FROM servers WHERE code = (SELECT code FROM servers WHERE owner_id = ? AND private = 1 ORDER BY created_at ASC LIMIT 1)').bind(user.id).run();
  }
  const code = randomId(8), now = Date.now();
  await ctx.db.prepare('INSERT INTO servers (code, world, private, owner_id, players, updated, created_at) VALUES (?, ?, 1, ?, 0, ?, ?)').bind(code, w.id, user.id, now, now).run();
  return json({ code, world: w.id }, 201);
}
async function joinPlay(ctx, input) {
  const user = needUser(ctx);
  const { db, env } = ctx;
  if (!env.ROOMS) fail(503, 'Multiplayer is off. The Durable Object binding named ROOMS is missing from wrangler.jsonc.');
  let code = input.code ? String(input.code).trim() : '', world, priv = false;
  const now = Date.now();
  if (code) {
    const s = await db.prepare('SELECT code, world, private FROM servers WHERE code = ?').bind(code).first();
    if (!s) fail(404, "That server code doesn't work. It may have been closed.");
    world = await worldInfo(ctx, s.world); priv = !!s.private;
  } else {
    world = await worldInfo(ctx, String(input.world || ''));
    const s = await db.prepare('SELECT code FROM servers WHERE world = ? AND private = 0 AND players < ? AND updated > ? ORDER BY players DESC, created_at ASC LIMIT 1').bind(world.id, ROOM_SIZE, now - FRESH).first();
    if (s) code = s.code;
    else {
      code = randomId(8);
      await db.batch([
        db.prepare('INSERT INTO servers (code, world, private, players, updated, created_at) VALUES (?, ?, 0, 0, ?, ?)').bind(code, world.id, now, now),
        db.prepare('DELETE FROM servers WHERE private = 0 AND players = 0 AND updated < ?').bind(now - DAY),
      ]);
    }
  }
  await db.prepare('UPDATE servers SET updated = ? WHERE code = ?').bind(now, code).run();
  const u = await db.prepare('SELECT look FROM users WHERE id = ?').bind(user.id).first();
  const w = await getWallet(db, user.id);
  const look = cleanLook(lookOf(u && u.look), w.items);
  const ticket = await signTicket(await roomSecret(env), { k: 'play', r: 'p:' + code, u: user.id, n: user.name, l: look, a: user.admin, w: world.id, c: code, x: now + 20e3 });
  return json({ ticket, code, world, private: priv });
}
async function joinEdit(ctx, input) {
  const user = needUser(ctx);
  const { db, env } = ctx;
  if (!env.ROOMS) fail(503, 'Building together is off. The Durable Object binding named ROOMS is missing from wrangler.jsonc.');
  const a = await projectAccess(db, String(input.project || ''), user);
  if (!a) fail(404, 'That project was not found, or it is not shared with you.');
  const w = await getWallet(db, user.id);
  const ticket = await signTicket(await roomSecret(env), { k: 'edit', r: 'e:' + a.row.id, u: user.id, n: user.name, l: w.look, a: user.admin, p: a.row.id, x: Date.now() + 20e3 });
  return json({ ticket });
}
// The WebSocket itself. The ticket says who you are and which room, so no database is needed here.
async function connectRoom(request, env, url) {
  if (request.headers.get('Upgrade') !== 'websocket') fail(426, 'This address is for WebSockets.');
  if (!env.ROOMS) fail(503, 'Multiplayer is off.');
  if (!env.DB) fail(503, 'The database is not connected yet.');
  const p = await readTicket(await roomSecret(env), url.searchParams.get('t'));
  if (!p) fail(401, 'That ticket expired. Join again.');
  const headers = new Headers(request.headers);
  headers.set('x-room', JSON.stringify({ kind: p.k, room: p.r, uid: p.u, name: p.n, look: p.l, admin: !!p.a, world: p.w, code: p.c, project: p.p }));
  return env.ROOMS.get(env.ROOMS.idFromName(p.r)).fetch(new Request(request, { headers }));
}
async function kickEverywhere(env, db, uid, why) {
  if (!env.ROOMS) return;
  const { results } = await db.prepare('SELECT code FROM presence WHERE user_id = ?').bind(uid).all();
  await Promise.all(results.map((r) => env.ROOMS.get(env.ROOMS.idFromName('p:' + r.code)).fetch(`https://room/kick?uid=${uid}&why=${encodeURIComponent(why)}`).catch(() => {})));
}

/* ---------------- daily challenge ---------------- */
function validDate(d) {
  const ok = [todayUTC(new Date(Date.now() - DAY)), todayUTC(), todayUTC(new Date(Date.now() + DAY))];
  return ok.includes(d) ? d : null;
}
async function getDaily(ctx) {
  const { db, url, user } = ctx;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') || '') ? url.searchParams.get('date') : todayUTC();
  const { results } = await db.prepare(`SELECT d.progress, d.won, d.at, u.name, u.look FROM daily d JOIN users u ON u.id = d.user_id
    WHERE d.date = ? AND u.banned = 0 ORDER BY d.progress DESC, d.at ASC LIMIT 25`).bind(date).all();
  const top = results.map((r, i) => ({ rank: i + 1, name: r.name, progress: r.progress, won: !!r.won, ...lookOf(r.look) }));
  let mine = null;
  if (user) {
    const r = await db.prepare('SELECT progress, won, at FROM daily WHERE date = ? AND user_id = ?').bind(date, user.id).first();
    if (r) {
      const better = await db.prepare('SELECT COUNT(*) AS n FROM daily WHERE date = ? AND (progress > ? OR (progress = ? AND at < ?))').bind(date, r.progress, r.progress, r.at).first();
      mine = { rank: better.n + 1, progress: r.progress, won: !!r.won };
    }
  }
  const total = await db.prepare('SELECT COUNT(*) AS n FROM daily WHERE date = ?').bind(date).first();
  return json({ date, top, me: mine, players: total.n });
}
async function postDaily(ctx, input) {
  const user = needUser(ctx);
  const { db, env } = ctx;
  const date = validDate(String(input.date || ''));
  if (!date) fail(400, "That daily challenge isn't open anymore.");
  const run = await verify(env, { type: '2d', raw: true, level: dailyCourse(date), replay: String(input.replay || ''), opts: { maxSteps: maxSteps(env), stopOnDeath: true } });
  const progress = run.won ? 1 : Math.round(run.progress * 1000) / 1000;
  const before = await db.prepare('SELECT won FROM daily WHERE date = ? AND user_id = ?').bind(date, user.id).first();
  const stmts = [db.prepare(`INSERT INTO daily (date, user_id, progress, won, at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (date, user_id) DO UPDATE SET progress = excluded.progress, won = excluded.won, at = excluded.at WHERE excluded.progress > daily.progress`)
    .bind(date, user.id, progress, run.won ? 1 : 0, Date.now())];
  const earned = run.won && !(before && before.won) ? REWARD.dailyWin : 0;
  // the claim row makes sure two runs sent at the same moment can't both pay
  if (earned) stmts.push(db.prepare('INSERT INTO claims (user_id, what, at) VALUES (?, ?, ?)').bind(user.id, 'd:' + date, Date.now()), ...coinStmts(db, user.id, earned, 'run daily'));
  try { await db.batch(stmts); } catch (e) { if (isConstraint(e)) return json({ ok: true, progress, won: run.won, earned: 0 }); throw e; }
  return json({ ok: true, progress, won: run.won, earned, wallet: earned ? await getWallet(db, user.id) : undefined });
}

/* ---------------- admin ---------------- */
async function banUser(ctx, u) {
  const { db, env } = ctx;
  await db.batch([
    db.prepare('UPDATE users SET banned = 1 WHERE id = ?').bind(u.id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
    db.prepare('UPDATE games SET hidden = 1 WHERE user_id = ?').bind(u.id),
    db.prepare("UPDATE trades SET status = 'cancelled' WHERE status = 'open' AND (from_id = ? OR to_id = ?)").bind(u.id, u.id),
  ]);
  await kickEverywhere(env, db, u.id, 'This account was banned.');
}
async function admin(ctx, path, method) {
  const { db, env, user } = ctx;
  if (!env.ADMIN_USERNAME) fail(503, 'Admin is off. Add a variable called ADMIN_USERNAME with your username in the Worker settings.');
  if (!user || !user.admin) fail(403, 'Only admins can do that.');

  if (path === '/games' && method === 'GET') {
    const { results } = await db.prepare('SELECT * FROM games ORDER BY hidden DESC, reports DESC, created_at DESC LIMIT 100').all();
    const reasons = await db.prepare('SELECT game_id, reason, COUNT(*) AS n FROM reports GROUP BY game_id, reason').all();
    const byGame = {};
    for (const r of reasons.results) (byGame[r.game_id] ||= {})[r.reason] = r.n;
    return json({ games: results.map((g) => ({ ...row(g), reports: g.reports, hidden: !!g.hidden, reasons: byGame[g.id] || {} })) });
  }
  if (path === '/users' && method === 'GET') {
    const q = (ctx.url.searchParams.get('q') || '').toLowerCase().slice(0, 16);
    const { results } = await db.prepare(`SELECT u.name, u.banned, u.created_at, (SELECT COUNT(*) FROM games g WHERE g.user_id = u.id) AS games,
      (SELECT coins FROM wallets w WHERE w.user_id = u.id) AS coins
      FROM users u WHERE u.name_lower LIKE ? ORDER BY u.created_at DESC LIMIT 50`).bind('%' + q.replace(/[\\%_]/g, '') + '%').all();
    return json({ users: results.map((u) => ({ ...u, coins: u.coins || 0, banned: !!u.banned })) });
  }
  if (path === '/chat' && method === 'GET') {
    const { results } = await db.prepare("SELECT * FROM chat_reports WHERE status = 'open' ORDER BY at DESC LIMIT 100").all();
    return json({ reports: results.map((r) => ({ id: r.id, reporter: r.reporter_name, target: r.target, reason: r.reason, room: r.room, at: r.at, messages: JSON.parse(r.messages || '[]') })) });
  }
  let m = path.match(/^\/chat\/(\d+)$/);
  if (m && method === 'POST') {
    const { action } = await body(ctx.request);
    const r = await db.prepare('SELECT * FROM chat_reports WHERE id = ?').bind(Number(m[1])).first();
    if (!r) fail(404, 'That report is gone.');
    if (action === 'ban') {
      const u = await db.prepare('SELECT id, name FROM users WHERE id = ?').bind(r.target_id).first();
      if (u && isAdmin(env, u)) fail(400, "You can't ban an admin.");
      if (u) await banUser(ctx, u);
      await db.prepare("UPDATE chat_reports SET status = 'done' WHERE target_id = ? AND status = 'open'").bind(r.target_id).run();
    } else if (action === 'dismiss') {
      await db.prepare("UPDATE chat_reports SET status = 'dismissed' WHERE id = ?").bind(r.id).run();
    } else fail(400, 'Unknown action.');
    return json({ ok: true });
  }
  m = path.match(/^\/games\/([A-Za-z0-9]{8})$/);
  if (m && method === 'POST') {
    const input = await body(ctx.request);
    const { action } = input;
    if (action === 'hide') await db.prepare('UPDATE games SET hidden = 1 WHERE id = ?').bind(m[1]).run();
    else if (action === 'show') await db.prepare('UPDATE games SET hidden = 0 WHERE id = ?').bind(m[1]).run();
    else if (action === 'clear') await db.batch([db.prepare('UPDATE games SET reports = 0, hidden = 0 WHERE id = ?').bind(m[1]), db.prepare('DELETE FROM reports WHERE game_id = ?').bind(m[1])]);
    else if (action === 'delete') await removeGame(db, m[1]);
    else if (action === 'reward') {
      const amount = Math.floor(Number(input.amount) || 0);
      if (amount < 0 || amount > 1000) fail(400, 'Rewards can be 0 to 1000 coins.');
      await db.prepare('UPDATE games SET reward = ? WHERE id = ?').bind(amount, m[1]).run();
    } else fail(400, 'Unknown action.');
    return json({ ok: true });
  }
  if (path === '/announce' && method === 'POST') {
    // a message across the top of the site, and in every 3D server that's running right now
    const text = String((await body(ctx.request)).text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
    await db.prepare("INSERT INTO settings (key, value) VALUES ('announce', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(text).run();
    if (text && env.ROOMS) {
      const { results } = await db.prepare('SELECT code FROM servers WHERE players > 0 AND updated > ?').bind(Date.now() - FRESH).all();
      await Promise.all(results.map((r) => env.ROOMS.get(env.ROOMS.idFromName('p:' + r.code)).fetch('https://room/announce?m=' + encodeURIComponent(text)).catch(() => {})));
    }
    return json({ ok: true, announce: text });
  }
  if (path === '/stock' && method === 'POST') {
    const input = await body(ctx.request);
    const f = findItem(input.item);
    if (!f || !f.item.stock) fail(400, "That isn't a limited item.");
    const left = Math.floor(Number(input.left));
    if (!(left >= 0 && left <= 100000)) fail(400, 'Pick a number from 0 to 100000.');
    await db.prepare('INSERT INTO stock (item, left) VALUES (?, ?) ON CONFLICT (item) DO UPDATE SET left = excluded.left').bind(f.key, left).run();
    return json({ ok: true });
  }
  m = path.match(/^\/users\/([A-Za-z0-9_]{3,16})$/);
  if (m && method === 'GET') {
    const u = await db.prepare('SELECT id, name, banned, created_at FROM users WHERE name_lower = ?').bind(m[1].toLowerCase()).first();
    if (!u) fail(404, 'No user with that name.');
    const [w, ledger, games] = await Promise.all([
      getWallet(db, u.id),
      db.prepare('SELECT delta, why, at FROM ledger WHERE user_id = ? ORDER BY at DESC LIMIT 25').bind(u.id).all(),
      db.prepare('SELECT COUNT(*) AS n FROM games WHERE user_id = ?').bind(u.id).first(),
    ]);
    return json({ name: u.name, banned: !!u.banned, since: u.created_at, admin: isAdmin(env, u), wallet: w, ledger: ledger.results, games: games.n });
  }
  if (m && method === 'POST') {
    const input = await body(ctx.request);
    const { action } = input;
    const u = await db.prepare('SELECT id, name FROM users WHERE name_lower = ?').bind(m[1].toLowerCase()).first();
    if (!u) fail(404, 'No user with that name.');
    if (action === 'grant' || action === 'setcoins') {
      let amount = Math.floor(Number(input.amount) || 0);
      if (action === 'setcoins') {
        if (!(amount >= 0 && amount <= 10000000)) fail(400, 'Pick a number from 0 to 10000000.');
        amount -= (await getWallet(db, u.id)).coins;
        if (!amount) return json({ ok: true, wallet: await getWallet(db, u.id) });
      } else if (!amount || Math.abs(amount) > 1000000) fail(400, 'Pick an amount between -1000000 and 1000000.');
      try { await db.batch(coinStmts(db, u.id, amount, 'admin ' + user.name)); } catch (e) { fail(400, "They don't have that many coins to take away."); }
      return json({ ok: true, wallet: await getWallet(db, u.id) });
    }
    if (action === 'give' || action === 'take') {
      const f = findItem(input.item);
      if (!f) fail(400, 'Unknown item.');
      try { await db.batch(itemStmts(db, u.id, f.key, action === 'give' ? 1 : -1)); } catch (e) { if (isConstraint(e)) fail(400, "They don't have that item."); throw e; }
      if (action === 'take') {
        const w = await getWallet(db, u.id);
        await db.prepare('UPDATE users SET look = ? WHERE id = ?').bind(JSON.stringify(w.look), u.id).run();
      }
      return json({ ok: true, wallet: await getWallet(db, u.id) });
    }
    if (action === 'password') {
      // for players who forgot their password and lost their recovery code
      if (isAdmin(env, u) && u.id !== user.id) fail(400, "You can't change another admin's password.");
      const pw = String(input.password || '');
      if (pw.length < 6 || pw.length > 72) fail(400, 'Passwords need 6 to 72 characters.');
      const salt = randomId(16);
      await db.batch([
        db.prepare('UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(await hashPassword(pw, salt, env), salt, u.id),
        db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
      ]);
      return json({ ok: true });
    }
    if (action === 'kick') { if (isAdmin(env, u)) fail(400, "You can't kick an admin."); await kickEverywhere(env, db, u.id, 'An admin removed you from this server.'); return json({ ok: true }); }
    if (isAdmin(env, u)) fail(400, "You can't ban an admin.");
    if (action === 'ban') await banUser(ctx, u);
    else if (action === 'unban') {
      await db.batch([
        db.prepare('UPDATE users SET banned = 0 WHERE id = ?').bind(u.id),
        db.prepare('UPDATE games SET hidden = 0 WHERE user_id = ? AND reports < ?').bind(u.id, HIDE_AFTER_REPORTS),
      ]);
    } else fail(400, 'Unknown action.');
    return json({ ok: true });
  }
  fail(404, 'Unknown admin address.');
}
