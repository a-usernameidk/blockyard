// Level editor: paint tiles on a scrollable, zoomable grid.
import { TILES, FORMS, FORM_INFO, THEMES as THEME_LIST, THEME_NAMES, SPEED_NAMES, LIMITS, normalizeLevel } from './format.js';
import { T } from './engine2d.js';
import { drawTile, THEMES } from './render2d.js';
import { store, newId } from './api.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#ed-canvas');
const ctx = canvas.getContext('2d');
const stageEl = $('#ed-stage');
const ZOOMS = [12, 16, 20, 24, 32, 40];
const WIDTHS = [32, 48, 64, 80, 120, 160, 200, 280, 400];
const HEIGHTS = [10, 12, 14, 16, 20, 24, 30, 40];
const TABS = [['blocks', 'Blocks'], ['danger', 'Danger'], ['items', 'Items'], ['portals', 'Portals']];

const ED = {
  lv: null, a: [], tool: '#', tab: 'blocks', box: false, zoom: 32, sx: 0, sy: 0,
  undo: [], redo: [], stroke: null, hover: null, pan: null, view: { w: 800, h: 400 }, dpr: 1, active: false,
};

export function newLevel(style = 'adventure') {
  const w = style === 'rush' ? 120 : 48, h = style === 'rush' ? 14 : 12;
  const a = Array(w * h).fill('.');
  for (let x = 0; x < w; x++) { a[(h - 2) * w + x] = '#'; a[(h - 1) * w + x] = '#'; }
  a[(h - 3) * w + 2] = 'S';
  if (style === 'adventure') a[(h - 3) * w + w - 4] = 'G';
  return { id: newId(), n: 'My level', by: 'You', style, theme: 'meadow', form: 'hopper', speed: '~', w, h, d: a.join('') };
}

/* ---------------- open / read ---------------- */
export function openEditor(lv) {
  ED.lv = { ...lv };
  ED.a = lv.d.split('');
  ED.undo = []; ED.redo = []; ED.stroke = null;
  ED.active = true;
  $('#ed-name').value = lv.n;
  $('#ed-style').value = lv.style;
  $('#ed-theme').value = lv.theme;
  $('#ed-form').value = lv.form || 'hopper';
  $('#ed-speed').value = lv.speed || '~';
  fillSizeSelect($('#ed-width'), WIDTHS, lv.w);
  fillSizeSelect($('#ed-height'), HEIGHTS, lv.h);
  setMsg('');
  syncStyle();
  requestAnimationFrame(() => { sizeView(); ED.sx = 0; ED.sy = 1e9; clampScroll(); draw(); });
}
export function closeEditor() { ED.active = false; }

export function currentLevel() {
  return { ...ED.lv, n: $('#ed-name').value.trim().slice(0, LIMITS.name) || 'My level', d: ED.a.join('') };
}
export function updateMeta(fields) { Object.assign(ED.lv, fields); autosave(); }
export function validate() {
  try { normalizeLevel(currentLevel()); return null; } catch (e) { return e.message; }
}
export function setMsg(text) { $('#ed-msg').textContent = text; }

function fillSizeSelect(sel, list, current) {
  const opts = [...new Set([...list, current])].sort((a, b) => a - b);
  sel.innerHTML = '';
  for (const v of opts) { const o = document.createElement('option'); o.value = v; o.textContent = `${v} blocks`; sel.appendChild(o); }
  sel.value = String(current);
}

