// Engine v2: turns parts into triangles for the HD renderer, grouped by area (64 x 64 studs) so the renderer
// can skip what's off screen. Per corner: 7 floats (position, uv in studs, the face's size in studs)
// + 12 bytes (r g b glow | pattern face alpha 0 | nx ny nz ao).
import { GEOM2 as GEOM2_LO, GEOM2_HI, MATERIALS2, MATERIAL2, solidOf, rotMat } from './parts.js';
import { hexRGB } from './mesh3d.js';

const AREA = 64;
const DIRT = hexRGB('#9a6a3f');
const sb = (v) => (Math.round(Math.max(-1, Math.min(1, v)) * 127) + 256) & 255;
const FACE_OF = (n) => { const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]); return ay >= ax && ay >= az ? (n[1] >= 0 ? 2 : 3) : ax >= az ? (n[0] >= 0 ? 0 : 1) : (n[2] >= 0 ? 4 : 5); };
const SMOOTH = { cyl: true, cone: true, halfcyl: true };

// the triangles of one part: calls put(pos, uv, dim, normal, face) per corner
function partTris(q, put) {
  const R = rotMat(q.r), [sx, sy, sz] = q.z, [px, py, pz] = q.p;
  const W = (l) => [px + R[0][0] * l[0] + R[0][1] * l[1] + R[0][2] * l[2], py + R[1][0] * l[0] + R[1][1] * l[1] + R[1][2] * l[2], pz + R[2][0] * l[0] + R[2][1] * l[1] + R[2][2] * l[2]];
  const N = (n) => { const w = [R[0][0] * n[0] + R[0][1] * n[1] + R[0][2] * n[2], R[1][0] * n[0] + R[1][1] * n[1] + R[1][2] * n[2], R[2][0] * n[0] + R[2][1] * n[1] + R[2][2] * n[2]]; const l = Math.hypot(...w) || 1; return [w[0] / l, w[1] / l, w[2] / l]; };
  if (q.s === 'ball') {
    const r = sx / 2, LAT = r >= 1.2 ? 18 : 10, LON = r >= 1.2 ? 32 : 18, P = (i, j) => { const th = i / LAT * Math.PI, ph = j / LON * Math.PI * 2; return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; };
    for (let i = 0; i < LAT; i++) for (let j = 0; j < LON; j++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      for (const v of [a, c, b, a, d, c]) put(W([v[0] * r, v[1] * r, v[2] * r]), [5000 + v[0] * r, 5000 + v[2] * r], [1e4, 1e4], N(v), FACE_OF(v), 1);
    }
    return;
  }
  const g = (Math.max(sx, sy, sz) < 1.2 ? GEOM2_LO : GEOM2_HI)[q.s] || GEOM2_LO.box;
  const L = g.v.map((v) => [v[0] * sx, v[1] * sy, v[2] * sz]);
  // face normals in the part's own space (for shading use the scaled shape: normal = cross of scaled edges)
  const fn = g.f.map((f) => { const a = L[f[0]], b = L[f[1]], c = L[f[2]]; const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const l = Math.hypot(...n) || 1; return [n[0] / l, n[1] / l, n[2] / l]; });
  // smooth round sides: each corner's normal = the average of the round faces it touches
  let vn = null;
  if (SMOOTH[q.s]) {
    vn = L.map(() => [0, 0, 0]);
    g.f.forEach((f, k) => { if (Math.abs(fn[k][1]) > 0.999) return; if (q.s === 'halfcyl' && Math.abs(fn[k][2]) > 0.999) return; for (const vi of f) { vn[vi][0] += fn[k][0]; vn[vi][1] += fn[k][1]; vn[vi][2] += fn[k][2]; } });
  }
  g.f.forEach((f, k) => {
    const n = fn[k], ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const flat = !vn || Math.abs(n[1]) > 0.999 || (q.s === 'halfcyl' && Math.abs(n[2]) > 0.999);
    const face = FACE_OF(N(n));
    const uvOf = (l) => (ay >= ax && ay >= az ? [l[0] + sx / 2, l[2] + sz / 2] : ax >= az ? [l[2] + sz / 2, l[1] + sy / 2] : [l[0] + sx / 2, l[1] + sy / 2]);
    const dim = ay >= ax && ay >= az ? [sx, sz] : ax >= az ? [sz, sy] : [sx, sy];
    const corner = (vi) => put(W(L[vi]), uvOf(L[vi]), dim, flat ? N(n) : N(vn[vi]), face);
    // water: a flat top is cut into a grid of small squares, so the renderer can make waves on it
    if (q.m === 'water' && f.length === 4 && face === 2 && N(n)[1] > 0.99) {
      const A = L[f[0]], B = L[f[1]], D = L[f[3]], C2 = L[f[2]];
      const nu = Math.max(1, Math.min(96, Math.round(Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) / 1.5))), nv = Math.max(1, Math.min(96, Math.round(Math.hypot(D[0] - A[0], D[1] - A[1], D[2] - A[2]) / 1.5)));
      const at = (a, b) => [0, 1, 2].map((k) => (A[k] * (1 - a) + B[k] * a) * (1 - b) + (D[k] * (1 - a) + C2[k] * a) * b);
      const pt = (a, b) => { const l = at(a, b); put(W(l), uvOf(l), dim, N(n), face); };
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a0 = i / nu, a1 = (i + 1) / nu, b0 = j / nv, b1 = (j + 1) / nv; pt(a0, b0); pt(a1, b0); pt(a1, b1); pt(a0, b0); pt(a1, b1); pt(a0, b1); }
      return;
    }
    // Big faces are cut into smaller triangles (no side longer than 40 studs). Some graphics chips draw huge
    // triangles wrong (half of a big floor goes missing), and smaller ones also get nicer light and fog.
    const nrm = (vi) => (flat ? n : vn[vi]);
    const tri = (a, b, c, na, nb, nc, depth) => {
      const big = Math.max(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), Math.hypot(b[0] - c[0], b[1] - c[1], b[2] - c[2]), Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]));
      if (big <= 40 || depth >= 5) { const rd = flat ? 0 : 1; put(W(a), uvOf(a), dim, N(na), face, rd); put(W(b), uvOf(b), dim, N(nb), face, rd); put(W(c), uvOf(c), dim, N(nc), face, rd); return; }
      const mid = (p, q2) => [(p[0] + q2[0]) / 2, (p[1] + q2[1]) / 2, (p[2] + q2[2]) / 2];
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a), nab = mid(na, nb), nbc = mid(nb, nc), nca = mid(nc, na);
      tri(a, ab, ca, na, nab, nca, depth + 1); tri(ab, b, bc, nab, nb, nbc, depth + 1); tri(ca, bc, c, nca, nbc, nc, depth + 1); tri(ab, bc, ca, nab, nbc, nca, depth + 1);
    };
    for (let t = 1; t + 1 < f.length; t++) tri(L[f[0]], L[f[t]], L[f[t + 1]], nrm(f[0]), nrm(f[t]), nrm(f[t + 1]), 0);
  });
}

