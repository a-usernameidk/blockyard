// The built-in 3D worlds: the Plaza and Snowy Town (hangouts), one world per minigame, and the obbies.
// Each one is built by code the first time it's needed. `way` is the route the test bot follows.
import { Grid, B, encodeBlocks } from './world.js';
import { SPOTS, padColor, COLLECT_PAD } from './tycoon.js';

function make(meta, draw) {
  let cache = null;
  return {
    ...meta,
    get() {
      if (cache) return cache;
      const g = new Grid(), way = [];
      const box = (x0, y0, z0, x1, y1, z1, t, c = 0) => {
        for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g.set(x, y, z, t, c);
      };
      // a platform whose top is at height y+1, with a stop for the bot in the middle
      const pad = (x, y, z, w, d, t, c = 0, stop = true) => { box(x, y, z, x + w - 1, y, z + d - 1, t, c); if (stop) way.push([x + w / 2, y + 1, z + d / 2]); };
      const coin = (x, y, z) => g.set(x, y, z, B.coin);
      draw({ g, box, pad, coin, way, set: (x, y, z, t, c) => g.set(x, y, z, t, c) });
      cache = { world: { v: 1, n: meta.name, mode: meta.mode, sky: meta.sky, b: encodeBlocks(g) }, way };
      return cache;
    },
  };
}

const tree = (box, x, y, z, h = 4) => {
  box(x - 1, y + h - 1, z - 1, x + 1, y + h, z + 1, B.leaves);
  box(x, y + h + 1, z, x, y + h + 1, z, B.leaves);
  box(x, y, z, x, y + h - 1, z, B.wood);
};

export const PLAZA = make({ id: 'plaza', name: 'Blockyard Plaza', mode: 'hangout', sky: 'day', shop: [72.5, 1, 54.5], blurb: 'The hub. Hang out, dance, climb the lookouts and visit the shop keeper.' }, ({ box, set }) => {
  box(28, 0, 28, 99, 0, 99, B.grass);
  box(50, 0, 50, 77, 0, 77, B.stone);
  // paths out to the edges
  box(61, 0, 28, 66, 0, 49, B.sand); box(61, 0, 78, 66, 0, 99, B.sand);
  box(28, 0, 61, 49, 0, 66, B.sand); box(78, 0, 61, 99, 0, 66, B.sand);
  // fountain
  box(58, 1, 58, 69, 1, 69, B.stone); box(59, 1, 59, 68, 1, 68, B.glass, 9);
  box(62, 1, 62, 65, 3, 65, B.stone); box(63, 4, 63, 64, 4, 64, B.neon, 8);
  set(64, 0, 72, B.spawn);
  // trees around the square
  for (const [x, z] of [[40, 40], [88, 40], [40, 88], [88, 88], [34, 54], [94, 74], [46, 70], [82, 56]]) tree(box, x, 1, z, 4 + ((x + z) % 3));
  // benches
  for (const [x, z, alongX] of [[54, 52, 1], [70, 52, 1], [54, 75, 1], [70, 75, 1]]) {
    if (alongX) { box(x, 1, z, x + 3, 1, z, B.wood); }
  }
  // dance stage
  box(76, 1, 76, 85, 1, 85, B.wood); box(76, 1, 76, 85, 1, 76, B.neon, 11); box(76, 1, 85, 85, 1, 85, B.neon, 9);
  box(76, 1, 77, 76, 1, 84, B.neon, 10); box(85, 1, 77, 85, 1, 84, B.neon, 6);
  // bounce tower lookout: a bounce pad takes you about 5 blocks up, so each level is 4 higher
  box(36, 1, 78, 38, 1, 80, B.bounce);
  box(34, 4, 82, 40, 4, 87, B.plastic, 9); box(36, 4, 84, 38, 4, 85, B.bounce);
  box(34, 8, 89, 40, 8, 95, B.plastic, 6);
  for (let i = 0; i < 4; i++) set(34 + i * 2, 9, 95, B.neon, [4, 6, 7, 9][i]);
  set(39, 8, 93, B.teleport, 3); set(42, 1, 80, B.teleport, 3); // a way back down (and back up)
  set(35, 9, 90, B.coin);
  // a parkour loop with colored blocks, one block higher each hop (you can jump a bit less than 2)
  const hops = [[86, 1, 40], [89, 2, 38], [92, 3, 36], [94, 4, 33], [91, 5, 30], [88, 6, 31], [85, 7, 33]];
  hops.forEach(([x, y, z], i) => box(x, y, z, x + 1, y, z + 1, B.plastic, [5, 6, 7, 8, 9, 10, 11][i]));
  box(79, 8, 31, 83, 8, 36, B.plastic, 0); set(81, 9, 33, B.coin); set(80, 8, 35, B.teleport, 10); set(84, 1, 44, B.teleport, 10);
  // an elevator up to a lookout over the square
  box(44, 0, 46, 45, 0, 47, B.moveY, 7); box(46, 4, 44, 51, 4, 49, B.wood); set(49, 5, 46, B.coin);
  for (let x = 46; x <= 51; x++) { set(x, 5, 44, B.wood); set(x, 5, 49, B.wood); }
  // low fence
  for (let x = 28; x <= 99; x++) { if (x < 61 || x > 66) { set(x, 1, 28, B.wood); set(x, 1, 99, B.wood); } }
  for (let z = 28; z <= 99; z++) { if (z < 61 || z > 66) { set(28, 1, z, B.wood); set(99, 1, z, B.wood); } }
  // the shop keeper's stall
  box(70, 1, 56, 74, 1, 56, B.wood); box(70, 1, 53, 70, 3, 53, B.wood); box(74, 1, 53, 74, 3, 53, B.wood);
  for (let x = 70; x <= 74; x++) box(x, 4, 53, x, 4, 56, B.plastic, x % 2 ? 6 : 0);
});

