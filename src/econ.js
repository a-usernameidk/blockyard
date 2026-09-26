// Coins and items. The server is the only one who can change them:
// coins come from checked runs (built-in levels, built-in obbies, daily, Endless, and player levels
// an admin marked as rewarding), and items come from the shop or from trades.
import { SHOP, FREE, KINDS, findItem, isFree, canTrade, valueOf, sellPrice, LIMITED } from '../public/js/cosmetics.js';
import { BUILTIN } from '../public/js/levels.js';
import { normalizeLevel } from '../public/js/format.js';
import { builtinWorld } from '../public/js/worlds3d.js';
import { endlessCourse, todayUTC } from '../public/js/endless.js';
import { runReplay } from '../public/js/replay.js';
import { runReplay3d } from '../public/js/physics3d.js';
import { normalizeWorld, worldThumb } from '../public/js/world.js';
import { json, fail, body, needUser, DAY, randomId, isConstraint, startOfDay } from './util.js';

export const REWARD = { star: 10, dailyWin: 30, endlessCap: 200, obbyNoFall: 25, coin3d: 2, migrateCap: 2000, finishPerHour: 120 };
const TRADE = { maxItems: 8, maxCoins: 100000, days: 3, openPerUser: 10 };
export const DEFAULT_LOOK = { color: '#ff6b35', hat: 'none', trail: 'none' };

export const ECON_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS wallets (user_id TEXT PRIMARY KEY, coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0))',
  'CREATE TABLE IF NOT EXISTS inventory (user_id TEXT NOT NULL, item TEXT NOT NULL, qty INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 0), PRIMARY KEY (user_id, item))',
  'CREATE TABLE IF NOT EXISTS stock (item TEXT PRIMARY KEY, left INTEGER NOT NULL CHECK (left >= 0))',
  'CREATE TABLE IF NOT EXISTS ledger (user_id TEXT NOT NULL, delta INTEGER NOT NULL, why TEXT NOT NULL, at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS ledger_user ON ledger (user_id, why, at)',
  'CREATE TABLE IF NOT EXISTS level_progress (user_id TEXT NOT NULL, level TEXT NOT NULL, stars INTEGER NOT NULL DEFAULT 0, coins INTEGER NOT NULL DEFAULT 0, best REAL, PRIMARY KEY (user_id, level))',
  'CREATE TABLE IF NOT EXISTS claims (user_id TEXT NOT NULL, what TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, what))',
  `CREATE TABLE IF NOT EXISTS trades (id TEXT PRIMARY KEY, from_id TEXT NOT NULL, to_id TEXT NOT NULL, give TEXT NOT NULL, want TEXT NOT NULL,
    give_coins INTEGER NOT NULL DEFAULT 0, want_coins INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL, done_at INTEGER)`,
  'CREATE INDEX IF NOT EXISTS trades_to ON trades (to_id, status, created_at)',
  'CREATE INDEX IF NOT EXISTS trades_from ON trades (from_id, status, created_at)',
  'CREATE TABLE IF NOT EXISTS trade_done (id TEXT PRIMARY KEY)',
];
export const seedStock = (db) => LIMITED.map((l) => db.prepare('INSERT OR IGNORE INTO stock (item, left) VALUES (?, ?)').bind(l.key, l.stock));

/* ---------------- building blocks ---------------- */
// Add (or take away, with a negative number) coins. The whole batch fails if it would go below 0.
// (Taking works in two steps: lower the number, which the CHECK rule stops at 0, and if there was no row at all,
// try to insert a negative one, which the CHECK rule also refuses. Either way the whole batch is cancelled.)
export function coinStmts(db, uid, delta, why) {
  const log = db.prepare('INSERT INTO ledger (user_id, delta, why, at) VALUES (?, ?, ?, ?)').bind(uid, delta, why, Date.now());
  if (delta >= 0) return [db.prepare('INSERT INTO wallets (user_id, coins) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET coins = coins + excluded.coins').bind(uid, delta), log];
  return [
    db.prepare('UPDATE wallets SET coins = coins + ? WHERE user_id = ?').bind(delta, uid),
    db.prepare('INSERT INTO wallets (user_id, coins) SELECT ?, -1 WHERE NOT EXISTS (SELECT 1 FROM wallets WHERE user_id = ?)').bind(uid, uid),
    log,
  ];
}
// Give one item / take one item. Taking cancels the batch if they don't have it.
const giveItem = (db, uid, key) => db.prepare('INSERT INTO inventory (user_id, item, qty) VALUES (?, ?, 1) ON CONFLICT (user_id, item) DO UPDATE SET qty = qty + 1').bind(uid, key);
const takeItem = (db, uid, key) => [
  db.prepare('UPDATE inventory SET qty = qty - 1 WHERE user_id = ? AND item = ?').bind(uid, key),
  db.prepare('INSERT INTO inventory (user_id, item, qty) SELECT ?, ?, -1 WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE user_id = ? AND item = ?)').bind(uid, key, uid, key),
];
const tidy = (db, a, b = a) => db.prepare('DELETE FROM inventory WHERE qty = 0 AND user_id IN (?, ?)').bind(a, b);
const parse = (t, fallback = {}) => { try { const v = JSON.parse(t || ''); return v && typeof v === 'object' ? v : fallback; } catch (e) { return fallback; } };

