// Blockyard backend: a Cloudflare Worker with a D1 database.
// Accounts, synced progress, published levels (checked by replaying the creator's run),
// the daily challenge leaderboard, plays, likes, reports and admin tools.
// Everything that is not /api/... is a normal file from the public folder.
//
// Settings (Cloudflare > your Worker > Settings > Variables and Secrets):
//   ADMIN_USERNAME    your Blockyard username. That account gets the Admin page. Comma-separate for more than one.
//   SALT              any long random text. Makes stored passwords and visitor IDs harder to crack. Set it once, never change it.
//   MAX_VERIFY_STEPS  optional. How long a winning run can be, in 1/120ths of a second (default 14400 = 2 minutes).

import { normalizeLevel, toWire, cleanText, isRude, LIMITS } from '../public/js/format.js';
import { runReplay } from '../public/js/replay.js';
import { dailyCourse, todayUTC } from '../public/js/endless.js';

const PAGE = 24;
const DAY = 86400e3;
const SESSION_DAYS = 60;
const LIMITS_PER = { publishHour: 5, publishDay: 20, reportsDay: 20, loginFails: 10, signupsDay: 5 };
const HIDE_AFTER_REPORTS = 3;
const HATS = ['none', 'cap', 'bow', 'sprout', 'party', 'beanie', 'headphones', 'horns', 'tophat', 'propeller', 'crown', 'halo', 'wizard'];

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
];

