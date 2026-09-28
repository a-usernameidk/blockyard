// Turns a 16x16x16 chunk of blocks into triangles (shared by both 3D renderers).
// Cubes: only the faces you can see, with soft corner shadows (ambient occlusion).
// Shapes (ramps, half blocks, stairs, cylinders, balls, poles): their own triangles, turned the way they face.
// Each corner is 3 floats (position) + 12 bytes: r g b shade | u v pattern face | nx ny nz ao
//   shade: the old renderer's baked light (255 = glowing), u/v: 0..200, face: 0-5 (+x -x +y -y +z -z, the main direction),
//   n: the real surface direction (signed bytes), ao: 0..3 (3 = open) times 40.
import { BLOCKS, B, PALETTE, SX, SY, SZ, SHAPE } from './world.js';

export const CS = 16;
// For each face: normal, the 4 corners seen from outside (counter-clockwise), and the face's right/up directions (for shading corners).
export const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], r: [0, 0, -1], u: [0, 1, 0], shade: 'x+' },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], r: [0, 0, 1], u: [0, 1, 0], shade: 'x-' },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], r: [1, 0, 0], u: [0, 0, -1], shade: 'y+' },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], r: [1, 0, 0], u: [0, 0, 1], shade: 'y-' },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], r: [1, 0, 0], u: [0, 1, 0], shade: 'z+' },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], r: [-1, 0, 0], u: [0, 1, 0], shade: 'z-' },
];
const CORNER_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
const CORNER_DIR = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
export const AO = [0.52, 0.68, 0.84, 1];
export const hexRGB = (h) => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

// Which pattern and color each face of a block uses (f = the face's main direction).
export function faceLook(t, color, f) {
  const b = BLOCKS[t];
  const tint = b.tint ? hexRGB(PALETTE[color & 15]) : hexRGB(b.color || '#ffffff');
  if (b.side) return f === 2 ? [1, hexRGB(b.color)] : f === 3 ? [2, hexRGB(b.side)] : [21, hexRGB(b.side)]; // grass (and grass ramps)
  if (t === B.plastic) return [f === 2 ? 30 : 10, tint];
  if (t === B.bounce) return [f === 2 ? 15 : 31, tint];
  if (t === B.speed) return [f === 2 ? 16 : 31, tint];
  if (t === B.checkpoint) return [f === 2 ? 18 : 10, tint];
  if (t === B.spawn) return [f === 2 ? 20 : 10, tint];
  if (b.dir) return [f === 2 ? b.pat : 12, tint];
  if (t === B.teleport) return [f === 2 ? 36 : 11, tint];
  return [b.pat || 10, tint];
}

/* ---------------- shape models (built once, for each of the 4 ways they can face) ----------------
   A model is a list of triangles: { p: [[x,y,z] x3], n: [[nx,ny,nz] x3], full: face index when the triangle lies on a whole
   side of the cell (so it can be hidden when a cube is right next to it), or -1 }.
   Facing 0: the high side is north (z = 0). */
