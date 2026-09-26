// 2D game engine: physics and rules only. No drawing, no DOM.
// render2d.js draws what this file simulates, play2d.js runs the loop.
//
// Units: pixels and seconds. One tile is T pixels.
// Gravity can flip, so "up" for the player is always -p.grav.

import { TILES, FORM_INFO, SPEEDS } from './format.js';

export const T = 32;
export const STEP = 1 / 120; // physics runs at a fixed 120 steps per second

const SOLID = new Set(Object.keys(TILES).filter((c) => TILES[c].solid));
const PORTAL_FORM = {};
for (const f in FORM_INFO) PORTAL_FORM[FORM_INFO[f].tile] = f;

// Rush tuning. Change these to change how each form feels.
export const RUSH = {
  speed: 310,
  hopper: { g: 2700, jump: 640, term: 900 },
  jet: { up: 1700, down: 1300, max: 400 },
  roller: { g: 2400, term: 820 },
  flapper: { g: 1900, flap: 470, term: 720 },
  springer: { g: 2700, v: 430, hold: 0.22, term: 900 },
  snapper: { g: 2700, term: 900 },
  glider: { g: 1700, term: 470 },
  pad: 900, ring: 640, clip: 9,
};
// Adventure tuning.
export const ADV = { g: 1800, jump: 690, term: 900, run: 230, accGround: 2600, accAir: 1500, accIce: 420, pad: 1000, ring: 640, stomp: 520 };

const FLYING = new Set(['jet', 'dart', 'flapper', 'glider']);

/* ---------------- setup ---------------- */
export function createGame(level) {
  const G = {
    lv: level, w: level.w, h: level.h, rush: level.style === 'rush',
    map: level.d.split(''), ents: [], crumbles: [],
    time: 0, runTime: 0, runDeaths: 0, attempt: 1, deaths: 0, coins: 0, keys: 0,
    totalCoins: 0, won: false, dead: false, deadT: 0,
    events: [], cp: null, cpIdx: -1, ringUsed: -1,
    progress: 0, best: 0, _cow: false,
  };
  let spawn = 0;
  for (let i = 0; i < G.map.length; i++) {
    const c = G.map[i];
    if (c === 'o') G.totalCoins++;
    if (c === 'S') { spawn = i; G.map[i] = '.'; }
    if (c === 'E') {
      G.map[i] = '.';
      const tx = i % G.w, ty = (i / G.w) | 0;
      G.ents.push({ type: 'walker', x: tx * T + 3, y: ty * T + 8, w: 26, h: 24, vx: -60, vy: 0, alive: true, onGround: false });
    }
  }
  // runs of 'M' in a row become one moving platform
  for (let ty = 0; ty < G.h; ty++) {
    for (let tx = 0; tx < G.w; tx++) {
      if (G.map[ty * G.w + tx] !== 'M') continue;
      let n = 0;
      while (tx + n < G.w && G.map[ty * G.w + tx + n] === 'M') { G.map[ty * G.w + tx + n] = '.'; n++; }
      G.ents.push({ type: 'plat', x: tx * T, y: ty * T, w: n * T, h: 14, x0: tx * T, dir: 1, dx: 0 });
      tx += n - 1;
    }
  }
  G.spawnTile = { x: spawn % G.w, y: (spawn / G.w) | 0 };
  G.p = makePlayer(G);
  G.init = snapshot(G);
  return G;
}

function makePlayer(G) {
  const lv = G.lv, rush = G.rush;
  const p = {
    x: 0, y: 0, w: 22, h: 28, vx: 0, vy: 0, grav: 1, onGround: false,
    form: rush ? lv.form : 'hopper', mini: false, speed: rush ? SPEEDS[lv.speed] : 1,
    coyote: 0, buffer: 0, face: 1, rot: 0, spring: 0, plat: -1, groundTile: '.',
    prevY: 0, jumpT: 0,
  };
  const s = size(p.form, false, rush);
  p.w = s.w; p.h = s.h;
  p.x = G.spawnTile.x * T + (T - p.w) / 2;
  p.y = (G.spawnTile.y + 1) * T - p.h;
  p.prevY = p.y;
  return p;
}

