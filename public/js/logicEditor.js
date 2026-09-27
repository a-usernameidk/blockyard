// The Logic editor in the 3D builder: Scratch-style blocks. Pick an event ("When I touch a Trigger pad"),
// then stack blocks under it ("Hide Switch blocks", "Wait 2 seconds", "Repeat 3 times"...).
// It only ever makes plain data (see logic.js), which is checked again on the server.
import { EVENTS, ACTIONS, CATS, CONDS, OPS, LOGIC_SOUNDS, LOGIC_GEAR, LOGIC_LIMITS, cleanLogic, countBlocks } from './logic.js';
import { PALETTE, COLOR_NAMES } from './world.js';

const h = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'value') n.value = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c);
  return n;
};
const EVENT_COLOR = '#ffbf00';
// a new block with its default values
function fresh(k) {
  const A = ACTIONS[k], o = { k };
  if (A.c) o.c = 4;
  if (A.n) o.n = A.n[2];
  if (A.text) o.text = 'Hello!';
  if (A.v) o.v = 'score';
  if (A.gear) o.g = 'speed';
  if (A.sound) o.s = 'coin';
  if (A.cond) o.cond = { a: 'var', v: 'score', op: '>', n: 0 };
  if (A.body) o.do = [];
  if (A.else) o.else = [];
  return o;
}

