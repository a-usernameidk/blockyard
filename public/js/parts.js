// Engine v2: worlds made of free parts (any size, position and turn) instead of a block grid.
// Shared by the browser (editor, renderer, game) and the server (checking and saving worlds, checking runs).
// Every shape is a convex solid (cylinders and cones are many-sided), except balls, which are real spheres.
// That keeps collision exact and simple, and the same on every computer.
import { cleanText, isRude } from './format.js';
import { SKIES, PALETTE, B } from './world.js';
import { isSong } from './cosmetics.js';

export const ENGINE2 = 2;
export const MAX_PARTS = 10000;
export const WORLD2 = { x: 1000, y: 500, z: 1000 }; // parts must be inside 0..x, 0..y, 0..z
export const SIZE2 = { min: 0.1, max: 200 };

export const SHAPES2 = [
  { id: 'box', name: 'Box' }, { id: 'wedge', name: 'Ramp' }, { id: 'corner', name: 'Corner ramp' },
  { id: 'cyl', name: 'Cylinder' }, { id: 'cone', name: 'Cone' }, { id: 'ball', name: 'Ball' },
  { id: 'halfcyl', name: 'Half cylinder' }, { id: 'pyramid', name: 'Pyramid' },
];
export const SHAPE2 = Object.fromEntries(SHAPES2.map((s, i) => [s.id, i]));
// materials: pat = which drawing (the same shader patterns as blocks), shine, and special feel
export const MATERIALS2 = [
  { id: 'plastic', name: 'Plastic', pat: 30 }, { id: 'smooth', name: 'Smooth plastic', pat: 40 },
  { id: 'wood', name: 'Wood', pat: 4 }, { id: 'planks', name: 'Wood planks', pat: 41 },
  { id: 'stone', name: 'Stone', pat: 3 }, { id: 'brick', name: 'Brick', pat: 5 },
  { id: 'cobble', name: 'Cobblestone', pat: 42 }, { id: 'marble', name: 'Marble', pat: 43 },
  { id: 'metal', name: 'Metal', pat: 12 }, { id: 'diamond', name: 'Diamond plate', pat: 44 },
  { id: 'glass', name: 'Glass', pat: 9, see: true }, { id: 'ice', name: 'Ice', pat: 8, slip: true },
  { id: 'neon', name: 'Neon', pat: 11, glow: true }, { id: 'grass', name: 'Grass', pat: 1 },
  { id: 'sand', name: 'Sand', pat: 6 }, { id: 'fabric', name: 'Fabric', pat: 45 },
];
export const MATERIAL2 = Object.fromEntries(MATERIALS2.map((m, i) => [m.id, i]));
// special jobs a part can have (any shape can be any of these)
export const SPECIALS2 = {
  spawn: 'Spawn (where players start)', checkpoint: 'Checkpoint', goal: 'Goal (win the obby)', kill: 'Kill (back to the checkpoint)',
  coin: 'Coin (grab it)', bounce: 'Bounce pad', speed: 'Speed pad',
};
const r3 = (v) => Math.round(v * 1000) / 1000;
const hex = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : '#a3abc2');

/* ---------------- one part ----------------
   { s: shape, p: [x,y,z] center, z: [sx,sy,sz] size, r: [rx,ry,rz] degrees, c: '#rrggbb', m: material,
     t?: see-through 0-1, g?: glow 0-1, nc?: walk through, k?: special, n?: name } */
export function cleanPart(q, i = 0) {
  if (!q || typeof q !== 'object') throw new Error(`Part ${i + 1} is broken.`);
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const s = SHAPE2[q.s] != null ? q.s : 'box';
  const p = Array.isArray(q.p) ? q.p : [], z = Array.isArray(q.z) ? q.z : [], r = Array.isArray(q.r) ? q.r : [];
  const out = {
    s,
    p: [r3(num(p[0], 0, WORLD2.x, 500)), r3(num(p[1], 0, WORLD2.y, 10)), r3(num(p[2], 0, WORLD2.z, 500))],
    z: [r3(num(z[0], SIZE2.min, SIZE2.max, 4)), r3(num(z[1], SIZE2.min, SIZE2.max, 1)), r3(num(z[2], SIZE2.min, SIZE2.max, 4))],
    r: [r3(((num(r[0], -3600, 3600, 0) % 360) + 360) % 360), r3(((num(r[1], -3600, 3600, 0) % 360) + 360) % 360), r3(((num(r[2], -3600, 3600, 0) % 360) + 360) % 360)],
    c: hex(q.c), m: MATERIAL2[q.m] != null ? q.m : 'plastic',
  };
  if (s === 'ball') out.z[1] = out.z[2] = out.z[0]; // balls stay round
  const t = num(q.t, 0, 1, 0); if (t > 0) out.t = Math.round(t * 100) / 100;
  const g = num(q.g, 0, 1, 0); if (g > 0) out.g = Math.round(g * 100) / 100;
  if (q.nc === true) out.nc = true;
  if (SPECIALS2[q.k]) out.k = q.k;
  const n = cleanText(q.n, 30); if (n && !isRude(n)) out.n = n;
  return out;
}

