// Pip in 3D: a chunky little block buddy built from boxes, plus every hat in the closet.
import { M4, hexRGB } from './gl.js';
import { variant } from './cosmetics.js';

const INK = hexRGB('#1d2340'), WHITE = [1, 1, 1];
const shade = (c, k) => c.map((v) => Math.max(0, Math.min(1, v * k)));
export const EMOTES = ['wave', 'dance', 'cheer', 'sit', 'point', 'flip', 'spin'];

// st: { x, y, z, yaw, walk (phase), move (0..1), air, emote, et (seconds into emote), t (clock), look {color, hat} }
export function avatarParts(st, out = []) {
  const col = hexRGB(st.look && st.look.color || '#ff6b35');
  const hat = (st.look && st.look.hat) || 'none';
  const t = st.t || 0, mv = st.move || 0, ph = st.walk || 0, em = st.emote, et = st.et || 0;
  let bob = mv * Math.abs(Math.sin(ph)) * 0.05, lean = mv * 0.08, spin = 0, sit = 0;
  let armL = -Math.sin(ph) * 0.8 * mv, armR = Math.sin(ph) * 0.8 * mv, armLz = 0, armRz = 0;
  let footL = Math.sin(ph) * 0.17 * mv, footR = -Math.sin(ph) * 0.17 * mv;
  const liftL = Math.max(0, Math.cos(ph)) * 0.07 * mv, liftR = Math.max(0, -Math.cos(ph)) * 0.07 * mv;
  if (st.air) { armL = armR = -2.4; armLz = 0.3; armRz = -0.3; footL = 0.08; footR = -0.08; lean = 0; }
  if (em === 'wave') { armR = -2.9; armRz = -0.3 - Math.sin(et * 12) * 0.35; }
  else if (em === 'point') { armR = -1.55; }
  else if (em === 'cheer') { armL = armR = -2.9; armLz = 0.4; armRz = -0.4; bob = Math.abs(Math.sin(et * 7)) * 0.18; }
  else if (em === 'dance') { spin = Math.sin(et * 5) * 0.6; bob = Math.abs(Math.sin(et * 10)) * 0.1; armL = -2.6 * (Math.sin(et * 5) > 0 ? 1 : 0.2); armR = -2.6 * (Math.sin(et * 5) > 0 ? 0.2 : 1); footL = Math.sin(et * 10) * 0.12; footR = -footL; }
  else if (em === 'sit') { sit = 0.28; footL = footR = 0.3; armL = armR = -0.5; }
  let flipX = 0, lift = 0;
  if (em === 'flip') { const k = Math.min(1, et / 0.7); flipX = -k * Math.PI * 2; lift = Math.sin(k * Math.PI) * 1.1; armL = armR = -2.8; }
  else if (em === 'spin') { spin = et * 14; armL = armR = -1.6; armLz = 1.2; armRz = -1.2; }

  const base = flipX ? M4.mul(M4.mul(M4.trs(st.x, st.y + lift + 0.6, st.z, st.yaw || 0), M4.trs(0, 0, 0, 0, flipX, 0)), M4.trs(0, -0.6, 0)) : M4.trs(st.x, st.y, st.z, (st.yaw || 0) + spin);
  const add = (prim, color, local, extra = {}) => { out.push({ prim, color, m: M4.mul(base, local), ...extra }); };
  const box = (x, y, z, sx, sy, sz, color, ry = 0, rx = 0, rz = 0, extra) => add('cube', color, M4.trs(x, y, z, ry, rx, rz, sx, sy, sz), extra);
  const at = (x, y, z, sx, sy, sz, color, prim = 'cube', ry = 0, rx = 0, rz = 0, extra) => add(prim, color, M4.trs(x, y, z, ry, rx, rz, sx, sy, sz), extra);
  // a limb that swings from a pivot at its top
  const limb = (px, py, pz, rx, rz, sx, sy, sz, color) => add('cube', color, M4.mul(M4.trs(px, py, pz, 0, rx, rz), M4.trs(0, -sy / 2, 0, 0, 0, 0, sx, sy, sz)));

  const by = 0.62 + bob - sit;
  // feet
  box(-0.2, 0.09 + liftL, footL, 0.26, 0.18, 0.38, INK);
  box(0.2, 0.09 + liftR, footR, 0.26, 0.18, 0.38, INK);
  // body (the head is the body, like Pip)
  add('cube', col, M4.mul(M4.trs(0, by, 0, 0, lean, 0), M4.trs(0, 0, 0, 0, 0, 0, 0.86, 0.82, 0.78)));
  box(0, by - 0.36, 0, 0.8, 0.1, 0.72, shade(col, 0.82));
  // arms
  limb(-0.47, by + 0.12, 0, armL, armLz, 0.13, 0.36, 0.13, shade(col, 0.9));
  limb(0.47, by + 0.12, 0, armR, armRz, 0.13, 0.36, 0.13, shade(col, 0.9));
  // face
  const blink = (Math.floor(t * 10) % 37 === 0) ? 0.15 : 1;
  for (const s of [-1, 1]) {
    box(s * 0.19, by + 0.1, 0.4, 0.2, 0.26 * blink, 0.03, WHITE);
    box(s * 0.19 + 0.02, by + 0.08, 0.418, 0.1, 0.14 * blink, 0.02, INK);
    box(s * 0.19 + 0.05, by + 0.13, 0.425, 0.04, 0.05 * blink, 0.01, WHITE);
  }
  box(0, by - 0.13, 0.4, em === 'cheer' || st.air ? 0.14 : 0.18, em === 'cheer' || st.air ? 0.1 : 0.04, 0.02, INK);
  box(-0.3, by - 0.06, 0.4, 0.1, 0.05, 0.015, [1, 0.6, 0.7], 0, 0, 0, { alpha: 0.9 });
  box(0.3, by - 0.06, 0.4, 0.1, 0.05, 0.015, [1, 0.6, 0.7], 0, 0, 0, { alpha: 0.9 });
  // gear you can see: a jetpack on your back, coils, boots
  gearParts((st.look && st.look.gear) || 'none', by, t, at, box, !!st.air, liftL, liftR, footL, footR);
  // antenna, hidden under hats
  const top = by + 0.41;
  if (hat === 'none') {
    box(0, top + 0.12, 0, 0.05, 0.24, 0.05, INK);
    at(0, top + 0.28, 0, 0.16, 0.16, 0.16, hexRGB('#ffd23f'), 'sphere');
  } else hatParts(hat, top, t, at);
  return out;
}

