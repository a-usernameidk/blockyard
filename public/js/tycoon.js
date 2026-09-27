// Tycoon: your own town that makes real coins, and you're its government. Everyone gets their own (solo).
// One money: your real coins. You spend coins on buildings, and the buildings make more coins:
//   Houses bring people (5 per level). People work in the other buildings, shop, and pay taxes.
//   Gold mine -> Factories (turn gold into coins), Car factories, Grocery shops, and later a Stadium, Bank, Airport.
//   Town Hall: taxes. You pick the tax rate: high taxes make coins but people get unhappy.
// Government: three meters. Happiness (people move in, everything works better), Crime (slows everything down)
// and Corruption (how shady you are). Decisions pop up (bribes, protests, festivals, elections...) and you pick:
// corrupt choices give quick coins but raise crime and unhappiness; good choices are slower but the town grows.
// Court: with a Police station, crimes come in and you're the judge: guilty (fine or jail), not guilty, or take a bribe.
// Grow from a Village to a Town, City, Big City and finally a Country. Each step unlocks a new part of the map.
// Coins pile up in the Vault; step on the gold pad to collect them. Up to TY.dailyCap coins a day.
// The server (src/tycoon.js) and the game (play3d.js) both use this file, so the math always matches.
// Only the server makes decisions and court cases (advance with { events: true }).

export const TY = {
  dailyCap: 2000,    // most coins you can collect from your Tycoon in one day (UTC)
  offlineHours: 12,  // your town keeps working while you're away, up to this long
  perHouse: 5,       // people per house level
  goldPerMine: 40,   // gold per hour for each mine level (with every job filled)
  factoryGold: 25,   // gold each factory level can turn into coins per hour
  perCar: 18,        // coins per hour for each car factory level
  perShop: 20,       // most coins per hour a shop level can take
  spend: 2,          // coins each person spends at the shops per hour
  eventEvery: 45,    // minutes between decisions
  caseEvery: 30,     // minutes between court cases (once you have a Police station)
  maxWaiting: 3,     // decisions (and cases) that can wait for you at once
};
export const TAX = [0, 0.5, 1, 1.5, 2, 2.5];                 // taxes per person per hour, by Town Hall level
export const TAX_RATES = [
  { name: 'Very low', mult: 0.4, happy: 20 }, { name: 'Low', mult: 0.7, happy: 10 }, { name: 'Normal', mult: 1, happy: 0 },
  { name: 'High', mult: 1.5, happy: -12 }, { name: 'Very high', mult: 2.2, happy: -25 },
];
export const VAULT_CAP = [0, 150, 400, 900, 1600, 2500];
export const STAGES = [null,
  { name: 'Village', leader: 'Mayor', need: {} },
  { name: 'Town', leader: 'Mayor', need: { people: 25, hall: 1 } },
  { name: 'City', leader: 'Mayor', need: { people: 60, police: 1, school: 1 } },
  { name: 'Big City', leader: 'Governor', need: { people: 100, court: 1, hospital: 1 } },
  { name: 'Country', leader: 'President', need: { people: 140, capitol: 1, airport: 1 } },
];
// every kind of building: name, lot color, workers needed per level, most levels, first cost
export const KINDS = {
  house: { name: 'House', color: 7, jobs: 0, max: 3, cost: 30 },
  factory: { name: 'Factory', color: 5, jobs: 2, max: 5, cost: 80 },
  car: { name: 'Car factory', color: 9, jobs: 3, max: 5, cost: 250 },
  shop: { name: 'Grocery shop', color: 11, jobs: 2, max: 5, cost: 150 },
  hall: { name: 'Town Hall', color: 10, jobs: 0, max: 5, cost: 200 },
  vault: { name: 'Vault', color: 13, jobs: 0, max: 5, cost: 80 },
  mine: { name: 'Gold mine', color: 12, jobs: 2, max: 5, cost: 120 },
  police: { name: 'Police station', color: 3, jobs: 2, max: 5, cost: 400 },
  school: { name: 'School', color: 6, jobs: 2, max: 3, cost: 350 },
  park: { name: 'Park', color: 15, jobs: 0, max: 3, cost: 250 },
  court: { name: 'Court', color: 1, jobs: 2, max: 3, cost: 900 },
  jail: { name: 'Jail', color: 2, jobs: 1, max: 3, cost: 700 },
  hospital: { name: 'Hospital', color: 0, jobs: 3, max: 3, cost: 1000 },
  stadium: { name: 'Stadium', color: 4, jobs: 3, max: 3, cost: 3000 },
  bank: { name: 'Bank', color: 6, jobs: 2, max: 3, cost: 2500 },
  airport: { name: 'Airport', color: 14, jobs: 4, max: 3, cost: 6000 },
  capitol: { name: 'Capitol', color: 0, jobs: 2, max: 1, cost: 8000 },
};

