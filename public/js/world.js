// 3D worlds: the block list, the saved format, and a fast block grid.
// Shared by the browser (renderer, builder, game) and the server (checking runs, collaborative editing).
import { cleanText, isRude } from './format.js';

export const SX = 128, SY = 64, SZ = 128;
export const MAX_BLOCKS = 24000;
export const MAX_COINS = 200;

// Index = block type number saved in worlds. Never reorder, only add at the end.
// pat: which surface pattern the renderer paints. tint: uses the color picker.
export const BLOCKS = [
  null,
  { id: 'grass', name: 'Grass', pat: 1, color: '#5fc76b', side: '#9a6a3f' },
  { id: 'dirt', name: 'Dirt', pat: 2, color: '#9a6a3f' },
  { id: 'stone', name: 'Stone', pat: 3, color: '#a3abc2' },
  { id: 'wood', name: 'Wood', pat: 4, color: '#c98b4f' },
  { id: 'brick', name: 'Brick', pat: 5, color: '#c9563f' },
  { id: 'sand', name: 'Sand', pat: 6, color: '#f2d58a' },
  { id: 'snow', name: 'Snow', pat: 7, color: '#f4f8ff' },
  { id: 'ice', name: 'Ice', pat: 8, color: '#a8e4ff', slip: true, tip: 'Slippery. Hard to stop on.' },
  { id: 'glass', name: 'Glass', pat: 9, tint: true, see: true, tip: 'See-through, but solid.' },
  { id: 'plastic', name: 'Plastic', pat: 10, tint: true },
  { id: 'neon', name: 'Neon', pat: 11, tint: true, glow: true },
  { id: 'metal', name: 'Metal', pat: 12, color: '#b9c0d2' },
  { id: 'leaves', name: 'Leaves', pat: 13, color: '#3fa34d' },
  { id: 'lava', name: 'Lava', pat: 14, color: '#ff5a1f', glow: true, kill: true, tip: 'Touch it and you respawn.' },
  { id: 'bounce', name: 'Bounce pad', pat: 15, color: '#ff5d8f', tip: 'Land on it to fly way up.' },
  { id: 'speed', name: 'Speed pad', pat: 16, color: '#ffd23f', tip: 'Step on it to run faster for a bit.' },
  { id: 'crumble', name: 'Crumble', pat: 17, color: '#dcb47a', tip: 'Falls away a moment after you step on it, then comes back.' },
  { id: 'checkpoint', name: 'Checkpoint', pat: 18, color: '#44c06a', tip: 'Step on it to respawn here.' },
  { id: 'goal', name: 'Goal', pat: 19, color: '#ffd23f', glow: true, tip: 'Touch it to win (obby worlds).' },
  { id: 'spawn', name: 'Spawn', pat: 20, color: '#7cc8ff', tip: 'Where players start. One per world.' },
  { id: 'coin', name: 'Coin', entity: true, tip: 'Grab it. Each one counts once.' },
  { id: 'ghost', name: 'Ghost block', pat: 22, tint: true, see: true, ghost: true, tip: 'Decoration you can walk through.' },
  // conveyors carry you along (one block for each direction, the arrows show which way)
  { id: 'beltE', name: 'Conveyor →', pat: 32, color: '#4a5378', dir: [1, 0], tip: 'Carries you east (the way the arrows move).' },
  { id: 'beltW', name: 'Conveyor ←', pat: 33, color: '#4a5378', dir: [-1, 0], tip: 'Carries you west (the way the arrows move).' },
  { id: 'beltN', name: 'Conveyor ↑', pat: 34, color: '#4a5378', dir: [0, -1], tip: 'Carries you north (the way the arrows move).' },
  { id: 'beltS', name: 'Conveyor ↓', pat: 35, color: '#4a5378', dir: [0, 1], tip: 'Carries you south (the way the arrows move).' },
  { id: 'teleport', name: 'Teleporter', pat: 36, tint: true, glow: true, tip: 'Step on it to jump to the next teleporter of the same color. Place at least two!' },
  // moving platforms: slide 4 blocks and back every 4 seconds, carrying whoever stands on them
  { id: 'moveX', name: 'Mover ↔', pat: 37, tint: true, mover: 0, tip: 'Moving platform. Slides 4 blocks east and back. Blocks next to each other move together.' },
  { id: 'moveZ', name: 'Mover ↕', pat: 37, tint: true, mover: 2, tip: 'Moving platform. Slides 4 blocks south and back.' },
  { id: 'moveY', name: 'Elevator', pat: 37, tint: true, mover: 1, tip: 'Moving platform. Goes 4 blocks up and back down.' },
];
export const B = Object.fromEntries(BLOCKS.map((b, i) => [b ? b.id : 'air', i]));
BLOCKS.forEach((b, i) => { if (b) b.n = i; });