function size(form, mini, rush) {
  if (!rush) return { w: 22, h: 28 };
  const base = form === 'dart' ? 18 : 28;
  const s = mini ? Math.round(base * 0.6) : base;
  return { w: s, h: s };
}

function resize(p, rush) {
  const s = size(p.form, p.mini, rush);
  const cx = p.x + p.w / 2;
  if (p.grav === 1) { const bottom = p.y + p.h; p.h = s.h; p.y = bottom - p.h; }
  else { p.h = s.h; }
  p.w = s.w; p.x = cx - p.w / 2;
}

/* ---------------- snapshots (checkpoints + respawn) ---------------- */
function snapshot(G) {
  const map = G.map.slice();
  for (const c of G.crumbles) map[c.i] = 'C';
  return { map, ents: G.ents.map((e) => ({ ...e })), coins: G.coins, keys: G.keys, p: { ...G.p, buffer: 0 } };
}
function restore(G, s) {
  G.map = s.map.slice(); G._cow = false;
  G.ents = s.ents.map((e) => ({ ...e }));
  G.coins = s.coins; G.keys = s.keys; G.crumbles = [];
  G.p = { ...s.p }; G.ringUsed = -1;
}

// Cheap copy used by the level-checking bot (maps are copied only when changed).
export function cloneGame(G) {
  const c = { ...G, p: { ...G.p }, ents: G.ents.map((e) => ({ ...e })), crumbles: G.crumbles.map((x) => ({ ...x })), events: [], _cow: true };
  G._cow = true;
  return c;
}

export function restart(G) {
  G.cp = null; G.cpIdx = -1;
  restore(G, G.init);
  G.dead = false; G.won = false; G.time = 0; G.runTime = 0; G.deaths = 0; G.runDeaths = 0; G.attempt++;
  G.events.push({ t: 'restart' });
}

/* ---------------- tiles ---------------- */
function tileAt(G, tx, ty) {
  if (tx < 0) return '#';
  if (tx >= G.w) return G.rush ? '.' : '#';
  if (ty < 0) return G.rush ? '#' : '.';
  if (ty >= G.h) return '.';
  return G.map[ty * G.w + tx];
}
function setTile(G, i, c) {
  if (G._cow) { G.map = G.map.slice(); G._cow = false; }
  G.map[i] = c;
}
const solid = (c) => SOLID.has(c);
const overlap = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

function firstSolid(G, x, y, w, h) {
  const x0 = Math.floor(x / T), x1 = Math.floor((x + w - 0.001) / T);
  const y0 = Math.floor(y / T), y1 = Math.floor((y + h - 0.001) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const c = tileAt(G, tx, ty);
    if (solid(c)) return { tx, ty, c };
  }
  return null;
}

function ev(G, t, x, y, extra) { G.events.push({ t, x, y, ...extra }); }