// Every lot. d = district (main road, west, east, north). face = where its door is (toward the road).
// x0/z0 = the corner of its 7 x 7 space (13 x 13 for the mine). pad = the glowing pad in front of it.
const lot = (id, kind, i, x0, z0, d, stage = 1) => {
  const face = d === 'main' ? (x0 < 64 ? 'e' : 'w') : d === 'west' ? 'e' : d === 'east' ? 'w' : 's';
  const pad = face === 's' ? [x0 + 3, 0, 89] : d === 'main' ? [x0 < 64 ? 61 : 67, 0, z0 + 3] : [d === 'west' ? 45 : 83, 0, z0 + 3];
  const same = KINDS[kind].name;
  return { id, kind, i, d, face, stage, x0, z0, w: 7, pad, max: KINDS[kind].max, name: ['house', 'factory', 'car', 'shop'].includes(kind) ? `${same} ${i + 1}` : same };
};
export const SPOTS = [
  lot('hall', 'hall', 0, 51, 20, 'main'), ...[30, 40, 50, 60, 70, 80].map((z, i) => lot('h' + i, 'house', i, 51, z, 'main')),
  lot('vault', 'vault', 0, 70, 20, 'main'), lot('f0', 'factory', 0, 70, 30, 'main'), lot('f1', 'factory', 1, 70, 40, 'main'),
  lot('c0', 'car', 0, 70, 50, 'main'), lot('c1', 'car', 1, 70, 60, 'main'), lot('s0', 'shop', 0, 70, 70, 'main'), lot('s1', 'shop', 1, 70, 80, 'main'),
  { id: 'mine', kind: 'mine', i: 0, d: 'main', face: 's', stage: 1, name: 'Gold mine', max: 5, x0: 58, z0: 92, w: 13, pad: [64, 0, 90] },
  // Town: the west side
  lot('police', 'police', 0, 37, 30, 'west', 2), lot('school', 'school', 0, 37, 40, 'west', 2), lot('park', 'park', 0, 37, 50, 'west', 2),
  ...[60, 70, 80].map((z, k) => lot('h' + (6 + k), 'house', 6 + k, 37, z, 'west', 2)),
  // City: the east side
  lot('court', 'court', 0, 85, 30, 'east', 3), lot('jail', 'jail', 0, 85, 40, 'east', 3), lot('hospital', 'hospital', 0, 85, 50, 'east', 3),
  lot('f2', 'factory', 2, 85, 60, 'east', 3), lot('s2', 'shop', 2, 85, 70, 'east', 3), lot('h9', 'house', 9, 85, 80, 'east', 3),
  // Big City: the north side (the Capitol and the Airport make you a Country)
  lot('stadium', 'stadium', 0, 36, 92, 'north', 4), lot('bank', 'bank', 0, 46, 92, 'north', 4), lot('airport', 'airport', 0, 74, 92, 'north', 4), lot('capitol', 'capitol', 0, 84, 92, 'north', 4),
];
export const spot = (id) => SPOTS.find((s) => s.id === id) || null;
export const padColor = (s) => KINDS[s.kind].color;
export const COLLECT_PAD = [67, 0, 27]; // step here to collect the coins in your vault
export const START = { h0: 1, mine: 1, f0: 1, vault: 1 }; // free to start with

export function newTycoon(now = Date.now(), seed = Math.floor(Math.random() * 2 ** 31)) {
  return { v: 3, b: { ...START }, vault: 0, t: now, tax: 2, happy: 60, crime: 10, corrupt: 0, stage: 1, seed, n: 0, nextEv: now + 5 * 60e3, nextCase: now + 10 * 60e3, ev: [], cases: [], log: [] };
}
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : lo));
// Cleans a saved town (from the database) so bad data can't do anything. Towns from version 2 keep their buildings.
export function cleanTycoon(s, now = Date.now()) {
  if (!s || typeof s !== 'object' || ![2, 3].includes(s.v) || !s.b || typeof s.b !== 'object') return newTycoon(now);
  const out = newTycoon(now, Number.isInteger(s.seed) ? s.seed : undefined);
  for (const sp of SPOTS) { const l = Math.floor(Number(s.b[sp.id]) || 0); if (l > 0) out.b[sp.id] = Math.min(sp.max, l); }
  for (const [k, l] of Object.entries(START)) out.b[k] = Math.max(l, out.b[k] || 0);
  out.vault = clamp(s.vault, 0, 1e7);
  out.t = Number.isFinite(Number(s.t)) ? Math.min(Number(s.t), now) : now;
  if (s.v === 3) {
    out.tax = Math.floor(clamp(s.tax, 0, 4)); out.happy = clamp(s.happy); out.crime = clamp(s.crime); out.corrupt = clamp(s.corrupt);
    out.stage = Math.floor(clamp(s.stage, 1, 5)); out.n = Math.floor(clamp(s.n, 0, 1e9));
    out.nextEv = Number(s.nextEv) || out.nextEv; out.nextCase = Number(s.nextCase) || out.nextCase;
    out.ev = (Array.isArray(s.ev) ? s.ev : []).filter((e) => e && EVENTS[e.k]).slice(0, TY.maxWaiting);
    out.cases = (Array.isArray(s.cases) ? s.cases : []).filter((c) => c && CRIMES[c.k]).slice(0, TY.maxWaiting);
    out.log = (Array.isArray(s.log) ? s.log : []).filter((l) => l && typeof l.text === 'string').slice(-8);
  }
  return out;
}