const quad = (a, b, c, d, n, full = -1) => [{ p: [a, b, c], n: [n, n, n], full }, { p: [a, c, d], n: [n, n, n], full }];
const tri = (a, b, c, n, full = -1) => [{ p: [a, b, c], n: [n, n, n], full }];
const R2 = Math.SQRT1_2;
function box(x0, y0, z0, x1, y1, z1, skip = {}) {
  const out = [];
  if (!skip.px) out.push(...quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], x1 === 1 && y0 === 0 && y1 === 1 && z0 === 0 && z1 === 1 ? 0 : -1));
  if (!skip.nx) out.push(...quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], x0 === 0 && y0 === 0 && y1 === 1 && z0 === 0 && z1 === 1 ? 1 : -1));
  if (!skip.py) out.push(...quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], y1 === 1 && x0 === 0 && x1 === 1 && z0 === 0 && z1 === 1 ? 2 : -1));
  if (!skip.ny) out.push(...quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], y0 === 0 && x0 === 0 && x1 === 1 && z0 === 0 && z1 === 1 ? 3 : -1));
  if (!skip.pz) out.push(...quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], z1 === 1 && x0 === 0 && x1 === 1 && y0 === 0 && y1 === 1 ? 4 : -1));
  if (!skip.nz) out.push(...quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], z0 === 0 && x0 === 0 && x1 === 1 && y0 === 0 && y1 === 1 ? 5 : -1));
  return out;
}
// a round thing standing up: radius r, from y0 to y1, with smooth sides
function tube(r, y0, y1, seg) {
  const out = [], c = 0.5;
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
    const n0 = [Math.cos(a0), 0, Math.sin(a0)], n1 = [Math.cos(a1), 0, Math.sin(a1)];
    const p0 = [c + n0[0] * r, c + n0[2] * r], p1 = [c + n1[0] * r, c + n1[2] * r];
    out.push({ p: [[p0[0], y0, p0[1]], [p1[0], y1, p1[1]], [p1[0], y0, p1[1]]], n: [n0, n1, n1], full: -1 });
    out.push({ p: [[p0[0], y0, p0[1]], [p0[0], y1, p0[1]], [p1[0], y1, p1[1]]], n: [n0, n0, n1], full: -1 });
    out.push(...tri([c, y1, c], [p0[0], y1, p0[1]], [p1[0], y1, p1[1]], [0, 1, 0]));
    out.push(...tri([c, y0, c], [p1[0], y0, p1[1]], [p0[0], y0, p0[1]], [0, -1, 0]));
  }
  return out;
}
function ball(seg, rings) {
  const out = [], P = (i, j) => { const th = i / rings * Math.PI, ph = j / seg * Math.PI * 2; return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; };
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
    const at = (q) => [0.5 + q[0] * 0.5, 0.5 + q[1] * 0.5, 0.5 + q[2] * 0.5];
    out.push({ p: [at(a), at(b), at(c)], n: [a, b, c], full: -1 }, { p: [at(a), at(c), at(d)], n: [a, c, d], full: -1 });
  }
  return out;
}
const BASE = {
  slab: () => box(0, 0, 0, 1, 0.5, 1),
  wedge: () => [
    ...quad([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0], 3), // bottom
    ...quad([1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, -1], 5), // the tall back (north)
    ...quad([0, 0, 1], [1, 0, 1], [1, 1, 0], [0, 1, 0], [0, R2, R2]), // the slope
    ...tri([0, 0, 0], [0, 0, 1], [0, 1, 0], [-1, 0, 0]),
    ...tri([1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 0, 0]),
  ],
  corner: () => [
    ...quad([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0], 3),
    ...tri([0, 0, 0], [0, 0, 1], [1, 1, 0], [-R2, R2, 0]), // slope up toward the east
    ...tri([1, 1, 0], [0, 0, 1], [1, 0, 1], [0, R2, R2]), // slope up toward the north
    ...tri([1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 0, 0]),
    ...tri([1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 0, -1]),
  ],
  stairs: () => [
    ...box(0, 0, 0, 1, 0.5, 1, { py: true }),
    ...quad([0, 0.5, 1], [1, 0.5, 1], [1, 0.5, 0.5], [0, 0.5, 0.5], [0, 1, 0]),
    ...box(0, 0.5, 0, 1, 1, 0.5, { ny: true }),
  ],
  cyl: () => tube(0.5, 0, 1, 18),
  ball: () => ball(18, 10),
  pole: () => tube(0.2, 0, 1, 10),
};
// turn a point / direction around the middle of the cell, d quarter turns clockwise (seen from above)
const turnP = (p, d) => (d === 1 ? [1 - p[2], p[1], p[0]] : d === 2 ? [1 - p[0], p[1], 1 - p[2]] : d === 3 ? [p[2], p[1], 1 - p[0]] : p);
const turnN = (n, d) => (d === 1 ? [-n[2], n[1], n[0]] : d === 2 ? [-n[0], n[1], -n[2]] : d === 3 ? [n[2], n[1], -n[0]] : n);
const FACE_OF = (n) => { const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]); return ay >= ax && ay >= az ? (n[1] >= 0 ? 2 : 3) : ax >= az ? (n[0] >= 0 ? 0 : 1) : (n[2] >= 0 ? 4 : 5); };
const cross = (a, b, c) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; };
const MODELS = {};
for (const [name, make] of Object.entries(BASE)) {
  MODELS[name] = [0, 1, 2, 3].map((d) => make().map((t) => {
    let p = t.p.map((q) => turnP(q, d)), n = t.n.map((q) => turnN(q, d));
    const avg = [n[0][0] + n[1][0] + n[2][0], n[0][1] + n[1][1] + n[2][1], n[0][2] + n[1][2] + n[2][2]];
    // counter-clockwise seen from outside (so back faces can be skipped)
    const cr = cross(p[0], p[1], p[2]);
    if (cr[0] * avg[0] + cr[1] * avg[1] + cr[2] * avg[2] < 0) { p = [p[0], p[2], p[1]]; n = [n[0], n[2], n[1]]; }
    return { p, n, face: FACE_OF(avg), full: t.full < 0 ? -1 : FACE_OF(turnN(FACES[t.full].n, d)) };
  }));
}
export const shapeModel = (sh, d) => MODELS[['', 'slab', 'wedge', 'corner', 'stairs', 'cyl', 'ball', 'pole'][sh]][d];

