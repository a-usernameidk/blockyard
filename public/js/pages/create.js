// Create: your projects (2D levels and 3D worlds), the editors, building with friends, and publishing.
import { $, $$, el, session, show, go, addRoute, ask, toast, openModal, closeModal, copyText, siteBase, needLogin, plural, timeAgo, onLeave, paintCanvas } from '../app.js';
import { normalizeLevel, encodeShare, isRude, cleanText, LIMITS, toWire } from '../format.js';
import { openEditor, closeEditor, currentLevel, validate, setMsg, updateMeta, newLevel, getDraft, onEditorChange, attachCollab, detachCollab, applyRemote, loadShared, showCursor, isCollab } from '../editor.js';
import { store, mine, myWorlds, newId, api, isOnline } from '../api.js';
import { progress } from '../progress.js';
import { emptyWorld, normalizeWorld } from '../world.js';
import { TEMPLATES_2D, TEMPLATES_3D } from '../templates.js';
import { drawThumb, thumbWindow, drawBackground, drawTile } from '../render2d.js';
import { drawPip } from '../art.js';
import { drawWorldThumb, thumbOfWorld } from '../thumb3d.js';
import { openRoom } from '../net.js';
import { playLevel, onRemix, remixOf, styleTag } from './play.js';
import { openAccount } from './account.js';

/* ---------------- what's open ---------------- */
// P: { kind: '2d' | '3d', id, cloud (bool), name, role, owner, collaborators, game }
let P = null, room = null, builder = null, testing = false, myId = null;
const team = new Map();

onLeave('edit', () => { if (!testing) closeSession(); });
onLeave('build', () => closeSession());
// testing a level opens the play page; going anywhere but back to the editor closes the project
onLeave('play', (to) => { if (testing && to !== 'edit') { testing = false; closeSession(); } });
function closeSession() {
  if (room) { room.send({ t: 'save' }); room.close(); room = null; }
  if (isCollab()) detachCollab();
  if (builder) { builder.stop(); builder = null; }
  closeEditor();
  team.clear();
}