// Checks and cleans a whole v2 world. Returns { world, info } like normalizeWorld does for v1.
export function normalizeParts(w, { needGoal } = {}) {
  if (!w || typeof w !== 'object' || !Array.isArray(w.parts)) throw new Error('That world is broken.');
  if (w.parts.length > MAX_PARTS) throw new Error(`v2 worlds can have up to ${MAX_PARTS} parts. This one has ${w.parts.length}.`);
  const parts = w.parts.map(cleanPart);
  const count = (k) => parts.filter((q) => q.k === k).length;
  if (count('spawn') !== 1) throw new Error(count('spawn') ? 'A world can only have one Spawn part.' : 'Make one part a Spawn (Properties > Special) so players know where to start.');
  const mode = w.mode === 'hangout' ? 'hangout' : 'obby';
  if ((needGoal ?? mode === 'obby') && !count('goal')) throw new Error('Obby worlds need at least one Goal part.');
  if (count('coin') > 200) throw new Error('Worlds can have up to 200 coins.');
  const world = { v: 2, engine: ENGINE2, n: cleanText(w.n, 40) || 'My world', mode, sky: SKIES[w.sky] ? w.sky : 'day', parts };
  if (w.compass === true) world.compass = true;
  if (isSong(w.music)) world.music = w.music;
  return { world, info: { blocks: parts.length, coins: parts.filter((q) => q.k === 'coin') } };
}

/* ---------------- shape geometry (unit size, centered on 0) ----------------
   Each convex shape: vertices + faces (lists of vertex indices, counter-clockwise seen from outside).
   Ramp: the high side is north (-z), like v1. Corner: highest at the north-east corner. Cylinders and cones stand up (y). */