const owns = (items, kind, id) => FREE.includes(id) || (items[kind + ':' + id] || 0) > 0;
export function cleanLook(look, items) {
  const out = { ...DEFAULT_LOOK };
  for (const k of KINDS) {
    const id = look && look[k];
    if (typeof id === 'string' && SHOP[k].some((i) => i.id === id) && owns(items, k, id)) out[k] = id;
  }
  return out;
}

export async function getWallet(db, uid) {
  const [w, inv, u] = await Promise.all([
    db.prepare('SELECT coins FROM wallets WHERE user_id = ?').bind(uid).first(),
    db.prepare('SELECT item, qty FROM inventory WHERE user_id = ? AND qty > 0').bind(uid).all(),
    db.prepare('SELECT look FROM users WHERE id = ?').bind(uid).first(),
  ]);
  const items = {};
  for (const r of inv.results) items[r.item] = r.qty;
  return { coins: w ? w.coins : 0, items, look: cleanLook(parse(u && u.look), items) };
}
// After selling or trading, make sure nobody is wearing something they gave away.
async function fixLook(db, uid) {
  const w = await getWallet(db, uid);
  await db.prepare('UPDATE users SET look = ? WHERE id = ?').bind(JSON.stringify(w.look), uid).run();
  return w;
}
const popcount = (n) => { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; };
async function starCount(db, uid) {
  const { results } = await db.prepare("SELECT stars FROM level_progress WHERE user_id = ? AND level LIKE 'b-%'").bind(uid).all();
  return results.reduce((n, r) => n + popcount(r.stars & 7), 0);
}
async function badges(db, uid) {
  const [c, d] = await Promise.all([
    db.prepare("SELECT what FROM claims WHERE user_id = ? AND what LIKE 'b:%'").bind(uid).all(),
    db.prepare('SELECT COUNT(*) AS n FROM daily WHERE user_id = ? AND won = 1').bind(uid).first(),
  ]);
  const out = {};
  for (const r of c.results) out[r.what.slice(2)] = true;
  if (d.n >= 5) out.daily5 = true;
  return out;
}

// Accounts made before coins moved to the server bring their old coins (capped) and items once.
export async function migrateUser(db, uid, progressText) {
  const p = parse(progressText);
  const coins = Math.max(0, Math.min(REWARD.migrateCap, Math.floor(Number(p.coins) || 0)));
  const stmts = [db.prepare('INSERT OR IGNORE INTO wallets (user_id, coins) VALUES (?, ?)').bind(uid, coins)];
  const owned = Array.isArray(p.owned) ? p.owned : [];
  for (const key of new Set(owned)) {
    const f = findItem(key);
    if (f && !isFree(f.item) && !f.item.stock) stmts.push(db.prepare('INSERT OR IGNORE INTO inventory (user_id, item, qty) VALUES (?, ?, 1)').bind(uid, key));
  }
  const levels = p.levels && typeof p.levels === 'object' ? p.levels : {};
  for (const lv of BUILTIN) {
    const l = levels[lv.id];
    if (!l || !Array.isArray(l.stars)) continue;
    const bits = (l.stars[0] ? 1 : 0) | (l.stars[1] ? 2 : 0) | (l.stars[2] ? 4 : 0);
    if (bits) stmts.push(db.prepare('INSERT OR IGNORE INTO level_progress (user_id, level, stars, coins, best) VALUES (?, ?, ?, ?, ?)').bind(uid, lv.id, bits, Math.max(0, Math.floor(l.coins || 0)), typeof l.time === 'number' ? l.time : null));
  }
  const look = p.equip && typeof p.equip === 'object' ? p.equip : {};
  stmts.push(db.prepare('UPDATE users SET econ = 1, look = ? WHERE id = ?').bind(JSON.stringify(look), uid));
  await db.batch(stmts);
}