/* ---------------- one chunk ---------------- */
// light: { amb, light, sun: [x,y,z] normalized } (for the old renderer's baked shading)
export function meshChunk(grid, cx, cy, cz, light) {
  const out = { solid: { pos: [], att: [] }, glass: { pos: [], att: [] } };
  const x0 = cx * CS, y0 = cy * CS, z0 = cz * CS;
  const T = grid.t, Cc = grid.c;
  const cubeAt = (x, y, z) => { const t = grid.get(x, y, z); return t && !SHAPE[t] && !BLOCKS[t].see && !BLOCKS[t].entity && !BLOCKS[t].ghost; };
  const shadeOf = (n) => Math.max(light.amb * 0.95, light.amb + (1 - light.amb) * Math.max(0, n[0] * light.sun[0] + n[1] * light.sun[1] + n[2] * light.sun[2]) * light.light);
  const sb = (v) => (Math.round(Math.max(-1, Math.min(1, v)) * 127) + 256) & 255;
  for (let y = y0; y < y0 + CS; y++) for (let z = z0; z < z0 + CS; z++) for (let x = x0; x < x0 + CS; x++) {
    const i = x + z * SX + y * SX * SZ, t = T[i];
    if (!t) continue;
    const b = BLOCKS[t];
    if (!b || b.entity) continue;
    const see = !!b.see, glow = b.glow ? 1 : 0;
    const dest = see ? out.glass : out.solid;
    const sh = SHAPE[t];
    if (sh) {
      const model = shapeModel(sh, (Cc[i] >> 4) & 3);
      for (const tr of model) {
        if (tr.full >= 0) { const F = FACES[tr.full]; if (cubeAt(x + F.n[0], y + F.n[1], z + F.n[2])) continue; }
        const [pat, rgb] = faceLook(t, Cc[i], tr.face);
        const ax = tr.face >> 1; // which axis the pattern is laid along: 0 x, 1 y, 2 z
        for (let k = 0; k < 3; k++) {
          const p = tr.p[k], n = tr.n[k];
          dest.pos.push(x + p[0], y + p[1], z + p[2]);
          const u = ax === 0 ? p[2] : p[0], v = ax === 1 ? p[2] : p[1];
          const s = glow ? 255 : Math.round(Math.min(1, shadeOf(n)) * 254);
          dest.att.push(Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255), s,
            Math.round(u * 200), Math.round(v * 200), pat, tr.face, sb(n[0]), sb(n[1]), sb(n[2]), 120);
        }
      }
      continue;
    }
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
      const nt = grid.get(nx, ny, nz);
      if (nt && !SHAPE[nt]) {
        const nb = BLOCKS[nt];
        if (see ? nt === t : (!nb.see && !nb.entity && !nb.ghost)) continue;
      }
      const [pat, rgb] = faceLook(t, Cc[i], f);
      const base = glow ? 1 : shadeOf(F.n);
      const ao = [3, 3, 3, 3];
      if (!glow && !see) for (let k = 0; k < 4; k++) {
        const [du, dv] = CORNER_DIR[k];
        const s1 = cubeAt(nx + F.r[0] * du, ny + F.r[1] * du, nz + F.r[2] * du), s2 = cubeAt(nx + F.u[0] * dv, ny + F.u[1] * dv, nz + F.u[2] * dv);
        const c = cubeAt(nx + F.r[0] * du + F.u[0] * dv, ny + F.r[1] * du + F.u[1] * dv, nz + F.r[2] * du + F.u[2] * dv);
        ao[k] = s1 && s2 ? 0 : 3 - (s1 + s2 + c);
      }
      const order = ao[0] + ao[2] < ao[1] + ao[3] ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
      for (const k of order) {
        const c = F.c[k];
        dest.pos.push(x + c[0], y + c[1], z + c[2]);
        const s = glow ? 255 : Math.round(Math.min(1, base * AO[ao[k]]) * 254);
        dest.att.push(Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255), s,
          CORNER_UV[k][0] * 200, CORNER_UV[k][1] * 200, pat, f, sb(F.n[0]), sb(F.n[1]), sb(F.n[2]), ao[k] * 40);
      }
    }
  }
  return out;
}
