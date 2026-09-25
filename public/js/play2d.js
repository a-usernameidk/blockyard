// Runs a 2D level: game loop, controls, camera, effects and the score screen.
import { createGame, step, restart, T, STEP } from './engine2d.js';
import { drawBackground, drawMap, drawPlayer, drawWalker, drawPlatform, INK, THEMES } from './render2d.js';
import { FORM_INFO } from './format.js';
import { sfx, unlockAudio } from './audio.js';
import { profile, bests } from './api.js';

const VW = 800, VH = 450;
const $ = (s) => document.querySelector(s);

let G = null, opts = null, running = false, waiting = false, last = 0, acc = 0;
let cam = { x: 0, y: 0 }, shake = 0, parts = [], beams = [], trail = [], toast = null, winTimer = 0;
let color = '#ff6b35';
const input = { left: false, right: false, hold: false, pressed: false };
const hudCache = {};

const canvas = $('#game');
const ctx = canvas.getContext('2d');
function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = VW * dpr; canvas.height = VH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();

/* ---------------- public ---------------- */
// opts: { key, by, onExit, onRemix, onReport, onLike, canLike, onWin }
export function startPlay(level, o) {
  opts = o || {};
  color = profile.get().color;
  G = createGame(level);
  parts = []; beams = []; trail = []; toast = null; shake = 0; winTimer = 0;
  Object.keys(hudCache).forEach((k) => delete hudCache[k]);
  $('#play-title').textContent = level.n;
  $('#play-by').textContent = opts.by ? 'by ' + opts.by : '';
  $('#win').hidden = true;
  $('#hud-progress-wrap').hidden = !G.rush;
  $('#hud-keys').hidden = !level.d.includes('k');
  $('#hud-coins').hidden = G.totalCoins === 0;
  $('#touch-adv').hidden = G.rush;
  $('#touch-rush').hidden = !G.rush;
  $('#play-report').hidden = !opts.onReport;
  $('#play-hint').textContent = G.rush
    ? `One button: Space, Up, W, click or tap. You start as the ${FORM_INFO[G.p.form].name}. ${FORM_INFO[G.p.form].how} R restarts, Esc goes back.`
    : 'Arrow keys or WASD to move. Space or Up to jump. R restarts. Esc goes back.';
  const r = document.getElementById('ready');
  if (G.rush) {
    waiting = true;
    $('#ready-form').textContent = `${FORM_INFO[G.p.form].name}: ${FORM_INFO[G.p.form].how}`;
    r.hidden = false;
  } else { waiting = false; r.hidden = true; }
  snapCamera();
  releaseAll();
  fitCanvas();
  running = true; last = performance.now(); acc = 0;
  requestAnimationFrame(frame);
}

export function stopPlay() { running = false; releaseAll(); }
export function isPlaying() { return running; }

/* ---------------- loop ---------------- */
function frame(ts) {
  if (!running) return;
  const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000)); last = ts;
  if (!waiting && !G.won) {
    acc += dt;
    while (acc >= STEP) {
      step(G, input, STEP); acc -= STEP;
      if (G.won) break;
    }
  }
  if (G.won && winTimer > 0) { winTimer -= dt; if (winTimer <= 0) showWin(); }
  handleEvents();
  updateEffects(dt);
  updateCamera(dt);
  render(ts / 1000);
  updateHud();
  requestAnimationFrame(frame);
}

