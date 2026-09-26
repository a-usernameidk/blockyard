// The 2D side: the level map, playing levels, Endless Rush, the daily challenge and player levels.
import { $, $$, el, session, show, go, addRoute, ask, toast, openModal, needLogin, pipCanvas, paintCanvas, plural, onLeave } from '../app.js';
import { normalizeLevel, decodeShare, countTiles, LIMITS } from '../format.js';
import { BUILTIN, WORLDS } from '../levels.js';
import { drawThumb, thumbWindow, drawBackground, drawTile } from '../render2d.js';
import { drawPip, drawForm, iconCanvas } from '../art.js';
import { startPlay, stopPlay } from '../play2d.js';
import { endlessCourse, dailyCourse, todayUTC } from '../endless.js';
import { store, mine, newId, api, isOnline } from '../api.js';
import { progress } from '../progress.js';
import { setWallet, openAccount } from './account.js';
import { starsFor, diffName, diffClass } from '../stars.js';

onLeave('play', () => stopPlay());

/* ---------------- cards ---------------- */
export function styleTag(style) { return el('span', { class: 'tag tag-' + style }, style === 'rush' ? 'Rush' : 'Adventure'); }
export function thumb(lv) {
  const cv = document.createElement('canvas');
  drawThumb(cv, thumbWindow(lv, Math.max(30, Math.min(lv.w, lv.h * 2.5 | 0))), 5);
  cv.setAttribute('aria-hidden', 'true');
  return cv;
}
export function bestText(key, lv) {
  const b = progress.level(key);
  if (!b) return null;
  if (b.won) return lv.style === 'rush' ? 'Beaten' : `Best ${b.time}s`;
  return b.progress ? `Best ${Math.round(b.progress * 100)}%` : null;
}
// the difficulty rating: "4★ Normal" (nothing when unrated)
export function diffTag(n) { return n ? el('span', { class: 'tag tag-diff ' + diffClass(n), title: `Beat it to earn ${n} difficulty stars` }, diffFace(n, 20), `${n}★ ${diffName(n)}`) : null; }
// the difficulty face picture (Easy, Normal, Hard, Harder, Insane, Demon)
export function diffFace(n, size = 48) { return n ? el('img', { class: 'diff-face', src: `img/faces/${diffName(n).toLowerCase()}.png`, alt: diffName(n), width: String(size), height: String(size), draggable: 'false' }) : null; }
export function card(lv, { meta = [], text, by, actions, reward, stars }) {
  const coins = countTiles(lv.d, 'o');
  const metaEl = el('div', { class: 'card-meta' }, styleTag(lv.style), ...meta.filter(Boolean).map((m) => el('span', { class: 'tag' }, m)));
  if (coins) metaEl.append(el('span', { class: 'tag' }, `${coins} coins inside`));
  if (reward) metaEl.prepend(el('span', { class: 'tag tag-pay' }, `Pays ${reward} coins`));
  if (stars) metaEl.prepend(diffTag(stars));
  return el('article', { class: 'card' }, thumb(lv),
    el('div', { class: 'card-body' },
      el('div', {}, el('h3', {}, lv.n), by || null, text ? el('p', {}, text) : null, metaEl),
      el('div', { class: 'row' }, ...actions.map(([label, cls, fn]) => el('button', { class: 'btn ' + cls, type: 'button', onclick: fn }, label)))));
}
export function remixOf(lv) {
  return { ...lv, id: newId(), n: (lv.n + ' remix').slice(0, LIMITS.name), by: 'You', pubId: undefined, editKey: undefined, proof: undefined, desc: undefined, project: undefined };
}
let remixHandler = null;
export function onRemix(fn) { remixHandler = fn; }
export const editLevel = (lv) => remixHandler && remixHandler(lv);

