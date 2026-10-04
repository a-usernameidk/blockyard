// Rusty Road: Blockyard's desert road trip. One long straight road, almost 9,000 studs of it, through nine
// places. Fix up the old buggy, keep it fuelled and in one piece, and reach the oasis.
//   1 Scrapyard      find the wheel, the battery and fuel
//   2 Rockfall Pass  a narrow canyon: boulders to weave through, and three that roll across
//   3 Ghost Town     the road is barred: find the sheriff's key, open the jail, turn the crank (scrap hounds!)
//   4 Tar Flats      three ramps over tar, each jump longer than the last
//   5 Canyon Bridge  a bridge with two gaps and swinging logs
//   6 Storm Flats    a dark sandstorm: wrecks, tumbleweeds and a twister
//   7 Old Mine       a pitch-black tunnel with pillars and mine carts (and a side cave)
//   8 Bandit Camp    trucks, spike strips and a second gate (the crank is up the watchtower)
//   9 Salt Lake      a causeway over water with geysers, one last big jump, then the oasis
// All of it is Engine v2 parts and one Blockscript: open a copy in the builder and change anything.
import { kit } from './gamekit.js';

const G = 10, RZ = 500;                 // the top of the sand, and the middle of the road
const X0 = 80, ZL = 980;                // where the road starts, and how long each place is
export const ROAD_ZONES = ['Scrapyard', 'Rockfall Pass', 'Ghost Town', 'Tar Flats', 'Canyon Bridge', 'Storm Flats', 'Old Mine', 'Bandit Camp', 'Salt Lake'];
const zx = (k) => X0 + (k - 1) * ZL;    // where place k starts
export const ROAD_END = zx(10);         // 8900

