// Rusty Road: Blockyard's desert road trip. Fix up the old buggy (find a wheel and a battery), fill the tank
// with fuel cans, and drive the long road to the oasis. Stop at shacks for more fuel, slalom the rockfall,
// jump the tar gulch, and get through the sandstorm. All of it is Engine v2 parts and one Blockscript, so you
// can open a copy in the builder and change anything.
import { kit } from './gamekit.js';

const G = 10; // the top of the sand
// the road: five long legs joined by four short ones, from the junkyard (south-west) to the oasis (north-east)
const LEGS = [[110, 880, 900, 880], [900, 880, 900, 700], [900, 700, 100, 700], [100, 700, 100, 520], [100, 520, 900, 520], [900, 520, 900, 340], [900, 340, 100, 340], [100, 340, 100, 160], [100, 160, 900, 160]];
export const ROAD_STOPS = [[480, 880, 2], [900, 790, 1], [520, 700, 2], [100, 610, 2], [430, 520, 1], [900, 430, 2], [500, 340, 2], [100, 250, 2], [500, 160, 1]];
const MARKS = [[480, 880], [900, 790], [520, 700], [100, 610], [540, 520], [900, 430], [500, 340], [100, 250], [640, 160]];
const NAMES = ['Dry Gulch Gas', 'Corner Diner', 'Rockfall Pass', 'Windmill Bend', 'Tar Gulch', 'High Mesa', 'Storm Flats', 'Bone Bend', 'Last Stop'];

export const ROAD_SCRIPT = `// Rusty Road: the script that runs this world.
fuel = 0
inCar = false
carDir = 90        // the buggy starts pointing east
holding = ""       // what you're carrying: "wheel", "battery" or "can"
wheelOn = false
batteryOn = false
mark = 0
top = 34           // top speed
names = [${NAMES.map((n) => JSON.stringify(n)).join(', ')}]
carParts = parts("Car") + [part("Seat"), part("Wheel4")]
carry = part("Carry")

fn showFuel() { board("Fuel", str(round(max(0, fuel))) + "%") }

on start {
  part("Wheel4").hide()
  carry.hide()
  carry.follow(0, 0.95, 0.75)
  for t in parts("Tumble") { t.spin(0, 0, 220) }
  showFuel()
  board("Road", "0 of 9")
  say("Your buggy needs a wheel and a battery, and the tank is empty. Look around the yard!")
}

fn getIn() {
  seat = part("Seat")
  for p in carParts { p.solid(false) }
  teleport(seat.x, seat.y - 1, seat.z)    // (the seat is 1 stud above the ground the buggy stands on)
  face(carDir)
  for p in carParts { p.follow() }
  if fuel > 0 { drive(top, 95, 1) } else { drive(0, 95, 1) }
  inCar = true
  sound("go")
  if fuel <= 0 { say("The tank is empty. Find a red fuel can.") }
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

on use {
  if inCar { getOut()  return }
  atCar = near("Seat", 5)
  if holding != "" and atCar {
    if holding == "wheel" { part("Wheel4").show()  wheelOn = true  say("The wheel is on!")  sound("key") }
    if holding == "battery" { batteryOn = true  say("The battery is in. Now it needs fuel.")  sound("key") }
    if holding == "can" { fuel = min(100, fuel + 45)  showFuel()  say("Glug glug. Fuel: " + round(fuel) + "%")  sound("coin") }
    holding = ""
    carry.hide()
    return
  }
  if holding == "" {
    w = near("Wheel", 3.5)
    if w { pickUp(w, "wheel", "black")  return }
    b = near("Battery", 3.5)
    if b { pickUp(b, "battery", "yellow")  return }
    c = near("Can", 3.5)
    if c { pickUp(c, "can", "red")  return }
  }
  if atCar {
    if holding != "" { return }
    if not wheelOn { say("It only has three wheels. Find the spare in the yard.")  return }
    if not batteryOn { say("It won't start without a battery. There's one in the yard.")  return }
    getIn()
    return
  }
  if holding != "" { say("Take the " + holding + " to the buggy.") }
}

// the little hint next to the Use key
every 0.2 {
  if inCar { prompt("Get out")  return }
  if holding != "" {
    if near("Seat", 5) { prompt("Put the " + holding + " on the buggy") } else { prompt("") }
    return
  }
  if near("Wheel", 3.5) or near("Battery", 3.5) or near("Can", 3.5) { prompt("Pick up")  return }
  if near("Seat", 5) { prompt("Drive")  return }
  prompt("")
}

// driving burns fuel: a full tank is about 1000 studs of road
every 0.25 {
  if inCar and fuel > 0 {
    fuel -= player.vel * 0.25 / 10
    if fuel <= 0 {
      fuel = 0
      drive(0, 95, 1)
      say("Out of fuel! Get out and find a red fuel can.")
      sound("error")
    }
    showFuel()
  }
  if inCar and fuel > 0 and player.vel < 1 { drive(top, 95, 1) }
}

// nine places along the road: each one is a checkpoint
fn reach(n) {
  if n > mark {
    mark = n
    checkpoint()
    board("Road", str(n) + " of 9")
    sound("checkpoint")
    say(names[n - 1])
  }
}
on touch "Mark1" { reach(1) }
on touch "Mark2" { reach(2) }
on touch "Mark3" { reach(3) }
on touch "Mark4" { reach(4) }
on touch "Mark5" { reach(5)  say("Tar Gulch ahead: hit the ramp at full speed!") }
on touch "Mark6" { reach(6) }
on touch "Mark7" { reach(7) }
on touch "Mark8" { reach(8) }
on touch "Mark9" { reach(9)  say("The oasis is just ahead!") }

on touch "Storm" { dark(0.6)  say("A sandstorm! Keep to the road.") }
on leave "Storm" { dark(0) }
`;

