// Runs a 2D level: game loop, controls, camera, effects, in-game HUD and the end screens.
// Modes: 'level' (normal), 'endless' (one life, go as far as you can), 'daily' (one life per attempt, retries forever).
import { actionOf } from './controls.js';
import { createGame, step, restart, dropCheckpoint, T, STEP } from './engine2d.js';
import { drawBackground, drawMap, drawPlayer, drawWalker, drawPlatform, drawTile, INK } from './render2d.js';
import { drawIcon } from './art.js';
import { FORM_INFO, FORMS } from './format.js';
import { inputBits, encodeReplay } from './replay.js';
import { sfx, unlockAudio, startMusic, stopMusic } from './audio.js';
import { mountMusicBox, unmountMusicBox } from './musicbox.js';
import { progress } from './progress.js';
import { store, api } from './api.js';
import { openRoom, loggedIn } from './net.js';

/* ---------------- playing together: see everyone else on the same level ----------------
   Built-in and published levels have live servers (world '2:<level id>'). Other players are see-through Pips
   with name tags: just to see, they can't touch you, and your run still counts only for you. */
let net = null, mates = new Map(), myId = null, sentAt = 0, sent = '';
const mateOf = (pl) => ({ name: pl.dn || pl.name, look: pl.look || {}, x: pl.p ? pl.p[0] : null, y: pl.p ? pl.p[1] : 0, tx: pl.p ? pl.p[0] : null, ty: pl.p ? pl.p[1] : 0, face: pl.r || 1, a: pl.a || 0 });
function netStart(room) {
  netStop();
  if (!room || !loggedIn()) return;
  net = openRoom(() => api.joinRoom({ world: room }), {
    message(m) {
      if (m.t === 'hello') { myId = m.you; mates = new Map(m.players.filter((x) => x.id !== m.you).map((x) => [x.id, mateOf(x)])); drawCount(); }
      else if (m.t === 'join' && m.player.id !== myId) { mates.set(m.player.id, mateOf(m.player)); drawCount(); }
      else if (m.t === 'leave') { mates.delete(m.id); drawCount(); }
      else if (m.t === 'st') { const o = mates.get(m.id); if (o) { if (o.tx == null) { o.x = m.p[0]; o.y = m.p[1]; } o.tx = m.p[0]; o.ty = m.p[1]; o.face = m.r; o.a = m.a; } }
    },
    drop() { mates.clear(); drawCount(); },
    closed() { mates.clear(); drawCount(); },
    error() { /* playing alone is fine */ },
  });
}
function netStop() { if (net) net.close(); net = null; mates.clear(); myId = null; sent = ''; drawCount(); }
function drawCount() { const el = $('#play-mates'); if (!el) return; const n = mates.size; el.hidden = !net || !n; el.textContent = `👥 ${n + 1} playing here`; }
// what I send: where I am, which way I face, and a byte: form (0-7) + 16 flipped + 32 dead + 64 mini
function netTick(now) {
  if (!net || !net.ready || !G) return;
  const p = G.p, a = Math.max(0, FORMS.indexOf(p.form)) | (p.grav < 0 ? 16 : 0) | (G.dead ? 32 : 0) | (p.mini ? 64 : 0);
  const msg = [Math.round(p.x), Math.round(p.y), p.face < 0 ? -1 : 1, a].join();
  if (now - sentAt < 100 || (msg === sent && now - sentAt < 2000)) return;
  sentAt = now; sent = msg;
  net.send({ t: 'st', p: [Math.round(p.x), Math.round(p.y), 0], r: p.face < 0 ? -1 : 1, a });
}
function drawMates(t, dt) {
  if (!mates.size) return;
  const k = Math.min(1, dt * 12);
  for (const o of mates.values()) {
    if (o.tx == null || (o.a & 32)) continue;
    o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k;
    const form = FORMS[o.a & 7] || 'hopper';
    const w = G.rush ? (o.a & 64 ? 16 : 26) : 22, h = G.rush ? (o.a & 64 ? 16 : 26) : 28;
    const fake = { x: o.x, y: o.y, w, h, face: o.face, form: G.rush ? form : 'hopper', grav: o.a & 16 ? -1 : 1, onGround: true, rot: 0, vx: G.rush ? 1 : 0, vy: 0, mini: !!(o.a & 64) };
    ctx.save(); ctx.globalAlpha = 0.5;
    drawPlayer(ctx, fake, o.look.color || '#ff6b35', t, G.rush, { hat: o.look.hat || 'none' });
    ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.85;
    outlined(o.name, o.x + w / 2, (o.a & 16) ? o.y + h + 20 : o.y - 16, 13, '#fff', 'center');
    ctx.restore();
  }
}

