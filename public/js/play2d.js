// Runs a 2D level: game loop, controls, camera, effects, in-game HUD and the score screen.
import { createGame, step, restart, T, STEP } from './engine2d.js';
import { drawBackground, drawMap, drawPlayer, drawWalker, drawPlatform, drawTile, INK } from './render2d.js';
import { FORM_INFO } from './format.js';
import { sfx, unlockAudio, startMusic, stopMusic } from './audio.js';
import { profile, bests } from './api.js';

const VW = 800, VH = 450;
const $ = (s) => document.querySelector(s);

let G = null, opts = null, running = false, waiting = false, last = 0, acc = 0;
let cam = { x: 0, y: 0 }, shake = 0, parts = [], rings = [], beams = [], trail = [], flyers = [], toast = null, winTimer = 0;
let color = '#ff6b35', landFx = 0, coinBump = 0, oldBest = null;
const input = { left: false, right: false, hold: false, pressed: false };

const canvas = $('#game');
const ctx = canvas.getContext('2d');
function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = VW * dpr; canvas.height = VH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();

/* ---------------- public ---------------- */
// opts: { key, by, onExit, onRemix, onReport, onLike, liked, onNext, onWin }
export function startPlay(level, o) {
  opts = o || {};
  color = profile.get().color;
  G = createGame(level);
  parts = []; rings = []; beams = []; trail = []; flyers = []; toast = null; shake = 0; winTimer = 0; landFx = 0; coinBump = 0;
  oldBest = bests.get(opts.key || 'x');
  $('#play-title').textContent = level.n;
  $('#play-by').textContent = opts.by ? 'by ' + opts.by : '';
  $('#win').hidden = true;
  $('#touch-adv').hidden = G.rush;
  $('#touch-rush').hidden = !G.rush;
  $('#play-report').hidden = !opts.onReport;
  const f = FORM_INFO[G.p.form];
  $('#play-hint').textContent = G.rush
    ? `One button: Space, Up, W, click or tap. You start as the ${f.name}. ${f.how} R restarts, Esc goes back.`
    : 'Arrow keys or WASD to move. Space or Up to jump. R restarts. Esc goes back.';
  if (G.rush) showReady('Ready?', `${f.name}: ${f.how}`); else { waiting = false; $('#ready').hidden = true; }
  snapCamera();
  releaseAll();
  fitCanvas();
  running = true; last = performance.now(); acc = 0;
  if (!G.rush) startMusic('adventure');
  requestAnimationFrame(frame);
}

export function stopPlay() { running = false; releaseAll(); stopMusic(); }

function showReady(title, text) {
  waiting = true;
  $('#ready-title').textContent = title;
  $('#ready-form').textContent = text;
  $('#ready').hidden = false;
}

// Pause when the tab is hidden, so you don't die while looking away.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && running && G && !G.won && !waiting) { showReady('Paused', 'Take your time.'); releaseAll(); stopMusic(); }
});

/* ---------------- loop ---------------- */
function frame(ts) {
  if (!running) return;
  try {
    const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000)); last = ts;
    if (!waiting && !G.won) {
      acc += dt;
      while (acc >= STEP) { step(G, input, STEP); acc -= STEP; if (G.won) break; }
    }
    if (G.won && winTimer > 0) { winTimer -= dt; if (winTimer <= 0) showWin(); }
    handleEvents();
    updateEffects(dt);
    updateCamera(dt);
    render(ts / 1000);
  } catch (e) {
    running = false;
    dispatchEvent(new CustomEvent('blockyard-crash', { detail: e }));
    return;
  }
  requestAnimationFrame(frame);
}

