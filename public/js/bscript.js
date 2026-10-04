// Blockscript: the coding language for Engine v2 worlds. It's made for Blockyard and runs inside its own
// little interpreter, so a script can only touch the world (parts, the player, the screen), never the page,
// the network, files or anything else: no viruses. Every script is limited in how much it can do per step,
// how deep it can call, and how big its lists and text get. It gives the same result on every computer, so
// the server can replay runs with scripts too.
//
//   on start { say("Hi!") }
//   on touch "Button" { door = part("Door")  door.hide()  wait(3)  door.show() }
//   every 1 { score += 1  board("Score", score) }
//   on use { c = near("Can", 4)  if c { c.hide()  fuel += 50 } }
//   fn add(a, b) { return a + b }
//
// Values: numbers, text, true/false, nil, lists [1, 2], parts (part("Name")), functions.

export const LIMITS_BS = { scripts: 20, chars: 20000, opsPerStep: 60000, opsNoWait: 100000, depth: 60, list: 10000, text: 5000, threads: 200 };

/* ---------------- words ---------------- */
// events: the ones in ARG_EVENTS take a name in quotes
const EVENTS = ['start', 'touch', 'leave', 'die', 'coin', 'checkpoint', 'land', 'jump', 'use', 'press', 'message', 'crown', 'uncrown'];
const ARG_EVENTS = ['touch', 'leave', 'press', 'message'];
const KEYWORDS = new Set(['let', 'if', 'else', 'while', 'repeat', 'for', 'in', 'fn', 'return', 'break', 'continue', 'on', 'every', 'and', 'or', 'not', 'true', 'false', 'nil']);
export class BSError extends Error { constructor(msg, line) { super(line ? `Line ${line}: ${msg}` : msg); this.line = line || 0; this.bs = true; } }

function lex(src) {
  const out = []; let i = 0, line = 1;
  const push = (t, v) => out.push({ t, v, line });
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === ';') { i++; continue; }
    if ((c === '/' && src[i + 1] === '/') || c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i; while (j < src.length && /[0-9_]/.test(src[j])) j++;
      if (src[j] === '.' && src[j + 1] !== '.') { j++; while (j < src.length && /[0-9_]/.test(src[j])) j++; }
      push('num', Number(src.slice(i, j).replace(/_/g, ''))); i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i; while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const w = src.slice(i, j); push(KEYWORDS.has(w) ? w : 'name', w); i = j; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\n') throw new BSError('This text has no closing quote.', line);
        if (src[j] === '\\') { const e = src[j + 1]; s += e === 'n' ? '\n' : e === 't' ? '\t' : e; j += 2; } else s += src[j++];
      }
      if (j >= src.length) throw new BSError('This text has no closing quote.', line);
      push('str', s); i = j + 1; continue;
    }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '..', '&&', '||'].includes(two)) { push(two === '&&' ? 'and' : two === '||' ? 'or' : two, two); i += 2; continue; }
    if ('+-*/%<>=()[]{},.!'.includes(c)) { push(c === '!' ? 'not' : c, c); i++; continue; }
    throw new BSError(`I don't know the symbol "${c}".`, line);
  }
  push('eof', null);
  return out;
}

