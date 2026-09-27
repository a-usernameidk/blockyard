// Tycoon: your own town that makes real coins. Everyone gets their own (it lives in your private server).
// There's one money: your real coins. You spend coins on buildings, and the buildings make more coins:
//   Houses       bring people (5 per level). People work in the other buildings and pay taxes.
//   Gold mine    your workers dig gold and carry it to the factories.
//   Factories    turn that gold into coins (1 gold = 1 coin), as much as they can handle.
//   Car factory  builds cars and sells them (you see them drive around).
//   Grocery shop your people buy food there (more people = more customers).
//   Town Hall    you're the government: every person pays taxes each hour.
// Buildings need workers. If there are more jobs than people, everything runs slower, so build houses too.
// Coins pile up in the Vault; step on the gold pad to collect them. Up to TY.dailyCap coins a day.
// The server (src/tycoon.js) and the game (play3d.js) both use this file, so the math always matches.

export const TY = {
  dailyCap: 2000,    // most coins you can collect from your Tycoon in one day (UTC)
  offlineHours: 12,  // your town keeps working while you're away, up to this long
  perHouse: 5,       // people per house level
  goldPerMine: 40,   // gold per hour for each mine level (with every job filled)
  factoryGold: 25,   // gold each factory level can turn into coins per hour
  perCar: 18,        // coins per hour for each car factory level
  perShop: 20,       // most coins per hour a shop level can take
  spend: 2,          // coins each person spends at the shops per hour
};
export const TAX = [0, 0.5, 1, 1.5, 2, 2.5];      // taxes per person per hour, by Town Hall level
export const VAULT_CAP = [0, 150, 400, 900, 1600, 2500];
export const JOBS = { mine: 2, factory: 2, car: 3, shop: 2, house: 0, hall: 0, vault: 0 }; // workers needed per level
export const KINDS = {
  house: { name: 'House', color: 7 }, factory: { name: 'Factory', color: 5 }, car: { name: 'Car factory', color: 9 },
  shop: { name: 'Grocery shop', color: 11 }, hall: { name: 'Town Hall', color: 10 }, vault: { name: 'Vault', color: 13 }, mine: { name: 'Gold mine', color: 12 },
};

// Every lot in town. pad = the glowing pad on the road in front of it. x0/z0 = the corner of its 7 x 7 space (13 x 13 for the mine).
const L = (id, kind, i, name, max, x0, z0, w = 7) => ({ id, kind, i, name, max, x0, z0, w, pad: [x0 < 64 ? 61 : 67, 0, z0 + 3] });
export const SPOTS = [
  L('hall', 'hall', 0, 'Town Hall', 5, 51, 20),
  ...[30, 40, 50, 60, 70, 80].map((z0, i) => L('h' + i, 'house', i, `House ${i + 1}`, 3, 51, z0)),
  L('vault', 'vault', 0, 'Vault', 5, 70, 20),
  L('f0', 'factory', 0, 'Factory 1', 5, 70, 30), L('f1', 'factory', 1, 'Factory 2', 5, 70, 40),
  L('c0', 'car', 0, 'Car factory 1', 5, 70, 50), L('c1', 'car', 1, 'Car factory 2', 5, 70, 60),
  L('s0', 'shop', 0, 'Grocery shop 1', 5, 70, 70), L('s1', 'shop', 1, 'Grocery shop 2', 5, 70, 80),
  { id: 'mine', kind: 'mine', i: 0, name: 'Gold mine', max: 5, x0: 58, z0: 92, w: 13, pad: [64, 0, 90] },
];
export const spot = (id) => SPOTS.find((s) => s.id === id) || null;
export const padColor = (s) => KINDS[s.kind].color;
export const COLLECT_PAD = [67, 0, 27]; // step here to collect the coins in your vault
export const START = { h0: 1, mine: 1, f0: 1, vault: 1 }; // free to start with

export function newTycoon(now = Date.now()) { return { v: 2, b: { ...START }, vault: 0, t: now }; }
// Cleans a saved town (from the database) so bad data can't do anything. (Towns from the first version start over.)
export function cleanTycoon(s, now = Date.now()) {
  if (!s || typeof s !== 'object' || s.v !== 2 || !s.b || typeof s.b !== 'object') return newTycoon(now);
  const b = {};
  for (const sp of SPOTS) { const l = Math.floor(Number(s.b[sp.id]) || 0); if (l > 0) b[sp.id] = Math.min(sp.max, l); }
  for (const [k, l] of Object.entries(START)) b[k] = Math.max(l, b[k] || 0);
  const vault = Number(s.vault);
  return { v: 2, b, vault: Number.isFinite(vault) && vault > 0 ? vault : 0, t: Number.isFinite(Number(s.t)) ? Math.min(Number(s.t), now) : now };
}

