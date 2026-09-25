// 3D beta levels. Blocks are [x, y, z, type]. Forward is -z.
import { B } from './engine3d.js';

function builder() {
  const blocks = [];
  const add = (x, y, z, t) => blocks.push([x, y, z, t]);
  const plat = (x0, y, z0, x1, z1, t) => { for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) add(x, y, z, t); };
  return { blocks, add, plat };
}

export function skyObby() {
  const { blocks, add, plat } = builder();
  plat(-2, 0, -2, 2, 2, B.grass);
  add(0, 0, -5, B.stone); add(0, 0, -8, B.stone); add(1, 0, -11, B.stone);
  add(1, 1, -14, B.wood); add(0, 2, -16, B.wood);
  plat(-1, 2, -21, 1, -19, B.grass); add(0, 2, -20, B.check);
  plat(-1, 2, -31, 1, -22, B.lava);
  add(0, 3, -24, B.stone); add(1, 3, -27, B.stone); add(0, 3, -30, B.stone);
  plat(-1, 3, -35, 1, -32, B.grass); add(0, 3, -34, B.check);
  add(0, 3, -38, B.bounce);
  plat(-1, 6, -44, 1, -42, B.stone);
  plat(0, 6, -50, 0, -46, B.wood);
  add(1, 7, -53, B.brick); add(-1, 8, -55, B.brick); add(1, 9, -57, B.brick);
  plat(-1, 9, -62, 1, -60, B.stone); add(0, 9, -61, B.goal);
  // pillars under the big platforms, for looks
  for (const [x, z, top] of [[0, 0, -1], [0, -20, 1], [0, -34, 2], [0, -43, 5], [0, -61, 8]]) for (let y = -8; y <= top; y++) add(x, y, z, B.stone);
  return { id: 'sky', n: 'Sky Obby', blurb: 'Hop across blocks, dodge lava, bounce to the top.', spawn: [0.5, 1, 0.5], blocks };
}

export function randomObby(seed = Date.now()) {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const { blocks, add, plat } = builder();
  plat(-2, 0, -2, 2, 2, B.grass);
  let x = 0, y = 0, z = -2; // z = front edge of the last platform
  const kinds = [B.stone, B.wood, B.brick, B.grass];
  for (let i = 1; i <= 26; i++) {
    const cp = i % 8 === 0;
    let dy = cp ? 0 : pick([-1, 0, 0, 1, 1]);
    if (y + dy < 0 || y + dy > 24) dy = 0;
    const gap = dy > 0 ? int(1, 2) : int(1, 3);
    const size = cp ? 3 : int(1, 3);
    const dx = gap === 3 ? int(-1, 1) : int(-2, 2);
    const nx = x + dx, ny = y + dy, nz = z - gap - size;
    const half = Math.floor(size / 2);
    if (cp) {
      plat(nx - 1, ny, nz, nx + 1, nz + 2, B.stone); add(nx, ny, nz + 1, B.check);
    } else if (rnd() < 0.12 && i < 25) {
      // bounce pad up to a higher ledge
      add(nx, ny, z - gap - 1, B.bounce);
      const hz = z - gap - 1 - 3;
      plat(nx - 1, ny + 3, hz - 2, nx + 1, hz, pick(kinds));
      x = nx; y = ny + 3; z = hz - 2;
      continue;
    } else if (size === 3 && rnd() < 0.3) {
      // a strip with lava in the middle: jump over it
      plat(nx - half, ny, nz, nx - half + 2, nz, pick(kinds));
      plat(nx - half, ny, nz + 1, nx - half + 2, nz + 1, B.lava);
      plat(nx - half, ny, nz + 2, nx - half + 2, nz + 2, pick(kinds));
    } else {
      plat(nx - half, ny, nz, nx - half + size - 1, nz + size - 1, pick(kinds));
    }
    x = nx; y = ny; z = nz;
  }
  const gz = z - 3;
  plat(x - 1, y, gz - 2, x + 1, gz, B.stone); add(x, y, gz - 1, B.goal);
  return { id: 'random', n: 'Random Obby', blurb: 'A new obby every time you press the button.', spawn: [0.5, 1, 0.5], blocks };
}
