// Reel Rivals: Blockyard's fishing game, and a race. Captain Brine is after the Leviathan, and he lands it when
// the clock runs out. Beat him to it: fish (every fish is a fight: tap Use to reel, ease off when it runs or the
// line snaps), sell at the market, buy better rods, a faster boat and a bigger bucket, find the chests, buy the
// Moon Lure from the lighthouse keeper, and hook the Leviathan in the maelstrom.
// All of it is Engine v2 parts and one Blockscript, so the server can replay a win and pay for it.
import { kit } from './gamekit.js';

const G = 20, SEA = 19.2, CX = 500, CZ = 500;   // land height, the top of the water, the island's middle
// name, what it sells for, how hard it fights, the color of the one you hold up
export const REEL_FISH = [['Minnow', 5, 1, '#b9c4cf'], ['Bluegill', 12, 1, '#4c8fd6'], ['Sunny Perch', 28, 2, '#ffd23f'], ['Clownfish', 30, 2, '#ff7b25'], ['Parrotfish', 55, 3, '#35c2a0'], ['Reef Ray', 95, 4, '#8d6bd6'],
  ['Lanternfish', 80, 4, '#c6ff7a'], ['Swordfish', 160, 5, '#5c7da8'], ['Golden Koi', 600, 6, '#ffcf3a'], ['Old Boot', 1, 1, '#6d4c33'], ['Ghost Eel', 130, 5, '#d9f2ef'], ['Sunken Chest', 320, 3, '#b8862b'], ['THE LEVIATHAN', 0, 8, '#2a6f5e']];
export const REEL_LIGHT = [190, 240], REEL_WRECK = [792, 300], REEL_MAEL = [760, 760], REEL_TIME = 1080;
export const REEL_COSTS = { rod: [120, 400, 1000], boat: [150, 450], bucket: [100, 300], lure: 500 };