// Everything your town makes per hour, and where it comes from.
export function stats(s) {
  const lv = (id) => s.b[id] || 0;
  const sum = (kind) => SPOTS.filter((x) => x.kind === kind).reduce((n, x) => n + lv(x.id), 0);
  const people = TY.perHouse * sum('house');
  const jobs = SPOTS.reduce((n, x) => n + JOBS[x.kind] * lv(x.id), 0);
  const staff = jobs ? Math.min(1, people / jobs) : 1; // how full the jobs are (1 = every job filled)
  const gold = TY.goldPerMine * lv('mine') * staff;
  const factory = Math.min(gold, TY.factoryGold * sum('factory') * staff);
  const cars = TY.perCar * sum('car') * staff;
  const shops = Math.min(people * TY.spend, TY.perShop * sum('shop')) * staff;
  const taxes = people * TAX[lv('hall')];
  const coinsPerHour = factory + cars + shops + taxes;
  return { people, jobs, staff, gold, income: { factory, cars, shops, taxes }, coinsPerHour, vaultCap: VAULT_CAP[lv('vault')], cars: sum('car') };
}
// Moves the town forward to `now`: everything fills the vault (up to its size).
export function advance(s, now) {
  const dt = Math.max(0, Math.min(now - s.t, TY.offlineHours * 3600e3)) / 3600e3;
  const st = stats(s);
  s.vault = Math.min(st.vaultCap, s.vault + st.coinsPerHour * dt);
  s.t = Math.max(s.t, now);
  return s;
}

// What the next level of a lot costs in coins.
const BASE = { house: 30, factory: 80, car: 250, shop: 150, hall: 200, mine: 120, vault: 80 };
const GROW = 2.2, SPOT_MULT = 1.6;
export function costOf(sp, level) {
  if (level > sp.max) return null;
  const skip = START[sp.id] ? 1 : 0; // lots you start with: their level 2 is the first thing you pay for
  return Math.round(BASE[sp.kind] * GROW ** (level - 1 - skip) * SPOT_MULT ** sp.i);
}
// { level: next level, cost, locked: why } or null when it's maxed out
export function nextOf(s, id) {
  const sp = spot(id);
  if (!sp) return null;
  const level = (s.b[id] || 0) + 1;
  if (level > sp.max) return null;
  let locked = '';
  if (level === 1 && sp.i > 0) { const prev = SPOTS.find((x) => x.kind === sp.kind && x.i === sp.i - 1); if (!s.b[prev.id]) locked = `Build ${prev.name} first`; }
  return { level, cost: costOf(sp, level), locked };
}
// Upgrades a lot (the server takes the coins). Returns an error message, or '' when it worked.
export function buy(s, id) {
  const n = nextOf(s, id);
  if (!n) return spot(id) ? "That's as big as it gets!" : 'Unknown building.';
  if (n.locked) return n.locked + '.';
  s.b[id] = n.level;
  return '';
}