// What /api/me adds for signed-in players.
export async function accountExtras(db, uid) {
  const [wallet, { results }, b] = await Promise.all([
    getWallet(db, uid),
    db.prepare('SELECT level, stars, coins, best FROM level_progress WHERE user_id = ?').bind(uid).all(),
    badges(db, uid),
  ]);
  const levels = {};
  for (const r of results) levels[r.level] = { stars: r.stars, coins: r.coins, best: r.best };
  return { wallet, levels, badges: b };
}

/* ---------------- checking runs ---------------- */
// Long runs are checked inside a Durable Object, which may use more computing time than a normal request.
export async function verify(env, job) {
  if (env.ROOMS) {
    try {
      const stub = env.ROOMS.get(env.ROOMS.idFromName('v:' + Math.floor(Math.random() * 4)));
      const r = await (await stub.fetch('https://room/verify', { method: 'POST', body: JSON.stringify(job) })).json();
      if (!r.ok) fail(400, r.error || 'That run could not be checked.');
      return job.type === 'publish3d' ? r : r.run;
    } catch (e) { if (e.status) throw e; /* fall back to checking here */ }
  }
  try {
    if (job.type === '2d') return runReplay(job.raw ? job.level : normalizeLevel(job.level), String(job.replay || ''), job.opts || {});
    if (job.type === 'publish3d') {
      const w = normalizeWorld(job.world);
      const run = w.world.mode === 'obby' ? runReplay3d(w.world, String(job.replay || ''), { ...(job.opts || {}), grid: w.grid }) : null;
      return { ok: true, world: w.world, blocks: w.info.blocks, coins: w.info.coins.length, thumb: worldThumb(w.grid), run };
    }
    return runReplay3d(job.builtin ? builtinWorld(job.builtin).get().world : job.world, String(job.replay || ''), job.opts || {});
  } catch (e) { fail(400, e.message); }
}
export const maxSteps = (env) => Math.max(1200, Math.min(120000, parseInt(env.MAX_VERIFY_STEPS || '14400', 10) || 14400));
export const maxSteps3d = (env) => Math.max(1200, Math.min(72000, parseInt(env.MAX_VERIFY_STEPS_3D || '18000', 10) || 18000));

/* ---------------- routes ---------------- */
export async function econRoute(ctx, path, method) {
  let m;
  if (path === '/me/look' && method === 'PUT') return setLook(ctx, await body(ctx.request));
  if (path === '/shop' && method === 'GET') return shop(ctx);
  if (path === '/shop/buy' && method === 'POST') return buy(ctx, await body(ctx.request));
  if (path === '/shop/sell' && method === 'POST') return sell(ctx, await body(ctx.request));
  if (path === '/finish' && method === 'POST') return finish(ctx, await body(ctx.request));
  if (path === '/trades' && method === 'GET') return listTrades(ctx);
  if (path === '/trades' && method === 'POST') return newTrade(ctx, await body(ctx.request));
  if ((m = path.match(/^\/trades\/([A-Za-z0-9]{10})$/)) && method === 'POST') return tradeAction(ctx, m[1], await body(ctx.request));
  return null;
}

async function setLook(ctx, input) {
  const user = needUser(ctx);
  const w = await getWallet(ctx.db, user.id);
  const look = cleanLook({ ...w.look, ...input }, w.items);
  for (const k of KINDS) if (input[k] && input[k] !== look[k]) fail(403, "You don't own that yet.");
  await ctx.db.prepare('UPDATE users SET look = ? WHERE id = ?').bind(JSON.stringify(look), user.id).run();
  return json({ wallet: { ...w, look } });
}

