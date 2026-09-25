// The app: pages, cards, sharing, publishing and the 3D beta.
import { normalizeLevel, encodeShare, decodeShare, isRude, cleanText, LIMITS, countTiles } from './format.js';
import { BUILTIN } from './levels.js';
import { drawThumb, thumbWindow, drawBackground, drawTile } from './render2d.js';
import { drawPip, iconCanvas } from './art.js';
import { startPlay, stopPlay } from './play2d.js';
import { openEditor, closeEditor, currentLevel, validate, setMsg, updateMeta, newLevel, getDraft } from './editor.js';
import { start3D } from './engine3d.js';
import { skyObby, randomObby } from './levels3d.js';
import { store, mine, newId, profile, PLAYER_COLORS, bests, api, isOnline } from './api.js';
import { isMuted, setMuted, unlockAudio, isMusicOn, setMusicOn, stopMusic } from './audio.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* ================= navigation ================= */
const VIEWS = ['home', 'discover', 'play', 'edit', '3d'];
let current = '';
let game3d = null;

function show(name, nav) {
  if (current === 'play' && name !== 'play') stopPlay();
  if (current === '3d' && name !== '3d') stop3D();
  if (current === 'edit' && name !== 'edit' && !testing) closeEditor();
  current = name;
  for (const v of VIEWS) $('#view-' + v).hidden = v !== name;
  $$('[data-nav]').forEach((b) => { if (b.dataset.nav === (nav || name)) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  scrollTo(0, 0);
}

function go(hash) {
  try { if (location.hash !== hash) history.pushState(null, '', hash); } catch (e) { /* some embedded previews block this */ }
  route(hash);
}
addEventListener('popstate', () => route());
addEventListener('hashchange', () => { if (location.hash !== lastRoute) route(); });

let lastRoute = null;
let testing = false;
async function route(to) {
  const h = to || location.hash || '#/';
  lastRoute = h;
  testing = false;
  if (h.startsWith('#g=')) {
    try { playLevel(decodeShare(h.slice(3)), { by: 'a friend', key: 'shared' }); }
    catch (e) { showHome(); $('#import-msg').textContent = "That share link didn't load. It might be cut off."; }
  } else if (h === '#/discover') showDiscover();
  else if (h === '#/create') openCreate();
  else if (h === '#/3d') show3DView();
  else if (h.startsWith('#/play/')) {
    const id = decodeURIComponent(h.slice(7));
    const b = BUILTIN.find((x) => x.id === id);
    const m = b ? null : mine.get(id);
    const mi = b ? MAP.indexOf(b) : -1;
    if (b && mi >= 0 && !unlocked(mi)) { selected = mi; showHome(); }
    else if (b) playLevel(b, { by: 'Blockyard', key: b.id, builtin: true, onNext: MAP[mi + 1] ? () => { selected = mi + 1; go('#/play/' + MAP[mi + 1].id); } : null });
    else if (m) playLevel(m, { by: 'you', key: m.id });
    else showHome();
  } else if (h.startsWith('#/p/')) playPublished(decodeURIComponent(h.slice(4)));
  else showHome();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-go]');
  if (!t) return;
  e.preventDefault();
  go(t.dataset.go);
});

/* ================= little helpers ================= */
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const k in props) {
    if (k === 'class') n.className = props[k];
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), props[k]);
    else n.setAttribute(k, props[k]);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
}
function openModal(id) {
  const m = $(id); m.hidden = false;
  const f = m.querySelector('input:not([readonly]), select, button');
  if (f) setTimeout(() => f.focus(), 30);
}
function closeModal(m) { m.hidden = true; }
document.addEventListener('click', (e) => { const c = e.target.closest('[data-close]'); if (c) closeModal(c.closest('.modal')); });
$$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); }));
addEventListener('keydown', (e) => { if (e.key === 'Escape') { const m = $$('.modal').find((x) => !x.hidden); if (m) { e.stopImmediatePropagation(); closeModal(m); } } }, true);

// A yes/no (or pick one) box, since pop-up dialogs don't work everywhere.
function ask(title, text, buttons) {
  return new Promise((resolve) => {
    $('#ask-h').textContent = title; $('#ask-text').textContent = text;
    const row = $('#ask-buttons'); row.innerHTML = '';
    const done = (v) => { $('#ask-modal').hidden = true; resolve(v); };
    for (const b of buttons) row.append(el('button', { class: 'btn ' + (b.cls || ''), type: 'button', onclick: () => done(b.value) }, b.label));
    row.append(el('button', { class: 'btn', type: 'button', onclick: () => done(null) }, 'Cancel'));
    openModal('#ask-modal');
  });
}