/* ---------------- tool palette ---------------- */
const tabsEl = $('#ed-tabs'), toolsEl = $('#ed-tools'), quickEl = $('#ed-quick');
function toolIcon(c) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = T * dpr; cv.height = T * dpr;
  const x = cv.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (c === 'hand') { x.font = '20px system-ui, sans-serif'; x.textAlign = 'center'; x.fillText('✋', 16, 23); }
  else drawTile(x, c, 0, 0, () => '.', 0, ED.lv ? ED.lv.theme : 'meadow', 'icon');
  return cv;
}
function toolButton(c, name, tip) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'tool'; b.dataset.tool = c;
  b.title = tip || name;
  b.setAttribute('aria-pressed', String(ED.tool === c));
  b.append(toolIcon(c), document.createTextNode(name));
  b.addEventListener('click', () => pickTool(c));
  return b;
}
function pickTool(c) {
  ED.tool = c;
  document.querySelectorAll('.tool').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.tool === c)));
  canvas.classList.toggle('hand', c === 'hand');
  const t = TILES[c];
  setMsg(c === 'hand' ? 'Move: drag to scroll around the level.' : t && t.tip ? `${t.name}: ${t.tip}` : '');
}
function renderTabs() {
  tabsEl.innerHTML = '';
  for (const [id, label] of TABS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tab'; b.textContent = label;
    b.setAttribute('aria-selected', String(ED.tab === id));
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => { ED.tab = id; renderTabs(); renderTools(); });
    tabsEl.appendChild(b);
  }
}
function renderTools() {
  toolsEl.innerHTML = '';
  const rush = ED.lv && ED.lv.style === 'rush';
  for (const c of Object.keys(TILES)) {
    const t = TILES[c];
    if (t.group !== ED.tab) continue;
    const b = toolButton(c, t.name, t.tip);
    if (t.rush && !rush) { b.disabled = true; b.title = t.name + ': works in Rush levels only. Change Style to Rush to use it.'; }
    toolsEl.appendChild(b);
  }
  if (ED.tab === 'portals' && !rush) {
    const note = document.createElement('p');
    note.className = 'tools-note';
    note.textContent = 'Form, speed and size portals work in Rush levels. Set Style to Rush to use them.';
    toolsEl.appendChild(note);
  }
  quickEl.innerHTML = '';
  quickEl.append(toolButton('S', 'Start', TILES.S.tip), toolButton('G', 'Goal', TILES.G.tip), toolButton('.', 'Erase', 'Erase tiles. Right-click also erases.'), toolButton('hand', 'Move', 'Drag to scroll around the level.'));
}

/* ---------------- settings ---------------- */
function initSelects() {
  const theme = $('#ed-theme');
  for (const t of THEME_LIST) { const o = document.createElement('option'); o.value = t; o.textContent = THEME_NAMES[t]; theme.appendChild(o); }
  const form = $('#ed-form');
  for (const f of FORMS) { const o = document.createElement('option'); o.value = f; o.textContent = FORM_INFO[f].name; form.appendChild(o); }
  const speed = $('#ed-speed');
  for (const k in SPEED_NAMES) { const o = document.createElement('option'); o.value = k; o.textContent = SPEED_NAMES[k]; speed.appendChild(o); }
}
function syncStyle() {
  const rush = ED.lv.style === 'rush';
  document.querySelectorAll('.rush-only').forEach((el) => { el.hidden = !rush; });
  if (!rush && TILES[ED.tool] && TILES[ED.tool].rush) pickTool('#');
  renderTabs(); renderTools();
}

$('#ed-style').addEventListener('change', (e) => {
  ED.lv.style = e.target.value; syncStyle(); autosave();
  setMsg(ED.lv.style === 'rush'
    ? 'Rush: the player runs right on their own and only presses one button. Portals change how they move.'
    : 'Adventure: the player moves freely. Reach the Goal to win.');
});
$('#ed-theme').addEventListener('change', (e) => { ED.lv.theme = e.target.value; renderTools(); draw(); autosave(); });
$('#ed-form').addEventListener('change', (e) => { ED.lv.form = e.target.value; autosave(); });
$('#ed-speed').addEventListener('change', (e) => { ED.lv.speed = e.target.value; autosave(); });
$('#ed-name').addEventListener('input', () => { ED.lv.n = $('#ed-name').value; autosave(); });
$('#ed-width').addEventListener('change', (e) => resize(Number(e.target.value), ED.lv.h));
$('#ed-height').addEventListener('change', (e) => resize(ED.lv.w, Number(e.target.value)));

