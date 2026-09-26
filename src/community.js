// Players vote how hard a level is; the admin verifies it. Plus the daily challenge picker and
// the difficulty faces people have beaten (for profiles).
import { json, fail, needUser, randomId } from './util.js';
import { normalizeLevel } from '../public/js/format.js';
import { dailyCourse } from '../public/js/endless.js';
import { BUILTIN_STARS, diffName } from '../public/js/stars.js';
import { mailAdmin } from './mod.js';

export const COMMUNITY_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS diff_votes (game_id TEXT NOT NULL, user_id TEXT NOT NULL, stars INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (game_id, user_id))',
  "CREATE TABLE IF NOT EXISTS daily_pick (date TEXT PRIMARY KEY, game_id TEXT, how TEXT NOT NULL DEFAULT 'auto')",
];
export const VOTE = { needed: 10 };
const FACES = ['easy', 'normal', 'hard', 'harder', 'insane', 'demon'];
const faceOf = (n) => diffName(Math.max(1, Math.min(10, Math.round(n)))).toLowerCase();

/* ---------------- difficulty votes ---------------- */
// What the votes say: the face with the most votes wins, and its stars are the average of the votes for that face.
export async function voteSummary(db, gameId) {
  const { results } = await db.prepare('SELECT stars FROM diff_votes WHERE game_id = ?').bind(gameId).all();
  return summarize(results.map((r) => r.stars));
}
function summarize(votes) {
  if (!votes.length) return { votes: 0 };
  const byFace = {};
  for (const v of votes) (byFace[faceOf(v)] ||= []).push(v);
  const [face, list] = Object.entries(byFace).sort((a, b) => b[1].length - a[1].length || FACES.indexOf(b[0]) - FACES.indexOf(a[0]))[0];
  const stars = Math.round(list.reduce((s, v) => s + v, 0) / list.length);
  return { votes: votes.length, face, stars, faces: Object.fromEntries(Object.entries(byFace).map(([k, v]) => [k, v.length])) };
}
// Only players who beat it (the server checked their run) can vote, and not its maker.
export async function vote(ctx, gameId, input) {
  const user = needUser(ctx), { db } = ctx;
  const g = await db.prepare('SELECT id, name, creator, user_id, stars, suggested, hidden FROM games WHERE id = ?').bind(gameId).first();
  if (!g || g.hidden) fail(404, 'That game was not found.');
  if (g.user_id === user.id) fail(403, "You can't vote on your own level.");
  const beat = await db.prepare('SELECT 1 FROM best_times WHERE board = ? AND user_id = ?').bind('g:' + gameId, user.id).first();
  if (!beat) fail(403, 'Beat it first, then you can vote how hard it is.');
  const stars = Math.floor(Number(input.stars) || 0);
  if (stars < 1 || stars > 10) fail(400, 'Pick 1 to 10 stars.');
  await db.prepare('INSERT INTO diff_votes (game_id, user_id, stars, at) VALUES (?, ?, ?, ?) ON CONFLICT (game_id, user_id) DO UPDATE SET stars = excluded.stars, at = excluded.at').bind(gameId, user.id, stars, Date.now()).run();
  const sum = await voteSummary(db, gameId);
  // 10 votes on a level the admin hasn't rated: send it to the admin's mailbox to verify
  if (sum.votes >= VOTE.needed && !g.stars && !g.suggested) {
    const r = await db.prepare('UPDATE games SET suggested = ? WHERE id = ? AND suggested = 0').bind(sum.stars, gameId).run();
    if (r.meta.changes) {
      await mailAdmin(ctx, 'rate', `Rate "${g.name}"? Players say ${sum.stars}★ ${diffName(sum.stars)}`,
        `${sum.votes} players who beat "${g.name}" by ${g.creator} voted. Most picked ${diffName(sum.stars)} (${sum.stars}★). Accept it or pick another rating. Once it's rated, beating it gives difficulty stars and coins.`,
        { rate: { game: gameId, name: g.name, stars: sum.stars, votes: sum.votes, faces: sum.faces } });
    }
  }
  return json({ ok: true, mine: stars, ...sum });
}

