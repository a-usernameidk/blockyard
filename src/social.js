// Talking and trading with other players: DMs (friends only), live trades, sending coins,
// and the "pulse" the page checks every few seconds for new messages, trades and mail.
import { json, fail, body, needUser, DAY, randomId, isConstraint } from './util.js';
import { coinStmts, getWallet, mail, fixLook, cleanKeys, cleanCoins, swapStmts, noteTransfers, transferStmt, checkFarm } from './econ.js';
import { levelOf } from '../public/js/cosmetics.js';
import { MOD } from './mod.js';

/* ---------------- private messages are locked in the database ---------------- */
// DMs are saved encrypted (AES-GCM, with a key made from the SALT secret), so nobody can read them by looking in
// the database, the admin included. The server only unlocks them to show them to the two friends, or, when one of
// them reports the other, the last few messages go to the admin so they can check the report.
let dmKeyP = null, dmKeyFor = null;
function dmKey(env) {
  const secret = 'blockyard-dm|' + (env.SALT || 'blockyard');
  if (!dmKeyP || dmKeyFor !== secret) {
    dmKeyFor = secret;
    dmKeyP = crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)).then((raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
  }
  return dmKeyP;
}
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function sealDm(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await dmKey(env), new TextEncoder().encode(text)));
  const all = new Uint8Array(12 + ct.length); all.set(iv); all.set(ct, 12);
  return 'e1:' + b64(all);
}
export async function openDm(env, body) {
  if (!String(body).startsWith('e1:')) return String(body); // saved before messages were locked
  try {
    const all = unb64(body.slice(3));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await dmKey(env), all.slice(12));
    return new TextDecoder().decode(pt);
  } catch (e) { return '(this message could not be unlocked)'; }
}

