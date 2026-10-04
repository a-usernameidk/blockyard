// Reel Rivals: Blockyard's fishing game. Cast from the dock or sail your boat out: the shallows have small
// fish, the reef has better ones, and the deep water past the red buoys has the best... and a shark that eats
// your catch if it reaches you. Sell at the market, buy a better rod, a faster boat and a bigger bucket.
// A hangout: no timer, and it remembers your money and upgrades on this device.
import { kit } from './gamekit.js';

const G = 20, SEA = 19.2, CX = 500, CZ = 500;   // land height, the top of the water, the island's middle
export const REEL_FISH = [['Minnow', 5], ['Bluegill', 12], ['Sunny Perch', 28], ['Clownfish', 30], ['Parrotfish', 55], ['Reef Ray', 95], ['Lanternfish', 80], ['Swordfish', 160], ['Golden Koi', 600]];

export const REEL_SCRIPT = `// Reel Rivals: the script that runs this world.
names = ${JSON.stringify(REEL_FISH.map((f) => f[0]))}
worth = ${JSON.stringify(REEL_FISH.map((f) => f[1]))}
costs = [150, 500, 1500]
money = load("money", 0)
rod = load("rod", 0)
boat = load("boat", 0)
bucket = load("bucket", 0)
got = load("got", 0)          // which of the 9 kinds you've caught (one bit each)
count = 0                    // fish in the bucket
value = 0                    // what they'll sell for
inBoat = false
boatDir = 180
fishing = false
bite = false
castNo = 0
sharkWait = 0
sharkA = 0
bob = part("Bobber")
fin = part("Shark")
boatParts = parts("Boat") + [part("BoatSeat")]

fn cap() { return 5 + bucket * 3 }
fn kinds() {
  n = 0
  g = got
  repeat 9 { n += g % 2  g = floor(g / 2) }
  return n
}
fn show() {
  board("Money", "$" + str(money))
  board("Bucket", str(count) + " of " + str(cap()) + " ($" + str(value) + ")")
  board("Fish book", str(kinds()) + " of 9")
}
fn keep() { save("money", money)  save("rod", rod)  save("boat", boat)  save("bucket", bucket)  save("got", got) }
fn zone() {
  // ("let" keeps these names inside this function, so they can't change a dx or d somewhere else)
  let zx = player.x - ${CX}
  let zz = player.z - ${CZ}
  let far = sqrt(zx * zx + zz * zz)
  if far > 230 { return 2 }
  if far > 110 { return 1 }
  return 0
}

on start {
  bob.hide()
  part("Rod").follow(0.45, 0.9, 0.9)
  show()
  say("Fish from the dock, or take the boat out. Yellow buoys: the reef. Red buoys: deep water, big fish, and a shark.")
}

fn board_boat() {
  seat = part("BoatSeat")
  for p in boatParts { p.solid(false) }
  teleport(seat.x, seat.y - 0.75, seat.z)
  face(boatDir)
  for p in boatParts { p.follow() }
  sail(16 + boat * 4, 85, 0.35)
  inBoat = true
  sound("go")
}
fn leave_boat(d) {
  boatDir = player.facing
  walk()
  for p in boatParts { p.unfollow()  p.solid(true) }
  teleport(d.x, d.y + 0.6, d.z)
  inBoat = false
}

fn stopFishing() { fishing = false  bite = false  bob.hide() }

fn cast() {
  if count >= cap() { say("Your bucket is full. Sell your fish at the market on the island.")  return }
  castNo += 1
  let mine = castNo
  fishing = true
  bite = false
  f = player.facing
  bob.moveTo(player.x + sin(f) * 5, ${SEA + 0.15}, player.z - cos(f) * 5)
  bob.show()
  sound("splat")
  wait(random(16, 46 - rod * 8) / 10)
  if mine != castNo or not fishing { return }
  bite = true
  bob.move(0, -0.4, 0, 0.12)
  sound("tick")
  wait(1.2)
  if mine == castNo and bite { stopFishing()  say("It got away...") }
}

fn land() {
  z = zone()
  roll = random(1, 100) + rod * 7
  i = 0
  if roll > 60 { i = 1 }
  if roll > 92 { i = 2 }
  if z == 2 and i == 2 and roll < 99 { i = 1 }       // the Golden Koi is really rare
  k = z * 3 + i
  count += 1
  value += worth[k]
  if floor(got / [1, 2, 4, 8, 16, 32, 64, 128, 256][k]) % 2 == 0 { got += [1, 2, 4, 8, 16, 32, 64, 128, 256][k]  say("New fish: " + names[k] + "! ($" + str(worth[k]) + ")")  sound("badge") }
  else { say(names[k] + " ($" + str(worth[k]) + ")")  sound("coin") }
  if k == 8 { send("koi") }
  stopFishing()
  show()
  keep()
}

on use {
  if fishing {
    if bite { land() } else { stopFishing()  say("Too early! Wait for the bobber to dip.") }
    return
  }
  if inBoat {
    d = near("Dock", 7)
    if d { leave_boat(d)  return }
    if player.vel > 4 { say("Slow down first: let go and the boat stops.")  return }
    cast()
    return
  }
  if near("BoatSeat", 5) { board_boat()  return }
  if near("Dock", 3) { cast()  return }
  say("Fish from the dock, or take the boat out.")
}

every 0.2 {
  if fishing { if bite { prompt("REEL IN!") } else { prompt("Wait for a bite...") }  return }
  if inBoat { if near("Dock", 7) { prompt("Get out") } else { prompt("Cast") }  return }
  if near("BoatSeat", 5) { prompt("Take the boat")  return }
  if near("Dock", 3) { prompt("Cast")  return }
  prompt("")
}

// the market and the three upgrade pads on the island
on touch "Market" {
  if count == 0 { say("Bring fish here to sell them.")  return }
  money += value
  say("Sold " + str(count) + " fish for $" + str(value) + "!")
  sound("buy")
  send("sold", money)
  count = 0
  value = 0
  show()
  keep()
}
fn buy(what, level) {
  if level >= 3 { say("Your " + what + " is already the best there is.")  return false }
  c = costs[level]
  if money < c { say("A better " + what + " costs $" + str(c) + ". You have $" + str(money) + ".")  sound("error")  return false }
  money -= c
  sound("buy")
  say("Better " + what + "! (level " + str(level + 1) + " of 3)")
  return true
}
on touch "RodPad" { if buy("rod", rod) { rod += 1  show()  keep() } }
on touch "BoatPad" { if buy("boat", boat) { boat += 1  show()  keep()  } }
on touch "BucketPad" { if buy("bucket", bucket) { bucket += 1  show()  keep() } }

// the shark: it circles the deep water. When it passes within 150 studs of you out there, it comes for you
// (a little slower than the boat, so you can run... if you aren't busy fishing).
every 0.1 {
  dx = player.x - fin.x
  dz = player.z - fin.z
  d = sqrt(dx * dx + dz * dz)
  if zone() == 2 and sharkWait <= 0 and d < 150 {
    if d > 0.5 { k = min(d, 1.25) / d  for p in parts("Shark") { p.move(dx * k, 0, dz * k, 0.1) } }
    if d < 3.5 and not player.swimming or d < 2 {
      if count > 0 { say("The shark ate your catch!")  sound("die")  count = 0  value = 0  show() } else { say("The shark found an empty bucket.") }
      stopFishing()
      sharkWait = 12
    }
  } else {
    sharkA = (sharkA + 0.25) % 360
    tx = ${CX} + sin(sharkA) * 300 - fin.x
    tz = ${CZ} - cos(sharkA) * 300 - fin.z
    t = sqrt(tx * tx + tz * tz)
    if t > 0.5 { k = min(t, 1.6) / t  for p in parts("Shark") { p.move(tx * k, 0, tz * k, 0.1) } }
    if sharkWait > 0 { sharkWait -= 0.1 }
  }
}
every 2 { if zone() == 2 and sharkWait <= 0 and dist(fin) < 60 { say("Shark!")  sound("tick") } }

// rivals: everyone in the server hears about big moments
on message "koi" { if not mine { say(from[0] + " caught the Golden Koi!") } }
on message "sold" { if not mine { board("Rival", from[0] + " $" + str(value)) } }
`;