export const PALETTE = ['#f4f4f4', '#a3abc2', '#4a5378', '#1d2340', '#e63946', '#ff6b35', '#ffd23f', '#5fd07c',
  '#2ec4b6', '#3a86ff', '#b06cff', '#ff5d8f', '#8d5a2b', '#f6d98a', '#7cc8ff', '#1f8a4c'];

export const SKIES = {
  day: { name: 'Sunny day', top: '#4aa8ff', bottom: '#d6efff', fog: '#cfe9ff', sun: [0.45, 0.8, 0.35], light: 1, amb: 0.52 },
  sunset: { name: 'Sunset', top: '#5b4bb7', bottom: '#ffb36b', fog: '#ffc9a0', sun: [-0.6, 0.45, 0.4], light: 0.95, amb: 0.5 },
  night: { name: 'Night', top: '#0b1030', bottom: '#2a3570', fog: '#223066', sun: [0.3, 0.8, -0.4], light: 0.55, amb: 0.42 },
  space: { name: 'Space', top: '#05060f', bottom: '#1b1440', fog: '#120f2e', sun: [0.5, 0.7, 0.2], light: 0.9, amb: 0.45 },
};
export const MODES = { obby: 'Obby (reach the goal)', hangout: 'Hangout (just chill)', race: 'Minigame: Race (needs a Goal)', tag: 'Minigame: Tag', koth: 'Minigame: King of the Hill (Goal blocks are the hill)', lava: 'Minigame: Rising Lava' };
// Minigame worlds are hangouts with a game: the live server runs rounds of it (see games.js).
export const GAME_TYPES = ['race', 'tag', 'koth', 'lava'];

export const solidType = (t) => t !== 0 && !BLOCKS[t].entity && !BLOCKS[t].ghost;

/* ---------------- grid ---------------- */
export const idx = (x, y, z) => x + z * SX + y * SX * SZ;
export class Grid {
  constructor() { this.t = new Uint8Array(SX * SY * SZ); this.c = new Uint8Array(SX * SY * SZ); this.count = 0; this.minY = 0; this.version = 0; }
  lowest() { for (let y = 0; y < SY; y++) { const a = y * SX * SZ; for (let i = a; i < a + SX * SZ; i++) if (this.t[i]) return y; } return 0; }
  inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ; }
  get(x, y, z) { return x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ ? 0 : this.t[x + z * SX + y * SX * SZ]; }
  color(x, y, z) { return this.inside(x, y, z) ? this.c[idx(x, y, z)] : 0; }
  set(x, y, z, t, c = 0) {
    if (!this.inside(x, y, z)) return false;
    const i = idx(x, y, z), was = this.t[i], cc = t && BLOCKS[t] && BLOCKS[t].tint ? c & 15 : 0;
    if (was === t && this.c[i] === cc) return false;
    if (was && !t) this.count--; else if (!was && t) this.count++;
    this.special = null; this.version++;
    this.t[i] = t; this.c[i] = cc;
    return true;
  }
  *each() {
    const { t, c } = this;
    for (let i = 0; i < t.length; i++) if (t[i]) {
      const x = i % SX, z = Math.floor(i / SX) % SZ, y = Math.floor(i / (SX * SZ));
      yield [x, y, z, t[i], c[i]];
    }
  }
}

