// 3D worlds: the list, one world's page (servers, private servers), and being inside a world.
import { $, $$, el, session, show, go, addRoute, toast, needLogin, copyText, siteBase, plural, onLeave, replaceRoute } from '../app.js';
import { api, isOnline, store } from '../api.js';
import { progress, OBBIES } from '../progress.js';
import { WORLDS3D, builtinWorld } from '../worlds3d.js';
import { SKIES } from '../world.js';
import { drawWorldThumb, thumbOfWorld } from '../thumb3d.js';
import { setWallet } from './account.js';
import { openReport } from './play.js';

let game = null;
onLeave('w3', () => { if (game) { game.stop(); game = null; } $('#w3-root').replaceChildren(); });

/* ---------------- online counts ---------------- */
let online = { worlds: {}, total: 0 }, onlineAt = 0;
export async function loadOnline(force) {
  if (!force && Date.now() - onlineAt < 20000) return online;
  onlineAt = Date.now();
  try { online = await api.online(); } catch (e) { /* offline */ }
  const dot = $('#nav-online');
  dot.hidden = !online.total; dot.textContent = online.total ? String(online.total) : '';
  dot.title = online.total ? `${plural(online.total, 'player')} in worlds right now` : '';
  showAnnounce(online.announce || '');
  return online;
}
// The admin's message across the top of the site. Hiding it hides only that message.
export function showAnnounce(text, force) {
  const box = $('#announce');
  if (force) store.set('announce-hidden', '');
  $('#announce-text').textContent = text;
  box.hidden = !text || store.get('announce-hidden', '') === text;
}
$('#announce-x').addEventListener('click', () => { store.set('announce-hidden', $('#announce-text').textContent); $('#announce').hidden = true; });

/* ---------------- cards ---------------- */
const builtinThumbs = new Map();
export function worldCard({ id, name, by, mode, sky, blurb, reward, thumb, plays, likes, done }) {
  const cv = el('canvas', { class: 'thumb3d', 'aria-hidden': 'true' });
  requestAnimationFrame(() => drawWorldThumb(cv, thumb, sky));
  const n = online.worlds[id] || 0;
  const meta = el('div', { class: 'card-meta' },
    el('span', { class: 'tag tag-3d' }, mode === 'hangout' ? 'Hangout' : 'Obby'),
    n ? el('span', { class: 'tag tag-live' }, `${n} playing`) : null,
    reward ? el('span', { class: 'tag tag-pay' }, done ? 'Paid out' : `Pays ${reward} coins`) : null,
    plays != null ? el('span', { class: 'tag' }, plural(plays, 'visit')) : null,
    likes ? el('span', { class: 'tag' }, plural(likes, 'like')) : null);
  return el('article', { class: 'card card-world' }, cv,
    el('div', { class: 'card-body' },
      el('div', {}, el('h3', {}, name), by ? el('p', { class: 'by-line' }, 'by ', el('a', { class: 'linkish', href: '#/u/' + encodeURIComponent(by) }, by)) : null, blurb ? el('p', {}, blurb) : null, meta),
      el('div', { class: 'row' }, el('button', { class: 'btn btn-grass', type: 'button', onclick: () => go(`#/w/${id}/play`) }, 'Play'), el('button', { class: 'btn', type: 'button', onclick: () => go('#/w/' + id) }, 'Servers'))));
}
export function builtinCards() {
  return WORLDS3D.map((w) => {
    if (!builtinThumbs.has(w.id)) builtinThumbs.set(w.id, thumbOfWorld(w.get().world));
    const done = progress.level('w:' + w.id);
    return worldCard({ id: w.id, name: w.name, mode: w.mode, sky: w.sky, blurb: w.blurb, reward: w.reward, thumb: builtinThumbs.get(w.id), done: done && done.won });
  });
}
export const playerWorldCard = (g) => worldCard({ id: g.id, name: g.name, by: g.creator, mode: g.style, sky: g.theme, blurb: g.descr, reward: g.reward, thumb: g.thumb, plays: g.plays, likes: g.likes });

