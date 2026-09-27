// Tycoon: your own town that makes real coins. Everyone gets their own (it lives in your private server).
//   Houses bring workers. Workers mine Gold in the mine. You spend Gold to build and upgrade.
//   Factories turn your workers' work into Coins, which pile up in the Vault. Walk to the Vault to collect them.
//   More workers and more (and bigger) factories = more coins. Up to TY.dailyCap coins a day.
// The server (src/tycoon.js) and the game (play3d.js) both use this file, so the math always matches.
// Everything is worked out from time: the server keeps your town and moves it forward whenever you do something.

export const TY = {
  dailyCap: 2000,          // most coins you can collect from your Tycoon in one day (UTC)
  offlineHours: 12,        // your town keeps working while you're away, up to this long
  goldPerWorker: 0.15,     // gold per second, for each worker, with a level 1 mine
  coinsPerFactoryLevel: 4,  // coins per hour, for each factory level, before the worker bonus
  startGold: 250,         // enough for the first factory right away
};
export const MINE_MULT = [0, 1, 1.5, 2.2, 3, 4];
export const VAULT_CAP = [0, 100, 250, 600, 1200, 2000];
const COLOR = { house: 7, factory: 5, vault: 13, mine: 12 };

// Every building spot in the town. pad = the glowing pad on the road you step on to build or upgrade it.
// x0/z0 = the corner of the building's 7 x 7 (or 13 x 13 for the mine) space.
export const SPOTS = [
  ...[30, 40, 50, 60, 70, 80].map((z0, i) => ({ id: 'h' + i, kind: 'house', i, name: `House ${i + 1}`, max: 3, x0: 51, z0, w: 7, pad: [61, 0, z0 + 3] })),
  ...[40, 50, 60, 70, 80].map((z0, i) => ({ id: 'f' + i, kind: 'factory', i, name: `Factory ${i + 1}`, max: 5, x0: 70, z0, w: 7, pad: [67, 0, z0 + 3] })),
  { id: 'vault', kind: 'vault', i: 0, name: 'Vault', max: 5, x0: 70, z0: 28, w: 7, pad: [67, 0, 34] },
  { id: 'mine', kind: 'mine', i: 0, name: 'Gold mine', max: 5, x0: 58, z0: 92, w: 13, pad: [64, 0, 90] },
];
export const spot = (id) => SPOTS.find((s) => s.id === id) || null;
export const SPAWN = [64.5, 1, 24.5];
export const COLLECT_PAD = [67, 0, 29]; // step here to collect the coins in your vault
export const padColor = (s) => COLOR[s.kind];

export function newTycoon(now = Date.now()) {
  return { v: 1, b: { h0: 1, mine: 1, vault: 1 }, gold: TY.startGold, vault: 0, t: now };
}
// Cleans a saved town (from the database) so bad data can't do anything.
export function cleanTycoon(s, now = Date.now()) {
  if (!s || typeof s !== 'object' || !s.b || typeof s.b !== 'object') return newTycoon(now);
  const b = {};
  for (const sp of SPOTS) { const l = Math.floor(Number(s.b[sp.id]) || 0); if (l > 0) b[sp.id] = Math.min(sp.max, l); }
  b.h0 = Math.max(1, b.h0 || 0); b.mine = Math.max(1, b.mine || 0); b.vault = Math.max(1, b.vault || 0);
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
  return { v: 1, b, gold: num(s.gold), vault: num(s.vault), t: Number.isFinite(Number(s.t)) ? Math.min(Number(s.t), now) : now };
}