/* ---------------- the level map ---------------- */
export const MAP = WORLDS.flatMap((w) => w.ids).map((id) => BUILTIN.find((b) => b.id === id)).filter(Boolean);
const worldOf = (i) => { let n = i; for (const w of WORLDS) { if (n < w.ids.length) return { name: w.name, n: n + 1 }; n -= w.ids.length; } return { name: '', n: i + 1 }; };
const beaten = (id) => { const b = progress.level(id); return !!(b && b.won); };
// open when the one before is beaten (or you already beat this one or a later one, so new levels never lock old ones)
const unlocked = (i) => i === 0 || beaten(MAP[i - 1].id) || MAP.slice(i).some((lv) => beaten(lv.id));
export function nextLevelIndex() { const i = MAP.findIndex((lv, k) => unlocked(k) && !beaten(lv.id)); return i < 0 ? 0 : i; }
let selected = -1;

export function showLevels() {
  show('levels', 'play');
  renderMap();
  renderModeBits();
}
function renderModeBits() {
  const s = progress.data.stats;
  $('#sub-endless').textContent = s.endlessBest ? `Best: ${Math.floor(s.endlessBest)} m` : 'How far can you go?';
  const d = progress.data.daily[todayUTC()];
  $('#sub-daily').textContent = d ? (d.won ? 'Cleared today!' : `Today's best: ${Math.floor(d.best * 100)}%`) : 'A new course every day. +30 coins';
  const eq = progress.data.equip;
  const paint = (id, fn) => paintCanvas($(id), fn);
  paint('#art-endless', (c, W, H) => {
    drawBackground(c, 'night', 0, 0, W, H, 1);
    for (let x = 0; x < W; x += 32) drawTile(c, '#', x, H - 22, () => '.', 0, 'night');
    drawTile(c, '^', W * 0.62, H - 54, () => '.', 0, 'night'); drawTile(c, '^', W * 0.62 + 32, H - 54, () => '.', 0, 'night');
    c.save(); c.translate(W * 0.36, H * 0.42); c.rotate(-0.25); drawForm(c, 'jet', 30, eq.color, { t: 1, air: true, hat: eq.hat }); c.restore();
  });
  paint('#art-daily', (c, W, H) => {
    drawBackground(c, 'dunes', 0, 0, W, H, 1);
    for (let x = 0; x < W; x += 32) drawTile(c, '#', x, H - 22, () => '.', 0, 'dunes');
    for (let y = H - 22 - 32 * 3; y < H - 22; y += 32) drawTile(c, 'G', W * 0.66, y, (dx, dy) => (dy === -1 && y > H - 22 - 32 * 3) || (dy === 1 && y < H - 54) ? 'G' : '.', 1, 'dunes');
    c.save(); c.translate(W * 0.34, H - 22 - 20); drawPip(c, 30, eq.color, { t: 1, look: 1, hat: eq.hat, mouth: 'open' }); c.restore();
  });
  paint('#art-shop', (c, W, H) => {
    drawBackground(c, 'meadow', 0, 0, W, H, 1);
    for (let x = 0; x < W; x += 32) drawTile(c, '#', x, H - 22, () => '.', 0, 'meadow');
    [['#ff5d8f', 'party'], ['#3a86ff', 'cap'], ['#44c06a', 'sprout']].forEach(([col, hat], i) => { c.save(); c.translate(W * (0.25 + i * 0.25), H - 22 - 16); drawPip(c, 24, col, { t: 1 + i, look: i - 1, hat }); c.restore(); });
  });
}
function starRow(stars, size = 14) {
  const row = el('span', { class: 'mini-stars' });
  for (const on of stars) { const cv = iconCanvas('star', size); if (!on) cv.classList.add('off'); row.append(cv); }
  return row;
}
function renderMap() {
  const map = $('#map'); map.innerHTML = '';
  if (selected < 0) selected = nextLevelIndex();
  const road = document.createElement('canvas'); road.className = 'map-road'; road.setAttribute('aria-hidden', 'true');
  map.append(road);
  const nodes = MAP.map((lv, i) => {
    const open = unlocked(i), done = beaten(lv.id);
    const w = worldOf(i);
    const b = el('button', { class: `node node-${lv.style}${open ? '' : ' locked'}${done ? ' done' : ''}${i === selected ? ' sel' : ''}${w.n === 1 ? ' world-start' : ''}`, type: 'button', 'data-world': w.name, 'aria-label': `${w.name} level ${w.n}: ${lv.n}${open ? '' : ' (locked)'}` },
      open ? el('span', { class: 'node-n' }, String(i + 1)) : iconCanvas('lock', 26));
    if (open) { const sr = starRow(progress.stars(lv.id), 13); sr.classList.add('node-stars'); b.append(sr); }
    b.addEventListener('click', () => { selected = i; renderMap(); });
    map.append(b);
    return b;
  });
  $('#map-count').textContent = `${progress.totalStars()} of ${progress.maxStars()} stars`;
  layoutMap(map, road, nodes);
  renderDetail();
}
function layoutMap(map, road, nodes) {
  const W = map.clientWidth || 800;
  const cols = W < 560 ? 4 : 7, rows = Math.ceil(nodes.length / cols);
  const rowH = 118, pad = 46;
  map.style.height = rows * rowH + 24 + 'px';
  const pts = nodes.map((n, i) => {
    const r = Math.floor(i / cols), c = i % cols, cc = r % 2 ? cols - 1 - c : c;
    const x = pad + (cols === 1 ? 0 : cc * (W - pad * 2) / (cols - 1));
    const y = 58 + r * rowH + (c % 2 ? 14 : -8);
    n.style.left = x + 'px'; n.style.top = y + 'px';
    return { x, y };
  });
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  road.width = W * dpr; road.height = parseInt(map.style.height, 10) * dpr;
  road.style.width = W + 'px'; road.style.height = map.style.height;
  const c = road.getContext('2d'); c.scale(dpr, dpr);
  for (const [w, col, dash] of [[18, '#1d2340', []], [12, '#f6d98a', []], [3, '#c9a24c', [8, 10]]]) {
    c.lineWidth = w; c.strokeStyle = col; c.setLineDash(dash); c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; c.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y, b.y) - 18, b.x, b.y); }
    c.stroke();
  }
}
new ResizeObserver(() => {
  const map = $('#map'), road = map.querySelector('.map-road');
  if (road && !$('#view-levels').hidden) layoutMap(map, road, [...map.querySelectorAll('.node')]);
}).observe($('#map'));