export function roadWorld() {
  const K = kit(77), { parts, box, cyl, ball, wedge, cone, rnd, pick } = K;
  const SAND = '#e3c07b', ROADC = '#3d3a3a', ROCK = ['#a8734e', '#96633f', '#b98560'], CACT = ['#4f9a4a', '#5aa856', '#458a44'];
  box(500, G / 2, 500, 980, G, 980, SAND, 'sand');
  box(110, G + 0.2, 868, 4, 0.4, 4, '#7cc8ff', 'smooth', { k: 'spawn' });
  // see-through walls round the edge of the desert, so nobody drives off the world
  for (const [x, z, sx, sz] of [[500, 12, 980, 2], [500, 988, 980, 2], [12, 500, 2, 980], [988, 500, 2, 980]]) box(x, G + 30, z, sx, 60, sz, '#ffffff', 'glass', { t: 1 });

  /* ---- the road ---- */
  for (const [x0, z0, x1, z1] of LEGS) {
    const ew = z0 === z1, len = Math.abs(ew ? x1 - x0 : z1 - z0) + 14, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    box(cx, G + 0.05, cz, ew ? len : 14, 0.1, ew ? 14 : len, ROADC, 'stone');
    box(cx, G + 0.11, cz, ew ? len - 16 : 0.5, 0.04, ew ? 0.5 : len - 16, '#f2c230', 'smooth', { nc: true });
    for (const side of [-6.4, 6.4]) box(cx + (ew ? 0 : side), G + 0.11, cz + (ew ? side : 0), ew ? len : 0.4, 0.04, ew ? 0.4 : len, '#e9e4d8', 'smooth', { nc: true });
  }
  const onRoad = (x, z, m = 13) => LEGS.some(([x0, z0, x1, z1]) => x > Math.min(x0, x1) - m && x < Math.max(x0, x1) + m && z > Math.min(z0, z1) - m && z < Math.max(z0, z1) + m);
  const nearStop = (x, z) => ROAD_STOPS.some(([sx, sz]) => Math.abs(x - sx) < 34 && Math.abs(z - sz) < 34) || (Math.abs(x - 110) < 60 && Math.abs(z - 880) < 50) || (x > 860 && z < 215);

  /* ---- the junkyard and the buggy (it points east, down the first leg) ---- */
  const cx = 126, cz = 880, cy = G + 0.1;
  const car = (x, y, z, sx, sy, sz, c, m = 'metal', extra = {}) => box(cx + x, cy + y, cz + z, sx, sy, sz, c, m, { n: 'Car', ...extra });
  car(0, 0.75, 0, 5, 0.4, 2.5, '#2f8f8a');                               // floor
  car(1.55, 1.25, 0, 1.7, 0.6, 2.4, '#37a39d');                          // hood
  car(-1.85, 1.3, 0, 1.2, 0.7, 2.4, '#37a39d');                          // back
  car(-1.05, 1.75, 0, 0.3, 1.2, 2.2, '#3b3b44', 'fabric');               // seat back
  for (const s of [-1.15, 1.15]) car(0.1, 1.25, s, 2.1, 0.6, 0.2, '#2f8f8a'); // sides
  car(0.72, 1.95, 0, 0.12, 0.8, 2.3, '#bfe6ff', 'glass', { t: 0.55 });   // windshield
  for (const s of [-1.1, 1.1]) car(-1.25, 2.1, s, 0.18, 1.9, 0.18, '#2c2c34'); // roll bar
  car(-1.25, 3.0, 0, 0.18, 0.18, 2.4, '#2c2c34');
  car(2.55, 0.85, 0, 0.3, 0.35, 2.8, '#8d8d96');                         // bumper
  for (const s of [-0.8, 0.8]) car(2.42, 1.3, s, 0.15, 0.35, 0.45, '#fff3b0', 'neon', { g: 0.8, lt: { r: 16, b: 1.1 } }); // headlights
  car(-2.5, 1.2, 0.7, 0.5, 0.25, 0.25, '#6d6d75');                       // exhaust
  const wheel = (x, z, name) => cyl(cx + x, cy + 0.6, cz + z, 1.2, 0.5, 1.2, '#22222a', 'smooth', { r: [90, 0, 0], n: name });
  wheel(1.6, 1.45, 'Car'); wheel(1.6, -1.45, 'Car'); wheel(-1.6, 1.45, 'Car'); wheel(-1.6, -1.45, 'Wheel4');
  box(cx - 0.25, cy + 1.0, cz, 0.9, 0.3, 1.6, '#3b3b44', 'fabric', { n: 'Seat' });
  box(cx - 1.6, G + 0.3, cz - 1.45, 0.7, 0.5, 0.7, '#8b5a2b', 'wood', { nc: true }); // (a block of wood where the wheel is missing)
  box(100, G + 30, 100, 0.5, 0.5, 0.35, '#e63946', 'smooth', { n: 'Carry', nc: true }); // what you carry (the script moves it into your hands)
  // the things to find
  cyl(96, G + 0.3, 858, 1.2, 0.5, 1.2, '#22222a', 'smooth', { n: 'Wheel' });
  box(140, G + 0.45, 902, 0.9, 0.7, 0.6, '#f2c230', 'metal', { n: 'Battery' });
  const can = (x, z) => box(x, G + 0.55, z, 0.8, 1.0, 0.55, '#d62828', 'metal', { n: 'Can' });
  can(84, 894); can(152, 872);
  // the garage and its junk
  box(110, G + 2.2, 904, 16, 4.4, 0.6, '#8f6a4a', 'planks'); box(102.3, G + 2.2, 898, 0.6, 4.4, 12, '#8f6a4a', 'planks'); box(117.7, G + 2.2, 898, 0.6, 4.4, 12, '#8f6a4a', 'planks');
  box(110, G + 4.6, 898, 17, 0.4, 13, '#7a8794', 'diamond');
  for (const [x, z, c] of [[88, 866, '#5a7d9a'], [92, 900, '#9a5a5a'], [146, 866, '#6b8f5a'], [150, 894, '#8a7d55']]) { box(x, G + 0.7, z, 3.4, 1.4, 2, c, 'metal', { r: [0, rnd(0, 90), 0] }); box(x, G + 1.75, z, 2, 0.7, 1.8, c, 'metal', { r: [0, rnd(0, 90), 0] }); }
  for (let i = 0; i < 5; i++) cyl(132 + i * 1.4, G + 0.3 + (i % 2) * 0.5, 862, 1.2, 0.5, 1.2, '#2a2a31', 'smooth');
  box(122, G + 3.2, 866, 0.4, 6.4, 0.4, '#6d4c33', 'wood'); box(122, G + 5.6, 866, 9, 2, 0.3, '#f2c230', 'planks'); // the sign

  /* ---- the stops: a shack, fuel cans and a place to pull over ---- */
  ROAD_STOPS.forEach(([sx, sz, n], i) => {
    const ew = LEGS.some(([x0, z0, x1, z1]) => z0 === z1 && z0 === sz && sx > Math.min(x0, x1) && sx < Math.max(x0, x1));
    const ox = ew ? 0 : 1, oz = ew ? -1 : 0; // which way "off the road" is
    const hx = sx + ox * 17, hz = sz + oz * 17, wall = ['#a0764e', '#8f8f7a', '#b06a4a'][i % 3];
    box(hx, G + 2, hz, 9, 4, 7, wall, i % 2 ? 'planks' : 'brick'); box(hx, G + 4.25, hz, 10.4, 0.5, 8.4, '#6d7781', 'diamond');
    box(hx - ox * 4.6 - oz * 0, G + 1.4, hz - oz * 3.6, ox ? 0.2 : 2, 2.8, oz ? 0.2 : 2, '#4a3526', 'wood', { nc: true }); // a door
    box(sx + ox * 9.5, G + 0.06, sz + oz * 9.5, ew ? 20 : 6, 0.12, ew ? 6 : 20, '#55504c', 'stone'); // the pull-over
    cyl(hx + (ew ? 7 : 0), G + 1.2, hz + (ew ? 0 : 7), 1.4, 2.4, 1.4, '#3e6e8e', 'metal'); // a water barrel
    box(sx + ox * 11 + (ew ? -9 : 0), G + 2.6, sz + oz * 11 + (ew ? 0 : -9), 0.35, 5.2, 0.35, '#6d4c33', 'wood');
    box(sx + ox * 11 + (ew ? -9 : 0), G + 4.6, sz + oz * 11 + (ew ? 0 : -9), ew ? 5 : 0.3, 1.4, ew ? 0.3 : 5, pick(['#e63946', '#3a86ff', '#44c06a']), 'smooth', { g: 0.25 });
    for (let k = 0; k < n; k++) can(sx + ox * 11.5 + (ew ? 3 + k * 2.2 : 0), sz + oz * 11.5 + (ew ? 0 : 3 + k * 2.2));
  });
  MARKS.forEach(([x, z], i) => {
    const ew = LEGS.some(([x0, z0, x1, z1]) => z0 === z1 && z0 === z);
    box(x, G + 3, z, ew ? 2 : 16, 6, ew ? 16 : 2, '#ffffff', 'smooth', { n: 'Mark' + (i + 1), nc: true, t: 1 });
    for (const s of [-8.2, 8.2]) { box(x + (ew ? 0 : s), G + 2.5, z + (ew ? s : 0), 0.4, 5, 0.4, '#e9e4d8', 'smooth'); box(x + (ew ? 0 : s), G + 4.6, z + (ew ? s : 0), ew ? 0.3 : 1.6, 0.9, ew ? 1.6 : 0.3, '#44c06a', 'neon', { g: 0.5 }); }
  });

  /* ---- leg 2: Rockfall Pass (boulders to steer around, cliffs on both sides) ---- */
  [[650, 696], [615, 704], [580, 696], [450, 704], [415, 696], [380, 704], [345, 696]].forEach(([x, z]) => ball(x, G + 1.9, z, 4.6, pick(ROCK), 'stone'));
  for (let x = 330; x <= 670; x += 34) for (const s of [-1, 1]) if (Math.abs(x - 520) > 52) box(x + rnd(-6, 6), G + rnd(5, 9), 700 + s * rnd(22, 30), rnd(26, 36), rnd(12, 20), rnd(14, 22), pick(ROCK), 'stone', { r: [0, rnd(-12, 12), 0] });

  /* ---- leg 3: Tar Gulch (a ramp, then a strip of tar you have to jump) ---- */
  wedge(604, G + 1.35, 520, 13.6, 2.5, 14, '#8a8f98', 'diamond', { r: [0, 270, 0] });
  box(617, G + 0.13, 520, 8, 0.25, 34, '#16161d', 'smooth', { k: 'kill', g: 0.05 });
  for (const s of [-1, 1]) { box(617, G + 0.4, 520 + s * 22, 12, 0.8, 10, pick(ROCK), 'stone'); box(596, G + 1.6, 520 + s * 8.4, 0.4, 3.2, 0.4, '#f2c230', 'neon', { g: 0.6 }); }
  box(588, G + 3.4, 529, 0.4, 6.8, 0.4, '#6d4c33', 'wood'); box(588, G + 6, 529, 0.3, 2, 6, '#f2c230', 'planks');

  /* ---- leg 4: Storm Flats (a dark sandstorm with tumbleweeds rolling across the road) ---- */
  box(480, G + 12, 340, 420, 24, 70, '#d9b36a', 'smooth', { n: 'Storm', nc: true, t: 1 });
  [[640, 0], [560, 1.5], [470, 0.7], [390, 2.2], [320, 1.1]].forEach(([x, w], i) => ball(x, G + 1.5, 318, 3, '#b08a4e', 'fabric', { n: 'Tumble', mo: { t: 'move', d: [0, 0, 44], s: 2.6 + (i % 3) * 0.5, w } }));

  /* ---- the oasis: palms, a pool and the finish arch ---- */
  cyl(930, G + 0.08, 160, 46, 0.16, 46, '#5fc76b', 'grass');
  cyl(942, G + 0.2, 148, 20, 0.4, 20, '#3a86ff', 'water', { t: 0.35 });
  for (const s of [-1, 1]) cyl(905, G + 4, 160 + s * 8.5, 1.2, 8, 1.2, '#f5f5f5', 'marble');
  box(905, G + 8.4, 160, 1.4, 1, 19, '#ffd23f', 'neon', { g: 0.7 });
  box(905, G + 3.5, 160, 1, 7, 15.8, '#ffd23f', 'neon', { k: 'goal', g: 0.5, t: 0.6, nc: true });
  for (const [x, z] of [[922, 138], [950, 170], [930, 182], [960, 140], [916, 176]]) {
    cyl(x, G + 3.5, z, 0.8, 7, 0.8, '#8b6a45', 'wood', { r: [rnd(-5, 5), 0, rnd(-5, 5)] });
    for (let a = 0; a < 6; a++) box(x + Math.cos(a * 1.047) * 1.9, G + 7.2, z + Math.sin(a * 1.047) * 1.9, 3.6, 0.2, 1.1, '#3f9a4f', 'grass', { r: [0, -a * 60, 18] });
  }

  /* ---- scenery: cactus, rocks, bones, mesas far off, poles along the road ---- */
  for (let i = 0; i < 170; i++) {
    const x = rnd(40, 960), z = rnd(40, 960);
    if (onRoad(x, z) || nearStop(x, z)) continue;
    const hgt = rnd(2.4, 5), c = pick(CACT);
    cyl(x, G + hgt / 2, z, 0.9, hgt, 0.9, c, 'smooth');
    if (rnd() < 0.7) { cyl(x + 0.9, G + hgt * 0.55, z, 0.5, 0.5, 1.3, c, 'smooth', { r: [90, 90, 0] }); cyl(x + 1.5, G + hgt * 0.72, z, 0.5, hgt * 0.4, 0.5, c, 'smooth'); }
  }
  for (let i = 0; i < 130; i++) {
    const x = rnd(30, 970), z = rnd(30, 970);
    if (onRoad(x, z, 15) || nearStop(x, z)) continue;
    const d = rnd(1.2, 4.2);
    if (rnd() < 0.5) ball(x, G + d * 0.25, z, d, pick(ROCK), 'stone'); else box(x, G + d * 0.3, z, d, d * 0.7, d * 0.8, pick(ROCK), 'stone', { r: [rnd(-10, 10), rnd(0, 90), rnd(-10, 10)] });
  }
  for (let i = 0; i < 26; i++) {
    const x = rnd(60, 940), z = rnd(60, 940);
    if (onRoad(x, z, 48) || nearStop(x, z)) continue;
    const w = rnd(26, 60), d = rnd(22, 48), hgt = rnd(14, 34), c = pick(ROCK);
    box(x, G + hgt / 2, z, w, hgt, d, c, 'stone', { r: [0, rnd(0, 40), 0] });
    box(x + rnd(-4, 4), G + hgt + 2, z + rnd(-4, 4), w * 0.7, 4, d * 0.7, '#c08a5c', 'stone', { r: [0, rnd(0, 40), 0] });
  }
  for (const [x0, z0, x1, z1] of LEGS) {
    const ew = z0 === z1, len = Math.abs(ew ? x1 - x0 : z1 - z0);
    for (let t = 30; t < len; t += 62) {
      const x = ew ? Math.min(x0, x1) + t : x0 + 10.5, z = ew ? z0 + 10.5 : Math.min(z0, z1) + t;
      if (nearStop(x, z) && ROAD_STOPS.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 14)) continue;
      box(x, G + 4.5, z, 0.45, 9, 0.45, '#6d4c33', 'wood'); box(x, G + 8.2, z, ew ? 0.3 : 2.6, 0.3, ew ? 2.6 : 0.3, '#6d4c33', 'wood');
    }
  }
  return { v: 2, engine: 2, n: 'Rusty Road', mode: 'obby', sky: 'sunset', parts, scripts: [{ n: 'Road trip', src: ROAD_SCRIPT }] };
}
