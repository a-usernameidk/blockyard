// Engine v2 movement: the player walks on free parts (any size, turn and shape).
// Same buttons, same speed and jump as v1 (P3), fixed 60 steps a second, no randomness: the server replays runs
// with this exact file. The player is a box (P3.halfW wide, P3.height tall) that never turns.
// Parts are convex solids (planes) or balls; parts live in a grid of 8x8 columns so only nearby ones are checked.
import { P3, STEP3, YAWS } from './physics3d.js';
import { solidOf, rotMat, motionAt, MATERIALS2, MATERIAL2, WORLD2 } from './parts.js';
import { decodeReplay } from './replay.js';
import { createRunner } from './bscript.js';

// which way you face when you walk: the camera's direction turned by the keys (forward-right = 45 degrees, and so on)
const WALK_TURN = [160, 128, 96, 192, 0, 64, 224, 0, 32]; // [(f + 1) * 3 + (sd + 1)] in 256ths of a turn
const SIN = new Float64Array(YAWS), COS = new Float64Array(YAWS);
for (let i = 0; i < YAWS; i++) {
  SIN[i] = Math.round(Math.sin(i * 2 * Math.PI / YAWS) * 1e6) / 1e6;
  COS[i] = Math.round(Math.cos(i * 2 * Math.PI / YAWS) * 1e6) / 1e6;
}
const CELL = 8, EPS = 1e-6;
// headings for vehicles and things that follow the player: 4096 steps a turn, rounded so every computer agrees
const HEADS = 4096, HSIN = new Float64Array(HEADS), HCOS = new Float64Array(HEADS);
for (let i = 0; i < HEADS; i++) {
  HSIN[i] = Math.round(Math.sin(i * 2 * Math.PI / HEADS) * 1e6) / 1e6;
  HCOS[i] = Math.round(Math.cos(i * 2 * Math.PI / HEADS) * 1e6) / 1e6;
}
const headIdx = (h) => ((Math.round(h) % HEADS) + HEADS) % HEADS;
export const KEY2 = { use: 64 }; // (on top of KEY in physics3d.js)

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
    hw: P3.halfW, ht: P3.height, head: 0, drive: null, followers: [], lastUse: 0, usePress: false, ext: null, crown: null,
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
    const L = S.live.get(i);
    if (L.tw) { const f = sm((S.steps - L.tw.t0) / L.tw.n); L.bp = lerp3(L.tw.a, L.tw.b, f); if (f >= 1) L.tw = null; }
    if (L.tr) { const f = sm((S.steps - L.tr.t0) / L.tr.n); L.br = lerp3(L.tr.a, L.tr.b, f); if (f >= 1) L.tr = null; }
    if (L.spin) L.br = [(L.br[0] + L.spin[0] / 60) % 360, (L.br[1] + L.spin[1] / 60) % 360, (L.br[2] + L.spin[2] / 60) % 360].map((v) => Math.round(v * 1e6) / 1e6);
    placeDyn(S, i, t);
  }
}
// puts moving part i where its base spot + motion say, and rebuilds what you bump into if it moved
function placeDyn(S, i, t) {
  const L = S.live.get(i), s = S.solids[i];
  const mo = motionAt(L.q.mo, t);
  const p = mo ? [L.bp[0] + mo.dp[0], L.bp[1] + mo.dp[1], L.bp[2] + mo.dp[2]] : L.bp, r = mo ? [L.br[0] + mo.dr[0], L.br[1] + mo.dr[1], L.br[2] + mo.dr[2]] : L.br;
  L.oldP = L.p; L.oldR = L.R;
  const same = p[0] === L.p[0] && p[1] === L.p[1] && p[2] === L.p[2] && r[0] === L.r[0] && r[1] === L.r[1] && r[2] === L.r[2] && !L.reshape;
  L.moved = !same;
  if (same) return;
  L.p = p; L.r = r; L.R = rotMat(r); L.reshape = false;
  const g = solidOf({ ...L.q, p, r });
  s.v = g.v; s.planes = g.planes; s.min = g.min; s.max = g.max; s.c = g.c; s.rad = g.rad; s.ball = g.ball;
  s.q = { ...L.q, p, r };
}
/* ---------------- parts that follow the player (a car's body, a tool in the hand, a lamp) ---------------- */
const r6f = (v) => Math.round(v * 1e6) / 1e6;
// where follower L sits when the player is at x, y, z looking along heading `head` (0..4095)
function followSpot(L, x, y, z, head) {
  const F = L.fol, d = headIdx(F.a0 - head), c = HCOS[d], sn = HSIN[d];
  return { p: [r6f(x + F.off[0] * c + F.off[2] * sn), r6f(y + F.off[1]), r6f(z - F.off[0] * sn + F.off[2] * c)], r: [F.r0[0], r6f(F.r0[1] + d * 360 / HEADS), F.r0[2]] };
}
function updateFollow(S) {
  const t = S.steps / 60;
  for (const i of S.followers) {
    const L = S.live.get(i), at = followSpot(L, S.p.x, S.p.y, S.p.z, S.head);
    L.bp = at.p; L.br = at.r;
    placeDyn(S, i, t);
  }
}
// (for drawing between steps: the same spot, for a smoothed player position; null if part i isn't following)
export function followAt(S, i, x, y, z) {
  const L = S.live.get(i); if (!L || !L.fol) return null;
  const at = followSpot(L, x, y, z, S.head), mo = motionAt(L.q.mo, S.steps / 60);
  const r = mo ? [at.r[0] + mo.dr[0], at.r[1] + mo.dr[1], at.r[2] + mo.dr[2]] : at.r;
  return { p: mo ? [at.p[0] + mo.dp[0], at.p[1] + mo.dp[1], at.p[2] + mo.dp[2]] : at.p, R: rotMat(r) };
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
        const b = to.map((v, k) => Math.round(Math.min(k === 1 ? WORLD2.y : k === 0 ? WORLD2.x : WORLD2.z, Math.max(k === 1 ? -100 : 0, Number(v) || 0)) * 1e4) / 1e4);
        if (sec(3) > 0) x.tw = { a: x.bp.slice(), b, t0: S.steps, n: steps(sec(3)) }; else { x.tw = null; x.bp = b; }
      } else if (m === 'turn' || m === 'turnTo') {
        const b = m === 'turn' ? [x.br[0] + a[0], x.br[1] + a[1], x.br[2] + a[2]] : [a[0], a[1], a[2]];
        if (sec(3) > 0) x.tr = { a: x.br.slice(), b, t0: S.steps, n: steps(sec(3)) }; else { x.tr = null; x.br = b.map((v) => Math.round(v * 1e4) / 1e4); }
      } else if (m === 'spin') x.spin = [a[0] || 0, a[1] || 0, a[2] || 0].map((v) => Math.max(-1440, Math.min(1440, v)));
      else if (m === 'stop') { x.spin = null; x.tw = null; x.tr = null; x.q = { ...x.q }; delete x.q.mo; x.bp = x.p.slice(); x.br = x.r.slice(); }
      else if (m === 'hide' || m === 'show') { x.hide = m === 'hide'; s.walk = !x.hide && !x.q.nc && x.q.k !== 'coin' && !x.fol; S.script.push({ t: 'part', i }); }
      else if (m === 'solid') { x.q.nc = a[0] === false || a[0] === 0 ? true : undefined; s.walk = !x.hide && !x.q.nc && x.q.k !== 'coin' && !x.fol; }
      else if (m === 'color') { const c = String(a[0]).toLowerCase(); const h = NAMED_COLORS[c] || (/^#[0-9a-f]{6}$/.test(c) ? c : null); if (!h) throw Object.assign(new Error(`"${a[0]}" isn't a color. Use "#ff0000" or a name like "red".`), { bs: true }); x.q.c = h; visual(x); }
      else if (m === 'glow') { x.q.g = Math.max(0, Math.min(1, a[0] || 0)); visual(x); }
      else if (m === 'see') { x.q.t = Math.max(0, Math.min(1, a[0] || 0)); visual(x); }
      else if (m === 'follow') {
        // glue it to the player. No numbers: it keeps the spot it has right now (a car you just sat in).
        // follow(right, up, forward): that spot next to the player (build the part facing north, -z).
        if (!x.fol && S.followers.length >= 300) throw Object.assign(new Error('Up to 300 parts can follow the player.'), { bs: true });
        x.tw = null; x.tr = null; x.spin = null;
        const c = (v) => Math.max(-60, Math.min(60, Number(v) || 0));
        x.fol = a.length >= 3 ? { a0: 0, off: [c(a[0]), c(a[1]), -c(a[2])], r0: x.br.slice() } : { a0: S.head, off: [c(x.bp[0] - S.p.x), c(x.bp[1] - S.p.y), c(x.bp[2] - S.p.z)], r0: x.br.slice() };
        if (!S.followers.includes(i)) { S.followers.push(i); S.followers.sort((p, q) => p - q); }
        s.walk = false; // (what follows you never blocks you)
      } else if (m === 'unfollow') { if (x.fol) { x.fol = null; S.followers = S.followers.filter((k) => k !== i); x.bp = x.p.slice(); x.br = x.r.slice(); s.walk = !x.hide && !x.q.nc && x.q.k !== 'coin'; } }
      else if (m === 'size') { x.q.z = [0, 1, 2].map((k) => Math.max(0.1, Math.min(1000, a[k] ?? x.q.z[k]))); if (x.q.s === 'ball') x.q.z = [x.q.z[0], x.q.z[0], x.q.z[0]]; x.reshape = true; visual(x); }
    },
    playerGet: (k) => (k === 'x' ? S.p.x : k === 'y' ? S.p.y : k === 'z' ? S.p.z : k === 'coins' ? S.coins : k === 'deaths' ? S.deaths : k === 'time' ? S.runSteps / 60
      : k === 'vel' ? r6f(S.drive ? Math.abs(S.drive.v) : Math.sqrt(S.v.x * S.v.x + S.v.z * S.v.z)) : k === 'facing' ? r6f(headIdx(S.head) * 360 / HEADS) : k === 'driving' ? !!S.drive
      : k === 'swimming' ? !!S.swim : k === 'grounded' ? !!S.onGround : k === 'crowned' ? !!(S.crown && S.crown.me) : null),
    playerDo: (m, a) => {
      if (m === 'kill') S.scriptKill = true;
      else if (m === 'win') S.scriptWin = true;
      else if (m === 'teleport') { S.p.x = Math.max(0, Math.min(WORLD2.x, a[0])); S.p.y = Math.max(-50, Math.min(600, a[1])); S.p.z = Math.max(0, Math.min(WORLD2.z, a[2])); S.v.x = S.v.y = S.v.z = 0; if (S.drive) S.drive.v = 0; freeSpot(S); }
      else if (m === 'speed') S.smod.speed = Math.max(0, Math.min(4, a[0]));
      else if (m === 'jump') S.smod.jump = Math.max(0, Math.min(4, a[0]));
      else if (m === 'gravity') S.smod.grav = Math.max(-1, Math.min(4, a[0]));
      else if (m === 'launch') { S.v.x = Math.max(-60, Math.min(60, a[0])); S.v.y = Math.max(-60, Math.min(80, a[1])); S.v.z = Math.max(-60, Math.min(60, a[2])); S.onGround = false; }
      else if (m === 'drive') startDrive(S, a[0], a[1], !!a[2], a[3]);
      else if (m === 'walk') { S.drive = null; S.hw = P3.halfW; S.ht = P3.height; }
      else if (m === 'face') { S.head = headIdx((Number(a[0]) || 0) * HEADS / 360); S.facing = S.head >> 4; }
      else if (m === 'checkpoint') { S.cp = a.length ? { x: a[0], y: a[1], z: a[2] } : { x: S.p.x, y: S.p.y + 1e-4, z: S.p.z }; S.events.push({ t: 'checkpoint', x: S.cp.x, y: S.cp.y, z: S.cp.z }); }
    },
    say: (t) => S.script.push({ t: 'say', text: t }),
    print: (t) => S.script.push({ t: 'print', text: t }),
    board: (l, v) => S.script.push({ t: 'board', label: l, value: v }),
    sound: (n) => S.script.push({ t: 'sound', name: n }),
    // the closest part with that name (not hidden) within d studs, or -1; and how far the player is from part i
    near: (name, d) => { let best = -1, bd = d; for (const i of byName.get(name) || []) { if (hidden(S, i)) continue; const dd = distTo(S, i); if (dd <= bd) { bd = dd; best = i; } } return best; },
    dist: (i) => distTo(S, i),
    // can this part "see" the player? Nothing solid on the straight line from its middle to the player's head, and no further than `far`.
    sees: (i, far) => {
      const x = S.live.get(i), p = x ? x.p : S.solids[i].q.p, o = [p[0], p[1], p[2]];
      const dx = S.p.x - o[0], dy = S.p.y + S.ht * 0.8 - o[1], dz = S.p.z - o[2], len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len > far) return false;
      if (len < 0.05) return true;
      const d = [dx / len, dy / len, dz / len];
      for (const k of nearby(S, Math.min(o[0], S.p.x) - 0.5, Math.max(o[0], S.p.x) + 0.5, Math.min(o[2], S.p.z) - 0.5, Math.max(o[2], S.p.z) + 0.5)) {
        const s = S.solids[k]; if (k === i || !s.walk || s.water || (s.q.t || 0) > 0.45 || hidden(S, k)) continue;
        const F = S.live.get(k); if (F && F.fol) continue;
        const t = rayHit(s, o, d, len); if (t != null && t < len - 0.05) return false;
      }
      return true;
    },
    // is the part on the player's screen, more or less? (within `deg` degrees of where the camera points, left to right)
    looking: (i, deg) => {
      const x = S.live.get(i), p = x ? x.p : S.solids[i].q.p, dx = p[0] - S.p.x, dz = p[2] - S.p.z, len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.05) return true;
      const yaw = S.yaw || 0;
      return (dx * SIN[yaw] - dz * COS[yaw]) / len >= r6f(Math.cos(Math.max(1, Math.min(180, deg)) * Math.PI / 180)) ;
    },
    // things only the game on your screen does (the server skips them when it replays a run)
    prompt: (t) => S.script.push({ t: 'prompt', text: t }),
    button: (label, on) => S.script.push({ t: 'button', label, on }),
    send: (name, value) => S.script.push({ t: 'send', name, value }),
    fx: (k, v) => S.script.push({ t: 'fx', k, v }),
    // remembered between visits: only in hangouts (a run the server checks has to start the same for everyone)
    save: (k, v) => { if (S.ext && !S.obby) S.ext.save(k, v); },
    load: (k) => (S.ext && !S.obby ? S.ext.load(k) : undefined),
    crown: (k) => (k === 'name' ? (S.crown ? S.crown.name : '') : S.crown ? Math.max(0, Math.round(S.crown.left())) : 0),
  };
}
// how far the player's middle is from the outside of part i (0 when touching or inside its box)
function distTo(S, i) {
  const s = S.solids[i], x = S.p.x, y = S.p.y + 0.75, z = S.p.z;
  const dx = Math.max(s.min[0] - x, 0, x - s.max[0]), dy = Math.max(s.min[1] - y, 0, y - s.max[1]), dz = Math.max(s.min[2] - z, 0, z - s.max[2]);
  return r6f(Math.sqrt(dx * dx + dy * dy + dz * dz));
}
/* ---------------- driving ---------------- */
// Turns walking into driving: a bigger box, speed along where you point, steering with left/right.
// boat: it floats on water. If the bigger box doesn't fit here, it looks for a free spot close by (the same way on every computer).
const TRY_R = [0, 0.6, 1.2, 2, 3, 4.5], TRY_Y = [0, 0.3, 0.6, 1.1], TRY_D = [[1, 0], [0, 1], [-1, 0], [0, -1], [0.7, 0.7], [-0.7, 0.7], [-0.7, -0.7], [0.7, -0.7]];
// if the player's box is inside something (a teleport into a wall, a car that doesn't fit), move to the nearest free spot
// (tried in the same order on every computer). false = there is none close by.
function freeSpot(S) {
  if (solidAt(S, S.p.x, S.p.y, S.p.z) < 0) return true;
  const x = S.p.x, y = S.p.y, z = S.p.z;
  for (const r of TRY_R) for (const dy of TRY_Y) for (const [dx, dz] of (r ? TRY_D : [[0, 0]])) {
    if (solidAt(S, x + dx * r, y + dy, z + dz * r) < 0) { S.p.x = x + dx * r; S.p.y = y + dy; S.p.z = z + dz * r; return true; }
  }
  return false;
}
function startDrive(S, top, turn, boat, seat) {
  const was = S.drive;
  S.drive = { top: Math.max(0, Math.min(60, Number(top) || 0)), turn: Math.max(10, Math.min(360, Number(turn) || 110)), boat, v: was ? was.v : 0, seat: Math.max(0, Math.min(4, Number(seat) || 0)) };
  if (was) return;
  S.hw = 1.3; S.ht = 1.6;
  if (boat) { // up onto the water you're wading or swimming in
    let top2 = -Infinity;
    for (const i of nearby(S, S.p.x - S.hw, S.p.x + S.hw, S.p.z - S.hw, S.p.z + S.hw)) { const s = S.solids[i]; if (s.water && !hidden(S, i) && s.max[1] > S.p.y - 0.01 && s.min[1] < S.p.y + S.ht && S.p.x > s.min[0] && S.p.x < s.max[0] && S.p.z > s.min[2] && S.p.z < s.max[2]) top2 = Math.max(top2, s.max[1]); }
    if (top2 > -Infinity) S.p.y = top2 + 1e-4;
  }
  if (freeSpot(S)) return;
  // no room at all: stay on foot
  S.drive = null; S.hw = P3.halfW; S.ht = P3.height;
  S.script.push({ t: 'say', text: "There's no room to drive here." });
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
  const hw = S.hw, x0 = px - hw, x1 = px + hw, z0 = pz - hw, z1 = pz + hw, y0 = py, y1 = py + S.ht, boat = S.drive && S.drive.boat;
  // (a boat rides on top of the water: water is solid to it)
  for (const i of nearby(S, x0, x1, z0, z1)) { const s = S.solids[i]; if ((s.walk || (boat && s.water && !hidden(S, i))) && boxHits(s, x0, y0, z0, x1, y1, z1)) return i; }
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
  const hw = S.hw, boat = S.drive && S.drive.boat;
  let best = -Infinity; SUP = -1; SUPN[0] = 0; SUPN[1] = 1; SUPN[2] = 0;
  for (const i of nearby(S, px - hw, px + hw, pz - hw, pz + hw)) {
    const s = S.solids[i];
    if (!(s.walk || (boat && s.water && !hidden(S, i))) || s.max[1] < yTo || s.min[1] > yFrom) continue;
    for (const [dx, dz] of spots) {
      const t = topAt(s, px + dx * hw, pz + dz * hw, yFrom);
      if (t === -Infinity || (walk && TN[1] < MIN_FLAT)) continue;
      if (t > best) { best = t; SUP = i; SUPN[0] = TN[0]; SUPN[1] = TN[1]; SUPN[2] = TN[2]; }
    }
  }
  return best >= yTo ? best : -Infinity;
}
const SPOTS = [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]];
const hidden = (S, i) => { const L = S.live.get(i); return !!(L && L.hide); };
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
  // a wide vehicle rides over edges the 5 spots can miss (the top of a ramp, a curb at an angle): lift it a little at a
  // time, as long as there is ground flat enough to drive on right under it
  if (S.drive && S.onGround) {
    for (let dy = 0.08; dy <= P3.step + 1e-9; dy += 0.08) {
      if (solidAt(S, p.x, p.y + dy, p.z) >= 0) continue;
      if (groundAt(S, p.x, p.z, p.y + dy + 0.01, p.y - 0.2, true, FINE) > -Infinity) { p.y += dy; return; }
      break;
    }
  }
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
  if (S.drive) S.drive.v = 0;
  S.events.push({ t: 'respawn' });
}