function resize(nw, nh) {
  pushUndo();
  const { w, h } = ED.lv, old = ED.a, a = [];
  const off = nh - h; // rows are added or removed at the top, the ground stays put
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const oy = y - off;
      if (oy < 0 || oy >= h) { a.push('.'); continue; }
      if (x < w) { a.push(old[oy * w + x]); continue; }
      const edge = old[oy * w + w - 1];
      a.push('#XL'.includes(edge) ? edge : '.');
    }
  }
  ED.a = a; ED.lv.w = nw; ED.lv.h = nh;
  if (!a.includes('S')) setMsg('The Start block got cut off. Place a new one, or press Undo.');
  sizeView(); clampScroll(); draw(); autosave();
}

/* ---------------- view ---------------- */
function sizeView() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(200, stageEl.clientWidth);
  const maxH = Math.max(220, Math.round(window.innerHeight * 0.58));
  const h = Math.min(maxH, ED.lv.h * ED.zoom);
  ED.view = { w, h }; ED.dpr = dpr;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  syncScrollbars();
}
function clampScroll() {
  const mx = Math.max(0, ED.lv.w * ED.zoom - ED.view.w), my = Math.max(0, ED.lv.h * ED.zoom - ED.view.h);
  ED.sx = Math.max(0, Math.min(mx, ED.sx)); ED.sy = Math.max(0, Math.min(my, ED.sy));
  syncScrollbars();
}
function syncScrollbars() {
  const mx = Math.max(0, ED.lv.w * ED.zoom - ED.view.w), my = Math.max(0, ED.lv.h * ED.zoom - ED.view.h);
  const sxEl = $('#ed-scroll-x'), syEl = $('#ed-scroll-y');
  sxEl.max = String(mx); sxEl.value = String(ED.sx); sxEl.hidden = mx === 0;
  syEl.max = String(my); syEl.value = String(ED.sy); syEl.hidden = my === 0;
}
$('#ed-scroll-x').addEventListener('input', (e) => { ED.sx = Number(e.target.value); draw(); });
$('#ed-scroll-y').addEventListener('input', (e) => { ED.sy = Number(e.target.value); draw(); });

function setZoom(z, cx = ED.view.w / 2, cy = ED.view.h / 2) {
  const old = ED.zoom;
  if (z === old) return;
  const wx = (ED.sx + cx) / old, wy = (ED.sy + cy) / old;
  ED.zoom = z;
  sizeView();
  ED.sx = wx * z - cx; ED.sy = wy * z - cy;
  clampScroll(); draw();
}
const zoomStep = (d) => { const i = ZOOMS.indexOf(ED.zoom); setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + d))]); };
$('#ed-zoom-in').addEventListener('click', () => zoomStep(1));
$('#ed-zoom-out').addEventListener('click', () => zoomStep(-1));