function handleEvents() {
  const heard = new Set();
  const once = (n) => { if (!heard.has(n)) { heard.add(n); sfx(n); } };
  for (const e of G.events) {
    switch (e.t) {
      case 'jump': once('jump'); dust(e.x, e.y, 5); break;
      case 'land': dust(e.x, e.y, 3); break;
      case 'flap': once('flap'); break;
      case 'flip': once('flip'); burst(e.x, e.y, '#ffffff', 6, 120); break;
      case 'coin': once('coin'); burst(e.x, e.y, '#ffd23f', 8, 140); break;
      case 'key': once('key'); burst(e.x, e.y, '#ffd23f', 12, 160); showToast('Got a key'); break;
      case 'door': once('door'); burst(e.x, e.y, '#8f6440', 6, 120); break;
      case 'bounce': once('bounce'); burst(e.x, e.y, '#ff5d8f', 10, 180); break;
      case 'ring': once('ring'); burst(e.x, e.y, e.c === 'y' ? '#ffd23f' : '#3a86ff', 10, 170); break;
      case 'portal': once('portal'); burst(e.x, e.y, '#ffffff', 10, 150); trail = []; break;
      case 'snap': once('snap'); beams.push({ x: e.x, y1: e.y, y2: e.y2, life: 0.18 }); break;
      case 'stomp': once('stomp'); burst(e.x, e.y, '#8a4fd6', 12, 200); shake = 0.12; break;
      case 'crumble': once('crumble'); burst(e.x, e.y, '#dcb47a', 8, 140); break;
      case 'checkpoint': once('checkpoint'); burst(e.x, e.y, '#44c06a', 12, 160); showToast('Checkpoint'); break;
      case 'die': once('die'); burst(e.x, e.y, color, 22, 280, true); shake = 0.3; break;
      case 'win':
        once('win'); confetti(); winTimer = 0.8;
        bests.record(opts.key || 'x', { progress: 1, won: true, time: Math.round(G.time * 10) / 10, deaths: G.deaths });
        if (opts.onWin) opts.onWin(G);
        break;
      case 'respawn': case 'restart': trail = []; snapCamera(); break;
    }
    if (e.t === 'die' && G.rush) bests.record(opts.key || 'x', { progress: Math.round(G.best * 100) / 100, won: false });
  }
  G.events.length = 0;
}

/* ---------------- effects ---------------- */
function burst(x, y, col, n, speed, squares) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.5 + Math.random() * 0.4, max: 0.9, col, size: squares ? 6 : 4, g: 500 });
  }
}
function dust(x, y, n) {
  for (let i = 0; i < n; i++) parts.push({ x: x + (Math.random() - 0.5) * 16, y, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 60, life: 0.3, max: 0.3, col: 'rgba(255,255,255,.8)', size: 4, g: 100 });
}
function confetti() {
  const cols = ['#ffd23f', '#ff5d8f', '#44c06a', '#3a86ff', '#b06cff'];
  for (let i = 0; i < 70; i++) parts.push({ x: cam.x + Math.random() * VW, y: cam.y - 10, vx: (Math.random() - 0.5) * 120, vy: Math.random() * 80, life: 2.2, max: 2.2, col: cols[i % 5], size: 6, g: 160 });
}
function showToast(text) { toast = { text, life: 1.3 }; }

