// Blockyard's own 3D renderer (plain WebGL, no libraries).
// Worlds are split into 16x16x16 chunks. Each chunk becomes one mesh with soft corner shadows
// (ambient occlusion) and block patterns painted by the shader, so there are no texture files.
import { BLOCKS, B, PALETTE, SKIES, SX, SY, SZ } from './world.js';

/* ---------------- tiny matrix library ---------------- */
export const M4 = {
  ident() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul(a, b, out = new Float32Array(16)) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      out[i * 4 + j] = s;
    }
    return out;
  },
  persp(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2), m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = 2 * far * near / (near - far);
    return m;
  },
  lookAt(e, t, up = [0, 1, 0]) {
    let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    const m = new Float32Array(16);
    m[0] = xx; m[1] = yx; m[2] = zx; m[4] = xy; m[5] = yy; m[6] = zy; m[8] = xz; m[9] = yz; m[10] = zz;
    m[12] = -(xx * e[0] + xy * e[1] + xz * e[2]); m[13] = -(yx * e[0] + yy * e[1] + yz * e[2]); m[14] = -(zx * e[0] + zy * e[1] + zz * e[2]); m[15] = 1;
    return m;
  },
  invert(m) {
    const inv = new Float32Array(16);
    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
    inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
    inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
    inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
    inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
    inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
    inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
    inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
    inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
    inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
    inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
    inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
    inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
    inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
    inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
    let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    det = det ? 1 / det : 0;
    for (let i = 0; i < 16; i++) inv[i] *= det;
    return inv;
  },
  // position * rotation (yaw around y, then pitch around x, then roll around z) * scale, all in one
  trs(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1, out = new Float32Array(16)) {
    const cy = Math.cos(ry), sy_ = Math.sin(ry), cx = Math.cos(rx), sx_ = Math.sin(rx), cz = Math.cos(rz), sz_ = Math.sin(rz);
    // R = Ry * Rx * Rz
    const r00 = cy * cz + sy_ * sx_ * sz_, r01 = -cy * sz_ + sy_ * sx_ * cz, r02 = sy_ * cx;
    const r10 = cx * sz_, r11 = cx * cz, r12 = -sx_;
    const r20 = -sy_ * cz + cy * sx_ * sz_, r21 = sy_ * sz_ + cy * sx_ * cz, r22 = cy * cx;
    out[0] = r00 * sx; out[1] = r10 * sx; out[2] = r20 * sx; out[3] = 0;
    out[4] = r01 * sy; out[5] = r11 * sy; out[6] = r21 * sy; out[7] = 0;
    out[8] = r02 * sz; out[9] = r12 * sz; out[10] = r22 * sz; out[11] = 0;
    out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
    return out;
  },
};

export const hexRGB = (h) => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

