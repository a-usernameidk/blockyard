// Greyscale: Blockyard's escape game, in two floors. All of it is Engine v2 parts and one Blockscript.
// Floor 1, the offices: switch on 3 breakers, find the 4 numbers of the door code, turn the dials, take the lift
// key and ride the service lift down. Something walks the halls. It goes where the doors go, it chases what it
// can see, and when the lights go out it knows where you are: hide in a locker (but not while it is watching).
// Floor 2, the basement: no lights at all, only your torch (find fresh cells). The mannequins down here move
// when you are not looking at them. Carry the three color canisters to the machine, and then run.
import { kit } from './gamekit.js';

const G = 10, H = 6, H2 = 7, T = 0.6;       // the floor, the two ceilings, how thick a wall is
const X0 = 430, X1 = 570, Z0 = 420, Z1 = 580, XW = 614;
// where the Lurker can walk on floor 1: spots, and which spots have a clear straight line between them
export const GREY_NODES = [[500, 505], [446, 500], [436, 500], [436, 462], [436, 538], [554, 500], [564, 500], [564, 462], [564, 538], [500, 528],
  [453, 462], [500, 462], [547, 462], [453, 538], [500, 538], [547, 538], [453, 446], [500, 446], [547, 446], [453, 554], [500, 554], [547, 554],
  [575, 500], [592, 500], [592, 470], [592, 530]];
export const GREY_EDGES = [[0, 1], [1, 2], [2, 3], [2, 4], [0, 5], [5, 6], [6, 7], [6, 8], [0, 9], [9, 14], [3, 10], [10, 11], [11, 12], [12, 7], [4, 13], [13, 14], [14, 15], [15, 8],
  [10, 16], [11, 17], [12, 18], [13, 19], [14, 20], [15, 21], [6, 22], [22, 23], [23, 24], [23, 25]];
const HOME = 18, NN = GREY_NODES.length, CELL = 4, COLS = Math.ceil((XW - X0) / CELL), ROWS = Math.ceil((Z1 - Z0) / CELL);
export const GREY_LIFT2 = [718, 500];      // where the lift lets you out in the basement
export const GREY_MACHINE = [780, 500];
export const GREY_MEN = [[759, 432], [812, 416], [800, 558], [760, 570], [790, 588], [868, 479], [852, 521], [884, 531], [742, 470], [940, 497], [985, 503], [1025, 500]];