// Four items are on sale each day (the same for everyone).
export function featured(date = todayUTC()) {
  const pool = KINDS.flatMap((k) => SHOP[k].filter((i) => !isFree(i) && !i.need && !i.stock).map((i) => k + ':' + i.id));
  let h = 2166136261;
  for (const ch of date) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const pick = [];
  while (pick.length < 4 && pool.length) { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; pick.push(pool.splice(h % pool.length, 1)[0]); }
  return { date, off: 25, items: pick };
}
const priceOf = (f, deal) => (deal.items.includes(f.key) ? Math.floor(f.item.price * (100 - deal.off) / 100) : f.item.price);

async function shop(ctx) {
  const { results } = await ctx.db.prepare('SELECT item, left FROM stock').all();
  const stock = {};
  for (const r of results) stock[r.item] = r.left;
  return json({ stock, featured: featured() });
}

async function buy(ctx, input) {
  const user = needUser(ctx);
  const { db } = ctx;
  const f = findItem(input.key);
  if (!f || isFree(f.item)) fail(400, "That item isn't in the shop.");
  const have = await db.prepare('SELECT qty FROM inventory WHERE user_id = ? AND item = ?').bind(user.id, f.key).first();
  if (have && have.qty > 0) fail(409, 'You already have that.');
  if (f.item.need) {
    const need = f.item.need;
    const ok = need.stars ? (await starCount(db, user.id)) >= need.stars : !!(await badges(db, user.id))[need.ach];
    if (!ok) fail(403, `Locked: ${f.item.hint}.`);
    await db.prepare('INSERT OR IGNORE INTO inventory (user_id, item, qty) VALUES (?, ?, 1)').bind(user.id, f.key).run();
    return json({ ok: true, price: 0, wallet: await getWallet(db, user.id) });
  }
  const price = priceOf(f, featured());
  const stmts = [...coinStmts(db, user.id, -price, 'buy ' + f.key), giveItem(db, user.id, f.key)];
  if (f.item.stock) stmts.push(db.prepare('UPDATE stock SET left = left - 1 WHERE item = ?').bind(f.key));
  try { await db.batch(stmts); } catch (e) {
    if (!isConstraint(e)) throw e;
    if (f.item.stock) {
      const s = await db.prepare('SELECT left FROM stock WHERE item = ?').bind(f.key).first();
      if (!s || s.left <= 0) fail(409, 'Sold out! The only way to get one now is a trade.');
    }
    fail(402, `You need ${price} coins for that.`);
  }
  return json({ ok: true, price, wallet: await getWallet(db, user.id) });
}

async function sell(ctx, input) {
  const user = needUser(ctx);
  const { db } = ctx;
  const f = findItem(input.key);
  if (!f || !canTrade(f.item)) fail(400, "That item can't be sold.");
  const back = sellPrice(f.item);
  const stmts = [...takeItem(db, user.id, f.key), ...coinStmts(db, user.id, back, 'sell ' + f.key), tidy(db, user.id)];
  if (f.item.stock) stmts.push(db.prepare('UPDATE stock SET left = left + 1 WHERE item = ?').bind(f.key));
  try { await db.batch(stmts); } catch (e) { if (isConstraint(e)) fail(409, "You don't have that item."); throw e; }
  return json({ ok: true, got: back, wallet: await fixLook(db, user.id) });
}

/* ---------------- rewards for checked runs ---------------- */
async function finish(ctx, input) {
  const user = needUser(ctx);
  const { db, env } = ctx;
  const recent = await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE user_id = ? AND why LIKE 'run%' AND at > ?").bind(user.id, Date.now() - 3600e3).first();
  if (recent.n >= REWARD.finishPerHour) fail(429, 'You have been playing a lot! Rewards pause for a bit, try again later.');
  const kind = input.kind, id = String(input.id || ''), replay = String(input.replay || '');
  if (kind === 'level') return finishLevel(ctx, user, id, replay);
  if (kind === 'world') return finishWorld(ctx, user, id, replay);
  if (kind === 'game') return finishGame(ctx, user, id, replay);
  if (kind === 'endless') return finishEndless(ctx, user, input.seed, replay);
  fail(400, 'Unknown kind of run.');
}

async function progressRow(db, uid, level) {
  return (await db.prepare('SELECT stars, coins, best FROM level_progress WHERE user_id = ? AND level = ?').bind(uid, level).first()) || { stars: 0, coins: 0, best: null };
}
function progressStmt(db, uid, level, stars, coins, best) {
  return db.prepare(`INSERT INTO level_progress (user_id, level, stars, coins, best) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user_id, level) DO UPDATE SET stars = stars | excluded.stars, coins = MAX(coins, excluded.coins),
    best = CASE WHEN best IS NULL OR excluded.best < best THEN excluded.best ELSE best END`).bind(uid, level, stars, coins, best);
}