function openDoor(G, tx, ty) {
  if (G.keys <= 0) return false;
  G.keys--;
  const stack = [[tx, ty]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (tileAt(G, x, y) !== 'D' || x < 0 || y < 0 || x >= G.w || y >= G.h) continue;
    setTile(G, y * G.w + x, '.');
    ev(G, 'door', x * T + T / 2, y * T + T / 2);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return true;
}

/* ---------------- movement with collisions ---------------- */
function moveX(G, dx) {
  const p = G.p;
  if (!dx) return;
  p.x += dx;
  for (let k = 0; k < 4; k++) {
    const hit = firstSolid(G, p.x, p.y, p.w, p.h);
    if (!hit) return;
    if (hit.c === 'D' && openDoor(G, hit.tx, hit.ty)) continue;
    const top = hit.ty * T, bottom = top + T;
    if (G.rush && dx > 0) {
      // Clipping the corner of a block? Pop on top instead of crashing.
      if (p.grav === 1 && p.y + p.h - top <= RUSH.clip && p.vy >= -1) { p.y = top - p.h; p.onGround = true; continue; }
      if (p.grav === -1 && bottom - p.y <= RUSH.clip && p.vy <= 1) { p.y = bottom; p.onGround = true; continue; }
      p.x = hit.tx * T - p.w;
      return die(G);
    }
    if (dx > 0) p.x = hit.tx * T - p.w; else p.x = (hit.tx + 1) * T;
    p.vx = 0;
  }
}

function moveY(G, dy) {
  const p = G.p;
  const prevBottom = p.y + p.h;
  const was = p.onGround;
  p.y += dy;
  p.onGround = false; p.plat = -1;
  let bounce = false;
  for (let k = 0; k < 4; k++) {
    const hit = firstSolid(G, p.x, p.y, p.w, p.h);
    if (!hit) break;
    if (hit.c === 'D' && openDoor(G, hit.tx, hit.ty)) continue;
    const top = hit.ty * T;
    if (dy > 0) {
      p.y = top - p.h;
      if (p.grav === 1) land(G, hit, was);
      if (hit.c === 'B' && p.grav === 1) bounce = true;
    } else if (dy < 0) {
      p.y = top + T;
      if (p.grav === -1) land(G, hit, was);
      if (hit.c === 'B' && p.grav === -1) bounce = true;
    } else break;
    p.vy = 0;
  }
  // ledges and movers only hold you from above, with normal gravity
  if (dy > 0 && p.grav === 1) {
    const x0 = Math.floor(p.x / T), x1 = Math.floor((p.x + p.w - 0.001) / T);
    const ty = Math.floor((p.y + p.h - 0.001) / T);
    for (let tx = x0; tx <= x1; tx++) {
      if (tileAt(G, tx, ty) === '=' && prevBottom <= ty * T + 0.5) {
        p.y = ty * T - p.h; land(G, { c: '=' }, was); p.vy = 0;
      }
    }
    for (let i = 0; i < G.ents.length; i++) {
      const e = G.ents[i];
      if (e.type !== 'plat') continue;
      if (p.x < e.x + e.w && p.x + p.w > e.x && prevBottom <= e.y + 0.5 && p.y + p.h >= e.y) {
        p.y = e.y - p.h; land(G, { c: 'M' }, was); p.vy = 0; p.plat = i;
      }
    }
  }
  if (bounce) {
    p.vy = -p.grav * (G.rush ? RUSH.pad * (p.mini ? 0.85 : 1) : ADV.pad);
    p.onGround = false; p.coyote = 0;
    ev(G, 'bounce', p.x + p.w / 2, p.y + (p.grav === 1 ? p.h : 0));
  }
}

function land(G, hit, was) {
  const p = G.p;
  if (!was && !p.onGround) ev(G, 'land', p.x + p.w / 2, p.y + (p.grav === 1 ? p.h : 0), { v: Math.abs(p.vy) });
  p.onGround = true; p.groundTile = hit.c;
  if (hit.c === 'C' && hit.tx !== undefined) startCrumble(G, hit.ty * G.w + hit.tx);
}

function startCrumble(G, i) {
  if (!G.crumbles.some((c) => c.i === i)) G.crumbles.push({ i, t: 0, gone: false });
}

/* ---------------- entities ---------------- */
function updateEnts(G, dt) {
  const p = G.p;
  for (let i = 0; i < G.ents.length; i++) {
    const e = G.ents[i];
    if (e.type === 'plat') {
      const nx = e.x + e.dir * 70 * dt;
      if (Math.abs(nx - e.x0) > 4 * T || nx < 0 || nx + e.w > G.w * T || firstSolid(G, nx, e.y, e.w, e.h)) { e.dir *= -1; e.dx = 0; }
      else { e.dx = nx - e.x; e.x = nx; }
      if (p.plat === i && p.onGround && e.dx) moveX(G, e.dx);
    } else if (e.type === 'walker' && e.alive) {
      e.vy = Math.min(e.vy + ADV.g * dt, ADV.term);
      e.x += e.vx * dt;
      const hx = firstSolid(G, e.x, e.y, e.w, e.h);
      if (hx) { e.x = e.vx > 0 ? hx.tx * T - e.w : (hx.tx + 1) * T; e.vx = -e.vx; }
      const prevBottom = e.y + e.h;
      e.y += e.vy * dt; e.onGround = false;
      const hy = firstSolid(G, e.x, e.y, e.w, e.h);
      if (hy) { if (e.vy > 0) { e.y = hy.ty * T - e.h; e.onGround = true; } else e.y = (hy.ty + 1) * T; e.vy = 0; }
      else {
        const ty = Math.floor((e.y + e.h) / T);
        const cells = [Math.floor(e.x / T), Math.floor((e.x + e.w - 0.001) / T)];
        if (e.vy > 0 && cells.some((tx) => tileAt(G, tx, ty) === '=') && prevBottom <= ty * T + 0.5) { e.y = ty * T - e.h; e.vy = 0; e.onGround = true; }
      }
      if (e.onGround) {
        // turn around at edges, spikes and lava
        const fx = e.vx > 0 ? e.x + e.w + 1 : e.x - 1;
        const tx = Math.floor(fx / T), footRow = Math.floor((e.y + e.h + 1) / T), bodyRow = Math.floor((e.y + e.h - 1) / T);
        const below = tileAt(G, tx, footRow), ahead = tileAt(G, tx, bodyRow);
        if (!(solid(below) || below === '=') || ahead === '^' || ahead === 'L') e.vx = -e.vx;
      }
      if (e.y > G.h * T + 200) e.alive = false;
    }
  }
}

function updateCrumbles(G, dt) {
  const p = G.p;
  for (let k = G.crumbles.length - 1; k >= 0; k--) {
    const c = G.crumbles[k];
    c.t += dt;
    if (!c.gone && c.t > 0.5) {
      c.gone = true; c.t = 0; setTile(G, c.i, '.');
      ev(G, 'crumble', (c.i % G.w) * T + T / 2, ((c.i / G.w) | 0) * T + T / 2);
    } else if (c.gone && c.t > 3) {
      const tx = c.i % G.w, ty = (c.i / G.w) | 0;
      if (!overlap(p.x, p.y, p.w, p.h, tx * T, ty * T, T, T)) { setTile(G, c.i, 'C'); G.crumbles.splice(k, 1); }
    }
  }
}

/* ---------------- player physics ---------------- */
function adventure(G, input, dt) {
  const p = G.p;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const ice = p.onGround && p.groundTile === 'I';
  const acc = p.onGround ? (ice ? ADV.accIce : ADV.accGround) : ADV.accAir;
  const target = dir * ADV.run * p.speed;
  p.vx = p.vx < target ? Math.min(target, p.vx + acc * dt) : Math.max(target, p.vx - acc * dt);
  if (dir) p.face = dir;
  p.coyote = p.onGround ? 0.1 : p.coyote - dt;
  if (p.buffer > 0 && p.coyote > 0) {
    p.vy = -p.grav * ADV.jump; p.buffer = 0; p.coyote = 0; p.onGround = false; p.jumpT = 0.15;
    ev(G, 'jump', p.x + p.w / 2, p.y + (p.grav === 1 ? p.h : 0));
  }
  const rising = p.vy * p.grav < 0;
  const g = rising && !input.hold ? ADV.g * 2.2 : ADV.g;
  p.vy += p.grav * g * dt;
  p.vy = Math.max(-ADV.term, Math.min(ADV.term, p.vy));
  moveX(G, p.vx * dt);
  if (!G.dead) moveY(G, p.vy * dt);
}

function rush(G, input, dt) {
  const p = G.p, R = RUSH;
  const g = p.grav, m = p.mini;
  p.vx = R.speed * p.speed;
  p.coyote = p.onGround ? 0.06 : p.coyote - dt;
  const canJump = p.coyote > 0;
  switch (p.form) {
    case 'hopper': {
      if (canJump && (p.buffer > 0 || input.hold)) {
        p.vy = -g * R.hopper.jump * (m ? 0.84 : 1); p.buffer = 0; p.coyote = 0; p.onGround = false;
        ev(G, 'jump', p.x + p.w / 2, p.y + (g === 1 ? p.h : 0));
      }
      p.vy = clamp(p.vy + g * R.hopper.g * dt, R.hopper.term);
      break;
    }
    case 'jet': {
      const k = m ? 1.15 : 1;
      p.vy += g * (input.hold ? -R.jet.up : R.jet.down) * k * dt;
      p.vy = clamp(p.vy, R.jet.max * (m ? 1.1 : 1));
      break;
    }
    case 'roller': {
      if (canJump && (p.buffer > 0 || input.hold)) {
        p.grav = -g; p.vy = p.grav * 150; p.buffer = 0; p.coyote = 0; p.onGround = false;
        ev(G, 'flip', p.x + p.w / 2, p.y + p.h / 2);
      }
      p.vy = clamp(p.vy + p.grav * R.roller.g * dt, R.roller.term);
      break;
    }
    case 'flapper': {
      if (p.buffer > 0) {
        p.vy = -g * R.flapper.flap * (m ? 0.88 : 1); p.buffer = 0; p.onGround = false;
        ev(G, 'flap', p.x + p.w / 2, p.y + p.h);
      }
      p.vy = clamp(p.vy + g * R.flapper.g * dt, R.flapper.term);
      break;
    }
    case 'dart': {
      p.vy = (input.hold ? -g : g) * p.vx * (m ? 2 : 1);
      break;
    }
    case 'springer': {
      const S = R.springer;
      if (canJump && (p.buffer > 0 || input.hold) && p.spring <= 0) {
        p.spring = S.hold; p.buffer = 0; p.coyote = 0; p.onGround = false;
        ev(G, 'jump', p.x + p.w / 2, p.y + (g === 1 ? p.h : 0));
      }
      if (p.spring > 0 && input.hold) { p.vy = -g * S.v * (m ? 0.85 : 1); p.spring -= dt; }
      else { p.spring = 0; p.vy = clamp(p.vy + g * S.g * dt, S.term); }
      break;
    }
    case 'snapper': {
      if (canJump && p.buffer > 0) snap(G);
      p.vy = clamp(p.vy + p.grav * R.snapper.g * dt, R.snapper.term);
      break;
    }
    case 'glider': {
      if (p.buffer > 0) {
        p.grav = -g; p.vy *= 0.35; p.buffer = 0;
        ev(G, 'flip', p.x + p.w / 2, p.y + p.h / 2);
      }
      p.vy = clamp(p.vy + p.grav * R.glider.g * dt, R.glider.term);
      break;
    }
  }
  moveY(G, p.vy * dt);
  if (!G.dead) moveX(G, p.vx * dt);
  // spin and tilt, just for looks
  const f = p.form;
  if (f === 'hopper') {
    if (p.onGround) { const q = Math.PI / 2; p.rot += (Math.round(p.rot / q) * q - p.rot) * Math.min(1, dt * 25); }
    else p.rot += p.grav * 7.5 * dt;
  } else if (f === 'roller') p.rot += p.grav * (p.vx / (p.w / 2)) * dt;
  else if (f === 'dart') p.rot = Math.atan2(p.vy, p.vx);
  else if (FLYING.has(f)) p.rot = Math.atan2(p.vy, p.vx) * 0.45;
  else p.rot = 0;
}
const clamp = (v, max) => Math.max(-max, Math.min(max, v));

function snap(G) {
  const p = G.p;
  const x0 = Math.floor(p.x / T), x1 = Math.floor((p.x + p.w - 0.001) / T);
  const rowSolid = (r) => { for (let tx = x0; tx <= x1; tx++) if (solid(tileAt(G, tx, r))) return true; return false; };
  const fromY = p.y + p.h / 2;
  if (p.grav === 1) {
    let r = Math.floor((p.y - 0.001) / T);
    while (r >= 0 && !rowSolid(r)) r--;
    p.y = (r + 1) * T; // r = -1 means the top edge of the level
    p.grav = -1;
  } else {
    let r = Math.floor((p.y + p.h + 0.001) / T);
    while (r < G.h && !rowSolid(r)) r++;
    p.grav = 1;
    if (r >= G.h) { p.vy = 400; p.buffer = 0; p.coyote = 0; p.onGround = false; return; }
    p.y = r * T - p.h;
  }
  p.vy = 0; p.onGround = true; p.buffer = 0; p.coyote = 0;
  ev(G, 'snap', p.x + p.w / 2, fromY, { y2: p.y + p.h / 2 });
}

/* ---------------- touching things ---------------- */
// Rings go first so a press near a ring uses the ring, not the form's own move.
function rings(G) {
  const p = G.p;
  const x0 = Math.floor((p.x - 4) / T), x1 = Math.floor((p.x + p.w + 4) / T);
  const y0 = Math.floor((p.y - 4) / T), y1 = Math.floor((p.y + p.h + 4) / T);
  let touching = false;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const c = tileAt(G, tx, ty);
    if (c !== 'y' && c !== 'r') continue;
    if (!overlap(p.x - 4, p.y - 4, p.w + 8, p.h + 8, tx * T, ty * T, T, T)) continue;
    touching = true;
    const i = ty * G.w + tx;
    if (p.buffer > 0 && G.ringUsed !== i) {
      G.ringUsed = i; p.buffer = 0; p.coyote = 0; p.spring = 0; p.onGround = false;
      if (c === 'y') p.vy = -p.grav * (G.rush ? RUSH.ring * (p.mini ? 0.85 : 1) : ADV.ring);
      else { p.grav = -p.grav; p.vy = p.grav * 280; }
      ev(G, 'ring', tx * T + 16, ty * T + 16, { c });
    }
  }
  if (!touching) G.ringUsed = -1;
}

