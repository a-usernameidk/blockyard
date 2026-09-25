// Blockyard backend: a Cloudflare Worker with a D1 database.
// It stores published levels and handles plays, likes and reports.
// Everything that is not /api/... is a normal file from the public folder.
//
// Settings you can add in Cloudflare (Worker > Settings > Variables and Secrets):
//   ADMIN_KEY  a long password for /admin.html (use type "Secret")
//   SALT       any random text, makes the anonymous visitor IDs harder to guess (optional)

import { normalizeLevel, toWire, cleanText, isRude, LIMITS } from '../public/js/format.js';

const PAGE = 24;
const LIMIT_PUBLISH_HOUR = 5, LIMIT_PUBLISH_DAY = 20, LIMIT_REPORTS_DAY = 20, HIDE_AFTER_REPORTS = 3;

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
];

// The tables are created automatically the first time the Worker runs,
// so there's nothing to set up by hand in the database console.
let ready = null;
function ensureSchema(db) {
  if (!ready) ready = db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => { ready = null; throw e; });
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
  if (path === '/health') return json({ ok: true, db: !!env.DB });
  if (!env.DB) fail(503, 'The database is not connected yet. Check the D1 binding named DB.');
  await ensureSchema(env.DB);
  const db = env.DB;
  const who = await visitorId(request, env);
  let m;

  if (path === '/games' && method === 'GET') return listGames(db, url);
  if (path === '/games' && method === 'POST') return publish(db, who, await body(request));
  if ((m = path.match(/^\/games\/([A-Za-z0-9]{8})$/))) {
    if (method === 'GET') return getGame(db, m[1]);
    if (method === 'PUT') return updateGame(db, m[1], request.headers.get('x-edit-key'), await body(request));
    if (method === 'DELETE') return deleteGame(db, m[1], request.headers.get('x-edit-key'));
  }
  if ((m = path.match(/^\/games\/([A-Za-z0-9]{8})\/(play|like|report)$/)) && method === 'POST') {
    const id = m[1];
    const game = await db.prepare('SELECT id FROM games WHERE id = ? AND hidden = 0').bind(id).first();
    if (!game) fail(404, 'That level was not found. It may have been removed.');
    if (m[2] === 'play') {
      const r = await db.prepare('INSERT OR IGNORE INTO plays (game_id, who, at) VALUES (?, ?, ?)').bind(id, who, Date.now()).run();
      if (r.meta.changes) await db.prepare('UPDATE games SET plays = plays + 1 WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
    if (m[2] === 'like') {
      const r = await db.prepare('INSERT OR IGNORE INTO likes (game_id, who) VALUES (?, ?)').bind(id, who).run();
      if (r.meta.changes) await db.prepare('UPDATE games SET likes = likes + 1 WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
    return report(db, id, who, await body(request));
  }
  if (path.startsWith('/admin/')) return admin(db, env, request, path.slice(6), method);
  fail(404, 'Unknown address.');
}

async function body(request) {
  const text = await request.text();
  if (text.length > 100000) fail(413, 'That level is too big to publish.');
  try { return JSON.parse(text || '{}'); } catch (e) { fail(400, 'The server could not read that request.'); }
}

// An anonymous ID per visitor (a scrambled IP address) used only to stop spam.
async function visitorId(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  return (await sha256(ip + '|' + (env.SALT || 'blockyard'))).slice(0, 32);
}
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomId(n) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let out = '';
  for (const b of bytes) out += abc[b % abc.length];
  return out;
}

function checkFields(input) {
  let level;
  try { level = normalizeLevel(input.level); } catch (e) { fail(400, e.message); }
  const creator = cleanText(input.creator, LIMITS.creator);
  const desc = cleanText(input.desc, LIMITS.desc);
  if (!creator) fail(400, 'Add a nickname so people know who made it.');
  if (isRude(level.n) || isRude(creator) || isRude(desc)) fail(400, 'Something in the name, nickname or description has a blocked word.');
  return { level, creator, desc };
}

function row(g, withLevel = true) {
  const out = { id: g.id, name: g.name, creator: g.creator, descr: g.descr, style: g.style, theme: g.theme, plays: g.plays, likes: g.likes, created_at: g.created_at };
  if (withLevel) out.level = JSON.parse(g.data);
  return out;
}

async function listGames(db, url) {
  const sort = { new: 'created_at DESC', top: 'plays DESC, created_at DESC', liked: 'likes DESC, created_at DESC' }[url.searchParams.get('sort')] || 'created_at DESC';
  const style = url.searchParams.get('style');
  const q = (url.searchParams.get('q') || '').trim().slice(0, 40);
  const page = Math.max(0, Math.min(200, parseInt(url.searchParams.get('page') || '0', 10) || 0));
  const where = ['hidden = 0'], args = [];
  if (style === 'rush' || style === 'adventure') { where.push('style = ?'); args.push(style); }
  if (q) {
    const like = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    where.push("(name LIKE ? ESCAPE '\\' OR creator LIKE ? ESCAPE '\\')"); args.push(like, like);
  }
  const sql = `SELECT * FROM games WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT ? OFFSET ?`;
  const { results } = await db.prepare(sql).bind(...args, PAGE + 1, page * PAGE).all();
  return json({ games: results.slice(0, PAGE).map((g) => row(g)), more: results.length > PAGE });
}

async function getGame(db, id) {
  const g = await db.prepare('SELECT * FROM games WHERE id = ? AND hidden = 0').bind(id).first();
  if (!g) fail(404, 'That level was not found. It may have been removed.');
  return json({ game: row(g) });
}

async function publish(db, who, input) {
  const { level, creator, desc } = checkFields(input);
  const now = Date.now();
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM games WHERE creator_hash = ? AND created_at > ?').bind(who, now - 3600e3).first();
  if (recent.n >= LIMIT_PUBLISH_HOUR) fail(429, `You can publish ${LIMIT_PUBLISH_HOUR} levels an hour. Take a break and try again later.`);
  const today = await db.prepare('SELECT COUNT(*) AS n FROM games WHERE creator_hash = ? AND created_at > ?').bind(who, now - 86400e3).first();
  if (today.n >= LIMIT_PUBLISH_DAY) fail(429, `You can publish ${LIMIT_PUBLISH_DAY} levels a day. Try again tomorrow.`);
  const id = randomId(8), editKey = randomId(32);
  await db.prepare(`INSERT INTO games (id, name, creator, descr, style, theme, w, h, data, edit_hash, creator_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, level.n, creator, desc, level.style, level.theme, level.w, level.h, JSON.stringify(toWire(level)), await sha256(editKey), who, now, now).run();
  return json({ id, editKey }, 201);
}

async function ownGame(db, id, key) {
  if (!key) fail(403, 'Missing the edit key for this level.');
  const g = await db.prepare('SELECT id, edit_hash FROM games WHERE id = ?').bind(id).first();
  if (!g) fail(404, 'That level was not found. It may have been removed.');
  if (g.edit_hash !== await sha256(key)) fail(403, "This browser doesn't have the edit key for that level.");
  return g;
}

async function updateGame(db, id, key, input) {
  await ownGame(db, id, key);
  const { level, creator, desc } = checkFields(input);
  await db.prepare('UPDATE games SET name = ?, creator = ?, descr = ?, style = ?, theme = ?, w = ?, h = ?, data = ?, updated_at = ? WHERE id = ?')
    .bind(level.n, creator, desc, level.style, level.theme, level.w, level.h, JSON.stringify(toWire(level)), Date.now(), id).run();
  return json({ ok: true, id });
}

async function deleteGame(db, id, key) {
  await ownGame(db, id, key);
  await removeGame(db, id);
  return json({ ok: true });
}
function removeGame(db, id) {
  return db.batch(['games WHERE id', 'likes WHERE game_id', 'plays WHERE game_id', 'reports WHERE game_id'].map((t) => db.prepare(`DELETE FROM ${t} = ?`).bind(id)));
}

async function report(db, id, who, input) {
  const reasons = ['rude', 'personal', 'broken', 'copied', 'other'];
  const reason = reasons.includes(input.reason) ? input.reason : 'other';
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM reports WHERE who = ? AND at > ?').bind(who, Date.now() - 86400e3).first();
  if (recent.n >= LIMIT_REPORTS_DAY) fail(429, 'You have sent a lot of reports today. Try again tomorrow.');
  const r = await db.prepare('INSERT OR IGNORE INTO reports (game_id, who, reason, at) VALUES (?, ?, ?, ?)').bind(id, who, reason, Date.now()).run();
  if (r.meta.changes) {
    await db.prepare(`UPDATE games SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= ${HIDE_AFTER_REPORTS} THEN 1 ELSE hidden END WHERE id = ?`).bind(id).run();
  }
  return json({ ok: true });
}

/* ---------------- admin (for you, the owner) ---------------- */
async function admin(db, env, request, path, method) {
  if (!env.ADMIN_KEY) fail(503, 'Admin is off. Add a secret called ADMIN_KEY in the Worker settings to turn it on.');
  const given = new TextEncoder().encode(request.headers.get('x-admin-key') || '');
  const real = new TextEncoder().encode(env.ADMIN_KEY);
  const same = given.length === real.length && crypto.subtle.timingSafeEqual(given, real);
  if (!same) fail(403, 'Wrong admin password.');

  if (path === '/games' && method === 'GET') {
    const { results } = await db.prepare('SELECT * FROM games ORDER BY hidden DESC, reports DESC, created_at DESC LIMIT 100').all();
    const reasons = await db.prepare('SELECT game_id, reason, COUNT(*) AS n FROM reports GROUP BY game_id, reason').all();
    const byGame = {};
    for (const r of reasons.results) (byGame[r.game_id] ||= {})[r.reason] = r.n;
    return json({ games: results.map((g) => ({ ...row(g), reports: g.reports, hidden: !!g.hidden, reasons: byGame[g.id] || {} })) });
  }
  const m = path.match(/^\/games\/([A-Za-z0-9]{8})$/);
  if (m && method === 'POST') {
    const { action } = await body(request);
    if (action === 'hide') await db.prepare('UPDATE games SET hidden = 1 WHERE id = ?').bind(m[1]).run();
    else if (action === 'show') await db.prepare('UPDATE games SET hidden = 0 WHERE id = ?').bind(m[1]).run();
    else if (action === 'clear') await db.batch([db.prepare('UPDATE games SET reports = 0, hidden = 0 WHERE id = ?').bind(m[1]), db.prepare('DELETE FROM reports WHERE game_id = ?').bind(m[1])]);
    else if (action === 'delete') await removeGame(db, m[1]);
    else fail(400, 'Unknown action.');
    return json({ ok: true });
  }
  fail(404, 'Unknown admin address.');
}