function handleEvents() {
  const heard = new Set();
  const once = (n) => { if (!heard.has(n)) { heard.add(n); sfx(n); } };
  for (const e of G.events) {
    switch (e.t) {
      case 'jump': once('jump'); dust(e.x, e.y, 5); break;
      case 'land':
        if (e.v > 300) { landFx = 1; dust(e.x, e.y, 4); }
        if (e.v > 650) { rings.push({ x: e.x, y: e.y, life: 0.3 }); once('land'); }
        break;
      case 'flap': once('flap'); dust(e.x, e.y, 3); break;
      case 'flip': once('flip'); burst(e.x, e.y, '#ffffff', 6, 120); break;
      case 'coin': once('coin'); burst(e.x, e.y, '#ffd23f', 6, 110); flyers.push({ x: e.x - cam.x, y: e.y - cam.y, t: 0 }); break;
      case 'key': once('key'); burst(e.x, e.y, '#ffd23f', 12, 160); showToast('Got a key!'); break;
      case 'door': once('door'); burst(e.x, e.y, '#8f6440', 6, 120); break;
      case 'bounce': once('bounce'); burst(e.x, e.y, '#ff5d8f', 10, 180); rings.push({ x: e.x, y: e.y, life: 0.3 }); break;
      case 'ring': once('ring'); burst(e.x, e.y, e.c === 'y' ? '#ffd23f' : '#3a86ff', 10, 170); rings.push({ x: e.x, y: e.y, life: 0.3 }); break;
      case 'portal': once('portal'); burst(e.x, e.y, '#ffffff', 12, 160); trail = []; break;
      case 'snap': once('snap'); beams.push({ x: e.x, y1: e.y, y2: e.y2, life: 0.18 }); break;
      case 'stomp': once('stomp'); burst(e.x, e.y, '#8a4fd6', 12, 200); shake = 0.12; break;
      case 'crumble': once('crumble'); burst(e.x, e.y, '#dcb47a', 8, 140); break;
      case 'checkpoint': once('checkpoint'); burst(e.x, e.y, '#44c06a', 12, 160); showToast('Checkpoint!'); break;
      case 'die': {
        once('die'); burst(e.x, e.y, color, 22, 280, true); shake = 0.3;
        if (G.rush) {
          const prev = oldBest ? oldBest.progress : 0;
          if (G.best > prev + 0.005 && G.best > 0.05) showToast(`New best! ${Math.floor(G.best * 100)}%`);
          bests.record(opts.key || 'x', { progress: Math.round(G.best * 100) / 100, won: false });
          oldBest = bests.get(opts.key || 'x');
        }
        break;
      }
      case 'win':
        once('win'); confetti(); winTimer = 0.9; stopMusic();
        bests.record(opts.key || 'x', { progress: 1, won: true, time: Math.round(G.time * 10) / 10, deaths: G.deaths });
        if (opts.onWin) opts.onWin(G);
        break;
      case 'respawn': case 'restart': trail = []; snapCamera(); break;
    }
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
  for (let i = 0; i < n; i++) parts.push({ x: x + (Math.random() - 0.5) * 16, y, vx: (Math.random() - 0.5) * 90, vy: -Math.random() * 60, life: 0.3, max: 0.3, col: 'rgba(255,255,255,.85)', size: 5, g: 100, round: true });
}
function confetti() {
  const cols = ['#ffd23f', '#ff5d8f', '#44c06a', '#3a86ff', '#b06cff'];
  for (let i = 0; i < 70; i++) parts.push({ x: cam.x + Math.random() * VW, y: cam.y - 10, vx: (Math.random() - 0.5) * 120, vy: Math.random() * 80, life: 2.2, max: 2.2, col: cols[i % 5], size: 6, g: 160 });
}
function showToast(text) { toast = { text, life: 1.4 }; }

function updateEffects(dt) {
  for (const p of parts) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  parts = parts.filter((p) => p.life > 0);
  if (parts.length > 400) parts.splice(0, parts.length - 400);
  for (const r of rings) r.life -= dt;
  rings = rings.filter((r) => r.life > 0);
  for (const b of beams) b.life -= dt;
  beams = beams.filter((b) => b.life > 0);
  for (const f of flyers) { f.t += dt / 0.45; if (f.t >= 1) coinBump = 0.2; }
  flyers = flyers.filter((f) => f.t < 1);
  coinBump = Math.max(0, coinBump - dt);
  landFx = Math.max(0, landFx - dt * 7);
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
  let x = G.rush ? p.x - VW * 0.3 : p.x + p.w / 2 - VW / 2 + p.face * 40;
  if (worldW <= VW) x = -(VW - worldW) / 2;
  else x = G.rush ? Math.max(0, x) : Math.max(0, Math.min(worldW - VW, x));
  let y = p.y + p.h / 2 - VH * 0.55;
  y = worldH <= VH ? worldH - VH : Math.max(0, Math.min(worldH - VH, y));
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
function outlined(text, x, y, size, fill = '#fff', align = 'left') {
  ctx.font = `${size}px "Lilita One", system-ui, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(4, size / 5); ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

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
  if (G.rush) outlined(`Attempt ${G.attempt}`, G.spawnTile.x * T + 70, Math.max(60, G.spawnTile.y * T - 70), 34);
  if (trail.length > 1) {
    ctx.strokeStyle = color; ctx.lineWidth = G.p.mini ? 4 : 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(trail[0].x, trail[0].y);
    for (const q of trail) ctx.lineTo(q.x, q.y);
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  for (const b of beams) { ctx.globalAlpha = b.life / 0.18; ctx.fillStyle = '#fff'; ctx.fillRect(b.x - 3, Math.min(b.y1, b.y2), 6, Math.abs(b.y2 - b.y1)); }
  ctx.globalAlpha = 1;
  for (const r of rings) {
    const k = 1 - r.life / 0.3;
    ctx.globalAlpha = r.life / 0.3; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(r.x, r.y, 8 + k * 30, 3 + k * 8, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (!G.dead) drawPlayer(ctx, G.p, color, t, G.rush, { land: landFx });
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5));
    ctx.fillStyle = p.col;
    if (p.round) { ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (G.dead) { ctx.fillStyle = 'rgba(255,93,143,.18)'; ctx.fillRect(0, 0, VW, VH); }
  drawHud(t);
}

function drawHud(t) {
  let x = 18;
  const y = 30;
  if (G.totalCoins) {
    const s = 1 + coinBump * 1.5;
    ctx.save(); ctx.translate(x + 12, y); ctx.scale(s, s);
    drawTile(ctx, 'o', -16, -16, () => '.', 0, 'meadow', 'icon');
    ctx.restore();
    outlined(`${G.coins}/${G.totalCoins}`, x + 32, y + 1, 26);
    x += 44 + ctx.measureText(`${G.coins}/${G.totalCoins}`).width + 16;
  }
  if (G.lv.d.includes('k')) {
    drawTile(ctx, 'k', x - 4, y - 16, () => '.', 0, 'meadow', 'icon');
    outlined(`${G.keys}`, x + 30, y + 1, 26);
    x += 60;
  }
  for (const f of flyers) {
    const e = 1 - Math.pow(1 - f.t, 3);
    const fx = f.x + (30 - f.x) * e, fy = f.y + (y - f.y) * e - Math.sin(f.t * Math.PI) * 60;
    drawTile(ctx, 'o', fx - 16, fy - 16, () => '.', 0, 'meadow', 'icon');
  }
  if (G.rush) {
    outlined(`Attempt ${G.attempt}`, VW - 18, y + 1, 24, '#fff', 'right');
    const w = 260, bx = (VW - w) / 2, by = 18;
    ctx.fillStyle = 'rgba(29,35,64,.55)'; ctx.fillRect(bx - 3, by - 3, w + 6, 20);
    ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, w, 14);
    ctx.fillStyle = '#44c06a'; ctx.fillRect(bx, by, w * G.progress, 14);
    const best = oldBest ? oldBest.progress : 0;
    if (best > 0 && best < 1) { ctx.fillStyle = INK; ctx.fillRect(bx + w * best - 1.5, by - 3, 3, 20); }
    outlined(`${Math.floor(G.progress * 100)}%`, VW / 2, by + 32, 18, '#fff', 'center');
  } else {
    outlined(G.time.toFixed(1), VW - 18, y + 1, 26, '#fff', 'right');
    if (G.deaths) outlined(`Falls ${G.deaths}`, VW - 18, y + 30, 18, '#ffd0dc', 'right');
  }
  if (toast) {
    ctx.globalAlpha = Math.min(1, toast.life * 3);
    outlined(toast.text, VW / 2, 92 - (1.4 - toast.life) * 10, 30, '#ffd23f', 'center');
    ctx.globalAlpha = 1;
  }
  void t;
}

/* ---------------- score screen ---------------- */
function showWin() {
  const prev = oldBest && oldBest.won ? oldBest.time : null;
  const newBest = !G.rush && prev !== null && G.time < prev;
  $('#win-title').textContent = newBest ? 'New best!' : 'Level cleared!';
  $('#win-stats').textContent = G.rush
    ? `Beaten on attempt ${G.attempt}. Coins: ${G.coins} of ${G.totalCoins}.`
    : `Time: ${G.time.toFixed(1)} seconds${prev !== null ? ` (best ${Math.min(prev, G.time).toFixed(1)})` : ''}. Coins: ${G.coins} of ${G.totalCoins}. Falls: ${G.deaths}.`;
  const like = $('#win-like');
  like.hidden = !opts.onLike;
  if (opts.onLike) { like.disabled = !!opts.liked; like.textContent = opts.liked ? 'Liked' : 'Like'; }
  $('#win-next').hidden = !opts.onNext;
  $('#win').hidden = false;
  (opts.onNext ? $('#win-next') : $('#win-again')).focus();
}

/* ---------------- controls ---------------- */
function releaseAll() { input.left = input.right = input.hold = input.pressed = false; }
function press() {
  unlockAudio();
  if (waiting) {
    waiting = false; $('#ready').hidden = true; last = performance.now();
    startMusic(G.rush ? 'rush' : 'adventure');
    return;
  }
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
    if (e.repeat || G.won) return;
    if (k === 'jump' || waiting) press();
    if (k !== 'jump') input[k] = true;
  } else if (e.code === 'KeyR') doRestart();
  else if (e.code === 'Escape' && opts.onExit) opts.onExit();
});
addEventListener('keyup', (e) => {
  const k = KEYS[e.code];
  if (!k) return;
  if (k === 'jump') input.hold = false; else input[k] = false;
});
addEventListener('blur', releaseAll);

const stage = $('#stage');
stage.addEventListener('pointerdown', (e) => {
  if (!running || G.won || e.target.closest('button')) return;
  if (!G.rush && !waiting) return;
  e.preventDefault(); press();
});
addEventListener('pointerup', () => { if (running && G && G.rush) input.hold = false; });
stage.addEventListener('contextmenu', (e) => e.preventDefault());

document.querySelectorAll('.tbtn[data-k]').forEach((b) => {
  const k = b.dataset.k;
  const on = (e) => { e.preventDefault(); if (k === 'jump' || waiting) press(); if (k !== 'jump') input[k] = true; };
  const off = () => { if (k === 'jump') input.hold = false; else input[k] = false; };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
});

$('#play-restart').addEventListener('click', () => { doRestart(); $('#play-restart').blur(); });
$('#win-again').addEventListener('click', () => startPlay(G.lv, opts));
$('#win-next').addEventListener('click', () => opts.onNext && opts.onNext());
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