async function copyText(text, btn, label) {
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
  catch (e) { btn.textContent = 'Select and copy it'; }
  setTimeout(() => { btn.textContent = label; }, 1800);
}
const siteBase = () => location.href.split('#')[0];

/* ================= profile + sound ================= */
function renderMe() {
  const p = profile.get();
  $('#me-dot').style.background = p.color;
  $('#me-name').textContent = p.name || 'Set name';
}
$('#me-btn').addEventListener('click', () => {
  const p = profile.get();
  $('#prof-name').value = p.name;
  $('#prof-msg').textContent = '';
  const wrap = $('#prof-colors'); wrap.innerHTML = '';
  for (const c of PLAYER_COLORS) {
    wrap.append(el('button', {
      type: 'button', class: 'swatch', style: `background:${c}`, 'aria-label': 'Color ' + c, 'aria-pressed': String(c === p.color), 'data-color': c,
      onclick: (e) => $$('.swatch').forEach((s) => s.setAttribute('aria-pressed', String(s === e.currentTarget))),
    }));
  }
  openModal('#profile-modal');
});
$('#prof-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = cleanText($('#prof-name').value, LIMITS.creator);
  if (name && isRude(name)) { $('#prof-msg').textContent = 'Pick a different nickname. That one has a blocked word in it.'; return; }
  const color = ($$('.swatch').find((s) => s.getAttribute('aria-pressed') === 'true') || {}).dataset?.color || profile.get().color;
  profile.set({ name, color });
  renderMe(); closeModal($('#profile-modal'));
});
function renderMute() {
  const m = isMuted(), mu = isMusicOn();
  $('#mute').replaceChildren(iconCanvas(m ? 'mute' : 'sound', 24)); $('#mute').setAttribute('aria-pressed', String(!m)); $('#mute').title = m ? 'Sound effects off' : 'Sound effects on';
  $('#music').replaceChildren(iconCanvas(mu ? 'music' : 'music-off', 24)); $('#music').setAttribute('aria-pressed', String(mu)); $('#music').title = mu ? 'Music on' : 'Music off';
}
$('#mute').addEventListener('click', () => { setMuted(!isMuted()); renderMute(); unlockAudio(); });
$('#music').addEventListener('click', () => { setMusicOn(!isMusicOn()); renderMute(); unlockAudio(); });
$$('[data-icon]').forEach((b) => b.append(iconCanvas(b.dataset.icon, 30, '#fff')));
addEventListener('pointerdown', unlockAudio, { once: true });

/* ================= cards ================= */
function styleTag(style) { return el('span', { class: 'tag tag-' + style }, style === 'rush' ? 'Rush' : 'Adventure'); }
function thumb(lv) {
  const cv = document.createElement('canvas');
  drawThumb(cv, thumbWindow(lv, Math.max(30, Math.min(lv.w, lv.h * 2.5 | 0))), 5);
  cv.setAttribute('aria-hidden', 'true');
  return cv;
}
function bestText(key, lv) {
  const b = bests.get(key);
  if (!b) return null;
  if (b.won) return lv.style === 'rush' ? 'Beaten' : `Best ${b.time}s`;
  return `Best ${Math.round(b.progress * 100)}%`;
}
function card(lv, { meta = [], text, actions }) {
  const coins = countTiles(lv.d, 'o');
  const metaEl = el('div', { class: 'card-meta' }, styleTag(lv.style), ...meta.filter(Boolean).map((m) => el('span', { class: 'tag' }, m)));
  if (coins) metaEl.append(el('span', { class: 'tag' }, `${coins} coins`));
  return el('article', { class: 'card' }, thumb(lv),
    el('div', { class: 'card-body' },
      el('div', {}, el('h3', {}, lv.n), text ? el('p', {}, text) : null, metaEl),
      el('div', { class: 'row' }, ...actions.map(([label, cls, fn]) => el('button', { class: 'btn ' + cls, type: 'button', onclick: fn }, label)))));
}