export const SUNNY = make({ id: 'sunny', name: 'Sunny Steps', mode: 'obby', sky: 'day', reward: 50, blurb: 'Your first obby. Hop across floating blocks up to the goal.' }, ({ pad, box, coin, set, way }) => {
  pad(8, 10, 61, 6, 6, B.grass); set(10, 10, 63, B.spawn);
  way.length = 0; way.push([10.5, 11, 63.5]);
  pad(16, 10, 63, 3, 3, B.plastic, 5); coin(17, 12, 64);
  pad(21, 11, 63, 3, 3, B.plastic, 6); coin(22, 13, 64);
  pad(26, 12, 63, 3, 3, B.plastic, 7); coin(27, 14, 64);
  pad(31, 12, 62, 5, 5, B.grass); set(33, 12, 64, B.checkpoint);
  box(36, 12, 64, 45, 12, 64, B.wood); way.push([45.5, 13, 64.5]); coin(39, 13, 64); coin(42, 13, 64);
  pad(46, 12, 62, 4, 5, B.grass);
  way.push([47.5, 13, 66.5]);
  for (let i = 0; i < 4; i++) pad(47, 13 + i, 67 + i * 2, 2, 2, B.brick);
  pad(46, 16, 75, 5, 5, B.stone); set(48, 16, 77, B.checkpoint); coin(48, 18, 77);
  pad(54, 16, 77, 2, 2, B.plastic, 9); coin(54, 18, 77);
  pad(59, 16, 77, 2, 2, B.plastic, 10);
  pad(64, 17, 77, 2, 2, B.plastic, 11); coin(64, 19, 77);
  pad(69, 17, 76, 4, 4, B.grass, 0, false); way.push([69.5, 18, 77.5]);
  set(71, 17, 77, B.bounce); set(71, 17, 78, B.bounce); set(70, 17, 77, B.bounce); set(70, 17, 78, B.bounce);
  pad(69, 21, 82, 5, 5, B.stone); set(71, 21, 84, B.checkpoint); coin(71, 24, 80);
  box(74, 21, 84, 80, 21, 84, B.crumble); way.push([80.5, 22, 84.5]);
  pad(81, 21, 82, 5, 5, B.grass, 0, false); set(83, 22, 84, B.goal); way.push([83.5, 22, 84.5]);
});

export const TOWER = make({ id: 'tower', name: 'Tower of Tries', mode: 'obby', sky: 'sunset', reward: 80, blurb: 'Climb the ledges around a giant tower. Watch out for crumbling blocks.' }, ({ box, pad, coin, set, way }) => {
  box(44, 0, 44, 83, 0, 83, B.lava);
  box(55, 0, 72, 60, 3, 77, B.stone);
  pad(55, 3, 72, 6, 6, B.grass, 0, false); set(57, 3, 74, B.spawn); way.push([57.5, 4, 74.5]);
  const ring = [];
  for (const x of [57, 61, 65]) ring.push([x, 69]);
  for (const z of [69, 65, 61]) ring.push([69, z]);
  for (const x of [69, 65, 61]) ring.push([x, 57]);
  for (const z of [57, 61, 65]) ring.push([57, z]);
  let y = 4, top = 0;
  const colors = [5, 6, 7, 8, 9, 10, 11];
  for (let i = 1; i <= 33; i++) {
    const [x, z] = ring[i % 12];
    const r = i % 12;
    const kind = i % 6 === 0 ? B.checkpoint : i > 12 && (r === 4 || r === 10) ? B.crumble : i > 24 && (r === 1 || r === 7) ? B.ice : B.plastic;
    pad(x, y, z, 2, 2, kind, colors[i % colors.length]);
    if (i % 3 === 1) coin(x, y + 2, z);
    top = y; y++;
  }
  // the tower itself
  box(60, 0, 60, 67, top + 1, 67, B.stone);
  for (let yy = 4; yy <= top; yy += 6) box(60, yy, 60, 67, yy, 67, B.brick);
  box(61, top + 2, 61, 66, top + 2, 66, B.plastic, 6);
  set(63, top + 3, 63, B.goal); set(64, top + 3, 64, B.goal); set(63, top + 3, 64, B.goal); set(64, top + 3, 63, B.goal);
  // last ledge -> roof -> goal
  const [lx, lz] = ring[33 % 12];
  way.push([lx < 60 ? 60.6 : lx > 67 ? 67.4 : lx + 1, top + 2, lz < 60 ? 60.6 : lz > 67 ? 67.4 : lz + 1]);
  way.push([63.5, top + 3, 63.5]);
});