export function stats(s) {
  const lv = (id) => s.b[id] || 0;
  const workers = SPOTS.filter((x) => x.kind === 'house').reduce((n, x) => n + 2 * lv(x.id), 0);
  const factoryLevels = SPOTS.filter((x) => x.kind === 'factory').reduce((n, x) => n + lv(x.id), 0);
  const goldPerSec = workers * TY.goldPerWorker * MINE_MULT[lv('mine')];
  const coinsPerHour = TY.coinsPerFactoryLevel * factoryLevels * (1 + workers / 18);
  return { workers, factories: SPOTS.filter((x) => x.kind === 'factory' && lv(x.id)).length, factoryLevels, goldPerSec, coinsPerHour, vaultCap: VAULT_CAP[lv('vault')] };
}
// Moves the town forward to `now`: workers mine gold, factories fill the vault (up to its size).
export function advance(s, now) {
  const dt = Math.max(0, Math.min(now - s.t, TY.offlineHours * 3600e3)) / 1000;
  const st = stats(s);
  s.gold += st.goldPerSec * dt;
  s.vault = Math.min(st.vaultCap, s.vault + st.coinsPerHour * dt / 3600);
  s.t = Math.max(s.t, now);
  return s;
}

// What the next level of a spot costs in gold (null = it's maxed out)
const BASE = { house: 60, factory: 200, vault: 300, mine: 400 };
const GROW = { house: 6, factory: 6.5, vault: 6, mine: 7 };
const SPOT_MULT = { house: 3, factory: 4, vault: 1, mine: 1 };
export function costOf(sp, level) {
  if (level > sp.max) return null;
  const firstFree = sp.kind === 'mine' || sp.kind === 'vault' ? 1 : 0; // the mine and vault start at level 1
  return Math.round(BASE[sp.kind] * GROW[sp.kind] ** (level - 1 - firstFree) * SPOT_MULT[sp.kind] ** sp.i);
}
// Can this spot be built or upgraded now? { level: next level, cost, locked: why } or null when maxed.
export function nextOf(s, id) {
  const sp = spot(id);
  if (!sp) return null;
  const level = (s.b[id] || 0) + 1;
  if (level > sp.max) return null;
  let locked = '';
  if (level === 1 && sp.i > 0 && !s.b[sp.kind[0] + (sp.i - 1)]) locked = `Build ${sp.kind === 'house' ? 'House' : 'Factory'} ${sp.i} first`;
  return { level, cost: costOf(sp, level), locked };
}
// Spend gold on a spot. Returns an error message, or '' when it worked.
export function buy(s, id) {
  const n = nextOf(s, id);
  if (!n) return spot(id) ? "That's as big as it gets!" : 'Unknown building.';
  if (n.locked) return n.locked + '.';
  if (s.gold < n.cost) return `You need ${Math.ceil(n.cost - s.gold)} more gold.`;
  s.gold -= n.cost;
  s.b[id] = n.level;
  return '';
}

