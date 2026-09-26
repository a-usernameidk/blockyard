// Admin: chat reports, reported games (hide, delete, make them pay coins), and players (ban, give coins).
import { $, $$, el, session, show, go, addRoute, ask, toast, timeAgo, plural } from '../app.js';
import { api } from '../api.js';
import { normalizeLevel } from '../format.js';
import { thumb } from './play.js';
import { drawWorldThumb } from '../thumb3d.js';

let tab = 'chat';
async function showAdmin() {
  show('admin', '');
  if (!session.user || !session.user.admin) { $('#admin-msg').textContent = 'Log in with your admin account to see this page.'; ['#admin-chat', '#admin-games', '#admin-users'].forEach((s) => { $(s).innerHTML = ''; }); return; }
  setTab(tab);
}
function setTab(t) {
  tab = t;
  $$('[data-atab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.atab === t)));
  $('#admin-chat').hidden = t !== 'chat'; $('#admin-games-wrap').hidden = t !== 'games'; $('#admin-users-wrap').hidden = t !== 'users';
  $('#admin-msg').textContent = '';
  if (t === 'chat') loadChat(); else if (t === 'games') loadGames(); else findUsers();
}
$$('[data-atab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.atab)));
$('#admin-refresh').addEventListener('click', () => setTab(tab));

async function loadChat() {
  const box = $('#admin-chat'); box.innerHTML = ''; $('#admin-msg').textContent = 'Loading…';
  try {
    const { reports } = await api.admin('GET', '/chat');
    $('#admin-msg').textContent = reports.length ? '' : 'No chat reports. Nice.';
    for (const r of reports) {
      box.append(el('div', { class: 'admin-row chat-report' },
        el('div', {}, el('h3', {}, `${r.target}`), el('p', { class: 'small' }, `Reported by ${r.reporter} for "${r.reason}", ${timeAgo(r.at)}.`)),
        el('ol', { class: 'said' }, ...(r.messages.length ? r.messages.map((m) => el('li', {}, el('span', { class: 'small' }, new Date(m.at).toLocaleTimeString() + ' '), m.m)) : [el('li', { class: 'small' }, 'They had not said anything in that server.')])),
        el('div', { class: 'row' },
          el('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { if (await ask(`Ban ${r.target}?`, 'They get logged out, kicked from every server, and their games are hidden.', [{ label: 'Ban', value: true, cls: 'btn-danger' }])) { try { await api.admin('POST', '/chat/' + r.id, { action: 'ban' }); toast(`${r.target} banned.`); loadChat(); } catch (e) { toast(e.message); } } } }, 'Ban'),
          el('button', { class: 'btn', type: 'button', onclick: async () => { try { await api.admin('POST', '/chat/' + r.id, { action: 'dismiss' }); loadChat(); } catch (e) { toast(e.message); } } }, 'Dismiss'),
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
        if (action === 'delete' && e.currentTarget.dataset.sure !== '1') { e.currentTarget.dataset.sure = '1'; e.currentTarget.textContent = 'Click again to delete'; return; }
        try { await api.admin('POST', '/games/' + g.id, { action, ...extra }); loadGames(); } catch (err) { toast(err.message); }
      } }, label);
      const reward = el('select', { 'aria-label': 'Coins this game pays' }, ...[0, 10, 25, 50, 100, 200].map((n) => el('option', { value: String(n) }, n ? `Pays ${n} coins` : 'Pays nothing')));
      if (![0, 10, 25, 50, 100, 200].includes(g.reward)) reward.append(el('option', { value: String(g.reward) }, `Pays ${g.reward} coins`));
      reward.value = String(g.reward || 0);
      reward.addEventListener('change', async () => { try { await api.admin('POST', '/games/' + g.id, { action: 'reward', amount: Number(reward.value) }); toast(Number(reward.value) ? `"${g.name}" pays ${reward.value} coins now (once per player).` : `"${g.name}" doesn't pay coins anymore.`); } catch (e) { toast(e.message); } });
      box.append(el('div', { class: 'admin-row' + (g.hidden ? ' hidden-game' : '') }, pic,
        el('div', {}, el('h3', {}, g.name), el('p', { class: 'small' }, `${g.kind === '3d' ? '3D world' : '2D level'} by ${g.creator}. ${plural(g.plays, 'play')}, ${plural(g.likes, 'like')}. ${g.visibility !== 'public' ? g.visibility + '. ' : ''}${g.hidden ? 'Hidden.' : 'Visible.'}`), el('p', { class: 'small' }, g.reports ? `Reports: ${reasons}` : 'No reports.'), reward),
        el('div', { class: 'row' }, el('a', { class: 'btn', href: g.kind === '3d' ? '#/w/' + g.id : '#/p/' + g.id }, 'Play'), g.hidden ? act('Show', 'btn-grass', 'show') : act('Hide', '', 'hide'), g.reports ? act('Clear reports', '', 'clear') : null, act('Delete', 'btn-danger', 'delete'),
          el('button', { class: 'btn btn-danger', type: 'button', onclick: () => adminUser(g.creator, 'ban') }, 'Ban creator'))));
    }
  } catch (e) { $('#admin-msg').textContent = e.message; }
}
async function adminUser(name, action) {
  const ok = await ask(`${action === 'ban' ? 'Ban' : 'Unban'} ${name}?`, action === 'ban' ? 'They get logged out, kicked from every server, cannot log back in, and all their games are hidden.' : 'They can log in again and their games come back.', [{ label: action === 'ban' ? 'Ban' : 'Unban', value: true, cls: 'btn-danger' }]);
  if (!ok) return;
  try { await api.admin('POST', '/users/' + encodeURIComponent(name), { action }); toast(`${name} ${action === 'ban' ? 'banned' : 'unbanned'}.`); if (tab === 'games') loadGames(); else findUsers(); } catch (e) { toast(e.message); }
}
async function grant(name) {
  const input = el('input', { type: 'number', value: '100', min: '-100000', max: '100000', 'aria-label': 'Coins' });
  const ok = await ask(`Give coins to ${name}`, 'Use a minus number to take coins away.', [{ label: 'Give', value: true, cls: 'btn-sun' }], input);
  if (!ok) return;
  try { const r = await api.admin('POST', '/users/' + encodeURIComponent(name), { action: 'grant', amount: Number(input.value) }); toast(`${name} has ${r.wallet.coins} coins now.`); findUsers(); } catch (e) { toast(e.message); }
}
async function findUsers() {
  const box = $('#admin-users'); box.innerHTML = '';
  const q = $('#admin-user-q').value.trim();
  try {
    const { users } = await api.admin('GET', '/users?q=' + encodeURIComponent(q));
    if (!users.length) box.append(el('p', { class: 'small' }, 'No players with that name.'));
    for (const u of users) {
      box.append(el('div', { class: 'admin-row small-row' + (u.banned ? ' hidden-game' : '') }, el('a', { class: 'linkish', href: '#/u/' + u.name }, el('b', {}, u.name)), el('span', { class: 'small' }, `${plural(u.games, 'game')}, ${u.coins} coins. ${u.banned ? 'Banned.' : ''}`),
        el('div', { class: 'row' }, el('button', { class: 'btn btn-sun', type: 'button', onclick: () => grant(u.name) }, 'Give coins'),
          el('button', { class: 'btn ' + (u.banned ? 'btn-grass' : 'btn-danger'), type: 'button', onclick: () => adminUser(u.name, u.banned ? 'unban' : 'ban') }, u.banned ? 'Unban' : 'Ban'))));
    }
  } catch (e) { toast(e.message); }
}
$('#admin-user-find').addEventListener('click', findUsers);
$('#admin-user-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') findUsers(); });
addRoute(/^#\/admin$/, () => showAdmin());