/* ---------------- one step (the same as v1's step3, for parts) ---------------- */
export function step2(S, value) {
  if (S.won) return;
  const bits = value >> 8, yaw = value & 255, dt = STEP3;
  S.steps++; S.runSteps++; S.yaw = yaw;
  const reset = (bits & 32) ? 1 : 0;
  if (reset && !S.lastReset) { S.lastReset = 1; die(S); if (S.runner) S.runner.fire('die'); return; }
  S.lastReset = reset;
  const useHeld = (bits & 64) ? 1 : 0;
  if (useHeld && !S.lastUse) S.usePress = true;
  S.lastUse = useHeld;
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
      if (solidAt(S, S.p.x, S.p.y, S.p.z) >= 0) { const g = groundAt(S, S.p.x, S.p.z, S.p.y + S.ht, S.p.y - 0.01); if (g > -Infinity && g - S.p.y < S.ht && solidAt(S, S.p.x, g + 1e-4, S.p.z) < 0) S.p.y = g + 1e-4; }
    }
  }
  const swim = inWater(S); S.swim = swim;
  const f = ((bits & 1) ? 1 : 0) - ((bits & 2) ? 1 : 0), sd = ((bits & 8) ? 1 : 0) - ((bits & 4) ? 1 : 0);
  let dx = f * SIN[yaw] + sd * COS[yaw], dz = -f * COS[yaw] + sd * SIN[yaw];
  if (f && sd) { dx *= 0.7071068; dz *= 0.7071068; }
  const under = S.onGround && S.standing >= 0 ? S.solids[S.standing] : null;
  const icy = !!(under && under.slip);
  const G = S.mods || null;
  const D = S.drive;
  let hi = 0;
  if (D) {
    // driving: forward/back is the pedal, left/right steers (the camera doesn't)
    const afloat = D.boat && under && under.water;
    const top = D.top * S.smod.speed * (D.boat && S.onGround && !afloat ? 0.12 : 1);
    if (S.onGround || D.boat) {
      const target = f > 0 ? top : f < 0 ? -top * 0.45 : 0;
      const rate = (f === 0 ? 9 : D.v * f < 0 ? 42 : Math.max(10, D.top * 0.6)) * dt;
      D.v = r6f(D.v + Math.max(-rate, Math.min(rate, target - D.v)));
      const grip = Math.min(1, Math.abs(D.v) / 6);
      // (full steering at low speed, gentler flat out, so it doesn't twitch on a straight road)
      const ease = r6f(grip * (1 - 0.45 * Math.min(1, Math.abs(D.v) / Math.max(1, D.top))));
      if (sd && grip > 0) S.head = Math.round((((S.head + sd * D.turn * HEADS / 360 / 60 * ease * (D.v < 0 ? -1 : 1)) % HEADS) + HEADS) % HEADS * 1000) / 1000;
    }
    hi = headIdx(S.head);
    S.v.x = HSIN[hi] * D.v; S.v.z = -HCOS[hi] * D.v;
    S.facing = hi >> 4;
  } else {
    const top = P3.speed * (S.boost > 0 ? P3.boost : 1) * (G && G.speed ? G.speed : 1) * S.smod.speed * (swim ? 0.7 : 1);
    const tx = dx * top, tz = dz * top, moving = f || sd;
    const rate = !S.onGround ? P3.airAccel : icy ? (moving ? P3.iceAccel : P3.iceFriction) : (moving ? P3.accel : P3.friction);
    const ex = tx - S.v.x, ez = tz - S.v.z, len = Math.sqrt(ex * ex + ez * ez), maxd = rate * dt;
    if (len <= maxd) { S.v.x = tx; S.v.z = tz; } else { S.v.x += ex / len * maxd; S.v.z += ez / len * maxd; }
    if (moving) { S.facing = yaw; S.head = ((yaw + WALK_TURN[(f + 1) * 3 + sd + 1]) & 255) * (HEADS / YAWS); }
  }
  if (S.boost > 0) S.boost--;
  const jumpHeld = !!(bits & 16) && !D, pressed = jumpHeld && !S.lastJump;
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
  if (D) D.v = r6f(S.v.x * HSIN[hi] - S.v.z * HCOS[hi]); // (a wall takes away the speed that ran into it)
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
  const hw = S.hw + 0.05, x0 = S.p.x - hw, x1 = S.p.x + hw, z0 = S.p.z - hw, z1 = S.p.z + hw, y0 = S.p.y - 0.06, y1 = S.p.y + S.ht + 0.05;
  for (const i of nearby(S, x0, x1, z0, z1)) {
    const s = S.solids[i];
    if (!s.k || s.k === 'spawn' || s.k === 'checkpoint' || s.k === 'bounce' || s.k === 'speed') continue;
    if (!boxHits(s, x0, y0, z0, x1, y1, z1)) continue;
    if (s.k === 'kill') { die(S); return; }
    if (s.k === 'coin') { const key = coinKey(s); if (!S.got.has(key)) { S.got.add(key); S.coins++; S.events.push({ t: 'coin', i: key, x: s.q.p[0], y: s.q.p[1], z: s.q.p[2] }); } }
    if (s.k === 'goal' && S.obby) { S.won = true; S.events.push({ t: 'win', x: S.p.x, y: S.p.y, z: S.p.z }); return; }
  }
  if (S.p.y < S.fallY) { die(S); if (S.runner) S.runner.fire('die'); return; }
  if (S.followers.length) updateFollow(S);
  if (S.runner) runScripts(S);
}

