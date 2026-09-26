// Minigames: rounds that the live room runs for everyone in a server.
//   race   first to the goal wins
//   tag    one player is IT and tags others, who become IT too. Anyone still free at the end wins.
//   koth   King of the hill: stand on the hill (the goal blocks) the longest
//   lava   Rising lava: the lava comes up every few seconds. Last one standing wins.
//   paint  Paintball: shoot paint, 3 hits splats someone. Most splats wins.
// The server (src/room.js) and the game (play3d.js) both use this file, so they agree on the rules.
import { decodeBlocks, scan, B } from './world.js';

export const GAMES = {
  race: { name: 'Race', short: 'First to the goal wins!', secs: 120 },
  tag: { name: 'Tag', short: "Don't get tagged! If you're IT, tag everyone.", secs: 75 },
  paint: { name: 'Paintball', short: 'Click (or tap Shoot) to fire paint. 3 hits and they splat. Most splats wins!', secs: 90 },
  koth: { name: 'King of the Hill', short: 'Stand on the glowing hill the longest.', secs: 60 },
  lava: { name: 'Rising Lava', short: 'Climb! The lava keeps rising. Last one standing wins.', secs: 90 },
};
export const GAME_IDS = Object.keys(GAMES);
export const ROUND = { wait: 12, results: 7, minPlayers: 2, lavaEvery: 4, tagReach: 1.4, shotRange: 32, shotEvery: 330, hitsToSplat: 3 };
export const PRIZE = { first: 25, second: 15, third: 10, win: 20, dailyCap: 200 };

// Works out where each game happens in a world: { modes, lobby, areas: { race: { spawn, box, hill, lavaFrom } } }
// A built-in world can hand its areas over directly; a player world uses its spawn, goal blocks and floor.
export function gameConfig(world, builtin) {
  if (builtin && builtin.areas) return { modes: builtin.game === 'mix' ? GAME_IDS : [builtin.game], lobby: builtin.lobby, areas: builtin.areas };
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
  return { modes: [g], lobby: spawn, areas: { [g]: { spawn, box: null, hill, lavaFrom: grid.lowest() } } };
}
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