/* ---------------- what the buildings look like (blocks) ---------------- */
// Block type numbers are passed in (B from world.js) so this file stays small.
// Returns [[x, y, z, type, color], ...] for a lot at a level (0 = empty lot). The door faces the road.
export function spotCells(sp, level, B) {
  const out = [];
  if (!level) return out;
  const left = sp.x0 < 64; // lots on the left of the road face east, on the right they face west
  const put = (x, y, z, t, c = 0) => out.push([sp.x0 + (left || sp.kind === 'mine' ? x : 6 - x), y, sp.z0 + z, t, c]);
  const box = (x0, y0, z0, x1, y1, z1, t, c) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) put(x, y, z, t, c); };
  const walls = (x0, z0, x1, z1, y0, y1, t, c) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (x === x0 || x === x1 || z === z0 || z === z1) put(x, y, z, t, c); };
  const door = (x, h = 2) => { for (let y = 1; y <= h; y++) put(x, y, 3, 0, 0); };
  const k = sp.kind;
  if (k === 'house') {
    const a = level === 1 ? 1 : 0, b2 = level === 1 ? 5 : 6, h = level === 3 ? 6 : 3;
    walls(a, a, b2, b2, 1, h, level === 1 ? B.wood : B.brick, 0);
    box(a, h + 1, a, b2, h + 1, b2, B.plastic, [4, 9, 11][level - 1]);
    for (let z = a + 1; z < b2; z += 2) { put(a, 2, z, B.glass, 14); if (level === 3) put(a, 5, z, B.glass, 14); }
    door(b2);
  } else if (k === 'factory') {
    const big = level >= 3, a = big ? 0 : 1, b2 = big ? 6 : 5, h = 1 + level;
    walls(a, a, b2, b2, 1, h, B.metal, 0);
    box(a, h + 1, a, b2, h + 1, b2, B.plastic, 5);
    for (let y = 2; y <= h; y += 2) put(a, y, 3, B.glass, 6);
    box(a + 1, h + 2, a + 1, a + 1, h + 2 + level, a + 1, B.brick, 0);
    put(a + 1, h + 3 + level, a + 1, B.lava, 0); // the chimney glows while it works
    door(b2);
  } else if (k === 'car') {
    const h = 2 + Math.ceil(level / 2);
    walls(0, 0, 6, 6, 1, h, B.metal, 0);
    box(0, h + 1, 0, 6, h + 1, 6, B.plastic, 9);
    for (let z = 2; z <= 4; z++) for (let y = 1; y <= 2; y++) put(6, y, z, 0, 0); // a big garage door
    for (let i = 0; i < level; i++) put(1 + (i % 3) * 2, h + 2, 1 + Math.floor(i / 3) * 4, B.neon, 9); // roof lights, one per level
  } else if (k === 'shop') {
    const h = 2 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0);
    walls(1, 0, 6, 6, 1, h, B.brick, 0);
    box(1, h + 1, 0, 6, h + 1, 6, B.plastic, 13);
    for (let z = 0; z <= 6; z++) put(6, h + 1, z, B.plastic, z % 2 ? 11 : 0); // a striped awning along the front
    for (let z = 1; z <= 5; z += 2) put(6, 2, z, B.glass, 14);
    for (let i = 0; i < level; i++) put(2 + (i % 3), 1, 2 + Math.floor(i / 3), B.plastic, [7, 6, 4, 5, 11][i]); // food crates inside
    door(6);
  } else if (k === 'hall') {
    const h = 3 + level;
    walls(1, 1, 5, 5, 1, h, B.stone, 0);
    for (const [x, z] of [[6, 1], [6, 5], [6, 3]]) if (z !== 3) box(x, 1, z, x, h, z, B.plastic, 0); // columns out front
    box(1, h + 1, 0, 6, h + 1, 6, B.plastic, 10);
    box(3, h + 2, 3, 3, h + 3 + level, 3, B.metal, 0); // a flag pole that grows with your government
    box(3, h + 2 + level, 4, 3, h + 3 + level, 5, B.plastic, 4);
    door(5, 3);
  } else if (k === 'vault') {
    const h = 1 + level;
    walls(0, 0, 6, 6, 1, h, B.stone, 0);
    for (const [x, z] of [[0, 0], [6, 0], [0, 6], [6, 6]]) box(x, 1, z, x, h + 1, z, B.plastic, 13);
    box(0, h + 1, 0, 6, h + 1, 6, B.plastic, 6);
    box(2, h + 2, 2, 4, h + 1 + Math.ceil(level / 2), 4, B.neon, 6); // a pile of gold on the roof
    door(6);
  } else {
    // the mine: a rocky hill with gold in it and an entrance on the south side
    const r = 2 + level, hh = 1 + level * 2;
    for (let y = 1; y <= hh; y++) { const rr = Math.round(r * (1 - (y - 1) / (hh + 1))); box(6 - rr, y, 6 - rr, 6 + rr, y, 6 + rr, B.stone, 0); }
    for (let n = 0; n < 4 + level * 3; n++) { const a = n * 2.4, y = 1 + (n % hh), rr = Math.max(1, Math.round(r * (1 - (y - 1) / (hh + 1)))); put(6 + Math.round(Math.cos(a) * rr), y, 6 + Math.round(Math.sin(a) * rr), B.neon, 6); }
    const d = 6 - r;
    for (let z = d; z <= 6; z++) for (let x = 5; x <= 7; x++) { put(x, 1, z, 0, 0); put(x, 2, z, 0, 0); }
    box(4, 1, d, 4, 3, d, B.wood, 0); box(8, 1, d, 8, 3, d, B.wood, 0); box(4, 3, d, 8, 3, d, B.wood, 0);
  }
  // the last write for a cell wins (so doors and the mine entrance are carved out after the walls)
  const last = new Map();
  for (const c of out) last.set(c[0] + ',' + c[1] + ',' + c[2], c);
  return [...last.values()];
}
// All the cells a lot could ever use (so the game can clear it before drawing the new level).
export function spotBox(sp) { return [sp.x0, 1, sp.z0, sp.x0 + sp.w - 1, 24, sp.z0 + sp.w - 1]; }
const door = (sp) => [sp.x0 < 64 ? sp.x0 + 7.5 : sp.x0 - 0.5, 1, sp.z0 + 3.5];

// Where people walk. Miners carry gold from the mine to a factory. Other workers go to their job,
// and everyone stops at a shop now and then. Returns { pts, carry } (carry: which parts they hold gold).
export function workerPath(s, k) {
  const has = (kind) => SPOTS.filter((x) => x.kind === kind && s.b[x.id]);
  const houses = has('house');
  if (!houses.length) return null;
  const h = houses[k % houses.length], lane = 63 + (k % 3) + 0.5, home = door(h);
  const road = (z) => [lane, 1, z];
  const facs = has('factory'), cars = has('car'), shops = has('shop');
  const pts = [home, road(home[2])];
  let carry = null;
  if (k % 3 !== 2 && facs.length) { // a miner: dig at the mine, carry the gold to a factory
    const f = facs[k % facs.length];
    pts.push(road(90.5), [64.5, 1, 91.5], road(90.5));
    carry = [pts.length - 1, pts.length + 1];
    pts.push(road(f.z0 + 3.5), door(f), road(f.z0 + 3.5));
  } else if (cars.length) { const c = cars[k % cars.length]; pts.push(road(c.z0 + 3.5), door(c), road(c.z0 + 3.5)); }
  if (shops.length) { const sh = shops[k % shops.length]; pts.push(road(sh.z0 + 3.5), door(sh), road(sh.z0 + 3.5)); }
  pts.push(road(home[2]), home);
  return { pts, carry };
}
