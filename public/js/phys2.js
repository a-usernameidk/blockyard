// Engine v2 movement: the player walks on free parts (any size, turn and shape).
// Same buttons, same speed and jump as v1 (P3), fixed 60 steps a second, no randomness: the server replays runs
// with this exact file. The player is a box (P3.halfW wide, P3.height tall) that never turns.
// Parts are convex solids (planes) or balls; parts live in a grid of 8x8 columns so only nearby ones are checked.
import { P3, STEP3, YAWS } from './physics3d.js';
import { solidOf, rotMat, motionAt, MATERIALS2, MATERIAL2 } from './parts.js';
import { decodeReplay } from './replay.js';
import { createRunner } from './bscript.js';

const SIN = new Float64Array(YAWS), COS = new Float64Array(YAWS);
for (let i = 0; i < YAWS; i++) {
  SIN[i] = Math.round(Math.sin(i * 2 * Math.PI / YAWS) * 1e6) / 1e6;
  COS[i] = Math.round(Math.cos(i * 2 * Math.PI / YAWS) * 1e6) / 1e6;
}
const CELL = 8, EPS = 1e-6;

export function createSim2(world) {
  const parts = world.parts || [];
  // scripts: parts they name (part("Door")) can move and change, like parts with a motion
  const hostRef = {};
  const runner = world.scripts && world.scripts.length ? createRunner(world.scripts, hostRef) : null;
  const named = new Set(runner ? runner.progs.flatMap((p) => p.ast.names) : []);
  const isDyn = (q) => q.k !== 'coin' && (!!q.mo || (q.n && named.has(q.n)));
  const solids = parts.map((q, i) => ({ i, q, ...solidOf(q), k: q.k || '', walk: !q.nc && q.k !== 'coin', slip: q.m === 'ice', water: !!(MATERIALS2[MATERIAL2[q.m]] || {}).water, dyn: isDyn(q) }));
  const dyn = solids.filter((s) => s.dyn).map((s) => s.i);
  const live = new Map(dyn.map((i) => { const q = parts[i]; return [i, { q: { ...q }, bp: q.p.slice(), br: q.r.slice(), p: q.p.slice(), r: q.r.slice(), R: rotMat(q.r), tw: null, tr: null, spin: null, hide: false, ver: 0, moved: true }]; }));
  // spatial grid of columns: key -> part indexes (moving parts are checked separately)
  const cols = new Map();
  for (const s of solids) {
    if (s.dyn) continue;
    const a0 = Math.floor(s.min[0] / CELL), a1 = Math.floor(s.max[0] / CELL), b0 = Math.floor(s.min[2] / CELL), b1 = Math.floor(s.max[2] / CELL);
    if ((a1 - a0 + 1) * (b1 - b0 + 1) > 4096) { (cols.get('big') || cols.set('big', []).get('big')).push(s.i); continue; }
    for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) { const k = a * 100003 + b; if (!cols.has(k)) cols.set(k, []); cols.get(k).push(s.i); }
  }
  const sp = solids.find((s) => s.k === 'spawn');
  const spawn = sp ? { x: (sp.min[0] + sp.max[0]) / 2, y: sp.max[1], z: (sp.min[2] + sp.max[2]) / 2 } : { x: 500, y: 20, z: 500 };
  // coins: drawn by the game like v1 coins (it keys them by their spot, the same sum as below)
  const coins = solids.filter((s) => s.k === 'coin').map((s) => [s.q.p[0] - 0.5, s.q.p[1] - 0.5, s.q.p[2] - 0.5]);
  const low = solids.length ? Math.min(...solids.map((s) => s.min[1])) : 0;
  const S = {
    v2: true, solids, cols, spawn, obby: world.mode !== 'hangout', dyn, live, runner, smod: { speed: 1, jump: 1, grav: 1 },
    watch: runner ? solids.filter((s) => s.q.n && (runner.touch.has(s.q.n) || runner.leave.has(s.q.n))).map((s) => s.i) : [], touching: new Set(), started: false, script: [],
    info: { coins, movers: [], tps: [], spawn: null },
    cp: null, cpIdx: -1, p: { ...spawn }, v: { x: 0, y: 0, z: 0 },
    onGround: false, air: 0, lastJump: 0, lastReset: 0, boost: 0, facing: 0,
    crumbles: new Map(), got: new Set(), coins: 0, totalCoins: coins.length,
    deaths: 0, steps: 0, runSteps: 0, won: false, events: [], logic: null, movers: [],
    fallY: low - 25, standing: -1,
  };
  if (runner) Object.assign(hostRef, scriptHost(S));
  updateDyn(S);
  return S;
}