async function finishLevel(ctx, user, id, replay) {
  const { db, env } = ctx;
  const lv = BUILTIN.find((b) => b.id === id);
  if (!lv) fail(404, 'Unknown level.');
  const run = await verify(env, { type: '2d', level: lv, replay, opts: { maxSteps: maxSteps(env) } });
  if (!run.won) fail(400, "That run didn't reach the goal.");
  const rush = lv.style === 'rush';
  const s1 = run.totalCoins ? run.coins >= run.totalCoins : run.deaths === 0;
  const s2 = rush ? run.deaths === 0 : run.time <= lv.par;
  const bits = 1 | (s1 ? 2 : 0) | (s2 ? 4 : 0);
  const old = await progressRow(db, user.id, id);
  const fresh = bits & ~old.stars;
  const newCoins = Math.max(0, run.coins - old.coins);
  const earned = popcount(fresh) * REWARD.star + newCoins;
  const stmts = [progressStmt(db, user.id, id, bits, run.coins, Math.round(run.time * 10) / 10)];
  if (earned) stmts.push(...coinStmts(db, user.id, earned, 'run level ' + id));
  if (id === 'b-party' && run.deaths === 0) stmts.push(db.prepare("INSERT OR IGNORE INTO claims (user_id, what, at) VALUES (?, 'b:flawless', ?)").bind(user.id, Date.now()));
  await db.batch(stmts);
  const stars = [0, 1, 2].map((i) => !!((old.stars | bits) & (1 << i)));
  return json({ ok: true, earned, stars, newStars: [0, 1, 2].filter((i) => fresh & (1 << i)), time: run.time, wallet: await getWallet(db, user.id) });
}

async function finishWorld(ctx, user, id, replay) {
  const { db, env } = ctx;
  const w = builtinWorld(id);
  if (!w || w.mode !== 'obby') fail(404, 'Unknown obby.');
  const run = await verify(env, { type: '3d', builtin: id, replay, opts: { maxSteps: maxSteps3d(env) } });
  if (!run.won) fail(400, "That run didn't reach the goal.");
  const key = 'w:' + id;
  const bits = 1 | (run.deaths === 0 ? 2 : 0);
  const old = await progressRow(db, user.id, key);
  const fresh = bits & ~old.stars;
  const earned = (fresh & 1 ? w.reward : 0) + (fresh & 2 ? REWARD.obbyNoFall : 0) + Math.max(0, run.coins - old.coins) * REWARD.coin3d;
  const stmts = [progressStmt(db, user.id, key, bits, run.coins, Math.round(run.time * 10) / 10)];
  if (earned) stmts.push(...coinStmts(db, user.id, earned, 'run world ' + id));
  await db.batch(stmts);
  return json({ ok: true, earned, first: !!(fresh & 1), noFall: !!(bits & 2), time: run.time, wallet: await getWallet(db, user.id) });
}

async function finishGame(ctx, user, id, replay) {
  const { db, env } = ctx;
  const g = await db.prepare('SELECT id, kind, data, reward, user_id, hidden FROM games WHERE id = ?').bind(id).first();
  if (!g || g.hidden) fail(404, 'That game was not found.');
  if (!g.reward) return json({ ok: true, earned: 0 });
  if (g.user_id === user.id) return json({ ok: true, earned: 0, note: "You made this one, so it doesn't pay you." });
  const done = await db.prepare('SELECT 1 FROM claims WHERE user_id = ? AND what = ?').bind(user.id, 'g:' + id).first();
  if (done) return json({ ok: true, earned: 0, note: 'You already got the reward for this one.' });
  const data = JSON.parse(g.data);
  const run = g.kind === '3d'
    ? await verify(env, { type: '3d', world: data, replay, opts: { maxSteps: maxSteps3d(env) } })
    : await verify(env, { type: '2d', level: data, replay, opts: { maxSteps: maxSteps(env) } });
  if (!run.won) fail(400, "That run didn't reach the goal.");
  try {
    await db.batch([db.prepare('INSERT INTO claims (user_id, what, at) VALUES (?, ?, ?)').bind(user.id, 'g:' + id, Date.now()), ...coinStmts(db, user.id, g.reward, 'run game ' + id)]);
  } catch (e) { if (isConstraint(e)) return json({ ok: true, earned: 0 }); throw e; }
  return json({ ok: true, earned: g.reward, wallet: await getWallet(db, user.id) });
}

