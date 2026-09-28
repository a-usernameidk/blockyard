// 3D movement and rules. Fixed 60 steps a second and no randomness, so the same buttons
// always give the same run. The server replays runs with this exact file to check wins.
import { Grid, decodeBlocks, scan, idx, B, BLOCKS, SX, SY, SZ, SHAPE } from './world.js';
import { decodeReplay } from './replay.js';
import { initLogic, logicStep } from './logic.js';
import { GEAR_MODS } from './cosmetics.js';

export const STEP3 = 1 / 60;
export const P3 = {
  speed: 7, accel: 70, airAccel: 32, friction: 60, iceAccel: 9, iceFriction: 2.5,
  gravity: 32, jump: 11, bounce: 18.5, maxFall: 40,
  coyote: 6, boost: 1.6, boostSteps: 90,
  halfW: 0.34, height: 1.5, step: 0.55, snap: 0.45,
  crumbleDelay: 36, crumbleGone: 180, belt: 4,
  moveRange: 4, movePeriod: 240,
};
// How far moving platforms are from home at a step (the same for every platform, so they move in step).
export function moverOffset(steps) {
  const h = P3.movePeriod / 2, ph = ((steps % P3.movePeriod) + P3.movePeriod) % P3.movePeriod;
  return (ph < h ? ph / h : 2 - ph / h) * P3.moveRange;
}

// Camera direction is saved as one of 256 angles. The table is rounded so every browser agrees.
export const YAWS = 256;
const SIN = new Float64Array(YAWS), COS = new Float64Array(YAWS);
for (let i = 0; i < YAWS; i++) {
  SIN[i] = Math.round(Math.sin(i * 2 * Math.PI / YAWS) * 1e6) / 1e6;
  COS[i] = Math.round(Math.cos(i * 2 * Math.PI / YAWS) * 1e6) / 1e6;
}
export const yawIndex = (rad) => ((Math.round(rad / (2 * Math.PI) * YAWS) % YAWS) + YAWS) % YAWS;
export const yawAngle = (i) => i * 2 * Math.PI / YAWS;
// input bits: 1 forward, 2 back, 4 left, 8 right, 16 jump, 32 reset (go back to the last checkpoint)
export const KEY = { fwd: 1, back: 2, left: 4, right: 8, jump: 16, reset: 32 };
export const packInput = (bits, yaw) => (bits << 8) | yaw;

const KIND = new Uint8Array(64); // 1 solid, 2 kill, 4 goal, 8 coin, 16 crumble
BLOCKS.forEach((b, i) => {
  if (!b) return;
  let k = 0;
  if (!b.entity && !b.ghost && b.mover == null) k |= 1; // movers are solid, but handled separately
  if (b.kill) k |= 2;
  if (i === B.goal) k |= 4;
  if (i === B.coin) k |= 8;
  if (i === B.crumble) k |= 16;
  KIND[i] = k;
});

export function createSim(world, grid) {
  if (!grid) grid = decodeBlocks(world.b);
  const info = scan(grid);
  const sp = info.spawn || [64, 0, 64];
  const spawn = { x: sp[0] + 0.5, y: sp[1] + 1, z: sp[2] + 0.5 };
  // teleporters, grouped by color, in a fixed order (so every replay goes the same way)
  const tps = new Map();
  for (const [x, y, z, c] of [...info.tps].sort((a, b) => idx(a[0], a[1], a[2]) - idx(b[0], b[1], b[2]))) { if (!tps.has(c)) tps.set(c, []); tps.get(c).push([x, y, z]); }
  // moving platforms: [x, y, z, axis] (axis 0 = x, 1 = y, 2 = z), sorted so every run is the same
  const movers = [...info.movers].sort((a, b) => idx(a[0], a[1], a[2]) - idx(b[0], b[1], b[2])).map(([x, y, z, t]) => [x, y, z, BLOCKS[t].mover]);
  const S = {
    tps, tpLock: false, movers, mOff: 0,
    grid, t: grid.t, info, obby: world.mode !== 'hangout',
    spawn, cp: null, cpIdx: -1,
    p: { ...spawn }, v: { x: 0, y: 0, z: 0 },
    onGround: false, air: 0, lastJump: 0, lastReset: 0, boost: 0, facing: 0,
    crumbles: new Map(), got: new Set(), coins: 0, totalCoins: info.coins.length,
    deaths: 0, steps: 0, runSteps: 0, won: false, events: [],
    fallY: grid.lowest() - 8,
  };
  // the world's Logic scripts (and switch blocks back to how they were built)
  S.logic = initLogic(S, world.logic);
  return S;
}

