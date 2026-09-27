// 3D worlds: the list, one world's page (servers, private servers), and being inside a world.
import { $, $$, el, session, show, go, addRoute, toast, needLogin, copyText, siteBase, plural, onLeave, replaceRoute, ask } from '../app.js';
import { api, isOnline, store } from '../api.js';
import { progress, OBBIES } from '../progress.js';
import { WORLDS3D, builtinWorld } from '../worlds3d.js';
import { SKIES } from '../world.js';
import { drawWorldThumb, thumbOfWorld } from '../thumb3d.js';
import { setWallet, friendsNow, checkFriends, openFriends, refreshWallet } from './account.js';
import { manageUser } from './admin.js';
import { levelOf } from '../cosmetics.js';
import { gameConfig, GAMES, BOTS, BOT_SKILL } from '../games.js';
import { openReport, diffTag, diffFace, voteBox } from './play.js';
import { starsFor } from '../stars.js';
import { shopPanel } from './closet.js';
import { gfx } from '../settings.js';
import { openDMs, startLive } from './social.js';

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
export function worldCard({ id, name, by, mode, sky, blurb, reward, thumb, plays, likes, dislikes, done, game, stars }) {
  const cv = el('canvas', { class: 'thumb3d', 'aria-hidden': 'true' });
  requestAnimationFrame(() => drawWorldThumb(cv, thumb, sky));
  const n = online.worlds[id] || 0;
  const meta = el('div', { class: 'card-meta' },
    diffTag(stars),
    el('span', { class: 'tag tag-3d' + (game ? ' tag-game' : '') }, game ? GAMES[game].name : mode === 'hangout' ? 'Hangout' : 'Obby'),
    n ? el('span', { class: 'tag tag-live' }, `${n} playing`) : null,
    reward ? el('span', { class: 'tag tag-pay' }, done ? 'Paid out' : `Pays ${reward} coins`) : null,
    plays != null ? el('span', { class: 'tag' }, plural(plays, 'visit')) : null,
    likes || dislikes ? el('span', { class: 'tag' }, `👍 ${likes || 0}${dislikes ? `  👎 ${dislikes}` : ''}`) : null);
  return el('article', { class: 'card card-world' }, cv,
    el('div', { class: 'card-body' },
      el('div', {}, el('h3', {}, name), by ? el('p', { class: 'by-line' }, 'by ', el('a', { class: 'linkish', href: '#/u/' + encodeURIComponent(by) }, by)) : null, blurb ? el('p', {}, blurb) : null, meta),
      el('div', { class: 'row' }, el('button', { class: 'btn btn-grass', type: 'button', onclick: () => go(`#/w/${id}/play`) }, 'Play'), el('button', { class: 'btn', type: 'button', onclick: () => go('#/w/' + id) }, 'Servers'))));
}
export function builtinCards(only) {
  const kind = (w) => (w.game ? 'games' : w.mode === 'hangout' ? 'hangout' : 'obby');
  return WORLDS3D.filter((w) => !w.hidden && (!only || kind(w) === only)).map((w) => {
    if (!builtinThumbs.has(w.id)) builtinThumbs.set(w.id, thumbOfWorld(w.get().world));
    const done = progress.level('w:' + w.id);
    return worldCard({ id: w.id, name: w.name, mode: w.mode, sky: w.sky, blurb: w.blurb, reward: w.reward, thumb: builtinThumbs.get(w.id), done: done && done.won, game: w.game, stars: starsFor('w:' + w.id) });
  });
}
export const playerWorldCard = (g) => worldCard({ id: g.id, name: g.name, by: g.creator, mode: g.style, sky: g.theme, blurb: g.descr, thumb: g.thumb, plays: g.plays, likes: g.likes, dislikes: g.dislikes, stars: g.stars, reward: g.pays || g.reward });