export const ROAD_SCRIPT = `// Rusty Road: the script that runs this world.
fuel = 0
cap = 100          // how much the tank holds (the Big Tank upgrade makes it 150)
hp = 100           // the buggy's health: crashes cost health, a toolkit fixes it
top = 34           // top speed (the Turbo makes it 42)
tough = 1          // crash damage is multiplied by this (the Bull Bar halves it)
inCar = false
carDir = 90        // the buggy starts pointing east, down the road
holding = ""       // what you carry: "wheel", "battery", "can", "kit" or "key"
wheelOn = false
batteryOn = false
jailOpen = false
lastV = 0
cpFuel = 0
cpHp = 100
stormOn = false
tunnelOn = false
zones = ${JSON.stringify(ROAD_ZONES)}
carParts = parts("Car") + [part("Seat"), part("Wheel4")]
carry = part("Carry")
hounds = [parts("Hound1"), parts("Hound2"), parts("Hound3"), parts("Hound4"), parts("Hound5")]
homes = []
for h in hounds { push(homes, [h[0].x, h[0].z]) }

fn showCar() {
  board("Fuel", str(round(max(0, fuel))) + "%")
  board("Buggy", str(round(max(0, hp))) + "%")
}
fn look() {
  if tunnelOn { dark(0.96) } else { if stormOn { dark(0.62) } else { dark(0) } }
}
fn go() {
  // the right speed for the state the buggy is in
  if fuel <= 0 or hp <= 0 { drive(0, 95, 1) } else { drive(top, 95, 1) }
}

on start {
  part("Wheel4").hide()
  carry.hide()
  carry.follow(0, 0.95, 0.75)
  for t in parts("Tumble") { t.spin(0, 0, 240) }
  for t in parts("Roller") { t.spin(0, 0, 160) }
  part("Twister").spin(0, 300, 0)
  showCar()
  board("Place", "1 of 9: Scrapyard")
  say("The buggy needs its wheel, a battery and fuel. Search the yard! (Press Use to pick things up.)")
}

fn getIn() {
  let seat = part("Seat")
  for p in carParts { p.solid(false) }
  teleport(seat.x, seat.y - 1, seat.z)
  face(carDir)
  for p in carParts { p.follow() }
  inCar = true
  lastV = 0
  go()
  sound("go")
  if fuel <= 0 { say("The tank is empty. Find a red fuel can, or use a pump.") }
  if hp <= 0 { say("The buggy is wrecked. It needs a toolkit.") }
}
fn getOut() {
  carDir = player.facing
  walk()
  for p in carParts { p.unfollow()  p.solid(true) }
  teleport(player.x - cos(carDir) * 3.4, player.y + 0.4, player.z - sin(carDir) * 3.4)
  inCar = false
}
fn pickUp(thing, what, color) {
  thing.hide()
  holding = what
  carry.color(color)
  carry.show()
  sound("pop")
}
fn upgrade(thing, text) {
  thing.hide()
  sound("badge")
  say(text)
  if inCar { go() }
}

on use {
  if inCar { getOut()  return }
  let atCar = near("Seat", 5)
  if holding != "" {
    if atCar and holding != "key" {
      if holding == "wheel" { part("Wheel4").show()  wheelOn = true  say("The wheel is on!") }
      if holding == "battery" { batteryOn = true  say("The battery is in. Now it needs fuel.") }
      if holding == "can" { fuel = min(cap, fuel + 50)  say("Glug glug. Fuel: " + str(round(fuel)) + "%") }
      if holding == "kit" { hp = min(100, hp + 60)  say("Patched up. Buggy: " + str(round(hp)) + "%") }
      sound("key")
      holding = ""
      carry.hide()
      showCar()
      return
    }
    if holding == "key" and near("JailDoor", 4) {
      part("JailDoor").hide()
      jailOpen = true
      holding = ""
      carry.hide()
      sound("door")
      say("The jail is open. The gate crank is inside.")
      return
    }
    if atCar and holding == "key" { getIn()  return }   // (the key can ride along)
    say("Your hands are full: take the " + holding + " where it goes first.")
    return
  }
  let t = near("Wheel", 4.5)
  if t { pickUp(t, "wheel", "black")  return }
  t = near("Battery", 4.5)
  if t { pickUp(t, "battery", "yellow")  return }
  t = near("Can", 4.5)
  if t { pickUp(t, "can", "red")  return }
  t = near("Kit", 4.5)
  if t { pickUp(t, "kit", "blue")  return }
  t = near("SheriffKey", 4.5)
  if t { pickUp(t, "key", "gold")  say("The sheriff's key! The jail is across the street.")  return }
  t = near("UpTurbo", 4.5)
  if t { top = 42  upgrade(t, "TURBO! The buggy is faster now.")  return }
  t = near("UpTank", 4.5)
  if t { cap = 150  upgrade(t, "A bigger tank! It holds 150% now.")  return }
  t = near("UpBar", 4.5)
  if t { tough = 0.5  upgrade(t, "A bull bar! Crashes only do half the damage.")  return }
  if near("Crank", 4.5) { openGate(part("Gate"), part("Crank"))  return }
  if near("Crank2", 4.5) { openGate(part("Gate2"), part("Crank2"))  return }
  if near("Pump", 4) {
    if fuel >= 40 { say("This old pump only fills the tank to 40%.")  return }
    say("Pumping...")
    sound("tick")
    wait(2.5)
    fuel = max(fuel, 40)
    showCar()
    sound("coin")
    say("That's all it has: 40%.")
    return
  }
  if atCar {
    if not wheelOn { say("It only has three wheels. The spare is somewhere in the yard.")  return }
    if not batteryOn { say("It won't start without a battery. Try the garage.")  return }
    getIn()
    return
  }
}
fn openGate(g, crank) {
  if g.y > ${G + 8} { say("The gate is already open.")  return }
  g.move(0, 9, 0, 2)
  crank.turn(0, 0, 360, 2)
  sound("door")
  say("The gate is opening!")
}

// the hint next to the Use key
every 0.2 {
  if inCar { prompt("Get out")  return }
  if holding != "" {
    if holding == "key" { if near("JailDoor", 4) { prompt("Unlock the jail") } else { prompt("") }  return }
    if near("Seat", 5) { prompt("Use the " + holding + " on the buggy") } else { prompt("") }
    return
  }
  if near("Wheel", 4.5) or near("Battery", 4.5) or near("Can", 4.5) or near("Kit", 4.5) or near("SheriffKey", 4.5) { prompt("Pick up")  return }
  if near("UpTurbo", 4.5) or near("UpTank", 4.5) or near("UpBar", 4.5) { prompt("Take the upgrade")  return }
  if near("Crank", 4.5) or near("Crank2", 4.5) { prompt("Turn the crank")  return }
  if near("Pump", 4) { prompt("Pump fuel")  return }
  if near("Seat", 5) { prompt("Drive")  return }
  prompt("")
}

// the buggy: fuel burns as you drive (a tank is about 1,000 studs), and crashes hurt it
every 0.1 {
  if not inCar { return }
  let v = player.vel
  if fuel > 0 and hp > 0 {
    fuel -= v * 0.1 / 10
    if fuel <= 0 { fuel = 0  go()  say("Out of fuel! Find a fuel can or a pump.")  sound("error") }
  }
  if lastV - v > 15 {
    hp -= (lastV - v) * 1.5 * tough
    sound("hit")
    if hp <= 0 { hp = 0  go()  say("The buggy is wrecked! Find a toolkit to fix it.") } else { say("CRASH! Buggy: " + str(round(hp)) + "%") }
  }
  lastV = v
  if player.swimming { say("The buggy sank!")  kill() }
  showCar()
}
every 1 {
  let k = max(1, min(9, floor((player.x - ${X0}) / ${ZL}) + 1))
  board("Place", str(k) + " of 9: " + zones[k - 1])
  if inCar and player.vel < 1 { go() }
}

// checkpoints: the buggy comes back with you, with at least the fuel and health it had here
on touch "Cp" {
  checkpoint()
  cpFuel = fuel
  cpHp = hp
  sound("checkpoint")
  say("Checkpoint!")
}
on die {
  fuel = max(fuel, cpFuel)
  hp = max(hp, max(cpHp, 30))
  lastV = 0
  if inCar { go() }
  showCar()
}

// scrap hounds: they chase you when you are on foot and close. In the buggy you are safe.
every 0.1 {
  let i = 0
  for h in hounds {
    let b = h[0]
    let tx = homes[i][0]
    let tz = homes[i][1]
    let px = player.x - b.x
    let pz = player.z - b.z
    let far = sqrt(px * px + pz * pz)
    if not inCar and far < 30 and abs(b.x - homes[i][0]) < 60 {
      tx = player.x
      tz = player.z
      if far < 1.7 and abs(player.y - b.y) < 2.5 { say("A scrap hound got you!")  sound("die")  kill() }
    }
    let dx = tx - b.x
    let dz = tz - b.z
    let d = sqrt(dx * dx + dz * dz)
    if d > 0.4 {
      let k = min(d, 0.62) / d
      for p in h { p.move(dx * k, 0, dz * k, 0.1) }
    }
    i += 1
  }
}

// weather and the dark
on touch "Storm" { stormOn = true  look()  say("A sandstorm! Watch for wrecks on the road.") }
on leave "Storm" { stormOn = false  look() }
on touch "Dark" { tunnelOn = true  look()  say("The old mine. Pitch black: your headlights are all you have.") }
on leave "Dark" { tunnelOn = false  look() }
on touch "Twister" {
  if inCar { hp = max(1, hp - 25)  showCar() }
  launch(0, 24, 0)
  sound("whoosh")
  say("The twister threw you!")
}
on touch "Spikes" {
  if inCar { hp = max(0, hp - 30)  sound("hit")  say("Spikes! Buggy: " + str(round(hp)) + "%")  if hp <= 0 { go()  say("The buggy is wrecked! Find a toolkit.") }  showCar() }
}
`;

