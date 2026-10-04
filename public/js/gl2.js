// Blockyard's HD renderer (WebGL 2): used by the Medium, High and Max graphics settings.
// Same blocks and shapes as the classic renderer (mesh3d.js builds both), plus:
//   real sun shadows (a shadow map that follows you, soft edges), light worked out for every pixel
//   (sky light from above, bounce light from the ground, shiny plastic / metal / glass / ice),
//   glowing things that bloom, 4x anti-aliasing, and filmic colors.
// The classic renderer (gl.js) stays for Low and Potato, and for computers without WebGL 2.
import { SKIES, SX, SY, SZ } from './world.js';
import { FACES, meshChunk, hexRGB, CS } from './mesh3d.js';
import { meshParts } from './partsmesh.js';
import { growGrass } from './grass.js';

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
  return { dir, sun, sky: skyAmb, ground, hzn: fog, exposure: id === 'night' ? 0.95 : id === 'space' ? 0.85 : id === 'sunset' ? 0.72 : 0.64 };
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
uniform vec4 u_lp[12]; uniform vec4 u_lc[12]; uniform float u_nl;
uniform vec2 u_cl; uniform vec3 u_hzn; // clouds: time, on. u_hzn: the color of the sky at the horizon
// 12 spots in a disc, turned a different way for every pixel: shadow edges come out soft, like real ones
const vec2 SHADOW_DISC[12] = vec2[12](vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621), vec2(0.962, -0.195), vec2(0.473, -0.480),
  vec2(0.519, 0.767), vec2(0.185, -0.893), vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598));
