// Crown Chaos: the crown chose the Mad King, and the powers went to his head. Survive his ten decrees (each one
// ends when you have grabbed its gems) and then climb the throne and take the crown yourself.
// The decrees: a sweeping beam to jump, falling rocks, "don't move while the eye is red", the floor is lava,
// royal guards, and then mixes of them. Dying only starts that decree again.
// Engine v2 parts and one Blockscript, so the server can replay a win and pay for it.
// (The first Crown Chaos, where the crown goes round the players in a server, is now Crown Party.)
import { kit } from './gamekit.js';

const G = 20, CX = 500, CZ = 500, R = 60;
// name, gems, beam 1 speed, beam 2 speed, rocks, the eye, lava, guards, low gravity, the hint
export const CROWN_DECREES = [
  ['THE SWEEPER', 4, 40, 0, 0, 0, 0, 0, 0, 'Jump over the beam.'],
  ['SKYFALL', 5, 0, 0, 1, 0, 0, 0, 0, 'Keep moving: rocks land where the shadows are.'],
  ['NOBODY MOVES', 5, 0, 0, 0, 1, 0, 0, 0, 'When the eye goes red, stand perfectly still.'],
  ['THE FLOOR IS LAVA', 4, 0, 0, 0, 0, 1, 0, 0, 'When the floor glows, be up on a tower.'],
  ['ROYAL GUARDS', 5, 0, 0, 0, 0, 0, 2, 0, 'Do not let them touch you.'],
  ['SWEEP AND FALL', 5, 55, 0, 1, 0, 0, 0, 0, 'The beam and the rocks together.'],
  ['STATUES', 5, 0, 0, 0, 1, 0, 3, 0, 'Three guards. Red eye: everyone freezes, them too.'],
  ['CROSSFIRE', 5, 60, -45, 0, 0, 0, 0, 0, 'Two beams, going opposite ways.'],
  ['MOON COURT', 5, 50, -40, 1, 0, 0, 0, 1, 'Low gravity: your jumps are long and slow.'],
  ["THE KING'S RAGE", 5, 50, 0, 1, 0, 0, 2, 0, 'Everything he has left.'],
];
// where gems appear on the floor (two rings), and the four tower decks (for the lava decree)
export const CROWN_SPOTS = []; for (let k = 0; k < 8; k++) for (const r of [20, 44]) { const a = (22.5 + 45 * k) * Math.PI / 180; CROWN_SPOTS.push([Math.round((CX + Math.cos(a) * r) * 10) / 10, Math.round((CZ + Math.sin(a) * r) * 10) / 10]); }
export const CROWN_TOWERS = [0, 1, 2, 3].map((q) => { const t = q * Math.PI / 2 + Math.PI / 4; return [Math.round((CX + Math.cos(t) * 40) * 10) / 10, Math.round((CZ + Math.sin(t) * 40) * 10) / 10]; });
const GATES = [[CX, CZ + 54], [CX - 46.8, CZ - 27], [CX + 46.8, CZ - 27]];