function draw() {
  if (!ED.lv) return;
  const { w: VW, h: VH } = ED.view, lv = ED.lv, z = ED.zoom, s = z / T;
  const th = THEMES[lv.theme] || THEMES.meadow;
  ctx.setTransform(ED.dpr, 0, 0, ED.dpr, 0, 0);
  ctx.fillStyle = '#3a4270'; ctx.fillRect(0, 0, VW, VH);
  ctx.save();
  ctx.translate(-ED.sx, -ED.sy);
  ctx.scale(s, s);
  const g = ctx.createLinearGradient(0, 0, 0, lv.h * T);
  g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, lv.w * T, lv.h * T);
  const x0 = Math.max(0, Math.floor(ED.sx / z)), x1 = Math.min(lv.w - 1, Math.ceil((ED.sx + VW) / z));
  const y0 = Math.max(0, Math.floor(ED.sy / z)), y1 = Math.min(lv.h - 1, Math.ceil((ED.sy + VH) / z));
  ctx.strokeStyle = lv.theme === 'night' || lv.theme === 'volcano' ? 'rgba(255,255,255,.12)' : 'rgba(29,35,64,.12)';
  ctx.lineWidth = 1 / s;
  ctx.beginPath();
  for (let x = x0; x <= x1 + 1; x++) { ctx.moveTo(x * T, y0 * T); ctx.lineTo(x * T, (y1 + 1) * T); }
  for (let y = y0; y <= y1 + 1; y++) { ctx.moveTo(x0 * T, y * T); ctx.lineTo((x1 + 1) * T, y * T); }
  ctx.stroke();
  // every 10 blocks, a stronger line to help count
  ctx.strokeStyle = 'rgba(29,35,64,.28)';
  ctx.beginPath();
  for (let x = Math.ceil(x0 / 10) * 10; x <= x1 + 1; x += 10) { ctx.moveTo(x * T, y0 * T); ctx.lineTo(x * T, (y1 + 1) * T); }
  ctx.stroke();
  const at = (x, y) => (x < 0 || y < 0 || x >= lv.w || y >= lv.h ? (y >= lv.h ? '#' : '.') : ED.a[y * lv.w + x]);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = ED.a[y * lv.w + x];
    if (c !== '.') drawTile(ctx, c, x * T, y * T, (dx, dy) => at(x + dx, y + dy), 0, lv.theme, 'editor');
  }
  const st = ED.stroke;
  if (st && st.box && st.start && st.cur) {
    const bx0 = Math.min(st.start.x, st.cur.x), by0 = Math.min(st.start.y, st.cur.y);
    const bx1 = Math.max(st.start.x, st.cur.x), by1 = Math.max(st.start.y, st.cur.y);
    ctx.fillStyle = st.erase ? 'rgba(255,80,80,.3)' : 'rgba(255,210,63,.35)';
    ctx.fillRect(bx0 * T, by0 * T, (bx1 - bx0 + 1) * T, (by1 - by0 + 1) * T);
    ctx.strokeStyle = '#ff5d8f'; ctx.lineWidth = 3 / s; ctx.strokeRect(bx0 * T, by0 * T, (bx1 - bx0 + 1) * T, (by1 - by0 + 1) * T);
  } else if (ED.hover && ED.tool !== 'hand') {
    ctx.strokeStyle = '#ff5d8f'; ctx.lineWidth = 3 / s;
    ctx.strokeRect(ED.hover.x * T + 1, ED.hover.y * T + 1, T - 2, T - 2);
  }
  ctx.restore();
  // coordinates readout
  if (ED.hover) {
    const label = `${ED.hover.x}, ${ED.hover.y}`;
    ctx.font = '700 12px Nunito, system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(29,35,64,.75)'; ctx.fillRect(6, 6, tw + 12, 20);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(label, 12, 20);
  }
}