const script = (tables) => `// Greyscale: the script that runs this world.
level = 1          // 1 = the offices, 2 = the basement
power = 0
code = [0, 0, 0, 0]
got = [false, false, false, false]
dial = [0, 0, 0, 0]
secOpen = false
liftKey = false
cells = 0          // spare torch cells
charge = 100
torchOn = true
holding = ""
fill = 0
fin = false
hidden = false
doomed = false
blackout = false
warned = false
secs = 0
grace = 6          // the Lurker waits this long before it starts walking
lstate = 0         // 0 = walking its rounds, 1 = hunting
lost = 0
ln = ${HOME}
goal = 0
onGraph = true
lastN = 0
lastX = 0
lastZ = 0
outX = 0
outY = 0
outZ = 0
hideIn = nil
body = part("LurkBody")
lurk = parts("Lurker") + [body]
torch = part("Torch")
ember = part("Ember")
carry = part("Carry")
numParts = [part("Num1"), part("Num2"), part("Num3"), part("Num4")]
dials = [part("Dial1"), part("Dial2"), part("Dial3"), part("Dial4")]
men = [parts("Man1"), parts("Man2"), parts("Man3"), parts("Man4"), parts("Man5"), parts("Man6"), parts("Man7"), parts("Man8"), parts("Man9"), parts("Man10"), parts("Man11"), parts("Man12")]
awake = []
mhome = []
for m in men { push(awake, false)  push(mhome, [m[0].x, m[0].z]) }
places = ["1st", "2nd", "3rd", "4th"]
noteParts = parts("Note")
notes = ${JSON.stringify(tables.notes)}

on start {
  mono(true)
  dark(0.84)
  torch.follow(0, 2.3, 0.4)
  ember.follow(0, 2.3, 0.4)
  ember.hide()
  carry.follow(0.5, 1.2, 0.6)
  carry.hide()
  for p in parts("Alarm") { p.hide() }
  board("Power", "0 of 3")
  board("Code", "? ? ? ?")
  say("The main lift is dead. Get the power on, find the door code, and take the service lift. You are not alone in here.")
}

fn cellNode(x, z) {
  let cx = max(0, min(${COLS - 1}, floor((x - ${X0}) / ${CELL})))
  let cz = max(0, min(${ROWS - 1}, floor((z - ${Z0}) / ${CELL})))
  return grid[cz * ${COLS} + cx]
}
fn lurkTo(x, z) {
  let dx = x - body.x
  let dz = z - body.z
  for p in lurk { p.move(dx, 0, dz) }
}
fn showCode() {
  let t = ""
  let i = 0
  repeat 4 {
    if got[i] { t = t + str(code[i]) + " " } else { t = t + "? " }
    i += 1
  }
  board("Code", t)
}
fn showTorch() {
  if level < 2 { return }
  let t = str(ceil(charge)) + "%"
  if cells > 0 { t = t + " +" + str(cells) }
  board("Torch", t)
}
fn comeOut() {
  teleport(outX, outY, outZ)
  hideIn.solid(true)
  speed(1)
  jump(1)
  hidden = false
  doomed = false
  sound("door")
}

on use {
  if hidden { comeOut()  return }
  let c = near("Cell", 3.2)
  if c {
    c.hide()
    sound("pop")
    if torchOn { cells += 1  say("A torch cell. Spare cells: " + str(cells)) } else { charge = 100  torchOn = true  ember.hide()  torch.show()  say("A fresh cell. The torch is back.") }
    showTorch()
    return
  }
  if level == 1 {
    let s = near("Breaker", 3)
    if s {
      if s.color() == "#f5f5f5" { say("This breaker is already on.")  return }
      s.color("white")
      s.glow(1)
      power += 1
      if power == 1 { code = [random(1, 9), random(1, 9), random(1, 9), random(1, 9)] }
      board("Power", str(power) + " of 3")
      sound("checkpoint")
      checkpoint()
      if power < 3 { say("Breaker on. Something heard that.") } else { say("All three are on. The dials by the Security door have power now.") }
      return
    }
    let i = 0
    for n in numParts {
      if near(n, 3.2) {
        if power < 1 { say("A number is scratched here, but it is too dark to read. Get a breaker on first.")  return }
        if not got[i] { got[i] = true  checkpoint()  sound("key") }
        say("Scratched into the desk: the " + places[i] + " number is " + str(code[i]) + ".")
        showCode()
        return
      }
      i += 1
    }
    let at = -1
    let bd = 2.3
    i = 0
    for d in dials {
      if dist(d) < bd { bd = dist(d)  at = i }
      i += 1
    }
    if at >= 0 {
      if secOpen { say("The Security door is already open.")  return }
      if power < 3 { say("The dials are dead. All 3 breakers have to be on.")  return }
      dial[at] = (dial[at] + 1) % 10
      dials[at].turn(0, 0, 36, 0.15)
      sound("tick")
      board("Dials", str(dial[0]) + " " + str(dial[1]) + " " + str(dial[2]) + " " + str(dial[3]))
      if dial[0] == code[0] and dial[1] == code[1] and dial[2] == code[2] and dial[3] == code[3] {
        secOpen = true
        part("SecDoor").move(0, 5, 0, 1.5)
        sound("door")
        checkpoint()
        board("Dials")
        say("CLUNK. The Security door is open.")
      }
      return
    }
    let k = near("LiftKey", 3.2)
    if k { k.hide()  liftKey = true  sound("key")  checkpoint()  say("The lift key. The service lift is at the end of the lobby.")  return }
    let l = near("Locker", 3.4)
    if l {
      hideIn = l
      outX = player.x
      outY = player.y
      outZ = player.z
      if lstate == 1 and lost < 1.2 and not blackout { doomed = true }
      l.solid(false)
      teleport(l.x, l.y - 1.6, l.z)
      speed(0)
      jump(0)
      hidden = true
      sound("door")
      say("You're hiding. Press Use to come out.")
      return
    }
    if near("DeadLift", 5) { say("The main lift is dead. There is a service lift past the east corridor.")  return }
    if near("Lift", 5) {
      if power < 3 { say("No power. The lift needs all 3 breakers on (" + str(power) + " are).")  return }
      if not liftKey { say("It wants a key. Security keeps it: the door with the four dials.")  return }
      level = 2
      blackout = false
      teleport(${GREY_LIFT2[0]}, ${G + 0.3}, ${GREY_LIFT2[1]})
      face(90)
      checkpoint()
      dark(0.97)
      board("Power")
      board("Code")
      board("Color", "0 of 3")
      showTorch()
      sound("whoosh")
      say("The basement. No lights down here: watch your torch. Three canisters go in the machine.")
      return
    }
  } else {
    if holding != "" {
      if near("Machine", 8) {
        if holding == "red" { part("TubeR").glow(1)  part("TubeR").color("red") }
        if holding == "green" { part("TubeG").glow(1)  part("TubeG").color("green") }
        if holding == "blue" { part("TubeB").glow(1)  part("TubeB").color("blue") }
        holding = ""
        carry.hide()
        fill += 1
        board("Color", str(fill) + " of 3")
        sound("checkpoint")
        checkpoint()
        if fill < 3 { say("It hums. " + str(3 - fill) + " to go.") } else { finale() }
        return
      }
      say("Take the " + holding + " canister to the machine in the big hall.")
      return
    }
    if fin { return }
    let t = near("CanR", 3.5)
    if t { take(t, "red")  return }
    t = near("CanG", 3.5)
    if t { take(t, "green")  return }
    t = near("CanB", 3.5)
    if t { take(t, "blue")  return }
    if near("Machine", 8) { say("Three empty tubes. It wants the red, green and blue canisters.")  return }
  }
  let i = 0
  for n in noteParts {
    if near(n, 3) { say(notes[i])  sound("pop")  return }
    i += 1
  }
}
fn take(t, what) {
  t.hide()
  holding = what
  carry.show()
  sound("key")
  say("A canister. The label says " + what + ". Take it to the machine.")
}
fn finale() {
  fin = true
  mono(false)
  dark(0.8)
  for p in parts("Alarm") { p.show() }
  part("Shutter").move(0, 6, 0, 2.5)
  lurkTo(${GREY_LIFT2[0]}, ${GREY_LIFT2[1]})
  grace = secs + 2
  board("Color", "IT'S BACK")
  sound("win")
  say("COLOR! And something upstairs felt it. The tunnel in the tank room is open: RUN.")
}

// the hint by the Use key
every 0.2 {
  if hidden { prompt("Come out")  return }
  if near("Cell", 3.2) { prompt("Take the cell")  return }
  if level == 1 {
    if near("Breaker", 3) { prompt("Flip the breaker")  return }
    for n in numParts { if near(n, 3.2) { prompt("Read")  return } }
    for d in dials { if near(d, 2.3) { prompt("Turn the dial")  return } }
    if near("LiftKey", 3.2) { prompt("Take the key")  return }
    if near("Locker", 3.4) { prompt("Hide")  return }
    if near("Lift", 5) { prompt("Call the lift")  return }
  } else {
    if holding != "" { if near("Machine", 8) { prompt("Load the canister") } else { prompt("") }  return }
    if not fin and (near("CanR", 3.5) or near("CanG", 3.5) or near("CanB", 3.5)) { prompt("Take the canister")  return }
  }
  if near("Note", 3) { prompt("Read")  return }
  prompt("")
}

// the clock: on floor 1 the lights go out every 70 seconds (they flicker first). In the basement the torch runs down.
every 1 {
  secs += 1
  if level == 1 {
    let c = secs % 70
    if c == 56 {
      sound("tick")
      if not warned { warned = true  say("The lights are flickering. When they go out, be inside a locker.") }
    }
    if c == 60 {
      blackout = true
      dark(1)
      for l in parts("Lamp") { l.hide() }
      sound("whoosh")
    }
    if c == 69 {
      blackout = false
      dark(0.84)
      for l in parts("Lamp") { l.show() }
    }
  } else {
    if torchOn {
      charge -= 1.25
      if charge <= 0 {
        if cells > 0 { cells -= 1  charge = 100  sound("pop")  say("The torch died. You push in a spare cell.") } else { charge = 0  torchOn = false  torch.hide()  ember.show()  sound("error")  say("The torch is dead. Find a cell. They move in the dark.") }
      }
      showTorch()
    }
  }
}
// the flicker before a blackout, and one lamp that is always on its way out
every 0.3 {
  if level > 1 { return }
  if random(0, 3) == 0 { part("BadLamp").hide() } else { part("BadLamp").show() }
  let c = secs % 70
  if c >= 56 and c < 60 {
    if random(0, 2) == 0 { for l in parts("Lamp") { l.hide() } } else { for l in parts("Lamp") { l.show() } }
  }
}

// the Lurker. Floor 1: it walks from spot to spot, the way the doors go. If it can see you it comes straight at
// you (6.3 studs a second; you walk at 7). In a blackout it knows where you are and runs (8.4).
every 0.1 {
  if secs < grace { return }
  let bx = body.x
  let bz = body.z
  let px = player.x
  let pz = player.z
  let sp = 3.4
  let tx = px
  let tz = pz
  if level == 2 {
    if not fin { return }
    sp = 7.5     // (the last run: it comes through the walls, and it is faster than you)
  } else {
    let can = not hidden and sees(body, 36)
    if can or (blackout and not hidden) {
      lstate = 1
      lost = 0
      lastX = px
      lastZ = pz
      lastN = cellNode(px, pz)
    } else if doomed {
      lstate = 1
      lastX = outX
      lastZ = outZ
      lastN = cellNode(outX, outZ)
    } else if lstate == 1 {
      lost += 0.1
      if lost > 6 { lstate = 0  goal = random(0, ${NN - 1}) }
    }
    if lstate == 1 { sp = 6.3 }
    if blackout { sp = 8.4 }
    if can {
      onGraph = false
    } else {
      if not onGraph { ln = cellNode(bx, bz)  onGraph = true }
      let target = goal
      if lstate == 1 { target = lastN }
      let nx = nodes[ln][0]
      let nz = nodes[ln][1]
      tx = nx
      tz = nz
      if abs(bx - nx) + abs(bz - nz) < 0.7 {
        if ln == target {
          if lstate == 1 {
            // it is where it last saw you: walk right up to the spot, then give up
            tx = lastX
            tz = lastZ
            onGraph = false
            if abs(bx - lastX) + abs(bz - lastZ) < 1.2 and not blackout and not doomed { lstate = 0  goal = random(0, ${NN - 1}) }
          } else {
            goal = random(0, ${NN - 1})
          }
        } else {
          ln = hop[ln * ${NN} + target]
          tx = nodes[ln][0]
          tz = nodes[ln][1]
        }
      }
    }
  }
  let dx = tx - bx
  let dz = tz - bz
  let d = sqrt(dx * dx + dz * dz)
  if d > 0.05 {
    let k = min(d, sp * 0.1) / d
    for p in lurk { p.move(dx * k, 0, dz * k, 0.1) }
  }
  dx = px - bx
  dz = pz - bz
  d = sqrt(dx * dx + dz * dz)
  if not hidden and d < 1.7 { say("It got you.")  sound("die")  kill()  return }
  if hidden and doomed and abs(bx - outX) + abs(bz - outZ) < 2.6 { say("It watched you climb in.")  sound("die")  kill() }
}

// the mannequins (basement). They wake when they see you. After that they come for you whenever you are not
// looking at them, or whenever your torch is dead. They walk at 5 (through anything). Looked at, they are harmless.
every 0.1 {
  if level < 2 { return }
  let i = 0
  for m in men {
    let b = m[0]
    let dx = player.x - b.x
    let dz = player.z - b.z
    let d = sqrt(dx * dx + dz * dz)
    if not awake[i] {
      if d < 30 and sees(b, 30) { awake[i] = true }
    } else {
      let watched = torchOn and d < 60 and looking(b, 58) and sees(b, 60)
      if not watched {
        if d < 1.5 { say("You looked away.")  sound("die")  kill()  return }
        let k = min(d, 0.5) / d
        for p in m { p.move(dx * k, 0, dz * k, 0.1) }
      }
    }
    i += 1
  }
}

on die {
  if hidden { hideIn.solid(true)  speed(1)  jump(1)  hidden = false }
  doomed = false
  lstate = 0
  lost = 0
  grace = secs + 6
  if level == 1 {
    // it goes back to the far side of the building from where you wake up
    wait(0.1)
    let best = 0
    let bd = -1
    for c in [16, 18, 19, 21, 25] {
      let dx = nodes[c][0] - player.x
      let dz = nodes[c][1] - player.z
      if dx * dx + dz * dz > bd { bd = dx * dx + dz * dz  best = c }
    }
    lurkTo(nodes[best][0], nodes[best][1])
    ln = best
    onGraph = true
    goal = random(0, ${NN - 1})
    grace = secs + 6
  } else {
    if fin { lurkTo(${GREY_LIFT2[0]}, ${GREY_LIFT2[1]})  grace = secs + 3 }
    let i = 0
    for m in men {
      let dx = mhome[i][0] - m[0].x
      let dz = mhome[i][1] - m[0].z
      for p in m { p.move(dx, 0, dz) }
      awake[i] = false
      i += 1
    }
    if not torchOn { charge = 40  torchOn = true  ember.hide()  torch.show() }
    showTorch()
  }
}
`;