/* ---------------- the worlds page ---------------- */
const wl = { sort: 'top', page: 0, busy: false };
async function showWorlds() {
  show('worlds');
  await loadOnline(true);
  $('#worlds-builtin').replaceChildren(...builtinCards());
  loadWorlds(true);
}
async function loadWorlds(reset) {
  if (wl.busy) return;
  wl.busy = true;
  if (reset) { wl.page = 0; $('#worlds-grid').innerHTML = ''; }
  const msg = $('#worlds-msg');
  if (!(await isOnline())) { msg.textContent = 'Player worlds need the online version of Blockyard.'; wl.busy = false; return; }
  msg.textContent = 'Loading…';
  try {
    const r = await api.list({ kind: '3d', sort: wl.sort, page: wl.page, rewarding: wl.sort === 'reward' ? '1' : '' });
    for (const g of r.games) $('#worlds-grid').append(playerWorldCard(g));
    $('#worlds-more').hidden = !r.more;
    msg.textContent = !r.games.length && reset ? (wl.sort === 'reward' ? 'No player worlds pay coins right now.' : 'No player worlds yet. Go to Create and build the first one!') : '';
  } catch (e) { msg.textContent = e.message; }
  wl.busy = false;
}
$$('[data-wsort]').forEach((b) => b.addEventListener('click', () => { wl.sort = b.dataset.wsort; $$('[data-wsort]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); loadWorlds(true); }));
$('#worlds-more').addEventListener('click', () => { wl.page++; loadWorlds(false); });
$('#join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  let code = $('#join-code').value.trim();
  const m = code.match(/#\/join\/([A-Za-z0-9]+)/); if (m) code = m[1];
  if (code) go('#/join/' + code);
});

/* ---------------- one world ---------------- */
async function loadWorld(id) {
  const b = builtinWorld(id);
  if (b) return { id, builtin: true, name: b.name, mode: b.mode, sky: b.sky, blurb: b.blurb, reward: b.reward, world: b.get().world, by: null };
  const { game: g } = await api.get(id);
  if (g.kind !== '3d') { go('#/p/' + id); throw new Error('2d'); }
  return { id, builtin: false, name: g.name, mode: g.style, sky: g.theme, blurb: g.descr, reward: g.reward, world: g.world, by: g.creator, plays: g.plays, likes: g.likes, visibility: g.visibility };
}
async function showWorld(id) {
  show('world', 'worlds');
  const page = $('#world-page');
  page.replaceChildren(el('p', { class: 'msg' }, 'Loading…'));
  let w;
  try { w = await loadWorld(id); } catch (e) { if (e.message !== '2d') page.replaceChildren(el('div', { class: 'panel-note' }, el('h3', {}, "That world didn't load"), el('p', {}, e.message), el('button', { class: 'btn', type: 'button', 'data-go': '#/worlds' }, 'Back to worlds'))); return; }
  await loadOnline(true);
  const cv = el('canvas', { class: 'thumb3d big', 'aria-hidden': 'true' });
  const serversBox = el('div', { class: 'servers' });
  const privBox = el('div', { class: 'servers' });
  const done = progress.level('w:' + id);
  page.replaceChildren(
    el('div', { class: 'world-hero' }, cv, el('div', { class: 'world-info' },
      el('p', { class: 'detail-kicker' }, w.mode === 'hangout' ? 'Hangout' : 'Obby', w.by ? [' by ', el('a', { class: 'linkish', href: '#/u/' + w.by }, w.by)] : ' by Blockyard'),
      el('h1', {}, w.name),
      w.blurb ? el('p', { class: 'lede' }, w.blurb) : null,
      el('div', { class: 'card-meta' },
        el('span', { class: 'tag' }, SKIES[w.sky] ? SKIES[w.sky].name : 'Sky'),
        online.worlds[id] ? el('span', { class: 'tag tag-live' }, `${online.worlds[id]} playing now`) : null,
        w.reward ? el('span', { class: 'tag tag-pay' }, w.builtin ? `First clear pays ${w.reward} coins, +25 with no falls, +2 per coin` : `Pays ${w.reward} coins the first time you beat it`) : null,
        done && done.won ? el('span', { class: 'tag' }, `Your best: ${done.time}s`) : null,
        w.plays != null ? el('span', { class: 'tag' }, plural(w.plays, 'visit')) : null),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-big btn-grass', type: 'button', onclick: () => go(`#/w/${id}/play`) }, session.user ? 'Play' : 'Play solo'),
        session.user ? null : el('button', { class: 'btn btn-sun', type: 'button', onclick: () => needLogin('Playing with others and chat need an account.') }, 'Log in to play with others'),
        w.builtin ? null : el('button', { class: 'btn', type: 'button', onclick: async (e) => { if (!session.user) { needLogin('Likes need an account.'); return; } try { await api.like(id); e.target.textContent = 'Liked'; e.target.disabled = true; } catch (err) { toast(err.message); } } }, 'Like'),
        w.builtin ? null : el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => (session.user ? openReport(id) : needLogin('Reporting needs an account.')) }, 'Report')))),
    el('div', { class: 'two-col' },
      el('div', {}, el('h2', {}, 'Public servers'), serversBox),
      el('div', {}, el('h2', {}, 'Private servers'), el('p', { class: 'small' }, 'Only people with the link can join. Great for playing with just your friends.'), privBox)));
  requestAnimationFrame(() => drawWorldThumb(cv, thumbOfWorld(w.world), w.sky));
  if (!(await isOnline())) { serversBox.append(el('p', { class: 'small' }, 'Servers need the online version of Blockyard.')); return; }
  try {
    const r = await api.servers(id);
    serversBox.append(r.servers.length
      ? el('ul', { class: 'server-list' }, ...r.servers.map((s) => el('li', {}, el('span', {}, `Server ${s.code.slice(0, 4)}`), el('span', { class: 'small' }, `${s.players} of ${r.size} players`), el('button', { class: 'btn', type: 'button', disabled: s.players >= r.size, onclick: () => go('#/join/' + s.code) }, s.players >= r.size ? 'Full' : 'Join'))))
      : el('p', { class: 'small' }, 'Nobody is here right now. Press Play and you will start a new server.'));
    const mineList = el('ul', { class: 'server-list' }, ...r.mine.map((s) => privRow(s.code, s.players)));
    privBox.append(mineList, el('button', { class: 'btn btn-sun', type: 'button', onclick: async () => {
      if (!session.user) { needLogin('Private servers need an account.'); return; }
      try { const p = await api.privateServer(id); mineList.prepend(privRow(p.code, 0)); toast('Private server made. Copy the link and send it to your friends.'); } catch (e) { toast(e.message); }
    } }, 'Make a private server'));
  } catch (e) { serversBox.append(el('p', { class: 'small' }, e.message)); }
}
function privRow(code, players) {
  const link = siteBase() + '#/join/' + code;
  return el('li', {}, el('span', {}, `Code ${code}`), el('span', { class: 'small' }, plural(players, 'player')),
    el('button', { class: 'btn', type: 'button', onclick: (e) => copyText(link, e.currentTarget, 'Copy link') }, 'Copy link'),
    el('button', { class: 'btn btn-grass', type: 'button', onclick: () => go('#/join/' + code) }, 'Join'));
}

/* ---------------- inside a world ---------------- */
async function enterWorld(id, code) {
  show('w3', 'worlds');
  const root = $('#w3-root');
  root.replaceChildren(el('p', { class: 'msg' }, 'Loading world…'));
  let w;
  if (code && !id) {
    // joining by code: the server tells us which world
    if (!session.user) { root.replaceChildren(el('div', { class: 'panel-note' }, el('h3', {}, 'Log in to join your friend'), el('p', {}, 'Servers with other players need an account. It only takes a username and a password.'), el('button', { class: 'btn btn-sun', type: 'button', onclick: () => $('#me-btn').click() }, 'Log in or sign up'))); return; }
    try { const j = await api.joinRoom({ code }); id = j.world.id; firstTicket = j; } catch (e) { root.replaceChildren(el('div', { class: 'panel-note' }, el('h3', {}, "Couldn't join"), el('p', {}, e.message), el('button', { class: 'btn', type: 'button', 'data-go': '#/worlds' }, 'Back to worlds'))); return; }
  }
  try { w = await loadWorld(id); } catch (e) { if (e.message !== '2d') root.replaceChildren(el('div', { class: 'panel-note' }, el('h3', {}, "That world didn't load"), el('p', {}, e.message))); return; }
  const { startWorld } = await import('../play3d.js');
  if (game) game.stop();
  const multi = !!(session.user && session.online && session.rooms);
  let first = firstTicket; firstTicket = null;
  let joined = code || null;
  const low = store.get('gfx-low', false);
  game = startWorld(root, {
    world: w.world, title: w.name, by: w.by, look: progress.data.equip, me: session.user ? { name: session.user.name } : { name: 'You' }, low,
    room: multi ? async () => { if (first) { const f = first; first = null; return f; } return api.joinRoom(joined ? { code: joined } : { world: id }); } : null,
    soloNote: !session.user ? 'You are playing solo. Log in to see other players and chat.' : !session.rooms ? 'Multiplayer is off on this server, so you are playing solo.' : null,
    onJoined: (info) => { if (info && info.code) { joined = info.code; replaceRoute('#/join/' + info.code); } },
    onExit: () => go(w.builtin || !w.by ? '#/worlds' : '#/w/' + id),
    onProfile: (name) => go('#/u/' + name),
    onTrade: (name) => go('#/closet/trade/' + name),
    onGraphics: () => enterWorld(id, code),
    onWin: async (r) => {
      progress.finishWorld(id, r);
      if (!w.reward) return { text: '' };
      if (!session.user) return { text: `Log in to earn coins from ${w.builtin ? 'Blockyard obbies' : 'this obby'}.` };
      const res = await api.finish(w.builtin ? { kind: 'world', id, replay: r.replay } : { kind: 'game', id, replay: r.replay });
      if (res.wallet) setWallet(res.wallet);
      return { text: res.earned ? `+${res.earned} coins` : res.note || 'You already got the coins for this one.' };
    },
  });
  if (!w.builtin) { const seen = 'played:' + id; try { if (!sessionStorage.getItem(seen)) { sessionStorage.setItem(seen, '1'); api.play(id).catch(() => {}); } } catch (e) { /* ok */ } }
  if (multi) setTimeout(() => loadOnline(true), 3000);
  // count chat for the badge
  root.addEventListener('submit', (e) => { if (e.target.classList.contains('w3-chat-form')) { progress.stat('chats'); progress.flush(); } });
}
let firstTicket = null;

addRoute(/^#\/worlds$/, () => showWorlds());
addRoute(/^#\/w\/([A-Za-z0-9]+)\/play$/, (m) => enterWorld(m[1]));
addRoute(/^#\/w\/([A-Za-z0-9]+)$/, (m) => showWorld(m[1]));
addRoute(/^#\/join\/([A-Za-z0-9]+)$/, (m) => enterWorld(null, m[1]));
export { OBBIES };
