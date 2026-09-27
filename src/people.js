// Following players, wearing a badge as your title, and disliking levels.
import { json, fail, body, needUser } from './util.js';
import { mail, badges } from './econ.js';

export const PEOPLE_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS follows (follower TEXT NOT NULL, followee TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (follower, followee))',
  'CREATE INDEX IF NOT EXISTS follows_followee ON follows (followee)',
  'CREATE TABLE IF NOT EXISTS dislikes (game_id TEXT NOT NULL, who TEXT NOT NULL, PRIMARY KEY (game_id, who))',
];
export const PEOPLE_COLUMNS = ['ALTER TABLE games ADD COLUMN dislikes INTEGER NOT NULL DEFAULT 0', 'ALTER TABLE users ADD COLUMN title TEXT'];
export const FOLLOW = { maxFollowing: 500, notify: 300 };

export async function peopleRoute(ctx, path, method) {
  let m;
  if ((m = path.match(/^\/users\/([A-Za-z0-9_]{3,20})\/follow$/)) && method === 'POST') return follow(ctx, m[1], await body(ctx.request));
  if (path === '/me/title' && method === 'PUT') return setTitle(ctx, await body(ctx.request));
  if (path === '/me/following' && method === 'GET') return following(ctx);
  return null;
}

async function follow(ctx, name, input) {
  const user = needUser(ctx), { db } = ctx;
  const u = await db.prepare('SELECT id, name FROM users WHERE name_lower = ? AND banned = 0').bind(name.toLowerCase()).first();
  if (!u) fail(404, 'No player with that name.');
  if (u.id === user.id) fail(400, "You can't follow yourself.");
  if (input.on === false) await db.prepare('DELETE FROM follows WHERE follower = ? AND followee = ?').bind(user.id, u.id).run();
  else {
    const n = await db.prepare('SELECT COUNT(*) AS n FROM follows WHERE follower = ?').bind(user.id).first();
    if (n.n >= FOLLOW.maxFollowing) fail(429, `You can follow up to ${FOLLOW.maxFollowing} players.`);
    const r = await db.prepare('INSERT OR IGNORE INTO follows (follower, followee, at) VALUES (?, ?, ?)').bind(user.id, u.id, Date.now()).run();
    if (r.meta.changes) await mail(db, u.id, 'follow', `${user.name} is following you!`, `${user.name} follows you now. They'll hear about new levels and worlds you publish.`, { profile: user.name }).run();
  }
  const info = await followInfo(db, u.id, user.id);
  return json({ ok: true, followers: info.followers, following: input.on !== false });
}
export async function followInfo(db, uid, viewer) {
  const [a, b, me] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS n FROM follows WHERE followee = ?').bind(uid).first(),
    db.prepare('SELECT COUNT(*) AS n FROM follows WHERE follower = ?').bind(uid).first(),
    viewer ? db.prepare('SELECT 1 FROM follows WHERE follower = ? AND followee = ?').bind(viewer, uid).first() : null,
  ]);
  return { followers: a.n, following: b.n, iFollow: !!me };
}
async function following(ctx) {
  const user = needUser(ctx);
  const { results } = await ctx.db.prepare('SELECT u.name FROM follows f JOIN users u ON u.id = f.followee WHERE f.follower = ? AND u.banned = 0 ORDER BY f.at DESC LIMIT 200').bind(user.id).all();
  return json({ following: results.map((r) => r.name), ...(await followInfo(ctx.db, user.id)) });
}
// When someone publishes a public level or world, the people who follow them get a mail with a Play button.
export async function tellFollowers(ctx, user, game) {
  const { db } = ctx;
  const { results } = await db.prepare('SELECT follower FROM follows WHERE followee = ? ORDER BY at ASC LIMIT ?').bind(user.id, FOLLOW.notify).all();
  if (!results.length) return;
  const go = game.kind === '3d' ? '#/w/' + game.id : '#/p/' + game.id;
  const stmts = results.map((r) => mail(db, r.follower, 'follow', `${user.name} made something new!`, `${user.name} published "${game.name}". Go play it!`, { go }));
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50)).catch(() => {});
}

/* ---------------- titles: wear one of your badges next to your name ---------------- */
export function badgeSet(progressText, serverBadges) {
  let saved = {};
  try { saved = JSON.parse(progressText || '{}').ach || {}; } catch (e) { /* none */ }
  return new Set([...Object.keys(saved).slice(0, 300), ...Object.keys(serverBadges || {})]);
}
async function setTitle(ctx, input) {
  const user = needUser(ctx), { db } = ctx;
  const id = String(input.id || '');
  if (!id) { await db.prepare('UPDATE users SET title = NULL WHERE id = ?').bind(user.id).run(); return json({ ok: true, title: null }); }
  if (!/^[a-z0-9]{2,20}$/.test(id)) fail(400, "That isn't a badge.");
  const u = await db.prepare('SELECT progress FROM users WHERE id = ?').bind(user.id).first();
  if (!badgeSet(u && u.progress, await badges(db, user.id)).has(id)) fail(403, "You haven't earned that badge yet.");
  await db.prepare('UPDATE users SET title = ? WHERE id = ?').bind(id, user.id).run();
  return json({ ok: true, title: id });
}

/* ---------------- dislikes ---------------- */
// A like and a dislike can't both be on: picking one takes the other away.
export async function rateGame(ctx, game, who, kind) {
  const { db } = ctx;
  const [add, other] = kind === 'like' ? ['likes', 'dislikes'] : ['dislikes', 'likes'];
  const r = await db.prepare(`INSERT OR IGNORE INTO ${add} (game_id, who) VALUES (?, ?)`).bind(game.id, who).run();
  const removed = await db.prepare(`DELETE FROM ${other} WHERE game_id = ? AND who = ?`).bind(game.id, who).run();
  await db.batch([
    ...(r.meta.changes ? [db.prepare(`UPDATE games SET ${add} = ${add} + 1 WHERE id = ?`).bind(game.id)] : []),
    ...(removed.meta.changes ? [db.prepare(`UPDATE games SET ${other} = MAX(0, ${other} - 1) WHERE id = ?`).bind(game.id)] : []),
  ].concat(db.prepare('SELECT 1')));
  return !!r.meta.changes;
}