float lh2(vec2 p) { return fract(sin(dot(p, vec2(41.31, 289.17))) * 43758.5453); }
float lnz(vec2 p) { vec2 i = floor(p), g = fract(p); g = g * g * (3.0 - 2.0 * g); return mix(mix(lh2(i), lh2(i + vec2(1.0, 0.0)), g.x), mix(lh2(i + vec2(0.0, 1.0)), lh2(i + vec2(1.0, 1.0)), g.x), g.y); }
float shadowAt(vec4 ls, float ndl) {
  if (u_shadowOn < 0.5) return 1.0;
  vec3 p = ls.xyz / ls.w * 0.5 + 0.5;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  float bias = 0.0005 + 0.0016 * (1.0 - ndl);
  float ang = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))), ca = cos(ang), sa = sin(ang);
  float s = 0.0;
  for (int i = 0; i < 12; i++) { vec2 d = SHADOW_DISC[i]; d = vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca); s += textureLod(u_shadow, vec3(p.xy + d * u_texel * 2.4, p.z - bias), 0.0); }
  s /= 12.0;
  vec2 e = min(p.xy, 1.0 - p.xy);
  return mix(1.0, s, smoothstep(0.0, 0.06, min(e.x, e.y)));
}
vec3 filmic(vec3 x) { x *= u_exposure; return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
// albedo: sRGB color; spec: how shiny (0-1); shin: how tight the highlight is; ao: 0-1; emit: glows (0-1)
vec4 shade(vec3 albedo, vec3 N, vec3 wp, vec4 ls, float spec, float shin, float ao, float emit) {
  vec3 alb = pow(max(albedo, 0.0), vec3(2.2));
  float ndl = dot(N, u_sunDir);
  float sh = ndl > 0.0 ? shadowAt(ls, ndl) : 0.0;
  // the shadows of the clouds drift slowly over the ground
  if (u_cl.y > 0.5) { vec2 q = wp.xz * 0.014 + u_cl.x * vec2(0.012, 0.005); sh *= mix(0.55, 1.0, smoothstep(0.36, 0.6, lnz(q) * 0.65 + lnz(q * 2.3 + 5.0) * 0.35)); }
  vec3 V = normalize(u_cam - wp);
  vec3 amb = mix(u_groundCol, u_skyCol, N.y * 0.5 + 0.5) * ao;
  vec3 dif = u_sunCol * max(ndl, 0.0) * sh;
  vec3 H = normalize(u_sunDir + V);
  float sp = pow(max(dot(N, H), 0.0), shin) * spec * sh * (shin + 8.0) / 40.0;
  float fr = pow(1.0 - max(dot(N, V), 0.0), 5.0) * spec * 0.6;
  vec3 pl = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    if (float(i) >= u_nl) break;
    vec3 d = u_lp[i].xyz - wp; float dist = length(d);
    float att = clamp(1.0 - dist / u_lp[i].w, 0.0, 1.0);
    pl += u_lc[i].rgb * u_lc[i].a * att * att * (0.35 + 0.65 * max(dot(N, d / max(dist, 0.001)), 0.0));
  }
  // shiny things mirror what's around them: the sky above, the glow at the horizon, the ground below
  vec3 Rr = reflect(-V, N);
  vec3 env = Rr.y > 0.0 ? mix(u_hzn, u_skyCol * 1.5, smoothstep(0.0, 0.55, Rr.y)) : mix(u_hzn, u_groundCol * 1.3, smoothstep(0.0, 0.4, -Rr.y));
  vec3 col = alb * (amb + dif + pl * 2.2) + u_sunCol * sp + env * (fr * 1.9 + spec * spec * 0.14) * ao;
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
uniform mat4 u_vp; uniform mat4 u_lvp; uniform mat4 u_model; uniform float u_time;
// the sea's waves: height at (x, z), used to move the water's surface and to light it
float waveH(vec2 q, float t) { return 0.10 * sin(q.x * 0.35 + t * 1.1) + 0.07 * sin(q.y * 0.5 - t * 1.4 + q.x * 0.2) + 0.04 * sin((q.x + q.y) * 0.9 + t * 2.0); }
out vec3 v_col; out vec3 v_wp; out vec2 v_uv; out vec2 v_dim; out float v_pat; out float v_face; out float v_alpha; out vec3 v_n; out float v_glow; out vec4 v_ls; out float v_round;
void main() {
  vec3 wp = (u_model * vec4(a_pos, 1.0)).xyz;
  if (a_mat.x == 47.0 && a_nao.y > 0.9) wp.y += waveH(wp.xz, u_time) - 0.12; // water: the top rolls
  gl_Position = u_vp * vec4(wp, 1.0);
  v_col = a_col.rgb; v_glow = a_col.a; v_wp = wp; v_uv = a_uv; v_dim = a_dim; v_pat = a_mat.x; v_face = a_mat.y; v_alpha = a_mat.z / 255.0; v_round = a_mat.w;
  v_n = normalize(mat3(u_model) * a_nao.xyz); v_ls = u_lvp * vec4(wp + v_n * 0.03, 1.0);
}`;
// Materials are drawn smooth (soft noise, no big pixels), each with its own little bumps that catch the light
// (wood grain, gaps between planks, mortar, stones, sand ripples), and flat parts get softly rounded edges.
const PART_FS = HEAD + `
in vec3 v_col; in vec3 v_wp; in vec2 v_uv; in vec2 v_dim; in float v_pat; in float v_face; in float v_alpha; in vec3 v_n; in float v_glow; in vec4 v_ls; in float v_round;
uniform float u_time; uniform float u_glass;
uniform sampler2D u_depth; uniform vec4 u_dinfo; // how far away the things behind the water are (on, near, far)
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// the sea's waves: height at (x, z), used to move the water's surface and to light it
float waveH(vec2 q, float t) { return 0.10 * sin(q.x * 0.35 + t * 1.1) + 0.07 * sin(q.y * 0.5 - t * 1.4 + q.x * 0.2) + 0.04 * sin((q.x + q.y) * 0.9 + t * 2.0); }
float vnoise(vec2 p) { vec2 i = floor(p), g = fract(p); g = g * g * (3.0 - 2.0 * g); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), g.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), g.x), g.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
` + LIGHT + `
void main() {
  vec2 u = v_uv;
  vec3 N = normalize(v_n); float foam = 0.0;
  float face = floor(v_face + 0.5), p = floor(v_pat + 0.5);
  float seed = face * 1.7 + v_dim.x * 0.37 + v_dim.y * 0.91; // different for every face, the same all over one face
  float edge = min(min(u.x, u.y), min(v_dim.x - u.x, v_dim.y - u.y));
  float near = 1.0 - smoothstep(22.0, 60.0, distance(v_wp, u_cam)); // fine detail fades out far away (so it doesn't shimmer)
  float g1 = fbm(u * 0.9 + seed), g2 = vnoise(u * 9.0 + seed * 3.1), g3 = mix(0.5, vnoise(u * 31.0 + seed), near);
  float m = 1.0, hgt = 0.0, bump = 0.0;
  vec3 col = v_col; float a = 1.0, spec = 0.1, shin = 16.0;
  if (p == 30.0) { m = 0.975 + 0.03 * g2 + 0.02 * g3; spec = 0.4; shin = 60.0; }
  else if (p == 40.0) { spec = 0.5; shin = 70.0; }
  else if (p == 4.0) {
    float w = u.y * 5.0 + fbm(vec2(u.x * 0.5, u.y * 2.5) + seed) * 4.0, gr = 0.5 + 0.5 * sin(w * 6.2831);
    m = 0.84 + 0.14 * gr + 0.05 * g3; hgt = gr * 0.5 + g3 * 0.2; bump = 0.035; spec = 0.14; shin = 24.0;
  }
  else if (p == 41.0) {
    float row = floor(u.y * 2.0), off = hash(vec2(row, 3.7)) * 3.0, fx = fract((u.x + off) / 3.0), fy = fract(u.y * 2.0);
    float gap = smoothstep(0.0, 0.05, min(fy, 1.0 - fy)) * smoothstep(0.0, 0.012, min(fx, 1.0 - fx));
    float id = hash(vec2(row, floor((u.x + off) / 3.0)));
    float w = u.y * 14.0 + fbm(vec2(u.x * 0.7, u.y * 4.0) + id * 9.0) * 3.0, gr = 0.5 + 0.5 * sin(w * 6.2831);
    m = (0.8 + 0.18 * id + 0.08 * gr + 0.04 * g3) * mix(0.42, 1.0, gap); hgt = gap + gr * 0.12; bump = 0.05; spec = 0.14; shin = 24.0;
  }
  else if (p == 3.0) { m = 0.78 + 0.3 * g1 + 0.08 * g2 + 0.05 * g3; hgt = g1 * 0.7 + g2 * 0.3; bump = 0.07; spec = 0.08; }
  else if (p == 5.0) {
    float by = u.y * 3.0, row = floor(by), bx = u.x * 1.5 + mod(row, 2.0) * 0.5;
    vec2 bf = vec2(fract(bx), fract(by));
    float mort = smoothstep(0.0, 0.045, min(bf.x, 1.0 - bf.x)) * smoothstep(0.0, 0.09, min(bf.y, 1.0 - bf.y));
    float id = hash(vec2(floor(bx), row));
    col = mix(vec3(0.8, 0.77, 0.71), col * (0.84 + 0.26 * id), mort); m = 0.93 + 0.09 * g2 + 0.04 * g3; hgt = mort + g2 * 0.15; bump = 0.07; spec = 0.06;
  }
  else if (p == 42.0) {
    vec2 g = u * 2.0, id = floor(g); float d = 9.0, d2 = 9.0, tone = 0.5;
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) { vec2 c = id + vec2(float(i), float(j)); vec2 pt = c + vec2(hash(c), hash(c + 3.1)) * 0.7 + 0.15; float e = length(g - pt); if (e < d) { d2 = d; d = e; tone = hash(c + 7.7); } else if (e < d2) d2 = e; }
    float st = smoothstep(0.02, 0.16, d2 - d);
    m = mix(0.5, 0.82 + 0.24 * tone + 0.05 * g3, st); hgt = st * (1.0 - d * 0.45); bump = 0.1; spec = 0.08;
  }
  else if (p == 43.0) { float v = sin(u.x * 1.7 + u.y * 2.3 + 2.5 * sin(u.y * 1.1 + u.x * 0.6 + seed) + g1 * 3.0); col = mix(col, col * 0.7, smoothstep(0.86, 1.0, abs(v))); m = 0.97 + 0.04 * g1; spec = 0.5; shin = 80.0; }
  else if (p == 12.0) { float br = mix(0.5, vnoise(vec2(u.x * 1.2 + seed, u.y * 22.0)), near); m = 0.95 + 0.05 * br + 0.03 * g1; spec = 0.75; shin = 50.0; } // brushed metal: faint soft lines
  else if (p == 44.0) { vec2 q = fract(u * 3.0) - 0.5; float d = abs(q.x * 0.7 + q.y) + abs(q.x - q.y * 0.7) * 0.6, rise = 1.0 - smoothstep(0.12, 0.2, d); m = 0.9 + 0.14 * rise + 0.04 * g1; hgt = rise; bump = 0.07; spec = 0.7; shin = 44.0; }
  else if (p == 9.0) { float fr = (1.0 - smoothstep(0.03, 0.08, edge)) * (1.0 - v_round); col = mix(col, vec3(1.0), 0.35 + 0.4 * fr); a = mix(0.3, 0.9, fr); spec = 0.9; shin = 110.0; }
  else if (p == 8.0) { m = 0.95 + 0.07 * g1 + 0.06 * smoothstep(0.55, 0.9, vnoise(vec2((u.x + u.y) * 1.1, (u.x - u.y) * 5.0) + seed)); spec = 0.85; shin = 90.0; }
  else if (p == 11.0) { m = 1.0 + 0.15 * (1.0 - smoothstep(0.0, 0.15, edge)) * (1.0 - v_round); spec = 0.0; }
  else if (p == 1.0) { m = 0.82 + 0.3 * g1 + 0.06 * g3; col = mix(col, col * vec3(1.18, 1.05, 0.7), smoothstep(0.5, 0.8, vnoise(u * 0.35 + seed)) * 0.35); }
  else if (p == 2.0) { m = 0.8 + 0.3 * g1 + 0.08 * g3; hgt = g1; bump = 0.05; }
  else if (p == 46.0) {
    float line = 0.3 + 0.2 * vnoise(vec2(u.x * 2.2, seed)) + 0.06 * vnoise(vec2(u.x * 9.0, 1.0));
    col = mix(col, vec3(0.604, 0.416, 0.247), smoothstep(line - 0.04, line + 0.04, v_dim.y - u.y)); m = 0.84 + 0.26 * g1 + 0.06 * g3; hgt = g1; bump = 0.04;
  }
  else if (p == 6.0) {
    // sand: soft dunes of light and dark, wind ripples you can see the light on, fine grains, a few sparkles
    float rip = sin(u.x * 2.6 + 1.6 * sin(u.y * 0.9 + seed) + g1 * 2.5);
    m = 0.9 + 0.12 * g1 + 0.03 * rip + 0.05 * g3; hgt = rip * 0.45 + g3 * 0.55; bump = face == 2.0 ? 0.028 : 0.012;
    if (near > 0.3 && hash(floor(u * 38.0) + seed) > 0.992) { spec = 1.0; shin = 160.0; }
  }
  else if (p == 47.0) {
    // water: the slope of the waves (big rollers + little ripples) tilts the surface, so light and sky move on it
    vec2 q = v_wp.xz; float t = u_time, e = 0.3;
    float h0 = waveH(q, t);
    vec2 slope = vec2(waveH(q + vec2(e, 0.0), t) - h0, waveH(q + vec2(0.0, e), t) - h0) / e;
    slope += 0.10 * vec2(sin(q.x * 2.3 + t * 2.6 + sin(q.y * 1.7) * 1.5), sin(q.y * 2.9 - t * 2.2 + sin(q.x * 1.3) * 1.5));
    slope += 0.05 * vec2(vnoise(q * 3.1 + t * 0.9) - 0.5, vnoise(q * 3.1 - t * 0.8 + 9.0) - 0.5);
    if (face == 2.0) N = normalize(vec3(-slope.x * 1.6, 1.0, -slope.y * 1.6));
    // foam: on the wave tops, and where the water ends
    float crest = smoothstep(0.11, 0.2, h0) * smoothstep(0.35, 0.75, vnoise(q * 1.9 + vec2(t * 0.6, -t * 0.4)));
    float shore = (1.0 - smoothstep(0.0, 1.3, edge)) * (0.55 + 0.45 * sin(edge * 9.0 - t * 2.5)) * step(1.5, face) * step(face, 2.5);
    foam = clamp(crest * 0.7 + shore * 0.8, 0.0, 1.0);
    a = 0.62; spec = 1.0; shin = 220.0;
  }
  else if (p == 45.0) { float wv = sin(u.x * 52.0) * sin(u.y * 52.0) * near; m = 0.93 + 0.05 * wv + 0.05 * g2; hgt = wv; bump = 0.015; spec = 0.02; }
  else { m = 0.97 + 0.04 * g2; }

  // how the surface, its coordinates and its bumps change from pixel to pixel (needed for the two effects below)
  vec3 dpx = dFdx(v_wp), dpy = dFdy(v_wp);
  vec2 dux = dFdx(u), duy = dFdy(u);
  float hx = dFdx(hgt), hy = dFdy(hgt);
  bool plain = p != 47.0 && p != 9.0;
  // rounded edges: near the edge of a flat face the surface "turns" toward the next face, so edges catch a soft highlight
  if (plain && v_round < 0.5) {
    float d2 = dux.x * duy.y - dux.y * duy.x;
    if (abs(d2) > 1e-12) {
      vec3 T = (dpx * duy.y - dpy * dux.y) / d2, B = (dpy * dux.x - dpx * duy.x) / d2;
      float bw = min(0.07, 0.25 * min(v_dim.x, v_dim.y));
      float ex = max(0.0, 1.0 - (v_dim.x - u.x) / bw) - max(0.0, 1.0 - u.x / bw), ey = max(0.0, 1.0 - (v_dim.y - u.y) / bw) - max(0.0, 1.0 - u.y / bw);
      N = normalize(N + (T / max(length(T), 1e-6) * ex + B / max(length(B), 1e-6) * ey) * 0.75);
      m *= mix(0.9, 1.0, smoothstep(0.0, bw * 0.5, edge));
    }
  }
  // little bumps: the height of the material tilts the light (so grain, gaps and ripples look carved, not painted)
  if (plain && bump > 0.0 && near > 0.0) {
    vec3 r1 = cross(dpy, N), r2 = cross(N, dpx); float det = dot(dpx, r1);
    if (abs(det) > 1e-12) N = normalize(abs(det) * N - bump * near * sign(det) * (hx * r1 + hy * r2));
  }
  vec4 c = shade(col * m, N, v_wp, v_ls, spec, shin, 1.0, v_glow);
  if (p == 47.0) {
    // the sky mirrored in the water (more at a low angle), the sun's sparkle, then the foam on top
    vec3 V = normalize(u_cam - v_wp);
    bool below = face == 2.0 && dot(N, V) < 0.0; // looking up at the surface from under the water
    if (below) N = -N;
    vec3 R = reflect(-V, N);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    vec3 skyc = mix(u_fog, u_fog * vec3(0.7, 0.85, 1.15), clamp(R.y * 1.4, 0.0, 1.0));
    float glint = pow(max(dot(R, u_sunDir), 0.0), 260.0) * 1.8 + pow(max(dot(R, u_sunDir), 0.0), 24.0) * 0.16;
    c.rgb = mix(c.rgb, skyc, 0.12 + 0.72 * fres) + normalize(u_sunCol + 0.001) * glint;
    c.rgb = mix(c.rgb, vec3(0.97), foam * 0.75);
    a = clamp(mix(0.58, 0.95, fres) + foam * 0.35, 0.0, 1.0);
    if (u_dinfo.x > 0.5 && !below) {
      // how much water you're looking through: a little = clear and bright with foam lapping at the sand, a lot = deep and dark
      float nr = u_dinfo.y, fr2 = u_dinfo.z, zs = texelFetch(u_depth, ivec2(gl_FragCoord.xy), 0).r;
      float behind = 2.0 * nr * fr2 / (fr2 + nr - (zs * 2.0 - 1.0) * (fr2 - nr)), here = 2.0 * nr * fr2 / (fr2 + nr - (gl_FragCoord.z * 2.0 - 1.0) * (fr2 - nr));
      float thick = max(behind - here, 0.0), deep = 1.0 - exp(-thick * 0.3);
      c.rgb = mix(c.rgb * 1.12 + vec3(0.0, 0.07, 0.055), c.rgb * 0.78, deep);
      float lap = (1.0 - smoothstep(0.0, 0.6, thick)) * (0.55 + 0.45 * sin(thick * 13.0 - u_time * 2.3 + vnoise(v_wp.xz * 0.7) * 5.0));
      c.rgb = mix(c.rgb, vec3(0.97), lap * 0.75);
      a = clamp(mix(0.2, 0.96, deep) + fres * 0.3 + foam * 0.35 + lap * 0.6, 0.0, 1.0);
    }
    if (below) { c.rgb = mix(v_col * 1.25 + 0.12, skyc * 1.1, 0.35 + 0.4 * fres); a = 0.72; } // a bright, rippling ceiling
  }
  o = vec4(c.rgb, u_glass > 0.5 ? a * v_alpha : c.a);
}`;
// Grass blades: one little blade drawn once for every blade in the world (instancing), bent by the wind and by the player.
const GRASS_VS = HEAD + `
in vec2 a_v; in vec4 a_i0; in vec4 a_i1; in float a_i2;
uniform mat4 u_vp; uniform mat4 u_lvp; uniform float u_time; uniform vec3 u_cam; uniform vec3 u_player; uniform vec2 u_range;
out vec3 v_wp; out vec4 v_ls; out float v_h; out float v_tint; out float v_kind; out vec3 v_n; out vec3 v_lawn;
void main() {
  float h = a_v.y, cs = cos(a_i0.w), sn = sin(a_i0.w);
  vec3 base = a_i0.xyz;
  float fade = 1.0 - smoothstep(u_range.x, u_range.y, distance(base.xz, u_cam.xz)); // far blades shrink away
  float height = a_i1.x * fade;
  float w = a_i1.y * (a_i1.w > 0.5 ? (h > 0.72 ? 1.5 : 0.22) : 1.0 - h * h * 0.92);
  // wind: each blade waves a bit by itself, and big gusts roll across the whole field
  float ph = base.x * 0.31 + base.z * 0.27 + a_i1.z * 6.0;
  vec2 wind = vec2(sin(u_time * 1.7 + ph) + 0.5 * sin(u_time * 3.3 + ph * 2.1), cos(u_time * 1.3 + ph * 0.8)) * 0.11;
  wind += vec2(1.0, 0.45) * 0.34 * (0.5 + 0.5 * sin(u_time * 0.8 - base.x * 0.09 - base.z * 0.05)) * (0.6 + 0.4 * sin(u_time * 0.23 + base.z * 0.02));
  vec2 lean = vec2(-sn, cs) * 0.2;
  // a player walking through pushes the blades away
  vec2 away = base.xz - u_player.xz; float pd = length(away);
  float push = (1.0 - smoothstep(0.35, 1.7, pd)) * step(abs(base.y - u_player.y), 1.6);
  vec2 bend = (wind + lean) * (1.0 - push) + (away / max(pd, 0.001)) * 0.8 * push;
  float k = h * h, drop = sqrt(max(1.0 - dot(bend, bend) * k, 0.2));
  vec3 p = base + vec3(cs, 0.0, sn) * a_v.x * w + vec3(bend.x, 0.0, bend.y) * k * height + vec3(0.0, h * height * drop, 0.0);
  v_wp = p; gl_Position = u_vp * vec4(p, 1.0);
  v_ls = u_lvp * vec4(base + vec3(0.0, 0.5, 0.0), 1.0); // (a bit above the ground, so the ground doesn't shade its own grass)
  v_h = h; v_tint = a_i1.z; v_kind = a_i1.w; v_n = normalize(vec3(bend.x * 0.7, 1.0, bend.y * 0.7));
  v_lawn = vec3(floor(a_i2 / 65536.0), mod(floor(a_i2 / 256.0), 256.0), mod(a_i2, 256.0)) / 255.0;
}`;
const GRASS_FS = HEAD + `
in vec3 v_wp; in vec4 v_ls; in float v_h; in float v_tint; in float v_kind; in vec3 v_n; in vec3 v_lawn;
out vec4 o;
` + LIGHT + `
void main() {
  // dark at the roots, bright at the tip, in the lawn's own color; some blades drier, some greener
  vec3 col = v_lawn * mix(vec3(0.42, 0.5, 0.38), vec3(1.12, 1.18, 0.8), v_h);
  col = mix(col, col * vec3(1.25, 1.12, 0.7), smoothstep(0.72, 1.0, v_tint) * 0.55);
  col *= 0.86 + 0.28 * fract(v_tint * 7.31);
  if (v_kind > 0.5 && v_h > 0.72) col = v_kind < 1.5 ? vec3(0.98, 0.97, 0.93) : v_kind < 2.5 ? vec3(1.0, 0.82, 0.2) : v_kind < 3.5 ? vec3(1.0, 0.45, 0.62) : vec3(0.66, 0.5, 1.0);
  vec4 c = shade(col, normalize(v_n), v_wp, v_ls, 0.1, 14.0, mix(0.5, 1.0, v_h), 0.0);
  // the sun shining through the tips when you look toward it
  vec3 V = normalize(u_cam - v_wp);
  c.rgb += vec3(0.18, 0.2, 0.05) * pow(max(dot(-V, u_sunDir), 0.0), 3.0) * v_h * v_h;
  o = vec4(c.rgb, 0.0);
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
in vec2 v_p; uniform mat4 u_inv; uniform vec3 u_top; uniform vec3 u_bottom; uniform float u_stars; uniform vec3 u_sun; uniform vec3 u_sunTint; uniform float u_time; uniform float u_cloud;
out vec4 o;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), g = fract(p); g = g * g * (3.0 - 2.0 * g); return mix(mix(hash(vec3(i, 1.0)), hash(vec3(i + vec2(1.0, 0.0), 1.0)), g.x), mix(hash(vec3(i + vec2(0.0, 1.0), 1.0)), hash(vec3(i + vec2(1.0, 1.0), 1.0)), g.x), g.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n2(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
void main() {
  vec4 a = u_inv * vec4(v_p, 1.0, 1.0);
  vec3 d = normalize(a.xyz / a.w);
  float t = clamp(d.y * 1.3 + 0.12, 0.0, 1.0);
  vec3 c = mix(u_bottom, u_top, pow(t, 0.8));
  float s = max(dot(d, normalize(u_sun)), 0.0);
  if (u_cloud > 0.0 && d.y > 0.01) {
    // soft clouds drifting on the wind: thick parts are shaded, edges facing the sun glow
    vec2 uv = d.xz / (d.y + 0.14) * 1.25 + vec2(u_time * 0.011, u_time * 0.004);
    float f = fbm(uv), cl = smoothstep(0.47, 0.76, f) * smoothstep(0.01, 0.22, d.y) * u_cloud;
    float thick = fbm(uv + normalize(u_sun).xz * 0.22);
    vec3 lit = u_sunTint * 0.75 + 0.3, dark = mix(u_bottom, u_top, 0.5) * 0.72 + 0.05;
    c = mix(c, mix(lit, dark, smoothstep(0.35, 0.8, thick)) * (1.0 - u_stars * 0.6), cl * 0.92);
  }
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
// Soft shading where things meet (ambient occlusion): corners, the foot of a wall, under a table are a bit darker,
// which is what makes objects look like they really sit on the ground. Worked out from how far away every pixel is.
const AO_FS = HEAD + `in vec2 v_uv; uniform sampler2D u_depth; uniform vec4 u_dinfo; uniform vec2 u_tan; out vec4 o;
float lin(float z) { return 2.0 * u_dinfo.y * u_dinfo.z / (u_dinfo.z + u_dinfo.y - (z * 2.0 - 1.0) * (u_dinfo.z - u_dinfo.y)); }
vec3 vpos(vec2 uv) { float z = lin(textureLod(u_depth, uv, 0.0).r); return vec3((uv * 2.0 - 1.0) * u_tan * z, -z); }
void main() {
  float d0 = textureLod(u_depth, v_uv, 0.0).r;
  vec3 P = vpos(v_uv);
  vec3 n = normalize(cross(dFdx(P), dFdy(P)));
  float R = 0.75, ang = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))), occ = 0.0;
  for (int i = 0; i < 10; i++) {
    float fi = float(i) + 0.5, r = sqrt(fi / 10.0), th = ang + fi * 2.39996;
    vec2 off = vec2(cos(th), sin(th)) * r * R / max(-P.z, 0.2) * 0.5 / u_tan;
    vec3 v = vpos(v_uv + off) - P; float dl = length(v);
    occ += max(dot(n, v) / (dl + 1e-4) - 0.14, 0.0) * (1.0 - smoothstep(R * 0.9, R * 2.4, dl));
  }
  float ao = clamp(1.0 - occ / 10.0 * 2.3, 0.0, 1.0);
  ao = mix(ao, 1.0, smoothstep(40.0, 85.0, -P.z));
  o = vec4(vec3(d0 >= 0.99999 ? 1.0 : ao), 1.0);
}`;
// Sun rays: the bright sun is smeared toward the viewer, and anything in front of it (a palm, a roof) cuts dark streaks in it.
const RAYS_FS = HEAD + `in vec2 v_uv; uniform sampler2D u_tex; uniform vec2 u_sun; out vec4 o;
void main() {
  vec2 d = u_sun - v_uv; vec3 acc = vec3(0.0); float w = 1.0;
  for (int i = 0; i < 18; i++) {
    vec2 uv = v_uv + d * (float(i) / 18.0) * 0.94;
    acc += textureLod(u_tex, uv, 0.0).rgb * w * (1.0 - smoothstep(0.0, 0.5, distance(uv, u_sun)));
    w *= 0.94;
  }
  o = vec4(acc / 18.0, 1.0);
}`;
const FINAL_FS = HEAD + `in vec2 v_uv; uniform sampler2D u_scene; uniform sampler2D u_b1; uniform sampler2D u_b2; uniform float u_bloom; uniform sampler2D u_ao; uniform vec3 u_aoInfo; uniform sampler2D u_rays; uniform float u_raysK; out vec4 o;
void main() {
  vec3 c = texture(u_scene, v_uv).rgb;
  if (u_aoInfo.z > 0.0) {
    vec2 t = u_aoInfo.xy * 1.5;
    float ao = (texture(u_ao, v_uv).r * 2.0 + texture(u_ao, v_uv + t).r + texture(u_ao, v_uv - t).r + texture(u_ao, v_uv + vec2(t.x, -t.y)).r + texture(u_ao, v_uv + vec2(-t.x, t.y)).r) / 6.0;
    c *= mix(1.0, ao, u_aoInfo.z);
  }
  vec3 b = texture(u_b1, v_uv).rgb * 0.8 + texture(u_b2, v_uv).rgb * 1.1;
  c += b * u_bloom * 0.75;
  if (u_raysK > 0.0) c += texture(u_rays, v_uv).rgb * u_raysK;
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
    chunk: compile(CHUNK_VS, CHUNK_FS), part: compile(PART_VS, PART_FS), grass: compile(GRASS_VS, GRASS_FS), model: compile(MODEL_VS, MODEL_FS), depth: compile(DEPTH_VS, DEPTH_FS),
    sky: compile(SKY_VS, SKY_FS), line: compile(LINE_VS, LINE_FS),
    bright: compile(QUAD_VS, BRIGHT_FS), blur: compile(QUAD_VS, BLUR_FS), final: compile(QUAD_VS, FINAL_FS), ao: compile(QUAD_VS, AO_FS), rays: compile(QUAD_VS, RAYS_FS),
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
    // a cube with soft, rounded corners (players and pets are made of these in HD)
    {
      const rc = [], r = 0.2, ts = [-0.5, -0.4, -0.3, 0, 0.3, 0.4, 0.5];
      const pt = (ax, sgn, s, t) => {
        const p = [0, 0, 0]; p[ax] = sgn * 0.5; p[(ax + 1) % 3] = s; p[(ax + 2) % 3] = t;
        const c = p.map((v) => Math.max(-(0.5 - r), Math.min(0.5 - r, v))), d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], l = Math.hypot(...d) || 1;
        return [c[0] + d[0] / l * r, c[1] + d[1] / l * r, c[2] + d[2] / l * r, d[0] / l, d[1] / l, d[2] / l];
      };
      for (let ax = 0; ax < 3; ax++) for (const sgn of [-1, 1]) for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
        const q = [pt(ax, sgn, ts[i], ts[j]), pt(ax, sgn, ts[i + 1], ts[j]), pt(ax, sgn, ts[i + 1], ts[j + 1]), pt(ax, sgn, ts[i], ts[j + 1])];
        for (const k of [0, 1, 2, 0, 2, 3]) rc.push(...q[k]);
      }
      makePrim('rcube', rc);
    }
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
  /* grass blades (engine v2): grown on Grass parts, drawn with instancing */
  const GRASS = hd.grass ?? 4, GRASS_FAR = hd.grassFar || 85;
  const bladeBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bladeBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, 0, 0.5, 0, -0.42, 0.34, 0.42, 0.34, -0.27, 0.68, 0.27, 0.68, 0, 1]), gl.STATIC_DRAW);
  let lawns = [], grassT = 0, grassCount = 0;
  function growNow(parts, skip) {
    for (const A of lawns) { gl.deleteBuffer(A.buf); gl.deleteVertexArray(A.vao); }
    lawns = []; grassCount = 0;
    if (GRASS <= 0) return;
    const a = P.grass.a;
    for (const A of growGrass(parts || [], skip, GRASS)) {
      const buf = gl.createBuffer(), vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, bladeBuf); gl.enableVertexAttribArray(a.a_v); gl.vertexAttribPointer(a.a_v, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, A.data, gl.STATIC_DRAW);
      for (const [loc, size, off] of [[a.a_i0, 4, 0], [a.a_i1, 4, 16], [a.a_i2, 1, 32]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 36, off); gl.vertexAttribDivisor(loc, 1); }
      lawns.push({ min: A.min, max: A.max, n: A.n, buf, vao }); grassCount += A.n;
    }
    gl.bindVertexArray(null);
  }
  // (in the editor the parts change all the time: regrow at most a few times a second)
  function growSoon(parts, skip) { clearTimeout(grassT); if (!lawns.length && !grassCount) growNow(parts, skip); else grassT = setTimeout(() => growNow(parts, skip), 350); }
  function drawGrass(Pl, player) {
    if (!lawns.length) return;
    const prog = P.grass, e = state.eye;
    gl.useProgram(prog.p); lightUniforms(prog);
    gl.uniform1f(prog.u.u_time, state.time); gl.uniform3fv(prog.u.u_player, player || [0, -999, 0]); gl.uniform2f(prog.u.u_range, GRASS_FAR * 0.55, GRASS_FAR);
    for (const A of lawns) {
      if (!areaVisible(Pl, A)) continue;
      const dx = Math.max(A.min[0] - e[0], 0, e[0] - A.max[0]), dz = Math.max(A.min[2] - e[2], 0, e[2] - A.max[2]);
      if (dx * dx + dz * dz > GRASS_FAR * GRASS_FAR) continue;
      gl.bindVertexArray(A.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 7, A.n); state.faces += A.n * 5; state.drawn++;
    }
    gl.bindVertexArray(null);
  }
  // parts: the world's parts (engine v2). skip(q, i): leave some out (coins the game draws itself).
  function setParts(parts, skip, layer = 'main') {
    if (layer === 'main') growSoon(parts, skip);
    for (const A of partLayers.get(layer) || []) for (const k of ['solid', 'glass']) if (A[k]) freePart(A[k]);
    partLayers.set(layer, meshParts(parts || [], skip).map((A) => ({ min: A.min, max: A.max, solid: A.solid && uploadPart(A.solid), glass: A.glass && uploadPart(A.glass) })));
  }
  // moving parts (engine v2): i -> { solid, glass, m (model matrix), hide }
  const dyn = new Map();
  const freeDyn = (d) => { for (const k of ['solid', 'glass']) if (d[k]) freePart(d[k]); };
  function setDyn(list) { for (const d of dyn.values()) freeDyn(d); dyn.clear(); for (const { i, q } of list || []) dynMesh(i, q); }
  function dynMesh(i, q) {
    const old = dyn.get(i); if (old) freeDyn(old);
    const A = meshParts([{ ...q, p: [0, 0, 0], r: [0, 0, 0] }])[0] || {};
    dyn.set(i, { solid: A.solid && uploadPart(A.solid), glass: A.glass && uploadPart(A.glass), m: old ? old.m : new Float32Array(ident), hide: old ? old.hide : false, rad: Math.hypot(...q.z) / 2 + 0.5, c: old ? old.c : [0, 0, 0] });
  }
  function dynMove(i, p, R, hide) {
    const d = dyn.get(i); if (!d) return;
    const m = d.m; // column-major: the turned axes, then the position
    m[0] = R[0][0]; m[1] = R[1][0]; m[2] = R[2][0]; m[4] = R[0][1]; m[5] = R[1][1]; m[6] = R[2][1]; m[8] = R[0][2]; m[9] = R[1][2]; m[10] = R[2][2];
    m[12] = p[0]; m[13] = p[1]; m[14] = p[2]; d.c = p; d.hide = !!hide;
  }
  function dynClear() { for (const d of dyn.values()) freeDyn(d); dyn.clear(); }
  // point lights: [{ p: [x,y,z], range, color: [r,g,b], power }]; the 12 nearest the camera are used
  let lights = [], lightCount = 0;
  const lp = new Float32Array(48), lc = new Float32Array(48);
  function setLights(list) { lights = list || []; }
  // dark(0..1) from a world's script: dims the sun, the sky's light and the sky itself. Lamps keep shining.
  let darkK = 1;
  function setDark(d) { darkK = 1 - Math.max(0, Math.min(1, Number(d) || 0)) * 0.97; }
  const dim = (a) => (darkK === 1 ? a : [a[0] * darkK, a[1] * darkK, a[2] * darkK]);
  function packLights() {
    const e = state.eye || [0, 0, 0];
    const near = lights.filter((l) => !l.hide).map((l) => [l, (l.p[0] - e[0]) ** 2 + (l.p[1] - e[1]) ** 2 + (l.p[2] - e[2]) ** 2 - l.range * l.range]).sort((a, b) => a[1] - b[1]).slice(0, 12);
    lightCount = near.length; lp.fill(0); lc.fill(0);
    near.forEach(([l], k) => { lp.set([l.p[0], l.p[1], l.p[2], Math.max(0.5, l.range)], k * 4); lc.set([l.color[0], l.color[1], l.color[2], l.power ?? 1], k * 4); });
  }
  const sphereVisible = (Pl, c, r) => { for (const q of Pl) if (q[0] * c[0] + q[1] * c[1] + q[2] * c[2] + q[3] < -r) return false; return true; };
  const areaVisible = (Pl, A) => { const cx = (A.min[0] + A.max[0]) / 2, cy = (A.min[1] + A.max[1]) / 2, cz = (A.min[2] + A.max[2]) / 2, r = Math.hypot(A.max[0] - A.min[0], A.max[1] - A.min[1], A.max[2] - A.min[2]) / 2; for (const q of Pl) if (q[0] * cx + q[1] * cy + q[2] * cz + q[3] < -r) return false; return true; };
  function drawPartMeshes(kind, Pl) {
    const partAreas = allAreas();
    if (!partAreas.length && !dyn.size) return;
    const prog = P.part;
    gl.useProgram(prog.p); lightUniforms(prog);
    gl.uniform1f(prog.u.u_time, state.time); gl.uniform1f(prog.u.u_glass, kind === 'glass' ? 1 : 0);
    const see = kind === 'glass' && depthReady;
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, see ? T.depth : null); gl.uniform1i(prog.u.u_depth, 4); gl.activeTexture(gl.TEXTURE0);
    gl.uniform4f(prog.u.u_dinfo, see ? 1 : 0, state.near, state.far, 0);
    gl.uniformMatrix4fv(prog.u.u_model, false, ident);
    for (const A of partAreas) { const m = A[kind]; if (!m || !areaVisible(Pl, A)) continue; gl.bindVertexArray(m.vao); gl.drawArrays(gl.TRIANGLES, 0, m.n); state.faces += m.n / 3; state.drawn++; }
    for (const d of dyn.values()) {
      const m = d[kind]; if (!m || d.hide || !sphereVisible(Pl, d.c, d.rad)) continue;
      gl.uniformMatrix4fv(prog.u.u_model, false, d.m); gl.bindVertexArray(m.vao); gl.drawArrays(gl.TRIANGLES, 0, m.n); state.faces += m.n / 3; state.drawn++;
    }
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
  const shadowOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE && !hd.noShadow;
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
    // the depth of every pixel as a picture (for water you can see into, and the soft shading in corners), plus those passes' own pictures
    const depth = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, depth); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, w, h);
    for (const pn of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, pn, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const depthFb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, depthFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    const depthFbOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    const ao = colorTex(hw, hh), rays = colorTex(qw, qh);
    T = { w, h, hw, hh, qw, qh, ms, scene, sceneFb, h1, h2, q1, q2, h1f: fbFor(h1), h2f: fbFor(h2), q1f: fbFor(q1), q2f: fbFor(q2),
      depth, depthFb, depthFbOk, ao, aoF: fbFor(ao), rays, raysF: fbFor(rays),
      tex: [scene, h1, h2, q1, q2, depth, ao, rays], rb: [msColor, msDepth] };
    T.fb = [ms, sceneFb, T.h1f, T.h2f, T.q1f, T.q2f, depthFb, T.aoF, T.raysF];
    gl.bindFramebuffer(gl.FRAMEBUFFER, ms);
    T.ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  // check now that this graphics card can draw into the buffers (if not, the simpler setup is tried)
  makeTargets(16, 16);
  if (!T.ok) throw new Error('HD buffers are not supported here (' + samples + 'x anti-aliasing)');
  // can this graphics card copy the depth out? (if not: no see-into water and no corner shading, everything else works)
  const copyDepth = () => { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.ms); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.depthFb); gl.blitFramebuffer(0, 0, T.w, T.h, 0, 0, T.w, T.h, gl.DEPTH_BUFFER_BIT, gl.NEAREST); gl.bindFramebuffer(gl.FRAMEBUFFER, T.ms); };
  let depthOk = false;
  if (T.depthFbOk) { for (let i = 0; i < 8 && gl.getError() !== gl.NO_ERROR; i++) { /* clear old errors */ } copyDepth(); depthOk = gl.getError() === gl.NO_ERROR; gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
  const SSAO = hd.ssao !== false && depthOk, RAYS = hd.rays !== false;
  let depthReady = false;

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
    gl.uniform3fv(u.u_sunDir, L.dir); gl.uniform3fv(u.u_sunCol, dim(L.sun)); gl.uniform3fv(u.u_skyCol, dim(L.sky)); gl.uniform3fv(u.u_groundCol, dim(L.ground));
    gl.uniform3fv(u.u_fog, dim(hexRGB((SKIES[skyId] || SKIES.day).fog))); gl.uniform3fv(u.u_cam, state.eye); gl.uniform2f(u.u_fogr, state.fog[0], state.fog[1]);
    gl.uniform1f(u.u_exposure, L.exposure);
    gl.uniform1f(u.u_shadowOn, shadowOk ? 1 : 0); gl.uniform2f(u.u_texel, 1 / SM, 1 / SM);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shadowTex); gl.uniform1i(u.u_shadow, 0);
    gl.uniformMatrix4fv(u.u_vp, false, state.vp); gl.uniformMatrix4fv(u.u_lvp, false, state.lvp);
    if (u['u_lp[0]']) { gl.uniform4fv(u['u_lp[0]'], lp); gl.uniform4fv(u['u_lc[0]'], lc); } gl.uniform1f(u.u_nl, lightCount);
    gl.uniform2f(u.u_cl, state.time, state.clouds ? 1 : 0); gl.uniform3fv(u.u_hzn, L.hzn);
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
    for (const d of dyn.values()) if (d.solid && !d.hide) { gl.uniformMatrix4fv(prog.u.u_model, false, d.m); gl.bindVertexArray(d.solid.dvao); gl.drawArrays(gl.TRIANGLES, 0, d.solid.n); }
    gl.uniformMatrix4fv(prog.u.u_model, false, ident);
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
    state.near = 0.08; state.far = far; state.clouds = !!scene.skyClouds; depthReady = false;
    state.tan = [Math.tan((scene.fov || 1.2) / 2) * W / H, Math.tan((scene.fov || 1.2) / 2)];
    state.view = lookAt(scene.eye, scene.target);
    state.proj = proj;
    state.vp = mul(proj, state.view);
    state.faces = 0; state.drawn = 0;
    let budget = scene.rebuild || 6;
    for (const k of dirtyKeys) { if (budget-- <= 0) break; dirtyKeys.delete(k); if (grid) buildChunk(k % CX, Math.floor(k / (CX * CZ)), Math.floor(k / CX) % CZ); }
    const parts = scene.parts || [];

    packLights();
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
      gl.uniform3fv(prog.u.u_top, dim(hexRGB(sk.top))); gl.uniform3fv(prog.u.u_bottom, dim(hexRGB(sk.bottom)));
      gl.uniform1f(prog.u.u_stars, skyId === 'night' || skyId === 'space' ? 1 : 0);
      gl.uniform3fv(prog.u.u_sun, sk.sun); gl.uniform3fv(prog.u.u_sunTint, dim(L.sun.map((v) => Math.min(1, v))));
      gl.uniform1f(prog.u.u_time, state.time); gl.uniform1f(prog.u.u_cloud, scene.skyClouds ? 1 : 0);
      quad(prog);
    }
    const Pl = planes(state.vp);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    if (grid) drawChunks('solid', Pl);
    drawPartMeshes('solid', Pl);
    gl.disable(gl.CULL_FACE);
    drawGrass(Pl, scene.player || scene.target);
    drawParts(parts, false);
    // everything solid is drawn: keep how far away each pixel is (for the water, and the corner shading)
    if (depthOk) { copyDepth(); depthReady = true; }
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

    // 3b) soft shading in corners (at half size)
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    if (SSAO && depthReady) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.aoF); gl.viewport(0, 0, T.hw, T.hh);
      gl.useProgram(P.ao.p); tex(0, T.depth, P.ao.u.u_depth);
      gl.uniform4f(P.ao.u.u_dinfo, 1, state.near, state.far, 0); gl.uniform2f(P.ao.u.u_tan, state.tan[0], state.tan[1]);
      quad(P.ao);
    }
    // 4) bloom: what glows, blurred at half and quarter size
    let raysK = 0;
    if (BLOOM > 0 || RAYS) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.h1f); gl.viewport(0, 0, T.hw, T.hh);
      gl.useProgram(P.bright.p); tex(0, T.scene, P.bright.u.u_tex); quad(P.bright);
      const blur = (src, dst, w, h, dx, dy) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst); gl.viewport(0, 0, w, h); gl.useProgram(P.blur.p); tex(0, src, P.blur.u.u_tex); gl.uniform2f(P.blur.u.u_dir, dx / w, dy / h); quad(P.blur); };
      blur(T.h1, T.h2f, T.hw, T.hh, 1, 0); blur(T.h2, T.h1f, T.hw, T.hh, 0, 1);
      blur(T.h1, T.q1f, T.qw, T.qh, 1, 0); blur(T.q1, T.q2f, T.qw, T.qh, 0, 1);
      blur(T.q2, T.q1f, T.qw, T.qh, 2, 0); blur(T.q1, T.q2f, T.qw, T.qh, 0, 2);
      // sun rays: where is the sun on the screen? (none when it's behind you or far off to the side)
      if (RAYS) {
        const m = state.vp, e = state.eye, sx = e[0] + L.dir[0] * 500, sy = e[1] + L.dir[1] * 500, sz = e[2] + L.dir[2] * 500;
        const cw = m[3] * sx + m[7] * sy + m[11] * sz + m[15];
        if (cw > 0.01) {
          const u = (m[0] * sx + m[4] * sy + m[8] * sz + m[12]) / cw * 0.5 + 0.5, v = (m[1] * sx + m[5] * sy + m[9] * sz + m[13]) / cw * 0.5 + 0.5;
          const off = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5));
          raysK = Math.max(0, Math.min(1, (1.15 - off) / 0.6)) * (skyId === 'night' || skyId === 'space' ? 0.5 : 1.15);
          if (raysK > 0) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, T.raysF); gl.viewport(0, 0, T.qw, T.qh);
            gl.useProgram(P.rays.p); tex(0, T.h1, P.rays.u.u_tex); gl.uniform2f(P.rays.u.u_sun, u, v); quad(P.rays);
          }
        }
      }
    }
    // 5) put it all on the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, T.w, T.h);
    gl.useProgram(P.final.p);
    tex(0, T.scene, P.final.u.u_scene); tex(1, T.h1, P.final.u.u_b1); tex(2, T.q2, P.final.u.u_b2); tex(3, T.ao, P.final.u.u_ao); tex(4, T.rays, P.final.u.u_rays);
    gl.uniform1f(P.final.u.u_bloom, BLOOM);
    gl.uniform3f(P.final.u.u_aoInfo, 1 / T.hw, 1 / T.hh, SSAO && depthReady ? 0.85 : 0); gl.uniform1f(P.final.u.u_raysK, raysK);
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
    gl, hd: true, setGrid, setParts, setDyn, dynMesh, dynMove, dynClear, setLights, setDark, setSky, markDirty, frame, project, ray, resize,
    get lost() { return lost; },
    get stats() { return { faces: state.faces, chunks: chunks.size, drawn: state.drawn, hd: true, shadows: shadowOk, samples, grass: grassCount, ssao: SSAO, rays: RAYS, depth: depthOk }; },
    get size() { return { w: W, h: H }; },
    destroy() {
      for (const ch of chunks.values()) for (const k of ['solid', 'glass']) if (ch[k]) freeMesh(ch[k]);
      chunks.clear();
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    },
  };
}