export const LAVA = make({ id: 'lava', name: 'Lava Lake', mode: 'obby', sky: 'night', reward: 100, blurb: 'Stepping stones over a lake of lava, an ice bridge, and one very long jump.' }, ({ box, pad, coin, set, way }) => {
  box(18, 0, 52, 104, 0, 76, B.lava);
  box(22, 0, 60, 29, 1, 68, B.stone); set(24, 1, 64, B.spawn); way.push([24.5, 2, 64.5]);
  way.push([28.5, 2, 64.5]);
  for (const x of [32, 35, 38]) { box(x, 0, 64, x, 1, 64, B.stone); way.push([x + 0.5, 2, 64.5]); coin(x, 3, 64); }
  box(41, 0, 64, 42, 1, 64, B.stone); way.push([42, 2, 64.5]);
  box(45, 0, 62, 49, 1, 66, B.stone); set(47, 1, 64, B.checkpoint); way.push([47.5, 2, 64.5]);
  box(50, 1, 64, 58, 1, 64, B.ice); coin(52, 2, 64); coin(55, 2, 64); way.push([58.5, 2, 64.5]);
  box(59, 0, 62, 63, 1, 66, B.stone); set(61, 1, 64, B.speed); set(62, 1, 64, B.speed); way.push([61.5, 2, 64.5]);
  coin(66, 3, 64); coin(67, 3, 64);
  box(70, 0, 61, 74, 1, 67, B.stone); set(72, 1, 64, B.checkpoint); way.push([72.5, 2, 64.5]);
  box(75, 1, 64, 83, 1, 64, B.crumble); way.push([83.5, 2, 64.5]);
  [[86, 2], [89, 3], [92, 4]].forEach(([x, y]) => { box(x, 0, 64, x, y, 64, B.stone); way.push([x + 0.5, y + 1, 64.5]); coin(x, y + 2, 64); });
  box(95, 0, 61, 100, 4, 67, B.stone); box(95, 4, 61, 100, 4, 67, B.grass); way.push([96.5, 5, 64.5]);
  set(98, 5, 64, B.goal); way.push([98.5, 5, 64.5]);
  // lights along the lake
  for (let x = 24; x <= 100; x += 8) { set(x, 1, 53, B.neon, 11); set(x, 1, 75, B.neon, 8); }
});

// Harder obbies that use the newer blocks. `way` entries can be { ride: [x, y, z, axis], exit: [x, y, z] }
// for a moving platform: the bot waits for it, rides it, and gets off at `exit`.
export const FACTORY = make({ id: 'factory', name: 'Conveyor Chaos', mode: 'obby', sky: 'sunset', reward: 150, blurb: 'Conveyor belts, a moving bridge, pick the right teleporter, an elevator, and stairs that push back.' }, ({ box, coin, set, way }) => {
  box(10, 0, 40, 118, 0, 88, B.lava);
  box(12, 0, 60, 17, 3, 68, B.stone); set(14, 3, 64, B.spawn); way.push([14.5, 4, 64.5]);
  // belts that push you sideways
  for (let x = 18; x <= 33; x++) box(x, 3, 60, x, 3, 68, Math.floor((x - 18) / 4) % 2 ? B.beltN : B.beltS);
  box(18, 0, 60, 33, 2, 68, B.stone);
  coin(21, 5, 62); coin(25, 5, 66); coin(29, 5, 62); way.push([33.5, 4, 64.5]);
  box(34, 0, 61, 38, 3, 67, B.stone); set(36, 3, 64, B.checkpoint); way.push([36.5, 4, 64.5]);
  // a moving bridge
  box(39, 3, 63, 40, 3, 64, B.moveX, 9); way.push({ ride: [40, 3, 64, 0], exit: [46.5, 4, 64.5] });
  box(45, 0, 61, 49, 3, 67, B.stone); coin(47, 5, 62);
  // three teleporters: only blue goes on
  set(49, 3, 62, B.teleport, 4); set(49, 3, 64, B.teleport, 9); set(49, 3, 66, B.teleport, 6);
  box(28, 0, 78, 32, 7, 82, B.stone); set(30, 7, 80, B.teleport, 4); coin(31, 9, 81);
  box(28, 0, 46, 32, 7, 50, B.stone); set(30, 7, 48, B.teleport, 6); coin(31, 9, 47);
  way.push([48.5, 4, 64.5]); way.push([49.5, 4, 64.5]);
  box(54, 0, 60, 60, 3, 68, B.stone); set(56, 3, 64, B.teleport, 9); way.push([58.5, 4, 64.5]);
  set(58, 3, 62, B.checkpoint); way.push([58.5, 4, 62.5]); way.push([59.5, 4, 64.5]);
  // an elevator
  box(61, 3, 63, 62, 3, 64, B.moveY, 11); way.push({ ride: [62, 3, 64, 1], exit: [65.5, 8, 64.5] });
  box(63, 0, 61, 68, 7, 67, B.stone); set(66, 7, 64, B.checkpoint); coin(66, 9, 64);
  // stairs that push you back
  for (let i = 0; i < 4; i++) { box(69 + i * 2, 0, 62, 70 + i * 2, 8 + i, 66, B.stone); box(69 + i * 2, 8 + i, 62, 70 + i * 2, 8 + i, 66, B.beltW); way.push([70 + i * 2, 9 + i, 64.5]); }
  coin(74, 13, 64);
  box(79, 0, 61, 84, 11, 67, B.stone); box(79, 11, 61, 84, 11, 67, B.grass); way.push([80.5, 12, 64.5]);
  set(82, 12, 64, B.goal); way.push([82.5, 12, 64.5]);
});