export function reelWorld() {
  const K = kit(404), { parts, box, cyl, ball, wedge, cone, rnd, pick } = K;
  box(CX, 2, CZ, 960, 4, 960, '#c9b27a', 'sand');                                  // the sea floor
  box(CX, (SEA + 0.8) / 2, CZ, 900, SEA - 0.8, 900, '#2f8fd6', 'water', { t: 0.3 }); // the sea
  for (const [x, z, sx, sz] of [[CX, 48, 904, 2], [CX, 952, 904, 2], [48, CZ, 2, 904], [952, CZ, 2, 904]]) box(x, 22, z, sx, 44, sz, '#ffffff', 'glass', { t: 1 }); // the edge of the world
  /* ---- the island ---- */
  cyl(CX, 12, CZ, 84, 16, 84, '#e3cf8f', 'sand');
  cyl(CX, G + 0.2, CZ - 4, 54, 0.4, 54, '#5fc76b', 'grass');
  box(CX, G + 0.45, CZ + 4, 4, 0.5, 4, '#7cc8ff', 'smooth', { k: 'spawn' });
  for (const [x, z] of [[478, 482], [522, 480], [470, 508], [530, 506], [500, 470], [486, 462], [516, 462]]) {
    cyl(x, G + 4.2, z, 0.9, 8, 0.9, '#8b6a45', 'wood', { r: [rnd(-6, 6), 0, rnd(-6, 6)] });
    for (let a = 0; a < 6; a++) box(x + Math.cos(a * 1.047) * 2, G + 8.2, z + Math.sin(a * 1.047) * 2, 3.8, 0.2, 1.2, '#3f9a4f', 'grass', { r: [0, -a * 60, 16] });
  }
  // the market: a stall with a striped roof and the pad you sell on
  box(480, G + 0.5, 494, 5, 0.2, 5, '#ffd23f', 'neon', { n: 'Market', g: 0.5, nc: true });
  box(476, G + 1.3, 494, 1.2, 1.8, 6, '#8f6a4a', 'planks'); for (const z of [491, 497]) box(476, G + 2.6, z, 0.3, 4.4, 0.3, '#6d4c33', 'wood');
  for (let i = 0; i < 4; i++) box(477.5, G + 4.9, 491.4 + i * 1.75, 4.6, 0.25, 1.75, i % 2 ? '#f5f5f5' : '#e63946', 'fabric', { r: [0, 0, 8] });
  box(476, G + 2.5, 494, 0.8, 0.5, 1.4, '#4cc9f0', 'smooth');
  // the upgrade pads: each has a little model of what it sells
  const pad = (x, z, name, c) => { box(x, G + 0.5, z, 4.4, 0.2, 4.4, c, 'neon', { n: name, g: 0.5, nc: true }); box(x, G + 2.2, z - 3.4, 0.3, 3.6, 0.3, '#6d4c33', 'wood'); box(x, G + 3.6, z - 3.4, 3.4, 1.2, 0.25, c, 'smooth'); };
  pad(492, 478, 'RodPad', '#9b5de5'); box(492, G + 3.6, 474.4, 2.6, 0.12, 0.12, '#1d1d2c', 'smooth', { r: [0, 0, 20] });
  pad(500, 476, 'BoatPad', '#3a86ff'); box(500, G + 3.5, 472.4, 2, 0.4, 0.2, '#f5f5f5', 'smooth');
  pad(508, 478, 'BucketPad', '#ff7b25'); cyl(508, G + 3.6, 474.4, 0.9, 0.9, 0.3, '#f5f5f5', 'smooth', { r: [90, 0, 0] });
  // a tall striped beacon, so you can always find the island from far out
  for (let i = 0; i < 6; i++) cyl(CX - 14, G + 3 + i * 6, CZ - 14, 4.5 - i * 0.4, 6, 4.5 - i * 0.4, i % 2 ? '#e63946' : '#f5f5f5', 'smooth');
  ball(CX - 14, G + 38, CZ - 14, 3.4, '#fff3b0', 'neon', { g: 1, lt: { r: 60, b: 2 } });
  // a hut and a campfire
  box(524, G + 2.1, 490, 8, 4, 7, '#a0764e', 'planks'); box(524, G + 4.6, 490, 9.4, 0.5, 8.4, '#6d7781', 'diamond'); wedge(524, G + 5.6, 490, 9.4, 1.6, 8.4, '#b5482e', 'planks');
  cone(486, G + 0.9, 506, 1.2, 1.2, 1.2, '#ff7b25', 'neon', { g: 1, nc: true, lt: { r: 14, b: 1.2 } });
  /* ---- the dock (south) and your boat ---- */
  for (let z = 536; z <= 566; z += 3) box(CX, G + 0.05, z, 5, 0.3, 2.8, z % 2 ? '#9a7550' : '#8b6a45', 'planks', { n: 'Dock' });
  for (const z of [538, 552, 566]) for (const s of [-2.4, 2.4]) cyl(CX + s, G - 3, z, 0.6, 9, 0.6, '#6d4c33', 'wood');
  cyl(CX - 2.4, G + 1.6, 566, 0.3, 3, 0.3, '#6d4c33', 'wood'); ball(CX - 2.4, G + 3.3, 566, 0.8, '#fff3b0', 'neon', { g: 1, lt: { r: 18, b: 1 } });
  const bx = CX + 6.4, bz = 562, by = SEA;
  const bt = (x, y, z, sx, sy, sz, c, m = 'planks', extra = {}) => box(bx + x, by + y, bz + z, sx, sy, sz, c, m, { n: 'Boat', ...extra });
  bt(0, 0.1, 0, 2.8, 0.5, 6, '#c9532f');                                   // the bottom
  for (const s of [-1.3, 1.3]) bt(s, 0.75, 0, 0.3, 1, 6, '#e0e0e0');        // the sides
  bt(0, 0.75, -3, 2.9, 1, 0.3, '#e0e0e0');                                 // the back (north)
  wedge(bx, by + 0.6, bz + 3.9, 2.9, 1.3, 1.8, '#e0e0e0', 'planks', { n: 'Boat' }); // the bow points south
  bt(0, 0.9, -1.2, 2.3, 0.2, 0.9, '#8b6a45');                               // a bench
  box(bx, by + 0.75, bz + 0.6, 1.6, 0.2, 1, '#8b6a45', 'planks', { n: 'BoatSeat' });
  bt(0, 0.9, -3.4, 0.6, 1.3, 0.6, '#3b3b44', 'metal');                      // the motor
  bt(0.9, 2.2, -2.6, 0.12, 2.6, 0.12, '#6d4c33', 'wood'); bt(0.9, 3.2, -2.1, 0.06, 0.7, 1, '#e63946', 'fabric'); // a little flag
  // the bobber and the rod (the script moves them)
  ball(CX, SEA + 0.15, 520, 0.5, '#e63946', 'smooth', { n: 'Bobber', nc: true, g: 0.3 });
  box(CX, G + 30, CZ, 0.1, 0.1, 2.6, '#6d4c33', 'wood', { n: 'Rod', nc: true, r: [28, 0, 0] });
  /* ---- buoys: yellow = the reef starts, red = deep water ---- */
  for (let a = 0; a < 20; a++) { const x = CX + Math.cos(a * Math.PI / 10) * 110, z = CZ + Math.sin(a * Math.PI / 10) * 110; cyl(x, SEA + 0.5, z, 1.2, 1.4, 1.2, '#ffd23f', 'smooth', { nc: true, mo: { t: 'swing', d: [8, 0, 6], s: 3 + (a % 3) } }); }
  for (let a = 0; a < 30; a++) { const x = CX + Math.cos(a * Math.PI / 15) * 230, z = CZ + Math.sin(a * Math.PI / 15) * 230; cyl(x, SEA + 0.6, z, 1.5, 1.8, 1.5, '#e63946', 'smooth', { nc: true, mo: { t: 'swing', d: [8, 0, 6], s: 3 + (a % 3) } }); ball(x, SEA + 1.8, z, 0.6, '#ff5d5d', 'neon', { nc: true, g: 1 }); }
  /* ---- the reef: rocks and coral poking out of the water ---- */
  for (let i = 0; i < 26; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(130, 215), x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r;
    if (Math.abs(x - CX) < 16 && z > CZ) continue; // (keep the way out from the dock clear)
    const d = rnd(4, 9);
    ball(x, SEA - d * 0.18, z, d, pick(['#8d8f98', '#7c8a84', '#9a8f86']), 'stone');
    for (let k = 0; k < 3; k++) cone(x + rnd(-d / 2, d / 2), SEA + 0.6, z + rnd(-d / 2, d / 2), 0.9, rnd(1.4, 2.6), 0.9, pick(['#ff5d8f', '#ff7b25', '#9b5de5', '#4cc9f0']), 'smooth', { nc: true });
  }
  /* ---- deep water: a wreck, a lighthouse rock, and the shark ---- */
  box(792, SEA - 0.4, 300, 9, 3.4, 26, '#6d4c33', 'planks', { r: [0, 30, 24] }); cyl(790, SEA + 6, 296, 0.8, 14, 0.8, '#5b4030', 'wood', { r: [0, 0, 24] });
  ball(190, SEA - 3, 240, 22, '#8d8f98', 'stone'); cyl(190, SEA + 12, 240, 5, 16, 5, '#f5f5f5', 'smooth'); cyl(190, SEA + 20.6, 240, 6, 1.2, 6, '#e63946', 'smooth'); ball(190, SEA + 22.6, 240, 3, '#fff3b0', 'neon', { g: 1, lt: { r: 50, b: 2 } });
  wedge(CX, SEA + 0.9, CZ - 300, 0.4, 2.2, 2.4, '#4b5563', 'smooth', { n: 'Shark', nc: true });
  box(CX, SEA - 0.5, CZ - 300, 1.8, 0.9, 6, '#4b5563', 'smooth', { n: 'Shark', nc: true, t: 0.2 });
  return { v: 2, engine: 2, n: 'Reel Rivals', mode: 'hangout', sky: 'day', parts, scripts: [{ n: 'Fishing', src: REEL_SCRIPT }] };
}