// Everything your town makes per hour, and where it comes from.
export function stats(s) {
  const lv = (id) => s.b[id] || 0;
  const sum = (kind) => SPOTS.filter((x) => x.kind === kind).reduce((n, x) => n + lv(x.id), 0);
  const happy = s.happy ?? 60, crime = s.crime ?? 10, corrupt = s.corrupt ?? 0;
  // unhappy people move away; happy ones (and a hospital) bring more
  const peopleMult = Math.min(1.1, 0.55 + happy * 0.006) + 0.03 * lv('hospital');
  const people = Math.round(TY.perHouse * sum('house') * peopleMult);
  const jobs = SPOTS.reduce((n, x) => n + KINDS[x.kind].jobs * lv(x.id), 0);
  const staff = jobs ? Math.min(1, people / jobs) : 1;
  // how well the town works: happy people work harder, crime slows everything down
  const mood = (0.7 + happy * 0.005) * (1 - crime * 0.004);
  const gold = TY.goldPerMine * lv('mine') * staff;
  const inc = {
    factory: Math.min(gold, TY.factoryGold * sum('factory') * staff) * mood,
    cars: TY.perCar * sum('car') * staff * mood,
    shops: Math.min(people * TY.spend, TY.perShop * sum('shop')) * staff * mood,
    taxes: people * TAX[lv('hall')] * TAX_RATES[s.tax ?? 2].mult,
    fun: (25 * lv('stadium') + 20 * lv('bank') + 35 * lv('airport') * (0.5 + happy / 100)) * staff * mood,
  };
  const coinsPerHour = inc.factory + inc.cars + inc.shops + inc.taxes + inc.fun;
  // where the meters are heading
  const services = 4 * lv('school') + 5 * lv('park') + 4 * lv('hospital') + 4 * lv('stadium') + 5 * lv('capitol');
  const jobless = people > jobs * 1.4 && jobs ? 8 : 0;
  const happyGoal = clamp(55 + TAX_RATES[s.tax ?? 2].happy + services - crime * 0.35 - corrupt * 0.25 - jobless);
  const crimeGoal = clamp(8 + people * 0.12 - 6 * lv('police') - 4 * lv('jail') + corrupt * 0.3 + Math.max(0, 40 - happy) * 0.5);
  return { people, jobs, staff, gold, mood, income: inc, coinsPerHour, vaultCap: VAULT_CAP[lv('vault')] + 500 * lv('bank'), cars: sum('car'), happyGoal, crimeGoal };
}
export function nextStage(s) {
  const st = STAGES[(s.stage || 1) + 1];
  if (!st) return null;
  const people = stats(s).people, missing = [];
  if (st.need.people && people < st.need.people) missing.push(`${st.need.people} people (you have ${people})`);
  for (const [k, n] of Object.entries(st.need)) if (k !== 'people' && !SPOTS.some((x) => x.kind === k && (s.b[x.id] || 0) >= n)) missing.push(`a ${KINDS[k].name}`);
  return { stage: (s.stage || 1) + 1, name: st.name, missing };
}
export function leaderTitle(s) {
  const base = STAGES[s.stage || 1].leader;
  const c = s.corrupt ?? 0, h = s.happy ?? 60;
  return (c >= 70 ? 'Evil ' : c >= 40 ? 'Shady ' : h >= 75 && c < 15 ? 'Beloved ' : c < 10 ? 'Honest ' : '') + base;
}
const note = (s, text) => { s.log = [...(s.log || []), { t: s.t, text }].slice(-8); };

