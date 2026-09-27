// The home page: the title screen, quick buttons, popular worlds and new levels.
import { $, el, session, show, go, addRoute, defaultRoute, plural, onLeave, currentView } from '../app.js';
import { api, isOnline } from '../api.js';
import { progress } from '../progress.js';
import { drawBackground, drawTile } from '../render2d.js';
import { drawPip } from '../art.js';
import { todayUTC } from '../endless.js';
import { MAP, nextLevelIndex, publishedCard } from './play.js';
import { loadOnline, builtinCards, playerWorldCard } from './worlds.js';
import { onSession, setWallet } from './account.js';
import { ask, toast } from '../app.js';
import { store } from '../api.js';

/* ---------------- today: log-in streak and daily quests ---------------- */
async function renderToday() {
  const box = $('#home-today');
  if (!session.user || !session.online) { box.hidden = true; return null; }
  let s;
  try { s = await api.quests(); } catch (e) { box.hidden = true; return null; }
  const st = s.streak, cur = st.today ? (st.count - 1) % 7 : st.count % 7;
  const claimBonus = async () => { try { const r = await api.bonus(); setWallet(r.wallet); toast(`Day ${r.day} bonus: +${r.earned} coins!`, 'toast-ach'); renderToday(); } catch (e) { toast(e.message); } };
  const claim = (id) => async () => { try { const r = await api.claimQuest(id); setWallet(r.wallet); toast(`Quest done: +${r.earned} coins!`, 'toast-ach'); renderToday(); } catch (e) { toast(e.message); } };
  const allDone = s.quests.every((q) => q.claimed);
  box.hidden = false;
  box.replaceChildren(
    el('div', { class: 'today-card' },
      el('h2', {}, st.count ? `${st.count}-day streak` + (st.count >= 3 ? ' 🔥' : '') : 'Daily bonus'),
      el('p', { class: 'small' }, st.today ? 'Come back tomorrow to keep your streak going. Day 7 pays 150!' : 'Log in every day for bigger rewards. Miss a day and it starts over.'),
      el('div', { class: 'streak' }, ...st.rewards.map((c, i) => el('span', { class: 'day' + (i < cur || (i === cur && st.today) ? ' done' : '') + (i === cur && !st.today ? ' now' : '') }, el('b', {}, `Day ${i + 1}`), `${c}`))),
      st.today ? el('p', { class: 'msg' }, `You got today's ${st.rewards[cur]} coins.`) : el('button', { class: 'btn btn-big btn-sun', type: 'button', onclick: claimBonus }, `Claim ${st.next} coins`)),
    el('div', { class: 'today-card' },
      el('h2', {}, "Today's quests"),
      el('p', { class: 'small' }, `New ones every day. +${s.quests[0].reward} coins each, +${s.all.reward} more for all three.`),
      ...s.quests.map((q) => el('div', { class: 'quest' + (q.claimed ? ' done' : '') },
        el('span', { class: 'q-text' }, q.text, el('span', { class: 'q-bar' }, el('span', { style: `width:${Math.round(q.n / q.goal * 100)}%` })), el('span', { class: 'small' }, `${q.n} / ${q.goal}`)),
        q.claimed ? el('span', { class: 'q-ok' }, 'Done ✓') : q.n >= q.goal ? el('button', { class: 'btn btn-grass', type: 'button', onclick: claim(q.id) }, `+${q.reward}`) : el('span', { class: 'small' }, `+${q.reward}`))),
      allDone && !s.all.claimed ? el('button', { class: 'btn btn-sun', type: 'button', onclick: claim('all') }, `All three done! Claim +${s.all.reward}`) : s.all.claimed ? el('p', { class: 'msg' }, 'All done for today. Nice!') : null));
  return s;
}
// Once a day, the bonus pops up by itself.
onSession(async (user) => {
  if (!user) { $('#home-today').hidden = true; return; }
  const s = await renderToday();
  if (!s || s.streak.today || store.get('bonus-asked', '') === s.date + user.id) return;
  // wait until no other pop-up is open (like the recovery code after signing up)
  for (let i = 0; i < 120 && document.querySelector('.modal:not([hidden])'); i++) await new Promise((r) => setTimeout(r, 1000));
  if (document.querySelector('.modal:not([hidden])') || !session.user || session.user.id !== user.id) return;
  store.set('bonus-asked', s.date + user.id);
  const ok = await ask('Daily bonus!', `Day ${s.streak.count + 1} of your streak: ${s.streak.next} coins. Come back every day, day 7 pays 150!`, [{ label: `Claim ${s.streak.next} coins`, value: true, cls: 'btn-sun' }]);
  if (!ok) return;
  try { const r = await api.bonus(); setWallet(r.wallet); toast(`+${r.earned} coins! See you tomorrow.`, 'toast-ach'); renderToday(); } catch (e) { toast(e.message); }
});