const SEG = 16;
function prism(top, bot) { // top/bot: rings of [x,z] (same count), top at y=+0.5, bottom at -0.5
  const n = top.length, v = [...top.map(([x, z]) => [x, 0.5, z]), ...bot.map(([x, z]) => [x, -0.5, z])], f = [];
  f.push([...Array(n).keys()].reverse()); // top (counter-clockwise from above = reversed ring order)
  f.push([...Array(n).keys()].map((i) => n + i)); // bottom
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; f.push([i, j, n + j, n + i]); }
  return { v, f };
}
const ring = (r, n = SEG, from = 0, to = Math.PI * 2, close = true) => Array.from({ length: close ? n : n + 1 }, (_, i) => { const a = from + (to - from) * i / n; return [Math.cos(a) * r, Math.sin(a) * r]; });
export const GEOM2 = {
  box: prism([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]),
  wedge: { v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]],
    f: [[0, 1, 2, 3], [1, 0, 4, 5], [3, 2, 5, 4], [0, 3, 4], [2, 1, 5]] },
  corner: { v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], [0.5, 0.5, -0.5]],
    f: [[0, 1, 2, 3], [1, 0, 4], [2, 1, 4], [3, 2, 4], [0, 3, 4]] },
  cyl: prism(ring(0.5), ring(0.5)),
  cone: (() => { const b = ring(0.5), v = [[0, 0.5, 0], ...b.map(([x, z]) => [x, -0.5, z])], f = [b.map((_, i) => 1 + i)]; for (let i = 0; i < SEG; i++) f.push([0, 1 + ((i + 1) % SEG), 1 + i]); return { v, f }; })(),
  halfcyl: (() => { const h = ring(0.5, 8, 0, Math.PI, false).map(([x, z]) => [x, z * 2 - 0.5]); return prism(h, h); })(), // flat side south, round side north... stretched to fill its box
  pyramid: { v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], [0, 0.5, 0]], f: [[0, 1, 2, 3], [1, 0, 4], [2, 1, 4], [3, 2, 4], [0, 3, 4]] },
};
// fix every face to wind counter-clockwise from outside (checked against the shape's middle), so rendering and planes agree
for (const g of Object.values(GEOM2)) {
  const c = g.v.reduce((a, p) => [a[0] + p[0] / g.v.length, a[1] + p[1] / g.v.length, a[2] + p[2] / g.v.length], [0, 0, 0]);
  g.f = g.f.map((f) => {
    const [a, b, d] = [g.v[f[0]], g.v[f[1]], g.v[f[2]]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    return n[0] * (a[0] - c[0]) + n[1] * (a[1] - c[1]) + n[2] * (a[2] - c[2]) < 0 ? [...f].reverse() : f;
  });
}

/* ---------------- placing a part in the world ---------------- */
const D2R = Math.PI / 180;
// rotation matrix (rows) for turns rx, ry, rz in degrees: R = Ry * Rx * Rz (the same order as the renderer's M4.trs)
export function rotMat(r) {
  const cy = Math.cos(r[1] * D2R), sy = Math.sin(r[1] * D2R), cx = Math.cos(r[0] * D2R), sx = Math.sin(r[0] * D2R), cz = Math.cos(r[2] * D2R), sz = Math.sin(r[2] * D2R);
  return [
    [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx],
    [cx * sz, cx * cz, -sx],
    [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx],
  ];
}
// A part ready for collision: world vertices, planes (n.x <= d), its box, and a ball's center + radius.
export function solidOf(q) {
  const R = rotMat(q.r), [sx, sy, sz] = q.z, [px, py, pz] = q.p;
  const toW = (v) => { const lx = v[0] * sx, ly = v[1] * sy, lz = v[2] * sz; return [px + R[0][0] * lx + R[0][1] * ly + R[0][2] * lz, py + R[1][0] * lx + R[1][1] * ly + R[1][2] * lz, pz + R[2][0] * lx + R[2][1] * ly + R[2][2] * lz]; };
  if (q.s === 'ball') {
    const rad = sx / 2;
    return { ball: true, c: [px, py, pz], rad, min: [px - rad, py - rad, pz - rad], max: [px + rad, py + rad, pz + rad] };
  }
  const g = GEOM2[q.s] || GEOM2.box;
  const v = g.v.map(toW);
  const planes = g.f.map((f) => {
    const a = v[f[0]], b = v[f[1]], c = v[f[2]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
    return [n[0], n[1], n[2], n[0] * a[0] + n[1] * a[1] + n[2] * a[2]];
  });
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of v) for (let k = 0; k < 3; k++) { if (p[k] < min[k]) min[k] = p[k]; if (p[k] > max[k]) max[k] = p[k]; }
  return { v, planes, min, max };
}

/* ---------------- a little picture of the world from above (for the Worlds page) ----------------
   The same format as v1 thumbnails (so the Worlds page draws it as is): each cell = plastic, the nearest of the
   16 palette colors, and a height. */
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function partsThumb(world) {
  const ps = (world.parts || []).filter((q) => !(q.t >= 0.9));
  if (!ps.length) return '';
  const sol = ps.map((q) => ({ q, s: solidOf(q) }));
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, yLo = Infinity, yHi = -Infinity;
  for (const { s } of sol) { x0 = Math.min(x0, s.min[0]); x1 = Math.max(x1, s.max[0]); z0 = Math.min(z0, s.min[2]); z1 = Math.max(z1, s.max[2]); yLo = Math.min(yLo, s.max[1]); yHi = Math.max(yHi, s.max[1]); }
  const N = 32, cell = Math.max(x1 - x0, z1 - z0, 1) / N, yk = Math.max(1, (yHi - yLo) / 40);
  const top = new Float64Array(N * N).fill(-Infinity), col = new Array(N * N).fill(null);
  for (const { q, s } of sol) {
    const i0 = Math.max(0, Math.floor((s.min[0] - x0) / cell)), i1 = Math.min(N - 1, Math.floor((s.max[0] - x0) / cell));
    const j0 = Math.max(0, Math.floor((s.min[2] - z0) / cell)), j1 = Math.min(N - 1, Math.floor((s.max[2] - z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (s.max[1] > top[j * N + i]) { top[j * N + i] = s.max[1]; col[j * N + i] = q.c; }
  }
  const pal = PALETTE.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const near = (h) => { const c = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; let b = 0, bd = Infinity; pal.forEach((p, k) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; b = k; } }); return b; };
  let out = ABC[N];
  for (let k = 0; k < N * N; k++) out += col[k] ? ABC[B.plastic] + ABC[near(col[k])] + ABC[Math.max(0, Math.min(63, Math.round((top[k] - yLo) / yk)))] : 'AAA';
  return out;
}

/* ---------------- a starting world ---------------- */
export function emptyParts(mode = 'hangout') {
  const parts = [
    { s: 'box', p: [500, 0.5, 500], z: [96, 1, 96], r: [0, 0, 0], c: '#5fc76b', m: 'grass' },
    { s: 'box', p: [500, 1.25, 530], z: [4, 0.5, 4], r: [0, 0, 0], c: '#7cc8ff', m: 'smooth', k: 'spawn' },
  ];
  if (mode === 'obby') parts.push({ s: 'box', p: [500, 1.25, 470], z: [4, 0.5, 4], r: [0, 0, 0], c: '#ffd23f', m: 'neon', g: 0.6, k: 'goal' });
  return { v: 2, engine: ENGINE2, n: 'My world', mode, sky: 'day', parts };
}
