// Admin: chat reports, reported games (hide, delete, make them pay coins), players (coins, items,
// passwords, kick, ban), the site announcement, and limited item stock.
import { $, $$, el, session, show, go, addRoute, ask, toast, timeAgo, plural, openModal } from '../app.js';
import { api } from '../api.js';
import { SHOP, KINDS, LIMITED, itemKey, findItem } from '../cosmetics.js';
import { refreshWallet } from './account.js';
import { showAnnounce } from './worlds.js';
import { normalizeLevel } from '../format.js';
import { thumb } from './play.js';
import { drawWorldThumb } from '../thumb3d.js';
import { diffName } from '../stars.js';

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
        if (action === 'delete' && e.currentTarget.dataset.sure !== '1') { e.currentTarget.dataset.sure = '1'; e.currentTarget.textContent = 'Click again to delete'; return; }
        try { await api.admin('POST', '/games/' + g.id, { action, ...extra }); loadGames(); } catch (err) { toast(err.message); }
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
        el('div', {}, el('h3', {}, g.name), el('p', { class: 'small' }, `${g.kind === '3d' ? '3D world' : '2D level'} by ${g.creator}. ${plural(g.plays, 'play')}, ${plural(g.likes, 'like')}. ${g.visibility !== 'public' ? g.visibility + '. ' : ''}${g.hidden ? 'Hidden.' : 'Visible.'}`), el('p', { class: 'small' }, g.reports ? `Reports: ${reasons}` : 'No reports.'), el('div', { class: 'row' }, reward, rate)),
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
/* ---------------- one player: coins, items, password, kick, ban ---------------- */
const allItems = () => KINDS.flatMap((k) => SHOP[k].filter((i) => i.price > 0 || i.need).map((i) => ({ key: itemKey(k, i.id), label: `${i.name} (${k})` })));
export async function manageUser(name) {
  const box = $('#manage-body');
  $('#manage-h').textContent = `Manage ${name}`;
  box.replaceChildren(el('p', { class: 'msg' }, 'Loading…'));
  openModal('#manage-modal');
  let u;
  try { u = await api.adminUser(name); } catch (e) { box.replaceChildren(el('p', { class: 'msg' }, e.message)); return; }
  const self = session.user && session.user.name.toLowerCase() === u.name.toLowerCase();
  const note = el('p', { class: 'msg', role: 'status' });
  const act = async (action, extra, done) => {
    note.textContent = 'One sec…';
    try {
      const r = await api.adminAct(u.name, action, extra);
      note.textContent = done(r);
      if (self && r.wallet) refreshWallet();
      if (action !== 'password') setTimeout(() => manageUser(u.name).then(() => { $('#manage-body .msg').textContent = note.textContent; }), 250);
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
      el('button', { class: 'btn', type: 'button', onclick: () => act('take', { item: pick.value }, () => `Took a ${itemName()} from ${u.name}.`) }, 'Take')));
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
  const roles = u.admin ? null : el('section', {}, el('h3', {}, 'Role'),
    el('p', { class: 'small' }, u.role === 'builder' ? `${u.name} is a Builder: they have a Builder badge and can make their own games pay coins.` : 'Builders get a Builder badge and can make their own published games pay 10 or 25 coins.'),
    el('div', { class: 'row', style: 'margin-top:8px' }, u.role === 'builder'
      ? el('button', { class: 'btn', type: 'button', onclick: () => act('role', { role: '' }, () => `${u.name} isn't a Builder anymore.`) }, 'Remove Builder')
      : el('button', { class: 'btn btn-sun', type: 'button', onclick: () => act('role', { role: 'builder' }, () => `${u.name} is a Builder now! They got a mail about it.`) }, 'Make Builder')));
  // kick / ban
  const safety = u.admin ? null : el('section', {}, el('h3', {}, `Safety: ${u.warnings || 0} of 3 warnings`),
    el('p', { class: 'small' }, '3 warnings is an automatic ban. Coin farming with extra accounts gives 2 at once.'),
    el('div', { class: 'row' },
      el('button', { class: 'btn btn-sun', type: 'button', onclick: () => act('warn', {}, (r) => (r.banned ? `${u.name} hit 3 warnings and is banned.` : `${u.name} has ${r.warnings} warning${r.warnings === 1 ? '' : 's'} now.`)) }, 'Give a warning'),
      u.warnings ? el('button', { class: 'btn', type: 'button', onclick: () => act('unwarn', {}, (r) => `${u.name} has ${r.warnings} warning${r.warnings === 1 ? '' : 's'} now.`) }, 'Remove a warning') : null),
    el('div', { class: 'row', style: 'margin-top:8px' },
      el('button', { class: 'btn', type: 'button', onclick: () => act('kick', {}, () => `${u.name} was removed from every 3D server.`) }, 'Kick from servers'),
      el('button', { class: 'btn ' + (u.banned ? 'btn-grass' : 'btn-danger'), type: 'button', onclick: async () => { const b = !u.banned; if (await ask(`${b ? 'Ban' : 'Unban'} ${u.name}?`, b ? 'They get logged out, kicked from every server, cannot log back in, and all their games are hidden.' : 'They can log in again and their games come back.', [{ label: b ? 'Ban' : 'Unban', value: true, cls: 'btn-danger' }])) { openModal('#manage-modal'); act(b ? 'ban' : 'unban', {}, () => `${u.name} ${b ? 'banned' : 'unbanned'}.`); } else openModal('#manage-modal'); } }, u.banned ? 'Unban' : 'Ban')));
  const history = el('section', {}, el('h3', {}, 'Recent coins'),
    u.ledger.length ? el('ul', { class: 'ledger' }, ...u.ledger.map((l) => el('li', {}, el('span', {}, `${l.why} · ${timeAgo(l.at)}`), el('span', { class: l.delta < 0 ? 'minus' : 'plus' }, (l.delta > 0 ? '+' : '') + l.delta)))) : el('p', { class: 'small' }, 'Nothing yet.'));
  box.replaceChildren(
    el('p', { class: 'small' }, `${u.admin ? 'Admin. ' : ''}${u.banned ? 'Banned. ' : ''}Playing since ${new Date(u.since).toLocaleDateString()}. ${plural(u.games, 'published game')}. `, el('a', { class: 'linkish', href: '#/u/' + u.name, 'data-go': '#/u/' + u.name }, 'Profile')),
    note, coins, items, roles, pass, safety, history);
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
async function loadSite() {
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
    password: `set a new password for ${who}`, kick: `kicked ${who}`, ban: `banned ${who}`, unban: `unbanned ${who}`, warn: `warned ${who}`, unwarn: `removed a warning from ${who}`,
  })[d.action] || `${d.action} ${who}`;
  if (p === '/announce') return d.text ? `announced "${d.text}"` : 'removed the announcement';
  if (p === '/stock') return `set ${item} stock to ${d.left}`;
  if (p === '/deals') return d.sale === null ? 'ended the sale' : d.sale ? `started a ${d.sale.off}% sale for ${d.sale.hours} hours` : d.pin ? (d.pin.items && d.pin.items.length ? `picked deals for ${d.pin.date}` : `let ${d.pin.date} pick its own deals`) : `changed deals (${d.off}% off, ${d.count} a day)`;
  if (p.startsWith('/games/')) return d.action === 'reward' ? `made game ${p.slice(7)} pay ${d.amount} coins` : d.action === 'stars' ? `rated game ${p.slice(7)} ${d.amount}★` : `${d.action} game ${p.slice(7)}`;
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
$('#deal-save').addEventListener('click', async () => { try { await api.setDeals({ off: Number($('#deal-off').value), count: Number($('#deal-count').value) }); toast('Deals updated.'); loadDeals(); } catch (e) { toast(e.message); } });
$('#sale-go').addEventListener('click', async () => { try { await api.setDeals({ sale: { off: Number($('#sale-off').value), hours: Number($('#sale-hours').value) } }); toast('Sale is on!'); loadDeals(); } catch (e) { toast(e.message); } });
$('#sale-stop').addEventListener('click', async () => { try { await api.setDeals({ sale: null }); toast('Sale ended.'); loadDeals(); } catch (e) { toast(e.message); } });
