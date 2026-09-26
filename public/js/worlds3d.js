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
  // bounce tower lookout
  box(36, 1, 78, 38, 1, 80, B.bounce); box(34, 7, 84, 40, 7, 90, B.plastic, 9); box(36, 8, 86, 38, 8, 88, B.bounce);
  box(35, 14, 92, 39, 14, 96, B.plastic, 6);
  for (let i = 0; i < 4; i++) box(34 + i * 2, 15, 92, 34 + i * 2, 15, 92, B.neon, [4, 6, 7, 9][i]);
  // a little parkour loop with colored blocks
  const hops = [[86, 2, 36], [89, 3, 38], [92, 4, 36], [94, 5, 33], [91, 6, 30], [87, 7, 31], [84, 8, 33]];
  hops.forEach(([x, y, z], i) => box(x, y, z, x + 1, y, z + 1, B.plastic, [5, 6, 7, 8, 9, 10, 11][i]));
  box(80, 8, 30, 83, 8, 36, B.plastic, 0);
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

export const WORLDS3D = [PLAZA, SUNNY, TOWER, LAVA];
export const builtinWorld = (id) => WORLDS3D.find((w) => w.id === id) || null;