// Moves the town forward to `now`: the vault fills, the meters drift, the town grows.
// { events: true } (only the server) also brings new decisions and court cases.
export function advance(s, now, { events = false } = {}) {
  const dt = Math.max(0, Math.min(now - s.t, TY.offlineHours * 3600e3)) / 3600e3;
  const st = stats(s);
  if (s.vault < st.vaultCap) s.vault = Math.min(st.vaultCap, s.vault + st.coinsPerHour * dt); // (bribes and fines can go over the top)
  const k = 1 - Math.exp(-0.15 * dt);
  s.happy = clamp(s.happy + (st.happyGoal - s.happy) * k);
  s.crime = clamp(s.crime + (st.crimeGoal - s.crime) * k);
  s.corrupt = clamp(s.corrupt - 3 * dt); // an honest government slowly wins back trust
  s.t = Math.max(s.t, now);
  for (;;) { const n = nextStage(s); if (!n || n.missing.length) break; s.stage = n.stage; note(s, `Your town is a ${n.name} now! You're the ${leaderTitle(s)}.`); }
  if (events) {
    // (after a long time away only the last few are waiting)
    if (s.nextEv < now - TY.offlineHours * 3600e3) s.nextEv = now - TY.offlineHours * 3600e3;
    while (s.nextEv <= now) { if (s.ev.length < TY.maxWaiting) s.ev.push(makeEvent(s, st)); s.nextEv += TY.eventEvery * 60e3; }
    if (!SPOTS.some((x) => x.kind === 'police' && s.b[x.id])) s.nextCase = Math.max(s.nextCase, now + TY.caseEvery * 60e3);
    if (s.nextCase < now - TY.offlineHours * 3600e3) s.nextCase = now - TY.offlineHours * 3600e3;
    while (s.nextCase <= now) { if (s.cases.length < TY.maxWaiting) s.cases.push(makeCase(s, st)); s.nextCase += TY.caseEvery * 60e3; }
  }
  return s;
}