export const SKY = make({ id: 'sky', name: 'Sky Gauntlet', mode: 'obby', sky: 'night', reward: 250, blurb: 'Tiny blocks in the sky, a moving platform, ice, crumbling blocks, a bounce and an elevator. Nothing underneath.' }, ({ box, coin, set, way }) => {
  box(10, 20, 60, 15, 20, 68, B.stone); set(12, 20, 64, B.spawn); way.push([12.5, 21, 64.5]);
  // one-block hops
  [[18, 20], [21, 20], [24, 20], [27, 21], [30, 21]].forEach(([x, y], i) => { set(x, y, 64, B.plastic, [5, 6, 7, 8, 9][i]); way.push([x + 0.5, y + 1, 64.5]); if (i % 2 === 0) coin(x, y + 2, 64); });
  box(33, 21, 62, 36, 21, 66, B.stone); set(35, 21, 64, B.checkpoint); way.push([35.5, 22, 64.5]);
  box(37, 21, 63, 38, 21, 64, B.moveX, 11); way.push({ ride: [38, 21, 64, 0], exit: [43.5, 22, 64.5] });
  box(43, 21, 63, 44, 21, 65, B.stone);
  box(45, 21, 64, 52, 21, 64, B.ice); coin(48, 22, 64); coin(51, 22, 64); way.push([52.5, 22, 64.5]);
  box(53, 21, 64, 58, 21, 64, B.crumble); way.push([58.5, 22, 64.5]);
  box(59, 21, 62, 62, 21, 66, B.stone); set(60, 21, 64, B.checkpoint); way.push([60.5, 22, 64.5]);
  // bounce up to a higher platform
  box(63, 21, 63, 65, 21, 65, B.bounce); way.push([63.5, 22, 64.5]);
  box(69, 25, 62, 73, 25, 66, B.stone); set(71, 25, 64, B.checkpoint); coin(71, 27, 66); way.push([71.5, 26, 64.5]);
  // elevator
  box(74, 25, 63, 75, 25, 64, B.moveY, 7); way.push({ ride: [75, 25, 64, 1], exit: [78.5, 30, 64.5] });
  box(76, 29, 62, 80, 29, 66, B.stone); coin(78, 31, 62);
  box(83, 29, 62, 87, 29, 66, B.grass); way.push([84.5, 30, 64.5]);
  set(85, 30, 64, B.goal); way.push([85.5, 30, 64.5]);
});

// The minigame worlds. Each one is a lobby (with the shop keeper) plus that game's own map.
// You hang out in the lobby; when a round starts the live room sends everyone into the map, then back.
function lobby({ box, set }, c) {
  box(54, 0, 54, 74, 0, 74, B.stone);
  for (let x = 56; x <= 72; x++) for (let z = 56; z <= 72; z++) set(x, 0, z, (x + z) % 2 ? B.stone : B.plastic, c);
  set(64, 0, 66, B.spawn);
  // a low wall with a gap on each side, and lamps on the corners
  for (let i = 54; i <= 74; i++) if (i < 62 || i > 66) { set(i, 1, 54, B.brick); set(i, 1, 74, B.brick); set(54, 1, i, B.brick); set(74, 1, i, B.brick); }
  for (const [x, z] of [[54, 54], [74, 54], [54, 74], [74, 74]]) { box(x, 1, z, x, 3, z, B.wood); set(x, 4, z, B.neon, c); }
  // the shop keeper's stall (north-east corner)
  box(67, 1, 58, 71, 1, 58, B.wood); box(67, 1, 55, 67, 3, 55, B.wood); box(71, 1, 55, 71, 3, 55, B.wood);
  for (let x = 67; x <= 71; x++) box(x, 4, 55, x, 4, 58, B.plastic, x % 2 ? c : 0);
  // benches and a big sign in the game's color
  box(57, 1, 69, 60, 1, 69, B.wood); box(57, 1, 71, 60, 1, 71, B.wood);
  box(58, 1, 55, 62, 3, 55, B.plastic, 0); box(59, 2, 55, 61, 2, 55, B.neon, c);
}
// the lava tower's steps, in order (bots climb these)
const LAVA_RING = (() => {
  const ring = [];
  for (const x of [95, 99, 103]) ring.push([x, 31]);
  for (const z of [31, 27, 23]) ring.push([107, z]);
  for (const x of [107, 103, 99]) ring.push([x, 19]);
  for (const z of [19, 23, 27]) ring.push([95, z]);
  const out = [[93.5, 1, 31.5]];
  for (let i = 1, y = 1; i <= 26; i++, y++) { const [x, z] = ring[i % 12]; out.push([x + 1, y + 1, z + 1]); }
  return out;
})();
// where each game happens (the lobby is always around 64, 64). path: a route bots follow.
const AREAS = {
  race: { spawn: [11.5, 1, 12.5], box: [4, 4, 112, 20] },
  // tag: IT starts in the middle (and waits 3 seconds), everyone else starts spread out around the edges
  tag: { spawn: [26.5, 1, 98.5], box: [8, 84, 44, 120], itSpawn: [26.5, 1, 98.5], spawns: [[11.5, 1, 94.5], [41.5, 1, 94.5], [11.5, 1, 110.5], [41.5, 1, 110.5], [18.5, 1, 98.5], [34.5, 1, 107.5], [20.5, 1, 86.5], [32.5, 1, 118.5]] },
  paint: { spawn: [32.5, 1, 80.5], box: [8, 76, 56, 120], spawns: [[14.5, 1, 82.5], [50.5, 1, 82.5], [14.5, 1, 113.5], [50.5, 1, 113.5], [32.5, 1, 80.5], [32.5, 1, 117.5]] },
  koth: { spawn: [88.5, 1, 88.5], box: [84, 84, 120, 120], hill: [101, 5, 101, 103, 5, 103], path: [[95, 2, 95], [97, 3, 97], [99, 4, 99], [100.5, 5, 100.5], [102, 6, 102]] },
  lava: { spawn: [88.5, 1, 12.5], box: [84, 8, 120, 44], lavaFrom: 0, path: LAVA_RING },
};