// the Lurker's map (its own script, so the big lists don't crowd the other one)
const mapScript = (t) => `// Greyscale's map for the Lurker. nodes: the spots it walks between. hop[a * ${NN} + b]: the next spot on the way
// from a to b. grid: the nearest spot (with nothing in the way) for every ${CELL} by ${CELL} square of floor 1.
nodes = ${JSON.stringify(GREY_NODES)}
hop = ${JSON.stringify(t.hop)}
grid = ${JSON.stringify(t.grid)}
`;
// does the straight line from a to b (on the floor plan) cross this box? (boxes: [x0, x1, z0, z1])
const crosses = (ax, az, bx, bz, r) => {
  let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax - r[0]], [dx, r[1] - ax], [-dz, az - r[2]], [dz, r[3] - az]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return false; continue; }
    const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
};
// what blocks the view at head height on floor 1 (walls, lockers, shelves, pillars)
export const greyBlockers = (parts) => parts.filter((q) => !q.nc && (q.t || 0) <= 0.45 && q.p[0] < 640 && q.p[1] - q.z[1] / 2 < G + 2.2 && q.p[1] + q.z[1] / 2 > G + 2.2 && !/^(SecDoor)$/.test(q.n || ''))
  .map((q) => [q.p[0] - q.z[0] / 2, q.p[0] + q.z[0] / 2, q.p[2] - q.z[2] / 2, q.p[2] + q.z[2] / 2]);
