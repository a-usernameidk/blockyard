// A Durable Object: one live room on Cloudflare.
//   play rooms  ("p:<server code>")  up to 16 players in a 3D world, with chat.
//   edit rooms  ("e:<project id>")   friends building the same level or world together.
//   checkers    ("v:<n>")            replays runs to prove a level or world was beaten (they get more
//                                     computing time than normal requests, so long runs still fit).
// Uses the WebSocket Hibernation API, so an idle room costs nothing while people are connected.
import { TILES, THEMES, FORMS, SPEED_NAMES, LIMITS, cleanText, normalizeLevel } from '../public/js/format.js';
import { runReplay } from '../public/js/replay.js';
import { runReplay3d } from '../public/js/physics3d.js';
import { builtinWorld } from '../public/js/worlds3d.js';
import { Grid, decodeBlocks, encodeBlocks, BLOCKS, B, SKIES, MAX_BLOCKS, SX, SY, SZ, normalizeWorld, worldThumb } from '../public/js/world.js';

const MAX_PLAYERS = 16;
const CHAT_MAX = 200;
const LOG_KEEP = 60;
const SAVE_DELAY = 2000;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.log = [];        // recent chat, newest last
    this.rate = new Map(); // socket id -> { chat: [times], ops: [times], reports }
    this.pos = new Map();  // socket id -> last position message
    this.doc = null;       // edit rooms: the level or world being built
    this.dirty = false;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/verify') return json(this.verify(await request.json()));
    if (url.pathname === '/kick') {
      const uid = url.searchParams.get('uid');
      let n = 0;
      for (const ws of this.state.getWebSockets()) {
        const a = att(ws);
        if (a && a.uid === uid && !a.left) { this.drop(ws, a, url.searchParams.get('why') || 'You were removed from this server.', 4003); n++; }
      }
      return json({ ok: true, kicked: n });
    }
    if (url.pathname === '/count') return json({ players: this.state.getWebSockets().length });
    if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'Expected a WebSocket.' }, 426);

    let info;
    try { info = JSON.parse(request.headers.get('x-room') || ''); } catch (e) { return json({ error: 'Bad ticket.' }, 400); }
    const others = this.state.getWebSockets();
    // one connection per player per room: an older tab gets bumped
    for (const ws of others) { const a = att(ws); if (a && a.uid === info.uid && !a.left) this.drop(ws, a, 'You joined from somewhere else.', 4000); }
    const live = this.alive();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    if (info.kind === 'play' && live.length >= MAX_PLAYERS) {
      send(server, { t: 'full', m: 'This server is full. Try another one.' });
      server.close(4002, 'full');
      return new Response(null, { status: 101, webSocket: client });
    }
    const id = Math.random().toString(36).slice(2, 8);
    const me = { id, uid: info.uid, name: info.name, look: info.look || {}, admin: !!info.admin, kind: info.kind, room: info.room, world: info.world || null, code: info.code || null, project: info.project || null, p: null, r: 0, a: 0 };
    server.serializeAttachment(me);

    if (me.kind === 'edit') {
      try { await this.loadDoc(me.project); } catch (e) { send(server, { t: 'error', m: 'Could not open this project.' }); server.close(4004, 'no project'); return new Response(null, { status: 101, webSocket: client }); }
    }
    await this.loadLog();
    const players = live.map((ws) => pub(att(ws), this.pos));
    send(server, { t: 'hello', you: id, players, chat: this.log.slice(-30), doc: me.kind === 'edit' ? this.docOut() : undefined, code: me.code, world: me.world });
    this.broadcast({ t: 'join', player: pub(me, this.pos) }, server);
    if (me.kind === 'play') this.presence(me, true);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const me = att(ws);
    if (!me || typeof raw !== 'string' || raw.length > 200000) return;
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    const lim = this.limits(me.id);
    switch (msg.t) {
      case 'st': { // where I am: position, facing, animation
        const p = Array.isArray(msg.p) ? msg.p.slice(0, 3).map(Number) : null;
        if (!p || p.length !== 3 || !p.every(Number.isFinite)) return;
        const st = { p: p.map((v, i) => Math.round(Math.max(-40, Math.min(i === 1 ? SY + 40 : SX + 40, v)) * 100) / 100), r: Math.round((Number(msg.r) || 0) * 100) / 100, a: (msg.a | 0) & 255 };
        this.pos.set(me.id, st);
        // remember it on the socket now and then so a waking room knows where everyone is
        if (!lim.saved || Date.now() - lim.saved > 1500) { lim.saved = Date.now(); ws.serializeAttachment({ ...me, ...st }); }
        this.broadcast({ t: 'st', id: me.id, ...st }, ws);
        // keep the server list fresh while people play
        if (me.code && (!this.touched || Date.now() - this.touched > 120e3)) { this.touched = Date.now(); this.presence(me, true); }
        break;
      }
      case 'chat': {
        let m = cleanChat(msg.m);
        if (!m) return;
        const now = Date.now();
        lim.chat = lim.chat.filter((t) => now - t < 5000);
        if (lim.chat.length >= 3 || (lim.chat.length && now - lim.chat[lim.chat.length - 1] < 700)) { send(ws, { t: 'sys', m: 'Slow down a little. One message a second.' }); return; }
        lim.chat.push(now);
        const line = { id: me.id, uid: me.uid, n: me.name, m, at: now, admin: me.admin || undefined };
        await this.loadLog();
        this.log.push(line);
        if (this.log.length > LOG_KEEP) this.log.splice(0, this.log.length - LOG_KEEP);
        // kept in the room's own storage so reports still work after the room naps
        await this.state.storage.put('log', this.log);
        this.broadcast({ t: 'chat', ...line, uid: undefined });
        break;
      }
      case 'emote': {
        const e = ['wave', 'dance', 'cheer', 'sit', 'point'].includes(msg.e) ? msg.e : null;
        if (e) this.broadcast({ t: 'emote', id: me.id, e });
        break;
      }
      case 'report': {
        if (lim.reports >= 5) { send(ws, { t: 'sys', m: 'You sent a lot of reports. An admin will look at them.' }); return; }
        const target = this.state.getWebSockets().map(att).find((a) => a && a.id === msg.id);
        if (!target || target.uid === me.uid) return;
        lim.reports++;
        await this.loadLog();
        const said = this.log.filter((l) => l.uid === target.uid).slice(-20).map((l) => ({ m: l.m, at: l.at }));
        const reason = ['mean', 'spam', 'personal', 'cheating', 'other'].includes(msg.reason) ? msg.reason : 'other';
        try {
          await this.env.DB.prepare('INSERT INTO chat_reports (reporter, reporter_name, target_id, target, room, reason, messages, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(me.uid, me.name, target.uid, target.name, me.room, reason, JSON.stringify(said), Date.now()).run();
          send(ws, { t: 'sys', m: `Report sent. An admin will check what ${target.name} said.` });
        } catch (e) { send(ws, { t: 'sys', m: "Couldn't send the report. Try again in a bit." }); }
        break;
      }
      case 'op': {
        if (me.kind !== 'edit') return;
        const now = Date.now();
        lim.ops = lim.ops.filter((t) => now - t < 1000);
        if (lim.ops.length > 40) return;
        lim.ops.push(now);
        if (!this.doc) { try { await this.loadDoc(me.project); } catch (e) { return; } }
        const op = this.apply(msg.op, ws);
        if (!op) return;
        this.broadcast({ t: 'op', op, by: me.id, n: msg.n });
        this.dirty = true;
        if (!this.saveAt || this.saveAt < Date.now()) { this.saveAt = Date.now() + SAVE_DELAY; await this.state.storage.setAlarm(this.saveAt); }
        break;
      }
      case 'cur': { // where my cursor is, for other builders
        if (me.kind !== 'edit' || !Array.isArray(msg.c)) return;
        this.broadcast({ t: 'cur', id: me.id, c: msg.c.slice(0, 6).map((v) => Math.round(Number(v) * 10) / 10 || 0) }, ws);
        break;
      }
      case 'save': {
        if (me.kind === 'edit') { await this.flush(); send(ws, { t: 'saved' }); }
        break;
      }
      case 'ping': send(ws, { t: 'pong', at: msg.at }); break;
    }
  }

  async webSocketClose(ws) { try { ws.close(1000, 'bye'); } catch (e) { /* already closed */ } await this.gone(ws); }
  async webSocketError(ws) { await this.gone(ws); }
  async gone(ws) {
    const me = att(ws);
    if (!me || me.left) return;
    me.left = true;
    try { ws.serializeAttachment(me); } catch (e) { /* closed */ }
    this.pos.delete(me.id);
    this.rate.delete(me.id);
    this.broadcast({ t: 'leave', id: me.id }, ws);
    if (me.kind === 'play') await this.presence(me, false);
    if (me.kind === 'edit' && this.alive(ws).length === 0) await this.flush();
  }
  async alarm() {
    this.saveAt = 0;
    await this.flush();
  }

  /* ---------- helpers ---------- */
  async loadLog() {
    if (this.logLoaded) return;
    this.logLoaded = true;
    try { const saved = await this.state.storage.get('log'); if (Array.isArray(saved)) this.log = [...saved, ...this.log].slice(-LOG_KEEP); } catch (e) { /* start fresh */ }
  }
  drop(ws, a, why, code) {
    send(ws, { t: 'kicked', m: why });
    a.left = true;
    try { ws.serializeAttachment(a); } catch (e) { /* closed */ }
    try { ws.close(code, 'bye'); } catch (e) { /* gone */ }
    this.pos.delete(a.id);
    this.broadcast({ t: 'leave', id: a.id }, ws);
  }
  alive(except) { return this.state.getWebSockets().filter((ws) => ws !== except && att(ws) && !att(ws).left); }
  broadcast(msg, except) {
    const text = JSON.stringify(msg);
    for (const ws of this.alive(except)) { try { ws.send(text); } catch (e) { /* closed */ } }
  }
  limits(id) {
    let l = this.rate.get(id);
    if (!l) { l = { chat: [], ops: [], reports: 0, saved: 0 }; this.rate.set(id, l); }
    return l;
  }
  async presence(me, here) {
    const db = this.env.DB;
    if (!db || !me.code) return;
    const n = this.alive().length, now = Date.now();
    try {
      await db.batch([
        db.prepare('UPDATE servers SET players = ?, updated = ? WHERE code = ?').bind(n, now, me.code),
        here
          ? db.prepare('INSERT INTO presence (user_id, world, code, at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET world = excluded.world, code = excluded.code, at = excluded.at').bind(me.uid, me.world || '', me.code, now)
          : db.prepare('DELETE FROM presence WHERE user_id = ? AND code = ?').bind(me.uid, me.code),
      ]);
    } catch (e) { /* the room still works without the counts */ }
  }

  /* ---------- building together ---------- */
  async loadDoc(projectId) {
    if (this.doc && this.doc.id === projectId) return;
    const row = await this.env.DB.prepare('SELECT id, kind, name, data FROM projects WHERE id = ?').bind(projectId).first();
    if (!row) throw new Error('missing');
    const data = JSON.parse(row.data);
    if (row.kind === '3d') {
      let grid;
      try { grid = decodeBlocks(String(data.b || '')); } catch (e) { grid = new Grid(); }
      this.doc = { id: row.id, kind: '3d', meta: { n: cleanText(data.n, 40) || row.name, mode: data.mode === 'hangout' ? 'hangout' : 'obby', sky: SKIES[data.sky] ? data.sky : 'day' }, grid };
    } else {
      const lv = { n: row.name, style: 'adventure', theme: 'meadow', form: 'hopper', speed: '~', w: 48, h: 12, d: '', ...data };
      this.doc = { id: row.id, kind: '2d', meta: { n: cleanText(lv.n, LIMITS.name) || row.name, style: lv.style === 'rush' ? 'rush' : 'adventure', theme: THEMES.includes(lv.theme) ? lv.theme : 'meadow', form: FORMS.includes(lv.form) ? lv.form : 'hopper', speed: lv.speed in SPEED_NAMES ? lv.speed : '~' }, w: lv.w | 0, h: lv.h | 0, a: String(lv.d || '').split('') };
      if (this.doc.a.length !== this.doc.w * this.doc.h) { this.doc.w = 48; this.doc.h = 12; this.doc.a = Array(48 * 12).fill('.'); }
    }
  }
  docOut() {
    const d = this.doc;
    if (!d) return null;
    if (d.kind === '3d') return { kind: '3d', v: 1, ...d.meta, b: encodeBlocks(d.grid) };
    return { kind: '2d', ...d.meta, w: d.w, h: d.h, d: d.a.join('') };
  }
  // Checks one change, applies it, and returns the version to send to everyone (or null).
  apply(op, ws) {
    const d = this.doc;
    if (!op || typeof op !== 'object') return null;
    if (op.k === 'meta' && op.f && typeof op.f === 'object') {
      const f = {};
      if (typeof op.f.n === 'string') { const n = cleanText(op.f.n, 40); if (n) f.n = n; }
      if (d.kind === '3d') {
        if (op.f.mode === 'obby' || op.f.mode === 'hangout') f.mode = op.f.mode;
        if (SKIES[op.f.sky]) f.sky = op.f.sky;
      } else {
        if (op.f.style === 'rush' || op.f.style === 'adventure') f.style = op.f.style;
        if (THEMES.includes(op.f.theme)) f.theme = op.f.theme;
        if (FORMS.includes(op.f.form)) f.form = op.f.form;
        if (op.f.speed in SPEED_NAMES) f.speed = op.f.speed;
      }
      if (!Object.keys(f).length) return null;
      Object.assign(d.meta, f);
      return { k: 'meta', f };
    }
    if (d.kind === '2d') {
      if (op.k === 'cells' && Array.isArray(op.ch) && op.ch.length <= 20000) {
        const out = [];
        for (const c of op.ch) {
          if (!Array.isArray(c)) continue;
          const i = c[0] | 0, ch = String(c[1]);
          if (i < 0 || i >= d.a.length || ch.length !== 1 || (ch !== '.' && !TILES[ch])) continue;
          d.a[i] = ch; out.push([i, ch]);
        }
        return out.length ? { k: 'cells', ch: out } : null;
      }
      if (op.k === 'full') {
        const w = op.w | 0, h = op.h | 0, s = String(op.d || '');
        if (w < 16 || w > 400 || h < 10 || h > 40 || s.length !== w * h) return null;
        for (const ch of s) if (ch !== '.' && !TILES[ch]) return null;
        d.w = w; d.h = h; d.a = s.split('');
        return { k: 'full', w, h, d: s };
      }
      return null;
    }
    if (op.k === 'set' && Array.isArray(op.b) && op.b.length <= 8192) {
      const out = [];
      for (const b of op.b) {
        if (!Array.isArray(b)) continue;
        const x = b[0] | 0, y = b[1] | 0, z = b[2] | 0, t = b[3] | 0, c = (b[4] | 0) & 15;
        if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ || t < 0 || t >= BLOCKS.length) continue;
        if (t && !d.grid.get(x, y, z) && d.grid.count >= MAX_BLOCKS) { send(ws, { t: 'sys', m: `This world is full (${MAX_BLOCKS} blocks).` }); break; }
        if (t === B.spawn) {
          // only one spawn: remove the old one
          for (const [sx, sy, sz, st] of d.grid.each()) if (st === B.spawn && (sx !== x || sy !== y || sz !== z)) { d.grid.set(sx, sy, sz, 0); out.push([sx, sy, sz, 0, 0]); }
        }
        if (d.grid.set(x, y, z, t, c)) out.push([x, y, z, t, d.grid.color(x, y, z)]);
      }
      return out.length ? { k: 'set', b: out } : null;
    }
    return null;
  }
  async flush() {
    if (!this.doc || !this.dirty) return;
    this.dirty = false;
    const out = this.docOut();
    const { kind, ...data } = out;
    try {
      await this.env.DB.prepare('UPDATE projects SET data = ?, name = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(data), out.n, Date.now(), this.doc.id).run();
    } catch (e) { this.dirty = true; }
  }

  /* ---------- checking runs ---------- */
  verify(job) {
    try {
      if (job.type === '2d') return { ok: true, run: runReplay(job.raw ? job.level : normalizeLevel(job.level), String(job.replay || ''), job.opts || {}) };
      if (job.type === '3d') {
        const world = job.builtin ? builtinWorld(job.builtin).get().world : job.world;
        return { ok: true, run: runReplay3d(world, String(job.replay || ''), job.opts || {}) };
      }
      if (job.type === 'publish3d') {
        // check and clean a world, make its little picture, and (for obbies) replay the creator's run
        const w = normalizeWorld(job.world);
        const run = w.world.mode === 'obby' ? runReplay3d(w.world, String(job.replay || ''), { ...(job.opts || {}), grid: w.grid }) : null;
        return { ok: true, world: w.world, blocks: w.info.blocks, coins: w.info.coins.length, thumb: worldThumb(w.grid), run };
      }
      return { ok: false, error: 'Unknown check.' };
    } catch (e) { return { ok: false, error: e.message }; }
  }
}

function att(ws) { try { return ws.deserializeAttachment(); } catch (e) { return null; } }
function send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch (e) { /* closed */ } }
function pub(a, pos) {
  const st = pos.get(a.id) || (a.p ? { p: a.p, r: a.r, a: a.a } : {});
  return { id: a.id, name: a.name, look: a.look, admin: a.admin || undefined, p: st.p || null, r: st.r || 0, a: st.a || 0 };
}
// No word filter (Blockyard's choice), just tidy: no invisible characters, no giant messages.
export function cleanChat(m) {
  return String(m == null ? '' : m).replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
}