let titleRaf = 0;
onLeave('home', () => cancelAnimationFrame(titleRaf));

async function showHome() {
  show('home');
  startTitle();
  renderTiles();
  renderToday();
  $('#home-worlds').replaceChildren(...builtinCards());
  if (!(await isOnline()) || currentView() !== 'home') return;
  await loadOnline(true);
  if (currentView() !== 'home') return;
  renderTiles();
  const cards = builtinCards();
  try {
    const r = await api.list({ kind: '3d', sort: 'top' });
    for (const g of r.games.slice(0, 4)) cards.push(playerWorldCard(g));
  } catch (e) { /* only built-ins */ }
  $('#home-worlds').replaceChildren(...cards);
  try {
    const r = await api.list({ sort: 'new' });
    const games = (r.games || []).slice(0, 4);
    if (games.length) {
      $('#home-new').replaceChildren(...games.map(publishedCard).filter(Boolean));
      $('#home-online').hidden = false;
    }
  } catch (e) { /* leave it hidden */ }
}
function renderTiles(onlineInfo) {
  const next = MAP[nextLevelIndex()];
  const d = progress.data.daily[todayUTC()];
  const w = progress.wallet;
  const tile = (title, sub, go_, cls) => el('button', { class: 'tile ' + (cls || ''), type: 'button', 'data-go': go_ }, el('span', { class: 'tile-title' }, title), el('span', { class: 'tile-sub' }, sub));
  $('#home-tiles').replaceChildren(
    tile('Continue', `Level ${nextLevelIndex() + 1}: ${next.n}`, '#/play/' + next.id, 'tile-grass'),
    tile('Daily challenge', d && d.won ? 'Cleared today!' : 'Clear it for 30 coins', '#/daily', 'tile-sun'),
    tile('Endless Rush', progress.data.stats.endlessBest ? `Best ${Math.floor(progress.data.stats.endlessBest)} m` : 'How far can you go?', '#/endless', 'tile-night'),
    tile('Shop', w ? `${w.coins} coins to spend` : 'Hats, colors and trails', '#/closet', 'tile-pink'));
}
$('#hero-play').addEventListener('click', () => go('#/play'));

/* ---------- title screen: Pip runs forever ---------- */
function startTitle() {
  cancelAnimationFrame(titleRaf);
  const cv = $('#title-canvas'), c = cv.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t0 = performance.now();
  const spikeAt = (i) => i > 10 && i % 3 === 0 && ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 < 0.5;
  const tick = (now) => {
    if (currentView() !== 'home') return;
    const eq = progress.data.equip;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) { titleRaf = requestAnimationFrame(tick); return; }
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = still ? 2 : (now - t0) / 1000;
    const T = 32, scroll = t * 190, groundY = H - 64;
    drawBackground(c, 'meadow', scroll, 0, W, H, t);
    const px = Math.max(W * 0.5, Math.min(W * 0.66, W - 120));
    const worldPx = scroll + px;
    let lift = 0, air = false;
    const i0 = Math.floor(worldPx / T);
    for (let i = i0 - 5; i <= i0 + 5; i++) {
      if (!spikeAt(i)) continue;
      const dd = worldPx - (i * T + 16 - 70);
      if (dd > 0 && dd < 140) { lift = Math.sin(Math.PI * dd / 140) * 78; air = true; }
    }
    const first = Math.floor(scroll / T) - 1, last = first + Math.ceil(W / T) + 2;
    for (let i = first; i <= last; i++) {
      const x = i * T - scroll;
      drawTile(c, '#', x, groundY, () => '.', t, 'meadow', 'game');
      drawTile(c, '#', x, groundY + T, () => '#', t, 'meadow', 'game');
      if (spikeAt(i)) {
        drawTile(c, '^', x, groundY - T, () => '.', t, 'meadow', 'game');
        if (i * T + 16 > worldPx) drawTile(c, 'o', x, groundY - T * 3.3, () => '.', t, 'meadow', 'game');
      }
    }
    c.save();
    const size = 40;
    c.translate(px, groundY - lift - size / 2 - size * 0.14);
    drawPip(c, size, eq.color, { t, look: 1, run: 1, air, mouth: air ? 'open' : 'smile', sy: air ? 1.06 : 1, sx: air ? 0.95 : 1, hat: eq.hat });
    c.restore();
    if (!still) titleRaf = requestAnimationFrame(tick);
  };
  titleRaf = requestAnimationFrame(tick);
}

addRoute(/^#\/?$/, () => showHome());
defaultRoute(() => showHome());
