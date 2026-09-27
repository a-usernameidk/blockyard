// Minigames: rounds that the live room runs for everyone in a server.
//   race   first to the goal wins
//   tag    one player is IT and tags others, who become IT too. Anyone still free at the end wins.
//   koth   King of the hill: stand on the hill (the goal blocks) the longest
//   lava   Rising lava: the lava comes up every few seconds. Last one standing wins.
//   paint  Paintball: pick a blaster and shoot paint. Enough paint splats someone. Most splats wins.
//   tycoon Claim a plot, earn cash every second, buy the buttons to build it up. First to finish (or most built) wins.
// The server (src/room.js) and the game (play3d.js) both use this file, so they agree on the rules.
import { decodeBlocks, scan, B, SX, SZ } from './world.js';

export const GAMES = {
  race: { name: 'Race', short: 'First to the goal wins!', secs: 120 },
  tag: { name: 'Tag', short: "Don't get tagged! If you're IT, tag everyone.", secs: 75 },
  paint: { name: 'Paintball', short: 'Pick a blaster (1 to 4), click or tap Shoot to fire. Most splats wins!', secs: 90 },
  koth: { name: 'King of the Hill', short: 'Stand on the glowing hill the longest.', secs: 60 },
  lava: { name: 'Rising Lava', short: 'Climb! The lava keeps rising. Last one standing wins.', secs: 90 },
  tycoon: { name: 'Tycoon', short: 'Step on a claim pad, earn cash, buy buttons to build your plot. Finish first!', secs: 180 },
};
export const GAME_IDS = Object.keys(GAMES);
export const ROUND = { wait: 12, results: 7, minPlayers: 2, lavaEvery: 4, tagReach: 1.4, itWait: 3000, hp: 6, safeMs: 1500, swapMs: 400 };
// Paintball blasters. Everyone has all four; they trade range for speed, so none is best everywhere.
//   dmg: paint per hit (6 paint splats someone). every: ms between shots. spread: how wobbly. pellets: shots at once.
export const WEAPONS = {
  blaster: { name: 'Blaster', dmg: 2, every: 330, range: 32, spread: 0, pellets: 1, speed: 45, size: 0.22, info: 'All-rounder. 3 hits.' },
  rapid: { name: 'Rapid', dmg: 1, every: 130, range: 22, spread: 0.05, pellets: 1, speed: 55, size: 0.14, info: 'Sprays fast, a bit wobbly. 6 hits.' },
  sniper: { name: 'Sniper', dmg: 6, every: 1300, range: 64, spread: 0, pellets: 1, speed: 110, size: 0.2, info: 'One hit splats, slow to reload.' },
  splatter: { name: 'Splatter', dmg: 3, every: 700, range: 13, spread: 0.1, pellets: 6, speed: 38, size: 0.2, info: 'Up close only. 2 hits.' },
};
export const WEAPON_IDS = Object.keys(WEAPONS);
// Bots for private servers of Blockyard's minigame worlds. The server owner's computer drives them.
export const BOTS = { max: 6, skills: ['easy', 'normal', 'hard', 'insane'] };
export const BOT_SKILL = {
  easy: { name: 'Easy', think: 0.6, press: 0.7, aim: 0.25, miss: 0.15 },
  normal: { name: 'Normal', think: 0.35, press: 0.85, aim: 0.45, miss: 0.06 },
  hard: { name: 'Hard', think: 0.18, press: 0.95, aim: 0.65, miss: 0.02 },
  insane: { name: 'Insane', think: 0.08, press: 1, aim: 0.85, miss: 0 },
};
export const BOT_NAMES = ['Bolt', 'Sprocket', 'Gizmo', 'Widget', 'Pixel', 'Byte'];
export const BOT_LOOKS = [['#3a86ff', 'cap'], ['#44c06a', 'sprout'], ['#b06cff', 'wizard'], ['#ffd23f', 'tophat'], ['#ff5d8f', 'bow'], ['#a3abc2', 'headphones']]
  .map(([color, hat]) => ({ color, hat, trail: 'none', pet: 'none', gear: 'none' }));
export const PRIZE = { first: 25, second: 15, third: 10, win: 20, dailyCap: 200 };

