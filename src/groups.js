// Groups: Blockyard's own little Discord. A group has channels, members with roles, messages with replies and
// reactions, polls, an invite code, and its own notification setting per member.
// Group chat is NOT locked like DMs are: owners, mods and (when someone reports) the admin can read it.
import { json, fail, body, needUser, randomId, isAdmin } from './util.js';
import { mail } from './econ.js';
import { cleanText, isRude } from '../public/js/format.js';

export const GROUPS = {
  joined: 25, owned: 5, members: 500, channels: 15, msg: 500, perMinute: 20, page: 50, pollOptions: 8, pollHours: 168, pins: 1,
  reactions: ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀'],
  colors: ['#ff6b35', '#3a86ff', '#44c06a', '#9b5de5', '#ff5d8f', '#ffd23f', '#4cc9f0', '#1d1d2c'],
};
export const GROUPS_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_lower TEXT NOT NULL UNIQUE, descr TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#3a86ff',
    owner_id TEXT NOT NULL, open INTEGER NOT NULL DEFAULT 1, code TEXT NOT NULL, members INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, last_at INTEGER NOT NULL DEFAULT 0)`,
  'CREATE INDEX IF NOT EXISTS groups_open ON groups (open, members)',
  'CREATE UNIQUE INDEX IF NOT EXISTS groups_code ON groups (code)',
  `CREATE TABLE IF NOT EXISTS group_members (group_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', notify INTEGER NOT NULL DEFAULT 2,
    joined_at INTEGER NOT NULL, PRIMARY KEY (group_id, user_id))`,
  'CREATE INDEX IF NOT EXISTS group_members_user ON group_members (user_id)',
  'CREATE TABLE IF NOT EXISTS group_bans (group_id TEXT NOT NULL, user_id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (group_id, user_id))',
  `CREATE TABLE IF NOT EXISTS group_channels (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'text', pos INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS group_channels_g ON group_channels (group_id, pos)',
  `CREATE TABLE IF NOT EXISTS group_msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL, channel_id INTEGER NOT NULL, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
    reply_to INTEGER NOT NULL DEFAULT 0, poll_id INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS group_msgs_c ON group_msgs (channel_id, id)',
  'CREATE INDEX IF NOT EXISTS group_msgs_g ON group_msgs (group_id, at)',
  `CREATE TABLE IF NOT EXISTS group_polls (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL, question TEXT NOT NULL, options TEXT NOT NULL, multi INTEGER NOT NULL DEFAULT 0, ends_at INTEGER NOT NULL, at INTEGER NOT NULL)`,
  'CREATE TABLE IF NOT EXISTS group_votes (poll_id INTEGER NOT NULL, user_id TEXT NOT NULL, opt INTEGER NOT NULL, PRIMARY KEY (poll_id, user_id, opt))',
  'CREATE TABLE IF NOT EXISTS group_reacts (msg_id INTEGER NOT NULL, user_id TEXT NOT NULL, e TEXT NOT NULL, PRIMARY KEY (msg_id, user_id, e))',
  'CREATE TABLE IF NOT EXISTS group_reads (user_id TEXT NOT NULL, channel_id INTEGER NOT NULL, last_id INTEGER NOT NULL, PRIMARY KEY (user_id, channel_id))',
];
const RANK = { owner: 3, mod: 2, member: 1 };
const lookColor = (t) => { try { const c = JSON.parse(t || '{}').color; return /^#[0-9a-f]{6}$/i.test(c) ? c : '#ff6b35'; } catch (e) { return '#ff6b35'; } };
const chanName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/\s+/g, '-').slice(0, 24);

export async function groupsRoute(ctx, path, method) {
  if (!path.startsWith('/groups')) return null;
  let m;
  const input = method === 'POST' ? await body(ctx.request) : {};
  if (path === '/groups' && method === 'GET') return listGroups(ctx);
  if (path === '/groups' && method === 'POST') return createGroup(ctx, input);
  if ((m = path.match(/^\/groups\/join\/([A-Za-z0-9]{8})$/)) && method === 'POST') return joinGroup(ctx, null, m[1]);
  if (!(m = path.match(/^\/groups\/([A-Za-z0-9]{10})(\/.*)?$/))) return null;
  const gid = m[1], rest = m[2] || '';
  if (rest === '' && method === 'GET') return getGroup(ctx, gid);
  if (method !== 'GET' && ctx.user && ctx.user.muted && /^\/c\/\d+$/.test(rest)) fail(403, 'An admin muted your chat for now.');
  if (rest === '/join' && method === 'POST') return joinGroup(ctx, gid, null);
  if (rest === '/leave' && method === 'POST') return leaveGroup(ctx, gid);
  if (rest === '/settings' && method === 'POST') return groupSettings(ctx, gid, input);
  if (rest === '/delete' && method === 'POST') return deleteGroup(ctx, gid);
  if (rest === '/invite' && method === 'POST') return inviteToGroup(ctx, gid, input);
  if (rest === '/members' && method === 'GET') return groupMembers(ctx, gid);
  if ((m = rest.match(/^\/members\/([A-Za-z0-9_]{3,20})$/)) && method === 'POST') return memberAct(ctx, gid, m[1], input);
  if (rest === '/channels' && method === 'POST') return addChannel(ctx, gid, input);
  if ((m = rest.match(/^\/c\/(\d+)$/))) {
    if (method === 'GET') return readChannel(ctx, gid, Number(m[1]));
    if (method === 'POST') return sendMessage(ctx, gid, Number(m[1]), input);
  }
  if ((m = rest.match(/^\/c\/(\d+)\/(delete|rename)$/)) && method === 'POST') return channelAct(ctx, gid, Number(m[1]), m[2], input);
  if ((m = rest.match(/^\/polls\/(\d+)\/vote$/)) && method === 'POST') return votePoll(ctx, gid, Number(m[1]), input);
  if ((m = rest.match(/^\/m\/(\d+)\/(react|delete|pin|report)$/)) && method === 'POST') return messageAct(ctx, gid, Number(m[1]), m[2], input);
  return null;
}

/* ---------------- who's allowed ---------------- */
async function member(ctx, gid, need = 'member') {
  const user = needUser(ctx), { db } = ctx;
  const row = await db.prepare(`SELECT g.id, g.name, g.descr, g.color, g.owner_id, g.open, g.code, g.members, gm.role, gm.notify FROM groups g
    LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ? WHERE g.id = ?`).bind(user.id, gid).first();
  if (!row) fail(404, 'That group was not found.');
  const admin = isAdmin(ctx.env, user);
  if (!row.role && !(admin && need !== 'self')) fail(403, 'Join this group first.');
  if (RANK[row.role || 'member'] < RANK[need === 'self' ? 'member' : need] && !admin) fail(403, need === 'owner' ? 'Only the group\'s owner can do that.' : 'Only the group\'s owner and mods can do that.');
  return { user, db, g: row, role: row.role || (admin ? 'mod' : ''), admin };
}

/* ---------------- groups ---------------- */
async function listGroups(ctx) {
  const { db } = ctx, uid = ctx.user ? ctx.user.id : '';
  const [mine, discover] = await Promise.all([
    uid ? db.prepare(`SELECT g.id, g.name, g.descr, g.color, g.members, g.last_at, gm.role, gm.notify,
        (SELECT COUNT(*) FROM group_msgs m LEFT JOIN group_reads r ON r.user_id = ?1 AND r.channel_id = m.channel_id
          WHERE m.group_id = g.id AND m.id > COALESCE(r.last_id, 0) AND m.user_id != ?1 AND m.at > ?2) AS unread
      FROM group_members gm JOIN groups g ON g.id = gm.group_id WHERE gm.user_id = ?1 ORDER BY g.last_at DESC`).bind(uid, Date.now() - 14 * 86400e3).all() : { results: [] },
    db.prepare(`SELECT g.id, g.name, g.descr, g.color, g.members FROM groups g WHERE g.open = 1 ORDER BY g.members DESC, g.last_at DESC LIMIT 40`).all(),
  ]);
  const have = new Set(mine.results.map((g) => g.id));
  return json({ mine: mine.results, discover: discover.results.filter((g) => !have.has(g.id)), limits: { joined: GROUPS.joined, owned: GROUPS.owned } });
}
async function createGroup(ctx, input) {
  const user = needUser(ctx), { db } = ctx;
  const name = cleanText(input.name, 28);
  if (name.length < 3) fail(400, 'Group names need at least 3 letters.');
  if (isRude(name) || isRude(input.descr || '')) fail(400, 'Pick a friendlier name or description.');
  const owned = await db.prepare('SELECT COUNT(*) AS n FROM groups WHERE owner_id = ?').bind(user.id).first();
  if (owned.n >= GROUPS.owned && !isAdmin(ctx.env, user)) fail(400, `You can own up to ${GROUPS.owned} groups.`);
  const joined = await db.prepare('SELECT COUNT(*) AS n FROM group_members WHERE user_id = ?').bind(user.id).first();
  if (joined.n >= GROUPS.joined) fail(400, `You can be in up to ${GROUPS.joined} groups. Leave one first.`);
  if (await db.prepare('SELECT 1 FROM groups WHERE name_lower = ?').bind(name.toLowerCase()).first()) fail(409, 'There is already a group with that name.');
  const id = randomId(10), now = Date.now();
  await db.batch([
    db.prepare('INSERT INTO groups (id, name, name_lower, descr, color, owner_id, open, code, members, created_at, last_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
      .bind(id, name, name.toLowerCase(), cleanText(input.descr, 160), GROUPS.colors.includes(input.color) ? input.color : GROUPS.colors[1], user.id, input.open === false ? 0 : 1, randomId(8), now, now),
    db.prepare("INSERT INTO group_members (group_id, user_id, role, notify, joined_at) VALUES (?, ?, 'owner', 2, ?)").bind(id, user.id, now),
    db.prepare("INSERT INTO group_channels (group_id, name, kind, pos, created_at) VALUES (?, 'general', 'text', 0, ?)").bind(id, now),
    db.prepare("INSERT INTO group_channels (group_id, name, kind, pos, created_at) VALUES (?, 'news', 'news', 1, ?)").bind(id, now),
  ]);
  return json({ id }, 201);
}
async function getGroup(ctx, gid) {
  const user = needUser(ctx), { db } = ctx;
  const g = await db.prepare(`SELECT g.id, g.name, g.descr, g.color, g.open, g.code, g.members, g.owner_id, u.name AS owner, gm.role, gm.notify FROM groups g
    JOIN users u ON u.id = g.owner_id LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ? WHERE g.id = ?`).bind(user.id, gid).first();
  if (!g) fail(404, 'That group was not found.');
  const admin = isAdmin(ctx.env, user);
  const out = { id: g.id, name: g.name, descr: g.descr, color: g.color, open: !!g.open, members: g.members, owner: g.owner, role: g.role || '', notify: g.notify ?? 2, admin, reactions: GROUPS.reactions };
  if (!g.role && !admin) return json({ group: out, channels: [] }); // not a member: just the front door
  if (RANK[g.role] >= 2 || admin) out.code = g.code;
  const { results } = await db.prepare(`SELECT c.id, c.name, c.kind, c.pos,
      (SELECT COUNT(*) FROM group_msgs m WHERE m.channel_id = c.id AND m.id > COALESCE((SELECT last_id FROM group_reads r WHERE r.user_id = ?1 AND r.channel_id = c.id), 0) AND m.user_id != ?1) AS unread
    FROM group_channels c WHERE c.group_id = ?2 ORDER BY c.pos, c.id`).bind(user.id, gid).all();
  return json({ group: out, channels: results });
}
async function joinGroup(ctx, gid, code) {
  const user = needUser(ctx), { db } = ctx;
  const g = code ? await db.prepare('SELECT * FROM groups WHERE code = ?').bind(code).first() : await db.prepare('SELECT * FROM groups WHERE id = ?').bind(gid).first();
  if (!g) fail(404, code ? 'That invite code doesn\'t work (anymore).' : 'That group was not found.');
  if (!code && !g.open && !isAdmin(ctx.env, user)) fail(403, 'This group is invite only. Ask a member for the invite link.');
  if (await db.prepare('SELECT 1 FROM group_bans WHERE group_id = ? AND user_id = ?').bind(g.id, user.id).first()) fail(403, 'You were removed from this group.');
  if (await db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').bind(g.id, user.id).first()) return json({ id: g.id, already: true });
  const joined = await db.prepare('SELECT COUNT(*) AS n FROM group_members WHERE user_id = ?').bind(user.id).first();
  if (joined.n >= GROUPS.joined) fail(400, `You can be in up to ${GROUPS.joined} groups. Leave one first.`);
  if (g.members >= GROUPS.members) fail(400, 'This group is full.');
  await db.batch([
    db.prepare("INSERT INTO group_members (group_id, user_id, role, notify, joined_at) VALUES (?, ?, 'member', 2, ?)").bind(g.id, user.id, Date.now()),
    db.prepare('UPDATE groups SET members = members + 1 WHERE id = ?').bind(g.id),
  ]);
  return json({ id: g.id }, 201);
}
async function leaveGroup(ctx, gid) {
  const { user, db, g } = await member(ctx, gid, 'self');
  if (g.owner_id === user.id) fail(400, 'You own this group. Give it to someone else first (Members > Make owner), or delete it.');
  await db.batch([
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').bind(gid, user.id),
    db.prepare('UPDATE groups SET members = MAX(1, members - 1) WHERE id = ?').bind(gid),
  ]);
  return json({ ok: true });
}
async function groupSettings(ctx, gid, input) {
  const { user, db, g, role, admin } = await member(ctx, gid, 'self');
  const stmts = [];
  if ([0, 1, 2].includes(input.notify)) stmts.push(db.prepare('UPDATE group_members SET notify = ? WHERE group_id = ? AND user_id = ?').bind(input.notify, gid, user.id));
  const wantsEdit = ['name', 'descr', 'color', 'open', 'newCode'].some((k) => input[k] !== undefined);
  if (wantsEdit) {
    if (role !== 'owner' && !admin) fail(403, 'Only the group\'s owner can change the group.');
    let name = g.name;
    if (input.name !== undefined) {
      name = cleanText(input.name, 28);
      if (name.length < 3 || isRude(name)) fail(400, 'Pick a different name (3 letters or more).');
      if (name.toLowerCase() !== g.name.toLowerCase() && await db.prepare('SELECT 1 FROM groups WHERE name_lower = ?').bind(name.toLowerCase()).first()) fail(409, 'There is already a group with that name.');
    }
    const descr = input.descr !== undefined ? cleanText(input.descr, 160) : g.descr;
    if (isRude(descr)) fail(400, 'Pick a friendlier description.');
    stmts.push(db.prepare('UPDATE groups SET name = ?, name_lower = ?, descr = ?, color = ?, open = ?, code = ? WHERE id = ?')
      .bind(name, name.toLowerCase(), descr, GROUPS.colors.includes(input.color) ? input.color : g.color, input.open === undefined ? g.open : (input.open ? 1 : 0), input.newCode ? randomId(8) : g.code, gid));
  }
  if (stmts.length) await db.batch(stmts);
  return json({ ok: true });
}
async function deleteGroup(ctx, gid) {
  const { db } = await member(ctx, gid, 'owner');
  await db.batch([
    db.prepare('DELETE FROM group_votes WHERE poll_id IN (SELECT id FROM group_polls WHERE group_id = ?)').bind(gid),
    db.prepare('DELETE FROM group_reacts WHERE msg_id IN (SELECT id FROM group_msgs WHERE group_id = ?)').bind(gid),
    db.prepare('DELETE FROM group_reads WHERE channel_id IN (SELECT id FROM group_channels WHERE group_id = ?)').bind(gid),
    ...['group_polls', 'group_msgs', 'group_channels', 'group_members', 'group_bans'].map((t) => db.prepare(`DELETE FROM ${t} WHERE group_id = ?`).bind(gid)),
    db.prepare('DELETE FROM groups WHERE id = ?').bind(gid),
  ]);
  return json({ ok: true });
}
async function inviteToGroup(ctx, gid, input) {
  const { user, db, g } = await member(ctx, gid);
  if (!g.open && RANK[g.role] < 2) fail(403, 'Only the owner and mods can invite people to an invite-only group.');
  const other = await db.prepare('SELECT id, name, banned FROM users WHERE name_lower = ?').bind(String(input.name || '').toLowerCase()).first();
  if (!other || other.banned) fail(404, 'No player with that name.');
  const friends = await db.prepare("SELECT 1 FROM friends WHERE status = 'ok' AND ((a = ? AND b = ?) OR (a = ? AND b = ?))").bind(user.id, other.id, other.id, user.id).first();
  if (!friends) fail(403, 'You can only invite friends. (Anyone can use the invite link.)');
  if (await db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').bind(gid, other.id).first()) fail(400, `${other.name} is already in this group.`);
  await mail(db, other.id, 'group', `${user.name} invited you to the group "${g.name}"`, 'Open your mailbox and press Join to hop in.', { group: g.code, name: g.name }).run();
  return json({ ok: true });
}

/* ---------------- members ---------------- */
async function groupMembers(ctx, gid) {
  const { db } = await member(ctx, gid);
  const { results } = await db.prepare(`SELECT u.name, u.look, u.seen, gm.role, gm.joined_at FROM group_members gm JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ? AND u.banned = 0 ORDER BY CASE gm.role WHEN 'owner' THEN 0 WHEN 'mod' THEN 1 ELSE 2 END, u.seen DESC LIMIT 300`).bind(gid).all();
  const now = Date.now();
  return json({ members: results.map((r) => ({ name: r.name, color: lookColor(r.look), role: r.role, online: now - (r.seen || 0) < 3 * 60e3 })) });
}
async function memberAct(ctx, gid, name, input) {
  const { user, db, g, role, admin } = await member(ctx, gid, 'mod');
  const t = await db.prepare(`SELECT u.id, u.name, gm.role FROM users u JOIN group_members gm ON gm.user_id = u.id AND gm.group_id = ? WHERE u.name_lower = ?`).bind(gid, name.toLowerCase()).first();
  if (!t) fail(404, 'That player is not in this group.');
  if (t.id === user.id) fail(400, "You can't do that to yourself.");
  const act = String(input.act || '');
  const top = role === 'owner' || admin;
  if (t.role === 'owner') fail(403, "You can't change the owner.");
  if (t.role === 'mod' && !top) fail(403, 'Only the owner can change a mod.');
  if (act === 'mod' || act === 'member') {
    if (!top) fail(403, 'Only the owner picks mods.');
    await db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').bind(act, gid, t.id).run();
  } else if (act === 'owner') {
    if (g.owner_id !== user.id && !admin) fail(403, 'Only the owner can give the group away.');
    await db.batch([
      db.prepare("UPDATE group_members SET role = 'mod' WHERE group_id = ? AND user_id = ?").bind(gid, g.owner_id),
      db.prepare("UPDATE group_members SET role = 'owner' WHERE group_id = ? AND user_id = ?").bind(gid, t.id),
      db.prepare('UPDATE groups SET owner_id = ? WHERE id = ?').bind(t.id, gid),
    ]);
  } else if (act === 'kick' || act === 'ban') {
    const stmts = [db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').bind(gid, t.id), db.prepare('UPDATE groups SET members = MAX(1, members - 1) WHERE id = ?').bind(gid)];
    if (act === 'ban') stmts.push(db.prepare('INSERT OR IGNORE INTO group_bans (group_id, user_id, at) VALUES (?, ?, ?)').bind(gid, t.id, Date.now()));
    await db.batch(stmts);
  } else fail(400, 'Unknown action.');
  return json({ ok: true });
}

/* ---------------- channels ---------------- */
async function addChannel(ctx, gid, input) {
  const { db } = await member(ctx, gid, 'owner');
  const name = chanName(input.name);
  if (name.length < 2 || isRude(name)) fail(400, 'Channel names need 2 or more letters (a-z, 0-9, -).');
  const n = await db.prepare('SELECT COUNT(*) AS n FROM group_channels WHERE group_id = ?').bind(gid).first();
  if (n.n >= GROUPS.channels) fail(400, `A group can have up to ${GROUPS.channels} channels.`);
  if (await db.prepare('SELECT 1 FROM group_channels WHERE group_id = ? AND name = ?').bind(gid, name).first()) fail(409, 'There is already a channel with that name.');
  const r = await db.prepare('INSERT INTO group_channels (group_id, name, kind, pos, created_at) VALUES (?, ?, ?, ?, ?)').bind(gid, name, input.kind === 'news' ? 'news' : 'text', n.n, Date.now()).run();
  return json({ id: r.meta.last_row_id }, 201);
}
async function channelAct(ctx, gid, cid, act, input) {
  const { db } = await member(ctx, gid, 'owner');
  const c = await db.prepare('SELECT id FROM group_channels WHERE id = ? AND group_id = ?').bind(cid, gid).first();
  if (!c) fail(404, 'That channel was not found.');
  if (act === 'rename') {
    const name = chanName(input.name);
    if (name.length < 2 || isRude(name)) fail(400, 'Channel names need 2 or more letters (a-z, 0-9, -).');
    await db.prepare('UPDATE group_channels SET name = ?, kind = ? WHERE id = ?').bind(name, input.kind === 'news' ? 'news' : input.kind === 'text' ? 'text' : 'text', cid).run();
    return json({ ok: true });
  }
  const n = await db.prepare('SELECT COUNT(*) AS n FROM group_channels WHERE group_id = ?').bind(gid).first();
  if (n.n <= 1) fail(400, 'A group needs at least one channel.');
  await db.batch([
    db.prepare('DELETE FROM group_votes WHERE poll_id IN (SELECT poll_id FROM group_msgs WHERE channel_id = ? AND poll_id > 0)').bind(cid),
    db.prepare('DELETE FROM group_polls WHERE id IN (SELECT poll_id FROM group_msgs WHERE channel_id = ? AND poll_id > 0)').bind(cid),
    db.prepare('DELETE FROM group_reacts WHERE msg_id IN (SELECT id FROM group_msgs WHERE channel_id = ?)').bind(cid),
    db.prepare('DELETE FROM group_msgs WHERE channel_id = ?').bind(cid),
    db.prepare('DELETE FROM group_reads WHERE channel_id = ?').bind(cid),
    db.prepare('DELETE FROM group_channels WHERE id = ?').bind(cid),
  ]);
  return json({ ok: true });
}

/* ---------------- messages ---------------- */
async function hydrate(db, uid, rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id), pollIds = rows.map((r) => r.poll_id).filter(Boolean), replyIds = [...new Set(rows.map((r) => r.reply_to).filter(Boolean))];
  const q = (n) => Array(n).fill('?').join(',');
  const [reacts, polls, votes, replies] = await Promise.all([
    db.prepare(`SELECT msg_id, e, COUNT(*) AS n, MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS me FROM group_reacts WHERE msg_id IN (${q(ids.length)}) GROUP BY msg_id, e`).bind(uid, ...ids).all(),
    pollIds.length ? db.prepare(`SELECT id, question, options, multi, ends_at FROM group_polls WHERE id IN (${q(pollIds.length)})`).bind(...pollIds).all() : { results: [] },
    pollIds.length ? db.prepare(`SELECT poll_id, opt, COUNT(*) AS n, MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS me FROM group_votes WHERE poll_id IN (${q(pollIds.length)}) GROUP BY poll_id, opt`).bind(uid, ...pollIds).all() : { results: [] },
    replyIds.length ? db.prepare(`SELECT m.id, m.body, u.name FROM group_msgs m JOIN users u ON u.id = m.user_id WHERE m.id IN (${q(replyIds.length)})`).bind(...replyIds).all() : { results: [] },
  ]);
  const P = new Map(polls.results.map((p) => [p.id, { id: p.id, q: p.question, options: JSON.parse(p.options).map((t) => ({ t, n: 0, me: false })), multi: !!p.multi, ends: p.ends_at, over: p.ends_at < Date.now(), voters: 0 }]));
  for (const v of votes.results) { const p = P.get(v.poll_id); if (p && p.options[v.opt]) { p.options[v.opt].n = v.n; p.options[v.opt].me = !!v.me; } }
  for (const p of P.values()) p.total = p.options.reduce((a, o) => a + o.n, 0);
  const RP = new Map(replies.results.map((r) => [r.id, { name: r.name, text: r.body.slice(0, 80) }]));
  return rows.map((r) => ({
    id: r.id, name: r.name, color: lookColor(r.look), role: r.role || '', me: r.user_id === uid, text: r.body, at: r.at, pinned: !!r.pinned,
    reply: r.reply_to ? (RP.get(r.reply_to) || { name: '?', text: '(deleted message)' }) : null,
    poll: r.poll_id ? P.get(r.poll_id) || null : null,
    reacts: reacts.results.filter((x) => x.msg_id === r.id).map((x) => ({ e: x.e, n: x.n, me: !!x.me })),
  }));
}
const MSG_SELECT = `SELECT m.id, m.user_id, m.body, m.reply_to, m.poll_id, m.pinned, m.at, u.name, u.look, gm.role FROM group_msgs m JOIN users u ON u.id = m.user_id
  LEFT JOIN group_members gm ON gm.group_id = m.group_id AND gm.user_id = m.user_id`;
async function readChannel(ctx, gid, cid) {
  const { user, db } = await member(ctx, gid);
  const c = await db.prepare('SELECT id, name, kind FROM group_channels WHERE id = ? AND group_id = ?').bind(cid, gid).first();
  if (!c) fail(404, 'That channel was not found.');
  const after = Number(ctx.url.searchParams.get('after')) || 0, before = Number(ctx.url.searchParams.get('before')) || 0;
  const rows = after
    ? (await db.prepare(`${MSG_SELECT} WHERE m.channel_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT ?`).bind(cid, after, GROUPS.page).all()).results
    : (await db.prepare(`${MSG_SELECT} WHERE m.channel_id = ? ${before ? 'AND m.id < ?' : ''} ORDER BY m.id DESC LIMIT ?`).bind(...(before ? [cid, before, GROUPS.page] : [cid, GROUPS.page])).all()).results.reverse();
  const messages = await hydrate(db, user.id, rows);
  if (rows.length && !before) {
    const last = rows[rows.length - 1].id;
    await db.prepare('INSERT INTO group_reads (user_id, channel_id, last_id) VALUES (?, ?, ?) ON CONFLICT (user_id, channel_id) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)').bind(user.id, cid, last).run();
  }
  // things that changed on messages you already have (votes, reactions, deletions): the newest 30, when asked for
  let fresh = null;
  if (after && ctx.url.searchParams.get('fresh')) {
    const r = (await db.prepare(`${MSG_SELECT} WHERE m.channel_id = ? AND m.id <= ? ORDER BY m.id DESC LIMIT 30`).bind(cid, after).all()).results.reverse();
    fresh = await hydrate(db, user.id, r);
  }
  const pinned = !after && !before ? (await db.prepare(`${MSG_SELECT} WHERE m.channel_id = ? AND m.pinned = 1 ORDER BY m.id DESC LIMIT 1`).bind(cid).all()).results : null;
  return json({ channel: c, messages, fresh, pinned: pinned && pinned.length ? (await hydrate(db, user.id, pinned))[0] : null, more: !after && rows.length === GROUPS.page });
}
async function sendMessage(ctx, gid, cid, input) {
  const { user, db, g, role } = await member(ctx, gid);
  const c = await db.prepare('SELECT id, kind FROM group_channels WHERE id = ? AND group_id = ?').bind(cid, gid).first();
  if (!c) fail(404, 'That channel was not found.');
  if (c.kind === 'news' && RANK[role] < 2) fail(403, 'Only the owner and mods can post in a news channel. You can still react and vote.');
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM group_msgs WHERE user_id = ? AND at > ?').bind(user.id, Date.now() - 60e3).first();
  if (recent.n >= GROUPS.perMinute) fail(429, 'Slow down a little! Try again in a minute.');
  const now = Date.now();
  let pollId = 0, text = String(input.m || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, GROUPS.msg);
  if (input.poll) {
    const question = cleanText(input.poll.q, 140);
    const options = (Array.isArray(input.poll.options) ? input.poll.options : []).map((o) => cleanText(o, 60)).filter(Boolean).slice(0, GROUPS.pollOptions);
    if (question.length < 3 || options.length < 2) fail(400, 'A poll needs a question and at least 2 answers.');
    const hours = Math.max(1, Math.min(GROUPS.pollHours, Number(input.poll.hours) || 24));
    const r = await db.prepare('INSERT INTO group_polls (group_id, question, options, multi, ends_at, at) VALUES (?, ?, ?, ?, ?, ?)').bind(gid, question, JSON.stringify(options), input.poll.multi ? 1 : 0, now + hours * 3600e3, now).run();
    pollId = r.meta.last_row_id; text = '';
  } else if (!text) fail(400, 'Type a message first.');
  let reply = 0;
  if (input.reply) { const r = await db.prepare('SELECT id FROM group_msgs WHERE id = ? AND channel_id = ?').bind(Number(input.reply) || 0, cid).first(); if (r) reply = r.id; }
  const ins = await db.prepare('INSERT INTO group_msgs (group_id, channel_id, user_id, body, reply_to, poll_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(gid, cid, user.id, text, reply, pollId, now).run();
  await db.batch([
    db.prepare('UPDATE groups SET last_at = ? WHERE id = ?').bind(now, gid),
    db.prepare('INSERT INTO group_reads (user_id, channel_id, last_id) VALUES (?, ?, ?) ON CONFLICT (user_id, channel_id) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)').bind(user.id, cid, ins.meta.last_row_id),
  ]);
  return json({ id: ins.meta.last_row_id }, 201);
}
async function votePoll(ctx, gid, pid, input) {
  const { user, db } = await member(ctx, gid);
  const p = await db.prepare('SELECT id, options, multi, ends_at FROM group_polls WHERE id = ? AND group_id = ?').bind(pid, gid).first();
  if (!p) fail(404, 'That poll was not found.');
  if (p.ends_at < Date.now()) fail(400, 'This poll is over.');
  const n = JSON.parse(p.options).length, opt = Number(input.opt);
  if (!Number.isInteger(opt) || opt < 0 || opt >= n) fail(400, 'Pick one of the answers.');
  const had = await db.prepare('SELECT 1 FROM group_votes WHERE poll_id = ? AND user_id = ? AND opt = ?').bind(pid, user.id, opt).first();
  const stmts = [];
  if (had) stmts.push(db.prepare('DELETE FROM group_votes WHERE poll_id = ? AND user_id = ? AND opt = ?').bind(pid, user.id, opt)); // press again = take it back
  else {
    if (!p.multi) stmts.push(db.prepare('DELETE FROM group_votes WHERE poll_id = ? AND user_id = ?').bind(pid, user.id));
    stmts.push(db.prepare('INSERT OR IGNORE INTO group_votes (poll_id, user_id, opt) VALUES (?, ?, ?)').bind(pid, user.id, opt));
  }
  await db.batch(stmts);
  return json({ ok: true });
}
async function messageAct(ctx, gid, mid, act, input) {
  const { user, db, g, role, admin } = await member(ctx, gid);
  const msg = await db.prepare('SELECT m.id, m.user_id, m.channel_id, m.poll_id, m.pinned, m.body, m.at, u.name FROM group_msgs m JOIN users u ON u.id = m.user_id WHERE m.id = ? AND m.group_id = ?').bind(mid, gid).first();
  if (!msg) fail(404, 'That message is gone.');
  if (act === 'react') {
    const e = String(input.e || '');
    if (!GROUPS.reactions.includes(e)) fail(400, 'Pick one of the reactions.');
    const had = await db.prepare('SELECT 1 FROM group_reacts WHERE msg_id = ? AND user_id = ? AND e = ?').bind(mid, user.id, e).first();
    await (had ? db.prepare('DELETE FROM group_reacts WHERE msg_id = ? AND user_id = ? AND e = ?') : db.prepare('INSERT OR IGNORE INTO group_reacts (msg_id, user_id, e) VALUES (?, ?, ?)')).bind(mid, user.id, e).run();
    return json({ ok: true });
  }
  if (act === 'delete') {
    if (msg.user_id !== user.id && RANK[role] < 2 && !admin) fail(403, 'You can only delete your own messages.');
    await db.batch([
      db.prepare('DELETE FROM group_reacts WHERE msg_id = ?').bind(mid),
      db.prepare('DELETE FROM group_votes WHERE poll_id = ?').bind(msg.poll_id || -1),
      db.prepare('DELETE FROM group_polls WHERE id = ?').bind(msg.poll_id || -1),
      db.prepare('DELETE FROM group_msgs WHERE id = ?').bind(mid),
    ]);
    return json({ ok: true });
  }
  if (act === 'pin') {
    if (RANK[role] < 2 && !admin) fail(403, 'Only the owner and mods can pin messages.');
    await db.batch([
      db.prepare('UPDATE group_msgs SET pinned = 0 WHERE channel_id = ? AND pinned = 1').bind(msg.channel_id),
      ...(msg.pinned ? [] : [db.prepare('UPDATE group_msgs SET pinned = 1 WHERE id = ?').bind(mid)]),
    ]);
    return json({ ok: true });
  }
  // report: the messages around it go to the admin (Admin > Chat reports)
  if (msg.user_id === user.id) fail(400, "You can't report yourself.");
  const around = (await db.prepare(`SELECT m.body, m.at, u.name FROM group_msgs m JOIN users u ON u.id = m.user_id WHERE m.channel_id = ? AND m.id <= ? ORDER BY m.id DESC LIMIT 12`).bind(msg.channel_id, mid).all()).results.reverse();
  const reason = ['mean', 'spam', 'personal', 'cheating', 'other'].includes(input.reason) ? input.reason : 'other';
  await db.prepare('INSERT INTO chat_reports (reporter, reporter_name, target_id, target, room, reason, messages, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(user.id, user.name, msg.user_id, msg.name, ('Group: ' + g.name).slice(0, 40), reason, JSON.stringify(around.map((r) => ({ from: r.name, m: r.body, at: r.at }))), Date.now()).run();
  return json({ ok: true });
}

/* ---------------- what's new in my groups (part of the pulse the page checks) ---------------- */
// Returns { unread, events }. A member's notify setting: 2 = every message, 1 = only when someone writes @theirname
// (or @everyone from the owner or a mod, or replies to them), 0 = nothing.
export async function groupPulse(db, user, since) {
  const [n, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM group_msgs m JOIN group_members gm ON gm.group_id = m.group_id AND gm.user_id = ?1
      LEFT JOIN group_reads r ON r.user_id = ?1 AND r.channel_id = m.channel_id
      WHERE m.id > COALESCE(r.last_id, 0) AND m.user_id != ?1 AND m.at > ?2 AND gm.notify > 0`).bind(user.id, Date.now() - 14 * 86400e3).first(),
    db.prepare(`SELECT m.id, m.body, m.at, m.poll_id, m.channel_id, m.group_id, m.reply_to, u.name, g.name AS gname, c.name AS cname, gm.notify, sm.role AS srole,
        (SELECT user_id FROM group_msgs x WHERE x.id = m.reply_to) AS reply_user
      FROM group_msgs m JOIN group_members gm ON gm.group_id = m.group_id AND gm.user_id = ?1
      JOIN users u ON u.id = m.user_id JOIN groups g ON g.id = m.group_id JOIN group_channels c ON c.id = m.channel_id
      LEFT JOIN group_members sm ON sm.group_id = m.group_id AND sm.user_id = m.user_id
      LEFT JOIN group_reads r ON r.user_id = ?1 AND r.channel_id = m.channel_id
      WHERE m.at > ?2 AND m.user_id != ?1 AND gm.notify > 0 AND m.id > COALESCE(r.last_id, 0) ORDER BY m.id DESC LIMIT 8`).bind(user.id, since).all(),
  ]);
  const me = '@' + user.name.toLowerCase();
  const events = [];
  for (const r of rows.results) {
    const low = r.body.toLowerCase();
    const mention = low.includes(me) || r.reply_user === user.id || (low.includes('@everyone') && (r.srole === 'owner' || r.srole === 'mod'));
    if (r.notify === 1 && !mention) continue;
    events.push({ kind: 'group', mention, from: r.name, group: r.gname, gid: r.group_id, cid: r.channel_id, channel: r.cname, text: r.poll_id ? '📊 started a poll' : r.body.slice(0, 90), at: r.at });
  }
  return { unread: n.n, events };
}
