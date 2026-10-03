// Sunset Beach: Blockyard's show-off world for Engine v2. It uses every part of the engine on purpose
// (a stress test): thousands of parts in every shape and material, a big rolling sea you can swim in, grass
// dunes, moving and spinning parts that carry players, lights, coins, bounce and speed pads, and Blockscript
// (volleyball, a shell hunt, a lift, a flickering bonfire, fireworks). Everything is made by this code, the same
// way every time. Makers can read the script at the bottom to learn from it.

const G = 20;      // the height of the dry sand
const SEA = 19.1;  // the top of the water

export const BEACH_SCRIPT = `// Sunset Beach: the script that runs this world.
hits = 0
side = -1
shells = 0
liftBusy = false
colors = ["red", "yellow", "green", "cyan", "purple", "pink"]
board("Volleyball", 0)
board("Shells", "0 / 6")

on start {
  say("Welcome to Sunset Beach! Swim, ride the boat, hit the volleyball and find 6 shells.")
}

// Volleyball: walk into the ball to hit it over the net. It lands on the other side.
on touch "Ball" {
  ball = part("Ball")
  hits += 1
  board("Volleyball", hits)
  sound("bounce")
  side = 0 - side
  ball.moveTo(470, ${G + 7}, 532, 0.35)
  wait(0.35)
  ball.moveTo(470 + side * 6, ${G + 1.4}, 532 + random(-3, 3), 0.45)
  wait(0.45)
}

// Shell hunt: there are 6 pink shells. This finds the one you're standing at and picks it up.
on touch "Shell" {
  near = nil
  best = 6
  for s in parts("Shell") {
    d = abs(s.x - player.x) + abs(s.z - player.z)
    if not s.hidden and d < best {
      best = d
      near = s
    }
  }
  if near != nil {
    near.hide()
    shells += 1
    board("Shells", shells + " / 6")
    sound("coin")
    if shells == 6 {
      say("You found every shell! Fireworks!")
      fireworks()
    }
  }
}

fn fireworks() {
  repeat 14 {
    for t in parts("Torch") {
      t.color(colors[random(0, 5)])
    }
    sound("pop")
    wait(0.25)
  }
  for t in parts("Torch") {
    t.color("orange")
  }
}

// The lift up the water slide tower
on touch "Lift" {
  if not liftBusy {
    liftBusy = true
    lift = part("Lift")
    lift.move(0, 15, 0, 3)
    wait(6)
    lift.move(0, -15, 0, 3)
    wait(3.5)
    liftBusy = false
  }
}

// The bonfire flickers
every 0.15 {
  fire = part("Fire")
  fire.size(2 + random() * 0.5, 2.6 + random() * 0.9, 2 + random() * 0.5)
  fire.glow(0.6 + random() * 0.4)
}

on touch "Fire" {
  say("Hot!")
  launch(0, 12, 6)
}
`;

