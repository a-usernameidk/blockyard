// Crown Party (the first Crown Chaos): every 45 seconds the server puts the crown on one random player, and the crown comes with
// powers: zoom, moon jumps, blast everyone away, freeze them, turn the floor to lava, make them float, pull
// them to you. Everyone else tries to survive it. Playing alone you always have the crown and there are
// practice dummies to blast. Engine v2 parts and one Blockscript ("crown": 45 in the world turns the crown on).
import { kit } from './gamekit.js';

const G = 20, CX = 500, CZ = 500, R = 60;
export const CROWN_POWERS = ['Zoom', 'Moon', 'Blast', 'Freeze', 'Lava', 'Float', 'Pull'];

export const CROWN_SCRIPT = `// Crown Chaos: the script that runs this world.
powers = ${JSON.stringify(CROWN_POWERS)}
cool = 0
lavaOn = false
survived = 0
homes = []
dummies = parts("Dummy")
for d in dummies { push(homes, [d.x, d.y, d.z]) }

on start {
  part("Lava").hide()
  board("Crown", "nobody yet")
  say("One player gets the crown and its powers. Everyone else: survive!")
}

fn ready() {
  if time() < cool { say("Recharging: " + str(ceil(cool - time())) + "s")  return false }
  cool = time() + 3
  return true
}

on crown {
  for b in powers { button(b) }
  say("You have the crown! Use the buttons (or keys 1 to 7).")
  sound("badge")
}
on uncrown {
  for b in powers { button(b, false) }
  speed(1)  jump(1)  gravity(1)
  say("The crown moved on. Now survive!")
}

every 0.5 {
  if crowned() == "" { board("Crown", "nobody yet") } else { board("Crown", crowned() + " (" + str(crownTime()) + "s)") }
  board("Survived", survived)
}

// powers that are only about you
on press "Zoom" { if ready() { speed(2.6)  sound("speed")  say("Zoom!")  wait(8)  speed(1) } }
on press "Moon" { if ready() { jump(2.2)  gravity(0.35)  sound("bounce")  say("Moon boots!")  wait(10)  jump(1)  gravity(1) } }
// powers that happen to everyone else: send() tells every player's copy of this script
on press "Blast" { if ready() { send("blast")  sound("whoosh") } }
on press "Freeze" { if ready() { send("freeze")  sound("tick") } }
on press "Lava" { if ready() { send("lava")  sound("die") } }
on press "Float" { if ready() { send("float")  sound("bounce") } }
on press "Pull" { if ready() { send("pull")  sound("pop") } }

on message "blast" {
  // the practice dummies fly (on everyone's screen)
  let i = 0
  for d in dummies {
    let ax = d.x - from[1]
    let az = d.z - from[3]
    let far = sqrt(ax * ax + az * az)
    if far < 34 { d.move(ax / max(far, 1) * 14, 9, az / max(far, 1) * 14, 0.45)  d.spin(300, 200, 0) }
    i += 1
  }
  if not mine {
    let bx = player.x - from[1]
    let bz = player.z - from[3]
    let dd = sqrt(bx * bx + bz * bz)
    if dd < 34 {
      let k = (34 - dd) / 34
      launch(bx / max(dd, 1) * 32 * k, 14 + 12 * k, bz / max(dd, 1) * 32 * k)
      say(from[0] + " blasted you!")
    } else { survived += 1 }
  }
  wait(1.6)
  i = 0
  for d in dummies { d.stop()  d.turnTo(0, 0, 0)  d.moveTo(homes[i][0], homes[i][1], homes[i][2], 0.6)  i += 1 }
}

on message "freeze" {
  for d in dummies { d.color("cyan") }
  if not mine { speed(0)  jump(0)  say("Frozen by " + from[0] + "!") }
  wait(3)
  for d in dummies { d.color("orange") }
  if not mine { speed(1)  jump(1) }
}

on message "lava" {
  part("Lava").show()
  lavaOn = true
  if not mine { say("THE FLOOR IS LAVA! Get up high!") }
  wait(6)
  part("Lava").hide()
  if lavaOn and not mine { survived += 1 }
  lavaOn = false
}
on touch "Lava" { if lavaOn and not player.crowned { lavaOn = false  kill() } }

on message "float" {
  if mine { return }
  say("Whoa! " + from[0] + " turned gravity upside down!")
  gravity(-0.3)
  wait(2.2)
  gravity(1)
  survived += 1
}

on message "pull" {
  for d in dummies { d.moveTo(from[1] + random(-5, 5), from[2] + 1.2, from[3] + random(-5, 5), 0.4) }
  if not mine { teleport(from[1] + random(-3, 3), from[2] + 1, from[3] + random(-3, 3))  say(from[0] + " pulled everyone in!") }
  wait(2.5)
  let i = 0
  for d in dummies { d.moveTo(homes[i][0], homes[i][1], homes[i][2], 0.6)  i += 1 }
}
`;