/* ---------------- the Create page ---------------- */
async function showCreate() {
  show('create');
  $('#create-guest').hidden = !!session.user;
  const mineBox = $('#proj-mine'), shared = $('#proj-shared'), pub = $('#proj-pub');
  mineBox.replaceChildren(el('p', { class: 'msg' }, 'Loading…'));
  $('#proj-shared-wrap').hidden = true; $('#proj-pub-wrap').hidden = true;
  const localCards = [
    ...myWorlds.list().map((w) => projectCard({ kind: '3d', name: w.world.n, local: true, world: w.world, updated: w.updated, open: () => go('#/build/local/' + w.id), remove: () => removeLocal('3d', w.id, w.world.n), upload: session.user ? () => upload('3d', w.world, () => myWorlds.remove(w.id)) : null })),
    ...mine.list().map((lv) => projectCard({ kind: '2d', name: lv.n, local: true, level: lv, updated: lv.updated, open: () => go('#/edit/local/' + lv.id), play: () => go('#/play/' + lv.id), remove: () => removeLocal('2d', lv.id, lv.n), upload: session.user ? () => upload('2d', lv, () => mine.remove(lv.id)) : null })),
  ];
  if (!session.user) {
    mineBox.replaceChildren(...(localCards.length ? localCards : [el('div', { class: 'empty' }, el('p', {}, 'Nothing here yet. Start a new 2D level or 3D world.'))]));
    return;
  }
  try {
    const [r, g] = await Promise.all([api.projects(), api.myGames()]);
    const cloud = r.mine.map((p) => projectCard({ kind: p.kind, name: p.name, updated: p.updated_at, friends: p.friends, published: !!p.game_id, open: () => go(`#/${p.kind === '3d' ? 'build' : 'edit'}/${p.id}`), play: p.game_id ? () => go(p.kind === '3d' ? '#/w/' + p.game_id : '#/p/' + p.game_id) : null, remove: () => removeCloud(p) }));
    mineBox.replaceChildren(...cloud, ...localCards);
    if (!cloud.length && !localCards.length) mineBox.append(el('div', { class: 'empty' }, el('p', {}, 'Nothing here yet. Start a new 2D level or 3D world.')));
    if (r.shared.length) {
      $('#proj-shared-wrap').hidden = false;
      shared.replaceChildren(...r.shared.map((p) => projectCard({ kind: p.kind, name: p.name, updated: p.updated_at, owner: p.owner, open: () => go(`#/${p.kind === '3d' ? 'build' : 'edit'}/${p.id}`), leave: () => leaveProject(p) })));
    }
    if (g.games.length) { $('#proj-pub-wrap').hidden = false; pub.replaceChildren(...g.games.map(pubRow)); }
  } catch (e) { mineBox.replaceChildren(el('p', { class: 'msg' }, e.message), ...localCards); }
}
function projectArt(o) {
  const cv = el('canvas', { class: o.kind === '3d' ? 'thumb3d' : '', 'aria-hidden': 'true' });
  requestAnimationFrame(() => {
    if (o.kind === '3d') { drawWorldThumb(cv, o.world ? thumbOfWorld(o.world) : '', o.world ? o.world.sky : 'day'); if (!o.world) paintCanvas(cv, (c, W, H) => { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#4aa8ff'); g.addColorStop(1, '#d6efff'); c.fillStyle = g; c.fillRect(0, 0, W, H); cube(c, W / 2 - 40, H / 2 + 6, 22, '#5fc76b'); cube(c, W / 2, H / 2 - 8, 22, '#3a86ff'); cube(c, W / 2 + 40, H / 2 + 6, 22, '#ffd23f'); }); }
    else if (o.level) drawThumb(cv, thumbWindow(o.level, Math.max(30, Math.min(o.level.w, o.level.h * 2.5 | 0))), 5);
    else paintCanvas(cv, (c, W, H) => { drawBackground(c, 'meadow', 0, 0, W, H, 1); for (let x = 0; x < W; x += 32) drawTile(c, '#', x, H - 26, () => '.', 0, 'meadow'); c.save(); c.translate(W * 0.4, H - 26 - 18); drawPip(c, 28, progress.data.equip.color, { t: 1, look: 1 }); c.restore(); });
  });
  return cv;
}
function cube(c, x, y, s, col) {
  c.lineWidth = 2; c.strokeStyle = '#1d2340';
  const face = (pts, f) => { c.fillStyle = f; c.beginPath(); pts.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b))); c.closePath(); c.fill(); c.stroke(); };
  face([[x, y], [x + s, y - s / 2], [x + 2 * s, y], [x + s, y + s / 2]], col);
  face([[x, y], [x + s, y + s / 2], [x + s, y + 1.5 * s], [x, y + s]], 'rgba(0,0,0,.25)');
  face([[x + 2 * s, y], [x + s, y + s / 2], [x + s, y + 1.5 * s], [x + 2 * s, y + s]], 'rgba(0,0,0,.4)');
}
function projectCard(o) {
  const meta = el('div', { class: 'card-meta' },
    el('span', { class: 'tag ' + (o.kind === '3d' ? 'tag-3d' : 'tag-adventure') }, o.kind === '3d' ? '3D world' : '2D level'),
    o.local ? el('span', { class: 'tag' }, 'In this browser') : null,
    o.owner ? el('span', { class: 'tag' }, 'Owner: ' + o.owner) : null,
    o.friends ? el('span', { class: 'tag' }, `${plural(o.friends, 'friend')} building`) : null,
    o.published ? el('span', { class: 'tag tag-pay' }, 'Published') : null,
    o.updated ? el('span', { class: 'tag' }, timeAgo(o.updated)) : null);
  return el('article', { class: 'card' }, projectArt(o), el('div', { class: 'card-body' },
    el('div', {}, el('h3', {}, o.name || 'Untitled'), meta),
    el('div', { class: 'row' },
      el('button', { class: 'btn btn-sun', type: 'button', onclick: o.open }, 'Open'),
      o.play ? el('button', { class: 'btn btn-grass', type: 'button', onclick: o.play }, 'Play') : null,
      o.upload ? el('button', { class: 'btn', type: 'button', onclick: o.upload, title: 'Move it to your account so you can build with friends' }, 'Save online') : null,
      o.remove ? el('button', { class: 'btn btn-danger', type: 'button', onclick: o.remove }, 'Delete') : null,
      o.leave ? el('button', { class: 'btn', type: 'button', onclick: o.leave }, 'Leave') : null)));
}
function pubRow(g) {
  const vis = el('select', { 'aria-label': 'Who can play it' }, ...[['public', 'Everyone'], ['unlisted', 'Link only'], ['private', 'Only me and friends']].map(([v, l]) => el('option', { value: v }, l)));
  vis.value = g.visibility;
  vis.addEventListener('change', async () => { try { await api.visibility(g.id, vis.value); toast('Saved.'); } catch (e) { toast(e.message); } });
  const link = g.kind === '3d' ? '#/w/' + g.id : '#/p/' + g.id;
  // Builders can make their own games pay coins
  let pay = null;
  if (session.user && session.user.role === 'builder') {
    pay = el('select', { 'aria-label': 'Coins it pays' }, ...[0, 10, 25].map((n) => el('option', { value: String(n) }, n ? `Pays ${n} coins` : 'Pays nothing')));
    pay.value = String([0, 10, 25].includes(g.reward) ? g.reward : 0);
    pay.addEventListener('change', async () => { try { await api.gameReward(g.id, Number(pay.value)); toast(Number(pay.value) ? `It pays ${pay.value} coins now (once per player).` : "It doesn't pay coins anymore."); } catch (e) { toast(e.message); } });
  }
  return el('div', { class: 'pub-row' + (g.hidden ? ' hidden-game' : '') },
    el('div', {}, el('b', {}, g.name), el('span', { class: 'small' }, ` ${g.kind === '3d' ? '3D world' : '2D level'}, ${plural(g.plays, 'play')}, ${plural(g.likes, 'like')}${g.reward ? `, pays ${g.reward} coins` : ''}${g.hidden ? '. Hidden by reports or an admin.' : ''}`)),
    el('div', { class: 'row' }, vis, pay,
      el('button', { class: 'btn', type: 'button', onclick: (e) => copyText(siteBase() + link, e.currentTarget, 'Copy link') }, 'Copy link'),
      el('button', { class: 'btn btn-grass', type: 'button', onclick: () => go(link) }, 'Play'),
      el('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { if (await ask(`Unpublish "${g.name}"?`, 'It disappears for everyone. Your project stays, so you can publish again.', [{ label: 'Unpublish', value: true, cls: 'btn-danger' }])) { try { await api.remove(g.id); showCreate(); } catch (e) { toast(e.message); } } } }, 'Unpublish')));
}
async function removeLocal(kind, id, name) {
  if (!(await ask(`Delete "${name}"?`, "It's only saved in this browser, so it can't come back.", [{ label: 'Delete', value: true, cls: 'btn-danger' }]))) return;
  if (kind === '3d') myWorlds.remove(id); else mine.remove(id);
  showCreate();
}
async function removeCloud(p) {
  if (!(await ask(`Delete "${p.name}"?`, p.game_id ? 'The project is deleted for you and your friends. The published version stays up until you unpublish it.' : 'The project is deleted for you and your friends.', [{ label: 'Delete', value: true, cls: 'btn-danger' }]))) return;
  try { await api.deleteProject(p.id); showCreate(); } catch (e) { toast(e.message); }
}
async function leaveProject(p) {
  if (!(await ask(`Leave "${p.name}"?`, `You won't be able to open it unless ${p.owner} adds you again.`, [{ label: 'Leave', value: true, cls: 'btn-danger' }]))) return;
  try { await api.collab(p.id, session.user.name, 'leave'); showCreate(); } catch (e) { toast(e.message); }
}
async function upload(kind, data, after) {
  try {
    const clean = kind === '3d' ? data : rawLevel(data);
    const r = await api.newProject(kind, clean.n, clean);
    after();
    toast('Saved online. Now you can add friends to it.');
    go(`#/${kind === '3d' ? 'build' : 'edit'}/${r.project.id}`);
  } catch (e) { toast(e.message); }
}
const rawLevel = (lv) => { const n = normalizeLevel(lv); return { n: n.n, style: n.style, theme: n.theme, form: n.form, speed: n.speed, w: n.w, h: n.h, d: n.d }; };

/* ---------------- starting new things ---------------- */
async function newProject(kind, from) {
  if (session.user) {
    try {
      const data = kind === '3d' ? (from || emptyWorld('obby')) : rawLevel(from || newLevel('adventure'));
      const r = await api.newProject(kind, data.n, data);
      go(`#/${kind === '3d' ? 'build' : 'edit'}/${r.project.id}`);
    } catch (e) { toast(e.message); }
    return;
  }
  if (kind === '3d') { const id = newId(); myWorlds.save({ id, world: from || emptyWorld('obby') }); go('#/build/local/' + id); }
  else { const lv = from || newLevel('adventure'); mine.save({ ...lv, by: 'You' }); go('#/edit/local/' + lv.id); }
}
$('#new-2d').addEventListener('click', async () => {
  const pick = await ask('New 2D level', 'Pick where to start. Adventure: run and jump to the goal. Rush: you run by yourself and tap to survive.',
    Object.entries(TEMPLATES_2D).map(([k, t], i) => ({ label: t.name, value: k, cls: ['btn-grass', 'btn-sun', 'btn-danger'][i] || '' })));
  if (pick) newProject('2d', TEMPLATES_2D[pick].make());
});
$('#new-3d').addEventListener('click', async () => {
  const pick = await ask('New 3D world', 'Pick where to start: a blank obby or hangout, a ready-made minigame (Race, Tag, King of the Hill, Rising Lava, Paintball), or a Logic demo.',
    Object.entries(TEMPLATES_3D).map(([k, t], i) => ({ label: t.name, value: k, cls: i === 0 ? 'btn-grass' : i === 1 ? 'btn-sun' : '' })));
  if (pick) newProject('3d', TEMPLATES_3D[pick].make());
});
$('#create-login').addEventListener('click', () => openAccount('signup'));
onRemix((lv) => newProject('2d', lv));

/* ---------------- building together ---------------- */
function teamLine(who, text, sys) {
  const log = $('#ed-log');
  const li = el('li', { class: sys ? 'sys' : '' }, who ? el('b', {}, who + ': ') : null, text);
  log.append(li);
  while (log.children.length > 50) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
function status(text) { $('#ed-status').textContent = text; }
function renderTeam(base) {
  const names = [...team.values()].map((t) => t.name);
  status(names.length ? `${base} Building with ${names.join(', ')}.` : base);
}
$('#ed-chat').addEventListener('submit', (e) => { e.preventDefault(); const t = $('#ed-chat-in').value.trim(); if (t && room) room.send({ t: 'chat', m: t }); $('#ed-chat-in').value = ''; });

/* ---------------- 2D editor ---------------- */
const sigOf = (lv) => { try { const w = toWire(normalizeLevel(lv)); return JSON.stringify([w.style, w.theme, w.form, w.speed, w.w, w.h, w.d]); } catch (e) { return null; } };
function proven() { const lv = currentLevel(); return !!(lv.proof && lv.proof.sig && lv.proof.sig === sigOf(lv)); }
function renderProof() {
  const ok = proven(), p = $('#ed-proof');
  p.dataset.ok = String(ok);
  p.textContent = ok ? 'Beaten, ready to publish' : 'Not beaten yet';
}
let restTimer = 0;
onEditorChange(() => {
  renderProof();
  if (!P || P.kind !== '2d') return;
  if (P.cloud && !room) {
    // no live room: save to the server every so often
    clearTimeout(restTimer);
    restTimer = setTimeout(() => { if (P && P.cloud) api.saveProject(P.id, rawLevel(currentLevel())).then(() => status('Saved online.')).catch((e) => status(e.message)); }, 1500);
  } else if (!P.cloud) {
    clearTimeout(restTimer);
    restTimer = setTimeout(() => { if (P && !P.cloud) { mine.save({ ...currentLevel(), by: 'You' }); progress.stat('saved'); } }, 600);
  }
});

async function openLevel(id, local) {
  closeSession();
  show('edit', 'create');
  $('#ed-team').hidden = true;
  $('#ed-friends').hidden = true;
  if (local) {
    const lv = id === 'draft' ? getDraft() : mine.get(id);
    if (!lv) { go('#/create'); toast('That level is gone.'); return; }
    let full = lv; try { full = { ...lv, ...normalizeLevel(lv) }; } catch (e) { /* keep as is */ }
    P = { kind: '2d', id: lv.id, cloud: false, name: lv.n, pubId: lv.pubId, editKey: lv.editKey, pubUser: lv.pubUser };
    openEditor(full); renderProof();
    status(session.user ? 'Saved in this browser. Use "Save online" on the Create page to build with friends.' : 'Saved in this browser.');
    return;
  }
  if (!session.user) { go('#/create'); needLogin('Online projects need an account.'); return; }
  status('Loading…');
  let proj;
  try { proj = (await api.project(id)).project; } catch (e) { status(e.message); toast(e.message); go('#/create'); return; }
  P = { kind: '2d', id, cloud: true, name: proj.name, role: proj.role, owner: proj.owner, collaborators: proj.collaborators, game: proj.game };
  const lv = { id: 'c:' + id, by: proj.owner, ...proj.data, proof: store.get('proof:' + id, null) };
  openEditor(lv); renderProof();
  $('#ed-friends').hidden = false;
  if (!(session.online && (await roomsOn()))) { status('Saved online.'); return; }
  $('#ed-team').hidden = false; $('#ed-log').replaceChildren();
  status('Connecting…');
  room = openRoom(() => api.editRoom(id), {
    message: (m) => {
      if (m.t === 'hello') {
        myId = m.you; team.clear();
        for (const p of m.players) team.set(p.id, p);
        attachCollab({ send: (op, n) => room && room.send({ t: 'op', op, n }), cursor: (c) => room && room.send({ t: 'cur', c: [c.x, c.y] }) });
        if (m.doc && m.doc.d) loadShared(m.doc);
        renderProof(); renderTeam('Live: changes save by themselves.');
        if (team.size) { progress.stat('team'); progress.flush(); }
      } else if (m.t === 'op') applyRemote(m.op, { mine: m.by === myId, n: m.n });
      else if (m.t === 'join') { team.set(m.player.id, m.player); teamLine(null, `${m.player.name} is building with you.`, true); renderTeam('Live: changes save by themselves.'); progress.stat('team'); progress.flush(); }
      else if (m.t === 'leave') { const t = team.get(m.id); if (t) teamLine(null, `${t.name} left.`, true); team.delete(m.id); showCursor(m.id, null); renderTeam('Live: changes save by themselves.'); }
      else if (m.t === 'cur') { const t = team.get(m.id); if (t) showCursor(m.id, { x: m.c[0], y: m.c[1] }, t.name, t.look && t.look.color); }
      else if (m.t === 'chat') teamLine(m.n, m.m);
      else if (m.t === 'sys' || m.t === 'kicked' || m.t === 'error') { teamLine(null, m.m, true); if (m.t !== 'sys') status(m.m); }
    },
    drop: () => status('Reconnecting…'),
    closed: (why) => { status(why); if (isCollab()) detachCollab(); room = null; },
    error: (text) => { status(text); room = null; },
  });
}
async function roomsOn() {
  if (session.rooms) return true;
  try { const h = await fetch('/api/health').then((r) => r.json()); session.rooms = !!h.rooms; } catch (e) { /* no */ }
  return session.rooms;
}
$('#ed-back').addEventListener('click', () => go('#/create'));
$('#ed-friends').addEventListener('click', () => openFriends());

function testLevel() {
  const err = validate();
  if (err) { setMsg(err); return; }
  testing = true;
  const lv = normalizeLevel(currentLevel());
  const sig = sigOf(lv);
  playLevel(lv, {
    key: 'test', by: 'you (testing)',
    onExit: () => { testing = false; show('edit', 'create'); },
    onWin: (r) => {
      const proof = { sig, replay: r.replay };
      updateMeta({ proof });
      if (P && P.cloud) store.set('proof:' + P.id, proof);
      progress.stat('proven'); progress.flush();
      return { note: 'You beat your own level! You can publish it now.' };
    },
  });
}
$('#ed-test').addEventListener('click', testLevel);
$('#ed-share').addEventListener('click', () => {
  const err = validate();
  if (err) { setMsg(err); return; }
  const lv = currentLevel();
  const code = encodeShare(normalizeLevel(lv));
  $('#share-link').value = siteBase() + '#g=' + code;
  $('#share-code').value = code;
  const pubId = P && (P.game || P.pubId);
  $('#share-online').hidden = !pubId;
  if (pubId) $('#share-online-link').value = siteBase() + '#/p/' + pubId;
  openModal('#share-modal');
  $('#share-link').select();
});
$('#share-copy').addEventListener('click', (e) => copyText($('#share-online').hidden ? $('#share-link').value : $('#share-online-link').value, e.currentTarget, 'Copy link'));
$('#share-copy-code').addEventListener('click', (e) => copyText($('#share-code').value, e.currentTarget, 'Copy code'));

/* ---------------- 3D builder ---------------- */
async function openWorld(id, local) {
  closeSession();
  show('build', 'create');
  const root = $('#b3-root');
  root.replaceChildren(el('p', { class: 'msg' }, 'Loading…'));
  const { startBuilder } = await import('../build3d.js');
  const low = store.get('gfx-low', false);
  const common = { look: progress.data.equip, me: session.user ? { name: session.user.name } : { name: 'You' }, low, onExit: () => go('#/create'), onPublish: (w, proof, api3) => publish3d(w, proof, api3) };
  if (local) {
    const saved = myWorlds.get(id);
    if (!saved) { go('#/create'); toast('That world is gone.'); return; }
    P = { kind: '3d', id, cloud: false, name: saved.world.n };
    builder = startBuilder(root, { ...common, world: saved.world, proof: saved.proof, onChange: (w) => { myWorlds.save({ id, world: w, proof: builder ? builder.proof : saved.proof }); progress.stat('saved'); progress.flush(); }, onProof: (p) => myWorlds.save({ id, world: builder.getWorld(), proof: p }) });
    return;
  }
  if (!session.user) { go('#/create'); needLogin('Online projects need an account.'); return; }
  let proj;
  try { proj = (await api.project(id)).project; } catch (e) { toast(e.message); go('#/create'); return; }
  P = { kind: '3d', id, cloud: true, name: proj.name, role: proj.role, owner: proj.owner, collaborators: proj.collaborators, game: proj.game };
  const live = session.online && (await roomsOn());
  let saveT = 0;
  builder = startBuilder(root, {
    ...common, world: proj.data, proof: store.get('proof:' + id, null),
    room: live ? () => api.editRoom(id) : null,
    onFriends: () => openFriends(),
    onProof: (p) => store.set('proof:' + id, p),
    onChange: (w) => {
      progress.stat('saved');
      if (!live) { clearTimeout(saveT); saveT = setTimeout(() => api.saveProject(id, w).catch((e) => toast(e.message)), 1200); }
    },
  });
}

/* ---------------- friends on a project ---------------- */
function openFriends() {
  if (!P || !P.cloud) return;
  $('#fr-msg').textContent = '';
  const owner = P.role === 'owner';
  $('#fr-form').hidden = !owner;
  $('#fr-note').textContent = owner ? 'Friends you add can open this project and build with you live. Up to 8.' : `This project belongs to ${P.owner}. Only they can add or remove friends.`;
  renderFriends();
  openModal('#friends-modal');
}
function renderFriends() {
  const owner = P.role === 'owner';
  const list = $('#fr-list');
  list.replaceChildren(
    el('li', {}, el('b', {}, P.owner), el('span', { class: 'small' }, ' (owner)')),
    ...(P.collaborators || []).map((n) => el('li', {}, el('a', { class: 'linkish', href: '#/u/' + n }, n),
      owner ? el('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { try { const r = await api.collab(P.id, n, 'remove'); P.collaborators = r.collaborators; renderFriends(); } catch (e) { $('#fr-msg').textContent = e.message; } } }, 'Remove') : null)),
    !owner ? el('li', {}, el('button', { class: 'btn', type: 'button', onclick: async () => { try { await api.collab(P.id, session.user.name, 'leave'); closeModal($('#friends-modal')); go('#/create'); } catch (e) { $('#fr-msg').textContent = e.message; } } }, 'Leave this project')) : null);
}
$('#fr-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#fr-name').value.trim();
  if (!name) return;
  try { const r = await api.collab(P.id, name, 'add'); P.collaborators = r.collaborators; $('#fr-name').value = ''; $('#fr-msg').textContent = `${name} can build here now. Send them to Create, it's under "Shared with you".`; renderFriends(); }
  catch (err) { $('#fr-msg').textContent = err.message; }
});

/* ---------------- publishing ---------------- */
let pub = null; // { kind, world?, proof?, asNew }
function pubBlocked(text, btnLabel, action) {
  $('#pub-offline').hidden = false; $('#pub-form').hidden = true;
  $('#pub-offline-text').textContent = text;
  const b = $('#pub-offline-go');
  b.hidden = !btnLabel; b.textContent = btnLabel || '';
  b.onclick = () => { closeModal($('#publish-modal')); action(); };
}
function pubForm(name, desc, canUpdate, visibility) {
  $('#pub-offline').hidden = true; $('#pub-form').hidden = false;
  $('#pub-name').value = name; $('#pub-desc').value = desc || '';
  $('#pub-vis').value = visibility || 'public';
  $('#pub-who').textContent = `Published as ${session.user.name}.`;
  $('#pub-go').textContent = canUpdate ? 'Update the published version' : 'Publish';
  $('#pub-new').hidden = !canUpdate;
  $('#pub-go').disabled = false;
}
async function startPublish() {
  $('#pub-done').hidden = true; $('#pub-msg').textContent = '';
  pub.asNew = false;
  $('#pub-h').textContent = pub.kind === '3d' ? 'Publish your world' : 'Publish your level';
  const on = await isOnline();
  if (!on) pubBlocked('Publishing needs the online version of Blockyard, running on Cloudflare.');
  else if (!session.user) pubBlocked('Log in to publish. Your username shows on it.', 'Log in or sign up', () => openAccount());
  else if (pub.kind === '2d' && !proven()) pubBlocked('Beat your level in Test first. The server replays your winning run to prove it can be beaten, so nobody publishes impossible levels.', 'Test it now', testLevel);
  else if (pub.kind === '3d' && pub.world.mode === 'obby' && !pub.proof) pubBlocked('Beat your obby in Test first. The server replays your run to prove it can be beaten.', 'Test it now', pub.test);
  else {
    const gameId = P && (P.game || P.pubId);
    const canUpdate = !!(gameId && (P.cloud || P.pubUser === session.user.id || P.editKey));
    pubForm(pub.kind === '3d' ? pub.world.n : currentLevel().n, P && P.desc, canUpdate, 'public');
  }
  openModal('#publish-modal');
}
$('#ed-publish').addEventListener('click', () => {
  const err = validate();
  if (err) { setMsg(err); return; }
  pub = { kind: '2d' };
  startPublish();
});
function publish3d(world, proof, h) {
  try { normalizeWorld(world); } catch (e) { toast(e.message); return; }
  pub = { kind: '3d', world, proof, test: h && h.test };
  startPublish();
}
$('#pub-new').addEventListener('click', () => { pub.asNew = true; $('#pub-form').requestSubmit(); });
$('#pub-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = cleanText($('#pub-name').value, LIMITS.name);
  const desc = cleanText($('#pub-desc').value, LIMITS.desc);
  const visibility = $('#pub-vis').value;
  const msg = $('#pub-msg');
  if (!name) { msg.textContent = 'Give it a name.'; return; }
  if (isRude(name) || isRude(desc)) { msg.textContent = 'Something in the name or description has a blocked word. Change it and try again.'; return; }
  $('#pub-go').disabled = true; msg.textContent = 'Checking your run and publishing…';
  const extra = { visibility, project: P && P.cloud ? P.id : undefined };
  const gameId = P && (P.game || P.pubId);
  try {
    let id = gameId;
    if (pub.kind === '2d') {
      $('#ed-name').value = name;
      const lv = { ...currentLevel(), n: name, desc };
      const clean = normalizeLevel(lv);
      if (id && !pub.asNew) await api.update(id, clean, desc, lv.proof.replay, P.editKey, extra);
      else { const r = await api.publish(clean, desc, lv.proof.replay, extra); id = r.id; }
      updateMeta({ n: name, desc, pubId: id, pubUser: session.user.id });
      if (!P.cloud) mine.save({ ...currentLevel(), pubId: id, pubUser: session.user.id, desc, by: 'You' });
    } else {
      const w = { ...pub.world, n: name };
      const replay = pub.proof ? pub.proof.replay : '';
      if (id && !pub.asNew) await api.update3d(id, w, desc, replay, extra);
      else { const r = await api.publish3d(w, desc, replay, extra); id = r.id; }
    }
    if (P) { P.game = id; P.desc = desc; }
    progress.stat('published'); progress.flush();
    msg.textContent = '';
    $('#pub-form').hidden = true; $('#pub-done').hidden = false;
    const link = pub.kind === '3d' ? '#/w/' + id : '#/p/' + id;
    $('#pub-link').value = siteBase() + link;
    $('#pub-done-text').textContent = visibility === 'public' ? `Published! It's in the ${pub.kind === '3d' ? 'Worlds' : 'Player levels'} list now.` : visibility === 'unlisted' ? 'Published! Only people with the link can find it.' : 'Published privately. Only you and your project friends can open it.';
  } catch (err) {
    msg.textContent = err.message;
    $('#pub-go').disabled = false;
  }
});
$('#pub-copy').addEventListener('click', (e) => copyText($('#pub-link').value, e.currentTarget, 'Copy link'));

/* ---------------- routes ---------------- */
addRoute(/^#\/create$/, () => { closeSession(); showCreate(); });
addRoute(/^#\/edit\/local\/(.+)$/, (m) => openLevel(decodeURIComponent(m[1]), true));
addRoute(/^#\/edit\/([A-Za-z0-9]{10})$/, (m) => openLevel(m[1], false));
addRoute(/^#\/build\/local\/(.+)$/, (m) => openWorld(decodeURIComponent(m[1]), true));
addRoute(/^#\/build\/([A-Za-z0-9]{10})$/, (m) => openWorld(m[1], false));