/* ---------------- tips: the first time you get near something new, it says what it is ---------------- */
const TIP2D = {
  y: 'Jump ring! Press jump while you touch it to jump again, even in the air.',
  r: 'Flip ring! Press jump while you touch it to flip gravity.',
  B: 'Bounce pad! Land on it and it springs you way up.',
  '=': "Ledge: jump up through it from below, then stand on top.",
  C: 'Crumble block: it breaks a moment after you land on it. Keep moving!',
  k: 'A key! Grab it, then walk into a door to open it.',
  D: 'Locked door. Find a key first, then touch the door.',
  P: 'Checkpoint! Touch the flag and you come back here if you fall.',
  M: 'Moving platform: stand on it and it carries you.',
  E: 'Walker! Jump on its head to beat it. Touching it from the side hurts.',
  I: 'Ice! It is slippery, so start slowing down early.',
  u: 'Upside-down portal: gravity flips and you fall UP.',
  n: 'This portal puts gravity back to normal.',
  '^': 'Spikes! Touch them and you go back to your last checkpoint.',
  v: 'Ceiling spikes! Watch your head.',
  L: "Lava! Don't touch it.",
  G: "That's the goal. Touch it to finish the level!",
  m: 'Tiny portal: you shrink, so you fit through small gaps.',
  q: 'This portal makes you full size again.',
  '<': 'Speed portal: things slow down.', '>': 'Speed portal: things speed up!', '*': 'Speed portal: very fast!',
};
for (const f of Object.values(FORM_INFO)) TIP2D[f.tile] = `${f.name} portal: you turn into the ${f.name}. ${f.how}`;
let tipEl = null, tipT = 0, tipWait = 0, tipsSeen = null;
function showTip(text) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'play-tip'; tipEl.setAttribute('role', 'status'); canvas.parentElement.append(tipEl); }
  tipEl.textContent = text; tipEl.classList.add('on'); tipT = 5;
}
function tipTick(dt) {
  if (tipT > 0) { tipT -= dt; if (tipT <= 0 && tipEl) tipEl.classList.remove('on'); return; }
  if ((tipWait -= dt) > 0 || !G) return;
  tipWait = 0.25;
  if (!tipsSeen) tipsSeen = new Set(store.get('tips-seen', []));
  const p = G.p, cx = Math.floor((p.x + p.w / 2) / T), cy = Math.floor((p.y + p.h / 2) / T);
  const x0 = cx - (G.rush ? 0 : 3), x1 = cx + (G.rush ? 10 : 7);
  for (let y = cy - 5; y <= cy + 5; y++) for (let x = x0; x <= x1; x++) {
    if (x < 0 || y < 0 || x >= G.w || y >= G.h) continue;
    const c = G.map[y * G.w + x];
    if (!TIP2D[c] || tipsSeen.has(c) || (c === G.p.form && false)) continue;
    // your first form is already explained on the Ready screen
    if (FORM_INFO[G.p.form] && FORM_INFO[G.p.form].tile === c) { tipsSeen.add(c); continue; }
    tipsSeen.add(c); store.set('tips-seen', [...tipsSeen]);
    showTip(TIP2D[c]);
    return;
  }
  // walkers and moving platforms aren't tiles once the level starts
  for (const e of G.ents) {
    const c = e.type === 'plat' ? 'M' : 'E';
    const ex = Math.floor(e.x / T), ey = Math.floor(e.y / T);
    if (e.alive === false || tipsSeen.has(c) || ex < x0 || ex > x1 || Math.abs(ey - cy) > 5) continue;
    tipsSeen.add(c); store.set('tips-seen', [...tipsSeen]);
    showTip(TIP2D[c]);
    return;
  }
}

const VW = 800, VH = 450;
const $ = (s) => document.querySelector(s);