function remixOf(lv) {
  return { ...lv, id: newId(), n: (lv.n + ' remix').slice(0, LIMITS.name), by: 'You', pubId: undefined, editKey: undefined };
}
function editLevel(lv) { store.set('draft', lv); go('#/create'); }

/* ================= home ================= */
const MAP_ORDER = ['b-grassy', 'b-rush', 'b-spike', 'b-keep', 'b-jet', 'b-sky', 'b-tower', 'b-party'];
const MAP = MAP_ORDER.map((id) => BUILTIN.find((b) => b.id === id)).filter(Boolean);
const beaten = (id) => { const b = bests.get(id); return !!(b && b.won); };
const unlocked = (i) => i === 0 || beaten(MAP[i - 1].id);
function nextLevelIndex() { const i = MAP.findIndex((lv, k) => unlocked(k) && !beaten(lv.id)); return i < 0 ? 0 : i; }
let selected = -1;

function showHome() {
  show('home');
  renderMap();
  renderThree();
  renderMine();
  renderHomeOnline();
  startTitle();
}

function renderMap() {
  const map = $('#map'); map.innerHTML = '';
  if (selected < 0) selected = nextLevelIndex();
  const road = document.createElement('canvas'); road.className = 'map-road'; road.setAttribute('aria-hidden', 'true');
  map.append(road);
  const nodes = MAP.map((lv, i) => {
    const open = unlocked(i), done = beaten(lv.id);
    const b = el('button', { class: `node node-${lv.style}${open ? '' : ' locked'}${done ? ' done' : ''}${i === selected ? ' sel' : ''}`, type: 'button', 'aria-label': `${i + 1}. ${lv.n}${open ? '' : ' (locked)'}${done ? ' (beaten)' : ''}` },
      open ? el('span', { class: 'node-n' }, String(i + 1)) : iconCanvas('lock', 26));
    if (done) { const st = iconCanvas('star', 22); st.classList.add('node-star'); b.append(st); }
    b.addEventListener('click', () => { selected = i; renderMap(); });
    map.append(b);
    return b;
  });
  $('#map-count').textContent = `${MAP.filter((lv) => beaten(lv.id)).length} of ${MAP.length} beaten`;
  layoutMap(map, road, nodes);
  renderDetail();
}
function layoutMap(map, road, nodes) {
  const W = map.clientWidth || 800;
  const cols = W < 560 ? 4 : 8, rows = Math.ceil(nodes.length / cols);
  const rowH = 110, pad = 44;
  map.style.height = rows * rowH + 20 + 'px';
  const pts = nodes.map((n, i) => {
    const r = Math.floor(i / cols), c = i % cols, cc = r % 2 ? cols - 1 - c : c;
    const x = pad + (cols === 1 ? 0 : cc * (W - pad * 2) / (cols - 1));
    const y = 60 + r * rowH + (c % 2 ? 16 : -10);
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
  if (current !== 'home') return;
  const map = $('#map'), road = map.querySelector('.map-road');
  if (road) layoutMap(map, road, [...map.querySelectorAll('.node')]);
}).observe($('#map'));

function renderDetail() {
  const lv = MAP[selected], box = $('#map-detail'); box.innerHTML = '';
  if (!lv) return;
  const open = unlocked(selected);
  const cv = document.createElement('canvas');
  drawThumb(cv, thumbWindow(lv, Math.max(30, Math.min(lv.w, lv.h * 2.5 | 0))), 5);
  const best = bestText(lv.id, lv);
  box.append(el('div', { class: 'detail-thumb' + (open ? '' : ' dim') }, cv), el('div', { class: 'detail-info' },
    el('p', { class: 'detail-kicker' }, `Level ${selected + 1}`),
    el('h3', {}, lv.n),
    el('p', {}, open ? lv.blurb : `Beat ${MAP[selected - 1].n} to unlock this one.`),
    el('div', { class: 'card-meta' }, styleTag(lv.style), best ? el('span', { class: 'tag' }, best) : null),
    el('div', { class: 'row' },
      open ? el('button', { class: 'btn btn-grass btn-big', type: 'button', onclick: () => go('#/play/' + lv.id) }, beaten(lv.id) ? 'Play again' : 'Play') : null,
      open ? el('button', { class: 'btn', type: 'button', onclick: () => editLevel(remixOf(lv)) }, 'Remix in editor') : null)));
}

function renderThree() {
  const grid = $('#three-grid'); grid.innerHTML = '';
  const cv = document.createElement('canvas'); cv.width = 500; cv.height = 200;
  draw3dThumb(cv);
  grid.append(el('article', { class: 'card card-3d' }, cv,
    el('div', { class: 'card-body' },
      el('div', {}, el('h3', {}, 'Sky Obby'), el('p', {}, 'An early look at 3D. Jump across floating blocks to the gold goal.'),
        el('div', { class: 'card-meta' }, el('span', { class: 'tag tag-3d' }, '3D beta'))),
      el('div', { class: 'row' }, el('button', { class: 'btn btn-grass', type: 'button', onclick: () => go('#/3d') }, 'Play')))));
}

/* ---------- title screen: Pip runs forever ---------- */
let titleRaf = 0;
function startTitle() {
  cancelAnimationFrame(titleRaf);
  const cv = $('#title-canvas'), c = cv.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const color = profile.get().color;
  const t0 = performance.now();
  const spikeAt = (i) => i > 10 && i % 3 === 0 && ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 < 0.5;
  const tick = (now) => {
    if (current !== 'home') return;
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
      const d = worldPx - (i * T + 16 - 70);
      if (d > 0 && d < 140) { lift = Math.sin(Math.PI * d / 140) * 78; air = true; }
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
    drawPip(c, size, color, { t, look: 1, run: 1, air, mouth: air ? 'open' : 'smile', sy: air ? 1.06 : 1, sx: air ? 0.95 : 1 });
    c.restore();
    if (!still) titleRaf = requestAnimationFrame(tick);
  };
  titleRaf = requestAnimationFrame(tick);
}

function draw3dThumb(cv) {
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 200); g.addColorStop(0, '#7cc8ff'); g.addColorStop(1, '#d6efff');
  c.fillStyle = g; c.fillRect(0, 0, 500, 200);
  const cube = (x, y, s, top, left, right) => {
    c.lineWidth = 2; c.strokeStyle = '#1d2340';
    c.fillStyle = top; c.beginPath(); c.moveTo(x, y); c.lineTo(x + s, y - s / 2); c.lineTo(x + 2 * s, y); c.lineTo(x + s, y + s / 2); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = left; c.beginPath(); c.moveTo(x, y); c.lineTo(x + s, y + s / 2); c.lineTo(x + s, y + 1.5 * s); c.lineTo(x, y + s); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = right; c.beginPath(); c.moveTo(x + 2 * s, y); c.lineTo(x + s, y + s / 2); c.lineTo(x + s, y + 1.5 * s); c.lineTo(x + 2 * s, y + s); c.closePath(); c.fill(); c.stroke();
  };
  cube(40, 130, 34, '#5fc76b', '#b27a45', '#8f5f35');
  cube(150, 110, 30, '#9aa3bc', '#747c98', '#5f6680');
  cube(250, 90, 30, '#cc8f4f', '#a86d35', '#8a5a2c');
  cube(345, 70, 30, '#ff6b8f', '#a8456b', '#7a3350');
  cube(430, 45, 26, '#ffd23f', '#d9a520', '#b8871a');
}