function cellKind(S, x, y, z) {
  if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) return 0;
  const i = x + z * SX + y * SX * SZ;
  const k = KIND[S.t[i]];
  if (k & 16) { const c = S.crumbles.get(i); if (c !== undefined && S.steps - c >= P3.crumbleDelay) return k & ~1; }
  return k;
}

/* ---------------- shapes (ramps, half blocks, stairs, poles...) ----------------
   Plain cubes never use any of this, so worlds without shapes move exactly like before.
   shapeHit: does a footprint (the part of the player's box inside the cell, 0..1) with its feet ly0 above the
   cell's bottom overlap the shape? Leaves the shape's top under the footprint in HTOP, and its x/z box in HX0..HZ1. */
let HTOP = 1, HX0 = 0, HX1 = 1, HZ0 = 0, HZ1 = 1, HSHAPE = 0;
// a ramp's highest point over the footprint. dir 0: high side north (-z), 1: east, 2: south, 3: west
const rampTop = (d, fx0, fx1, fz0, fz1) => (d === 0 ? 1 - fz0 : d === 1 ? fx1 : d === 2 ? fz1 : 1 - fx0);
const backHalf = (d, fx0, fx1, fz0, fz1) => (d === 0 ? fz0 < 0.5 : d === 1 ? fx1 > 0.5 : d === 2 ? fz1 > 0.5 : fx0 < 0.5);
function shapeHit(sh, c, fx0, fx1, fz0, fz1, ly0) {
  const d = (c >> 4) & 3;
  let top = 1, x0 = 0, x1 = 1, z0 = 0, z1 = 1;
  if (sh === 1) top = 0.5;
  else if (sh === 2) top = rampTop(d, fx0, fx1, fz0, fz1);
  else if (sh === 3) top = Math.min(rampTop(d, fx0, fx1, fz0, fz1), rampTop((d + 1) & 3, fx0, fx1, fz0, fz1));
  else if (sh === 4) top = backHalf(d, fx0, fx1, fz0, fz1) ? 1 : 0.5;
  else if (sh === 7) { x0 = z0 = 0.3; x1 = z1 = 0.7; if (fx1 <= x0 || fx0 >= x1 || fz1 <= z0 || fz0 >= z1) return false; }
  if (top > 1) top = 1; else if (top < 0) top = 0;
  if (ly0 >= top - 1e-7) return false;
  HTOP = top; HX0 = x0; HX1 = x1; HZ0 = z0; HZ1 = z1; HSHAPE = sh;
  return true;
}

