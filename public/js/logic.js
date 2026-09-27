// Logic: visual scripts for 3D worlds, like Scratch blocks. A script is only data (which blocks, which numbers),
// never code, and this file is the only thing that runs it. Scripts can only change things inside the world
// (switch blocks, teleports, speed, messages...), so a world can't do anything harmful to a player's computer.
// They run inside the physics, 60 steps a second with no randomness, so the server can still check obby runs.
import { B, SX, SZ, BLOCKS } from './world.js';

export const LOGIC_LIMITS = { scripts: 30, blocks: 300, depth: 6, vars: 10, text: 80, name: 12 };
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n * 10) / 10)) : d; };
const color = (v) => Math.max(0, Math.min(15, Math.floor(Number(v)) || 0));

// What starts a script. n: [min, max, default]
export const EVENTS = {
  start: { label: 'When the game starts' },
  touch: { label: 'When I touch a Trigger pad', c: true },
  every: { label: 'Every', n: [0.5, 120, 5], after: 'seconds' },
  coins: { label: 'When I have', n: [1, 200, 5], after: 'coins' },
  checkpoint: { label: 'When I reach a checkpoint' },
  die: { label: 'When I fall or respawn' },
};
// The blocks inside a script, grouped like Scratch (the colors show the group).
export const CATS = {
  looks: { name: 'Looks', color: '#9966ff' },
  motion: { name: 'Motion', color: '#4c97ff' },
  world: { name: 'World', color: '#59c059' },
  control: { name: 'Control', color: '#ffab19' },
  vars: { name: 'Variables', color: '#ff8c1a' },
  sound: { name: 'Sound', color: '#cf63cf' },
};
export const ACTIONS = {
  say: { cat: 'looks', label: 'Say', text: true },
  showVar: { cat: 'looks', label: 'Show variable on screen', v: true },
  tp: { cat: 'motion', label: 'Teleport to Marker', c: true },
  speed: { cat: 'motion', label: 'Set speed to', n: [0.3, 3, 1.5], after: '× normal' },
  jump: { cat: 'motion', label: 'Set jump power to', n: [0.5, 2, 1.3], after: '× normal' },
  gravity: { cat: 'motion', label: 'Set gravity to', n: [0.2, 2, 0.5], after: '× normal' },
  gear: { cat: 'motion', label: 'Give gear', gear: true, n: [1, 120, 10], after: 'seconds' },
  respawn: { cat: 'motion', label: 'Send back to the checkpoint' },
  show: { cat: 'world', label: 'Show Switch blocks', c: true },
  hide: { cat: 'world', label: 'Hide Switch blocks', c: true },
  toggle: { cat: 'world', label: 'Flip Switch blocks', c: true },
  win: { cat: 'world', label: 'Win the obby' },
  wait: { cat: 'control', label: 'Wait', n: [0.1, 60, 1], after: 'seconds' },
  repeat: { cat: 'control', label: 'Repeat', n: [1, 50, 3], after: 'times', body: true },
  forever: { cat: 'control', label: 'Forever', body: true },
  if: { cat: 'control', label: 'If', cond: true, body: true, else: true },
  set: { cat: 'vars', label: 'Set', v: true, n: [-9999, 9999, 0], mid: 'to' },
  change: { cat: 'vars', label: 'Change', v: true, n: [-999, 999, 1], mid: 'by' },
  sound: { cat: 'sound', label: 'Play sound', sound: true },
};
export const CONDS = { var: 'variable', coins: 'my coins', deaths: 'my falls', time: 'seconds played' };
export const OPS = ['>', '<', '='];
export const LOGIC_SOUNDS = ['coin', 'win', 'bounce', 'buy', 'badge', 'pop', 'notify', 'go', 'tick', 'checkpoint', 'error'];
// movement gear a script can hand out for a while (see GEAR_MODS in cosmetics.js)
export const LOGIC_GEAR = { speed: 'Speed coil', gravity: 'Gravity coil', boots: 'Double-jump boots', jetpack: 'Jetpack', turbo: 'Turbo shoes', moon: 'Moon boots', spring: 'Spring shoes', feather: 'Feather cape', rocket: 'Rocket pack' };