export const greyClear = (blockers, ax, az, bx, bz) => !blockers.some((r) => crosses(ax, az, bx, bz, r));
function tables(parts) {
  const B = greyBlockers(parts), D = GREY_NODES.map(() => GREY_NODES.map(() => Infinity)), hop = GREY_NODES.map((_, a) => GREY_NODES.map(() => a));
  for (let a = 0; a < NN; a++) D[a][a] = 0;
  for (const [a, b] of GREY_EDGES) { const d = Math.hypot(GREY_NODES[a][0] - GREY_NODES[b][0], GREY_NODES[a][1] - GREY_NODES[b][1]); D[a][b] = D[b][a] = d; hop[a][b] = b; hop[b][a] = a; }
  for (let k = 0; k < NN; k++) for (let a = 0; a < NN; a++) for (let b = 0; b < NN; b++) if (D[a][k] + D[k][b] < D[a][b] - 1e-9) { D[a][b] = D[a][k] + D[k][b]; hop[a][b] = hop[a][k]; }
  const grid = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = X0 + c * CELL + CELL / 2, z = Z0 + r * CELL + CELL / 2; let best = 0, bd = Infinity;
    GREY_NODES.forEach(([nx, nz], i) => { const d = Math.hypot(nx - x, nz - z) + (greyClear(B, x, z, nx, nz) ? 0 : 1000); if (d < bd) { bd = d; best = i; } });
    grid.push(best);
  }
  return { hop: hop.flat(), grid };
}