/* ---------------- saving: 7 characters per run of blocks along x ---------------- */
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VAL = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) VAL[ABC.charCodeAt(i)] = i;

export function encodeBlocks(grid) {
  let out = '';
  const { t, c } = grid;
  for (let y = 0; y < SY; y++) for (let z = 0; z < SZ; z++) {
    const row = z * SX + y * SX * SZ;
    for (let x = 0; x < SX;) {
      const ty = t[row + x];
      if (!ty) { x++; continue; }
      const co = c[row + x];
      let n = 1;
      while (n < 64 && x + n < SX && t[row + x + n] === ty && c[row + x + n] === co) n++;
      const pos = x | (z << 7) | (y << 14);
      out += ABC[pos & 63] + ABC[(pos >> 6) & 63] + ABC[(pos >> 12) & 63] + ABC[(pos >> 18) & 63] + ABC[n - 1] + ABC[ty] + ABC[co];
      x += n;
    }
  }
  return out;
}

// Reads the block string into a grid. Throws a friendly message when it's broken.
export function decodeBlocks(str, grid = new Grid()) {
  if (typeof str !== 'string' || str.length % 7 || str.length > MAX_BLOCKS * 7) throw new Error('That world data is broken.');
  const special = [];
  let minY = SY;
  for (let k = 0; k < str.length; k += 7) {
    const v = [];
    for (let j = 0; j < 7; j++) { const code = str.charCodeAt(k + j); const d = code < 128 ? VAL[code] : -1; if (d < 0) throw new Error('That world data is broken.'); v.push(d); }
    const pos = v[0] | (v[1] << 6) | (v[2] << 12) | (v[3] << 18);
    const x = pos & 127, z = (pos >> 7) & 127, y = (pos >> 14) & 63, n = v[4] + 1, ty = v[5], co = v[6] & 15;
    if (!ty || ty >= BLOCKS.length || x + n > SX) throw new Error('That world data is broken.');
    for (let i = 0; i < n; i++) grid.set(x + i, y, z, ty, co);
    if (y < minY) minY = y;
    if (ty === B.spawn || ty === B.goal || ty === B.coin || ty === B.teleport || BLOCKS[ty].mover != null) for (let i = 0; i < n; i++) special.push([x + i, y, z, ty]);
  }
  // remember where the special blocks are so scan() doesn't have to look at every cell
  const seen = new Set();
  grid.special = special.filter(([x, y, z, t]) => { const i = idx(x, y, z); if (seen.has(i) || grid.t[i] !== t) return false; seen.add(i); return true; });
  grid.minY = minY === SY ? 0 : minY;
  return grid;
}

// Finds the special blocks the game needs.
export function scan(grid) {
  const out = { spawn: null, spawns: 0, goals: 0, coins: [], tps: [], movers: [], blocks: grid.count };
  const list = grid.special || [...grid.each()].filter((b) => b[3] === B.spawn || b[3] === B.goal || b[3] === B.coin || b[3] === B.teleport || BLOCKS[b[3]].mover != null);
  for (const [x, y, z, t] of list) {
    if (BLOCKS[t].mover != null) { if (out.movers.length < 300) out.movers.push([x, y, z, t, grid.color(x, y, z)]); continue; }
    if (t === B.teleport) { out.tps.push([x, y, z, grid.color(x, y, z)]); continue; }
    if (t === B.spawn) { out.spawns++; if (!out.spawn) out.spawn = [x, y, z]; }
    else if (t === B.goal) out.goals++;
    else if (t === B.coin) out.coins.push([x, y, z]);
  }
  return out;
}