function gearParts(gear, by, t, at, box, air, liftL, liftR, footL, footR) {
  const C = (h) => hexRGB(h);
  switch (gear) {
    case 'jetpack': {
      // two tanks on the back, straps, and flames when you're in the air
      for (const s of [-1, 1]) {
        at(s * 0.22, by + 0.1, -0.5, 0.24, 0.72, 0.24, C('#a3abc2'), 'cyl');
        at(s * 0.22, by + 0.5, -0.5, 0.22, 0.1, 0.22, C('#e63946'), 'cyl', 0, 0, 0, { glow: 0.2 });
        at(s * 0.22, by - 0.3, -0.5, 0.14, 0.1, 0.14, C('#3d405b'), 'cyl');
        if (air) {
          const f = 0.75 + Math.sin(t * 40 + s) * 0.25;
          at(s * 0.22, by - 0.46 - 0.12 * f, -0.5, 0.14, 0.28 * f, 0.14, C('#ff9f1c'), 'cube', t * 9, 0, 0, { glow: 1, alpha: 0.9 });
          at(s * 0.22, by - 0.42 - 0.06 * f, -0.5, 0.08, 0.16 * f, 0.08, C('#ffe66d'), 'cube', -t * 9, 0, 0, { glow: 1 });
        }
      }
      at(0, by + 0.02, -0.44, 0.6, 0.4, 0.08, C('#3d405b'));
      // straps over the shoulders and a belt you can see from the front
      for (const s of [-1, 1]) at(s * 0.3, by + 0.42, 0, 0.1, 0.04, 0.84, C('#3d405b'));
      at(0, by - 0.29, 0.4, 0.88, 0.08, 0.03, C('#3d405b'));
      at(0, by - 0.29, 0.42, 0.14, 0.1, 0.02, C('#ffd23f'), 'cube', 0, 0, 0, { glow: 0.3 });
      break;
    }
    case 'speed':
      // glowing coils around the feet
      box(-0.2, 0.1 + liftL, footL, 0.32, 0.06, 0.44, C('#ffd23f'), 0, 0, 0, { glow: 0.6 });
      box(0.2, 0.1 + liftR, footR, 0.32, 0.06, 0.44, C('#ffd23f'), 0, 0, 0, { glow: 0.6 });
      break;
    case 'gravity':
      // a purple ring floating around your middle
      at(0, by - 0.3 + Math.sin(t * 3) * 0.04, 0, 1.08, 0.05, 1.0, C('#b06cff'), 'cyl', t * 2, 0, 0, { glow: 0.7, alpha: 0.85 });
      break;
    case 'boots':
      box(-0.2, 0.13 + liftL, footL, 0.3, 0.12, 0.42, C('#ff5d8f'));
      box(0.2, 0.13 + liftR, footR, 0.3, 0.12, 0.42, C('#ff5d8f'));
      break;
    case 'turbo':
      box(-0.2, 0.12 + liftL, footL, 0.32, 0.14, 0.46, C('#ff9f1c'));
      box(0.2, 0.12 + liftR, footR, 0.32, 0.14, 0.46, C('#ff9f1c'));
      box(-0.2, 0.2 + liftL, footL - 0.18, 0.2, 0.04, 0.08, C('#ffd23f'), 0, 0, 0, { glow: 0.8 });
      box(0.2, 0.2 + liftR, footR - 0.18, 0.2, 0.04, 0.08, C('#ffd23f'), 0, 0, 0, { glow: 0.8 });
      break;
    case 'moon':
      box(-0.2, 0.14 + liftL, footL, 0.34, 0.2, 0.44, C('#c0c7d1'));
      box(0.2, 0.14 + liftR, footR, 0.34, 0.2, 0.44, C('#c0c7d1'));
      at(0.55, by + 0.55 + Math.sin(t * 2) * 0.06, -0.2, 0.18, 0.18, 0.18, C('#ffe66d'), 'sphere', 0, 0, 0, { glow: 0.8 });
      break;
    case 'spring':
      for (const [x, l, f] of [[-0.2, liftL, footL], [0.2, liftR, footR]]) {
        box(x, 0.2 + l, f, 0.28, 0.08, 0.4, C('#44c06a'));
        for (let k = 0; k < 3; k++) box(x, 0.04 + k * 0.05 + l, f, 0.2, 0.025, 0.2, C('#a3abc2'));
      }
      break;
    case 'feather':
      for (const s of [-1, 1]) at(s * 0.25, by + 0.05, -0.46, 0.34, 0.6, 0.04, C('#f4f4f4'), 'cube', 0, 0.25, s * (0.35 + (air ? Math.sin(t * 12) * 0.25 : 0.05)));
      break;
    case 'rocket':
      at(0, by + 0.1, -0.52, 0.34, 0.8, 0.34, C('#f4f4f4'), 'cyl');
      at(0, by + 0.56, -0.52, 0.2, 0.18, 0.2, C('#e63946'), 'sphere');
      at(0, by + 0.15, -0.36, 0.14, 0.14, 0.03, C('#3a86ff'), 'sphere');
      for (const s of [-1, 1]) at(s * 0.2, by - 0.22, -0.52, 0.16, 0.2, 0.04, C('#e63946'));
      if (air) {
        const f = 0.75 + Math.sin(t * 45) * 0.25;
        at(0, by - 0.42 - 0.18 * f, -0.52, 0.22, 0.4 * f, 0.22, C('#ff9f1c'), 'cube', t * 9, 0, 0, { glow: 1, alpha: 0.9 });
        at(0, by - 0.36 - 0.08 * f, -0.52, 0.12, 0.22 * f, 0.12, C('#ffe66d'), 'cube', -t * 9, 0, 0, { glow: 1 });
      }
      break;
  }
}