// parts -> [{ x0, z0, solid: {f, u, n}, glass: {f, u, n} }] (one per 64 x 64 area). skip(q) leaves parts out (coins in play).
export function meshParts(parts, skip = () => false) {
  const areas = new Map();
  parts.forEach((q, i) => {
    if (skip(q, i)) return;
    const mat = MATERIALS2[MATERIAL2[q.m] ?? 0];
    const see = !!mat.see || (q.t || 0) > 0.001;
    const key = Math.floor(q.p[0] / AREA) + ',' + Math.floor(q.p[2] / AREA);
    if (!areas.has(key)) areas.set(key, { solid: { f: [], u: [] }, glass: { f: [], u: [] }, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
    const A = areas.get(key), dest = see ? A.glass : A.solid;
    const s = solidOf(q);
    for (let k = 0; k < 3; k++) { A.min[k] = Math.min(A.min[k], s.min[k]); A.max[k] = Math.max(A.max[k], s.max[k]); }
    const rgb = hexRGB(q.c), glow = Math.round(Math.max(q.g || 0, mat.glow ? 1 : 0) * 255), alpha = Math.round((1 - (q.t || 0)) * 255);
    partTris(q, (p, uv, dim, n, face, round = 0) => {
      let pat = mat.pat, col = rgb;
      if (q.m === 'grass') { if (face === 2) pat = 1; else if (face === 3) { pat = 2; col = DIRT; } else { pat = 46; } }
      dest.f.push(p[0], p[1], p[2], uv[0], uv[1], dim[0], dim[1]);
      dest.u.push(Math.round(col[0] * 255), Math.round(col[1] * 255), Math.round(col[2] * 255), glow, pat, face, alpha, round, sb(n[0]), sb(n[1]), sb(n[2]), 120);
    });
  });
  const out = [];
  for (const A of areas.values()) {
    const pack = (m) => (m.f.length ? { f: new Float32Array(m.f), u: new Uint8Array(m.u), n: m.f.length / 7 } : null);
    out.push({ min: A.min, max: A.max, solid: pack(A.solid), glass: pack(A.glass) });
  }
  return out;
}
