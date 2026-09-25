// The app: pages, accounts, progress, closet, endless, daily, publishing, admin and the 3D beta.
import { normalizeLevel, encodeShare, decodeShare, isRude, cleanText, LIMITS, countTiles, toWire } from './format.js';
import { BUILTIN, WORLDS } from './levels.js';
import { drawThumb, thumbWindow, drawBackground, drawTile } from './render2d.js';
import { drawPip, drawForm, drawIcon, iconCanvas } from './art.js';
import { startPlay, stopPlay } from './play2d.js';
import { openEditor, closeEditor, currentLevel, validate, setMsg, updateMeta, newLevel, getDraft, onEditorChange } from './editor.js';
import { start3D } from './engine3d.js';
import { skyObby, randomObby } from './levels3d.js';
import { endlessCourse, dailyCourse, todayUTC } from './endless.js';
import { store, mine, newId, api, auth, isOnline } from './api.js';
import { progress, ACHIEVEMENTS } from './progress.js';
import { SHOP, itemKey } from './cosmetics.js';
import { isMuted, setMuted, unlockAudio, isMusicOn, setMusicOn, stopMusic } from './audio.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const session = { user: null, online: false };

/* ================= navigation ================= */
const VIEWS = ['home', 'discover', 'play', 'edit', '3d', 'shop', 'daily', 'admin'];
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
function route(to) {
  const h = to || location.hash || '#/';
  lastRoute = h;
  testing = false;
  if (h.startsWith('#g=')) {
    try { playLevel(decodeShare(h.slice(3)), { by: 'a friend', key: 'shared' }); }
    catch (e) { showHome(); toast("That share link didn't load. It might be cut off."); }
  } else if (h === '#/discover') showDiscover();
  else if (h === '#/create') openCreate();
  else if (h === '#/3d') show3DView();
  else if (h === '#/shop') showShop();
  else if (h === '#/daily') showDaily();
  else if (h === '#/endless') playEndless();
  else if (h === '#/admin') showAdmin();
  else if (h.startsWith('#/play/')) {
    const id = decodeURIComponent(h.slice(7));
    const mi = MAP.findIndex((x) => x.id === id);
    const m = mi < 0 ? mine.get(id) : null;
    if (mi >= 0 && !unlocked(mi)) { selected = mi; showHome(); }
    else if (mi >= 0) playBuiltin(mi);
    else if (m) playLevel(m, { by: 'you', key: m.id });
    else showHome();
  } else if (h.startsWith('#/p/')) playPublished(decodeURIComponent(h.slice(4)));
  else showHome();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-go]');
  if (!t) return;
  e.preventDefault();
  const m = t.closest('.modal'); if (m) m.hidden = true;
  go(t.dataset.go);
});

/* ================= little helpers ================= */
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const k in props) {
    if (props[k] == null) continue;
    if (k === 'class') n.className = props[k];
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), props[k]);
    else n.setAttribute(k, props[k]);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
}
function openModal(id) {
  const m = $(id); m.hidden = false;
  const f = m.querySelector('input:not([readonly]):not([hidden]), select, button:not([hidden])');
  if (f) setTimeout(() => f.focus(), 30);
}
function closeModal(m) { m.hidden = true; }
document.addEventListener('click', (e) => { const c = e.target.closest('[data-close]'); if (c) closeModal(c.closest('.modal')); });
$$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); }));
addEventListener('keydown', (e) => { if (e.key === 'Escape') { const m = $$('.modal').find((x) => !x.hidden); if (m) { e.stopImmediatePropagation(); closeModal(m); } } }, true);

function ask(title, text, buttons) {
  return new Promise((resolve) => {
    $('#ask-h').textContent = title; $('#ask-text').textContent = text;
    const row = $('#ask-buttons'); row.innerHTML = '';
    const done = (v) => { $('#ask-modal').hidden = true; resolve(v); };
    for (const b of buttons) row.append(el('button', { class: 'btn ' + (b.cls || ''), type: 'button', onclick: () => done(b.value) }, b.label));
    row.append(el('button', { class: 'btn', type: 'button', onclick: () => done(null) }, buttons.length ? 'Cancel' : 'OK'));
    openModal('#ask-modal');
  });
}
function toast(text, kind = '') {
  const t = el('div', { class: 'toast ' + kind }, text);
  $('#toasts').append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}
async function copyText(text, btn, label) {
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
  catch (e) { btn.textContent = 'Select and copy it'; }
  setTimeout(() => { btn.textContent = label; }, 1800);
}
const siteBase = () => location.href.split('#')[0];
function pipCanvas(size, opts = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = size * dpr; cv.height = size * dpr; cv.style.width = cv.style.height = size + 'px';
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  const eq = { ...progress.data.equip, ...opts };
  c.translate(size / 2, size * 0.58);
  drawPip(c, size * 0.5, eq.color, { t: 1, look: 1, hat: eq.hat });
  return cv;
}

/* ================= progress, coins, achievements ================= */
let syncTimer = 0;
progress.onChange(() => {
  renderMe();
  for (const a of progress.takeNewAchievements()) toast(`Achievement: ${a.name}  +${a.reward} coins`, 'toast-ach');
  if (session.user && session.online) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => api.saveProgress(progress.data).catch(() => {}), 1500);
  }
});
function renderMe() {
  $('#coin-count').textContent = progress.data.coins;
  $('#me-dot').style.background = progress.data.equip.color;
  $('#me-name').textContent = session.user ? session.user.name : 'Log in';
}
$('#coin-icon').append((() => { const cv = document.createElement('canvas'); const dpr = Math.min(2, devicePixelRatio || 1); cv.width = cv.height = 22 * dpr; cv.style.width = cv.style.height = '22px'; const c = cv.getContext('2d'); c.scale(dpr * 22 / 32, dpr * 22 / 32); drawTile(c, 'o', 0, 0, () => '.', 0, 'meadow', 'icon'); return cv; })());