export function crownPartyWorld() {
  const K = kit(9), { parts, box, cyl, ball, wedge, cone, rnd, pick } = K;
  const COL = ['#e63946', '#3a86ff', '#44c06a', '#ffd23f', '#9b5de5', '#ff7b25'];
  cyl(CX, G / 2, CZ, R * 2, G, R * 2, '#d8dde6', 'smooth');                        // the arena floor
  cyl(CX, G + 0.06, CZ, 40, 0.12, 40, '#c2c9d6', 'cobble', { nc: true });
  cyl(CX, G + 0.2, CZ, R * 2 - 2, 0.25, R * 2 - 2, '#ff5a1f', 'neon', { n: 'Lava', g: 1, nc: true, t: 0.15 }); // (hidden until someone uses Lava)
  box(CX, G + 0.2, CZ + 14, 4, 0.4, 4, '#7cc8ff', 'smooth', { k: 'spawn' });
  // a low wall around the edge with a flag on every post
  for (let a = 0; a < 24; a++) {
    const t = a * Math.PI / 12, x = CX + Math.cos(t) * (R - 1), z = CZ + Math.sin(t) * (R - 1);
    box(x, G + 1.5, z, 16, 3, 1.4, '#9aa3b5', 'brick', { r: [0, 90 - a * 15, 0] });
    cyl(x, G + 4.5, z, 0.5, 6, 0.5, '#6d7385', 'metal'); box(x, G + 6.8, z, 0.15, 1.4, 2.2, COL[a % 6], 'fabric', { r: [0, 90 - a * 15, 0], nc: true });
  }
  // the throne in the middle, up three steps
  for (let s = 0; s < 3; s++) cyl(CX, G + 0.4 + s * 0.8, CZ, 16 - s * 4, 0.8, 16 - s * 4, s % 2 ? '#e8ebf2' : '#ffd23f', 'marble');
  box(CX, G + 3.1, CZ - 1.2, 2.6, 1.4, 2.2, '#9b5de5', 'fabric'); box(CX, G + 4.6, CZ - 2.1, 2.6, 4.4, 0.5, '#9b5de5', 'fabric'); for (const s of [-1.5, 1.5]) box(CX + s, G + 3.6, CZ - 1.2, 0.4, 2.4, 2.2, '#ffd23f', 'metal');
  cone(CX, G + 7.6, CZ - 2.1, 1.4, 1.2, 1.4, '#ffd23f', 'neon', { g: 0.8, lt: { r: 22, b: 1.2 } });
  // four towers to escape the lava: a ramp up, a deck, and a higher lookout you bounce to
  for (let q = 0; q < 4; q++) {
    const t = q * Math.PI / 2 + Math.PI / 4, x = CX + Math.cos(t) * 40, z = CZ + Math.sin(t) * 40, c = COL[q];
    box(x, G + 2, z, 12, 0.6, 12, c, 'planks'); for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) cyl(x + dx, G + 1, z + dz, 0.9, 2, 0.9, '#6d4c33', 'wood');
    wedge(x - Math.cos(t) * 11.5, G + 1.15, z - Math.sin(t) * 11.5, 6, 2.3, 11, c, 'planks', { r: [0, 270 - q * 90 - 45, 0] });
    box(x + Math.cos(t) * 3, G + 2.5, z + Math.sin(t) * 3, 3, 0.4, 3, '#ff5d8f', 'neon', { k: 'bounce', g: 0.6 });
    box(x + Math.cos(t) * 11, G + 8, z + Math.sin(t) * 11, 9, 0.6, 9, '#f5f5f5', 'marble'); cyl(x + Math.cos(t) * 11, G + 4, z + Math.sin(t) * 11, 1.6, 8, 1.6, '#9aa3b5', 'stone');
  }
  // stepping stones between the towers (one jump high) and two speed strips
  for (let a = 0; a < 8; a++) { const t = a * Math.PI / 4, r = a % 2 ? 26 : 50; cyl(CX + Math.cos(t) * r, G + 0.7, CZ + Math.sin(t) * r, 5, 1.4, 5, COL[(a + 2) % 6], 'smooth'); }
  for (const s of [-1, 1]) box(CX + s * 30, G + 0.12, CZ, 3, 0.24, 14, '#4cc9f0', 'neon', { k: 'speed', g: 0.6 });
  // practice dummies: the crown's powers work on them too
  for (let a = 0; a < 6; a++) { const t = a * Math.PI / 3 + 0.5, x = CX + Math.cos(t) * 20, z = CZ + Math.sin(t) * 20; box(x, G + 1.3, z, 1.2, 2.2, 1.2, '#ff7b25', 'fabric', { n: 'Dummy', nc: true }); }
  for (let a = 0; a < 6; a++) { const t = a * Math.PI / 3 + 0.5, x = CX + Math.cos(t) * 20, z = CZ + Math.sin(t) * 20; cyl(x, G + 0.1, z, 2, 0.2, 2, '#55504c', 'stone', { nc: true }); }
  return { v: 2, engine: 2, n: 'Crown Party', mode: 'hangout', sky: 'day', crown: 45, parts, scripts: [{ n: 'Crown', src: CROWN_SCRIPT }] };
}
