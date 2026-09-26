// The 3D builder: fly around, place and break blocks, paint, pick, fill boxes, test your obby,
// and build together with friends live (their edits show up as they make them).
import { createRenderer, M4, hexRGB, raycast } from './gl.js';
import { Grid, decodeBlocks, encodeBlocks, BLOCKS, B, PALETTE, SKIES, MODES, GAME_TYPES, SX, SY, SZ, idx, MAX_BLOCKS, normalizeWorld } from './world.js';
import { avatarParts } from './avatar3d.js';
import { openRoom } from './net.js';
import { sfx, unlockAudio } from './audio.js';
import { startWorld } from './play3d.js';

const h = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c);
  return n;
};
const TOOLS = [['place', 'Place', '1'], ['break', 'Break', '2'], ['paint', 'Paint', '3'], ['pick', 'Pick', '4']];
const ORDER = ['grass', 'dirt', 'stone', 'wood', 'brick', 'sand', 'snow', 'leaves', 'metal', 'plastic', 'neon', 'glass', 'ghost', 'ice', 'lava', 'bounce', 'speed', 'crumble', 'checkpoint', 'beltN', 'beltE', 'beltS', 'beltW', 'teleport', 'moveX', 'moveZ', 'moveY', 'goal', 'spawn', 'coin'];
export const worldSig = (w) => { let hh = 2166136261; const s = (w.mode || '') + '|' + (w.b || ''); for (let i = 0; i < s.length; i++) { hh ^= s.charCodeAt(i); hh = Math.imul(hh, 16777619) >>> 0; } return hh.toString(36) + ':' + s.length; };