export function greyWorld() {
  const K = kit(31), { parts, box, cyl, ball, rnd, pick } = K;
  const WALL = '#8d9299', FLOOR = '#b9bdc4', DARKC = '#55595f', TRIM = '#3f4349';
  // a wall along x at depth z (from x0 to x1) with door gaps: [middle, width]; and the same along z. Every door gets a frame.
  const wallX = (z, x0, x1, gaps = [], hh = H, c = WALL, m = 'stone') => {
    let at = x0;
    for (const [mid, w] of [...gaps].sort((a, b) => a[0] - b[0])) {
      if (mid - w / 2 > at) box((at + mid - w / 2) / 2, G + hh / 2, z, mid - w / 2 - at, hh, T, c, m);
      box(mid, G + hh - 0.9, z, w, 1.8, T, c, m); at = mid + w / 2;
      for (const e of [-1, 1]) box(mid + e * (w / 2 - 0.12), G + (hh - 1.8) / 2, z, 0.24, hh - 1.8, T + 0.2, TRIM, 'metal', { nc: true });
      box(mid, G + hh - 1.9, z, w, 0.2, T + 0.2, TRIM, 'metal', { nc: true });
    }
    if (x1 > at) box((at + x1) / 2, G + hh / 2, z, x1 - at, hh, T, c, m);
  };
  const wallZ = (x, z0, z1, gaps = [], hh = H, c = WALL, m = 'stone') => {
    let at = z0;
    for (const [mid, w] of [...gaps].sort((a, b) => a[0] - b[0])) {
      if (mid - w / 2 > at) box(x, G + hh / 2, (at + mid - w / 2) / 2, T, hh, mid - w / 2 - at, c, m);
      box(x, G + hh - 0.9, mid, T, 1.8, w, c, m); at = mid + w / 2;
      for (const e of [-1, 1]) box(x, G + (hh - 1.8) / 2, mid + e * (w / 2 - 0.12), T + 0.2, hh - 1.8, 0.24, TRIM, 'metal', { nc: true });
      box(x, G + hh - 1.9, mid, T + 0.2, 0.2, w, TRIM, 'metal', { nc: true });
    }
    if (z1 > at) box(x, G + hh / 2, (at + z1) / 2, T, hh, z1 - at, c, m);
  };
  const note = (x, z, text, y = G) => { box(x, y + 0.5, z, 1.6, 1, 1.2, DARKC, 'wood'); box(x, y + 1.03, z, 0.6, 0.05, 0.8, '#f5f5f5', 'smooth', { n: 'Note', nc: true }); NOTES.push(text); };
  const NOTES = [];
  const cell = (x, z, y = G) => box(x, y + 0.35, z, 0.35, 0.7, 0.35, '#e8e8e8', 'neon', { n: 'Cell', g: 0.7, nc: true, lt: { r: 4, b: 0.5 } });

  /* ======================= floor 1: the offices ======================= */
  box((X0 + XW) / 2, G / 2, (Z0 + Z1) / 2, XW - X0 + 8, G, Z1 - Z0 + 8, FLOOR, 'stone');
  box((X0 + XW) / 2, G + H + 0.5, (Z0 + Z1) / 2, XW - X0 + 8, 1, Z1 - Z0 + 8, '#6f747b', 'smooth');
  box(500, G + 0.15, 508, 3, 0.3, 3, '#d9dde3', 'smooth', { k: 'spawn' });
  // floors that look different from room to room (thin, you walk over them)
  const rug = (x0, x1, z0, z1, c, m) => box((x0 + x1) / 2, G + 0.03, (z0 + z1) / 2, x1 - x0 - 0.8, 0.06, z1 - z0 - 0.8, c, m, { nc: true });
  rug(442.5, 557.5, 468.5, 531.5, '#d4d7dc', 'smooth'); for (const [x, z, w, d] of [[500, 472.5, 108, 0.5], [500, 527.5, 108, 0.5], [446.5, 500, 0.5, 55], [553.5, 500, 0.5, 55]]) box(x, G + 0.07, z, w, 0.02, d, '#6b6f76', 'smooth', { nc: true }); rug(X0, 476.5, Z0, 455.5, '#8f8a84', 'planks'); rug(X0, 476.5, 544.5, Z1, '#8f8a84', 'planks');
  rug(476.5, 523.5, Z0, 455.5, '#c9cdd3', 'diamond'); rug(523.5, X1, Z0, 455.5, '#7b8087', 'diamond'); rug(523.5, X1, 544.5, Z1, '#cfd3d8', 'smooth');
  rug(476.5, 523.5, 544.5, Z1, '#8a8d92', 'stone'); rug(X1, XW, 484, 516, '#d4d7dc', 'smooth'); rug(X1, XW, 440, 484, '#6f747b', 'diamond'); rug(X1, XW, 516, 560, '#5f646b', 'diamond');
  for (const z of [462, 538]) box(500, G + 0.035, z, 136, 0.07, 4, '#6b6f76', 'fabric', { nc: true });   // corridor runners
  for (const x of [436, 564]) box(x, G + 0.035, 500, 4, 0.07, 60, '#6b6f76', 'fabric', { nc: true });
  // the outside, and the east wing (lobby, Security, server room)
  wallX(Z0, X0, X1); wallX(Z1, X0, X1); wallZ(X0, Z0, Z1); wallZ(X1, Z0, Z1, [[500, 6]]);
  wallX(440, X1, XW); wallX(560, X1, XW); wallZ(XW, 440, 560); wallX(484, X1, XW, [[592, 5]]); wallX(516, X1, XW, [[592, 5]]);
  // rooms | north corridor | (west corridor, atrium, east corridor) | south corridor | rooms
  wallX(455.5, X0, X1, [[453, 5], [500, 5], [547, 5]]);
  wallX(468.5, X0, X1, [[436, 9], [500, 6], [564, 9]]);
  wallX(531.5, X0, X1, [[436, 9], [500, 6], [564, 9]]);
  wallX(544.5, X0, X1, [[453, 5], [500, 5], [547, 5]]);
  wallZ(442.5, 468.5, 531.5, [[500, 5]]); wallZ(557.5, 468.5, 531.5, [[500, 5]]);
  for (const x of [476.5, 523.5]) { wallZ(x, Z0, 455.5); wallZ(x, 544.5, Z1); }
  // the dead main lift fills the gap in the atrium's north wall; the service lift is at the end of the lobby
  box(500, G + 2.1, 468.5, 6, 4.2, 0.5, '#d0d4da', 'metal', { n: 'DeadLift' }); box(500, G + 2.1, 468.2, 0.12, 4.2, 0.56, '#3c3f44', 'metal', { nc: true });
  box(500, G + 4.8, 468.9, 2.4, 0.7, 0.2, '#4a4d52', 'smooth', { nc: true });
  box(XW - 0.5, G + 2.3, 500, 0.5, 4.6, 6, '#d0d4da', 'metal', { n: 'Lift' }); box(XW - 0.8, G + 2.3, 500, 0.12, 4.6, 0.14, '#3c3f44', 'metal', { nc: true });
  box(XW - 0.9, G + 5.1, 500, 0.2, 0.7, 2.4, '#f5f5f5', 'neon', { g: 0.8, nc: true, lt: { r: 9, b: 0.6 } });
  box(592, G + 2.1, 484, 5, 4.2, 0.4, '#4b4f55', 'metal', { n: 'SecDoor' });
  // the four dials on the lobby wall by the Security door
  [598.5, 601, 603.5, 606].forEach((x, i) => { cyl(x, G + 1.7, 484.55, 1.1, 0.3, 1.1, '#e2e5ea', 'metal', { n: 'Dial' + (i + 1), r: [90, 0, 0], nc: true }); box(x, G + 2.15, 484.75, 0.12, 0.4, 0.08, '#1d1f22', 'smooth', { nc: true }); });
  box(602.25, G + 1.7, 484.4, 9.6, 1.8, 0.16, '#2f3237', 'metal', { nc: true });

  /* ---- lamps (they go out in a blackout), lockers, breakers, numbers, notes ---- */
  const lamp = (x, z, r = 15, name = 'Lamp') => { box(x, G + H - 0.15, z, 1.6, 0.25, 0.6, '#f0f0f0', 'neon', { n: name, g: 0.9, nc: true, lt: { r, b: 0.9 } }); box(x, G + H - 0.02, z, 2, 0.1, 1, TRIM, 'metal', { nc: true }); };
  for (const x of [453, 500, 547]) { lamp(x, 462); lamp(x, 538); lamp(x, 438, 17); lamp(x, 562, 17); }
  for (const z of [485, 515]) { lamp(436, z, 12); lamp(564, z, 12); }
  lamp(480, 500, 20); lamp(520, 500, 20); lamp(592, 500, 16); lamp(592, 462, 15); lamp(592, 538, 14, 'BadLamp');
  // lockers stand flat against a wall (turn: the wall runs north-south)
  const locker = (x, z, turn = false) => { box(x, G + 1.6, z, turn ? 1.2 : 1.5, 3.2, turn ? 1.5 : 1.2, '#6b7078', 'metal', { n: 'Locker' }); box(x, G + 2.6, z, turn ? 1.26 : 0.9, 0.5, turn ? 0.9 : 1.26, '#3c3f44', 'metal', { nc: true }); };
  for (const x of [466, 534]) { locker(x, 456.4); locker(x, 543.6); }
  locker(443.4, 478, true); locker(556.6, 522, true); locker(430.9, 515, true); locker(569.1, 485, true);
  locker(432, 420.9); locker(521.5, 420.9); locker(568, 454.6); locker(432, 579.1); locker(478.5, 579.1); locker(568, 545.4);
  locker(580, 515.1); locker(612.9, 448, true); locker(612.9, 552, true);
  const breaker = (x, z, turn) => { box(x, G + 1.7, z, turn ? 0.3 : 1.1, 1.5, turn ? 1.1 : 0.3, '#2f3237', 'metal', { n: 'Breaker' }); box(x, G + 1.7, z, turn ? 0.2 : 1.5, 1.9, turn ? 1.5 : 0.2, '#6b7078', 'metal', { nc: true }); };
  breaker(500, 579.4); breaker(569.4, 432, true); breaker(430.6, 500, true);
  const num = (i, x, z) => { box(x, G + 0.55, z, 2.4, 1.1, 1.4, DARKC, 'wood'); box(x, G + 1.14, z, 0.9, 0.06, 0.6, '#ffffff', 'neon', { n: 'Num' + i, g: 0.6, nc: true, lt: { r: 4, b: 0.5 } }); };
  num(1, 437, 429); num(2, 438, 572); num(3, 563, 571); num(4, 606, 552);
  note(486, 524, 'Day 12. The color went first. Then the others.'); note(511, 446, 'It cannot see into the lockers. But if it watches you climb in, the locker will not save you.');
  note(542, 566, 'It only chases what it can see. Except when the lights go: then it just knows.'); note(608, 476, 'Basement: the things in the tanks only move when nobody looks at them. Keep your torch alive.');
  note(580, 532, 'The machine downstairs made the grey. Red, green and blue canisters. Somebody hid them.');
  box(600, G + 0.55, 452, 2.4, 1.1, 1.4, DARKC, 'wood'); box(600, G + 1.2, 452, 0.7, 0.1, 0.45, '#ffffff', 'neon', { n: 'LiftKey', g: 1, nc: true, lt: { r: 5, b: 0.6 } });
  cell(516, 432.4, G + 1.5); cell(584, 446);
  // the torch you carry (a strong one, and the ember that is left when the cell is dead), what you carry, and the Lurker
  box(500, G + 3, 505, 0.2, 0.2, 0.2, '#f5f5f5', 'smooth', { n: 'Torch', nc: true, t: 1, lt: { r: 17, b: 1.25 } });
  box(500, G + 3, 506, 0.2, 0.2, 0.2, '#f5f5f5', 'smooth', { n: 'Ember', nc: true, t: 1, lt: { r: 5, b: 0.45 } });
  cyl(500, G + 40, 300, 0.6, 1, 0.6, '#d9dde3', 'metal', { n: 'Carry', nc: true });
  const [lx, lz] = GREY_NODES[HOME];
  box(lx, G + 1.9, lz, 1.5, 3.8, 1.1, '#0e0e11', 'fabric', { n: 'LurkBody', nc: true });
  box(lx, G + 4.3, lz, 1.2, 1.2, 1.2, '#0e0e11', 'fabric', { n: 'Lurker', nc: true });
  for (const s of [-0.28, 0.28]) for (const f of [-0.62, 0.62]) { box(lx + s, G + 4.45, lz + f, 0.22, 0.14, 0.06, '#ffffff', 'neon', { n: 'Lurker', g: 1, nc: true }); box(lx + f, G + 4.45, lz + s, 0.06, 0.14, 0.22, '#ffffff', 'neon', { n: 'Lurker', g: 1, nc: true }); }
  box(lx, G + 4.4, lz, 0.3, 0.3, 0.3, '#ffffff', 'smooth', { n: 'Lurker', nc: true, t: 1, lt: { r: 7, b: 0.7 } });
  for (const s of [-1, 1]) { box(lx + s * 1.0, G + 2.3, lz, 0.35, 3, 0.4, '#0e0e11', 'fabric', { n: 'Lurker', nc: true }); box(lx + s * 1.0, G + 0.7, lz + 0.2, 0.5, 0.25, 0.7, '#0e0e11', 'fabric', { n: 'Lurker', nc: true }); }

  /* ---- furniture (kept away from the doors and the middle of the rooms, so there is always a clear way through) ---- */
  const shelf = (x, z, w, d) => { box(x, G + 2, z, w, 4, d, DARKC, 'wood'); for (let i = 0; i < 3; i++) box(x, G + 0.9 + i * 1.2, z, w + 0.1, 0.12, d + 0.1, '#7d8289', 'wood', { nc: true }); };
  const desk = (x, z, turn = 0) => { box(x, G + 0.6, z, 3.4, 1.2, 1.8, DARKC, 'wood'); box(x - 0.6, G + 1.65, z, 1.1, 0.8, 0.12, '#1d1f22', 'smooth', { nc: true, r: [0, turn, 0] }); box(x - 0.6, G + 1.65, z + 0.07, 0.95, 0.65, 0.04, '#dfe6ee', 'neon', { nc: true, g: 0.35, r: [0, turn, 0] }); box(x + 0.6, G + 0.5, z + 2.4, 1, 1, 1, '#6b7078', 'fabric'); };
  const plant = (x, z) => { cyl(x, G + 0.5, z, 1.1, 1, 1.1, '#5f646b', 'stone'); ball(x, G + 1.9, z, 2, '#7d8289', 'grass', { nc: true }); };
  const stain = (x, z, s) => cyl(x, G + 0.07, z, s, 0.02, s * rnd(0.6, 1), '#17181b', 'smooth', { nc: true, r: [0, rnd(0, 180), 0] });
  for (const z of [424, 430]) for (const x of [446, 460, 470]) shelf(x, z, 6, 1.4);            // the archive
  for (const x of [484, 492, 508, 516]) { box(x, G + 0.75, 430, 3.2, 1.5, 6, '#9aa0a8', 'metal'); cyl(x, G + 1.9, 430, 0.8, 0.8, 0.8, '#c9cdd3', 'glass', { t: 0.5, nc: true }); } // the lab
  for (const x of [530, 537, 556]) { box(x, G + 2.2, 424, 3, 4.4, 3, '#4b4f55', 'metal'); cyl(x, G + 4.8, 424, 1, 0.8, 1, '#7d8289', 'metal', { nc: true }); box(x, G + 2.6, 425.55, 1.6, 0.8, 0.06, '#c9ffd9', 'neon', { nc: true, g: 0.4 }); } // the power room
  for (const x of [446, 458, 468]) desk(x, 566);                                              // the office
  for (let i = 0; i < 16; i++) { const x = rnd(481, 519), z = rnd(566, 576); if (Math.abs(x - 500) < 4) continue; const s = rnd(1.4, 2.6); box(x, G + s / 2, z, s, s, s, pick(['#7d8289', '#6b7078', '#8d9299']), 'planks', { r: [0, rnd(0, 40), 0] }); } // storage
  for (const x of [530, 540, 550]) { box(x, G + 0.5, 574, 2.4, 0.5, 5, '#9aa0a8', 'metal'); box(x, G + 0.95, 574.5, 2.2, 0.4, 3.6, '#e2e5ea', 'fabric', { nc: true }); box(x, G + 1.2, 576.2, 1.6, 0.3, 0.9, '#f5f5f5', 'fabric', { nc: true }); cyl(x + 1.6, G + 1.6, 577.5, 0.12, 3.2, 0.12, '#c9cdd3', 'metal', { nc: true }); } // the ward
  for (const [x, z] of [[470, 480], [530, 480], [470, 522], [530, 522]]) { cyl(x, G + H / 2, z, 1.6, H, 1.6, '#9aa0a8', 'marble'); cyl(x, G + 0.3, z, 2.2, 0.6, 2.2, '#7d8289', 'marble', { nc: true }); } // atrium pillars
  box(500, G + 0.5, 488, 9, 1, 2.2, DARKC, 'wood'); box(500, G + 1.1, 488, 9.4, 0.2, 2.6, '#c9cdd3', 'marble', { nc: true }); // the front desk
  for (const [x, z] of [[448, 474], [552, 474], [448, 526], [552, 526], [576, 489], [576, 511]]) plant(x, z);
  for (const x of [462, 538]) { box(x, G + 0.45, 500, 1.6, 0.9, 6, '#6b7078', 'fabric'); box(x + (x < 500 ? -0.6 : 0.6), G + 1.2, 500, 0.4, 0.8, 6, '#6b7078', 'fabric', { nc: true }); }  // benches
  for (const z of [459, 541]) for (let x = 440; x < 565; x += 26) cyl(x, G + H - 0.9, z + (z < 500 ? -1.6 : 1.6), 0.5, 22, 0.5, '#5e6268', 'metal', { r: [0, 0, 90], nc: true }); // pipes
  for (const [x, z, s] of [[452, 464, 3], [512, 536, 4], [561, 480, 2.6], [489, 505, 5], [437, 520, 3], [541, 449, 4], [590, 506, 3.4], [470, 560, 3]]) stain(x, z, s);
  for (let i = 0; i < 5; i++) stain(466 + i * 1.3, 458.6 - i * 0.4, 0.9);                      // drag marks into a locker
  // pairs of white marks on the walls. Paint. Probably.
  for (const [x, z, ax] of [[430.4, 470, 0], [569.6, 530, 0], [500, 544.9, 1], [476.9, 440, 0], [613.6, 540, 0], [460, 455.1, 1]]) for (const s of [-0.28, 0.28]) box(x + (ax ? s : 0), G + 4.45, z + (ax ? 0 : s), ax ? 0.22 : 0.06, 0.14, ax ? 0.06 : 0.22, '#e9e9e9', 'neon', { nc: true, g: 0.5 });
  // the server room and Security
  for (const x of [578, 586, 598, 606]) { box(x, G + 2.2, 546, 2.4, 4.4, 5, '#2f3237', 'metal'); for (let k = 0; k < 4; k++) box(x - 1.22, G + 1 + k * 0.9, 546, 0.04, 0.12, 3.6, '#e9e9e9', 'neon', { nc: true, g: 0.5 }); }
  desk(580, 448); box(606, G + 1.5, 444, 8, 3, 1.2, '#4b4f55', 'metal'); for (let k = 0; k < 3; k++) box(603.5 + k * 2.5, G + 2.1, 444.65, 1.8, 1.2, 0.06, '#dfe6ee', 'neon', { nc: true, g: 0.3 });

  /* ======================= floor 2: the basement ======================= */
  const BW = '#5d6168', BF = '#4a4d52';
  box(882, G / 2, 500, 372, G, 208, BF, 'stone'); box(882, G + H2 + 0.5, 500, 372, 1, 208, '#3a3d42', 'smooth');
  const w2x = (z, x0, x1, gaps) => wallX(z, x0, x1, gaps, H2, BW, 'brick'), w2z = (x, z0, z1, gaps) => wallZ(x, z0, z1, gaps, H2, BW, 'brick');
  w2x(488, 706, 730); w2x(512, 706, 730); w2z(706, 488, 512);                                   // the lift room
  w2z(730, 460, 540, [[500, 6]]); w2z(830, 460, 540, [[500, 8]]); w2x(460, 730, 830, [[780, 8]]); w2x(540, 730, 830, [[780, 8]]); // the machine hall
  w2z(740, 404, 460); w2z(820, 404, 460); w2x(404, 740, 820);                                   // cold storage (north)
  w2z(740, 540, 596); w2z(820, 540, 596); w2x(596, 740, 820);                                   // the stacks (south)
  w2x(460, 830, 896); w2x(540, 830, 896); w2z(896, 460, 540, [[500, 8]]);                       // the tank room (east)
  w2x(492, 896, 1060); w2x(508, 896, 1060); w2z(1060, 492, 508);                                // the tunnel
  box(896, G + 2.6, 500, 0.7, 5.2, 8, '#2f3237', 'metal', { n: 'Shutter' });
  box(707, G + 2.3, 500, 0.5, 4.6, 6, '#d0d4da', 'metal'); cell(712, 492);
  // the machine: a fat drum with three empty tubes, pipes into the ceiling
  const [mx, mz] = GREY_MACHINE;
  cyl(mx, G + 2.2, mz, 9, 4.4, 9, '#6b7078', 'metal', { n: 'Machine' }); cyl(mx, G + 4.9, mz, 6, 1, 6, '#3c3f44', 'metal', { nc: true }); cyl(mx, G + 6.2, mz, 2, 1.8, 2, '#5e6268', 'metal', { nc: true });
  [['TubeR', 0], ['TubeG', 120], ['TubeB', 240]].forEach(([n, a]) => { const x = mx + Math.sin(a * Math.PI / 180) * 5.4, z = mz - Math.cos(a * Math.PI / 180) * 5.4; cyl(x, G + 2, z, 1.3, 4, 1.3, '#d9dde3', 'glass', { n, t: 0.35, nc: true, lt: { r: 6, b: 0.35 } }); cyl(x, G + 0.2, z, 1.7, 0.4, 1.7, '#3c3f44', 'metal', { nc: true }); });
  for (const [x, z] of [[750, 475], [810, 475], [750, 525], [810, 525]]) box(x, G + H2 / 2, z, 2.2, H2, 2.2, '#565a60', 'brick');
  for (const [x, z, s] of [[760, 490, 5], [800, 512, 6], [770, 530, 4], [742, 505, 3]]) cyl(x, G + 0.06, z, s, 0.04, s * 0.7, '#25272b', 'smooth', { nc: true });
  for (const [x, z] of [[736, 466], [824, 534], [824, 466]]) { box(x, G + 0.9, z, 1.8, 1.8, 1.8, '#5e5a52', 'planks'); box(x + 0.4, G + 2.3, z - 0.3, 1.2, 1, 1.2, '#6b665d', 'planks', { nc: true }); }
  cell(736, 534); note(744, 512, 'They wake when they see you. After that: eyes on them, or run. Never both hands full of dark.');
  // cold storage: four long freezers. The blue canister is at the far end.
  for (const x of [752, 766, 794, 808]) { box(x, G + 1.7, 432, 3, 3.4, 40, '#9aa0a8', 'metal'); box(x, G + 3.45, 432, 3.2, 0.1, 40.2, '#d9dde3', 'ice', { nc: true }); }
  cyl(780, G + 0.7, 409, 1.2, 1.4, 1.2, '#cfd6e6', 'metal', { n: 'CanB' }); cell(815, 452); box(780, G + 0.05, 432, 20, 0.06, 44, '#aeb4bd', 'ice', { nc: true });
  // the stacks: shelves right across, with the way through at one end, then the other
  [[552, 740, 808], [564, 752, 820], [576, 740, 808]].forEach(([z, x0, x1]) => { box((x0 + x1) / 2, G + 2.4, z, x1 - x0, 4.8, 1.6, '#4c4a45', 'wood'); for (let k = 0; k < 3; k++) box((x0 + x1) / 2, G + 1 + k * 1.4, z, x1 - x0 + 0.1, 0.12, 1.8, '#6d6a63', 'wood', { nc: true }); });
  cyl(746, G + 0.7, 589, 1.2, 1.4, 1.2, '#e6cfcf', 'metal', { n: 'CanR' }); cell(816, 546);
  // the tank room: glass tanks in rows (some with something standing in them). The green canister is in the corner.
  for (const x of [845, 860, 875]) for (const z of [472, 486, 514, 528]) { cyl(x, G + 2.6, z, 4, 5.2, 4, '#c9d6d2', 'glass', { t: 0.6 }); cyl(x, G + 0.25, z, 4.6, 0.5, 4.6, '#3c3f44', 'metal', { nc: true }); cyl(x, G + 5.4, z, 4.6, 0.5, 4.6, '#3c3f44', 'metal', { nc: true }); if ((x + z) % 3 === 0) { box(x, G + 2, z, 0.8, 2.2, 0.5, '#b9bdc4', 'smooth', { nc: true }); ball(x, G + 3.5, z, 0.8, '#b9bdc4', 'smooth', { nc: true }); } }
  cyl(889, G + 0.7, 466, 1.2, 1.4, 1.2, '#cfe6d2', 'metal', { n: 'CanG' }); cell(836, 534);
  // the tunnel: junk to run around, alarm lamps (they come on at the end), and the way out
  for (const [x, z] of [[916, 496], [930, 504.5], [958, 495.5], [972, 503], [1002, 496.5], [1014, 504], [1040, 497]]) box(x, G + 1, z, 2.4, 2, 3.4, '#5e5a52', 'planks', { r: [0, rnd(-12, 12), 0] });
  for (let x = 905; x < 1056; x += 22) box(x, G + H2 - 0.2, 500, 0.8, 0.3, 0.8, '#ff3b3b', 'neon', { n: 'Alarm', g: 1, nc: true, lt: { r: 13, b: 0.9 } });
  for (const [x, z] of [[780, 470], [780, 530], [760, 500], [863, 500], [840, 470]]) box(x, G + H2 - 0.2, z, 0.8, 0.3, 0.8, '#ff3b3b', 'neon', { n: 'Alarm', g: 1, nc: true, lt: { r: 14, b: 0.9 } });
  box(1056, G + 3, 500, 0.6, 6, 15, '#5fc76b', 'neon', { k: 'goal', g: 0.8, t: 0.5, nc: true, lt: { r: 12, b: 0.8 } });
  // the mannequins: each is a handful of parts with one name, so the script can walk it
  GREY_MEN.forEach(([x, z], i) => {
    const n = 'Man' + (i + 1), c = '#c4c7cc';
    box(x, G + 2.05, z, 1, 1.5, 0.55, c, 'smooth', { n, nc: true }); ball(x, G + 3.25, z, 0.85, c, 'smooth', { n, nc: true });
    for (const s of [-0.26, 0.26]) box(x + s, G + 0.65, z, 0.36, 1.3, 0.4, c, 'smooth', { n, nc: true });
    for (const s of [-0.68, 0.68]) box(x + s, G + 2.0, z, 0.26, 1.5, 0.3, c, 'smooth', { n, nc: true });
  });
  return { v: 2, engine: 2, n: 'Greyscale', mode: 'obby', sky: 'night', parts, scripts: (() => { const t = tables(parts); return [{ n: 'Map', src: mapScript(t) }, { n: 'Greyscale', src: script({ notes: NOTES }) }]; })() };
}