function starGoals(lv) {
  const coins = countTiles(lv.d, 'o');
  return ['Beat it', coins ? `Grab all ${coins} coins in one run` : 'Beat it without falling', lv.style === 'rush' ? 'Beat it without dying' : `Beat it in under ${lv.par} seconds`];
}
function renderDetail() {
  const lv = MAP[selected], box = $('#map-detail'); box.innerHTML = '';
  if (!lv) return;
  const open = unlocked(selected), w = worldOf(selected);
  const cv = document.createElement('canvas');
  drawThumb(cv, thumbWindow(lv, Math.max(30, Math.min(lv.w, lv.h * 2.5 | 0))), 5);
  const best = bestText(lv.id, lv);
  const got = progress.stars(lv.id);
  const goals = el('ul', { class: 'goals' }, ...starGoals(lv).map((g, i) => el('li', { class: got[i] ? 'got' : '' }, iconCanvas('star', 18), g, el('span', { class: 'goal-pay' }, '+10'))));
  box.append(el('div', { class: 'detail-thumb' + (open ? '' : ' dim') }, cv, diffFace(starsFor(lv.id), 56)), el('div', { class: 'detail-info' },
    el('p', { class: 'detail-kicker' }, `${w.name}, level ${w.n}`),
    el('h3', {}, lv.n),
    el('p', {}, open ? lv.blurb : `Beat ${MAP[selected - 1].n} to unlock this one.`),
    el('div', { class: 'card-meta' }, diffTag(starsFor(lv.id)), styleTag(lv.style), best ? el('span', { class: 'tag' }, best) : null),
    open ? goals : null,
    el('div', { class: 'row' },
      open ? el('button', { class: 'btn btn-grass btn-big', type: 'button', onclick: () => go('#/play/' + lv.id) }, beaten(lv.id) ? 'Play again' : 'Play') : null,
      open ? el('button', { class: 'btn', type: 'button', onclick: () => editLevel(remixOf(lv)) }, 'Remix in editor') : null)));
}

