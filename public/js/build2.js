// The Engine v2 editor: build a world from free parts, like a simple Roblox Studio (with Blockyard's buttons).
// Tools: Select, Move (arrows), Resize (dots on the faces), Rotate (dots on the axes), snap, undo, copy/paste,
// a Properties panel for the selected parts, a Parts list, World settings, Test and Publish (like v1).
import { createRenderer, M4, hexRGB } from './gl.js';
import { SHAPES2, MATERIALS2, SPECIALS2, cleanPart, normalizeParts, solidOf, rotMat, WORLD2, SIZE2, MAX_PARTS } from './parts.js';
import { rayHit } from './phys2.js';
import { SKIES, PALETTE } from './world.js';
import { MUSIC, isSong } from './cosmetics.js';
import { progress } from './progress.js';
import { startWorld } from './play3d.js';
import { sfx, unlockAudio } from './audio.js';
import { actionOf, sensitivity, invertY, keyName } from './controls.js';
import { GFX } from './settings.js';

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'value') e.value = v; else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c);
  return e;
};
export const worldSig2 = (w) => { let hh = 2166136261; const s = (w.mode || '') + '|' + JSON.stringify(w.parts || []); for (let i = 0; i < s.length; i++) { hh ^= s.charCodeAt(i); hh = Math.imul(hh, 16777619) >>> 0; } return hh.toString(36) + ':' + s.length; };
const TOOLS = [['select', 'Select', '1'], ['move', 'Move', '2'], ['resize', 'Resize', '3'], ['rotate', 'Rotate', '4']];
const SNAPS = [[1, '1'], [0.5, '0.5'], [0.25, '0.25'], [0, 'Off']];
const DEFAULT_SIZE = { box: [4, 1, 4], wedge: [4, 2, 4], corner: [4, 2, 4], cyl: [2, 4, 2], cone: [3, 4, 3], ball: [3, 3, 3], halfcyl: [4, 2, 2], pyramid: [4, 3, 4] };
const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], AXC = ['#ff4d4d', '#44c06a', '#3a86ff'], AXN = ['X', 'Y', 'Z'];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const r3 = (v) => Math.round(v * 1000) / 1000;
// rotation matrix -> turns (degrees), for R = Ry * Rx * Rz
function eulerOf(R) {
  const rx = Math.asin(Math.max(-1, Math.min(1, -R[1][2])));
  let ry, rz;
  if (Math.abs(Math.cos(rx)) > 1e-6) { ry = Math.atan2(R[0][2], R[2][2]); rz = Math.atan2(R[1][0], R[1][1]); } else { ry = Math.atan2(-R[2][0], R[0][0]); rz = 0; }
  const d = (a) => r3(((a * 180 / Math.PI) % 360 + 360) % 360);
  return [d(rx), d(ry), d(rz)];
}
const mul3 = (A, B) => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
const axisRot = (k, deg) => { const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180); return k === 0 ? [[1, 0, 0], [0, c, -s], [0, s, c]] : k === 1 ? [[c, 0, s], [0, 1, 0], [-s, 0, c]] : [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
const mv3 = (R, v) => [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]];

