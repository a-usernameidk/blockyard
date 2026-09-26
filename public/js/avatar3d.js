// Pip in 3D: a chunky little block buddy built from boxes, plus every hat in the closet.
import { M4, hexRGB } from './gl.js';

const INK = hexRGB('#1d2340'), WHITE = [1, 1, 1];
const shade = (c, k) => c.map((v) => Math.max(0, Math.min(1, v * k)));
export const EMOTES = ['wave', 'dance', 'cheer', 'sit', 'point'];

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

  const base = M4.trs(st.x, st.y, st.z, (st.yaw || 0) + spin);
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
  // antenna, hidden under hats
  const top = by + 0.41;
  if (hat === 'none') {
    box(0, top + 0.12, 0, 0.05, 0.24, 0.05, INK);
    at(0, top + 0.28, 0, 0.16, 0.16, 0.16, hexRGB('#ffd23f'), 'sphere');
  } else hatParts(hat, top, t, at);
  return out;
}

function hatParts(hat, y, t, at) {
  const C = (h) => hexRGB(h);
  switch (hat) {
    case 'cap':
      at(0, y + 0.08, 0, 0.8, 0.18, 0.76, C('#3a86ff'), 'cyl');
      at(0, y + 0.02, 0.42, 0.56, 0.04, 0.3, C('#2a64c8'));
      at(0, y + 0.19, 0, 0.1, 0.06, 0.1, WHITE, 'sphere');
      break;
    case 'bow':
      at(-0.3, y + 0.06, 0.1, 0.24, 0.2, 0.08, C('#ff5d8f'), 'cube', 0, 0, 0.5);
      at(-0.06, y + 0.06, 0.1, 0.24, 0.2, 0.08, C('#ff5d8f'), 'cube', 0, 0, -0.5);
      at(-0.18, y + 0.06, 0.12, 0.1, 0.1, 0.1, C('#ffd23f'));
      break;
    case 'sprout':
      at(0, y + 0.12, 0, 0.05, 0.24, 0.05, C('#2a8a45'));
      at(-0.1, y + 0.26, 0, 0.22, 0.05, 0.12, C('#5fd07c'), 'cube', 0, 0, 0.5 + Math.sin(t * 3) * 0.1);
      at(0.1, y + 0.26, 0, 0.22, 0.05, 0.12, C('#5fd07c'), 'cube', 0, 0, -0.5 - Math.sin(t * 3) * 0.1);
      break;
    case 'party':
      [[0.56, 0.1], [0.42, 0.22], [0.28, 0.34], [0.14, 0.46]].forEach(([r, h], i) => at(0, y + h - 0.05, 0, r, 0.13, r, C(i % 2 ? '#ffd23f' : '#b06cff'), 'cyl'));
      at(0, y + 0.56, 0, 0.14, 0.14, 0.14, C('#ff5d8f'), 'sphere');
      break;
    case 'beanie':
      at(0, y + 0.1, 0, 0.84, 0.26, 0.8, C('#e63946'), 'cyl');
      at(0, y + 0.02, 0, 0.9, 0.1, 0.86, C('#f4f4f4'), 'cyl');
      at(0, y + 0.3, 0, 0.18, 0.18, 0.18, C('#f4f4f4'), 'sphere');
      break;
    case 'headphones':
      at(0, y + 0.08, 0, 0.9, 0.06, 0.1, C('#3d405b'));
      at(-0.46, y - 0.08, 0, 0.06, 0.34, 0.1, C('#3d405b'));
      at(0.46, y - 0.08, 0, 0.06, 0.34, 0.1, C('#3d405b'));
      at(-0.49, y - 0.25, 0, 0.12, 0.26, 0.26, C('#ff5d8f'), 'cyl', 0, 0, Math.PI / 2);
      at(0.49, y - 0.25, 0, 0.12, 0.26, 0.26, C('#ff5d8f'), 'cyl', 0, 0, Math.PI / 2);
      break;
    case 'horns':
      at(-0.26, y + 0.1, 0.05, 0.1, 0.24, 0.1, C('#e63946'), 'cube', 0, 0, 0.4);
      at(0.26, y + 0.1, 0.05, 0.1, 0.24, 0.1, C('#e63946'), 'cube', 0, 0, -0.4);
      break;
    case 'tophat':
      at(0, y + 0.02, 0, 0.92, 0.05, 0.88, C('#1d2340'), 'cyl');
      at(0, y + 0.25, 0, 0.56, 0.42, 0.56, C('#1d2340'), 'cyl');
      at(0, y + 0.1, 0, 0.58, 0.08, 0.58, C('#e63946'), 'cyl');
      break;
    case 'propeller':
      at(0, y + 0.07, 0, 0.78, 0.16, 0.74, C('#ffd23f'), 'cyl');
      at(0, y + 0.2, 0, 0.05, 0.14, 0.05, C('#3a86ff'));
      at(0, y + 0.28, 0, 0.8, 0.03, 0.1, C('#ff5d8f'), 'cube', t * 14);
      break;
    case 'crown':
      at(0, y + 0.06, 0, 0.66, 0.14, 0.66, C('#ffd23f'), 'cyl', 0, 0, 0, { glow: 0.2 });
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; at(Math.cos(a) * 0.28, y + 0.19, Math.sin(a) * 0.28, 0.1, 0.16, 0.1, C('#ffd23f'), 'cube', -a, 0, 0, { glow: 0.2 }); }
      at(0, y + 0.07, 0.33, 0.08, 0.08, 0.04, C('#3a86ff'));
      break;
    case 'halo': {
      const hy = y + 0.36 + Math.sin(t * 3) * 0.04;
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; at(Math.cos(a) * 0.3, hy, Math.sin(a) * 0.3, 0.13, 0.04, 0.08, C('#ffe66d'), 'cube', -a, 0, 0, { glow: 1 }); }
      break;
    }
    case 'wizard':
      [[0.9, 0.04, '#5a3fd6'], [0.6, 0.18, '#5a3fd6'], [0.44, 0.34, '#6b4fe6'], [0.3, 0.5, '#5a3fd6'], [0.16, 0.64, '#6b4fe6']].forEach(([r, h, c], i) => at(i * -0.02, y + h, i * -0.03, r, i ? 0.17 : 0.06, r, C(c), 'cyl'));
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
      at(0, y + 0.02, 0, 1.2, 0.05, 1.1, C('#a0612b'), 'cyl');
      at(0, y + 0.2, 0, 0.6, 0.34, 0.56, C('#b8733a'), 'cyl');
      at(0, y + 0.1, 0, 0.62, 0.07, 0.58, C('#5a3418'), 'cyl');
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
};
