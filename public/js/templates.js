// Starting points for new levels and worlds: a blank one, or a small ready-made one to change.
import { Grid, B, encodeBlocks, emptyWorld } from './world.js';
import { tycoonPlot } from './worlds3d.js';
import { BUILTIN } from './levels.js';
import { newLevel } from './editor.js';

/* ---------------- 3D worlds ---------------- */
function world(n, mode, sky, draw, extra = {}) {
  const g = new Grid();
  const box = (x0, y0, z0, x1, y1, z1, t, c = 0) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g.set(x, y, z, t, c); };
  const set = (x, y, z, t, c = 0) => g.set(x, y, z, t, c);
  draw({ box, set, g });
  return { v: 1, n, mode, sky, ...extra, b: encodeBlocks(g) };
}
export const TEMPLATES_3D = {
  obby: { name: 'Obby', info: 'A course with a goal at the end.', make: () => emptyWorld('obby') },
  hangout: { name: 'Hangout', info: 'A place to chill and chat.', make: () => emptyWorld('hangout') },
  race: {
    name: 'Race', info: 'Minigame: first to the goal wins.', make: () => world('My race', 'hangout', 'day', ({ box, set }) => {
      box(50, 0, 58, 60, 0, 70, B.grass); set(53, 1, 64, B.spawn);
      for (let k = 0; k < 6; k++) box(63 + k * 5, k % 2, 61, 65 + k * 5, k % 2, 67, B.plastic, 5 + k);
      box(93, 1, 58, 100, 1, 70, B.grass); box(96, 2, 63, 97, 2, 65, B.goal);
    }, { game: 'race' }),
  },
  tag: {
    name: 'Tag', info: "Minigame: don't get tagged.", make: () => world('My tag arena', 'hangout', 'sunset', ({ box, set }) => {
      box(46, 0, 46, 82, 0, 82, B.grass); set(64, 1, 64, B.spawn);
      for (let i = 46; i <= 82; i++) { set(i, 1, 46, B.wood); set(i, 1, 82, B.wood); set(46, 1, i, B.wood); set(82, 1, i, B.wood); }
      for (const [x, z] of [[54, 54], [74, 54], [54, 74], [74, 74]]) box(x, 1, z, x + 1, 3, z + 1, B.stone);
      for (const [x, z] of [[50, 64], [78, 64]]) set(x, 0, z, B.bounce);
    }, { game: 'tag' }),
  },
  koth: {
    name: 'King of the Hill', info: 'Minigame: hold the hill (the goal blocks).', make: () => world('My hill', 'hangout', 'sunset', ({ box, set }) => {
      box(44, 0, 44, 84, 0, 84, B.sand); set(48, 1, 48, B.spawn);
      box(56, 1, 56, 72, 1, 72, B.stone); box(58, 2, 58, 70, 2, 70, B.stone); box(60, 3, 60, 68, 3, 68, B.brick); box(63, 4, 63, 65, 4, 65, B.goal);
    }, { game: 'koth' }),
  },
  lava: {
    name: 'Rising Lava', info: 'Minigame: climb before the lava gets you.', make: () => world('My lava tower', 'hangout', 'night', ({ box, set }) => {
      box(48, 0, 48, 80, 0, 80, B.stone); set(52, 1, 52, B.spawn);
      const ring = [[58, 58], [62, 58], [66, 58], [70, 58], [70, 62], [70, 66], [70, 70], [66, 70], [62, 70], [58, 70], [58, 66], [58, 62]];
      for (let i = 0; i < 24; i++) { const [x, z] = ring[i % 12]; box(x, i + 1, z, x + 1, i + 1, z + 1, B.plastic, 4 + (i % 8)); }
      box(62, 0, 62, 66, 24, 66, B.stone); box(62, 25, 62, 66, 25, 66, B.neon, 6);
    }, { game: 'lava' }),
  },
  paint: {
    name: 'Paintball', info: 'Minigame: splat everyone.', make: () => world('My paintball arena', 'hangout', 'day', ({ box, set }) => {
      box(40, 0, 44, 88, 0, 84, B.grass); set(64, 1, 64, B.spawn);
      for (const [x, z] of [[48, 52], [58, 50], [70, 52], [80, 50], [48, 76], [60, 78], [72, 76], [80, 78], [54, 64], [74, 64]]) box(x, 1, z, x + 1, 2, z + 1, B.wood);
    }, { game: 'paint' }),
  },
  tycoon: {
    name: 'Tycoon', info: 'Minigame: claim a plot, earn cash, build it up.', make: () => world('My tycoon', 'hangout', 'day', (api) => {
      const { box, set } = api;
      box(38, 0, 56, 90, 0, 62, B.stone); set(64, 1, 58, B.spawn);
      tycoonPlot(api, 40, 64, 4); tycoonPlot(api, 66, 64, 9);
    }, { game: 'tycoon' }),
  },
  logic: {
    name: 'Logic demo', info: 'An obby with a Trigger pad that opens a Switch door.', make: () => world('My logic obby', 'obby', 'day', ({ box, set }) => {
      box(52, 0, 58, 86, 0, 70, B.grass); set(55, 1, 64, B.spawn);
      for (let z = 60; z <= 68; z++) box(70, 1, z, 70, 4, z, B.switchOn, 4);
      box(62, 1, 62, 63, 1, 66, B.trigger, 4);
      set(82, 1, 64, B.goal);
    }, { logic: [
      { on: 'start', do: [{ k: 'say', text: 'Walk into the red Trigger pad to open the red door!' }] },
      { on: 'touch', c: 4, do: [{ k: 'hide', c: 4 }, { k: 'sound', s: 'badge' }, { k: 'say', text: 'The door is open for 5 seconds. Run!' }, { k: 'wait', n: 5 }, { k: 'show', c: 4 }] },
    ] }),
  },
};

/* ---------------- 2D levels ---------------- */
// "Nebula starter": the first part of Hyperdrive (fast hopper, then a spiked jet tunnel) to learn from and change.
function nebulaStarter() {
  const src = BUILTIN.find((b) => b.id === 'b-hyper');
  const cut = 265, w = cut + 9;
  const rows = src.rows.map((r, y) => {
    let row = r.slice(0, cut);
    const tail = y >= 14 ? '#########' : y <= 0 ? '....G....' : '....G....';
    return row + tail;
  });
  const lv = newLevel('rush');
  return { ...lv, n: 'My nebula run', style: 'rush', theme: 'night', form: 'hopper', speed: '>', w, h: rows.length, d: rows.join('') };
}
export const TEMPLATES_2D = {
  adventure: { name: 'Adventure', info: 'Run and jump to the goal.', make: () => newLevel('adventure') },
  rush: { name: 'Rush', info: 'You run by yourself, tap to survive.', make: () => newLevel('rush') },
  nebula: { name: 'Nebula starter', info: 'A fast, hard rush level (the start of Hyperdrive) to change.', make: nebulaStarter },
};