// Tables are created automatically the first time the Worker runs.
let ready = null;
function ensureSchema(db) {
  if (!ready) {
    ready = (async () => {
      await db.batch(SCHEMA.map((s) => db.prepare(s)));
      // columns added after the first version
      try { await db.prepare('ALTER TABLE games ADD COLUMN user_id TEXT').run(); } catch (e) { /* already there */ }
      await db.prepare('CREATE INDEX IF NOT EXISTS games_user ON games (user_id, created_at)').run();
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await handle(request, env, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Something went wrong on the server. Try again in a bit.' }, 500);
    }
  },
};

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

async function handle(request, env, url) {
  const path = url.pathname.slice(4); // strip "/api"
  const method = request.method;
  if (path === '/health') return json({ ok: true, db: !!env.DB, accounts: true });
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

  // levels
  if (path === '/games' && method === 'GET') return listGames(ctx);
  if (path === '/games' && method === 'POST') return publish(ctx, await body(request));
  if ((m = path.match(/^\/games\/([A-Za-z0-9]{8})$/))) {
    if (method === 'GET') return getGame(ctx, m[1]);
    if (method === 'PUT') return updateGame(ctx, m[1], await body(request));
    if (method === 'DELETE') return deleteGame(ctx, m[1]);
  }
  if ((m = path.match(/^\/games\/([A-Za-z0-9]{8})\/(play|like|report)$/)) && method === 'POST') return gameAction(ctx, m[1], m[2]);

  // daily challenge
  if (path === '/daily' && method === 'GET') return getDaily(ctx);
  if (path === '/daily' && method === 'POST') return postDaily(ctx, await body(request));

  if (path.startsWith('/admin/')) return admin(ctx, path.slice(6), method);
  fail(404, 'Unknown address.');
}

/* ---------------- helpers ---------------- */
async function body(request) {
  const text = await request.text();
  if (text.length > 200000) fail(413, 'That is too big to send.');
  try { return JSON.parse(text || '{}'); } catch (e) { fail(400, 'The server could not read that request.'); }
}
const enc = (s) => new TextEncoder().encode(s);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha256(text) { return hex(await crypto.subtle.digest('SHA-256', enc(text))); }
function randomId(n) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let out = '';
  for (const b of bytes) out += abc[b % abc.length];
  return out;
}
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
const maxSteps = (env) => Math.max(1200, Math.min(120000, parseInt(env.MAX_VERIFY_STEPS || '14400', 10) || 14400));
const isAdmin = (env, user) => !!user && (env.ADMIN_USERNAME || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean).includes(user.name.toLowerCase());
function needUser(ctx) {
  if (!ctx.user) fail(401, 'Log in first. It only takes a username and a password.');
  return ctx.user;
}
function looks(progressText) {
  try {
    const p = JSON.parse(progressText || '{}').equip || {};
    return { color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#ff6b35', hat: HATS.includes(p.hat) ? p.hat : 'none' };
  } catch (e) { return { color: '#ff6b35', hat: 'none' }; }
}

/* ---------------- accounts ---------------- */
async function sessionUser(db, request, env) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || token.length > 100) return null;
  const row = await db.prepare(`SELECT u.id, u.name, u.banned FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires > ?`).bind(await sha256(token), Date.now()).first();
  if (!row || row.banned) return null;
  return { id: row.id, name: row.name, token, admin: isAdmin(env, row) };
}
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
async function signup(ctx, input) {
  const { db, env, ip } = ctx;
  checkName(input.name); checkPassword(input.password);
  if (await countEvents(db, 'signup', ip, Date.now() - DAY) >= LIMITS_PER.signupsDay) fail(429, 'Too many new accounts from here today. Try again tomorrow.');
  const taken = await db.prepare('SELECT id FROM users WHERE name_lower = ?').bind(input.name.toLowerCase()).first();
  if (taken) fail(409, 'That username is taken. Try another one.');
  const id = randomId(12), salt = randomId(16), recovery = randomId(4) + '-' + randomId(4) + '-' + randomId(4);
  let progress = '{}';
  if (input.progress && typeof input.progress === 'object') { const t = JSON.stringify(input.progress); if (t.length < 64000) progress = t; }
  await db.prepare('INSERT INTO users (id, name, name_lower, pw_hash, pw_salt, rec_hash, progress, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, input.name, input.name.toLowerCase(), await hashPassword(input.password, salt, env), salt, await sha256(recovery.toUpperCase() + (env.SALT || '')), progress, Date.now()).run();
  await addEvent(db, 'signup', ip);
  const token = await newSession(db, id);
  return json({ token, recovery, user: { id, name: input.name, admin: isAdmin(env, { name: input.name }) }, progress: JSON.parse(progress) }, 201);
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
  return json({ token, user: { id: u.id, name: u.name, admin: isAdmin(env, u) }, progress: JSON.parse(u.progress || '{}') });
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
  return json({ token, recovery, user: { id: u.id, name: u.name, admin: isAdmin(env, u) }, progress: JSON.parse(u.progress || '{}') });
}
async function logout(ctx) {
  if (ctx.user) await ctx.db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(ctx.user.token)).run();
  return json({ ok: true });
}
async function me(ctx) {
  const user = needUser(ctx);
  const u = await ctx.db.prepare('SELECT progress FROM users WHERE id = ?').bind(user.id).first();
  return json({ user: { id: user.id, name: user.name, admin: user.admin }, progress: JSON.parse(u.progress || '{}') });
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
  const { results } = await db.prepare('SELECT id FROM games WHERE user_id = ?').bind(user.id).all();
  for (const g of results) await removeGame(db, g.id);
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM daily WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  return json({ ok: true });
}

