// Keeping Blockyard fair: 3 strikes (warning 1, 2, 3, then the account can be deleted), ways to earn warnings back,
// reports that hide a level until the admin looks at it, Builder / Builder Pro pay controls, and the admin's mail settings.
// Nothing here punishes anyone by itself: automatic checks only flag things for the admin, and every warning,
// ban and account deletion is the admin's choice (with a "are you sure?" first). There are no IP bans.
import { json, fail, isConstraint } from './util.js';

export const MOD = { hideAfter: 10, strikes: 3, goodReportsPerWarning: 3, popularLikes: 20, popularPlays: 100, reportLines: 6 };
// what each role may set a level's pay to
export const PAY = { builder: [0, 10, 25], builderpro: [0, 10, 25, 50, 100] };
export const ROLES = ['', 'builder', 'builderpro'];
export const ROLE_NAME = { builder: 'Builder', builderpro: 'Builder Pro' };
const ADMIN_NOTIFY = { bpPay: true, farm: true, review: true, rate: true };

const mailQ = (db, uid, kind, title, text, data = null) => db.prepare('INSERT INTO mail (user_id, kind, title, body, data, at) VALUES (?, ?, ?, ?, ?, ?)').bind(uid, kind, String(title).slice(0, 90), String(text).slice(0, 600), data ? JSON.stringify(data) : null, Date.now());

/* ---------------- warnings ---------------- */
// Warning 1 -> 2 -> 3 -> account deletion. Only the admin calls this. Someone who already has 3 warnings
// isn't warned again: the answer says the next step is deleting their account, and the admin has to confirm that
// (confirm: 'delete'), which deletes it.
export async function addWarning(ctx, uid, why, { confirm } = {}) {
  const { db } = ctx;
  const u = await db.prepare('SELECT id, name, warnings FROM users WHERE id = ?').bind(uid).first();
  if (!u) return { warnings: 0, gone: true };
  if (u.warnings >= MOD.strikes) {
    if (confirm !== 'delete') return { warnings: u.warnings, needConfirm: true, name: u.name };
    if (!ctx.deleteAccount) fail(500, 'Deleting accounts is not set up.');
    await ctx.deleteAccount(u, why);
    return { warnings: u.warnings, deleted: true, name: u.name };
  }
  const n = u.warnings + 1;
  await db.batch([
    db.prepare('UPDATE users SET warnings = warnings + 1 WHERE id = ?').bind(uid),
    mailQ(db, uid, 'warning', `Warning ${n} of ${MOD.strikes}`, `${why} ${n < MOD.strikes ? `After ${MOD.strikes} warnings, the next one deletes your account.` : 'That was your last warning: one more and your account is deleted.'} You can earn warnings back by making levels lots of people like and play, and by sending reports that turn out to be right.`),
  ]);
  return { warnings: n, name: u.name };
}
export async function removeWarning(db, uid, why) {
  const r = await db.prepare('UPDATE users SET warnings = warnings - 1 WHERE id = ? AND warnings > 0').bind(uid).run();
  if (r.meta.changes) await mailQ(db, uid, 'warning', 'A warning was removed!', why).run();
  return !!r.meta.changes;
}
// The admin agreed with a report: everyone who sent it gets credit. Every 3 good reports takes a warning away.
export async function creditReporters(db, ids) {
  for (const id of new Set(ids.filter(Boolean))) {
    await db.prepare('UPDATE users SET good_reports = good_reports + 1 WHERE id = ?').bind(id).run();
    const u = await db.prepare('SELECT good_reports, warnings FROM users WHERE id = ?').bind(id).first();
    if (u && u.warnings > 0 && u.good_reports % MOD.goodReportsPerWarning === 0) await removeWarning(db, id, 'Thanks for your helpful reports! They helped keep Blockyard friendly, so one of your warnings is gone.');
  }
}
// A level lots of people like and play takes one warning away from its maker (once per level).
export async function checkPopular(db, gameId) {
  const g = await db.prepare('SELECT g.id, g.name, g.likes, g.plays, g.user_id, u.warnings FROM games g JOIN users u ON u.id = g.user_id WHERE g.id = ?').bind(gameId).first();
  if (!g || !g.warnings || g.likes < MOD.popularLikes || g.plays < MOD.popularPlays) return false;
  try { await db.prepare('INSERT INTO claims (user_id, what, at) VALUES (?, ?, ?)').bind(g.user_id, 'pop:' + g.id, Date.now()).run(); }
  catch (e) { if (isConstraint(e)) return false; throw e; }
  return removeWarning(db, g.user_id, `"${g.name}" is a hit (${g.likes} likes, ${g.plays} plays)! Making great levels earned you back a warning.`);
}