const MAPS = {
  // a course along z = 11..13 with speed pads at the start and a checkered arch at the finish
  race({ box, set, coin, way }) {
    box(8, 0, 8, 15, 0, 16, B.grass); way.push([11.5, 1, 12.5]);
    for (let z = 9; z <= 15; z++) set(16, 0, z, (z % 2) ? B.neon : B.plastic, z % 2 ? 5 : 0);
    const pad = (x0, x1, y, t = B.plastic, c = 0) => { box(x0, y, 11, x1, y, 13, t, c); way.push([(x0 + x1 + 1) / 2, y + 1, 12.5]); };
    pad(18, 20, 0, B.plastic, 5); pad(23, 25, 1, B.plastic, 6); pad(28, 30, 2, B.plastic, 7); pad(33, 35, 2, B.plastic, 8);
    box(36, 2, 11, 47, 2, 13, B.beltE); way.push([47.5, 3, 12.5]);
    box(48, 2, 11, 52, 2, 13, B.stone); box(50, 2, 11, 52, 2, 13, B.bounce); way.push([49, 3, 12.5]);
    box(54, 6, 10, 60, 6, 14, B.grass); set(58, 6, 12, B.checkpoint); way.push([58.5, 7, 12.5]);
    box(61, 6, 11, 70, 6, 13, B.ice); way.push([70.5, 7, 12.5]); coin(66, 7, 12);
    pad(73, 75, 5, B.plastic, 9); pad(78, 80, 4, B.plastic, 10); pad(83, 85, 3, B.grass); set(84, 3, 12, B.checkpoint);
    box(86, 3, 12, 96, 3, 12, B.crumble); way.push([96.5, 4, 12.5]);
    box(97, 3, 9, 104, 3, 15, B.grass); set(102, 4, 12, B.goal); way.push([102.5, 4, 12.5]);
    // finish arch (checkered) and flags along the course
    box(99, 4, 9, 99, 7, 9, B.neon, 0); box(99, 4, 15, 99, 7, 15, B.neon, 0);
    for (let z = 9; z <= 15; z++) set(99, 8, z, z % 2 ? B.plastic : B.metal, 0);
    for (const x of [24, 44, 64, 84]) { box(x, 0, 17, x, 4, 17, B.wood); set(x, 5, 17, B.neon, [5, 6, 9, 11][(x / 20 | 0) % 4]); }
  },
  // a walled field with pillars, a little fort and bounce pads
  tag({ box, set }) {
    box(8, 0, 84, 44, 0, 120, B.grass);
    for (let x = 8; x <= 44; x++) { set(x, 1, 84, B.wood); set(x, 1, 120, B.wood); }
    for (let z = 84; z <= 120; z++) { set(8, 1, z, B.wood); set(44, 1, z, B.wood); }
    for (const [x, z] of [[16, 92], [34, 92], [16, 112], [34, 112], [25, 96], [25, 108]]) box(x, 1, z, x + 1, 3, z + 1, B.stone);
    box(20, 1, 100, 30, 1, 100, B.brick); box(20, 1, 105, 30, 1, 105, B.brick);
    box(23, 1, 101, 27, 2, 104, B.plastic, 9); box(24, 3, 102, 26, 3, 103, B.plastic, 11);
    for (const [x, z] of [[12, 88], [40, 88], [12, 116], [40, 116]]) set(x, 0, z, B.bounce);
    box(14, 4, 86, 18, 4, 88, B.plastic, 6); box(34, 4, 116, 38, 4, 118, B.plastic, 6);
    // speed strips to get away (or catch up)
    box(11, 0, 101, 13, 0, 104, B.speed); box(39, 0, 101, 41, 0, 104, B.speed);
    // a tunnel to run through
    box(20, 1, 88, 30, 3, 88, B.stone); box(20, 1, 90, 30, 3, 90, B.stone); box(20, 4, 88, 30, 4, 90, B.plastic, 4);
  },
  // paintball: crates to hide behind, a fort in the middle and sniper towers in the corners
  paint({ box, set }) {
    box(8, 0, 76, 56, 0, 120, B.grass);
    for (let x = 8; x <= 56; x++) { box(x, 1, 76, x, 2, 76, B.wood); box(x, 1, 120, x, 2, 120, B.wood); }
    for (let z = 76; z <= 120; z++) { box(8, 1, z, 8, 2, z, B.wood); box(56, 1, z, 56, 2, z, B.wood); }
    // old paint splats on the floor
    for (const [x, z, c] of [[20, 84, 4], [36, 90, 9], [44, 104, 6], [18, 110, 11], [30, 114, 7], [48, 92, 5], [26, 98, 10]]) { box(x, 0, z, x + 1, 0, z + 1, B.plastic, c); set(x + 2, 0, z, B.plastic, c); set(x, 0, z + 2, B.plastic, c); }
    // crates
    for (const [x, z] of [[16, 88], [28, 86], [38, 88], [46, 86], [14, 104], [24, 108], [38, 108], [48, 110], [20, 96], [44, 98], [30, 92], [32, 104]]) box(x, 1, z, x + 1, 2, z + 1, B.wood);
    // the middle fort: a raised floor with walls and a gap on each side
    box(27, 1, 95, 37, 1, 101, B.stone);
    for (let x = 27; x <= 37; x++) if (x < 31 || x > 33) { set(x, 2, 95, B.brick); set(x, 2, 101, B.brick); }
    for (let z = 95; z <= 101; z++) if (z < 97 || z > 99) { set(27, 2, z, B.brick); set(37, 2, z, B.brick); }
    // sniper towers: bounce up onto the deck
    for (const [x, z, s] of [[11, 79, 1], [50, 79, 1], [11, 114, -1], [50, 114, -1]]) {
      box(x, 1, z, x + 2, 3, z + 2, B.stone);
      box(x - 1, 4, z - 1, x + 3, 4, z + 3, B.plastic, 11);
      const bz = s > 0 ? z + 5 : z - 5;
      box(x, 1, bz, x + 2, 1, bz + 2, B.bounce);
    }
  },
  // king of the hill: a stepped pyramid with a glowing top
  koth({ box, set }) {
    box(84, 0, 84, 120, 0, 120, B.sand);
    box(94, 1, 94, 110, 1, 110, B.stone); box(96, 2, 96, 108, 2, 108, B.stone); box(98, 3, 98, 106, 3, 106, B.brick); box(100, 4, 100, 104, 4, 104, B.brick);
    box(101, 5, 101, 103, 5, 103, B.goal);
    for (const [x, z] of [[88, 100], [116, 104], [100, 116], [104, 88]]) set(x, 0, z, B.bounce);
    for (const [x, z] of [[100, 100], [104, 100], [100, 104], [104, 104]]) set(x, 4, z, B.neon, 6);
    // palm trees and speed strips around the base
    for (const [x, z] of [[87, 87], [117, 87], [87, 117], [117, 117]]) { box(x, 1, z, x, 5, z, B.wood); box(x - 1, 6, z - 1, x + 1, 6, z + 1, B.leaves); }
    box(90, 0, 101, 92, 0, 103, B.speed); box(112, 0, 101, 114, 0, 103, B.speed);
  },
  // rising lava: a tower to climb around (and a few crumbly steps), the lava comes up from the floor
  lava({ box }) {
    box(84, 0, 8, 120, 0, 44, B.stone);
    const ring = [];
    for (const x of [95, 99, 103]) ring.push([x, 31]);
    for (const z of [31, 27, 23]) ring.push([107, z]);
    for (const x of [107, 103, 99]) ring.push([x, 19]);
    for (const z of [19, 23, 27]) ring.push([95, z]);
    let y = 1;
    for (let i = 1; i <= 26; i++) {
      const [x, z] = ring[i % 12];
      box(x, y, z, x + 1, y, z + 1, i % 7 === 0 ? B.crumble : B.plastic, [5, 6, 7, 8, 9, 10, 11][i % 7]);
      y++;
    }
    box(98, 0, 22, 105, y, 29, B.stone);
    box(99, y + 1, 23, 104, y + 1, 28, B.neon, 6);
    // stepping stones out on the floor
    for (const [x, z, h] of [[88, 36, 1], [90, 40, 2], [114, 36, 1], [116, 40, 2], [114, 12, 1], [88, 20, 1]]) box(x, 1, z, x + 1, h, z + 1, B.plastic, 4);
    // warning stripes around the edge
    for (let x = 84; x <= 120; x += 2) { box(x, 1, 8, x, 1, 8, B.plastic, 7); box(x, 1, 44, x, 1, 44, B.plastic, 7); }
  },
};
const mgWorld = (game, name, sky, color, blurb) => make({
  id: 'mg-' + game, name, mode: 'hangout', sky, game, blurb, lobby: [64.5, 1, 64.5], shop: [69.5, 1, 56.5], areas: { [game]: AREAS[game] },
}, (api) => { lobby(api, color); MAPS[game](api); });
export const MG_RACE = mgWorld('race', 'Race', 'day', 5, 'Wait in the lobby, then race the course. First to the goal wins.');
export const MG_TAG = mgWorld('tag', 'Tag', 'sunset', 4, "Don't get tagged. Whoever gets tagged is IT too.");
export const MG_PAINT = mgWorld('paint', 'Paintball', 'day', 11, 'Pick a blaster in the lobby, then splat everyone. Most splats wins.');
export const MG_KOTH = mgWorld('koth', 'King of the Hill', 'sunset', 6, 'Hold the glowing hilltop the longest.');
export const MG_LAVA = mgWorld('lava', 'Rising Lava', 'night', 7, 'Climb before the lava gets you.');