// Does the player's box with its feet at (px, py, pz) overlap a solid block? The block hit is left in HX, HY, HZ.
let HX = 0, HY = 0, HZ = 0;
function solidAt(S, px, py, pz) {
  const hw = P3.halfW;
  const x0 = Math.floor(px - hw + 1e-7), x1 = Math.floor(px + hw - 1e-7);
  const y0 = Math.floor(py + 1e-7), y1 = Math.floor(py + P3.height - 1e-7);
  const z0 = Math.floor(pz - hw + 1e-7), z1 = Math.floor(pz + hw - 1e-7);
  const t = S.t, crumbling = S.crumbles.size > 0;
  for (let y = y0; y <= y1; y++) {
    if (y < 0 || y >= SY) continue;
    for (let z = z0; z <= z1; z++) {
      if (z < 0 || z >= SZ) continue;
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || x >= SX) continue;
        const i = x + z * SX + y * SX * SZ, k = KIND[t[i]];
        if (!(k & 1)) continue;
        if ((k & 16) && crumbling && !(cellKind(S, x, y, z) & 1)) continue;
        const sh = SHAPE[t[i]];
        if (sh) {
          if (!shapeHit(sh, S.grid.c[i], Math.max(0, px - hw - x), Math.min(1, px + hw - x), Math.max(0, pz - hw - z), Math.min(1, pz + hw - z), py - y)) continue;
        } else { HTOP = 1; HX0 = 0; HX1 = 1; HZ0 = 0; HZ1 = 1; HSHAPE = 0; }
        HX = x; HY = y; HZ = z;
        return true;
      }
    }
  }
  return S.movers.length ? moverAt(S, px, py, pz) : false;
}
// The highest top of everything the player's box (feet at px, py, pz) overlaps, for stepping up onto it.
// -1 when there's no shape in it at all (unless you're standing on a shape: cubesOk), or a mover is in the way.
// So in a world without shapes this is always -1, and nothing about moving changes there.
function topAround(S, px, py, pz, cubesOk) {
  const hw = P3.halfW, t = S.t;
  const x0 = Math.floor(px - hw + 1e-7), x1 = Math.floor(px + hw - 1e-7);
  const y0 = Math.floor(py + 1e-7), y1 = Math.floor(py + P3.height - 1e-7);
  const z0 = Math.floor(pz - hw + 1e-7), z1 = Math.floor(pz + hw - 1e-7);
  let best = -1, shapes = false;
  for (let y = y0; y <= y1; y++) {
    if (y < 0 || y >= SY) continue;
    for (let z = z0; z <= z1; z++) {
      if (z < 0 || z >= SZ) continue;
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || x >= SX) continue;
        const i = x + z * SX + y * SX * SZ, k = KIND[t[i]];
        if (!(k & 1)) continue;
        if ((k & 16) && S.crumbles.size && !(cellKind(S, x, y, z) & 1)) continue;
        const sh = SHAPE[t[i]];
        if (sh) {
          if (!shapeHit(sh, S.grid.c[i], Math.max(0, px - hw - x), Math.min(1, px + hw - x), Math.max(0, pz - hw - z), Math.min(1, pz + hw - z), py - y)) continue;
          shapes = true;
          if (y + HTOP > best) best = y + HTOP;
        } else if (y + 1 > best) best = y + 1;
      }
    }
  }
  if (!shapes && !cubesOk) return -1;
  if (S.movers.length && moverAt(S, px, py, pz)) return -1;
  return best;
}
// Walking into a ramp, stairs or a half block: step up onto it (up to P3.step high).
function stepUp(S) {
  const cubesOk = S.onGround && S.onShape;
  if (!HSHAPE && !cubesOk) return false; // bumping a plain cube: a wall, like always
  const p = S.p, y0 = p.y;
  const top = topAround(S, p.x, p.y, p.z, cubesOk);
  if (top < 0 || top <= y0 || top - y0 > P3.step) return false;
  p.y = top + 1e-4;
  if (solidAt(S, p.x, p.y, p.z)) { p.y = y0; return false; }
  S.stepped = true;
  return true;
}
// Does the player's box overlap a moving platform? (It's left in HX, HY, HZ, which can be fractional.)
function moverAt(S, px, py, pz) {
  const hw = P3.halfW, o = S.mOff;
  for (const m of S.movers) {
    const mx = m[0] + (m[3] === 0 ? o : 0), my = m[1] + (m[3] === 1 ? o : 0), mz = m[2] + (m[3] === 2 ? o : 0);
    if (px + hw > mx + 1e-7 && px - hw < mx + 1 - 1e-7 && py + P3.height > my + 1e-7 && py < my + 1 - 1e-7 && pz + hw > mz + 1e-7 && pz - hw < mz + 1 - 1e-7) { HX = mx; HY = my; HZ = mz; return true; }
  }
  return false;
}
// The moving platform right under the player's feet, or -1.
function standingMover(S) {
  const hw = P3.halfW - 0.02, o = S.mOff;
  for (let i = 0; i < S.movers.length; i++) {
    const m = S.movers[i];
    const mx = m[0] + (m[3] === 0 ? o : 0), my = m[1] + (m[3] === 1 ? o : 0), mz = m[2] + (m[3] === 2 ? o : 0);
    if (Math.abs(S.p.y - (my + 1)) < 0.06 && S.p.x + hw > mx && S.p.x - hw < mx + 1 && S.p.z + hw > mz && S.p.z - hw < mz + 1) return i;
  }
  return -1;
}

