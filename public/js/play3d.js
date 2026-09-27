// Playing a 3D world: your Pip, the camera, other players, chat, emotes, coins, checkpoints and the goal.
import { createRenderer, M4, hexRGB } from './gl.js';
import { decodeBlocks, Grid, BLOCKS, B, SX, SY, SZ, PALETTE } from './world.js';
import { createSim, step3, STEP3, packInput, yawIndex, KEY, P3, moverOffset } from './physics3d.js';
import { encodeReplay } from './replay.js';
import { avatarParts, TRAIL3D, EMOTES, petParts } from './avatar3d.js';
import { openRoom } from './net.js';
import { sfx, startMusic, stopMusic, unlockAudio } from './audio.js';
import { store } from './api.js';
import { GAMES, ROUND, WEAPONS, WEAPON_IDS, TYCOON, onHill, inBox, nearBlock } from './games.js';
import { LOGIC_GEAR } from './logic.js';
import { titleText, titleClass, tagPills } from './pfp.js';
const titleName = (id) => titleText(id);
// the name everyone sees (display name, or the username)
const label = (o) => (o && (o.dn || o.name)) || 'Someone';
const tagBits = (tags) => tagPills(tags, (t, name) => h('span', { class: 'lvl tag-' + t }, name));
import { GEAR_MODS, gearAllowed } from './cosmetics.js';
import { GFX, GFX_ORDER, gfxMode, setGfx } from './settings.js';
import { emojiNodes, emojiButton } from './emoji.js';
import { createBots } from './bots3d.js';
import { BOTS, BOT_SKILL } from './games.js';

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
const muted = () => new Set(store.get('muted-players', []));
export function setMutedPlayer(name, on) {
  const m = muted(); if (on) m.add(name.toLowerCase()); else m.delete(name.toLowerCase());
  store.set('muted-players', [...m]);
}
const isMutedPlayer = (name) => muted().has(String(name).toLowerCase());
const EMOTE_LABEL = { wave: 'Wave', dance: 'Dance', cheer: 'Cheer', sit: 'Sit', point: 'Point', flip: 'Flip', spin: 'Spin' };