/* ---------------- painting ---------------- */
function cellFrom(e) {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left + ED.sx) / ED.zoom), y = Math.floor((e.clientY - r.top + ED.sy) / ED.zoom);
  return x >= 0 && y >= 0 && x < ED.lv.w && y < ED.lv.h ? { x, y } : null;
}
function put(x, y, c) {
  const i = y * ED.lv.w + x;
  if (ED.a[i] === c) return false;
  if (c === 'S') for (let k = 0; k < ED.a.length; k++) if (ED.a[k] === 'S') ED.a[k] = '.';
  ED.a[i] = c;
  return true;
}
function paintLine(a, b, c) {
  // step between the last cell and this one so fast drags leave no gaps
  let { x, y } = a;
  const dx = Math.abs(b.x - x), dy = -Math.abs(b.y - y), sx = x < b.x ? 1 : -1, sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    put(x, y, c);
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
function pushUndo() {
  ED.undo.push({ w: ED.lv.w, h: ED.lv.h, d: ED.a.join('') });
  if (ED.undo.length > 100) ED.undo.shift();
  ED.redo = [];
}
function applySnap(s) {
  ED.a = s.d.split(''); ED.lv.w = s.w; ED.lv.h = s.h;
  fillSizeSelect($('#ed-width'), WIDTHS, s.w); fillSizeSelect($('#ed-height'), HEIGHTS, s.h);
  sizeView(); clampScroll(); draw(); autosave();
}
export function undo() { if (!ED.undo.length) return; ED.redo.push({ w: ED.lv.w, h: ED.lv.h, d: ED.a.join('') }); applySnap(ED.undo.pop()); }
export function redo() { if (!ED.redo.length) return; ED.undo.push({ w: ED.lv.w, h: ED.lv.h, d: ED.a.join('') }); applySnap(ED.redo.pop()); }
$('#ed-undo').addEventListener('click', undo);
$('#ed-redo').addEventListener('click', redo);

function setBox(on) {
  ED.box = on;
  $('#ed-brush').setAttribute('aria-pressed', String(!on));
  $('#ed-box').setAttribute('aria-pressed', String(on));
}
$('#ed-brush').addEventListener('click', () => setBox(false));
$('#ed-box').addEventListener('click', () => setBox(true));

canvas.addEventListener('pointerdown', (e) => {
  if (!ED.lv) return;
  e.preventDefault();
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* old browsers */ }
  if (e.button === 1 || ED.tool === 'hand') { ED.pan = { x: e.clientX, y: e.clientY, sx: ED.sx, sy: ED.sy }; return; }
  const cell = cellFrom(e);
  if (!cell) return;
  const erase = e.button === 2 || ED.tool === '.';
  const before = ED.a.join('');
  pushUndo();
  if (ED.box && ED.tool !== 'S') { ED.stroke = { box: true, start: cell, cur: cell, erase, before }; }
  else { ED.stroke = { last: cell, erase, before }; put(cell.x, cell.y, erase ? '.' : ED.tool); }
  draw();
});
canvas.addEventListener('pointermove', (e) => {
  if (!ED.lv) return;
  if (ED.pan) {
    ED.sx = ED.pan.sx - (e.clientX - ED.pan.x); ED.sy = ED.pan.sy - (e.clientY - ED.pan.y);
    clampScroll(); draw(); return;
  }
  const cell = cellFrom(e);
  const moved = !ED.hover || !cell || cell.x !== ED.hover.x || cell.y !== ED.hover.y;
  ED.hover = cell;
  const st = ED.stroke;
  if (st && cell) {
    if (st.box) st.cur = cell;
    else { paintLine(st.last, cell, st.erase ? '.' : ED.tool); st.last = cell; }
    draw();
  } else if (moved) draw();
});
function endStroke() {
  ED.pan = null;
  const st = ED.stroke;
  if (!st) return;
  ED.stroke = null;
  if (st.box) {
    const x0 = Math.min(st.start.x, st.cur.x), x1 = Math.max(st.start.x, st.cur.x);
    const y0 = Math.min(st.start.y, st.cur.y), y1 = Math.max(st.start.y, st.cur.y);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, st.erase ? '.' : ED.tool);
  }
  if (ED.a.join('') === st.before) ED.undo.pop();
  draw(); autosave();
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);
canvas.addEventListener('pointerleave', () => { ED.hover = null; if (!ED.stroke) draw(); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const r = canvas.getBoundingClientRect();
    const i = ZOOMS.indexOf(ED.zoom);
    const ni = Math.max(0, Math.min(ZOOMS.length - 1, i + (e.deltaY < 0 ? 1 : -1)));
    setZoom(ZOOMS[ni], e.clientX - r.left, e.clientY - r.top);
    return;
  }
  const canY = ED.lv.h * ED.zoom > ED.view.h;
  if (e.shiftKey || !canY) ED.sx += e.deltaY + e.deltaX;
  else { ED.sy += e.deltaY; ED.sx += e.deltaX; }
  clampScroll(); draw();
}, { passive: false });

addEventListener('keydown', (e) => {
  if (!ED.active || document.getElementById('view-edit').hidden || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
  if (document.querySelector('.modal:not([hidden])')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
  else if (mod && e.code === 'KeyY') { e.preventDefault(); redo(); }
  else if (!mod && e.code.startsWith('Arrow')) {
    e.preventDefault();
    const d = ED.zoom * 3;
    if (e.code === 'ArrowLeft') ED.sx -= d; if (e.code === 'ArrowRight') ED.sx += d;
    if (e.code === 'ArrowUp') ED.sy -= d; if (e.code === 'ArrowDown') ED.sy += d;
    clampScroll(); draw();
  }
});

new ResizeObserver(() => { if (ED.active && ED.lv) { sizeView(); clampScroll(); draw(); } }).observe(stageEl);

/* ---------------- autosave draft ---------------- */
let saveTimer = 0;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (ED.lv) store.set('draft', currentLevel()); }, 400);
}
export function getDraft() { return store.get('draft', null); }

initSelects();