function triggers(G) {
  const p = G.p;
  const ins = G.rush ? 4 : 3;
  const hx = p.x + ins, hy = p.y + ins, hw = p.w - ins * 2, hh = p.h - ins * 2;
  const x0 = Math.floor((p.x - 4) / T), x1 = Math.floor((p.x + p.w + 4) / T);
  const y0 = Math.floor((p.y - 4) / T), y1 = Math.floor((p.y + p.h + 4) / T);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || ty < 0 || tx >= G.w || ty >= G.h) continue;
      const i = ty * G.w + tx, c = G.map[i];
      if (c === '.' || SOLID.has(c)) continue;
      const X = tx * T, Y = ty * T;
      const inTile = overlap(p.x, p.y, p.w, p.h, X, Y, T, T);
      switch (c) {
        case 'o':
          if (overlap(p.x, p.y, p.w, p.h, X + 6, Y + 6, 20, 20)) { setTile(G, i, '.'); G.coins++; ev(G, 'coin', X + 16, Y + 16); }
          break;
        case 'k':
          if (overlap(p.x, p.y, p.w, p.h, X + 6, Y + 6, 20, 20)) { setTile(G, i, '.'); G.keys++; ev(G, 'key', X + 16, Y + 16); }
          break;
        case '^': if (overlap(hx, hy, hw, hh, X + 10, Y + 12, 12, 20)) return die(G); break;
        case 'v': if (overlap(hx, hy, hw, hh, X + 10, Y, 12, 20)) return die(G); break;
        case 'L': if (overlap(hx, hy, hw, hh, X, Y + 9, T, T - 9)) return die(G); break;
        case 'P':
          if (inTile && G.cpIdx !== i) checkpoint(G, i, tx, ty);
          break;
        case 'G': if (inTile) return win(G); break;
        case 'u': if (inTile && p.grav !== -1) { p.grav = -1; p.vy *= 0.5; p.onGround = false; ev(G, 'portal', X + 16, Y + 16, { c }); } break;
        case 'n': if (inTile && p.grav !== 1) { p.grav = 1; p.vy *= 0.5; p.onGround = false; ev(G, 'portal', X + 16, Y + 16, { c }); } break;
        default:
          if (!inTile) break;
          // Adventure levels have speed portals too (they change how fast you run)
          if (!G.rush) { if (c in SPEEDS && p.speed !== SPEEDS[c]) { p.speed = SPEEDS[c]; ev(G, 'portal', X + 16, Y + 16, { c }); } break; }
          if (PORTAL_FORM[c] && p.form !== PORTAL_FORM[c]) {
            p.form = PORTAL_FORM[c]; p.spring = 0; p.rot = 0;
            if (FLYING.has(p.form)) p.vy *= 0.5;
            resize(p, true);
            ev(G, 'portal', X + 16, Y + 16, { c });
          } else if (c in SPEEDS && p.speed !== SPEEDS[c]) {
            p.speed = SPEEDS[c]; ev(G, 'portal', X + 16, Y + 16, { c });
          } else if ((c === 'm' && !p.mini) || (c === 'q' && p.mini)) {
            p.mini = c === 'm'; resize(p, true); ev(G, 'portal', X + 16, Y + 16, { c });
          }
      }
    }
  }

  for (const e of G.ents) {
    if (e.type !== 'walker' || !e.alive || !overlap(hx, hy, hw, hh, e.x, e.y, e.w, e.h)) continue;
    const stomp = p.grav === 1 ? p.vy > 0 && p.prevY + p.h <= e.y + 10 : p.vy < 0 && p.prevY >= e.y + e.h - 10;
    if (stomp) {
      e.alive = false;
      p.vy = -p.grav * ADV.stomp; p.onGround = false;
      ev(G, 'stomp', e.x + e.w / 2, e.y + e.h / 2);
    } else return die(G);
  }

  if (G.rush && p.x > G.w * T) return win(G);
  if (p.y > G.h * T + 96 || p.y < -8 * T) return die(G);
}