function renderMine() {
  const wrap = $('#mine-wrap'); wrap.innerHTML = '';
  const list = mine.list();
  if (!list.length) {
    wrap.append(el('div', { class: 'empty' }, el('p', {}, 'Nothing here yet. Build a level and press Save to see it here.'), el('button', { class: 'btn btn-sun', type: 'button', 'data-go': '#/create' }, 'Build a level')));
    return;
  }
  const grid = el('div', { class: 'grid' });
  for (const lv of list) {
    grid.append(card(lv, {
      meta: [lv.pubId ? 'Published' : null, bestText(lv.id, lv)],
      actions: [
        ['Play', 'btn-grass', () => go('#/play/' + lv.id)],
        ['Edit', '', () => editLevel(lv)],
        ['Delete', 'btn-danger', () => deleteMine(lv)],
      ],
    }));
  }
  wrap.append(grid);
}
async function deleteMine(lv) {
  const buttons = [{ label: 'Delete', value: 'local', cls: 'btn-danger' }];
  if (lv.pubId && lv.editKey) buttons.push({ label: 'Delete here and from Discover', value: 'all', cls: 'btn-danger' });
  const pick = await ask(`Delete "${lv.n}"?`, lv.pubId ? 'This level is published. You can remove it from this browser only, or from Discover too.' : "This can't be undone.", buttons);
  if (!pick) return;
  if (pick === 'all') {
    try { await api.remove(lv.pubId, lv.editKey); } catch (e) { await ask("Couldn't remove it from Discover", e.message, []); return; }
  }
  mine.remove(lv.id);
  renderMine();
}