function hatParts(hat, y, t, at) {
  const C = (h) => hexRGB(h);
  const [base, c1, c2] = variant(hat); hat = base; // recolored hats are built like their base hat
  switch (hat) {
    case 'cap':
      at(0, y + 0.08, 0, 0.8, 0.18, 0.76, C(c1 || '#3a86ff'), 'cyl');
      at(0, y + 0.02, 0.42, 0.56, 0.04, 0.3, C(c2 || '#2a64c8'));
      at(0, y + 0.19, 0, 0.1, 0.06, 0.1, WHITE, 'sphere');
      break;
    case 'bow':
      at(-0.3, y + 0.06, 0.1, 0.24, 0.2, 0.08, C(c1 || '#ff5d8f'), 'cube', 0, 0, 0.5);
      at(-0.06, y + 0.06, 0.1, 0.24, 0.2, 0.08, C(c1 || '#ff5d8f'), 'cube', 0, 0, -0.5);
      at(-0.18, y + 0.06, 0.12, 0.1, 0.1, 0.1, C('#ffd23f'));
      break;
    case 'sprout':
      at(0, y + 0.12, 0, 0.05, 0.24, 0.05, C('#2a8a45'));
      at(-0.1, y + 0.26, 0, 0.22, 0.05, 0.12, C('#5fd07c'), 'cube', 0, 0, 0.5 + Math.sin(t * 3) * 0.1);
      at(0.1, y + 0.26, 0, 0.22, 0.05, 0.12, C('#5fd07c'), 'cube', 0, 0, -0.5 - Math.sin(t * 3) * 0.1);
      break;
    case 'party':
      [[0.56, 0.1], [0.42, 0.22], [0.28, 0.34], [0.14, 0.46]].forEach(([r, h], i) => at(0, y + h - 0.05, 0, r, 0.13, r, C(i % 2 ? (c2 || '#ffd23f') : (c1 || '#b06cff')), 'cyl'));
      at(0, y + 0.56, 0, 0.14, 0.14, 0.14, C('#ff5d8f'), 'sphere');
      break;
    case 'beanie':
      at(0, y + 0.1, 0, 0.84, 0.26, 0.8, C(c1 || '#e63946'), 'cyl');
      at(0, y + 0.02, 0, 0.9, 0.1, 0.86, C('#f4f4f4'), 'cyl');
      at(0, y + 0.3, 0, 0.18, 0.18, 0.18, C('#f4f4f4'), 'sphere');
      break;
    case 'headphones':
      at(0, y + 0.08, 0, 0.9, 0.06, 0.1, C('#3d405b'));
      at(-0.46, y - 0.08, 0, 0.06, 0.34, 0.1, C('#3d405b'));
      at(0.46, y - 0.08, 0, 0.06, 0.34, 0.1, C('#3d405b'));
      at(-0.49, y - 0.25, 0, 0.12, 0.26, 0.26, C(c1 || '#ff5d8f'), 'cyl', 0, 0, Math.PI / 2);
      at(0.49, y - 0.25, 0, 0.12, 0.26, 0.26, C(c1 || '#ff5d8f'), 'cyl', 0, 0, Math.PI / 2);
      break;
    case 'horns':
      at(-0.26, y + 0.1, 0.05, 0.1, 0.24, 0.1, C(c1 || '#e63946'), 'cube', 0, 0, 0.4);
      at(0.26, y + 0.1, 0.05, 0.1, 0.24, 0.1, C(c1 || '#e63946'), 'cube', 0, 0, -0.4);
      break;
    case 'tophat':
      at(0, y + 0.02, 0, 0.92, 0.05, 0.88, C(c1 || '#1d2340'), 'cyl');
      at(0, y + 0.25, 0, 0.56, 0.42, 0.56, C(c1 || '#1d2340'), 'cyl');
      at(0, y + 0.1, 0, 0.58, 0.08, 0.58, C(c2 || '#e63946'), 'cyl');
      break;
    case 'propeller':
      at(0, y + 0.07, 0, 0.78, 0.16, 0.74, C('#ffd23f'), 'cyl');
      at(0, y + 0.2, 0, 0.05, 0.14, 0.05, C('#3a86ff'));
      at(0, y + 0.28, 0, 0.8, 0.03, 0.1, C('#ff5d8f'), 'cube', t * 14);
      break;
    case 'crown':
      at(0, y + 0.06, 0, 0.66, 0.14, 0.66, C(c1 || '#ffd23f'), 'cyl', 0, 0, 0, { glow: 0.2 });
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; at(Math.cos(a) * 0.28, y + 0.19, Math.sin(a) * 0.28, 0.1, 0.16, 0.1, C(c1 || '#ffd23f'), 'cube', -a, 0, 0, { glow: 0.2 }); }
      at(0, y + 0.07, 0.33, 0.08, 0.08, 0.04, C('#3a86ff'));
      break;
    case 'halo': {
      const hy = y + 0.36 + Math.sin(t * 3) * 0.04;
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; at(Math.cos(a) * 0.3, hy, Math.sin(a) * 0.3, 0.13, 0.04, 0.08, C('#ffe66d'), 'cube', -a, 0, 0, { glow: 1 }); }
      break;
    }
    case 'wizard':
      [[0.9, 0.04, c1 || '#5a3fd6'], [0.6, 0.18, c1 || '#5a3fd6'], [0.44, 0.34, c1 || '#6b4fe6'], [0.3, 0.5, c1 || '#5a3fd6'], [0.16, 0.64, c1 || '#6b4fe6']].forEach(([r, h, c], i) => at(i * -0.02, y + h, i * -0.03, r, i ? 0.17 : 0.06, r, C(c), 'cyl'));
      at(0.12, y + 0.26, 0.2, 0.07, 0.07, 0.07, C('#ffd23f'), 'cube', t, t, 0, { glow: 0.6 });
      at(-0.14, y + 0.44, 0.1, 0.06, 0.06, 0.06, C('#ffd23f'), 'cube', -t, t, 0, { glow: 0.6 });
      break;
    case 'viking':
      at(0, y + 0.02, 0, 0.88, 0.5, 0.84, C('#a3abc2'), 'sphere');
      at(0, y - 0.02, 0, 0.9, 0.1, 0.86, C('#c98b4f'), 'cyl');
      at(-0.44, y + 0.16, 0, 0.1, 0.36, 0.1, C('#f4f0e0'), 'cyl', 0, 0, 0.7);
      at(0.44, y + 0.16, 0, 0.1, 0.36, 0.1, C('#f4f0e0'), 'cyl', 0, 0, -0.7);
      break;
    case 'chef':
      at(0, y + 0.18, 0, 0.56, 0.36, 0.56, WHITE, 'cyl');
      at(0, y + 0.42, 0, 0.8, 0.34, 0.8, WHITE, 'sphere');
      break;
    case 'bunny':
      for (const d of [-1, 1]) {
        at(d * 0.2, y + 0.3, 0, 0.18, 0.62, 0.1, WHITE, 'sphere', 0, 0, d * -0.15 + Math.sin(t * 2 + d) * 0.06);
        at(d * 0.2, y + 0.3, 0.04, 0.09, 0.44, 0.04, C('#ffb3c7'), 'sphere', 0, 0, d * -0.15 + Math.sin(t * 2 + d) * 0.06);
      }
      break;
    case 'cowboy':
      at(0, y + 0.02, 0, 1.2, 0.05, 1.1, C(c2 || '#a0612b'), 'cyl');
      at(0, y + 0.2, 0, 0.6, 0.34, 0.56, C(c1 || '#b8733a'), 'cyl');
      at(0, y + 0.1, 0, 0.62, 0.07, 0.58, C('#5a3418'), 'cyl');
      break;
    case 'pirate':
      at(0, y + 0.1, 0, 1.1, 0.22, 0.7, C('#1d2340'), 'cyl');
      at(0, y + 0.22, 0.02, 0.9, 0.18, 0.12, C('#1d2340'));
      at(0, y + 0.18, 0.36, 0.12, 0.12, 0.03, WHITE, 'sphere');
      at(0, y + 0.02, 0, 1.12, 0.04, 0.72, C('#ffd23f'), 'cyl');
      break;
    case 'antlers':
      for (const d of [-1, 1]) {
        at(d * 0.24, y + 0.2, 0, 0.07, 0.4, 0.07, C('#8d5a2b'), 'cube', 0, 0, d * -0.4);
        at(d * 0.42, y + 0.32, 0, 0.06, 0.26, 0.06, C('#8d5a2b'), 'cube', 0, 0, d * -1.1);
        at(d * 0.3, y + 0.42, 0, 0.06, 0.24, 0.06, C('#8d5a2b'), 'cube', 0, 0, d * 0.2);
      }
      break;
    case 'catears':
      for (const d of [-1, 1]) {
        at(d * 0.26, y + 0.1, 0.02, 0.22, 0.26, 0.08, C('#3d405b'), 'cube', 0, 0, d * -0.3);
        at(d * 0.26, y + 0.09, 0.07, 0.12, 0.16, 0.02, C('#ff9ec4'), 'cube', 0, 0, d * -0.3);
      }
      break;
    case 'santa':
      at(0, y + 0.02, 0, 0.9, 0.12, 0.86, WHITE, 'cyl');
      at(0, y + 0.2, 0, 0.7, 0.28, 0.66, C('#e63946'), 'cyl');
      at(0.12, y + 0.4, -0.05, 0.4, 0.22, 0.4, C('#e63946'), 'cyl', 0, 0, -0.5);
      at(0.3, y + 0.46, -0.08, 0.16, 0.16, 0.16, WHITE, 'sphere');
      break;
    case 'grad':
      at(0, y + 0.08, 0, 0.6, 0.18, 0.6, C('#1d2340'), 'cyl');
      at(0, y + 0.2, 0, 0.9, 0.04, 0.9, C('#1d2340'), 'cube', Math.PI / 4);
      at(0.3, y + 0.08, 0.3, 0.03, 0.24, 0.03, C('#ffd23f'));
      break;
    case 'astronaut':
      at(0, y - 0.36, 0, 1.18, 1.1, 1.14, C('#bfe6ff'), 'sphere', 0, 0, 0, { alpha: 0.3 });
      at(0, y - 0.8, 0, 0.98, 0.1, 0.92, C('#f4f4f4'), 'cyl');
      break;
    case 'unicorn':
      [[0.2, 0.1], [0.15, 0.24], [0.1, 0.38], [0.05, 0.5]].forEach(([r, h], i) => at(0, y + h, 0.18, r, 0.14, r, C(i % 2 ? '#ffd23f' : '#ffffff'), 'cyl', 0, 0, 0, { glow: 0.3 }));
      at(-0.3, y + 0.02, -0.1, 0.16, 0.14, 0.1, C('#b06cff'), 'sphere');
      at(-0.22, y + 0.06, -0.26, 0.14, 0.12, 0.1, C('#ff5d8f'), 'sphere');
      break;
  }
}