/* ---------------- what the buildings look like (blocks) ---------------- */
// Block type numbers are passed in (B from world.js) so this file stays small.
// Returns [[x, y, z, type, color], ...] for a spot at a level (0 = empty lot).
export function spotCells(sp, level, B) {
  const out = [], put = (x, y, z, t, c = 0) => out.push([sp.x0 + x, y, sp.z0 + z, t, c]);
  const box = (x0, y0, z0, x1, y1, z1, t, c) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) put(x, y, z, t, c); };
  const walls = (x0, z0, x1, z1, y0, y1, t, c) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (x === x0 || x === x1 || z === z0 || z === z1) put(x, y, z, t, c); };
  if (!level) return out;
  if (sp.kind === 'house') {
    // the door faces the road (east, x = 6 side)
    const s = level === 1 ? [1, 1, 5, 5] : [0, 0, 6, 6], h = level === 3 ? 6 : 3;
    walls(s[0], s[1], s[2], s[3], 1, h, level === 1 ? B.wood : B.brick, 0);
    box(s[0], h + 1, s[1], s[2], h + 1, s[3], B.plastic, [4, 9, 11][level - 1]);
    if (level >= 2) for (let z = s[1] + 1; z < s[3]; z += 2) { put(s[0], 2, z, B.glass, 14); put(s[2], 2, z, B.glass, 14); if (level === 3) { put(s[0], 5, z, B.glass, 14); put(s[2], 5, z, B.glass, 14); } }
    put(s[2], 1, 3, 0, 0); put(s[2], 2, 3, 0, 0); // the doorway
    return lastWins(out);
  }
  if (sp.kind === 'factory') {
    const big = level >= 3, x0 = big ? 0 : 1, x1 = big ? 6 : 5, h = 1 + level;
    walls(x0, x0, x1, x1, 1, h, B.metal, 0);
    box(x0, h + 1, x0, x1, h + 1, x1, B.plastic, 5);
    for (let y = 2; y <= h; y += 2) { put(x0, y, 3, B.glass, 6); put(x1, y, 3, B.neon, 6); }
    const cx = x1 - 1, ch = h + 2 + level;
    box(cx, h + 2, x0 + 1, cx, ch, x0 + 1, B.brick, 0);
    put(cx, ch + 1, x0 + 1, B.lava, 0); // the chimney glows while it works
    put(x0, 1, 3, 0, 0);
    return lastWins(out);
  }
  if (sp.kind === 'vault') {
    const h = 1 + level;
    walls(0, 0, 6, 6, 1, h, B.stone, 0);
    for (const [x, z] of [[0, 0], [6, 0], [0, 6], [6, 6]]) box(x, 1, z, x, h + 1, z, B.plastic, 13);
    box(0, h + 1, 0, 6, h + 1, 6, B.plastic, 6);
    box(2, h + 2, 2, 4, h + 1 + Math.ceil(level / 2), 4, B.neon, 6); // a pile of gold on the roof
    put(0, 1, 3, 0, 0); put(0, 2, 3, 0, 0);
    return lastWins(out);
  }
  // the mine: a rocky hill with gold in it and an entrance on the south side
  const r = 2 + level, hh = 1 + level * 2;
  for (let y = 1; y <= hh; y++) {
    const rr = Math.round(r * (1 - (y - 1) / (hh + 1)));
    box(6 - rr, y, 6 - rr, 6 + rr, y, 6 + rr, B.stone, 0);
  }
  for (let k = 0; k < 4 + level * 3; k++) { const a = k * 2.4, y = 1 + (k % hh), rr = Math.max(1, Math.round(r * (1 - (y - 1) / (hh + 1)))); put(6 + Math.round(Math.cos(a) * rr), y, 6 + Math.round(Math.sin(a) * rr), B.neon, 6); }
  const d = 6 - r;
  for (let z = d; z <= 6; z++) { put(5, 1, z, 0, 0); put(6, 1, z, 0, 0); put(7, 1, z, 0, 0); put(5, 2, z, 0, 0); put(6, 2, z, 0, 0); put(7, 2, z, 0, 0); }
  box(4, 1, d, 4, 3, d, B.wood, 0); box(8, 1, d, 8, 3, d, B.wood, 0); box(4, 3, d, 8, 3, d, B.wood, 0);
  return lastWins(out);
}
// the last write for a cell wins (so doors and the mine entrance are carved out after the walls)
function lastWins(out) {
  const last = new Map();
  for (const c of out) last.set(c[0] + ',' + c[1] + ',' + c[2], c);
  return [...last.values()];
}
// All the cells a spot could ever use (so the game can clear the lot before drawing the new level).
export function spotBox(sp) { return [sp.x0, 1, sp.z0, sp.x0 + sp.w - 1, 24, sp.z0 + sp.w - 1]; }

// Where workers walk: from their house's door, up the road to the mine, then to a factory and home again.
export function workerPath(s, k) {
  const houses = SPOTS.filter((x) => x.kind === 'house' && s.b[x.id]);
  const facs = SPOTS.filter((x) => x.kind === 'factory' && s.b[x.id]);
  if (!houses.length) return null;
  const h = houses[k % houses.length], f = facs.length ? facs[k % facs.length] : null, lane = 63 + (k % 3);
  const door = [h.x0 + 7.5, 1, h.z0 + 3.5], mine = [64.5, 1, 91.5];
  const pts = [door, [lane + 0.5, 1, h.z0 + 3.5], [lane + 0.5, 1, 90.5], mine, [lane + 0.5, 1, 90.5]];
  if (f) pts.push([lane + 0.5, 1, f.z0 + 3.5], [f.x0 - 0.5, 1, f.z0 + 3.5], [lane + 0.5, 1, f.z0 + 3.5]);
  pts.push([lane + 0.5, 1, h.z0 + 3.5], door);
  return pts;
}