/* ---------------- grammar ---------------- */
export function parse(src) {
  if (typeof src !== 'string') src = '';
  if (src.length > LIMITS_BS.chars) throw new BSError(`A script can be up to ${LIMITS_BS.chars} letters long.`);
  const T = lex(src); let k = 0;
  const peek = () => T[k], next = () => T[k++];
  const is = (t) => T[k].t === t;
  const eat = (t, what) => { if (T[k].t !== t) throw new BSError(`Expected ${what || '"' + t + '"'} here${T[k].t === 'eof' ? ' (the script ended)' : ''}.`, T[k].line); return T[k++]; };
  const block = () => {
    eat('{', '"{"'); const body = [];
    while (!is('}')) { if (is('eof')) throw new BSError('A "{" is missing its "}".', T[k].line); body.push(stmt()); }
    next(); return body;
  };
  function stmt() {
    const tk = peek(), line = tk.line;
    switch (tk.t) {
      case 'let': { next(); const name = eat('name', 'a name').v; eat('=', '"="'); return { k: 'let', name, e: expr(), line }; }
      case 'if': {
        next(); const c = expr(), a = block(); let b = null;
        if (is('else')) { next(); b = is('if') ? [stmt()] : block(); }
        return { k: 'if', c, a, b, line };
      }
      case 'while': { next(); const c = expr(); return { k: 'while', c, body: block(), line }; }
      case 'repeat': { next(); const n = expr(); return { k: 'repeat', n, body: block(), line }; }
      case 'for': {
        next(); const name = eat('name', 'a name').v; eat('in', '"in"'); const a = expr();
        if (is('..')) { next(); const b = expr(); return { k: 'forr', name, a, b, body: block(), line }; }
        return { k: 'forl', name, a, body: block(), line };
      }
      case 'fn': {
        next(); const name = eat('name', 'a name').v; eat('('); const params = [];
        while (!is(')')) { params.push(eat('name', 'a name').v); if (!is(')')) eat(',', '","'); }
        next(); return { k: 'fn', name, params, body: block(), line };
      }
      case 'return': { next(); const e = is('}') ? null : expr(); return { k: 'return', e, line }; }
      case 'break': next(); return { k: 'break', line };
      case 'continue': next(); return { k: 'continue', line };
      case 'on': case 'every': throw new BSError('"on" and "every" go at the top of a script, not inside { }.', line);
      default: {
        const e = expr();
        if (is('=') || is('+=') || is('-=') || is('*=') || is('/=')) {
          const op = next().t;
          if (e.k !== 'var' && e.k !== 'index' && e.k !== 'get') throw new BSError('You can only put a value into a name or a list spot.', line);
          return { k: 'set', to: e, op, e: expr(), line };
        }
        return { k: 'expr', e, line };
      }
    }
  }
  // expressions (lowest to highest): or, and, not, compare, .., + -, * / %, unary -, call/index/member, atom
  function expr() { return or(); }
  function or() { let a = and(); while (is('or')) { const line = next().line; a = { k: 'or', a, b: and(), line }; } return a; }
  function and() { let a = not(); while (is('and')) { const line = next().line; a = { k: 'and', a, b: not(), line }; } return a; }
  function not() { if (is('not')) { const line = next().line; return { k: 'not', a: not(), line }; } return cmp(); }
  function cmp() { let a = add(); while (['==', '!=', '<', '>', '<=', '>='].includes(peek().t)) { const t = next(); a = { k: 'bin', op: t.t, a, b: add(), line: t.line }; } return a; }
  function add() { let a = mul(); while (is('+') || is('-')) { const t = next(); a = { k: 'bin', op: t.t, a, b: mul(), line: t.line }; } return a; }
  function mul() { let a = unary(); while (is('*') || is('/') || is('%')) { const t = next(); a = { k: 'bin', op: t.t, a, b: unary(), line: t.line }; } return a; }
  function unary() { if (is('-')) { const line = next().line; return { k: 'neg', a: unary(), line }; } return post(); }
  function post() {
    let a = atom();
    for (;;) {
      if (is('(')) {
        const line = next().line, args = [];
        while (!is(')')) { args.push(expr()); if (!is(')')) eat(',', 'a ")" to close the "("'); }
        next(); a = { k: 'call', f: a, args, line };
      } else if (is('[')) { const line = next().line; const i = expr(); eat(']'); a = { k: 'index', a, i, line }; }
      else if (is('.') && T[k + 1].t === 'name') { const line = next().line; a = { k: 'get', a, name: next().v, line }; }
      else return a;
    }
  }
  function atom() {
    const t = next();
    switch (t.t) {
      case 'num': return { k: 'lit', v: t.v };
      case 'str': return { k: 'lit', v: t.v };
      case 'true': return { k: 'lit', v: true };
      case 'false': return { k: 'lit', v: false };
      case 'nil': return { k: 'lit', v: null };
      case 'name': return { k: 'var', name: t.v, line: t.line };
      case '(': { const e = expr(); eat(')'); return e; }
      case '[': { const items = []; while (!is(']')) { items.push(expr()); if (!is(']')) eat(',', 'a "]" to close the list'); } next(); return { k: 'list', items, line: t.line }; }
      default: throw new BSError(t.t === 'eof' ? 'The script ended in the middle of something.' : `I didn't expect "${t.v ?? t.t}" here.`, t.line);
    }
  }
  // the top: on start / on touch "X" / on die / on coin / on checkpoint / on win / every N, plus fn and plain lines (run at start)
  const handlers = [], start = [], fns = [];
  while (!is('eof')) {
    const line = peek().line;
    if (is('on')) {
      next(); const ev = eat('name', 'what to listen for (start, touch, leave, use, die, coin, checkpoint)').v;
      if (!EVENTS.includes(ev)) throw new BSError(`"on ${ev}" isn't a thing. Try: on start, on touch "Name", on leave "Name", on use, on press "Button", on message "name", on crown, on uncrown, on die, on coin, on checkpoint, on land, on jump.`, line);
      let arg = null;
      if (ARG_EVENTS.includes(ev)) arg = eat('str', ev === 'press' ? 'the button\'s label in quotes, like on press "Boost"' : ev === 'message' ? 'the message\'s name in quotes, like on message "blast"' : `the part's name in quotes, like on ${ev} "Button"`).v;
      handlers.push({ ev, arg, body: block(), line });
    } else if (is('every')) {
      next(); const e = expr(); handlers.push({ ev: 'every', e, body: block(), line });
    } else if (is('fn')) fns.push(stmt());
    else start.push(stmt());
  }
  return { handlers, start, fns, names: [...src.matchAll(/(?:part|parts|near)\s*\(\s*["']([^"']{1,30})["']/g)].map((m) => m[1]) };
}

/* ---------------- running ---------------- */
const STOP = Symbol('stop');
class Flow { constructor(k, v) { this.k = k; this.v = v; } } // break / continue / return
const r7 = (v) => Math.round(v * 1e7) / 1e7; // the same numbers on every computer
const typeName = (v) => (v === null || v === undefined ? 'nil' : Array.isArray(v) ? 'list' : v && v.__part != null ? 'part' : v && v.__fn ? 'function' : v && v.__obj ? v.__obj : typeof v === 'string' ? 'text' : typeof v);
export const show = (v, d = 0) => {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'number') return String(Math.round(v * 1e6) / 1e6);
  if (typeof v === 'string') return d ? JSON.stringify(v) : v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return d > 2 ? '[…]' : '[' + v.slice(0, 50).map((x) => show(x, d + 1)).join(', ') + (v.length > 50 ? ', …' : '') + ']';
  if (v.__part != null) return 'part "' + (v.name || '#' + (v.__part + 1)) + '"';
  if (v.__fn) return 'function ' + v.name;
  if (v.__obj) return v.__obj;
  return '?';
};
const truthy = (v) => !(v === false || v === null || v === undefined || v === 0 || v === '');

