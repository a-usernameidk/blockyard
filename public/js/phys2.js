// Engine v2 movement: the player walks on free parts (any size, turn and shape).
// Same buttons, same speed and jump as v1 (P3), fixed 60 steps a second, no randomness: the server replays runs
// with this exact file. The player is a box (P3.halfW wide, P3.height tall) that never turns.
// Parts are convex solids (planes) or balls; parts live in a grid of 8x8 columns so only nearby ones are checked.
import { P3, STEP3, YAWS } from './physics3d.js';
import { solidOf } from './parts.js';
import { decodeReplay } from './replay.js';

const SIN = new Float64Array(YAWS), COS = new Float64Array(YAWS);
for (let i = 0; i < YAWS; i++) {
  SIN[i] = Math.round(Math.sin(i * 2 * Math.PI / YAWS) * 1e6) / 1e6;
  COS[i] = Math.round(Math.cos(i * 2 * Math.PI / YAWS) * 1e6) / 1e6;
}
const CELL = 8, EPS = 1e-6;

export function createSim2(world) {
  const parts = world.parts || [];
  const solids = parts.map((q, i) => ({ i, q, ...solidOf(q), k: q.k || '', walk: !q.nc && q.k !== 'coin', slip: q.m === 'ice' }));
  // spatial grid of columns: key -> part indexes
  const cols = new Map();
  for (const s of solids) {
    const a0 = Math.floor(s.min[0] / CELL), a1 = Math.floor(s.max[0] / CELL), b0 = Math.floor(s.min[2] / CELL), b1 = Math.floor(s.max[2] / CELL);
    if ((a1 - a0 + 1) * (b1 - b0 + 1) > 4096) { (cols.get('big') || cols.set('big', []).get('big')).push(s.i); continue; }
    for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) { const k = a * 100003 + b; if (!cols.has(k)) cols.set(k, []); cols.get(k).push(s.i); }
  }
  const sp = solids.find((s) => s.k === 'spawn');
  const spawn = sp ? { x: (sp.min[0] + sp.max[0]) / 2, y: sp.max[1], z: (sp.min[2] + sp.max[2]) / 2 } : { x: 500, y: 20, z: 500 };
  // coins: drawn by the game like v1 coins (it keys them by their spot, the same sum as below)
  const coins = solids.filter((s) => s.k === 'coin').map((s) => [s.q.p[0] - 0.5, s.q.p[1] - 0.5, s.q.p[2] - 0.5]);
  const low = solids.length ? Math.min(...solids.map((s) => s.min[1])) : 0;
  return {
    v2: true, solids, cols, spawn, obby: world.mode !== 'hangout',
    info: { coins, movers: [], tps: [], spawn: null },
    cp: null, cpIdx: -1, p: { ...spawn }, v: { x: 0, y: 0, z: 0 },
    onGround: false, air: 0, lastJump: 0, lastReset: 0, boost: 0, facing: 0,
    crumbles: new Map(), got: new Set(), coins: 0, totalCoins: coins.length,
    deaths: 0, steps: 0, runSteps: 0, won: false, events: [], logic: null, movers: [],
    fallY: low - 25, standing: -1,
  };
}
const coinKey = (s) => (s.q.p[0] - 0.5) + (s.q.p[2] - 0.5) * 128 + (s.q.p[1] - 0.5) * 128 * 128; // (play3d keys v1 coins by x + z*128 + y*128*128)

/* ---------------- what's near ---------------- */
let NEAR = [], NEARSTAMP = 0;
const seen = new Uint32Array(1 << 16);
function nearby(S, x0, x1, z0, z1) {
  NEAR = []; NEARSTAMP = (NEARSTAMP + 1) >>> 0 || 1;
  const mark = S.solids.length <= seen.length;
  const add = (i) => { if (mark) { if (seen[i] === NEARSTAMP) return; seen[i] = NEARSTAMP; } else if (NEAR.includes(i)) return; NEAR.push(i); };
  for (let a = Math.floor(x0 / CELL); a <= Math.floor(x1 / CELL); a++) for (let b = Math.floor(z0 / CELL); b <= Math.floor(z1 / CELL); b++) { const l = S.cols.get(a * 100003 + b); if (l) for (const i of l) add(i); }
  const big = S.cols.get('big'); if (big) for (const i of big) add(i);
  NEAR.sort((a, b) => a - b); // the same order every time
  return NEAR;
}