// opts: { world, title, me, look, room (ticket fn or null), canPublish, onChange(world), onPublish(world, proof), onFriends(), onExit(), low }
export function startBuilder(root, opts) {
  let meta = { n: opts.world.n || 'My world', mode: opts.world.mode === 'hangout' ? 'hangout' : 'obby', sky: SKIES[opts.world.sky] ? opts.world.sky : 'day', game: opts.world.mode === 'hangout' && GAME_TYPES.includes(opts.world.game) ? opts.world.game : '' };
  const typeOf = (m) => (m.game || m.mode);
  let grid = decodeBlocks(opts.world.b || '');
  let proof = opts.proof || null;
  const ed = { tool: 'place', block: B.plastic, color: 9, box: false, boxA: null, hover: null, undo: [], redo: [] };
  let stopped = false, raf = 0, playing = null;

  /* ---------------- page ---------------- */
  const canvas = h('canvas', { class: 'w3-canvas b3-canvas', 'aria-label': '3D builder. Click to use the tool, drag to look around.' });
  const tags = h('div', { class: 'w3-tags', 'aria-hidden': 'true' });
  const info = h('span', { class: 'w3-pill' });
  const netPill = h('span', { class: 'w3-pill w3-net' }, opts.room ? 'Connecting…' : 'Saved in this browser');
  const who = h('span', { class: 'w3-pill b3-who' });
  const tip = h('div', { class: 'w3-toast' });
  const log = h('ol', { class: 'w3-log' });
  const chatInput = h('input', { class: 'w3-chat-input', maxlength: '200', placeholder: 'Chat with your team', 'aria-label': 'Chat message', autocomplete: 'off' });
  const chatForm = h('form', { class: 'w3-chat-form' }, chatInput, h('button', { class: 'btn', type: 'submit' }, 'Send'));
  const chat = h('div', { class: 'w3-chat b3-chat', hidden: !opts.room }, log, chatForm);
  const stage = h('div', { class: 'w3-stage b3-stage' }, canvas, tags, h('div', { class: 'w3-hud' }, info, who, netPill), tip, chat);
  const nameIn = h('input', { class: 'b3-name', maxlength: '40', value: meta.n, 'aria-label': 'World name' });
  const proofBadge = h('span', { class: 'proof', 'data-ok': 'false' });
  const testBtn = h('button', { class: 'btn btn-grass', type: 'button', title: 'Play your world (T)' }, 'Test');
  const pubBtn = h('button', { class: 'btn btn-sun', type: 'button' }, 'Publish');
  const friendsBtn = h('button', { class: 'btn', type: 'button', hidden: !opts.onFriends }, 'Friends');
  const bar = h('div', { class: 'bar b3-bar' },
    h('button', { class: 'btn', type: 'button', onclick: () => exit() }, 'Back'), nameIn,
    h('div', { class: 'row' }, testBtn, proofBadge, pubBtn, friendsBtn));
  const toolRow = h('div', { class: 'seg', role: 'group', 'aria-label': 'Tool' }, ...TOOLS.map(([id, label, key]) => h('button', { class: 'seg-btn', type: 'button', 'data-tool': id, title: `${label} (${key})`, onclick: () => setTool(id) }, label)));
  const boxBtn = h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', title: 'Box fill: click two corners (B)', onclick: () => setBox(!ed.box) }, 'Box fill');
  const undoBtn = h('button', { class: 'btn', type: 'button', title: 'Undo (Ctrl+Z)', onclick: () => undo() }, 'Undo');
  const redoBtn = h('button', { class: 'btn', type: 'button', title: 'Redo (Ctrl+Y)', onclick: () => redo() }, 'Redo');
  const modeSel = h('select', { 'aria-label': 'World type' }, ...Object.entries(MODES).map(([v, l]) => h('option', { value: v }, l)));
  const skySel = h('select', { 'aria-label': 'Sky' }, ...Object.entries(SKIES).map(([v, s]) => h('option', { value: v }, s.name)));
  modeSel.value = typeOf(meta); skySel.value = meta.sky;
  const palette = h('div', { class: 'b3-blocks' });
  const swatches = h('div', { class: 'swatches b3-colors' });
  const blockTip = h('p', { class: 'small b3-tip' });
  const side = h('div', { class: 'b3-side' },
    h('div', { class: 'b3-tools' }, toolRow, h('div', { class: 'row' }, boxBtn, undoBtn, redoBtn)),
    h('h3', {}, 'Blocks'), palette, h('h3', {}, 'Color'), swatches, blockTip,
    h('h3', {}, 'World'), h('label', {}, 'Type ', modeSel), h('label', {}, 'Sky ', skySel));
  const moveRow = h('div', { class: 'b3-move', 'aria-label': 'Move the camera' },
    ...[['Up', 'up'], ['Forward', 'f'], ['Down', 'down'], ['Left', 'l'], ['Back', 'b'], ['Right', 'r']].map(([l, k]) => h('button', { class: 'tbtn', type: 'button', 'data-mv': k }, l)));
  const hint = h('p', { class: 'hint' }, 'Click to use the tool, drag to look around. W A S D fly, Space up, Shift down, scroll to zoom. Right-click breaks. Keys: 1 Place, 2 Break, 3 Paint, 4 Pick, B box fill, T test, Ctrl+Z undo.');
  const layout = h('div', { class: 'b3' }, side, h('div', { class: 'b3-main' }, stage, moveRow));
  root.replaceChildren(bar, layout, hint);

  let R;
  try { R = createRenderer(canvas, { low: !!opts.low }); }
  catch (e) { stage.replaceChildren(h('div', { class: 'overlay' }, h('div', { class: 'panel' }, h('h2', {}, "3D can't start here"), h('p', {}, e.message)))); return { stop() {} }; }
  R.setSky(meta.sky); R.setGrid(grid);

  /* ---------------- palette ---------------- */
  function renderPalette() {
    palette.replaceChildren(...ORDER.map((id) => {
      const t = B[id], b = BLOCKS[t];
      const col = b.tint ? PALETTE[ed.color] : b.color || '#ffd23f';
      return h('button', { class: 'b3-block', type: 'button', 'aria-pressed': String(ed.block === t), title: b.name + (b.tip ? ': ' + b.tip : ''), onclick: () => { ed.block = t; if (ed.tool !== 'place' && ed.tool !== 'paint') setTool('place'); renderPalette(); } },
        h('span', { class: 'b3-chip' + (b.glow ? ' glow' : '') + (b.see ? ' see' : '') + (id === 'coin' ? ' coin' : ''), style: `--c:${col}` }), b.name);
    }));
    swatches.replaceChildren(...PALETTE.map((c, i) => h('button', { class: 'swatch', type: 'button', style: `background:${c}`, 'aria-label': 'Color ' + (i + 1), 'aria-pressed': String(ed.color === i), onclick: () => { ed.color = i; renderPalette(); } })));
    const b = BLOCKS[ed.block];
    blockTip.textContent = b.tip || (b.tint ? 'Pick a color for this block below.' : '');
    swatches.classList.toggle('dim', !b.tint);
  }
  function setTool(t) {
    ed.tool = t; ed.boxA = null;
    for (const b of toolRow.children) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
    say({ place: 'Place: click a block face to add a block there.', break: 'Break: click a block to remove it.', paint: 'Paint: click a block to change it to the selected block and color.', pick: 'Pick: click a block to copy it.' }[t]);
  }
  function setBox(on) { ed.box = on; ed.boxA = null; boxBtn.setAttribute('aria-pressed', String(on)); say(on ? 'Box fill: click one corner, then the opposite corner.' : ''); }
  let tipT = 0;
  function say(text) { tip.textContent = text || ''; tip.classList.toggle('on', !!text); tipT = 3; }
  renderPalette(); setTool('place');

  /* ---------------- camera ---------------- */
  const cam = { x: 64, y: 14, z: 90, yaw: 0, pitch: -0.45 };
  {
    const sp = [...grid.each()].find((b) => b[3] === B.spawn);
    if (sp) { cam.x = sp[0] + 0.5 + (Math.random() - 0.5) * 6; cam.z = sp[2] + 12; cam.y = sp[1] + 8; }
  }
  const look = () => [Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), -Math.cos(cam.yaw) * Math.cos(cam.pitch)];
  const keys = new Set(), mv = new Set();
  const typing = () => document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT' || document.activeElement.tagName === 'TEXTAREA');
  function onKey(e) {
    if (stopped || playing || !stage.isConnected) return;
    if (document.querySelector('.modal:not([hidden])')) return;
    const down = e.type === 'keydown';
    if (typing()) { if (down && e.key === 'Escape') document.activeElement.blur(); return; }
    const mod = e.ctrlKey || e.metaKey;
    if (down && mod && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (down && mod && e.code === 'KeyY') { e.preventDefault(); redo(); return; }
    if (down && !mod) {
      const t = { Digit1: 'place', Digit2: 'break', Digit3: 'paint', Digit4: 'pick' }[e.code];
      if (t) { setTool(t); return; }
      if (e.code === 'KeyB') { setBox(!ed.box); return; }
      if (e.code === 'KeyT') { test(); return; }
      if (e.key === 'Enter' && opts.room) { e.preventDefault(); chatInput.focus(); return; }
    }
    const k = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', Space: 'up', ShiftLeft: 'down', ShiftRight: 'down', KeyQ: 'tl', KeyE: 'tr' }[e.code];
    if (!k || mod) return;
    e.preventDefault();
    if (down) keys.add(k); else keys.delete(k);
  }
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);
  const clear = () => { keys.clear(); mv.clear(); };
  addEventListener('blur', clear);
  for (const b of moveRow.querySelectorAll('[data-mv]')) {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); mv.add(b.dataset.mv); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => mv.delete(b.dataset.mv));
  }

  /* ---------------- pointing at blocks ---------------- */
  let drag = null, mouse = null;
  function target(sx, sy) {
    const r = R.ray(sx, sy);
    const hit = raycast(grid, r.o, r.d, 90);
    if (hit) return { hit, place: { x: hit.x + hit.nx, y: hit.y + hit.ny, z: hit.z + hit.nz } };
    // nothing hit: aim at the floor of the world
    if (r.d[1] < -0.01) {
      const t = (0 - r.o[1]) / r.d[1];
      const x = Math.floor(r.o[0] + r.d[0] * t), z = Math.floor(r.o[2] + r.d[2] * t);
      if (x >= 0 && z >= 0 && x < SX && z < SZ && t < 120) return { hit: null, place: { x, y: 0, z } };
    }
    return null;
  }
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    unlockAudio();
    if (typing()) document.activeElement.blur();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, button: e.button };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (drag && drag.id === e.pointerId) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
      if (drag.moved) {
        cam.yaw += (e.clientX - drag.x) * 0.006;
        cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch - (e.clientY - drag.y) * 0.005));
      }
      drag.x = e.clientX; drag.y = e.clientY;
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag; drag = null;
    if (d.moved) return;
    const r = canvas.getBoundingClientRect();
    act(e.clientX - r.left, e.clientY - r.top, d.button === 2);
  });
  canvas.addEventListener('pointerleave', () => { mouse = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const f = look(), s = e.deltaY > 0 ? -2 : 2;
    cam.x += f[0] * s; cam.y += f[1] * s; cam.z += f[2] * s;
    clampCam();
  }, { passive: false });
  const clampCam = () => { cam.x = Math.max(-30, Math.min(SX + 30, cam.x)); cam.y = Math.max(-5, Math.min(SY + 40, cam.y)); cam.z = Math.max(-30, Math.min(SZ + 30, cam.z)); };

  function act(sx, sy, rightClick) {
    const tg = target(sx, sy);
    if (!tg) return;
    let tool = ed.tool;
    if (rightClick) tool = 'break';
    if (tool === 'pick') {
      if (!tg.hit) return;
      const t = grid.get(tg.hit.x, tg.hit.y, tg.hit.z);
      ed.block = t; if (BLOCKS[t].tint) ed.color = grid.color(tg.hit.x, tg.hit.y, tg.hit.z);
      renderPalette(); setTool('place'); say(`Picked ${BLOCKS[t].name}.`);
      return;
    }
    const cell = tool === 'place' ? tg.place : tg.hit;
    if (!cell || !grid.inside(cell.x, cell.y, cell.z)) return;
    if (ed.box) {
      if (!ed.boxA) { ed.boxA = { ...cell, tool }; say('Now click the opposite corner.'); return; }
      const a = ed.boxA; ed.boxA = null;
      const x0 = Math.min(a.x, cell.x), x1 = Math.max(a.x, cell.x), y0 = Math.min(a.y, cell.y), y1 = Math.max(a.y, cell.y), z0 = Math.min(a.z, cell.z), z1 = Math.max(a.z, cell.z);
      const vol = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
      if (vol > 8192) { say('That box is too big. Fill up to 8192 blocks at a time.'); return; }
      const list = [];
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        if (a.tool === 'break') list.push([x, y, z, 0, 0]);
        else if (a.tool === 'paint') { if (grid.get(x, y, z)) list.push([x, y, z, ed.block, ed.color]); }
        else list.push([x, y, z, ed.block, ed.color]);
      }
      change(list); say(`Filled ${list.length} blocks.`);
      return;
    }
    if (tool === 'break') { if (!tg.hit) return; change([[cell.x, cell.y, cell.z, 0, 0]]); sfx('break'); }
    else if (tool === 'paint') { if (!tg.hit) return; change([[cell.x, cell.y, cell.z, ed.block, ed.color]]); sfx('place'); }
    else { change([[cell.x, cell.y, cell.z, ed.block, ed.color]]); sfx('place'); }
  }

  /* ---------------- changing blocks (with undo, and sharing with the team) ---------------- */
  let seq = 0;
  const pending = new Map(); // cell index -> seq of my change the server hasn't confirmed yet
  function applyLocal(list) {
    const out = [];
    for (const [x, y, z, t, c] of list) {
      if (!grid.inside(x, y, z)) continue;
      const i = idx(x, y, z), was = grid.t[i], wc = grid.c[i];
      if (t && !was && grid.count >= MAX_BLOCKS) { say(`Worlds can have up to ${MAX_BLOCKS} blocks.`); break; }
      if (t === B.spawn) for (const [sx, sy, sz, st] of spawnList()) if (sx !== x || sy !== y || sz !== z) { out.push([sx, sy, sz, st, grid.color(sx, sy, sz), 0, 0]); grid.set(sx, sy, sz, 0); R.markDirty(sx, sy, sz); }
      if (grid.set(x, y, z, t, c)) { out.push([x, y, z, was, wc, t, grid.color(x, y, z)]); R.markDirty(x, y, z); }
    }
    return out;
  }
  function spawnList() { const s = []; for (const [x, y, z, t] of grid.each()) if (t === B.spawn) s.push([x, y, z, t]); return s; }
  function change(list, { record = true } = {}) {
    const done = applyLocal(list);
    if (!done.length) return;
    if (record) { ed.undo.push(done); if (ed.undo.length > 200) ed.undo.shift(); ed.redo = []; }
    share(done.map((d) => [d[0], d[1], d[2], d[5], d[6]]));
    changed();
  }
  function share(list) {
    if (!room) return;
    for (let k = 0; k < list.length; k += 4000) {
      const part = list.slice(k, k + 4000), n = ++seq;
      for (const b of part) pending.set(idx(b[0], b[1], b[2]), n);
      room.send({ t: 'op', op: { k: 'set', b: part }, n });
    }
  }
  function undo() {
    const d = ed.undo.pop(); if (!d) return;
    ed.redo.push(d);
    applyLocal([...d].reverse().map((x) => [x[0], x[1], x[2], x[3], x[4]]));
    share([...d].reverse().map((x) => [x[0], x[1], x[2], x[3], x[4]]));
    changed();
  }
  function redo() {
    const d = ed.redo.pop(); if (!d) return;
    ed.undo.push(d);
    applyLocal(d.map((x) => [x[0], x[1], x[2], x[5], x[6]]));
    share(d.map((x) => [x[0], x[1], x[2], x[5], x[6]]));
    changed();
  }
  function setMeta(f, send = true) {
    Object.assign(meta, f);
    if (f.sky) { R.setSky(meta.sky); skySel.value = meta.sky; }
    if (f.mode || f.game != null) modeSel.value = typeOf(meta);
    if (f.n && document.activeElement !== nameIn) nameIn.value = meta.n;
    if (send && room) room.send({ t: 'op', op: { k: 'meta', f }, n: ++seq });
    changed();
  }
  modeSel.addEventListener('change', () => { const v = modeSel.value, g = GAME_TYPES.includes(v); setMeta({ mode: g ? 'hangout' : v, game: g ? v : '' }); });
  skySel.addEventListener('change', () => setMeta({ sky: skySel.value }));
  let nameT = 0;
  nameIn.addEventListener('input', () => { meta.n = nameIn.value.trim().slice(0, 40) || 'My world'; clearTimeout(nameT); nameT = setTimeout(() => setMeta({ n: meta.n }), 500); });

  function getWorld() { return { v: 1, n: meta.n, mode: meta.mode, sky: meta.sky, ...(meta.game ? { game: meta.game } : {}), b: encodeBlocks(grid) }; }
  let changeT = 0;
  function changed() {
    clearTimeout(changeT);
    changeT = setTimeout(() => { if (opts.onChange) opts.onChange(getWorld()); renderProof(); }, 500);
    info.textContent = `${grid.count} / ${MAX_BLOCKS} blocks`;
  }
  function renderProof() {
    const w = getWorld();
    const ok = meta.mode === 'hangout' || (proof && proof.sig === worldSig(w));
    proofBadge.dataset.ok = String(!!ok);
    proofBadge.textContent = meta.mode === 'hangout' ? 'Hangouts can publish any time' : ok ? 'Beaten, ready to publish' : 'Not beaten yet';
  }
  info.textContent = `${grid.count} / ${MAX_BLOCKS} blocks`;
  renderProof();

  /* ---------------- building together ---------------- */
  let room = null, myId = null;
  const team = new Map(); // id -> { name, look, c: [camx, camy, camz, hx, hy, hz], tag }
  function addLine(whoName, text, sys) {
    const li = h('li', { class: sys ? 'sys' : '' });
    if (whoName) li.append(h('b', {}, whoName + ': '));
    li.append(text);
    log.append(li);
    while (log.children.length > 50) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }
  function renderTeam() { who.textContent = team.size ? `Building with ${[...team.values()].map((t) => t.name).join(', ')}` : ''; who.hidden = !team.size; }
  function addMate(p) { if (team.has(p.id)) return; const tag = h('div', { class: 'w3-tag' }, h('span', { class: 'w3-name' }, p.name)); tags.append(tag); team.set(p.id, { ...p, c: null, tag }); renderTeam(); }
  function onMessage(m) {
    switch (m.t) {
      case 'hello': {
        myId = m.you;
        for (const t of team.values()) t.tag.remove();
        team.clear();
        for (const p of m.players) addMate(p);
        if (m.doc && m.doc.b != null) {
          // the room's copy is the real one: load it, then re-send anything we did while disconnected
          const mine = pending.size ? [...pending.keys()].map((i) => [i % SX, Math.floor(i / (SX * SZ)), Math.floor(i / SX) % SZ, grid.t[i], grid.c[i]]) : [];
          grid = decodeBlocks(m.doc.b); R.setGrid(grid);
          meta = { n: m.doc.n || meta.n, mode: m.doc.mode, sky: m.doc.sky, game: m.doc.game || '' };
          R.setSky(meta.sky); skySel.value = meta.sky; modeSel.value = typeOf(meta); if (document.activeElement !== nameIn) nameIn.value = meta.n;
          pending.clear();
          if (mine.length) { applyLocal(mine); share(mine); }
          changed();
        }
        netPill.textContent = 'Live: changes save by themselves';
        break;
      }
      case 'join': addMate(m.player); addLine(null, `${m.player.name} is building with you.`, true); sfx('join'); break;
      case 'leave': { const t = team.get(m.id); if (t) { addLine(null, `${t.name} left.`, true); t.tag.remove(); team.delete(m.id); renderTeam(); } break; }
      case 'op': {
        const op = m.op;
        if (op.k === 'meta') { if (m.by !== myId) setMeta(op.f, false); break; }
        if (op.k !== 'set') break;
        const mineAck = m.by === myId;
        const list = [];
        for (const b of op.b) {
          const i = idx(b[0], b[1], b[2]);
          const p = pending.get(i);
          if (mineAck) { if (p !== undefined && p <= m.n) pending.delete(i); continue; }
          if (p !== undefined) continue; // my newer change wins once the server gets it
          list.push(b);
        }
        if (list.length) { applyLocal(list); changed(); }
        break;
      }
      case 'cur': { const t = team.get(m.id); if (t) t.c = m.c; break; }
      case 'chat': addLine(m.n, m.m); if (m.id !== myId) sfx('chat'); break;
      case 'sys': addLine(null, m.m, true); break;
      case 'kicked': case 'error': addLine(null, m.m, true); netPill.textContent = 'Not connected'; say(m.m); break;
    }
  }
  if (opts.room) {
    room = openRoom(opts.room, {
      message: onMessage,
      drop: () => { netPill.textContent = 'Reconnecting…'; },
      closed: (why) => { netPill.textContent = 'Not connected'; addLine(null, why, true); },
      error: (text) => { netPill.textContent = 'Not connected'; addLine(null, text, true); },
    });
  }
  chatForm.addEventListener('submit', (e) => { e.preventDefault(); const t = chatInput.value.trim(); if (t && room) room.send({ t: 'chat', m: t }); chatInput.value = ''; });

  /* ---------------- testing ---------------- */
  function test() {
    const w = getWorld();
    try { normalizeWorld(w); } catch (err) { say(err.message); return; }
    cancelAnimationFrame(raf);
    const holder = h('div', { class: 'b3-test' });
    root.append(holder);
    bar.hidden = true; layout.hidden = true; hint.hidden = true;
    playing = startWorld(holder, {
      world: w, title: 'Testing: ' + meta.n, look: opts.look, me: opts.me, test: true, low: opts.low,
      note: meta.mode === 'obby' ? 'Reach the goal to prove your obby can be beaten.' : 'Walk around your hangout.',
      onWin: (r) => { proof = { sig: worldSig(w), replay: r.replay, time: r.time }; renderProof(); if (opts.onProof) opts.onProof(proof); return { text: 'Proof saved. You can publish it now.' }; },
      onExit: () => { playing.stop(); playing = null; holder.remove(); bar.hidden = false; layout.hidden = false; hint.hidden = false; last = performance.now(); raf = requestAnimationFrame(loop); },
    });
  }
  testBtn.addEventListener('click', test);
  pubBtn.addEventListener('click', () => { const w = getWorld(); if (opts.onPublish) opts.onPublish(w, proof && proof.sig === worldSig(w) ? proof : null, { test }); });
  friendsBtn.addEventListener('click', () => opts.onFriends && opts.onFriends());
  function exit() { if (opts.onChange) opts.onChange(getWorld()); if (room) room.send({ t: 'save' }); if (opts.onExit) opts.onExit(); }

  /* ---------------- drawing ---------------- */
  let last = performance.now(), clock = 0, curT = 0;
  const box = (x, y, z, s = 1.002) => {
    const a = [x - (s - 1) / 2, y - (s - 1) / 2, z - (s - 1) / 2], b = [x + 1 + (s - 1) / 2, y + 1 + (s - 1) / 2, z + 1 + (s - 1) / 2];
    const P = [[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], a[1], b[2]], [a[0], a[1], b[2]], [a[0], b[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]];
    const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    return E.flatMap(([i, j]) => [...P[i], ...P[j]]);
  };
  // a faint grid on the floor of the world, near the camera, to help place the first blocks
  function floorGrid() {
    const pts = [], cx = Math.round(cam.x / 4) * 4, cz = Math.round(cam.z / 4) * 4, R = 28;
    const x0 = Math.max(0, cx - R), x1 = Math.min(SX, cx + R), z0 = Math.max(0, cz - R), z1 = Math.min(SZ, cz + R);
    if (x0 >= x1 || z0 >= z1) return pts;
    for (let x = x0 - (x0 % 4); x <= x1; x += 4) pts.push(x, 0.002, z0, x, 0.002, z1);
    for (let z = z0 - (z0 % 4); z <= z1; z += 4) pts.push(x0, 0.002, z, x1, 0.002, z);
    return pts;
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (stopped || document.hidden) { last = now; return; }
    const dt = Math.min(0.1, (now - last) / 1000); last = now; clock += dt;
    // fly
    const sp = 14 * dt, f = look(), fx = Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const k = new Set([...keys, ...mv]);
    if (k.has('f')) { cam.x += fx * sp; cam.z += fz * sp; }
    if (k.has('b')) { cam.x -= fx * sp; cam.z -= fz * sp; }
    if (k.has('l')) { cam.x += fz * sp; cam.z -= fx * sp; }
    if (k.has('r')) { cam.x -= fz * sp; cam.z += fx * sp; }
    if (k.has('up')) cam.y += sp; if (k.has('down')) cam.y -= sp;
    if (k.has('tl')) cam.yaw -= dt * 1.8; if (k.has('tr')) cam.yaw += dt * 1.8;
    clampCam();
    if (tipT > 0) { tipT -= dt; if (tipT <= 0) tip.classList.remove('on'); }
    const eye = [cam.x, cam.y, cam.z], tgt = [cam.x + f[0], cam.y + f[1], cam.z + f[2]];
    const scene = [], lines = [{ pts: floorGrid(), color: [0.1, 0.14, 0.3, 0.22] }];
    // coins and markers
    for (const [x, y, z, t] of specials()) {
      if (t === B.coin) scene.push({ prim: 'cyl', color: hexRGB('#ffd23f'), glow: 0.35, m: M4.trs(x + 0.5, y + 0.5, z + 0.5, clock * 2, 0, Math.PI / 2, 0.62, 0.1, 0.62) });
    }
    // what the mouse points at
    if (mouse && !drag) {
      const tg = target(mouse.x, mouse.y);
      if (tg) {
        const tool = ed.tool;
        if (tool === 'place' && tg.place && grid.inside(tg.place.x, tg.place.y, tg.place.z)) {
          const b = BLOCKS[ed.block];
          scene.push({ prim: 'cube', color: hexRGB(b.tint ? PALETTE[ed.color] : b.color || '#ffd23f'), alpha: 0.45, glow: 0.3, m: M4.trs(tg.place.x + 0.5, tg.place.y + 0.5, tg.place.z + 0.5, 0, 0, 0, 1.0, 1.0, 1.0) });
          lines.push({ pts: box(tg.place.x, tg.place.y, tg.place.z), color: [1, 1, 1, 0.9] });
        }
        if (tg.hit) lines.push({ pts: box(tg.hit.x, tg.hit.y, tg.hit.z), color: tool === 'break' ? [1, 0.3, 0.4, 1] : [1, 0.36, 0.56, 1] });
        const c = tool === 'place' ? tg.place : tg.hit;
        if (ed.boxA && c) {
          const a = ed.boxA;
          const x0 = Math.min(a.x, c.x), y0 = Math.min(a.y, c.y), z0 = Math.min(a.z, c.z);
          const sx = Math.abs(a.x - c.x) + 1, sy = Math.abs(a.y - c.y) + 1, sz = Math.abs(a.z - c.z) + 1;
          scene.push({ prim: 'cube', color: [1, 0.82, 0.25], alpha: 0.25, m: M4.trs(x0 + sx / 2, y0 + sy / 2, z0 + sz / 2, 0, 0, 0, sx + 0.02, sy + 0.02, sz + 0.02) });
        }
        // tell teammates where I'm looking
        curT -= dt;
        if (room && curT <= 0) { curT = 0.2; room.send({ t: 'cur', c: [cam.x, cam.y, cam.z, tg.hit ? tg.hit.x : tg.place.x, tg.hit ? tg.hit.y : tg.place.y, tg.hit ? tg.hit.z : tg.place.z] }); }
      }
    }
    if (ed.boxA) lines.push({ pts: box(ed.boxA.x, ed.boxA.y, ed.boxA.z, 1.05), color: [1, 0.82, 0.25, 1] });
    // teammates: a floating head where their camera is, and a box around what they point at
    for (const t of team.values()) {
      if (!t.c) { t.tag.hidden = true; continue; }
      const [x, y, z, hx, hy, hz] = t.c;
      if (Math.hypot(x - cam.x, y - cam.y, z - cam.z) > 2.5) avatarParts({ x, y: y - 0.6, z, yaw: 0, t: clock, look: t.look }, scene);
      lines.push({ pts: box(hx, hy, hz, 1.04), color: [...hexRGB((t.look && t.look.color) || '#ff6b35'), 1] });
      const p = R.project(x, y + 1.2, z);
      if (p) { t.tag.hidden = false; t.tag.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`; } else t.tag.hidden = true;
    }
    R.frame({ eye, target: tgt, fov: 1.2, time: clock, parts: scene, lines, far: opts.low ? 160 : 260 });
  }
  let specialCache = null, specialVer = -1, specialGrid = null;
  function specials() {
    if (specialVer !== grid.version || specialGrid !== grid) {
      specialCache = [];
      const T = grid.t;
      for (let i = 0; i < T.length; i++) if (T[i] === B.coin) specialCache.push([i % SX, Math.floor(i / (SX * SZ)), Math.floor(i / SX) % SZ, B.coin]);
      specialVer = grid.version; specialGrid = grid;
    }
    return specialCache;
  }
  raf = requestAnimationFrame(loop);

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    if (playing) playing.stop();
    removeEventListener('keydown', onKey); removeEventListener('keyup', onKey); removeEventListener('blur', clear);
    if (room) { room.send({ t: 'save' }); room.close(); }
    R.destroy();
  }
  return { stop, getWorld, get proof() { return proof; }, setProof(p) { proof = p; renderProof(); }, get room() { return room; } };
}
