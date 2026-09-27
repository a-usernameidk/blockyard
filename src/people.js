// Following players, wearing a badge as your title, display names, profile pictures,
// the OG / Beta Tester roles, and disliking levels.
import { json, fail, body, needUser } from './util.js';
import { mail, badges } from './econ.js';
import { isRude } from '../public/js/format.js';
import { TAGS, SPECIAL_TITLES, cleanTags, cleanPfp, cleanDisplay, squash, RESERVED, DISPLAY } from '../public/js/names.js';

export const PEOPLE_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS follows (follower TEXT NOT NULL, followee TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (follower, followee))',
  'CREATE INDEX IF NOT EXISTS follows_followee ON follows (followee)',
  'CREATE TABLE IF NOT EXISTS dislikes (game_id TEXT NOT NULL, who TEXT NOT NULL, PRIMARY KEY (game_id, who))',
];
export const PEOPLE_COLUMNS = ['ALTER TABLE games ADD COLUMN dislikes INTEGER NOT NULL DEFAULT 0', 'ALTER TABLE users ADD COLUMN title TEXT',
  'ALTER TABLE users ADD COLUMN display TEXT', 'ALTER TABLE users ADD COLUMN display_at INTEGER NOT NULL DEFAULT 0', 'ALTER TABLE users ADD COLUMN pfp TEXT', "ALTER TABLE users ADD COLUMN tags TEXT NOT NULL DEFAULT ''"];
// The owner is the first name in ADMIN_USERNAME (SALT). Only the owner can wear the Admin title.
export const ownerName = (env) => (env.ADMIN_USERNAME || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)[0] || '';
export const isOwner = (env, u) => !!u && !!ownerName(env) && String(u.name).toLowerCase() === ownerName(env);
// The name everyone sees: the display name if there is one, otherwise the username
export const shownName = (u) => (u && u.display) || (u && u.name) || '';
export const FOLLOW = { maxFollowing: 500, notify: 300 };

export async function peopleRoute(ctx, path, method) {
  let m;
  if ((m = path.match(/^\/users\/([A-Za-z0-9_]{3,20})\/follow$/)) && method === 'POST') return follow(ctx, m[1], await body(ctx.request));
  if (path === '/me/title' && method === 'PUT') return setTitle(ctx, await body(ctx.request));
  if (path === '/me/following' && method === 'GET') return following(ctx);
  if (path === '/me/display' && method === 'PUT') return setDisplay(ctx, await body(ctx.request));
  if (path === '/me/pfp' && method === 'PUT') return setPfp(ctx, await body(ctx.request));
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
  const u = await db.prepare('SELECT name, progress, tags FROM users WHERE id = ?').bind(user.id).first();
  if (id === 'admin' && !isOwner(ctx.env, u)) fail(403, 'Only the owner can wear the Admin title.');
  if (!(await titleOk(ctx.env, db, user.id, u, id))) fail(403, TAGS[id] ? `Only players the admin made ${TAGS[id]} can wear that title.` : "You haven't earned that badge yet.");
  await db.prepare('UPDATE users SET title = ? WHERE id = ?').bind(id, user.id).run();
  return json({ ok: true, title: id });
}

// Can this player wear this title? (a badge they earned, a role the admin gave them, or Admin for the owner)
export async function titleOk(env, db, uid, u, id, serverBadges) {
  if (!id || !u) return false;
  if (id === 'admin') return isOwner(env, u);
  if (TAGS[id]) return cleanTags(u.tags).includes(id);
  return badgeSet(u.progress, serverBadges || (await badges(db, uid))).has(id);
}
export const titleLabel = (id) => SPECIAL_TITLES[id] || null;