/* ---------------- playing ---------------- */
let backTo = '#/play';
export function playLevel(lv, o) {
  backTo = o.back || '#/play';
  show('play', o.nav || 'play');
  startPlay(lv, {
    key: o.key, by: o.by, mode: o.mode, dailyBest: o.dailyBest,
    onExit: () => (o.onExit ? o.onExit() : go(backTo)),
    onRemix: (level) => editLevel(remixOf(level)),
    onReport: o.pubId ? () => (session.user ? openReport(o.pubId) : needLogin("Reporting needs an account so one person can't spam reports.")) : null,
    onNext: o.onNext || null,
    onLike: o.pubId && o.online ? async () => {
      if (!session.user) { needLogin('Likes need an account, so every like is from a real player.'); throw new Error('login'); }
      await api.like(o.pubId); store.set('liked:' + o.pubId, true);
    } : null,
    liked: o.pubId ? store.get('liked:' + o.pubId, false) : false,
    onWin: o.onWin || ((r) => progress.finish(o.key, r, {})),
    onRunOver: o.onRunOver, onAttempt: o.onAttempt, onAgain: o.onAgain,
  });
}
// After the win screen shows, swap the guessed reward for the server's real answer.
function rewardLine(p, guess) {
  const line = $('#win-reward');
  if (!session.user) {
    if (guess) line.textContent = `+${guess} coins (log in to keep them)`;
    return;
  }
  line.textContent = 'Checking your run…';
  p.then((r) => {
    if (r.wallet) setWallet(r.wallet);
    const rated = r.rated ? ` +${r.rated}★ difficulty stars!` : '';
    line.textContent = (r.earned ? `+${r.earned} coins` : r.note || '') + rated;
  }).catch((e) => { line.textContent = e.message; });
}

export function playBuiltin(mi) {
  const lv = MAP[mi];
  playLevel(lv, {
    by: 'Blockyard', key: lv.id,
    onNext: MAP[mi + 1] ? () => { selected = mi + 1; go('#/play/' + MAP[mi + 1].id); } : null,
    onWin: (r) => {
      const res = progress.finish(lv.id, r, { builtin: true, par: lv.par, rush: lv.style === 'rush' });
      const goals = starGoals(lv);
      const missing = goals.filter((g, i) => !res.stars[i]);
      if (session.user) setTimeout(() => rewardLine(api.finish({ kind: 'level', id: lv.id, replay: r.replay }), 0), 0);
      else if (res.coinsEarned) setTimeout(() => rewardLine(null, res.coinsEarned), 0);
      return { ...res, coinsEarned: 0, goals: missing.length ? `Next star: ${missing[0].toLowerCase()}.` : 'All 3 stars!' };
    },
  });
}

export function playEndless() {
  const seed = Math.floor(Math.random() * 1e9);
  playLevel(endlessCourse(seed), {
    key: 'endless', mode: 'endless', by: 'Blockyard',
    onRunOver: ({ distance, coins, replay }) => {
      const res = progress.endless(distance, coins);
      if (session.user) setTimeout(() => rewardLine(api.finish({ kind: 'endless', seed, replay }), 0), 0);
      else if (!session.user && res.earned) setTimeout(() => rewardLine(null, res.earned), 0);
      return { ...res, earned: 0 };
    },
    onAgain: () => playEndless(),
  });
}

async function playPublished(id) {
  show('play', 'play');
  $('#play-title').textContent = 'Loading…';
  try {
    const { game } = await api.get(id);
    if (game.kind === '3d') { go('#/w/' + id); return; }
    const lv = normalizeLevel(game.level);
    playLevel(lv, {
      by: game.creator, key: 'p:' + id, pubId: id, online: true, back: '#/discover',
      onWin: (r) => {
        const res = progress.finish('p:' + id, r, {});
        // checked by the server even when it doesn't pay: it counts for quests
        if (session.user) setTimeout(() => rewardLine(api.finish({ kind: 'game', id, replay: r.replay }), 0), 0);
        else if (game.reward) setTimeout(() => { $('#win-reward').textContent = `Log in to earn ${game.reward} coins from this level.`; }, 0);
        return res;
      },
    });
    const seen = 'played:' + id;
    try { if (!sessionStorage.getItem(seen)) { sessionStorage.setItem(seen, '1'); api.play(id).catch(() => {}); } } catch (e) { /* ok */ }
  } catch (e) {
    go('#/play');
    toast(`That level didn't load. ${e.message}`);
  }
}