/* ---------------- shaders ---------------- */
const VOXEL_VS = `
attribute vec3 a_pos; attribute vec4 a_col; attribute vec4 a_uvp;
uniform mat4 u_vp; uniform vec3 u_cam; uniform vec2 u_fogr;
varying vec3 v_col; varying vec3 v_wp; varying vec2 v_uv; varying float v_pat; varying float v_fog; varying float v_n; varying float v_glow;
void main() {
  gl_Position = u_vp * vec4(a_pos, 1.0);
  v_col = a_col.rgb; v_glow = a_col.a; v_wp = a_pos; v_uv = a_uvp.xy; v_pat = a_uvp.z; v_n = a_uvp.w;
  float d = distance(a_pos, u_cam);
  v_fog = clamp((d - u_fogr.x) / (u_fogr.y - u_fogr.x), 0.0, 1.0);
}`;
const VOXEL_FS = `
precision mediump float;
varying vec3 v_col; varying vec3 v_wp; varying vec2 v_uv; varying float v_pat; varying float v_fog; varying float v_n; varying float v_glow;
uniform vec3 u_fog; uniform float u_time; uniform float u_alpha;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 nrm() {
  float n = floor(v_n + 0.5);
  if (n < 0.5) return vec3(1.0, 0.0, 0.0); if (n < 1.5) return vec3(-1.0, 0.0, 0.0);
  if (n < 2.5) return vec3(0.0, 1.0, 0.0); if (n < 3.5) return vec3(0.0, -1.0, 0.0);
  if (n < 4.5) return vec3(0.0, 0.0, 1.0); return vec3(0.0, 0.0, -1.0);
}
void main() {
  vec3 bp = floor(v_wp - nrm() * 0.01);
  vec2 uv = clamp(v_uv, 0.0, 1.0);
  vec2 px = floor(uv * 8.0);
  float seed = bp.x * 7.13 + bp.y * 3.71 + bp.z * 11.9 + floor(v_n) * 1.7;
  float n = hash(px + seed);
  vec2 e2 = min(uv, 1.0 - uv);
  float edge = min(e2.x, e2.y);
  float m = mix(0.8, 1.0, smoothstep(0.0, 0.06, edge));
  vec3 col = v_col;
  float a = u_alpha;
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
  else if (p == 9.0) { float f = step(edge, 0.09); m = 1.0; col = mix(col, vec3(1.0), 0.35 + 0.4 * f); a = mix(0.35, 0.9, f); if (abs(uv.x - uv.y - 0.2) < 0.05) a = 0.6; }
  else if (p == 10.0) { m *= 0.96 + 0.05 * n; }
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
  else if (p == 30.0) { vec2 q = fract(uv * 2.0) - 0.5; float r = length(q); m *= 0.96 + 0.05 * n; if (r < 0.26) m *= (q.y + q.x < 0.0 ? 1.1 : 0.88); }
  else if (p == 22.0) { a = 0.42; m = 1.05; }
  else if (p >= 32.0 && p <= 35.0) {
    vec2 d = p == 32.0 ? vec2(1.0, 0.0) : p == 33.0 ? vec2(-1.0, 0.0) : p == 34.0 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
    vec2 q = uv - 0.5;
    float s = fract(dot(q, d) * 3.0 - abs(dot(q, vec2(-d.y, d.x))) * 2.0 - u_time * 1.3);
    m *= s < 0.35 ? 1.35 : 0.8;
  }
  else if (p == 36.0) { vec2 q = uv - 0.5; float r = length(q); float w = sin(r * 22.0 - u_time * 5.0 + atan(q.y, q.x) * 2.0); col = mix(col, vec3(1.0), 0.25 + 0.25 * w); m = 1.0 + 0.2 * (1.0 - smoothstep(0.0, 0.5, r)); }
  else if (p == 31.0) { m *= fract(uv.x * 4.0) < 0.5 ? 1.05 : 0.85; }
  vec3 c = col * m * (v_glow > 0.99 ? 1.0 : v_glow);
  gl_FragColor = vec4(mix(c, u_fog, v_fog), a);
}`;
const MODEL_VS = `
attribute vec3 a_pos; attribute vec3 a_nrm;
uniform mat4 u_vp; uniform mat4 u_model; uniform vec3 u_cam; uniform vec2 u_fogr;
varying vec3 v_n; varying float v_fog; varying vec3 v_lp;
void main() {
  vec4 wp = u_model * vec4(a_pos, 1.0);
  gl_Position = u_vp * wp;
  v_n = normalize((u_model * vec4(a_nrm, 0.0)).xyz);
  v_lp = a_pos;
  v_fog = clamp((distance(wp.xyz, u_cam) - u_fogr.x) / (u_fogr.y - u_fogr.x), 0.0, 1.0);
}`;
const MODEL_FS = `
precision mediump float;
varying vec3 v_n; varying float v_fog; varying vec3 v_lp;
uniform vec3 u_color; uniform vec3 u_sun; uniform float u_amb; uniform float u_light; uniform float u_glow; uniform float u_alpha; uniform vec3 u_fog; uniform float u_shadow;
void main() {
  if (u_shadow > 0.5) {
    float r = length(v_lp.xz) * 2.0;
    gl_FragColor = vec4(0.0, 0.0, 0.0, (1.0 - smoothstep(0.55, 1.0, r)) * u_alpha);
    return;
  }
  float d = max(dot(normalize(v_n), u_sun), 0.0);
  float l = mix(u_amb + (1.0 - u_amb) * d * u_light, 1.0, u_glow);
  gl_FragColor = vec4(mix(u_color * l, u_fog, v_fog), u_alpha);
}`;
const SKY_VS = `
attribute vec2 a_pos; varying vec2 v_p;
void main() { v_p = a_pos; gl_Position = vec4(a_pos, 0.999, 1.0); }`;
const SKY_FS = `
precision mediump float;
varying vec2 v_p; uniform mat4 u_inv; uniform vec3 u_top; uniform vec3 u_bottom; uniform float u_stars; uniform vec3 u_sun;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec4 a = u_inv * vec4(v_p, 1.0, 1.0);
  vec3 d = normalize(a.xyz / a.w);
  float t = clamp(d.y * 1.4 + 0.15, 0.0, 1.0);
  vec3 c = mix(u_bottom, u_top, t);
  float s = max(dot(d, normalize(u_sun)), 0.0);
  c += vec3(1.0, 0.95, 0.8) * (pow(s, 400.0) * 1.5 + pow(s, 12.0) * 0.12) * (1.0 - u_stars * 0.8);
  if (u_stars > 0.0 && d.y > 0.0) { vec3 q = floor(d * 180.0); float h = hash(q); if (h > 0.996) c += vec3(h - 0.996) * 220.0 * u_stars * d.y; }
  gl_FragColor = vec4(c, 1.0);
}`;
const LINE_VS = `attribute vec3 a_pos; uniform mat4 u_vp; void main() { gl_Position = u_vp * vec4(a_pos, 1.0); }`;
const LINE_FS = `precision mediump float; uniform vec4 u_color; void main() { gl_FragColor = u_color; }`;