// A bit of a player's trail: small spinning cubes that fade out.
export const TRAIL3D = {
  sparkle: ['#ffffff', '#ffd23f'], bubbles: ['#bfefff', '#7cc8ff'], hearts: ['#ff5d8f', '#ff8fb1'], notes: ['#1d2340', '#3d405b'],
  fire: ['#ff5a1f', '#ffb02e', '#ffd23f'], rainbow: ['#ff5d8f', '#ff9f1c', '#ffd23f', '#44c06a', '#3a86ff', '#b06cff'], stars: ['#ffd23f', '#fff6c9'], lightning: ['#7cc8ff', '#ffffff', '#ffe66d'],
  confetti: ['#ff5d8f', '#ffd23f', '#44c06a', '#3a86ff', '#b06cff'], snow: ['#ffffff', '#dff4ff'], galaxy: ['#5a3fd6', '#b06cff', '#ffffff', '#7cc8ff'],
  leaves: ['#44c06a', '#2a8a45', '#a7e163'], mint: ['#2ec4b6', '#bff5ee'], lava: ['#ff5a1f', '#b5121b', '#ffb02e'], ice: ['#bfe6ff', '#ffffff', '#7cc8ff'],
  candy: ['#ff5d8f', '#ffffff', '#7cc8ff'], ocean: ['#0077b6', '#48cae4', '#caf0f8'], toxic: ['#39ff14', '#9dff7a', '#1d2340'], sakura: ['#ffb7c5', '#ff8fb1', '#fff0f5'],
  shadow: ['#1d2340', '#3d405b'], sunset: ['#ff9f1c', '#ff5d8f', '#b06cff'], goldtrail: ['#ffd23f', '#e0b12a', '#fff6c9'], void: ['#14161f', '#5a3fd6', '#b06cff'],
};