function updateEffects(dt) {
  for (const p of parts) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  parts = parts.filter((p) => p.life > 0);
  if (parts.length > 400) parts.splice(0, parts.length - 400);
  for (const b of beams) b.life -= dt;
  beams = beams.filter((b) => b.life > 0);
  if (toast) { toast.life -= dt; if (toast.life <= 0) toast = null; }
  shake = Math.max(0, shake - dt);
  const p = G.p;
  if (G.rush && p.form === 'dart' && !G.dead) {
    trail.push({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
    if (trail.length > 40) trail.shift();
  } else if (trail.length) trail.shift();
}

/* ---------------- camera ---------------- */
function camTarget() {
  const p = G.p, worldW = G.w * T, worldH = G.h * T;
  let x, y;
  if (G.rush) x = p.x - VW * 0.3;
  else x = p.x + p.w / 2 - VW / 2 + p.face * 40;
  if (worldW <= VW) x = -(VW - worldW) / 2;
  else x = G.rush ? Math.max(0, x) : Math.max(0, Math.min(worldW - VW, x));
  y = p.y + p.h / 2 - VH * 0.55;
  if (worldH <= VH) y = worldH - VH;
  else y = Math.max(0, Math.min(worldH - VH, y));
  return { x, y };
}
function snapCamera() { const t = camTarget(); cam.x = t.x; cam.y = t.y; }
function updateCamera(dt) {
  if (G.dead) return;
  const t = camTarget();
  const k = 1 - Math.pow(0.001, dt);
  cam.x = G.rush ? t.x : cam.x + (t.x - cam.x) * k * 1.4;
  cam.y += (t.y - cam.y) * k * (G.rush ? 1.1 : 1.4);
}

/* ---------------- drawing ---------------- */
function render(t) {
  const sx = shake > 0 ? (Math.random() - 0.5) * 10 * shake / 0.3 : 0;
  const sy = shake > 0 ? (Math.random() - 0.5) * 10 * shake / 0.3 : 0;
  const cx = Math.round(cam.x + sx), cy = Math.round(cam.y + sy);
  drawBackground(ctx, G.lv.theme, cx, cy, VW, VH, t);
  ctx.save();
  ctx.translate(-cx, -cy);
  const shaking = new Set(G.crumbles.filter((c) => !c.gone).map((c) => c.i));
  const cpCol = G.cpIdx >= 0 ? G.cpIdx % G.w : -1;
  drawMap(ctx, G.map, G.w, G.h, Math.floor(cx / T) - 1, Math.ceil((cx + VW) / T) + 1, Math.floor(cy / T) - 1, Math.ceil((cy + VH) / T) + 1, t, G.lv.theme, 'game',
    (i) => ({ shake: shaking.has(i), active: i % G.w === cpCol }));
  for (const e of G.ents) {
    if (e.type === 'plat') drawPlatform(ctx, e.x, e.y, e.w);
    else if (e.type === 'walker' && e.alive) drawWalker(ctx, e, t);
  }
  if (G.rush) {
    ctx.font = '34px "Lilita One", system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.fillStyle = '#fff';
    const ax = G.spawnTile.x * T + 70, ay = Math.max(60, G.spawnTile.y * T - 70);
    ctx.strokeText(`Attempt ${G.attempt}`, ax, ay); ctx.fillText(`Attempt ${G.attempt}`, ax, ay);
  }
  if (trail.length > 1) {
    ctx.strokeStyle = color; ctx.lineWidth = G.p.mini ? 4 : 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(trail[0].x, trail[0].y);
    for (const q of trail) ctx.lineTo(q.x, q.y);
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  for (const b of beams) {
    ctx.globalAlpha = b.life / 0.18; ctx.fillStyle = '#fff';
    ctx.fillRect(b.x - 3, Math.min(b.y1, b.y2), 6, Math.abs(b.y2 - b.y1));
    ctx.globalAlpha = 1;
  }
  if (!G.dead) drawPlayer(ctx, G.p, color, t, G.rush);
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5));
    ctx.fillStyle = p.col; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (toast) {
    ctx.font = '26px "Lilita One", system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.fillStyle = '#ffd23f';
    const y = 70 - (1.3 - toast.life) * 10;
    ctx.globalAlpha = Math.min(1, toast.life * 3);
    ctx.strokeText(toast.text, VW / 2, y); ctx.fillText(toast.text, VW / 2, y);
    ctx.globalAlpha = 1;
  }
  if (G.dead) { ctx.fillStyle = 'rgba(255,93,143,.18)'; ctx.fillRect(0, 0, VW, VH); }
  void THEMES;
}

/* ---------------- HUD + score screen ---------------- */
function setHud(id, text) { if (hudCache[id] !== text) { hudCache[id] = text; $(id).textContent = text; } }
function updateHud() {
  setHud('#hud-coins', `Coins ${G.coins}/${G.totalCoins}`);
  setHud('#hud-keys', `Keys ${G.keys}`);
  if (G.rush) {
    setHud('#hud-time', `Attempt ${G.attempt}`);
    setHud('#hud-deaths', `${Math.floor(G.progress * 100)}%`);
    const pct = Math.floor(G.progress * 1000) / 10;
    if (hudCache.bar !== pct) { hudCache.bar = pct; $('#hud-bar').style.width = pct + '%'; }
    const b = bests.get(opts.key || 'x');
    setHud('#hud-best', b ? (b.won ? 'Beaten' : `Best ${Math.round(b.progress * 100)}%`) : 'Best 0%');
  } else {
    setHud('#hud-time', `${G.time.toFixed(1)}s`);
    setHud('#hud-deaths', `Falls ${G.deaths}`);
  }
}

function showWin() {
  const lines = G.rush
    ? `Beat it on attempt ${G.attempt} with ${G.coins} of ${G.totalCoins} coins.`
    : `${G.time.toFixed(1)} seconds, ${G.coins} of ${G.totalCoins} coins, ${G.deaths} ${G.deaths === 1 ? 'fall' : 'falls'}.`;
  $('#win-stats').textContent = lines;
  const like = $('#win-like');
  like.hidden = !opts.onLike;
  if (opts.onLike) { like.disabled = !!opts.liked; like.textContent = opts.liked ? 'Liked' : 'Like'; }
  $('#win').hidden = false;
  $('#win-again').focus();
}

/* ---------------- controls ---------------- */
function releaseAll() { input.left = input.right = input.hold = input.pressed = false; }
function press() {
  unlockAudio();
  if (waiting) { waiting = false; $('#ready').hidden = true; last = performance.now(); return; }
  if (!input.hold) input.pressed = true;
  input.hold = true;
}
function doRestart() { if (!G || G.won) return; restart(G); acc = 0; }

const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump' };
addEventListener('keydown', (e) => {
  if (!running) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  const k = KEYS[e.code];
  if (k) {
    e.preventDefault();
    if (e.repeat) return;
    if (G.won) return;
    if (k === 'jump') press();
    else { if (waiting && G.rush) press(); input[k] = true; }
  } else if (e.code === 'KeyR') { doRestart(); }
  else if (e.code === 'Escape') { if (opts.onExit) opts.onExit(); }
});
addEventListener('keyup', (e) => {
  const k = KEYS[e.code];
  if (!k) return;
  if (k === 'jump') input.hold = false; else input[k] = false;
});
addEventListener('blur', releaseAll);

// Rush: click or tap anywhere on the game.
const stage = $('#stage');
stage.addEventListener('pointerdown', (e) => {
  if (!running || G.won || e.target.closest('button')) return;
  if (!G.rush && !waiting) return;
  e.preventDefault(); press();
});
addEventListener('pointerup', () => { if (running && G && G.rush) input.hold = false; });
stage.addEventListener('contextmenu', (e) => e.preventDefault());

document.querySelectorAll('.tbtn').forEach((b) => {
  const k = b.dataset.k;
  const on = (e) => { e.preventDefault(); if (k === 'jump') press(); else input[k] = true; };
  const off = () => { if (k === 'jump') input.hold = false; else input[k] = false; };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
});

$('#play-restart').addEventListener('click', () => { doRestart(); $('#play-restart').blur(); });
$('#win-again').addEventListener('click', () => { const lv = G.lv; startPlay(lv, opts); });
$('#win-back').addEventListener('click', () => opts.onExit && opts.onExit());
$('#play-back').addEventListener('click', () => opts.onExit && opts.onExit());
$('#win-remix').addEventListener('click', () => opts.onRemix && opts.onRemix(G.lv));
$('#play-report').addEventListener('click', () => opts.onReport && opts.onReport());
$('#win-like').addEventListener('click', async () => {
  const b = $('#win-like');
  b.disabled = true;
  try { await opts.onLike(); opts.liked = true; b.textContent = 'Liked'; }
  catch (e) { b.disabled = false; b.textContent = 'Like'; }
});