/* ================= accounts ================= */
async function startSession() {
  session.online = await isOnline();
  if (!session.online || !auth.token) { progress.use(null); renderMe(); return; }
  try {
    const r = await api.me();
    session.user = r.user;
    progress.use(r.user.id, r.progress);
  } catch (e) {
    if (e.status === 401) auth.token = '';
    progress.use(null);
  }
  renderMe();
  if (current === 'home') { renderMap(); renderHomeBits(); }
}
async function signedIn(res, { fresh = false } = {}) {
  auth.token = res.token;
  session.user = res.user;
  let bring = false;
  if (!fresh && progress.guestHasProgress()) {
    bring = await ask('Bring your guest progress?', 'You played as a guest in this browser. Add those stars, coins and items to this account?', [{ label: 'Yes, add them', value: true, cls: 'btn-sun' }, { label: 'No, leave them', value: false }]);
  }
  progress.use(res.user.id, res.progress);
  // a new account already got the guest progress when it was made
  if (fresh) progress.clearGuest();
  else if (bring) progress.absorbGuest();
  api.saveProgress(progress.data).catch(() => {});
  renderMe();
  route();
}

let acctMode = 'login';
function setAcctMode(m) {
  acctMode = m;
  $$('[data-acct]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.acct === m)));
  $('#acct-rec-wrap').hidden = m !== 'recover';
  $('#acct-pw-label').textContent = m === 'recover' ? 'New password' : 'Password';
  $('#acct-pw').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('#acct-go').textContent = { login: 'Log in', signup: 'Make my account', recover: 'Reset password' }[m];
  $('#acct-hint').textContent = {
    login: 'Guests save progress in this browser. With an account it follows you to any computer.',
    signup: "Pick a username (not your real name) and a password. No email needed. Your guest progress comes with you.",
    recover: 'Type the recovery code you got when you made your account, then pick a new password.',
  }[m];
  $('#acct-msg').textContent = '';
}
$$('[data-acct]').forEach((b) => b.addEventListener('click', () => setAcctMode(b.dataset.acct)));
function drawAcctPip() { const cv = $('#acct-pip'); cv.replaceWith(Object.assign(pipCanvas(56), { id: 'acct-pip' })); }
$('#me-btn').addEventListener('click', async () => {
  const on = await isOnline();
  $('#acct-offline').hidden = on;
  $('#acct-out').hidden = !on || !!session.user;
  $('#acct-in').hidden = !on || !session.user;
  if (session.user) {
    $('#acct-user').textContent = session.user.name;
    $('#acct-sum').textContent = `${progress.totalStars()} stars, ${progress.data.coins} coins, ${Object.keys(progress.data.ach).length} achievements`;
    $('#acct-admin').hidden = !session.user.admin;
    $('#acct-in-msg').textContent = '';
    drawAcctPip();
  } else setAcctMode('login');
  openModal('#account-modal');
});
$('#acct-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#acct-name').value.trim(), pw = $('#acct-pw').value, msg = $('#acct-msg');
  if (acctMode === 'signup' && isRude(name)) { msg.textContent = 'Pick a different username. That one has a blocked word in it.'; return; }
  $('#acct-go').disabled = true; msg.textContent = 'One sec…';
  try {
    if (acctMode === 'login') { const r = await api.login(name, pw); closeModal($('#account-modal')); await signedIn(r); toast(`Welcome back, ${r.user.name}!`); }
    else if (acctMode === 'signup') {
      const r = await api.signup(name, pw, progress.data);
      closeModal($('#account-modal'));
      await signedIn(r, { fresh: true });
      showRecovery(r.recovery);
    } else {
      const r = await api.recover(name, $('#acct-rec').value, pw);
      closeModal($('#account-modal'));
      await signedIn(r);
      showRecovery(r.recovery);
    }
    $('#acct-pw').value = ''; msg.textContent = '';
  } catch (err) { msg.textContent = err.message; }
  $('#acct-go').disabled = false;
});
function showRecovery(code) { $('#rec-code').textContent = code; openModal('#recovery-modal'); }
$('#rec-copy').addEventListener('click', (e) => copyText($('#rec-code').textContent, e.currentTarget, 'Copy code'));
function signedOut() {
  auth.token = ''; session.user = null;
  progress.use(null);
  renderMe(); route();
}
$('#acct-logout').addEventListener('click', async () => {
  try { await api.saveProgress(progress.data); await api.logout(); } catch (e) { /* still log out here */ }
  closeModal($('#account-modal'));
  signedOut();
  toast('Logged out. You are playing as a guest now.');
});
$('#acct-delete').addEventListener('click', async () => {
  closeModal($('#account-modal'));
  const ok = await ask('Delete your account?', 'This removes your account, your saved progress on the server, and every level you published. It cannot be undone.', [{ label: 'Delete everything', value: true, cls: 'btn-danger' }]);
  if (!ok) return;
  try { await api.deleteMe(); signedOut(); toast('Your account is deleted.'); } catch (e) { toast(e.message); }
});
function needLogin(reason) {
  ask('Log in first', `${reason} It only takes a username and a password.`, [{ label: 'Log in or sign up', value: true, cls: 'btn-sun' }])
    .then((v) => { if (v) $('#me-btn').click(); });
}