export function roadWorld() {
  const K = kit(77), { parts, box, cyl, ball, wedge, cone, rnd, pick } = K;
  const SAND = '#e3c07b', ROADC = '#3d3a3a', ROCK = ['#a8734e', '#96633f', '#b98560'], CACT = ['#4f9a4a', '#5aa856', '#458a44'], WOOD = '#8f6a4a';
  const road = (x0, x1, y = G) => {
    box((x0 + x1) / 2, y + 0.05, RZ, x1 - x0, 0.1, 14, ROADC, 'stone');
    box((x0 + x1) / 2, y + 0.11, RZ, x1 - x0, 0.04, 0.5, '#f2c230', 'smooth', { nc: true });
    for (const s of [-6.4, 6.4]) box((x0 + x1) / 2, y + 0.11, RZ + s, x1 - x0, 0.04, 0.4, '#e9e4d8', 'smooth', { nc: true });
  };
  const ground = (x0, x1, c = SAND, m = 'sand', top = G) => box((x0 + x1) / 2, top / 2, RZ, x1 - x0, top, 520, c, m);
  const can = (x, z, y = G) => box(x, y + 0.55, z, 0.8, 1.0, 0.55, '#d62828', 'metal', { n: 'Can' });
  const tool = (x, z, y = G) => box(x, y + 0.4, z, 1.1, 0.7, 0.6, '#3a86ff', 'metal', { n: 'Kit' });
  const coin = (x, z, y = G) => cyl(x, y + 1.3, z, 0.9, 0.2, 0.9, '#ffd23f', 'neon', { k: 'coin', r: [90, 0, 0] });
  const pump = (x, z) => { box(x, G + 1.1, z, 1.2, 2.2, 0.9, '#b23b2e', 'metal', { n: 'Pump' }); box(x, G + 2.4, z, 1.4, 0.4, 1.1, '#e9e4d8', 'metal'); cyl(x + 0.8, G + 1.2, z, 0.2, 1.4, 0.2, '#22222a', 'smooth'); };
  // a crate by the road with a fuel can on it
  const crate = (x) => { box(x, G + 0.6, RZ - 10.5, 1.8, 1.2, 1.8, WOOD, 'planks'); box(x, G + 1.75, RZ - 10.5, 0.8, 1.0, 0.55, '#d62828', 'metal', { n: 'Can' }); };
  const cp = (x) => {
    box(x, G + 3, RZ, 2, 6, 15.6, '#ffffff', 'smooth', { n: 'Cp', nc: true, t: 1 });
    for (const s of [-8.2, 8.2]) { box(x, G + 2.5, RZ + s, 0.4, 5, 0.4, '#e9e4d8', 'smooth'); box(x, G + 4.6, RZ + s, 0.3, 0.9, 1.6, '#44c06a', 'neon', { g: 0.5 }); }
  };
  // a little building with a doorway on the side that faces the road (north side buildings open south, and the other way round)
  const hut = (x, z, w, d, hgt, wall, mat = 'planks', roof = '#6d7781') => {
    const s = z < RZ ? 1 : -1, t = 0.5;
    box(x, G + hgt / 2, z - s * (d / 2 - t / 2), w, hgt, t, wall, mat);                                  // back
    for (const e of [-1, 1]) box(x + e * (w / 2 - t / 2), G + hgt / 2, z, t, hgt, d, wall, mat);          // sides
    for (const e of [-1, 1]) box(x + e * (w / 4 + 0.9), G + hgt / 2, z + s * (d / 2 - t / 2), w / 2 - 1.8, hgt, t, wall, mat); // front, with a doorway in the middle
    box(x, G + hgt - 0.6, z + s * (d / 2 - t / 2), 3.6, 1.2, t, wall, mat);
    box(x, G + hgt + 0.2, z, w + 1.2, 0.4, d + 1.2, roof, 'diamond');
    box(x, G + 0.06, z, w - 1, 0.1, d - 1, '#7a6a55', 'planks', { nc: true });
  };
  const cactus = (x, z) => { const hgt = rnd(2.4, 5), c = pick(CACT); cyl(x, G + hgt / 2, z, 0.9, hgt, 0.9, c, 'smooth'); if (rnd() < 0.7) { cyl(x + 0.9, G + hgt * 0.55, z, 0.5, 0.5, 1.3, c, 'smooth', { r: [90, 90, 0] }); cyl(x + 1.5, G + hgt * 0.72, z, 0.5, hgt * 0.4, 0.5, c, 'smooth'); } };
  const rock = (x, z) => { const d = rnd(1.2, 4.2); if (rnd() < 0.5) ball(x, G + d * 0.25, z, d, pick(ROCK), 'stone'); else box(x, G + d * 0.3, z, d, d * 0.7, d * 0.8, pick(ROCK), 'stone', { r: [rnd(-10, 10), rnd(0, 90), rnd(-10, 10)] }); };
  const mesa = (x, z, w, d, hgt) => { const c = pick(ROCK); box(x, G + hgt / 2, z, w, hgt, d, c, 'stone', { r: [0, rnd(-8, 8), 0] }); box(x + rnd(-3, 3), G + hgt + 2, z + rnd(-3, 3), w * 0.7, 4, d * 0.7, '#c08a5c', 'stone', { r: [0, rnd(-8, 8), 0] }); };
  // a wall of rock right across the valley with a gap for the road (so nothing can be driven around)
  const pinch = (x, gap = 16, hgt = 16, c = ROCK[0]) => { for (const s of [-1, 1]) box(x, G + hgt / 2, RZ + s * (gap / 2 + 124), 8, hgt, 248, c, 'stone'); };
  const hound = (n, x, z) => {
    box(x, G + 0.75, z, 2, 0.9, 0.9, '#2a2a31', 'metal', { n: 'Hound' + n, nc: true });
    box(x + 1.1, G + 1.05, z, 0.8, 0.7, 0.8, '#3a3a44', 'metal', { n: 'Hound' + n, nc: true });
    for (const s of [-0.25, 0.25]) box(x + 1.52, G + 1.15, z + s, 0.08, 0.16, 0.16, '#ff3b3b', 'neon', { n: 'Hound' + n, nc: true, g: 1 });
    for (const [dx, dz] of [[-0.7, -0.35], [-0.7, 0.35], [0.7, -0.35], [0.7, 0.35]]) box(x + dx, G + 0.2, z + dz, 0.25, 0.4, 0.25, '#2a2a31', 'metal', { n: 'Hound' + n, nc: true });
  };

  /* ---- the ground: nine pieces, with a canyon (place 5) and a lake (place 9) cut out ---- */
  ground(0, 1000); ground(1000, 2000); ground(2000, 3000); ground(3000, 4000);
  ground(4000, 4160); ground(4840, 5000); ground(5000, 6000); ground(6000, 7000); ground(7000, zx(9) + 20);
  ground(8780, 9000);
  // see-through walls: the two long sides and both ends
  for (let x = 500; x < 9000; x += 1000) for (const z of [244, 756]) box(x, G + 30, z, 1000, 60, 2, '#ffffff', 'glass', { t: 1 });
  for (const x of [4, 8996]) box(x, G + 30, RZ, 2, 60, 520, '#ffffff', 'glass', { t: 1 });
  // the road (not over the canyon or the lake: those have their own)
  road(X0 - 20, 4160); road(4840, zx(9) + 20); road(8780, ROAD_END + 40);
  box(110, G + 0.2, 512, 4, 0.4, 4, '#7cc8ff', 'smooth', { k: 'spawn' });
  // the edges of the valley: mesas all the way along, and scenery on the open sand
  for (let x = 30; x < 8990; x += rnd(44, 70)) for (const s of [-1, 1]) if (!(x > 4130 && x < 4870) && !(x > 6020 && x < 6880) && !(x > 7880 && x < 8800)) mesa(x, RZ + s * rnd(205, 235), rnd(40, 70), rnd(30, 50), rnd(16, 38));
  const open = (x) => !(x > 1080 && x < 2030) && !(x > 4140 && x < 4860) && !(x > 6020 && x < 6880) && x < zx(9);
  for (let i = 0; i < 520; i++) { const x = rnd(40, 8960), z = RZ + (rnd() < 0.5 ? -1 : 1) * rnd(16, 190); if (open(x) && !(x > 2180 && x < 2720 && Math.abs(z - RZ) < 60)) (rnd() < 0.55 ? cactus : rock)(x, z); }
  for (let x = 140; x < 8900; x += 64) if (open(x)) { box(x, G + 4.5, RZ + 10.5, 0.45, 9, 0.45, '#6d4c33', 'wood'); box(x, G + 8.2, RZ + 10.5, 0.3, 0.3, 2.6, '#6d4c33', 'wood'); }

  /* ================= 1. Scrapyard ================= */
  const cx = 130, cz = RZ, cy = G + 0.1;
  const car = (x, y, z, sx, sy, sz, c, m = 'metal', extra = {}) => box(cx + x, cy + y, cz + z, sx, sy, sz, c, m, { n: 'Car', ...extra });
  car(0, 0.75, 0, 5, 0.4, 2.5, '#2f8f8a'); car(1.55, 1.25, 0, 1.7, 0.6, 2.4, '#37a39d'); car(-1.85, 1.3, 0, 1.2, 0.7, 2.4, '#37a39d');
  car(-1.05, 1.75, 0, 0.3, 1.2, 2.2, '#3b3b44', 'fabric');
  for (const s of [-1.15, 1.15]) car(0.1, 1.25, s, 2.1, 0.6, 0.2, '#2f8f8a');
  car(0.72, 1.95, 0, 0.12, 0.8, 2.3, '#bfe6ff', 'glass', { t: 0.55 });
  for (const s of [-1.1, 1.1]) car(-1.25, 2.1, s, 0.18, 1.9, 0.18, '#2c2c34');
  car(-1.25, 3.0, 0, 0.18, 0.18, 2.4, '#2c2c34'); car(2.55, 0.85, 0, 0.3, 0.35, 2.8, '#8d8d96');
  for (const s of [-0.8, 0.8]) car(2.42, 1.3, s, 0.15, 0.35, 0.45, '#fff3b0', 'neon', { g: 0.8, lt: { r: 26, b: 1.5 } });
  car(-2.5, 1.2, 0.7, 0.5, 0.25, 0.25, '#6d6d75');
  for (const s of [-0.7, 0.7]) car(-2.48, 1.3, s, 0.1, 0.3, 0.4, '#ff3b3b', 'neon', { g: 0.7 });
  const wheel = (x, z, name) => cyl(cx + x, cy + 0.6, cz + z, 1.2, 0.5, 1.2, '#22222a', 'smooth', { r: [90, 0, 0], n: name });
  wheel(1.6, 1.45, 'Car'); wheel(1.6, -1.45, 'Car'); wheel(-1.6, 1.45, 'Car'); wheel(-1.6, -1.45, 'Wheel4');
  box(cx - 0.25, cy + 1.0, cz, 0.9, 0.3, 1.6, '#3b3b44', 'fabric', { n: 'Seat' });
  box(cx - 1.6, G + 0.3, cz - 1.45, 0.7, 0.5, 0.7, '#8b5a2b', 'wood', { nc: true });
  box(100, G + 40, 300, 0.5, 0.5, 0.35, '#e63946', 'smooth', { n: 'Carry', nc: true });
  // the garage (battery on the workbench inside), a shed (fuel), junk piles (the wheel is behind one)
  hut(112, 476, 20, 14, 5, WOOD); box(104, G + 0.6, 471.5, 4, 1.2, 1.6, '#6d4c33', 'wood'); box(104, G + 1.55, 471.5, 0.9, 0.7, 0.6, '#f2c230', 'metal', { n: 'Battery' });
  box(119, G + 1.4, 471, 1.2, 2.8, 2.4, '#55504c', 'metal'); can(117, 480);
  hut(160, 528, 9, 8, 4, '#8a7d55'); can(160, 529.5);
  for (const [x, z, c] of [[88, 530, '#5a7d9a'], [96, 536, '#9a5a5a'], [150, 470, '#6b8f5a'], [176, 478, '#8a7d55'], [84, 478, '#7a6a8a']]) { box(x, G + 0.7, z, 3.4, 1.4, 2, c, 'metal', { r: [0, rnd(0, 90), 0] }); box(x, G + 1.75, z, 2, 0.7, 1.8, c, 'metal', { r: [0, rnd(0, 90), 0] }); }
  cyl(90, G + 0.3, 540.5, 1.2, 0.5, 1.2, '#22222a', 'smooth', { n: 'Wheel' });
  for (let i = 0; i < 6; i++) cyl(140 + i * 1.4, G + 0.3 + (i % 2) * 0.5, 536, 1.2, 0.5, 1.2, '#2a2a31', 'smooth');
  box(124, G + 3.2, 488, 0.4, 6.4, 0.4, '#6d4c33', 'wood'); box(124, G + 5.6, 488, 9, 2, 0.3, '#f2c230', 'planks');
  for (let x = 240; x <= 720; x += 120) coin(x, RZ + (x % 240 ? -3 : 3));
  // Dry Gulch Gas
  hut(800, 474, 16, 12, 5, '#b06a4a', 'brick'); can(795, 472); can(805, 472); tool(800, 470.5);
  box(800, G + 5.2, 489, 18, 0.5, 9, '#e9e4d8', 'diamond'); for (const e of [-8, 8]) cyl(800 + e, G + 2.6, 489, 0.6, 5.2, 0.6, '#8d8d96', 'metal');
  pump(805, 489.5); box(800, G + 0.06, 489, 22, 0.12, 9, '#55504c', 'stone'); box(786, G + 6.5, 484, 0.4, 13, 0.4, '#8d8d96', 'metal'); box(786, G + 12, 484, 7, 3, 0.4, '#e63946', 'smooth', { g: 0.3 });
  cp(830);

  /* ================= 2. Rockfall Pass ================= */
  cp(zx(2) + 10);
  for (let x = 1100; x <= 1990; x += 36) for (const s of [-1, 1]) {
    if (x > 1470 && x < 1590 && s < 0) continue; // (an opening on the north side for the miner's hut)
    const d = rnd(26, 40); box(x, G + rnd(7, 13), RZ + s * (9.5 + d / 2), 37, rnd(18, 30), d, pick(ROCK), 'stone');
  }
  box(1530, G + 12, 452, 130, 24, 30, ROCK[1], 'stone');
  [[1150, -3.4], [1200, 3.4], [1250, -3.4], [1300, 3.4], [1350, -3.4], [1400, 3.4], [1450, -3.4], [1620, 3.4], [1670, -3.4], [1720, 3.4]].forEach(([x, dz]) => ball(x, G + 1.8, RZ + dz, 4.4, pick(ROCK), 'stone'));
  [[1780, 2.6, 0], [1850, 3.2, 0.5], [1920, 2.2, 0.2]].forEach(([x, s, w]) => ball(x, G + 2.4, RZ - 5.8, 4.8, '#7d5a40', 'stone', { n: 'Roller', mo: { t: 'move', d: [0, 0, 11.6], s, w } }));
  hut(1530, 478, 12, 9, 4.4, WOOD); can(1527, 476.5); can(1528.4, 475.4); tool(1533, 476.5); pump(1548, 486); coin(1530, 480); cp(1560);
  for (let x = 1175; x <= 1700; x += 100) coin(x, RZ);

  /* ================= 3. Ghost Town ================= */
  cp(zx(3) + 30); crate(zx(3) + 20);
  box(2130, G + 4, RZ - 12, 0.5, 8, 0.5, '#6d4c33', 'wood'); box(2130, G + 7, RZ - 12, 0.4, 2, 8, WOOD, 'planks');
  // the saloon (north): the sheriff's key is on the bar
  hut(2300, 474, 22, 16, 6.5, '#9a6a4a'); box(2300, G + 0.7, 468.5, 12, 1.4, 1.6, '#6d4c33', 'wood'); box(2303, G + 1.5, 468.5, 0.7, 0.16, 0.3, '#ffd23f', 'neon', { n: 'SheriffKey', g: 0.9, nc: true });
  for (const x of [2293, 2307]) { cyl(x, G + 0.5, 476, 1.6, 1, 1.6, '#6d4c33', 'wood'); } box(2300, G + 8.4, 482.4, 12, 2.4, 0.4, '#e9d8a6', 'planks');
  // the jail (south): a locked door, and the gate crank inside
  hut(2420, 526, 16, 12, 5.5, '#8d8f98', 'brick'); box(2420, G + 2.15, 520.25, 3.6, 4.3, 0.5, '#3b3b44', 'metal', { n: 'JailDoor' });
  cyl(2420, G + 1.2, 529.5, 1.6, 0.4, 1.6, '#b23b2e', 'metal', { n: 'Crank', r: [90, 0, 0] }); box(2420, G + 0.6, 530.3, 0.5, 1.2, 0.5, '#55504c', 'metal');
  // the store (north): fuel and a toolkit. The bank (south): the bull bar is in the vault at the back
  hut(2500, 476, 16, 12, 5, '#a0764e'); can(2495, 473); can(2505, 473); tool(2500, 471.5); pump(2516, 488);
  hut(2300, 528, 18, 16, 6, '#b9a47a', 'brick'); box(2300, G + 1.3, 533, 3, 1.2, 0.5, '#8d8d96', 'metal', { n: 'UpBar' }); for (const e of [-3, 3]) box(2300 + e, G + 1.6, 531, 0.5, 3.2, 4, '#6d7385', 'metal');
  // more of the town: a hotel, a stable, a water tower, a church tower, a well
  hut(2580, 528, 20, 14, 8, '#7a5a6a'); hut(2200, 478, 14, 10, 5, '#8a7d55'); hut(2640, 476, 12, 10, 4.6, WOOD);
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) cyl(2210 + dx, G + 5, 532 + dz, 0.7, 10, 0.7, '#6d4c33', 'wood'); cyl(2210, G + 12, 532, 9, 5, 9, '#8f6a4a', 'planks');
  box(2380, G + 7, 470, 7, 14, 7, '#e9e4d8', 'planks'); cone(2380, G + 17, 470, 9, 6, 9, '#6d4c33', 'planks');
  cyl(2450, G + 0.9, 486, 3, 1.8, 3, '#8d8f98', 'cobble');
  hound(1, 2360, 514); hound(2, 2462, 490); hound(3, 2560, 512);
  for (const [x, z] of [[2250, RZ], [2350, RZ], [2420, 512], [2500, 486], [2600, RZ]]) coin(x, z);
  // the barricade: rock right across the valley, and a heavy gate on the road
  pinch(2700, 16, 14); box(2700, G + 4, RZ, 3, 8, 16, '#4b3a2a', 'planks', { n: 'Gate' }); for (const s of [-8.6, 8.6]) box(2700, G + 6, RZ + s, 4, 12, 1.4, '#6d4c33', 'wood');
  cp(2740);

  /* ================= 4. Tar Flats ================= */
  cp(zx(4) + 30); crate(zx(4) + 20);
  const jump = (x, hgt, gap) => {
    wedge(x - 7, G + hgt / 2 + 0.1, RZ, 13.6, hgt, 14, '#8a8f98', 'diamond', { r: [0, 270, 0] });
    box(x + 1 + gap / 2, G + 0.13, RZ, gap, 0.25, 508, '#16161d', 'smooth', { k: 'kill', g: 0.05 });
    for (const s of [-1, 1]) box(x - 14, G + 1.6, RZ + s * 8.4, 0.4, 3.2, 0.4, '#f2c230', 'neon', { g: 0.6 });
  };
  cp(3240); jump(3300, 2.5, 6);
  hut(3440, 476, 12, 9, 4.4, '#8a7d55'); can(3438.5, 474); can(3441.5, 474); pump(3452, 487); cp(3470);
  jump(3560, 2.8, 8); cp(3760); coin(3566, RZ, G + 4); coin(3306, RZ, G + 3.6);
  jump(3820, 3.2, 10); coin(3827, RZ, G + 4.4);
  for (let i = 0; i < 14; i++) cyl(rnd(3080, 3960), G + 0.06, RZ + (rnd() < 0.5 ? -1 : 1) * rnd(20, 150), rnd(8, 22), 0.12, rnd(8, 22), '#1d1d26', 'smooth', { nc: true });

  /* ================= 5. Canyon Bridge ================= */
  cp(zx(5) + 30); crate(zx(5) + 20);
  box(4500, 1, RZ, 680, 2, 520, '#3a2a22', 'stone', { k: 'kill' });                                     // the canyon floor
  const deck = (x0, x1) => { box((x0 + x1) / 2, G - 0.3, RZ, x1 - x0, 0.6, 10, WOOD, 'planks'); for (let x = x0 + 6; x < x1; x += 24) for (const s of [-4.4, 4.4]) cyl(x, G / 2 - 0.4, RZ + s, 0.9, G - 1, 0.9, '#6d4c33', 'wood'); };
  deck(4160, 4330); wedge(4323, G + 1.25, RZ, 9, 2.5, 14, WOOD, 'planks', { r: [0, 270, 0] });           // gap 1: 4330 to 4338
  deck(4338, 4496);
  cyl(4518, G / 2, RZ, 46, G, 46, ROCK[1], 'stone'); can(4518, 486); pump(4526, 488); tool(4510, 486); cp(4512); coin(4518, 512);  // the rock in the middle
  deck(4540, 4700);
  [[4590, 1.4, 0.5], [4650, 1.1, 0.7]].forEach(([x, s, w]) => { box(x, G + 1.3, RZ - 10, 2.2, 2.2, 7, '#6d4c33', 'wood', { n: 'Log', mo: { t: 'move', d: [0, 0, 20], s, w } }); box(x, G + 8, RZ, 0.5, 0.5, 30, '#55504c', 'metal', { nc: true }); });
  wedge(4693, G + 1.3, RZ, 9, 2.6, 14, WOOD, 'planks', { r: [0, 270, 0] }); deck(4709, 4840);             // gap 2: 4700 to 4709
  for (const x of [4240, 4420, 4620, 4780]) coin(x, RZ);
  for (const s of [-1, 1]) { box(4150, G + 5, RZ + s * 130, 20, 10, 244, ROCK[2], 'stone'); box(4850, G + 5, RZ + s * 130, 20, 10, 244, ROCK[2], 'stone'); }

  /* ================= 6. Storm Flats ================= */
  cp(zx(6) + 30); crate(zx(6) + 20);
  box(5470, G + 14, RZ, 900, 28, 500, '#d9b36a', 'smooth', { n: 'Storm', nc: true, t: 1 });
  [[5100, -3.2], [5180, 3.2], [5270, -3], [5350, 3.4], [5700, -3.2], [5790, 3], [5870, -3.4]].forEach(([x, dz], i) => { box(x, G + 0.9, RZ + dz, 4.6, 1.5, 2.6, pick(['#5a7d9a', '#9a5a5a', '#6b8f5a', '#7a6a8a']), 'metal', { r: [0, rnd(-20, 20), 0] }); box(x - 0.4, G + 2, RZ + dz, 2.4, 0.9, 2.2, '#3b3b44', 'metal', { r: [0, rnd(-20, 20), 0] }); if (i % 2) cyl(x + 3, G + 0.3, RZ + dz + 1, 1.2, 0.5, 1.2, '#22222a', 'smooth'); });
  [[5140, 0], [5230, 1.3], [5310, 0.6], [5560, 2], [5640, 0.9], [5750, 1.6], [5830, 0.3]].forEach(([x, w], i) => ball(x, G + 1.5, RZ - 24, 3, '#b08a4e', 'fabric', { n: 'Tumble', mo: { t: 'move', d: [0, 0, 48], s: 2.4 + (i % 3) * 0.5, w } }));
  cone(5600, G + 7, RZ - 34, 7, 14, 7, '#c9a56a', 'fabric', { n: 'Twister', nc: true, t: 0.35, r: [180, 0, 0], mo: { t: 'move', d: [0, 0, 68], s: 3.2 } });
  // the storm shelter: fuel, a toolkit, and the Turbo up on the roof (climb the crates)
  hut(5450, 474, 16, 12, 5, '#8d8f98', 'brick'); can(5445, 471.5); can(5446.6, 470.4); tool(5455, 471.5); pump(5466, 487); cp(5480);
  box(5438, G + 0.7, 483, 2.8, 1.4, 2.8, WOOD, 'planks'); box(5441, G + 2.1, 481.5, 2.8, 1.4, 2.8, WOOD, 'planks'); box(5438, G + 3.3, 479.5, 2.6, 1.2, 2.6, WOOD, 'planks');
  box(5450, G + 6.1, 474, 1.4, 0.9, 0.9, '#ff7b25', 'metal', { n: 'UpTurbo', g: 0.4 });
  for (const x of [5060, 5400, 5660, 5900]) coin(x, RZ);

  /* ================= 7. Old Mine ================= */
  cp(zx(7) + 30); crate(zx(7) + 20);
  const MC = '#6b5a4c';
  // the mountain, with the tunnel through it (16 wide, 8 high) and a cave on the north side
  box(6240, G + 20, 370.5, 400, 40, 243, MC, 'stone'); box(6665, G + 20, 370.5, 390, 40, 243, MC, 'stone');
  box(6455, G + 20, 358.5, 30, 40, 219, MC, 'stone');                                                    // behind the cave
  box(6450, G + 20, 629, 820, 40, 242, MC, 'stone');                                                     // the south side
  box(6450, G + 24, RZ, 820, 32, 16, MC, 'stone');                                                       // over the road
  box(6455, G + 24, 480, 30, 32, 24, MC, 'stone');                                                       // over the cave
  box(6450, G + 4, RZ, 818, 8, 15.6, '#000000', 'smooth', { n: 'Dark', nc: true, t: 1 });
  for (const x of [6040, 6860]) { for (const s of [-8.6, 8.6]) box(x, G + 4.5, RZ + s, 2, 9, 1.4, '#6d4c33', 'wood'); box(x, G + 9, RZ, 2, 1.4, 18.6, '#6d4c33', 'wood'); }
  [[6110, -3.6], [6170, 3.6], [6230, -3.6], [6290, 3.6], [6350, -3.6], [6540, 3.6], [6600, -3.6], [6660, 3.6]].forEach(([x, dz]) => box(x, G + 4, RZ + dz, 1.8, 8, 1.8, '#6d4c33', 'wood'));
  [[6400, 1.2, 0.4], [6720, 1.0, 0.6], [6790, 1.4, 0.3]].forEach(([x, s, w]) => { box(x, G + 1.2, RZ - 5.6, 3, 2, 4, '#8d8d96', 'metal', { n: 'Cart', mo: { t: 'move', d: [0, 0, 11.2], s, w } }); box(x, G + 0.14, RZ, 0.5, 0.1, 15, '#55504c', 'metal', { nc: true }); });
  for (let x = 6080; x < 6860; x += 65) box(x, G + 7.6, RZ, 0.6, 0.4, 0.6, '#ffcf70', 'neon', { g: 0.8, nc: true, lt: { r: 9, b: 0.5 } });
  // the cave: the Big Tank, fuel, a toolkit, a pump
  box(6455, G + 1.2, 472, 1.6, 1.2, 1, '#44c06a', 'metal', { n: 'UpTank', g: 0.4 }); can(6447, 474); tool(6463, 474); pump(6466, 486); coin(6455, 480);
  box(6455, G + 7.6, 480, 0.6, 0.4, 0.6, '#ffcf70', 'neon', { g: 0.8, nc: true, lt: { r: 14, b: 0.8 } });
  box(6480, G + 3, RZ, 2, 6, 15.6, '#ffffff', 'smooth', { n: 'Cp', nc: true, t: 1 });
  for (const x of [6140, 6320, 6580, 6820]) coin(x, RZ);

  /* ================= 8. Bandit Camp ================= */
  cp(zx(8) + 30); crate(zx(8) + 20);
  [[7120, 2.8, 0.4], [7290, 3.4, 0.2]].forEach(([x, s, w]) => { box(x, G + 1.5, RZ - 3.4, 7, 2.6, 3.2, '#5a3a2a', 'metal', { n: 'Truck', mo: { t: 'move', d: [70, 0, 0], s, w } }); });
  // the camp: tents with supplies, a watchtower with the gate crank on top (stairs round the back), two guards
  for (const [x, z, c] of [[7380, 474, '#b23b2e'], [7410, 528, '#3a6ea5'], [7460, 530, '#6b8f5a']]) { wedge(x, G + 1.6, z - 2.5, 7, 3.2, 5, c, 'fabric', { r: [0, 180, 0], nc: true }); wedge(x, G + 1.6, z + 2.5, 7, 3.2, 5, c, 'fabric', { nc: true }); }
  can(7380, 474); can(7410, 528); tool(7460, 530); pump(7400, 488);
  box(7450, G + 3, 472, 7, 6, 7, WOOD, 'planks'); for (let i = 0; i < 5; i++) box(7441.5 - i * 0.2, G + 0.6 + i * 1.2, 478.6 - i * 2.2, 3, 1.2, 2.2, '#8a7d55', 'planks');
  box(7443.5, G + 5.7, 466.5, 9, 0.6, 5, '#8a7d55', 'planks'); box(7443.5, G + 6.5, 463.8, 9, 1, 0.3, WOOD, 'wood'); box(7438.8, G + 6.5, 466.5, 0.3, 1, 5, WOOD, 'wood');
  cyl(7450, G + 7.2, 472, 1.6, 0.4, 1.6, '#b23b2e', 'metal', { n: 'Crank2', r: [90, 0, 0] }); box(7450, G + 6.6, 472.8, 0.5, 1.2, 0.5, '#55504c', 'metal');
  hound(4, 7412, 512); hound(5, 7475, 514);
  pinch(7500, 16, 14, '#6d4c33'); box(7500, G + 4, RZ, 3, 8, 16, '#4b3a2a', 'planks', { n: 'Gate2' }); for (const s of [-8.6, 8.6]) box(7500, G + 6, RZ + s, 4, 12, 1.4, '#6d4c33', 'wood');
  cp(7540);
  [[7640, -3.5], [7710, 3.5], [7780, -3.5], [7840, 3.5]].forEach(([x, dz]) => { box(x, G + 0.2, RZ + dz, 2, 0.3, 7, '#8d8d96', 'metal', { n: 'Spikes', nc: true }); for (let k = -3; k <= 3; k++) cone(x, G + 0.5, RZ + dz + k, 0.5, 0.7, 0.5, '#c9cdd3', 'metal', { nc: true }); });
  for (const x of [7060, 7210, 7340, 7600, 7900]) coin(x, RZ + 3.4);

  /* ================= 9. Salt Lake ================= */
  cp(zx(9) + 10); crate(zx(9) + 0);
  box(8340, 4, RZ, 880, 8, 520, '#d9d2c2', 'sand');                                                      // the lake bed
  for (const s of [-1, 1]) box(8340, G - 1.1, RZ + s * 133.5, 880, 1.8, 253, '#7fd0e0', 'water', { t: 0.3 });
  box(8340, G - 1.1, RZ, 880, 1.8, 14, '#7fd0e0', 'water', { t: 0.3 });
  const cause = (x0, x1) => { box((x0 + x1) / 2, G - 2, RZ, x1 - x0, 4, 14, '#cfc6b0', 'stone'); road(x0, x1); };
  cause(zx(9) + 20, 8650); cause(8662, 8780);
  [[8010, 0.5, 1.2], [8090, 0.4, 1.8], [8300, 0.5, 1.4], [8380, 0.4, 1.0], [8460, 0.5, 1.7], [8540, 0.4, 1.3]].forEach(([x, s, w]) => { cyl(x, G - 4, RZ, 9.4, 7, 9.4, '#bfefff', 'neon', { n: 'Geyser', k: 'kill', g: 0.7, t: 0.25, mo: { t: 'move', d: [0, 7.4, 0], s, w } }); cyl(x, G + 0.12, RZ, 10.4, 0.06, 10.4, '#8fb7c2', 'smooth', { nc: true }); });
  cyl(8200, G / 2 - 0.5, 478, 34, G + 1, 34, '#cfc6b0', 'stone'); box(8200, G / 2 - 0.5, 489, 14, G + 1, 8, '#cfc6b0', 'stone'); hut(8200, 474, 10, 8, 4.2, '#e9e4d8'); can(8200, 472.5); pump(8210, 484); cp(8215);
  wedge(8643, G + 1.9, RZ, 13.6, 3.6, 14, '#8a8f98', 'diamond', { r: [0, 270, 0] });                      // the last jump: 8650 to 8662
  for (const s of [-1, 1]) box(8630, G + 1.6, RZ + s * 8.4, 0.4, 3.2, 0.4, '#f2c230', 'neon', { g: 0.6 });
  for (const x of [8050, 8250, 8420, 8600]) coin(x, RZ); coin(8657, RZ, G + 5);
  // the oasis
  cyl(8850, G + 0.08, RZ, 110, 0.16, 110, '#5fc76b', 'grass', { nc: true });
  cyl(8870, G + 0.2, RZ - 34, 26, 0.4, 26, '#3a86ff', 'water', { t: 0.35 });
  for (const s of [-1, 1]) cyl(8840, G + 4, RZ + s * 8.5, 1.2, 8, 1.2, '#f5f5f5', 'marble');
  box(8840, G + 8.4, RZ, 1.4, 1, 19, '#ffd23f', 'neon', { g: 0.7 });
  box(8840, G + 3.5, RZ, 1, 7, 15.8, '#ffd23f', 'neon', { k: 'goal', g: 0.5, t: 0.6, nc: true });
  for (const [x, z] of [[8820, 470], [8860, 530], [8880, 482], [8900, 520], [8850, 455], [8910, 468], [8830, 540]]) {
    cyl(x, G + 3.5, z, 0.8, 7, 0.8, '#8b6a45', 'wood', { r: [rnd(-5, 5), 0, rnd(-5, 5)] });
    for (let a = 0; a < 6; a++) box(x + Math.cos(a * 1.047) * 1.9, G + 7.2, z + Math.sin(a * 1.047) * 1.9, 3.6, 0.2, 1.1, '#3f9a4f', 'grass', { r: [0, -a * 60, 18] });
  }
  return { v: 2, engine: 2, n: 'Rusty Road', mode: 'obby', sky: 'sunset', parts, scripts: [{ n: 'Road trip', src: ROAD_SCRIPT }] };
}