/* ---------------- levels ---------------- */
function checkFields(input, env) {
  let level;
  try { level = normalizeLevel(input.level); } catch (e) { fail(400, e.message); }
  const desc = cleanText(input.desc, LIMITS.desc);
  if (isRude(level.n) || isRude(desc)) fail(400, 'Something in the name or description has a blocked word.');
  // The creator has to have beaten it: replay their run and see if it reaches the goal.
  let run;
  try { run = runReplay(level, String(input.replay || ''), { maxSteps: maxSteps(env) }); } catch (e) { fail(400, e.message); }
  if (!run.won) fail(400, "Your recorded run didn't reach the goal. Beat your level in Test, then publish right away.");
  return { level, desc, run };
}
function row(g) {
  return { id: g.id, name: g.name, creator: g.creator, descr: g.descr, style: g.style, theme: g.theme, plays: g.plays, likes: g.likes, created_at: g.created_at, level: JSON.parse(g.data) };
}
async function listGames(ctx) {
  const { db, url } = ctx;
  const sort = { new: 'created_at DESC', top: 'plays DESC, created_at DESC', liked: 'likes DESC, created_at DESC' }[url.searchParams.get('sort')] || 'created_at DESC';
  const style = url.searchParams.get('style');
  const q = (url.searchParams.get('q') || '').trim().slice(0, 40);
  const creator = (url.searchParams.get('creator') || '').trim().slice(0, 20);
  const page = Math.max(0, Math.min(200, parseInt(url.searchParams.get('page') || '0', 10) || 0));
  const where = ['hidden = 0'], args = [];
  if (style === 'rush' || style === 'adventure') { where.push('style = ?'); args.push(style); }
  if (creator) { where.push('creator = ? COLLATE NOCASE'); args.push(creator); }
  if (q) {
    const like = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    where.push("(name LIKE ? ESCAPE '\\' OR creator LIKE ? ESCAPE '\\')"); args.push(like, like);
  }
  const { results } = await db.prepare(`SELECT * FROM games WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT ? OFFSET ?`).bind(...args, PAGE + 1, page * PAGE).all();
  return json({ games: results.slice(0, PAGE).map(row), more: results.length > PAGE });
}
async function myGames(ctx) {
  const user = needUser(ctx);
  const { results } = await ctx.db.prepare('SELECT * FROM games WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').bind(user.id).all();
  return json({ games: results.map((g) => ({ ...row(g), hidden: !!g.hidden })) });
}
async function getGame(ctx, id) {
  const g = await ctx.db.prepare('SELECT * FROM games WHERE id = ? AND hidden = 0').bind(id).first();
  if (!g) fail(404, 'That level was not found. It may have been removed.');
  return json({ game: row(g) });
}
async function publish(ctx, input) {
  const user = needUser(ctx);
  const { db, env, ip } = ctx;
  const now = Date.now();
  const hour = await db.prepare('SELECT COUNT(*) AS n FROM games WHERE user_id = ? AND created_at > ?').bind(user.id, now - 3600e3).first();
  if (hour.n >= LIMITS_PER.publishHour) fail(429, `You can publish ${LIMITS_PER.publishHour} levels an hour. Take a break and try again later.`);
  const day = await db.prepare('SELECT COUNT(*) AS n FROM games WHERE user_id = ? AND created_at > ?').bind(user.id, now - DAY).first();
  if (day.n >= LIMITS_PER.publishDay) fail(429, `You can publish ${LIMITS_PER.publishDay} levels a day. Try again tomorrow.`);
  const { level, desc } = checkFields(input, env);
  const id = randomId(8);
  await db.prepare(`INSERT INTO games (id, name, creator, descr, style, theme, w, h, data, edit_hash, creator_hash, user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?)`)
    .bind(id, level.n, user.name, desc, level.style, level.theme, level.w, level.h, JSON.stringify(toWire(level)), ip, user.id, now, now).run();
  return json({ id }, 201);
}
// Owner = the account that published it, or (for levels from before accounts) the secret edit key.
async function ownGame(ctx, id) {
  const g = await ctx.db.prepare('SELECT id, user_id, edit_hash FROM games WHERE id = ?').bind(id).first();
  if (!g) fail(404, 'That level was not found. It may have been removed.');
  if (ctx.user && (g.user_id === ctx.user.id || ctx.user.admin)) return g;
  const key = ctx.request.headers.get('x-edit-key');
  if (key && g.edit_hash && g.edit_hash === await sha256(key)) return g;
  fail(403, "You can only change levels you published.");
}
async function updateGame(ctx, id, input) {
  await ownGame(ctx, id);
  const { level, desc } = checkFields(input, ctx.env);
  await ctx.db.prepare('UPDATE games SET name = ?, descr = ?, style = ?, theme = ?, w = ?, h = ?, data = ?, updated_at = ? WHERE id = ?')
    .bind(level.n, desc, level.style, level.theme, level.w, level.h, JSON.stringify(toWire(level)), Date.now(), id).run();
  return json({ ok: true, id });
}
async function deleteGame(ctx, id) {
  await ownGame(ctx, id);
  await removeGame(ctx.db, id);
  return json({ ok: true });
}
function removeGame(db, id) {
  return db.batch(['games WHERE id', 'likes WHERE game_id', 'plays WHERE game_id', 'reports WHERE game_id'].map((t) => db.prepare(`DELETE FROM ${t} = ?`).bind(id)));
}
async function gameAction(ctx, id, action) {
  const { db } = ctx;
  const game = await db.prepare('SELECT id FROM games WHERE id = ? AND hidden = 0').bind(id).first();
  if (!game) fail(404, 'That level was not found. It may have been removed.');
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

/* ---------------- daily challenge ---------------- */
function validDate(d) {
  const today = todayUTC();
  const ok = [todayUTC(new Date(Date.now() - DAY)), today, todayUTC(new Date(Date.now() + DAY))];
  return ok.includes(d) ? d : null;
}
async function getDaily(ctx) {
  const { db, url, user } = ctx;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') || '') ? url.searchParams.get('date') : todayUTC();
  const { results } = await db.prepare(`SELECT d.progress, d.won, d.at, u.name, u.progress AS p FROM daily d JOIN users u ON u.id = d.user_id
    WHERE d.date = ? AND u.banned = 0 ORDER BY d.progress DESC, d.at ASC LIMIT 25`).bind(date).all();
  const top = results.map((r, i) => ({ rank: i + 1, name: r.name, progress: r.progress, won: !!r.won, ...looks(r.p) }));
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
  const date = validDate(String(input.date || ''));
  if (!date) fail(400, "That daily challenge isn't open anymore.");
  let run;
  try { run = runReplay(dailyCourse(date), String(input.replay || ''), { maxSteps: maxSteps(ctx.env), stopOnDeath: true }); } catch (e) { fail(400, e.message); }
  const progress = run.won ? 1 : Math.round(run.progress * 1000) / 1000;
  await ctx.db.prepare(`INSERT INTO daily (date, user_id, progress, won, at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (date, user_id) DO UPDATE SET progress = excluded.progress, won = excluded.won, at = excluded.at WHERE excluded.progress > daily.progress`)
    .bind(date, user.id, progress, run.won ? 1 : 0, Date.now()).run();
  return json({ ok: true, progress, won: run.won });
}

/* ---------------- admin ---------------- */
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
    const { results } = await db.prepare(`SELECT u.name, u.banned, u.created_at, (SELECT COUNT(*) FROM games g WHERE g.user_id = u.id) AS games
      FROM users u WHERE u.name_lower LIKE ? ORDER BY u.created_at DESC LIMIT 50`).bind('%' + q.replace(/[\\%_]/g, '') + '%').all();
    return json({ users: results.map((u) => ({ ...u, banned: !!u.banned })) });
  }
  let m = path.match(/^\/games\/([A-Za-z0-9]{8})$/);
  if (m && method === 'POST') {
    const { action } = await body(ctx.request);
    if (action === 'hide') await db.prepare('UPDATE games SET hidden = 1 WHERE id = ?').bind(m[1]).run();
    else if (action === 'show') await db.prepare('UPDATE games SET hidden = 0 WHERE id = ?').bind(m[1]).run();
    else if (action === 'clear') await db.batch([db.prepare('UPDATE games SET reports = 0, hidden = 0 WHERE id = ?').bind(m[1]), db.prepare('DELETE FROM reports WHERE game_id = ?').bind(m[1])]);
    else if (action === 'delete') await removeGame(db, m[1]);
    else fail(400, 'Unknown action.');
    return json({ ok: true });
  }
  m = path.match(/^\/users\/([A-Za-z0-9_]{3,16})$/);
  if (m && method === 'POST') {
    const { action } = await body(ctx.request);
    const u = await db.prepare('SELECT id, name FROM users WHERE name_lower = ?').bind(m[1].toLowerCase()).first();
    if (!u) fail(404, 'No user with that name.');
    if (isAdmin(env, u)) fail(400, "You can't ban an admin.");
    if (action === 'ban') {
      await db.batch([
        db.prepare('UPDATE users SET banned = 1 WHERE id = ?').bind(u.id),
        db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
        db.prepare('UPDATE games SET hidden = 1 WHERE user_id = ?').bind(u.id),
      ]);
    } else if (action === 'unban') {
      await db.batch([
        db.prepare('UPDATE users SET banned = 0 WHERE id = ?').bind(u.id),
        db.prepare('UPDATE games SET hidden = 0 WHERE user_id = ? AND reports < ?').bind(u.id, HIDE_AFTER_REPORTS),
      ]);
    } else fail(400, 'Unknown action.');
    return json({ ok: true });
  }
  fail(404, 'Unknown admin address.');
}