// A pet at (x, y, z) facing yaw. hop: 0..1 how high it's hopping. Built from boxes like Pip.
export function petParts(id, x, y, z, yaw, t, hop, out = []) {
  if (!id || id === 'none') return out;
  const [base0, c1, c2] = variant(id); id = base0; // recolored pets
  const base = M4.trs(x, y + hop * 0.25, z, yaw);
  const at = (px, py, pz, sx, sy, sz, color, prim = 'cube', ry = 0, rx = 0, rz = 0, extra) => out.push({ prim, color: typeof color === 'string' ? hexRGB(color) : color, m: M4.mul(base, M4.trs(px, py, pz, ry, rx, rz, sx, sy, sz)), ...extra });
  const eyes = (py, pz, gap = 0.08) => { for (const s of [-1, 1]) at(s * gap, py, pz, 0.06, 0.08, 0.02, INK); };
  if (id === 'slime') {
    const sq = 1 + Math.sin(t * 6) * 0.08;
    at(0, 0.2 / sq + (c1 === '#f4f4f4' ? 0.3 + Math.sin(t * 2) * 0.1 : 0), 0, 0.5 * sq, 0.4 / sq, 0.5 * sq, c1 || '#7be07b', 'cube', 0, 0, 0, { alpha: c1 === '#f4f4f4' ? 0.6 : 0.85, glow: c1 === '#ffd23f' ? 0.4 : 0 });
    eyes(0.24, 0.26);
  } else if (id === 'chick') {
    at(0, 0.22, 0, 0.4, 0.4, 0.4, '#ffd23f', 'sphere');
    at(0, 0.24, 0.22, 0.1, 0.06, 0.12, '#ff9f1c');
    for (const s of [-1, 1]) at(s * 0.2, 0.2, -0.02, 0.06, 0.16, 0.2, '#f0b800', 'cube', 0, 0, s * Math.sin(t * 12) * 0.4);
    eyes(0.3, 0.19, 0.08);
  } else if (id === 'pup' || id === 'kitty') {
    const c = c1 || (id === 'pup' ? '#c98b4f' : '#a3abc2'), d = c2 || (id === 'pup' ? '#8d5a2b' : '#6b7391');
    at(0, 0.22, -0.05, 0.34, 0.26, 0.5, c);
    at(0, 0.4, 0.25, 0.32, 0.3, 0.3, c);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) at(sx * 0.11, 0.06, -0.05 + sz * 0.16, 0.09, 0.14, 0.09, d);
    if (id === 'pup') for (const s of [-1, 1]) at(s * 0.18, 0.38, 0.22, 0.06, 0.2, 0.12, d);
    else for (const s of [-1, 1]) at(s * 0.1, 0.6, 0.23, 0.08, 0.12, 0.05, c, 'cube', 0, 0, s * 0.3);
    at(0, 0.34 + Math.sin(t * 9) * 0.04, -0.34, 0.06, 0.06, 0.22, c, 'cube', Math.sin(t * 9) * 0.5, 0.5);
    eyes(0.44, 0.405, 0.08);
    at(0, 0.36, 0.41, 0.06, 0.05, 0.02, INK);
  } else if (id === 'bee') {
    const fy = 0.5 + Math.sin(t * 4) * 0.08;
    at(0, fy, 0, 0.36, 0.3, 0.4, '#ffd23f', 'sphere');
    at(0, fy, -0.02, 0.37, 0.31, 0.08, INK); at(0, fy, -0.14, 0.33, 0.27, 0.06, INK);
    for (const s of [-1, 1]) at(s * 0.14, fy + 0.2, -0.04, 0.2, 0.03, 0.14, [0.9, 0.95, 1], 'cube', 0, 0, s * (0.5 + Math.sin(t * 30) * 0.4), { alpha: 0.8 });
    eyes(fy + 0.04, 0.19, 0.07);
  } else if (id === 'dragon') {
    const c = '#8a5cf6';
    at(0, 0.28, -0.05, 0.34, 0.3, 0.48, c);
    at(0, 0.5, 0.24, 0.3, 0.28, 0.3, c);
    at(0, 0.7, 0.2, 0.06, 0.12, 0.06, '#ffd23f');
    for (const s of [-1, 1]) at(s * 0.3, 0.46, -0.08, 0.34, 0.03, 0.24, '#ff5d8f', 'cube', 0, 0, s * (0.4 + Math.sin(t * 8) * 0.5));
    at(0, 0.24, -0.38, 0.08, 0.08, 0.3, c, 'cube', Math.sin(t * 5) * 0.4, 0.3);
    eyes(0.54, 0.395, 0.08);
    if (Math.sin(t * 2) > 0.9) at(0, 0.48, 0.55, 0.12, 0.12, 0.12, '#ffb02e', 'cube', t * 5, t * 3, 0, { glow: 1 });
  }
  return out;
}