/* ---------------- faces beaten (for profiles) ---------------- */
// verified = built-in levels and obbies, and player levels the admin rated. unverified = player levels nobody rated yet
// (counted by what the players voted, or "unrated" when nobody voted).
export async function facesBeaten(db, uid) {
  const verified = {}, unverified = {};
  const add = (o, k) => { o[k] = (o[k] || 0) + 1; };
  const { results: lv } = await db.prepare('SELECT level FROM level_progress WHERE user_id = ? AND (stars & 1) = 1').bind(uid).all();
  for (const r of lv) if (BUILTIN_STARS[r.level]) add(verified, faceOf(BUILTIN_STARS[r.level]));
  const [{ results: gs }, { results: vs }] = await Promise.all([
    db.prepare(`SELECT g.id, g.stars FROM best_times b JOIN games g ON b.board = 'g:' || g.id WHERE b.user_id = ? AND g.hidden = 0 LIMIT 500`).bind(uid).all(),
    db.prepare(`SELECT v.game_id, v.stars FROM best_times b JOIN diff_votes v ON b.board = 'g:' || v.game_id WHERE b.user_id = ? LIMIT 20000`).bind(uid).all(),
  ]);
  const votes = {};
  for (const v of vs) (votes[v.game_id] ||= []).push(v.stars);
  for (const g of gs) {
    if (g.stars) add(verified, faceOf(g.stars));
    else { const sum = summarize(votes[g.id] || []); add(unverified, sum.votes ? sum.face : 'unrated'); }
  }
  return { verified, unverified };
}

/* ---------------- the daily challenge ---------------- */
// 1. a level the admin picked for that day, 2. otherwise a top-liked (or most played) player level that was never
// the daily before, 3. otherwise Blockyard makes one.
const hashDate = (d) => { let h = 0; for (const c of d) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
export async function dailyPick(db, date) {
  let row = await db.prepare('SELECT game_id, how FROM daily_pick WHERE date = ?').bind(date).first();
  if (!row) {
    // only levels people actually liked or played a lot
    const { results } = await db.prepare(`SELECT id FROM games WHERE kind = '2d' AND hidden = 0 AND visibility = 'public' AND (likes >= 3 OR plays >= 20)
      AND id NOT IN (SELECT game_id FROM daily_pick WHERE game_id IS NOT NULL) ORDER BY likes DESC, plays DESC LIMIT 10`).all();
    const id = results.length ? results[hashDate(date) % results.length].id : null;
    await db.prepare('INSERT OR IGNORE INTO daily_pick (date, game_id, how) VALUES (?, ?, ?)').bind(date, id, id ? 'top' : 'auto').run();
    row = await db.prepare('SELECT game_id, how FROM daily_pick WHERE date = ?').bind(date).first();
  }
  if (row && row.game_id) {
    const g = await db.prepare('SELECT id, name, creator, data, hidden FROM games WHERE id = ?').bind(row.game_id).first();
    if (g && !g.hidden) {
      try { return { level: normalizeLevel(JSON.parse(g.data)), how: row.how, game: { id: g.id, name: g.name, creator: g.creator } }; } catch (e) { /* broken: use Blockyard's */ }
    }
  }
  return { level: dailyCourse(date), how: 'auto', game: null, raw: true };
}
export async function setDailyPick(db, date, gameId) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(400, 'Pick a date.');
  if (gameId) {
    const g = await db.prepare("SELECT id FROM games WHERE id = ? AND kind = '2d' AND hidden = 0").bind(gameId).first();
    if (!g) fail(404, "That 2D level wasn't found (3D worlds can't be the daily).");
    await db.prepare("INSERT INTO daily_pick (date, game_id, how) VALUES (?, ?, 'admin') ON CONFLICT (date) DO UPDATE SET game_id = excluded.game_id, how = 'admin'").bind(date, gameId).run();
  } else await db.prepare('DELETE FROM daily_pick WHERE date = ?').bind(date).run();
  return json({ ok: true });
}
export async function dailyPicks(db) {
  const today = new Date().toISOString().slice(0, 10);
  const { results } = await db.prepare(`SELECT p.date, p.how, g.id, g.name, g.creator FROM daily_pick p LEFT JOIN games g ON g.id = p.game_id
    WHERE p.date >= ? ORDER BY p.date LIMIT 30`).bind(new Date(Date.now() - 86400e3).toISOString().slice(0, 10)).all();
  return json({ today, picks: results });
}
