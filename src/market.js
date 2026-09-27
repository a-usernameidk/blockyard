// The Reseller shop: players sell items to each other (the only way to get limited items once they sell out),
// item stats (how many exist, what they really sell for), chests, and the big leaderboards.
import { json, fail, body, needUser, randomId, isConstraint, DAY } from './util.js';
import { findItem, canTrade, valueOf, SHOP, KINDS, itemKey } from '../public/js/cosmetics.js';
import { coinStmts, getWallet, giveItem, takeItem, tidy, fixLook, mail, transferStmt, checkFarm } from './econ.js';

export const MARKET_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS listings (id TEXT PRIMARY KEY, seller TEXT NOT NULL, item TEXT NOT NULL, price INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open', buyer TEXT, at INTEGER NOT NULL, sold_at INTEGER)`,
  'CREATE INDEX IF NOT EXISTS listings_item ON listings (item, status, price)',
  'CREATE INDEX IF NOT EXISTS listings_seller ON listings (seller, status)',
];
export const MARKET = { fee: 0, maxPrice: 1000000, perUser: 20 }; // no fee: the seller gets the whole price

export async function marketRoute(ctx, path, method) {
  let m;
  if (path === '/market' && method === 'GET') return marketList(ctx);
  if (path === '/market' && method === 'POST') return listItem(ctx, await body(ctx.request));
  if ((m = path.match(/^\/market\/item\/([A-Za-z0-9%:#-]{3,60})$/)) && method === 'GET') { let k = ''; try { k = decodeURIComponent(m[1]); } catch (e) { /* bad */ } return itemListings(ctx, k); }
  if ((m = path.match(/^\/market\/([A-Za-z0-9]{10})\/(buy|cancel)$/)) && method === 'POST') return m[2] === 'buy' ? buyListing(ctx, m[1]) : cancelListing(ctx, m[1]);
  if (path === '/items/stats' && method === 'GET') return itemStats(ctx);
  if (path === '/chests' && method === 'GET') return json({ chests: CHESTS.map(chestOut) });
  if ((m = path.match(/^\/chests\/([a-z]+)\/open$/)) && method === 'POST') return openChest(ctx, m[1]);
  if (path === '/leaderboard' && method === 'GET') return leaderboard(ctx);
  return null;
}

/* ---------------- reseller shop ---------------- */
async function marketList(ctx) {
  const { db, user } = ctx;
  const { results } = await db.prepare("SELECT item, MIN(price) AS low, COUNT(*) AS n FROM listings WHERE status = 'open' GROUP BY item ORDER BY n DESC LIMIT 300").all();
  const mine = user ? (await db.prepare("SELECT id, item, price, at FROM listings WHERE seller = ? AND status = 'open' ORDER BY at DESC").bind(user.id).all()).results : [];
  return json({ items: results.filter((r) => findItem(r.item)), mine, fee: MARKET.fee });
}
async function itemListings(ctx, key) {
  const { db } = ctx;
  if (!findItem(key)) fail(404, 'Unknown item.');
  const [list, sales] = await Promise.all([
    db.prepare("SELECT l.id, l.price, l.at, u.name FROM listings l JOIN users u ON u.id = l.seller WHERE l.item = ? AND l.status = 'open' AND u.banned = 0 ORDER BY l.price ASC, l.at ASC LIMIT 30").bind(key).all(),
    db.prepare("SELECT price, sold_at FROM listings WHERE item = ? AND status = 'sold' ORDER BY sold_at DESC LIMIT 10").bind(key).all(),
  ]);
  return json({ item: key, listings: list.results, sales: sales.results });
}
async function listItem(ctx, input) {
  const user = needUser(ctx), { db } = ctx;
  const f = findItem(String(input.item || ''));
  if (!f || !canTrade(f.item)) fail(400, "That item can't be sold on the Reseller shop.");
  const price = Math.floor(Number(input.price) || 0);
  if (price < 1 || price > MARKET.maxPrice) fail(400, `Pick a price from 1 to ${MARKET.maxPrice} coins.`);
  const open = await db.prepare("SELECT COUNT(*) AS n FROM listings WHERE seller = ? AND status = 'open'").bind(user.id).first();
  if (open.n >= MARKET.perUser) fail(429, `You can have ${MARKET.perUser} things for sale at once.`);
  const id = randomId(10);
  // the item leaves your closet while it's for sale (you get it back if you cancel)
  try {
    await db.batch([...takeItem(db, user.id, f.key), tidy(db, user.id),
      db.prepare("INSERT INTO listings (id, seller, item, price, status, at) VALUES (?, ?, ?, ?, 'open', ?)").bind(id, user.id, f.key, price, Date.now())]);
  } catch (e) { if (isConstraint(e)) fail(409, "You don't have that item."); throw e; }
  return json({ ok: true, id, wallet: await fixLook(db, user.id) }, 201);
}
async function buyListing(ctx, id) {
  const user = needUser(ctx), { db } = ctx;
  const l = await db.prepare("SELECT l.*, u.name AS seller_name FROM listings l JOIN users u ON u.id = l.seller WHERE l.id = ?").bind(id).first();
  if (!l || l.status !== 'open') fail(409, 'That one just sold (or was taken down). Try the next one.');
  if (l.seller === user.id) fail(400, "That's your own. Cancel it instead.");
  const f = findItem(l.item);
  const get = l.price - Math.floor(l.price * MARKET.fee);
  try {
    await db.batch([
      db.prepare('INSERT INTO trade_done (id) VALUES (?)').bind('M' + id), // only one buyer, ever
      db.prepare("UPDATE listings SET status = 'sold', buyer = ?, sold_at = ? WHERE id = ? AND status = 'open'").bind(user.id, Date.now(), id),
      ...coinStmts(db, user.id, -l.price, 'market buy ' + l.item),
      ...coinStmts(db, l.seller, get, 'market sale ' + l.item),
      giveItem(db, user.id, l.item),
      transferStmt(db, user.id, l.seller, l.price, 'market'),
      mail(db, l.seller, 'trade', `Your ${f ? f.item.name : 'item'} sold!`, `${user.name} bought your ${f ? f.item.name : 'item'} for ${l.price} coins. You got all ${get} coins.`),
    ]);
  } catch (e) {
    if (!isConstraint(e)) throw e;
    const w = await getWallet(db, user.id);
    if (w.coins < l.price) fail(402, `You need ${l.price} coins for that.`);
    fail(409, 'That one just sold. Try the next one.');
  }
  // buying junk from your own extra accounts for lots of coins counts as farming
  await checkFarm(ctx, l.seller);
  return json({ ok: true, item: l.item, price: l.price, wallet: await getWallet(db, user.id) });
}
async function cancelListing(ctx, id) {
  const user = needUser(ctx), { db } = ctx;
  const l = await db.prepare('SELECT * FROM listings WHERE id = ?').bind(id).first();
  if (!l || l.seller !== user.id) fail(404, 'That listing was not found.');
  const r = await db.prepare("UPDATE listings SET status = 'cancelled' WHERE id = ? AND status = 'open'").bind(id).run();
  if (!r.meta.changes) fail(409, 'That one already sold.');
  await giveItem(db, user.id, l.item).run();
  return json({ ok: true, wallet: await getWallet(db, user.id) });
}

/* ---------------- item stats: rarity and what things are really worth ---------------- */
async function itemStats(ctx) {
  const { db } = ctx;
  const [inv, open, sold, stock] = await Promise.all([
    db.prepare('SELECT item, SUM(qty) AS n, COUNT(*) AS owners FROM inventory WHERE qty > 0 GROUP BY item').all(),
    db.prepare("SELECT item, COUNT(*) AS n, MIN(price) AS low FROM listings WHERE status = 'open' GROUP BY item").all(),
    db.prepare("SELECT item, price FROM listings WHERE status = 'sold' ORDER BY sold_at DESC LIMIT 2000").all(),
    db.prepare('SELECT item, left FROM stock').all(),
  ]);
  const out = {};
  const get = (k) => (out[k] ||= { exist: 0, owners: 0, forSale: 0, low: null, rap: null, sold: 0, left: null });
  for (const r of inv.results) { const o = get(r.item); o.exist += r.n; o.owners = r.owners; }
  for (const r of open.results) { const o = get(r.item); o.exist += r.n; o.forSale = r.n; o.low = r.low; }
  const recent = {};
  for (const r of sold.results) { const a = (recent[r.item] ||= []); if (a.length < 10) a.push(r.price); get(r.item).sold++; }
  for (const [k, a] of Object.entries(recent)) get(k).rap = Math.round(a.reduce((s, v) => s + v, 0) / a.length);
  for (const r of stock.results) get(r.item).left = r.left;
  return json({ stats: out });
}

/* ---------------- chests ---------------- */
// Buy a chest, get something random. The odds are shown right on the chest. Limited items never come out of chests.
const pool = (lo, hi) => KINDS.flatMap((k) => SHOP[k].filter((i) => !i.need && !i.stock && i.price >= lo && i.price <= hi).map((i) => itemKey(k, i.id)));
export const CHESTS = [
  { id: 'wooden', name: 'Wooden chest', price: 150, color: '#c98b4f', odds: [['coins', 50, [60, 160]], ['item', 35, [30, 200]], ['coins', 12, [200, 300]], ['item', 3, [201, 450]]] },
  { id: 'golden', name: 'Golden chest', price: 600, color: '#ffd23f', odds: [['coins', 40, [300, 650]], ['item', 40, [150, 700]], ['coins', 15, [700, 1000]], ['item', 5, [701, 1500]]] },
  { id: 'galaxy', name: 'Galaxy chest', price: 2000, color: '#5a3fd6', odds: [['coins', 35, [1200, 2200]], ['item', 45, [600, 2500]], ['coins', 15, [2300, 3500]], ['item', 5, [1400, 6000]]] },
];
function chestOut(c) {
  return { id: c.id, name: c.name, price: c.price, color: c.color, odds: c.odds.map(([k, pct, [lo, hi]]) => ({ kind: k, pct, lo, hi })) };
}
async function openChest(ctx, id) {
  const user = needUser(ctx), { db } = ctx;
  const c = CHESTS.find((x) => x.id === id);
  if (!c) fail(404, 'Unknown chest.');
  const recent = await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE user_id = ? AND why LIKE 'chest %' AND at > ?").bind(user.id, Date.now() - 60e3).first();
  if (recent.n >= 10) fail(429, 'Slow down! Try again in a minute.');
  const w = await getWallet(db, user.id);
  if (w.coins < c.price) fail(402, `You need ${c.price} coins for the ${c.name}.`);
  // pick the prize (server side, so nobody can cheat it)
  const rnd = crypto.getRandomValues(new Uint32Array(2));
  let roll = (rnd[0] / 2 ** 32) * 100, pick = c.odds[c.odds.length - 1];
  for (const o of c.odds) { if (roll < o[1]) { pick = o; break; } roll -= o[1]; }
  const [kind, , [lo, hi]] = pick;
  let prize;
  if (kind === 'item') {
    // something you don't have yet if we can
    const all = pool(lo, hi), fresh = all.filter((k) => !w.items[k]);
    const list = fresh.length ? fresh : all;
    prize = list.length ? { kind: 'item', key: list[rnd[1] % list.length] } : { kind: 'coins', coins: lo };
  } else prize = { kind: 'coins', coins: lo + (rnd[1] % (hi - lo + 1)) };
  const stmts = [...coinStmts(db, user.id, -c.price, 'chest ' + c.id)];
  if (prize.kind === 'item') stmts.push(giveItem(db, user.id, prize.key));
  else stmts.push(...coinStmts(db, user.id, prize.coins, 'prize from chest'));
  try { await db.batch(stmts); } catch (e) { if (isConstraint(e)) fail(402, `You need ${c.price} coins for the ${c.name}.`); throw e; }
  const f = prize.kind === 'item' ? findItem(prize.key) : null;
  return json({ ok: true, chest: c.id, prize: { ...prize, name: f ? f.item.name : undefined, worth: f ? valueOf(f.item) : prize.coins }, wallet: await getWallet(db, user.id) });
}

/* ---------------- the big leaderboards ---------------- */
async function leaderboard(ctx) {
  const { db, url } = ctx;
  const by = url.searchParams.get('by') || 'coins';
  const q = {
    coins: "SELECT u.name, u.look, w.coins AS v FROM wallets w JOIN users u ON u.id = w.user_id WHERE u.banned = 0 ORDER BY w.coins DESC LIMIT 25",
    xp: "SELECT u.name, u.look, w.xp AS v FROM wallets w JOIN users u ON u.id = w.user_id WHERE u.banned = 0 ORDER BY w.xp DESC LIMIT 25",
    rstars: "SELECT u.name, u.look, w.rstars AS v FROM wallets w JOIN users u ON u.id = w.user_id WHERE u.banned = 0 AND w.rstars > 0 ORDER BY w.rstars DESC LIMIT 25",
    likes: "SELECT u.name, u.look, SUM(g.likes) AS v FROM games g JOIN users u ON u.id = g.user_id WHERE u.banned = 0 AND g.hidden = 0 GROUP BY g.user_id ORDER BY v DESC LIMIT 25",
    items: "SELECT u.name, u.look, SUM(i.qty) AS v FROM inventory i JOIN users u ON u.id = i.user_id WHERE u.banned = 0 AND i.qty > 0 GROUP BY i.user_id ORDER BY v DESC LIMIT 25",
  }[by];
  if (!q) fail(400, 'Unknown leaderboard.');
  const [top, totals] = await Promise.all([
    db.prepare(q).all(),
    db.prepare(`SELECT (SELECT COUNT(*) FROM users WHERE banned = 0) AS players, (SELECT COALESCE(SUM(coins), 0) FROM wallets) AS coins,
      (SELECT COALESCE(SUM(qty), 0) FROM inventory) AS items, (SELECT COUNT(*) FROM games WHERE hidden = 0) AS games,
      (SELECT COUNT(*) FROM trades WHERE status = 'done') + (SELECT COUNT(*) FROM live_trades WHERE status = 'done') AS trades,
      (SELECT COUNT(*) FROM listings WHERE status = 'sold') AS sales, (SELECT COALESCE(SUM(plays), 0) FROM games) AS plays`).first(),
  ]);
  const look = (t) => { try { const l = JSON.parse(t || '{}'); return { color: /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : '#ff6b35', hat: String(l.hat || 'none').slice(0, 20) }; } catch (e) { return { color: '#ff6b35', hat: 'none' }; } };
  return json({ by, top: top.results.map((r, i) => ({ rank: i + 1, name: r.name, v: r.v || 0, ...look(r.look) })), totals });
}