let G = null, opts = null, running = false, waiting = false, over = false, last = 0, acc = 0;
let cam = { x: 0, y: 0 }, shake = 0, parts = [], rings = [], beams = [], trail = [], flyers = [], cosmetic = [], toast = null, endTimer = 0;
let look = { color: '#ff6b35', hat: 'none', trail: 'none' }, landFx = 0, coinBump = 0, oldBest = null, frames = [], trailT = 0;
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
// opts: { key, by, mode, onExit, onRemix, onReport, onLike, liked, onNext, onWin, onRunOver, onAttempt, onAgain }
export function startPlay(level, o) {
  opts = o || {};
  opts.mode = opts.mode || 'level';
  look = { ...progress.data.equip };
  opts.practice = !!opts.practice && level.style === 'rush' && opts.mode === 'level';
  G = createGame(level, { practice: opts.practice });
  parts = []; rings = []; beams = []; trail = []; flyers = []; cosmetic = []; toast = null; shake = 0; endTimer = 0; landFx = 0; coinBump = 0; over = false;
  frames = [];
  oldBest = progress.level(opts.key || 'x');
  $('#play-title').textContent = level.n;
  $('#play-by').textContent = opts.by ? 'by ' + opts.by : '';
  $('#win').hidden = true;
  $('#touch-adv').hidden = G.rush;
  $('#touch-rush').hidden = !G.rush;
  $('#play-report').hidden = !opts.onReport;
  $('#play-restart').hidden = opts.mode === 'endless';
  // Rush levels: practice mode (checkpoints, but no stars or coins)
  const pb = $('#play-practice');
  pb.hidden = !(G.rush && opts.mode === 'level');
  pb.textContent = opts.practice ? 'Normal mode' : 'Practice';
  pb.classList.toggle('btn-sun', !!opts.practice);
  $('#touch-cp').hidden = !opts.practice;
  const f = FORM_INFO[G.p.form];
  $('#play-hint').textContent = G.rush
    ? `One button: Space, Up, W, click or tap. You start as the ${f.name}. ${f.how}${opts.mode === 'level' ? ' R restarts.' : ''}${opts.practice ? ' Practice: flags are checkpoints, and C drops one where you stand.' : ''} Esc goes back.`
    : 'Arrow keys or WASD to move. Space or Up to jump. R restarts. Esc goes back.';
  const title = opts.mode === 'endless' ? 'Endless Rush' : opts.mode === 'daily' ? 'Daily challenge' : opts.practice ? 'Practice mode' : 'Ready?';
  const text = opts.mode === 'endless' ? 'One life. The further you go, the faster it gets.' : opts.mode === 'daily' ? 'Same course for everyone today. Your best run goes on the board.' : opts.practice ? 'Checkpoints are on (press C or tap ⚑ to drop your own). Practice runs don\'t give stars or coins.' : `${f.name}: ${f.how}`;
  if (G.rush) showReady(title, text); else { waiting = false; $('#ready').hidden = true; }
  snapCamera();
  releaseAll();
  fitCanvas();
  running = true; last = performance.now(); acc = 0;
  mountMusicBox($('#stage'));
  if (opts.room && opts.mode === 'level' && opts.room !== netRoom) { netRoom = opts.room; netStart(opts.room); } else if (!opts.room) { netRoom = null; netStop(); }
  if (location.search.includes('w3test')) window.__p2 = { mates: () => [...mates.values()].map((o) => ({ name: o.name, x: o.tx, y: o.ty })), flags: () => G.map.filter((c) => c === 'P').length, practice: () => !!G.practice, cp: () => !!G.cp, ground: () => G.p.onGround, x: () => G.p.x };
  if (!G.rush) startMusic(songFor());
  requestAnimationFrame(frame);
}

let netRoom = null;
export function stopPlay() { unmountMusicBox(); netStop(); netRoom = null; if (document.fullscreenElement === $('#view-play')) document.exitFullscreen().catch(() => {}); running = false; releaseAll(); stopMusic(); progress.flush(); if (tipEl) { tipEl.classList.remove('on'); tipT = 0; } }

function showReady(title, text) {
  waiting = true;
  $('#ready-title').textContent = title;
  $('#ready-form').textContent = text;
  $('#ready').hidden = false;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && running && G && !G.won && !waiting && !over) { showReady('Paused', 'Take your time.'); releaseAll(); stopMusic(); }
});

