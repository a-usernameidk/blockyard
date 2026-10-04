// Greyscale: Blockyard's escape game. A grey building with no color in it, 4 keys, 3 breakers and one way out.
// Something walks the halls (straight through the walls). It is slower than you, until the lights go out.
// When they flicker, find a locker and hide. All of it is Engine v2 parts and one Blockscript.
import { kit } from './gamekit.js';

const G = 10, H = 6;                 // the floor, and how high the ceiling is
const X0 = 430, X1 = 570, Z0 = 420, Z1 = 580;
export const GREY_HOME = [547, 437];  // where the Lurker starts (the Power room)
// places the Lurker wanders to while you hide, and where the robot tester walks (rooms, corridors, doors)
export const GREY_SPOTS = [[453, 437], [500, 437], [547, 437], [453, 562], [500, 562], [547, 562], [500, 500], [436, 500], [564, 500]];

export const GREY_SCRIPT = `// Greyscale: the script that runs this world.
keys = 0
power = 0
hidden = false
blackout = false
secs = 0
grace = 5          // the Lurker waits this long (in seconds on the clock) before it comes for you
wanderX = ${GREY_HOME[0]}
wanderZ = ${GREY_HOME[1]}
outX = 0
outY = 0
outZ = 0
hideIn = nil
body = part("LurkBody")
lurk = parts("Lurker") + [body]
spots = ${JSON.stringify(GREY_SPOTS)}
notes = ["Day 12. The color went first. Then the others.", "It can't see into the lockers. It CAN hear the lights go out.", "Four keys. Three breakers. Don't call the elevator early, it only comes once."]

on start {
  mono(true)
  dark(0.84)
  part("Torch").follow(0, 2.3, 0.4)
  board("Keys", "0 of 4")
  board("Power", "0 of 3")
  say("Find 4 keys and switch on 3 breakers, then call the elevator. You are not alone in here.")
}

fn lurkHome() {
  dx = ${GREY_HOME[0]} - body.x
  dz = ${GREY_HOME[1]} - body.z
  for p in lurk { p.move(dx, 0, dz) }
  grace = secs + 6
}

fn comeOut() {
  teleport(outX, outY, outZ)
  hideIn.solid(true)
  speed(1)
  jump(1)
  hidden = false
  sound("door")
}

on use {
  if hidden { comeOut()  return }
  k = near("Key", 3)
  if k {
    k.hide()
    keys += 1
    board("Keys", str(keys) + " of 4")
    sound("key")
    checkpoint()
    if keys < 4 { say("A key. " + str(4 - keys) + " to go.") } else { say("That's all four keys.") }
    return
  }
  s = near("Breaker", 3)
  if s {
    if s.color() == "#f5f5f5" { say("This breaker is already on.")  return }
    s.color("white")
    s.glow(1)
    power += 1
    board("Power", str(power) + " of 3")
    sound("checkpoint")
    say("Breaker on. Something heard that.")
    return
  }
  l = near("Locker", 3.4)
  if l {
    hideIn = l
    outX = player.x
    outY = player.y
    outZ = player.z
    l.solid(false)
    teleport(l.x, l.y - 1.6, l.z)
    speed(0)
    jump(0)
    hidden = true
    sound("door")
    say("You're hiding. Press Use to come out.")
    return
  }
  n = near("Note", 3)
  if n { say(notes[floor(n.x) % 3])  sound("pop")  return }
  if near("Exit", 5.5) {
    if keys >= 4 and power >= 3 { say("The elevator is here. You made it out.")  sound("win")  win() }
    else { say("The elevator needs 4 keys (you have " + str(keys) + ") and 3 breakers (" + str(power) + " are on).") }
  }
}

// the hint by the Use key
every 0.2 {
  if hidden { prompt("Come out")  return }
  if near("Key", 3) { prompt("Take the key")  return }
  if near("Breaker", 3) { prompt("Flip the breaker")  return }
  if near("Locker", 3.4) { prompt("Hide")  return }
  if near("Note", 3) { prompt("Read")  return }
  if near("Exit", 5.5) { prompt("Call the elevator")  return }
  prompt("")
}

// the lights: every 44 seconds they flicker (a warning), then go out for 9 seconds
every 1 {
  secs += 1
  c = secs % 44
  if c == 29 { say("The lights are flickering...")  sound("tick") }
  if c == 34 {
    blackout = true
    dark(1)
    for l in parts("Lamp") { l.hide() }
    sound("whoosh")
    say("Lights out. HIDE.")
  }
  if c == 43 {
    blackout = false
    dark(0.84)
    for l in parts("Lamp") { l.show() }
  }
  // while you hide it loses you and wanders off to another room
  if hidden and secs % 5 == 0 {
    sp = spots[random(0, 8)]
    wanderX = sp[0]
    wanderZ = sp[1]
  }
}

// the Lurker: it drifts straight at you (walls don't stop it). 4.6 studs a second, 8.4 in the dark. You walk at 7.
every 0.1 {
  if secs < grace { return }
  tx = player.x
  tz = player.z
  if hidden { tx = wanderX  tz = wanderZ }
  dx = tx - body.x
  dz = tz - body.z
  d = sqrt(dx * dx + dz * dz)
  sp = 4.6
  if blackout { sp = 8.4 }
  if d > 0.3 {
    k = min(d, sp * 0.1) / d
    for p in lurk { p.move(dx * k, 0, dz * k, 0.1) }
  }
  if not hidden and d < 1.7 {
    say("It got you.")
    sound("die")
    kill()
  }
}

on die { lurkHome() }
`;