export const CROWN_SCRIPT = `// Crown Chaos: the script that runs this world.
decrees = ${JSON.stringify(CROWN_DECREES)}
spots = ${JSON.stringify(CROWN_SPOTS)}
towers = ${JSON.stringify(CROWN_TOWERS)}
gates = ${JSON.stringify(GATES)}
round = 0
gems = 0
need = 0
gen = 0            // goes up every time a decree starts (or starts again), so old timers know to stop
live = false       // the decree's dangers are switched on
metOn = false
metK = 0
eyeOn = false
eyeP = 0           // 0 green, 1 yellow, 2 red
eyeT = 0
lavaOn = false
lavaHot = false
lavaT = 0
guardN = 0
tower = 0
beam1 = part("Beam1")
beam2 = part("Beam2")
eye = part("Eye")
lava = part("Lava")
gem = part("Gem")
rocks = [part("Rock1"), part("Rock2"), part("Rock3"), part("Rock4"), part("Rock5")]
marks = [part("Mark1"), part("Mark2"), part("Mark3"), part("Mark4"), part("Mark5")]
guards = [parts("Guard1"), parts("Guard2"), parts("Guard3")]
gOut = [false, false, false]

on start {
  lava.hide()
  gem.spin(0, 120, 0)
  board("Decree", "the King is thinking")
  say("The Mad King has the crown, and ten decrees. Grab the gems to end each one. Survive them all and the crown is yours.")
  wait(4)
  nextRound()
}

fn park(p) { p.stop()  p.moveTo(p.x, -60, p.z) }
fn clearAll() {
  live = false
  park(beam1)
  park(beam2)
  metOn = false
  for r in rocks { park(r) }
  for m in marks { park(m) }
  eyeOn = false
  eyeP = 0
  eye.color("#8d99ae")
  lavaOn = false
  lavaHot = false
  lava.hide()
  let i = 0
  for g in guards {
    if gOut[i] { for p in g { p.move(0, -18, 0) }  gOut[i] = false }
    i += 1
  }
  guardN = 0
  gravity(1)
  jump(1)
}
fn placeGem() {
  let d = decrees[round - 1]
  if d[6] > 0 {
    tower = (tower + 1) % 4
    gem.moveTo(towers[tower][0], ${G + 3.5}, towers[tower][1])
    return
  }
  let s = spots[random(0, 15)]
  let tries = 0
  while tries < 12 {
    let dx = s[0] - player.x
    let dz = s[1] - player.z
    if dx * dx + dz * dz > 700 { break }
    s = spots[random(0, 15)]
    tries += 1
  }
  gem.moveTo(s[0], ${G + 1.5}, s[1])
}
fn startBeam(b, w, turn) {
  // across the arena, side-on to where you stand, so it never starts on top of you
  let a = atan2(player.z - ${CZ}, player.x - ${CX})
  b.moveTo(${CX}, ${G + 0.6}, ${CZ})
  b.turnTo(0, 0 - (a + 90 + turn), 0)
  b.spin(0, w, 0)
}
fn startDangers(mine) {
  if mine != gen { return }
  let d = decrees[round - 1]
  live = true
  if d[2] != 0 { startBeam(beam1, d[2], 0) }
  if d[3] != 0 { startBeam(beam2, d[3], 40) }
  metOn = d[4] > 0
  if d[5] > 0 { eyeOn = true  eyeP = 0  eyeT = 4  eye.color("green") }
  if d[6] > 0 { lavaOn = true  lavaHot = false  lavaT = 14 }
  guardN = d[7]
  let i = 0
  while i < guardN {
    // each guard marches in from its own gate
    let b = guards[i][0]
    let gx = gates[i][0] - b.x
    let gz = gates[i][1] - b.z
    for p in guards[i] { p.move(gx, 18, gz) }
    gOut[i] = true
    i += 1
  }
  if d[8] > 0 { gravity(0.45)  jump(1.25) }
}
fn nextRound() {
  round += 1
  gen += 1
  let mine = gen
  clearAll()
  if round > 10 {
    gem.moveTo(${CX}, -60, ${CZ})
    for p in parts("King") { p.hide() }
    part("Crown").moveTo(${CX}, ${G + 4.6}, ${CZ - 1.2}, 1.5)
    board("Decree", "TAKE THE CROWN")
    board("Gems")
    checkpoint()
    sound("win")
    say("The King is out of decrees! He ran. Climb the throne and take the crown!")
    return
  }
  let d = decrees[round - 1]
  need = d[1]
  gems = 0
  checkpoint()
  board("Decree", str(round) + " of 10: " + d[0])
  board("Gems", "0 of " + str(need))
  sound("badge")
  say("DECREE " + str(round) + ": " + d[0] + "! " + d[9])
  placeGem()
  wait(3)
  startDangers(mine)
}

on touch "Gem" {
  if round < 1 or round > 10 { return }
  gems += 1
  sound("coin")
  board("Gems", str(gems) + " of " + str(need))
  if gems >= need { nextRound() } else { placeGem() }
}
on die {
  if round < 1 or round > 10 { return }
  gen += 1
  let mine = gen
  clearAll()
  gems = 0
  board("Gems", "0 of " + str(need))
  say("The King laughs. Decree " + str(round) + " starts again.")
  wait(2.5)
  startDangers(mine)
}
on use {
  if round > 10 and near("Crown", 6) { say("THE CROWN IS YOURS. Long may you reign!")  win() }
}
every 0.2 { if round > 10 and near("Crown", 6) { prompt("Take the crown") } else { prompt("") } }

// falling rocks: a shadow shows where, then the rock comes down
fn rockFall(k, mine) {
  let a = random(0, 359)
  let far = random(0, 45) / 10
  let tx = player.x + cos(a) * far
  let tz = player.z + sin(a) * far
  let cx = tx - ${CX}
  let cz = tz - ${CZ}
  let cr = sqrt(cx * cx + cz * cz)
  if cr > 55 { tx = ${CX} + cx / cr * 55  tz = ${CZ} + cz / cr * 55 }
  marks[k].moveTo(tx, ${G + 0.12}, tz)
  rocks[k].moveTo(tx, ${G + 38}, tz)
  wait(0.35)
  if mine != gen { return }
  rocks[k].move(0, -36.6, 0, 1.0)
  wait(1.25)
  if mine != gen { return }
  sound("hit")
  park(rocks[k])
  park(marks[k])
}
every 0.85 {
  if not live or not metOn { return }
  metK = (metK + 1) % 5
  rockFall(metK, gen)
}

// the eye: green, a moment of yellow, then red. Move while it is red and you are done.
every 0.1 {
  if not live or not eyeOn { return }
  eyeT -= 0.1
  if eyeT <= 0 {
    if eyeP == 0 { eyeP = 1  eyeT = 0.9  eye.color("yellow")  sound("tick") }
    else if eyeP == 1 { eyeP = 2  eyeT = 2.4  eye.color("red")  sound("error") }
    else { eyeP = 0  eyeT = random(30, 50) / 10  eye.color("green") }
  }
  if eyeP == 2 and eyeT < 2.15 and player.vel > 1.2 { say("THE KING SAW YOU MOVE!")  kill() }
}

// lava: the floor glows for 3 seconds (a warning), burns for 5, then cools for 8
every 0.1 {
  if not live or not lavaOn { return }
  lavaT -= 0.1
  if lavaHot {
    if lavaT <= 0 { lavaHot = false  lava.hide()  lavaT = 11 }
    else if player.grounded and player.y < ${G + 1} { say("The floor is LAVA.")  kill() }
  } else {
    if lavaT <= 0 { lavaHot = true  lavaT = 5  lava.see(0.1)  sound("die") }
    else if lavaT <= 3 and lavaT > 2.85 { lava.see(0.7)  lava.show()  sound("tick") }
  }
}

// the guards: they march straight at you (5.4 studs a second; you walk at 7)
every 0.1 {
  if not live or guardN < 1 { return }
  if eyeOn and eyeP == 2 { return }
  let i = 0
  while i < guardN {
    let b = guards[i][0]
    let dx = player.x - b.x
    let dz = player.z - b.z
    let d = sqrt(dx * dx + dz * dz)
    if d < 1.6 and abs(player.y - ${G}) < 2.2 { say("The guards got you!")  kill()  return }
    if d > 0.3 {
      let k = min(d, 0.54) / d
      for p in guards[i] { p.move(dx * k, 0, dz * k, 0.1) }
    }
    i += 1
  }
}
`;

