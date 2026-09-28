// Blockyard's HD renderer (WebGL 2): used by the Pretty and Extreme quality graphics settings.
// Same blocks and shapes as the classic renderer (mesh3d.js builds both), plus:
//   real sun shadows (a shadow map that follows you, soft edges), light worked out for every pixel
//   (sky light from above, bounce light from the ground, shiny plastic / metal / glass / ice),
//   glowing things that bloom, 4x anti-aliasing, and filmic colors.
// The classic renderer (gl.js) stays for Fast and Extreme performance, and for computers without WebGL 2.
import { SKIES, SX, SY, SZ } from './world.js';
import { FACES, meshChunk, hexRGB, CS } from './mesh3d.js';
import { meshParts } from './partsmesh.js';

/* ---------------- math ---------------- */
const mul = (a, b, out = new Float32Array(16)) => {
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; out[i * 4 + j] = s; }
  return out;
};
const persp = (fov, aspect, near, far) => { const f = 1 / Math.tan(fov / 2), m = new Float32Array(16); m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = 2 * far * near / (near - far); return m; };
const ortho = (l, r, b, t, n, f) => { const m = new Float32Array(16); m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n); m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); m[15] = 1; return m; };
function lookAt(e, t, up = [0, 1, 0]) {
  let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2];
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx; m[4] = xy; m[5] = yy; m[6] = zy; m[8] = xz; m[9] = yz; m[10] = zz;
  m[12] = -(xx * e[0] + xy * e[1] + xz * e[2]); m[13] = -(yx * e[0] + yy * e[1] + yz * e[2]); m[14] = -(zx * e[0] + zy * e[1] + zz * e[2]); m[15] = 1;
  return m;
}
function invert(m) {
  const a = m, inv = new Float32Array(16);
  inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
  inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
  inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
  inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
  inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
  inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
  inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
  inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
  inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
  inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
  inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
  inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
  inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
  inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
  inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
  inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
  let det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
  det = det ? 1 / det : 0;
  for (let i = 0; i < 16; i++) inv[i] *= det;
  return inv;
}
const lin = (h) => hexRGB(h).map((v) => Math.pow(v, 2.2));
const mixv = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const scl = (a, k) => a.map((v) => v * k);

/* ---------------- how each sky lights the world (linear colors) ---------------- */
function lightFor(sky) {
  const s = SKIES[sky] || SKIES.day, id = SKIES[sky] ? sky : 'day';
  const l = Math.hypot(...s.sun), dir = s.sun.map((v) => v / l);
  const warm = { day: [1.0, 0.95, 0.86], sunset: [1.0, 0.72, 0.48], night: [0.62, 0.72, 1.0], space: [0.95, 0.93, 1.0] }[id];
  const sun = scl(warm, (id === 'night' ? 0.55 : id === 'space' ? 1.05 : id === 'sunset' ? 1.0 : 1.1) * s.light);
  const skyC = mixv(lin(s.top), lin(s.bottom), 0.55), fog = lin(s.fog);
  const skyAmb = scl(mixv(skyC, [1, 1, 1], id === 'night' || id === 'space' ? 0.1 : 0.35), s.amb * (id === 'night' ? 0.95 : 0.9));
  const ground = scl(mixv(fog, [0.45, 0.38, 0.3], 0.5), s.amb * 0.55);
  return { dir, sun, sky: skyAmb, ground, exposure: id === 'night' ? 0.95 : id === 'space' ? 0.85 : id === 'sunset' ? 0.72 : 0.64 };
}

