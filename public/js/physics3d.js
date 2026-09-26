// 3D movement and rules. Fixed 60 steps a second and no randomness, so the same buttons
// always give the same run. The server replays runs with this exact file to check wins.
import { Grid, decodeBlocks, scan, idx, B, BLOCKS, SX, SY, SZ } from './world.js';
import { decodeReplay } from './replay.js';

export const STEP3 = 1 / 60;
export const P3 = {
  speed: 7, accel: 70, airAccel: 32, friction: 60, iceAccel: 9, iceFriction: 2.5,
  gravity: 32, jump: 11, bounce: 18.5, maxFall: 40,
  coyote: 6, boost: 1.6, boostSteps: 90,
  halfW: 0.34, height: 1.5,
  crumbleDelay: 36, crumbleGone: 180,
};

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
  if (!b.entity && !b.ghost) k |= 1;
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
  return {
    grid, t: grid.t, info, obby: world.mode !== 'hangout',
    spawn, cp: null, cpIdx: -1,
    p: { ...spawn }, v: { x: 0, y: 0, z: 0 },
    onGround: false, air: 0, lastJump: 0, lastReset: 0, boost: 0, facing: 0,
    crumbles: new Map(), got: new Set(), coins: 0, totalCoins: info.coins.length,
    deaths: 0, steps: 0, runSteps: 0, won: false, events: [],
    fallY: grid.lowest() - 8,
  };
}

function cellKind(S, x, y, z) {
  if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) return 0;
  const i = x + z * SX + y * SX * SZ;
  const k = KIND[S.t[i]];
  if (k & 16) { const c = S.crumbles.get(i); if (c !== undefined && S.steps - c >= P3.crumbleDelay) return k & ~1; }
  return k;
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
        const k = KIND[t[x + z * SX + y * SX * SZ]];
        if (!(k & 1)) continue;
        if ((k & 16) && crumbling && !(cellKind(S, x, y, z) & 1)) continue;
        HX = x; HY = y; HZ = z;
        return true;
      }
    }
  }
  return false;
}

function moveX(S, d) {
  const p = S.p;
  p.x += d;
  if (!solidAt(S, p.x, p.y, p.z)) return;
  p.x = d > 0 ? HX - P3.halfW - 1e-4 : HX + 1 + P3.halfW + 1e-4;
  for (let g = 0; g < 3 && solidAt(S, p.x, p.y, p.z); g++) p.x += d > 0 ? -0.05 : 0.05;
  S.v.x = 0;
}
function moveZ(S, d) {
  const p = S.p;
  p.z += d;
  if (!solidAt(S, p.x, p.y, p.z)) return;
  p.z = d > 0 ? HZ - P3.halfW - 1e-4 : HZ + 1 + P3.halfW + 1e-4;
  for (let g = 0; g < 3 && solidAt(S, p.x, p.y, p.z); g++) p.z += d > 0 ? -0.05 : 0.05;
  S.v.z = 0;
}
function moveY(S, d) {
  const p = S.p;
  p.y += d;
  if (!solidAt(S, p.x, p.y, p.z)) return false;
  p.y = d > 0 ? HY - P3.height - 1e-4 : HY + 1;
  for (let g = 0; g < 3 && solidAt(S, p.x, p.y, p.z); g++) p.y += d > 0 ? -0.05 : 0.05;
  S.v.y = 0;
  return true;
}

// What the feet are standing on: the most important special block wins.
const RANK = new Uint8Array(64);
RANK[B.bounce] = 6; RANK[B.goal] = 5; RANK[B.checkpoint] = 4; RANK[B.speed] = 3; RANK[B.crumble] = 2; RANK[B.ice] = 1;
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
  const top = P3.speed * (S.boost > 0 ? P3.boost : 1);
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
    S.v.y = P3.jump; S.onGround = false; S.air = P3.coyote;
    S.events.push({ t: 'jump', x: S.p.x, y: S.p.y, z: S.p.z });
  }

  S.v.y -= P3.gravity * dt;
  if (S.v.y < -P3.maxFall) S.v.y = -P3.maxFall;

  if (S.v.x) moveX(S, S.v.x * dt);
  if (S.v.z) moveZ(S, S.v.z * dt);
  const fallV = S.v.y;
  const hitY = S.v.y ? moveY(S, S.v.y * dt) : false;
  const wasGround = S.onGround;
  S.onGround = hitY && fallV < 0;
  if (S.onGround) S.air = 0; else S.air++;
  if (S.onGround && !wasGround && fallV < -12) S.events.push({ t: 'land', v: -fallV, x: S.p.x, y: S.p.y, z: S.p.z });

  // what are we standing on?
  if (S.onGround) {
    const gt = under(S), g = { i: UI, x: UX, y: UY, z: UZ };
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
      if (!old || Math.abs(old.x - S.cp.x) + Math.abs(old.z - S.cp.z) + Math.abs(old.y - S.cp.y) > 2.5) S.events.push({ t: 'checkpoint', x: S.cp.x, y: S.cp.y, z: S.cp.z });
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