export function crownWorld() {
  const K = kit(9), { parts, box, cyl, ball, wedge, cone, rnd, pick } = K;
  const COL = ['#e63946', '#3a86ff', '#44c06a', '#ffd23f', '#9b5de5', '#ff7b25'];
  cyl(CX, G / 2, CZ, R * 2, G, R * 2, '#d8dde6', 'smooth');                        // the arena floor
  // rings on the floor, a red carpet from the gate to the throne
  for (const [d, c, m] of [[112, '#c9d0dc', 'cobble'], [84, '#e3e7ee', 'smooth'], [80, '#b9c1cf', 'cobble'], [52, '#e3e7ee', 'smooth'], [48, '#c9d0dc', 'cobble'], [26, '#ffe9a8', 'smooth'], [23, '#eef1f6', 'smooth']]) cyl(CX, G + 0.03 + (112 - d) * 0.0004, CZ, d, 0.05, d, c, m, { nc: true });
  box(CX, G + 0.09, CZ + 31, 5, 0.06, 46, '#b3202c', 'fabric', { nc: true }); for (const s of [-2.7, 2.7]) box(CX + s, G + 0.1, CZ + 31, 0.4, 0.06, 46, '#ffd23f', 'fabric', { nc: true });
  cyl(CX, G + 0.2, CZ, R * 2 - 2, 0.25, R * 2 - 2, '#ff5a1f', 'neon', { n: 'Lava', g: 1, nc: true, t: 0.15 }); // (hidden until the lava decree)
  box(CX, G + 0.2, CZ + 44, 4, 0.4, 4, '#7cc8ff', 'smooth', { k: 'spawn' });
  // the wall, with a flag on every post, torches, and the crowd in the stands behind it
  for (let a = 0; a < 24; a++) {
    const t = a * Math.PI / 12, x = CX + Math.cos(t) * (R - 1), z = CZ + Math.sin(t) * (R - 1);
    box(x, G + 2, z, 16, 4, 1.4, '#9aa3b5', 'brick', { r: [0, 90 - a * 15, 0] }); box(x, G + 14, z, 16, 20, 1, '#ffffff', 'glass', { r: [0, 90 - a * 15, 0], t: 1 });
    cyl(x, G + 5, z, 0.5, 7, 0.5, '#6d7385', 'metal'); box(x, G + 7.8, z, 0.15, 1.4, 2.2, COL[a % 6], 'fabric', { r: [0, 90 - a * 15, 0], nc: true });
    if (a % 3 === 0) cone(CX + Math.cos(t) * (R - 2.2), G + 4.6, CZ + Math.sin(t) * (R - 2.2), 0.9, 1.2, 0.9, '#ff7b25', 'neon', { g: 1, nc: true, lt: { r: 16, b: 0.9 } });
    for (let row = 0; row < 3; row++) {
      const rr = R + 3 + row * 3.4; box(CX + Math.cos(t) * rr, G + 3 + row * 1.6, CZ + Math.sin(t) * rr, 16.6 + row * 0.9, 1.2, 3.4, '#7d8597', 'stone', { r: [0, 90 - a * 15, 0], nc: true });
      for (let k = 0; k < 4; k++) { const tt = t + (k - 1.5) * 0.06, c = pick(COL); box(CX + Math.cos(tt) * rr, G + 4.5 + row * 1.6, CZ + Math.sin(tt) * rr, 1, 1.5 + rnd(0, 0.5), 1, c, 'fabric', { nc: true }); }
    }
  }
  // the throne in the middle, up three steps, with the Mad King on it and the eye over his head
  for (let s = 0; s < 3; s++) cyl(CX, G + 0.4 + s * 0.8, CZ, 16 - s * 4, 0.8, 16 - s * 4, s % 2 ? '#e8ebf2' : '#ffd23f', 'marble');
  box(CX, G + 3.1, CZ - 1.2, 2.6, 1.4, 2.2, '#9b5de5', 'fabric'); box(CX, G + 4.6, CZ - 2.1, 2.6, 4.4, 0.5, '#9b5de5', 'fabric'); for (const s of [-1.5, 1.5]) box(CX + s, G + 3.6, CZ - 1.2, 0.4, 2.4, 2.2, '#ffd23f', 'metal');
  const king = (x, y, z, sx, sy, sz, c, m = 'fabric', extra = {}) => box(CX + x, G + y, CZ - 1.2 + z, sx, sy, sz, c, m, { n: 'King', nc: true, ...extra });
  king(0, 4.6, 0.2, 1.7, 1.7, 1.2, '#7a1f2b'); king(0, 5.95, 0.2, 1.1, 1, 1, '#ffe0bd', 'smooth'); king(0, 5.55, 0.75, 0.9, 0.5, 0.2, '#f5f5f5'); for (const s of [-0.27, 0.27]) king(s, 6.1, 0.72, 0.16, 0.16, 0.06, '#1d1d2c', 'smooth');
  for (const s of [-1.1, 1.1]) king(s, 4.7, 0.4, 0.45, 1.5, 0.5, '#7a1f2b'); king(0, 3.95, 0.9, 1.5, 0.5, 1.4, '#5a1620');
  for (let k = 0; k < 5; k++) cone(CX + (k - 2) * 0.28, G + 7.0, CZ - 1.0, 0.24, 0.5, 0.24, '#ffd23f', 'neon', { n: 'King', nc: true, g: 0.6 });
  box(CX, G + 6.65, CZ - 1.0, 1.5, 0.3, 1.2, '#ffd23f', 'neon', { n: 'Crown', nc: true, g: 0.8, lt: { r: 18, b: 1.1 } });
  ball(CX, G + 11, CZ, 3.2, '#8d99ae', 'neon', { n: 'Eye', nc: true, g: 1, lt: { r: 30, b: 1 } }); ball(CX, G + 11, CZ + 1.3, 1.2, '#1d1d2c', 'smooth', { nc: true }); cyl(CX, G + 13.4, CZ, 0.3, 2, 0.3, '#6d7385', 'metal', { nc: true });
  // four towers to escape the lava: a ramp up, a deck, and a higher lookout you bounce to
  for (let q = 0; q < 4; q++) {
    const t = q * Math.PI / 2 + Math.PI / 4, x = CX + Math.cos(t) * 40, z = CZ + Math.sin(t) * 40, c = COL[q];
    box(x, G + 2, z, 12, 0.6, 12, c, 'planks'); for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) cyl(x + dx, G + 1, z + dz, 0.9, 2, 0.9, '#6d4c33', 'wood');
    wedge(x - Math.cos(t) * 11.5, G + 1.15, z - Math.sin(t) * 11.5, 6, 2.3, 11, c, 'planks', { r: [0, 270 - q * 90 - 45, 0] });
    box(x + Math.cos(t) * 3, G + 2.5, z + Math.sin(t) * 3, 3, 0.4, 3, '#ff5d8f', 'neon', { k: 'bounce', g: 0.6 });
    box(x + Math.cos(t) * 11, G + 8, z + Math.sin(t) * 11, 9, 0.6, 9, '#f5f5f5', 'marble'); cyl(x + Math.cos(t) * 11, G + 4, z + Math.sin(t) * 11, 1.6, 8, 1.6, '#9aa3b5', 'stone');
    box(x + Math.cos(t) * 11, G + 11, z + Math.sin(t) * 11, 0.3, 5, 0.3, '#6d7385', 'metal', { nc: true }); box(x + Math.cos(t) * 11, G + 12.6, z + Math.sin(t) * 11 + 1.2, 0.12, 1.6, 2.4, c, 'fabric', { nc: true });
  }
  // stepping stones (one jump high) and two speed strips
  for (let a = 0; a < 8; a++) { if (a === 2) continue; const t = a * Math.PI / 4, r = a % 2 ? 17 : 50; cyl(CX + Math.cos(t) * r, G + 0.7, CZ + Math.sin(t) * r, 5, 1.4, 5, COL[(a + 2) % 6], 'smooth'); }
  for (const s of [-1, 1]) box(CX + s * 30, G + 0.12, CZ, 3, 0.24, 14, '#4cc9f0', 'neon', { k: 'speed', g: 0.6 });
  // the three gates the guards come out of
  for (const [gx, gz] of GATES) { const a = Math.atan2(gz - CZ, gx - CX), ry = 90 - a * 180 / Math.PI; for (const s of [-3, 3]) box(gx + Math.cos(a) * 4 - Math.sin(a) * s, G + 3.5, gz + Math.sin(a) * 4 + Math.cos(a) * s, 1.4, 7, 1.6, '#6d7385', 'brick', { r: [0, ry, 0], nc: true }); box(gx + Math.cos(a) * 4, G + 7.4, gz + Math.sin(a) * 4, 8, 1.2, 1.8, '#6d7385', 'brick', { r: [0, ry, 0], nc: true }); box(gx + Math.cos(a) * 4.4, G + 3, gz + Math.sin(a) * 4.4, 4.6, 6, 0.4, '#3b2c20', 'planks', { r: [0, ry, 0], nc: true }); }

  /* ---- the things the script moves (they wait under the arena until their decree) ---- */
  box(CX, 2, CZ, 112, 0.8, 1.2, '#ff2b4a', 'neon', { n: 'Beam1', k: 'kill', g: 1 });
  box(CX, 4, CZ + 1, 112, 0.8, 1.2, '#ff8a2b', 'neon', { n: 'Beam2', k: 'kill', g: 1 });
  for (let k = 1; k <= 5; k++) { ball(CX + k * 8, 4, CZ + 20, 5, '#5b4a42', 'stone', { n: 'Rock' + k, k: 'kill' }); cyl(CX + k * 8, 4, CZ + 30, 5.6, 0.06, 5.6, '#3a0d0d', 'smooth', { n: 'Mark' + k, nc: true, t: 0.35 }); }
  ball(CX, G + 1.5, CZ + 30, 1.6, '#4cf0e0', 'neon', { n: 'Gem', nc: true, g: 1, lt: { r: 12, b: 1 } });
  for (let i = 1; i <= 3; i++) {
    const n = 'Guard' + i, x = CX + i * 6, z = CZ - 30, y = G - 18, g = (dx, dy, dz, sx, sy, sz, c, m = 'metal', extra = {}) => box(x + dx, y + dy, z + dz, sx, sy, sz, c, m, { n, nc: true, ...extra });
    g(0, 1.5, 0, 1.2, 1.6, 0.8, '#8d99ae'); g(0, 2.75, 0, 0.9, 0.9, 0.9, '#c9cdd3'); g(0, 3.3, 0, 1, 0.3, 1, '#e63946', 'fabric'); for (const s of [-0.3, 0.3]) g(s, 0.35, 0, 0.42, 0.7, 0.5, '#6d7385');
    g(0.85, 2.2, 0, 0.14, 4.4, 0.14, '#6d4c33', 'wood'); g(0.85, 4.5, 0, 0.3, 0.6, 0.3, '#f5f5f5'); g(-0.75, 1.6, 0, 0.2, 1.2, 0.9, '#3a86ff');
  }
  return { v: 2, engine: 2, n: 'Crown Chaos', mode: 'obby', sky: 'day', parts, scripts: [{ n: 'Crown', src: CROWN_SCRIPT }] };
}