// Checks and cleans a world. Returns { world, grid, info }. Throws messages people can read.
export function normalizeWorld(w, { needGoal } = {}) {
  if (!w || typeof w !== 'object') throw new Error('That world is broken.');
  const grid = decodeBlocks(String(w.b || ''));
  const info = scan(grid);
  if (info.blocks > MAX_BLOCKS) throw new Error(`Worlds can have up to ${MAX_BLOCKS} blocks. This one has ${info.blocks}.`);
  if (info.spawns !== 1) throw new Error(info.spawns ? 'A world can only have one Spawn block.' : 'Place a Spawn block so players know where to start.');
  const mode = w.mode === 'hangout' ? 'hangout' : 'obby';
  const game = mode === 'hangout' && GAME_TYPES.includes(w.game) ? w.game : undefined;
  if ((needGoal ?? (mode === 'obby' || game === 'race' || game === 'koth')) && !info.goals) throw new Error(game === 'race' ? 'Race worlds need a Goal block (the finish line).' : game === 'koth' ? 'King of the Hill worlds need Goal blocks (they are the hill).' : 'Obby worlds need at least one Goal block.');
  if (info.coins.length > MAX_COINS) throw new Error(`Worlds can have up to ${MAX_COINS} coins.`);
  const name = cleanText(w.n, 40) || 'My world';
  const world = { v: 1, n: name, mode, sky: SKIES[w.sky] ? w.sky : 'day', b: encodeBlocks(grid) };
  if (game) world.game = game;
  return { world, grid, info };
}
export function worldNameOk(n) { return !isRude(n); }

export function emptyWorld(mode = 'obby') {
  const g = new Grid();
  for (let x = 52; x < 76; x++) for (let z = 52; z < 76; z++) g.set(x, 0, z, B.grass);
  g.set(56, 1, 64, B.spawn);
  if (mode === 'obby') g.set(71, 1, 64, B.goal);
  return { v: 1, n: mode === 'obby' ? 'My obby' : 'My hangout', mode, sky: 'day', b: encodeBlocks(g) };
}

// A tiny top-down picture of a world (up to 32 x 32 columns): for each column the top block, its color and height.
// 3 characters per column. The server makes one when a world is published so lists don't need the whole world.
export function worldThumb(grid) {
  const top = new Int16Array(SX * SZ).fill(-1);
  let x0 = SX, x1 = -1, z0 = SZ, z1 = -1;
  const { t } = grid;
  for (let y = 0; y < SY; y++) {
    const base = y * SX * SZ;
    for (let i = 0; i < SX * SZ; i++) {
      const ty = t[base + i];
      if (!ty || BLOCKS[ty].entity) continue;
      top[i] = y;
      const x = i % SX, z = Math.floor(i / SX);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
  }
  if (x1 < 0) return '';
  const span = Math.max(x1 - x0 + 1, z1 - z0 + 1), N = Math.min(32, span), step = span / N;
  let out = ABC[N];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    let best = -1, bt = 0, bc = 0;
    for (let dz = 0; dz < Math.max(1, Math.floor(step)); dz++) for (let dx = 0; dx < Math.max(1, Math.floor(step)); dx++) {
      const x = Math.floor(x0 + c * step) + dx, z = Math.floor(z0 + r * step) + dz;
      if (x >= SX || z >= SZ) continue;
      const y = top[x + z * SX];
      if (y > best) { best = y; bt = t[x + z * SX + y * SX * SZ]; bc = grid.c[x + z * SX + y * SX * SZ]; }
    }
    out += best < 0 ? 'AAA' : ABC[bt] + ABC[bc] + ABC[best];
  }
  return out;
}
export function readThumb(s) {
  if (typeof s !== 'string' || !s.length) return null;
  const N = VAL[s.charCodeAt(0)];
  if (!(N > 0) || s.length !== 1 + N * N * 3) return null;
  const cells = [];
  for (let k = 1; k < s.length; k += 3) cells.push([VAL[s.charCodeAt(k)], VAL[s.charCodeAt(k + 1)], VAL[s.charCodeAt(k + 2)]]);
  return { N, cells };
}