function moveX(S, d) {
  const p = S.p;
  p.x += d;
  if (!solidAt(S, p.x, p.y, p.z)) return;
  if (stepUp(S)) return;
  p.x = d > 0 ? HX + HX0 - P3.halfW - 1e-4 : HX + HX1 + P3.halfW + 1e-4;
  for (let g = 0; g < 3 && solidAt(S, p.x, p.y, p.z); g++) p.x += d > 0 ? -0.05 : 0.05;
  S.v.x = 0;
}
function moveZ(S, d) {
  const p = S.p;
  p.z += d;
  if (!solidAt(S, p.x, p.y, p.z)) return;
  if (stepUp(S)) return;
  p.z = d > 0 ? HZ + HZ0 - P3.halfW - 1e-4 : HZ + HZ1 + P3.halfW + 1e-4;
  for (let g = 0; g < 3 && solidAt(S, p.x, p.y, p.z); g++) p.z += d > 0 ? -0.05 : 0.05;
  S.v.z = 0;
}
function moveY(S, d) {
  const p = S.p;
  p.y += d;
  if (!solidAt(S, p.x, p.y, p.z)) return false;
  S.landShape = d < 0 ? HSHAPE : 0;
  p.y = d > 0 ? HY - P3.height - 1e-4 : HY + HTOP;
  for (let g = 0; g < 3 && solidAt(S, p.x, p.y, p.z); g++) p.y += d > 0 ? -0.05 : 0.05;
  S.v.y = 0;
  return true;
}

// What the feet are standing on: the most important special block wins.
const RANK = new Uint8Array(64);
RANK[B.bounce] = 7; RANK[B.goal] = 6; RANK[B.teleport] = 5; RANK[B.checkpoint] = 4; RANK[B.speed] = 3; RANK[B.crumble] = 2; RANK[B.ice] = 1;
const BELT = new Array(64).fill(null);
BLOCKS.forEach((b, i) => { if (b && b.dir) { BELT[i] = b.dir; RANK[i] = 1; } });
let UT = 0, UI = -1, UX = 0, UY = 0, UZ = 0; // what under() found: type, index, x, y, z
function under(S) {
  const hw = P3.halfW - 0.02, y = Math.floor(S.p.y - 0.05);
  const x0 = Math.floor(S.p.x - hw), x1 = Math.floor(S.p.x + hw), z0 = Math.floor(S.p.z - hw), z1 = Math.floor(S.p.z + hw);
  let best = 0, bi = -1, bx = 0, bz = 0;
  UT = 0; UI = -1; UX = 0; UY = y; UZ = 0;
  if (y < 0 || y >= SY) return UT;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (x < 0 || z < 0 || x >= SX || z >= SZ) continue;
    if (!(cellKind(S, x, y, z) & 1)) continue;
    const i = x + z * SX + y * SX * SZ, t = S.t[i];
    if (bi < 0 || RANK[t] > RANK[best]) { best = t; bi = i; bx = x; bz = z; }
  }
  UT = best; UI = bi; UX = bx; UZ = bz;
  return best;
}

