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
import { BOTS } from '../public/js/games.js';
import { dailyCourse, todayUTC } from '../public/js/endless.js';
import { json, fail, body, sha256, randomId, needUser, isAdmin, DAY, HttpError, signTicket, readTicket, enc, hex, readCookie, withCookie, isConstraint } from './util.js';
import { findItem } from '../public/js/cosmetics.js';
import { SOCIAL_SCHEMA, socialRoute, SIGNUP_BONUS } from './social.js';
import { MARKET_SCHEMA, marketRoute } from './market.js';
import { PEOPLE_SCHEMA, PEOPLE_COLUMNS, peopleRoute, followInfo, tellFollowers, rateGame, titleOk, setTag, isOwner } from './people.js';
import { cleanTags } from '../public/js/names.js';
import { COMMUNITY_SCHEMA, vote, voteSummary, facesBeaten, dailyPick, setDailyPick, dailyPicks } from './community.js';
import { MOD, ROLES, ROLE_NAME, addWarning, creditReporters, checkPopular, adminNotify, setAdminNotify, mailAdmin, setPay } from './mod.js';
import { ECON_SCHEMA, seedStock, econRoute, migrateUser, accountExtras, coinStmts, verify, maxSteps, maxSteps3d, publicItems, REWARD, DEFAULT_LOOK, cleanLook, getWallet, itemStmts, boardInfo, dealSettings, cleanDeals, featured, dealPool, ECON_COLUMNS, questBumps } from './econ.js';
export { Room } from './room.js';

const PAGE = 24;
const SESSION_DAYS = 90;
const LIMITS_PER = { publishHour: 5, publishDay: 20, reportsDay: 20, loginFails: 10, signupsDay: 5, projects: 60, collaborators: 8, privateServers: 5 };
const RATED_PAY = 5; // a level the admin rated pays 5 coins per difficulty star the first time you beat it (when it doesn't pay more already)
const HIDE_AFTER_REPORTS = MOD.hideAfter; // reports from different players before a level is hidden for review
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
  // mailbox: coins from the admin, a new role, trade offers, what your levels earned
  `CREATE TABLE IF NOT EXISTS mail (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
    body TEXT NOT NULL, ref TEXT, data TEXT, at INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0)`,
  'CREATE INDEX IF NOT EXISTS mail_user ON mail (user_id, at)',
  'CREATE INDEX IF NOT EXISTS mail_ref ON mail (user_id, ref)',
  // everything admins do, so you can look back
  'CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, admin TEXT NOT NULL, path TEXT NOT NULL, detail TEXT NOT NULL, at INTEGER NOT NULL)',
  // friends: a asked b. status 'pending' until b says yes, then 'ok'
  'CREATE TABLE IF NOT EXISTS friends (a TEXT NOT NULL, b TEXT NOT NULL, status TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (a, b))',
  'CREATE INDEX IF NOT EXISTS friends_b ON friends (b, status)',
  ...ECON_SCHEMA,
  ...SOCIAL_SCHEMA,
  ...COMMUNITY_SCHEMA,
  ...MARKET_SCHEMA,
  ...PEOPLE_SCHEMA,
];
// columns added after the first version
const COLUMNS = [
  'ALTER TABLE games ADD COLUMN user_id TEXT',
  "ALTER TABLE games ADD COLUMN kind TEXT NOT NULL DEFAULT '2d'",
  "ALTER TABLE games ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'",
  'ALTER TABLE games ADD COLUMN reward INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE games ADD COLUMN project_id TEXT',
  'ALTER TABLE games ADD COLUMN thumb TEXT',
  'ALTER TABLE games ADD COLUMN stars INTEGER NOT NULL DEFAULT 0',
  "ALTER TABLE users ADD COLUMN look TEXT NOT NULL DEFAULT '{}'",
  'ALTER TABLE users ADD COLUMN econ INTEGER NOT NULL DEFAULT 0',
  "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE users ADD COLUMN warnings INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN signup_ip TEXT',
  'ALTER TABLE users ADD COLUMN tos_at INTEGER',
  'ALTER TABLE users ADD COLUMN good_reports INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN seen INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE servers ADD COLUMN bots INTEGER NOT NULL DEFAULT 0',
  "ALTER TABLE servers ADD COLUMN bot_skill TEXT NOT NULL DEFAULT 'normal'",
  "ALTER TABLE servers ADD COLUMN perms TEXT NOT NULL DEFAULT '{}'",
  'ALTER TABLE games ADD COLUMN suggested INTEGER NOT NULL DEFAULT 0',
  ...PEOPLE_COLUMNS,
];