/* ---------------- report ---------------- */
let reportId = null;
export function openReport(id) { reportId = id; $('#rep-msg').textContent = ''; $('#rep-go').disabled = false; openModal('#report-modal'); }
$('#rep-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#rep-go').disabled = true;
  try { await api.report(reportId, $('#rep-reason').value); $('#rep-msg').textContent = 'Report sent. Thanks for helping keep Blockyard friendly.'; }
  catch (err) { $('#rep-msg').textContent = err.message; $('#rep-go').disabled = false; }
});

/* ---------------- player levels ---------------- */
const disc = { sort: 'new', style: '', q: '', creator: '', page: 0, busy: false };
async function showDiscover() {
  show('discover', 'play');
  const on = await isOnline();
  $('#disc-offline').hidden = on; $('#disc-main').hidden = !on;
  if (on) loadDiscover(true);
}
export function publishedCard(g) {
  let lv;
  try { lv = normalizeLevel(g.level); } catch (e) { return null; }
  const by = el('p', { class: 'by-line' }, 'by ', el('a', { class: 'linkish', href: '#/u/' + encodeURIComponent(g.creator) }, g.creator));
  return card(lv, {
    by, text: g.descr || null, reward: g.reward, stars: g.stars,
    meta: [plural(g.plays, 'play'), plural(g.likes, 'like'), bestText('p:' + g.id, lv)],
    actions: [['Play', 'btn-grass', () => go('#/p/' + g.id)], ['Remix', '', () => editLevel(remixOf(lv))]],
  });
}
async function loadDiscover(reset) {
  if (disc.busy) return;
  disc.busy = true;
  if (reset) { disc.page = 0; $('#disc-grid').innerHTML = ''; }
  $('#disc-creator').hidden = !disc.creator;
  $('#disc-creator-name').textContent = disc.creator;
  $('#disc-msg').textContent = 'Loading…';
  try {
    const r = await api.list({ ...disc, rewarding: disc.sort === 'reward' ? '1' : '' });
    for (const g of r.games) { const c = publishedCard(g); if (c) $('#disc-grid').append(c); }
    $('#disc-more').hidden = !r.more;
    $('#disc-msg').textContent = !r.games.length && reset ? (disc.q || disc.creator ? 'No levels match.' : disc.sort === 'reward' ? 'No levels pay coins right now. Admins pick great levels to pay out.' : disc.sort === 'rated' ? 'No rated levels yet. Admins give great levels a star rating.' : 'No levels yet. Build one and publish it to be the first.') : '';
  } catch (e) { $('#disc-msg').textContent = e.message; }
  disc.busy = false;
}
$$('[data-sort]').forEach((b) => b.addEventListener('click', () => {
  disc.sort = b.dataset.sort;
  $$('[data-sort]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  loadDiscover(true);
}));
$('#disc-style').addEventListener('change', (e) => { disc.style = e.target.value; loadDiscover(true); });
let qTimer = 0;
$('#disc-q').addEventListener('input', (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { disc.q = e.target.value.trim(); loadDiscover(true); }, 350); });
$('#disc-more').addEventListener('click', () => { disc.page++; loadDiscover(false); });
$('#disc-creator-clear').addEventListener('click', () => { disc.creator = ''; loadDiscover(true); });

$('#import-btn').addEventListener('click', () => {
  const raw = $('#import-input').value.trim(), msg = $('#import-msg');
  if (!raw) { msg.textContent = 'Paste a link or code first.'; return; }
  const pub = raw.match(/#\/p\/([A-Za-z0-9]+)/);
  if (pub) { go('#/p/' + pub[1]); return; }
  try {
    const lv = decodeShare(raw.includes('#g=') ? raw.split('#g=')[1] : raw);
    msg.textContent = '';
    playLevel(lv, { by: 'a friend', key: 'shared' });
  } catch (e) { msg.textContent = e.message; }
});
$('#import-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#import-btn').click(); });