/* ---------------- the worlds page ---------------- */
const wl = { sort: 'top', page: 0, busy: false };
async function showWorlds(jump) {
  show('worlds');
  await loadOnline(true);
  $('#worlds-hangout').replaceChildren(...builtinCards('hangout'));
  $('#worlds-games').replaceChildren(...builtinCards('games'));
  $('#worlds-builtin').replaceChildren(...builtinCards('obby'));
  if (jump) requestAnimationFrame(() => $('#minigames').scrollIntoView({ block: 'start' }));
  loadWorlds(true);
  renderFriendsOnline();
  if (session.user) checkFriends().then(renderFriendsOnline);
}
// "Friends playing now" with a Join button
function renderFriendsOnline() {
  const d = friendsNow(), box = $('#friends-online');
  const on = d ? d.friends.filter((f) => f.online) : [];
  box.hidden = !on.length;
  box.replaceChildren(el('h2', {}, 'Friends online'), el('div', { class: 'mail-list', style: 'max-width:560px' }, ...on.map((f) => el('div', { class: 'friend-row' },
    el('span', { class: 'dot', style: `background:${f.look.color}` }), el('span', { class: 'who' }, el('b', {}, f.name), el('span', { class: 'small' }, f.online.site ? 'Online (not in a world)' : `in ${f.online.name}`)),
    f.online.code ? el('button', { class: 'btn btn-grass', type: 'button', onclick: () => go('#/join/' + f.online.code) }, 'Join') : null))),
  el('button', { class: 'linkish', type: 'button', onclick: openFriends }, 'All my friends'));
}
// the top 10 fastest checked times on an obby
function boardList(b, compact) {
  if (!b.top.length) return el('p', { class: 'small' }, 'No times yet. Beat it to be first!');
  const me = session.user && session.user.name;
  return el('ol', { class: 'board' + (compact ? ' win-board' : '') }, ...b.top.map((t, i) => el('li', { class: t.name === me ? 'me' : '' }, el('span', { class: 'rank' }, `#${i + 1}`), el('span', {}, t.name), el('span', {}, `${t.time.toFixed(2)}s`))),
    b.me && b.me.rank > b.top.length ? el('li', { class: 'me' }, el('span', { class: 'rank' }, `#${b.me.rank}`), el('span', {}, me), el('span', {}, `${b.me.time.toFixed(2)}s`)) : null);
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
    msg.textContent = !r.games.length && reset ? (wl.sort === 'reward' ? 'No player worlds pay coins right now.' : wl.sort === 'rated' ? 'No rated worlds yet. Admins give great worlds a star rating.' : 'No player worlds yet. Go to Create and build the first one!') : '';
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
  if (b) return { id, builtin: true, name: b.name, mode: b.mode, sky: b.sky, blurb: b.blurb, reward: b.reward, world: b.get().world, by: null, stars: starsFor('w:' + id) };
  const { game: g } = await api.get(id);
  if (g.kind !== '3d') { go('#/p/' + id); throw new Error('2d'); }
  return { id, builtin: false, name: g.name, mode: g.style, sky: g.theme, blurb: g.descr, reward: g.reward, world: g.world, by: g.creator, plays: g.plays, likes: g.likes, visibility: g.visibility, stars: g.stars || 0, reward: g.pays || g.reward, myVote: g.myVote || 0 };
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
  const boardBox = el('div', {}, el('p', { class: 'small' }, 'Loading…'));
  if (w.mode !== 'hangout') api.board((w.builtin ? 'w:' : 'g:') + id).then((b) => boardBox.replaceChildren(boardList(b))).catch(() => boardBox.replaceChildren(el('p', { class: 'small' }, 'Leaderboards need the online version.')));
  const done = progress.level('w:' + id);
  page.replaceChildren(
    el('div', { class: 'world-hero' }, el('div', { class: 'hero-thumb' }, cv, diffFace(w.stars, 64)), el('div', { class: 'world-info' },
      el('p', { class: 'detail-kicker' }, w.world.game ? `Minigame: ${GAMES[w.world.game].name}` : w.builtin && builtinWorld(id).game ? 'Minigame' : w.mode === 'hangout' ? 'Hangout' : 'Obby', w.by ? [' by ', el('a', { class: 'linkish', href: '#/u/' + w.by }, w.by)] : ' by Blockyard'),
      el('h1', {}, w.name),
      w.blurb ? el('p', { class: 'lede' }, w.blurb) : null,
      el('div', { class: 'card-meta' },
        diffTag(w.stars),
        el('span', { class: 'tag' }, SKIES[w.sky] ? SKIES[w.sky].name : 'Sky'),
        online.worlds[id] ? el('span', { class: 'tag tag-live' }, `${online.worlds[id]} playing now`) : null,
        w.reward ? el('span', { class: 'tag tag-pay' }, w.builtin ? `First clear pays ${w.reward} coins, +25 with no falls, +2 per coin` : `Pays ${w.reward} coins the first time you beat it`) : null,
        done && done.won ? el('span', { class: 'tag' }, `Your best: ${done.time}s`) : null,
        w.plays != null ? el('span', { class: 'tag' }, plural(w.plays, 'visit')) : null),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-big btn-grass', type: 'button', onclick: () => go(`#/w/${id}/play`) }, session.user ? 'Play' : 'Play solo'),
        session.user ? null : el('button', { class: 'btn btn-sun', type: 'button', onclick: () => needLogin('Playing with others and chat need an account.') }, 'Log in to play with others'),
        w.builtin ? null : rateButtons(id),
        w.builtin ? null : el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => (session.user ? openReport(id) : needLogin('Reporting needs an account.')) }, 'Report')))),
    w.mode === 'hangout' ? null : el('div', {}, el('h2', {}, 'Fastest times'), boardBox),
    el('div', { class: 'two-col' },
      el('div', {}, el('h2', {}, 'Public servers'), serversBox),
      el('div', {}, el('h2', {}, 'Private servers'), el('p', { class: 'small' }, w.builtin && builtinWorld(id).game ? 'Only people with the link can join. You can add bots (and pick how smart they are) to practice, even alone. Bot rounds don\'t pay coins.' : 'Only people with the link can join. Great for playing with just your friends.'), privBox)));
  requestAnimationFrame(() => drawWorldThumb(cv, thumbOfWorld(w.world), w.sky));
  if (!(await isOnline())) { serversBox.append(el('p', { class: 'small' }, 'Servers need the online version of Blockyard.')); return; }
  try {
    const r = await api.servers(id);
    serversBox.append(r.servers.length
      ? el('ul', { class: 'server-list' }, ...r.servers.map((s) => el('li', {}, el('span', {}, `Server ${s.code.slice(0, 4)}`), el('span', { class: 'small' }, `${s.players} of ${r.size} players`), el('button', { class: 'btn', type: 'button', disabled: s.players >= r.size, onclick: () => go('#/join/' + s.code) }, s.players >= r.size ? 'Full' : 'Join'))))
      : el('p', { class: 'small' }, 'Nobody is here right now. Press Play and you will start a new server.'));
    const isGame = w.builtin && !!builtinWorld(id).game;
    const mineList = el('ul', { class: 'server-list' }, ...r.mine.map((s) => privRow(s.code, s.players, isGame ? s : null)));
    privBox.append(mineList, el('button', { class: 'btn btn-sun', type: 'button', onclick: async () => {
      if (!session.user) { needLogin('Private servers need an account.'); return; }
      try { const p = await api.privateServer(id); mineList.prepend(privRow(p.code, 0, isGame ? { code: p.code, bots: 0, skill: 'normal' } : null)); toast('Private server made. Copy the link and send it to your friends.'); } catch (e) { toast(e.message); }
    } }, 'Make a private server'));
  } catch (e) { serversBox.append(el('p', { class: 'small' }, e.message)); }
}
// Like / Dislike a player's world (picking one takes the other back)
function rateButtons(id) {
  const mine = store.get('liked:' + id, '');
  const set = (k) => { like.disabled = k === 'like'; dis.disabled = k === 'dislike'; like.textContent = k === 'like' ? 'Liked 👍' : 'Like 👍'; dis.textContent = k === 'dislike' ? 'Disliked 👎' : 'Dislike 👎'; };
  const act = (k) => async () => {
    if (!session.user) { needLogin('Likes and dislikes need an account.'); return; }
    try { const r = await (k === 'like' ? api.like(id) : api.dislike(id)); store.set('liked:' + id, k); set(k); toast(`👍 ${r.likes}  👎 ${r.dislikes}`); } catch (err) { toast(err.message); }
  };
  const like = el('button', { class: 'btn', type: 'button', onclick: act('like') }), dis = el('button', { class: 'btn', type: 'button', onclick: act('dislike') });
  set(mine === true ? 'like' : mine);
  return el('span', { class: 'row' }, like, dis);
}
function privRow(code, players, bots) {
  const link = siteBase() + '#/join/' + code;
  // minigame worlds: pick how many bots and how smart they are
  let botBits = null;
  if (bots) {
    const n = el('select', { 'aria-label': 'Bots' }, ...Array.from({ length: BOTS.max + 1 }, (_, i) => el('option', { value: String(i) }, i ? `${i} bot${i > 1 ? 's' : ''}` : 'No bots')));
    const sk = el('select', { 'aria-label': 'How smart the bots are' }, ...BOTS.skills.map((k) => el('option', { value: k }, BOT_SKILL[k].name)));
    n.value = String(bots.bots || 0); sk.value = bots.skill || 'normal';
    const save = async () => { try { await api.serverBots(code, Number(n.value), sk.value); toast(Number(n.value) ? `${n.value} ${BOT_SKILL[sk.value].name} bot${n.value > 1 ? 's' : ''} will play in this server (when you're in it).` : 'No bots in this server.'); } catch (e) { toast(e.message); } };
    n.addEventListener('change', save); sk.addEventListener('change', save);
    botBits = el('span', { class: 'row bot-row', title: 'Bots play when you are in the server. Rounds with bots do not pay coins.' }, n, sk);
  }
  const li = el('li', {}, el('span', {}, `Code ${code}`), el('span', { class: 'small' }, plural(players, 'player')), botBits,
    el('button', { class: 'btn', type: 'button', onclick: (e) => copyText(link, e.currentTarget, 'Copy link') }, 'Copy link'),
    el('button', { class: 'btn btn-grass', type: 'button', onclick: () => go('#/join/' + code) }, 'Join'),
    el('button', { class: 'btn btn-danger', type: 'button', title: 'Close this private server for good', onclick: async () => {
      if (!(await ask('Delete this private server?', `Anyone in it gets sent out, and the code ${code} stops working. You can make a new one any time.`, [{ label: 'Delete it', value: true, cls: 'btn-danger' }]))) return;
      try { await api.closeServer(code); li.remove(); toast('Private server deleted.'); } catch (e) { toast(e.message); }
    } }, 'Delete'));
  return li;
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
  const g3 = gfx(), low = g3.low;
  game = startWorld(root, {
    world: w.world, title: w.name, by: w.by, gfx: g3, look: progress.data.equip, me: session.user ? { name: session.user.name, display: session.user.display || '', tags: session.user.tags || [], admin: !!session.user.admin, lvl: progress.wallet ? levelOf(progress.wallet.xp) : 0, title: session.user.title || '' } : { name: 'You' }, low,
    onManage: (name) => manageUser(name),
    game: (() => { try { return gameConfig(w.world, w.builtin ? builtinWorld(id) : null); } catch (e) { return null; } })(),
    onPrize: () => refreshWallet(),
    onStat: (name, n = 1) => { progress.stat(name, n); progress.flush(); },
    snow: !!(w.builtin && builtinWorld(id).snow),
    way: w.builtin && builtinWorld(id).game ? builtinWorld(id).get().way : null,
    music: w.builtin ? (builtinWorld(id).snow ? 'snow' : builtinWorld(id).game ? 'game' : w.sky === 'night' && w.mode !== 'hangout' ? 'space' : null) : null,
    shop: w.builtin ? builtinWorld(id).shop || null : null,
    onShop: shopPanel,
    worldId: id,
    ownsGear: (gid) => progress.owns('gear', gid),
    wallet: () => progress.wallet,
    // this world's own shop (player worlds only): what you bought, and buying more
    shopOwned: !w.builtin && session.user ? () => api.worldShop(id) : null,
    onShopBuy: !w.builtin && session.user ? async (item) => { const r = await api.buyWorldItem(id, item); if (r.wallet) setWallet(r.wallet); return r; } : null,
    onKick: async (name) => { try { await api.adminAct(name, 'kick'); toast(`${name} was kicked.`); } catch (e) { toast(e.message); } },
    room: multi ? async () => { if (first) { const f = first; first = null; return f; } return api.joinRoom(joined ? { code: joined } : { world: id }); } : null,
    soloNote: !session.user ? 'You are playing solo. Log in to see other players and chat.' : !session.rooms ? 'Multiplayer is off on this server, so you are playing solo.' : null,
    onJoined: (info) => { if (info && info.code) { joined = info.code; replaceRoute('#/join/' + info.code); } },
    friends: session.user ? () => api.friends() : null,
    inviteFriend: (code, name) => api.inviteFriend(code, name),
    onExit: () => go(w.builtin || !w.by ? '#/worlds' : '#/w/' + id),
    onProfile: (name) => go('#/u/' + name),
    onTrade: (name) => go('#/closet/trade/' + name),
    onLiveTrade: (name) => startLive(name),
    onMessage: (name) => openDMs(name),
    onGraphics: () => enterWorld(id, code),
    onWin: async (r) => {
      progress.finishWorld(id, r);
      if (!session.user) return { text: w.reward ? `Log in to earn coins from ${w.builtin ? 'Blockyard obbies' : 'this obby'} and get on the leaderboard.` : 'Log in to get on the leaderboard.' };
      if (r.noProof) return { text: 'Flying or building was used in this server, so this run does not count.' };
      const res = await api.finish(w.builtin ? { kind: 'world', id, replay: r.replay } : { kind: 'game', id, replay: r.replay });
      if (res.wallet) setWallet(res.wallet);
      const coins = (res.earned ? `+${res.earned} coins${res.bonus ? ' (replay bonus)' : ''}! ` : w.reward ? (res.note || 'You already got the coins for this one.') + ' ' : '') + (res.rated ? `+${res.rated}★ difficulty stars! ` : '');
      const b = res.board;
      const rank = b && b.me ? (b.newBest ? `New best: you're #${b.me.rank} on the leaderboard!` : `Your best is #${b.me.rank} (${b.me.time.toFixed(2)}s).`) : '';
      const vb = !w.builtin && !w.stars && w.by !== session.user.name ? voteBox(id, w.myVote) : null;
      return { text: coins + rank, extra: el('div', {}, b ? boardList(b, true) : null, vb) };
    },
  });
  if (w.builtin) progress.visit(id);
  if (!w.builtin) { const seen = 'played:' + id; try { if (!sessionStorage.getItem(seen)) { sessionStorage.setItem(seen, '1'); api.play(id).catch(() => {}); } } catch (e) { /* ok */ } }
  if (multi) setTimeout(() => loadOnline(true), 3000);
  // count chat for the badge
  root.addEventListener('submit', (e) => { if (e.target.classList.contains('w3-chat-form')) { progress.stat('chats'); progress.flush(); } });
}
let firstTicket = null;

addRoute(/^#\/worlds$/, () => showWorlds());
addRoute(/^#\/worlds\/games$/, () => showWorlds(true));
addRoute(/^#\/w\/([A-Za-z0-9-]+)\/play$/, (m) => enterWorld(m[1]));
addRoute(/^#\/w\/([A-Za-z0-9-]+)$/, (m) => showWorld(m[1]));
addRoute(/^#\/join\/([A-Za-z0-9]+)$/, (m) => enterWorld(null, m[1]));
export { OBBIES };

// Quick play: jump straight into a random world (Blockyard's own, or one a player made and shared).
$('#random-world').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  b.disabled = true;
  let id = null;
  try {
    const mine = WORLDS3D.filter((w) => !w.hidden).map((w) => w.id);
    const r = (await isOnline()) ? await api.randomWorld().catch(() => null) : null;
    // about half the time a player world, if there are any
    id = r && r.id && Math.random() < 0.5 ? r.id : mine[Math.floor(Math.random() * mine.length)];
    toast(`Off to ${(builtinWorld(id) || {}).name || (r && r.name) || 'a random world'}!`);
  } finally { b.disabled = false; }
  if (id) go('#/w/' + id + '/play');
});