/* ---------------- decisions ---------------- */
// A little random number maker that always gives the same numbers for the same town and count (so it's fair).
function rng(seed, n) {
  let t = (seed ^ Math.imul(n + 1, 2654435761)) >>> 0;
  return () => { t = (t + 0x6d2b79f5) >>> 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
// coins in a decision are "hours of what your town makes" (at least 20), worked out when it pops up
const hrs = (st, h) => Math.max(20, Math.round(st.coinsPerHour * h));
// fx: coins (+ into the vault, - out of it), happy, crime, corrupt, tax (change the tax rate). need: a building kind.
export const EVENTS = {
  bribe: { text: (c) => `A company offers you ${c.a} coins to skip the safety checks at their factory.`, a: 2, choices: [
    { label: 'Take the money', fx: { coins: 'a', corrupt: 15, crime: 4, happy: -3 }, bad: true }, { label: 'No way', fx: { happy: 3, corrupt: -5 } }] },
  protest: { when: (s) => s.tax >= 3, text: () => 'People are protesting about your high taxes!', choices: [
    { label: 'Lower taxes', fx: { tax: -1, happy: 8 } }, { label: 'Ignore them', fx: { happy: -10 } }, { label: 'Send the police', need: 'police', fx: { happy: -6, crime: -3, corrupt: 6 }, bad: true }] },
  waste: { when: (s) => SPOTS.some((x) => x.kind === 'factory' && s.b[x.id]), text: (c) => `A factory wants to dump waste in the river. It would save ${c.a} coins.`, a: 1.5, choices: [
    { label: 'Allow it', fx: { coins: 'a', happy: -10, corrupt: 8 }, bad: true }, { label: 'Say no', fx: { happy: 4 } }] },
  festival: { text: (c) => `Your people want a town festival. It costs ${c.a} coins.`, a: 1, choices: [
    { label: 'Throw the festival', fx: { coins: '-a', happy: 15 } }, { label: 'Not this time', fx: { happy: -3 } }] },
  potholes: { text: (c) => `The roads are full of potholes. Fixing them costs ${c.a} coins.`, a: 0.5, choices: [
    { label: 'Fix them', fx: { coins: '-a', happy: 6 } }, { label: 'Leave it', fx: { happy: -4 } }] },
  embezzle: { text: (c) => `Your assistant found a way to secretly move ${c.a} coins of tax money into your pocket.`, a: 3, choices: [
    { label: 'Do it', fx: { coins: 'a', corrupt: 25, happy: -5 }, bad: true }, { label: 'Report the idea', fx: { corrupt: -10, happy: 4 } }] },
  charity: { text: (c) => `A charity asks for ${c.a} coins to help poor families.`, a: 1, choices: [
    { label: 'Donate', fx: { coins: '-a', happy: 8, crime: -4 } }, { label: 'Say no', fx: { happy: -2 } }] },
  election: { when: (s) => s.stage >= 3, text: () => 'Election day! Your rival is getting popular.', choices: [
    { label: 'Run a fair election', fx: { fair: true } }, { label: 'Rig the election', fx: { corrupt: 30, happy: -12, crime: 5 }, bad: true }] },
  strike: { text: (c) => `Workers are on strike! Paying them more costs ${c.a} coins.`, a: 1, choices: [
    { label: 'Pay them more', fx: { coins: '-a', happy: 6 } }, { label: 'Fire them all', fx: { happy: -12, crime: 4 }, bad: true }] },
  gang: { when: (s) => s.crime >= 30, text: (c) => `A gang is causing trouble downtown. They offer you ${c.a} coins to look away.`, a: 2, choices: [
    { label: 'Send the police', need: 'police', fx: { crime: -12 } }, { label: 'Take their deal', fx: { coins: 'a', corrupt: 20, crime: 10 }, bad: true }, { label: 'Do nothing', fx: { crime: 6, happy: -5 } }] },
  scandal: { when: (s) => s.corrupt >= 40, text: (c) => `A reporter found out about your shady deals! Keeping them quiet costs ${c.a} coins.`, a: 1.5, choices: [
    { label: 'Pay them to stay quiet', fx: { coins: '-a', corrupt: 10 }, bad: true }, { label: 'Say sorry and give money back', fx: { coins: '-b', corrupt: -25, happy: 5 } }, { label: 'Call it fake news', fx: { happy: -10, corrupt: 5 }, bad: true }], b: 2 },
  tourists: { when: (s) => s.stage >= 2, text: () => 'A travel show wants to film your town!', choices: [
    { label: 'Yes, film us!', fx: { tour: true } }, { label: 'Pay them to only film the nice parts', fx: { coins: '-a', happy: 3, corrupt: 5 }, bad: true }, { label: 'No thanks', fx: {} }], a: 0.5 },
};
function makeEvent(s, st) {
  const r = rng(s.seed, s.n++);
  const list = Object.keys(EVENTS).filter((k) => (!EVENTS[k].when || EVENTS[k].when(s)) && !s.ev.some((e) => e.k === k));
  const k = list[Math.floor(r() * list.length)] || 'festival', E = EVENTS[k];
  return { id: 'e' + s.n, k, a: E.a ? hrs(st, E.a) : 0, b: E.b ? hrs(st, E.b) : 0, at: s.nextEv };
}
export const eventText = (e) => EVENTS[e.k].text(e);
// Can you pick this choice right now? ('' = yes, or why not)
// Costs come out of the town vault first; whatever the vault can't cover comes from your own coins (`coins`).
export function choiceBlock(s, e, i, coins = 0) {
  const c = EVENTS[e.k].choices[i];
  if (!c) return 'Unknown choice.';
  if (c.need && !SPOTS.some((x) => x.kind === c.need && s.b[x.id])) return `You need a ${KINDS[c.need].name}.`;
  const cost = c.fx.coins === '-a' ? e.a : c.fx.coins === '-b' ? e.b : 0;
  if (cost && Math.floor(s.vault) + Math.max(0, coins) < cost) return `Not enough coins: ${cost} needed (vault + your coins).`;
  return '';
}
const meters = (s, fx) => { for (const m of ['happy', 'crime', 'corrupt']) if (fx[m]) s[m] = clamp(s[m] + fx[m]); };
// Makes a decision. Returns an error message, or { text } saying what happened.
// Returns { text, pay } where pay = coins to take from your wallet (the part the vault couldn't cover).
export function decide(s, id, i, coins = 0) {
  const e = s.ev.find((x) => x.id === id);
  if (!e) return { error: 'That decision is gone.' };
  const block = choiceBlock(s, e, i, coins);
  if (block) return { error: block };
  const c = EVENTS[e.k].choices[i], fx = c.fx;
  s.ev = s.ev.filter((x) => x !== e);
  let text = `You chose: ${c.label}.`;
  if (fx.coins === 'a') { s.vault += e.a; text += ` +${e.a} coins in the vault.`; }
  let pay = 0;
  const cost = fx.coins === '-a' ? e.a : fx.coins === '-b' ? e.b : 0;
  if (cost) { const fromVault = Math.min(Math.floor(s.vault), cost); s.vault -= fromVault; pay = cost - fromVault; if (pay) text += fromVault ? ` Paid ${fromVault} from the vault and ${pay} from your coins.` : ` Paid ${pay} from your coins.`; }
  if (fx.tax) s.tax = Math.max(0, Math.min(4, s.tax + fx.tax));
  meters(s, fx);
  if (fx.fair) {
    if (s.happy >= 50) { s.happy = clamp(s.happy + 6); text = 'Fair election: the people chose you again!'; }
    else { s.happy = clamp(s.happy + 2); s.tax = Math.max(0, s.tax - 1); text = 'Fair election: you only just won, and had to promise lower taxes.'; }
  }
  if (fx.tour) {
    const got = Math.max(20, Math.round(stats(s).coinsPerHour * (s.happy >= 50 ? 1 : 0.2)));
    s.vault += got; if (s.happy < 50) s.happy = clamp(s.happy - 5);
    text = s.happy >= 50 ? `The show loved your town! Tourists came: +${got} coins.` : `The show saw a grumpy town. Only a few tourists came (+${got} coins).`;
  }
  note(s, text);
  return { text, pay };
}

/* ---------------- court ---------------- */
export const CRIMES = {
  apples: 'stole apples from the grocery shop', speed: 'drove way too fast', graffiti: 'painted graffiti on the Town Hall',
  fakegold: 'sold fake gold', car: 'stole a car from the car factory', window: 'broke a factory window',
  casino: 'ran a secret casino', cheat: 'cheated at a soccer game',
};
const NAMES = ['Bob', 'Kira', 'Max', 'Lola', 'Zed', 'Pip Jr.', 'Nova', 'Rex', 'Mia', 'Otto', 'Ivy', 'Dex', 'Sunny', 'Gus'];
export const EVIDENCE = ['Weak', 'Some', 'Strong'];
const GUILTY_CHANCE = [0.25, 0.6, 0.9];
function makeCase(s, st) {
  const r = rng(s.seed ^ 0x5bd1e995, s.n++);
  const keys = Object.keys(CRIMES), ev = Math.floor(r() * 3);
  return { id: 'c' + s.n, k: keys[Math.floor(r() * keys.length)], who: NAMES[Math.floor(r() * NAMES.length)], ev, g: r() < GUILTY_CHANCE[ev], fine: hrs(st, 0.3), bribe: hrs(st, 1), at: s.nextCase };
}
export const caseText = (c) => `${c.who} is accused: they ${CRIMES[c.k]}. Evidence: ${EVIDENCE[c.ev]}.`;
export const VERDICTS = { fine: 'Guilty: pay a fine', jail: 'Guilty: jail', free: 'Not guilty', bribe: 'Take their bribe' };
// Judges a case. Returns an error message, or { text } saying what happened (and whether they really did it).
export function judge(s, id, verdict) {
  const c = s.cases.find((x) => x.id === id);
  if (!c) return { error: 'That case is gone.' };
  if (!VERDICTS[verdict]) return { error: 'Unknown verdict.' };
  if (verdict === 'jail' && !SPOTS.some((x) => x.kind === 'jail' && s.b[x.id])) return { error: 'You need a Jail for that.' };
  s.cases = s.cases.filter((x) => x !== c);
  const court = SPOTS.filter((x) => x.kind === 'court').reduce((n, x) => n + (s.b[x.id] || 0), 0);
  let text;
  if (verdict === 'bribe') {
    s.vault += c.bribe; meters(s, { corrupt: 12, crime: 5 });
    text = `You took ${c.bribe} coins and let ${c.who} go. (${c.g ? 'They did it.' : "They didn't even do it."})`;
  } else if (verdict === 'free') {
    if (c.g) { meters(s, { crime: 5 }); text = `${c.who} walked free... but they really did it. Crime goes up.`; }
    else { meters(s, { happy: 3 }); text = `Right call! ${c.who} was innocent.`; }
  } else if (c.g) {
    const fine = verdict === 'fine' ? Math.round(c.fine * (1 + 0.5 * court)) : 0;
    s.vault += fine;
    meters(s, { crime: verdict === 'jail' ? -8 - 2 * court : -3 - court, happy: 2 });
    text = `Justice! ${c.who} really did it.${fine ? ` They paid a ${fine} coin fine.` : ' They went to jail.'}`;
  } else { meters(s, { happy: -8, corrupt: 3 }); text = `Oops! ${c.who} was innocent. People are upset.`; }
  note(s, text);
  return { text };
}

/* ---------------- building and costs ---------------- */
const GROW = 2.2, SPOT_MULT = 1.6;
export function costOf(sp, level) {
  if (level > sp.max) return null;
  const skip = START[sp.id] ? 1 : 0; // lots you start with: their level 2 is the first thing you pay for
  return Math.round(KINDS[sp.kind].cost * GROW ** (level - 1 - skip) * SPOT_MULT ** sp.i);
}
// { level: next level, cost, locked: why } or null when it's maxed out
export function nextOf(s, id) {
  const sp = spot(id);
  if (!sp) return null;
  const level = (s.b[id] || 0) + 1;
  if (level > sp.max) return null;
  let locked = '';
  if ((s.stage || 1) < sp.stage) locked = `Unlocks when you're a ${STAGES[sp.stage].name}`;
  else if (level === 1 && sp.i > 0) { const prev = SPOTS.find((x) => x.kind === sp.kind && x.i === sp.i - 1); if (!s.b[prev.id]) locked = `Build ${prev.name} first`; }
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
// Returns [[x, y, z, type, color], ...] for a lot at a level (0 = empty lot). Shapes are drawn with the door at
// local x = 6 (the front), and turned to face the road.
export function spotCells(sp, level, B) {
  const out = [];
  if (!level) return out;
  const put = (x, y, z, t, c = 0) => {
    if (sp.kind === 'mine') return out.push([sp.x0 + x, y, sp.z0 + z, t, c]);
    const [wx, wz] = sp.face === 'e' ? [x, z] : sp.face === 'w' ? [6 - x, z] : [z, 6 - x];
    out.push([sp.x0 + wx, y, sp.z0 + wz, t, c]);
  };
  const box = (x0, y0, z0, x1, y1, z1, t, c) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) put(x, y, z, t, c); };
  const walls = (x0, z0, x1, z1, y0, y1, t, c) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (x === x0 || x === x1 || z === z0 || z === z1) put(x, y, z, t, c); };
  const door = (x, h = 2) => { for (let y = 1; y <= h; y++) put(x, y, 3, 0, 0); };
  const tree = (x, z) => { box(x, 1, z, x, 2, z, B.wood, 0); box(x - 1, 3, z - 1, x + 1, 3, z + 1, B.leaves, 0); put(x, 4, z, B.leaves, 0); };
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
    box(6, 1, 1, 6, h, 1, B.plastic, 0); box(6, 1, 5, 6, h, 5, B.plastic, 0); // columns out front
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
  } else if (k === 'police') {
    const h = 2 + Math.ceil(level / 2);
    walls(1, 1, 6, 5, 1, h, B.plastic, 3); box(1, h + 1, 1, 6, h + 1, 5, B.plastic, 0);
    put(3, h + 2, 2, B.neon, 4); put(3, h + 2, 4, B.neon, 9); // the siren lights
    for (let i = 0; i < level; i++) put(0, 1, 1 + i, B.plastic, 9); // a police car per level (parked)
    door(6);
  } else if (k === 'school') {
    const h = 2 + level;
    walls(1, 0, 6, 6, 1, h, B.brick, 0); box(1, h + 1, 0, 6, h + 1, 6, B.plastic, 6);
    for (let z = 1; z <= 5; z += 2) for (let y = 2; y <= h; y += 2) put(6, y, z, B.glass, 14);
    box(0, 1, 0, 0, 4, 0, B.metal, 0); put(0, 4, 1, B.plastic, 9); // a flag
    door(6);
  } else if (k === 'park') {
    box(0, 0, 0, 6, 0, 6, B.grass, 0);
    tree(1, 1); if (level >= 2) tree(1, 5); if (level >= 3) tree(5, 1);
    box(3, 1, 3, 3, level, 3, B.stone, 0); put(3, level + 1, 3, B.glass, 14); // a fountain
    box(5, 1, 4, 5, 1, 5, B.wood, 0); // a bench
  } else if (k === 'court') {
    const h = 4 + level;
    walls(1, 1, 5, 5, 1, h, B.stone, 0);
    for (const z of [0, 2, 4, 6]) box(6, 1, z, 6, h, z, B.plastic, 0); // tall columns
    box(0, h + 1, 0, 6, h + 1, 6, B.stone, 0); box(1, h + 2, 1, 5, h + 2, 5, B.stone, 0); box(2, h + 3, 2, 4, h + 3, 4, B.plastic, 6);
    door(5, 3);
  } else if (k === 'jail') {
    const h = 2 + level;
    walls(0, 0, 6, 6, 1, h, B.stone, 2); box(0, h + 1, 0, 6, h + 1, 6, B.stone, 0);
    for (let z = 1; z <= 5; z += 2) put(6, 2, z, B.metal, 0);
    for (const [x, z] of [[0, 0], [0, 6], [6, 0], [6, 6]]) put(x, h + 2, z, B.neon, 6); // lights on the corners
    door(6);
  } else if (k === 'hospital') {
    const h = 3 + level;
    walls(0, 0, 6, 6, 1, h, B.plastic, 0); box(0, h + 1, 0, 6, h + 1, 6, B.plastic, 0);
    box(6, h - 1, 3, 6, h, 3, B.plastic, 4); put(6, h - 1, 2, B.plastic, 4); put(6, h - 1, 4, B.plastic, 4); // a red cross
    for (let y = 2; y < h - 1; y += 2) { put(6, y, 1, B.glass, 14); put(6, y, 5, B.glass, 14); }
    door(6);
  } else if (k === 'stadium') {
    const h = 1 + level;
    walls(0, 0, 6, 6, 1, h, B.plastic, 4);
    box(1, 1, 1, 5, 1, 5, B.grass, 0); box(1, 0, 1, 5, 0, 5, B.grass, 0);
    for (let x = 1; x <= 5; x++) put(x, h + 1, 0, B.neon, 6); // lights
    put(6, 1, 3, 0, 0);
  } else if (k === 'bank') {
    const h = 3 + level;
    walls(1, 0, 6, 6, 1, h, B.plastic, 13);
    for (const z of [0, 2, 4, 6]) box(6, 1, z, 6, h, z, B.plastic, 6); // golden columns
    box(1, h + 1, 0, 6, h + 1, 6, B.plastic, 6); box(3, h + 2, 2, 4, h + 2, 4, B.neon, 6);
    door(6);
  } else if (k === 'airport') {
    box(0, 0, 0, 6, 0, 6, B.stone, 0);
    for (let z = 0; z <= 6; z += 2) put(3, 0, z, B.plastic, 0); // runway stripes
    box(0, 1, 0, 1, 3 + level * 2, 1, B.glass, 14); put(0, 4 + level * 2, 0, B.neon, 4); // the control tower
    box(3, 1, 2, 3, 1, 4, B.plastic, 0); box(2, 1, 3, 4, 1, 3, B.plastic, 0); // a little plane
  } else if (k === 'capitol') {
    walls(0, 0, 6, 6, 1, 4, B.plastic, 0); box(0, 5, 0, 6, 5, 6, B.plastic, 0);
    box(1, 6, 1, 5, 6, 5, B.plastic, 0); box(2, 7, 2, 4, 8, 4, B.plastic, 13); put(3, 9, 3, B.neon, 6); // the dome
    for (const z of [1, 3, 5]) if (z !== 3) box(6, 1, z, 6, 4, z, B.plastic, 0);
    box(0, 6, 0, 0, 9, 0, B.metal, 0); put(0, 9, 1, B.plastic, 9); // the country's flag
    door(6, 3);
  } else {
    // the mine: a rocky hill with gold in it and an entrance on the south side
    const r = Math.min(6, 2 + level), hh = 1 + level * 2;
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
// All the cells a lot could ever use (so the game can clear it before drawing the new level). y from 0 for parks.
export function spotBox(sp) { return [sp.x0, 1, sp.z0, sp.x0 + sp.w - 1, 24, sp.z0 + sp.w - 1]; }
const door = (sp) => (sp.face === 'e' ? [sp.x0 + 7.5, 1, sp.z0 + 3.5] : sp.face === 'w' ? [sp.x0 - 0.5, 1, sp.z0 + 3.5] : [sp.x0 + 3.5, 1, sp.z0 - 0.5]);

// Where people walk (on the main road). Miners carry gold from the mine to a factory, other workers go to their
// job, and everyone stops at a shop. Returns { pts, carry } (carry: which parts they hold gold).
export function workerPath(s, k) {
  const has = (kind) => SPOTS.filter((x) => x.kind === kind && x.d === 'main' && s.b[x.id]);
  const houses = has('house');
  if (!houses.length) return null;
  const h = houses[k % houses.length], lane = 63 + (k % 3) + 0.5, home = door(h);
  const road = (z) => [lane, 1, z];
  const facs = has('factory'), cars = has('car'), shops = has('shop');
  const pts = [home, road(home[2])];
  let carry = null;
  if (k % 3 !== 2 && facs.length) {
    const f = facs[k % facs.length];
    pts.push(road(90.5), [64.5, 1, 91.5], road(90.5));
    carry = [pts.length - 1, pts.length + 1];
    pts.push(road(f.z0 + 3.5), door(f), road(f.z0 + 3.5));
  } else if (cars.length) { const c = cars[k % cars.length]; pts.push(road(c.z0 + 3.5), door(c), road(c.z0 + 3.5)); }
  if (shops.length) { const sh = shops[k % shops.length]; pts.push(road(sh.z0 + 3.5), door(sh), road(sh.z0 + 3.5)); }
  pts.push(road(home[2]), home);
  return { pts, carry };
}