/* ---------------- daily ---------------- */
async function showDaily() {
  show('daily', 'play');
  const date = todayUTC();
  const lv = dailyCourse(date);
  $('#daily-title').textContent = `Daily challenge: ${date}`;
  const msLeft = Date.parse(date + 'T00:00:00Z') + 86400e3 - Date.now();
  $('#daily-reset').textContent = `New course in ${Math.floor(msLeft / 3600e3)} h ${Math.floor(msLeft / 60e3) % 60} min`;
  drawThumb($('#daily-thumb'), thumbWindow(lv, 60), 5);
  const d = progress.data.daily[date];
  $('#daily-mine').textContent = d ? (d.won ? `You cleared it in ${plural(d.attempts, 'attempt')}.` : `Your best: ${Math.floor(d.best * 100)}% after ${plural(d.attempts, 'attempt')}.`) : 'Same course for everyone today. One life per attempt, as many attempts as you want. Clear it for 30 coins.';
  $('#daily-note').textContent = session.user ? 'Your best run goes on the board automatically.' : 'Playing as a guest. Log in to get on the board and earn coins.';
  $('#daily-play').onclick = () => playDaily(date);
  const board = $('#daily-board'), bmsg = $('#daily-board-msg');
  board.innerHTML = ''; bmsg.textContent = 'Loading…';
  if (!(await isOnline())) { bmsg.textContent = 'The board needs the online version of Blockyard.'; return; }
  try {
    const r = await api.daily(date);
    for (const row of r.top) {
      board.append(el('li', { class: session.user && row.name === session.user.name ? 'me' : '' },
        el('span', { class: 'rank' }, String(row.rank)), pipCanvas(34, { color: row.color, hat: row.hat }), el('a', { class: 'who linkish', href: '#/u/' + row.name }, row.name),
        el('span', { class: 'pct' }, row.won ? 'Cleared' : `${Math.floor(row.progress * 100)}%`)));
    }
    bmsg.textContent = !r.top.length ? 'Nobody is on the board yet. Be the first!' : r.me ? `You are #${r.me.rank} of ${r.players}.` : `${plural(r.players, 'player')} today.`;
  } catch (e) { bmsg.textContent = e.message; }
}
function playDaily(date) {
  const d = progress.data.daily[date];
  playLevel(dailyCourse(date), {
    key: 'daily:' + date, mode: 'daily', by: 'Blockyard', back: '#/daily', dailyBest: d ? d.best : 0,
    onAttempt: (r) => {
      const res = progress.daily(date, r.progress, r.won);
      if ((res.newBest || r.won) && session.user && session.online) {
        const p = api.postDaily(date, r.replay);
        if (r.won) setTimeout(() => rewardLine(p, 0), 0);
        else p.catch(() => {});
      }
      return { ...res, earned: 0 };
    },
  });
}

/* ---------------- routes ---------------- */
addRoute(/^#\/play$/, () => showLevels());
addRoute(/^#\/discover$/, () => showDiscover());
addRoute(/^#\/daily$/, () => showDaily());
addRoute(/^#\/endless$/, () => playEndless());
addRoute(/^#\/p\/([A-Za-z0-9]+)$/, (m) => playPublished(m[1]));
addRoute(/^#g=(.+)$/, (m) => {
  try { playLevel(decodeShare(m[1]), { by: 'a friend', key: 'shared' }); }
  catch (e) { go('#/play'); toast("That share link didn't load. It might be cut off."); }
});
addRoute(/^#\/play\/(.+)$/, (m) => {
  const id = decodeURIComponent(m[1]);
  const mi = MAP.findIndex((x) => x.id === id);
  const local = mi < 0 ? mine.get(id) : null;
  if (mi >= 0 && !unlocked(mi)) { selected = mi; showLevels(); }
  else if (mi >= 0) playBuiltin(mi);
  else if (local) playLevel(local, { by: 'you', key: local.id, back: '#/create' });
  else showLevels();
});
export { openAccount };