/* ---------------- faces of a cube ---------------- */
// For each face: normal, the 4 corners seen from outside (counter-clockwise), and the face's right/up directions (for shading corners).
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], r: [0, 0, -1], u: [0, 1, 0], shade: 'x+' },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], r: [0, 0, 1], u: [0, 1, 0], shade: 'x-' },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], r: [1, 0, 0], u: [0, 0, -1], shade: 'y+' },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], r: [1, 0, 0], u: [0, 0, 1], shade: 'y-' },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], r: [1, 0, 0], u: [0, 1, 0], shade: 'z+' },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], r: [-1, 0, 0], u: [0, 1, 0], shade: 'z-' },
];
const CORNER_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
const CORNER_DIR = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const AO = [0.52, 0.68, 0.84, 1];

// Which pattern and color each face of a block uses.
function faceLook(t, color, f) {
  const b = BLOCKS[t];
  const tint = b.tint ? hexRGB(PALETTE[color & 15]) : hexRGB(b.color || '#ffffff');
  if (t === B.grass) return f === 2 ? [1, hexRGB(b.color)] : f === 3 ? [2, hexRGB(b.side)] : [21, hexRGB(b.side)];
  if (t === B.plastic) return [f === 2 ? 30 : 10, tint];
  if (t === B.bounce) return [f === 2 ? 15 : 31, tint];
  if (t === B.speed) return [f === 2 ? 16 : 31, tint];
  if (t === B.checkpoint) return [f === 2 ? 18 : 10, tint];
  if (t === B.spawn) return [f === 2 ? 20 : 10, tint];
  if (b.dir) return [f === 2 ? b.pat : 12, tint];
  if (t === B.teleport) return [f === 2 ? 36 : 11, tint];
  return [b.pat || 10, tint];
}