// Tycoon: your own town (everyone gets their own private server). The Town Hall and houses on the left of the road,
// the vault, factories, car factories and grocery shops on the right, and the gold mine at the end. The buildings
// come from your saved town (see tycoon.js); this is just the empty land with a glowing pad in front of every lot.
export const TYCOON = make({ id: 'tycoon', name: 'Tycoon', mode: 'hangout', sky: 'day', own: true, tycoon: true,
  blurb: 'Your own town that makes real coins. Spend coins on houses, factories, car factories and shops, collect taxes, and watch it grow. Up to 2000 a day!' }, ({ box, set }) => {
  box(24, 0, 16, 104, 0, 110, B.grass);
  box(61, 0, 18, 67, 0, 90, B.stone);               // main road
  box(58, 0, 16, 70, 0, 18, B.stone);               // the town square by the entrance
  box(56, 0, 90, 72, 0, 106, B.dirt);               // the mine lot
  set(64, 1, 21, B.spawn);
  // lots: a dirt floor for each one, and its pad on the road
  for (const sp of SPOTS) {
    if (sp.kind !== 'mine') box(sp.x0, 0, sp.z0, sp.x0 + sp.w - 1, 0, sp.z0 + sp.w - 1, B.sand);
    set(sp.pad[0], sp.pad[1], sp.pad[2], B.tclaim, padColor(sp));
  }
  set(COLLECT_PAD[0], COLLECT_PAD[1], COLLECT_PAD[2], B.tclaim, 6);
  // a fence around town, lamps along the road, trees
  for (let x = 24; x <= 104; x++) { set(x, 1, 16, B.wood); set(x, 1, 110, B.wood); }
  for (let z = 16; z <= 110; z++) { set(24, 1, z, B.wood); set(104, 1, z, B.wood); }
  for (let z = 34; z <= 86; z += 10) for (const x of [60, 68]) { box(x, 1, z, x, 3, z, B.metal); set(x, 4, z, B.neon, 6); }
  for (const [x, z] of [[30, 24], [40, 20], [90, 22], [98, 30], [32, 96], [44, 104], [88, 100], [98, 90], [30, 60], [98, 60]]) tree(box, x, 1, z, 4);
  box(56, 1, 18, 57, 1, 19, B.plastic, 6); box(71, 1, 18, 72, 1, 19, B.plastic, 6); // gold blocks at the gate
});