export function greyWorld() {
  const K = kit(31), { parts, box, cyl, rnd, pick } = K;
  const WALL = '#8d9299', FLOOR = '#b9bdc4', DARKC = '#55595f', T = 0.6;
  box((X0 + X1) / 2, G / 2, (Z0 + Z1) / 2, X1 - X0 + 8, G, Z1 - Z0 + 8, FLOOR, 'stone');
  box((X0 + X1) / 2, G + H + 0.5, (Z0 + Z1) / 2, X1 - X0 + 8, 1, Z1 - Z0 + 8, '#6f747b', 'smooth'); // the ceiling
  box(500, G + 0.15, 508, 3, 0.3, 3, '#d9dde3', 'smooth', { k: 'spawn' });
  // a wall along x at depth z (from x0 to x1) with door gaps: [middle, width]; and the same along z
  const wallX = (z, x0, x1, gaps = []) => {
    let at = x0;
    for (const [m, w] of [...gaps].sort((a, b) => a[0] - b[0])) { if (m - w / 2 > at) box((at + m - w / 2) / 2, G + H / 2, z, m - w / 2 - at, H, T, WALL, 'stone'); box(m, G + H - 0.9, z, w, 1.8, T, WALL, 'stone'); at = m + w / 2; }
    if (x1 > at) box((at + x1) / 2, G + H / 2, z, x1 - at, H, T, WALL, 'stone');
  };
  const wallZ = (x, z0, z1, gaps = []) => {
    let at = z0;
    for (const [m, w] of [...gaps].sort((a, b) => a[0] - b[0])) { if (m - w / 2 > at) box(x, G + H / 2, (at + m - w / 2) / 2, T, H, m - w / 2 - at, WALL, 'stone'); box(x, G + H - 0.9, m, T, 1.8, w, WALL, 'stone'); at = m + w / 2; }
    if (z1 > at) box(x, G + H / 2, (at + z1) / 2, T, H, z1 - at, WALL, 'stone');
  };
  // the outside
  wallX(Z0, X0, X1); wallX(Z1, X0, X1); wallZ(X0, Z0, Z1); wallZ(X1, Z0, Z1);
  // rooms | north corridor | (west corridor, atrium, east corridor) | south corridor | rooms
  wallX(455.5, X0, X1, [[453, 5], [500, 5], [547, 5]]);
  wallX(468.5, X0, X1, [[436, 9], [500, 6], [564, 9]]);
  wallX(531.5, X0, X1, [[436, 9], [500, 6], [564, 9]]);
  wallX(544.5, X0, X1, [[453, 5], [500, 5], [547, 5]]);
  wallZ(442.5, 468.5, 531.5, [[500, 5]]); wallZ(557.5, 468.5, 531.5, [[500, 5]]);
  for (const x of [476.5, 523.5]) { wallZ(x, Z0, 455.5); wallZ(x, 544.5, Z1); }
  // the elevator: its doors fill the gap in the atrium's north wall
  box(500, G + 2.1, 468.5, 6, 4.2, 0.5, '#d0d4da', 'metal', { n: 'Exit' });
  box(500, G + 2.1, 468.2, 0.12, 4.2, 0.56, '#3c3f44', 'metal', { nc: true });
  box(500, G + 4.8, 468.9, 2.4, 0.7, 0.2, '#f5f5f5', 'neon', { g: 0.8, nc: true });

  /* ---- lamps (they go out in a blackout), lockers, keys, breakers, notes ---- */
  const lamp = (x, z, r = 15) => box(x, G + H - 0.15, z, 1.6, 0.25, 0.6, '#f0f0f0', 'neon', { n: 'Lamp', g: 0.9, nc: true, lt: { r, b: 0.9 } });
  for (const x of [453, 500, 547]) { lamp(x, 462); lamp(x, 538); lamp(x, 438, 17); lamp(x, 562, 17); }
  for (const z of [485, 515]) { lamp(436, z, 12); lamp(564, z, 12); }
  lamp(480, 500, 20); lamp(520, 500, 20);
  // lockers stand flat against a wall (turn: the wall runs north-south)
  const locker = (x, z, turn = false) => box(x, G + 1.6, z, turn ? 1.2 : 1.5, 3.2, turn ? 1.5 : 1.2, '#6b7078', 'metal', { n: 'Locker' });
  for (const x of [466, 534]) { locker(x, 456.4); locker(x, 543.6); }
  locker(443.4, 478, true); locker(556.6, 522, true); locker(430.9, 515, true); locker(569.1, 485, true);
  locker(432, 420.9); locker(521.5, 420.9); locker(568, 454.6); locker(432, 579.1); locker(478.5, 579.1); locker(568, 545.4);
  const key = (x, z) => { box(x, G + 0.55, z, 2.4, 1.1, 1.4, DARKC, 'wood'); box(x, G + 1.25, z, 0.7, 0.18, 0.3, '#ffffff', 'neon', { n: 'Key', g: 1, nc: true, lt: { r: 5, b: 0.6 } }); };
  key(438, 572); key(437, 429); key(563, 428); key(563, 571);
  const breaker = (x, z, turn) => box(x, G + 1.7, z, turn ? 0.3 : 1.1, 1.5, turn ? 1.1 : 0.3, '#2f3237', 'metal', { n: 'Breaker' });
  breaker(500, 579.4); breaker(500, 420.6); breaker(430.6, 500, true);
  const note = (x, z) => { box(x, G + 0.5, z, 1.6, 1, 1.2, DARKC, 'wood'); box(x, G + 1.03, z, 0.6, 0.05, 0.8, '#f5f5f5', 'smooth', { n: 'Note', nc: true }); };
  note(486, 524); note(511, 446); note(542, 566);
  // the torch you carry (the script puts it over your shoulder) and the Lurker
  box(500, G + 3, 505, 0.2, 0.2, 0.2, '#f5f5f5', 'smooth', { n: 'Torch', nc: true, t: 1, lt: { r: 17, b: 1.25 } });
  const [lx, lz] = GREY_HOME;
  box(lx, G + 1.9, lz, 1.5, 3.8, 1.1, '#0e0e11', 'fabric', { n: 'LurkBody', nc: true });
  box(lx, G + 4.3, lz, 1.2, 1.2, 1.2, '#0e0e11', 'fabric', { n: 'Lurker', nc: true });
  for (const s of [-0.28, 0.28]) for (const f of [-0.62, 0.62]) box(lx + s, G + 4.45, lz + f, 0.22, 0.14, 0.06, '#ffffff', 'neon', { n: 'Lurker', g: 1, nc: true });
  box(lx, G + 4.4, lz, 0.3, 0.3, 0.3, '#ffffff', 'smooth', { n: 'Lurker', nc: true, t: 1, lt: { r: 7, b: 0.7 } });
  for (const s of [-1, 1]) box(lx + s * 1.0, G + 2.3, lz, 0.35, 3, 0.4, '#0e0e11', 'fabric', { n: 'Lurker', nc: true });

  /* ---- furniture (kept away from the doors and the middle of the rooms, so there is always a clear way through) ---- */
  const shelf = (x, z, w, d) => { box(x, G + 2, z, w, 4, d, DARKC, 'wood'); for (let i = 0; i < 3; i++) box(x, G + 0.9 + i * 1.2, z, w + 0.1, 0.12, d + 0.1, '#7d8289', 'wood'); };
  for (const z of [424, 430]) for (const x of [446, 460, 470]) shelf(x, z, 6, 1.4);            // the archive
  for (const x of [484, 492, 508, 516]) { box(x, G + 0.75, 430, 3.2, 1.5, 6, '#9aa0a8', 'metal'); cyl(x, G + 1.9, 430, 0.8, 0.8, 0.8, '#c9cdd3', 'glass', { t: 0.5 }); } // the lab
  for (const x of [530, 537, 556]) { box(x, G + 2.2, 424, 3, 4.4, 3, '#4b4f55', 'metal'); cyl(x, G + 4.8, 424, 1, 0.8, 1, '#7d8289', 'metal'); } // the power room
  for (const x of [446, 458, 468]) { box(x, G + 0.6, 566, 3.4, 1.2, 1.8, DARKC, 'wood'); box(x, G + 0.5, 569, 1, 1, 1, '#6b7078', 'fabric'); } // the office
  for (let i = 0; i < 16; i++) { const x = rnd(481, 519), z = rnd(566, 576); if (Math.abs(x - 500) < 4) continue; const s = rnd(1.4, 2.6); box(x, G + s / 2, z, s, s, s, pick(['#7d8289', '#6b7078', '#8d9299']), 'planks', { r: [0, rnd(0, 40), 0] }); } // storage
  for (const x of [530, 540, 550]) { box(x, G + 0.5, 574, 2.4, 0.5, 5, '#9aa0a8', 'metal'); box(x, G + 0.95, 574.5, 2.2, 0.4, 3.6, '#e2e5ea', 'fabric'); box(x, G + 1.2, 576.2, 1.6, 0.3, 0.9, '#f5f5f5', 'fabric'); } // the ward
  for (const [x, z] of [[470, 480], [530, 480], [470, 522], [530, 522]]) { cyl(x, G + H / 2, z, 1.6, H, 1.6, '#9aa0a8', 'marble'); } // atrium pillars
  box(500, G + 0.5, 488, 9, 1, 2.2, DARKC, 'wood'); // the front desk
  for (const z of [459, 541]) for (let x = 440; x < 565; x += 26) cyl(x, G + H - 0.9, z + (z < 500 ? -1.6 : 1.6), 0.5, 22, 0.5, '#5e6268', 'metal', { r: [0, 0, 90], nc: true }); // pipes
  return { v: 2, engine: 2, n: 'Greyscale', mode: 'obby', sky: 'night', parts, scripts: [{ n: 'Greyscale', src: GREY_SCRIPT }] };
}