function inWater(S) {
  if (S.drive && S.drive.boat) return false;
  const hw = S.hw, y = S.p.y + P3.height * 0.45;
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
  if (S.usePress) { S.usePress = false; R.fire('use'); }
  for (const e of S.events) if (e.t === 'coin' || e.t === 'checkpoint' || e.t === 'land' || e.t === 'jump') R.fire(e.t);
  if (S.watch.length) {
    const hw = S.hw + 0.05, x0 = S.p.x - hw, x1 = S.p.x + hw, z0 = S.p.z - hw, z1 = S.p.z + hw, y0 = S.p.y - 0.08, y1 = S.p.y + S.ht + 0.05;
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
  const runs = decodeReplay(str, maxSteps, { maxValue: 32768, rate: 60 });
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
// (the camera: how far it can pull back from o along d before a part you can't see through is in the way)
export function camClear(S, o, d, maxT) {
  const e = [o[0] + d[0] * maxT, o[1] + d[1] * maxT, o[2] + d[2] * maxT];
  let best = maxT;
  for (const i of nearby(S, Math.min(o[0], e[0]) - 0.5, Math.max(o[0], e[0]) + 0.5, Math.min(o[2], e[2]) - 0.5, Math.max(o[2], e[2]) + 0.5)) {
    const s = S.solids[i]; if (!s.walk || s.water || (s.q.t || 0) > 0.45 || hidden(S, i)) continue;
    const L = S.live.get(i); if (L && L.fol) continue;
    const t = rayHit(s, o, d, best); if (t != null && t < best) best = t;
  }
  return best;
}
// (for the tests: is the player stuck inside something, and what's under them)
export const debug2 = { inside: (S) => solidAt(S, S.p.x, S.p.y, S.p.z), ground: (S, walk) => { const g = groundAt(S, S.p.x, S.p.z, S.p.y + 0.01, S.p.y - 0.1, walk); return { y: g, i: SUP, ny: SUPN[1] }; } };