// opts: { world, proof, look, me, hd, onChange(world), onPublish(world, proof, {test}), onProof(proof), onExit() }
export function startBuilder2(root, opts) {
  const src = opts.world || {};
  const meta = { n: src.n || 'My world', mode: src.mode === 'hangout' ? 'hangout' : 'obby', sky: SKIES[src.sky] ? src.sky : 'day', compass: src.compass === true, music: isSong(src.music) ? src.music : '' };
  let parts = (src.parts || []).map((q, i) => { try { return cleanPart(q, i); } catch (e) { return null; } }).filter(Boolean);
  let sel = new Set(), tool = 'select', snap = 1, proof = opts.proof || null, stopped = false, raf = 0, playing = null;
  const undo = [], redo = [];
  let clip = null;

  /* ---------------- page ---------------- */
  const canvas = h('canvas', { class: 'w3-canvas b3-canvas', 'aria-label': 'Engine v2 editor. Click a part to select it, drag the arrows and dots to change it, drag empty space to look around.' });
  const tags = h('div', { class: 'w3-tags', 'aria-hidden': 'true' });
  const info = h('span', { class: 'w3-pill' });
  const tip = h('div', { class: 'w3-toast' });
  const stage = h('div', { class: 'w3-stage b3-stage' }, canvas, tags, h('div', { class: 'w3-hud' }, h('span', { class: 'w3-pill b2-v2' }, 'Engine v2 beta'), info, h('span', { class: 'w3-pill w3-net' }, 'Saved in this browser')), tip);
  const nameIn = h('input', { class: 'b3-name', maxlength: '40', value: meta.n, 'aria-label': 'World name' });
  nameIn.addEventListener('change', () => { meta.n = nameIn.value.trim() || 'My world'; save(); });
  const proofBadge = h('span', { class: 'proof', 'data-ok': 'false' });
  const testBtn = h('button', { class: 'btn btn-grass', type: 'button', title: 'Play your world (T)', onclick: () => test() }, 'Test');
  const pubBtn = h('button', { class: 'btn btn-sun', type: 'button', onclick: () => { const w = getWorld(); if (opts.onPublish) opts.onPublish(w, proof && proof.sig === worldSig2(w) ? proof : null, { test }); } }, 'Publish');
  const bar = h('div', { class: 'bar b3-bar' }, h('button', { class: 'btn', type: 'button', onclick: () => exit() }, 'Back'), nameIn, h('div', { class: 'row' }, testBtn, proofBadge, pubBtn));
  const toolRow = h('div', { class: 'seg', role: 'group', 'aria-label': 'Tool' }, ...TOOLS.map(([id, label, key]) => h('button', { class: 'seg-btn', type: 'button', 'data-tool': id, title: `${label} (${key})`, onclick: () => setTool(id) }, label)));
  const snapRow = h('div', { class: 'seg', role: 'group', 'aria-label': 'Snap' }, ...SNAPS.map(([v, label]) => h('button', { class: 'seg-btn', type: 'button', 'data-snap': String(v), title: v ? `Snap to ${label} studs (turns snap to 15°)` : 'No snapping', onclick: () => setSnap(v) }, label)));
  const btn = (label, title, fn, cls = '') => h('button', { class: 'btn ' + cls, type: 'button', title, onclick: fn }, label);
  const tools = h('div', { class: 'b3-tools' }, toolRow, h('span', { class: 'small b2-lbl' }, 'Snap'), snapRow,
    btn('Duplicate', 'Duplicate (Ctrl+D)', () => duplicate()), btn('Delete', 'Delete (Del)', () => del(), 'btn-danger'),
    btn('Undo', 'Undo (Ctrl+Z)', () => doUndo()), btn('Redo', 'Redo (Ctrl+Y)', () => doRedo()));
  const shapeBtns = h('div', { class: 'b3-grid' }, ...SHAPES2.map((s) => h('button', { class: 'b3-block', type: 'button', title: 'Add a ' + s.name.toLowerCase(), onclick: () => insert(s.id) }, h('span', { class: 'b3-chip', style: '--c:#a3abc2' }), s.name)));
  const props = h('div', { class: 'b2-props' });
  const explorer = h('div', { class: 'b2-explorer' });
  const worldPane = h('div', { class: 'b3-pane', hidden: true });
  const panes = {
    build: h('div', { class: 'b3-pane' }, tools, h('div', { class: 'b3-dock-row b2-row' }, h('div', {}, h('h3', {}, 'Add a part'), shapeBtns, h('h3', {}, 'Properties'), props), h('div', {}, h('h3', {}, 'Parts'), explorer))),
    world: worldPane,
  };
  const tabBtns = Object.keys(panes).map((k) => h('button', { class: 'tab', role: 'tab', type: 'button', 'data-dock': k, 'aria-selected': String(k === 'build'), onclick: () => setDock(k) }, { build: 'Build', world: 'World' }[k]));
  function setDock(k) { for (const b of tabBtns) b.setAttribute('aria-selected', String(b.dataset.dock === k)); for (const [n, p] of Object.entries(panes)) p.hidden = n !== k; }
  const dock = h('div', { class: 'b3-dock' }, h('div', { class: 'tabs b3-dock-tabs', role: 'tablist', 'aria-label': 'Editor tools' }, ...tabBtns), ...Object.values(panes));
  const hint = h('p', { class: 'hint' }, `Click a part to select it (Shift-click for more). Drag the arrows (Move), face dots (Resize) or axis dots (Rotate). Drag empty space to look around; ${['fwd', 'left', 'back', 'right'].map(keyName).join(' ')} fly, ${keyName('jump')} up, ${keyName('shift')} down, scroll to zoom. Arrow keys and Page Up/Down nudge, R turns 90°, F looks at the selection. Keys: 1-4 tools, Ctrl+D duplicate, Ctrl+C / Ctrl+V, Del, Ctrl+Z, T test.`);
  const layout = h('div', { class: 'b3 b3-docked' }, stage, dock);
  root.replaceChildren(bar, layout, hint);

  let R;
  const hd = opts.hd || GFX.pretty.hd;
  try { R = createRenderer(canvas, { hd }); } catch (e) { root.replaceChildren(h('p', { class: 'msg' }, e.message)); return { stop() {}, getWorld: () => src }; }
  if (!R.setParts) { root.replaceChildren(bar, h('div', { class: 'panel-note' }, h('h3', {}, 'The v2 editor needs newer 3D graphics'), h('p', {}, 'Engine v2 needs WebGL 2, which this browser or computer has turned off. Try another browser, or update this one.'))); return { stop() {}, getWorld: () => getWorld() }; }
  R.setSky(meta.sky);

  /* ---------------- the world ---------------- */
  let solids = [];
  const selParts = () => [...sel].sort((a, b) => a - b).map((i) => parts[i]);
  function rebuild(all = true) {
    solids = parts.map(solidOf);
    if (all) R.setParts(parts, (q, i) => sel.has(i), 'main');
    R.setParts(parts, (q, i) => !sel.has(i), 'sel');
  }
  function getWorld() {
    const w = { v: 2, engine: 2, n: meta.n, mode: meta.mode, sky: meta.sky, parts: parts.map((q) => ({ ...q })) };
    if (meta.compass) w.compass = true;
    if (meta.music) w.music = meta.music;
    return w;
  }
  let saveT = 0;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => { if (opts.onChange) opts.onChange(getWorld()); progress.stat('saved'); }, 700); renderProof(); }
  // remember how things were, for undo
  function snapshot() { undo.push(JSON.stringify(parts)); if (undo.length > 60) undo.shift(); redo.length = 0; }
  function doUndo() { if (!undo.length) return say('Nothing to undo.'); redo.push(JSON.stringify(parts)); parts = JSON.parse(undo.pop()); sel = new Set([...sel].filter((i) => i < parts.length)); changed(); }
  function doRedo() { if (!redo.length) return say('Nothing to redo.'); undo.push(JSON.stringify(parts)); parts = JSON.parse(redo.pop()); sel = new Set([...sel].filter((i) => i < parts.length)); changed(); }
  function changed() { rebuild(); drawProps(); drawExplorer(); save(); }
  function selectOnly(list) { sel = new Set(list); rebuild(); drawProps(); drawExplorer(); }

  /* ---------------- tools ---------------- */
  function setTool(t) { tool = t; for (const b of toolRow.children) b.setAttribute('aria-pressed', String(b.dataset.tool === t)); say({ select: 'Select: click parts (Shift-click for more).', move: 'Move: drag an arrow.', resize: 'Resize: drag a dot on a face.', rotate: 'Rotate: drag a dot left or right to turn around that axis.' }[t]); }
  function setSnap(v) { snap = v; for (const b of snapRow.children) b.setAttribute('aria-pressed', String(Number(b.dataset.snap) === v)); }
  const sn = (v) => (snap ? Math.round(v / snap) * snap : r3(v));
  function place(q) { q.p = [Math.max(0, Math.min(WORLD2.x, q.p[0])), Math.max(0, Math.min(WORLD2.y, q.p[1])), Math.max(0, Math.min(WORLD2.z, q.p[2]))]; return q; }
  function insert(shape) {
    if (parts.length >= MAX_PARTS) return say(`That's the most parts a world can have (${MAX_PARTS}).`);
    const size = [...DEFAULT_SIZE[shape]];
    // in front of you, sitting on whatever is there
    const f = look(), d = 8;
    let x = cam.x + f[0] * d, z = cam.z + f[2] * d;
    const r = pickRay(W() / 2, H() / 2);
    const hit = r ? castParts(r.o, r.d, 60) : null;
    if (hit) { x = r.o[0] + r.d[0] * hit.t; z = r.o[2] + r.d[2] * hit.t; }
    let y = 0; for (const s of solids) if (x >= s.min[0] && x <= s.max[0] && z >= s.min[2] && z <= s.max[2] && s.max[1] > y && s.max[1] < cam.y) y = s.max[1];
    snapshot();
    const q = place({ s: shape, p: [snap ? sn(x) : r3(x), r3(y + size[1] / 2), snap ? sn(z) : r3(z)], z: size, r: [0, 0, 0], c: '#a3abc2', m: 'plastic' });
    const last = selParts()[0];
    if (last) { q.c = last.c; q.m = last.m; }
    parts.push(cleanPart(q));
    sel = new Set([parts.length - 1]);
    if (tool === 'select') setTool('move');
    changed(); sfx('place');
  }
  function del() { if (!sel.size) return say('Select a part first.'); snapshot(); parts = parts.filter((_, i) => !sel.has(i)); sel = new Set(); changed(); sfx('break'); }
  function duplicate() {
    if (!sel.size) return say('Select a part first.');
    if (parts.length + sel.size > MAX_PARTS) return say(`That's too many parts (the most is ${MAX_PARTS}).`);
    snapshot();
    const off = snap || 1, add = selParts().map((q) => place({ ...q, p: [q.p[0] + off, q.p[1], q.p[2] + off] }));
    const start = parts.length; parts.push(...add);
    sel = new Set(add.map((_, k) => start + k)); changed();
  }
  function copy() { if (sel.size) { clip = selParts().map((q) => ({ ...q })); say(`Copied ${clip.length} part${clip.length === 1 ? '' : 's'}.`); } }
  function paste() {
    if (!clip) return;
    if (parts.length + clip.length > MAX_PARTS) return say(`That's too many parts (the most is ${MAX_PARTS}).`);
    snapshot();
    const c = center(clip), f = look(), to = [cam.x + f[0] * 10, c[1], cam.z + f[2] * 10];
    const add = clip.map((q) => place({ ...q, p: [sn(q.p[0] - c[0] + to[0]), q.p[1], sn(q.p[2] - c[2] + to[2])] }));
    const start = parts.length; parts.push(...add); sel = new Set(add.map((_, k) => start + k)); changed();
  }
  function nudge(dx, dy, dz) { if (!sel.size) return; snapshot(); const s = snap || 0.25; for (const i of sel) parts[i] = place({ ...parts[i], p: [r3(parts[i].p[0] + dx * s), r3(parts[i].p[1] + dy * s), r3(parts[i].p[2] + dz * s)] }); changed(); }
  function turn90() { if (!sel.size) return; snapshot(); const c = center(selParts()); for (const i of sel) turnPart(i, 1, 90, c); changed(); }
  const center = (list) => { const s = list.map(solidOf); const mn = [0, 1, 2].map((k) => Math.min(...s.map((x) => x.min[k]))), mx = [0, 1, 2].map((k) => Math.max(...s.map((x) => x.max[k]))); return [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2]; };
  // turn a part around a world axis by deg, around point c (so groups turn together)
  function turnPart(i, k, deg, c, base = parts[i]) {
    const Rw = axisRot(k, deg), q = base, R = mul3(Rw, rotMat(q.r));
    const rel = [q.p[0] - c[0], q.p[1] - c[1], q.p[2] - c[2]], np = mv3(Rw, rel);
    parts[i] = place({ ...q, r: eulerOf(R), p: [r3(c[0] + np[0]), r3(c[1] + np[1]), r3(c[2] + np[2])] });
  }

  /* ---------------- Properties ---------------- */
  function drawProps() {
    const list = selParts();
    info.textContent = `${parts.length} / ${MAX_PARTS} parts` + (sel.size ? ` · ${sel.size} selected` : '');
    if (!list.length) { props.replaceChildren(h('p', { class: 'small' }, 'Click a part to see and change it. Add parts with the buttons above.')); return; }
    const q = list[0], many = list.length > 1;
    // change every selected part (one undo step per change)
    const set = (fn) => { snapshot(); for (const i of sel) parts[i] = cleanPart(fn({ ...parts[i] })); changed(); };
    const numRow = (label, key, lo, hi, step) => h('div', { class: 'b2-xyz' }, h('span', { class: 'b2-lbl' }, label), ...[0, 1, 2].map((k) => {
      const inp = h('input', { type: 'number', step: String(step), min: String(lo), max: String(hi), value: String(q[key][k]), 'aria-label': `${label} ${AXN[k]}`, disabled: many && key !== 'z' && key !== 'r' });
      inp.addEventListener('change', () => set((x) => { const v = [...x[key]]; v[k] = Number(inp.value); x[key] = v; return x; }));
      return h('label', {}, h('span', { style: `color:${AXC[k]}` }, AXN[k]), inp);
    }));
    const color = h('input', { type: 'color', value: q.c, 'aria-label': 'Color' });
    color.addEventListener('change', () => set((x) => { x.c = color.value; return x; }));
    const sw = h('div', { class: 'b3-colors row' }, ...PALETTE.map((c) => h('button', { class: 'swatch', type: 'button', style: `background:${c}`, 'aria-label': 'Color ' + c, onclick: () => set((x) => { x.c = c; return x; }) })));
    const pick = (label, value, options, fn) => { const s = h('select', { 'aria-label': label }, ...options.map(([v, n]) => h('option', { value: v }, n))); s.value = value; s.addEventListener('change', () => set((x) => fn(x, s.value))); return h('label', {}, h('span', { class: 'b2-lbl' }, label), s); };
    const slider = (label, key) => { const s = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(q[key] || 0), 'aria-label': label }); s.addEventListener('change', () => set((x) => { x[key] = Number(s.value); return x; })); return h('label', {}, h('span', { class: 'b2-lbl' }, label), s); };
    const walk = h('input', { type: 'checkbox' }); walk.checked = !!q.nc; walk.addEventListener('change', () => set((x) => { x.nc = walk.checked || undefined; if (!x.nc) delete x.nc; return x; }));
    const name = h('input', { maxlength: '30', value: q.n || '', placeholder: many ? `${list.length} parts` : 'No name', 'aria-label': 'Name', disabled: many });
    name.addEventListener('change', () => set((x) => { x.n = name.value; return x; }));
    props.replaceChildren(
      h('div', { class: 'b2-grid' },
        h('label', {}, h('span', { class: 'b2-lbl' }, 'Name'), name),
        pick('Shape', q.s, SHAPES2.map((s) => [s.id, s.name]), (x, v) => { x.s = v; return x; }),
        pick('Material', q.m, MATERIALS2.map((m) => [m.id, m.name]), (x, v) => { x.m = v; return x; }),
        pick('Special', q.k || '', [['', 'None'], ...Object.entries(SPECIALS2)], (x, v) => { if (v) x.k = v; else delete x.k; if (v === 'coin') x.nc = true; return x; }),
        slider('See-through', 't'), slider('Glow', 'g'),
        h('label', { class: 'check' }, walk, ' Players walk through it')),
      numRow('Position', 'p', 0, 1000, snap || 0.05), numRow('Size', 'z', SIZE2.min, SIZE2.max, snap || 0.05), numRow('Turn', 'r', -360, 360, snap ? 15 : 1),
      h('div', { class: 'b2-color' }, h('span', { class: 'b2-lbl' }, 'Color'), color, sw),
      many ? h('p', { class: 'small' }, `Changes go to all ${list.length} selected parts (position: use Move).`) : null);
  }
  function drawExplorer() {
    const show = parts.slice(0, 300);
    explorer.replaceChildren(h('p', { class: 'small' }, `${parts.length} part${parts.length === 1 ? '' : 's'}`),
      h('ol', { class: 'b2-list' }, ...show.map((q, i) => h('li', {}, h('button', { class: 'linkish' + (sel.has(i) ? ' on' : ''), type: 'button', onclick: (e) => { if (e.shiftKey) { if (sel.has(i)) sel.delete(i); else sel.add(i); selectOnly([...sel]); } else selectOnly([i]); } },
        h('span', { class: 'b3-chip', style: `--c:${q.c}` }), `${q.n || (SHAPES2.find((s) => s.id === q.s) || {}).name}${q.k ? ' · ' + q.k : ''}`)))),
      parts.length > show.length ? h('p', { class: 'small' }, `…and ${parts.length - show.length} more (click them in the world).`) : null);
  }
  function drawWorldPane() {
    const mode = h('select', { 'aria-label': 'Type' }, h('option', { value: 'obby' }, 'Obby (reach the goal)'), h('option', { value: 'hangout' }, 'Hangout (just chill)'));
    mode.value = meta.mode; mode.addEventListener('change', () => { meta.mode = mode.value; save(); });
    const sky = h('select', { 'aria-label': 'Sky' }, ...Object.entries(SKIES).map(([k, v]) => h('option', { value: k }, v.name)));
    sky.value = meta.sky; sky.addEventListener('change', () => { meta.sky = sky.value; R.setSky(meta.sky); save(); });
    const comp = h('input', { type: 'checkbox' }); comp.checked = meta.compass; comp.addEventListener('change', () => { meta.compass = comp.checked; save(); });
    const song = h('select', { 'aria-label': 'Song' }, h('option', { value: '' }, 'Normal music'), ...MUSIC.filter((m) => m.id !== 'none' && (progress.owns('music', m.id) || m.id === meta.music)).map((m) => h('option', { value: m.id }, m.name)));
    song.value = meta.music; song.addEventListener('change', () => { meta.music = song.value; save(); });
    worldPane.replaceChildren(h('div', { class: 'b3-world' }, h('label', {}, 'Type ', mode), h('label', {}, 'Sky ', sky), h('label', {}, 'Song ', song)),
      h('label', { class: 'check b3-hotbar' }, comp, ' Compass: shows N, E, S, W at the top of the screen'),
      h('p', { class: 'small' }, 'Every world needs one part set to Spawn (Properties > Special). Obbies need a Goal part too. Coins, checkpoints, kill parts, bounce and speed pads are Specials as well, and any shape can be one.'),
      h('p', { class: 'small' }, 'Engine v2 is in beta: moving parts, water, lights, your own shapes and scripting come in the next updates. Building together and minigames still need Engine v1 for now.'));
  }
  function renderProof() { const ok = !!(proof && proof.sig === worldSig2(getWorld())); proofBadge.dataset.ok = String(ok); proofBadge.textContent = meta.mode === 'obby' ? (ok ? 'Beaten ✓' : 'Not beaten yet') : ''; }

  /* ---------------- camera ---------------- */
  const cam = { x: 500, y: 14, z: 548, yaw: 0, pitch: -0.4 };
  { const sp = parts.find((q) => q.k === 'spawn'); if (sp) { cam.x = sp.p[0]; cam.z = sp.p[2] + 16; cam.y = sp.p[1] + 9; } }
  const look = () => [Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), -Math.cos(cam.yaw) * Math.cos(cam.pitch)];
  const W = () => canvas.clientWidth || 640, H = () => canvas.clientHeight || 400;
  function pickRay(sx, sy) { try { return R.ray(sx, sy); } catch (e) { return null; } }
  function castParts(o, d, maxT = 400) { let best = null; for (let i = 0; i < solids.length; i++) { const t = rayHit(solids[i], o, d, maxT); if (t != null && (!best || t < best.t)) best = { t, i }; } return best; }
  if (location.search.includes('w3test')) window.__b2 = { parts: () => parts, sel: () => [...sel], cam: (x, y, z, yaw, pitch) => Object.assign(cam, { x, y, z, yaw, pitch }), select: (l) => selectOnly(l), stats: () => R.stats, handles: () => handles().map((g) => ({ ...g, s: R.project(...g.at) })) };

  /* ---------------- handles (the arrows and dots) ---------------- */
  // each: { kind: 'move'|'resize'|'rotate', axis: 0-2, sign, at: [x,y,z], dir: world direction, r: pick radius }
  function handles() {
    if (!sel.size || tool === 'select') return [];
    const list = selParts(), c = center(list), one = list.length === 1 ? list[0] : null;
    const dist = Math.hypot(c[0] - cam.x, c[1] - cam.y, c[2] - cam.z), r = Math.max(0.25, dist * 0.022);
    const s = list.map(solidOf), ext = [0, 1, 2].map((k) => (Math.max(...s.map((x) => x.max[k])) - Math.min(...s.map((x) => x.min[k]))) / 2);
    const out = [];
    if (tool === 'move') for (let k = 0; k < 3; k++) { const L = ext[k] + r * 4; out.push({ kind: 'move', axis: k, sign: 1, at: [c[0] + AX[k][0] * L, c[1] + AX[k][1] * L, c[2] + AX[k][2] * L], dir: AX[k], r: r * 1.6, from: c, len: L }); }
    if (tool === 'resize' && one) {
      const Rm = rotMat(one.r);
      for (let k = 0; k < 3; k++) for (const sign of [1, -1]) {
        const u = [Rm[0][k] * sign, Rm[1][k] * sign, Rm[2][k] * sign], L = one.z[k] / 2 + r * 1.5;
        out.push({ kind: 'resize', axis: k, sign, at: [one.p[0] + u[0] * L, one.p[1] + u[1] * L, one.p[2] + u[2] * L], dir: u, r: r * 1.4 });
      }
    }
    if (tool === 'rotate') for (let k = 0; k < 3; k++) { const L = Math.max(...ext) + r * 5; out.push({ kind: 'rotate', axis: k, sign: 1, at: [c[0] + AX[k][0] * L, c[1] + AX[k][1] * L, c[2] + AX[k][2] * L], dir: AX[k], r: r * 1.6, from: c, len: L }); }
    return out;
  }
  const raySphere = (o, d, c, rad) => { const oc = [o[0] - c[0], o[1] - c[1], o[2] - c[2]], b = dot(oc, d), cc = dot(oc, oc) - rad * rad, hh = b * b - cc; return hh < 0 ? null : -b - Math.sqrt(hh); };
  // the point along a line (through p, direction a) closest to a mouse ray
  const alongAxis = (p, a, o, d) => { const w0 = [p[0] - o[0], p[1] - o[1], p[2] - o[2]], b = dot(a, d), dd = dot(a, w0), e = dot(d, w0), den = 1 - b * b; return Math.abs(den) < 1e-6 ? 0 : (b * e - dd) / den; };

  /* ---------------- mouse ---------------- */
  let drag = null;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    unlockAudio();
    const r0 = canvas.getBoundingClientRect(), sx = e.clientX - r0.left, sy = e.clientY - r0.top;
    const ray = pickRay(sx, sy);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, shift: e.shiftKey, look: e.button === 2 };
    if (ray && e.button === 0) {
      let best = null;
      for (const g of handles()) { const t = raySphere(ray.o, ray.d, g.at, g.r); if (t != null && (!best || t < best.t)) best = { t, g }; }
      if (best) {
        const g = best.g;
        drag.handle = g; drag.base = JSON.parse(JSON.stringify(parts)); drag.start = g.kind === 'rotate' ? 0 : alongAxis(g.kind === 'move' ? g.from : g.at, g.dir, ray.o, ray.d);
        drag.undoAt = JSON.stringify(parts);
      }
    }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) drag.moved = true;
    const r0 = canvas.getBoundingClientRect();
    if (drag.handle && drag.moved) {
      const g = drag.handle, ray = pickRay(e.clientX - r0.left, e.clientY - r0.top);
      if (!ray) return;
      if (g.kind === 'move') {
        let d = alongAxis(g.from, g.dir, ray.o, ray.d) - drag.start; d = snap ? Math.round(d / snap) * snap : r3(d);
        for (const i of sel) { const b = drag.base[i]; parts[i] = place({ ...b, p: b.p.map((v, k) => r3(v + g.dir[k] * d)) }); }
      } else if (g.kind === 'resize') {
        const i = [...sel][0], b = drag.base[i];
        let d = alongAxis(g.at, g.dir, ray.o, ray.d) - drag.start; d = snap ? Math.round(d / snap) * snap : r3(d);
        const size = [...b.z]; size[g.axis] = Math.max(SIZE2.min, Math.min(SIZE2.max, r3(b.z[g.axis] + d)));
        if (b.s === 'ball') { size[0] = size[1] = size[2] = size[g.axis]; }
        const grow = size[g.axis] - b.z[g.axis];
        parts[i] = place({ ...b, z: size, p: b.p.map((v, k) => r3(v + g.dir[k] * grow / 2)) });
      } else {
        let deg = (e.clientX - drag.sx) * 0.6; deg = snap ? Math.round(deg / 15) * 15 : Math.round(deg);
        const c = g.from;
        for (const i of sel) turnPart(i, g.axis, deg, c, drag.base[i]);
      }
      rebuild(false);
      return;
    }
    if (drag.moved) {
      const s = sensitivity();
      cam.yaw += (e.clientX - drag.x) * 0.006 * s;
      cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch - (e.clientY - drag.y) * 0.005 * s * (invertY() ? -1 : 1)));
    }
    drag.x = e.clientX; drag.y = e.clientY;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag; drag = null;
    if (d.handle) { if (d.moved) { undo.push(d.undoAt); if (undo.length > 60) undo.shift(); redo.length = 0; changed(); } return; }
    if (d.moved || d.look) return;
    const r0 = canvas.getBoundingClientRect(), ray = pickRay(e.clientX - r0.left, e.clientY - r0.top);
    const hit = ray ? castParts(ray.o, ray.d) : null;
    if (!hit) { if (!d.shift) selectOnly([]); return; }
    if (d.shift) { if (sel.has(hit.i)) sel.delete(hit.i); else sel.add(hit.i); selectOnly([...sel]); }
    else selectOnly([hit.i]);
  });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const f = look(), s = e.deltaY > 0 ? -3 : 3; cam.x += f[0] * s; cam.y += f[1] * s; cam.z += f[2] * s; }, { passive: false });

  /* ---------------- keys ---------------- */
  const keys = new Set();
  const typing = () => document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
  function onKey(e) {
    if (stopped || playing || !stage.isConnected || document.querySelector('.modal:not([hidden])')) return;
    const down = e.type === 'keydown';
    if (typing()) { if (down && e.key === 'Escape') document.activeElement.blur(); return; }
    const mod = e.ctrlKey || e.metaKey;
    if (down && mod) {
      const k = e.code;
      if (k === 'KeyZ') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
      else if (k === 'KeyY') { e.preventDefault(); doRedo(); }
      else if (k === 'KeyD') { e.preventDefault(); duplicate(); }
      else if (k === 'KeyC') { e.preventDefault(); copy(); }
      else if (k === 'KeyV') { e.preventDefault(); paste(); }
      return;
    }
    const mk = { fwd: 'f', back: 'b', left: 'l', right: 'r', jump: 'up', shift: 'down' }[actionOf(e.code)];
    if (mk && !e.code.startsWith('Arrow')) { e.preventDefault(); if (down) keys.add(mk); else keys.delete(mk); return; }
    if (!down) return;
    const t = { Digit1: 'select', Digit2: 'move', Digit3: 'resize', Digit4: 'rotate' }[e.code];
    if (t) return setTool(t);
    if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); del(); return; }
    if (e.code === 'Escape') { selectOnly([]); return; }
    if (e.code === 'KeyT') { test(); return; }
    if (e.code === 'KeyR') { turn90(); return; }
    if (e.code === 'KeyF' && sel.size) { const c = center(selParts()), f = look(); cam.x = c[0] - f[0] * 14; cam.y = c[1] - f[1] * 14; cam.z = c[2] - f[2] * 14; return; }
    // arrows nudge the way the camera faces
    const fwd = Math.abs(Math.sin(cam.yaw)) > Math.abs(Math.cos(cam.yaw)) ? [Math.sign(Math.sin(cam.yaw)), 0] : [0, -Math.sign(Math.cos(cam.yaw))];
    const right = [-fwd[1], fwd[0]];
    const nd = { ArrowUp: fwd, ArrowDown: [-fwd[0], -fwd[1]], ArrowRight: right, ArrowLeft: [-right[0], -right[1]] }[e.code];
    if (nd) { e.preventDefault(); nudge(nd[0], 0, nd[1]); return; }
    if (e.code === 'PageUp') { e.preventDefault(); nudge(0, 1, 0); } else if (e.code === 'PageDown') { e.preventDefault(); nudge(0, -1, 0); }
  }
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);
  const clearKeys = () => keys.clear();
  addEventListener('blur', clearKeys);

  /* ---------------- Test ---------------- */
  function test() {
    let w;
    try { w = normalizeParts(getWorld()).world; } catch (err) { say(err.message); return; }
    cancelAnimationFrame(raf);
    const holder = h('div', { class: 'b3-test' });
    root.append(holder);
    bar.hidden = true; layout.hidden = true; hint.hidden = true;
    playing = startWorld(holder, {
      world: w, title: 'Testing: ' + meta.n, look: opts.look, me: opts.me, test: true,
      note: meta.mode === 'obby' ? 'Reach the goal to prove your obby can be beaten.' : 'Walk around your world.',
      onWin: (r) => { proof = { sig: worldSig2(getWorld()), replay: r.replay, time: r.time }; renderProof(); if (opts.onProof) opts.onProof(proof); return { text: 'Proof saved. You can publish it now.' }; },
      onExit: () => { playing.stop(); playing = null; holder.remove(); bar.hidden = false; layout.hidden = false; hint.hidden = false; last = performance.now(); raf = requestAnimationFrame(loop); },
    });
  }
  function exit() { clearTimeout(saveT); if (opts.onChange) opts.onChange(getWorld()); if (opts.onExit) opts.onExit(); }

  /* ---------------- drawing ---------------- */
  let tipT = 0;
  function say(text) { tip.textContent = text || ''; tip.classList.toggle('on', !!text); tipT = 3; }
  // the 12 edges of a part's box, for the selection outline
  const outline = (q) => {
    const Rm = rotMat(q.r), hz = q.z.map((v) => v / 2), P = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const l = [sx * hz[0], sy * hz[1], sz * hz[2]]; P.push([q.p[0] + Rm[0][0] * l[0] + Rm[0][1] * l[1] + Rm[0][2] * l[2], q.p[1] + Rm[1][0] * l[0] + Rm[1][1] * l[1] + Rm[1][2] * l[2], q.p[2] + Rm[2][0] * l[0] + Rm[2][1] * l[1] + Rm[2][2] * l[2]]); }
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    return E.flatMap(([a, b]) => [...P[a], ...P[b]]);
  };
  let last = performance.now(), clock = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (stopped || document.hidden) { last = now; return; }
    const dt = Math.min(0.1, (now - last) / 1000); last = now; clock += dt;
    if (tipT > 0) { tipT -= dt; if (tipT <= 0) tip.classList.remove('on'); }
    const sp = 22 * dt, fx = Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    if (keys.has('f')) { cam.x += fx * sp; cam.z += fz * sp; } if (keys.has('b')) { cam.x -= fx * sp; cam.z -= fz * sp; }
    if (keys.has('l')) { cam.x += fz * sp; cam.z -= fx * sp; } if (keys.has('r')) { cam.x -= fz * sp; cam.z += fx * sp; }
    if (keys.has('up')) cam.y += sp; if (keys.has('down')) cam.y -= sp;
    cam.x = Math.max(-50, Math.min(WORLD2.x + 50, cam.x)); cam.y = Math.max(-10, Math.min(WORLD2.y + 50, cam.y)); cam.z = Math.max(-50, Math.min(WORLD2.z + 50, cam.z));
    const f = look(), eye = [cam.x, cam.y, cam.z];
    const scene = [], lines = [];
    for (const q of selParts()) lines.push({ pts: outline(q), color: [1, 0.82, 0.24, 1] });
    for (const g of handles()) {
      const col = hexRGB(AXC[g.axis]);
      if (g.kind === 'move') {
        const mid = [(g.from[0] + g.at[0]) / 2, (g.from[1] + g.at[1]) / 2, (g.from[2] + g.at[2]) / 2], len = g.len, w = g.r * 0.28;
        scene.push({ prim: 'cube', color: col, glow: 1, noShadow: true, m: M4.trs(mid[0], mid[1], mid[2], 0, 0, 0, g.axis === 0 ? len : w, g.axis === 1 ? len : w, g.axis === 2 ? len : w) });
        scene.push({ prim: 'cube', color: col, glow: 1, noShadow: true, m: M4.trs(g.at[0], g.at[1], g.at[2], 0, 0, 0, g.r * 1.1, g.r * 1.1, g.r * 1.1) });
      } else scene.push({ prim: 'sphere', color: col, glow: 1, noShadow: true, m: M4.trs(g.at[0], g.at[1], g.at[2], 0, 0, 0, g.r * 1.3, g.r * 1.3, g.r * 1.3) });
    }
    // a faint grid on the ground near the camera
    const g0 = Math.round(cam.x / 4) * 4, h0 = Math.round(cam.z / 4) * 4, pts = [];
    for (let k = -8; k <= 8; k++) { pts.push(g0 + k * 4, 0.01, h0 - 32, g0 + k * 4, 0.01, h0 + 32, g0 - 32, 0.01, h0 + k * 4, g0 + 32, 0.01, h0 + k * 4); }
    lines.push({ pts, color: [1, 1, 1, 0.12] });
    R.frame({ eye, target: [eye[0] + f[0], eye[1] + f[1], eye[2] + f[2]], fov: 1.1, time: clock, parts: scene, lines, far: 420 });
  }
  setTool('select'); setSnap(1); rebuild(); drawProps(); drawExplorer(); drawWorldPane(); renderProof();
  raf = requestAnimationFrame(loop);
  return {
    getWorld, get proof() { return proof; },
    stop() { stopped = true; cancelAnimationFrame(raf); removeEventListener('keydown', onKey); removeEventListener('keyup', onKey); removeEventListener('blur', clearKeys); if (playing) playing.stop(); R.destroy(); },
  };
}