// Snowy Town: a place to hang out, like a little penguin town. A dance club with a flashing disco floor,
// a coffee shop, a gift shop with the shop keeper, a ski hill, a frozen pond to slide around on,
// igloos, a snowball fort, and snowball fights everywhere (click or X).
export const TOWN = make({ id: 'town', name: 'Snowy Town', mode: 'hangout', sky: 'day', snow: true, shop: [101.5, 1, 46.5],
  blurb: 'A snowy hangout: dance club, coffee shop, ski hill, frozen pond and snowball fights. Click or press X to throw!' }, ({ box, set, coin }) => {
  box(14, 0, 14, 113, 0, 113, B.snow);
  // town square with a big tree
  box(52, 0, 52, 76, 0, 76, B.stone); box(56, 0, 56, 72, 0, 72, B.brick); set(64, 0, 70, B.spawn);
  box(64, 1, 62, 64, 3, 62, B.wood);
  for (let i = 0; i < 4; i++) box(62 + i / 2 | 0, 4 + i * 2, 60 + i / 2 | 0, 66 - (i / 2 | 0), 5 + i * 2, 64 - (i / 2 | 0), B.leaves);
  set(64, 12, 62, B.neon, 6);
  for (const [x, z, c] of [[60, 58, 4], [68, 58, 9], [60, 66, 6], [68, 66, 11]]) set(x, 7, z, B.neon, c);
  for (const [x, z] of [[53, 53], [75, 53], [53, 75], [75, 75]]) { box(x, 1, z, x, 3, z, B.wood); set(x, 4, z, B.neon, 6); }
  // the dance club (north-west)
  box(24, 0, 24, 46, 0, 44, B.metal); box(28, 0, 28, 42, 0, 40, B.disco);
  for (let y = 1; y <= 6; y++) for (let x = 24; x <= 46; x++) for (const z of [24, 44]) if (!(z === 44 && x >= 33 && x <= 37 && y <= 4)) set(x, y, z, y === 6 ? B.neon : B.brick, 10);
  for (let y = 1; y <= 6; y++) for (let z = 24; z <= 44; z++) { set(24, y, z, y === 6 ? B.neon : B.brick, 10); set(46, y, z, y === 6 ? B.neon : B.brick, 10); }
  box(24, 7, 24, 46, 7, 44, B.metal);
  box(31, 1, 25, 39, 2, 26, B.metal); box(33, 3, 25, 37, 3, 25, B.neon, 11);
  for (const x of [28, 42]) { box(x, 1, 25, x + 1, 4, 26, B.plastic, 3); set(x, 3, 27, B.neon, 8); }
  for (const [x, z, c] of [[30, 30, 4], [40, 30, 9], [30, 38, 6], [40, 38, 7], [35, 34, 11]]) set(x, 6, z, B.neon, c);
  box(32, 5, 45, 38, 5, 45, B.neon, 11);
  // coffee shop (north-east)
  box(82, 0, 24, 102, 0, 42, B.wood);
  for (let y = 1; y <= 5; y++) {
    for (let x = 82; x <= 102; x++) { set(x, y, 24, B.wood); if (!(x >= 90 && x <= 94 && y <= 3)) set(x, y, 42, (y === 3 && (x % 4 === 0)) ? B.glass : B.wood, 9); }
    for (let z = 24; z <= 42; z++) { set(82, y, z, (y === 3 && z % 4 === 0) ? B.glass : B.wood, 9); set(102, y, z, (y === 3 && z % 4 === 0) ? B.glass : B.wood, 9); }
  }
  box(82, 6, 24, 102, 6, 42, B.brick);
  box(85, 1, 26, 99, 2, 27, B.wood); box(85, 3, 26, 99, 3, 27, B.plastic, 13);
  for (const x of [88, 92, 96]) set(x, 4, 26, B.plastic, 12);
  for (const [x, z] of [[87, 32], [93, 32], [99, 32], [87, 37], [93, 37], [99, 37]]) { set(x, 1, z, B.wood); box(x - 1, 2, z - 1, x + 1, 2, z + 1, B.plastic, 0); set(x, 3, z, B.plastic, 12); }
  box(90, 7, 38, 94, 7, 38, B.neon, 13);
  // gift shop (east)
  box(97, 0, 44, 105, 0, 52, B.stone);
  for (let y = 1; y <= 7; y++) for (let x = 97; x <= 105; x++) set(x, y, 44, B.plastic, 11);
  for (let y = 1; y <= 7; y++) for (let z = 44; z <= 49; z++) { set(97, y, z, B.plastic, 11); set(105, y, z, B.plastic, 11); }
  box(97, 8, 44, 105, 8, 49, B.plastic, 6);
  // ski hill (south-west) with an icy slide down
  for (let k = 0; k <= 8; k++) box(22 + k, k, 80 + k, 46 - k, k, 104 - k, B.snow);
  for (let k = 1; k <= 8; k++) box(47 - k, k - 1, 90, 47 - k, k - 1, 92, B.ice);
  for (const [x, z] of [[22, 80], [46, 80], [22, 104], [46, 104]]) { box(x, 1, z, x, 2, z, B.wood); box(x - 1, 3, z - 1, x + 1, 5, z + 1, B.leaves); set(x, 6, z, B.snow); }
  coin(34, 10, 88);
  // frozen pond (south-east): slide around!
  box(80, 0, 78, 106, 0, 100, B.ice);
  for (let x = 80; x <= 106; x += 2) { set(x, 1, 78, B.snow); set(x, 1, 100, B.snow); }
  coin(93, 1, 89);
  // igloos
  const igloo = (x, z) => { box(x - 3, 1, z - 3, x + 3, 2, z + 3, B.snow); box(x - 2, 3, z - 2, x + 2, 3, z + 2, B.snow); box(x - 1, 4, z - 1, x + 1, 4, z + 1, B.snow); box(x - 2, 1, z - 2, x + 2, 2, z + 2, 0); box(x, 1, z + 3, x, 2, z + 3, 0); };
  igloo(20, 58); igloo(20, 70); igloo(108, 88);
  // snowball fort: two walls to hide behind
  box(52, 1, 84, 62, 2, 84, B.snow); box(66, 1, 92, 76, 2, 92, B.snow); box(52, 1, 88, 53, 1, 90, B.snow2); box(75, 1, 86, 76, 1, 88, B.snow2);
  // a path between everything
  box(62, 0, 44, 66, 0, 52, B.stone); box(62, 0, 76, 66, 0, 106, B.stone); box(76, 0, 62, 108, 0, 66, B.stone); box(46, 0, 62, 52, 0, 66, B.stone);
});

export const WORLDS3D = [PLAZA, TOWN, MG_RACE, MG_TAG, MG_PAINT, MG_KOTH, MG_LAVA, TYCOON, SUNNY, TOWER, LAVA, FACTORY, SKY];
export const builtinWorld = (id) => WORLDS3D.find((w) => w.id === id) || null;