export const SOCIAL_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS dms (id INTEGER PRIMARY KEY AUTOINCREMENT, from_id TEXT NOT NULL, to_id TEXT NOT NULL, body TEXT NOT NULL, at INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0)',
  'CREATE INDEX IF NOT EXISTS dms_to ON dms (to_id, read, at)',
  'CREATE INDEX IF NOT EXISTS dms_from ON dms (from_id, at)',
  `CREATE TABLE IF NOT EXISTS live_trades (id TEXT PRIMARY KEY, a TEXT NOT NULL, b TEXT NOT NULL, a_items TEXT NOT NULL DEFAULT '[]', b_items TEXT NOT NULL DEFAULT '[]',
    a_coins INTEGER NOT NULL DEFAULT 0, b_coins INTEGER NOT NULL DEFAULT 0, a_ready INTEGER NOT NULL DEFAULT 0, b_ready INTEGER NOT NULL DEFAULT 0,
    v INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS live_b ON live_trades (b, status, created_at)',
  'CREATE INDEX IF NOT EXISTS live_a ON live_trades (a, status, created_at)',
  'CREATE TABLE IF NOT EXISTS transfers (from_id TEXT NOT NULL, to_id TEXT NOT NULL, value INTEGER NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS transfers_to ON transfers (to_id, at)',
];
export const DM = { max: 300, perMinute: 15, keep: 60 };
export const GIFT = { max: 500, perDay: 500, minLevel: 3 };
export const LIVE = { inviteSecs: 60, idleMins: 10 };
export const SIGNUP_BONUS = 100;

const findUser = async (db, name) => {
  const u = await db.prepare('SELECT id, name, look, banned FROM users WHERE name_lower = ?').bind(String(name || '').toLowerCase()).first();
  if (!u || u.banned) fail(404, 'No player with that name.');
  return u;
};
const areFriends = async (db, a, b) => !!(await db.prepare("SELECT 1 FROM friends WHERE status = 'ok' AND ((a = ? AND b = ?) OR (a = ? AND b = ?))").bind(a, b, b, a).first());
const lookColor = (t) => { try { const c = JSON.parse(t || '{}').color; return /^#[0-9a-f]{6}$/i.test(c) ? c : '#ff6b35'; } catch (e) { return '#ff6b35'; } };

export async function socialRoute(ctx, path, method) {
  let m;
  if (path === '/me/pulse' && method === 'GET') return pulse(ctx);
  if (path === '/dms' && method === 'GET') return dmList(ctx);
  if ((m = path.match(/^\/dms\/([A-Za-z0-9_]{3,20})$/))) {
    if (method === 'GET') return dmThread(ctx, m[1]);
    if (method === 'POST') return dmSend(ctx, m[1], await body(ctx.request));
  }
  if ((m = path.match(/^\/dms\/([A-Za-z0-9_]{3,20})\/report$/)) && method === 'POST') return dmReport(ctx, m[1], await body(ctx.request));
  if (path === '/gift' && method === 'POST') return gift(ctx, await body(ctx.request));
  if (path === '/live' && method === 'POST') return liveStart(ctx, await body(ctx.request));
  if ((m = path.match(/^\/live\/([A-Za-z0-9]{10})$/))) {
    if (method === 'GET') return liveGet(ctx, m[1]);
    if (method === 'POST') return liveAct(ctx, m[1], await body(ctx.request));
  }
  return null;
}

/* ---------------- what's new (checked every few seconds) ---------------- */
async function pulse(ctx) {
  const user = needUser(ctx), { db } = ctx;
  // you're on the site (friends see "Online"); written at most once a minute
  await db.prepare('UPDATE users SET seen = ? WHERE id = ? AND seen < ?').bind(Date.now(), user.id, Date.now() - 60e3).run().catch(() => {});
  const since = Math.max(Date.now() - 10 * 60e3, Number(ctx.url.searchParams.get('since')) || 0);
  const [mailN, dmN, tradeN, newDms, newMail, invite, open] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS n FROM mail WHERE user_id = ? AND read = 0').bind(user.id).first(),
    db.prepare('SELECT COUNT(*) AS n FROM dms WHERE to_id = ? AND read = 0').bind(user.id).first(),
    db.prepare("SELECT COUNT(*) AS n FROM trades WHERE to_id = ? AND status = 'open' AND created_at > ?").bind(user.id, Date.now() - 3 * DAY).first(),
    db.prepare('SELECT d.body, d.at, u.name FROM dms d JOIN users u ON u.id = d.from_id WHERE d.to_id = ? AND d.at > ? AND d.read = 0 ORDER BY d.at DESC LIMIT 5').bind(user.id, since).all(),
    db.prepare('SELECT kind, title, at FROM mail WHERE user_id = ? AND at > ? AND read = 0 ORDER BY at DESC LIMIT 5').bind(user.id, since).all(),
    db.prepare("SELECT l.id, u.name FROM live_trades l JOIN users u ON u.id = l.a WHERE l.b = ? AND l.status = 'invite' AND l.created_at > ? ORDER BY l.created_at DESC LIMIT 1").bind(user.id, Date.now() - LIVE.inviteSecs * 1000).first(),
    db.prepare("SELECT id FROM live_trades WHERE (a = ? OR b = ?) AND status = 'open' AND updated_at > ? ORDER BY updated_at DESC LIMIT 1").bind(user.id, user.id, Date.now() - LIVE.idleMins * 60e3).first(),
  ]);
  const events = [
    ...(await Promise.all(newDms.results.map(async (d) => ({ kind: 'dm', from: d.name, text: (await openDm(ctx.env, d.body)).slice(0, 80), at: d.at })))),
    ...newMail.results.map((x) => ({ kind: 'mail', mail: x.kind, text: x.title, at: x.at })),
  ].sort((a, b) => a.at - b.at);
  return json({ now: Date.now(), mail: mailN.n, dms: dmN.n, trades: tradeN.n, events, invite: invite ? { id: invite.id, from: invite.name } : null, live: open ? open.id : null });
}

/* ---------------- DMs (friends only) ---------------- */
async function dmList(ctx) {
  const user = needUser(ctx), { db } = ctx;
  const { results } = await db.prepare(`SELECT d.from_id, d.to_id, d.body, d.at, d.read, u.name, u.look FROM dms d
    JOIN users u ON u.id = CASE WHEN d.from_id = ? THEN d.to_id ELSE d.from_id END
    WHERE (d.from_id = ? OR d.to_id = ?) AND u.banned = 0 ORDER BY d.at DESC LIMIT 300`).bind(user.id, user.id, user.id).all();
  const chats = new Map();
  for (const r of results) {
    if (!chats.has(r.name)) r.body = await openDm(ctx.env, r.body); // only the newest one per chat is shown
    let c = chats.get(r.name);
    if (!c) { c = { name: r.name, color: lookColor(r.look), last: r.body.slice(0, 60), at: r.at, mine: r.from_id === user.id, unread: 0 }; chats.set(r.name, c); }
    if (r.to_id === user.id && !r.read) c.unread++;
  }
  return json({ chats: [...chats.values()] });
}
async function dmThread(ctx, name) {
  const user = needUser(ctx), { db } = ctx;
  const other = await findUser(db, name);
  const { results } = await db.prepare(`SELECT id, from_id, body, at FROM dms WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY at DESC LIMIT ?`)
    .bind(user.id, other.id, other.id, user.id, DM.keep).all();
  await db.prepare('UPDATE dms SET read = 1 WHERE to_id = ? AND from_id = ? AND read = 0').bind(user.id, other.id).run();
  // messages saved before they were locked get locked now
  const old = results.filter((r) => !String(r.body).startsWith('e1:'));
  if (old.length) await db.batch(await Promise.all(old.map(async (r) => db.prepare('UPDATE dms SET body = ? WHERE id = ?').bind(await sealDm(ctx.env, r.body), r.id)))).catch(() => {});
  const messages = await Promise.all(results.reverse().map(async (r) => ({ me: r.from_id === user.id, text: await openDm(ctx.env, r.body), at: r.at })));
  return json({ name: other.name, color: lookColor(other.look), friends: await areFriends(db, user.id, other.id), messages });
}
async function dmSend(ctx, name, input) {
  const user = needUser(ctx), { db } = ctx;
  const other = await findUser(db, name);
  if (other.id === user.id) fail(400, "You can't message yourself.");
  if (!(await areFriends(db, user.id, other.id))) fail(403, `You can only message friends. Send ${other.name} a friend request first.`);
  const text = String(input.m || '').replace(/\s+/g, ' ').trim().slice(0, DM.max);
  if (!text) fail(400, 'Type a message first.');
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM dms WHERE from_id = ? AND at > ?').bind(user.id, Date.now() - 60e3).first();
  if (recent.n >= DM.perMinute) fail(429, 'Slow down a little! Try again in a minute.');
  await db.prepare('INSERT INTO dms (from_id, to_id, body, at) VALUES (?, ?, ?, ?)').bind(user.id, other.id, await sealDm(ctx.env, text), Date.now()).run();
  return json({ ok: true }, 201);
}
async function dmReport(ctx, name, input) {
  const user = needUser(ctx), { db } = ctx;
  const other = await findUser(db, name);
  // only the last few messages of this chat (both sides, for context) are unlocked for the admin
  const sent = await db.prepare('SELECT 1 FROM dms WHERE from_id = ? AND to_id = ? LIMIT 1').bind(other.id, user.id).first();
  if (!sent) fail(400, `${other.name} hasn't sent you anything to report.`);
  const rows = (await db.prepare(`SELECT from_id, body, at FROM dms WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) AND at <= ? ORDER BY at DESC LIMIT ?`)
    .bind(other.id, user.id, user.id, other.id, Date.now(), MOD.reportLines).all()).results;
  const results = await Promise.all(rows.map(async (r) => ({ from: r.from_id === other.id ? other.name : user.name, m: await openDm(ctx.env, r.body), at: r.at })));
  const reason = ['mean', 'spam', 'personal', 'cheating', 'other'].includes(input.reason) ? input.reason : 'other';
  await db.prepare('INSERT INTO chat_reports (reporter, reporter_name, target_id, target, room, reason, messages, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(user.id, user.name, other.id, other.name, 'DMs', reason, JSON.stringify(results.reverse()), Date.now()).run();
  return json({ ok: true });
}