/* ---------------- moving parts: motion, script moves and turns ---------------- */
const lerp3 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
const sm = (x) => Math.round((0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)))) * 1e6) / 1e6;
function updateDyn(S) {
  const t = S.steps / 60;
  for (const i of S.dyn) {
    const L = S.live.get(i), s = S.solids[i];
    if (L.tw) { const f = sm((S.steps - L.tw.t0) / L.tw.n); L.bp = lerp3(L.tw.a, L.tw.b, f); if (f >= 1) L.tw = null; }
    if (L.tr) { const f = sm((S.steps - L.tr.t0) / L.tr.n); L.br = lerp3(L.tr.a, L.tr.b, f); if (f >= 1) L.tr = null; }
    if (L.spin) L.br = [(L.br[0] + L.spin[0] / 60) % 360, (L.br[1] + L.spin[1] / 60) % 360, (L.br[2] + L.spin[2] / 60) % 360].map((v) => Math.round(v * 1e6) / 1e6);
    const mo = motionAt(L.q.mo, t);
    const p = mo ? [L.bp[0] + mo.dp[0], L.bp[1] + mo.dp[1], L.bp[2] + mo.dp[2]] : L.bp, r = mo ? [L.br[0] + mo.dr[0], L.br[1] + mo.dr[1], L.br[2] + mo.dr[2]] : L.br;
    L.oldP = L.p; L.oldR = L.R;
    const same = p[0] === L.p[0] && p[1] === L.p[1] && p[2] === L.p[2] && r[0] === L.r[0] && r[1] === L.r[1] && r[2] === L.r[2] && !L.reshape;
    L.moved = !same;
    if (same) continue;
    L.p = p; L.r = r; L.R = rotMat(r); L.reshape = false;
    const g = solidOf({ ...L.q, p, r });
    s.v = g.v; s.planes = g.planes; s.min = g.min; s.max = g.max; s.c = g.c; s.rad = g.rad; s.ball = g.ball;
    s.q = { ...L.q, p, r };
  }
}
// where a point riding on moving part i ends up after this step's move
function carry(S, i, pt) {
  const L = S.live.get(i); if (!L || !L.moved) return pt;
  const R0 = L.oldR, R1 = L.R, d = [pt.x - L.oldP[0], pt.y - L.oldP[1], pt.z - L.oldP[2]];
  const lx = R0[0][0] * d[0] + R0[1][0] * d[1] + R0[2][0] * d[2], ly = R0[0][1] * d[0] + R0[1][1] * d[1] + R0[2][1] * d[2], lz = R0[0][2] * d[0] + R0[1][2] * d[1] + R0[2][2] * d[2];
  return { x: L.p[0] + R1[0][0] * lx + R1[0][1] * ly + R1[0][2] * lz, y: L.p[1] + R1[1][0] * lx + R1[1][1] * ly + R1[1][2] * lz, z: L.p[2] + R1[2][0] * lx + R1[2][1] * ly + R1[2][2] * lz };
}