// One look around the player for coins, the goal and lava.
let NEAR_COIN = -1;
function around(S) {
  const g = 0.05, hw = P3.halfW + g, px = S.p.x, py = S.p.y, pz = S.p.z;
  const x0 = Math.floor(px - hw + 1e-7), x1 = Math.floor(px + hw - 1e-7);
  const y0 = Math.floor(py - g + 1e-7), y1 = Math.floor(py + P3.height + g - 1e-7);
  const z0 = Math.floor(pz - hw + 1e-7), z1 = Math.floor(pz + hw - 1e-7);
  let all = 0, coin = -1;
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const k = cellKind(S, x, y, z);
    if (!(k & 14)) continue;
    all |= k;
    if ((k & 8) && coin < 0) coin = idx(x, y, z);
  }
  NEAR_COIN = coin;
  return all;
}

function die(S) {
  S.deaths++;
  if (S.logic) S.logic.died = true;
  S.events.push({ t: 'die', x: S.p.x, y: S.p.y, z: S.p.z });
  const at = S.cp || S.spawn;
  S.p.x = at.x; S.p.y = at.y; S.p.z = at.z;
  S.v.x = S.v.y = S.v.z = 0;
  S.boost = 0; S.onGround = false; S.air = P3.coyote;
  S.events.push({ t: 'respawn' });
}