// opts: { logic, onChange(logic) }. Returns { el, set(logic) }.
export function logicEditor(opts) {
  let logic = cleanLogic(opts.logic || []);
  let menu = null; // the open "add a block" palette
  const root = h('div', { class: 'lg' });
  const count = h('span', { class: 'small lg-count' });
  // the blocks on screen are edited in place; what gets saved is a cleaned copy
  const changed = () => { const clean = cleanLogic(logic); count.textContent = `${clean.length} of ${LOGIC_LIMITS.scripts} scripts, ${countBlocks(clean)} of ${LOGIC_LIMITS.blocks} blocks`; if (opts.onChange) opts.onChange(clean); };
  const redraw = () => { closeMenu(); draw(); };

  // small inputs that live inside blocks
  const numIn = (obj, key, lim, onDone) => {
    const i = h('input', { type: 'number', class: 'lg-num', step: lim[0] < 1 ? '0.1' : '1', min: String(lim[0]), max: String(lim[1]), value: String(obj[key]), 'aria-label': 'Number' });
    i.addEventListener('change', () => { const n = Number(i.value); obj[key] = Number.isFinite(n) ? Math.max(lim[0], Math.min(lim[1], n)) : lim[2]; i.value = String(obj[key]); (onDone || changed)(); });
    return i;
  };
  const colorIn = (obj, key = 'c') => {
    const s = h('select', { class: 'lg-color', 'aria-label': 'Color' }, ...PALETTE.map((c, i) => h('option', { value: String(i) }, COLOR_NAMES[i])));
    s.value = String(obj[key] || 0);
    const paint = () => { s.style.setProperty('--sw', PALETTE[Number(s.value)]); };
    paint();
    s.addEventListener('change', () => { obj[key] = Number(s.value); paint(); changed(); });
    return s;
  };
  const textIn = (obj, key, max, label) => {
    const i = h('input', { class: 'lg-text', maxlength: String(max), value: obj[key] || '', 'aria-label': label });
    i.addEventListener('change', () => { obj[key] = i.value; changed(); });
    return i;
  };
  const varIn = (obj, key = 'v') => {
    const i = textIn(obj, key, LOGIC_LIMITS.name, 'Variable name');
    i.classList.add('lg-var'); i.setAttribute('list', 'lg-vars');
    return i;
  };
  const pick = (obj, key, list, labels, label) => {
    const s = h('select', { 'aria-label': label }, ...list.map((v) => h('option', { value: v }, labels ? labels[v] : v)));
    s.value = obj[key];
    s.addEventListener('change', () => { obj[key] = s.value; changed(); });
    return s;
  };
  const tools = (list, i) => h('span', { class: 'lg-tools' },
    h('button', { type: 'button', class: 'lg-mini', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; changed(); redraw(); } }, '↑'),
    h('button', { type: 'button', class: 'lg-mini', title: 'Move down', 'aria-label': 'Move down', disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; changed(); redraw(); } }, '↓'),
    h('button', { type: 'button', class: 'lg-mini lg-x', title: 'Delete', 'aria-label': 'Delete', onclick: () => { list.splice(i, 1); changed(); redraw(); } }, '✕'));

  function block(list, i) {
    const s = list[i], A = ACTIONS[s.k];
    const parts = [h('b', {}, A.label)];
    if (A.v) parts.push(varIn(s));
    if (A.mid) parts.push(h('span', {}, A.mid));
    if (A.text) parts.push(textIn(s, 'text', LOGIC_LIMITS.text, 'Message'));
    if (A.c) parts.push(colorIn(s));
    if (A.gear) parts.push(pick(s, 'g', Object.keys(LOGIC_GEAR), LOGIC_GEAR, 'Gear'), h('span', {}, 'for'));
    if (A.sound) parts.push(pick(s, 's', LOGIC_SOUNDS, null, 'Sound'));
    if (A.cond) {
      const c = s.cond;
      const vIn = varIn(c); vIn.hidden = c.a !== 'var';
      const aSel = pick(c, 'a', Object.keys(CONDS), CONDS, 'Compare');
      aSel.addEventListener('change', () => { vIn.hidden = c.a !== 'var'; });
      parts.push(aSel, vIn, pick(c, 'op', OPS, null, 'Is'), numIn(c, 'n', [-9999, 9999, 0]));
    }
    if (A.n) parts.push(numIn(s, 'n', A.n));
    if (A.after) parts.push(h('span', {}, A.after));
    const el = h('div', { class: 'lg-block' + (A.body ? ' lg-c' : ''), style: `--cat:${CATS[A.cat].color}` }, h('div', { class: 'lg-row' }, ...parts, tools(list, i)));
    if (A.body) el.append(stack(s.do, 'lg-inner'));
    if (A.else) el.append(h('div', { class: 'lg-row lg-else' }, h('b', {}, 'Else')), stack(s.else, 'lg-inner'));
    return el;
  }
  function stack(list, cls) {
    const wrap = h('div', { class: 'lg-stack ' + (cls || '') });
    list.forEach((_, i) => wrap.append(block(list, i)));
    const add = h('button', { type: 'button', class: 'lg-add' }, '+ Add block');
    add.addEventListener('click', (e) => { e.stopPropagation(); openMenu(add, list); });
    wrap.append(add);
    return wrap;
  }
  function openMenu(anchor, list) {
    closeMenu();
    if (countBlocks(logic) >= LOGIC_LIMITS.blocks) { anchor.textContent = 'Too many blocks'; return; }
    menu = h('div', { class: 'lg-menu', role: 'menu' }, ...Object.entries(CATS).map(([cat, C]) => h('div', { class: 'lg-menu-cat' },
      h('span', { class: 'lg-menu-h', style: `color:${C.color}` }, C.name),
      ...Object.entries(ACTIONS).filter(([, A]) => A.cat === cat).map(([k, A]) => h('button', { type: 'button', role: 'menuitem', class: 'lg-pal', style: `--cat:${C.color}`, onclick: () => { list.push(fresh(k)); changed(); redraw(); } }, A.label)))));
    anchor.after(menu);
  }
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  document.addEventListener('click', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); });

  function draw() {
    const vars = [...new Set(JSON.stringify(logic).match(/"v":"[^"]*"/g) || [])].map((x) => x.slice(5, -1));
    const scripts = logic.map((sc, i) => {
      const E = EVENTS[sc.on];
      const hat = h('div', { class: 'lg-hat', style: `--cat:${EVENT_COLOR}` }, h('div', { class: 'lg-row' },
        h('b', {}, E.label), E.c ? colorIn(sc) : null, E.n ? numIn(sc, 'n', E.n) : null, E.after ? h('span', {}, E.after) : null,
        h('span', { class: 'lg-tools' }, h('button', { type: 'button', class: 'lg-mini lg-x', title: 'Delete this script', 'aria-label': 'Delete this script', onclick: () => { logic.splice(i, 1); changed(); redraw(); } }, '✕'))));
      return h('div', { class: 'lg-script' }, hat, stack(sc.do));
    });
    root.replaceChildren(
      h('datalist', { id: 'lg-vars' }, ...vars.map((v) => h('option', { value: v }))),
      h('div', { class: 'lg-head' },
        h('p', { class: 'small' }, 'Make your world do things, no typing code. Start with an event, then add blocks under it. Scripts use the Logic blocks (Trigger pads, Switch blocks, Markers) by their color, and run for each player.'),
        count),
      h('div', { class: 'lg-new' }, h('span', { class: 'small' }, 'New script:'), ...Object.entries(EVENTS).map(([k, E]) => h('button', { type: 'button', class: 'lg-pal lg-hatbtn', style: `--cat:${EVENT_COLOR}`, disabled: logic.length >= LOGIC_LIMITS.scripts, onclick: () => { const sc = { on: k, do: [] }; if (E.c) sc.c = 4; if (E.n) sc.n = E.n[2]; logic.push(sc); changed(); redraw(); } }, E.label))),
      scripts.length ? h('div', { class: 'lg-scripts' }, ...scripts) : h('p', { class: 'small lg-empty' }, 'No scripts yet. Try: "When I touch a Trigger pad" (red) → "Hide Switch blocks" (red) → "Say: The door is open!" Then place a red Trigger pad and red Switch blocks.'));
  }
  draw();
  count.textContent = `${logic.length} of ${LOGIC_LIMITS.scripts} scripts, ${countBlocks(logic)} of ${LOGIC_LIMITS.blocks} blocks`;
  return { el: root, set(l) { logic = cleanLogic(l || []); redraw(); count.textContent = `${logic.length} of ${LOGIC_LIMITS.scripts} scripts, ${countBlocks(logic)} of ${LOGIC_LIMITS.blocks} blocks`; }, get() { return cleanLogic(logic); } };
}