/* ---------------- loop ---------------- */
let lastDt = 0.016;
function frame(ts) {
  if (!running) return;
  try {
    const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000)); last = ts; lastDt = dt;
    netTick(ts);
    if (!waiting && !G.won && !over) {
      acc += dt;
      while (acc >= STEP) {
        frames.push(inputBits(input));
        const n = G.events.length;
        step(G, input, STEP); acc -= STEP;
        // a respawn back at the start begins a fresh run, so the recording starts over on this exact step
        for (let k = n; k < G.events.length; k++) if (G.events[k].t === 'respawn' && !G.cp) { frames = []; if (opts.mode === 'daily') G.best = 0; }
        if (G.won || over) break;
        if (opts.mode === 'endless' && G.dead) { over = true; break; }
      }
    }
    if (endTimer > 0) { endTimer -= dt; if (endTimer <= 0) showEnd(); }
    if (!waiting) tipTick(dt);
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
      case 'jump': once('jump'); dust(e.x, e.y, 5); progress.stat('jumps'); break;
      case 'land':
        if (e.v > 300) { landFx = 1; dust(e.x, e.y, 4); }
        if (e.v > 650) { rings.push({ x: e.x, y: e.y, life: 0.3 }); once('land'); }
        break;
      case 'flap': once('flap'); dust(e.x, e.y, 3); break;
      case 'flip': once('flip'); burst(e.x, e.y, '#ffffff', 6, 120); break;
      case 'coin': once('coin'); burst(e.x, e.y, '#ffd23f', 6, 110); flyers.push({ x: e.x - cam.x, y: e.y - cam.y, t: 0 }); progress.stat('coins'); break;
      case 'key': once('key'); burst(e.x, e.y, '#ffd23f', 12, 160); showToast('Got a key!'); break;
      case 'door': once('door'); burst(e.x, e.y, '#8f6440', 6, 120); break;
      case 'bounce': once('bounce'); burst(e.x, e.y, '#ff5d8f', 10, 180); rings.push({ x: e.x, y: e.y, life: 0.3 }); break;
      case 'ring': once('ring'); burst(e.x, e.y, e.c === 'y' ? '#ffd23f' : '#3a86ff', 10, 170); rings.push({ x: e.x, y: e.y, life: 0.3 }); break;
      case 'portal': once('portal'); burst(e.x, e.y, '#ffffff', 12, 160); trail = []; progress.stat('portals'); break;
      case 'snap': once('snap'); beams.push({ x: e.x, y1: e.y, y2: e.y2, life: 0.18 }); break;
      case 'stomp': once('stomp'); burst(e.x, e.y, '#8a4fd6', 12, 200); shake = 0.12; progress.stat('stomps'); break;
      case 'crumble': once('crumble'); burst(e.x, e.y, '#dcb47a', 8, 140); break;
      case 'checkpoint': once('checkpoint'); burst(e.x, e.y, '#44c06a', 12, 160); showToast('Checkpoint!'); break;
      case 'die': {
        once('die'); burst(e.x, e.y, look.color, 22, 280, true); shake = 0.3; progress.stat('deaths');
        if (opts.mode === 'endless') { endTimer = 0.9; stopMusic(); break; }
        if (opts.mode === 'daily') {
          const r = opts.onAttempt ? opts.onAttempt({ won: false, progress: G.best, replay: encodeReplay(frames) }) : null;
          if (r && r.newBest) showToast(`New best! ${Math.floor(G.best * 100)}%`);
          break;
        }
        if (G.rush && !opts.practice) {
          const prev = oldBest ? oldBest.progress : 0;
          if (G.best > prev + 0.005 && G.best > 0.05) showToast(`New best! ${Math.floor(G.best * 100)}%`);
          if (opts.key && opts.key !== 'test') progress.finish(opts.key, { won: false, progress: Math.round(G.best * 100) / 100 });
          oldBest = progress.level(opts.key || 'x');
        }
        break;
      }
      case 'win':
        once('win'); confetti(); endTimer = 0.9; stopMusic();
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

const TRAIL_COLORS = { sparkle: ['#ffffff', '#ffd23f'], bubbles: ['#bfefff'], hearts: ['#ff5d8f'], notes: ['#1d2340'], fire: ['#ff5a1f', '#ffb02e', '#ffd23f'], stars: ['#ffd23f', '#fff6c9'], lightning: ['#7cc8ff', '#ffffff', '#ffe66d'], confetti: ['#ff5d8f', '#ffd23f', '#44c06a', '#3a86ff', '#b06cff'], snow: ['#ffffff', '#dff4ff'], galaxy: ['#5a3fd6', '#b06cff', '#ffffff', '#7cc8ff'],
  leaves: ['#44c06a', '#2a8a45', '#a7e163'], mint: ['#2ec4b6', '#bff5ee'], lava: ['#ff5a1f', '#b5121b', '#ffb02e'], ice: ['#bfe6ff', '#ffffff', '#7cc8ff'],
  candy: ['#ff5d8f', '#ffffff', '#7cc8ff'], ocean: ['#0077b6', '#48cae4', '#caf0f8'], toxic: ['#39ff14', '#9dff7a', '#1d2340'], sakura: ['#ffb7c5', '#ff8fb1', '#fff0f5'],
  shadow: ['#1d2340', '#3d405b'], sunset: ['#ff9f1c', '#ff5d8f', '#b06cff'], goldtrail: ['#ffd23f', '#e0b12a', '#fff6c9'], void: ['#14161f', '#5a3fd6', '#b06cff'], paintsplat: ['#ff5d8f', '#3a86ff', '#ffd23f', '#44c06a'], frost: ['#dff4ff', '#7cc8ff', '#ffffff'], nebula: ['#5a3fd6', '#ff5d8f', '#7cc8ff', '#ffffff'], chosen: ['#ffd23f', '#ffffff', '#fff6c9'] };