/* ---------------- the renderer ---------------- */
export function createRenderer(canvas, { low = false } = {}) {
  const gl = canvas.getContext('webgl', { antialias: !low, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false })
    || canvas.getContext('experimental-webgl');
  if (!gl) throw new Error('This browser or computer has 3D graphics (WebGL) turned off.');
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
  const voxel = compile(VOXEL_VS, VOXEL_FS), model = compile(MODEL_VS, MODEL_FS), sky = compile(SKY_VS, SKY_FS), line = compile(LINE_VS, LINE_FS);

  const skyBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  /* primitives for models: position + normal */
  const prims = {};
  const makePrim = (name, data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); prims[name] = { b, n: data.length / 6 }; };
  {
    const cube = [];
    for (const f of FACES) {
      const pts = f.c.map((c) => c.map((v) => v - 0.5));
      for (const k of [0, 1, 2, 0, 2, 3]) cube.push(...pts[k], ...f.n);
    }
    makePrim('cube', cube);
    const cyl = [], S = 14;
    for (let i = 0; i < S; i++) {
      const a0 = i / S * Math.PI * 2, a1 = (i + 1) / S * Math.PI * 2;
      const p0 = [Math.cos(a0) * 0.5, Math.sin(a0) * 0.5], p1 = [Math.cos(a1) * 0.5, Math.sin(a1) * 0.5];
      const nm = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
      cyl.push(p0[0], -0.5, p0[1], ...nm, p1[0], 0.5, p1[1], ...nm, p1[0], -0.5, p1[1], ...nm);
      cyl.push(p0[0], -0.5, p0[1], ...nm, p0[0], 0.5, p0[1], ...nm, p1[0], 0.5, p1[1], ...nm);
      cyl.push(0, 0.5, 0, 0, 1, 0, p0[0], 0.5, p0[1], 0, 1, 0, p1[0], 0.5, p1[1], 0, 1, 0);
      cyl.push(0, -0.5, 0, 0, -1, 0, p1[0], -0.5, p1[1], 0, -1, 0, p0[0], -0.5, p0[1], 0, -1, 0);
    }
    makePrim('cyl', cyl);
    const sph = [], R = 10, C = 14;
    const pt = (i, j) => { const th = i / R * Math.PI, ph = j / C * Math.PI * 2; return [Math.sin(th) * Math.cos(ph) * 0.5, Math.cos(th) * 0.5, Math.sin(th) * Math.sin(ph) * 0.5]; };
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
      const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
      for (const q of [a, c, b, a, d, c]) sph.push(...q, q[0] * 2, q[1] * 2, q[2] * 2);
    }
    makePrim('sphere', sph);
    // flat disc for blob shadows (drawn as a square, the shader rounds it)
    makePrim('shadow', [-0.5, 0, -0.5, 0, 1, 0, 0.5, 0, 0.5, 0, 1, 0, 0.5, 0, -0.5, 0, 1, 0, -0.5, 0, -0.5, 0, 1, 0, -0.5, 0, 0.5, 0, 1, 0, 0.5, 0, 0.5, 0, 1, 0]);
  }
  const lineBuf = gl.createBuffer();

  /* ---------------- chunks ---------------- */
  const CS = 16, CX = SX / CS, CY = SY / CS, CZ = SZ / CS;
  let grid = null;
  const chunks = new Map(); // index -> { x, y, z, solid: {buf, n}, glass: {buf, n}, dirty }
  let skyInfo = SKIES.day, faceShade = {};
  const setShade = () => {
    const s = skyInfo.sun, l = Math.hypot(...s);
    const sun = s.map((v) => v / l);
    for (const f of FACES) faceShade[f.shade] = skyInfo.amb + (1 - skyInfo.amb) * Math.max(0, f.n[0] * sun[0] + f.n[1] * sun[1] + f.n[2] * sun[2]) * skyInfo.light;
    // let the bottom and back sides never go completely flat
    for (const k in faceShade) faceShade[k] = Math.max(faceShade[k], skyInfo.amb * 0.95);
  };
  setShade();
  const opaqueAt = (x, y, z) => { const t = grid.get(x, y, z); return t && !BLOCKS[t].see && !BLOCKS[t].entity && !BLOCKS[t].ghost; };

  function buildChunk(cx, cy, cz) {
    const key = cx + cz * CX + cy * CX * CZ;
    let ch = chunks.get(key);
    if (!ch) { ch = { x: cx, y: cy, z: cz, solid: null, glass: null }; chunks.set(key, ch); }
    const out = { solid: { pos: [], att: [] }, glass: { pos: [], att: [] } };
    const x0 = cx * CS, y0 = cy * CS, z0 = cz * CS;
    const T = grid.t, Cc = grid.c;
    for (let y = y0; y < y0 + CS; y++) for (let z = z0; z < z0 + CS; z++) for (let x = x0; x < x0 + CS; x++) {
      const i = x + z * SX + y * SX * SZ, t = T[i];
      if (!t) continue;
      const b = BLOCKS[t];
      if (!b || b.entity) continue;
      const see = !!b.see;
      const dest = see ? out.glass : out.solid;
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
        const nt = grid.get(nx, ny, nz);
        if (nt) {
          const nb = BLOCKS[nt];
          if (see ? nt === t : (!nb.see && !nb.entity && !nb.ghost)) continue;
        }
        const [pat, rgb] = faceLook(t, Cc[i], f);
        const glow = b.glow ? 1 : 0;
        const base = glow ? 1 : faceShade[F.shade];
        const ao = [0, 0, 0, 0];
        for (let k = 0; k < 4; k++) {
          if (glow || see) { ao[k] = 3; continue; }
          const [du, dv] = CORNER_DIR[k];
          const ax = nx + F.r[0] * du, ay = ny + F.r[1] * du, az = nz + F.r[2] * du;
          const bx = nx + F.u[0] * dv, by = ny + F.u[1] * dv, bz = nz + F.u[2] * dv;
          const s1 = opaqueAt(ax, ay, az), s2 = opaqueAt(bx, by, bz);
          const c = opaqueAt(nx + F.r[0] * du + F.u[0] * dv, ny + F.r[1] * du + F.u[1] * dv, nz + F.r[2] * du + F.u[2] * dv);
          ao[k] = s1 && s2 ? 0 : 3 - (s1 + s2 + c);
        }
        const order = ao[0] + ao[2] < ao[1] + ao[3] ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
        for (const k of order) {
          const c = F.c[k];
          dest.pos.push(x + c[0], y + c[1], z + c[2]);
          const sh = glow ? 255 : Math.round(Math.min(1, base * AO[ao[k]]) * 254);
          dest.att.push(Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255), sh, CORNER_UV[k][0], CORNER_UV[k][1], pat, f);
        }
      }
    }
    for (const kind of ['solid', 'glass']) {
      const o = out[kind];
      if (ch[kind]) { gl.deleteBuffer(ch[kind].pb); gl.deleteBuffer(ch[kind].ab); ch[kind] = null; }
      if (!o.pos.length) continue;
      const pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(o.pos), gl.STATIC_DRAW);
      const ab = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ab); gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(o.att), gl.STATIC_DRAW);
      ch[kind] = { pb, ab, n: o.pos.length / 3 };
    }
    ch.dirty = false;
    if (!ch.solid && !ch.glass) chunks.delete(key);
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
    for (const ch of chunks.values()) for (const k of ['solid', 'glass']) if (ch[k]) { gl.deleteBuffer(ch[k].pb); gl.deleteBuffer(ch[k].ab); }
    chunks.clear(); dirtyKeys.clear();
    grid = g;
    // only chunks with blocks in them
    const has = new Uint8Array(CX * CY * CZ);
    const T = g.t;
    for (let i = 0; i < T.length; i++) if (T[i]) { const x = i % SX, z = Math.floor(i / SX) % SZ, y = Math.floor(i / (SX * SZ)); has[Math.floor(x / CS) + Math.floor(z / CS) * CX + Math.floor(y / CS) * CX * CZ] = 1; }
    for (let k = 0; k < has.length; k++) if (has[k]) buildChunk(k % CX, Math.floor(k / (CX * CZ)), Math.floor(k / CX) % CZ);
  }
  function setSky(id) {
    skyInfo = SKIES[id] || SKIES.day;
    setShade();
    if (grid) for (const ch of [...chunks.values()]) dirtyKeys.add(ch.x + ch.z * CX + ch.y * CX * CZ);
  }

  /* ---------------- frustum ---------------- */
  function planes(m) {
    const p = [];
    const row = (i) => [m[i], m[4 + i], m[8 + i], m[12 + i]];
    const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
    for (const [a, s] of [[r0, 1], [r0, -1], [r1, 1], [r1, -1], [r2, 1], [r2, -1]]) {
      const q = [r3[0] + s * a[0], r3[1] + s * a[1], r3[2] + s * a[2], r3[3] + s * a[3]];
      const l = Math.hypot(q[0], q[1], q[2]); p.push(q.map((v) => v / l));
    }
    return p;
  }
  const boxVisible = (P, x0, y0, z0, s) => {
    const r = s * 0.8660254, cx = x0 + s / 2, cy = y0 + s / 2, cz = z0 + s / 2;
    for (const q of P) if (q[0] * cx + q[1] * cy + q[2] * cz + q[3] < -r) return false;
    return true;
  };

  /* ---------------- drawing ---------------- */
  let W = 1, H = 1, dpr = 1;
  const state = { vp: M4.ident(), view: null, proj: null, eye: [0, 0, 0], faces: 0, drawn: 0 };
  function resize() {
    dpr = Math.min(low ? 1 : 2, window.devicePixelRatio || 1);
    W = canvas.clientWidth || 640; H = canvas.clientHeight || 360;
    const w = Math.max(1, Math.round(W * dpr)), h = Math.max(1, Math.round(H * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
  }

  function drawChunks(kind, P) {
    const prog = voxel;
    gl.useProgram(prog.p);
    gl.uniformMatrix4fv(prog.u.u_vp, false, state.vp);
    gl.uniform3fv(prog.u.u_cam, state.eye);
    gl.uniform2f(prog.u.u_fogr, state.fog[0], state.fog[1]);
    gl.uniform3fv(prog.u.u_fog, hexRGB(skyInfo.fog));
    gl.uniform1f(prog.u.u_time, state.time);
    gl.uniform1f(prog.u.u_alpha, 1);
    gl.enableVertexAttribArray(prog.a.a_pos); gl.enableVertexAttribArray(prog.a.a_col); gl.enableVertexAttribArray(prog.a.a_uvp);
    let list = [...chunks.values()].filter((c) => c[kind] && boxVisible(P, c.x * CS, c.y * CS, c.z * CS, CS));
    if (kind === 'glass') {
      const e = state.eye;
      list.sort((a, b) => Math.hypot(b.x * CS + 8 - e[0], b.y * CS + 8 - e[1], b.z * CS + 8 - e[2]) - Math.hypot(a.x * CS + 8 - e[0], a.y * CS + 8 - e[1], a.z * CS + 8 - e[2]));
    }
    for (const c of list) {
      const m = c[kind];
      gl.bindBuffer(gl.ARRAY_BUFFER, m.pb); gl.vertexAttribPointer(prog.a.a_pos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.ab);
      gl.vertexAttribPointer(prog.a.a_col, 4, gl.UNSIGNED_BYTE, true, 8, 0);
      gl.vertexAttribPointer(prog.a.a_uvp, 4, gl.UNSIGNED_BYTE, false, 8, 4);
      gl.drawArrays(gl.TRIANGLES, 0, m.n);
      state.faces += m.n / 6; state.drawn++;
    }
    gl.disableVertexAttribArray(prog.a.a_col); gl.disableVertexAttribArray(prog.a.a_uvp);
  }

  const tmpM = new Float32Array(16);
  function drawParts(parts, transparent) {
    const prog = model;
    gl.useProgram(prog.p);
    const s = skyInfo.sun, l = Math.hypot(...s);
    gl.uniformMatrix4fv(prog.u.u_vp, false, state.vp);
    gl.uniform3fv(prog.u.u_cam, state.eye);
    gl.uniform2f(prog.u.u_fogr, state.fog[0], state.fog[1]);
    gl.uniform3fv(prog.u.u_fog, hexRGB(skyInfo.fog));
    gl.uniform3f(prog.u.u_sun, s[0] / l, s[1] / l, s[2] / l);
    gl.uniform1f(prog.u.u_amb, skyInfo.amb + 0.08);
    gl.uniform1f(prog.u.u_light, skyInfo.light);
    gl.enableVertexAttribArray(prog.a.a_pos); gl.enableVertexAttribArray(prog.a.a_nrm);
    let bound = null;
    for (const p of parts) {
      if (!!transparent !== (p.alpha != null && p.alpha < 1)) continue;
      const pr = prims[p.prim || 'cube'];
      if (bound !== pr) {
        gl.bindBuffer(gl.ARRAY_BUFFER, pr.b);
        gl.vertexAttribPointer(prog.a.a_pos, 3, gl.FLOAT, false, 24, 0);
        gl.vertexAttribPointer(prog.a.a_nrm, 3, gl.FLOAT, false, 24, 12);
        bound = pr;
      }
      gl.uniformMatrix4fv(prog.u.u_model, false, p.m || tmpM);
      gl.uniform3fv(prog.u.u_color, p.color || [1, 1, 1]);
      gl.uniform1f(prog.u.u_glow, p.glow || 0);
      gl.uniform1f(prog.u.u_alpha, p.alpha == null ? 1 : p.alpha);
      gl.uniform1f(prog.u.u_shadow, p.prim === 'shadow' ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, pr.n);
    }
    gl.disableVertexAttribArray(prog.a.a_nrm);
  }

  function drawLines(points, color) {
    if (!points.length) return;
    gl.useProgram(line.p);
    gl.uniformMatrix4fv(line.u.u_vp, false, state.vp);
    gl.uniform4fv(line.u.u_color, color);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(line.a.a_pos);
    gl.vertexAttribPointer(line.a.a_pos, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINES, 0, points.length / 3);
  }

  // scene: { eye:[x,y,z], target:[x,y,z], fov, time, parts:[...], lines:[{pts, color}], fogFar }
  function frame(scene) {
    resize();
    state.time = scene.time || 0;
    state.eye = scene.eye;
    const far = scene.far || 260;
    state.fog = [far * 0.45, far * 0.95];
    state.proj = M4.persp(scene.fov || 1.2, W / H, 0.08, far);
    state.view = M4.lookAt(scene.eye, scene.target);
    state.vp = M4.mul(state.proj, state.view);
    state.faces = 0; state.drawn = 0;
    // rebuild a few changed chunks each frame
    let budget = scene.rebuild || 6;
    for (const k of dirtyKeys) {
      if (budget-- <= 0) break;
      dirtyKeys.delete(k);
      if (grid) buildChunk(k % CX, Math.floor(k / (CX * CZ)), Math.floor(k / CX) % CZ);
    }
    // sky
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.useProgram(sky.p);
    const rot = new Float32Array(state.view); rot[12] = rot[13] = rot[14] = 0;
    gl.uniformMatrix4fv(sky.u.u_inv, false, M4.invert(M4.mul(state.proj, rot)));
    gl.uniform3fv(sky.u.u_top, hexRGB(skyInfo.top)); gl.uniform3fv(sky.u.u_bottom, hexRGB(skyInfo.bottom));
    gl.uniform1f(sky.u.u_stars, skyInfo === SKIES.night || skyInfo === SKIES.space ? 1 : 0);
    gl.uniform3fv(sky.u.u_sun, skyInfo.sun);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
    gl.enableVertexAttribArray(sky.a.a_pos);
    gl.vertexAttribPointer(sky.a.a_pos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(sky.a.a_pos);

    const P = planes(state.vp);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    if (grid) drawChunks('solid', P);
    gl.disable(gl.CULL_FACE);
    const parts = scene.parts || [];
    drawParts(parts, false);
    // see-through things last
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const l of scene.lines || []) drawLines(l.pts, l.color);
    gl.depthMask(false);
    drawParts(parts, true);
    if (grid) drawChunks('glass', P);
    gl.depthMask(true); gl.disable(gl.BLEND);
  }

  // world position -> screen pixels (for name tags). null when behind the camera.
  function project(x, y, z) {
    const m = state.vp;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0.05) return null;
    return { x: (cx / cw * 0.5 + 0.5) * W, y: (1 - (cy / cw * 0.5 + 0.5)) * H, d: cw };
  }
  // screen pixels -> a ray into the world (for building)
  function ray(sx, sy) {
    const inv = M4.invert(state.vp);
    const nx = sx / W * 2 - 1, ny = 1 - sy / H * 2;
    const un = (x, y, z) => { const w = inv[3] * x + inv[7] * y + inv[11] * z + inv[15]; return [(inv[0] * x + inv[4] * y + inv[8] * z + inv[12]) / w, (inv[1] * x + inv[5] * y + inv[9] * z + inv[13]) / w, (inv[2] * x + inv[6] * y + inv[10] * z + inv[14]) / w]; };
    const a = un(nx, ny, -1), b = un(nx, ny, 1);
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d);
    return { o: a, d: d.map((v) => v / l) };
  }

  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  return {
    gl, setGrid, setSky, markDirty, frame, project, ray, resize,
    get lost() { return lost; },
    get stats() { return { faces: state.faces, chunks: chunks.size, drawn: state.drawn }; },
    get size() { return { w: W, h: H }; },
    destroy() {
      for (const ch of chunks.values()) for (const k of ['solid', 'glass']) if (ch[k]) { gl.deleteBuffer(ch[k].pb); gl.deleteBuffer(ch[k].ab); }
      chunks.clear();
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    },
  };
}

// Voxel ray cast: first solid-ish block along a ray. Returns { x, y, z, nx, ny, nz, t } or null.
export function raycast(grid, o, d, maxDist = 60, hit = (t) => t !== 0) {
  let x = Math.floor(o[0]), y = Math.floor(o[1]), z = Math.floor(o[2]);
  const sx = Math.sign(d[0]), sy = Math.sign(d[1]), sz = Math.sign(d[2]);
  const tdx = sx ? Math.abs(1 / d[0]) : Infinity, tdy = sy ? Math.abs(1 / d[1]) : Infinity, tdz = sz ? Math.abs(1 / d[2]) : Infinity;
  let tx = sx ? ((sx > 0 ? x + 1 - o[0] : o[0] - x) * tdx) : Infinity;
  let ty = sy ? ((sy > 0 ? y + 1 - o[1] : o[1] - y) * tdy) : Infinity;
  let tz = sz ? ((sz > 0 ? z + 1 - o[2] : o[2] - z) * tdz) : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let i = 0; i < 600 && t <= maxDist; i++) {
    if (grid.inside(x, y, z) && hit(grid.get(x, y, z))) return { x, y, z, nx, ny, nz, t };
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
  return null;
}