async function renderHomeOnline() {
  const on = await isOnline();
  if (!on || current !== 'home') return;
  try {
    const r = await api.list({ sort: 'new' });
    const games = (r.games || []).slice(0, 4);
    if (!games.length) return;
    const grid = $('#home-new'); grid.innerHTML = '';
    for (const g of games) { const c = publishedCard(g); if (c) grid.append(c); }
    $('#home-online').hidden = false;
  } catch (e) { /* leave it hidden */ }
}

$('#hero-play').addEventListener('click', () => go('#/play/' + MAP[nextLevelIndex()].id));

$('#import-btn').addEventListener('click', () => {
  const raw = $('#import-input').value.trim(), msg = $('#import-msg');
  if (!raw) { msg.textContent = 'Paste a link or code first.'; return; }
  const pub = raw.match(/#\/p\/([A-Za-z0-9]+)/);
  if (pub) { go('#/p/' + pub[1]); return; }
  try {
    const code = raw.includes('#g=') ? raw.split('#g=')[1] : raw;
    const lv = decodeShare(code);
    msg.textContent = '';
    playLevel(lv, { by: 'a friend', key: 'shared' });
  } catch (e) { msg.textContent = e.message; }
});
$('#import-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#import-btn').click(); });

/* ================= playing ================= */
let backTo = '#/';
function playLevel(lv, o) {
  backTo = testing ? null : (o.back || '#/');
  show('play', o.builtin ? 'home' : undefined);
  startPlay(lv, {
    key: o.key, by: o.by,
    onExit: () => { if (testing) { testing = false; show('edit', 'create'); } else go(backTo); },
    onRemix: (level) => editLevel(remixOf(level)),
    onReport: o.pubId ? () => openReport(o.pubId) : null,
    onNext: o.onNext || null,
    onLike: o.pubId && o.online ? () => api.like(o.pubId).then(() => store.set('liked:' + o.pubId, true)) : null,
    liked: o.pubId ? store.get('liked:' + o.pubId, false) : false,
  });
}

async function playPublished(id) {
  show('play', 'discover');
  $('#play-title').textContent = 'Loading…';
  try {
    const { game } = await api.get(id);
    const lv = normalizeLevel(game.level);
    playLevel(lv, { by: game.creator, key: 'p:' + id, pubId: id, online: true, back: '#/discover' });
    const seen = 'played:' + id;
    try { if (!sessionStorage.getItem(seen)) { sessionStorage.setItem(seen, '1'); api.play(id).catch(() => {}); } } catch (e) { /* ok */ }
  } catch (e) {
    showHome();
    $('#import-msg').textContent = `That online level didn't load. ${e.message}`;
  }
}

/* ================= report ================= */
let reportId = null;
function openReport(id) { reportId = id; $('#rep-msg').textContent = ''; $('#rep-go').disabled = false; openModal('#report-modal'); }
$('#rep-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#rep-go').disabled = true;
  try { await api.report(reportId, $('#rep-reason').value); $('#rep-msg').textContent = 'Report sent. Thanks for helping keep Blockyard friendly.'; }
  catch (err) { $('#rep-msg').textContent = err.message; $('#rep-go').disabled = false; }
});

