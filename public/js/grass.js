// Engine v2: real grass. Every part made of the Grass material grows blades on its top: this file decides where
// each blade stands (the same on every computer, no randomness that changes), and the HD renderer draws them all
// at once (one small blade model, drawn tens of thousands of times) and bends them in the wind.
// Per blade: 9 numbers = x, y, z, turn, height, width, tint, kind (0 grass, 1-4 flowers), the lawn's color (r*65536 + g*256 + b).
import { solidOf, MATERIALS2, MATERIAL2 } from './parts.js';

const AREA = 32; // blades are grouped by 32 x 32 areas so far-away grass is skipped
export const GRASS_MAX = 220000;
const rnd = (a, b, c) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// the top of a part straight down at (x, z): [y, how flat (0..1)] or null
function topOf(s, x, z) {
  if (s.ball) return null;
  let hi = Infinity, lo = -Infinity, ny = 0;
  for (const pl of s.planes) {
    const rest = pl[3] - pl[0] * x - pl[2] * z;
    if (Math.abs(pl[1]) < 1e-6) { if (rest < 0) return null; continue; }
    const y = rest / pl[1];
    if (pl[1] > 0) { if (y < hi) { hi = y; ny = pl[1]; } } else if (y > lo) lo = y;
  }
  return hi >= lo && hi < Infinity ? [hi, ny] : null;
}

// parts -> [{ min, max, data: Float32Array, n }]. density: blades per stud of ground (about 3 to 9). skip(q, i): leave parts out.
export function growGrass(parts, skip = () => false, density = 5) {
  const lawns = [], others = [];
  parts.forEach((q, i) => {
    if (skip(q, i)) return;
    const s = solidOf(q);
    if (q.m === 'grass' && !q.mo && !(q.t > 0.5)) lawns.push({ q, s, i });
    else if (!q.nc || (MATERIALS2[MATERIAL2[q.m]] || {}).water) others.push(s); // things standing on the grass (and water over it) press it flat
  });
  if (!lawns.length || density <= 0) return [];
  // if the world has more lawn than the limit allows, thin all of it out evenly
  let area = 0; for (const { s } of lawns) area += (s.max[0] - s.min[0]) * (s.max[2] - s.min[2]);
  const per = Math.min(density, GRASS_MAX / Math.max(1, area));
  const step = 1 / Math.sqrt(per);
  // what's on top of the grass, in a coarse grid so each blade only checks what's near
  const C = 8, cover = new Map();
  for (const s of others) for (let a = Math.floor(s.min[0] / C); a <= Math.floor(s.max[0] / C); a++) for (let b = Math.floor(s.min[2] / C); b <= Math.floor(s.max[2] / C); b++) { const k = a * 100003 + b; if (!cover.has(k)) cover.set(k, []); cover.get(k).push(s); }
  for (const { s } of lawns) for (let a = Math.floor(s.min[0] / C); a <= Math.floor(s.max[0] / C); a++) for (let b = Math.floor(s.min[2] / C); b <= Math.floor(s.max[2] / C); b++) { const k = a * 100003 + b; if (!cover.has(k)) cover.set(k, []); cover.get(k).push(s); }
  const covered = (self, x, y, z) => {
    const l = cover.get(Math.floor(x / C) * 100003 + Math.floor(z / C)); if (!l) return false;
    for (const o of l) {
      if (o === self || x < o.min[0] || x > o.max[0] || z < o.min[2] || z > o.max[2] || o.max[1] <= y + 0.02 || o.min[1] > y + 0.9) continue;
      if (o.ball) { const dx = x - o.c[0], dz = z - o.c[2]; if (dx * dx + dz * dz < o.rad * o.rad) return true; continue; }
      const t = topOf(o, x, z); if (t && t[0] > y + 0.02) return true;
    }
    return false;
  };
  const areas = new Map();
  for (const { s, i, q } of lawns) {
    const col = parseInt(q.c.slice(1), 16);
    const x0 = Math.ceil(s.min[0] / step), x1 = Math.floor(s.max[0] / step), z0 = Math.ceil(s.min[2] / step), z1 = Math.floor(s.max[2] / step);
    for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) {
      const x = (a + rnd(a, b, 1) - 0.5) * step, z = (b + rnd(a, b, 2) - 0.5) * step;
      const t = topOf(s, x, z);
      if (!t || t[1] < 0.72) continue; // only on top, not on steep sides
      if (covered(s, x, t[0], z)) continue;
      const key = Math.floor(x / AREA) + ',' + Math.floor(z / AREA);
      if (!areas.has(key)) areas.set(key, { d: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
      const A = areas.get(key), r = rnd(a, b, 3 + i), flower = rnd(a, b, 9) > 0.994;
      // patches: taller in some places, shorter in others (a slow wavy pattern), plus each blade's own size
      const patch = 0.6 + 0.5 * (0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.17) * 1.7) * Math.cos(z * 0.19));
      const h = flower ? 0.75 + r * 0.25 : (0.42 + r * 0.55) * patch;
      A.d.push(x, t[0], z, rnd(a, b, 4) * 6.2832, h, flower ? 0.2 : 0.07 + rnd(a, b, 5) * 0.06, rnd(a, b, 6), flower ? 1 + Math.floor(rnd(a, b, 7) * 3.999) : 0, col);
      if (x < A.min[0]) A.min[0] = x; if (x > A.max[0]) A.max[0] = x; if (z < A.min[2]) A.min[2] = z; if (z > A.max[2]) A.max[2] = z;
      if (t[0] < A.min[1]) A.min[1] = t[0]; if (t[0] + 1.2 > A.max[1]) A.max[1] = t[0] + 1.2;
    }
  }
  return [...areas.values()].map((A) => ({ min: A.min, max: A.max, data: new Float32Array(A.d), n: A.d.length / 9 }));
}