/* ---------------- sending coins ---------------- */
async function gift(ctx, input) {
  const user = needUser(ctx), { db } = ctx;
  const to = await findUser(db, input.to);
  if (to.id === user.id) fail(400, "You can't send coins to yourself.");
  const amount = Math.floor(Number(input.amount) || 0);
  if (amount < 1 || amount > GIFT.max) fail(400, `You can send 1 to ${GIFT.max} coins at a time.`);
  const w = await getWallet(db, user.id);
  if (levelOf(w.xp) < GIFT.minLevel) fail(403, `Sending coins unlocks at level ${GIFT.minLevel}. Play some levels first!`);
  if (amount > w.coins) fail(400, "You don't have that many coins.");
  const day = Date.now() - (Date.now() % DAY);
  const sent = await db.prepare("SELECT COALESCE(-SUM(delta), 0) AS n FROM ledger WHERE user_id = ? AND why LIKE 'gift to %' AND at >= ?").bind(user.id, day).first();
  if (sent.n + amount > GIFT.perDay) fail(429, `You can send up to ${GIFT.perDay} coins a day. You have ${Math.max(0, GIFT.perDay - sent.n)} left today.`);
  const note = String(input.note || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  try {
    await db.batch([
      ...coinStmts(db, user.id, -amount, 'gift to ' + to.name),
      ...coinStmts(db, to.id, amount, 'gift from ' + user.name),
      transferStmt(db, user.id, to.id, amount, 'gift'),
      mail(db, to.id, 'coins', `${user.name} sent you ${amount} coins!`, note ? `"${note}"` : `${user.name} sent you ${amount} coins. Say thanks!`),
    ]);
  } catch (e) { if (isConstraint(e)) fail(400, "You don't have that many coins."); throw e; }
  const farmed = await checkFarm(ctx, to.id);
  return json({ ok: true, sent: amount, to: to.name, wallet: await getWallet(db, user.id), flagged: farmed || undefined });
}

/* ---------------- live trades ---------------- */
// One trade window both players see at once. Each side puts in items and coins; changing anything un-readies both.
// When both press Ready on the same version, it happens right away (all or nothing).
const side = (t, uid) => (t.a === uid ? 'a' : t.b === uid ? 'b' : null);
async function loadLive(ctx, id) {
  const user = needUser(ctx);
  const t = await ctx.db.prepare('SELECT * FROM live_trades WHERE id = ?').bind(id).first();
  if (!t || !side(t, user.id)) fail(404, 'That trade was not found.');
  // invites run out, and so do trades nobody touches
  const stale = (t.status === 'invite' && t.created_at < Date.now() - LIVE.inviteSecs * 1000) || (t.status === 'open' && t.updated_at < Date.now() - LIVE.idleMins * 60e3);
  if (stale) { await ctx.db.prepare("UPDATE live_trades SET status = 'expired' WHERE id = ? AND status = ?").bind(id, t.status).run(); t.status = 'expired'; }
  return { user, t, me: side(t, user.id) };
}
async function liveOut(ctx, t, me) {
  const other = me === 'a' ? 'b' : 'a';
  const names = await ctx.db.prepare('SELECT id, name FROM users WHERE id IN (?, ?)').bind(t.a, t.b).all();
  const nameOf = (id) => (names.results.find((r) => r.id === id) || {}).name || '?';
  const pack = (s) => ({ name: nameOf(t[s]), items: JSON.parse(t[s + '_items']), coins: t[s + '_coins'], ready: !!t[s + '_ready'] });
  return { id: t.id, status: t.status, v: t.v, me: pack(me), them: pack(other), invited: me === 'b' };
}
async function liveStart(ctx, input) {
  const user = needUser(ctx), { db } = ctx;
  const to = await findUser(db, input.to);
  if (to.id === user.id) fail(400, "You can't trade with yourself.");
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM live_trades WHERE a = ? AND created_at > ?').bind(user.id, Date.now() - 60e3).first();
  if (recent.n >= 5) fail(429, 'Wait a minute before asking again.');
  const now = Date.now(), id = randomId(10);
  // only one live trade at a time: old ones you started are closed
  await db.batch([
    db.prepare("UPDATE live_trades SET status = 'cancelled' WHERE (a = ? OR b = ?) AND status IN ('invite', 'open')").bind(user.id, user.id),
    db.prepare("INSERT INTO live_trades (id, a, b, status, created_at, updated_at) VALUES (?, ?, ?, 'invite', ?, ?)").bind(id, user.id, to.id, now, now),
  ]);
  return json({ ok: true, id, trade: await liveOut(ctx, { id, a: user.id, b: to.id, a_items: '[]', b_items: '[]', a_coins: 0, b_coins: 0, a_ready: 0, b_ready: 0, v: 0, status: 'invite' }, 'a') }, 201);
}
async function liveGet(ctx, id) {
  const { t, me } = await loadLive(ctx, id);
  return json({ trade: await liveOut(ctx, t, me) });
}
async function liveAct(ctx, id, input) {
  const { user, t, me } = await loadLive(ctx, id);
  const { db } = ctx, now = Date.now(), action = input.action;
  const done = async () => json({ trade: await liveOut(ctx, await db.prepare('SELECT * FROM live_trades WHERE id = ?').bind(id).first(), me) });
  if (action === 'cancel' || action === 'decline') {
    await db.prepare("UPDATE live_trades SET status = ?, updated_at = ? WHERE id = ? AND status IN ('invite', 'open')").bind(action === 'decline' ? 'declined' : 'cancelled', now, id).run();
    return done();
  }
  if (action === 'accept') {
    if (me !== 'b' || t.status !== 'invite') fail(409, t.status === 'invite' ? 'Only the invited player can say yes.' : `That trade is ${t.status}.`);
    await db.batch([
      db.prepare("UPDATE live_trades SET status = 'cancelled' WHERE (a = ? OR b = ?) AND status = 'open' AND id != ?").bind(user.id, user.id, id),
      db.prepare("UPDATE live_trades SET status = 'open', updated_at = ? WHERE id = ? AND status = 'invite'").bind(now, id),
    ]);
    return done();
  }
  if (t.status !== 'open') fail(409, `That trade is ${t.status}.`);
  if (action === 'set') {
    const items = cleanKeys(input.items), coins = cleanCoins(input.coins);
    const w = await getWallet(db, user.id);
    for (const k of items) if (!w.items[k]) fail(400, "You don't have one of those items.");
    if (coins > w.coins) fail(400, "You don't have that many coins.");
    // anything changing means both players have to look again
    await db.prepare(`UPDATE live_trades SET ${me}_items = ?, ${me}_coins = ?, a_ready = 0, b_ready = 0, v = v + 1, updated_at = ? WHERE id = ? AND status = 'open'`).bind(JSON.stringify(items), coins, now, id).run();
    return done();
  }
  if (action === 'unready') {
    await db.prepare(`UPDATE live_trades SET ${me}_ready = 0, updated_at = ? WHERE id = ? AND status = 'open'`).bind(now, id).run();
    return done();
  }
  if (action !== 'ready') fail(400, 'Unknown action.');
  if (Number(input.v) !== t.v) fail(409, 'The trade just changed. Check it again, then press Ready.');
  const a = JSON.parse(t.a_items), b = JSON.parse(t.b_items);
  if (!a.length && !b.length && !t.a_coins && !t.b_coins) fail(400, 'Put something in the trade first.');
  await db.prepare(`UPDATE live_trades SET ${me}_ready = 1, updated_at = ? WHERE id = ? AND status = 'open' AND v = ?`).bind(now, id, t.v).run();
  const fresh = await db.prepare('SELECT * FROM live_trades WHERE id = ?').bind(id).first();
  if (!(fresh.a_ready && fresh.b_ready && fresh.v === t.v && fresh.status === 'open')) return done();
  // both ready on the same version: swap everything in one go
  try {
    await db.batch([
      db.prepare('INSERT INTO trade_done (id) VALUES (?)').bind('L' + id),
      db.prepare("UPDATE live_trades SET status = 'done', updated_at = ? WHERE id = ?").bind(now, id),
      ...swapStmts(db, t.a, t.b, a, b, t.a_coins, t.b_coins, 'live trade ' + id),
    ]);
  } catch (e) {
    if (!isConstraint(e)) throw e;
    const already = await db.prepare('SELECT 1 FROM trade_done WHERE id = ?').bind('L' + id).first();
    if (!already) await db.prepare("UPDATE live_trades SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'open'").bind(now, id).run();
    return done();
  }
  await Promise.all([fixLook(db, t.a), fixLook(db, t.b)]);
  await noteTransfers(ctx, t.a, t.b, a, b, t.a_coins, t.b_coins, 'live');
  const out = await done();
  return out;
}