/* ---------------- does a box overlap a part? ---------------- */
function boxHits(s, x0, y0, z0, x1, y1, z1) {
  if (s.max[0] <= x0 + EPS || s.min[0] >= x1 - EPS || s.max[1] <= y0 + EPS || s.min[1] >= y1 - EPS || s.max[2] <= z0 + EPS || s.min[2] >= z1 - EPS) return false;
  if (s.ball) {
    const cx = Math.max(x0, Math.min(x1, s.c[0])), cy = Math.max(y0, Math.min(y1, s.c[1])), cz = Math.max(z0, Math.min(z1, s.c[2]));
    const dx = cx - s.c[0], dy = cy - s.c[1], dz = cz - s.c[2];
    return dx * dx + dy * dy + dz * dz < s.rad * s.rad - EPS;
  }
  // separated if the whole box is outside any face of the part
  for (const pl of s.planes) {
    const n0 = pl[0], n1 = pl[1], n2 = pl[2];
    const m = (n0 > 0 ? n0 * x0 : n0 * x1) + (n1 > 0 ? n1 * y0 : n1 * y1) + (n2 > 0 ? n2 * z0 : n2 * z1); // the box corner furthest inside
    if (m >= pl[3] - EPS) return false;
  }
  return true;
}
// the part the player's box (feet at px, py, pz) runs into, or -1
function solidAt(S, px, py, pz) {
  const hw = P3.halfW, x0 = px - hw, x1 = px + hw, z0 = pz - hw, z1 = pz + hw, y0 = py, y1 = py + P3.height;
  for (const i of nearby(S, x0, x1, z0, z1)) { const s = S.solids[i]; if (s.walk && boxHits(s, x0, y0, z0, x1, y1, z1)) return i; }
  return -1;
}
/* ---------------- the ground under the feet ---------------- */
// top of a part along a straight-down line at (x, z), starting at height yFrom; -Infinity if the line misses it
function topAt(s, x, z, yFrom) {
  if (x < s.min[0] || x > s.max[0] || z < s.min[2] || z > s.max[2] || s.min[1] > yFrom) return -Infinity;
  if (s.ball) {
    const dx = x - s.c[0], dz = z - s.c[2], h = s.rad * s.rad - dx * dx - dz * dz;
    if (h < 0) return -Infinity;
    const y = s.c[1] + Math.sqrt(h);
    return y <= yFrom ? y : (s.c[1] - Math.sqrt(h) <= yFrom ? yFrom : -Infinity);
  }
  // the line x, z going down: the part is where every face says "inside"; find the highest such y (<= yFrom)
  let hi = yFrom, lo = -Infinity;
  for (const pl of s.planes) {
    const rest = pl[3] - pl[0] * x - pl[2] * z; // n1 * y <= rest
    if (Math.abs(pl[1]) < 1e-9) { if (rest < -1e-9) return -Infinity; continue; }
    const yb = rest / pl[1];
    if (pl[1] > 0) { if (yb < hi) hi = yb; } else if (yb > lo) lo = yb;
  }
  return hi >= lo - 1e-9 ? hi : -Infinity;
}
// the highest ground under the player's feet (5 spots: middle and 4 corners), no higher than yFrom; which part it is in SUP
let SUP = -1;
function groundAt(S, px, pz, yFrom, yTo) {
  const hw = P3.halfW;
  let best = -Infinity; SUP = -1;
  for (const i of nearby(S, px - hw, px + hw, pz - hw, pz + hw)) {
    const s = S.solids[i];
    if (!s.walk || s.max[1] < yTo || s.min[1] > yFrom) continue;
    for (const [dx, dz] of SPOTS) {
      const t = topAt(s, px + dx * hw, pz + dz * hw, yFrom);
      if (t > best) { best = t; SUP = i; }
    }
  }
  return best >= yTo ? best : -Infinity;
}
const SPOTS = [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]];