async function finishEndless(ctx, user, seedIn, replay) {
  const { db, env } = ctx;
  const seed = Number(seedIn);
  if (!Number.isInteger(seed) || seed < 0 || seed > 1e9) fail(400, 'That run is broken.');
  const run = await verify(env, { type: '2d', raw: true, level: endlessCourse(seed), replay, opts: { maxSteps: maxSteps(env), stopOnDeath: true, truncate: true } });
  const dist = Math.floor(run.x / 32);
  const today = await db.prepare("SELECT COALESCE(SUM(delta), 0) AS n FROM ledger WHERE user_id = ? AND why = 'run endless' AND at >= ?").bind(user.id, startOfDay()).first();
  const room = Math.max(0, REWARD.endlessCap - today.n);
  const earned = Math.min(room, run.coins + Math.floor(dist / 25));
  const stmts = [db.prepare('INSERT INTO claims (user_id, what, at) VALUES (?, ?, ?)').bind(user.id, 'e:' + seed, Date.now())];
  if (earned) stmts.push(...coinStmts(db, user.id, earned, 'run endless'));
  if (dist >= 1000) stmts.push(db.prepare("INSERT OR IGNORE INTO claims (user_id, what, at) VALUES (?, 'b:endless1000', ?)").bind(user.id, Date.now()));
  try { await db.batch(stmts); } catch (e) { if (isConstraint(e)) fail(409, 'That run was already counted.'); throw e; }
  return json({ ok: true, earned, distance: dist, capped: earned < run.coins + Math.floor(dist / 25), wallet: await getWallet(db, user.id) });
}

/* ---------------- trading ---------------- */
function cleanKeys(list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > TRADE.maxItems) fail(400, `Up to ${TRADE.maxItems} items on each side.`);
  const keys = [...new Set(list.map(String))];
  for (const k of keys) { const f = findItem(k); if (!f || !canTrade(f.item)) fail(400, 'One of those items can\'t be traded.'); }
  return keys;
}
const cleanCoins = (n) => { const v = Math.floor(Number(n) || 0); if (v < 0 || v > TRADE.maxCoins) fail(400, 'That coin amount is too big.'); return v; };