// One physics step. value = (bits << 8) | yaw, the same number the replay stores.
export function step3(S, value) {
  if (S.won) return;
  const bits = value >> 8, yaw = value & 255, dt = STEP3;
  S.steps++; S.runSteps++;
  // moving platforms move first, carrying whoever stands on them
  if (S.movers.length) {
    const ride = S.onGround ? standingMover(S) : -1;
    const before = S.mOff;
    S.mOff = moverOffset(S.steps);
    const d = S.mOff - before;
    if (ride >= 0 && d) {
      const ax = S.movers[ride][3];
      const saved = S.mOff; S.mOff = before; // move the player against the old platform position, then put it back
      if (ax === 0) { S.mOff = saved; S.p.x += d; if (solidAt(S, S.p.x, S.p.y, S.p.z)) S.p.x -= d; }
      else if (ax === 2) { S.mOff = saved; S.p.z += d; if (solidAt(S, S.p.x, S.p.y, S.p.z)) S.p.z -= d; }
      else { S.mOff = saved; S.p.y += d; if (d > 0 && solidAt(S, S.p.x, S.p.y, S.p.z)) S.p.y -= d; }
      S.mOff = saved;
    } else if (d && moverAt(S, S.p.x, S.p.y, S.p.z)) {
      // a platform bumped into the player: push them along with it
      const m = S.movers.find((q) => { const o = S.mOff; const mx = q[0] + (q[3] === 0 ? o : 0), my = q[1] + (q[3] === 1 ? o : 0), mz = q[2] + (q[3] === 2 ? o : 0); return mx === HX && my === HY && mz === HZ; });
      const ax = m ? m[3] : 1;
      if (ax === 0) S.p.x += d; else if (ax === 2) S.p.z += d; else if (d > 0) S.p.y = HY + 1;
    }
  }
  const reset = (bits & 32) ? 1 : 0;
  if (reset && !S.lastReset) { S.lastReset = 1; die(S); return; }
  S.lastReset = reset;
  const f = ((bits & 1) ? 1 : 0) - ((bits & 2) ? 1 : 0);
  const s = ((bits & 8) ? 1 : 0) - ((bits & 4) ? 1 : 0);
  let dx = f * SIN[yaw] + s * COS[yaw];
  let dz = -f * COS[yaw] + s * SIN[yaw];
  if (f && s) { dx *= 0.7071068; dz *= 0.7071068; }

  // crumbling blocks come back after a while (not while someone is standing inside)
  if (S.crumbles.size) for (const [i, c] of S.crumbles) {
    if (S.steps - c >= P3.crumbleDelay + P3.crumbleGone) {
      const x = i % SX, z = Math.floor(i / SX) % SZ, y = Math.floor(i / (SX * SZ));
      const hw = P3.halfW;
      const inside = x + 1 > S.p.x - hw && x < S.p.x + hw && z + 1 > S.p.z - hw && z < S.p.z + hw && y + 1 > S.p.y && y < S.p.y + P3.height;
      if (!inside) S.crumbles.delete(i);
    }
  }

  const icy = S.onGround && under(S) === B.ice;
  // gear: your own (only in hangouts and minigames, never in checked runs), or gear a Logic script lent you
  const L = S.logic, LM = L ? L.mods : null;
  const G = L && L.tgear ? GEAR_MODS[L.tgear.id] || null : S.mods;
  const top = P3.speed * (S.boost > 0 ? P3.boost : 1) * (G && G.speed ? G.speed : 1) * (LM ? LM.speed : 1);
  const tx = dx * top, tz = dz * top;
  const moving = f || s;
  const rate = !S.onGround ? P3.airAccel : icy ? (moving ? P3.iceAccel : P3.iceFriction) : (moving ? P3.accel : P3.friction);
  const ex = tx - S.v.x, ez = tz - S.v.z;
  const len = Math.sqrt(ex * ex + ez * ez), maxd = rate * dt;
  if (len <= maxd) { S.v.x = tx; S.v.z = tz; } else { S.v.x += ex / len * maxd; S.v.z += ez / len * maxd; }
  if (moving) S.facing = yaw;
  if (S.boost > 0) S.boost--;

  // jumping: hold to keep hopping, a short grace time after walking off an edge
  const jumpHeld = !!(bits & 16);
  const pressed = jumpHeld && !S.lastJump;
  S.lastJump = jumpHeld ? 1 : 0;
  if (jumpHeld && (S.onGround || (pressed && S.air < P3.coyote)) && S.v.y <= 0.001) {
    S.v.y = P3.jump * (LM ? LM.jump : 1); S.onGround = false; S.air = P3.coyote;
    S.events.push({ t: 'jump', x: S.p.x, y: S.p.y, z: S.p.z });
  } else if (G) {
    if (S.onGround) { S.jumpsLeft = G.jumps || 0; S.fuel = G.jet || 0; }
    if (G.jumps && pressed && !S.onGround && S.jumpsLeft > 0) {
      S.jumpsLeft--; S.v.y = P3.jump * 0.95; S.events.push({ t: 'jump2', x: S.p.x, y: S.p.y, z: S.p.z });
    } else if (G.jet && jumpHeld && !S.onGround && S.fuel > 0 && S.air > 8) {
      S.fuel--; S.v.y = Math.min(8, S.v.y + 70 * dt); S.jetting = 4;
    }
  }

  S.v.y -= P3.gravity * (G && G.grav ? G.grav : 1) * (LM ? LM.grav : 1) * dt;
  if (S.v.y < -P3.maxFall) S.v.y = -P3.maxFall;

  if (S.v.x) moveX(S, S.v.x * dt);
  if (S.v.z) moveZ(S, S.v.z * dt);
  const fallV = S.v.y;
  const hitY = S.v.y ? moveY(S, S.v.y * dt) : false;
  const wasGround = S.onGround;
  S.onGround = hitY && fallV < 0;
  // walking down a ramp or stairs: stay on them instead of hopping off every step (only after standing on a shape)
  if (!S.onGround && wasGround && fallV <= 0) {
    // after standing on a shape anything counts; otherwise only a shape right below (so plain-cube worlds never snap)
    const top = topAround(S, S.p.x, S.p.y - P3.snap, S.p.z, !!S.onShape);
    if (top >= 0 && top <= S.p.y + 1e-6) {
      const y0 = S.p.y; S.p.y = top;
      if (solidAt(S, S.p.x, S.p.y, S.p.z)) S.p.y = y0; else { S.onGround = true; S.v.y = 0; S.onShape = true; }
    }
  }
  if (S.onGround && hitY) S.onShape = S.landShape > 0;
  else if (!S.onGround) S.onShape = S.onShape && S.air < 2;
  if (S.onGround) S.air = 0; else { S.air++; if (S.air > 20) S.tpLock = false; }
  if (S.onGround && !wasGround && fallV < -12) S.events.push({ t: 'land', v: -fallV, x: S.p.x, y: S.p.y, z: S.p.z });

  // what are we standing on?
  if (S.onGround) {
    const gt = under(S), g = { i: UI, x: UX, y: UY, z: UZ };
    if (gt !== B.teleport) S.tpLock = false;
    if (BELT[gt]) {
      const d = BELT[gt];
      if (d[0]) moveX(S, d[0] * P3.belt * dt);
      if (d[1]) moveZ(S, d[1] * P3.belt * dt);
    } else if (gt === B.teleport && !S.tpLock) {
      // go to the next teleporter of the same color that isn't part of this pad
      const list = S.tps.get(S.grid.color(g.x, g.y, g.z)) || [];
      const k = list.findIndex((q) => q[0] === g.x && q[1] === g.y && q[2] === g.z);
      for (let n = 1; k >= 0 && n < list.length; n++) {
        const q = list[(k + n) % list.length];
        if (Math.abs(q[0] - g.x) + Math.abs(q[1] - g.y) + Math.abs(q[2] - g.z) <= 2) continue;
        S.events.push({ t: 'teleport', x: S.p.x, y: S.p.y, z: S.p.z });
        S.p.x = q[0] + 0.5; S.p.y = q[1] + 1; S.p.z = q[2] + 0.5;
        S.v.x = S.v.y = S.v.z = 0;
        S.tpLock = true;
        break;
      }
    }
    if (gt === B.bounce) {
      S.v.y = P3.bounce; S.onGround = false; S.air = P3.coyote;
      S.events.push({ t: 'bounce', x: S.p.x, y: S.p.y, z: S.p.z });
    } else if (gt === B.speed) {
      if (S.boost < P3.boostSteps - 10) S.events.push({ t: 'speed' });
      S.boost = P3.boostSteps;
    } else if (gt === B.checkpoint && g.i !== S.cpIdx) {
      const old = S.cp;
      S.cpIdx = g.i; S.cp = { x: g.x + 0.5, y: g.y + 1, z: g.z + 0.5 };
      // a checkpoint made of several blocks only counts once
      if (!old || Math.abs(old.x - S.cp.x) + Math.abs(old.z - S.cp.z) + Math.abs(old.y - S.cp.y) > 2.5) { S.events.push({ t: 'checkpoint', x: S.cp.x, y: S.cp.y, z: S.cp.z }); if (L) L.cp = true; }
    } else if (gt === B.crumble && !S.crumbles.has(g.i)) {
      S.crumbles.set(g.i, S.steps);
      S.events.push({ t: 'crumble', i: g.i });
    }
  }

  // coins, the goal, lava
  const near = around(S);
  if (NEAR_COIN >= 0 && !S.got.has(NEAR_COIN)) {
    const i = NEAR_COIN;
    S.got.add(i); S.coins++;
    S.events.push({ t: 'coin', i, x: i % SX + 0.5, y: Math.floor(i / (SX * SZ)) + 0.5, z: Math.floor(i / SX) % SZ + 0.5 });
  }
  if (L) { logicStep(S, { die }); if (S.won) return; }
  if (S.obby && (near & 4)) {
    S.won = true;
    S.events.push({ t: 'win', x: S.p.x, y: S.p.y, z: S.p.z });
    return;
  }
  if ((near & 2) || S.p.y < S.fallY) die(S);
}

// Server check: play the recording and report what happened.
export function runReplay3d(world, str, { maxSteps = 18000, grid } = {}) {
  const runs = decodeReplay(str, maxSteps, { maxValue: 16384, rate: 60 });
  const S = createSim(world, grid);
  for (const [value, count] of runs) {
    for (let i = 0; i < count; i++) {
      step3(S, value);
      S.events.length = 0;
      if (S.won) return { won: true, steps: S.steps, time: S.steps / 60, deaths: S.deaths, coins: S.coins, totalCoins: S.totalCoins };
    }
  }
  return { won: false, steps: S.steps, time: S.steps / 60, deaths: S.deaths, coins: S.coins, totalCoins: S.totalCoins };
}

export { Grid };