/* ---------------- moving ---------------- */
// sideways: bump into things, or step up onto something low enough (a step, a ramp, a curb)
function moveSide(S, axis, d) {
  const p = S.p;
  p[axis] += d;
  if (solidAt(S, p.x, p.y, p.z) < 0) return;
  // step up?
  const g = groundAt(S, p.x, p.z, p.y + P3.step, p.y - 1e-4);
  if (g > p.y - 1e-4 && g - p.y <= P3.step && solidAt(S, p.x, g + 1e-4, p.z) < 0 && (S.onGround || g - p.y < 0.3)) { p.y = g + 1e-4; return; }
  // no: go back, then as far as it can (halving)
  p[axis] -= d;
  let part = d;
  for (let k = 0; k < 5; k++) { part /= 2; p[axis] += part; if (solidAt(S, p.x, p.y, p.z) >= 0) p[axis] -= part; }
  S.v[axis] = 0;
}
// up and down: land on the ground under you, or bump your head
function moveUp(S, d) {
  const p = S.p, y0 = p.y;
  p.y += d;
  if (solidAt(S, p.x, p.y, p.z) < 0) return false;
  if (d < 0) {
    const g = groundAt(S, p.x, p.z, y0 + 1e-3, p.y - 0.05);
    if (g > -Infinity && solidAt(S, p.x, g + 1e-4, p.z) < 0) { p.y = g + 1e-4; S.v.y = 0; return true; }
  }
  p.y = y0;
  let part = d;
  for (let k = 0; k < 5; k++) { part /= 2; p.y += part; if (solidAt(S, p.x, p.y, p.z) >= 0) p.y -= part; }
  S.v.y = 0;
  return d < 0;
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

/* ---------------- one step (the same as v1's step3, for parts) ---------------- */
export function step2(S, value) {
  if (S.won) return;
  const bits = value >> 8, yaw = value & 255, dt = STEP3;
  S.steps++; S.runSteps++;
  const reset = (bits & 32) ? 1 : 0;
  if (reset && !S.lastReset) { S.lastReset = 1; die(S); return; }
  S.lastReset = reset;
  const f = ((bits & 1) ? 1 : 0) - ((bits & 2) ? 1 : 0), sd = ((bits & 8) ? 1 : 0) - ((bits & 4) ? 1 : 0);
  let dx = f * SIN[yaw] + sd * COS[yaw], dz = -f * COS[yaw] + sd * SIN[yaw];
  if (f && sd) { dx *= 0.7071068; dz *= 0.7071068; }
  const under = S.onGround && S.standing >= 0 ? S.solids[S.standing] : null;
  const icy = !!(under && under.slip);
  const G = S.mods || null;
  const top = P3.speed * (S.boost > 0 ? P3.boost : 1) * (G && G.speed ? G.speed : 1);
  const tx = dx * top, tz = dz * top, moving = f || sd;
  const rate = !S.onGround ? P3.airAccel : icy ? (moving ? P3.iceAccel : P3.iceFriction) : (moving ? P3.accel : P3.friction);
  const ex = tx - S.v.x, ez = tz - S.v.z, len = Math.sqrt(ex * ex + ez * ez), maxd = rate * dt;
  if (len <= maxd) { S.v.x = tx; S.v.z = tz; } else { S.v.x += ex / len * maxd; S.v.z += ez / len * maxd; }
  if (moving) S.facing = yaw;
  if (S.boost > 0) S.boost--;
  const jumpHeld = !!(bits & 16), pressed = jumpHeld && !S.lastJump;
  S.lastJump = jumpHeld ? 1 : 0;
  if (jumpHeld && (S.onGround || (pressed && S.air < P3.coyote)) && S.v.y <= 0.001) {
    S.v.y = P3.jump; S.onGround = false; S.air = P3.coyote;
    S.events.push({ t: 'jump', x: S.p.x, y: S.p.y, z: S.p.z });
  } else if (G) {
    if (S.onGround) { S.jumpsLeft = G.jumps || 0; S.fuel = G.jet || 0; }
    if (G.jumps && pressed && !S.onGround && S.jumpsLeft > 0) { S.jumpsLeft--; S.v.y = P3.jump * 0.95; S.events.push({ t: 'jump2', x: S.p.x, y: S.p.y, z: S.p.z }); }
    else if (G.jet && jumpHeld && !S.onGround && S.fuel > 0 && S.air > 8) { S.fuel--; S.v.y = Math.min(8, S.v.y + 70 * dt); S.jetting = 4; }
  }
  S.v.y -= P3.gravity * (G && G.grav ? G.grav : 1) * dt;
  if (S.v.y < -P3.maxFall) S.v.y = -P3.maxFall;
  if (S.v.x) moveSide(S, 'x', S.v.x * dt);
  if (S.v.z) moveSide(S, 'z', S.v.z * dt);
  const fallV = S.v.y, wasGround = S.onGround;
  const hitY = S.v.y ? moveUp(S, S.v.y * dt) : false;
  S.onGround = hitY && fallV < 0;
  // walking down a slope or off a small step: stay on the ground
  if (!S.onGround && wasGround && fallV <= 0) {
    const g = groundAt(S, S.p.x, S.p.z, S.p.y + 1e-3, S.p.y - P3.snap);
    if (g > -Infinity && solidAt(S, S.p.x, g + 1e-4, S.p.z) < 0) { S.p.y = g + 1e-4; S.v.y = 0; S.onGround = true; }
  }
  if (S.onGround) { S.air = 0; const g = groundAt(S, S.p.x, S.p.z, S.p.y + 0.01, S.p.y - 0.1); S.standing = g > -Infinity ? SUP : -1; }
  else { S.air++; S.standing = -1; }
  if (S.onGround && !wasGround && fallV < -12) S.events.push({ t: 'land', v: -fallV, x: S.p.x, y: S.p.y, z: S.p.z });

  // special parts: what you stand on, and what you touch
  const st = S.standing >= 0 ? S.solids[S.standing] : null;
  if (st) {
    if (st.k === 'bounce' && S.v.y <= 0) { S.v.y = P3.bounce; S.onGround = false; S.events.push({ t: 'bounce', x: S.p.x, y: S.p.y, z: S.p.z }); }
    else if (st.k === 'speed') { if (S.boost < P3.boostSteps - 10) S.events.push({ t: 'speed' }); S.boost = P3.boostSteps; }
    else if (st.k === 'checkpoint' && S.cpIdx !== st.i) {
      S.cpIdx = st.i; S.cp = { x: (st.min[0] + st.max[0]) / 2, y: st.max[1] + 1e-4, z: (st.min[2] + st.max[2]) / 2 };
      S.events.push({ t: 'checkpoint', x: S.cp.x, y: S.cp.y, z: S.cp.z });
    }
  }
  const hw = P3.halfW + 0.05, x0 = S.p.x - hw, x1 = S.p.x + hw, z0 = S.p.z - hw, z1 = S.p.z + hw, y0 = S.p.y - 0.06, y1 = S.p.y + P3.height + 0.05;
  for (const i of nearby(S, x0, x1, z0, z1)) {
    const s = S.solids[i];
    if (!s.k || s.k === 'spawn' || s.k === 'checkpoint' || s.k === 'bounce' || s.k === 'speed') continue;
    if (!boxHits(s, x0, y0, z0, x1, y1, z1)) continue;
    if (s.k === 'kill') { die(S); return; }
    if (s.k === 'coin') { const key = coinKey(s); if (!S.got.has(key)) { S.got.add(key); S.coins++; S.events.push({ t: 'coin', i: key, x: s.q.p[0], y: s.q.p[1], z: s.q.p[2] }); } }
    if (s.k === 'goal' && S.obby) { S.won = true; S.events.push({ t: 'win', x: S.p.x, y: S.p.y, z: S.p.z }); return; }
  }
  if (S.p.y < S.fallY) die(S);
}

export function runReplay2(world, str, { maxSteps = 18000 } = {}) {
  const runs = decodeReplay(str, maxSteps, { maxValue: 16384, rate: 60 });
  const S = createSim2(world);
  for (const [value, count] of runs) {
    for (let i = 0; i < count; i++) {
      step2(S, value);
      S.events.length = 0;
      if (S.won) return { won: true, steps: S.steps, time: S.steps / 60, deaths: S.deaths, coins: S.coins, totalCoins: S.totalCoins };
    }
  }
  return { won: false, steps: S.steps, time: S.steps / 60, deaths: S.deaths, coins: S.coins, totalCoins: S.totalCoins };
}
// (the ray the camera and the editor use: the nearest part hit along o + t*d, or null)
export function rayParts(S, o, d, maxT = 200, pick = (s) => s.walk) {
  let best = null;
  for (const s of S.solids) {
    if (!pick(s)) continue;
    const t = rayHit(s, o, d, maxT);
    if (t != null && (!best || t < best.t)) best = { t, i: s.i };
  }
  return best;
}
export function rayHit(s, o, d, maxT = 1e9) {
  if (s.ball) {
    const ox = o[0] - s.c[0], oy = o[1] - s.c[1], oz = o[2] - s.c[2];
    const b = ox * d[0] + oy * d[1] + oz * d[2], c = ox * ox + oy * oy + oz * oz - s.rad * s.rad, h = b * b - c;
    if (h < 0) return null;
    const t = -b - Math.sqrt(h);
    return t >= 0 && t <= maxT ? t : null;
  }
  let t0 = 0, t1 = maxT;
  for (const pl of s.planes) {
    const dn = pl[0] * d[0] + pl[1] * d[1] + pl[2] * d[2], dist = pl[3] - (pl[0] * o[0] + pl[1] * o[1] + pl[2] * o[2]);
    if (Math.abs(dn) < 1e-12) { if (dist < 0) return null; continue; }
    const t = dist / dn;
    if (dn < 0) { if (t > t0) t0 = t; } else if (t < t1) t1 = t;
    if (t0 > t1) return null;
  }
  return t0;
}