// trails drawn as soft round blobs (the rest have their own shapes, or squares)
const ROUND_TRAILS = new Set(['paintsplat', 'nebula', 'chosen', 'frost', 'leaves', 'mint', 'lava', 'candy', 'ocean', 'toxic', 'sakura', 'shadow', 'sunset', 'goldtrail', 'void']);
function spawnTrail(dt) {
  const kind = look.trail, p = G.p;
  if (!kind || kind === 'none' || G.dead || kind === 'rainbow') return;
  trailT -= dt;
  if (trailT > 0) return;
  const moving = G.rush || Math.abs(p.vx) > 40 || !p.onGround;
  if (!moving) return;
  trailT = kind === 'fire' ? 0.03 : 0.07;
  const cols = TRAIL_COLORS[kind] || ['#ffffff']; // a trail without its own colors still works
  cosmetic.push({ kind, x: p.x + p.w / 2 - (G.rush ? p.w / 2 : 0) + (Math.random() - 0.5) * 8, y: p.y + p.h * (0.3 + Math.random() * 0.5), vx: (Math.random() - 0.5) * 30, vy: kind === 'fire' || kind === 'bubbles' ? -40 - Math.random() * 30 : (Math.random() - 0.5) * 30, life: 0.7, max: 0.7, col: cols[Math.floor(Math.random() * cols.length)], rot: Math.random() * 6 });
}