// Works out where each game happens in a world: { modes, lobby, areas: { race: { spawn, box, hill, lavaFrom } } }
// A built-in world can hand its areas over directly; a player world uses its spawn, goal blocks and floor.
export function gameConfig(world, builtin) {
  if (builtin && builtin.areas) {
    if (builtin.game !== 'tycoon') return { modes: [builtin.game], lobby: builtin.lobby, areas: builtin.areas };
    const plots = tycoonLayout(decodeBlocks(builtin.get().world.b));
    return { modes: ['tycoon'], lobby: builtin.lobby, areas: { tycoon: { ...builtin.areas.tycoon, plots } } };
  }
  const g = world && GAMES[world.game] ? world.game : null;
  if (!g) return null;
  const grid = decodeBlocks(world.b), info = scan(grid);
  const sp = info.spawn || [64, 0, 64];
  const spawn = [sp[0] + 0.5, sp[1] + 1, sp[2] + 0.5];
  // the hill = the box around every goal block
  let hill = null;
  for (const [x, y, z, t] of grid.each()) {
    if (t !== B.goal) continue;
    if (!hill) hill = [x, y, z, x, y, z];
    else hill = [Math.min(hill[0], x), Math.min(hill[1], y), Math.min(hill[2], z), Math.max(hill[3], x), Math.max(hill[4], y), Math.max(hill[5], z)];
  }
  const area = { spawn, box: null, hill, lavaFrom: grid.lowest() };
  if (g === 'tycoon') area.plots = tycoonLayout(grid);
  return { modes: [g], lobby: spawn, areas: { [g]: area } };
}

/* ---------------- tycoon ---------------- */
// Each color is one plot: its claim pad, its buy buttons (cheapest = closest to the pad) and the Tycoon blocks
// each button builds (every Tycoon block belongs to the nearest button of its color).
export const TYCOON = { maxButtons: 12, price: (k) => 15 * (k + 1) * (k + 1), income: (bought) => 3 + bought * 4, reach: 2.2 };
export function tycoonLayout(grid) {
  const pads = new Map(), buttons = new Map(), builds = new Map();
  const T = grid.t, C = grid.c;
  for (let i = 0; i < T.length; i++) {
    const t = T[i];
    if (t !== B.tclaim && t !== B.tbutton && t !== B.tbuild) continue;
    const x = i % SX, z = Math.floor(i / SX) % SZ, y = Math.floor(i / (SX * SZ)), c = C[i];
    if (t === B.tclaim) { if (!pads.has(c)) pads.set(c, [x, y, z]); }
    else if (t === B.tbutton) { if (!buttons.has(c)) buttons.set(c, []); buttons.get(c).push([x, y, z]); }
    else { if (!builds.has(c)) builds.set(c, []); builds.get(c).push(i); }
  }
  const plots = {};
  for (const [c, pad] of [...pads].sort((a, b) => a[0] - b[0])) {
    const d2 = (p) => (p[0] - pad[0]) ** 2 + (p[1] - pad[1]) ** 2 + (p[2] - pad[2]) ** 2;
    const list = (buttons.get(c) || []).sort((a, b) => d2(a) - d2(b) || a[0] - b[0] || a[2] - b[2]).slice(0, TYCOON.maxButtons);
    const btns = list.map((p, k) => ({ x: p[0], y: p[1], z: p[2], price: TYCOON.price(k), cells: [] }));
    for (const i of builds.get(c) || []) {
      if (!btns.length) break;
      const x = i % SX, z = Math.floor(i / SX) % SZ, y = Math.floor(i / (SX * SZ));
      let best = 0, bd = Infinity;
      btns.forEach((b, k) => { const d = (b.x - x) ** 2 + (b.y - y) ** 2 + (b.z - z) ** 2; if (d < bd) { bd = d; best = k; } });
      btns[best].cells.push(i);
    }
    plots[c] = { c, pad, buttons: btns };
  }
  return plots;
}
// Is a player at p close enough to a pad or button at q (standing on it or right next to it)?
export const nearBlock = (p, q) => Math.abs(p[0] - (q[0] + 0.5)) < TYCOON.reach && Math.abs(p[2] - (q[2] + 0.5)) < TYCOON.reach && p[1] >= q[1] - 0.5 && p[1] <= q[1] + 3;
// Is (x, y, z) standing on the hill?
export function onHill(area, x, y, z) {
  const h = area && area.hill;
  if (!h) return false;
  return x >= h[0] && x <= h[3] + 1 && z >= h[2] && z <= h[5] + 1 && y >= h[4] + 0.9 && y <= h[4] + 4;
}
// How high the lava is, t seconds into a lava round.
export const lavaLevel = (area, t) => (area.lavaFrom || 0) + 0.5 + Math.floor(Math.max(0, t) / ROUND.lavaEvery);
// Is (x, z) inside an area's box? (No box means the whole world.)
export const inBox = (area, x, z) => !area.box || (x >= area.box[0] && x <= area.box[2] + 1 && z >= area.box[1] && z <= area.box[3] + 1);