/* ---------------- what scripts can do (Blockscript's host) ---------------- */
const NAMED_COLORS = { red: '#e63946', orange: '#ff7b25', yellow: '#ffd23f', green: '#5fc76b', blue: '#3a86ff', purple: '#9b5de5', pink: '#ff5d8f', white: '#f5f5f5', black: '#1d1d2c', gray: '#8d99ae', grey: '#8d99ae', brown: '#8b5a2b', cyan: '#4cc9f0', lime: '#a6e22e', gold: '#ffc300' };
function scriptHost(S) {
  const byName = new Map();
  S.solids.forEach((s) => { if (s.q.n) { if (!byName.has(s.q.n)) byName.set(s.q.n, []); byName.get(s.q.n).push(s.i); } });
  const L = (i) => { const x = S.live.get(i); if (!x) throw Object.assign(new Error(`Part "${S.solids[i].q.n}" can only be changed when its name is written in quotes in a script, like part("${S.solids[i].q.n}").`), { bs: true }); return x; };
  const steps = (sec) => Math.max(1, Math.round(Math.min(600, Math.max(0, sec || 0)) * 60));
  const visual = (x) => { x.ver++; S.script.push({ t: 'part', i: x.i }); };
  return {
    find: (n) => byName.get(n) || [],
    partName: (i) => S.solids[i].q.n || '',
    partGet: (i, k) => {
      const x = S.live.get(i), q = x ? x.q : S.solids[i].q, p = x ? x.p : q.p, r = x ? x.r : q.r;
      return k === 'x' ? p[0] : k === 'y' ? p[1] : k === 'z' ? p[2] : k === 'sx' ? q.z[0] : k === 'sy' ? q.z[1] : k === 'sz' ? q.z[2]
        : k === 'rx' ? r[0] : k === 'ry' ? r[1] : k === 'rz' ? r[2] : k === 'hidden' ? !!(x && x.hide) : k === 'color' ? q.c : null;
    },
    partDo: (i, m, a) => {
      const x = L(i); x.i = i; const s = S.solids[i];
      const sec = (k) => (a.length > k ? a[k] : 0);
      if (m === 'move' || m === 'moveTo') {
        const to = m === 'move' ? [x.bp[0] + a[0], x.bp[1] + a[1], x.bp[2] + a[2]] : [a[0], a[1], a[2]];
        const b = to.map((v, k) => Math.round(Math.min(k === 1 ? 500 : 1000, Math.max(k === 1 ? -100 : 0, Number(v) || 0)) * 1e4) / 1e4);
        if (sec(3) > 0) x.tw = { a: x.bp.slice(), b, t0: S.steps, n: steps(sec(3)) }; else { x.tw = null; x.bp = b; }
      } else if (m === 'turn' || m === 'turnTo') {
        const b = m === 'turn' ? [x.br[0] + a[0], x.br[1] + a[1], x.br[2] + a[2]] : [a[0], a[1], a[2]];
        if (sec(3) > 0) x.tr = { a: x.br.slice(), b, t0: S.steps, n: steps(sec(3)) }; else { x.tr = null; x.br = b.map((v) => Math.round(v * 1e4) / 1e4); }
      } else if (m === 'spin') x.spin = [a[0] || 0, a[1] || 0, a[2] || 0].map((v) => Math.max(-1440, Math.min(1440, v)));
      else if (m === 'stop') { x.spin = null; x.tw = null; x.tr = null; x.q = { ...x.q }; delete x.q.mo; x.bp = x.p.slice(); x.br = x.r.slice(); }
      else if (m === 'hide' || m === 'show') { x.hide = m === 'hide'; s.walk = !x.hide && !x.q.nc && x.q.k !== 'coin'; S.script.push({ t: 'part', i }); }
      else if (m === 'solid') { x.q.nc = a[0] === false || a[0] === 0 ? true : undefined; s.walk = !x.hide && !x.q.nc && x.q.k !== 'coin'; }
      else if (m === 'color') { const c = String(a[0]).toLowerCase(); const h = NAMED_COLORS[c] || (/^#[0-9a-f]{6}$/.test(c) ? c : null); if (!h) throw Object.assign(new Error(`"${a[0]}" isn't a color. Use "#ff0000" or a name like "red".`), { bs: true }); x.q.c = h; visual(x); }
      else if (m === 'glow') { x.q.g = Math.max(0, Math.min(1, a[0] || 0)); visual(x); }
      else if (m === 'see') { x.q.t = Math.max(0, Math.min(1, a[0] || 0)); visual(x); }
      else if (m === 'size') { x.q.z = [0, 1, 2].map((k) => Math.max(0.1, Math.min(200, a[k] ?? x.q.z[k]))); if (x.q.s === 'ball') x.q.z = [x.q.z[0], x.q.z[0], x.q.z[0]]; x.reshape = true; visual(x); }
    },
    playerGet: (k) => (k === 'x' ? S.p.x : k === 'y' ? S.p.y : k === 'z' ? S.p.z : k === 'coins' ? S.coins : k === 'deaths' ? S.deaths : k === 'time' ? S.runSteps / 60 : null),
    playerDo: (m, a) => {
      if (m === 'kill') S.scriptKill = true;
      else if (m === 'win') S.scriptWin = true;
      else if (m === 'teleport') { S.p.x = Math.max(0, Math.min(1000, a[0])); S.p.y = Math.max(-50, Math.min(600, a[1])); S.p.z = Math.max(0, Math.min(1000, a[2])); S.v.x = S.v.y = S.v.z = 0; }
      else if (m === 'speed') S.smod.speed = Math.max(0, Math.min(4, a[0]));
      else if (m === 'jump') S.smod.jump = Math.max(0, Math.min(4, a[0]));
      else if (m === 'gravity') S.smod.grav = Math.max(-1, Math.min(4, a[0]));
      else if (m === 'launch') { S.v.x = Math.max(-60, Math.min(60, a[0])); S.v.y = Math.max(-60, Math.min(80, a[1])); S.v.z = Math.max(-60, Math.min(60, a[2])); S.onGround = false; }
      else if (m === 'checkpoint') { S.cp = a.length ? { x: a[0], y: a[1], z: a[2] } : { x: S.p.x, y: S.p.y + 1e-4, z: S.p.z }; S.events.push({ t: 'checkpoint', x: S.cp.x, y: S.cp.y, z: S.cp.z }); }
    },
    say: (t) => S.script.push({ t: 'say', text: t }),
    print: (t) => S.script.push({ t: 'print', text: t }),
    board: (l, v) => S.script.push({ t: 'board', label: l, value: v }),
    sound: (n) => S.script.push({ t: 'sound', name: n }),
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
  for (const i of S.dyn) { const s = S.solids[i]; if (s.max[0] >= x0 - 1 && s.min[0] <= x1 + 1 && s.max[2] >= z0 - 1 && s.min[2] <= z1 + 1) add(i); }
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
// (TN = which way that surface faces: TN[1] is 1 for flat ground and gets smaller the steeper it is)
const TN = [0, 1, 0];
const MIN_FLAT = 0.62; // steeper than about 52 degrees is a wall: you can't walk up it or stand on it, you slide off
function topAt(s, x, z, yFrom) {
  if (x < s.min[0] || x > s.max[0] || z < s.min[2] || z > s.max[2] || s.min[1] > yFrom) return -Infinity;
  TN[0] = 0; TN[1] = 1; TN[2] = 0;
  if (s.ball) {
    const dx = x - s.c[0], dz = z - s.c[2], h = s.rad * s.rad - dx * dx - dz * dz;
    if (h < 0) return -Infinity;
    const y = s.c[1] + Math.sqrt(h);
    if (y <= yFrom) { TN[0] = dx / s.rad; TN[1] = Math.sqrt(h) / s.rad; TN[2] = dz / s.rad; return y; }
    return s.c[1] - Math.sqrt(h) <= yFrom ? yFrom : -Infinity;
  }
  // the line x, z going down: the part is where every face says "inside"; find the highest such y (<= yFrom)
  let hi = yFrom, lo = -Infinity;
  for (const pl of s.planes) {
    const rest = pl[3] - pl[0] * x - pl[2] * z; // n1 * y <= rest
    if (Math.abs(pl[1]) < 1e-9) { if (rest < -1e-9) return -Infinity; continue; }
    const yb = rest / pl[1];
    if (pl[1] > 0) { if (yb < hi) { hi = yb; TN[0] = pl[0]; TN[1] = pl[1]; TN[2] = pl[2]; } } else if (yb > lo) lo = yb;
  }
  return hi >= lo - 1e-9 ? hi : -Infinity;
}
// the highest ground under the player's feet (5 spots: middle and 4 corners), no higher than yFrom; which part it is in SUP
// walk = true: only ground flat enough to walk on counts. SUPN = which way the found ground faces.
let SUP = -1;
const SUPN = [0, 1, 0];
function groundAt(S, px, pz, yFrom, yTo, walk = false, spots = SPOTS) {
  const hw = P3.halfW;
  let best = -Infinity; SUP = -1; SUPN[0] = 0; SUPN[1] = 1; SUPN[2] = 0;
  for (const i of nearby(S, px - hw, px + hw, pz - hw, pz + hw)) {
    const s = S.solids[i];
    if (!s.walk || s.max[1] < yTo || s.min[1] > yFrom) continue;
    for (const [dx, dz] of spots) {
      const t = topAt(s, px + dx * hw, pz + dz * hw, yFrom);
      if (t === -Infinity || (walk && TN[1] < MIN_FLAT)) continue;
      if (t > best) { best = t; SUP = i; SUPN[0] = TN[0]; SUPN[1] = TN[1]; SUPN[2] = TN[2]; }
    }
  }
  return best >= yTo ? best : -Infinity;
}
const SPOTS = [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]];
// a closer look (25 spots), for when you rest on something small or pointy between the 5 spots
const FINE = []; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) FINE.push([a / 2, b / 2]);

/* ---------------- moving ---------------- */
// sideways: bump into things, or step up onto something low enough (a step, a ramp, a curb)
function moveSide(S, axis, d) {
  const p = S.p;
  p[axis] += d;
  if (solidAt(S, p.x, p.y, p.z) < 0) return;
  // step up?
  const g = groundAt(S, p.x, p.z, p.y + P3.step, p.y - 1e-4, true);
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
  if (reset && !S.lastReset) { S.lastReset = 1; die(S); if (S.runner) S.runner.fire('die'); return; }
  S.lastReset = reset;
  if (S.dyn.length) {
    updateDyn(S);
    // ride along on whatever moving part you stand on, and get pushed by moving parts that run into you
    if (S.standing >= 0 && S.solids[S.standing].dyn && S.onGround) {
      const n = carry(S, S.standing, S.p), ox = S.p.x, oy = S.p.y, oz = S.p.z;
      S.p.x = n.x; S.p.y = n.y; S.p.z = n.z;
      // carried into something that doesn't move (a pole on a carousel, a wall next to a lift): it stops you
      const hit0 = solidAt(S, S.p.x, S.p.y, S.p.z);
      if (hit0 >= 0 && !S.solids[hit0].dyn) { S.p.x = ox; S.p.z = oz; if (solidAt(S, S.p.x, S.p.y, S.p.z) >= 0) S.p.y = oy; }
    }
    const hit = solidAt(S, S.p.x, S.p.y, S.p.z);
    if (hit >= 0 && S.solids[hit].dyn) {
      const n = carry(S, hit, S.p); S.p.x = n.x; S.p.z = n.z; S.p.y = Math.max(S.p.y, n.y);
      if (solidAt(S, S.p.x, S.p.y, S.p.z) >= 0) { const g = groundAt(S, S.p.x, S.p.z, S.p.y + P3.height, S.p.y - 0.01); if (g > -Infinity && g - S.p.y < P3.height && solidAt(S, S.p.x, g + 1e-4, S.p.z) < 0) S.p.y = g + 1e-4; }
    }
  }
  const swim = inWater(S); S.swim = swim;
  const f = ((bits & 1) ? 1 : 0) - ((bits & 2) ? 1 : 0), sd = ((bits & 8) ? 1 : 0) - ((bits & 4) ? 1 : 0);
  let dx = f * SIN[yaw] + sd * COS[yaw], dz = -f * COS[yaw] + sd * SIN[yaw];
  if (f && sd) { dx *= 0.7071068; dz *= 0.7071068; }
  const under = S.onGround && S.standing >= 0 ? S.solids[S.standing] : null;
  const icy = !!(under && under.slip);
  const G = S.mods || null;
  const top = P3.speed * (S.boost > 0 ? P3.boost : 1) * (G && G.speed ? G.speed : 1) * S.smod.speed * (swim ? 0.7 : 1);
  const tx = dx * top, tz = dz * top, moving = f || sd;
  const rate = !S.onGround ? P3.airAccel : icy ? (moving ? P3.iceAccel : P3.iceFriction) : (moving ? P3.accel : P3.friction);
  const ex = tx - S.v.x, ez = tz - S.v.z, len = Math.sqrt(ex * ex + ez * ez), maxd = rate * dt;
  if (len <= maxd) { S.v.x = tx; S.v.z = tz; } else { S.v.x += ex / len * maxd; S.v.z += ez / len * maxd; }
  if (moving) S.facing = yaw;
  if (S.boost > 0) S.boost--;
  const jumpHeld = !!(bits & 16), pressed = jumpHeld && !S.lastJump;
  S.lastJump = jumpHeld ? 1 : 0;
  if (swim) {
    // swimming: slow sinking, hold jump to swim up
    if (jumpHeld) S.v.y = Math.min(S.v.y + 32 * dt, 5.5);
  } else if (jumpHeld && (S.onGround || (pressed && S.air < P3.coyote)) && S.v.y <= 0.001) {
    S.v.y = P3.jump * S.smod.jump; S.onGround = false; S.air = P3.coyote;
    S.events.push({ t: 'jump', x: S.p.x, y: S.p.y, z: S.p.z });
  } else if (G) {
    if (S.onGround) { S.jumpsLeft = G.jumps || 0; S.fuel = G.jet || 0; }
    if (G.jumps && pressed && !S.onGround && S.jumpsLeft > 0) { S.jumpsLeft--; S.v.y = P3.jump * 0.95; S.events.push({ t: 'jump2', x: S.p.x, y: S.p.y, z: S.p.z }); }
    else if (G.jet && jumpHeld && !S.onGround && S.fuel > 0 && S.air > 8) { S.fuel--; S.v.y = Math.min(8, S.v.y + 70 * dt); S.jetting = 4; }
  }
  S.v.y -= P3.gravity * (G && G.grav ? G.grav : 1) * S.smod.grav * (swim ? 0.22 : 1) * dt;
  if (S.v.y < -P3.maxFall) S.v.y = -P3.maxFall;
  if (swim && S.v.y < -4) S.v.y = -4;
  if (S.v.x) moveSide(S, 'x', S.v.x * dt);
  if (S.v.z) moveSide(S, 'z', S.v.z * dt);
  const fallV = S.v.y, wasGround = S.onGround;
  const hitY = S.v.y ? moveUp(S, S.v.y * dt) : false;
  S.onGround = hitY && fallV < 0;
  // walking down a slope or off a small step: stay on the ground
  if (!S.onGround && wasGround && fallV <= 0) {
    const g = groundAt(S, S.p.x, S.p.z, S.p.y + 1e-3, S.p.y - P3.snap, true);
    if (g > -Infinity && solidAt(S, S.p.x, g + 1e-4, S.p.z) < 0) { S.p.y = g + 1e-4; S.v.y = 0; S.onGround = true; }
  }
  if (S.onGround) {
    let g = groundAt(S, S.p.x, S.p.z, S.p.y + 0.01, S.p.y - 0.1, true);
    if (g > -Infinity) { S.air = 0; S.standing = SUP; S.steep = 0; }
    else {
      // nothing walkable right under the 5 spots: look closer at what is holding you up (a point, an edge, a steep side)
      g = groundAt(S, S.p.x, S.p.z, S.p.y + 0.01, S.p.y - 0.6, false, FINE);
      if (g > -Infinity && SUPN[1] < MIN_FLAT && (S.steep = (S.steep || 0) + 1) < 60) {
        // what's under you is too steep (a cone, the side of a ball, a sharp roof): you slide off it instead of standing
        // (the way you slide is picked once and kept, so on a point you don't wobble back and forth)
        if (S.steep === 1 || S.slideStuck) {
          let dx = SUPN[0], dz = SUPN[2];
          if (Math.hypot(dx, dz) < 0.05) { const s = S.solids[SUP]; dx = S.p.x - (s.min[0] + s.max[0]) / 2; dz = S.p.z - (s.min[2] + s.max[2]) / 2; }
          const l = Math.hypot(dx, dz); S.slide = l > 1e-6 ? [dx / l, dz / l] : [1, 0];
        }
        const sp = 6 * dt, ox = S.p.x, oz = S.p.z;
        S.p.x += S.slide[0] * sp; if (solidAt(S, S.p.x, S.p.y, S.p.z) >= 0) S.p.x = ox;
        S.p.z += S.slide[1] * sp; if (solidAt(S, S.p.x, S.p.y, S.p.z) >= 0) S.p.z = oz;
        S.slideStuck = S.p.x === ox && S.p.z === oz;
        S.onGround = false; S.standing = -1; S.air = P3.coyote;
      } else { S.air = 0; S.standing = g > -Infinity ? SUP : -1; } // (stuck between steep things for a second: you may stand and jump out)
    }
  } else { S.air++; S.standing = -1; if (S.v.y > 0) S.steep = 0; }
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
  if (S.p.y < S.fallY) { die(S); if (S.runner) S.runner.fire('die'); return; }
  if (S.runner) runScripts(S);
}

function inWater(S) {
  const hw = P3.halfW, y = S.p.y + P3.height * 0.45;
  for (const i of nearby(S, S.p.x - hw, S.p.x + hw, S.p.z - hw, S.p.z + hw)) {
    const s = S.solids[i]; if (!s.water) continue;
    const L = S.live.get(i); if (L && L.hide) continue;
    if (boxHits(s, S.p.x - hw, y - 0.1, S.p.z - hw, S.p.x + hw, y + 0.1, S.p.z + hw)) return true;
  }
  return false;
}
// scripts: events from this step (start, touch/leave, coin, checkpoint, land, jump), then run them
function runScripts(S) {
  const R = S.runner;
  if (!S.started) { S.started = true; R.fire('start'); }
  for (const e of S.events) if (e.t === 'coin' || e.t === 'checkpoint' || e.t === 'land' || e.t === 'jump') R.fire(e.t);
  if (S.watch.length) {
    const hw = P3.halfW + 0.05, x0 = S.p.x - hw, x1 = S.p.x + hw, z0 = S.p.z - hw, z1 = S.p.z + hw, y0 = S.p.y - 0.08, y1 = S.p.y + P3.height + 0.05;
    const now = new Set();
    for (const i of S.watch) { const s = S.solids[i], L = S.live.get(i); if (L && L.hide) continue; if (boxHits(s, x0, y0, z0, x1, y1, z1)) now.add(s.q.n); }
    for (const n of now) if (!S.touching.has(n)) R.fire('touch', n);
    for (const n of S.touching) if (!now.has(n)) R.fire('leave', n);
    S.touching = now;
  }
  R.step(S.steps);
  if (S.scriptKill) { S.scriptKill = false; die(S); R.fire('die'); }
  if (S.scriptWin) { S.scriptWin = false; if (S.obby) { S.won = true; S.events.push({ t: 'win', x: S.p.x, y: S.p.y, z: S.p.z }); } }
}

export function runReplay2(world, str, { maxSteps = 18000 } = {}) {
  const runs = decodeReplay(str, maxSteps, { maxValue: 16384, rate: 60 });
  const S = createSim2(world);
  for (const [value, count] of runs) {
    for (let i = 0; i < count; i++) {
      step2(S, value);
      S.events.length = 0; S.script.length = 0;
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
// (for the tests: is the player stuck inside something, and what's under them)
export const debug2 = { inside: (S) => solidAt(S, S.p.x, S.p.y, S.p.z), ground: (S, walk) => { const g = groundAt(S, S.p.x, S.p.z, S.p.y + 0.01, S.p.y - 0.1, walk); return { y: g, i: SUP, ny: SUPN[1] }; } };