function checkpoint(G, i, tx, ty) {
  const same = G.cpIdx >= 0 && G.cpIdx % G.w === tx; // a column of flags counts as one
  G.cpIdx = i;
  const snap = snapshot(G);
  if (!G.rush) {
    const p = snap.p;
    p.x = tx * T + (T - p.w) / 2;
    p.y = p.grav === 1 ? (ty + 1) * T - p.h : ty * T;
    p.vx = 0; p.vy = 0; p.plat = -1;
  }
  G.cp = snap;
  if (!same) ev(G, 'checkpoint', tx * T + 16, ty * T + 16);
}

function die(G) {
  if (G.dead || G.won) return;
  G.dead = true; G.deadT = G.rush ? 0.7 : 0.45; G.deaths++; G.runDeaths++;
  ev(G, 'die', G.p.x + G.p.w / 2, G.p.y + G.p.h / 2);
}
function win(G) {
  if (G.won || G.dead) return;
  G.won = true; G.progress = 1; G.best = 1;
  ev(G, 'win', G.p.x + G.p.w / 2, G.p.y + G.p.h / 2);
}

/* ---------------- one physics step ---------------- */
// input = { left, right, hold, pressed }. pressed is set by the key handler and cleared here.
export function step(G, input, dt = STEP) {
  if (G.won) return;
  if (G.dead) {
    G.deadT -= dt;
    if (G.deadT <= 0) {
      G.dead = false;
      if (!G.cp) { G.runTime = 0; G.runDeaths = 0; }
      restore(G, G.cp || G.init);
      if (G.rush) G.attempt++;
      G.events.push({ t: 'respawn' });
    }
    return;
  }
  G.time += dt; G.runTime += dt;
  const p = G.p;
  if (input.pressed) { p.buffer = G.rush ? 0.1 : 0.12; input.pressed = false; } else p.buffer -= dt;
  p.prevY = p.y;
  if (p.jumpT > 0) p.jumpT -= dt;
  updateCrumbles(G, dt);
  updateEnts(G, dt);
  if (G.dead) return;
  rings(G);
  if (G.rush) rush(G, input, dt); else adventure(G, input, dt);
  if (!G.dead && !G.won) triggers(G);
  if (G.rush) {
    G.progress = Math.max(0, Math.min(1, (p.x + p.w) / (G.w * T)));
    if (G.progress > G.best) G.best = G.progress;
  }
}