// Tables are created automatically the first time the Worker runs.
let ready = null;
function ensureSchema(db) {
  if (!ready) {
    ready = (async () => {
      await db.batch(SCHEMA.map((s) => db.prepare(s)));
      for (const c of COLUMNS) { try { await db.prepare(c).run(); } catch (e) { /* already there */ } }
      for (const [c, once] of ECON_COLUMNS) { let added = false; try { await db.prepare(c).run(); added = true; } catch (e) { /* already there */ } if (added) for (const q of [].concat(once)) await db.prepare(q).run(); }
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
  ctx.ban = (u) => banUser(ctx, u);
  ctx.deleteAccount = (u, why) => deleteAccount(ctx, u, why);
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
  const so = await socialRoute(ctx, path, method);
  if (so) return so;
  const pp = await peopleRoute(ctx, path, method);
  if (pp) return pp;
  const mk = await marketRoute(ctx, path, method);
  if (mk) return mk;

  // players
  if (path === '/users' && method === 'GET') return findUsers(ctx);
  if ((m = path.match(/^\/users\/([A-Za-z0-9_]{3,16})$/)) && method === 'GET') return profile(ctx, m[1]);

  // published levels and worlds
  if (path === '/games' && method === 'GET') return listGames(ctx);
  // quick play: a random public 3D world someone made (the page mixes in Blockyard's own worlds too)
  if (path === '/games/random' && method === 'GET') {
    const n = await ctx.db.prepare("SELECT COUNT(*) AS n FROM games WHERE kind = '3d' AND hidden = 0 AND visibility = 'public'").first();
    if (!n.n) return json({ id: null });
    const r = await ctx.db.prepare("SELECT id, name FROM games WHERE kind = '3d' AND hidden = 0 AND visibility = 'public' LIMIT 1 OFFSET ?").bind(Math.floor(Math.random() * n.n)).first();
    return json({ id: r ? r.id : null, name: r ? r.name : null, total: n.n });
  }
  if (path === '/games' && method === 'POST') return publish(ctx, await body(request));
  if ((m = path.match(/^\/games\/([A-Za-z0-9]{8})$/))) {
    if (method === 'GET') return getGame(ctx, m[1]);
    if (method === 'PUT') return updateGame(ctx, m[1], await body(request));
    if (method === 'DELETE') return deleteGame(ctx, m[1]);
  }
  if ((m = path.match(/^\/games\/([A-Za-z0-9]{8})\/(play|like|dislike|report)$/)) && method === 'POST') return gameAction(ctx, m[1], m[2]);
  if ((m = path.match(/^\/games\/([A-Za-z0-9]{8})\/vote$/)) && method === 'POST') return vote(ctx, m[1], await body(request));

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
  if ((m = path.match(/^\/servers\/([A-Za-z0-9]{8})$/)) && method === 'PUT') return serverBots(ctx, m[1], await body(request));
  if ((m = path.match(/^\/servers\/([A-Za-z0-9]{8})$/)) && method === 'DELETE') return closeServer(ctx, m[1]);
  if (path === '/rooms/join' && method === 'POST') return joinPlay(ctx, await body(request));
  if (path === '/rooms/edit' && method === 'POST') return joinEdit(ctx, await body(request));

  // daily challenge
  if (path === '/daily' && method === 'GET') return getDaily(ctx);
  if (path === '/daily' && method === 'POST') return postDaily(ctx, await body(request));

  if (path.startsWith('/admin/')) {
    const copy = method === 'POST' ? request.clone() : null;
    const res = await admin(ctx, path.slice(6), method);
    // it worked: write it in the admin log (never the password itself)
    if (copy) { try { const b = await copy.json(); delete b.password; await db.prepare('INSERT INTO admin_log (admin, path, detail, at) VALUES (?, ?, ?, ?)').bind(ctx.user.name, path.slice(6), JSON.stringify(b).slice(0, 600), Date.now()).run(); } catch (e) { /* logging never blocks */ } }
    return res;
  }
  if ((m = path.match(/^\/boards\/([gw]:[A-Za-z0-9_-]{1,40})$/)) && method === 'GET') return json(await boardInfo(db, m[1], ctx.user && ctx.user.id, 10));
  if (path === '/friends' && method === 'GET') return friendsList(ctx);
  if (path === '/friends' && method === 'POST') return friendAction(ctx, await body(request));
  if (path === '/me/password' && method === 'POST') return changePassword(ctx, await body(request));
  if (path === '/me/mail' && method === 'GET') return myMail(ctx);
  if ((m = path.match(/^\/me\/mail\/(\d+|all)$/)) && method === 'POST') return mailAction(ctx, m[1], await body(request));
  fail(404, 'Unknown address.');
}

/* ---------------- helpers ---------------- */
// An anonymous ID per visitor (a scrambled IP address), used only to stop spam.
async function visitorId(request, env) {
  return (await sha256((request.headers.get('CF-Connecting-IP') || 'local') + '|' + (env.SALT || 'blockyard'))).slice(0, 32);
}
async function hashPassword(password, salt, env) { return hashWith(password, salt, env.SALT || ''); }
async function hashWith(password, salt, secret) {
  const key = await crypto.subtle.importKey('raw', enc(password + '|' + secret), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc(salt), iterations: 10000 }, key, 256));
}
// Accounts made before the SALT secret was added (or before it was changed) were saved with a
// different secret, so their right password looked wrong. Check those older ways too; when one
// matches, the password is saved again the current way so it's fast next time.
// (If SALT was changed, put the old value in a secret called OLD_SALT.)
const olderSecrets = (env) => [...new Set([env.SALT ? '' : null, env.OLD_SALT || null].filter((x) => x != null && x !== (env.SALT || '')))];
async function passwordMatches(db, env, u, password) {
  if (sameText(u.pw_hash, await hashPassword(password, u.pw_salt, env))) return true;
  for (const old of olderSecrets(env)) {
    if (sameText(u.pw_hash, await hashWith(password, u.pw_salt, old))) {
      const salt = randomId(16);
      await db.prepare('UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(await hashPassword(password, salt, env), salt, u.id).run();
      return true;
    }
  }
  return false;
}
async function recoveryMatches(env, u, code) {
  for (const secret of [env.SALT || '', ...olderSecrets(env)]) if (sameText(u.rec_hash || '', await sha256(code + secret))) return true;
  return false;
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
const lookOf = (text) => { try { const l = JSON.parse(text || '{}'); return { color: /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : DEFAULT_LOOK.color, hat: String(l.hat || 'none').slice(0, 20), trail: String(l.trail || 'none').slice(0, 20), pet: String(l.pet || 'none').slice(0, 20), gear: String(l.gear || 'none').slice(0, 20) }; } catch (e) { return { ...DEFAULT_LOOK }; } };

/* ---------------- accounts ---------------- */
async function sessionUser(db, request, env) {
  const auth = request.headers.get('authorization') || '';
  let token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '', viaCookie = false;
  if (!token) { token = readCookie(request); viaCookie = !!token; }
  if (!token || token.length > 100) return null;
  const hash = await sha256(token);
  const row = await db.prepare(`SELECT u.id, u.name, u.banned, u.role, u.display, s.expires FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires > ?`).bind(hash, Date.now()).first();
  if (!row || row.banned) return null;
  // logins you keep using never run out
  if (row.expires - Date.now() < (SESSION_DAYS - 30) * DAY) await db.prepare('UPDATE sessions SET expires = ? WHERE token_hash = ?').bind(Date.now() + SESSION_DAYS * DAY, hash).run();
  return { id: row.id, name: row.name, token, viaCookie, admin: isAdmin(env, row), role: row.role || '', display: row.display || null };
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
  const [ex, mail, rr] = await Promise.all([accountExtras(db, u.id), db.prepare('SELECT COUNT(*) AS n FROM mail WHERE user_id = ? AND read = 0').bind(u.id).first(), db.prepare('SELECT role, warnings, title, display, display_at, pfp, tags FROM users WHERE id = ?').bind(u.id).first()]);
  return { ...extra, user: { id: u.id, name: u.name, admin: isAdmin(env, u), role: (rr && rr.role) || '', warnings: (rr && rr.warnings) || 0, title: (rr && rr.title) || null, display: (rr && rr.display) || null, displayAt: (rr && rr.display_at) || 0, pfp: (rr && rr.pfp) || null, tags: cleanTags(rr && rr.tags), owner: isOwner(env, u) }, progress: JSON.parse(u.progress || '{}'), ...ex, unread: mail.n };
}
async function signup(ctx, input) {
  const { db, env, ip } = ctx;
  checkName(input.name); checkPassword(input.password);
  const madeToday = await countEvents(db, 'signup', ip, Date.now() - DAY);
  if (madeToday >= LIMITS_PER.signupsDay) fail(429, 'Too many new accounts from here today. Try again tomorrow.');
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
  await db.prepare('INSERT INTO users (id, name, name_lower, pw_hash, pw_salt, rec_hash, progress, created_at, look, econ, signup_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)')
    .bind(id, input.name, input.name.toLowerCase(), await hashPassword(input.password, salt, env), salt, await sha256(recovery.toUpperCase() + (env.SALT || '')), progress, Date.now(), look, ip).run();
  // a welcome gift in the mailbox (only the first few new accounts from the same place each day get one)
  if (madeToday < 3 && SIGNUP_BONUS) await mailStmt(db, id, 'welcome', `Welcome to Blockyard! Here are ${SIGNUP_BONUS} coins`, 'Press Claim to get your welcome coins. Spend them in the Shop on hats, colors, pets and more!', null, { claim: SIGNUP_BONUS }).run();
  await addEvent(db, 'signup', ip);
  // they agreed to the rules and terms before making the account
  if (input.tos) await db.prepare('UPDATE users SET tos_at = ? WHERE id = ?').bind(Date.now(), id).run();
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
  if (!u || !(await passwordMatches(db, env, u, String(input.password || '')))) {
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
  if (!u || !(await recoveryMatches(env, u, code))) {
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
  await ctx.db.batch(wipeAccount(ctx.db, user));
  return withCookie(json({ ok: true }), '', 0);
}
// The admin deleted an account (the step after 3 warnings, always confirmed first). Admins can't be deleted.
async function deleteAccount(ctx, u, why) {
  const { db, env } = ctx;
  if (isAdmin(env, u)) fail(400, "You can't delete an admin's account.");
  await kickEverywhere(env, db, u.id, 'This account was deleted.').catch(() => {});
  await db.batch([...wipeAccount(db, u),
    db.prepare("INSERT INTO admin_log (admin, path, detail, at) VALUES (?, 'delete-account', ?, ?)").bind(ctx.user ? ctx.user.name : 'Blockyard', JSON.stringify({ user: u.name, why: String(why || '').slice(0, 200) }), Date.now())]);
}
function wipeAccount(db, user) {
  const mineG = 'SELECT id FROM games WHERE user_id = ?';
  return [
    ...['likes', 'plays', 'reports'].map((t) => db.prepare(`DELETE FROM ${t} WHERE game_id IN (${mineG})`).bind(user.id)),
    db.prepare(`UPDATE projects SET game_id = NULL WHERE game_id IN (${mineG})`).bind(user.id),
    db.prepare('DELETE FROM games WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM collabs WHERE project_id IN (SELECT id FROM projects WHERE owner_id = ?)').bind(user.id),
    db.prepare('DELETE FROM projects WHERE owner_id = ?').bind(user.id),
    ...['sessions', 'daily', 'wallets', 'inventory', 'level_progress', 'claims', 'collabs', 'presence', 'best_times', 'mail'].map((t) => db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(user.id)),
    db.prepare('DELETE FROM friends WHERE a = ? OR b = ?').bind(user.id, user.id),
    db.prepare('DELETE FROM dms WHERE from_id = ? OR to_id = ?').bind(user.id, user.id),
    db.prepare("UPDATE live_trades SET status = 'cancelled' WHERE (a = ? OR b = ?) AND status IN ('invite', 'open')").bind(user.id, user.id),
    db.prepare("UPDATE trades SET status = 'cancelled' WHERE status = 'open' AND (from_id = ? OR to_id = ?)").bind(user.id, user.id),
    db.prepare('DELETE FROM listings WHERE seller = ? AND status = \'open\'').bind(user.id),
    db.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ];
}

/* ---------------- players ---------------- */
async function findUsers(ctx) {
  needUser(ctx);
  const q = (ctx.url.searchParams.get('q') || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16);
  if (!q) return json({ users: [] });
  const { results } = await ctx.db.prepare('SELECT name, look FROM users WHERE name_lower LIKE ? AND banned = 0 ORDER BY name_lower LIMIT 10').bind(q + '%').all();
  return json({ users: results.map((u) => ({ name: u.name, look: lookOf(u.look) })) });
}
/* ---------------- mailbox ---------------- */
export const mailStmt = (db, uid, kind, title, text, ref = null, data = null) =>
  db.prepare('INSERT INTO mail (user_id, kind, title, body, ref, data, at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(uid, kind, String(title).slice(0, 90), String(text).slice(0, 600), ref, data ? JSON.stringify(data) : null, Date.now());
async function myMail(ctx) {
  const user = needUser(ctx);
  const { results } = await ctx.db.prepare('SELECT id, kind, title, body, data, at, read FROM mail WHERE user_id = ? ORDER BY at DESC LIMIT 60').bind(user.id).all();
  return json({ mail: results.map((x) => ({ ...x, read: !!x.read, data: x.data ? JSON.parse(x.data) : null })), unread: results.filter((x) => !x.read).length });
}
async function mailAction(ctx, id, input) {
  const user = needUser(ctx);
  const { db } = ctx;
  if (id === 'all') {
    if (input.action === 'read') await db.prepare('UPDATE mail SET read = 1 WHERE user_id = ?').bind(user.id).run();
    else if (input.action === 'delete') await db.prepare('DELETE FROM mail WHERE user_id = ? AND read = 1').bind(user.id).run();
    else fail(400, 'Unknown action.');
  } else if (input.action === 'delete') await db.prepare('DELETE FROM mail WHERE id = ? AND user_id = ?').bind(Number(id), user.id).run();
  else if (input.action === 'claim') {
    // mail with coins inside (like the welcome gift): claim once
    const row = await db.prepare('SELECT id, data FROM mail WHERE id = ? AND user_id = ?').bind(Number(id), user.id).first();
    const coins = row && row.data ? Math.floor(Number(JSON.parse(row.data).claim) || 0) : 0;
    if (!coins) fail(400, 'Nothing to claim in that mail.');
    try { await db.batch([db.prepare('INSERT INTO claims (user_id, what, at) VALUES (?, ?, ?)').bind(user.id, 'mail:' + row.id, Date.now()), ...coinStmts(db, user.id, coins, 'mail gift')]); }
    catch (e) { if (isConstraint(e)) fail(409, 'You already claimed that.'); throw e; }
    return json({ ok: true, coins, wallet: await getWallet(db, user.id) });
  } else fail(400, 'Unknown action.');
  return json({ ok: true });
}

/* ---------------- creators earn coins when people play and like their games ---------------- */
const CREATOR = { like: 3, play: 1, dailyCap: 300 };
async function payCreator(ctx, game, what) {
  const { db } = ctx, user = ctx.user;
  if (!user || !game.user_id || game.user_id === user.id) return;
  // each player counts once per game for plays (likes are already once per player)
  if (what === 'play') {
    const r = await db.prepare('INSERT OR IGNORE INTO claims (user_id, what, at) VALUES (?, ?, ?)').bind(user.id, 'pl:' + game.id, Date.now()).run();
    if (!r.meta.changes) return;
  }
  const today = Date.now() - (Date.now() % DAY), date = new Date(today).toISOString().slice(0, 10);
  const got = await db.prepare("SELECT COALESCE(SUM(delta), 0) AS n FROM ledger WHERE user_id = ? AND why LIKE 'creator%' AND at >= ?").bind(game.user_id, today).first();
  const coins = Math.min(CREATOR[what], Math.max(0, CREATOR.dailyCap - got.n));
  // one mail per game per day that keeps adding up
  const ref = `earn:${game.id}:${date}`;
  const old = await db.prepare('SELECT id, data FROM mail WHERE user_id = ? AND ref = ?').bind(game.user_id, ref).first();
  const d = old && old.data ? JSON.parse(old.data) : { game: game.id, name: game.name, likes: 0, plays: 0, coins: 0 };
  d[what === 'like' ? 'likes' : 'plays']++; d.coins += coins;
  const text = `Today "${d.name}" got ${d.plays} new ${d.plays === 1 ? 'player' : 'players'} and ${d.likes} ${d.likes === 1 ? 'like' : 'likes'}. You earned ${d.coins} coins from it.`;
  const stmts = [];
  if (coins) stmts.push(...coinStmts(db, game.user_id, coins, 'creator ' + game.id));
  stmts.push(old ? db.prepare('UPDATE mail SET body = ?, data = ?, at = ?, read = 0 WHERE id = ?').bind(text, JSON.stringify(d), Date.now(), old.id)
    : mailStmt(db, game.user_id, 'earn', `People are playing ${d.name}!`, text, ref, d));
  await db.batch(stmts);
}

/* ---------------- change my password ---------------- */
async function changePassword(ctx, input) {
  const user = needUser(ctx);
  const { db, env } = ctx;
  await tooManyFails(ctx);
  checkPassword(input.password);
  const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  if (!(await passwordMatches(db, env, u, String(input.old || '')))) { await addEvent(db, 'fail', ctx.ip); fail(401, "Your old password isn't right."); }
  const salt = randomId(16), hash = await sha256(user.token);
  await db.batch([
    db.prepare('UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(await hashPassword(input.password, salt, env), salt, u.id),
    // log out every other computer, but not this one
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(u.id, hash),
  ]);
  return json({ ok: true });
}

/* ---------------- friends ---------------- */
const MAX_FRIENDS = 100;
async function friendsList(ctx) {
  const user = needUser(ctx);
  const { db } = ctx;
  const { results } = await db.prepare(`SELECT f.a, f.b, f.status, u.id, u.name, u.display, u.pfp, u.look, u.seen AS site, p.world, p.code, p.at AS seen
    FROM friends f JOIN users u ON u.id = CASE WHEN f.a = ? THEN f.b ELSE f.a END
    LEFT JOIN presence p ON p.user_id = u.id
    WHERE (f.a = ? OR f.b = ?) AND u.banned = 0 ORDER BY u.name_lower LIMIT 300`).bind(user.id, user.id, user.id).all();
  const out = { friends: [], incoming: [], outgoing: [] };
  const games = [...new Set(results.filter((r) => r.status === 'ok' && r.world && !builtinWorld(r.world)).map((r) => r.world))];
  const names = {};
  if (games.length) {
    const g = await db.prepare(`SELECT id, name FROM games WHERE id IN (${games.map(() => '?').join(',')})`).bind(...games).all();
    for (const x of g.results) names[x.id] = x.name;
  }
  for (const r of results) {
    if (r.status === 'ok') {
      const on = r.world && r.seen > Date.now() - FRESH;
      // on the site (the page checks in every few seconds) but not in a world
      const site = !on && r.site > Date.now() - 3 * 60e3;
      out.friends.push({ name: r.name, display: r.display || undefined, pfp: r.pfp || undefined, look: lookOf(r.look), online: on ? { world: r.world, code: r.code, name: worldName(r.world) || names[r.world] || 'a player world' } : site ? { world: null, code: null, name: null, site: true } : null });
    } else if (r.b === user.id) out.incoming.push({ name: r.name, look: lookOf(r.look) });
    else out.outgoing.push({ name: r.name, look: lookOf(r.look) });
  }
  out.friends.sort((x, y) => (y.online ? 1 : 0) - (x.online ? 1 : 0));
  return json(out);
}
async function friendAction(ctx, input) {
  const user = needUser(ctx);
  const { db } = ctx;
  const them = await db.prepare('SELECT id, name, banned FROM users WHERE name_lower = ?').bind(String(input.name || '').toLowerCase().slice(0, 16)).first();
  if (!them || them.banned) fail(404, 'No player with that name.');
  if (them.id === user.id) fail(400, "You can't be friends with yourself (well, you can, but not here).");
  const now = Date.now();
  if (input.action === 'add' || input.action === 'accept') {
    const theirAsk = await db.prepare("SELECT 1 FROM friends WHERE a = ? AND b = ? AND status = 'pending'").bind(them.id, user.id).first();
    if (theirAsk) { await db.prepare("UPDATE friends SET status = 'ok', at = ? WHERE a = ? AND b = ?").bind(now, them.id, user.id).run(); return json({ ok: true, status: 'friends' }); }
    if (input.action === 'accept') fail(404, 'That friend request is gone.');
    const any = await db.prepare('SELECT status FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)').bind(user.id, them.id, them.id, user.id).first();
    if (any) return json({ ok: true, status: any.status === 'ok' ? 'friends' : 'sent' });
    const n = await db.prepare('SELECT COUNT(*) AS n FROM friends WHERE a = ? OR b = ?').bind(user.id, user.id).first();
    if (n.n >= MAX_FRIENDS) fail(429, `You can have up to ${MAX_FRIENDS} friends and requests.`);
    await db.prepare("INSERT INTO friends (a, b, status, at) VALUES (?, ?, 'pending', ?)").bind(user.id, them.id, now).run();
    return json({ ok: true, status: 'sent' });
  }
  if (input.action === 'remove') {
    await db.prepare('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)').bind(user.id, them.id, them.id, user.id).run();
    return json({ ok: true, status: 'none' });
  }
  fail(400, 'Unknown action.');
}

async function profile(ctx, name) {
  const { db } = ctx;
  const u = await db.prepare('SELECT id, name, created_at, banned, role, progress, title, display, pfp, tags FROM users WHERE name_lower = ?').bind(name.toLowerCase()).first();
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
  // badges: the ones the server checked, plus the ones saved with their progress
  let saved = {};
  try { saved = JSON.parse(u.progress || '{}').ach || {}; } catch (e) { /* none */ }
  const badges = { ...Object.fromEntries(Object.keys(saved).slice(0, 200).map((k) => [String(k).slice(0, 30), true])), ...items.badges };
  return json({ name: u.name, since: u.created_at, role: u.role || '', admin: isAdmin(ctx.env, u), title: u.title && (await titleOk(ctx.env, db, u.id, u, u.title, items.badges)) ? u.title : null, display: u.display || null, pfp: u.pfp || null, tags: cleanTags(u.tags), owner: isOwner(ctx.env, u), ...items, badges, faces: await facesBeaten(db, u.id), games: games.results.map(row), playing, ...(await followInfo(db, u.id, ctx.user && ctx.user.id)) });
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
  if ((w.world.shop || []).some((x) => isRude(x.n))) fail(400, 'Something in your shop has a blocked word.');
  if (w.world.mode === 'obby' && !(w.run && w.run.won)) fail(400, "Your recorded run didn't reach the goal. Beat your obby in Test, then publish right away.");
  return { kind, desc, visibility, name: w.world.n, style: w.world.mode, theme: w.world.sky, w: w.blocks, h: w.coins, data: w.world, thumb: w.thumb };
}
function row(g) {
  return {
    id: g.id, kind: g.kind || '2d', name: g.name, creator: g.creator, descr: g.descr, style: g.style, theme: g.theme, plays: g.plays, likes: g.likes, dislikes: g.dislikes || 0,
    created_at: g.created_at, visibility: g.visibility || 'public', reward: g.reward || 0, stars: g.stars || 0, pays: g.reward || (g.stars ? g.stars * RATED_PAY : 0), level: (g.kind || '2d') === '2d' ? JSON.parse(g.data) : undefined,
    world: g.kind === '3d' && g.withWorld ? JSON.parse(g.data) : undefined, blocks: g.kind === '3d' ? g.w : undefined,
    coins: g.kind === '3d' ? g.h : undefined, thumb: g.kind === '3d' ? g.thumb || '' : undefined,
  };
}
async function listGames(ctx) {
  const { db, url } = ctx;
  const kind = url.searchParams.get('kind') === '3d' ? '3d' : '2d';
  const sort = { new: 'created_at DESC', top: 'plays DESC, created_at DESC', liked: 'likes DESC, created_at DESC', reward: 'reward DESC, plays DESC', rated: 'stars DESC, plays DESC' }[url.searchParams.get('sort')] || 'created_at DESC';
  const style = url.searchParams.get('style');
  const q = (url.searchParams.get('q') || '').trim().slice(0, 40);
  const creator = (url.searchParams.get('creator') || '').trim().slice(0, 20);
  const page = Math.max(0, Math.min(200, parseInt(url.searchParams.get('page') || '0', 10) || 0));
  const where = ['hidden = 0', "visibility = 'public'", 'kind = ?'], args = [kind];
  if (['rush', 'adventure', 'obby', 'hangout'].includes(style)) { where.push('style = ?'); args.push(style); }
  if (url.searchParams.get('rewarding') === '1') where.push('reward > 0');
  if (url.searchParams.get('sort') === 'rated') where.push('stars > 0');
  if (creator) { where.push('creator = ? COLLATE NOCASE'); args.push(creator); }
  if (q) {
    const like = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    where.push("(name LIKE ? ESCAPE '\\' OR creator LIKE ? ESCAPE '\\')"); args.push(like, like);
  }
  const cols = kind === '3d' ? 'id, kind, name, creator, descr, style, theme, plays, likes, created_at, visibility, reward, stars, w, h, thumb' : '*';
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
  const sum = await voteSummary(ctx.db, id);
  const mine = ctx.user ? await ctx.db.prepare('SELECT stars FROM diff_votes WHERE game_id = ? AND user_id = ?').bind(id, ctx.user.id).first() : null;
  return json({ game: { ...row({ ...g, withWorld: true }), votes: sum.votes, voteStars: sum.stars || 0, myVote: mine ? mine.stars : 0 } });
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
  // people who follow this player hear about it
  if (f.visibility === 'public') await tellFollowers(ctx, user, { id, kind: f.kind, name: f.name }).catch(() => {});
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
  if (input.only === 'reward') {
    // Builders set their own levels' pay; Builder Pros can set anyone's (and the admin hears about it)
    const row = await ctx.db.prepare('SELECT id, user_id FROM games WHERE id = ?').bind(id).first();
    if (!row) fail(404, 'That game was not found. It may have been removed.');
    if (!ctx.user) fail(401, 'Log in first.');
    return setPay(ctx, row, input.amount);
  }
  const g = await ownGame(ctx, id);
  if (input.only === 'visibility') {
    if (!VIS.includes(input.visibility)) fail(400, 'Pick public, unlisted or private.');
    await ctx.db.prepare('UPDATE games SET visibility = ? WHERE id = ?').bind(input.visibility, id).run();
    return json({ ok: true, id });
  }
  const f = await checkFields(ctx, { ...input, kind: g.kind || '2d' });
  // a changed game has to be checked by an admin again before it pays coins
  const old = await ctx.db.prepare('SELECT data, reward, stars FROM games WHERE id = ?').bind(id).first();
  // changing the level itself resets its pay and its rating (an admin checks it again)
  const same = old && old.data === JSON.stringify(f.data), reward = same ? old.reward : 0, stars = same ? old.stars || 0 : 0;
  await ctx.db.prepare('UPDATE games SET name = ?, descr = ?, style = ?, theme = ?, w = ?, h = ?, data = ?, visibility = ?, thumb = ?, reward = ?, stars = ?, updated_at = ? WHERE id = ?')
    .bind(f.name, f.desc, f.style, f.theme, f.w, f.h, JSON.stringify(f.data), f.visibility, f.thumb || null, reward, stars, Date.now(), id).run();
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
  const game = await db.prepare('SELECT id, name, visibility, user_id, project_id FROM games WHERE id = ? AND hidden = 0').bind(id).first();
  if (!game || !(await canSeeGame(ctx, game))) fail(404, 'That game was not found. It may have been removed.');
  if (action === 'play') {
    const r = await db.prepare('INSERT OR IGNORE INTO plays (game_id, who, at) VALUES (?, ?, ?)').bind(id, ctx.ip, Date.now()).run();
    if (r.meta.changes) { await db.prepare('UPDATE games SET plays = plays + 1 WHERE id = ?').bind(id).run(); await checkPopular(db, id).catch(() => {}); }
    await payCreator(ctx, game, 'play').catch(() => {});
    return json({ ok: true });
  }
  const user = needUser(ctx);
  const who = 'u:' + user.id;
  if (action === 'like' || action === 'dislike') {
    const added = await rateGame(ctx, game, who, action);
    if (added && action === 'like') { await payCreator(ctx, game, 'like').catch(() => {}); await checkPopular(db, id).catch(() => {}); }
    const g = await db.prepare('SELECT likes, dislikes FROM games WHERE id = ?').bind(id).first();
    return json({ ok: true, likes: g.likes, dislikes: g.dislikes || 0, mine: action });
  }
  const input = await body(ctx.request);
  const reason = ['rude', 'personal', 'broken', 'copied', 'other'].includes(input.reason) ? input.reason : 'other';
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM reports WHERE who = ? AND at > ?').bind(who, Date.now() - DAY).first();
  if (recent.n >= LIMITS_PER.reportsDay) fail(429, 'You have sent a lot of reports today. Try again tomorrow.');
  const r = await db.prepare('INSERT OR IGNORE INTO reports (game_id, who, reason, at) VALUES (?, ?, ?, ?)').bind(id, who, reason, Date.now()).run();
  if (r.meta.changes) {
    await db.prepare(`UPDATE games SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= ${HIDE_AFTER_REPORTS} THEN 1 ELSE hidden END WHERE id = ?`).bind(id).run();
    // just reached the limit: hidden and held for the admin to review
    const after = await db.prepare('SELECT reports, name, user_id FROM games WHERE id = ?').bind(id).first();
    if (after && after.reports === HIDE_AFTER_REPORTS) {
      if (after.user_id) await mailStmt(db, after.user_id, 'warning', `"${after.name}" is hidden for review`, `${HIDE_AFTER_REPORTS} players reported "${after.name}", so it's hidden until the admin checks it. If it's fine, it comes back.`).run();
      await mailAdmin(ctx, 'review', `"${after.name}" needs a review`, `"${after.name}" got ${HIDE_AFTER_REPORTS} reports from different players and is hidden. Open Admin > Games to show it again or take it down.`);
    }
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
  if (ctx.user) mine = (await ctx.db.prepare('SELECT code, players, bots, bot_skill AS skill FROM servers WHERE world = ? AND private = 1 AND owner_id = ? ORDER BY created_at DESC').bind(world, ctx.user.id).all()).results;
  return json({ servers: results, mine, size: ROOM_SIZE });
}
// Bots in your private server of a Blockyard minigame world: how many and how smart.
async function serverBots(ctx, code, input) {
  const user = needUser(ctx);
  const s = await ctx.db.prepare('SELECT code, world, private, owner_id FROM servers WHERE code = ?').bind(code).first();
  if (!s || s.owner_id !== user.id || !s.private) fail(404, 'That private server was not found.');
  const b = builtinWorld(s.world);
  if (!b || !b.game) fail(400, "Bots only work in Blockyard's minigame worlds.");
  const n = Math.floor(Number(input.bots) || 0), skill = BOTS.skills.includes(input.skill) ? input.skill : 'normal';
  if (n < 0 || n > BOTS.max) fail(400, `Pick 0 to ${BOTS.max} bots.`);
  await ctx.db.prepare('UPDATE servers SET bots = ?, bot_skill = ? WHERE code = ?').bind(n, skill, code).run();
  return json({ ok: true, code, bots: n, skill });
}
// The owner closes one of their private servers: everyone in it is sent out, and the code stops working.
async function closeServer(ctx, code) {
  const user = needUser(ctx), { db, env } = ctx;
  const s = await db.prepare('SELECT code, owner_id, private FROM servers WHERE code = ?').bind(code).first();
  if (!s || !s.private || (s.owner_id !== user.id && !user.admin)) fail(404, 'That private server was not found.');
  await db.batch([db.prepare('DELETE FROM servers WHERE code = ?').bind(code), db.prepare('DELETE FROM presence WHERE code = ?').bind(code)]);
  if (env.ROOMS) await env.ROOMS.get(env.ROOMS.idFromName('p:' + code)).fetch('https://room/close').catch(() => {});
  return json({ ok: true });
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
  const u = await db.prepare('SELECT look, title, display, tags FROM users WHERE id = ?').bind(user.id).first();
  const w = await getWallet(db, user.id);
  const look = cleanLook(lookOf(u && u.look), w.items);
  const ticket = await signTicket(await roomSecret(env), { k: 'play', r: 'p:' + code, u: user.id, n: user.name, l: look, v: w.level, o: user.role || undefined, t: (u && u.title) || undefined, d: (u && u.display) || undefined, g: u && u.tags ? cleanTags(u.tags) : undefined, a: user.admin, w: world.id, c: code, x: now + 20e3 });
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
  headers.set('x-room', JSON.stringify({ kind: p.k, room: p.r, uid: p.u, name: p.n, look: p.l, lvl: p.v || 1, role: p.o || '', title: p.t || '', display: p.d || '', tags: p.g || [], admin: !!p.a, world: p.w, code: p.c, project: p.p }));
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
  // today's course: a picked or top player level, or Blockyard's own
  const pick = validDate(date) ? await dailyPick(db, date) : null;
  return json({ date, top, me: mine, players: total.n, level: pick && pick.game ? toWire(pick.level) : undefined, source: pick ? { how: pick.how, game: pick.game } : undefined });
}
async function postDaily(ctx, input) {
  const user = needUser(ctx);
  const { db, env } = ctx;
  const date = validDate(String(input.date || ''));
  if (!date) fail(400, "That daily challenge isn't open anymore.");
  const pick = await dailyPick(db, date);
  const run = await verify(env, { type: '2d', raw: true, level: pick.level, replay: String(input.replay || ''), opts: { maxSteps: maxSteps(env), stopOnDeath: true } });
  const progress = run.won ? 1 : Math.round(run.progress * 1000) / 1000;
  const before = await db.prepare('SELECT won FROM daily WHERE date = ? AND user_id = ?').bind(date, user.id).first();
  const stmts = [db.prepare(`INSERT INTO daily (date, user_id, progress, won, at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (date, user_id) DO UPDATE SET progress = excluded.progress, won = excluded.won, at = excluded.at WHERE excluded.progress > daily.progress`)
    .bind(date, user.id, progress, run.won ? 1 : 0, Date.now())];
  const earned = run.won && !(before && before.won) ? REWARD.dailyWin : 0;
  // the claim row makes sure two runs sent at the same moment can't both pay
  if (earned) stmts.push(db.prepare('INSERT INTO claims (user_id, what, at) VALUES (?, ?, ?)').bind(user.id, 'd:' + date, Date.now()), ...coinStmts(db, user.id, earned, 'run daily'), ...questBumps(db, user.id, { daily: 1 }));
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
    const votes = await db.prepare('SELECT game_id, COUNT(*) AS n, AVG(stars) AS avg FROM diff_votes GROUP BY game_id').all();
    const vmap = Object.fromEntries(votes.results.map((v) => [v.game_id, v]));
    return json({ games: results.map((g) => ({ ...row(g), reports: g.reports, hidden: !!g.hidden, reasons: byGame[g.id] || {}, suggested: g.suggested || 0, votes: vmap[g.id] ? vmap[g.id].n : 0, voteAvg: vmap[g.id] ? Math.round(vmap[g.id].avg * 10) / 10 : 0 })) });
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
    const bodyIn = await body(ctx.request), { action } = bodyIn;
    const r = await db.prepare('SELECT * FROM chat_reports WHERE id = ?').bind(Number(m[1])).first();
    if (!r) fail(404, 'That report is gone.');
    const input = { action, confirm: bodyIn.confirm, falseReport: bodyIn.falseReport };
    if (action === 'ban' || action === 'warn') {
      const u = await db.prepare('SELECT id, name FROM users WHERE id = ?').bind(r.target_id).first();
      if (u && isAdmin(env, u)) fail(400, `You can't ${action} an admin.`);
      const open = await db.prepare("SELECT reporter FROM chat_reports WHERE target_id = ? AND status = 'open'").bind(r.target_id).all();
      let w = null;
      if (u && action === 'ban') await banUser(ctx, u);
      if (u && action === 'warn') {
        w = await addWarning(ctx, u.id, `An admin read a report about what you said (${r.reason}) and gave you a warning. Be kind in chat!`, { confirm: input.confirm });
        if (w.needConfirm) return json({ ok: false, ...w });
      }
      await db.prepare("UPDATE chat_reports SET status = 'done' WHERE target_id = ? AND status = 'open'").bind(r.target_id).run();
      await creditReporters(db, open.results.map((x) => x.reporter));
      return json({ ok: true, ...(w || {}) });
    } else if (action === 'dismiss') {
      // a false, mean or spam report: the admin can warn whoever sent it (their choice, never automatic)
      let w = null;
      if (input.falseReport) {
        const rep = await db.prepare('SELECT id, name FROM users WHERE id = ?').bind(r.reporter).first();
        if (rep && !isAdmin(env, rep)) {
          w = await addWarning(ctx, rep.id, `You reported ${r.target}, but the admin found the report was false or spam. Only report real problems.`, { confirm: input.confirm });
          if (w.needConfirm) return json({ ok: false, ...w });
        }
      }
      await db.prepare("UPDATE chat_reports SET status = 'dismissed' WHERE id = ?").bind(r.id).run();
      return json({ ok: true, ...(w || {}) });
    } else fail(400, 'Unknown action.');
  }
  m = path.match(/^\/games\/([A-Za-z0-9]{8})$/);
  if (m && method === 'POST') {
    const input = await body(ctx.request);
    const { action } = input;
    if (action === 'hide') await db.prepare('UPDATE games SET hidden = 1 WHERE id = ?').bind(m[1]).run();
    else if (action === 'show') await db.prepare('UPDATE games SET hidden = 0 WHERE id = ?').bind(m[1]).run();
    else if (action === 'clear') await db.batch([db.prepare('UPDATE games SET reports = 0, hidden = 0 WHERE id = ?').bind(m[1]), db.prepare('DELETE FROM reports WHERE game_id = ?').bind(m[1])]);
    else if (action === 'delete') await removeGame(db, m[1]);
    else if (action === 'warn') {
      // reviewed and it's bad: stays hidden, the maker gets a warning, and the players who reported it get credit
      const g = await db.prepare('SELECT id, name, user_id FROM games WHERE id = ?').bind(m[1]).first();
      if (!g) fail(404, 'That game is gone.');
      let w = { warnings: 0 };
      if (g.user_id) {
        w = await addWarning(ctx, g.user_id, `Your level "${g.name}" was reviewed and taken down${input.note ? ': ' + String(input.note).slice(0, 200) : '.'}`, { confirm: input.confirm });
        if (w.needConfirm) return json({ ok: false, ...w });
      }
      await db.prepare('UPDATE games SET hidden = 1 WHERE id = ?').bind(g.id).run();
      const reps = await db.prepare('SELECT who FROM reports WHERE game_id = ?').bind(g.id).all();
      await creditReporters(db, reps.results.map((x) => (String(x.who).startsWith('u:') ? x.who.slice(2) : null)));
      return json({ ok: true, ...w });
    } else if (action === 'reward') {
      const amount = Math.floor(Number(input.amount) || 0);
      if (amount < 0 || amount > 1000) fail(400, 'Rewards can be 0 to 1000 coins.');
      await db.prepare('UPDATE games SET reward = ? WHERE id = ?').bind(amount, m[1]).run();
    } else if (action === 'stars') { // difficulty rating, 0 = unrated
      const n = Math.floor(Number(input.amount) || 0);
      if (n < 0 || n > 10) fail(400, 'Ratings are 0 (unrated) to 10 stars.');
      await db.prepare('UPDATE games SET stars = ? WHERE id = ?').bind(n, m[1]).run();
    } else fail(400, 'Unknown action.');
    return json({ ok: true });
  }
  if (path === '/daily' && method === 'GET') return dailyPicks(db);
  if (path === '/daily' && method === 'POST') { const input = await body(ctx.request); return setDailyPick(db, String(input.date || ''), String(input.game || '').replace(/.*#\/p\//, '').trim()); }
  if (path === '/notify' && method === 'GET') return json(await adminNotify(db));
  if (path === '/notify' && method === 'POST') return json(await setAdminNotify(db, await body(ctx.request)));
  if (path === '/log' && method === 'GET') {
    const { results } = await db.prepare('SELECT admin, path, detail, at FROM admin_log ORDER BY id DESC LIMIT 200').all();
    return json({ log: results.map((x) => ({ ...x, detail: JSON.parse(x.detail || '{}') })) });
  }
  if (path === '/deals' && method === 'GET') {
    const cfg = await dealSettings(db);
    const days = Array.from({ length: 7 }, (_, i) => featured(new Date(Date.now() + i * DAY).toISOString().slice(0, 10), cfg));
    return json({ cfg, days, pool: dealPool() });
  }
  if (path === '/deals' && method === 'POST') {
    const input = await body(ctx.request);
    const cfg = await dealSettings(db);
    if (input.off != null) cfg.off = input.off;
    if (input.count != null) cfg.count = input.count;
    if (input.pin && typeof input.pin === 'object') {
      if (Array.isArray(input.pin.items) && input.pin.items.length) cfg.pins[String(input.pin.date)] = input.pin.items; else delete cfg.pins[String(input.pin.date)];
    }
    if (input.sale === null) cfg.sale = null;
    else if (input.sale && typeof input.sale === 'object') {
      const hours = Math.max(1, Math.min(24 * 14, Math.floor(Number(input.sale.hours) || 24)));
      cfg.sale = { off: input.sale.off, until: Date.now() + hours * 3600e3 };
    }
    const clean = cleanDeals(cfg);
    await db.prepare("INSERT INTO settings (key, value) VALUES ('deals', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(clean)).run();
    return json({ ok: true, cfg: clean });
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
    // limited items never restock by themselves; only the admin (the owner) can put more in
    await db.prepare('INSERT INTO stock (item, left) VALUES (?, ?) ON CONFLICT (item) DO UPDATE SET left = excluded.left').bind(f.key, left).run();
    return json({ ok: true });
  }
  m = path.match(/^\/users\/([A-Za-z0-9_]{3,16})$/);
  if (m && method === 'GET') {
    const u = await db.prepare('SELECT id, name, banned, created_at, role, warnings, tags, display FROM users WHERE name_lower = ?').bind(m[1].toLowerCase()).first();
    if (!u) fail(404, 'No user with that name.');
    const [w, ledger, games] = await Promise.all([
      getWallet(db, u.id),
      db.prepare('SELECT delta, why, at FROM ledger WHERE user_id = ? ORDER BY at DESC LIMIT 25').bind(u.id).all(),
      db.prepare('SELECT COUNT(*) AS n FROM games WHERE user_id = ?').bind(u.id).first(),
    ]);
    return json({ name: u.name, banned: !!u.banned, since: u.created_at, admin: isAdmin(env, u), role: u.role || '', tags: cleanTags(u.tags), display: u.display || null, warnings: u.warnings || 0, wallet: w, ledger: ledger.results, games: games.n });
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
      const note = action === 'grant' && amount > 0 && u.id !== user.id ? [mailStmt(db, u.id, 'gift', `You got ${amount} coins!`, `${user.name} gave you ${amount} coins.${input.note ? ' "' + String(input.note).slice(0, 200) + '"' : ''}`)] : [];
      try { await db.batch([...coinStmts(db, u.id, amount, 'admin ' + user.name), ...note]); } catch (e) { fail(400, "They don't have that many coins to take away."); }
      return json({ ok: true, wallet: await getWallet(db, u.id) });
    }
    if (action === 'give' || action === 'take') {
      const f = findItem(input.item);
      if (!f) fail(400, 'Unknown item.');
      const note = action === 'give' && u.id !== user.id ? [mailStmt(db, u.id, 'gift', `You got a ${f.item.name}!`, `${user.name} gave you a ${f.item.name}. It's in My Items.`)] : [];
      try { await db.batch([...itemStmts(db, u.id, f.key, action === 'give' ? 1 : -1), ...note]); } catch (e) { if (isConstraint(e)) fail(400, "They don't have that item."); throw e; }
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
    if (action === 'role') {
      const role = ROLES.includes(input.role) ? input.role : null;
      if (role === null) fail(400, 'Unknown role.');
      await db.batch([
        db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, u.id),
        role === 'builderpro' ? mailStmt(db, u.id, 'role', "You're a Builder Pro now!", `${user.name} made you a Builder Pro. Open the Builder page (in your account menu) to set what your levels pay, and other players' levels too (up to 100 coins). The admin sees every change you make to someone else's level.`)
          : role ? mailStmt(db, u.id, 'role', "You're a Builder now!", `${user.name} made you a Builder. You get a Builder badge, and you can make your own published levels and worlds pay coins on the Builder page (in your account menu).`)
          : mailStmt(db, u.id, 'role', 'Your role was removed', `${user.name} took away your Builder role.`),
      ]);
      return json({ ok: true, role });
    }
    if (action === 'resetname') {
      // take away a display name that isn't ok (they go back to their username)
      await db.batch([db.prepare('UPDATE users SET display = NULL WHERE id = ?').bind(u.id), mailStmt(db, u.id, 'role', 'Your display name was reset', `${user.name} reset your display name. Everyone sees your username again. You can pick a new display name on your profile.`)]);
      return json({ ok: true });
    }
    if (action === 'tag') {
      // OG and Beta Tester: extra roles (they stack with Builder), each one also a title
      const tags = await setTag(ctx, u, String(input.tag || ''), input.on !== false, user.name);
      return json({ ok: true, tags });
    }
    if (action === 'kick') { if (isAdmin(env, u)) fail(400, "You can't kick an admin."); await kickEverywhere(env, db, u.id, 'An admin removed you from this server.'); return json({ ok: true }); }
    if (isAdmin(env, u)) fail(400, "You can't ban an admin.");
    if (action === 'ban') await banUser(ctx, u);
    else if (action === 'warn') {
      // warning 1, 2, 3, then deleting the account (the admin has to confirm that)
      const w = await addWarning(ctx, u.id, `${user.name} gave you a warning.${input.note ? ' "' + String(input.note).slice(0, 200) + '"' : ''}`, { confirm: input.confirm });
      return json({ ok: !w.needConfirm, ...w });
    } else if (action === 'delete') {
      if (input.confirm !== 'delete') fail(400, 'Confirm first: deleting an account can not be undone.');
      await deleteAccount(ctx, u, input.note || 'deleted by the admin');
      return json({ ok: true, deleted: true });
    } else if (action === 'unwarn') {
      await db.batch([
        db.prepare('UPDATE users SET warnings = MAX(0, warnings - 1) WHERE id = ?').bind(u.id),
        mailStmt(db, u.id, 'warning', 'A warning was removed', `${user.name} took away one of your warnings. Nice!`),
      ]);
      const w = await db.prepare('SELECT warnings FROM users WHERE id = ?').bind(u.id).first();
      return json({ ok: true, warnings: w.warnings });
    } else if (action === 'unban') {
      await db.batch([
        db.prepare('UPDATE users SET banned = 0, warnings = MIN(warnings, 2) WHERE id = ?').bind(u.id),
        db.prepare('UPDATE games SET hidden = 0 WHERE user_id = ? AND reports < ?').bind(u.id, HIDE_AFTER_REPORTS),
      ]);
    } else fail(400, 'Unknown action.');
    return json({ ok: true });
  }
  fail(404, 'Unknown admin address.');
}