// A world's scripts together. host = what scripts can do in the world (the game or the server gives it).
// host: { tick(), part(name) -> [index...], partGet(i, key), partDo(i, method, args), playerGet(key), playerDo(method, args),
//         say(text), print(text), board(label, value), sound(name), random() }
export function createRunner(scripts, host) {
  const progs = [], errors = [];
  for (const s of (scripts || []).slice(0, LIMITS_BS.scripts)) {
    try { progs.push({ name: s.n || 'Script', ast: parse(s.src || '') }); }
    catch (e) { errors.push({ script: s.n || 'Script', line: e.line || 0, msg: e.message }); }
  }
  const globals = new Map(), threads = [];
  let ops = 0, seed = 12345, tick = 0;
  const R = { errors, globals, threads, progs, host, every: [], touch: new Map(), leave: new Map(), press: new Map(), message: new Map(), ev: {} };
  const err = (p, msg, line) => { const e = { script: p.name, line: line || 0, msg: (line ? `Line ${line}: ` : '') + msg }; if (errors.length < 50) errors.push(e); host.print && host.print('⚠ ' + p.name + ': ' + e.msg); };

  /* built-in functions */
  const num = (v, what, line) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new BSError(`${what} needs a number, not ${typeName(v)}.`, line); return v; };
  const text = (v) => { const s = show(v); return s.length > LIMITS_BS.text ? s.slice(0, LIMITS_BS.text) : s; };
  const partH = (i) => ({ __part: i, name: host.partName(i) });
  const BUILT = Object.assign(Object.create(null), {
    say: (a) => { host.say(text(a[0])); return null; },
    print: (a) => { host.print(a.map((x) => text(x)).join(' ')); return null; },
    board: (a) => { host.board(text(a[0]).slice(0, 24), a.length > 1 ? text(a[1]).slice(0, 40) : null); return null; },
    sound: (a) => { host.sound(text(a[0])); return null; },
    random: (a, line) => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; const f = (seed >>> 8) / 16777216;
      if (!a.length) return f;
      const lo = Math.ceil(num(a[0], 'random', line)), hi = Math.floor(a.length > 1 ? num(a[1], 'random', line) : lo);
      return lo + Math.floor(f * (hi - lo + 1));
    },
    time: () => Math.round(tick / 60 * 1000) / 1000,
    abs: (a, l) => Math.abs(num(a[0], 'abs', l)), floor: (a, l) => Math.floor(num(a[0], 'floor', l)), round: (a, l) => Math.round(num(a[0], 'round', l)),
    ceil: (a, l) => Math.ceil(num(a[0], 'ceil', l)),
    min: (a, l) => Math.min(...a.map((x) => num(x, 'min', l))), max: (a, l) => Math.max(...a.map((x) => num(x, 'max', l))),
    sqrt: (a, l) => r7(Math.sqrt(Math.max(0, num(a[0], 'sqrt', l)))),
    sin: (a, l) => r7(Math.sin(num(a[0], 'sin', l) * Math.PI / 180)), cos: (a, l) => r7(Math.cos(num(a[0], 'cos', l) * Math.PI / 180)),
    len: (a, l) => { const v = a[0]; if (Array.isArray(v) || typeof v === 'string') return v.length; throw new BSError('len needs a list or text.', l); },
    push: (a, l) => { if (!Array.isArray(a[0])) throw new BSError('push needs a list first: push(list, value).', l); if (a[0].length >= LIMITS_BS.list) throw new BSError(`Lists can have up to ${LIMITS_BS.list} things.`, l); a[0].push(a[1] ?? null); return a[0]; },
    pop: (a, l) => { if (!Array.isArray(a[0])) throw new BSError('pop needs a list.', l); return a[0].length ? a[0].pop() : null; },
    str: (a) => text(a[0]),
    num: (a) => { const n = Number(a[0]); return Number.isFinite(n) ? n : null; },
    type: (a) => typeName(a[0]),
    part: (a, l) => { const is = host.find(text(a[0])); if (!is.length) throw new BSError(`There's no part named "${text(a[0])}". Name a part in Properties > Name.`, l); return partH(is[0]); },
    parts: (a) => host.find(text(a[0])).slice(0, LIMITS_BS.list).map(partH),
    kill: () => { host.playerDo('kill', []); return null; },
    win: () => { host.playerDo('win', []); return null; },
    teleport: (a, l) => { host.playerDo('teleport', [num(a[0], 'teleport', l), num(a[1], 'teleport', l), num(a[2], 'teleport', l)]); return null; },
    speed: (a, l) => { host.playerDo('speed', [num(a[0], 'speed', l)]); return null; },
    jump: (a, l) => { host.playerDo('jump', [num(a[0], 'jump', l)]); return null; },
    gravity: (a, l) => { host.playerDo('gravity', [num(a[0], 'gravity', l)]); return null; },
    launch: (a, l) => { host.playerDo('launch', [num(a[0], 'launch', l), num(a[1] ?? 0, 'launch', l), num(a[2] ?? 0, 'launch', l)]); return null; },
    checkpoint: (a, l) => { host.playerDo('checkpoint', a.length ? [num(a[0], 'checkpoint', l), num(a[1], 'checkpoint', l), num(a[2], 'checkpoint', l)] : []); return null; },
    atan2: (a, l) => r7(Math.atan2(num(a[0], 'atan2', l), num(a[1], 'atan2', l)) * 180 / Math.PI),
    // what's close: near("Can", 4) = the closest part named Can within 4 studs (or nil); near(part, 4) = true/false; dist(part) = how far
    near: (a, l) => {
      const d = a.length > 1 ? num(a[1], 'near', l) : 4;
      if (a[0] && a[0].__part != null) return host.dist(a[0].__part) <= d;
      const i = host.near(text(a[0]), d); return i < 0 ? null : partH(i);
    },
    dist: (a, l) => { if (!a[0] || a[0].__part == null) throw new BSError('dist needs a part: dist(part("Door")).', l); return host.dist(a[0].__part); },
    prompt: (a) => { host.prompt(a.length && a[0] != null ? text(a[0]).slice(0, 60) : ''); return null; },
    // vehicles: drive(top speed, turning) turns walking into driving; sail is the same but floats on water; walk() goes back
    // (the third number is how high the seat is, so Pip is drawn sitting in it)
    drive: (a, l) => { host.playerDo('drive', [num(a[0] ?? 30, 'drive', l), num(a[1] ?? 110, 'drive', l), 0, num(a[2] ?? 0, 'drive', l)]); return null; },
    sail: (a, l) => { host.playerDo('drive', [num(a[0] ?? 20, 'sail', l), num(a[1] ?? 80, 'sail', l), 1, num(a[2] ?? 0, 'sail', l)]); return null; },
    walk: () => { host.playerDo('walk', []); return null; },
    // face(90): turn to look east (0 = north, 90 = east, 180 = south, 270 = west). A car drives the way you face.
    face: (a, l) => { host.playerDo('face', [num(a[0], 'face', l)]); return null; },
    // buttons on the screen (and keys 1-9): button("Boost") shows one, button("Boost", false) takes it away
    button: (a) => { host.button(text(a[0]).slice(0, 16), a.length < 2 || truthy(a[1])); return null; },
    // talking to the other players' scripts in the same server: send("blast") runs their on message "blast" { }
    send: (a, l) => { host.send(text(a[0]).slice(0, 20), a.length > 1 && a[1] != null ? num(a[1], 'send', l) : 0); return null; },
    crowned: () => host.crown('name'),
    crownTime: () => host.crown('time'),
    // the look: dark(0.8) dims the sun and sky (lights still shine), mono(true) takes the color away
    dark: (a, l) => { host.fx('dark', Math.max(0, Math.min(1, num(a[0] ?? 0, 'dark', l)))); return null; },
    mono: (a) => { host.fx('mono', a.length ? (truthy(a[0]) ? 1 : 0) : 1); return null; },
    // remembering between visits (hangout worlds only; saved on this device)
    save: (a, l) => { const v = a[1]; if (typeof v !== 'number' && typeof v !== 'string' && typeof v !== 'boolean') throw new BSError('save keeps a number, text or true/false: save("money", 12).', l); host.save(text(a[0]).slice(0, 20), typeof v === 'string' ? v.slice(0, 200) : v); return null; },
    load: (a) => { const v = host.load(text(a[0]).slice(0, 20)); return v === undefined ? (a.length > 1 ? a[1] : null) : v; },
  });
  const PLAYER = { __obj: 'player' };
  const PART_METHODS = ['move', 'moveTo', 'turn', 'turnTo', 'color', 'hide', 'show', 'solid', 'glow', 'see', 'size', 'spin', 'stop', 'follow', 'unfollow'];

  function* call(p, f, args, line, depth) {
    if (f && f.__fn) {
      if (depth > LIMITS_BS.depth) throw new BSError(`Too many functions inside functions (more than ${LIMITS_BS.depth}).`, line);
      const scope = new Map(); f.params.forEach((n, i) => scope.set(n, args[i] ?? null));
      const r = yield* run(p, f.body, [scope, ...f.scopes], depth + 1);
      return r instanceof Flow && r.k === 'return' ? r.v : null;
    }
    if (f && f.__method) {
      const { of, name } = f;
      if (of === PLAYER) { host.playerDo(name, args.map((x) => num(x, 'player.' + name, line))); return null; }
      if (!PART_METHODS.includes(name)) throw new BSError(`Parts can't "${name}". They can: ${PART_METHODS.join(', ')}.`, line);
      if (name === 'color' && !args.length) return host.partGet(of.__part, 'color'); // p.color() reads it
      const clean = args.map((x) => (typeof x === 'string' ? x.slice(0, 20) : typeof x === 'boolean' ? x : num(x, name, line)));
      if (name !== 'color' && clean.some((x) => typeof x === 'string')) throw new BSError(`${name} needs numbers.`, line);
      host.partDo(of.__part, name, clean);
      return of;
    }
    if (typeof f === 'function') return f(args, line);
    throw new BSError(`${show(f, 1)} isn't something you can call.`, line);
  }
  const lookup = (scopes, name, line) => {
    for (const s of scopes) if (s.has(name)) return s.get(name);
    if (globals.has(name)) return globals.get(name);
    if (name === 'player') return PLAYER;
    if (name === 'wait') return 'wait';
    if (name in BUILT) return BUILT[name];
    throw new BSError(`"${name}" isn't set yet. Give it a value first, like ${name} = 0.`, line);
  };
  const assign = (scopes, name, v) => { for (const s of scopes) if (s.has(name)) { s.set(name, v); return; } globals.set(name, v); };
  const count = (line) => {
    ops++;
    if (++curThread.ops > LIMITS_BS.opsNoWait) throw new BSError('This loop runs forever without waiting. Add wait() inside it.', line);
  };
  let curThread = null;

  function* ev(p, e, scopes, depth) {
    switch (e.k) {
      case 'lit': return e.v;
      case 'var': return lookup(scopes, e.name, e.line);
      case 'list': { const out = []; for (const x of e.items) out.push(yield* ev(p, x, scopes, depth)); return out; }
      case 'neg': return -num(yield* ev(p, e.a, scopes, depth), '"-"', e.line);
      case 'not': return !truthy(yield* ev(p, e.a, scopes, depth));
      case 'and': { const a = yield* ev(p, e.a, scopes, depth); return truthy(a) ? yield* ev(p, e.b, scopes, depth) : a; }
      case 'or': { const a = yield* ev(p, e.a, scopes, depth); return truthy(a) ? a : yield* ev(p, e.b, scopes, depth); }
      case 'bin': {
        count(e.line);
        const a = yield* ev(p, e.a, scopes, depth), b = yield* ev(p, e.b, scopes, depth);
        switch (e.op) {
          case '==': return a === b || (a == null && b == null);
          case '!=': return !(a === b || (a == null && b == null));
          case '+':
            if (typeof a === 'string' || typeof b === 'string') { const s = text(a) + text(b); if (s.length > LIMITS_BS.text) throw new BSError(`Text can be up to ${LIMITS_BS.text} letters.`, e.line); return s; }
            if (Array.isArray(a) && Array.isArray(b)) { if (a.length + b.length > LIMITS_BS.list) throw new BSError('That list is too big.', e.line); return a.concat(b); }
            return r7(num(a, '"+"', e.line) + num(b, '"+"', e.line));
          case '-': return r7(num(a, '"-"', e.line) - num(b, '"-"', e.line));
          case '*': return r7(num(a, '"*"', e.line) * num(b, '"*"', e.line));
          case '/': { const d = num(b, '"/"', e.line); if (d === 0) throw new BSError("You can't divide by 0.", e.line); return r7(num(a, '"/"', e.line) / d); }
          case '%': { const d = num(b, '"%"', e.line); if (d === 0) throw new BSError("You can't use % 0.", e.line); const x = num(a, '"%"', e.line); return r7(((x % d) + d) % d); }
          default: {
            if (typeof a === 'string' && typeof b === 'string') return e.op === '<' ? a < b : e.op === '>' ? a > b : e.op === '<=' ? a <= b : a >= b;
            const x = num(a, `"${e.op}"`, e.line), y = num(b, `"${e.op}"`, e.line);
            return e.op === '<' ? x < y : e.op === '>' ? x > y : e.op === '<=' ? x <= y : x >= y;
          }
        }
      }
      case 'index': {
        const a = yield* ev(p, e.a, scopes, depth), i = yield* ev(p, e.i, scopes, depth);
        if (!Array.isArray(a) && typeof a !== 'string') throw new BSError(`Only lists and text have spots [ ], not ${typeName(a)}.`, e.line);
        const n = Math.floor(num(i, 'a list spot', e.line)); const j = n < 0 ? a.length + n : n;
        return j >= 0 && j < a.length ? a[j] : null;
      }
      case 'get': {
        const a = yield* ev(p, e.a, scopes, depth);
        if (a === PLAYER) {
          if (['x', 'y', 'z', 'coins', 'deaths', 'time', 'vel', 'facing', 'driving', 'swimming', 'grounded', 'crowned'].includes(e.name)) return host.playerGet(e.name);
          if (['teleport', 'kill', 'win', 'speed', 'jump', 'gravity', 'launch', 'checkpoint'].includes(e.name)) return { __method: true, of: PLAYER, name: e.name };
          throw new BSError(`player has no "${e.name}". Try player.x, .y, .z, .vel (how fast), .facing, .driving, .swimming, .grounded, .crowned, .coins, .deaths.`, e.line);
        }
        if (a && a.__part != null) {
          if (['x', 'y', 'z', 'sx', 'sy', 'sz', 'rx', 'ry', 'rz', 'hidden'].includes(e.name)) return host.partGet(a.__part, e.name);
          if (e.name === 'name') return a.name;
          if (!PART_METHODS.includes(e.name)) throw new BSError(`Parts don't have "${e.name}". They have .x .y .z .sx .sy .sz .rx .ry .rz .hidden .name and ${PART_METHODS.join(', ')}.`, e.line);
          return { __method: true, of: a, name: e.name };
        }
        if (Array.isArray(a) && e.name === 'len') return a.length;
        throw new BSError(`${typeName(a)} has no ".${e.name}".`, e.line);
      }
      case 'call': {
        count(e.line);
        const f = yield* ev(p, e.f, scopes, depth);
        const args = []; for (const x of e.args) args.push(yield* ev(p, x, scopes, depth));
        if (f === 'wait') {
          const s = args.length ? num(args[0], 'wait', e.line) : 0;
          curThread.ops = 0;
          yield Math.max(1, Math.round(Math.min(3600, Math.max(0, s)) * 60));
          return null;
        }
        return yield* call(p, f, args, e.line, depth);
      }
      default: throw new BSError('Something in this script is broken.', e.line);
    }
  }
  function* run(p, body, scopes, depth) {
    for (const s of body) {
      count(s.line);
      switch (s.k) {
        case 'let': scopes[0].set(s.name, yield* ev(p, s.e, scopes, depth)); break;
        case 'set': {
          let v = yield* ev(p, s.e, scopes, depth);
          if (s.op !== '=') {
            const old = yield* ev(p, s.to, scopes, depth);
            v = yield* ev(p, { k: 'bin', op: s.op[0], a: { k: 'lit', v: old }, b: { k: 'lit', v }, line: s.line }, scopes, depth);
          }
          if (s.to.k === 'var') assign(scopes, s.to.name, v);
          else if (s.to.k === 'index') {
            const a = yield* ev(p, s.to.a, scopes, depth), i = Math.floor(num(yield* ev(p, s.to.i, scopes, depth), 'a list spot', s.line));
            if (!Array.isArray(a)) throw new BSError('Only lists have spots you can change.', s.line);
            if (i < 0 || i > a.length || i >= LIMITS_BS.list) throw new BSError(`That spot (${i}) is outside the list (0 to ${a.length}).`, s.line);
            a[i] = v;
          } else throw new BSError("You can't change that. Use part methods like door.moveTo(x, y, z).", s.line);
          break;
        }
        case 'if': { const r = truthy(yield* ev(p, s.c, scopes, depth)) ? yield* run(p, s.a, [new Map(), ...scopes], depth) : s.b ? yield* run(p, s.b, [new Map(), ...scopes], depth) : null; if (r) return r; break; }
        case 'while': while (truthy(yield* ev(p, s.c, scopes, depth))) { const r = yield* run(p, s.body, [new Map(), ...scopes], depth); if (r) { if (r.k === 'break') break; if (r.k === 'return') return r; } } break;
        case 'repeat': { const n = Math.floor(num(yield* ev(p, s.n, scopes, depth), 'repeat', s.line)); for (let i = 0; i < n; i++) { const r = yield* run(p, s.body, [new Map(), ...scopes], depth); if (r) { if (r.k === 'break') break; if (r.k === 'return') return r; } } break; }
        case 'forr': case 'forl': {
          let list;
          if (s.k === 'forr') { const a = Math.floor(num(yield* ev(p, s.a, scopes, depth), 'for', s.line)), b = Math.floor(num(yield* ev(p, s.b, scopes, depth), 'for', s.line)); list = { a, b }; }
          else { const v = yield* ev(p, s.a, scopes, depth); if (!Array.isArray(v)) throw new BSError('for … in needs a list or a range like 1..10.', s.line); list = v.slice(); }
          const n = Array.isArray(list) ? list.length : Math.max(0, list.b - list.a + 1);
          for (let i = 0; i < n; i++) {
            const sc = new Map([[s.name, Array.isArray(list) ? list[i] : list.a + i]]);
            const r = yield* run(p, s.body, [sc, ...scopes], depth);
            if (r) { if (r.k === 'break') break; if (r.k === 'return') return r; }
          }
          break;
        }
        case 'fn': scopes[0].set(s.name, { __fn: true, name: s.name, params: s.params, body: s.body, scopes }); break;
        case 'return': return new Flow('return', s.e ? yield* ev(p, s.e, scopes, depth) : null);
        case 'break': return new Flow('break');
        case 'continue': return new Flow('continue');
        case 'expr': yield* ev(p, s.e, scopes, depth); break;
      }
    }
    return null;
  }
  const spawn = (p, body, scopes, label) => {
    if (threads.length >= LIMITS_BS.threads) { err(p, `Too many things running at once (${LIMITS_BS.threads}). Use fewer waits in touch events.`); return; }
    threads.push({ p, gen: run(p, body, scopes, 0), wake: tick, ops: 0, label });
  };

  // set up: functions (global), the top lines, and the events
  for (const p of progs) {
    const top = new Map();
    for (const f of p.ast.fns) globals.set(f.name, { __fn: true, name: f.name, params: f.params, body: f.body, scopes: [] });
    R.ev.start = R.ev.start || [];
    if (p.ast.start.length) R.ev.start.push({ p, body: p.ast.start, top });
    for (const h of p.ast.handlers) {
      if (h.ev === 'every') R.every.push({ p, h, next: 0, top });
      else if (ARG_EVENTS.includes(h.ev)) { const m = R[h.ev]; if (!m.has(h.arg)) m.set(h.arg, []); m.get(h.arg).push({ p, body: h.body, top }); }
      else { (R.ev[h.ev] = R.ev[h.ev] || []).push({ p, body: h.body, top }); }
    }
  }

  // events from the game: 'start', 'die', 'coin', 'checkpoint', 'land', 'jump', touch/leave with a part name
  // vars: names the event hands to its { } (a message gives "from" = [name, x, y, z] and "value")
  // (anything that happens before "start" waits for it: the top lines of a script set up names the events use)
  let started = false; const early = [];
  R.fire = (name, arg, vars) => {
    if (!started && name !== 'start') { if (early.length < 50) early.push([name, arg, vars]); return; }
    const list = ARG_EVENTS.includes(name) ? R[name].get(arg) : R.ev[name];
    if (list) for (const x of list) spawn(x.p, x.body, [new Map(vars ? Object.entries(vars) : []), x.top], name);
    if (name === 'start' && !started) { started = true; for (const e of early.splice(0)) R.fire(...e); }
  };
  R.listensTo = (name) => (ARG_EVENTS.includes(name) ? R[name].size > 0 : !!(R.ev[name] && R.ev[name].length));
  // one game step: start 'every' timers, then run every script that's awake (in the same order everywhere)
  R.step = (t) => {
    tick = t; ops = 0;
    for (const x of R.every) {
      if (x.stopped || t < x.next) continue;
      let sec;
      try { curThread = { ops: 0 }; const g = ev(x.p, x.h.e, [x.top], 0); let r = g.next(); while (!r.done) r = g.next(); sec = num(r.value, 'every', x.h.line); }
      catch (e) { err(x.p, e.bs ? e.message.replace(/^Line \d+: /, '') : 'error: ' + e.message, e.line || x.h.line); x.stopped = true; continue; }
      x.next = t + Math.max(1, Math.round(Math.min(3600, Math.max(0.05, sec)) * 60));
      spawn(x.p, x.h.body, [new Map(), x.top], 'every');
    }
    for (let i = 0; i < threads.length; i++) {
      const th = threads[i];
      if (th.wake > t) continue;
      curThread = th;
      try {
        const r = th.gen.next();
        if (r.done) { threads.splice(i--, 1); continue; }
        th.wake = t + r.value;
      } catch (e) {
        err(th.p, e.bs ? e.message.replace(/^Line \d+: /, '') : 'error: ' + (e.message || e), e.line);
        threads.splice(i--, 1);
      }
      if (ops > LIMITS_BS.opsPerStep) break; // the rest wait for the next step
    }
  };
  return R;
}

// Checks scripts without running them: [{ script, line, msg }]
export function checkScripts(scripts) {
  const out = [];
  for (const s of scripts || []) { try { parse(s.src || ''); } catch (e) { out.push({ script: s.n || 'Script', line: e.line || 0, msg: e.message }); } }
  return out;
}
export { STOP };