export const REEL_SCRIPT = `// Reel Rivals: the script that runs this world.
names = ${JSON.stringify(REEL_FISH.map((f) => f[0]))}
worth = ${JSON.stringify(REEL_FISH.map((f) => f[1]))}
strong = ${JSON.stringify(REEL_FISH.map((f) => f[2]))}
cols = ${JSON.stringify(REEL_FISH.map((f) => f[3]))}
rodCost = ${JSON.stringify(REEL_COSTS.rod)}
boatCost = ${JSON.stringify(REEL_COSTS.boat)}
bucketCost = ${JSON.stringify(REEL_COSTS.bucket)}
money = 0
rod = 0
boat = 0
bucket = 0
lure = false
got = [false, false, false, false, false, false, false, false, false, false, false, false, false]
book = 0
count = 0                    // fish in the bucket
value = 0                    // what they'll sell for
inBoat = false
boatDir = 180
state = 0                    // 0 = not fishing, 1 = waiting for a bite, 2 = a bite: hook it!, 3 = the fight
castNo = 0
fishK = 0
reach = 0                     // how far out the fish is (reel it to 0)
far = 0                      // this far and it is gone
tension = 0                  // 100 snaps the line
burst = false                // the fish is running: reeling now costs double
burstT = 0
taught = false
left = ${REEL_TIME}          // seconds until Captain Brine lands the Leviathan
lost = false
sharkWait = 0
sharkA = 0
chests = [false, false, false]
bob = part("Bobber")
fin = part("Shark")
trophy = part("Trophy")
boatParts = parts("Boat") + [part("BoatSeat")]

fn cap() { return 5 + bucket * 4 }
fn clock(s) {
  let m = floor(s / 60)
  let r = s % 60
  if r < 10 { return str(m) + ":0" + str(r) }
  return str(m) + ":" + str(r)
}
fn show() {
  board("Money", "$" + str(money))
  board("Bucket", str(count) + " of " + str(cap()) + " ($" + str(value) + ")")
  board("Fish book", str(book) + " of 13")
}
fn bar(v) {
  let t = ""
  let n = round(v / 10)
  let i = 0
  repeat 10 {
    if i < n { t = t + "#" } else { t = t + "-" }
    i += 1
  }
  return t
}
fn zone() {
  let zx = player.x - ${REEL_MAEL[0]}
  let zz = player.z - ${REEL_MAEL[1]}
  if zx * zx + zz * zz < 2500 { return 4 }
  zx = player.x - ${REEL_WRECK[0]}
  zz = player.z - ${REEL_WRECK[1]}
  if zx * zx + zz * zz < 2500 { return 3 }
  zx = player.x - ${CX}
  zz = player.z - ${CZ}
  let d = sqrt(zx * zx + zz * zz)
  if d > 230 { return 2 }
  if d > 110 { return 1 }
  return 0
}

on start {
  bob.hide()
  trophy.hide()
  trophy.follow(0, 3.2, 0)
  part("Rod").follow(0.45, 0.9, 0.9)
  for p in parts("Swirl") { p.spin(0, 50, 0) }
  for p in parts("Swirl2") { p.spin(0, -80, 0) }
  show()
  board("Brine", clock(left))
  say("Captain Brine lands the Leviathan in ${REEL_TIME / 60} minutes. Beat him to it! Fish, sell, upgrade. (Use = cast, hook and reel.)")
}

fn board_boat() {
  let seat = part("BoatSeat")
  for p in boatParts { p.solid(false) }
  teleport(seat.x, seat.y - 0.75, seat.z)
  face(boatDir)
  for p in boatParts { p.follow() }
  sail(16 + boat * 5, 85, 0.35)
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

fn stopFishing() {
  state = 0
  burst = false
  bob.hide()
  board("Line")
  board("Fish")
}
fn cast() {
  if count >= cap() { say("Your bucket is full. Sell your fish at the market on the island.")  return }
  castNo += 1
  let mine = castNo
  state = 1
  let f = player.facing
  bob.moveTo(player.x + sin(f) * 6, ${SEA + 0.15}, player.z - cos(f) * 6)
  bob.show()
  sound("splat")
  wait(random(14, 40 - rod * 7) / 10)
  if mine != castNo or state != 1 { return }
  state = 2
  bob.move(0, -0.4, 0, 0.12)
  sound("tick")
  wait(1.3)
  if mine == castNo and state == 2 { stopFishing()  say("It got away... (press Use the moment the bobber dips)") }
}
fn hook() {
  let z = zone()
  let roll = random(1, 100) + rod * 6
  let i = 0
  if roll > 58 { i = 1 }
  if roll > 90 { i = 2 }
  let k = min(z, 2) * 3 + i
  if k == 8 and random(1, 10) > 1 { k = 7 }          // the Golden Koi is really rare
  if z == 3 {
    k = 10
    if roll < 30 { k = 9 }
    if roll > 82 { k = 11 }
  }
  if z == 4 {
    if lost { say("The maelstrom is quiet. Brine already took what lived here.") }
    else if rod < 3 { say("Something huge circles under the boat and ignores your little rod. (You need the Titan Rod.)") }
    else if not lure { say("Something huge circles under the boat. It wants a Moon Lure: the lighthouse keeper sells them.") }
    else { k = 12 }
  }
  fishK = k
  reach = 6 + strong[k] * 1.5
  far = reach + 8
  if k == 12 { reach = 40  far = 64  say("THE LEVIATHAN IS ON THE LINE! Reel! Ease off when it runs!")  sound("badge") }
  tension = 30
  burst = false
  burstT = 1.4
  state = 3
  if not taught { taught = true  say("Hooked! Tap Use to reel it in. When it RUNS, stop: reeling then snaps the line.") }
}
fn reel() {
  let add = 12 + strong[fishK] * 1.2 - rod * 1.5
  if burst { add = add * 2.2 }
  tension += add
  reach -= 1.3 + rod * 0.35
  sound("tick")
  if tension >= 100 {
    stopFishing()
    sound("error")
    if strong[fishK] > 2 + rod * 1.5 { say("SNAP! That one is too strong for this rod. Ease off when it runs, or buy a better rod.") } else { say("SNAP! The line broke. Reel slower, and stop when the fish runs.") }
    return
  }
  if reach <= 0 { land() }
}
fn land() {
  let k = fishK
  stopFishing()
  trophy.color(cols[k])
  trophy.show()
  if k == 12 {
    say("YOU LANDED THE LEVIATHAN! Captain Brine can keep his minnows.")
    sound("win")
    got[12] = true
    win()
    return
  }
  count += 1
  value += worth[k]
  if not got[k] { got[k] = true  book += 1  say("New fish: " + names[k] + "! ($" + str(worth[k]) + ")")  sound("badge") }
  else { say(names[k] + " ($" + str(worth[k]) + ")")  sound("coin") }
  show()
  wait(1.6)
  if state == 0 { trophy.hide() }
}

on use {
  if state == 3 { reel()  return }
  if state == 2 { hook()  return }
  if state == 1 { stopFishing()  say("Too early! Wait for the bobber to dip.")  return }
  if inBoat {
    let d = near("Dock", 7)
    if d { leave_boat(d)  return }
    if player.vel > 4 { say("Slow down first: let go and the boat stops.")  return }
    cast()
    return
  }
  if near("BoatSeat", 5) { board_boat()  return }
  if near("Dock", 3) { cast()  return }
  say("Fish from a dock, or take the boat out.")
}

every 0.2 {
  if state == 3 { if burst { prompt("IT'S RUNNING: WAIT!") } else { prompt("REEL! (tap)") }  return }
  if state == 2 { prompt("HOOK IT!")  return }
  if state == 1 { prompt("Wait for a bite...")  return }
  if inBoat { if near("Dock", 7) { prompt("Get out") } else { prompt("Cast") }  return }
  if near("BoatSeat", 5) { prompt("Take the boat")  return }
  if near("Dock", 3) { prompt("Cast")  return }
  prompt("")
}

// the fight: the fish swims away all the time, and now and then it RUNS. The line cools down when you leave it alone.
every 0.1 {
  if state != 3 { return }
  let s = strong[fishK]
  burstT -= 0.1
  if burstT <= 0 {
    if burst { burst = false  burstT = random(12, 30) / 10 }
    else { burst = true  burstT = random(6, 11) / 10 + s * 0.03  sound("splat") }
  }
  if burst { reach += 0.2 + s * 0.03 } else { reach += 0.04 + s * 0.008 }
  tension = max(0, tension - 2.5)
  if reach >= far {
    stopFishing()
    sound("error")
    if strong[fishK] > 2 + rod * 1.5 { say("It swam off. It is too strong for this rod.") } else { say("It swam off. Keep reeling between its runs.") }
    return
  }
  let f = player.facing
  let out = 3 + reach * 0.45
  bob.moveTo(player.x + sin(f) * out, ${SEA + 0.15}, player.z - cos(f) * out, 0.1)
  board("Line", bar(tension))
  if burst { board("Fish", str(ceil(reach)) + " m  RUNNING!") } else { board("Fish", str(ceil(reach)) + " m") }
}

// the market, the upgrade pads, the lighthouse keeper, the chests
on touch "Market" {
  if count == 0 { say("Bring fish here to sell them.")  return }
  money += value
  say("Sold " + str(count) + " fish for $" + str(value) + "!")
  sound("buy")
  count = 0
  value = 0
  show()
}
fn buy(what, level, costs) {
  if level >= len(costs) { say("Your " + what + " is already the best there is.")  return false }
  let c = costs[level]
  if money < c { say("A better " + what + " costs $" + str(c) + ". You have $" + str(money) + ".")  sound("error")  return false }
  money -= c
  sound("buy")
  return true
}
on touch "RodPad" { if buy("rod", rod, rodCost) { rod += 1  show()  say(["A Reef Rod! Stronger, and the fish bite sooner.", "A Deep Sea Rod! Made for the big ones.", "THE TITAN ROD. Now you need a Moon Lure."][rod - 1]) } }
on touch "BoatPad" { if buy("boat", boat, boatCost) { boat += 1  show()  say(["A bigger motor! The boat is faster.", "The fastest boat on the sea!"][boat - 1])  if inBoat { sail(16 + boat * 5, 85, 0.35) } } }
on touch "BucketPad" { if buy("bucket", bucket, bucketCost) { bucket += 1  show()  say("A bigger bucket: it holds " + str(cap()) + " fish.") } }
on touch "LurePad" {
  if lure { say("Keeper: You have the lure. The maelstrom is in the far south-east. Go!")  return }
  if money < ${REEL_COSTS.lure} { say("Keeper: A Moon Lure is $${REEL_COSTS.lure}. Nothing else will tempt the Leviathan. You have $" + str(money) + ".")  sound("error")  return }
  money -= ${REEL_COSTS.lure}
  lure = true
  sound("badge")
  show()
  if rod < 3 { say("Keeper: One Moon Lure. But that rod won't hold it: you need the Titan Rod too.") } else { say("Keeper: One Moon Lure. The maelstrom is in the far south-east. Good luck!") }
}
fn chest(i, cash, where) {
  if chests[i] { return }
  chests[i] = true
  money += cash
  sound("badge")
  show()
  say("A chest " + where + "! $" + str(cash) + ".")
}
on touch "Chest1" { chest(0, 120, "on Palm Cay")  part("Chest1").color("#5a4630") }
on touch "Chest2" { chest(1, 250, "on Skull Rock")  part("Chest2").color("#5a4630") }
on touch "Chest3" { chest(2, 200, "behind the lighthouse")  part("Chest3").color("#5a4630") }

// the clock
every 1 {
  if lost { return }
  left -= 1
  board("Brine", clock(max(0, left)))
  if left == 600 { say("Brine: Ten minutes, little fish. I can smell that Leviathan already.") }
  if left == 300 { say("Brine: Five minutes! Is that bucket all you have?") }
  if left == 120 { say("Brine: Two minutes. My harpoons are ready.")  sound("tick") }
  if left == 30 { say("Brine: Thirty seconds!")  sound("tick") }
  if left <= 0 {
    lost = true
    board("Brine", "got it first")
    sound("die")
    say("Captain Brine landed the Leviathan. You lose the race! Press Restart in the menu to try again.")
  }
}
// the shark: it circles the deep water. When it passes within 150 studs of you out there, it comes for you
// (a little slower than the boat, so you can run... if you aren't busy fishing). It eats what is in your bucket.
every 0.1 {
  let dx = player.x - fin.x
  let dz = player.z - fin.z
  let d = sqrt(dx * dx + dz * dz)
  if zone() >= 2 and sharkWait <= 0 and d < 150 and fishK != 12 {
    if d > 0.5 { let k = min(d, 1.25) / d  for p in parts("Shark") { p.move(dx * k, 0, dz * k, 0.1) } }
    if d < 3.5 and not player.swimming or d < 2 {
      if count > 0 { say("The shark ate your catch!")  sound("die")  count = 0  value = 0  show() } else { say("The shark found an empty bucket.") }
      if state > 0 { stopFishing() }
      sharkWait = 14
    }
  } else {
    sharkA = (sharkA + 0.25) % 360
    let tx = ${CX} + sin(sharkA) * 300 - fin.x
    let tz = ${CZ} - cos(sharkA) * 300 - fin.z
    let t = sqrt(tx * tx + tz * tz)
    if t > 0.5 { let k = min(t, 1.6) / t  for p in parts("Shark") { p.move(tx * k, 0, tz * k, 0.1) } }
    if sharkWait > 0 { sharkWait -= 0.1 }
  }
}
every 2 { if zone() >= 2 and sharkWait <= 0 and dist(fin) < 60 and fishK != 12 { say("Shark!")  sound("tick") } }
`;