/* ---------------- display names and profile pictures ---------------- */
async function setDisplay(ctx, input) {
  const user = needUser(ctx), { db, env } = ctx;
  const u = await db.prepare('SELECT name, display, display_at FROM users WHERE id = ?').bind(user.id).first();
  const now = Date.now(), owner = isOwner(env, u);
  const wait = (u.display_at || 0) + DISPLAY.everyMs - now;
  if (wait > 0 && !owner) fail(429, `You can change your display name once a day. Try again in ${Math.ceil(wait / 3600e3)} hour${Math.ceil(wait / 3600e3) === 1 ? '' : 's'}.`);
  const raw = String(input.name || '').trim();
  if (!raw || raw.toLowerCase() === u.name.toLowerCase()) {
    await db.prepare('UPDATE users SET display = NULL, display_at = ? WHERE id = ?').bind(now, user.id).run();
    return json({ ok: true, display: null });
  }
  const d = cleanDisplay(raw);
  if (!d) fail(400, `Display names are ${DISPLAY.min} to ${DISPLAY.max} letters, numbers and spaces (and _ . - ' !).`);
  if (isRude(d)) fail(400, 'Pick a different display name. That one has a blocked word in it.');
  const sq = squash(d);
  if (!owner) {
    const words = d.toLowerCase().split(/[^a-z0-9]+/);
    if (words.some((w) => RESERVED.includes(w)) || ['admin', 'owner', 'moderator'].some((w) => sq.includes(w))) fail(400, "Display names can't say admin, owner, mod or Blockyard.");
    if (sq === squash(ownerName(env))) fail(400, "That's the owner's name.");
    // no pretending to be another player: a display name can't be someone else's username
    const low = d.toLowerCase(), tries = [...new Set([low, low.replace(/ /g, '_'), low.replace(/ /g, ''), sq])].filter((x) => /^[a-z0-9_]{3,16}$/.test(x) && x !== u.name.toLowerCase());
    if (tries.length && sq !== squash(u.name)) {
      const other = await db.prepare(`SELECT 1 FROM users WHERE name_lower IN (${tries.map(() => '?').join(',')})`).bind(...tries).first();
      if (other) fail(400, "That's another player's username. Pick something else.");
    }
  }
  await db.prepare('UPDATE users SET display = ?, display_at = ? WHERE id = ?').bind(d, now, user.id).run();
  return json({ ok: true, display: d });
}
async function setPfp(ctx, input) {
  const user = needUser(ctx);
  const p = cleanPfp(input.pfp);
  if (input.pfp && !p) fail(400, "That profile picture doesn't work.");
  await ctx.db.prepare('UPDATE users SET pfp = ? WHERE id = ?').bind(p || null, user.id).run();
  return json({ ok: true, pfp: p || null });
}
// The admin gives or takes the OG and Beta Tester roles. Taking one away also takes off that title.
export async function setTag(ctx, u, tag, on, by) {
  const { db } = ctx;
  if (!TAGS[tag]) fail(400, 'Unknown role.');
  const row = await db.prepare('SELECT tags, title FROM users WHERE id = ?').bind(u.id).first();
  const tags = new Set(cleanTags(row && row.tags));
  const had = tags.has(tag);
  if (on) tags.add(tag); else tags.delete(tag);
  const stmts = [db.prepare('UPDATE users SET tags = ? WHERE id = ?').bind([...tags].join(','), u.id)];
  if (!on && row && row.title === tag) stmts.push(db.prepare('UPDATE users SET title = NULL WHERE id = ?').bind(u.id));
  if (on && !had) stmts.push(mail(db, u.id, 'role', `You're ${tag === 'og' ? 'an' : 'a'} ${TAGS[tag]} now!`, `${by} gave you the ${TAGS[tag]} role. It shows on your profile and your name tag. You can also wear "${TAGS[tag]}" as your title (Shop > Badges).`));
  if (!on && had) stmts.push(mail(db, u.id, 'role', `Your ${TAGS[tag]} role was removed`, `${by} took away your ${TAGS[tag]} role.`));
  await db.batch(stmts);
  return [...tags];
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
