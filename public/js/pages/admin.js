// Admin: chat reports, reported games (hide, delete, make them pay coins), players (coins, items,
// passwords, kick, ban), the site announcement, and limited item stock.
import { $, $$, el, session, show, go, addRoute, ask, toast, timeAgo, plural, openModal, closeModal } from '../app.js';
import { api } from '../api.js';
import { SHOP, KINDS, LIMITED, itemKey, findItem, levelOf } from '../cosmetics.js';
import { SPOTS as TY_SPOTS, STAGES as TY_STAGES } from '../tycoon.js';
import { refreshWallet } from './account.js';
import { showAnnounce, loadOnline } from './worlds.js';
import { normalizeLevel } from '../format.js';
import { thumb } from './play.js';
import { drawWorldThumb } from '../thumb3d.js';
import { diffName } from '../stars.js';
import { TAGS } from '../names.js';

let tab = 'chat';
async function showAdmin() {
  show('admin', '');
  if (!session.user || !session.user.admin) { $('#admin-msg').textContent = 'Log in with your admin account to see this page.'; ['#admin-chat', '#admin-games', '#admin-users', '#admin-stock'].forEach((s) => { $(s).innerHTML = ''; }); $('#admin-site').hidden = true; $('#admin-log').hidden = true; return; }
  setTab(tab);
}
function setTab(t) {
  tab = t;
  $$('[data-atab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.atab === t)));
  $('#admin-chat').hidden = t !== 'chat'; $('#admin-games-wrap').hidden = t !== 'games'; $('#admin-users-wrap').hidden = t !== 'users'; $('#admin-site').hidden = t !== 'site'; $('#admin-log').hidden = t !== 'log';
  $('#admin-msg').textContent = '';
  if (t === 'chat') loadChat(); else if (t === 'games') loadGames(); else if (t === 'site') { loadSite(); loadDeals(); } else if (t === 'log') loadLog(); else findUsers();
}
$$('[data-atab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.atab)));
$('#admin-refresh').addEventListener('click', () => setTab(tab));

// Warning 1, 2, 3, then the account can be deleted. The server never deletes by itself: when someone already
// has 3 warnings it asks, and only a confirmed "Delete account" goes through.
async function warnFlow(send, name) {
  let r = await send({});
  if (r && r.needConfirm) {
    const ok = await ask(`Delete ${r.name || name}'s account?`, `${r.name || name} already has 3 warnings, so the next step is deleting their account. Their games, items and coins are deleted too. This can't be undone.`, [{ label: 'Delete account', value: true, cls: 'btn-danger' }]);
    if (!ok) return { cancelled: true };
    r = await send({ confirm: 'delete' });
  }
  return r;
}
const warnText = (r, name) => (r.cancelled ? 'Nothing changed.' : r.deleted ? `${r.name || name}'s account was deleted.` : `${r.name || name} has ${r.warnings} of 3 warnings now.`);

async function loadChat() {
  const box = $('#admin-chat'); box.innerHTML = ''; $('#admin-msg').textContent = 'Loading…';
  try {
    const { reports } = await api.admin('GET', '/chat');
    $('#admin-msg').textContent = reports.length ? '' : 'No chat reports. Nice.';
    for (const r of reports) {
      box.append(el('div', { class: 'admin-row chat-report' },
        el('div', {}, el('h3', {}, `${r.target}`), el('p', { class: 'small' }, `Reported by ${r.reporter} for "${r.reason}", ${timeAgo(r.at)}.`)),
        el('p', { class: 'small' }, r.room === 'DMs' ? 'Private messages: only the last few before the report were unlocked for you.' : 'The last few things they said in that server.'),
        el('ol', { class: 'said' }, ...(r.messages.length ? r.messages.map((m) => el('li', {}, el('span', { class: 'small' }, new Date(m.at).toLocaleTimeString() + ' '), m.from ? el('b', {}, m.from + ': ') : null, m.m)) : [el('li', { class: 'small' }, 'They had not said anything in that server.')])),
        el('div', { class: 'row' },
          el('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { if (await ask(`Ban ${r.target}?`, 'They get logged out, kicked from every server, and their games are hidden.', [{ label: 'Ban', value: true, cls: 'btn-danger' }])) { try { await api.admin('POST', '/chat/' + r.id, { action: 'ban' }); toast(`${r.target} banned.`); loadChat(); } catch (e) { toast(e.message); } } } }, 'Ban'),
          el('button', { class: 'btn btn-sun', type: 'button', onclick: async () => {
            if (!(await ask(`Warn ${r.target}?`, 'They get a warning in their mailbox, and the players who reported it get credit.', [{ label: 'Give a warning', value: true, cls: 'btn-sun' }]))) return;
            try { const w = await warnFlow((x) => api.admin('POST', '/chat/' + r.id, { action: 'warn', ...x }), r.target); toast(warnText(w, r.target)); loadChat(); } catch (e) { toast(e.message); }
          } }, 'Warn'),
          el('button', { class: 'btn', type: 'button', onclick: async () => {
            const how = await ask('Dismiss this report?', `Was it just a mistake, or a false or spam report by ${r.reporter}? False reports can get the reporter a warning.`, [{ label: 'Just dismiss', value: 'plain' }, { label: `Dismiss + warn ${r.reporter}`, value: 'false', cls: 'btn-danger' }]);
            if (!how) return;
            try {
              const w = await warnFlow((x) => api.admin('POST', '/chat/' + r.id, { action: 'dismiss', falseReport: how === 'false', ...x }), r.reporter);
              toast(how === 'false' ? warnText(w, r.reporter) : 'Dismissed.'); loadChat();
            } catch (e) { toast(e.message); }
          } }, 'Dismiss'),
          el('button', { class: 'btn', type: 'button', onclick: () => manageUser(r.target) }, 'Manage'),
          el('a', { class: 'btn', href: '#/u/' + r.target }, 'Profile'))));
    }
  } catch (e) { $('#admin-msg').textContent = e.message; }
}

async function loadGames() {
  const box = $('#admin-games'); box.innerHTML = ''; $('#admin-msg').textContent = 'Loading…';
  try {
    const { games } = await api.admin('GET', '/games');
    $('#admin-msg').textContent = games.length ? '' : 'No published games yet.';
    for (const g of games) {
      let pic = el('span');
      if (g.kind === '3d') { pic = el('canvas', { class: 'thumb3d' }); requestAnimationFrame(() => drawWorldThumb(pic, g.thumb, g.theme)); }
      else { try { pic = thumb(normalizeLevel(g.level)); } catch (e) { /* broken */ } }
      const reasons = Object.entries(g.reasons).map(([r, n]) => `${n} ${r}`).join(', ');
      const act = (label, cls, action, extra) => el('button', { class: 'btn ' + cls, type: 'button', onclick: async (e) => {
        if ((action === 'delete' || action === 'warn') && e.currentTarget.dataset.sure !== '1') { e.currentTarget.dataset.sure = '1'; e.currentTarget.textContent = action === 'warn' ? 'Click again: take down + warn' : 'Click again to delete'; return; }
        try {
          if (action === 'warn') { const w = await warnFlow((x) => api.admin('POST', '/games/' + g.id, { action, ...extra, ...x }), g.creator); if (!w.cancelled) toast(warnText(w, g.creator)); }
          else await api.admin('POST', '/games/' + g.id, { action, ...extra });
          loadGames();
        } catch (err) { toast(err.message); }
      } }, label);
      const reward = el('select', { 'aria-label': 'Coins this game pays' }, ...[0, 10, 25, 50, 100, 200].map((n) => el('option', { value: String(n) }, n ? `Pays ${n} coins` : 'Pays nothing')));
      if (![0, 10, 25, 50, 100, 200].includes(g.reward)) reward.append(el('option', { value: String(g.reward) }, `Pays ${g.reward} coins`));
      reward.value = String(g.reward || 0);
      reward.addEventListener('change', async () => { try { await api.admin('POST', '/games/' + g.id, { action: 'reward', amount: Number(reward.value) }); toast(Number(reward.value) ? `"${g.name}" pays ${reward.value} coins now (once per player).` : `"${g.name}" doesn't pay coins anymore.`); } catch (e) { toast(e.message); } });
      // difficulty rating, Geometry Dash style
      const rate = el('select', { 'aria-label': 'Difficulty stars' }, el('option', { value: '0' }, 'Unrated'), ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => el('option', { value: String(n) }, `${n}★ ${diffName(n)}`)));
      rate.value = String(g.stars || 0);
      rate.addEventListener('change', async () => { try { await api.admin('POST', '/games/' + g.id, { action: 'stars', amount: Number(rate.value) }); toast(Number(rate.value) ? `"${g.name}" is rated ${rate.value}★ ${diffName(Number(rate.value))}.` : `"${g.name}" is unrated now.`); } catch (e) { toast(e.message); } });
      box.append(el('div', { class: 'admin-row' + (g.hidden ? ' hidden-game' : '') }, pic,
        el('div', {}, el('h3', {}, g.name), el('p', { class: 'small' }, `${g.kind === '3d' ? '3D world' : '2D level'} by ${g.creator}. ${plural(g.plays, 'play')}, ${plural(g.likes, 'like')}. ${g.visibility !== 'public' ? g.visibility + '. ' : ''}${g.hidden ? 'Hidden.' : 'Visible.'}`), el('p', { class: 'small' }, g.reports ? `Reports: ${reasons}` : 'No reports.'), g.votes ? el('p', { class: 'small' }, `Players vote ${g.voteAvg}★ (${g.votes} vote${g.votes === 1 ? '' : 's'})${g.suggested && !g.stars ? `. Suggested: ${g.suggested}★ ${diffName(g.suggested)}, waiting for you` : ''}`) : null, el('div', { class: 'row' }, reward, rate)),
        el('div', { class: 'row' }, el('a', { class: 'btn', href: g.kind === '3d' ? '#/w/' + g.id : '#/p/' + g.id }, 'Play'), g.hidden ? act(g.reports ? 'Looks fine: show it' : 'Show', 'btn-grass', g.reports ? 'clear' : 'show') : act('Hide', '', 'hide'), g.reports && !g.hidden ? act('Clear reports', '', 'clear') : null, act('Take down + warn maker', 'btn-danger', 'warn'), act('Delete', 'btn-danger', 'delete'),
          el('button', { class: 'btn btn-danger', type: 'button', onclick: () => adminUser(g.creator, 'ban') }, 'Ban creator'))));
    }
  } catch (e) { $('#admin-msg').textContent = e.message; }
}
async function adminUser(name, action) {
  const ok = await ask(`${action === 'ban' ? 'Ban' : 'Unban'} ${name}?`, action === 'ban' ? 'They get logged out, kicked from every server, cannot log back in, and all their games are hidden.' : 'They can log in again and their games come back.', [{ label: action === 'ban' ? 'Ban' : 'Unban', value: true, cls: 'btn-danger' }]);
  if (!ok) return;
  try { await api.admin('POST', '/users/' + encodeURIComponent(name), { action }); toast(`${name} ${action === 'ban' ? 'banned' : 'unbanned'}.`); if (tab === 'games') loadGames(); else findUsers(); } catch (e) { toast(e.message); }
}
/* ---------------- one player: coins, items, password, kick, ban ---------------- */
const allItems = () => KINDS.flatMap((k) => SHOP[k].filter((i) => i.price > 0 || i.need).map((i) => ({ key: itemKey(k, i.id), label: `${i.name} (${k})` })));
let lastManaged = '';
export async function manageUser(name) {
  const box = $('#manage-body');
  $('#manage-h').textContent = `Manage ${name}`;
  box.replaceChildren(el('p', { class: 'msg' }, 'Loading…'));
  openModal('#manage-modal');
  let u;
  try { u = await api.adminUser(name); } catch (e) { box.replaceChildren(el('p', { class: 'msg' }, e.message)); return; }
  const self = session.user && session.user.name.toLowerCase() === u.name.toLowerCase();
  const note = $('#manage-note');
  if (lastManaged !== u.name) note.textContent = '';
  lastManaged = u.name;
  const act = async (action, extra, done) => {
    note.textContent = 'One sec…';
    try {
      const r = await api.adminAct(u.name, action, extra);
      note.textContent = done(r);
      if (self && r.wallet) refreshWallet();
      if (action !== 'password') setTimeout(() => manageUser(u.name), 250);
      if (tab === 'users' && $('#view-admin') && !$('#view-admin').hidden) findUsers();
    } catch (e) { note.textContent = e.message; }
  };
  // coins
  const amount = el('input', { type: 'number', value: '100', min: '0', max: '10000000', 'aria-label': 'How many coins' });
  const n = () => Math.floor(Number(amount.value) || 0);
  const coins = el('section', {}, el('h3', {}, `Coins: ${u.wallet.coins}`),
    el('div', { class: 'row' }, amount,
      el('button', { class: 'btn btn-sun', type: 'button', onclick: () => act('grant', { amount: n() }, (r) => `Gave ${n()}. ${u.name} has ${r.wallet.coins} coins now.`) }, 'Give'),
      el('button', { class: 'btn', type: 'button', onclick: () => act('grant', { amount: -n() }, (r) => `Took ${n()}. ${u.name} has ${r.wallet.coins} coins now.`) }, 'Take'),
      el('button', { class: 'btn', type: 'button', onclick: () => act('setcoins', { amount: n() }, (r) => `${u.name} has ${r.wallet.coins} coins now.`) }, 'Set to this')),
    el('div', { class: 'row', style: 'margin-top:8px' }, ...[100, 1000, 10000].map((v) => el('button', { class: 'btn', type: 'button', onclick: () => act('grant', { amount: v }, (r) => `Gave ${v}. ${u.name} has ${r.wallet.coins} coins now.`) }, `+${v}`))));
  // items
  const pick = el('select', { 'aria-label': 'Item' }, ...allItems().map((i) => el('option', { value: i.key }, i.label)));
  const owned = Object.entries(u.wallet.items).map(([key, qty]) => { const f = findItem(key); return f ? `${f.item.name}${qty > 1 ? ' x' + qty : ''}` : null; }).filter(Boolean);
  const itemName = () => (findItem(pick.value) || { item: { name: pick.value } }).item.name;
  const items = el('section', {}, el('h3', {}, 'Items'),
    el('p', { class: 'small' }, owned.length ? 'Has: ' + owned.join(', ') : 'No items yet.'),
    el('div', { class: 'row', style: 'margin-top:8px' }, pick,
      el('button', { class: 'btn btn-sun', type: 'button', onclick: () => act('give', { item: pick.value }, () => `Gave ${u.name} a ${itemName()}.`) }, 'Give'),
      el('button', { class: 'btn', type: 'button', onclick: () => act('take', { item: pick.value }, () => `Took a ${itemName()} from ${u.name}.`) }, 'Take')),
    owned.length ? el('div', { class: 'row', style: 'margin-top:8px' }, el('button', { class: 'btn btn-danger', type: 'button', onclick: async () => {
      const ok = await ask(`Remove all of ${u.name}'s items?`, `Every item they own is taken away (${owned.length} kinds), and anything they have for sale on the Reseller shop too. Limited ones go back into the shop. Free items stay. This can't be undone.`, [{ label: 'Remove everything', value: true, cls: 'btn-danger' }]);
      openModal('#manage-modal');
      if (ok) act('wipe', { confirm: 'wipe' }, (r) => `Removed ${r.removed} items from ${u.name}.`);
    } }, 'Remove all items')) : null);
  // password
  const pw = el('input', { type: 'text', minlength: '6', maxlength: '72', placeholder: 'New password', autocomplete: 'off', 'aria-label': 'New password' });
  const canPw = self || !u.admin;
  const pass = canPw ? el('section', {}, el('h3', {}, 'Password'),
    el('p', { class: 'small' }, self ? 'Change your own password. You get logged out on every other computer.' : 'For players who forgot their password and lost their recovery code. They get logged out everywhere.'),
    el('div', { class: 'row', style: 'margin-top:8px' }, pw, el('button', { class: 'btn', type: 'button', onclick: () => {
      if (pw.value.length < 6) { note.textContent = 'Passwords need at least 6 characters.'; return; }
      act('password', { password: pw.value }, () => (self ? 'Password changed. Log in again on this computer.' : `Done. Tell ${u.name} their new password, and to change it.`));
    } }, 'Set password'))) : null;
  // roles
  const roleName = { builder: 'Builder', builderpro: 'Builder Pro' }[u.role] || 'Player';
  const roles = u.admin ? null : el('section', {}, el('h3', {}, `Role: ${roleName}`),
    el('p', { class: 'small' }, 'Builders set what their own levels pay (10 or 25 coins). Builder Pros can also set other players\' levels (up to 100), and you get a mail about every change they make to someone else\'s level (turn that off in Settings).'),
    el('div', { class: 'row', style: 'margin-top:8px' },
      u.role !== 'builder' ? el('button', { class: 'btn btn-sun', type: 'button', onclick: () => act('role', { role: 'builder' }, () => `${u.name} is a Builder now! They got a mail about it.`) }, 'Make Builder') : null,
      u.role !== 'builderpro' ? el('button', { class: 'btn btn-sun', type: 'button', onclick: () => act('role', { role: 'builderpro' }, () => `${u.name} is a Builder Pro now! They got a mail about it.`) }, 'Make Builder Pro') : null,
      u.role ? el('button', { class: 'btn', type: 'button', onclick: () => act('role', { role: '' }, () => `${u.name} is a normal player again.`) }, 'Remove role') : null));
  // OG and Beta Tester: extra roles that stack with Builder. Each one is also a title they can wear.
  const tags = u.tags || [];
  const special = el('section', {}, el('h3', {}, `Special roles: ${tags.length ? tags.map((t) => TAGS[t]).join(', ') : 'none'}`),
    el('p', { class: 'small' }, 'They show on their profile and name tag, and they can wear it as a title. Only you (the owner) can wear the Admin title.'),
    el('div', { class: 'row', style: 'margin-top:8px' }, ...Object.entries(TAGS).map(([t, name]) => (tags.includes(t)
      ? el('button', { class: 'btn', type: 'button', onclick: () => act('tag', { tag: t, on: false }, () => `Took away ${name} from ${u.name}.`) }, `Remove ${name}`)
      : el('button', { class: 'btn btn-sun', type: 'button', onclick: () => act('tag', { tag: t, on: true }, () => `${u.name} is ${t === 'og' ? 'an' : 'a'} ${name} now! They got a mail about it.`) }, `Make ${name}`)))),
    u.display ? el('div', { class: 'row', style: 'margin-top:8px' }, el('span', { class: 'small' }, `Display name: "${u.display}"`),
      el('button', { class: 'btn', type: 'button', onclick: () => act('resetname', {}, () => `Reset ${u.name}'s display name.`) }, 'Reset display name')) : null);
  // kick / ban
  const warnNow = async () => {
    if (!(await ask(`Warn ${u.name}?`, (u.warnings || 0) >= 3 ? 'They already have 3 warnings. Next you will be asked about deleting their account.' : `This will be warning ${(u.warnings || 0) + 1} of 3.`, [{ label: 'Give a warning', value: true, cls: 'btn-sun' }]))) { openModal('#manage-modal'); return; }
    openModal('#manage-modal');
    note.textContent = 'One sec…';
    try { const r = await warnFlow((x) => api.adminAct(u.name, 'warn', x), u.name); note.textContent = warnText(r, u.name); if (r.deleted) { closeModal($('#manage-modal')); toast(warnText(r, u.name)); findUsers(); return; } openModal('#manage-modal'); setTimeout(() => manageUser(u.name), 250); } catch (e) { note.textContent = e.message; }
  };
  const deleteNow = async () => {
    const ok = await ask(`Delete ${u.name}'s account?`, "Their games, items, coins and messages are deleted too. This can't be undone.", [{ label: 'Delete account', value: true, cls: 'btn-danger' }]);
    if (!ok) { openModal('#manage-modal'); return; }
    try { await api.adminAct(u.name, 'delete', { confirm: 'delete' }); closeModal($('#manage-modal')); toast(`${u.name}'s account was deleted.`); findUsers(); } catch (e) { openModal('#manage-modal'); note.textContent = e.message; }
  };
  const safety = u.admin ? null : el('section', {}, el('h3', {}, `Safety: ${u.warnings || 0} of 3 warnings`),
    el('p', { class: 'small' }, 'Warning 1 → 2 → 3 → account deleted. Nothing happens by itself: automatic checks (like coin farming) only mail you, and you confirm every warning, ban and deletion.'),
    el('div', { class: 'row' },
      el('button', { class: 'btn btn-sun', type: 'button', onclick: warnNow }, 'Give a warning'),
      u.warnings ? el('button', { class: 'btn', type: 'button', onclick: () => act('unwarn', {}, (r) => `${u.name} has ${r.warnings} warning${r.warnings === 1 ? '' : 's'} now.`) }, 'Remove a warning') : null),
    el('div', { class: 'row', style: 'margin-top:8px' },
      el('button', { class: 'btn', type: 'button', onclick: () => act('kick', {}, () => `${u.name} was removed from every 3D server.`) }, 'Kick from servers'),
      el('button', { class: 'btn btn-danger', type: 'button', onclick: deleteNow }, 'Delete account'),
      el('button', { class: 'btn ' + (u.banned ? 'btn-grass' : 'btn-danger'), type: 'button', onclick: async () => { const b = !u.banned; if (await ask(`${b ? 'Ban' : 'Unban'} ${u.name}?`, b ? 'They get logged out, kicked from every server, cannot log back in, and all their games are hidden.' : 'They can log in again and their games come back.', [{ label: b ? 'Ban' : 'Unban', value: true, cls: 'btn-danger' }])) { openModal('#manage-modal'); act(b ? 'ban' : 'unban', {}, () => `${u.name} ${b ? 'banned' : 'unbanned'}.`); } else openModal('#manage-modal'); } }, u.banned ? 'Unban' : 'Ban')));
  // chat mute and trade freeze (they get a mail about both)
  const mins = [[10, '10 min'], [60, '1 hour'], [1440, '1 day'], [10080, '1 week']];
  const behave = u.admin ? null : el('section', {}, el('h3', {}, `Chat: ${u.muted ? `muted (${timeLeft(u.muted)} left)` : 'can chat'} · Trading: ${u.frozen ? 'frozen' : 'normal'}`),
    el('p', { class: 'small' }, 'Muted players can\'t chat in 3D servers or send messages. Frozen players can\'t trade, gift, live trade or use the Reseller shop (like while you look into a scam).'),
    el('div', { class: 'row' }, el('span', { class: 'small' }, 'Mute for'), ...mins.map(([m, l]) => el('button', { class: 'btn', type: 'button', onclick: () => act('mute', { minutes: m }, () => `${u.name} is muted for ${l}.`) }, l)),
      u.muted ? el('button', { class: 'btn btn-grass', type: 'button', onclick: () => act('mute', { minutes: 0 }, () => `${u.name} can chat again.`) }, 'Unmute') : null),
    el('div', { class: 'row', style: 'margin-top:8px' }, u.frozen
      ? el('button', { class: 'btn btn-grass', type: 'button', onclick: () => act('freeze', { on: false }, () => `${u.name} can trade again.`) }, 'Unfreeze trading')
      : el('button', { class: 'btn btn-danger', type: 'button', onclick: () => act('freeze', { on: true }, () => `${u.name}'s trading is frozen.`) }, 'Freeze trading')));
  // player level (from XP)
  const lvIn = el('input', { type: 'number', min: '1', max: '500', value: String(levelOf(u.wallet.xp || 0)), style: 'width:90px', 'aria-label': 'Level' });
  const level = el('section', {}, el('h3', {}, `Level ${levelOf(u.wallet.xp || 0)} (${u.wallet.xp || 0} XP)`),
    el('div', { class: 'row' }, lvIn, el('button', { class: 'btn', type: 'button', onclick: () => act('level', { level: Math.floor(Number(lvIn.value) || 1) }, (r) => `${u.name} is level ${levelOf(r.wallet.xp)} now.`) }, 'Set level')));
  // their Tycoon town
  const town = el('section', {}, el('h3', {}, 'Tycoon town'), el('p', { class: 'small' }, 'Loading…'));
  tycoonBox(u.name, town, note);
  const history = el('section', {}, el('h3', {}, 'Recent coins'),
    u.ledger.length ? el('ul', { class: 'ledger' }, ...u.ledger.map((l) => el('li', {}, el('span', {}, `${l.why} · ${timeAgo(l.at)}`), el('span', { class: l.delta < 0 ? 'minus' : 'plus' }, (l.delta > 0 ? '+' : '') + l.delta)))) : el('p', { class: 'small' }, 'Nothing yet.'));
  box.replaceChildren(
    el('p', { class: 'small' }, `${u.admin ? 'Admin. ' : ''}${u.banned ? 'Banned. ' : ''}Playing since ${new Date(u.since).toLocaleDateString()}. ${plural(u.games, 'published game')}. `, el('a', { class: 'linkish', href: '#/u/' + u.name, 'data-go': '#/u/' + u.name }, 'Profile')),
    coins, items, roles, special, behave, level, town, pass, safety, history);
}
const timeLeft = (t) => { const m = Math.ceil((t - Date.now()) / 60e3); return m >= 1440 ? `${Math.round(m / 1440)} d` : m >= 60 ? `${Math.round(m / 60)} h` : `${m} min`; };
// look at and change someone's Tycoon town
async function tycoonBox(name, box, note) {
  let r;
  try { r = await api.admin('GET', '/tycoon/' + encodeURIComponent(name)); } catch (e) { box.replaceChildren(el('h3', {}, 'Tycoon town'), el('p', { class: 'small' }, e.message)); return; }
  const t = r.tycoon, set = async (change, done) => {
    note.textContent = 'One sec…';
    try { await api.admin('POST', '/tycoon/' + encodeURIComponent(name), change); note.textContent = done; tycoonBox(name, box, note); } catch (e) { note.textContent = e.message; }
  };
  const built = TY_SPOTS.filter((x) => t.b[x.id]).map((x) => `${x.name} ${t.b[x.id]}`).join(', ');
  const stageSel = el('select', { 'aria-label': 'Stage' }, ...TY_STAGES.slice(1).map((x, i) => el('option', { value: String(i + 1) }, x.name)));
  stageSel.value = String(t.stage || 1);
  const vaultIn = el('input', { type: 'number', min: '0', max: '1000000', value: String(t.vault), style: 'width:110px', 'aria-label': 'Coins in the vault' });
  box.replaceChildren(el('h3', {}, `Tycoon town: ${TY_STAGES[t.stage || 1].name} (${r.title})`),
    el('p', { class: 'small' }, `${Math.round(r.stats.coinsPerHour)} coins/hour · ${r.stats.people} people · happiness ${Math.round(t.happy)}, crime ${Math.round(t.crime)}, corruption ${Math.round(t.corrupt)} · collected ${r.collected || 0} coins in all.`),
    el('p', { class: 'small' }, 'Built: ' + (built || 'nothing')),
    el('div', { class: 'row' }, el('label', {}, 'Stage ', stageSel), el('button', { class: 'btn', type: 'button', onclick: () => set({ stage: Number(stageSel.value) }, `${name}'s town is a ${TY_STAGES[Number(stageSel.value)].name} now.`) }, 'Set stage')),
    el('div', { class: 'row', style: 'margin-top:8px' }, el('label', {}, 'Vault ', vaultIn), el('button', { class: 'btn', type: 'button', onclick: () => set({ vault: Math.floor(Number(vaultIn.value) || 0) }, 'Vault set.') }, 'Set vault')),
    el('div', { class: 'row', style: 'margin-top:8px' },
      el('button', { class: 'btn btn-sun', type: 'button', onclick: () => set({ b: Object.fromEntries(TY_SPOTS.filter((x) => x.stage <= (t.stage || 1)).map((x) => [x.id, x.max])) }, 'Every building they can have is maxed out.') }, 'Max all buildings'),
      el('button', { class: 'btn', type: 'button', onclick: () => set({ happy: 90, crime: 5, corrupt: 0 }, 'Happy, safe and honest now.') }, 'Make it a happy town'),
      el('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { const ok = await ask(`Reset ${name}'s Tycoon town?`, 'Their town goes back to the start (a house, a mine and a factory). Coins they already collected stay.', [{ label: 'Reset town', value: true, cls: 'btn-danger' }]); openModal('#manage-modal'); if (ok) set({ reset: true }, 'Town reset.'); } }, 'Reset town')));
}
async function findUsers() {
  const box = $('#admin-users'); box.innerHTML = '';
  const q = $('#admin-user-q').value.trim();
  try {
    const { users } = await api.admin('GET', '/users?q=' + encodeURIComponent(q));
    if (!users.length) box.append(el('p', { class: 'small' }, 'No players with that name.'));
    for (const u of users) {
      box.append(el('div', { class: 'admin-row small-row' + (u.banned ? ' hidden-game' : '') }, el('a', { class: 'linkish', href: '#/u/' + u.name }, el('b', {}, u.name)), el('span', { class: 'small' }, `${plural(u.games, 'game')}, ${u.coins} coins. ${u.banned ? 'Banned.' : ''}`),
        el('div', { class: 'row' }, el('button', { class: 'btn btn-sun', type: 'button', onclick: () => manageUser(u.name) }, 'Manage'),
          el('button', { class: 'btn ' + (u.banned ? 'btn-grass' : 'btn-danger'), type: 'button', onclick: () => adminUser(u.name, u.banned ? 'unban' : 'ban') }, u.banned ? 'Unban' : 'Ban'))));
    }
  } catch (e) { toast(e.message); }
}
$('#admin-user-find').addEventListener('click', findUsers);

/* ---------------- announcement and limited stock ---------------- */
async function loadDaily() {
  const box = $('#daily-picks');
  try {
    const r = await api.admin('GET', '/daily');
    if (!$('#daily-pick-date').value) $('#daily-pick-date').value = r.today;
    box.replaceChildren(...(r.picks.length ? r.picks.map((p) => el('div', { class: 'stock-row' }, el('b', {}, p.date), el('span', { class: 'small' }, p.id ? `${p.name} by ${p.creator} (${p.how === 'admin' ? 'you picked it' : 'top level'})` : "Blockyard's own course"),
      p.how === 'admin' ? el('button', { class: 'btn', type: 'button', onclick: async () => { try { await api.admin('POST', '/daily', { date: p.date, game: '' }); loadDaily(); } catch (e) { toast(e.message); } } }, 'Clear') : null))
      : [el('p', { class: 'small' }, 'Nothing picked yet.')]));
  } catch (e) { box.replaceChildren(el('p', { class: 'msg' }, e.message)); }
}
$('#daily-pick-go').addEventListener('click', async () => {
  try { await api.admin('POST', '/daily', { date: $('#daily-pick-date').value, game: $('#daily-pick-game').value.trim() }); toast('Picked!'); $('#daily-pick-game').value = ''; loadDaily(); } catch (e) { toast(e.message); }
});
// search public 2D levels and pick one for the day in the date box
async function findDaily() {
  const box = $('#daily-find');
  box.replaceChildren(el('p', { class: 'small' }, 'Searching…'));
  try {
    const r = await api.list({ kind: '2d', sort: 'top', q: $('#daily-find-q').value.trim() });
    box.replaceChildren(...(r.games.length ? r.games.slice(0, 12).map((g) => el('div', { class: 'stock-row' }, el('b', {}, g.name), el('span', { class: 'small' }, `by ${g.creator} · ${plural(g.plays || 0, 'play')} · 👍 ${g.likes || 0}${g.stars ? ` · ${g.stars}★` : ''}`),
      el('a', { class: 'btn', href: '#/p/' + g.id }, 'Play it'),
      el('button', { class: 'btn btn-sun', type: 'button', onclick: async () => { try { await api.admin('POST', '/daily', { date: $('#daily-pick-date').value, game: g.id }); toast(`"${g.name}" is the daily for ${$('#daily-pick-date').value}.`); loadDaily(); } catch (e) { toast(e.message); } } }, 'Use for that day')))
      : [el('p', { class: 'small' }, 'No levels found.')]));
  } catch (e) { box.replaceChildren(el('p', { class: 'msg' }, e.message)); }
}
$('#daily-find-go').addEventListener('click', findDaily);
$('#daily-find-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') findDaily(); });
// events: double coins / double Tycoon money for a while
async function loadEvents() {
  const box = $('#admin-events');
  try {
    const r = await api.admin('GET', '/events');
    box.replaceChildren(...Object.entries(r.kinds).map(([k, name]) => {
      const until = r.events[k], hours = el('select', { 'aria-label': 'How long' }, ...[[1, '1 hour'], [3, '3 hours'], [12, '12 hours'], [24, '1 day'], [48, '2 days'], [72, 'A weekend (3 days)'], [168, '1 week']].map(([v, l]) => el('option', { value: String(v) }, l)));
      hours.value = '24';
      const set = async (h) => { try { await api.admin('POST', '/events', { kind: k, hours: h }); toast(h ? `${name} is on!` : `${name} ended.`); loadEvents(); loadOnline(true); } catch (e) { toast(e.message); } };
      return el('div', { class: 'stock-row' }, el('b', {}, name), el('span', { class: 'small' }, until ? `On until ${new Date(until).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Off'),
        hours, el('button', { class: 'btn btn-sun', type: 'button', onclick: () => set(Number(hours.value)) }, until ? 'Restart' : 'Start'),
        until ? el('button', { class: 'btn', type: 'button', onclick: () => set(0) }, 'Stop') : null);
    }));
  } catch (e) { box.replaceChildren(el('p', { class: 'msg' }, e.message)); }
}
// who's playing right now
async function loadOnlineNow() {
  const box = $('#admin-online');
  box.replaceChildren(el('p', { class: 'small' }, 'Loading…'));
  try {
    const r = await api.admin('GET', '/online');
    $('#admin-online-sum').textContent = `${plural(r.players.length, 'player')} in worlds, ${r.onSite} on the site.`;
    box.replaceChildren(...(r.players.length ? r.players.map((p) => el('div', { class: 'stock-row' }, el('b', {}, p.display || p.name), el('span', { class: 'small' }, `${p.display ? '@' + p.name + ' · ' : ''}in ${p.worldName}${p.private ? ' (private)' : ''} · ${timeAgo(p.at)}`),
      p.code ? el('a', { class: 'btn btn-grass', href: '#/join/' + p.code }, 'Join') : null,
      el('button', { class: 'btn', type: 'button', onclick: () => manageUser(p.name) }, 'Manage'))) : [el('p', { class: 'small' }, 'Nobody is in a world right now.')]));
  } catch (e) { box.replaceChildren(el('p', { class: 'msg' }, e.message)); }
}
$('#admin-online-go').addEventListener('click', loadOnlineNow);
$('#giftall-go').addEventListener('click', async () => {
  const coins = Math.floor(Number($('#giftall-coins').value) || 0), item = $('#giftall-item').value;
  const what = [coins ? `${coins} coins` : '', item ? `a ${findItem(item).item.name}` : ''].filter(Boolean).join(' and ');
  if (!what) { toast('Pick some coins or an item first.'); return; }
  if (!(await ask('Give this to every player?', `Every player gets ${what}, and a mail about it. This can't be undone.`, [{ label: 'Give to everyone', value: true, cls: 'btn-sun' }]))) return;
  try { const r = await api.admin('POST', '/giftall', { coins, item, note: $('#giftall-note').value, confirm: 'everyone' }); toast(`Gave ${r.what} to ${plural(r.players, 'player')}!`); refreshWallet(); } catch (e) { toast(e.message); }
});
$('#closeall-go').addEventListener('click', async () => {
  if (!(await ask('Close every server?', 'Everyone in a 3D world gets sent out with your message. They can come right back.', [{ label: 'Close all servers', value: true, cls: 'btn-danger' }]))) return;
  try { const r = await api.admin('POST', '/closeall', { message: $('#closeall-msg').value }); toast(`Closed ${plural(r.servers, 'server')}.`); loadOnlineNow(); } catch (e) { toast(e.message); }
});

async function loadSite() {
  loadDaily(); loadEvents(); loadOnlineNow();
  const gi = $('#giftall-item');
  if (!gi.options.length) gi.replaceChildren(el('option', { value: '' }, 'No item'), ...allItems().map((i) => el('option', { value: i.key }, i.label)));
  const box = $('#admin-stock');
  box.replaceChildren(el('p', { class: 'msg' }, 'Loading…'));
  try {
    const [on, shop] = await Promise.all([api.online(), api.shop()]);
    $('#admin-announce').value = on.announce || '';
    box.replaceChildren(...LIMITED.map((l) => {
      const f = findItem(l.key);
      const input = el('input', { type: 'number', min: '0', max: '100000', value: String(shop.stock[l.key] ?? l.stock), 'aria-label': `How many ${f.item.name} are left` });
      return el('div', { class: 'stock-row' }, el('b', {}, f.item.name), el('span', { class: 'small' }, `started with ${l.stock}`), input,
        el('button', { class: 'btn', type: 'button', onclick: async () => { try { await api.setStock(l.key, Number(input.value)); toast(`${f.item.name}: ${input.value} left in the shop.`); } catch (e) { toast(e.message); } } }, 'Save'));
    }));
  } catch (e) { box.replaceChildren(el('p', { class: 'msg' }, e.message)); }
}
async function postAnnounce(text) {
  try { const r = await api.announce(text); showAnnounce(r.announce, true); toast(r.announce ? 'Posted. Everyone sees it now.' : 'Announcement removed.'); if (!text) $('#admin-announce').value = ''; } catch (e) { toast(e.message); }
}
$('#admin-announce-go').addEventListener('click', () => postAnnounce($('#admin-announce').value.trim()));
$('#admin-announce-clear').addEventListener('click', () => postAnnounce(''));
$('#admin-user-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') findUsers(); });
addRoute(/^#\/admin$/, () => showAdmin());

/* ---------------- admin log ---------------- */
function describe(l) {
  const d = l.detail || {}, p = l.path;
  const who = (p.match(/^\/users\/(.+)$/) || [])[1];
  const item = d.item ? ((findItem(d.item) || { item: { name: d.item } }).item.name) : '';
  if (who) return ({
    grant: d.amount >= 0 ? `gave ${who} ${d.amount} coins` : `took ${-d.amount} coins from ${who}`,
    setcoins: `set ${who}'s coins to ${d.amount}`, give: `gave ${who} a ${item}`, take: `took a ${item} from ${who}`,
    wipe: `removed all of ${who}'s items`, mute: d.minutes ? `muted ${who} for ${d.minutes} minutes` : `unmuted ${who}`, freeze: d.on === false ? `unfroze ${who}'s trading` : `froze ${who}'s trading`, level: `set ${who} to level ${d.level}`, password: `set a new password for ${who}`, kick: `kicked ${who}`, ban: `banned ${who}`, unban: `unbanned ${who}`, warn: `warned ${who}`, unwarn: `removed a warning from ${who}`,
  })[d.action] || `${d.action} ${who}`;
  if (p === '/giftall') return `gave everyone ${[d.coins ? d.coins + ' coins' : '', d.item ? (findItem(d.item) || { item: { name: d.item } }).item.name : ''].filter(Boolean).join(' and ')}`;
  if (p === '/closeall') return 'closed all servers';
  if (p === '/events') return d.hours ? `started ${d.kind === 'tycoon' ? 'Double Tycoon money' : 'Double coins'} for ${d.hours} hours` : `stopped ${d.kind === 'tycoon' ? 'Double Tycoon money' : 'Double coins'}`;
  if (p.startsWith('/tycoon/')) return d.reset ? `reset ${p.slice(8)}'s Tycoon town` : `changed ${p.slice(8)}'s Tycoon town`;
  if (p === '/announce') return d.text ? `announced "${d.text}"` : 'removed the announcement';
  if (p === '/stock') return `set ${item} stock to ${d.left}`;
  if (p === '/deals') return d.sale === null ? 'ended the sale' : d.sale ? `started a ${d.sale.off}% sale for ${d.sale.hours} hours` : d.pin ? (d.pin.items && d.pin.items.length ? `picked deals for ${d.pin.date}` : `let ${d.pin.date} pick its own deals`) : `changed deals (${d.off}% off, ${d.count} a day, ${d.stock || 25} each)`;
  if (p === 'pay') return `changed "${d.name}" by ${d.creator} from ${d.from} to ${d.to} coins`;
  if (p === 'farm') return `caught ${d.user} farming coins with ${d.alts} extra accounts (coins wiped, 2 warnings)`;
  if (p.startsWith('/games/')) return d.action === 'warn' ? `took down game ${p.slice(7)} and warned its maker` : d.action === 'reward' ? `made game ${p.slice(7)} pay ${d.amount} coins` : d.action === 'stars' ? `rated game ${p.slice(7)} ${d.amount}★` : `${d.action} game ${p.slice(7)}`;
  if (p.startsWith('/chat/')) return `${d.action} chat report`;
  return `${p} ${JSON.stringify(d)}`;
}
async function loadLog() {
  const box = $('#admin-log');
  box.replaceChildren(el('p', { class: 'msg' }, 'Loading…'));
  try {
    const { log } = await api.adminLog();
    box.replaceChildren(...(log.length ? [el('ul', { class: 'ledger admin-box', style: 'list-style:none;max-height:none' }, ...log.map((l) => el('li', { style: 'padding:4px 0;border-bottom:1px solid rgba(74,83,120,.25)' }, el('b', {}, l.admin), ' ', describe(l), el('span', { class: 'small' }, ` · ${timeAgo(l.at)}`))))] : [el('p', { class: 'small' }, 'Nothing yet. Everything you do as admin shows up here.')]));
  } catch (e) { box.replaceChildren(el('p', { class: 'msg' }, e.message)); }
}

/* ---------------- daily deals ---------------- */
const pctOpts = (sel, list, v) => { sel.replaceChildren(...list.map((n) => el('option', { value: String(n) }, `${n}%`))); sel.value = String(v); };
async function loadDeals() {
  const box = $('#deal-days');
  box.replaceChildren(el('p', { class: 'small' }, 'Loading…'));
  let d;
  try { d = await api.deals(); } catch (e) { box.replaceChildren(el('p', { class: 'msg' }, e.message)); return; }
  pctOpts($('#deal-off'), [10, 15, 20, 25, 30, 40, 50, 60, 75], d.cfg.off);
  $('#deal-count').replaceChildren(...[1, 2, 3, 4, 5, 6, 8].map((n) => el('option', { value: String(n) }, String(n)))); $('#deal-count').value = String(d.cfg.count);
  $('#deal-stock').replaceChildren(...[5, 10, 25, 50, 100, 250, 1000].map((n) => el('option', { value: String(n) }, String(n)))); $('#deal-stock').value = String(d.cfg.stock || 25);
  pctOpts($('#sale-off'), [10, 15, 20, 25, 30, 40, 50], d.cfg.sale ? d.cfg.sale.off : 20);
  $('#sale-now').textContent = d.cfg.sale ? `A ${d.cfg.sale.off}% sale is on until ${new Date(d.cfg.sale.until).toLocaleString()}.` : 'No sale right now.';
  const names = (k) => (findItem(k) || { item: { name: k } }).item.name;
  box.replaceChildren(...d.days.map((day, i) => {
    const sels = Array.from({ length: Math.max(day.items.length, d.cfg.count) }, (_, j) => {
      const sel = el('select', { 'aria-label': `Deal ${j + 1} on ${day.date}` }, el('option', { value: '' }, '(none)'), ...d.pool.map((k) => el('option', { value: k }, names(k))));
      sel.value = day.items[j] || '';
      return sel;
    });
    const save = el('button', { class: 'btn', type: 'button', onclick: async () => { try { await api.setDeals({ pin: { date: day.date, items: sels.map((x) => x.value).filter(Boolean) } }); toast(`Deals for ${day.date} saved.`); loadDeals(); } catch (e) { toast(e.message); } } }, 'Save day');
    const auto = day.pinned ? el('button', { class: 'btn', type: 'button', onclick: async () => { try { await api.setDeals({ pin: { date: day.date, items: [] } }); loadDeals(); } catch (e) { toast(e.message); } } }, 'Back to automatic') : null;
    return el('div', { class: 'deal-day' }, el('b', {}, i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : day.date), ...sels, save, auto, day.pinned ? el('span', { class: 'small' }, '(you picked)') : null);
  }));
}
$('#deal-save').addEventListener('click', async () => { try { await api.setDeals({ off: Number($('#deal-off').value), count: Number($('#deal-count').value), stock: Number($('#deal-stock').value) }); toast('Deals updated.'); loadDeals(); } catch (e) { toast(e.message); } });
$('#sale-go').addEventListener('click', async () => { try { await api.setDeals({ sale: { off: Number($('#sale-off').value), hours: Number($('#sale-hours').value) } }); toast('Sale is on!'); loadDeals(); } catch (e) { toast(e.message); } });
$('#sale-stop').addEventListener('click', async () => { try { await api.setDeals({ sale: null }); toast('Sale ended.'); loadDeals(); } catch (e) { toast(e.message); } });