export function beachWorld() {
  // the same "random" numbers every time
  let seed = 20261003;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const R = (a, b) => a + rnd() * (b - a);
  const pick = (l) => l[Math.floor(rnd() * l.length)];
  const r2 = (v) => Math.round(v * 100) / 100;
  const parts = [];
  const P = (s, p, z, c, m, x = {}) => { parts.push({ s, p: p.map(r2), z: z.map(r2), r: (x.r || [0, 0, 0]).map(r2), c, m, ...Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'r')) }); };
  const SAND = '#e9d3a0', WOOD = '#a9743f', DARK = '#7b4f2a', LEAF = '#3f9b4a', ROCK = '#8d99ae';

  /* ---------------- the land and the sea ---------------- */
  P('box', [500, G - 4, 450], [400, 8, 200], SAND, 'sand');                       // the dry beach
  P('wedge', [500, G - 4, 585], [400, 8, 70], SAND, 'sand');                      // the slope into the sea (high side north)
  P('box', [500, G - 8.5, 650], [400, 1, 260], '#d8c08a', 'sand');                // the sea floor
  P('box', [500, (SEA + G - 9) / 2, 655], [400, SEA - (G - 9), 250], '#2a9fd6', 'water', { n: 'Sea' });
  P('box', [500, G - 0.42, 554], [400, 0.1, 9], '#c9b27e', 'smooth', { r: [6.5, 0, 0], nc: true });             // wet sand at the water line
  // the meadow behind the beach, and grassy dunes: real blades of grass grow on all of it
  P('box', [500, G + 0.25, 395], [400, 0.5, 90], '#5fc76b', 'grass');
  for (let i = 0; i < 16; i++) { const w = R(14, 34); P('cyl', [R(320, 680), G + R(-0.5, 0.2), R(445, 478)], [w, R(1.2, 2.6), w * R(0.6, 1)], pick(['#5fc76b', '#6fcf6a', '#52b85f']), 'grass'); }
  for (let i = 0; i < 7; i++) P('wedge', [R(330, 670), G + 0.9, R(380, 430)], [R(16, 30), 2, R(12, 20)], '#58c067', 'grass', { r: [0, pick([0, 90, 180, 270]), 0] });

  for (const [x, z, a] of [[438, 486, 0], [562, 486, 90], [562, 524, 180], [438, 524, 270]]) P('corner', [x, G + 0.7, z], [9, 1.4, 9], '#62c46c', 'grass', { r: [0, a, 0] }); // grassy corner mounds around the boardwalk

  /* ---------------- spawn + boardwalk ---------------- */
  for (let x = 440; x <= 560; x += 2) P('box', [x, G + 0.2, 505], [1.85, 0.4, 8], rnd() < 0.5 ? WOOD : '#b98250', 'planks');
  P('box', [500, G + 0.45, 505], [5, 0.12, 5], '#7cc8ff', 'smooth', { k: 'spawn' });
  P('box', [452, G + 0.42, 505], [6, 0.1, 6], '#44c06a', 'neon', { k: 'speed', g: 0.5 });
  P('box', [548, G + 0.42, 505], [6, 0.1, 6], '#44c06a', 'neon', { k: 'speed', g: 0.5 });
  for (let x = 440; x <= 560; x += 6) for (const z of [500.6, 509.4]) { P('cyl', [x, G + 1.1, z], [0.4, 1.6, 0.4], DARK, 'wood'); }
  for (const z of [500.6, 509.4]) for (let x = 443; x < 560; x += 6) { if (z > 505 && Math.abs(x - 500) < 7) continue; P('box', [x, G + 1.6, z], [5.6, 0.15, 0.15], '#f1e2c0', 'fabric'); }
  // tiki torches (they glow and light the boardwalk; the fireworks change their colors)
  for (let x = 446; x <= 554; x += 18) for (const z of [499.5, 510.5]) {
    P('cyl', [x, G + 1.9, z], [0.3, 3.2, 0.3], DARK, 'wood');
    P('cone', [x, G + 4, z], [0.9, 1.3, 0.9], '#ff7b25', 'neon', { n: 'Torch', g: 1, nc: true, lt: { r: 11, b: 1.3 } });
  }

  /* ---------------- the pier, with lamps, out to the diving board ---------------- */
  for (let z = 512; z <= 628; z += 1.6) P('box', [500, G + 0.2, z], [6, 0.35, 1.45], rnd() < 0.5 ? WOOD : '#b98250', 'planks');
  for (let z = 548; z <= 628; z += 10) for (const x of [497.3, 502.7]) P('cyl', [x, G - 4.5, z], [0.7, 10, 0.7], DARK, 'wood');
  for (let z = 520; z <= 620; z += 20) {
    P('cyl', [503.2, G + 2.2, z], [0.25, 4, 0.25], '#3b3f55', 'metal');
    P('ball', [503.2, G + 4.5, z], [0.9, 0.9, 0.9], '#ffe9a8', 'neon', { g: 1, lt: { r: 13, b: 1.2 } });
  }
  P('box', [500, G + 0.45, 633], [3, 0.3, 8], '#ff5d8f', 'smooth', { k: 'bounce' });  // the diving board
  P('box', [500, G - 0.2, 629], [8, 0.5, 4], WOOD, 'planks');

  /* ---------------- palm trees ---------------- */
  const palm = (x, z, h, lean, turn) => {
    const c = Math.cos(turn), s = Math.sin(turn), seg = 6;
    let tx = x, tz = z;
    for (let i = 0; i < seg; i++) {
      const k = (i + 0.5) / seg, off = lean * k * k * h * 0.5;
      tx = x + c * off; tz = z + s * off;
      P('cyl', [tx, G + k * h, tz], [0.95 - i * 0.07, h / seg + 0.25, 0.95 - i * 0.07], i % 2 ? '#8b6239' : '#9a6e42', 'wood', { r: [s * lean * 14 * k, 0, -c * lean * 14 * k] });
    }
    const top = G + h + 0.2, n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 360 + R(-10, 10), ar = a * Math.PI / 180, len = R(4.2, 5.6);
      const droop = R(14, 30);
      P('wedge', [tx + Math.sin(ar) * len * 0.42, top - 0.2 - Math.sin(droop * Math.PI / 180) * len * 0.42, tz - Math.cos(ar) * len * 0.42], [1.7, 0.7, len], pick([LEAF, '#4aa855', '#378f43', '#56b660']), 'fabric', { r: [-droop, a + 180, 0], nc: true });
    }
    for (let i = 0; i < 3; i++) P('ball', [tx + R(-0.6, 0.6), top - 0.5, tz + R(-0.6, 0.6)], [0.6, 0.6, 0.6], '#6b4423', 'wood', { nc: true });
  };
  const palmSpots = [];
  for (let i = 0; i < 26; i++) {
    let x, z, ok = false;
    for (let t = 0; t < 30 && !ok; t++) { x = R(322, 678); z = R(486, 538); ok = Math.abs(z - 505) > 7 && Math.abs(x - 500) > 8 && !(x > 455 && x < 485 && z > 522 && z < 542) && !palmSpots.some((p) => Math.hypot(p[0] - x, p[1] - z) < 9) && !(x > 420 && x < 442 && z > 520); }
    if (ok) { palmSpots.push([x, z]); palm(x, z, R(7, 11), R(0.1, 0.5), R(0, 6.28)); }
  }

  /* ---------------- rocks, in the sand and in the water ---------------- */
  for (let i = 0; i < 70; i++) { const s = R(0.6, 3.2), z = R(540, 660), x = R(310, 690); if (Math.abs(x - 500) < 6) continue; P('ball', [x, Math.max(G - 8, G - (z - 550) * 0.114) + s * 0.2, z], [s, s, s], pick([ROCK, '#7a8499', '#9aa3b5', '#6f7689']), 'stone'); }

  /* ---------------- umbrellas, towels and chairs ---------------- */
  const BRIGHT = ['#e63946', '#ff7b25', '#ffd23f', '#3a86ff', '#9b5de5', '#ff5d8f', '#4cc9f0', '#f5f5f5'];
  for (let i = 0; i < 16; i++) {
    const x = 330 + i * 22 + R(-3, 3), z = R(516, 538);
    if (Math.abs(x - 500) < 9 || (x > 452 && x < 488) || (x > 418 && x < 444)) continue;
    P('cyl', [x, G + 1.7, z], [0.25, 3.4, 0.25], '#f5f5f5', 'metal');
    P('cone', [x, G + 3.7, z], [6, 1.5, 6], pick(BRIGHT), 'fabric', i % 4 === 0 ? { mo: { t: 'spin', d: [0, 30, 0], s: 1 } } : {});
    P('box', [x + 2.2, G + 0.06, z + 0.6], [2, 0.1, 4.2], pick(BRIGHT), 'fabric', { r: [0, R(-25, 25), 0] });
    if (i % 2) { P('box', [x - 2.4, G + 0.5, z + 1], [1.6, 0.25, 2.6], '#f5f5f5', 'smooth'); P('wedge', [x - 2.4, G + 1.05, z - 0.9], [1.6, 1.1, 1.4], '#f5f5f5', 'smooth'); }
  }

  /* ---------------- beach volleyball (scripted) ---------------- */
  for (const [x, z, sx, sz] of [[470, 524, 16.4, 0.3], [470, 540, 16.4, 0.3], [462, 532, 0.3, 16], [478, 532, 0.3, 16]]) P('box', [x, G + 0.04, z], [sx, 0.08, sz], '#f5f5f5', 'smooth', { nc: true });
  for (const z of [523.4, 540.6]) P('cyl', [470, G + 1.7, z], [0.35, 3.4, 0.35], '#3b3f55', 'metal');
  P('box', [470, G + 2.4, 532], [0.15, 1.6, 17], '#f5f5f5', 'fabric', { t: 0.45 });
  P('ball', [464, G + 1.4, 532], [1.6, 1.6, 1.6], '#fff3c4', 'smooth', { n: 'Ball', nc: true });

  /* ---------------- a sand castle ---------------- */
  const cx = 532, cz = 530;
  P('box', [cx, G + 0.6, cz], [9, 1.2, 9], '#dcc48c', 'sand');
  for (const [dx, dz] of [[-4.5, -4.5], [4.5, -4.5], [4.5, 4.5], [-4.5, 4.5]]) { P('cyl', [cx + dx, G + 1.5, cz + dz], [2.4, 3, 2.4], '#dcc48c', 'sand'); P('cone', [cx + dx, G + 3.8, cz + dz], [2.8, 1.8, 2.8], '#cfb57a', 'sand'); }
  P('cyl', [cx, G + 2.6, cz], [3.6, 3, 3.6], '#dcc48c', 'sand'); P('pyramid', [cx, G + 5, cz], [4, 2, 4], '#cfb57a', 'sand');
  P('cyl', [cx, G + 6.8, cz], [0.12, 2, 0.12], DARK, 'wood'); P('wedge', [cx + 0.6, G + 7.3, cz], [0.1, 0.8, 1.2], '#e63946', 'fabric', { r: [0, 90, 0], nc: true });
  for (let i = 0; i < 4; i++) for (let k = -3; k <= 3; k += 2) { const a = i * 90; P('box', [cx + (i % 2 ? (i === 1 ? 4.5 : -4.5) : k), G + 1.5, cz + (i % 2 ? k : (i === 0 ? -4.5 : 4.5))], [0.9, 0.7, 0.9], '#dcc48c', 'sand', { r: [0, a, 0] }); }

  /* ---------------- the tiki bar ---------------- */
  const bx = 548, bz = 492;
  P('box', [bx, G + 0.3, bz], [14, 0.6, 10], WOOD, 'planks');
  for (const [dx, dz] of [[-6.4, -4.4], [6.4, -4.4], [6.4, 4.4], [-6.4, 4.4]]) P('cyl', [bx + dx, G + 2.8, bz + dz], [0.6, 4.6, 0.6], DARK, 'wood');
  P('pyramid', [bx, G + 6.6, bz], [17, 3.4, 13], '#c9a14a', 'fabric');
  P('box', [bx, G + 1.3, bz + 2], [10, 1.4, 1.4], DARK, 'wood'); P('box', [bx, G + 2.05, bz + 2], [10.6, 0.2, 2], '#e8c98f', 'marble');
  for (let i = -2; i <= 2; i++) { P('cyl', [bx + i * 2, G + 1.1, bz + 4], [0.25, 1, 0.25], '#3b3f55', 'metal'); P('cyl', [bx + i * 2, G + 1.7, bz + 4], [1, 0.25, 1], pick(BRIGHT), 'smooth'); }
  for (let i = -3; i <= 3; i++) P('cyl', [bx + i * 1.3, G + 2.5, bz + 1.7], [0.4, 0.7, 0.4], pick(BRIGHT), 'glass', { t: 0.3 });
  P('box', [bx, G + 4.6, bz + 5], [7, 1, 0.3], '#ff5d8f', 'neon', { g: 1, lt: { r: 14, b: 1.1 }, nc: true });

  /* ---------------- the bonfire (scripted flicker) ---------------- */
  const fx = 420, fz = 500;
  for (let i = 0; i < 6; i++) P('cyl', [fx + Math.sin(i * 1.05) * 0.9, G + 0.5, fz + Math.cos(i * 1.05) * 0.9], [0.45, 2.6, 0.45], '#5b3a1e', 'wood', { r: [58, i * 60, 0] });
  for (let i = 0; i < 9; i++) P('ball', [fx + Math.sin(i * 0.7) * 2.2, G + 0.2, fz + Math.cos(i * 0.7) * 2.2], [0.9, 0.9, 0.9], ROCK, 'stone');
  P('cone', [fx, G + 1.7, fz], [2.2, 3, 2.2], '#ff7b25', 'neon', { n: 'Fire', g: 1, nc: true, lt: { r: 20, b: 1.6 } });
  for (let i = 0; i < 4; i++) P('cyl', [fx + Math.sin(i * 1.57 + 0.8) * 5.5, G + 0.5, fz + Math.cos(i * 1.57 + 0.8) * 5.5], [1, 4, 1], '#8b6239', 'wood', { r: [90, i * 90 + 45, 0] });

  /* ---------------- the water slide: a lift up the tower, then an ice slide into the sea ---------------- */
  const sx = 430, sz = 532;
  for (const [dx, dz] of [[-3.5, -3.5], [3.5, -3.5], [3.5, 3.5], [-3.5, 3.5]]) P('box', [sx + dx, G + 7.5, sz + dz], [0.8, 15, 0.8], DARK, 'wood');
  P('box', [sx, G + 15.25, sz - 2.5], [8, 0.5, 3], WOOD, 'planks');
  P('box', [sx, G + 0.3, sz], [6, 0.6, 6], '#3a86ff', 'metal', { n: 'Lift' });
  P('wedge', [sx, G + 7, sz + 25.2], [5, 16.6, 44], '#bfe9ff', 'ice');
  for (const dx of [-2.7, 2.7]) P('wedge', [sx + dx, G + 7.6, sz + 25.2], [0.4, 16.6, 44], '#7cc8ff', 'glass', { t: 0.35 });
  P('box', [sx, G + 17.2, sz - 4.2], [8, 3.4, 0.3], '#7cc8ff', 'glass', { t: 0.35 });

  /* ---------------- a boat that sails back and forth (stand on it: it carries you) ---------------- */
  const boat = { mo: { t: 'move', d: [90, 0, 0], s: 16, w: 2 } };
  P('box', [370, SEA + 0.1, 600], [7, 1.2, 14], '#8b5a2b', 'planks', boat);
  P('wedge', [370, SEA + 0.1, 591.5], [7, 1.2, 3], '#8b5a2b', 'planks', { ...boat, r: [0, 180, 0] });
  for (const dx of [-3.3, 3.3]) P('box', [370 + dx, SEA + 1.1, 600], [0.4, 0.9, 14], '#6b4423', 'wood', boat);
  P('cyl', [370, SEA + 5, 600], [0.4, 9, 0.4], '#6b4423', 'wood', boat);
  P('wedge', [370, SEA + 5.6, 602.6], [0.15, 6.5, 5], '#f5f5f5', 'fabric', { ...boat, nc: true });
  P('ball', [370, SEA + 9.8, 600], [0.7, 0.7, 0.7], '#ffd23f', 'neon', { ...boat, g: 1, lt: { r: 12, b: 1 }, nc: true });

  /* ---------------- buoys and a raft, bobbing on the waves ---------------- */
  for (let i = 0; i < 12; i++) P('ball', [330 + i * 31 + R(-4, 4), SEA + 0.1, R(640, 700)], [1.6, 1.6, 1.6], i % 2 ? '#e63946' : '#f5f5f5', 'smooth', { mo: { t: 'move', d: [0, 0.7, 0], s: R(1.2, 2) } });
  P('box', [560, SEA + 0.1, 590], [9, 0.7, 9], '#b98250', 'planks', { mo: { t: 'move', d: [0, 0.45, 0], s: 1.8 } });
  P('cyl', [560, SEA + 0.75, 590], [3, 0.5, 3], '#ffd23f', 'smooth', { k: 'bounce', mo: { t: 'move', d: [0, 0.45, 0], s: 1.8 } });

  /* ---------------- the lighthouse island ---------------- */
  const lx = 610, lz = 640;
  for (let i = 0; i < 14; i++) { const s = R(6, 13); P('ball', [lx + R(-9, 9), G - 7 + R(0, 3), lz + R(-9, 9)], [s, s, s], pick([ROCK, '#7a8499', '#6f7689']), 'stone'); }
  P('cyl', [lx, SEA + 0.5, lz], [20, 3, 20], '#7a8499', 'stone');
  P('cyl', [lx, SEA + 2.3, lz], [12, 0.7, 12], '#5fc76b', 'grass');
  for (let i = 0; i < 8; i++) P('cyl', [lx, SEA + 4.4 + i * 3, lz], [6.4 - i * 0.42, 3, 6.4 - i * 0.42], i % 2 ? '#e63946' : '#f5f5f5', 'smooth');
  P('cyl', [lx, SEA + 28.4, lz], [5.4, 0.5, 5.4], '#3b3f55', 'metal');
  P('cyl', [lx, SEA + 30.1, lz], [3.6, 3, 3.6], '#bfe9ff', 'glass', { t: 0.4 });
  P('box', [lx, SEA + 30.1, lz], [16, 0.7, 0.7], '#fff3a8', 'neon', { g: 1, nc: true, mo: { t: 'spin', d: [0, 50, 0], s: 1 }, lt: { r: 40, b: 1.5 } });
  P('cone', [lx, SEA + 32.6, lz], [5, 2.2, 5], '#e63946', 'smooth');
  for (let i = 0; i < 17; i++) P('cyl', [lx - 14 - i * 5.5, SEA - 0.3 + (i % 2) * 0.25, lz - 4 - i * 0.5 + (i % 3 - 1) * 1.2], [3, 1.2, 3], pick([ROCK, '#9aa3b5']), 'stone'); // stepping stones from the pier's end
  P('box', [lx + 6.5, SEA + 3.2, lz], [1.8, 1.2, 1.2], '#c98f2b', 'metal'); P('halfcyl', [lx + 6.5, SEA + 4.1, lz], [1.8, 0.6, 1.2], '#ffd23f', 'metal'); // a treasure chest

  /* ---------------- a windmill on the dunes, and a spinning carousel ---------------- */
  P('cone', [372, G + 6.5, 462], [7, 13, 7], '#f1e2c0', 'brick');
  for (const a of [0, 90]) P('box', [372, G + 11, 465.8], [1.2, 15, 0.3], '#f5f5f5', 'fabric', { r: [0, 0, a], nc: true, mo: { t: 'spin', d: [0, 0, 40], s: 1 } });
  P('cyl', [372, G + 11, 464.6], [0.8, 0.8, 2.6], DARK, 'wood', { r: [90, 0, 0] });
  P('cyl', [600, G + 0.5, 512], [14, 0.8, 14], '#ff5d8f', 'smooth', { mo: { t: 'spin', d: [0, 45, 0], s: 1 } });
  P('cyl', [600, G + 3.4, 512], [1, 5.4, 1], '#ffd23f', 'metal'); P('cone', [600, G + 7.2, 512], [15, 2.6, 15], '#3a86ff', 'fabric');
  for (let i = 0; i < 8; i++) P('ball', [600 + Math.sin(i * 0.785) * 7.2, G + 6.2, 512 + Math.cos(i * 0.785) * 7.2], [0.6, 0.6, 0.6], pick(BRIGHT), 'neon', { g: 1, nc: true, lt: i % 2 ? undefined : { r: 8, b: 0.9 } });
  // a swinging pirate-ship ride
  P('box', [640, G + 9, 490], [1, 18, 1], DARK, 'wood'); P('box', [652, G + 9, 490], [1, 18, 1], DARK, 'wood'); P('box', [646, G + 18, 490], [14, 1, 1], DARK, 'wood');
  P('halfcyl', [646, G + 3.2, 490], [10, 2.4, 4], '#8b5a2b', 'planks', { r: [180, 90, 0], mo: { t: 'swing', d: [0, 0, 16], s: 4 } });

  /* ---------------- trampolines ---------------- */
  for (const [x, z] of [[516, 520], [522, 524], [528, 519]]) { P('cyl', [x, G + 0.45, z], [4, 0.5, 4], '#ff5d8f', 'smooth', { k: 'bounce' }); P('cyl', [x, G + 0.2, z], [4.6, 0.4, 4.6], '#3b3f55', 'metal'); }

  /* ---------------- under the sea: coral that glows, seaweed and a sunken arch ---------------- */
  for (let i = 0; i < 46; i++) {
    const x = R(330, 670), z = R(625, 760), kind = Math.floor(rnd() * 3), c = pick(['#ff5d8f', '#ff7b25', '#9b5de5', '#4cc9f0', '#a6e22e', '#ffd23f']);
    if (Math.hypot(x - lx, z - lz) < 16) continue;
    if (kind === 0) P('cone', [x, G - 7, z], [R(1, 2.2), R(2, 4.5), R(1, 2.2)], c, 'neon', { g: 0.7, lt: i % 6 === 0 ? { r: 9, b: 1 } : undefined });
    else if (kind === 1) P('ball', [x, G - 7.4, z], [R(1.5, 3), R(1.5, 3), R(1.5, 3)], c, 'neon', { g: 0.5 });
    else P('box', [x, G - 6, z], [0.3, R(3, 6), 0.9], '#3fae5a', 'fabric', { nc: true, mo: { t: 'swing', d: [8, 0, 10], s: R(2.5, 4) } });
  }
  for (const dx of [-4, 4]) P('cyl', [420 + dx, G - 4.5, 680], [2, 7, 2], '#9aa3b5', 'marble');
  P('halfcyl', [420, G - 0.4, 680], [10, 2, 2.4], '#9aa3b5', 'marble', { r: [0, 0, 0] });

  /* ---------------- coins everywhere, and 6 shells to find ---------------- */
  const coin = (x, y, z) => P('cyl', [x, y, z], [1, 0.25, 1], '#ffd23f', 'metal', { k: 'coin', nc: true, r: [90, 0, 0] });
  for (let z = 520; z <= 620; z += 12) coin(500, G + 1.6, z);
  for (let i = 0; i < 10; i++) coin(445 + i * 12, G + 1.8, 505);
  for (let i = 0; i < 8; i++) coin(R(340, 660), G - 6, R(630, 740));
  coin(lx + 6.5, SEA + 5.6, lz); coin(sx, G + 17, sz - 2.5); coin(560, SEA + 2.5, 590); coin(600, G + 2, 506); coin(372, G + 2.6, 470); coin(646, G + 5.5, 490);
  for (const [x, y, z] of [[352, G, 528], [588, G, 536], [lx - 3, SEA + 2.65, lz + 4], [bx - 5, G + 0.6, bz - 3], [404, G - 7.9, 668], [662, G + 0.6, 404]]) P('cone', [x, y + 0.45, z], [1.1, 0.9, 1.1], '#ff9bb8', 'marble', { n: 'Shell', nc: true, g: 0.25, r: [0, R(0, 360), 0] });

  return { v: 2, engine: 2, n: 'Sunset Beach', mode: 'hangout', sky: 'sunset', compass: true, parts, scripts: [{ n: 'Beach', src: BEACH_SCRIPT }] };
}