/* ---------------- the admin's mail settings ---------------- */
export async function adminNotify(db) {
  try { const r = await db.prepare("SELECT value FROM settings WHERE key = 'admin_notify'").first(); return { ...ADMIN_NOTIFY, ...(r ? JSON.parse(r.value) : {}) }; } catch (e) { return { ...ADMIN_NOTIFY }; }
}
export async function setAdminNotify(db, input) {
  const cur = await adminNotify(db);
  for (const k of Object.keys(ADMIN_NOTIFY)) if (typeof input[k] === 'boolean') cur[k] = input[k];
  await db.prepare("INSERT INTO settings (key, value) VALUES ('admin_notify', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(cur)).run();
  return cur;
}
export async function mailAdmin(ctx, kind, title, text, data = null) {
  const { db, env } = ctx;
  if (!env.ADMIN_USERNAME) return;
  const prefs = await adminNotify(db);
  if (prefs[kind] === false) return;
  const names = String(env.ADMIN_USERNAME).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const n of names) {
    const a = await db.prepare('SELECT id FROM users WHERE name_lower = ?').bind(n).first();
    if (a) await mailQ(db, a.id, 'admin', title, text, data).run();
  }
}

/* ---------------- Builder / Builder Pro: setting what a level pays ---------------- */
// Builders set their own levels. Builder Pros can set anyone's, and the admin gets told.
export async function setPay(ctx, g, amount) {
  const { db, user } = ctx;
  const role = user && (user.admin ? 'builderpro' : user.role);
  if (!PAY[role]) fail(403, 'Only Builders can make their levels pay coins. Ask the admin!');
  const mine = g.user_id === user.id;
  if (!mine && role !== 'builderpro') fail(403, 'You can only do that for your own games. (Builder Pros can change other levels.)');
  amount = Math.floor(Number(amount) || 0);
  if (!PAY[role].includes(amount)) fail(400, `Pick ${PAY[role].join(', ')} coins.`);
  const before = await db.prepare('SELECT g.reward, g.name, u.name AS creator FROM games g LEFT JOIN users u ON u.id = g.user_id WHERE g.id = ?').bind(g.id).first();
  await db.prepare('UPDATE games SET reward = ? WHERE id = ?').bind(amount, g.id).run();
  if (!mine && !user.admin && before && before.reward !== amount) {
    await db.prepare('INSERT INTO admin_log (admin, path, detail, at) VALUES (?, ?, ?, ?)').bind(user.name + ' (Builder Pro)', 'pay', JSON.stringify({ game: g.id, name: before.name, from: before.reward, to: amount, creator: before.creator }), Date.now()).run();
    await mailAdmin(ctx, 'bpPay', `${user.name} changed a level's pay`, `Builder Pro ${user.name} changed "${before.name}" by ${before.creator || '?'} from ${before.reward} to ${amount} coins.`);
    if (g.user_id) await mailQ(db, g.user_id, 'role', `Your level "${before.name}" pays ${amount} coins now`, `Builder Pro ${user.name} set "${before.name}" to pay ${amount} coins (it was ${before.reward}).`).run();
  }
  return json({ ok: true, id: g.id, reward: amount });
}
