// Tycoon: everyone's own town that makes real coins (the rules are in public/js/tycoon.js).
// The server keeps each town and moves it forward in time whenever you look at it, build, or collect,
// so nothing the game sends can make gold or coins appear. Collecting is capped at TY.dailyCap coins a day.
import { json, fail, needUser, body } from './util.js';
import { coinStmts, getWallet } from './econ.js';
import { TY, SPOTS, newTycoon, cleanTycoon, advance, buy, stats, nextOf } from '../public/js/tycoon.js';

export const TYCOON_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS tycoons (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, collected INTEGER NOT NULL DEFAULT 0)',
];

export async function tycoonRoute(ctx, path, method) {
  let m;
  if (path === '/tycoon' && method === 'GET') return mine(ctx);
  if (path === '/tycoon/buy' && method === 'POST') return build(ctx, await body(ctx.request));
  if (path === '/tycoon/collect' && method === 'POST') return collect(ctx);
  if ((m = path.match(/^\/tycoon\/of\/([A-Za-z0-9_]{3,20})$/)) && method === 'GET') return theirs(ctx, m[1]);
  return null;
}

const dayStart = () => Date.now() - (Date.now() % 86400e3);
async function load(db, uid) {
  const row = await db.prepare('SELECT data, version FROM tycoons WHERE user_id = ?').bind(uid).first();
  if (!row) {
    const s = newTycoon();
    await db.prepare('INSERT OR IGNORE INTO tycoons (user_id, data, version) VALUES (?, ?, 0)').bind(uid, JSON.stringify(s)).run();
    return { s, version: 0 };
  }
  let s; try { s = JSON.parse(row.data); } catch (e) { s = null; }
  return { s: cleanTycoon(s), version: row.version };
}
async function todayGot(db, uid) {
  const r = await db.prepare("SELECT COALESCE(SUM(delta), 0) AS n FROM ledger WHERE user_id = ? AND why = 'tycoon' AND at >= ?").bind(uid, dayStart()).first();
  return r ? r.n : 0;
}
function out(s, extra = {}) {
  const st = stats(s);
  return { tycoon: { ...s, gold: Math.floor(s.gold), vault: Math.floor(s.vault) }, stats: st, next: Object.fromEntries(SPOTS.map((x) => [x.id, nextOf(s, x.id)])), now: Date.now(), cap: TY.dailyCap, ...extra };
}
// Saves only if nobody else changed the town in the meantime (two tabs clicking at once can't double anything).
const saveStmt = (db, uid, s, version) => db.prepare('UPDATE tycoons SET data = ?, version = version + 1 WHERE user_id = ? AND version = ?').bind(JSON.stringify(s), uid, version);

async function mine(ctx) {
  const user = needUser(ctx), { db } = ctx;
  const { s } = await load(db, user.id);
  advance(s, Date.now());
  return json(out(s, { today: await todayGot(db, user.id) }));
}
async function theirs(ctx, name) {
  const { db } = ctx;
  const u = await db.prepare('SELECT id, name FROM users WHERE name_lower = ? AND banned = 0').bind(name.toLowerCase()).first();
  if (!u) fail(404, 'No player with that name.');
  const row = await db.prepare('SELECT data FROM tycoons WHERE user_id = ?').bind(u.id).first();
  let s; try { s = row ? JSON.parse(row.data) : null; } catch (e) { s = null; }
  s = row ? cleanTycoon(s) : newTycoon();
  advance(s, Date.now());
  return json(out(s, { owner: u.name }));
}
async function build(ctx, input) {
  const user = needUser(ctx), { db } = ctx;
  const { s, version } = await load(db, user.id);
  advance(s, Date.now());
  const err = buy(s, String(input.spot || ''));
  if (err) fail(400, err);
  const r = await saveStmt(db, user.id, s, version).run();
  if (!r.meta.changes) fail(409, 'Your town just changed. Try again.');
  return json(out(s, { built: String(input.spot) }));
}
async function collect(ctx) {
  const user = needUser(ctx), { db } = ctx;
  const { s, version } = await load(db, user.id);
  advance(s, Date.now());
  const today = await todayGot(db, user.id);
  const got = Math.max(0, Math.min(Math.floor(s.vault), TY.dailyCap - today));
  if (!got) return json(out(s, { got: 0, today, full: today >= TY.dailyCap }));
  s.vault -= got;
  // save the emptier vault first (only if nobody changed the town meanwhile), then pay: two collects can't both pay
  const r = await saveStmt(db, user.id, s, version).run();
  if (!r.meta.changes) fail(409, 'Your town just changed. Try again.');
  await db.batch([db.prepare('UPDATE tycoons SET collected = collected + ? WHERE user_id = ?').bind(got, user.id), ...coinStmts(db, user.id, got, 'tycoon')]);
  return json(out(s, { got, today: today + got, wallet: await getWallet(db, user.id) }));
}