/* ================= sound ================= */
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
  const b = progress.level(key);
  if (!b) return null;
  if (b.won) return lv.style === 'rush' ? 'Beaten' : `Best ${b.time}s`;
  return b.progress ? `Best ${Math.round(b.progress * 100)}%` : null;
}
function card(lv, { meta = [], text, by, actions }) {
  const coins = countTiles(lv.d, 'o');
  const metaEl = el('div', { class: 'card-meta' }, styleTag(lv.style), ...meta.filter(Boolean).map((m) => el('span', { class: 'tag' }, m)));
  if (coins) metaEl.append(el('span', { class: 'tag' }, `${coins} coins`));
  return el('article', { class: 'card' }, thumb(lv),
    el('div', { class: 'card-body' },
      el('div', {}, el('h3', {}, lv.n), by || null, text ? el('p', {}, text) : null, metaEl),
      el('div', { class: 'row' }, ...actions.map(([label, cls, fn]) => el('button', { class: 'btn ' + cls, type: 'button', onclick: fn }, label)))));
}
function remixOf(lv) {
  return { ...lv, id: newId(), n: (lv.n + ' remix').slice(0, LIMITS.name), by: 'You', pubId: undefined, editKey: undefined, proof: undefined, desc: undefined };
}
function editLevel(lv) { store.set('draft', lv); go('#/create'); }

/* ================= home ================= */
const MAP = WORLDS.flatMap((w) => w.ids).map((id) => BUILTIN.find((b) => b.id === id)).filter(Boolean);
const worldOf = (i) => { let n = i; for (const w of WORLDS) { if (n < w.ids.length) return { name: w.name, n: n + 1 }; n -= w.ids.length; } return { name: '', n: i + 1 }; };
const beaten = (id) => { const b = progress.level(id); return !!(b && b.won); };
const unlocked = (i) => i === 0 || beaten(MAP[i - 1].id);
function nextLevelIndex() { const i = MAP.findIndex((lv, k) => unlocked(k) && !beaten(lv.id)); return i < 0 ? 0 : i; }
let selected = -1;

function showHome() {
  show('home');
  renderMap();
  renderThree();
  renderMine();
  renderHomeBits();
  renderHomeOnline();
  startTitle();
}
function renderHomeBits() {
  const s = progress.data.stats;
  $('#sub-endless').textContent = s.endlessBest ? `Best: ${Math.floor(s.endlessBest)} m` : 'How far can you go?';
  const d = progress.data.daily[todayUTC()];
  $('#sub-daily').textContent = d ? (d.won ? 'Cleared today!' : `Today's best: ${Math.floor(d.best * 100)}%`) : 'A new course every day';
  $('#sub-shop').textContent = `${progress.data.coins} coins to spend`;
  drawModeArt();
}
function drawModeArt() {
  const eq = progress.data.equip;
  const paint = (id, fn) => {
    const cv = $(id), dpr = Math.min(2, devicePixelRatio || 1);
    const W = cv.clientWidth || 120, H = cv.clientHeight || 90;
    cv.width = W * dpr; cv.height = H * dpr;
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    fn(c, W, H);
  };
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
    c.fillStyle = '#ffe3ef'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#ffc6dc'; for (let x = 0; x < W; x += 24) c.fillRect(x, 0, 12, H);
    const hats = ['crown', 'tophat', 'party'];
    hats.forEach((h, i) => { c.save(); c.translate(W * (0.25 + i * 0.25), H * 0.62); drawPip(c, 26, ['#ff5d8f', eq.color, '#3a86ff'][i], { t: 1 + i, look: i - 1, hat: h }); c.restore(); });
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
    const b = el('button', { class: `node node-${lv.style}${open ? '' : ' locked'}${done ? ' done' : ''}${i === selected ? ' sel' : ''}${w.n === 1 && i > 0 ? ' world-start' : ''}`, type: 'button', 'aria-label': `${w.name} level ${w.n}: ${lv.n}${open ? '' : ' (locked)'}` },
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
  if (current !== 'home') return;
  const map = $('#map'), road = map.querySelector('.map-road');
  if (road) layoutMap(map, road, [...map.querySelectorAll('.node')]);
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
  const goals = el('ul', { class: 'goals' }, ...starGoals(lv).map((g, i) => el('li', { class: got[i] ? 'got' : '' }, iconCanvas('star', 18), g)));
  box.append(el('div', { class: 'detail-thumb' + (open ? '' : ' dim') }, cv), el('div', { class: 'detail-info' },
    el('p', { class: 'detail-kicker' }, `${w.name}, level ${w.n}`),
    el('h3', {}, lv.n),
    el('p', {}, open ? lv.blurb : `Beat ${MAP[selected - 1].n} to unlock this one.`),
    el('div', { class: 'card-meta' }, styleTag(lv.style), best ? el('span', { class: 'tag' }, best) : null),
    open ? goals : null,
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

/* ---------- title screen: Pip runs forever ---------- */
let titleRaf = 0;
function startTitle() {
  cancelAnimationFrame(titleRaf);
  const cv = $('#title-canvas'), c = cv.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t0 = performance.now();
  const spikeAt = (i) => i > 10 && i % 3 === 0 && ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 < 0.5;
  const tick = (now) => {
    if (current !== 'home') return;
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
    drawPip(c, size, eq.color, { t, look: 1, run: 1, air, mouth: air ? 'open' : 'smile', sy: air ? 1.06 : 1, sx: air ? 0.95 : 1, hat: eq.hat });
    c.restore();
    if (!still) titleRaf = requestAnimationFrame(tick);
  };
  titleRaf = requestAnimationFrame(tick);
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
      actions: [['Play', 'btn-grass', () => go('#/play/' + lv.id)], ['Edit', '', () => editLevel(lv)], ['Delete', 'btn-danger', () => deleteMine(lv)]],
    }));
  }
  wrap.append(grid);
}
async function deleteMine(lv) {
  const buttons = [{ label: 'Delete', value: 'local', cls: 'btn-danger' }];
  if (lv.pubId && (session.user || lv.editKey)) buttons.push({ label: 'Delete here and from Discover', value: 'all', cls: 'btn-danger' });
  const pick = await ask(`Delete "${lv.n}"?`, lv.pubId ? 'This level is published. You can remove it from this browser only, or from Discover too.' : "This can't be undone.", buttons);
  if (!pick) return;
  if (pick === 'all') {
    try { await api.remove(lv.pubId, lv.editKey); } catch (e) { await ask("Couldn't remove it from Discover", e.message, []); return; }
  }
  mine.remove(lv.id);
  renderMine();
}

