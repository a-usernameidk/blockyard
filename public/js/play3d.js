// Playing a 3D world: your Pip, the camera, other players, chat, emotes, coins, checkpoints and the goal.
import { createRenderer, M4, hexRGB } from './gl.js';
import { decodeBlocks, Grid, BLOCKS, B, SX, SY, SZ } from './world.js';
import { createSim, step3, STEP3, packInput, yawIndex, KEY, P3 } from './physics3d.js';
import { encodeReplay } from './replay.js';
import { avatarParts, TRAIL3D, EMOTES } from './avatar3d.js';
import { openRoom } from './net.js';
import { sfx, startMusic, stopMusic, unlockAudio } from './audio.js';
import { store } from './api.js';

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
const EMOTE_LABEL = { wave: 'Wave', dance: 'Dance', cheer: 'Cheer', sit: 'Sit', point: 'Point' };

// opts: { world, title, by, mode, look, me, room (async ticket fn or null), onWin, onExit, onProfile, onTrade, test, low, note }
export function startWorld(root, opts) {
  const world = opts.world;
  const physGrid = decodeBlocks(world.b);
  const viewGrid = decodeBlocks(world.b);
  const obby = world.mode !== 'hangout';
  let S = createSim(world, physGrid);
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
  const chatForm = h('form', { class: 'w3-chat-form' }, chatInput, h('button', { class: 'btn', type: 'submit' }, 'Send'));
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
  const stage = h('div', { class: 'w3-stage' }, canvas, tags, h('div', { class: 'w3-hud' }, hudTime, hudCoins, hudDeaths, hudNet), toastEl, fade, players, chat, emoteBar, joy, jumpBtn, menu, winBox, msgBox);
  const restartBtn = h('button', { class: 'btn', type: 'button', title: 'Start over from the beginning' }, 'Restart');
  const resetBtn = h('button', { class: 'btn', type: 'button', title: 'Go back to your last checkpoint (R)' }, 'Respawn');
  const inviteBtn = h('button', { class: 'btn', type: 'button', hidden: true }, 'Invite');
  const fullBtn = h('button', { class: 'btn', type: 'button', title: 'Full screen' }, 'Full screen');
  const gfxBtn = h('button', { class: 'btn', type: 'button', title: 'Graphics quality' }, opts.low ? 'Graphics: fast' : 'Graphics: pretty');
  const bar = h('div', { class: 'bar w3-bar' },
    h('button', { class: 'btn', type: 'button', onclick: () => opts.onExit && opts.onExit() }, opts.test ? 'Back to building' : 'Leave'),
    h('div', { class: 'bar-title' }, h('h2', {}, opts.title || world.n), h('span', { class: 'by' }, opts.by ? 'by ' + opts.by : obby ? 'Obby' : 'Hangout')),
    obby ? restartBtn : null, resetBtn, inviteBtn, gfxBtn, fullBtn);
  const hint = h('p', { class: 'hint hint-keys' }, 'W A S D or arrows to move, Space to jump, drag to look around, scroll to zoom, Q and E turn the camera. R respawns. Enter to chat, 1 to 5 for emotes.');
  root.replaceChildren(bar, stage, hint);

  let R;
  try { R = createRenderer(canvas, { low: !!opts.low }); }
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
    if (down && /^Digit[1-5]$/.test(e.code)) { emote(EMOTES[Number(e.code.slice(5)) - 1]); return; }
    const k = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', Space: 'j', KeyQ: 'ql', KeyE: 'qr' }[e.code];
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
    } else camDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
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
    if (camDrag && camDrag.id === e.pointerId) camDrag = null;
  };
  canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(2.5, Math.min(18, cam.dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
  jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); unlockAudio(); jumpTouch = true; });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) jumpBtn.addEventListener(ev, () => { jumpTouch = false; });
  fullBtn.addEventListener('click', () => { const el = stage; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); });
  gfxBtn.addEventListener('click', () => { store.set('gfx-low', !opts.low); if (opts.onGraphics) opts.onGraphics(!opts.low); });

  function inputBits() {
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
        case 'land': if (e.v > 16) sfx('land'); burst(e.x, e.y, e.z, ['#ffffff'], 5, 2, 1); break;
        case 'bounce': sfx('bounce'); burst(e.x, e.y, e.z, ['#ff5d8f', '#ffffff'], 10, 3, 4); break;
        case 'speed': sfx('speed'); toast('Speed boost!', 0.9); break;
        case 'coin': sfx('coin'); burst(e.x, e.y, e.z, ['#ffd23f', '#fff6c9'], 8, 2.5, 3); break;
        case 'checkpoint': sfx('checkpoint'); burst(e.x, e.y, e.z, ['#44c06a', '#ffffff'], 12, 3, 4); toast('Checkpoint!'); break;
        case 'crumble': sfx('crumble'); break;
        case 'die': sfx('die'); burst(e.x, e.y + 0.6, e.z, [look.color, '#ffffff'], 16, 4, 4); fade.classList.remove('on'); void fade.offsetWidth; fade.classList.add('on'); break;
        case 'win': sfx('win'); won(); break;
      }
    }
    S.events.length = 0;
  }

  /* ---------------- multiplayer ---------------- */
  const others = new Map();
  let myId = null, room = null, lastSend = 0, lastSent = '', online = false;
  function addLine(who, text, color, sys) {
    const li = h('li', { class: sys === 'big' ? 'sys big' : sys ? 'sys' : '' });
    if (who) li.append(h('b', { style: color ? `color:${color}` : null }, who + ': '));
    li.append(text);
    log.append(li);
    while (log.children.length > 60) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
    li.dataset.at = String(performance.now());
  }
  function addPlayer(p) {
    if (others.has(p.id)) return;
    const tag = h('div', { class: 'w3-tag' }, h('span', { class: 'w3-name' + (p.admin ? ' admin' : '') }, p.name), h('span', { class: 'w3-bubble', hidden: true }));
    tags.append(tag);
    others.set(p.id, { ...p, snaps: p.p ? [{ t: performance.now(), p: p.p, r: p.r || 0, a: p.a || 0 }] : [], tag, walk: 0, bubbleUntil: 0, emote: null, et: 0, trailT: 0 });
    renderList();
  }
  function removePlayer(id) { const o = others.get(id); if (!o) return; o.tag.remove(); others.delete(id); renderList(); }
  function renderList() {
    listBtn.textContent = `Players ${others.size + 1}`;
    list.replaceChildren(h('li', { class: 'me' }, h('span', { class: 'dot', style: `background:${look.color}` }), (opts.me && opts.me.name) || 'You', ' (you)'),
      ...[...others.values()].map((o) => h('li', {}, h('button', { class: 'linkish', type: 'button', onclick: (e) => openMenu(o, e) }, h('span', { class: 'dot', style: `background:${(o.look && o.look.color) || '#ff6b35'}` }), o.name, isMutedPlayer(o.name) ? ' (muted)' : ''))));
  }
  listBtn.addEventListener('click', () => { list.hidden = !list.hidden; listBtn.setAttribute('aria-expanded', String(!list.hidden)); });
  function closeMenu() { menu.hidden = true; }
  function openMenu(o) {
    const m = isMutedPlayer(o.name);
    const reasons = h('select', { 'aria-label': 'Why are you reporting them?' }, ...[['mean', 'Mean or bullying'], ['spam', 'Spamming'], ['personal', 'Asking for or sharing personal info'], ['cheating', 'Cheating'], ['other', 'Something else']].map(([v, l]) => h('option', { value: v }, l)));
    const reportRow = h('div', { class: 'w3-report', hidden: true }, reasons, h('button', { class: 'btn btn-danger', type: 'button', onclick: () => { if (room) room.send({ t: 'report', id: o.id, reason: reasons.value }); closeMenu(); } }, 'Send report'));
    menu.replaceChildren(
      h('h3', {}, o.name),
      h('div', { class: 'w3-menu-row' },
        opts.onProfile ? h('button', { class: 'btn', type: 'button', onclick: () => opts.onProfile(o.name) }, 'Profile') : null,
        opts.onTrade ? h('button', { class: 'btn btn-sun', type: 'button', onclick: () => opts.onTrade(o.name) }, 'Trade') : null,
        h('button', { class: 'btn', type: 'button', onclick: () => { setMutedPlayer(o.name, !m); renderList(); closeMenu(); toast(m ? `${o.name} unmuted` : `${o.name} muted. You won't see their chat.`, 2); } }, m ? 'Unmute' : 'Mute'),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { reportRow.hidden = false; } }, 'Report')),
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
        break;
      case 'join': addPlayer(m.player); addLine(null, `${m.player.name} joined.`, null, true); sfx('join'); break;
      case 'leave': { const o = others.get(m.id); if (o) addLine(null, `${o.name} left.`, null, true); removePlayer(m.id); break; }
      case 'st': { const o = others.get(m.id); if (o) { o.snaps.push({ t: performance.now(), p: m.p, r: m.r, a: m.a }); if (o.snaps.length > 12) o.snaps.shift(); } break; }
      case 'chat': {
        if (isMutedPlayer(m.n)) break;
        const o = others.get(m.id);
        addLine(m.n, m.m, o && o.look ? o.look.color : m.id === myId ? look.color : null);
        if (o) { const b = o.tag.querySelector('.w3-bubble'); b.textContent = m.m; b.hidden = false; o.bubbleUntil = performance.now() + 6000; }
        if (m.id === myId) { myBubble.textContent = m.m; myBubble.hidden = false; myBubbleUntil = performance.now() + 6000; }
        else sfx('chat');
        break;
      }
      case 'emote': { const o = others.get(m.id); if (o) { o.emote = m.e; o.et = 0; } break; }
      case 'look': { const o = others.get(m.id); if (o) { o.look = m.look; renderList(); } break; }
      case 'sys': addLine(null, m.m, null, m.big ? 'big' : true); break;
      case 'kicked': case 'full': case 'error': showMsg(m.m, true); break;
    }
  }
  async function invite(code) {
    const url = location.href.split('#')[0] + '#/join/' + code;
    try { await navigator.clipboard.writeText(url); toast('Invite link copied! Send it to a friend.', 2.4); }
    catch (e) { addLine(null, 'Invite link: ' + url, null, true); }
  }
  const myTag = h('div', { class: 'w3-tag me' }, h('span', { class: 'w3-name' }, (opts.me && opts.me.name) || 'You'), h('span', { class: 'w3-bubble', hidden: true }));
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
    if (!room.send({ t: 'chat', m: text })) addLine(null, "Not connected, that message wasn't sent.", null, true);
    chatInput.value = '';
    chatInput.blur();
  });
  chatInput.addEventListener('focus', () => { clearKeys(); chat.classList.add('open'); });
  chatInput.addEventListener('blur', () => chat.classList.remove('open'));
  function emote(e) {
    if (!EMOTES.includes(e)) return;
    emoteNow = e; emoteAt = 0;
    if (room) room.send({ t: 'emote', e });
  }

  function showMsg(text, withLeave) {
    msgBox.hidden = false;
    msgBox.replaceChildren(h('div', { class: 'panel' }, h('p', {}, text), h('div', { class: 'row' },
      h('button', { class: 'btn btn-sun', type: 'button', onclick: () => { msgBox.hidden = true; } }, 'Keep playing'),
      withLeave ? h('button', { class: 'btn', type: 'button', onclick: () => opts.onExit && opts.onExit() }, 'Leave') : null)));
  }

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
      Promise.resolve(opts.onWin({ replay: encodeReplay(frames), time, deaths: S.deaths, coins: S.coins, totalCoins: S.totalCoins }))
        .then((r) => { reward.textContent = (r && r.text) || ''; })
        .catch((e) => { reward.textContent = e.message; });
    }
  }
  function restart() {
    S = createSim(world, physGrid);
    scatter();
    frames = []; acc = 0; prevP = { ...S.p }; winShown = false;
    for (const [i, t] of gone) { viewGrid.t[i] = t; const x = i % SX, z = Math.floor(i / SX) % SZ, y = Math.floor(i / (SX * SZ)); R.markDirty(x, y, z); }
    gone.clear();
    startMusic(obby ? 'adventure' : 'chill');
  }

  /* ---------------- the loop ---------------- */
  const gone = new Map(); // crumble blocks currently missing: index -> type
  let facing = 0, walk = 0, clock = 0;
  const onVis = () => { paused = document.hidden; last = performance.now(); acc = 0; if (paused) clearKeys(); };
  document.addEventListener('visibilitychange', onVis);
  msgBox.hidden = true;
  startMusic(obby ? 'adventure' : 'chill');

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (paused || stopped) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now; clock += dt;
    if (keys.has('ql')) cam.yaw -= dt * 2.2;
    if (keys.has('qr')) cam.yaw += dt * 2.2;
    if (!winShown) {
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
    if (moving) { const target = Math.atan2(S.v.x, S.v.z); let d = target - facing; d = Math.atan2(Math.sin(d), Math.cos(d)); facing += d * Math.min(1, dt * 14); emoteNow = null; }
    walk += hv * dt * 2.2;
    if (emoteNow) emoteAt += dt;
    // crumble blocks disappear and come back
    for (const [i, c] of S.crumbles) if (S.steps - c >= P3.crumbleDelay && !gone.has(i)) { gone.set(i, viewGrid.t[i]); viewGrid.t[i] = 0; R.markDirty(i % SX, Math.floor(i / (SX * SZ)), Math.floor(i / SX) % SZ); }
    for (const [i, t] of gone) if (!S.crumbles.has(i)) { viewGrid.t[i] = t; gone.delete(i); R.markDirty(i % SX, Math.floor(i / (SX * SZ)), Math.floor(i / SX) % SZ); }

    // camera: orbit around the player, pulled in if a wall is in the way
    const tgt = [px, py + 1.25, pz];
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const dir = [-Math.sin(cam.yaw) * cp, sp, Math.cos(cam.yaw) * cp];
    let dist = cam.dist;
    for (let s = 0.4; s <= cam.dist; s += 0.25) if (camSolid(tgt[0] + dir[0] * s, tgt[1] + dir[1] * s, tgt[2] + dir[2] * s)) { dist = Math.max(0.8, s - 0.35); break; }
    cam.eye = [tgt[0] + dir[0] * dist, tgt[1] + dir[1] * dist, tgt[2] + dir[2] * dist];

    // effects
    trailT -= dt;
    if (trailT <= 0) { trailT = look.trail === 'fire' ? 0.03 : 0.06; if (look.trail && look.trail !== 'none') trailFor({ x: px, y: py, z: pz }, look.trail, moving || !S.onGround); }
    for (const p of parts) { p.life -= dt; p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.spin != null) p.spin += dt * 4; }
    parts = parts.filter((p) => p.life > 0);
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove('on'); }

    /* ----- build the scene ----- */
    const scene = [];
    const air = !S.onGround && S.air > 4;
    avatarParts({ x: px, y: py, z: pz, yaw: facing, walk, move: Math.min(1, hv / P3.speed), air, emote: emoteNow, et: emoteAt, t: clock, look }, scene);
    shadow(scene, px, py, pz);
    const nowMs = performance.now();
    for (const o of others.values()) {
      const st = sampled(o, nowMs - 130);
      if (!st) continue;
      const code = st.a | 0, oMove = code & 1, oAir = !!(code & 2), em = (code >> 2) & 7;
      if (oMove) { o.walk += dt * 13; o.emote = null; }
      if (em && !o.emote) { o.emote = EMOTES[em - 1]; o.et = 0; }
      if (o.emote) o.et += dt;
      avatarParts({ x: st.p[0], y: st.p[1], z: st.p[2], yaw: st.r, walk: o.walk, move: oMove ? 1 : 0, air: oAir, emote: o.emote, et: o.et, t: clock, look: o.look }, scene);
      shadow(scene, st.p[0], st.p[1], st.p[2]);
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
    for (const c of clouds) {
      const x = ((c.x + clock * 0.6) % 160) - 16;
      scene.push({ prim: 'cube', color: [1, 1, 1], glow: 0.6, alpha: 0.85, m: M4.trs(x, c.y, c.z, 0, 0, 0, c.w, 1.2, c.d) });
    }
    for (const p of parts) {
      const s = p.size * Math.max(0.3, p.life / p.max);
      scene.push({ prim: 'cube', color: p.color, glow: 0.5, alpha: Math.max(0.05, Math.min(0.95, p.life / p.max)), m: M4.trs(p.x, p.y, p.z, p.spin || 0, p.spin || 0, 0, s, s, s) });
    }
    R.frame({ eye: cam.eye, target: tgt, fov: 1.15, time: clock, parts: scene, far: opts.low ? 140 : 230 });
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
  function placeTag(el, x, y, z, me) {
    const p = R.project(x, y, z);
    if (!p || p.d > 45 || (me && cam.dist < 3)) { el.hidden = true; return; }
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
    document.removeEventListener('visibilitychange', onVis);
    if (room) room.close();
    stopMusic();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    R.destroy();
  }
  return { stop, restart, get sim() { return S; }, get online() { return online; }, get others() { return others.size; }, get renderer() { return R; }, send: (m) => room && room.send(m) };
}