// opts: { world, title, by, mode, look, me, room (async ticket fn or null), onWin, onExit, onProfile, onTrade, test, low, note }
export function startWorld(root, opts) {
  const world = opts.world;
  const physGrid = decodeBlocks(world.b);
  const viewGrid = decodeBlocks(world.b);
  const obby = world.mode !== 'hangout';
  let S = createSim(world, physGrid);
  // moving platforms are drawn separately (they don't stay in one place)
  const moverDraw = S.info.movers.map(([x, y, z, t, c]) => ({ x, y, z, axis: BLOCKS[t].mover, color: hexRGB(PALETTE[c & 15]) }));
  for (const m of moverDraw) viewGrid.set(m.x, m.y, m.z, 0);
  // pets follow their owner around
  const petFollow = (pet, x, y, z, face, dt) => {
    const bx = x - Math.sin(face) * 1.0 + Math.cos(face) * 0.7, bz = z - Math.cos(face) * 1.0 - Math.sin(face) * 0.7;
    if (!pet.x || Math.hypot(pet.x - x, pet.z - z) > 8 || Math.abs(pet.y - y) > 6) { pet.x = bx; pet.y = y; pet.z = bz; pet.yaw = face; }
    const dx = bx - pet.x, dz = bz - pet.z, d = Math.hypot(dx, dz);
    pet.x += dx * Math.min(1, dt * 5); pet.z += dz * Math.min(1, dt * 5); pet.y += (y - pet.y) * Math.min(1, dt * 8);
    pet.moving = d > 0.15;
    if (pet.moving) pet.yaw = Math.atan2(dx, dz); else { let a = face - pet.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); pet.yaw += a * Math.min(1, dt * 3); }
  };
  const myPet = {};
  // in hangouts, don't pile everyone onto the exact same spot
  const scatter = () => {
    if (obby) return;
    for (let k = 0; k < 8; k++) {
      const x = S.spawn.x + Math.round((Math.random() - 0.5) * 6), z = S.spawn.z + Math.round((Math.random() - 0.5) * 6), y = Math.floor(S.spawn.y);
      const free = (yy) => { const t = physGrid.get(Math.floor(x), yy, Math.floor(z)); return !t || BLOCKS[t].entity || BLOCKS[t].ghost; };
      const t0 = physGrid.get(Math.floor(x), y - 1, Math.floor(z));
      if (free(y) && free(y + 1) && t0 && !BLOCKS[t0].kill && !BLOCKS[t0].entity) { S.p.x = x; S.p.z = z; return; }
    }
  };
  scatter();
  let frames = [], acc = 0, last = performance.now(), raf = 0, stopped = false, paused = false;
  let prevP = { ...S.p };
  const look = { color: '#ff6b35', hat: 'none', trail: 'none', ...(opts.look || {}) };

  /* ---------------- page bits ---------------- */
  const canvas = h('canvas', { class: 'w3-canvas', 'aria-label': '3D world. Use W A S D to move and Space to jump.' });
  const tags = h('div', { class: 'w3-tags', 'aria-hidden': 'true' });
  const pill = (cls) => h('span', { class: 'w3-pill ' + (cls || '') });
  const hudTime = pill(), hudCoins = pill(), hudDeaths = pill(), hudNet = pill('w3-net');
  const toastEl = h('div', { class: 'w3-toast', 'aria-live': 'polite' });
  const fade = h('div', { class: 'w3-fade' });
  const log = h('ol', { class: 'w3-log', 'aria-live': 'polite' });
  const chatInput = h('input', { class: 'w3-chat-input', maxlength: '200', placeholder: 'Press Enter to chat', 'aria-label': 'Chat message', autocomplete: 'off', enterkeyhint: 'send' });
  const chatForm = h('form', { class: 'w3-chat-form' }, chatInput, emojiButton((code) => { chatInput.value = (chatInput.value + ' ' + code).trim().slice(0, 200); chatInput.focus(); }), h('button', { class: 'btn', type: 'submit' }, 'Send'));
  const chat = h('div', { class: 'w3-chat' }, log, chatForm);
  const listBtn = h('button', { class: 'btn w3-players-btn', type: 'button', 'aria-expanded': 'false' }, 'Players');
  const list = h('ul', { class: 'w3-list', hidden: true });
  const players = h('div', { class: 'w3-players' }, listBtn, list);
  const emoteBar = h('div', { class: 'w3-emotes', role: 'group', 'aria-label': 'Emotes' }, ...EMOTES.map((e, i) => h('button', { class: 'btn', type: 'button', title: `${EMOTE_LABEL[e]} (${i + 1})`, onclick: () => emote(e) }, EMOTE_LABEL[e])));
  const menu = h('div', { class: 'w3-menu panel', hidden: true, role: 'dialog' });
  const winBox = h('div', { class: 'overlay w3-win', hidden: true });
  const msgBox = h('div', { class: 'overlay w3-msg' }, h('div', { class: 'panel' }, h('h2', {}, 'Loading world…')));
  const joy = h('div', { class: 'w3-joy', 'aria-hidden': 'true' }, h('div', { class: 'w3-knob' }));
  const jumpBtn = h('button', { class: 'tbtn tbtn-jump w3-jump', type: 'button', 'aria-label': 'Jump' }, 'Jump');
  const hudVars = h('span', { class: 'w3-vars' });
  const sayBox = h('div', { class: 'w3-say', 'aria-live': 'polite', hidden: true });
  const stage = h('div', { class: 'w3-stage' }, canvas, tags, h('div', { class: 'w3-hud' }, hudTime, hudCoins, hudDeaths, hudVars, hudNet), toastEl, sayBox, fade, players, chat, emoteBar, joy, jumpBtn, menu, winBox, msgBox);
  const restartBtn = h('button', { class: 'btn', type: 'button', title: 'Start over from the beginning' }, 'Restart');
  const resetBtn = h('button', { class: 'btn', type: 'button', title: 'Go back to your last checkpoint (R)' }, 'Respawn');
  const inviteBtn = h('button', { class: 'btn', type: 'button', hidden: true }, 'Invite');
  const fullBtn = h('button', { class: 'btn', type: 'button', title: 'Full screen' }, 'Full screen');
  const G3 = opts.gfx || GFX[opts.low ? 'fast' : 'pretty'];
  const gfxBtn = h('button', { class: 'btn', type: 'button', title: 'Graphics quality (click to change)' }, 'Graphics: ' + G3.name + (G3.auto ? ` (${GFX[G3.step].name})` : ''));
  const lockBtn = h('button', { class: 'btn', type: 'button', title: 'Shift lock: the camera follows your mouse and you face where you look (Shift)' }, 'Shift lock');
  const specBtn = h('button', { class: 'btn', type: 'button', title: 'Watch other players (V)' }, 'Spectate');
  const bar = h('div', { class: 'bar w3-bar' },
    h('button', { class: 'btn', type: 'button', onclick: () => opts.onExit && opts.onExit() }, opts.test ? 'Back to building' : 'Leave'),
    h('div', { class: 'bar-title' }, h('h2', {}, opts.title || world.n), h('span', { class: 'by' }, opts.by ? 'by ' + opts.by : opts.game ? 'Minigames' : obby ? 'Obby' : 'Hangout')),
    obby ? restartBtn : null, resetBtn, inviteBtn, specBtn, lockBtn, gfxBtn, fullBtn);
  /* ---------------- admin tools (only for admins) ---------------- */
  const isAdminMe = !!(opts.me && opts.me.admin);
  let fly = false, flySpeed = 12, noProof = false;
  const flyBtn = h('button', { class: 'btn', type: 'button', onclick: () => setFly(!fly) }, 'Fly: off');
  const speedBtns = [6, 12, 24].map((v) => h('button', { class: 'btn' + (v === flySpeed ? ' on' : ''), type: 'button', onclick: (e) => { flySpeed = v; speedBtns.forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } }, v === 6 ? 'Slow' : v === 12 ? 'Fast' : 'Zoom'));
  const shoutIn = h('input', { maxlength: '200', placeholder: 'Big message to this server', 'aria-label': 'Message to everyone in this server' });
  const adminBox = h('div', { class: 'w3-admin panel', hidden: true },
    h('h3', {}, 'Admin'),
    h('div', { class: 'row' }, flyBtn, ...speedBtns),
    h('p', { class: 'small' }, 'F turns flying on and off. Space goes up, C goes down. Runs where you flew don\'t count.'),
    h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); const m = shoutIn.value.trim(); if (m && room) { room.send({ t: 'shout', m }); shoutIn.value = ''; } shoutIn.blur(); } }, shoutIn, h('button', { class: 'btn btn-sun', type: 'submit' }, 'Shout')),
    h('p', { class: 'small' }, 'Click a player in the Players list to go to them, kick them, or manage them.'));
  function setFly(on) {
    fly = on; flyBtn.textContent = on ? 'Fly: on' : 'Fly: off'; flyBtn.classList.toggle('on', on);
    if (on) { noProof = true; S.v.x = S.v.y = S.v.z = 0; toast('Flying!', 1); } else { S.onGround = false; toast('Landing…', 1); }
  }
  if (isAdminMe) {
    bar.append(h('button', { class: 'btn btn-sun', type: 'button', onclick: () => { adminBox.hidden = !adminBox.hidden; } }, 'Admin'));
    stage.append(adminBox);
  }
  const hint = h('p', { class: 'hint hint-keys' }, 'W A S D or arrows to move, Space to jump, drag to look around, scroll to zoom, Q and E turn the camera. Shift turns shift lock on and off. R respawns. Enter to chat, 1 to 7 for emotes.');
  root.replaceChildren(bar, stage, hint);

  let R;
  try { R = createRenderer(canvas, { low: !!G3.low, dpr: G3.dpr }); }
  catch (e) { msgBox.replaceChildren(h('div', { class: 'panel' }, h('h2', {}, "3D can't start here"), h('p', {}, e.message))); return { stop() {} }; }
  R.setSky(world.sky);
  R.setGrid(viewGrid);

  /* ---------------- what's in the world ---------------- */
  const flags = [], goals = [];
  for (const [x, y, z, t] of viewGrid.each()) {
    if (t === B.checkpoint && viewGrid.get(x - 1, y, z) !== B.checkpoint && viewGrid.get(x, y, z - 1) !== B.checkpoint) flags.push({ x: x + 0.5, y: y + 1, z: z + 0.5 });
    if (t === B.goal && viewGrid.get(x - 1, y, z) !== B.goal && viewGrid.get(x, y, z - 1) !== B.goal && viewGrid.get(x, y + 1, z) !== B.goal) goals.push({ x: x + 0.5, y: y + 1, z: z + 0.5 });
  }
  const coins = S.info.coins.map(([x, y, z]) => ({ i: x + z * SX + y * SX * SZ, x: x + 0.5, y: y + 0.5, z: z + 0.5 }));
  let topY = 0;
  for (let y = SY - 1; y >= 0 && !topY; y--) for (let i = y * SX * SZ; i < (y + 1) * SX * SZ; i++) if (viewGrid.t[i]) { topY = y; break; }
  const clouds = Array.from({ length: 10 }, (_, i) => ({ x: (i * 37) % 128, z: (i * 53 + 20) % 128, y: topY + 14 + (i % 3) * 3, w: 8 + (i * 7) % 10, d: 5 + (i * 5) % 7 }));

  /* ---------------- camera ---------------- */
  const cam = { yaw: 0, pitch: 0.38, dist: 8, eye: [0, 0, 0] };
  {
    const g = goals[0] || { x: 64, z: 64 };
    const dx = g.x - S.spawn.x, dz = g.z - S.spawn.z;
    if (Math.hypot(dx, dz) > 1) cam.yaw = Math.atan2(dx, -dz);
  }
  const camSolid = (x, y, z) => { const t = viewGrid.get(Math.floor(x), Math.floor(y), Math.floor(z)); return t && !BLOCKS[t].see && !BLOCKS[t].entity && !BLOCKS[t].ghost; };

  /* ---------------- input ---------------- */
  const keys = new Set();
  let joyVec = null, camDrag = null, joyId = null, jumpTouch = false, emoteNow = null, emoteAt = 0;
  const typing = () => document.activeElement === chatInput;
  function onKey(e) {
    if (stopped || !stage.isConnected) return;
    if (e.target instanceof HTMLInputElement && e.target !== chatInput) return;
    if (document.querySelector('.modal:not([hidden])')) return;
    const down = e.type === 'keydown';
    if (typing()) {
      if (down && e.key === 'Escape') { chatInput.blur(); e.preventDefault(); }
      return;
    }
    if (down && (e.key === 'Enter' || e.key === '/') && room) { e.preventDefault(); chatInput.focus(); return; }
    if (down && e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) { resetPress = true; }
    if (shopOpen) { if (down && e.key === 'Escape') closeShop(); return; }
    if (down && /^Digit[1-7]$/.test(e.code)) { const n = Number(e.code.slice(5)); if (paintWorld && n <= WEAPON_IDS.length) pickWeapon(WEAPON_IDS[n - 1]); else emote(EMOTES[n - 1]); return; }
    if (down && (e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) { setShiftLock(!shiftLock); return; }
    if (down && e.code === 'KeyB' && nearShop) { openShop(); return; }
    if (down && e.code === 'KeyF' && isAdminMe && !e.repeat) { setFly(!fly); return; }
    if (down && e.code === 'KeyV' && !e.repeat) { setSpec(!spec); return; }
    if (spec && down && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD')) { e.preventDefault(); nextSpec(e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : 1); return; }
    const k = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', Space: 'j', KeyQ: 'ql', KeyE: 'qr', KeyC: 'dn', ControlLeft: 'dn' }[e.code];
    if (!k) return;
    e.preventDefault();
    unlockAudio();
    if (down) keys.add(k); else keys.delete(k);
  }
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);
  const clearKeys = () => { keys.clear(); joyVec = null; jumpTouch = false; };
  addEventListener('blur', clearKeys);
  let resetPress = false;
  resetBtn.addEventListener('click', () => { resetPress = true; resetBtn.blur(); });
  restartBtn.addEventListener('click', () => { restart(); restartBtn.blur(); });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    unlockAudio();
    if (typing()) chatInput.blur();
    closeMenu();
    const r = canvas.getBoundingClientRect();
    if (e.pointerType === 'touch' && e.clientX - r.left < r.width * 0.42 && joyId === null) {
      joyId = e.pointerId; joyVec = { ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      joy.style.left = e.clientX - r.left + 'px'; joy.style.top = e.clientY - r.top + 'px'; joy.classList.add('on');
    } else camDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (joyId === e.pointerId && joyVec) {
      const dx = e.clientX - joyVec.ox, dy = e.clientY - joyVec.oy, l = Math.hypot(dx, dy), m = Math.min(l, 44) / (l || 1);
      joyVec.x = dx * m / 44; joyVec.y = dy * m / 44;
      joy.firstChild.style.transform = `translate(${dx * m}px, ${dy * m}px)`;
    } else if (camDrag && camDrag.id === e.pointerId) {
      cam.yaw += (e.clientX - camDrag.x) * 0.008;
      cam.pitch = Math.max(-0.25, Math.min(1.35, cam.pitch + (e.clientY - camDrag.y) * 0.006));
      camDrag.x = e.clientX; camDrag.y = e.clientY;
    }
  });
  const endPointer = (e) => {
    if (joyId === e.pointerId) { joyId = null; joyVec = null; joy.classList.remove('on'); joy.firstChild.style.transform = ''; }
    if (camDrag && camDrag.id === e.pointerId) {
      // a quick click (not a drag) shoots in Paintball
      if (Math.hypot(e.clientX - camDrag.sx, e.clientY - camDrag.sy) < 7 && performance.now() - camDrag.t < 350) { if (paintOn()) shoot(); else if (snowOn()) throwSnow(); }
      camDrag = null;
    }
  };
  canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(2.5, Math.min(18, cam.dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
  /* ----- shift lock: the mouse turns the camera (no dragging) and Pip faces where you look ----- */
  let shiftLock = false, shoulder = 0;
  function setShiftLock(on) {
    shiftLock = on; lockBtn.textContent = on ? 'Shift lock: on' : 'Shift lock'; lockBtn.classList.toggle('on', on);
    stage.classList.toggle('locked', on);
    if (on) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* drag still works */ } toast('Shift lock on. Press Shift or Esc to turn it off.', 1.8); }
    else if (document.pointerLockElement === canvas) document.exitPointerLock();
  }
  lockBtn.addEventListener('click', () => { setShiftLock(!shiftLock); lockBtn.blur(); });
  const onLockChange = () => { if (document.pointerLockElement !== canvas && shiftLock) setShiftLock(false); };
  const onMouseMove = (e) => {
    if (document.pointerLockElement !== canvas) return;
    cam.yaw += e.movementX * 0.0035;
    cam.pitch = Math.max(-0.25, Math.min(1.35, cam.pitch + e.movementY * 0.003));
  };
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('mousemove', onMouseMove);
  jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); unlockAudio(); jumpTouch = true; });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) jumpBtn.addEventListener(ev, () => { jumpTouch = false; });
  fullBtn.addEventListener('click', () => { const el = stage; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); });
  gfxBtn.addEventListener('click', () => { const m = GFX_ORDER[(GFX_ORDER.indexOf(gfxMode()) + 1) % GFX_ORDER.length]; setGfx(m); if (opts.onGraphics) opts.onGraphics(m); });

  function inputBits() {
    if (performance.now() < frozenUntil || spec) return 0;
    let f = keys.has('f'), b = keys.has('b'), l = keys.has('l'), r = keys.has('r');
    if (joyVec) { f = f || joyVec.y < -0.35; b = b || joyVec.y > 0.35; l = l || joyVec.x < -0.35; r = r || joyVec.x > 0.35; }
    let bits = (f ? KEY.fwd : 0) | (b ? KEY.back : 0) | (l ? KEY.left : 0) | (r ? KEY.right : 0) | (keys.has('j') || jumpTouch ? KEY.jump : 0);
    if (resetPress) { bits |= KEY.reset; resetPress = false; }
    return bits;
  }

  /* ---------------- effects ---------------- */
  let parts = [], toastT = 0, trailT = 0;
  function burst(x, y, z, colors, n, speed = 4, up = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      parts.push({ x, y, z, vx: Math.cos(a) * s, vy: up * (0.4 + Math.random()), vz: Math.sin(a) * s, life: 0.6 + Math.random() * 0.4, max: 1, size: 0.12, color: hexRGB(colors[i % colors.length]), g: 12 });
    }
  }
  function toast(text, secs = 1.4) { toastEl.textContent = text; toastEl.classList.add('on'); toastT = secs; }
  function trailFor(p, trail, moving) {
    const cols = TRAIL3D[trail];
    if (!cols || !moving || parts.length > 260) return;
    parts.push({ x: p.x + (Math.random() - 0.5) * 0.4, y: p.y + 0.3 + Math.random() * 0.7, z: p.z + (Math.random() - 0.5) * 0.4, vx: 0, vy: trail === 'fire' || trail === 'bubbles' ? 1.2 : 0.2, vz: 0, life: 0.7, max: 0.7, size: trail === 'bubbles' ? 0.14 : 0.09, color: hexRGB(cols[Math.floor(Math.random() * cols.length)]), g: 0, spin: Math.random() * 6 });
  }
  function handleEvents() {
    for (const e of S.events) {
      switch (e.t) {
        case 'jump': sfx('jump'); break;
        case 'jump2': sfx('jump'); burst(e.x, e.y, e.z, ['#ffffff', '#ffd23f'], 8, 2.5, 1); break;
        case 'land': if (e.v > 16) sfx('land'); burst(e.x, e.y, e.z, ['#ffffff'], 5, 2, 1); break;
        case 'bounce': sfx('bounce'); burst(e.x, e.y, e.z, ['#ff5d8f', '#ffffff'], 10, 3, 4); break;
        case 'speed': sfx('speed'); toast('Speed boost!', 0.9); break;
        case 'coin': sfx('coin'); burst(e.x, e.y, e.z, ['#ffd23f', '#fff6c9'], 8, 2.5, 3); break;
        case 'checkpoint': sfx('checkpoint'); burst(e.x, e.y, e.z, ['#44c06a', '#ffffff'], 12, 3, 4); toast('Checkpoint!'); break;
        case 'crumble': sfx('crumble'); break;
        case 'teleport': sfx('bounce'); burst(e.x, e.y + 0.8, e.z, ['#b06cff', '#ffffff', '#7cc8ff'], 14, 3, 3); burst(S.p.x, S.p.y + 0.8, S.p.z, ['#b06cff', '#ffffff', '#7cc8ff'], 14, 3, 3); toast('Whoosh!', 0.8); break;
        case 'say': logicSay(e.text); break;
        case 'sound': sfx(e.name); break;
        case 'vars': drawVars(); break;
        case 'gear': toast(e.id ? `You got the ${LOGIC_GEAR[e.id] || 'gear'} for ${e.secs} seconds!` : 'Your borrowed gear ran out.', 2); if (e.id) sfx('badge'); break;
        case 'switch': for (const i of e.cells) { viewGrid.t[i] = physGrid.t[i]; viewGrid.c[i] = physGrid.c[i]; R.markDirty(i % SX, Math.floor(i / (SX * SZ)), Math.floor(i / SX) % SZ); } break;
        case 'die': sfx('die'); burst(e.x, e.y + 0.6, e.z, [look.color, '#ffffff'], 16, 4, 4); fade.classList.remove('on'); void fade.offsetWidth; fade.classList.add('on'); break;
        case 'win':
          sfx('win');
          if (inRound && rs.mode === 'race') { if (room) room.send({ t: 'fin' }); toast('Finished!', 2); }
          else won();
          break;
      }
    }
    S.events.length = 0;
  }

  /* ---------------- Logic: messages and variables from the world's scripts ---------------- */
  let sayT = 0;
  function logicSay(text) { sayBox.textContent = text; sayBox.hidden = false; clearTimeout(sayT); sayT = setTimeout(() => { sayBox.hidden = true; }, 3500); sfx('pop'); }
  function drawVars() {
    const L = S.logic;
    hudVars.replaceChildren(...(L ? L.shown.map((v) => h('span', { class: 'w3-pill w3-var' }, `${v}: ${L.vars[v] || 0}`)) : []));
  }

  /* ---------------- multiplayer ---------------- */
  const others = new Map();
  let myId = null, room = null, lastSend = 0, lastSent = '', online = false;
  function addLine(who, text, color, sys) {
    const li = h('li', { class: sys === 'big' ? 'sys big' : sys ? 'sys' : '' });
    if (who) li.append(h('b', { style: color ? `color:${color}` : null }, who + ': '));
    li.append(...(sys ? [text] : emojiNodes(text, 20)));
    log.append(li);
    while (log.children.length > 60) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
    li.dataset.at = String(performance.now());
    // admin shouts and announcements go away after a minute
    if (sys === 'big') setTimeout(() => li.remove(), 60000);
  }
  function addPlayer(p) {
    if (others.has(p.id)) return;
    const tag = h('div', { class: 'w3-tag' }, h('span', { class: 'w3-name' + (p.admin ? ' admin' : '') }, p.lvl ? h('span', { class: 'lvl' }, `Lv ${p.lvl}`) : null, p.role === 'builder' ? h('span', { class: 'lvl builder' }, 'Builder') : p.role === 'builderpro' ? h('span', { class: 'lvl builder' }, 'Builder Pro') : null, ...tagBits(p.tags), label(p), titleName(p.title) ? h('span', { class: 'w3-title' + titleClass(p.title) }, titleName(p.title)) : null), h('span', { class: 'w3-bubble', hidden: true }));
    tags.append(tag);
    others.set(p.id, { ...p, snaps: p.p ? [{ t: performance.now(), p: p.p, r: p.r || 0, a: p.a || 0 }] : [], tag, walk: 0, bubbleUntil: 0, emote: null, et: 0, trailT: 0 });
    renderList();
  }
  function removePlayer(id) { const o = others.get(id); if (!o) return; o.tag.remove(); others.delete(id); renderList(); }
  function renderList() {
    listBtn.textContent = `Players ${others.size + 1}`;
    list.replaceChildren(h('li', { class: 'me' }, h('span', { class: 'dot', style: `background:${look.color}` }), (opts.me && (opts.me.display || opts.me.name)) || 'You', ' (you)'),
      ...[...others.values()].map((o) => h('li', {}, h('button', { class: 'linkish', type: 'button', onclick: (e) => openMenu(o, e) }, h('span', { class: 'dot', style: `background:${(o.look && o.look.color) || '#ff6b35'}` }), label(o), o.dn ? h('span', { class: 'small' }, ' @' + o.name) : null, isMutedPlayer(o.name) ? ' (muted)' : ''))));
  }
  listBtn.addEventListener('click', () => { list.hidden = !list.hidden; listBtn.setAttribute('aria-expanded', String(!list.hidden)); });
  function closeMenu() { menu.hidden = true; }
  function openMenu(o) {
    if (String(o.id).startsWith('bot')) { menu.replaceChildren(h('h3', {}, label(o)), h('p', { class: 'small' }, "A bot. It's here to practice with. Rounds with bots don't pay coins."), h('button', { class: 'btn w3-menu-x', type: 'button', onclick: closeMenu }, 'Close')); menu.hidden = false; return; }
    const m = isMutedPlayer(o.name);
    const reasons = h('select', { 'aria-label': 'Why are you reporting them?' }, ...[['mean', 'Mean or bullying'], ['spam', 'Spamming'], ['personal', 'Asking for or sharing personal info'], ['cheating', 'Cheating'], ['other', 'Something else']].map(([v, l]) => h('option', { value: v }, l)));
    const reportRow = h('div', { class: 'w3-report', hidden: true }, reasons, h('button', { class: 'btn btn-danger', type: 'button', onclick: () => { if (room) room.send({ t: 'report', id: o.id, reason: reasons.value }); closeMenu(); } }, 'Send report'));
    menu.replaceChildren(
      h('h3', {}, label(o), o.dn ? h('span', { class: 'small' }, ' @' + o.name) : null),
      h('div', { class: 'w3-menu-row' },
        opts.onProfile ? h('button', { class: 'btn', type: 'button', onclick: () => opts.onProfile(o.name) }, 'Profile') : null,
        opts.onLiveTrade ? h('button', { class: 'btn btn-sun', type: 'button', onclick: () => { clearKeys(); closeMenu(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); opts.onLiveTrade(o.name); } }, 'Live trade') : null,
        opts.onTrade ? h('button', { class: 'btn', type: 'button', onclick: () => opts.onTrade(o.name) }, 'Trade offer') : null,
        opts.onMessage ? h('button', { class: 'btn', type: 'button', onclick: () => { clearKeys(); closeMenu(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); opts.onMessage(o.name); } }, 'Message') : null,
        h('button', { class: 'btn', type: 'button', onclick: () => { setMutedPlayer(o.name, !m); renderList(); closeMenu(); toast(m ? `${o.name} unmuted` : `${o.name} muted. You won't see their chat.`, 2); } }, m ? 'Unmute' : 'Mute'),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { reportRow.hidden = false; } }, 'Report')),
      isAdminMe ? h('div', { class: 'w3-menu-row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { if (o.pos) { noProof = true; S.p.x = o.pos[0]; S.p.y = o.pos[1] + 0.2; S.p.z = o.pos[2]; S.v.x = S.v.y = S.v.z = 0; prevP = { ...S.p }; toast(`Went to ${o.name}`, 1.2); } closeMenu(); } }, 'Go to them'),
        opts.onKick ? h('button', { class: 'btn btn-danger', type: 'button', onclick: () => { opts.onKick(o.name); closeMenu(); } }, 'Kick') : null,
        opts.onManage ? h('button', { class: 'btn', type: 'button', onclick: () => { clearKeys(); opts.onManage(o.name); closeMenu(); } }, 'Manage') : null) : null,
      reportRow,
      h('button', { class: 'btn w3-menu-x', type: 'button', onclick: closeMenu, 'aria-label': 'Close' }, 'Close'));
    menu.hidden = false;
  }
  function onMessage(m) {
    switch (m.t) {
      case 'hello':
        myId = m.you; online = true;
        for (const o of [...others.keys()]) removePlayer(o);
        for (const p of m.players) addPlayer(p);
        log.replaceChildren();
        for (const c of m.chat || []) if (!isMutedPlayer(c.n)) addLine(c.n, c.m, null);
        addLine(null, others.size ? `You joined. ${others.size} other ${others.size === 1 ? 'player is' : 'players are'} here.` : 'You joined. Nobody else is here yet. Press Invite to bring a friend.', null, true);
        if (m.code) { inviteBtn.hidden = false; inviteBtn.onclick = () => invite(m.code); }
        lastSent = '';
        if (m.round) onRound(m.round);
        setupBots(m.bots, m.players.filter((p) => String(p.id).startsWith('bot')).map((p) => p.id));
        break;
      case 'botcfg':
        setupBots({ n: m.n, skill: m.skill, host: m.host === myId, owner: botInfo && botInfo.owner }, Array.from({ length: m.n }, (_, i) => 'bot' + (i + 1)));
        addLine(null, m.n ? `${m.n} ${BOT_SKILL[m.skill].name} bot${m.n > 1 ? 's' : ''} joined.` : 'The bots left.', null, true);
        break;
      case 'join': addPlayer(m.player); addLine(null, `${label(m.player)} joined.`, null, true); sfx('join'); break;
      case 'leave': { const o = others.get(m.id); if (o) { addLine(null, `${label(o)} left.`, null, true); sfx('leave'); } removePlayer(m.id); break; }
      case 'st': { const o = others.get(m.id); if (o) { o.snaps.push({ t: performance.now(), p: m.p, r: m.r, a: m.a }); if (o.snaps.length > 12) o.snaps.shift(); } break; }
      case 'chat': {
        if (isMutedPlayer(m.n)) break;
        const o = others.get(m.id);
        addLine(m.dn || m.n, m.m, o && o.look ? o.look.color : m.id === myId ? look.color : null);
        if (o) { const b = o.tag.querySelector('.w3-bubble'); b.replaceChildren(...emojiNodes(m.m, 20)); b.hidden = false; o.bubbleUntil = performance.now() + 6000; }
        if (m.id === myId) { myBubble.replaceChildren(...emojiNodes(m.m, 20)); myBubble.hidden = false; myBubbleUntil = performance.now() + 6000; }
        else sfx('chat');
        break;
      }
      case 'emote': { const o = others.get(m.id); if (o) { o.emote = m.e; o.et = 0; } break; }
      case 'look': { const o = others.get(m.id); if (o) { o.look = m.look; renderList(); } break; }
      case 'sys': addLine(null, m.m, null, m.big ? 'big' : true); break;
      case 'kicked': case 'full': case 'error': showMsg(m.m, true); break;
      case 'round': onRound(m); break;
      case 'paint': onPaint(m); break;
      case 'throw': if (opts.snow && Array.isArray(m.o) && Array.isArray(m.d)) addSnowball(m.o, m.d, m.id); break;
      case 'prize': toast(m.coins ? `+${m.coins} coins!` : "You won! (You've hit today's minigame coin limit.)", 2.5); sfx('coin'); if (opts.onPrize) opts.onPrize(); break;
    }
  }
  // Invite: copy the link, or invite a friend right from here (they get a pop-up with a Join button)
  const invitePanel = h('div', { class: 'w3-admin panel w3-invite', hidden: true });
  stage.append(invitePanel);
  async function invite(code) {
    const url = location.href.split('#')[0] + '#/join/' + code;
    if (!invitePanel.hidden) { invitePanel.hidden = true; return; }
    const copy = h('button', { class: 'btn', type: 'button', onclick: async () => {
      try { await navigator.clipboard.writeText(url); toast('Invite link copied! Send it to a friend.', 2.4); } catch (e) { addLine(null, 'Invite link: ' + url, null, true); }
    } }, 'Copy link');
    const list = h('ul', { class: 'w3-invite-list' }, h('li', { class: 'small' }, opts.friends ? 'Loading your friends…' : 'Log in to invite friends.'));
    invitePanel.replaceChildren(h('h3', {}, 'Invite friends'), h('div', { class: 'row' }, copy, h('button', { class: 'btn', type: 'button', onclick: () => { invitePanel.hidden = true; } }, 'Close')), list);
    invitePanel.hidden = false;
    if (!opts.friends) return;
    try {
      const r = await opts.friends();
      const fr = (r.friends || []).slice().sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
      list.replaceChildren(...(fr.length ? fr.map((f) => h('li', {}, h('span', { class: 'dot', style: `background:${f.online ? '#44c06a' : '#a3abc2'}` }), f.name, h('span', { class: 'small' }, f.online ? (f.online.name ? ` in ${f.online.name}` : ' online') : ''),
        h('button', { class: 'btn btn-sun', type: 'button', onclick: async (e) => { const b = e.currentTarget; b.disabled = true; try { await opts.inviteFriend(code, f.name); b.textContent = 'Invited!'; sfx('send'); } catch (err) { b.textContent = err.message.slice(0, 40); } } }, 'Invite'))) : [h('li', { class: 'small' }, 'No friends yet. Add friends from their profile, then invite them here.')]));
    } catch (e) { list.replaceChildren(h('li', { class: 'small' }, e.message)); }
  }
  const myTag = h('div', { class: 'w3-tag me' }, h('span', { class: 'w3-name' }, opts.me && opts.me.lvl ? h('span', { class: 'lvl' }, `Lv ${opts.me.lvl}`) : null, ...tagBits(opts.me && opts.me.tags), (opts.me && (opts.me.display || opts.me.name)) || 'You', opts.me && titleName(opts.me.title) ? h('span', { class: 'w3-title' + titleClass(opts.me.title) }, titleName(opts.me.title)) : null), h('span', { class: 'w3-bubble', hidden: true }));
  const myBubble = myTag.querySelector('.w3-bubble');
  let myBubbleUntil = 0;
  tags.append(myTag);
  if (opts.room) {
    hudNet.textContent = 'Connecting…';
    room = openRoom(opts.room, {
      message: onMessage,
      open: (info) => { hudNet.textContent = 'Online'; if (opts.onJoined) opts.onJoined(info); },
      drop: () => { hudNet.textContent = 'Reconnecting…'; online = false; },
      closed: (why) => { hudNet.textContent = 'Offline'; online = false; for (const o of [...others.keys()]) removePlayer(o); addLine(null, why, null, true); showMsg(why + ' You can keep playing by yourself.'); },
      error: (text) => { hudNet.textContent = 'Solo'; addLine(null, text, null, true); },
    });
  } else {
    chatForm.hidden = true; emoteBar.hidden = true; players.hidden = true;
    hudNet.textContent = opts.test ? 'Testing' : 'Solo';
    if (!opts.test && opts.soloNote) addLine(null, opts.soloNote, null, true);
  }
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || !room) { chatInput.blur(); return; }
    if (!room.send({ t: 'chat', m: text })) { addLine(null, "Not connected, that message wasn't sent.", null, true); sfx('error'); } else sfx('send');
    chatInput.value = '';
    chatInput.blur();
  });
  chatInput.addEventListener('focus', () => { clearKeys(); chat.classList.add('open'); sfx('open'); });
  chatInput.addEventListener('blur', () => chat.classList.remove('open'));
  function emote(e) {
    if (!EMOTES.includes(e)) return;
    emoteNow = e; emoteAt = 0;
    if (opts.onStat && (e === 'dance' || e === 'spin')) opts.onStat(e === 'dance' ? 'dances' : 'spins');
    if (room) room.send({ t: 'emote', e });
  }

  function showMsg(text, withLeave) {
    msgBox.hidden = false;
    msgBox.replaceChildren(h('div', { class: 'panel' }, h('p', {}, text), h('div', { class: 'row' },
      h('button', { class: 'btn btn-sun', type: 'button', onclick: () => { msgBox.hidden = true; } }, 'Keep playing'),
      withLeave ? h('button', { class: 'btn', type: 'button', onclick: () => opts.onExit && opts.onExit() }, 'Leave') : null)));
  }

  /* ---------------- minigames ---------------- */
  const cfg = opts.game || null;
  const roundBox = h('div', { class: 'w3-round', hidden: !cfg, 'aria-live': 'polite' });
  stage.append(roundBox);
  if (cfg) roundBox.textContent = opts.room ? 'Connecting to the minigames…' : 'Minigames need other players. Log in and invite a friend!';
  const rs = { phase: null, mode: null, endsLocal: 0, it: new Set(), alive: new Set(), fin: [], scores: {}, lava: null, results: null };
  /* ----- bots (private servers of Blockyard minigames): the owner's computer runs them ----- */
  let botMgr = null, botInfo = null;
  const botBtn = h('button', { class: 'btn', type: 'button', hidden: true, title: 'Bots in your private server' }, 'Bots');
  bar.insertBefore(botBtn, lockBtn);
  const botPanel = h('div', { class: 'w3-admin panel w3-bots', hidden: true });
  stage.append(botPanel);
  botBtn.addEventListener('click', () => { botPanel.hidden = !botPanel.hidden; botBtn.blur(); if (!botPanel.hidden) drawBotPanel(); });
  function drawBotPanel() {
    const n = h('select', { 'aria-label': 'How many bots' }, ...Array.from({ length: BOTS.max + 1 }, (_, i) => h('option', { value: String(i) }, i ? `${i} bot${i > 1 ? 's' : ''}` : 'No bots')));
    const sk = h('select', { 'aria-label': 'How smart' }, ...BOTS.skills.map((k) => h('option', { value: k }, BOT_SKILL[k].name)));
    n.value = String(botInfo ? botInfo.n : 0); sk.value = botInfo ? botInfo.skill : 'normal';
    botPanel.replaceChildren(h('h3', {}, 'Bots'),
      h('p', { class: 'small' }, 'Practice with bots in your private server. Smarter bots aim better, react faster and mess up less. Rounds with bots don\'t pay coins.'),
      h('div', { class: 'row' }, n, sk, h('button', { class: 'btn btn-sun', type: 'button', onclick: () => { if (room) room.send({ t: 'botcfg', n: Number(n.value), skill: sk.value }); botPanel.hidden = true; sfx('pop'); } }, 'Apply')));
  }
  function setupBots(info, ids) {
    botInfo = info || null;
    botBtn.hidden = !(botInfo && botInfo.owner);
    botMgr = null;
    if (!botInfo || !botInfo.host || !ids.length || !cfg || !room) return;
    botMgr = createBots({ world, grid: physGrid, cfg, way: opts.way || [], ids, skill: botInfo.skill, send: (msg) => room && room.send(msg) });
  }
  let inRound = false, lastTag = 0, roundText = '', frozenUntil = 0, lastCount = -1, kothKing = null, myPaint = 0;
  /* ----- spectating: watch other players (your Pip waits where it is) ----- */
  let spec = null; // { id } of who you're watching
  const specBar = h('div', { class: 'w3-spec', hidden: true },
    h('button', { class: 'btn', type: 'button', 'aria-label': 'Watch the previous player', onclick: () => nextSpec(-1) }, '◀'),
    h('b', { class: 'w3-spec-name' }),
    h('button', { class: 'btn', type: 'button', 'aria-label': 'Watch the next player', onclick: () => nextSpec(1) }, '▶'),
    h('button', { class: 'btn btn-sun', type: 'button', onclick: () => setSpec(false) }, 'Stop watching'));
  stage.append(specBar);
  const watchable = () => [...others.values()].filter((o) => o.pos).map((o) => o.id);
  function setSpec(on) {
    if (on) {
      const list = watchable();
      if (!list.length) { toast('Nobody else is here to watch yet.', 1.8); return; }
      spec = { id: list[0] }; clearKeys();
    } else spec = null;
    specBtn.classList.toggle('on', !!spec); specBtn.textContent = spec ? 'Spectating' : 'Spectate';
    specBar.hidden = !spec; drawSpec();
  }
  function nextSpec(d) {
    const list = watchable();
    if (!spec || !list.length) { setSpec(false); return; }
    const i = list.indexOf(spec.id);
    spec.id = list[((i < 0 ? 0 : i + d) % list.length + list.length) % list.length]; drawSpec();
  }
  function drawSpec() { if (spec) specBar.querySelector('.w3-spec-name').textContent = `Watching ${label(others.get(spec.id))}`; }
  specBtn.addEventListener('click', () => { setSpec(!spec); specBtn.blur(); });
  /* ----- tycoon: plots, cash and buy buttons (the live room keeps the real score) ----- */
  const tyPlots = cfg && cfg.areas.tycoon ? cfg.areas.tycoon.plots || {} : null;
  const tyShown = new Map(); // plot color -> how many buttons are shown as bought
  let tyAt = 0, tySent = 0;
  const tyTag = h('div', { class: 'w3-tag shopkeep', hidden: true }, h('span', { class: 'w3-bubble' }));
  if (tyPlots) tags.append(tyTag);
  const COLOR_NAME = ['white', 'gray', 'slate', 'navy', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'tan', 'sky', 'forest'];
  function tySet(i, t, c) { if (physGrid.t[i] === t && physGrid.c[i] === c) return; physGrid.t[i] = viewGrid.t[i] = t; physGrid.c[i] = viewGrid.c[i] = c; R.markDirty(i % SX, Math.floor(i / (SX * SZ)), Math.floor(i / SX) % SZ); }
  function tyApply(ty) {
    if (!tyPlots) return;
    for (const [c, plot] of Object.entries(tyPlots)) {
      const n = ty && ty[c] ? ty[c][1] : 0;
      if (tyShown.get(c) === n) continue;
      tyShown.set(c, n);
      plot.buttons.forEach((b, k) => {
        for (const i of b.cells) tySet(i, k < n ? B.tbuild : 0, k < n ? Number(c) : 0);
        tySet(b.x + b.z * SX + b.y * SX * SZ, k < n ? B.plastic : B.tbutton, Number(c));
      });
    }
  }
  const myPlot = () => (rs.ty ? Object.entries(rs.ty).find(([, p]) => p[0] === myId) : null);
  const tyCash = (p) => Math.floor(p[2] + p[3] * (performance.now() - tyAt) / 1000);
  function tyTick(px, py, pz) {
    if (!tyPlots || rs.mode !== 'tycoon' || rs.phase !== 'play' || !inRound || !room) { tyTag.hidden = true; return ''; }
    const mine = myPlot(), now = performance.now(), at = [px, py, pz];
    if (!mine) {
      tyTag.hidden = true;
      if (now - tySent > 500) for (const [c, plot] of Object.entries(tyPlots)) if (rs.ty[c] && !rs.ty[c][0] && nearBlock(at, plot.pad)) { room.send({ t: 'tclaim', c }); tySent = now; break; }
      return 'Find a glowing claim pad nobody has and step on it!';
    }
    const [c, p] = mine, plot = tyPlots[c], next = plot.buttons[p[1]], cash = tyCash(p);
    if (next) {
      placeTag(tyTag, next.x + 0.5, next.y + 2.2, next.z + 0.5, false, 60);
      tyTag.firstChild.textContent = cash >= next.price ? `Buy: $${next.price}` : `$${next.price}`;
      if (cash >= next.price && now - tySent > 500 && nearBlock(at, [next.x, next.y, next.z])) { room.send({ t: 'tbuy', c }); tySent = now; }
    } else tyTag.hidden = true;
    return `Your ${COLOR_NAME[c] || ''} plot: $${cash} (+$${p[3]}/s). ${next ? `Next button: $${next.price}${cash >= next.price ? ', go step on it!' : ''}` : 'All built!'} ${p[1]}/${plot.buttons.length} built.`;
  }
  tyApply(null);
  const nameOf = (id) => (id === myId ? 'You' : label(others.get(id)));
  const toXYZ = (a, spread) => ({ x: a[0] + (spread ? (Math.random() - 0.5) * spread : 0), y: a[1], z: a[2] + (spread ? (Math.random() - 0.5) * spread : 0) });
  // gear works in hangouts, Tag and Paintball. Never in obbies (timed and checked) or the other minigames (fair play).
  function applyGear() {
    // hangouts (and Test in the builder) unless the maker turned gear off; in minigames only Tag and Paintball
    const ok = world.mode === 'hangout' && world.gear !== 'off' && (!inRound || rs.mode === 'tag' || rs.mode === 'paint');
    S.mods = ok && gearAllowed(world, look.gear) ? GEAR_MODS[look.gear] || null : null;
  }
  /* ----- paintball ----- */
  const aim = { from: [0, 0, 0], dir: [0, 0, 1] };
  const shots = [];
  let lastShot = 0, swapUntil = 0, lastW = 'blaster';
  const paintWorld = !!cfg && cfg.modes.includes('paint');
  let weapon = WEAPONS[store.get('paint-weapon', 'blaster')] ? store.get('paint-weapon', 'blaster') : 'blaster';
  const reload = h('i', { class: 'w3-reload' });
  const cross = h('div', { class: 'w3-cross', hidden: true, 'aria-hidden': 'true' }, reload);
  const shootBtn = h('button', { class: 'tbtn w3-shoot', type: 'button', hidden: true, 'aria-label': 'Shoot paint' }, 'Shoot');
  const weaponBar = h('div', { class: 'w3-weapons', hidden: !paintWorld, role: 'group', 'aria-label': 'Blasters' },
    ...WEAPON_IDS.map((id, i) => h('button', { class: 'btn' + (id === weapon ? ' on' : ''), type: 'button', 'data-w': id, title: WEAPONS[id].info, onclick: (e) => { pickWeapon(id); e.currentTarget.blur(); } }, h('b', {}, String(i + 1)), ' ' + WEAPONS[id].name)));
  stage.append(cross, shootBtn, weaponBar);
  shootBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); shoot(); });
  addEventListener('keydown', (e) => { if (e.code !== 'KeyX' || typing() || !stage.isConnected || stopped || shopOpen) return; if (paintOn()) shoot(); else if (snowOn()) throwSnow(); });
  function paintOn() { return !!cfg && rs.phase === 'play' && rs.mode === 'paint' && inRound; }
  function pickWeapon(id) {
    if (!WEAPONS[id] || id === weapon) return;
    weapon = id; store.set('paint-weapon', id);
    for (const b of weaponBar.children) b.classList.toggle('on', b.dataset.w === id);
    swapUntil = performance.now() + ROUND.swapMs;
    toast(`${WEAPONS[id].name}: ${WEAPONS[id].info}`, 1.6); sfx('checkpoint');
  }
  /* ----- snowballs (Snowy Town): only for fun ----- */
  const snowOn = () => !!opts.snow && !paintOn();
  const snowballs = [];
  let lastSnow = 0;
  function addSnowball(o, d, by) { snowballs.push({ x: o[0], y: o[1], z: o[2], vx: d[0] * 20, vy: d[1] * 20, vz: d[2] * 20, life: 2.5, by }); }
  function throwSnow() {
    const now = performance.now();
    if (!snowOn() || now - lastSnow < 350) return;
    lastSnow = now;
    const [dx, dy, dz] = aim.dir, l = Math.hypot(dx, dy + 0.22, dz);
    const d = [dx / l, (dy + 0.22) / l, dz / l], o = [S.p.x, S.p.y + 1.3, S.p.z];
    addSnowball(o, d, myId || 'me'); sfx('jump');
    if (room) room.send({ t: 'throw', o, d });
  }
  function snowTick(dt, scene) {
    for (let i = snowballs.length - 1; i >= 0; i--) {
      const b = snowballs[i];
      b.vy -= 18 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
      let hit = b.life <= 0 || camSolid(b.x, b.y, b.z);
      const mine = b.by === (myId || 'me');
      if (!hit && !mine && Math.hypot(b.x - S.p.x, b.y - (S.p.y + 0.8), b.z - S.p.z) < 0.75) { hit = true; toast(`${nameOf(b.by)} got you with a snowball!`, 1.4); sfx('land'); }
      if (!hit && mine) for (const o of others.values()) if (o.pos && Math.hypot(b.x - o.pos[0], b.y - (o.pos[1] + 0.8), b.z - o.pos[2]) < 0.75) { hit = true; toast(`Hit ${label(o)}!`, 0.9); sfx('hit'); if (opts.onStat) opts.onStat('snowhits'); break; }
      if (hit) { burst(b.x, b.y, b.z, ['#ffffff', '#dff4ff'], 10, 3, 2); snowballs.splice(i, 1); continue; }
      scene.push({ prim: 'sphere', color: [1, 1, 1], m: M4.trs(b.x, b.y, b.z, 0, 0, 0, 0.32, 0.32, 0.32) });
    }
  }
  if (opts.snow) setTimeout(() => { if (!stopped) toast('Click or press X to throw snowballs!', 3); }, 5000);
  function shoot() {
    const now = performance.now(), wp = WEAPONS[weapon];
    if (!paintOn() || now - lastShot < WEAPONS[lastW].every || now < swapUntil) return;
    lastShot = now; lastW = weapon;
    const [ox, oy, oz] = aim.from, color = hexRGB(look.color);
    let best = null, bestT = Infinity;
    for (let k = 0; k < wp.pellets; k++) {
      let [dx, dy, dz] = aim.dir;
      if (wp.spread) { dx += (Math.random() - 0.5) * 2 * wp.spread; dy += (Math.random() - 0.5) * 2 * wp.spread; dz += (Math.random() - 0.5) * 2 * wp.spread; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l; }
      // how far until a wall?
      let wall = wp.range;
      for (let t = 0.8; t < wp.range; t += 0.4) if (camSolid(ox + dx * t, oy + dy * t, oz + dz * t)) { wall = t; break; }
      let hitO = null, hitT = wall;
      for (const o of others.values()) {
        if (!o.pos || !rs.alive.has(o.id)) continue;
        const cx = o.pos[0] - ox, cy = o.pos[1] + 0.7 - oy, cz = o.pos[2] - oz;
        const t = cx * dx + cy * dy + cz * dz;
        if (t < 0.5 || t > hitT) continue;
        if (Math.hypot(cx - dx * t, cy - dy * t, cz - dz * t) < 0.8) { hitO = o; hitT = t; }
      }
      shots.push({ x: ox, y: oy, z: oz, dx, dy, dz, left: hitT, color, speed: wp.speed, size: wp.size });
      if (hitO && hitT < bestT) { best = hitO; bestT = hitT; }
    }
    sfx(weapon === 'sniper' ? 'whoosh' : 'shoot');
    if (weapon === 'splatter' || weapon === 'sniper') cam.pitch = Math.min(1.35, cam.pitch + 0.02); // a little kick
    if (best && room) room.send({ t: 'hit', id: best.id, w: weapon });
  }
  function splash(pos, color, n = 10) { if (pos) burst(pos[0], pos[1] + 0.8, pos[2], [color || '#ff5d8f', '#ffffff'], n, 4, 3); }
  function onPaint(m) {
    const by = m.by === myId ? look : (others.get(m.by) || {}).look;
    const target = m.id === myId ? [S.p.x, S.p.y, S.p.z] : (others.get(m.id) || {}).pos;
    splash(target, by && by.color, 8);
    if (m.id === myId) { myPaint = m.n; toast(`Paint on you: ${m.n}/${ROUND.hp}`, 0.9); sfx('hit'); }
    else if (m.by === myId) { toast(`Hit ${nameOf(m.id)}! ${m.n}/${ROUND.hp}`, 0.8); sfx('hit'); }
  }
  const paintSpawn = () => { const a = cfg.areas.paint, l = a.spawns; return l && l.length ? toXYZ(l[Math.floor(Math.random() * l.length)], 1) : toXYZ(a.spawn, 8); };
  function placeAt(at, obbyNow) {
    S.spawn = at; S.p = { ...at }; S.v.x = S.v.y = S.v.z = 0; prevP = { ...S.p };
    S.cp = null; S.cpIdx = -1; S.won = false; S.obby = obbyNow; S.onGround = false; winShown = false; winBox.hidden = true;
    if (fly) setFly(false);
    applyGear();
  }
  function enterArea(mode) {
    const a = cfg.areas[mode];
    inRound = true;
    myPaint = 0; frozenUntil = 0;
    let at;
    if (mode === 'paint') at = paintSpawn();
    else if (mode === 'tag' && a.spawns) {
      // IT waits in the middle; everyone else gets their own spot around the edges
      if (rs.it.has(myId)) { at = toXYZ(a.itSpawn || a.spawn, 1); frozenUntil = performance.now() + ROUND.itWait; toast("You're IT! Wait 3 seconds, then go tag everyone!", 2.5); }
      else { const free = [...rs.alive].filter((id) => !rs.it.has(id)).sort(); const i = Math.max(0, free.indexOf(myId)); at = toXYZ(a.spawns[i % a.spawns.length], 1); }
    } else at = toXYZ(a.spawn, mode === 'race' ? 2 : 5);
    placeAt(at, mode === 'race');
    // look toward the goal (race) or the hill
    const g = mode === 'koth' && a.hill ? { x: (a.hill[0] + a.hill[3] + 1) / 2, z: (a.hill[2] + a.hill[5] + 1) / 2 } : mode === 'race' ? goals.find((q) => inBox(a, q.x, q.z)) : null;
    if (g) cam.yaw = Math.atan2(g.x - S.p.x, -(g.z - S.p.z));
    if (!(mode === 'tag' && rs.it.has(myId))) toast(GAMES[mode].name + ': GO!', 1.6);
    sfx('go');
    if (shopOpen) closeShop();
  }
  function backToLobby() { inRound = false; placeAt(toXYZ(cfg.lobby, 4), world.mode !== 'hangout' && !cfg); }
  function onRound(m) {
    if (!cfg) return;
    const was = rs.phase;
    if (m.phase === 'play' && m.mode === 'lava' && rs.phase === 'play' && m.lava != null && rs.lava != null && m.lava > rs.lava && inRound) { toast('The lava is rising!', 1); sfx('crumble'); }
    Object.assign(rs, { phase: m.phase, mode: m.mode, endsLocal: performance.now() + (m.left || 0), it: new Set(m.it || []), alive: new Set(m.alive || []), fin: m.fin || [], scores: m.scores || {}, lava: m.lava, results: m.results, need: m.need, practice: !!m.practice, ty: m.ty || null });
    tyAt = performance.now();
    if (tyPlots) tyApply(m.mode === 'tycoon' && (m.phase === 'play' || m.phase === 'results') ? m.ty : null);
    if (m.phase === 'play' && was !== 'play' && rs.alive.has(myId)) enterArea(m.mode);
    else if (m.phase !== 'play' && inRound) backToLobby();
    if (m.ev) {
      if (m.ev.tag) {
        // a freshly tagged player freezes for a moment, so they can't tag right back
        if (m.ev.tag === myId) { frozenUntil = performance.now() + 1500; toast("You got tagged! You're IT! (frozen for a sec)", 1.8); sfx('die'); }
        else { toast(`${nameOf(m.ev.tag)} got tagged!`, 1.6); sfx('tagged'); }
        const o = m.ev.tag === myId ? { pos: [S.p.x, S.p.y, S.p.z] } : others.get(m.ev.tag);
        if (o && o.pos) burst(o.pos[0], o.pos[1] + 1, o.pos[2], ['#ff5a1f', '#ffd23f', '#ffffff'], 18, 4, 4);
      }
      if (m.ev.out && m.ev.out !== myId) toast(`${nameOf(m.ev.out)} fell in the lava!`, 1.4);
      if (m.ev.fin) toast(`${nameOf(m.ev.fin)} finished #${rs.fin.indexOf(m.ev.fin) + 1}!`, 1.6);
      if (m.ev.claim) { toast(m.ev.claim === myId ? 'This plot is yours! Step on the glowing buttons to build it.' : `${nameOf(m.ev.claim)} claimed a plot!`, 1.8); if (m.ev.claim === myId) sfx('badge'); }
      if (m.ev.buy) { const b = tyPlots && tyPlots[m.ev.c] && tyPlots[m.ev.c].buttons[m.ev.n - 1]; if (b) burst(b.x + 0.5, b.y + 1.5, b.z + 0.5, [PALETTE[m.ev.c] || '#ffd23f', '#ffffff'], 16, 3, 4); if (m.ev.buy === myId) sfx('buy'); }
      if (m.ev.splat) {
        const by = m.ev.by === myId ? look : (others.get(m.ev.by) || {}).look;
        splash(m.ev.splat === myId ? [S.p.x, S.p.y, S.p.z] : (others.get(m.ev.splat) || {}).pos, by && by.color, 24);
        if (m.ev.splat === myId) { myPaint = 0; toast(`SPLAT! ${nameOf(m.ev.by)} got you${m.ev.w ? ` with the ${WEAPONS[m.ev.w].name}` : ''}.`, 1.8); sfx('splat'); placeAt(paintSpawn(), false); }
        else toast(m.ev.by === myId ? `You splatted ${nameOf(m.ev.splat)}!` : `${nameOf(m.ev.by)} splatted ${nameOf(m.ev.splat)}!`, 1.6);
        if (m.ev.by === myId) { sfx('coin'); if (opts.onStat) opts.onStat('splats'); }
      }
    }
    if (botMgr) botMgr.round(m, rs, was);
    if (m.phase === 'results' && was === 'play') {
      sfx('win');
      if (opts.onStat && (m.results || []).some((w) => w.id === myId && w.place === 1)) opts.onStat('win_' + rs.mode);
    }
    // King of the Hill: whoever is winning wears a crown
    const top = m.phase === 'play' && m.mode === 'koth' ? Object.entries(rs.scores).sort((a, b) => b[1] - a[1])[0] : null;
    kothKing = top && top[1] >= 1 ? top[0] : null;
    for (const o of others.values()) o.tag.classList.toggle('it', rs.phase === 'play' && rs.mode === 'tag' && rs.it.has(o.id));
    myTag.classList.toggle('it', rs.phase === 'play' && rs.mode === 'tag' && rs.it.has(myId));
  }
  /* ----- tips: the first time you're near a special block, say what it does ----- */
  const TIP3D = {
    [B.bounce]: 'Bounce pad! Step on it and it launches you way up.',
    [B.speed]: 'Speed pad! Step on it to run faster for a few seconds.',
    [B.crumble]: 'Crumble block: it falls away a moment after you step on it. Keep moving!',
    [B.checkpoint]: 'Checkpoint! Step on it and you come back here if you fall.',
    [B.ice]: 'Ice is slippery. Start slowing down early!',
    [B.lava]: "Lava! Touch it and you go back to your checkpoint.",
    [B.teleport]: 'Teleporter! Step on it to jump to the next teleporter of the same color.',
    [B.goal]: obby ? "That's the goal. Touch it to win!" : null,
    [B.beltE]: 'Conveyor belt! It pushes you the way the arrows move.',
    [B.moveX]: 'Moving platform! Hop on and it carries you. Wait for it if it is far away.',
  };
  TIP3D[B.beltW] = TIP3D[B.beltN] = TIP3D[B.beltS] = TIP3D[B.beltE];
  TIP3D[B.moveZ] = TIP3D[B.moveX]; TIP3D[B.moveY] = 'Elevator! Stand on it and it takes you up and down.';
  const tipsSeen = new Set(store.get('tips3d-seen', []));
  const tipBox = h('div', { class: 'play-tip w3-tip', role: 'status' });
  stage.append(tipBox);
  let tipWait = 1.5;
  function tipTick(dt) {
    if ((tipWait -= dt) > 0) return;
    tipWait = 0.3;
    const bx = Math.floor(S.p.x), by = Math.floor(S.p.y), bz = Math.floor(S.p.z);
    for (let y = by - 2; y <= by + 2; y++) for (let z = bz - 3; z <= bz + 3; z++) for (let x = bx - 3; x <= bx + 3; x++) {
      const t = physGrid.get(x, y, z), tip = t && TIP3D[t];
      if (!tip || tipsSeen.has(t)) continue;
      for (const [k, v] of Object.entries(TIP3D)) if (v === tip) tipsSeen.add(Number(k));
      store.set('tips3d-seen', [...tipsSeen]);
      tipBox.textContent = tip; tipBox.classList.add('on'); clearTimeout(tipBox.t); tipBox.t = setTimeout(() => tipBox.classList.remove('on'), 5000); tipWait = 5.5;
      return;
    }
  }
  /* ----- the shop keeper: walk up and press B (or the button) to buy and wear things right here ----- */
  const shopAt = opts.shop && opts.onShop ? { x: opts.shop[0], y: opts.shop[1], z: opts.shop[2] } : null;
  const SHOPKEEP = { color: '#ffd23f', hat: 'tophat', trail: 'none', pet: 'none', gear: 'none' };
  const shopTag = h('div', { class: 'w3-tag shopkeep' }, h('span', { class: 'w3-name' }, 'Shop keeper'), h('span', { class: 'w3-bubble' }, 'Hats, pets and more!'));
  const shopBtn = h('button', { class: 'btn btn-sun w3-shopbtn', type: 'button', hidden: true }, 'Shop (B)');
  const shopBox = h('div', { class: 'overlay w3-shop', hidden: true });
  if (shopAt) { tags.append(shopTag); stage.append(shopBtn, shopBox); }
  shopBtn.addEventListener('click', () => { openShop(); shopBtn.blur(); });
  let nearShop = false, shopOpen = false;
  function openShop() {
    if (!shopAt || shopOpen) return;
    shopOpen = true; clearKeys(); if (shiftLock) setShiftLock(false);
    shopBox.hidden = false;
    opts.onShop(shopBox, { close: closeShop, looked: (eq) => { Object.assign(look, eq); applyGear(); renderList(); if (room) room.send({ t: 'look' }); } });
  }
  function closeShop() { shopOpen = false; shopBox.hidden = true; shopBox.replaceChildren(); }
  function shopTick(px, py, pz, scene) {
    if (!shopAt) return;
    const d = Math.hypot(px - shopAt.x, pz - shopAt.z);
    avatarParts({ x: shopAt.x, y: shopAt.y, z: shopAt.z, yaw: d < 12 ? Math.atan2(px - shopAt.x, pz - shopAt.z) : 0, walk: 0, move: 0, air: false, emote: d < 5 ? 'wave' : null, et: clock, t: clock, look: SHOPKEEP }, scene);
    shadow(scene, shopAt.x, shopAt.y, shopAt.z);
    placeTag(shopTag, shopAt.x, shopAt.y + 2.05, shopAt.z, false, 40);
    const near = d < 3.6 && Math.abs(py - shopAt.y) < 2.5 && !(inRound && rs.phase === 'play');
    if (near !== nearShop) { nearShop = near; shopBtn.hidden = !near; }
  }
  // automated tests can move the player (only with ?w3test in the address)
  if (location.search.includes('w3test')) window.__w3 = { at: (x, y, z) => { S.p.x = x; S.p.y = y; S.p.z = z; S.v.x = S.v.y = S.v.z = 0; prevP = { ...S.p }; } };
  let lastHb = 0;
  function roundTick(px, py, pz, scene, clock) {
    if (!cfg || !rs.phase) return;
    if (tyPlots && (rs.mode !== 'tycoon' || rs.phase !== 'play')) tyTag.hidden = true;
    const secs = Math.max(0, Math.ceil((rs.endsLocal - performance.now()) / 1000));
    const clockTxt = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    let t = '';
    if (rs.phase === 'wait') t = `Minigames: waiting for players (${others.size + 1}/${rs.need || 2}). Press Invite to bring a friend!`;
    else if (rs.phase === 'intro') t = `Next: ${GAMES[rs.mode].name} in ${secs}s. ${GAMES[rs.mode].short}`;
    else if (rs.phase === 'results') t = (rs.results && rs.results.length ? 'Winners: ' + rs.results.map((w) => `${w.id === myId ? 'You' : w.name}${w.coins ? ` (+${w.coins})` : ''}`).join(', ') : 'Nobody won that one!') + (rs.practice ? ' (practice round with bots: no coins)' : '');
    else if (!inRound) t = `${GAMES[rs.mode].name} in progress (${clockTxt}). You're watching, you'll join the next round.`;
    else if (rs.mode === 'race') t = `RACE ${clockTxt}. ${rs.fin.includes(myId) ? `You finished #${rs.fin.indexOf(myId) + 1}!` : 'Get to the goal!'}`;
    else if (rs.mode === 'tag') t = `TAG ${clockTxt}. ${rs.it.has(myId) ? "You're IT! Tag the others!" : `Run! ${rs.it.size} ${rs.it.size === 1 ? 'player is' : 'players are'} IT, ${Math.max(0, rs.alive.size - rs.it.size)} still free.`}`;
    else if (rs.mode === 'koth') { const top = Object.entries(rs.scores).sort((a, b) => b[1] - a[1])[0]; t = `KING OF THE HILL ${clockTxt}. You: ${Math.floor(rs.scores[myId] || 0)}s${top ? `, leader: ${nameOf(top[0])} ${Math.floor(top[1])}s` : ''}`; }
    else if (rs.mode === 'paint') { const top = Object.entries(rs.scores).sort((a, b) => b[1] - a[1])[0]; t = `PAINTBALL ${clockTxt}. ${WEAPONS[weapon].name}. Splats: ${rs.scores[myId] || 0}${top ? `, leader: ${nameOf(top[0])} ${top[1]}` : ''}. Paint on you: ${myPaint}/${ROUND.hp}`; }
    else if (rs.mode === 'lava') t = `RISING LAVA ${clockTxt}. ${rs.alive.has(myId) ? `${rs.alive.size} left. Keep climbing!` : 'You fell in. Watch the rest!'}`;
    else if (rs.mode === 'tycoon') t = `TYCOON ${clockTxt}. ${tyTick(px, py, pz)}`;
    if (rs.phase === 'intro' && secs <= 3 && secs !== lastCount) { lastCount = secs; if (secs > 0) { toast(String(secs), 0.9); sfx('tick'); } }
    if (rs.phase !== 'intro') lastCount = -1;
    if (t !== roundText) { roundText = t; roundBox.textContent = t; roundBox.hidden = false; }
    roundBox.classList.toggle('hot', rs.phase === 'play' && inRound && (rs.mode !== 'tag' || rs.it.has(myId)));
    const pOn = paintOn();
    shootBtn.hidden = !pOn;
    if (pOn) reload.style.transform = `scaleX(${Math.min(1, (performance.now() - Math.max(lastShot, swapUntil - ROUND.swapMs)) / WEAPONS[lastW].every).toFixed(2)})`;
    for (let i = shots.length - 1; i >= 0; i--) {
      const sh = shots[i], step = Math.min(sh.left, (sh.speed || 45) * 0.016);
      sh.x += sh.dx * step; sh.y += sh.dy * step; sh.z += sh.dz * step; sh.left -= step;
      const sz = sh.size || 0.22;
      scene.push({ prim: 'sphere', color: sh.color, glow: 0.4, m: M4.trs(sh.x, sh.y, sh.z, 0, 0, 0, sz, sz, sz) });
      if (sh.left <= 0) { burst(sh.x, sh.y, sh.z, ['#ffffff'], 4, 2, 1); shots.splice(i, 1); }
    }
    if (rs.phase !== 'play') return;
    // the rising lava and the glowing hill
    if (rs.mode === 'lava' && rs.lava != null) {
      const a = cfg.areas.lava, b = a.box || [0, 0, SX - 1, SZ - 1], base = a.lavaFrom || 0, top = rs.lava - 0.45;
      scene.push({ prim: 'cube', color: hexRGB('#ff5a1f'), glow: 0.9, alpha: 0.88, m: M4.trs((b[0] + b[2] + 1) / 2, (base + top) / 2, (b[1] + b[3] + 1) / 2, 0, 0, 0, b[2] - b[0] + 1, Math.max(0.05, top - base), b[3] - b[1] + 1) });
      if (inRound && rs.alive.has(myId) && py < rs.lava - 0.6 && inBox(a, px, pz)) { rs.alive.delete(myId); if (room) room.send({ t: 'out' }); sfx('die'); burst(px, py + 0.5, pz, ['#ff5a1f', '#ffd23f'], 20, 4, 5); toast('The lava got you!', 2); backToLobby(); }
    }
    if (rs.mode === 'koth' && cfg.areas.koth.hill) {
      const hl = cfg.areas.koth.hill, on = inRound && onHill(cfg.areas.koth, px, py, pz);
      scene.push({ prim: 'cube', color: hexRGB(on ? '#44c06a' : '#ffd23f'), glow: 1, alpha: 0.18 + Math.sin(clock * 4) * 0.06, m: M4.trs((hl[0] + hl[3] + 1) / 2, hl[4] + 2.5, (hl[2] + hl[5] + 1) / 2, 0, 0, 0, hl[3] - hl[0] + 1.1, 3, hl[5] - hl[2] + 1.1) });
    }
    if (rs.mode === 'tag' && parts.length < 240) {
      // IT players leave a trail of sparks so you can see them coming
      const spark = (p) => parts.push({ x: p[0] + (Math.random() - 0.5) * 0.5, y: p[1] + 0.4 + Math.random() * 1.2, z: p[2] + (Math.random() - 0.5) * 0.5, vx: 0, vy: 1.4, vz: 0, life: 0.5, max: 0.5, size: 0.1, color: hexRGB(Math.random() < 0.5 ? '#ff5a1f' : '#ffd23f'), g: 0 });
      if (rs.it.has(myId) && Math.random() < 0.5) spark([px, py, pz]);
      for (const o of others.values()) if (o.pos && rs.it.has(o.id) && Math.random() < 0.5) spark(o.pos);
    }
    if (rs.mode === 'tag' && inRound && rs.it.has(myId) && room && performance.now() >= frozenUntil && performance.now() - lastTag > 350) {
      for (const o of others.values()) {
        if (!o.pos || rs.it.has(o.id) || !rs.alive.has(o.id)) continue;
        if (Math.hypot(o.pos[0] - px, o.pos[1] - py, o.pos[2] - pz) < ROUND.tagReach) { room.send({ t: 'tag', id: o.id }); lastTag = performance.now(); break; }
      }
    }
  }

  applyGear();

  /* ---------------- winning ---------------- */
  let winShown = false;
  function won() {
    if (winShown) return;
    winShown = true;
    stopMusic();
    const time = S.steps / 60;
    burst(S.p.x, S.p.y + 1, S.p.z, ['#ffd23f', '#ff5d8f', '#44c06a', '#3a86ff', '#b06cff'], 50, 6, 7);
    const reward = h('p', { class: 'win-reward' });
    const panel = h('div', { class: 'panel' },
      h('h2', {}, opts.test ? 'You beat your world!' : 'Obby cleared!'),
      h('p', {}, `${time.toFixed(1)} seconds, ${S.deaths} ${S.deaths === 1 ? 'fall' : 'falls'}${S.totalCoins ? `, ${S.coins} of ${S.totalCoins} coins` : ''}.`),
      reward,
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-grass', type: 'button', onclick: () => { winBox.hidden = true; restart(); } }, 'Play again'),
        opts.room ? h('button', { class: 'btn', type: 'button', onclick: () => { winBox.hidden = true; } }, 'Hang around') : null,
        h('button', { class: 'btn', type: 'button', onclick: () => opts.onExit && opts.onExit() }, opts.test ? 'Back to building' : 'Leave')));
    winBox.replaceChildren(panel);
    winBox.hidden = false;
    if (opts.onWin) {
      reward.textContent = opts.test ? '' : 'Checking your run…';
      Promise.resolve(opts.onWin({ replay: encodeReplay(frames), time, deaths: S.deaths, coins: S.coins, totalCoins: S.totalCoins, noProof }))
        .then((r) => { reward.textContent = (r && r.text) || ''; if (r && r.extra) reward.after(r.extra); })
        .catch((e) => { reward.textContent = e.message; });
    }
  }
  function restart() {
    S = createSim(world, physGrid);
    applyGear();
    scatter();
    drawVars();
    frames = []; acc = 0; prevP = { ...S.p }; winShown = false; noProof = fly;
    for (const [i, t] of gone) { viewGrid.t[i] = t; const x = i % SX, z = Math.floor(i / SX) % SZ, y = Math.floor(i / (SX * SZ)); R.markDirty(x, y, z); }
    gone.clear();
    startMusic(opts.music || (obby ? 'adventure' : 'chill'));
  }

  /* ---------------- the loop ---------------- */
  const gone = new Map(); // crumble blocks currently missing: index -> type
  let facing = 0, walk = 0, clock = 0;
  const onVis = () => { paused = document.hidden; last = performance.now(); acc = 0; if (paused) clearKeys(); };
  document.addEventListener('visibilitychange', onVis);
  msgBox.hidden = true;
  startMusic(opts.music || (obby ? 'adventure' : 'chill'));

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (paused || stopped) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now; clock += dt;
    if (keys.has('ql')) cam.yaw -= dt * 2.2;
    if (keys.has('qr')) cam.yaw += dt * 2.2;
    if (fly) {
      // admin flying: no physics, just go where you point
      prevP = { ...S.p };
      const f = (keys.has('f') ? 1 : 0) - (keys.has('b') ? 1 : 0) - (joyVec && joyVec.y < -0.35 ? -1 : 0) - (joyVec && joyVec.y > 0.35 ? 1 : 0);
      const sd = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
      const up = (keys.has('j') || jumpTouch ? 1 : 0) - (keys.has('dn') ? 1 : 0);
      const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw), sp = flySpeed * dt;
      S.p.x = Math.max(-20, Math.min(SX + 20, S.p.x + (f * sy + sd * cy) * sp));
      S.p.z = Math.max(-20, Math.min(SZ + 20, S.p.z + (-f * cy + sd * sy) * sp));
      S.p.y = Math.max(-5, Math.min(SY + 30, S.p.y + up * sp));
      S.v.x = (f * sy + sd * cy) * flySpeed; S.v.z = (-f * cy + sd * sy) * flySpeed; S.v.y = 0;
      acc = 0;
    } else if (!winShown) {
      acc += dt;
      while (acc >= STEP3) {
        prevP = { ...S.p };
        const v = packInput(typing() ? 0 : inputBits(), yawIndex(cam.yaw));
        if (obby) frames.push(v);
        step3(S, v);
        handleEvents();
        acc -= STEP3;
        if (winShown) break;
      }
    }
    const k = Math.min(1, acc / STEP3);
    const px = prevP.x + (S.p.x - prevP.x) * k, py = prevP.y + (S.p.y - prevP.y) * k, pz = prevP.z + (S.p.z - prevP.z) * k;
    const hv = Math.hypot(S.v.x, S.v.z), moving = hv > 0.6;
    if (moving || shiftLock) {
      // shift lock: face where the camera looks. Otherwise face the way you're going.
      const target = shiftLock ? Math.atan2(Math.sin(cam.yaw), -Math.cos(cam.yaw)) : Math.atan2(S.v.x, S.v.z);
      let d = target - facing; d = Math.atan2(Math.sin(d), Math.cos(d)); facing += d * Math.min(1, dt * (shiftLock ? 20 : 14));
      if (moving) emoteNow = null;
    }
    walk += hv * dt * 2.2;
    if (emoteNow) emoteAt += dt;
    // crumble blocks disappear and come back
    for (const [i, c] of S.crumbles) if (S.steps - c >= P3.crumbleDelay && !gone.has(i)) { gone.set(i, viewGrid.t[i]); viewGrid.t[i] = 0; R.markDirty(i % SX, Math.floor(i / (SX * SZ)), Math.floor(i / SX) % SZ); }
    for (const [i, t] of gone) if (!S.crumbles.has(i)) { viewGrid.t[i] = t; gone.delete(i); R.markDirty(i % SX, Math.floor(i / (SX * SZ)), Math.floor(i / SX) % SZ); }

    // camera: orbit around the player, pulled in if a wall is in the way
    shoulder += ((shiftLock ? 0.9 : 0) - shoulder) * Math.min(1, dt * 10);
    if (spec && !others.has(spec.id)) setSpec(false);
    const fo = spec ? others.get(spec.id).pos : null;
    const tgt = fo ? [fo[0], fo[1] + 1.25, fo[2]] : [px + Math.cos(cam.yaw) * shoulder, py + 1.25, pz + Math.sin(cam.yaw) * shoulder];
    aim.from = tgt;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const dir = [-Math.sin(cam.yaw) * cp, sp, Math.cos(cam.yaw) * cp];
    let dist = cam.dist;
    for (let s = 0.4; s <= cam.dist; s += 0.25) if (camSolid(tgt[0] + dir[0] * s, tgt[1] + dir[1] * s, tgt[2] + dir[2] * s)) { dist = Math.max(0.8, s - 0.35); break; }
    cam.eye = [tgt[0] + dir[0] * dist, tgt[1] + dir[1] * dist, tgt[2] + dir[2] * dist];
    aim.dir = [-dir[0], -dir[1], -dir[2]];
    if (S.jetting > 0) { S.jetting--; if (Math.random() < 0.8) parts.push({ x: px + (Math.random() - 0.5) * 0.3, y: py + 0.3, z: pz + (Math.random() - 0.5) * 0.3, vx: 0, vy: -4, vz: 0, life: 0.35, max: 0.35, size: 0.12, color: hexRGB(Math.random() < 0.5 ? '#ff9f1c' : '#ffd23f'), g: 0 }); }

    // effects
    trailT -= dt;
    if (trailT <= 0) { trailT = look.trail === 'fire' ? 0.03 : 0.06; if (look.trail && look.trail !== 'none') trailFor({ x: px, y: py, z: pz }, look.trail, moving || !S.onGround); }
    for (const p of parts) { p.life -= dt; p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.spin != null) p.spin += dt * 4; }
    parts = parts.filter((p) => p.life > 0);
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove('on'); }

    /* ----- build the scene ----- */
    const scene = [];
    const air = !S.onGround && S.air > 4;
    avatarParts({ x: px, y: py, z: pz, yaw: facing, walk, move: Math.min(1, hv / P3.speed), air, emote: emoteNow, et: emoteAt, t: clock, look: kothKing && kothKing === myId ? { ...look, hat: 'crown' } : look }, scene);
    shadow(scene, px, py, pz);
    if (look.pet && look.pet !== 'none') { petFollow(myPet, px, py, pz, facing, dt); petParts(look.pet, myPet.x, myPet.y, myPet.z, myPet.yaw, clock, myPet.moving ? Math.abs(Math.sin(clock * 10)) : 0, scene); }
    if (moverDraw.length) {
      const off = moverOffset(Math.max(0, S.steps - 1 + k));
      for (const m of moverDraw) scene.push({ prim: 'cube', color: m.color, glow: 0.12, m: M4.trs(m.x + 0.5 + (m.axis === 0 ? off : 0), m.y + 0.5 + (m.axis === 1 ? off : 0), m.z + 0.5 + (m.axis === 2 ? off : 0), 0, 0, 0, 1.0, 1.0, 1.0) });
    }
    const nowMs = performance.now();
    for (const o of others.values()) {
      const st = sampled(o, nowMs - 130);
      if (!st) continue;
      const code = st.a | 0, oMove = code & 1, oAir = !!(code & 2), em = (code >> 2) & 7;
      if (oMove) { o.walk += dt * 13; o.emote = null; }
      if (em && !o.emote) { o.emote = EMOTES[em - 1]; o.et = 0; }
      if (o.emote) o.et += dt;
      avatarParts({ x: st.p[0], y: st.p[1], z: st.p[2], yaw: st.r, walk: o.walk, move: oMove ? 1 : 0, air: oAir, emote: o.emote, et: o.et, t: clock, look: kothKing === o.id ? { ...o.look, hat: 'crown' } : o.look }, scene);
      shadow(scene, st.p[0], st.p[1], st.p[2]);
      if (o.look && o.look.pet && o.look.pet !== 'none') { o.pet = o.pet || {}; petFollow(o.pet, st.p[0], st.p[1], st.p[2], st.r, dt); petParts(o.look.pet, o.pet.x, o.pet.y, o.pet.z, o.pet.yaw, clock, o.pet.moving ? Math.abs(Math.sin(clock * 10)) : 0, scene); }
      o.trailT -= dt;
      if (o.trailT <= 0 && o.look && o.look.trail !== 'none') { o.trailT = 0.08; trailFor({ x: st.p[0], y: st.p[1], z: st.p[2] }, o.look.trail, oMove || oAir); }
      o.pos = st.p;
    }
    for (const c of coins) {
      if (S.got.has(c.i)) continue;
      scene.push({ prim: 'cyl', color: hexRGB('#ffd23f'), glow: 0.35, m: M4.trs(c.x, c.y + Math.sin(clock * 2 + c.x) * 0.08, c.z, clock * 2.5, 0, Math.PI / 2, 0.62, 0.1, 0.62) });
      scene.push({ prim: 'cube', color: hexRGB('#f0a500'), m: M4.trs(c.x, c.y + Math.sin(clock * 2 + c.x) * 0.08, c.z, clock * 2.5, 0, 0, 0.16, 0.3, 0.12) });
    }
    for (const f of flags) {
      const on = S.cp && Math.abs(S.cp.x - f.x) < 2 && Math.abs(S.cp.z - f.z) < 2 && Math.abs(S.cp.y - f.y) < 0.5;
      scene.push({ prim: 'cyl', color: hexRGB('#e8e8e8'), m: M4.trs(f.x - 0.3, f.y + 0.9, f.z - 0.3, 0, 0, 0, 0.08, 1.8, 0.08) });
      scene.push({ prim: 'cube', color: hexRGB(on ? '#44c06a' : '#a3abc2'), glow: on ? 0.3 : 0, m: M4.trs(f.x + 0.05, f.y + 1.5 + Math.sin(clock * 4) * 0.02, f.z - 0.3, Math.sin(clock * 3) * 0.15, 0, 0, 0.7, 0.45, 0.04) });
    }
    for (const g of goals) {
      const y = g.y + 1.3 + Math.sin(clock * 2) * 0.15;
      scene.push({ prim: 'cyl', color: hexRGB('#ffd23f'), glow: 0.5, m: M4.trs(g.x, y, g.z, clock, 0, 0, 0.7, 0.5, 0.7) });
      scene.push({ prim: 'cyl', color: hexRGB('#f0a500'), glow: 0.3, m: M4.trs(g.x, y - 0.42, g.z, clock, 0, 0, 0.22, 0.4, 0.22) });
      scene.push({ prim: 'cube', color: hexRGB('#f0a500'), glow: 0.3, m: M4.trs(g.x, y - 0.66, g.z, clock, 0, 0, 0.5, 0.1, 0.5) });
    }
    if (G3.clouds !== false) for (const c of clouds) {
      const x = ((c.x + clock * 0.6) % 160) - 16;
      scene.push({ prim: 'cube', color: [1, 1, 1], glow: 0.6, alpha: 0.85, m: M4.trs(x, c.y, c.z, 0, 0, 0, c.w, 1.2, c.d) });
    }
    for (const p of parts) {
      const s = p.size * Math.max(0.3, p.life / p.max);
      scene.push({ prim: 'cube', color: p.color, glow: 0.5, alpha: Math.max(0.05, Math.min(0.95, p.life / p.max)), m: M4.trs(p.x, p.y, p.z, p.spin || 0, p.spin || 0, 0, s, s, s) });
    }
    // a little 'still here' so the round keeps going and friends see you online (every 4 s in minigames, 30 s elsewhere)
    if (room && online && performance.now() - lastHb > (cfg ? 4000 : 30000)) { lastHb = performance.now(); room.send({ t: 'hb' }); }
    if (botMgr) {
      const list = [...[...others.values()].filter((o) => o.pos).map((o) => ({ id: o.id, pos: o.pos })), { id: myId, pos: [px, py, pz] }];
      const l = botMgr.frame(dt, { rs, players: list });
      if (l) for (const e of l) { const o = others.get(e[0]); if (o) { o.snaps.push({ t: performance.now(), p: [e[1], e[2], e[3]], r: e[4], a: e[5] }); if (o.snaps.length > 12) o.snaps.shift(); } }
    }
    roundTick(px, py, pz, scene, clock);
    shopTick(px, py, pz, scene);
    const pOn2 = paintOn();
    cross.hidden = !(pOn2 || (shiftLock && !shopOpen)); cross.classList.toggle('paint', pOn2);
    if (snowballs.length) snowTick(dt, scene);
    if (!fly) tipTick(dt);
    if (G3.auto) { const ch = G3.tick(dt); if (ch) gfxBtn.textContent = `Graphics: Auto (${GFX[ch].name})`; }
    R.frame({ eye: cam.eye, target: tgt, fov: 1.15, time: clock, parts: scene, far: G3.far || 230 });
    if (R.lost) { showMsg('The 3D graphics stopped working (the browser reset them). Leave and come back to keep playing.', true); stop(); return; }

    // name tags and chat bubbles
    placeTag(myTag, px, py + 2.05, pz, true);
    if (myBubbleUntil && nowMs > myBubbleUntil) { myBubble.hidden = true; myBubbleUntil = 0; }
    for (const o of others.values()) {
      if (!o.pos) { o.tag.hidden = true; continue; }
      placeTag(o.tag, o.pos[0], o.pos[1] + 2.05, o.pos[2]);
      if (o.bubbleUntil && nowMs > o.bubbleUntil) { o.tag.querySelector('.w3-bubble').hidden = true; o.bubbleUntil = 0; }
    }
    // HUD
    if (obby) {
      hudTime.textContent = `${(S.steps / 60).toFixed(1)}s`;
      hudCoins.textContent = S.totalCoins ? `Coins ${S.coins}/${S.totalCoins}` : '';
      hudDeaths.textContent = `Falls ${S.deaths}`;
    } else { hudTime.textContent = ''; hudCoins.textContent = S.totalCoins ? `Coins ${S.coins}/${S.totalCoins}` : ''; hudDeaths.textContent = ''; }
    for (const li of log.children) li.classList.toggle('old', nowMs - Number(li.dataset.at) > 12000);

    // tell the room where I am (about 6 times a second, only when something changed)
    if (room && online && myId && nowMs - lastSend > 150) {
      const a = (moving ? 1 : 0) | (air ? 2 : 0) | ((emoteNow ? EMOTES.indexOf(emoteNow) + 1 : 0) << 2);
      const st = [Math.round(px * 100) / 100, Math.round(py * 100) / 100, Math.round(pz * 100) / 100, Math.round(facing * 100) / 100, a];
      const key = st.join(',');
      if (key !== lastSent) { room.send({ t: 'st', p: st.slice(0, 3), r: st[3], a }); lastSent = key; lastSend = nowMs; }
    }
  }
  function shadow(scene, x, y, z) {
    if (G3.shadows === false) return;
    // drop a soft shadow on whatever is below
    for (let d = 0; d < 12; d++) {
      const gy = Math.floor(y - 0.01) - d;
      if (gy < 0) return;
      if (camSolid(x, gy + 0.5, z)) { const k = Math.max(0.15, 1 - (y - gy - 1) / 8); scene.push({ prim: 'shadow', alpha: 0.32 * k, m: M4.trs(x, gy + 1.02, z, 0, 0, 0, 1.1 * k, 1, 1.1 * k) }); return; }
    }
  }
  function sampled(o, t) {
    const s = o.snaps;
    if (!s.length) return null;
    if (s.length === 1 || t <= s[0].t) return s[0];
    for (let i = s.length - 1; i > 0; i--) {
      if (s[i - 1].t <= t) {
        const a = s[i - 1], b = s[i], k = Math.min(1, (t - a.t) / Math.max(1, b.t - a.t));
        let dr = b.r - a.r; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        return { p: [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k], r: a.r + dr * k, a: b.a };
      }
    }
    return s[s.length - 1];
  }
  function placeTag(el, x, y, z, me, far) {
    const p = R.project(x, y, z);
    if (!p || p.d > (far || 45) || (me && cam.dist < 3)) { el.hidden = true; return; }
    el.hidden = false;
    const sc = Math.max(0.6, Math.min(1.1, 9 / p.d));
    el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%) scale(${sc.toFixed(2)})`;
  }
  if (opts.note) toast(opts.note, 3.5);
  raf = requestAnimationFrame(loop);

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    removeEventListener('keydown', onKey); removeEventListener('keyup', onKey); removeEventListener('blur', clearKeys);
    document.removeEventListener('pointerlockchange', onLockChange); document.removeEventListener('mousemove', onMouseMove);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    document.removeEventListener('visibilitychange', onVis);
    if (room) room.close();
    stopMusic();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    R.destroy();
  }
  return { stop, restart, get sim() { return S; }, get online() { return online; }, get others() { return others.size; }, get renderer() { return R; }, send: (m) => room && room.send(m) };
}