async function newTrade(ctx, input) {
  const user = needUser(ctx);
  const { db } = ctx;
  const to = await db.prepare('SELECT id, name, banned FROM users WHERE name_lower = ?').bind(String(input.to || '').toLowerCase()).first();
  if (!to || to.banned) fail(404, 'No player with that name.');
  if (to.id === user.id) fail(400, "You can't trade with yourself.");
  const give = cleanKeys(input.give), want = cleanKeys(input.want);
  const giveCoins = cleanCoins(input.giveCoins), wantCoins = cleanCoins(input.wantCoins);
  if (!give.length && !want.length && !giveCoins && !wantCoins) fail(400, 'Put something in the trade first.');
  const open = await db.prepare("SELECT COUNT(*) AS n FROM trades WHERE from_id = ? AND status = 'open' AND created_at > ?").bind(user.id, Date.now() - TRADE.days * DAY).first();
  if (open.n >= TRADE.openPerUser) fail(429, `You have ${TRADE.openPerUser} trades waiting already. Cancel one first.`);
  const [mine, theirs] = await Promise.all([getWallet(db, user.id), getWallet(db, to.id)]);
  for (const k of give) if (!mine.items[k]) fail(400, "You don't have one of the items you're offering.");
  for (const k of want) if (!theirs.items[k]) fail(400, `${to.name} doesn't have one of the items you asked for.`);
  if (giveCoins > mine.coins) fail(400, "You don't have that many coins.");
  const id = randomId(10);
  await db.prepare('INSERT INTO trades (id, from_id, to_id, give, want, give_coins, want_coins, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, user.id, to.id, JSON.stringify(give), JSON.stringify(want), giveCoins, wantCoins, Date.now()).run();
  return json({ ok: true, id }, 201);
}

async function listTrades(ctx) {
  const user = needUser(ctx);
  const { db } = ctx;
  const cutoff = Date.now() - TRADE.days * DAY;
  await db.prepare("UPDATE trades SET status = 'expired' WHERE status = 'open' AND created_at < ? AND (from_id = ? OR to_id = ?)").bind(cutoff, user.id, user.id).run();
  const { results } = await db.prepare(`SELECT t.*, a.name AS from_name, b.name AS to_name FROM trades t
    JOIN users a ON a.id = t.from_id JOIN users b ON b.id = t.to_id
    WHERE (t.from_id = ? OR t.to_id = ?) ORDER BY (t.status = 'open') DESC, t.created_at DESC LIMIT 60`).bind(user.id, user.id).all();
  const out = { incoming: [], outgoing: [], history: [] };
  for (const t of results) {
    const row = { id: t.id, from: t.from_name, to: t.to_name, give: JSON.parse(t.give), want: JSON.parse(t.want), giveCoins: t.give_coins, wantCoins: t.want_coins, status: t.status, at: t.created_at, doneAt: t.done_at };
    if (t.status !== 'open') { if (out.history.length < 20) out.history.push(row); }
    else if (t.to_id === user.id) out.incoming.push(row);
    else out.outgoing.push(row);
  }
  return json(out);
}

async function tradeAction(ctx, id, input) {
  const user = needUser(ctx);
  const { db } = ctx;
  const t = await db.prepare('SELECT * FROM trades WHERE id = ?').bind(id).first();
  if (!t || (t.from_id !== user.id && t.to_id !== user.id)) fail(404, 'That trade was not found.');
  if (t.status !== 'open') fail(409, `That trade is already ${t.status}.`);
  if (t.created_at < Date.now() - TRADE.days * DAY) { await db.prepare("UPDATE trades SET status = 'expired' WHERE id = ?").bind(id).run(); fail(409, 'That trade expired.'); }
  const action = input.action;
  if (action === 'cancel' || action === 'decline') {
    if ((action === 'cancel') !== (t.from_id === user.id)) fail(403, action === 'cancel' ? 'Only the sender can cancel.' : 'Only the receiver can decline.');
    await db.prepare("UPDATE trades SET status = ?, done_at = ? WHERE id = ? AND status = 'open'").bind(action === 'cancel' ? 'cancelled' : 'declined', Date.now(), id).run();
    return json({ ok: true });
  }
  if (action !== 'accept') fail(400, 'Unknown action.');
  if (t.to_id !== user.id) fail(403, 'Only the receiver can accept.');
  const give = JSON.parse(t.give), want = JSON.parse(t.want), A = t.from_id, Bid = t.to_id;
  const stmts = [
    db.prepare('INSERT INTO trade_done (id) VALUES (?)').bind(id),
    db.prepare("UPDATE trades SET status = 'done', done_at = ? WHERE id = ?").bind(Date.now(), id),
  ];
  for (const k of give) stmts.push(...takeItem(db, A, k), giveItem(db, Bid, k));
  for (const k of want) stmts.push(...takeItem(db, Bid, k), giveItem(db, A, k));
  if (t.give_coins) stmts.push(...coinStmts(db, A, -t.give_coins, 'trade ' + id), ...coinStmts(db, Bid, t.give_coins, 'trade ' + id));
  if (t.want_coins) stmts.push(...coinStmts(db, Bid, -t.want_coins, 'trade ' + id), ...coinStmts(db, A, t.want_coins, 'trade ' + id));
  stmts.push(tidy(db, A, Bid));
  try { await db.batch(stmts); } catch (e) {
    if (!isConstraint(e)) throw e;
    await db.prepare("UPDATE trades SET status = 'failed', done_at = ? WHERE id = ? AND status = 'open'").bind(Date.now(), id).run();
    fail(409, "This trade can't happen anymore. Someone doesn't have those items or coins now.");
  }
  await fixLook(db, A);
  return json({ ok: true, wallet: await fixLook(db, Bid) });
}

// Everything a profile page shows about someone's closet.
export async function publicItems(db, uid) {
  const w = await getWallet(db, uid);
  const items = Object.entries(w.items).filter(([k]) => { const f = findItem(k); return f && canTrade(f.item); }).map(([key, qty]) => ({ key, qty }));
  const value = items.reduce((n, i) => n + valueOf(findItem(i.key).item) * i.qty, 0);
  return { look: w.look, items, value, stars: await starCount(db, uid), badges: await badges(db, uid) };
}