/* ---------------- cleaning (the server and the builder both use this) ---------------- */
const cleanName = (v) => String(v || '').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, LOGIC_LIMITS.name) || 'score';
const cleanText = (v) => String(v || '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '').replace(/\s+/g, ' ').trim().slice(0, LOGIC_LIMITS.text);
export function cleanLogic(list) {
  if (!Array.isArray(list)) return [];
  let blocks = 0;
  const vars = new Set();
  const stmts = (arr, depth) => {
    if (!Array.isArray(arr) || depth > LOGIC_LIMITS.depth) return [];
    const out = [];
    for (const s of arr) {
      if (!s || typeof s !== 'object' || !ACTIONS[s.k] || blocks >= LOGIC_LIMITS.blocks) continue;
      const A = ACTIONS[s.k], o = { k: s.k };
      blocks++;
      if (A.c) o.c = color(s.c);
      if (A.n) o.n = num(s.n, A.n[0], A.n[1], A.n[2]);
      if (A.text) o.text = cleanText(s.text) || 'Hi!';
      if (A.v) { const v = cleanName(s.v); if (vars.has(v) || vars.size < LOGIC_LIMITS.vars) { vars.add(v); o.v = v; } else continue; }
      if (A.gear) o.g = LOGIC_GEAR[s.g] ? s.g : 'speed';
      if (A.sound) o.s = LOGIC_SOUNDS.includes(s.s) ? s.s : 'pop';
      if (A.cond) {
        const c = s.cond && typeof s.cond === 'object' ? s.cond : {};
        o.cond = { a: CONDS[c.a] ? c.a : 'var', op: OPS.includes(c.op) ? c.op : '>', n: num(c.n, -9999, 9999, 0) };
        if (o.cond.a === 'var') o.cond.v = cleanName(c.v);
      }
      if (A.body) o.do = stmts(s.do, depth + 1);
      if (A.else) o.else = stmts(s.else, depth + 1);
      out.push(o);
    }
    return out;
  };
  const out = [];
  for (const sc of list.slice(0, LOGIC_LIMITS.scripts)) {
    if (!sc || typeof sc !== 'object' || !EVENTS[sc.on]) continue;
    const E = EVENTS[sc.on], o = { on: sc.on };
    if (E.c) o.c = color(sc.c);
    if (E.n) o.n = num(sc.n, E.n[0], E.n[1], E.n[2]);
    o.do = stmts(sc.do, 1);
    out.push(o);
  }
  return out;
}
export const countBlocks = (list) => { let n = 0; const walk = (a) => { for (const s of a || []) { n++; walk(s.do); walk(s.else); } }; for (const sc of list || []) walk(sc.do); return n; };

/* ---------------- running ---------------- */
// Called by createSim. Puts every switch block back the way the world was built (a restart undoes what scripts did).
export function initLogic(S, logic) {
  const grid = S.grid;
  if (!grid._sw) {
    grid._sw = [];
    for (let i = 0; i < grid.t.length; i++) { const t = grid.t[i]; if (t === B.switchOn || t === B.switchOff) grid._sw.push([i, t, grid.c[i]]); }
  }
  const switches = new Map(), markers = new Map(), changed = [];
  for (const [i, t, c] of grid._sw) {
    if (grid.t[i] !== t) { grid.t[i] = t; changed.push(i); }
    if (!switches.has(c)) switches.set(c, []);
    switches.get(c).push(i);
  }
  if (logic && logic.some((s) => s.do.some(function has(x) { return x.k === 'tp' || (x.do && x.do.some(has)) || (x.else && x.else.some(has)); }))) {
    for (let i = 0; i < grid.t.length; i++) if (grid.t[i] === B.marker) { const c = grid.c[i]; if (!markers.has(c)) markers.set(c, [i % SX, Math.floor(i / (SX * SZ)), Math.floor(i / SX) % SZ]); }
  }
  if (changed.length) S.events.push({ t: 'switch', cells: changed });
  if (!logic || !logic.length) return null;
  return {
    scripts: logic, threads: new Map(), vars: {}, shown: [], started: false, touching: new Set(), fired: new Set(),
    switches, markers, mods: { speed: 1, jump: 1, grav: 1 }, tgear: null, died: false, cp: false,
    hasTouch: logic.some((s) => s.on === 'touch'), ops: 0,
  };
}

// Which trigger pad colors the player is inside right now.
function triggerColors(S) {
  const out = new Set(), hw = 0.4, p = S.p, t = S.grid.t, c = S.grid.c;
  for (let y = Math.floor(p.y); y <= Math.floor(p.y + 1.5); y++) for (let z = Math.floor(p.z - hw); z <= Math.floor(p.z + hw); z++) for (let x = Math.floor(p.x - hw); x <= Math.floor(p.x + hw); x++) {
    if (x < 0 || z < 0 || y < 0 || x >= SX || z >= SZ || y >= 64) continue;
    const i = x + z * SX + y * SX * SZ;
    if (t[i] === B.trigger) out.add(c[i]);
  }
  return out;
}

function start(L, k, S) {
  if (L.threads.has(k)) return; // already running: let it finish
  L.threads.set(k, { stack: [{ list: L.scripts[k].do, pc: 0 }], wake: S.steps });
}

// One step of Logic. hooks: { die(S) } so a script can send the player back.
export function logicStep(S, hooks) {
  const L = S.logic;
  if (!L) return;
  // temporary gear runs out
  if (L.tgear && S.steps >= L.tgear.until) { L.tgear = null; S.events.push({ t: 'gear', id: null }); }
  // what starts scripts
  const touchedNow = L.hasTouch ? triggerColors(S) : null;
  L.scripts.forEach((sc, k) => {
    switch (sc.on) {
      case 'start': if (!L.started) start(L, k, S); break;
      case 'every': if (S.steps % Math.max(30, Math.round(sc.n * 60)) === 0) start(L, k, S); break;
      case 'coins': if (S.coins >= sc.n && !L.fired.has(k)) { L.fired.add(k); start(L, k, S); } break;
      case 'touch': if (touchedNow.has(sc.c) && !L.touching.has(sc.c)) start(L, k, S); break;
      case 'die': if (L.died) start(L, k, S); break;
      case 'checkpoint': if (L.cp) start(L, k, S); break;
    }
  });
  L.started = true; L.died = false; L.cp = false;
  if (touchedNow) L.touching = touchedNow;
  // run the scripts (a fixed budget per step, so a script can never freeze the game)
  let budget = 400;
  for (const [k, th] of L.threads) {
    while (budget > 0 && th.wake <= S.steps && th.stack.length) {
      budget--;
      const f = th.stack[th.stack.length - 1];
      if (f.pc >= f.list.length) {
        if (f.left > 1) { f.left--; f.pc = 0; th.wake = S.steps + 1; continue; } // repeat: the next time round is next step
        if (f.forever) { f.pc = 0; th.wake = S.steps + 1; continue; }
        th.stack.pop();
        continue;
      }
      const s = f.list[f.pc++];
      exec(S, L, th, s, hooks);
      if (S.won) return;
    }
    if (!th.stack.length) L.threads.delete(k);
  }
}

function cond(S, L, c) {
  const a = c.a === 'var' ? L.vars[c.v] || 0 : c.a === 'coins' ? S.coins : c.a === 'deaths' ? S.deaths : Math.floor(S.runSteps / 60);
  return c.op === '>' ? a > c.n : c.op === '<' ? a < c.n : a === c.n;
}
function flip(S, L, c, how) {
  const cells = L.switches.get(c);
  if (!cells) return;
  const t = S.grid.t, changed = [];
  for (const i of cells) {
    const on = t[i] === B.switchOn, want = how === 'show' ? true : how === 'hide' ? false : !on;
    if (on !== want) { t[i] = want ? B.switchOn : B.switchOff; changed.push(i); }
  }
  if (changed.length) S.events.push({ t: 'switch', cells: changed });
}
function exec(S, L, th, s, hooks) {
  switch (s.k) {
    case 'say': S.events.push({ t: 'say', text: s.text }); break;
    case 'showVar': if (!L.shown.includes(s.v)) L.shown.push(s.v); S.events.push({ t: 'vars' }); break;
    case 'set': L.vars[s.v] = s.n; if (L.shown.includes(s.v)) S.events.push({ t: 'vars' }); break;
    case 'change': L.vars[s.v] = Math.max(-999999, Math.min(999999, Math.round(((L.vars[s.v] || 0) + s.n) * 10) / 10)); if (L.shown.includes(s.v)) S.events.push({ t: 'vars' }); break;
    case 'wait': th.wake = S.steps + Math.max(1, Math.round(s.n * 60)); break;
    case 'repeat': th.stack.push({ list: s.do, pc: 0, left: Math.max(1, Math.round(s.n)) }); break;
    case 'forever': th.stack.push({ list: s.do, pc: 0, forever: true }); break;
    case 'if': th.stack.push({ list: cond(S, L, s.cond) ? s.do : s.else || [], pc: 0 }); break;
    case 'show': case 'hide': case 'toggle': flip(S, L, s.c, s.k); break;
    case 'tp': {
      const m = L.markers.get(s.c);
      if (!m) break;
      S.events.push({ t: 'teleport', x: S.p.x, y: S.p.y, z: S.p.z });
      S.p.x = m[0] + 0.5; S.p.y = m[1]; S.p.z = m[2] + 0.5; S.v.x = S.v.y = S.v.z = 0;
      break;
    }
    case 'speed': L.mods.speed = s.n; break;
    case 'jump': L.mods.jump = s.n; break;
    case 'gravity': L.mods.grav = s.n; break;
    case 'gear': L.tgear = { id: s.g, until: S.steps + Math.round(s.n * 60) }; S.events.push({ t: 'gear', id: s.g, secs: s.n }); break;
    case 'respawn': if (hooks && hooks.die) hooks.die(S); break;
    case 'win': if (S.obby) { S.won = true; S.events.push({ t: 'win', x: S.p.x, y: S.p.y, z: S.p.z }); } break;
    case 'sound': S.events.push({ t: 'sound', name: s.s }); break;
  }
}
export const isLogicBlock = (t) => !!(BLOCKS[t] && BLOCKS[t].logic);