/* ---------------- shaders ---------------- */
const HEAD = '#version 300 es\nprecision highp float;\nprecision highp sampler2DShadow;\n';
// the block patterns (the same drawings as the classic renderer): gives the color * m and alpha
const PATTERN = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 faceN(float f) {
  float n = floor(f + 0.5);
  if (n < 0.5) return vec3(1.0, 0.0, 0.0); if (n < 1.5) return vec3(-1.0, 0.0, 0.0);
  if (n < 2.5) return vec3(0.0, 1.0, 0.0); if (n < 3.5) return vec3(0.0, -1.0, 0.0);
  if (n < 4.5) return vec3(0.0, 0.0, 1.0); return vec3(0.0, 0.0, -1.0);
}
vec4 pattern(vec3 v_col, vec3 v_wp, vec2 v_uv, float v_pat, float v_face, float u_time) {
  vec3 bp = floor(v_wp - faceN(v_face) * 0.01);
  vec2 uv = clamp(v_uv, 0.0, 1.0);
  vec2 px = floor(uv * 8.0);
  float seed = bp.x * 7.13 + bp.y * 3.71 + bp.z * 11.9 + floor(v_face) * 1.7;
  float n = hash(px + seed);
  vec2 e2 = min(uv, 1.0 - uv);
  float edge = min(e2.x, e2.y);
  float m = mix(0.82, 1.0, smoothstep(0.0, 0.06, edge));
  vec3 col = v_col;
  float a = 1.0;
  float p = floor(v_pat + 0.5);
  if (p == 1.0) { m *= 0.9 + 0.18 * n; if (n > 0.93) col *= vec3(0.85, 1.05, 0.8); }
  else if (p == 2.0) { m *= 0.88 + 0.2 * n; if (n > 0.9) m *= 0.8; }
  else if (p == 3.0) { m *= 0.9 + 0.12 * hash(floor(uv * 4.0) + seed) + 0.04 * n; }
  else if (p == 4.0) { float r = fract(uv.y * 4.0); m *= (r < 0.08 ? 0.72 : 0.94 + 0.1 * hash(vec2(px.x, floor(uv.y * 4.0)) + seed)); }
  else if (p == 5.0) {
    float row = floor(uv.y * 4.0); float fx = fract(uv.x * 2.0 + mod(row, 2.0) * 0.5);
    if (fract(uv.y * 4.0) < 0.12 || fx < 0.06) col = vec3(0.86, 0.82, 0.76); else m *= 0.92 + 0.12 * hash(vec2(floor(uv.x * 2.0 + mod(row, 2.0) * 0.5), row) + seed);
  }
  else if (p == 6.0) { m *= 0.94 + 0.1 * n; }
  else if (p == 7.0) { m *= 0.96 + 0.06 * n; }
  else if (p == 8.0) { float s = fract((uv.x + uv.y) * 2.5); m *= s < 0.1 ? 1.12 : 0.97; }
  else if (p == 9.0) { float f = step(edge, 0.09); m = 1.0; col = mix(col, vec3(1.0), 0.35 + 0.4 * f); a = mix(0.3, 0.9, f); if (abs(uv.x - uv.y - 0.2) < 0.05) a = 0.6; }
  else if (p == 10.0) { m *= 0.97 + 0.04 * n; }
  else if (p == 11.0) { m = 1.0 + 0.25 * (1.0 - smoothstep(0.0, 0.18, edge)); }
  else if (p == 12.0) { m *= fract(uv.y * 8.0) < 0.5 ? 0.97 : 1.03; if (length(fract(uv * 2.0) - 0.5) < 0.09 && edge < 0.2) m *= 0.75; }
  else if (p == 13.0) { m *= 0.8 + 0.3 * n; if (n > 0.86) m *= 0.6; }
  else if (p == 14.0) { vec3 q = v_wp * 1.7; float w = sin(q.x + q.y * 0.7 + u_time * 1.7) + sin(q.z * 1.3 - q.y * 0.5 - u_time * 1.3) + 0.5 * sin((q.x + q.z) * 2.1 + u_time * 2.3); col = mix(v_col, vec3(1.0, 0.85, 0.25), 0.3 + 0.16 * w); m = 1.0; }
  else if (p == 15.0) { float r = length(uv - 0.5); m *= fract(r * 6.0) < 0.5 ? 1.08 : 0.82; }
  else if (p == 16.0) { float s = fract(uv.y * 3.0 + abs(uv.x - 0.5) * 2.0 - u_time * 1.5); m *= s < 0.45 ? 1.15 : 0.85; }
  else if (p == 17.0) { m *= 0.9 + 0.14 * n; if (abs(uv.x - 0.3 - 0.2 * sin(uv.y * 9.0 + bp.x)) < 0.03) m *= 0.65; }
  else if (p == 18.0) { float c = mod(floor(uv.x * 4.0) + floor(uv.y * 4.0), 2.0); col = mix(col, vec3(1.0), c * 0.7); }
  else if (p == 19.0) { float c = mod(floor(uv.x * 4.0) + floor(uv.y * 4.0), 2.0); m = 1.0 + 0.15 * c + 0.15 * sin(u_time * 3.0 + uv.x * 3.0); }
  else if (p == 20.0) { float r = length(uv - 0.5); if (r < 0.3 && r > 0.2) col = vec3(1.0); }
  else if (p == 21.0) { if (uv.y > 0.8 - 0.08 * hash(vec2(px.x, seed))) col = vec3(0.37, 0.78, 0.42); else m *= 0.88 + 0.2 * n; }
  else if (p == 30.0) { vec2 q = fract(uv * 2.0) - 0.5; float r = length(q); m *= 0.97 + 0.04 * n; if (r < 0.26) m *= (q.y + q.x < 0.0 ? 1.1 : 0.88); }
  else if (p == 22.0) { a = 0.42; m = 1.05; }
  else if (p >= 32.0 && p <= 35.0) {
    vec2 d = p == 32.0 ? vec2(1.0, 0.0) : p == 33.0 ? vec2(-1.0, 0.0) : p == 34.0 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
    vec2 q = uv - 0.5;
    float s = fract(dot(q, d) * 3.0 - abs(dot(q, vec2(-d.y, d.x))) * 2.0 - u_time * 1.3);
    m *= s < 0.35 ? 1.35 : 0.8;
  }
  else if (p == 38.0) { float k = floor(u_time * 2.2 + hash(bp.xz) * 5.0); col = 0.55 + 0.45 * cos(6.2831 * (k * 0.27 + vec3(0.0, 0.33, 0.67))); m = 1.0 + 0.25 * (1.0 - smoothstep(0.0, 0.12, edge)); }
  else if (p == 37.0) { float s = step(0.42, abs(fract(uv.x * 2.0 + uv.y * 2.0) - 0.5)); m *= 0.9 + 0.2 * s; if (edge < 0.1) col = mix(col, vec3(1.0, 0.85, 0.2), 0.8); }
  else if (p == 36.0) { vec2 q = uv - 0.5; float r = length(q); float w = sin(r * 22.0 - u_time * 5.0 + atan(q.y, q.x) * 2.0); col = mix(col, vec3(1.0), 0.25 + 0.25 * w); m = 1.0 + 0.2 * (1.0 - smoothstep(0.0, 0.5, r)); }
  else if (p == 31.0) { m *= fract(uv.x * 4.0) < 0.5 ? 1.05 : 0.85; }
  return vec4(col * m, a);
}`;
// light, shadows, shine, fog and the filmic curve: shared by blocks and models
const LIGHT = `
uniform vec3 u_sunDir; uniform vec3 u_sunCol; uniform vec3 u_skyCol; uniform vec3 u_groundCol;
uniform vec3 u_fog; uniform vec3 u_cam; uniform vec2 u_fogr; uniform float u_exposure;
uniform sampler2DShadow u_shadow; uniform float u_shadowOn; uniform vec2 u_texel;
float shadowAt(vec4 ls, float ndl) {
  if (u_shadowOn < 0.5) return 1.0;
  vec3 p = ls.xyz / ls.w * 0.5 + 0.5;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  float bias = 0.0004 + 0.0012 * (1.0 - ndl);
  float s = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) s += textureLod(u_shadow, vec3(p.xy + vec2(float(x), float(y)) * u_texel * 1.25, p.z - bias), 0.0);
  s /= 9.0;
  vec2 e = min(p.xy, 1.0 - p.xy);
  return mix(1.0, s, smoothstep(0.0, 0.06, min(e.x, e.y)));
}
vec3 filmic(vec3 x) { x *= u_exposure; return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
// albedo: sRGB color; spec: how shiny (0-1); shin: how tight the highlight is; ao: 0-1; emit: glows (0-1)
vec4 shade(vec3 albedo, vec3 N, vec3 wp, vec4 ls, float spec, float shin, float ao, float emit) {
  vec3 alb = pow(max(albedo, 0.0), vec3(2.2));
  float ndl = dot(N, u_sunDir);
  float sh = ndl > 0.0 ? shadowAt(ls, ndl) : 0.0;
  vec3 V = normalize(u_cam - wp);
  vec3 amb = mix(u_groundCol, u_skyCol, N.y * 0.5 + 0.5) * ao;
  vec3 dif = u_sunCol * max(ndl, 0.0) * sh;
  vec3 H = normalize(u_sunDir + V);
  float sp = pow(max(dot(N, H), 0.0), shin) * spec * sh * (shin + 8.0) / 40.0;
  float fr = pow(1.0 - max(dot(N, V), 0.0), 5.0) * spec * 0.6;
  vec3 col = alb * (amb + dif) + u_sunCol * sp + u_skyCol * fr * ao * 1.6;
  col = pow(filmic(col), vec3(1.0 / 2.2));
  // glowing things keep their own bright color (the bloom adds the glow around them)
  if (emit > 0.0) col = mix(col, min(albedo * 1.08, 1.0), emit);
  float fog = clamp((distance(wp, u_cam) - u_fogr.x) / (u_fogr.y - u_fogr.x), 0.0, 1.0);
  fog = fog * fog * (3.0 - 2.0 * fog);
  return vec4(mix(col, u_fog, fog), emit * (1.0 - fog));
}`;
const CHUNK_VS = HEAD + `
in vec3 a_pos; in vec4 a_col; in vec4 a_uvp; in vec4 a_nao;
uniform mat4 u_vp; uniform mat4 u_lvp;
out vec3 v_col; out vec3 v_wp; out vec2 v_uv; out float v_pat; out float v_face; out vec3 v_n; out float v_ao; out float v_glow; out vec4 v_ls;
void main() {
  gl_Position = u_vp * vec4(a_pos, 1.0);
  v_col = a_col.rgb; v_glow = a_col.a > 0.999 ? 1.0 : 0.0; v_wp = a_pos; v_uv = a_uvp.xy / 200.0; v_pat = a_uvp.z; v_face = a_uvp.w;
  v_n = a_nao.xyz; v_ao = clamp(a_nao.w * 127.0 / 40.0 / 3.0, 0.0, 1.0);
  v_ls = u_lvp * vec4(a_pos + a_nao.xyz * 0.03, 1.0);
}`;
const CHUNK_FS = HEAD + `
in vec3 v_col; in vec3 v_wp; in vec2 v_uv; in float v_pat; in float v_face; in vec3 v_n; in float v_ao; in float v_glow; in vec4 v_ls;
uniform float u_time; uniform float u_glass;
out vec4 o;
` + PATTERN + LIGHT + `
void main() {
  vec4 pc = pattern(v_col, v_wp, v_uv, v_pat, v_face, u_time);
  vec3 N = normalize(v_n);
  float p = floor(v_pat + 0.5);
  // how shiny each material is
  float spec = 0.12, shin = 16.0;
  if (p == 9.0 || p == 22.0) { spec = 0.9; shin = 110.0; }       // glass
  else if (p == 8.0) { spec = 0.75; shin = 80.0; }                // ice
  else if (p == 12.0 || p >= 32.0 && p <= 35.0) { spec = 0.55; shin = 48.0; } // metal, conveyors
  else if (p == 10.0 || p == 30.0 || p == 15.0 || p == 18.0 || p == 20.0 || p == 37.0) { spec = 0.38; shin = 56.0; } // plastic
  else if (p == 7.0) { spec = 0.2; shin = 30.0; }                 // snow sparkles a bit
  float ao = mix(0.32, 1.0, v_ao);
  vec4 c = shade(pc.rgb, N, v_wp, v_ls, spec, shin, ao, v_glow);
  o = vec4(c.rgb, u_glass > 0.5 ? pc.a : c.a);
}`;
// Engine v2 parts: patterns tile once per stud (uv is in studs), a soft bevel at the part's edges (dim = the face's size)
const PART_VS = HEAD + `
in vec3 a_pos; in vec2 a_uv; in vec2 a_dim; in vec4 a_col; in vec4 a_mat; in vec4 a_nao;
uniform mat4 u_vp; uniform mat4 u_lvp;
out vec3 v_col; out vec3 v_wp; out vec2 v_uv; out vec2 v_dim; out float v_pat; out float v_face; out float v_alpha; out vec3 v_n; out float v_glow; out vec4 v_ls;
void main() {
  gl_Position = u_vp * vec4(a_pos, 1.0);
  v_col = a_col.rgb; v_glow = a_col.a; v_wp = a_pos; v_uv = a_uv; v_dim = a_dim; v_pat = a_mat.x; v_face = a_mat.y; v_alpha = a_mat.z / 255.0;
  v_n = a_nao.xyz; v_ls = u_lvp * vec4(a_pos + a_nao.xyz * 0.03, 1.0);
}`;
const PART_FS = HEAD + `
in vec3 v_col; in vec3 v_wp; in vec2 v_uv; in vec2 v_dim; in float v_pat; in float v_face; in float v_alpha; in vec3 v_n; in float v_glow; in vec4 v_ls;
uniform float u_time; uniform float u_glass;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
` + LIGHT + `
void main() {
  vec2 u = v_uv, f = fract(u), cell = floor(u);
  float face = floor(v_face + 0.5), p = floor(v_pat + 0.5);
  float seed = floor(v_wp.x) * 0.37 + floor(v_wp.y) * 1.71 + floor(v_wp.z) * 0.93 + face * 1.7;
  float n = hash(floor(f * 8.0) + cell * 7.13 + seed);
  float edge = min(min(u.x, u.y), min(v_dim.x - u.x, v_dim.y - u.y));
  float m = mix(0.84, 1.0, smoothstep(0.0, 0.07, edge));
  vec3 col = v_col; float a = 1.0, spec = 0.1, shin = 16.0;
  if (p == 30.0) { vec2 q = f - 0.5; m *= 0.98 + 0.03 * n; if (face == 2.0 && length(q) < 0.26) m *= (q.x + q.y < 0.0 ? 1.1 : 0.88); spec = 0.38; shin = 56.0; }
  else if (p == 40.0) { spec = 0.45; shin = 64.0; }
  else if (p == 4.0) { m *= 0.9 + 0.07 * sin(u.y * 11.0 + sin(u.x * 1.3 + seed) * 2.5) + 0.04 * n; }
  else if (p == 41.0) { float row = floor(u.y * 2.0); float fx = fract(u.x / 3.0 + hash(vec2(row, seed)) ); if (fract(u.y * 2.0) < 0.06 || fx < 0.015) m *= 0.68; else m *= 0.9 + 0.12 * hash(vec2(row, floor(u.x / 3.0 + hash(vec2(row, seed))))); }
  else if (p == 3.0) { m *= 0.88 + 0.12 * hash(floor(u * 3.0) + seed) + 0.04 * n; }
  else if (p == 5.0) { float row = floor(u.y * 3.0); float fx = fract(u.x * 1.5 + mod(row, 2.0) * 0.5); if (fract(u.y * 3.0) < 0.1 || fx < 0.05) col = vec3(0.86, 0.82, 0.76); else m *= 0.92 + 0.12 * hash(vec2(floor(u.x * 1.5 + mod(row, 2.0) * 0.5), row)); }
  else if (p == 42.0) { vec2 g = u * 2.0, id = floor(g); float d = 9.0, d2 = 9.0; for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) { vec2 c = id + vec2(float(i), float(j)); vec2 pt = c + vec2(hash(c), hash(c + 3.1)) * 0.7 + 0.15; float e = length(g - pt); if (e < d) { d2 = d; d = e; } else if (e < d2) d2 = e; } m *= d2 - d < 0.08 ? 0.62 : 0.9 + 0.1 * hash(id); }
  else if (p == 43.0) { float v = sin(u.x * 1.7 + u.y * 2.3 + 2.5 * sin(u.y * 1.1 + u.x * 0.6 + seed)); col = mix(col, col * 0.72, smoothstep(0.9, 1.0, abs(v))); spec = 0.45; shin = 70.0; }
  else if (p == 12.0) { m *= 0.94 + 0.07 * hash(vec2(floor(u.y * 48.0), cell.x + seed)); spec = 0.6; shin = 48.0; }
  else if (p == 44.0) { vec2 q = fract(u * 3.0) - 0.5; float d = abs(q.x * 0.7 + q.y) + abs(q.x - q.y * 0.7) * 0.6; m *= d < 0.18 ? 1.15 : 0.93; spec = 0.6; shin = 40.0; }
  else if (p == 9.0) { float fr = step(edge, 0.06); col = mix(col, vec3(1.0), 0.35 + 0.4 * fr); a = mix(0.3, 0.9, fr); m = 1.0; spec = 0.9; shin = 110.0; }
  else if (p == 8.0) { float s2 = fract((u.x + u.y) * 1.2); m *= s2 < 0.06 ? 1.1 : 0.97; spec = 0.75; shin = 80.0; }
  else if (p == 11.0) { m = 1.0 + 0.2 * (1.0 - smoothstep(0.0, 0.15, edge)); spec = 0.0; }
  else if (p == 1.0) { m *= 0.9 + 0.18 * n; if (n > 0.93) col *= vec3(0.85, 1.05, 0.8); }
  else if (p == 2.0) { m *= 0.88 + 0.2 * n; }
  else if (p == 46.0) { if (v_dim.y - u.y < 0.22 + 0.06 * hash(vec2(floor(u.x * 8.0), seed))) m *= 0.95 + 0.08 * n; else { col = vec3(0.604, 0.416, 0.247); m *= 0.88 + 0.2 * n; } }
  else if (p == 6.0) { m *= 0.94 + 0.1 * n; }
  else if (p == 45.0) { float w = step(0.5, fract(u.x * 10.0)) + step(0.5, fract(u.y * 10.0)); m *= 0.9 + 0.05 * w + 0.03 * n; spec = 0.02; }
  else { m *= 0.97 + 0.04 * n; }
  vec4 c = shade(col * m, normalize(v_n), v_wp, v_ls, spec, shin, 1.0, v_glow);
  o = vec4(c.rgb, u_glass > 0.5 ? a * v_alpha : c.a);
}`;
const MODEL_VS = HEAD + `
in vec3 a_pos; in vec3 a_nrm;
uniform mat4 u_vp; uniform mat4 u_model; uniform mat4 u_lvp;
out vec3 v_n; out vec3 v_wp; out vec4 v_ls;
void main() {
  vec4 wp = u_model * vec4(a_pos, 1.0);
  gl_Position = u_vp * wp;
  v_n = normalize((u_model * vec4(a_nrm, 0.0)).xyz);
  v_wp = wp.xyz;
  v_ls = u_lvp * vec4(wp.xyz + v_n * 0.03, 1.0);
}`;
const MODEL_FS = HEAD + `
in vec3 v_n; in vec3 v_wp; in vec4 v_ls;
uniform vec3 u_color; uniform float u_glow; uniform float u_alpha; uniform float u_spec;
out vec4 o;
` + LIGHT + `
void main() {
  vec4 c = shade(u_color, normalize(v_n), v_wp, v_ls, u_spec, 40.0, 1.0, u_glow);
  o = vec4(c.rgb, u_alpha < 0.999 ? u_alpha : c.a);
}`;
const DEPTH_VS = HEAD + `in vec3 a_pos; uniform mat4 u_lvp; uniform mat4 u_model; void main() { gl_Position = u_lvp * u_model * vec4(a_pos, 1.0); }`;
const DEPTH_FS = HEAD + `out vec4 o; void main() { o = vec4(1.0); }`;
const SKY_VS = HEAD + `in vec2 a_pos; out vec2 v_p; void main() { v_p = a_pos; gl_Position = vec4(a_pos, 0.9999, 1.0); }`;
const SKY_FS = HEAD + `
in vec2 v_p; uniform mat4 u_inv; uniform vec3 u_top; uniform vec3 u_bottom; uniform float u_stars; uniform vec3 u_sun; uniform vec3 u_sunTint;
out vec4 o;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec4 a = u_inv * vec4(v_p, 1.0, 1.0);
  vec3 d = normalize(a.xyz / a.w);
  float t = clamp(d.y * 1.3 + 0.12, 0.0, 1.0);
  vec3 c = mix(u_bottom, u_top, pow(t, 0.8));
  float s = max(dot(d, normalize(u_sun)), 0.0);
  // a soft glow around the sun, a bright disc, and a warm haze near the horizon
  c += u_sunTint * (pow(s, 900.0) * 2.0 + pow(s, 60.0) * 0.25 + pow(s, 6.0) * 0.12) * (1.0 - u_stars * 0.75);
  c = mix(c, c * 1.08 + vec3(0.03), (1.0 - smoothstep(0.0, 0.25, abs(d.y))) * 0.6);
  if (u_stars > 0.0 && d.y > 0.0) { vec3 q = floor(d * 220.0); float h = hash(q); if (h > 0.9965) c += vec3(h - 0.9965) * 260.0 * u_stars * d.y; }
  o = vec4(c, clamp(pow(s, 300.0) * 1.5, 0.0, 1.0) * (1.0 - u_stars * 0.5));
}`;
const LINE_VS = HEAD + `in vec3 a_pos; uniform mat4 u_vp; void main() { gl_Position = u_vp * vec4(a_pos, 1.0); }`;
const LINE_FS = HEAD + `uniform vec4 u_color; out vec4 o; void main() { o = u_color; }`;
// full-screen passes
const QUAD_VS = HEAD + `in vec2 a_pos; out vec2 v_uv; void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;
const BRIGHT_FS = HEAD + `in vec2 v_uv; uniform sampler2D u_tex; out vec4 o;
void main() { vec4 c = texture(u_tex, v_uv); o = vec4(c.rgb * c.a, 1.0); }`;
const BLUR_FS = HEAD + `in vec2 v_uv; uniform sampler2D u_tex; uniform vec2 u_dir; out vec4 o;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb * 0.2270270;
  c += (texture(u_tex, v_uv + u_dir * 1.3846153).rgb + texture(u_tex, v_uv - u_dir * 1.3846153).rgb) * 0.3162162;
  c += (texture(u_tex, v_uv + u_dir * 3.2307692).rgb + texture(u_tex, v_uv - u_dir * 3.2307692).rgb) * 0.0702702;
  o = vec4(c, 1.0);
}`;
const FINAL_FS = HEAD + `in vec2 v_uv; uniform sampler2D u_scene; uniform sampler2D u_b1; uniform sampler2D u_b2; uniform float u_bloom; out vec4 o;
void main() {
  vec3 c = texture(u_scene, v_uv).rgb;
  vec3 b = texture(u_b1, v_uv).rgb * 0.8 + texture(u_b2, v_uv).rgb * 1.1;
  c += b * u_bloom * 0.75;
  // a touch more color, and slightly darker corners
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.08);
  vec2 q = v_uv - 0.5;
  c *= 1.0 - dot(q, q) * 0.32;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

/* ---------------- the renderer ---------------- */
// hd: { shadowSize, shadowRange, msaa, bloom }. Returns null when WebGL 2 isn't there (use the classic renderer then).
export function createRendererHD(canvas, { dpr: dprFn = null, hd = {} } = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  if (!gl) { if (typeof window !== 'undefined') window.__hdError = 'WebGL 2 is not available'; return null; }
  const SM = hd.shadowSize || 2048, RANGE = hd.shadowRange || 44, BLOOM = hd.bloom ?? 0.9;
  const compile = (vs, fs) => {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('3D shader failed: ' + gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('3D shader failed: ' + gl.getProgramInfoLog(p));
    const u = {}, a = {};
    const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) { const n = gl.getActiveUniform(p, i).name; u[n] = gl.getUniformLocation(p, n); }
    const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < na; i++) { const n = gl.getActiveAttrib(p, i).name; a[n] = gl.getAttribLocation(p, n); }
    return { p, u, a };
  };
  const P = {
    chunk: compile(CHUNK_VS, CHUNK_FS), part: compile(PART_VS, PART_FS), model: compile(MODEL_VS, MODEL_FS), depth: compile(DEPTH_VS, DEPTH_FS),
    sky: compile(SKY_VS, SKY_FS), line: compile(LINE_VS, LINE_FS),
    bright: compile(QUAD_VS, BRIGHT_FS), blur: compile(QUAD_VS, BLUR_FS), final: compile(QUAD_VS, FINAL_FS),
  };
  const tri = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tri);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  /* shapes for models (players, pets, coins, flags...): position + normal */
  const prims = {};
  const makePrim = (name, data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); prims[name] = { b, n: data.length / 6 }; };
  {
    const cube = [];
    for (const f of FACES) { const pts = f.c.map((c) => c.map((v) => v - 0.5)); for (const k of [0, 1, 2, 0, 2, 3]) cube.push(...pts[k], ...f.n); }
    makePrim('cube', cube);
    const cyl = [], S = 20;
    for (let i = 0; i < S; i++) {
      const a0 = i / S * Math.PI * 2, a1 = (i + 1) / S * Math.PI * 2;
      const p0 = [Math.cos(a0) * 0.5, Math.sin(a0) * 0.5], p1 = [Math.cos(a1) * 0.5, Math.sin(a1) * 0.5];
      const n0 = [Math.cos(a0), 0, Math.sin(a0)], n1 = [Math.cos(a1), 0, Math.sin(a1)];
      cyl.push(p0[0], -0.5, p0[1], ...n0, p1[0], 0.5, p1[1], ...n1, p1[0], -0.5, p1[1], ...n1);
      cyl.push(p0[0], -0.5, p0[1], ...n0, p0[0], 0.5, p0[1], ...n0, p1[0], 0.5, p1[1], ...n1);
      cyl.push(0, 0.5, 0, 0, 1, 0, p0[0], 0.5, p0[1], 0, 1, 0, p1[0], 0.5, p1[1], 0, 1, 0);
      cyl.push(0, -0.5, 0, 0, -1, 0, p1[0], -0.5, p1[1], 0, -1, 0, p0[0], -0.5, p0[1], 0, -1, 0);
    }
    makePrim('cyl', cyl);
    const sph = [], R = 14, C = 20;
    const pt = (i, j) => { const th = i / R * Math.PI, ph = j / C * Math.PI * 2; return [Math.sin(th) * Math.cos(ph) * 0.5, Math.cos(th) * 0.5, Math.sin(th) * Math.sin(ph) * 0.5]; };
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
      const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
      for (const q of [a, c, b, a, d, c]) sph.push(...q, q[0] * 2, q[1] * 2, q[2] * 2);
    }
    makePrim('sphere', sph);
  }
  const lineBuf = gl.createBuffer();

  /* ---------------- chunks ---------------- */
  const CX = SX / CS, CY = SY / CS, CZ = SZ / CS;
  let grid = null, skyId = 'day', L = lightFor('day');
  const chunks = new Map();
  const classic = () => { const s = SKIES[skyId] || SKIES.day, l = Math.hypot(...s.sun); return { amb: s.amb, light: s.light, sun: s.sun.map((v) => v / l) }; };
  const vaoFor = (pb, ab) => {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const a = P.chunk.a;
    gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.enableVertexAttribArray(a.a_pos); gl.vertexAttribPointer(a.a_pos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, ab);
    gl.enableVertexAttribArray(a.a_col); gl.vertexAttribPointer(a.a_col, 4, gl.UNSIGNED_BYTE, true, 12, 0);
    gl.enableVertexAttribArray(a.a_uvp); gl.vertexAttribPointer(a.a_uvp, 4, gl.UNSIGNED_BYTE, false, 12, 4);
    gl.enableVertexAttribArray(a.a_nao); gl.vertexAttribPointer(a.a_nao, 4, gl.BYTE, true, 12, 8);
    // the shadow pass reads only the positions (same location 0 in its own VAO)
    const dvao = gl.createVertexArray(); gl.bindVertexArray(dvao);
    gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.enableVertexAttribArray(P.depth.a.a_pos); gl.vertexAttribPointer(P.depth.a.a_pos, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { vao, dvao };
  };
  const freeMesh = (m) => { gl.deleteBuffer(m.pb); gl.deleteBuffer(m.ab); gl.deleteVertexArray(m.vao); gl.deleteVertexArray(m.dvao); };
  function buildChunk(cx, cy, cz) {
    const key = cx + cz * CX + cy * CX * CZ;
    let ch = chunks.get(key);
    if (!ch) { ch = { x: cx, y: cy, z: cz, solid: null, glass: null }; chunks.set(key, ch); }
    const out = meshChunk(grid, cx, cy, cz, classic());
    for (const kind of ['solid', 'glass']) {
      const o = out[kind];
      if (ch[kind]) { freeMesh(ch[kind]); ch[kind] = null; }
      if (!o.pos.length) continue;
      const pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(o.pos), gl.STATIC_DRAW);
      const ab = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ab); gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(o.att), gl.STATIC_DRAW);
      ch[kind] = { pb, ab, n: o.pos.length / 3, ...vaoFor(pb, ab) };
    }
    if (!ch.solid && !ch.glass) chunks.delete(key);
  }
  /* ---------------- engine v2 parts ---------------- */
  // layers: 'main' (the world) and, in the editor, 'sel' (what you're dragging, rebuilt often)
  const partLayers = new Map();
  const allAreas = () => [...partLayers.values()].flat();
  const freePart = (m) => { gl.deleteBuffer(m.fb); gl.deleteBuffer(m.ub); gl.deleteVertexArray(m.vao); gl.deleteVertexArray(m.dvao); };
  function uploadPart(mesh) {
    const a = P.part.a, fb = gl.createBuffer(), ub = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, fb); gl.bufferData(gl.ARRAY_BUFFER, mesh.f, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, ub); gl.bufferData(gl.ARRAY_BUFFER, mesh.u, gl.STATIC_DRAW);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, fb);
    gl.enableVertexAttribArray(a.a_pos); gl.vertexAttribPointer(a.a_pos, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(a.a_uv); gl.vertexAttribPointer(a.a_uv, 2, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(a.a_dim); gl.vertexAttribPointer(a.a_dim, 2, gl.FLOAT, false, 28, 20);
    gl.bindBuffer(gl.ARRAY_BUFFER, ub);
    gl.enableVertexAttribArray(a.a_col); gl.vertexAttribPointer(a.a_col, 4, gl.UNSIGNED_BYTE, true, 12, 0);
    gl.enableVertexAttribArray(a.a_mat); gl.vertexAttribPointer(a.a_mat, 4, gl.UNSIGNED_BYTE, false, 12, 4);
    gl.enableVertexAttribArray(a.a_nao); gl.vertexAttribPointer(a.a_nao, 4, gl.BYTE, true, 12, 8);
    const dvao = gl.createVertexArray(); gl.bindVertexArray(dvao);
    gl.bindBuffer(gl.ARRAY_BUFFER, fb); gl.enableVertexAttribArray(P.depth.a.a_pos); gl.vertexAttribPointer(P.depth.a.a_pos, 3, gl.FLOAT, false, 28, 0);
    gl.bindVertexArray(null);
    return { fb, ub, vao, dvao, n: mesh.n };
  }
  // parts: the world's parts (engine v2). skip(q, i): leave some out (coins the game draws itself).
  function setParts(parts, skip, layer = 'main') {
    for (const A of partLayers.get(layer) || []) for (const k of ['solid', 'glass']) if (A[k]) freePart(A[k]);
    partLayers.set(layer, meshParts(parts || [], skip).map((A) => ({ min: A.min, max: A.max, solid: A.solid && uploadPart(A.solid), glass: A.glass && uploadPart(A.glass) })));
  }
  const areaVisible = (Pl, A) => { const cx = (A.min[0] + A.max[0]) / 2, cy = (A.min[1] + A.max[1]) / 2, cz = (A.min[2] + A.max[2]) / 2, r = Math.hypot(A.max[0] - A.min[0], A.max[1] - A.min[1], A.max[2] - A.min[2]) / 2; for (const q of Pl) if (q[0] * cx + q[1] * cy + q[2] * cz + q[3] < -r) return false; return true; };
  function drawPartMeshes(kind, Pl) {
    const partAreas = allAreas();
    if (!partAreas.length) return;
    const prog = P.part;
    gl.useProgram(prog.p); lightUniforms(prog);
    gl.uniform1f(prog.u.u_time, state.time); gl.uniform1f(prog.u.u_glass, kind === 'glass' ? 1 : 0);
    for (const A of partAreas) { const m = A[kind]; if (!m || !areaVisible(Pl, A)) continue; gl.bindVertexArray(m.vao); gl.drawArrays(gl.TRIANGLES, 0, m.n); state.faces += m.n / 3; state.drawn++; }
    gl.bindVertexArray(null);
  }

  const dirtyKeys = new Set();
  function markDirty(x, y, z) {
    for (const [dx, dy, dz] of [[0, 0, 0], [-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]]) {
      const cx = Math.floor((x + dx) / CS), cy = Math.floor((y + dy) / CS), cz = Math.floor((z + dz) / CS);
      if (cx < 0 || cy < 0 || cz < 0 || cx >= CX || cy >= CY || cz >= CZ) continue;
      dirtyKeys.add(cx + cz * CX + cy * CX * CZ);
    }
  }
  function setGrid(g) {
    for (const ch of chunks.values()) for (const k of ['solid', 'glass']) if (ch[k]) freeMesh(ch[k]);
    chunks.clear(); dirtyKeys.clear();
    grid = g;
    const has = new Uint8Array(CX * CY * CZ), T = g.t;
    for (let i = 0; i < T.length; i++) if (T[i]) { const x = i % SX, z = Math.floor(i / SX) % SZ, y = Math.floor(i / (SX * SZ)); has[Math.floor(x / CS) + Math.floor(z / CS) * CX + Math.floor(y / CS) * CX * CZ] = 1; }
    for (let k = 0; k < has.length; k++) if (has[k]) buildChunk(k % CX, Math.floor(k / (CX * CZ)), Math.floor(k / CX) % CZ);
  }
  function setSky(id) {
    skyId = SKIES[id] ? id : 'day'; L = lightFor(skyId);
    // (the baked light only matters for the classic renderer, but keep the meshes the same)
    if (grid) for (const ch of [...chunks.values()]) dirtyKeys.add(ch.x + ch.z * CX + ch.y * CX * CZ);
  }

  /* ---------------- frame buffers ---------------- */
  const samples = Math.min(hd.msaa ?? 4, gl.getParameter(gl.MAX_SAMPLES) || 0);
  const shadowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SM, SM);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const shadowFb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
  gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  const shadowOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const colorTex = (w, h) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
  const fbFor = (tex) => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); return f; };
  let T = null; // the size-dependent targets
  function makeTargets(w, h) {
    if (T) { for (const x of T.tex) gl.deleteTexture(x); for (const x of T.fb) gl.deleteFramebuffer(x); for (const x of T.rb) gl.deleteRenderbuffer(x); }
    const ms = gl.createFramebuffer(), msColor = gl.createRenderbuffer(), msDepth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, msColor);
    if (samples > 1) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h); else gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, w, h);
    gl.bindRenderbuffer(gl.RENDERBUFFER, msDepth);
    if (samples > 1) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h); else gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, ms);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msColor);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, msDepth);
    const scene = colorTex(w, h), sceneFb = fbFor(scene);
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1), qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
    const h1 = colorTex(hw, hh), h2 = colorTex(hw, hh), q1 = colorTex(qw, qh), q2 = colorTex(qw, qh);
    T = { w, h, hw, hh, qw, qh, ms, scene, sceneFb, h1, h2, q1, q2, h1f: fbFor(h1), h2f: fbFor(h2), q1f: fbFor(q1), q2f: fbFor(q2),
      tex: [scene, h1, h2, q1, q2], rb: [msColor, msDepth] };
    T.fb = [ms, sceneFb, T.h1f, T.h2f, T.q1f, T.q2f];
    gl.bindFramebuffer(gl.FRAMEBUFFER, ms);
    T.ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  // check now that this graphics card can draw into the buffers (if not, the simpler setup is tried)
  makeTargets(16, 16);
  if (!T.ok) throw new Error('HD buffers are not supported here (' + samples + 'x anti-aliasing)');

  /* ---------------- frustum ---------------- */
  function planes(m) {
    const p = [], row = (i) => [m[i], m[4 + i], m[8 + i], m[12 + i]];
    const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
    for (const [a, s] of [[r0, 1], [r0, -1], [r1, 1], [r1, -1], [r2, 1], [r2, -1]]) {
      const q = [r3[0] + s * a[0], r3[1] + s * a[1], r3[2] + s * a[2], r3[3] + s * a[3]];
      const l = Math.hypot(q[0], q[1], q[2]); p.push(q.map((v) => v / l));
    }
    return p;
  }
  const boxVisible = (Pl, x0, y0, z0, s) => { const r = s * 0.8660254, cx = x0 + s / 2, cy = y0 + s / 2, cz = z0 + s / 2; for (const q of Pl) if (q[0] * cx + q[1] * cy + q[2] * cz + q[3] < -r) return false; return true; };

  /* ---------------- drawing ---------------- */
  let W = 1, H = 1, dpr = 1;
  const state = { vp: new Float32Array(16), lvp: new Float32Array(16), eye: [0, 0, 0], faces: 0, drawn: 0, time: 0, fog: [100, 200] };
  function resize() {
    dpr = dprFn ? dprFn() : Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth || 640; H = canvas.clientHeight || 360;
    const w = Math.max(1, Math.round(W * dpr)), h = Math.max(1, Math.round(H * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    if (!T || T.w !== w || T.h !== h) makeTargets(w, h);
  }
  function lightUniforms(prog) {
    const u = prog.u;
    gl.uniform3fv(u.u_sunDir, L.dir); gl.uniform3fv(u.u_sunCol, L.sun); gl.uniform3fv(u.u_skyCol, L.sky); gl.uniform3fv(u.u_groundCol, L.ground);
    gl.uniform3fv(u.u_fog, hexRGB((SKIES[skyId] || SKIES.day).fog)); gl.uniform3fv(u.u_cam, state.eye); gl.uniform2f(u.u_fogr, state.fog[0], state.fog[1]);
    gl.uniform1f(u.u_exposure, L.exposure);
    gl.uniform1f(u.u_shadowOn, shadowOk ? 1 : 0); gl.uniform2f(u.u_texel, 1 / SM, 1 / SM);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shadowTex); gl.uniform1i(u.u_shadow, 0);
    gl.uniformMatrix4fv(u.u_vp, false, state.vp); gl.uniformMatrix4fv(u.u_lvp, false, state.lvp);
  }
  const ident = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  function drawChunks(kind, Pl) {
    const prog = P.chunk;
    gl.useProgram(prog.p);
    lightUniforms(prog);
    gl.uniform1f(prog.u.u_time, state.time); gl.uniform1f(prog.u.u_glass, kind === 'glass' ? 1 : 0);
    const list = [...chunks.values()].filter((c) => c[kind] && boxVisible(Pl, c.x * CS, c.y * CS, c.z * CS, CS));
    if (kind === 'glass') { const e = state.eye, d = (c) => Math.hypot(c.x * CS + 8 - e[0], c.y * CS + 8 - e[1], c.z * CS + 8 - e[2]); list.sort((a, b) => d(b) - d(a)); }
    for (const c of list) { const m = c[kind]; gl.bindVertexArray(m.vao); gl.drawArrays(gl.TRIANGLES, 0, m.n); state.faces += m.n / 6; state.drawn++; }
    gl.bindVertexArray(null);
  }
  const partShadow = (p) => p.prim !== 'shadow' && !(p.alpha != null && p.alpha < 1) && !p.noShadow;
  function drawParts(parts, transparent) {
    const prog = P.model;
    gl.useProgram(prog.p);
    lightUniforms(prog);
    let bound = null;
    for (const p of parts) {
      if (p.prim === 'shadow') continue; // real shadows here: no blob shadows needed
      if (!!transparent !== (p.alpha != null && p.alpha < 1)) continue;
      const pr = prims[p.prim || 'cube'];
      if (bound !== pr) {
        gl.bindBuffer(gl.ARRAY_BUFFER, pr.b);
        gl.enableVertexAttribArray(prog.a.a_pos); gl.vertexAttribPointer(prog.a.a_pos, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(prog.a.a_nrm); gl.vertexAttribPointer(prog.a.a_nrm, 3, gl.FLOAT, false, 24, 12);
        bound = pr;
      }
      gl.uniformMatrix4fv(prog.u.u_model, false, p.m || ident);
      gl.uniform3fv(prog.u.u_color, p.color || [1, 1, 1]);
      gl.uniform1f(prog.u.u_glow, p.glow || 0);
      gl.uniform1f(prog.u.u_alpha, p.alpha == null ? 1 : p.alpha);
      gl.uniform1f(prog.u.u_spec, p.spec ?? 0.25);
      gl.drawArrays(gl.TRIANGLES, 0, pr.n);
    }
    if (bound) { gl.disableVertexAttribArray(prog.a.a_pos); gl.disableVertexAttribArray(prog.a.a_nrm); }
  }
  function drawShadows(parts) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFb);
    gl.viewport(0, 0, SM, SM);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.6, 3.0);
    const prog = P.depth;
    gl.useProgram(prog.p);
    gl.uniformMatrix4fv(prog.u.u_lvp, false, state.lvp);
    gl.uniformMatrix4fv(prog.u.u_model, false, ident);
    const Pl = planes(state.lvp);
    for (const c of chunks.values()) if (c.solid && boxVisible(Pl, c.x * CS, c.y * CS, c.z * CS, CS)) { gl.bindVertexArray(c.solid.dvao); gl.drawArrays(gl.TRIANGLES, 0, c.solid.n); }
    for (const A of allAreas()) if (A.solid && areaVisible(Pl, A)) { gl.bindVertexArray(A.solid.dvao); gl.drawArrays(gl.TRIANGLES, 0, A.solid.n); }
    gl.bindVertexArray(null);
    let bound = null;
    for (const p of parts) {
      if (!partShadow(p)) continue;
      const pr = prims[p.prim || 'cube'];
      if (!pr) continue;
      if (bound !== pr) { gl.bindBuffer(gl.ARRAY_BUFFER, pr.b); gl.enableVertexAttribArray(prog.a.a_pos); gl.vertexAttribPointer(prog.a.a_pos, 3, gl.FLOAT, false, 24, 0); bound = pr; }
      gl.uniformMatrix4fv(prog.u.u_model, false, p.m || ident);
      gl.drawArrays(gl.TRIANGLES, 0, pr.n);
    }
    if (bound) gl.disableVertexAttribArray(prog.a.a_pos);
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }
  function drawLines(points, color) {
    if (!points.length) return;
    gl.useProgram(P.line.p);
    gl.uniformMatrix4fv(P.line.u.u_vp, false, state.vp);
    gl.uniform4fv(P.line.u.u_color, color);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(P.line.a.a_pos);
    gl.vertexAttribPointer(P.line.a.a_pos, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINES, 0, points.length / 3);
    gl.disableVertexAttribArray(P.line.a.a_pos);
  }
  function quad(prog) {
    gl.bindBuffer(gl.ARRAY_BUFFER, tri);
    gl.enableVertexAttribArray(prog.a.a_pos);
    gl.vertexAttribPointer(prog.a.a_pos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(prog.a.a_pos);
  }
  const tex = (unit, t, loc) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc, unit); };

  // scene: { eye, target, fov, time, parts, lines, far } (the same as the classic renderer)
  function frame(scene) {
    resize();
    state.time = scene.time || 0;
    state.eye = scene.eye;
    const far = scene.far || 260;
    state.fog = [far * 0.4, far * 0.95];
    const proj = persp(scene.fov || 1.2, W / H, 0.08, far);
    state.view = lookAt(scene.eye, scene.target);
    state.proj = proj;
    state.vp = mul(proj, state.view);
    state.faces = 0; state.drawn = 0;
    let budget = scene.rebuild || 6;
    for (const k of dirtyKeys) { if (budget-- <= 0) break; dirtyKeys.delete(k); if (grid) buildChunk(k % CX, Math.floor(k / (CX * CZ)), Math.floor(k / CX) % CZ); }
    const parts = scene.parts || [];

    // 1) the sun's view: the shadow map, following the camera (snapped to whole texels so edges don't crawl)
    {
      const c = scene.target, d = L.dir, up = Math.abs(d[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0];
      const lv = lookAt([c[0] + d[0] * 160, c[1] + d[1] * 160, c[2] + d[2] * 160], c, up);
      const texel = (RANGE * 2) / SM;
      lv[12] = Math.round(lv[12] / texel) * texel; lv[13] = Math.round(lv[13] / texel) * texel;
      state.lvp = mul(ortho(-RANGE, RANGE, -RANGE, RANGE, 20, 340), lv);
      if (shadowOk) drawShadows(parts);
    }

    // 2) the world, into the anti-aliased buffer (alpha = how much it glows, for the bloom)
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.ms);
    gl.viewport(0, 0, T.w, T.h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    {
      const sk = SKIES[skyId] || SKIES.day, prog = P.sky;
      gl.useProgram(prog.p);
      const rot = new Float32Array(state.view); rot[12] = rot[13] = rot[14] = 0;
      gl.uniformMatrix4fv(prog.u.u_inv, false, invert(mul(proj, rot)));
      gl.uniform3fv(prog.u.u_top, hexRGB(sk.top)); gl.uniform3fv(prog.u.u_bottom, hexRGB(sk.bottom));
      gl.uniform1f(prog.u.u_stars, skyId === 'night' || skyId === 'space' ? 1 : 0);
      gl.uniform3fv(prog.u.u_sun, sk.sun); gl.uniform3fv(prog.u.u_sunTint, L.sun.map((v) => Math.min(1, v)));
      quad(prog);
    }
    const Pl = planes(state.vp);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    if (grid) drawChunks('solid', Pl);
    drawPartMeshes('solid', Pl);
    gl.disable(gl.CULL_FACE);
    drawParts(parts, false);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    for (const l of scene.lines || []) drawLines(l.pts, l.color);
    gl.depthMask(false);
    drawParts(parts, true);
    if (grid) drawChunks('glass', Pl);
    drawPartMeshes('glass', Pl);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);

    // 3) resolve the anti-aliasing
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.ms); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.sceneFb);
    gl.blitFramebuffer(0, 0, T.w, T.h, 0, 0, T.w, T.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

    // 4) bloom: what glows, blurred at half and quarter size
    if (BLOOM > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.h1f); gl.viewport(0, 0, T.hw, T.hh);
      gl.useProgram(P.bright.p); tex(0, T.scene, P.bright.u.u_tex); quad(P.bright);
      const blur = (src, dst, w, h, dx, dy) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst); gl.viewport(0, 0, w, h); gl.useProgram(P.blur.p); tex(0, src, P.blur.u.u_tex); gl.uniform2f(P.blur.u.u_dir, dx / w, dy / h); quad(P.blur); };
      blur(T.h1, T.h2f, T.hw, T.hh, 1, 0); blur(T.h2, T.h1f, T.hw, T.hh, 0, 1);
      blur(T.h1, T.q1f, T.qw, T.qh, 1, 0); blur(T.q1, T.q2f, T.qw, T.qh, 0, 1);
      blur(T.q2, T.q1f, T.qw, T.qh, 2, 0); blur(T.q1, T.q2f, T.qw, T.qh, 0, 2);
    }
    // 5) put it all on the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, T.w, T.h);
    gl.useProgram(P.final.p);
    tex(0, T.scene, P.final.u.u_scene); tex(1, T.h1, P.final.u.u_b1); tex(2, T.q2, P.final.u.u_b2);
    gl.uniform1f(P.final.u.u_bloom, BLOOM);
    quad(P.final);
    gl.activeTexture(gl.TEXTURE0);
  }

  function project(x, y, z) {
    const m = state.vp;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0.05) return null;
    return { x: (cx / cw * 0.5 + 0.5) * W, y: (1 - (cy / cw * 0.5 + 0.5)) * H, d: cw };
  }
  function ray(sx, sy) {
    const inv = invert(state.vp);
    const nx = sx / W * 2 - 1, ny = 1 - sy / H * 2;
    const un = (x, y, z) => { const w = inv[3] * x + inv[7] * y + inv[11] * z + inv[15]; return [(inv[0] * x + inv[4] * y + inv[8] * z + inv[12]) / w, (inv[1] * x + inv[5] * y + inv[9] * z + inv[13]) / w, (inv[2] * x + inv[6] * y + inv[10] * z + inv[14]) / w]; };
    const a = un(nx, ny, -1), b = un(nx, ny, 1);
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d);
    return { o: a, d: d.map((v) => v / l) };
  }

  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  resize();
  return {
    gl, hd: true, setGrid, setParts, setSky, markDirty, frame, project, ray, resize,
    get lost() { return lost; },
    get stats() { return { faces: state.faces, chunks: chunks.size, drawn: state.drawn, hd: true, shadows: shadowOk, samples }; },
    get size() { return { w: W, h: H }; },
    destroy() {
      for (const ch of chunks.values()) for (const k of ['solid', 'glass']) if (ch[k]) freeMesh(ch[k]);
      chunks.clear();
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    },
  };
}
