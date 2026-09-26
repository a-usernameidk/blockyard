// The big leaderboards: richest, highest level, best creators and more, plus numbers for the whole game.
import { $, el, session, show, go, addRoute, pipCanvas } from '../app.js';
import { api, isOnline } from '../api.js';

const BOARDS = [
  { id: 'coins', label: 'Richest', unit: 'coins' },
  { id: 'xp', label: 'Highest XP', unit: 'XP' },
  { id: 'rstars', label: 'Rated stars', unit: 'stars' },
  { id: 'likes', label: 'Best creators', unit: 'likes' },
  { id: 'items', label: 'Most items', unit: 'items' },
];
const fmt = (n) => Number(n || 0).toLocaleString();

async function showTop(by = 'coins') {
  show('top');
  if (!BOARDS.some((b) => b.id === by)) by = 'coins';
  const board = BOARDS.find((b) => b.id === by);
  $('#top-tabs').replaceChildren(...BOARDS.map((b) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(b.id === by), onclick: () => go('#/top/' + b.id) }, b.label)));
  const list = $('#top-list');
  if (!(await isOnline())) { list.replaceChildren(el('li', { class: 'empty' }, 'Leaderboards need the online server.')); $('#top-totals').replaceChildren(); return; }
  list.replaceChildren(el('li', { class: 'empty' }, 'Loading…'));
  let r;
  try { r = await api.leaderboard(by); } catch (e) { list.replaceChildren(el('li', { class: 'empty' }, e.message)); return; }
  const t = r.totals || {};
  $('#top-totals').replaceChildren(...[['Players', t.players], ['Coins in the game', t.coins], ['Items owned', t.items], ['Games made', t.games], ['Games played', t.plays], ['Trades done', t.trades], ['Reseller sales', t.sales]]
    .map(([label, v]) => el('div', { class: 'stat' }, el('span', { class: 'stat-v' }, fmt(v)), el('span', { class: 'small' }, label))));
  const me = session.user && session.user.name;
  list.replaceChildren(...(r.top.length ? r.top.map((p) => el('li', { class: (p.name === me ? 'me ' : '') + (p.rank <= 3 ? 'top' + p.rank : '') },
    el('span', { class: 'rank' }, p.rank <= 3 ? ['🥇', '🥈', '🥉'][p.rank - 1] : String(p.rank)),
    pipCanvas(34, { color: p.color, hat: p.hat }),
    el('a', { href: '#/u/' + p.name }, p.name),
    el('span', { class: 'pct' }, `${fmt(p.v)} ${board.unit}`))) : [el('li', { class: 'empty' }, 'Nobody here yet.')]));
}
addRoute(/^#\/top$/, () => showTop('coins'));
addRoute(/^#\/top\/([a-z]+)$/, (m) => showTop(m[1]));
