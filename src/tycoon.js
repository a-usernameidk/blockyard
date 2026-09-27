// Tycoon: everyone's own town that makes real coins (the rules are in public/js/tycoon.js).
// The server keeps each town and moves it forward in time whenever you look at it, build, or collect,
// so nothing the game sends can make coins appear. Buildings cost real coins; collecting is capped at TY.dailyCap a day.
import { json, fail, needUser, body, isConstraint } from './util.js';
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
  return { tycoon: { ...s, vault: Math.floor(s.vault) }, stats: stats(s), next: Object.fromEntries(SPOTS.map((x) => [x.id, nextOf(s, x.id)])), now: Date.now(), cap: TY.dailyCap, ...extra };
}
// Every change to a town saves it, bumps its version and writes a claim for the old version, all in one batch.
// A second request made from the same (now old) version hits that claim and the whole batch is cancelled,
// so two tabs clicking at once can never double coins or buildings.
const changeStmts = (db, uid, s, version) => [
  db.prepare('INSERT INTO claims (user_id, what, at) VALUES (?, ?, ?)').bind(uid, 'ty:' + version, Date.now()),
  db.prepare('UPDATE tycoons SET data = ?, version = version + 1 WHERE user_id = ? AND version = ?').bind(JSON.stringify(s), uid, version),
];

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
// Build or upgrade a lot. It costs real coins (they come out of your wallet).
async function build(ctx, input) {
  const user = needUser(ctx), { db } = ctx;
  const { s, version } = await load(db, user.id);
  advance(s, Date.now());
  const id = String(input.spot || ''), n = nextOf(s, id);
  const err = buy(s, id);
  if (err) fail(400, err);
  if (input.expect != null && Number(input.expect) !== n.cost) fail(409, `That costs ${n.cost} coins now. Try again.`);
  try {
    await db.batch([...changeStmts(db, user.id, s, version), ...coinStmts(db, user.id, -n.cost, 'tycoon build ' + id)]);
  } catch (e) {
    if (!isConstraint(e)) throw e;
    const w = await getWallet(db, user.id);
    if (w.coins < n.cost) fail(402, `You need ${n.cost - w.coins} more coins for that.`);
    fail(409, 'Your town just changed. Try again.');
  }
  return json(out(s, { built: id, cost: n.cost, today: await todayGot(db, user.id), wallet: await getWallet(db, user.id) }));
}
async function collect(ctx) {
  const user = needUser(ctx), { db } = ctx;
  const { s, version } = await load(db, user.id);
  advance(s, Date.now());
  const today = await todayGot(db, user.id);
  const got = Math.max(0, Math.min(Math.floor(s.vault), TY.dailyCap - today));
  if (!got) return json(out(s, { got: 0, today, full: today >= TY.dailyCap }));
  s.vault -= got;
  try {
    await db.batch([...changeStmts(db, user.id, s, version), db.prepare('UPDATE tycoons SET collected = collected + ? WHERE user_id = ?').bind(got, user.id), ...coinStmts(db, user.id, got, 'tycoon')]);
  } catch (e) { if (isConstraint(e)) fail(409, 'Already collected. Try again.'); throw e; }
  return json(out(s, { got, today: today + got, wallet: await getWallet(db, user.id) }));
}
