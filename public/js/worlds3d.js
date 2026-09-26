// The built-in 3D worlds: the Plaza (everyone hangs out here) and three obbies.
// Each one is built by code the first time it's needed. `way` is the route the test bot follows.
import { Grid, B, encodeBlocks } from './world.js';

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

export const PLAZA = make({ id: 'plaza', name: 'Blockyard Plaza', mode: 'hangout', sky: 'day', blurb: 'Hang out, chat and show off your look. Everyone starts here.' }, ({ box, set }) => {
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
  for (const [x, z] of [[40, 40], [88, 40], [40, 88], [88, 88], [34, 56], [94, 72], [56, 34], [72, 94], [46, 70], [82, 56]]) tree(box, x, 1, z, 4 + ((x + z) % 3));
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

export const SKY = make({ id: 'sky', name: 'Sky Gauntlet', mode: 'obby', sky: 'night', reward: 250, blurb: 'The hardest one. Tiny blocks in the sky, a moving platform, ice, crumbling blocks, a bounce and an elevator. Nothing underneath.' }, ({ box, coin, set, way }) => {
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

// The Minigame Arena: a lobby in the middle and one area for each game. The live room picks the next
// game after every round, sends everyone to that area, and back to the lobby when it's over.
export const ARENA = make({
  id: 'arena', name: 'Minigame Arena', mode: 'hangout', sky: 'day', game: 'mix',
  blurb: 'Race, Tag, King of the Hill and Rising Lava, one round after another. Win rounds for coins!',
  lobby: [64.5, 1, 64.5],
  areas: {
    race: { spawn: [11.5, 1, 12.5], box: [4, 4, 112, 20] },
    tag: { spawn: [26.5, 1, 102.5], box: [8, 84, 44, 120] },
    koth: { spawn: [88.5, 1, 88.5], box: [84, 84, 120, 120], hill: [101, 5, 101, 103, 5, 103] },
    lava: { spawn: [88.5, 1, 12.5], box: [84, 8, 120, 44], lavaFrom: 0 },
  },
}, ({ box, set, coin, way }) => {
  // lobby
  box(52, 0, 52, 76, 0, 76, B.grass); box(56, 0, 56, 72, 0, 72, B.stone); set(64, 0, 64, B.spawn);
  for (const [x, z, c] of [[56, 56, 4], [72, 56, 6], [56, 72, 9], [72, 72, 7]]) box(x, 1, z, x, 3, z, B.neon, c);
  // race course (east along z = 11..13)
  box(8, 0, 8, 15, 0, 16, B.grass); way.push([11.5, 1, 12.5]);
  const pad = (x0, x1, y, t = B.plastic, c = 0) => { box(x0, y, 11, x1, y, 13, t, c); way.push([(x0 + x1 + 1) / 2, y + 1, 12.5]); };
  pad(18, 20, 0, B.plastic, 5); pad(23, 25, 1, B.plastic, 6); pad(28, 30, 2, B.plastic, 7); pad(33, 35, 2, B.plastic, 8);
  box(36, 2, 11, 47, 2, 13, B.beltE); way.push([47.5, 3, 12.5]);
  box(48, 2, 11, 52, 2, 13, B.stone); box(50, 2, 11, 52, 2, 13, B.bounce); way.push([49, 3, 12.5]);
  box(56, 6, 10, 60, 6, 14, B.grass); set(58, 6, 12, B.checkpoint); way.push([58.5, 7, 12.5]);
  box(61, 6, 11, 70, 6, 13, B.ice); way.push([70.5, 7, 12.5]); coin(66, 7, 12);
  pad(73, 75, 5, B.plastic, 9); pad(78, 80, 4, B.plastic, 10); pad(83, 85, 3, B.grass); set(84, 3, 12, B.checkpoint);
  box(86, 3, 12, 96, 3, 12, B.crumble); way.push([96.5, 4, 12.5]);
  box(97, 3, 9, 104, 3, 15, B.grass); set(102, 4, 12, B.goal); way.push([102.5, 4, 12.5]);
  // tag arena: a walled field with things to run around and over
  box(8, 0, 84, 44, 0, 120, B.grass);
  for (let x = 8; x <= 44; x++) { set(x, 1, 84, B.wood); set(x, 1, 120, B.wood); }
  for (let z = 84; z <= 120; z++) { set(8, 1, z, B.wood); set(44, 1, z, B.wood); }
  for (const [x, z] of [[16, 92], [34, 92], [16, 112], [34, 112], [25, 96], [25, 108]]) box(x, 1, z, x + 1, 3, z + 1, B.stone);
  box(20, 1, 100, 30, 1, 100, B.brick); box(20, 1, 105, 30, 1, 105, B.brick);
  box(23, 1, 101, 27, 2, 104, B.plastic, 9); box(24, 3, 102, 26, 3, 103, B.plastic, 11);
  for (const [x, z] of [[12, 88], [40, 88], [12, 116], [40, 116]]) set(x, 0, z, B.bounce);
  box(14, 4, 86, 18, 4, 88, B.plastic, 6); box(34, 4, 116, 38, 4, 118, B.plastic, 6);
  // king of the hill: a stepped pyramid with a glowing top
  box(84, 0, 84, 120, 0, 120, B.sand);
  box(94, 1, 94, 110, 1, 110, B.stone); box(96, 2, 96, 108, 2, 108, B.stone); box(98, 3, 98, 106, 3, 106, B.brick); box(100, 4, 100, 104, 4, 104, B.brick);
  box(101, 5, 101, 103, 5, 103, B.goal);
  for (const [x, z] of [[88, 100], [116, 104], [100, 116], [104, 88]]) set(x, 0, z, B.bounce);
  // rising lava: a tower to climb around (and a few crumbly steps), the lava comes up from the floor
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
  // stepping stones out on the lava floor
  for (const [x, z, h] of [[88, 36, 1], [90, 40, 2], [114, 36, 1], [116, 40, 2], [114, 12, 1], [88, 20, 1]]) box(x, 1, z, x + 1, h, z + 1, B.plastic, 4);
});

export const WORLDS3D = [PLAZA, ARENA, SUNNY, TOWER, LAVA, FACTORY, SKY];
export const builtinWorld = (id) => WORLDS3D.find((w) => w.id === id) || null;