/* ================= discover ================= */
const disc = { sort: 'new', style: '', q: '', page: 0, busy: false };
async function showDiscover() {
  show('discover');
  const on = await isOnline();
  $('#disc-offline').hidden = on; $('#disc-main').hidden = !on;
  if (on) loadDiscover(true);
}
function publishedCard(g) {
  let lv;
  try { lv = normalizeLevel(g.level); } catch (e) { return null; }
  return card(lv, {
    text: g.descr || `by ${g.creator}`,
    meta: [g.descr ? `by ${g.creator}` : null, `${g.plays} ${g.plays === 1 ? 'play' : 'plays'}`, `${g.likes} ${g.likes === 1 ? 'like' : 'likes'}`],
    actions: [['Play', 'btn-grass', () => go('#/p/' + g.id)], ['Remix', '', () => editLevel(remixOf({ ...lv, n: lv.n }))]],
  });
}
async function loadDiscover(reset) {
  if (disc.busy) return;
  disc.busy = true;
  if (reset) { disc.page = 0; $('#disc-grid').innerHTML = ''; }
  $('#disc-msg').textContent = 'Loading…';
  try {
    const r = await api.list(disc);
    for (const g of r.games) { const c = publishedCard(g); if (c) $('#disc-grid').append(c); }
    $('#disc-more').hidden = !r.more;
    $('#disc-msg').textContent = !r.games.length && reset ? (disc.q ? 'No levels match that search.' : 'No levels yet. Build one and press Publish to be the first.') : '';
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

/* ================= editor wiring ================= */
function openCreate() {
  show('edit', 'create');
  const draft = getDraft();
  let lv = null;
  if (draft) { try { lv = { ...draft, ...normalizeLevel(draft) }; } catch (e) { lv = { ...draft }; } }
  openEditor(lv && lv.d ? lv : newLevel('adventure'));
}
$('#ed-new').addEventListener('click', async () => {
  const pick = await ask('Start a new level?', 'Save first if you want to keep this one in Your games.', [
    { label: 'New Adventure level', value: 'adventure', cls: 'btn-grass' },
    { label: 'New Rush level', value: 'rush', cls: 'btn-sun' },
  ]);
  if (!pick) return;
  const lv = newLevel(pick);
  store.set('draft', lv);
  openEditor(lv);
});
$('#ed-test').addEventListener('click', () => {
  const err = validate();
  if (err) { setMsg(err); return; }
  testing = true;
  const lv = normalizeLevel(currentLevel());
  playLevel(lv, { key: 'test', by: 'you (testing)' });
});
$('#ed-save').addEventListener('click', () => {
  const lv = currentLevel();
  const err = validate();
  if (err) { setMsg(err + ' Saved as a draft for now.'); return; }
  setMsg(mine.save({ ...lv, by: 'You' }) ? 'Saved. It shows up under Your games.' : 'This browser blocked saving. Use Share to keep a copy of the code.');
});
$('#ed-share').addEventListener('click', () => {
  const err = validate();
  if (err) { setMsg(err); return; }
  const lv = currentLevel();
  const code = encodeShare(normalizeLevel(lv));
  $('#share-link').value = siteBase() + '#g=' + code;
  $('#share-code').value = code;
  $('#share-online').hidden = !lv.pubId;
  if (lv.pubId) $('#share-online-link').value = siteBase() + '#/p/' + lv.pubId;
  openModal('#share-modal');
  $('#share-link').select();
});
$('#share-copy').addEventListener('click', (e) => copyText($('#share-online').hidden ? $('#share-link').value : $('#share-online-link').value, e.currentTarget, 'Copy link'));
$('#share-copy-code').addEventListener('click', (e) => copyText($('#share-code').value, e.currentTarget, 'Copy code'));

/* ================= publish ================= */
let pubAsNew = false;
$('#ed-publish').addEventListener('click', async () => {
  const err = validate();
  if (err) { setMsg(err); return; }
  const lv = currentLevel();
  $('#pub-done').hidden = true; $('#pub-msg').textContent = '';
  const on = await isOnline();
  $('#pub-offline').hidden = on; $('#pub-form').hidden = !on;
  if (on) {
    $('#pub-name').value = lv.n;
    $('#pub-creator').value = profile.get().name;
    $('#pub-desc').value = lv.desc || '';
    const canUpdate = !!(lv.pubId && lv.editKey);
    $('#pub-go').textContent = canUpdate ? 'Update online version' : 'Publish';
    $('#pub-new').hidden = !canUpdate;
    $('#pub-go').disabled = false;
  }
  pubAsNew = false;
  openModal('#publish-modal');
});
$('#pub-new').addEventListener('click', () => { pubAsNew = true; $('#pub-form').requestSubmit(); });
$('#pub-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = cleanText($('#pub-name').value, LIMITS.name);
  const creator = cleanText($('#pub-creator').value, LIMITS.creator);
  const desc = cleanText($('#pub-desc').value, LIMITS.desc);
  const msg = $('#pub-msg');
  if (!name || !creator) { msg.textContent = 'Add a level name and a nickname.'; return; }
  if (isRude(name) || isRude(creator) || isRude(desc)) { msg.textContent = 'Something in the name, nickname or description has a blocked word. Change it and try again.'; return; }
  const p = profile.get();
  if (!p.name) { profile.set({ ...p, name: creator }); renderMe(); }
  $('#ed-name').value = name;
  const lv = { ...currentLevel(), n: name, desc };
  const clean = normalizeLevel(lv);
  $('#pub-go').disabled = true; msg.textContent = 'Publishing…';
  try {
    let id = lv.pubId, key = lv.editKey;
    if (id && key && !pubAsNew) await api.update(id, key, clean, creator, desc);
    else { const r = await api.publish(clean, creator, desc); id = r.id; key = r.editKey; }
    updateMeta({ pubId: id, editKey: key, desc, n: name });
    mine.save({ ...currentLevel(), pubId: id, editKey: key, desc, by: 'You' });
    msg.textContent = '';
    $('#pub-form').hidden = true; $('#pub-done').hidden = false;
    $('#pub-link').value = siteBase() + '#/p/' + id;
    setMsg('Published. Your level is saved in Your games too, with its secret edit key, so you can update it later.');
  } catch (err) {
    msg.textContent = err.message;
    $('#pub-go').disabled = false;
  }
});
$('#pub-copy').addEventListener('click', (e) => copyText($('#pub-link').value, e.currentTarget, 'Copy link'));

/* ================= 3D beta ================= */
function stop3D() { if (game3d) { game3d.stop(); game3d = null; } }
function show3DView() { show('3d'); run3D(skyObby()); }
function run3D(level) {
  stop3D();
  $('#win3').hidden = true;
  $('#t3-title').textContent = level.n;
  const slot = $('#c3d-slot'); slot.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', '3D game');
  slot.append(canvas);
  let toastTimer = 0;
  try {
    game3d = start3D(canvas, level, {
      onHud: ({ time, deaths }) => { $('#hud3-time').textContent = `${time.toFixed(1)}s`; $('#hud3-deaths').textContent = `Falls ${deaths}`; },
      onDie: () => { const f = $('#fade3'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); },
      onToast: (t) => { const el3 = $('#toast3'); el3.textContent = t; el3.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el3.hidden = true; }, 1200); },
      onWin: ({ time, deaths }) => { $('#win3-stats').textContent = `${time.toFixed(1)} seconds with ${deaths} ${deaths === 1 ? 'fall' : 'falls'}.`; $('#win3').hidden = false; },
    }, profile.get().color);
    game3d.level = level;
  } catch (e) {
    slot.innerHTML = '';
    slot.append(el('div', { class: 'overlay' }, el('div', { class: 'panel' }, el('h2', {}, "3D can't start here"), el('p', {}, e.message))));
  }
}
$('#t3-sky').addEventListener('click', () => run3D(skyObby()));
$('#t3-random').addEventListener('click', () => run3D(randomObby()));
$('#win3-again').addEventListener('click', () => { if (game3d) run3D(game3d.level); });
$('#win3-random').addEventListener('click', () => run3D(randomObby()));
$$('[data-k3]').forEach((b) => {
  const k = b.dataset.k3;
  const on = (e) => { e.preventDefault(); if (game3d) game3d.press(k, true); };
  const off = () => { if (game3d) game3d.press(k, false); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
});

/* ================= crashes ================= */
function showCrash(err) {
  stopMusic();
  $('#crash-detail').textContent = err && err.message ? 'Error: ' + err.message : '';
  $('#crash-modal').hidden = false;
}
addEventListener('blockyard-crash', (e) => showCrash(e.detail));
addEventListener('error', (e) => { if (e.filename && e.filename.includes('/js/')) showCrash(e.error || e); });
addEventListener('unhandledrejection', (e) => { if (e.reason instanceof Error && !/fetch|server|network/i.test(e.reason.message)) showCrash(e.reason); });
$('#crash-reload').addEventListener('click', () => location.reload());

/* ================= start ================= */
(function drawLogo() {
  const cv = $('#logo-pip'), c = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = 44 * dpr; cv.height = 44 * dpr; c.scale(dpr, dpr);
  c.translate(22, 24);
  drawPip(c, 24, '#ff6b35', { t: 1, look: 1 });
})();
renderMe();
renderMute();
route();