export function reelWorld() {
  const K = kit(404), { parts, box, cyl, ball, wedge, cone, rnd, pick } = K;
  const WOOD = '#8b6a45', DWOOD = '#6d4c33';
  box(CX, 2, CZ, 960, 4, 960, '#c9b27a', 'sand');                                  // the sea floor
  box(CX, (SEA + 0.8) / 2, CZ, 900, SEA - 0.8, 900, '#1f6fb5', 'water', { t: 0.3 }); // the sea
  // lighter water over the reef and the shallows (just a tint on top: you sail straight over it)
  cyl(CX, SEA + 0.02, CZ, 460, 0.02, 460, '#2f9bd6', 'smooth', { nc: true, t: 0.45 });
  cyl(CX, SEA + 0.04, CZ, 220, 0.02, 220, '#4fd0d8', 'smooth', { nc: true, t: 0.45 });
  for (const [x, z, sx, sz] of [[CX, 48, 904, 2], [CX, 952, 904, 2], [48, CZ, 2, 904], [952, CZ, 2, 904]]) box(x, 22, z, sx, 44, sz, '#ffffff', 'glass', { t: 1 }); // the edge of the world
  const palm = (x, z, hgt = 8, y = G) => {
    cyl(x, y + hgt / 2 + 0.2, z, 0.9, hgt, 0.9, WOOD, 'wood', { r: [rnd(-7, 7), 0, rnd(-7, 7)] });
    for (let a = 0; a < 6; a++) box(x + Math.cos(a * 1.047) * 2, y + hgt + 0.2, z + Math.sin(a * 1.047) * 2, 3.8, 0.2, 1.2, pick(['#3f9a4f', '#4aa85a']), 'grass', { r: [0, -a * 60, 16], nc: true });
    for (let a = 0; a < 3; a++) ball(x + Math.cos(a * 2.1) * 0.5, y + hgt - 0.5, z + Math.sin(a * 2.1) * 0.5, 0.6, '#7a5230', 'wood', { nc: true });
  };
  const rockAt = (x, z, d, y = SEA) => ball(x, y - d * 0.18, z, d, pick(['#8d8f98', '#7c8a84', '#9a8f86']), 'stone');
  const lampPost = (x, z, y = G) => { cyl(x, y + 1.6, z, 0.3, 3.2, 0.3, DWOOD, 'wood'); ball(x, y + 3.4, z, 0.8, '#fff3b0', 'neon', { g: 1, nc: true, lt: { r: 16, b: 0.9 } }); };
  const chestAt = (n, x, y, z) => { box(x, y + 0.5, z, 1.6, 1, 1.1, '#b8862b', 'planks', { n }); box(x, y + 1.05, z, 1.7, 0.2, 1.2, '#ffd23f', 'metal', { nc: true }); box(x, y + 0.6, z + 0.58, 0.3, 0.35, 0.08, '#ffd23f', 'metal', { nc: true }); };

  /* ---- the island ---- */
  cyl(CX, 12, CZ, 92, 16, 92, '#e3cf8f', 'sand');
  cyl(CX, 11.8, CZ, 104, 13.6, 104, '#d9c486', 'sand');                              // a wider shelf just under the water
  cyl(CX, G + 0.2, CZ - 4, 58, 0.4, 58, '#5fc76b', 'grass');
  cyl(529, G + 0.7, 475, 15, 1, 13, '#56b962', 'grass'); cyl(530, G + 1.5, 474, 8, 1, 7, '#4fae5b', 'grass');
  box(CX, G + 0.45, CZ + 4, 4, 0.5, 4, '#7cc8ff', 'smooth', { k: 'spawn' });
  for (const [x, z] of [[478, 482], [522, 480], [470, 508], [530, 506], [486, 462], [524, 466], [466, 494], [536, 492]]) palm(x, z, rnd(7, 10));
  for (let a = 0; a < 14; a++) { const an = a * 0.449 + 0.2, r = rnd(41, 45); if (Math.abs(Math.sin(an) * r) < 8 && Math.cos(an) > 0) continue; rockAt(CX + Math.sin(an) * r, CZ + Math.cos(an) * r, rnd(2, 4.5), G + 0.6); }
  for (let z = 512; z <= 534; z += 2.2) box(CX + rnd(-0.3, 0.3), G + 0.44, z, 3.4, 0.1, 1.8, pick(['#9a7550', WOOD]), 'planks', { nc: true });   // a plank path to the dock
  // the market: two stalls with striped roofs, crates of fish, and the pad you sell on
  box(480, G + 0.5, 494, 5, 0.2, 5, '#ffd23f', 'neon', { n: 'Market', g: 0.5, nc: true });
  const stall = (x, z, c) => {
    box(x, G + 1.3, z, 1.2, 1.8, 6, '#8f6a4a', 'planks'); for (const s of [-3, 3]) box(x, G + 2.6, z + s, 0.3, 4.4, 0.3, DWOOD, 'wood');
    for (let i = 0; i < 4; i++) box(x + 1.5, G + 4.9, z - 2.6 + i * 1.75, 4.6, 0.25, 1.75, i % 2 ? '#f5f5f5' : c, 'fabric', { r: [0, 0, 8], nc: true });
    for (let i = 0; i < 3; i++) box(x, G + 2.35, z - 1.8 + i * 1.8, 0.8, 0.3, 1.2, pick(['#4cc9f0', '#ff7b25', '#ffd23f', '#35c2a0']), 'smooth', { nc: true });
  };
  stall(476, 494, '#e63946'); stall(476, 503, '#3a86ff');
  for (const [x, z] of [[479, 488.6], [480.6, 487.6], [474, 499], [483, 506]]) { box(x, G + 0.9, z, 1.4, 1, 1.4, '#9a7550', 'planks'); }
  cyl(484, G + 1, 488, 1.3, 1.4, 1.3, '#7a5230', 'wood'); cyl(485.6, G + 1, 489.4, 1.3, 1.4, 1.3, '#7a5230', 'wood');
  // the upgrade pads: each has a sign with a little model of what it sells, and a hut behind
  const pad = (x, z, name, c) => { box(x, G + 0.5, z, 4.4, 0.2, 4.4, c, 'neon', { n: name, g: 0.5, nc: true }); box(x, G + 2.2, z - 3.4, 0.3, 3.6, 0.3, DWOOD, 'wood'); box(x, G + 3.6, z - 3.4, 3.4, 1.2, 0.25, c, 'smooth'); };
  pad(492, 478, 'RodPad', '#9b5de5'); box(492, G + 3.6, 474.4, 2.6, 0.12, 0.12, '#1d1d2c', 'smooth', { r: [0, 0, 20], nc: true });
  pad(500, 476, 'BoatPad', '#3a86ff'); box(500, G + 3.5, 472.4, 2, 0.4, 0.2, '#f5f5f5', 'smooth', { nc: true });
  pad(508, 478, 'BucketPad', '#ff7b25'); cyl(508, G + 3.6, 474.4, 0.9, 0.9, 0.3, '#f5f5f5', 'smooth', { r: [90, 0, 0], nc: true });
  box(500, G + 2.6, 466, 26, 4.4, 6, '#a0764e', 'planks'); box(500, G + 5.1, 466, 27.4, 0.5, 7.4, '#6d7781', 'diamond'); wedge(500, G + 6.1, 466, 27.4, 1.6, 7.4, '#b5482e', 'planks');
  for (const x of [492, 500, 508]) box(x, G + 2, 469.1, 2.4, 3, 0.2, '#3b2c20', 'smooth', { nc: true });
  for (const [x, z] of [[487, 482], [513, 482], [497, 508], [503, 530]]) lampPost(x, z);
  // a tall striped beacon, so you can always find the island from far out
  for (let i = 0; i < 6; i++) cyl(CX - 16, G + 3 + i * 6, CZ - 14, 4.5 - i * 0.4, 6, 4.5 - i * 0.4, i % 2 ? '#e63946' : '#f5f5f5', 'smooth');
  ball(CX - 16, G + 38, CZ - 14, 3.4, '#fff3b0', 'neon', { g: 1, lt: { r: 60, b: 2 } });
  // a hut, a campfire with logs to sit on, a net drying, umbrellas on the beach
  box(524, G + 2.1, 492, 8, 4, 7, '#a0764e', 'planks'); box(524, G + 4.6, 492, 9.4, 0.5, 8.4, '#6d7781', 'diamond'); wedge(524, G + 5.6, 492, 9.4, 1.6, 8.4, '#b5482e', 'planks');
  cone(488, G + 0.9, 512, 1.2, 1.2, 1.2, '#ff7b25', 'neon', { g: 1, nc: true, lt: { r: 14, b: 1.2 } });
  for (const [dx, dz, ry] of [[-2.4, 0, 0], [2.4, 0.4, 0], [0, 2.6, 90]]) cyl(488 + dx, G + 0.75, 512 + dz, 0.7, 2.4, 0.7, '#7a5230', 'wood', { r: [90, ry, 0] });
  for (const [x, z, c] of [[516, 522, '#e63946'], [478, 524, '#3a86ff'], [528, 512, '#ffd23f']]) { cyl(x, G + 1.6, z, 0.2, 3.2, 0.2, '#f5f5f5', 'smooth'); cone(x, G + 3.5, z, 5, 1.2, 5, c, 'fabric', { nc: true }); box(x + 1.4, G + 0.55, z, 1, 0.3, 2.4, '#f5f5f5', 'fabric', { nc: true }); }
  for (const s of [0, 3]) cyl(470 + s, G + 1.6, 516, 0.25, 3.2, 0.25, DWOOD, 'wood'); box(471.5, G + 2.2, 516, 3, 1.6, 0.06, '#c9c2a8', 'fabric', { nc: true, t: 0.3 });

  /* ---- the dock (south) and your boat ---- */
  for (let z = 536; z <= 566; z += 3) box(CX, G + 0.05, z, 5, 0.3, 2.8, z % 2 ? '#9a7550' : WOOD, 'planks', { n: 'Dock' });
  for (const z of [538, 552, 566]) for (const s of [-2.4, 2.4]) cyl(CX + s, G - 3, z, 0.6, 9, 0.6, DWOOD, 'wood');
  cyl(CX - 2.4, G + 1.6, 566, 0.3, 3, 0.3, DWOOD, 'wood'); ball(CX - 2.4, G + 3.3, 566, 0.8, '#fff3b0', 'neon', { g: 1, nc: true, lt: { r: 18, b: 1 } });
  for (const z of [544, 558]) cyl(CX - 2.3, G + 0.7, z, 0.9, 1.1, 0.9, '#7a5230', 'wood');
  const bx = CX + 6.4, bz = 562, by = SEA;
  const bt = (x, y, z, sx, sy, sz, c, m = 'planks', extra = {}) => box(bx + x, by + y, bz + z, sx, sy, sz, c, m, { n: 'Boat', ...extra });
  bt(0, 0.1, 0, 2.8, 0.5, 6, '#c9532f');                                   // the bottom
  for (const s of [-1.3, 1.3]) { bt(s, 0.75, 0, 0.3, 1, 6, '#f0f0f0'); bt(s * 1.04, 1.0, 0, 0.3, 0.25, 6.02, '#3a86ff'); }   // the sides, with a blue stripe
  bt(0, 0.75, -3, 2.9, 1, 0.3, '#f0f0f0');                                 // the back (north)
  wedge(bx, by + 0.6, bz + 3.9, 2.9, 1.3, 1.8, '#f0f0f0', 'planks', { n: 'Boat' }); // the bow points south
  bt(0, 0.9, -1.2, 2.3, 0.2, 0.9, WOOD);                                   // a bench
  box(bx, by + 0.75, bz + 0.6, 1.6, 0.2, 1, WOOD, 'planks', { n: 'BoatSeat' });
  bt(0, 0.9, -3.4, 0.6, 1.3, 0.6, '#3b3b44', 'metal'); bt(0, 1.65, -3.4, 0.8, 0.3, 0.8, '#e63946', 'metal');   // the motor
  bt(0.9, 2.2, -2.6, 0.12, 2.6, 0.12, DWOOD, 'wood'); bt(0.9, 3.2, -2.1, 0.06, 0.7, 1, '#e63946', 'fabric'); // a little flag
  bt(-0.8, 0.8, 1.6, 0.8, 0.7, 0.8, '#8d8d96', 'metal');                    // the bucket
  // the bobber, the rod, and the fish you hold up when you land one (the script moves them)
  ball(CX, SEA + 0.15, 520, 0.5, '#e63946', 'smooth', { n: 'Bobber', nc: true, g: 0.3 });
  box(CX, G + 30, CZ, 0.1, 0.1, 2.6, DWOOD, 'wood', { n: 'Rod', nc: true, r: [28, 0, 0] });
  box(CX, G + 34, CZ, 1.5, 0.7, 0.35, '#b9c4cf', 'smooth', { n: 'Trophy', nc: true, g: 0.25 });

  /* ---- buoys: yellow = the reef starts, red = deep water ---- */
  for (let a = 0; a < 20; a++) { const x = CX + Math.cos(a * Math.PI / 10) * 110, z = CZ + Math.sin(a * Math.PI / 10) * 110; cyl(x, SEA + 0.5, z, 1.2, 1.4, 1.2, '#ffd23f', 'smooth', { nc: true }); }
  for (let a = 0; a < 30; a++) { const x = CX + Math.cos(a * Math.PI / 15) * 230, z = CZ + Math.sin(a * Math.PI / 15) * 230; cyl(x, SEA + 0.6, z, 1.5, 1.8, 1.5, '#e63946', 'smooth', { nc: true }); ball(x, SEA + 1.8, z, 0.6, '#ff5d5d', 'neon', { nc: true, g: 1 }); }
  /* ---- the reef: rocks and coral poking out of the water, and Palm Cay with a chest ---- */
  for (let i = 0; i < 30; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(130, 215), x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r;
    if (Math.abs(x - CX) < 18 && z > CZ) continue; // (keep the way out from the dock clear)
    if (Math.hypot(x - 352, z - 588) < 30) continue;
    const d = rnd(4, 9);
    rockAt(x, z, d);
    for (let k = 0; k < 4; k++) cone(x + rnd(-d / 2, d / 2), SEA + 0.6, z + rnd(-d / 2, d / 2), 0.9, rnd(1.4, 2.6), 0.9, pick(['#ff5d8f', '#ff7b25', '#9b5de5', '#4cc9f0']), 'smooth', { nc: true });
  }
  cyl(352, 12, 588, 26, 16.6, 26, '#e3cf8f', 'sand'); palm(348, 584, 9, G + 0.3); palm(357, 591, 7, G + 0.3); chestAt('Chest1', 352, G + 0.3, 590);
  for (let x = 366; x <= 375; x += 3) box(x, G + 0.05, 588, 2.8, 0.3, 4, WOOD, 'planks', { n: 'Dock' });
  /* ---- deep water: the wreck, Skull Rock, the lighthouse and its keeper, the maelstrom, the shark, Brine ---- */
  const [wx, wz] = REEL_WRECK;
  box(wx, SEA - 0.4, wz, 9, 3.4, 26, DWOOD, 'planks', { r: [0, 30, 24] }); cyl(wx - 2, SEA + 6, wz - 4, 0.8, 14, 0.8, '#5b4030', 'wood', { r: [0, 0, 24] });
  cyl(wx + 4, SEA + 4, wz + 6, 0.7, 10, 0.7, '#5b4030', 'wood', { r: [0, 0, 38] }); box(wx - 4, SEA + 7.4, wz - 4, 0.1, 3, 5, '#c9c2a8', 'fabric', { r: [0, 0, 24], nc: true, t: 0.2 });
  for (let i = 0; i < 4; i++) box(wx + rnd(-16, 16), SEA + 0.1, wz + rnd(-16, 16), 1.6, 0.9, 1.6, '#9a7550', 'planks', { nc: true, r: [rnd(-12, 12), rnd(0, 90), rnd(-12, 12)], mo: { t: 'swing', d: [5, 0, 5], s: 4 } });
  // Skull Rock (north-east): climb out at the little landing; the chest is on top
  ball(696, SEA - 2, 190, 18, '#8d8f98', 'stone'); for (const e of [-3, 3]) ball(696 + e, SEA + 3.4, 197.2, 3, '#1d1d2c', 'smooth', { nc: true }); box(696, SEA + 0.6, 198.2, 4.4, 1.2, 1.2, '#1d1d2c', 'smooth', { nc: true });
  for (let x = 716.5; x <= 726; x += 3) box(x, G + 0.05, 190, 2.8, 0.3, 4, WOOD, 'planks', { n: 'Dock' });
  for (let i = 0; i < 4; i++) box(714.4 - i * 1.2, G + 0.525 + i * 0.525, 190, 1.2, 1.05 + i * 1.05, 4, '#7c8a84', 'stone');
  box(708.5, G + 2.1, 190, 3, 4.2, 5, '#8d8f98', 'stone'); box(703.5, G + 4.6, 190, 7, 0.9, 5, '#8d8f98', 'stone'); chestAt('Chest2', 702, G + 5.05, 190);
  // the lighthouse: a jetty, the keeper's stand with the lure pad, and a chest round the back
  const [hx, hz] = REEL_LIGHT;
  ball(hx, SEA - 3, hz, 22, '#8d8f98', 'stone'); cyl(hx, SEA + 14, hz, 6, 20, 6, '#f5f5f5', 'smooth'); for (const y of [6, 12, 18]) cyl(hx, SEA + y + 2, hz, 6.1, 2.4, 6.1, '#e63946', 'smooth', { nc: true });
  cyl(hx, SEA + 24.6, hz, 7.4, 1.2, 7.4, '#3b3b44', 'metal'); ball(hx, SEA + 27, hz, 3.4, '#fff3b0', 'neon', { g: 1, nc: true, lt: { r: 60, b: 2 } }); cone(hx, SEA + 30, hz, 6, 3, 6, '#e63946', 'smooth', { nc: true });
  box(hx + 17, G - 0.1, hz + 10, 10, 0.4, 9, '#9a7550', 'planks'); for (const [dx, dz] of [[13, 6.5], [21, 6.5], [13, 13.5], [21, 13.5]]) cyl(hx + dx, G - 3, hz + dz, 0.6, 9, 0.6, DWOOD, 'wood');
  for (let x = hx + 23.4; x <= hx + 33; x += 3) box(x, G + 0.05, hz + 10, 2.8, 0.3, 4, WOOD, 'planks', { n: 'Dock' });
  box(hx + 15, G + 0.15, hz + 10, 4, 0.2, 4, '#c6ff7a', 'neon', { n: 'LurePad', g: 0.6, nc: true });
  box(hx + 15, G + 1.2, hz + 6.4, 5, 1.8, 1, '#8f6a4a', 'planks'); for (const s of [-2.4, 2.4]) box(hx + 15 + s, G + 2.6, hz + 6.4, 0.3, 4.6, 0.3, DWOOD, 'wood'); box(hx + 15, G + 5, hz + 6.9, 5.6, 0.25, 2.4, '#35c2a0', 'fabric', { r: [8, 0, 0], nc: true });
  ball(hx + 15, G + 2.5, hz + 6.4, 0.7, '#c6ff7a', 'neon', { g: 1, nc: true, lt: { r: 10, b: 0.8 } });
  box(hx + 15, G + 2.3, hz + 5.2, 1, 2, 0.6, '#ffe0bd', 'smooth', { nc: true }); box(hx + 15, G + 3.6, hz + 5.2, 0.9, 0.7, 0.8, '#ffe0bd', 'smooth', { nc: true }); box(hx + 15, G + 4.05, hz + 5.2, 1.2, 0.3, 1.1, '#3a4a6b', 'fabric', { nc: true });   // the keeper
  box(hx + 14, G - 0.1, hz + 17.5, 4, 0.4, 6, '#9a7550', 'planks'); chestAt('Chest3', hx + 14, G + 0.1, hz + 19);
  // the maelstrom (far south-east): rings turning in the water
  const [qx, qz] = REEL_MAEL;
  [[60, '#14507f', 'Swirl'], [42, '#0f3d63', 'Swirl2'], [26, '#0a2a45', 'Swirl'], [12, '#04121f', 'Swirl2']].forEach(([d, c, n], j) => {
    cyl(qx, SEA + 0.3 + j * 0.06, qz, d, 0.05, d, c, 'smooth', { nc: true, t: 0.12 });
    for (let a = 0; a < 3; a++) box(qx, SEA + 0.34 + j * 0.06, qz, d * 0.96, 0.05, 0.9, '#e8f6ff', 'neon', { n, nc: true, g: 0.4, t: 0.2, r: [0, a * 60 + j * 17, 0] });
  });
  for (let a = 0; a < 6; a++) rockAt(qx + Math.cos(a * 1.047) * 44, qz + Math.sin(a * 1.047) * 44, rnd(4, 8));
  // the shark
  wedge(CX, SEA + 0.9, CZ - 300, 0.4, 2.2, 2.4, '#4b5563', 'smooth', { n: 'Shark', nc: true });
  box(CX, SEA - 0.5, CZ - 300, 1.8, 0.9, 6, '#4b5563', 'smooth', { n: 'Shark', nc: true, t: 0.2 });
  // Captain Brine's ship, anchored by the maelstrom, waiting
  const sx0 = qx - 60, sz0 = qz - 52, sh = (x, y, z, w, h, d, c, m = 'planks', extra = {}) => box(sx0 + x, SEA + y, sz0 + z, w, h, d, c, m, extra);
  sh(0, 1.2, 0, 16, 3, 5.4, '#2a2118'); sh(9, 1.6, 0, 3, 2.2, 3.6, '#2a2118'); sh(-7, 3.4, 0, 4, 2, 5.6, '#3b2c20'); sh(0, 2.8, 0, 16.2, 0.3, 5.8, '#8b6a45');
  for (const x of [-2, 4]) { sh(x, 9, 0, 0.6, 13, 0.6, '#3b2c20', 'wood'); sh(x + 0.5, 9.6, 0, 0.2, 6, 7, '#15151c', 'fabric'); }
  sh(4, 16.2, 0.8, 0.1, 1.2, 1.8, '#e63946', 'fabric'); sh(-7, 4.9, 0, 0.5, 0.5, 0.5, '#fff3b0', 'neon', { g: 1, nc: true, lt: { r: 14, b: 0.9 } });
  // gulls over the island, a few crates adrift
  for (let i = 0; i < 5; i++) { const x = CX + rnd(-30, 30), z = CZ + rnd(-30, 30), y = G + rnd(16, 26); box(x, y, z, 2.2, 0.12, 0.5, '#f5f5f5', 'smooth', { nc: true, mo: { t: 'swing', d: [rnd(14, 26), 2, rnd(14, 26)], s: rnd(5, 9) } }); }
  return { v: 2, engine: 2, n: 'Reel Rivals', mode: 'obby', sky: 'day', parts, scripts: [{ n: 'Fishing', src: REEL_SCRIPT }] };
}