function updateEffects(dt) {
  for (const p of parts) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  parts = parts.filter((p) => p.life > 0);
  if (parts.length > 400) parts.splice(0, parts.length - 400);
  spawnTrail(dt);
  for (const c of cosmetic) { c.life -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += dt * 3; }
  cosmetic = cosmetic.filter((c) => c.life > 0);
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
  const ribbon = (G.rush && p.form === 'dart') || look.trail === 'rainbow';
  if (ribbon && !G.dead) {
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
function drawCosmetic(c) {
  ctx.globalAlpha = Math.max(0, c.life / c.max);
  ctx.fillStyle = c.col; ctx.strokeStyle = c.col;
  const s = 4 + (1 - c.life / c.max) * 3;
  ctx.save(); ctx.translate(c.x, c.y);
  if (c.kind === 'sparkle' || c.kind === 'stars') {
    ctx.rotate(c.rot); ctx.beginPath();
    const n = c.kind === 'stars' ? 5 : 4;
    for (let i = 0; i < n * 2; i++) { const r = i % 2 ? s * 0.4 : s * 1.2, a = i * Math.PI / n; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
  } else if (c.kind === 'bubbles') { ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.stroke(); }
  else if (c.kind === 'hearts') { ctx.beginPath(); ctx.moveTo(0, s); ctx.bezierCurveTo(-s * 1.6, -s * 0.4, -s * 0.5, -s * 1.5, 0, -s * 0.4); ctx.bezierCurveTo(s * 0.5, -s * 1.5, s * 1.6, -s * 0.4, 0, s); ctx.fill(); }
  else if (c.kind === 'notes') { ctx.beginPath(); ctx.ellipse(0, s, s * 0.7, s * 0.5, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(s * 0.4, -s * 1.2, 1.8, s * 2.2); }
  else if (c.kind === 'lightning') { ctx.rotate(c.rot * 0.3); ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 1.4); ctx.lineTo(s * 0.5, -s * 0.2); ctx.lineTo(0, -s * 0.1); ctx.lineTo(s * 0.3, s * 1.4); ctx.lineTo(-s * 0.5, s * 0.1); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill(); }
  else if (ROUND_TRAILS.has(c.kind)) { ctx.beginPath(); ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2); ctx.fill(); }
  else { ctx.fillRect(-s / 2, -s / 2, s, s); }
  ctx.restore();
  ctx.globalAlpha = 1;
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
  if (G.rush && opts.mode === 'level') outlined(opts.practice ? 'Practice' : `Attempt ${G.attempt}`, G.spawnTile.x * T + 70, Math.max(60, G.spawnTile.y * T - 70), 34);
  if (opts.mode === 'endless' && progress.data.stats.endlessBest > 20) {
    const bx = progress.data.stats.endlessBest * T;
    if (bx > cx - 20 && bx < cx + VW + 20) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(bx - 2, 64, 4, G.h * T - 128); outlined('Best', bx, 84, 20, '#ffd23f', 'center'); }
  }
  if (trail.length > 1) {
    const rainbow = look.trail === 'rainbow' && !(G.rush && G.p.form === 'dart');
    const cols = rainbow ? ['#ff5d8f', '#ff9f1c', '#ffd23f', '#44c06a', '#3a86ff', '#b06cff'] : [look.color];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = 0.65;
    cols.forEach((c, k) => {
      const off = rainbow ? (k - 2.5) * 3 : 0;
      ctx.strokeStyle = c; ctx.lineWidth = rainbow ? 3 : (G.p.mini ? 4 : 7);
      ctx.beginPath(); ctx.moveTo(trail[0].x, trail[0].y + off);
      for (const q of trail) ctx.lineTo(q.x, q.y + off);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }
  for (const c of cosmetic) drawCosmetic(c);
  for (const b of beams) { ctx.globalAlpha = b.life / 0.18; ctx.fillStyle = '#fff'; ctx.fillRect(b.x - 3, Math.min(b.y1, b.y2), 6, Math.abs(b.y2 - b.y1)); }
  ctx.globalAlpha = 1;
  for (const r of rings) {
    const k = 1 - r.life / 0.3;
    ctx.globalAlpha = r.life / 0.3; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(r.x, r.y, 8 + k * 30, 3 + k * 8, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawMates(t, lastDt);
  if (!G.dead) drawPlayer(ctx, G.p, look.color, t, G.rush, { land: landFx, hat: look.hat });
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5));
    ctx.fillStyle = p.col;
    if (p.round) { ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (G.dead) { ctx.fillStyle = 'rgba(255,93,143,.18)'; ctx.fillRect(0, 0, VW, VH); }
  drawHud();
}

function drawHud() {
  let x = 18;
  const y = 30;
  if (G.totalCoins) {
    const s = 1 + coinBump * 1.5;
    ctx.save(); ctx.translate(x + 12, y); ctx.scale(s, s);
    drawTile(ctx, 'o', -16, -16, () => '.', 0, 'meadow', 'icon');
    ctx.restore();
    const txt = opts.mode === 'endless' ? `${G.coins}` : `${G.coins}/${G.totalCoins}`;
    outlined(txt, x + 32, y + 1, 26);
    x += 44 + ctx.measureText(txt).width + 16;
  }
  if (G.lv.d.includes('k')) {
    drawTile(ctx, 'k', x - 4, y - 16, () => '.', 0, 'meadow', 'icon');
    outlined(`${G.keys}`, x + 30, y + 1, 26);
  }
  for (const f of flyers) {
    const e = 1 - Math.pow(1 - f.t, 3);
    drawTile(ctx, 'o', f.x + (30 - f.x) * e - 16, f.y + (y - f.y) * e - Math.sin(f.t * Math.PI) * 60 - 16, () => '.', 0, 'meadow', 'icon');
  }
  if (opts.mode === 'endless') {
    outlined(`${Math.floor(G.p.x / T)} m`, VW - 18, y + 1, 30, '#fff', 'right');
    outlined(`Best ${Math.floor(progress.data.stats.endlessBest)} m`, VW - 18, y + 32, 18, '#ffd23f', 'right');
  } else if (G.rush) {
    outlined(opts.practice ? `Practice · attempt ${G.attempt}` : `Attempt ${G.attempt}`, VW - 18, y + 1, 24, opts.practice ? '#ffd23f' : '#fff', 'right');
    const w = 260, bx = (VW - w) / 2, by = 18;
    ctx.fillStyle = 'rgba(29,35,64,.55)'; ctx.fillRect(bx - 3, by - 3, w + 6, 20);
    ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, w, 14);
    ctx.fillStyle = '#44c06a'; ctx.fillRect(bx, by, w * G.progress, 14);
    const best = opts.mode === 'daily' ? (opts.dailyBest || 0) : oldBest ? oldBest.progress : 0;
    if (best > 0 && best < 1) { ctx.fillStyle = INK; ctx.fillRect(bx + w * best - 1.5, by - 3, 3, 20); }
    outlined(`${Math.floor(G.progress * 100)}%`, VW / 2, by + 32, 18, '#fff', 'center');
  } else {
    outlined(G.runTime.toFixed(1), VW - 18, y + 1, 26, '#fff', 'right');
    if (G.deaths) outlined(`Falls ${G.deaths}`, VW - 18, y + 30, 18, '#ffd0dc', 'right');
  }
  if (toast) {
    ctx.globalAlpha = Math.min(1, toast.life * 3);
    outlined(toast.text, VW / 2, 92 - (1.4 - toast.life) * 10, 30, '#ffd23f', 'center');
    ctx.globalAlpha = 1;
  }
}

/* ---------------- end screens ---------------- */
function starCanvas(on, size = 46) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = size * dpr; cv.height = size * dpr; cv.style.width = cv.style.height = size + 'px';
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  if (!on) c.globalAlpha = 0.25;
  drawIcon(c, 'star', 0, 0, size);
  return cv;
}

function showEnd() {
  const stars = $('#win-stars'), reward = $('#win-reward');
  stars.innerHTML = ''; reward.textContent = '';
  const replay = encodeReplay(frames);
  let title = 'Level cleared!', stats = '', againLabel = 'Play again';
  if (opts.mode === 'endless') {
    const dist = Math.floor(G.p.x / T);
    const r = opts.onRunOver ? opts.onRunOver({ distance: dist, coins: G.coins, replay }) : { newBest: false, earned: 0 };
    title = r.newBest ? 'New best!' : 'Run over';
    stats = `You made it ${dist} m${r.newBest ? '' : ` (best ${Math.floor(r.best)} m)`}.`;
    if (r.earned) reward.textContent = `+${r.earned} coins`;
    againLabel = 'Run again';
  } else if (opts.practice) {
    title = 'Practice done!';
    stats = `You made it to the end in practice (attempt ${G.attempt}). Now beat it for real, with no checkpoints, for stars and coins.`;
    againLabel = 'Try it for real';
  } else if (opts.mode === 'daily') {
    const r = opts.onAttempt ? opts.onAttempt({ won: true, progress: 1, replay }) : null;
    title = 'Daily cleared!';
    stats = `Cleared on attempt ${G.attempt}.`;
    if (r && r.earned) reward.textContent = `+${r.earned} coins`;
  } else {
    const r = opts.onWin ? opts.onWin({ won: true, progress: 1, time: G.runTime, deaths: G.runDeaths, coins: G.coins, totalCoins: G.totalCoins, replay, rush: G.rush }) : null;
    stats = G.rush
      ? `Beaten on attempt ${G.attempt}. Coins: ${G.coins} of ${G.totalCoins}.`
      : `Time: ${G.runTime.toFixed(1)} seconds. Coins: ${G.coins} of ${G.totalCoins}. Falls: ${G.deaths}.`;
    if (r) {
      if (r.newBest) title = 'New best!';
      if (r.stars) r.stars.forEach((on, i) => { const cv = starCanvas(on); if (r.newStars && r.newStars.includes(i)) cv.classList.add('star-new'); stars.append(cv); });
      if (r.goals) stats += ' ' + r.goals;
      if (r.coinsEarned) reward.textContent = `+${r.coinsEarned} coins`;
      if (r.note) reward.textContent = r.note;
    }
  }
  $('#win-title').textContent = title;
  $('#win-stats').textContent = stats;
  $('#win-again').textContent = againLabel;
  const like = $('#win-like'), dislike = $('#win-dislike');
  like.hidden = !opts.onLike; dislike.hidden = !opts.onDislike;
  // opts.liked: true / 'like' = liked, 'dislike' = disliked
  const mine = opts.liked === true ? 'like' : opts.liked || '';
  if (opts.onLike) { like.disabled = mine === 'like'; like.textContent = mine === 'like' ? 'Liked 👍' : 'Like 👍'; }
  if (opts.onDislike) { dislike.disabled = mine === 'dislike'; dislike.textContent = mine === 'dislike' ? 'Disliked 👎' : 'Dislike 👎'; }
  $('#win-next').hidden = !opts.onNext;
  $('#win-remix').hidden = opts.mode !== 'level';
  $('#win').hidden = false;
  (opts.onNext ? $('#win-next') : $('#win-again')).focus();
  if (opts.afterEnd) opts.afterEnd();
}

// each Adventure theme has its own little tune
const songFor = () => ({ frost: 'snow', night: 'space', volcano: 'volcano' })[G.lv.theme] || 'adventure';
/* ---------------- controls ---------------- */
function releaseAll() { input.left = input.right = input.hold = input.pressed = false; }
function press() {
  unlockAudio();
  if (waiting) {
    waiting = false; $('#ready').hidden = true; last = performance.now();
    startMusic(G.rush ? 'rush' : songFor());
    return;
  }
  if (!input.hold) input.pressed = true;
  input.hold = true;
}
function doRestart() { if (!G || G.won || over || opts.mode === 'endless') return; restart(G); acc = 0; frames = []; }
function again() { if (opts.practice) { setPractice(false); return; } if (opts.onAgain) opts.onAgain(); else startPlay(G.lv, opts); }
function setPractice(on) { stopMusic(); startPlay(G.lv, { ...opts, practice: on }); }
function dropCp() { if (running && G && G.practice && !waiting) dropCheckpoint(G); }

// your keys from Settings > Controls (the arrow keys always work too)
const KEY2D = { left: 'left', right: 'right', jump: 'jump', fwd: 'jump' };
const keyFor = (code) => KEY2D[actionOf(code)] || null;
addEventListener('keydown', (e) => {
  if (!running) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (document.querySelector('.modal:not([hidden])')) return;
  const k = keyFor(e.code);
  if (k) {
    e.preventDefault();
    if (e.repeat) return;
    if (G.won || over) { if (k === 'jump' && !$('#win').hidden && document.activeElement === document.body) again(); return; }
    if (k === 'jump' || waiting) press();
    if (k !== 'jump') input[k] = true;
  } else if (actionOf(e.code) === 'respawn') doRestart();
  else if (e.code === 'KeyC' && G && G.practice) { e.preventDefault(); if (!e.repeat) dropCp(); }
  else if (e.code === 'Escape' && opts.onExit) opts.onExit();
});
addEventListener('keyup', (e) => {
  const k = keyFor(e.code);
  if (!k) return;
  if (k === 'jump') input.hold = false; else input[k] = false;
});
addEventListener('blur', releaseAll);

const stage = $('#stage');
stage.addEventListener('pointerdown', (e) => {
  if (!running || G.won || over || e.target.closest('button')) return;
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
$('#play-practice').addEventListener('click', () => { $('#play-practice').blur(); if (G) setPractice(!opts.practice); });
$('#touch-cp').addEventListener('pointerdown', (e) => { e.preventDefault(); dropCp(); });
// full screen: the whole play area (bar, game and touch buttons)
const view = $('#view-play'), fsBtn = $('#play-full');
if (!view.requestFullscreen) fsBtn.hidden = true;
fsBtn.addEventListener('click', () => { fsBtn.blur(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else view.requestFullscreen().catch(() => {}); });
document.addEventListener('fullscreenchange', () => { fsBtn.textContent = document.fullscreenElement === view ? 'Exit full screen' : 'Full screen'; });
$('#win-again').addEventListener('click', again);
$('#win-next').addEventListener('click', () => opts.onNext && opts.onNext());
$('#win-back').addEventListener('click', () => opts.onExit && opts.onExit());
$('#play-back').addEventListener('click', () => opts.onExit && opts.onExit());
$('#win-remix').addEventListener('click', () => opts.onRemix && opts.onRemix(G.lv));
$('#play-report').addEventListener('click', () => opts.onReport && opts.onReport());
$('#win-like').addEventListener('click', async () => {
  const b = $('#win-like');
  b.disabled = true;
  try { await opts.onLike(); opts.liked = 'like'; b.textContent = 'Liked 👍'; const d = $('#win-dislike'); d.disabled = false; d.textContent = 'Dislike 👎'; }
  catch (e) { b.disabled = false; b.textContent = 'Like 👍'; }
});
$('#win-dislike').addEventListener('click', async () => {
  const b = $('#win-dislike');
  b.disabled = true;
  try { await opts.onDislike(); opts.liked = 'dislike'; b.textContent = 'Disliked 👎'; const l = $('#win-like'); l.disabled = false; l.textContent = 'Like 👍'; }
  catch (e) { b.disabled = false; b.textContent = 'Dislike 👎'; }
});