async function renderHomeOnline() {
  if (!(await isOnline()) || current !== 'home') return;
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
    const lv = decodeShare(raw.includes('#g=') ? raw.split('#g=')[1] : raw);
    msg.textContent = '';
    playLevel(lv, { by: 'a friend', key: 'shared' });
  } catch (e) { msg.textContent = e.message; }
});
$('#import-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#import-btn').click(); });

/* ================= playing ================= */
let backTo = '#/';
function playLevel(lv, o) {
  backTo = testing ? null : (o.back || '#/');
  show('play', o.nav);
  startPlay(lv, {
    key: o.key, by: o.by, mode: o.mode, dailyBest: o.dailyBest,
    onExit: () => { if (testing) { testing = false; show('edit', 'create'); } else go(backTo); },
    onRemix: (level) => editLevel(remixOf(level)),
    onReport: o.pubId ? () => (session.user ? openReport(o.pubId) : needLogin('Reporting needs an account so one person can\'t spam reports.')) : null,
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

function playBuiltin(mi) {
  const lv = MAP[mi];
  playLevel(lv, {
    by: 'Blockyard', key: lv.id, nav: 'home',
    onNext: MAP[mi + 1] ? () => { selected = mi + 1; go('#/play/' + MAP[mi + 1].id); } : null,
    onWin: (r) => {
      const res = progress.finish(lv.id, r, { builtin: true, par: lv.par, rush: lv.style === 'rush' });
      const goals = starGoals(lv);
      const missing = goals.filter((g, i) => !res.stars[i]);
      return { ...res, goals: missing.length ? `Next star: ${missing[0].toLowerCase()}.` : 'All 3 stars!' };
    },
  });
}

function playEndless() {
  if (!session.online) isOnline();
  playLevel(endlessCourse(Date.now() % 1e9), {
    key: 'endless', mode: 'endless', nav: 'home', by: 'Blockyard',
    onRunOver: ({ distance, coins }) => progress.endless(distance, coins),
    onAgain: () => playEndless(),
  });
}

async function playPublished(id) {
  show('play', 'discover');
  $('#play-title').textContent = 'Loading…';
  try {
    const { game } = await api.get(id);
    const lv = normalizeLevel(game.level);
    playLevel(lv, { by: game.creator, key: 'p:' + id, pubId: id, online: true, back: '#/discover', nav: 'discover' });
    const seen = 'played:' + id;
    try { if (!sessionStorage.getItem(seen)) { sessionStorage.setItem(seen, '1'); api.play(id).catch(() => {}); } } catch (e) { /* ok */ }
  } catch (e) {
    showHome();
    toast(`That online level didn't load. ${e.message}`);
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
const disc = { sort: 'new', style: '', q: '', creator: '', page: 0, busy: false };
async function showDiscover() {
  show('discover');
  const on = await isOnline();
  $('#disc-offline').hidden = on; $('#disc-main').hidden = !on;
  if (on) loadDiscover(true);
}
function publishedCard(g) {
  let lv;
  try { lv = normalizeLevel(g.level); } catch (e) { return null; }
  const by = el('p', { class: 'by-line' }, 'by ', el('button', { class: 'linkish', type: 'button', onclick: () => { disc.creator = g.creator; disc.q = ''; $('#disc-q').value = ''; go('#/discover'); } }, g.creator));
  return card(lv, {
    by, text: g.descr || null,
    meta: [`${g.plays} ${g.plays === 1 ? 'play' : 'plays'}`, `${g.likes} ${g.likes === 1 ? 'like' : 'likes'}`, bestText('p:' + g.id, lv)],
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
    const r = await api.list(disc);
    for (const g of r.games) { const c = publishedCard(g); if (c) $('#disc-grid').append(c); }
    $('#disc-more').hidden = !r.more;
    $('#disc-msg').textContent = !r.games.length && reset ? (disc.q || disc.creator ? 'No levels match.' : 'No levels yet. Build one and press Publish to be the first.') : '';
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

/* ================= editor wiring ================= */
const sigOf = (lv) => { try { const w = toWire(normalizeLevel(lv)); return JSON.stringify([w.style, w.theme, w.form, w.speed, w.w, w.h, w.d]); } catch (e) { return null; } };
function proven() { const lv = currentLevel(); return !!(lv.proof && lv.proof.sig && lv.proof.sig === sigOf(lv)); }
function renderProof() {
  const ok = proven(), p = $('#ed-proof');
  p.dataset.ok = String(ok);
  p.textContent = ok ? 'Beaten, ready to publish' : 'Not beaten yet';
}
onEditorChange(renderProof);
function openCreate() {
  show('edit', 'create');
  const draft = getDraft();
  let lv = null;
  if (draft) { try { lv = { ...draft, ...normalizeLevel(draft) }; } catch (e) { lv = { ...draft }; } }
  openEditor(lv && lv.d ? lv : newLevel('adventure'));
  renderProof();
}
$('#ed-new').addEventListener('click', async () => {
  const pick = await ask('Start a new level?', 'Save first if you want to keep this one in Your levels.', [
    { label: 'New Adventure level', value: 'adventure', cls: 'btn-grass' },
    { label: 'New Rush level', value: 'rush', cls: 'btn-sun' },
  ]);
  if (!pick) return;
  const lv = newLevel(pick);
  store.set('draft', lv);
  openEditor(lv); renderProof();
});
function testLevel() {
  const err = validate();
  if (err) { setMsg(err); return; }
  testing = true;
  const lv = normalizeLevel(currentLevel());
  const sig = sigOf(lv);
  playLevel(lv, {
    key: 'test', by: 'you (testing)',
    onWin: (r) => {
      updateMeta({ proof: { sig, replay: r.replay } });
      progress.stat('proven'); progress.flush();
      return { note: 'You beat your own level! You can publish it now.' };
    },
  });
}
$('#ed-test').addEventListener('click', testLevel);
$('#ed-save').addEventListener('click', () => {
  const lv = currentLevel();
  const err = validate();
  if (err) { setMsg(err + ' Saved as a draft for now.'); return; }
  const ok = mine.save({ ...lv, by: 'You' });
  if (ok) { progress.stat('saved'); progress.flush(); }
  setMsg(ok ? 'Saved. It shows up under Your levels.' : 'This browser blocked saving. Use Share to keep a copy of the code.');
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
function pubBlocked(text, btnLabel, action) {
  $('#pub-offline').hidden = false; $('#pub-form').hidden = true;
  $('#pub-offline-text').textContent = text;
  const b = $('#pub-offline-go');
  b.hidden = !btnLabel; b.textContent = btnLabel || '';
  b.onclick = () => { closeModal($('#publish-modal')); action(); };
}
$('#ed-publish').addEventListener('click', async () => {
  const err = validate();
  if (err) { setMsg(err); return; }
  const lv = currentLevel();
  $('#pub-done').hidden = true; $('#pub-msg').textContent = '';
  const on = await isOnline();
  if (!on) pubBlocked('Publishing needs the online version of Blockyard, running on Cloudflare. Here you can use Share to send a code instead.');
  else if (!session.user) pubBlocked('Log in to publish. Levels on Discover show your username.', 'Log in or sign up', () => $('#me-btn').click());
  else if (!proven()) pubBlocked("Beat your level in Test first. The server replays your winning run to prove the level can be beaten, so nobody publishes impossible levels.", 'Test it now', testLevel);
  else {
    $('#pub-offline').hidden = true; $('#pub-form').hidden = false;
    $('#pub-name').value = lv.n;
    $('#pub-desc').value = lv.desc || '';
    $('#pub-who').textContent = `Published as ${session.user.name}.`;
    const canUpdate = !!(lv.pubId && (lv.pubUser === session.user.id || lv.editKey));
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
  const desc = cleanText($('#pub-desc').value, LIMITS.desc);
  const msg = $('#pub-msg');
  if (!name) { msg.textContent = 'Give your level a name.'; return; }
  if (isRude(name) || isRude(desc)) { msg.textContent = 'Something in the name or description has a blocked word. Change it and try again.'; return; }
  $('#ed-name').value = name;
  const lv = { ...currentLevel(), n: name, desc };
  const clean = normalizeLevel(lv);
  $('#pub-go').disabled = true; msg.textContent = 'Checking your run and publishing…';
  try {
    let id = lv.pubId;
    if (id && !pubAsNew && (lv.pubUser === session.user.id || lv.editKey)) await api.update(id, clean, desc, lv.proof.replay, lv.editKey);
    else { const r = await api.publish(clean, desc, lv.proof.replay); id = r.id; }
    updateMeta({ pubId: id, pubUser: session.user.id, desc, n: name });
    mine.save({ ...currentLevel(), pubId: id, pubUser: session.user.id, desc, by: 'You' });
    progress.stat('published'); progress.flush();
    msg.textContent = '';
    $('#pub-form').hidden = true; $('#pub-done').hidden = false;
    $('#pub-link').value = siteBase() + '#/p/' + id;
    setMsg('Published! It is on Discover now, and saved in Your levels.');
  } catch (err) {
    msg.textContent = err.message;
    $('#pub-go').disabled = false;
  }
});
$('#pub-copy').addEventListener('click', (e) => copyText($('#pub-link').value, e.currentTarget, 'Copy link'));

/* ================= Pip's closet ================= */
let shopKind = 'hat', shopPick = null, closetRaf = 0;
const KINDS = [['hat', 'Hats'], ['color', 'Colors'], ['trail', 'Trails']];
function showShop() {
  show('shop');
  shopPick = null;
  renderShop();
  renderAchievements();
  closetLoop();
}
function outfit() {
  const eq = { ...progress.data.equip };
  if (shopPick) eq[shopKind] = shopPick;
  return eq;
}
function closetLoop() {
  cancelAnimationFrame(closetRaf);
  const cv = $('#closet-canvas'), c = cv.getContext('2d');
  const t0 = performance.now();
  const tick = (now) => {
    if (current !== 'shop') return;
    const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = (now - t0) / 1000, eq = outfit();
    c.fillStyle = '#ffe3ef'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#ffd0e2'; for (let x = -H; x < W; x += 36) { c.beginPath(); c.moveTo(x, H); c.lineTo(x + H, 0); c.lineTo(x + H + 18, 0); c.lineTo(x + 18, H); c.fill(); }
    c.fillStyle = 'rgba(29,35,64,.15)'; c.beginPath(); c.ellipse(W / 2, H * 0.8, W * 0.22, 12, 0, 0, Math.PI * 2); c.fill();
    if (eq.trail && eq.trail !== 'none') drawTrailSample(c, eq.trail, W / 2 - 40, H * 0.62, t);
    const hop = Math.abs(Math.sin(t * 2.2)) * 18;
    c.save(); c.translate(W / 2, H * 0.8 - hop - 58);
    drawPip(c, 90, eq.color, { t, look: Math.sin(t * 0.7), air: hop > 3, mouth: hop > 3 ? 'open' : 'smile', hat: eq.hat, sy: hop > 3 ? 1.05 : 1 });
    c.restore();
    closetRaf = requestAnimationFrame(tick);
  };
  closetRaf = requestAnimationFrame(tick);
}
const TRAIL_SAMPLE = { sparkle: '#ffd23f', bubbles: '#7cc8ff', hearts: '#ff5d8f', notes: '#1d2340', fire: '#ff5a1f', rainbow: null, stars: '#ffd23f' };
function drawTrailSample(c, kind, x, y, t) {
  if (kind === 'rainbow') {
    ['#ff5d8f', '#ff9f1c', '#ffd23f', '#44c06a', '#3a86ff', '#b06cff'].forEach((col, i) => {
      c.strokeStyle = col; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath();
      for (let k = 0; k < 20; k++) { const px = x - k * 6, py = y + (i - 2.5) * 4 + Math.sin(t * 4 - k * 0.4) * 6; if (k) c.lineTo(px, py); else c.moveTo(px, py); }
      c.stroke();
    });
    return;
  }
  for (let k = 0; k < 6; k++) {
    const px = x - k * 18, py = y + Math.sin(t * 3 + k) * 10 - (kind === 'fire' || kind === 'bubbles' ? k * 3 : 0), s = 6 - k * 0.6;
    c.globalAlpha = 1 - k / 7; c.fillStyle = TRAIL_SAMPLE[kind]; c.strokeStyle = TRAIL_SAMPLE[kind];
    c.beginPath();
    if (kind === 'bubbles') { c.lineWidth = 2; c.arc(px, py, s, 0, Math.PI * 2); c.stroke(); }
    else if (kind === 'hearts') { c.moveTo(px, py + s); c.bezierCurveTo(px - s * 1.6, py - s * 0.4, px - s * 0.5, py - s * 1.5, px, py - s * 0.4); c.bezierCurveTo(px + s * 0.5, py - s * 1.5, px + s * 1.6, py - s * 0.4, px, py + s); c.fill(); }
    else if (kind === 'notes') { c.ellipse(px, py + s, s * 0.7, s * 0.5, -0.4, 0, Math.PI * 2); c.fill(); c.fillRect(px + s * 0.4, py - s * 1.2, 2, s * 2.2); }
    else if (kind === 'fire') { c.fillStyle = ['#ff5a1f', '#ffb02e', '#ffd23f'][k % 3]; c.fillRect(px - s / 2, py - s / 2, s, s); }
    else { const n = kind === 'stars' ? 5 : 4; for (let i = 0; i < n * 2; i++) { const r = i % 2 ? s * 0.4 : s * 1.2, a = i * Math.PI / n + t; c.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r); } c.closePath(); c.fill(); }
    c.globalAlpha = 1;
  }
}
function itemPreview(kind, item) {
  const size = 64, dpr = Math.min(2, devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size * dpr; cv.style.width = cv.style.height = size + 'px';
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  const eq = progress.data.equip;
  if (kind === 'trail') {
    if (item.id !== 'none') drawTrailSample(c, item.id, 44, 36, 1);
    c.save(); c.translate(46, 40); drawPip(c, 22, eq.color, { t: 1, hat: 'none' }); c.restore();
  } else {
    c.save(); c.translate(size / 2, size * 0.6);
    drawPip(c, 32, kind === 'color' ? item.id : eq.color, { t: 1, look: 1, hat: kind === 'hat' ? item.id : 'none' });
    c.restore();
  }
  return cv;
}
function renderShop() {
  $('#shop-wallet').textContent = `${progress.data.coins} coins`;
  const tabs = $('#shop-tabs'); tabs.innerHTML = '';
  for (const [k, label] of KINDS) {
    tabs.append(el('button', { class: 'tab', role: 'tab', 'aria-selected': String(k === shopKind), type: 'button', onclick: () => { shopKind = k; shopPick = null; renderShop(); } }, label));
  }
  const box = $('#shop-items'); box.innerHTML = '';
  const eq = progress.data.equip;
  for (const item of SHOP[shopKind]) {
    const owned = progress.owns(shopKind, item.id), on = eq[shopKind] === item.id;
    const canGet = progress.canUnlock(item);
    let status = on ? 'Wearing' : owned ? 'Owned' : item.need ? (canGet ? 'Unlocked' : item.hint) : `${item.price} coins`;
    const b = el('button', { class: `item${on ? ' on' : ''}${shopPick === item.id ? ' pick' : ''}${!owned && item.need && !canGet ? ' locked' : ''}`, type: 'button', onclick: () => { shopPick = item.id; renderShop(); } },
      itemPreview(shopKind, item), el('span', { class: 'item-name' }, item.name), el('span', { class: 'item-price' }, status));
    box.append(b);
  }
  const item = SHOP[shopKind].find((i) => i.id === (shopPick || eq[shopKind]));
  const cap = $('#closet-caption'); cap.innerHTML = '';
  if (item && shopPick) {
    const owned = progress.owns(shopKind, item.id);
    let btn;
    if (owned) btn = el('button', { class: 'btn btn-grass', type: 'button', onclick: () => { progress.equip(shopKind, item.id); shopPick = null; renderShop(); } }, eq[shopKind] === item.id ? 'Wearing it' : 'Wear it');
    else if (item.need && !progress.canUnlock(item)) btn = el('span', { class: 'small' }, `Locked: ${item.hint}.`);
    else {
      const poor = !item.need && progress.data.coins < item.price;
      btn = el('button', { class: 'btn btn-sun', type: 'button', onclick: () => { const r = progress.buy(shopKind, item.id); if (r === 'ok') { toast(`New ${shopKind === 'color' ? 'color' : shopKind}: ${item.name}!`); shopPick = null; renderShop(); renderAchievements(); } } }, item.need ? 'Unlock it' : `Buy for ${item.price} coins`);
      if (poor) { btn.disabled = true; btn.textContent = `Need ${item.price - progress.data.coins} more coins`; }
    }
    cap.append(el('b', {}, item.name), ' ', btn);
  } else cap.textContent = 'Pick something to try it on.';
}
function renderAchievements() {
  const list = $('#ach-list'); list.innerHTML = '';
  const got = progress.data.ach;
  $('#ach-count').textContent = `${Object.keys(got).length} of ${ACHIEVEMENTS.length}`;
  for (const a of ACHIEVEMENTS) {
    list.append(el('div', { class: 'ach' + (got[a.id] ? ' got' : '') }, iconCanvas(got[a.id] ? 'star' : 'lock', 28),
      el('div', {}, el('b', {}, a.name), el('span', { class: 'small' }, `${a.text}. +${a.reward} coins`))));
  }
  const s = progress.data.stats;
  $('#stats-list').innerHTML = '';
  for (const [label, v] of [['Levels beaten', s.wins], ['Stars', progress.totalStars()], ['Jumps', s.jumps], ['Coins grabbed', s.coins], ['Walkers stomped', s.stomps], ['Portals', s.portals], ['Respawns', s.deaths], ['Endless best', `${Math.floor(s.endlessBest)} m`], ['Dailies cleared', s.dailies]]) {
    $('#stats-list').append(el('div', { class: 'stat' }, el('span', { class: 'stat-v' }, String(v)), el('span', { class: 'small' }, label)));
  }
}

/* ================= daily ================= */
async function showDaily() {
  show('daily', 'home');
  const date = todayUTC();
  const lv = dailyCourse(date);
  $('#daily-title').textContent = `Daily challenge: ${date}`;
  const msLeft = Date.parse(date + 'T00:00:00Z') + 86400e3 - Date.now();
  $('#daily-reset').textContent = `New course in ${Math.floor(msLeft / 3600e3)} h ${Math.floor(msLeft / 60e3) % 60} min`;
  drawThumb($('#daily-thumb'), thumbWindow(lv, 60), 5);
  const d = progress.data.daily[date];
  $('#daily-mine').textContent = d ? (d.won ? `You cleared it in ${d.attempts} ${d.attempts === 1 ? 'attempt' : 'attempts'}.` : `Your best: ${Math.floor(d.best * 100)}% after ${d.attempts} ${d.attempts === 1 ? 'attempt' : 'attempts'}.`) : 'Same course for everyone today. One life per attempt, as many attempts as you want.';
  $('#daily-note').textContent = session.user ? 'Your best run goes on the board automatically.' : 'Playing as a guest. Log in to get on the board.';
  $('#daily-play').onclick = () => playDaily(date);
  const board = $('#daily-board'), bmsg = $('#daily-board-msg');
  board.innerHTML = ''; bmsg.textContent = 'Loading…';
  if (!(await isOnline())) { bmsg.textContent = 'The board needs the online version of Blockyard.'; return; }
  try {
    const r = await api.daily(date);
    for (const row of r.top) {
      board.append(el('li', { class: session.user && row.name === session.user.name ? 'me' : '' },
        el('span', { class: 'rank' }, String(row.rank)), pipCanvas(34, { color: row.color, hat: row.hat }), el('span', { class: 'who' }, row.name),
        el('span', { class: 'pct' }, row.won ? 'Cleared' : `${Math.floor(row.progress * 100)}%`)));
    }
    bmsg.textContent = !r.top.length ? 'Nobody is on the board yet. Be the first!' : r.me ? `You are #${r.me.rank} of ${r.players}.` : `${r.players} ${r.players === 1 ? 'player' : 'players'} today.`;
  } catch (e) { bmsg.textContent = e.message; }
}
function playDaily(date) {
  const d = progress.data.daily[date];
  playLevel(dailyCourse(date), {
    key: 'daily:' + date, mode: 'daily', nav: 'home', by: 'Blockyard', back: '#/daily', dailyBest: d ? d.best : 0,
    onAttempt: (r) => {
      const res = progress.daily(date, r.progress, r.won);
      if ((res.newBest || r.won) && session.user && session.online) api.postDaily(date, r.replay).catch(() => {});
      return res;
    },
  });
}

/* ================= admin ================= */
async function showAdmin() {
  show('admin', 'home');
  if (!session.user || !session.user.admin) { $('#admin-msg').textContent = 'Log in with your admin account to see this page.'; $('#admin-games').innerHTML = ''; return; }
  loadAdminGames();
}
async function loadAdminGames() {
  const box = $('#admin-games'); box.innerHTML = ''; $('#admin-msg').textContent = 'Loading…';
  try {
    const { games } = await api.admin('GET', '/games');
    $('#admin-msg').textContent = games.length ? '' : 'No published levels yet.';
    for (const g of games) {
      let lv = null; try { lv = normalizeLevel(g.level); } catch (e) { /* broken */ }
      const reasons = Object.entries(g.reasons).map(([r, n]) => `${n} ${r}`).join(', ');
      const act = (label, cls, action) => el('button', { class: 'btn ' + cls, type: 'button', onclick: async (e) => {
        if (action === 'delete' && e.currentTarget.dataset.sure !== '1') { e.currentTarget.dataset.sure = '1'; e.currentTarget.textContent = 'Click again to delete'; return; }
        try { await api.admin('POST', '/games/' + g.id, { action }); loadAdminGames(); } catch (err) { toast(err.message); }
      } }, label);
      box.append(el('div', { class: 'admin-row' + (g.hidden ? ' hidden-game' : '') }, lv ? thumb(lv) : el('span'),
        el('div', {}, el('h3', {}, g.name), el('p', { class: 'small' }, `by ${g.creator}. ${g.plays} plays, ${g.likes} likes. ${g.hidden ? 'Hidden.' : 'Visible.'}`), el('p', { class: 'small' }, g.reports ? `Reports: ${reasons}` : 'No reports.')),
        el('div', { class: 'row' }, el('a', { class: 'btn', href: '#/p/' + g.id }, 'Play'), g.hidden ? act('Show', 'btn-grass', 'show') : act('Hide', '', 'hide'), g.reports ? act('Clear reports', '', 'clear') : null, act('Delete', 'btn-danger', 'delete'),
          el('button', { class: 'btn btn-danger', type: 'button', onclick: () => adminUser(g.creator, 'ban') }, 'Ban creator'))));
    }
  } catch (e) { $('#admin-msg').textContent = e.message; }
}
async function adminUser(name, action) {
  const ok = await ask(`${action === 'ban' ? 'Ban' : 'Unban'} ${name}?`, action === 'ban' ? 'They get logged out, cannot log back in, and all their levels are hidden.' : 'They can log in again and their levels come back.', [{ label: action === 'ban' ? 'Ban' : 'Unban', value: true, cls: 'btn-danger' }]);
  if (!ok) return;
  try { await api.admin('POST', '/users/' + encodeURIComponent(name), { action }); toast(`${name} ${action === 'ban' ? 'banned' : 'unbanned'}.`); loadAdminGames(); findUsers(); } catch (e) { toast(e.message); }
}
async function findUsers() {
  const box = $('#admin-users'); box.innerHTML = '';
  const q = $('#admin-user-q').value.trim();
  if (!q) return;
  try {
    const { users } = await api.admin('GET', '/users?q=' + encodeURIComponent(q));
    if (!users.length) box.append(el('p', { class: 'small' }, 'No players with that name.'));
    for (const u of users) {
      box.append(el('div', { class: 'admin-row small-row' + (u.banned ? ' hidden-game' : '') }, el('b', {}, u.name), el('span', { class: 'small' }, `${u.games} levels. ${u.banned ? 'Banned.' : ''}`),
        el('button', { class: 'btn ' + (u.banned ? 'btn-grass' : 'btn-danger'), type: 'button', onclick: () => adminUser(u.name, u.banned ? 'unban' : 'ban') }, u.banned ? 'Unban' : 'Ban')));
    }
  } catch (e) { toast(e.message); }
}
$('#admin-user-find').addEventListener('click', findUsers);
$('#admin-user-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') findUsers(); });
$('#admin-refresh').addEventListener('click', loadAdminGames);

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
      onToast: (t) => { const e3 = $('#toast3'); e3.textContent = t; e3.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { e3.hidden = true; }, 1200); },
      onWin: ({ time, deaths }) => { $('#win3-stats').textContent = `${time.toFixed(1)} seconds with ${deaths} ${deaths === 1 ? 'fall' : 'falls'}.`; $('#win3').hidden = false; },
    }, progress.data.equip.color);
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
addEventListener('unhandledrejection', (e) => { if (e.reason instanceof Error && !e.reason.status && !/fetch|server|network|login/i.test(e.reason.message)) showCrash(e.reason); });
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
startSession();
addEventListener('pagehide', () => { if (session.user && session.online) try { api.saveProgress(progress.data); } catch (e) { /* best effort */ } });
