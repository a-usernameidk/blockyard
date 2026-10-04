// A Durable Object: one live room on Cloudflare.
//   play rooms  ("p:<server code>")  up to 16 players in a 3D world, with chat.
//   edit rooms  ("e:<project id>")   friends building the same level or world together.
//   checkers    ("v:<n>")            replays runs to prove a level or world was beaten (they get more
//                                     computing time than normal requests, so long runs still fit).
// Uses the WebSocket Hibernation API, so an idle room costs nothing while people are connected.
import { TILES, THEMES, FORMS, SPEED_NAMES, LIMITS, cleanText, normalizeLevel } from '../public/js/format.js';
import { runReplay } from '../public/js/replay.js';
import { runReplay3d } from '../public/js/physics3d.js';
import { cleanLogic } from '../public/js/logic.js';
import { cleanGearBan } from '../public/js/cosmetics.js';
import { builtinWorld } from '../public/js/worlds3d.js';
import { Grid, decodeBlocks, encodeBlocks, BLOCKS, B, SKIES, MAX_BLOCKS, SX, SY, SZ, normalizeWorld, worldThumb, GAME_TYPES, cleanShop, shopBlasters, idx, LIVE_BLOCKS } from '../public/js/world.js';
import { GAMES, ROUND, PRIZE, WEAPONS, BOTS, BOT_NAMES, BOT_LOOKS, gameConfig, onHill, lavaLevel, inBox } from '../public/js/games.js';
import { coinStmts, questBumps, loadEvents, xpStmt, timeXp } from './econ.js';
import { XP, isSong } from '../public/js/cosmetics.js';
import { normalizeParts, partsThumb } from '../public/js/parts.js';
import { runReplay2 } from '../public/js/phys2.js';
import { cleanDisplay, cleanTags } from '../public/js/names.js';

const MAX_PLAYERS = 16;
// In-server permissions (private servers): the owner makes players Builders or Admins while playing.
//   builder: can place and break blocks in this server (only here, the published world never changes)
//   admin:   builder + kick from this server, shout, fly, undo everyone's building
const PERMS = ['builder', 'admin'];
const MAX_EDITS = 4000;
const KICK_MS = 15 * 60e3; // a server kick keeps you out for 15 minutes
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
    this.game = undefined; // play rooms with minigames: their setup (null = no minigames here)
    this.round = null;     // the minigame round going on right now
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
    if (url.pathname === '/close') { // the owner deleted this private server
      for (const ws of this.state.getWebSockets()) { const a = att(ws); if (a && !a.left) this.drop(ws, a, 'The owner closed this private server.', 4003); }
      return json({ ok: true });
    }
    if (url.pathname === '/announce') {
      const m = cleanChat(url.searchParams.get('m'));
      if (m) this.broadcast({ t: 'sys', m: 'Announcement: ' + m, big: true });
      return json({ ok: true });
    }
    if (url.pathname === '/mute') { // the admin muted (or unmuted) someone who is in here right now
      const uid = url.searchParams.get('uid'), until = Number(url.searchParams.get('until')) || 0;
      for (const ws of this.state.getWebSockets()) { const a = att(ws); if (a && a.uid === uid && !a.left) { a.mu = until; ws.serializeAttachment(a); send(ws, { t: 'sys', m: until > Date.now() ? 'An admin muted your chat for a while.' : 'You can chat again.' }); } }
      return json({ ok: true });
    }
    if (url.pathname === '/closeall') { // the admin closed every server (like for a quick fix)
      const why = url.searchParams.get('why') || 'The admin closed all servers for a moment. Come back soon!';
      for (const ws of this.state.getWebSockets()) { const a = att(ws); if (a && !a.left && !a.admin) this.drop(ws, a, why, 4003); }
      return json({ ok: true });
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
    const me = { id, uid: info.uid, name: info.name, mu: Number(info.muted) || 0, look: info.look || {}, lvl: Math.max(1, Math.min(999, info.lvl | 0)), role: ['builder', 'builderpro'].includes(info.role) ? info.role : '', admin: !!info.admin, title: /^[a-z0-9]{2,20}$/.test(info.title || '') ? info.title : '', dn: cleanDisplay(info.display) || '', tags: cleanTags(info.tags), kind: info.kind, room: info.room, world: info.world || null, code: info.code || null, project: info.project || null, p: null, r: 0, a: 0, at: Date.now() };
    server.serializeAttachment(me);

    if (me.kind === 'edit') {
      if (!live.length && !this.dirty) this.doc = null; // first builder in: read the newest saved copy
      try { await this.loadDoc(me.project); } catch (e) { send(server, { t: 'error', m: 'Could not open this project.' }); server.close(4004, 'no project'); return new Response(null, { status: 101, webSocket: client }); }
    }
    await this.loadLog();
    if (me.kind === 'play') {
      await this.loadGame(me.world); await this.loadBots(me.code, me.world); await this.loadServer(me.code);
      if (this.isKicked(me.uid) && !me.admin) {
        send(server, { t: 'kicked', m: 'You were removed from this private server. Try again in a few minutes.' }); me.left = true; server.serializeAttachment(me); server.close(4003, 'kicked');
        return new Response(null, { status: 101, webSocket: client });
      }
      me.perm = this.permOf(me.uid);
      me.wi = await this.ownedItems(me.uid);
      server.serializeAttachment(me);
      await this.loadEdits();
    }
    // the private server's owner drives its bots
    const host = me.kind === 'play' && this.game && this.bots.owner && me.uid === this.bots.owner && !this.bots.host;
    if (host) this.bots.host = id;
    const players = [...live.map((ws) => pub(att(ws), this.pos)), ...this.botList().map((b) => pub(b, this.pos))];
    if (me.kind === 'play' && this.crownSecs) this.crownTick(id);
    send(server, { t: 'hello', you: id, crown: this.crown && this.crownSecs ? { id: this.crown.id, left: Math.max(0, Math.round((this.crown.until - Date.now()) / 1000)) } : undefined, players, chat: this.log.slice(-30), perm: me.perm || undefined, edits: me.kind === 'play' && this.edits.size ? [...this.edits].map(([i, [t, c]]) => [i, t, c]) : undefined, doc: me.kind === 'edit' ? this.docOut() : undefined, code: me.code, world: me.world, round: this.game ? this.roundOut() : undefined,
      bots: this.game && this.bots.owner ? { n: this.bots.n, skill: this.bots.skill, owner: me.uid === this.bots.owner, host: host || this.bots.host === id } : undefined });
    this.broadcast({ t: 'join', player: pub(me, this.pos) }, server);
    if (host) for (const b of this.botList()) this.broadcast({ t: 'join', player: pub(b, this.pos) }, server);
    if (me.kind === 'play') { this.presence(me, true); this.tick(); }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const me = att(ws);
    if (!me || me.left || typeof raw !== 'string' || raw.length > 200000) return;
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || typeof msg !== 'object') return;
    if (me.kind === 'play' && this.game === undefined) await this.loadGame(me.world); // the room napped: set minigames up again
    if (me.kind === 'play' && !this.bots) await this.loadBots(me.code, me.world, true);
    if (me.kind === 'play' && (!this.srv || this.srv.code !== me.code)) await this.loadServer(me.code);
    if (me.kind === 'play' && !this.edits) await this.loadEdits();
    const lim = this.limits(me.id);
    switch (msg.t) {
      case 'st': { // where I am: position, facing, animation
        const p = Array.isArray(msg.p) ? msg.p.slice(0, 3).map(Number) : null;
        if (!p || p.length !== 3 || !p.every(Number.isFinite)) return;
        // 2D levels (world '2:...') use pixels, so much bigger numbers
        const flat = typeof me.world === 'string' && me.world.startsWith('2:');
        const st = flat ? { p: [Math.round(Math.max(-2000, Math.min(60000, p[0]))), Math.round(Math.max(-4000, Math.min(12000, p[1]))), 0], r: (Number(msg.r) || 0) < 0 ? -1 : 1, a: (msg.a | 0) & 255 }
          : { p: p.map((v, i) => Math.round(Math.max(-40, Math.min(i === 1 ? 540 : 1040, v)) * 100) / 100), r: Math.round((Number(msg.r) || 0) * 100) / 100, a: (msg.a | 0) & 255 };
        this.pos.set(me.id, st);
        // remember it on the socket now and then so a waking room knows where everyone is
        if (!lim.saved || Date.now() - lim.saved > 1500) { lim.saved = Date.now(); ws.serializeAttachment({ ...me, ...st }); }
        this.broadcast({ t: 'st', id: me.id, ...st }, ws);
        if (this.round) this.watch(me, st);
        if (this.crownSecs) this.crownTick();
        // keep the server list fresh while people play
        // (each player's own row, so friends see everyone who's here, not just whoever moved last)
        if (me.code && (!lim.pres || Date.now() - lim.pres > 120e3)) { lim.pres = Date.now(); this.presence(me, true); }
        break;
      }
      case 'chat': {
        let m = cleanChat(msg.m);
        if (!m) return;
        if (me.mu > Date.now()) { send(ws, { t: 'sys', m: `An admin muted your chat for now (${Math.ceil((me.mu - Date.now()) / 60e3)} more minutes).` }); return; }
        const now = Date.now();
        lim.chat = lim.chat.filter((t) => now - t < 5000);
        if (lim.chat.length >= 3 || (lim.chat.length && now - lim.chat[lim.chat.length - 1] < 700)) { send(ws, { t: 'sys', m: 'Slow down a little. One message a second.' }); return; }
        lim.chat.push(now);
        const line = { id: me.id, uid: me.uid, n: me.name, dn: me.dn || undefined, m, at: now, admin: me.admin || undefined };
        await this.loadLog();
        this.log.push(line);
        if (this.log.length > LOG_KEEP) this.log.splice(0, this.log.length - LOG_KEEP);
        // kept in the room's own storage so reports still work after the room naps
        await this.state.storage.put('log', this.log);
        this.broadcast({ t: 'chat', ...line, uid: undefined });
        break;
      }
      case 'throw': { // snowballs: just passed on to everyone else (they're only for fun)
        const now = Date.now();
        lim.throws = (lim.throws || []).filter((t) => now - t < 1000);
        if (lim.throws.length >= 3) return;
        const o = Array.isArray(msg.o) ? msg.o.slice(0, 3).map(Number) : [], d = Array.isArray(msg.d) ? msg.d.slice(0, 3).map(Number) : [];
        if (o.length !== 3 || d.length !== 3 || ![...o, ...d].every(Number.isFinite) || Math.hypot(...d) > 1.5) return;
        lim.throws.push(now);
        this.broadcast({ t: 'throw', id: me.id, o: o.map((v) => Math.round(v * 100) / 100), d: d.map((v) => Math.round(v * 1000) / 1000) }, ws);
        break;
      }
      case 'shout': { // admins (and this server's admins) only: a big message everyone in this server sees
        if (!me.admin && !this.srvAdmin(me)) return;
        const m = cleanChat(msg.m);
        if (m) this.broadcast({ t: 'sys', m: `${me.dn || me.name} (${me.admin ? 'admin' : me.perm === 'owner' ? 'server owner' : 'server admin'}): ${m}`, big: true });
        break;
      }
      case 'perm': { // the private server's owner gives or takes Builder / Admin powers
        if (me.kind !== 'play' || me.perm !== 'owner') return;
        const ws2 = this.alive().find((x) => { const a = att(x); return a && a.id === msg.id; });
        const t = ws2 && att(ws2);
        if (!t || t.uid === me.uid) return;
        const p = PERMS.includes(msg.p) ? msg.p : '';
        if (p) this.srv.perms[t.uid] = p; else delete this.srv.perms[t.uid];
        t.perm = p; ws2.serializeAttachment(t);
        await this.saveServer();
        this.broadcast({ t: 'perm', id: t.id, p });
        this.broadcast({ t: 'sys', m: p ? `${t.dn || t.name} is now ${p === 'admin' ? 'an Admin' : 'a Builder'} in this server.` : `${t.dn || t.name} has no special powers here anymore.` });
        break;
      }
      case 'skick': { // this server's owner and admins can remove someone from the server
        if (me.kind !== 'play' || !this.srvAdmin(me)) return;
        const ws2 = this.alive().find((x) => { const a = att(x); return a && a.id === msg.id; });
        const t = ws2 && att(ws2);
        if (!t || t.uid === me.uid || t.admin || t.perm === 'owner' || (t.perm === 'admin' && me.perm !== 'owner')) { send(ws, { t: 'sys', m: "You can't remove that player." }); return; }
        this.srv.kicked = this.srv.kicked.filter((k) => k.u !== t.uid && Date.now() - k.at < KICK_MS).concat({ u: t.uid, at: Date.now() }).slice(-200);
        await this.saveServer();
        this.drop(ws2, t, `${me.dn || me.name} removed you from this private server. You can come back in 15 minutes.`, 4003);
        this.broadcast({ t: 'sys', m: `${t.dn || t.name} was removed from this server.` });
        break;
      }
      case 'build': { // Builders place and break blocks, only in this server
        if (me.kind !== 'play' || !this.canBuild(me) || !Array.isArray(msg.b)) return;
        const now = Date.now();
        lim.build = (lim.build || []).filter((x) => now - x < 1000);
        if (lim.build.length >= 12) return;
        lim.build.push(now);
        const out = [];
        for (const e of msg.b.slice(0, 16)) {
          if (!Array.isArray(e)) continue;
          const x = e[0] | 0, y = e[1] | 0, z = e[2] | 0, t = e[3] | 0, c = (e[4] | 0) & 63;
          if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ || (t && !LIVE_BLOCKS.includes(t))) continue;
          const i = idx(x, y, z);
          if (!this.edits.has(i) && this.edits.size >= MAX_EDITS) { send(ws, { t: 'sys', m: 'This server has lots of building already. The owner can undo it all to start fresh.' }); break; }
          this.edits.set(i, [t, BLOCKS[t] && BLOCKS[t].tint ? c : 0]);
          out.push([i, t, BLOCKS[t] && BLOCKS[t].tint ? c : 0]);
        }
        if (!out.length) return;
        this.broadcast({ t: 'build', b: out, by: me.id });
        this.editsDirty = true;
        if (!this.saveAt || this.saveAt < Date.now()) { this.saveAt = Date.now() + SAVE_DELAY; await this.state.storage.setAlarm(this.saveAt); }
        break;
      }
      case 'buildreset': { // the owner or an admin undoes everyone's building
        if (me.kind !== 'play' || !this.srvAdmin(me)) return;
        this.edits = new Map(); this.editsDirty = true;
        await this.state.storage.put('edits', []);
        this.broadcast({ t: 'buildreset' });
        this.broadcast({ t: 'sys', m: `${me.dn || me.name} undid all the building in this server.` });
        break;
      }
      case 'owned': { // you bought something in this world's shop: check what you own again
        if (me.kind !== 'play' || Date.now() - (lim.owned || 0) < 1500) return;
        lim.owned = Date.now();
        me.wi = await this.ownedItems(me.uid);
        ws.serializeAttachment(me);
        break;
      }
      case 'emote': {
        const e = ['wave', 'dance', 'cheer', 'sit', 'point', 'flip', 'spin'].includes(msg.e) ? msg.e : null;
        if (e) this.broadcast({ t: 'emote', id: me.id, e });
        break;
      }
      case 'report': {
        if (lim.reports >= 5) { send(ws, { t: 'sys', m: 'You sent a lot of reports. An admin will look at them.' }); return; }
        const target = this.state.getWebSockets().map(att).find((a) => a && a.id === msg.id);
        if (!target || target.uid === me.uid) return;
        lim.reports++;
        await this.loadLog();
        // only the last few things they said go to the admin
        const said = this.log.filter((l) => l.uid === target.uid && l.at <= Date.now()).slice(-5).map((l) => ({ from: target.name, m: l.m, at: l.at }));
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
      case 'smsg': { // an Engine v2 script talking to the other players' scripts (send("blast")): passed on, never run here
        if (me.kind !== 'play') return;
        const n = typeof msg.n === 'string' ? msg.n.slice(0, 20) : '';
        if (!n || !/^[\w .!?-]+$/.test(n)) return;
        // in a crown world only the player with the crown may send
        if (this.crownSecs && !(this.crown && this.crown.id === me.id)) return;
        const now = Date.now();
        lim.sm = (lim.sm || []).filter((t) => now - t < 10000);
        if (lim.sm.length >= 20) return;
        lim.sm.push(now);
        const at = this.pos.get(me.id);
        this.broadcast({ t: 'smsg', id: me.id, n, v: Math.round((Number(msg.v) || 0) * 1000) / 1000, p: at ? at.p : undefined }, ws);
        break;
      }
      case 'ping': send(ws, { t: 'pong', at: msg.at }); break;
      case 'fin': case 'tag': case 'out': case 'hit': this.gameMsg(me, msg); break;
      case 'bots': { // the owner's computer tells us where its bots are
        if (!this.bots || me.id !== this.bots.host || !Array.isArray(msg.l)) return;
        const ids = new Set(this.botList().map((b) => b.id));
        for (const e of msg.l.slice(0, BOTS.max)) {
          if (!Array.isArray(e) || !ids.has(e[0])) continue;
          const p = [e[1], e[2], e[3]].map(Number);
          if (!p.every(Number.isFinite)) continue;
          const st = { p: p.map((v, i) => Math.round(Math.max(-40, Math.min(i === 1 ? SY + 40 : SX + 40, v)) * 100) / 100), r: Math.round((Number(e[4]) || 0) * 100) / 100, a: (e[5] | 0) & 255 };
          this.pos.set(e[0], st);
          this.broadcast({ t: 'st', id: e[0], ...st }, ws);
          if (this.round) this.watch({ id: e[0] }, st);
        }
        break;
      }
      case 'botact': { // a bot finished, got out, tagged or hit someone
        if (!this.bots || me.id !== this.bots.host || !this.botList().some((b) => b.id === msg.id) || !['fin', 'out', 'tag', 'hit'].includes(msg.a)) return;
        this.gameMsg({ id: msg.id }, { t: msg.a, id: msg.target, w: msg.w, c: msg.c });
        break;
      }
      case 'botcfg': { // the owner changes how many bots and how smart, right in the game
        if (!this.bots || !this.bots.owner || me.uid !== this.bots.owner) return;
        const n = Math.max(0, Math.min(BOTS.max, Math.floor(Number(msg.n) || 0))), skill = BOTS.skills.includes(msg.skill) ? msg.skill : 'normal';
        this.removeBots(true);
        this.bots.n = n; this.bots.skill = skill;
        if (!this.bots.host) this.bots.host = me.id;
        try { await this.env.DB.prepare('UPDATE servers SET bots = ?, bot_skill = ? WHERE code = ?').bind(n, skill, me.code).run(); } catch (e) { /* still works for now */ }
        for (const b of this.botList()) this.broadcast({ t: 'join', player: pub(b, this.pos) });
        this.broadcast({ t: 'botcfg', n, skill, host: this.bots.host });
        this.tick();
        break;
      }
      case 'hb': {
        this.tick();
        if (this.crownSecs) this.crownTick();
        if (me.kind === 'play' && me.code && (!lim.pres || Date.now() - lim.pres > 120e3)) { lim.pres = Date.now(); this.presence(me, true); }
        break;
      }
      case 'look': { // you bought or changed clothes: show everyone (read from your account, so nobody can fake it)
        const now = Date.now();
        if (me.kind !== 'play' || now - (lim.look || 0) < 2000 || !this.env.DB) return;
        lim.look = now;
        try {
          const u = await this.env.DB.prepare('SELECT look FROM users WHERE id = ?').bind(me.uid).first();
          const l = JSON.parse((u && u.look) || '{}'), str = (v) => String(v || 'none').slice(0, 20);
          me.look = { color: /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : me.look.color, hat: str(l.hat), trail: str(l.trail), pet: str(l.pet), gear: str(l.gear) };
          ws.serializeAttachment(me);
          this.broadcast({ t: 'look', id: me.id, look: me.look });
        } catch (e) { /* keep the old look */ }
        break;
      }
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
    if (this.crownSecs && this.crown && this.crown.id === me.id) this.crownTick(null, ws);
    if (this.bots && this.bots.host === me.id) this.removeBots();
    if (me.kind === 'play') {
      await this.presence(me, false, ws); this.tick();
      // time played counts as XP (a minute = 1 XP, capped each day)
      if (me.uid && me.at && this.env.DB) { try { await timeXp(this.env.DB, me.uid, (Date.now() - me.at) / 60000); } catch (e) { /* no XP this time */ } }
    }
    if (me.kind === 'edit' && this.alive(ws).length === 0) await this.flush();
  }
  async alarm() {
    this.saveAt = 0;
    if (this.editsDirty) { this.editsDirty = false; try { await this.state.storage.put('edits', [...this.edits].map(([i, v]) => [i, ...v])); } catch (e) { /* try later */ } }
    if (this.round) this.tick();
    if (this.crownSecs) this.crownTick();
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
    this.rate.delete(a.id);
    this.broadcast({ t: 'leave', id: a.id }, ws);
    if (a.kind === 'play') this.presence(a, false, ws);
  }
  /* ---------- the crown (Engine v2 worlds with "crown" on): one player at a time gets it, picked at random ---------- */
  // quiet: the id of someone who is joining right now (they hear about the crown in their hello instead)
  crownTick(quiet, except) {
    const here = this.alive(except).map(att).filter((a) => a.kind === 'play'), now = Date.now();
    if (!here.length) { this.crown = null; return; }
    const C = this.crown;
    if (C && now < C.until && here.some((a) => a.id === C.id)) return;
    // someone new when there is anyone else to pick
    const pool = here.filter((a) => !C || a.id !== C.id), pick = (pool.length ? pool : here)[Math.floor(Math.random() * (pool.length || here.length))];
    this.crown = { id: pick.id, until: now + this.crownSecs * 1000 };
    const text = JSON.stringify({ t: 'crown', id: pick.id, left: this.crownSecs });
    for (const ws of this.alive(except)) { const a = att(ws); if (a && a.kind === 'play' && a.id !== quiet) { try { ws.send(text); } catch (e) { /* closed */ } } }
    // wake up when the time is over even if nobody moves (keep an earlier alarm that is waiting to save)
    const at = this.saveAt && this.saveAt > now ? Math.min(this.saveAt, this.crown.until + 50) : this.crown.until + 50;
    this.state.storage.setAlarm(at).catch(() => {});
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
  async presence(me, here, except) {
    const db = this.env.DB;
    if (!db || !me.code) return;
    const n = this.alive(except).length, now = Date.now();
    try {
      await db.batch([
        db.prepare('UPDATE servers SET players = ?, updated = ? WHERE code = ?').bind(n, now, me.code),
        here
          ? db.prepare('INSERT INTO presence (user_id, world, code, at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET world = excluded.world, code = excluded.code, at = excluded.at').bind(me.uid, me.world || '', me.code, now)
          : db.prepare('DELETE FROM presence WHERE user_id = ? AND code = ?').bind(me.uid, me.code),
      ]);
    } catch (e) { /* the room still works without the counts */ }
  }

  /* ---------- private servers: owner, powers, live building ---------- */
  async loadServer(code) {
    if (this.srv && this.srv.code === code) return;
    this.srv = { code, owner: null, perms: {}, kicked: [] };
    if (!code || !this.env.DB) return;
    try {
      const r = await this.env.DB.prepare('SELECT owner_id, private, perms FROM servers WHERE code = ?').bind(code).first();
      if (r && r.private && r.owner_id) {
        this.srv.owner = r.owner_id;
        const p = JSON.parse(r.perms || '{}');
        for (const [u, v] of Object.entries(p && typeof p === 'object' ? p : {})) if (PERMS.includes(v)) this.srv.perms[u] = v;
      }
      const k = await this.state.storage.get('kicked');
      if (Array.isArray(k)) this.srv.kicked = k.filter((x) => x && Date.now() - x.at < KICK_MS).slice(-200);
    } catch (e) { /* no powers then */ }
  }
  async saveServer() {
    try {
      await this.state.storage.put('kicked', this.srv.kicked);
      if (this.env.DB) await this.env.DB.prepare('UPDATE servers SET perms = ? WHERE code = ?').bind(JSON.stringify(this.srv.perms), this.srv.code).run();
    } catch (e) { /* powers still work until the room naps */ }
  }
  isKicked(uid) { return this.srv.kicked.some((k) => k.u === uid && Date.now() - k.at < KICK_MS); }
  permOf(uid) { return !this.srv || !this.srv.owner ? '' : uid === this.srv.owner ? 'owner' : this.srv.perms[uid] || ''; }
  srvAdmin(me) { return !!me.admin || me.perm === 'owner' || me.perm === 'admin'; }
  canBuild(me) { return me.admin || me.perm === 'owner' || PERMS.includes(me.perm); }
  async loadEdits() {
    if (this.edits) return;
    this.edits = new Map();
    try { const e = await this.state.storage.get('edits'); if (Array.isArray(e)) for (const [i, t, c] of e) this.edits.set(i, [t, c]); } catch (e) { /* start fresh */ }
  }
  // which of this world's shop items you bought (the maker owns all of them)
  async ownedItems(uid) {
    if (!this.shopLock || !this.shopLock.size || !uid || !this.env.DB) return [];
    if (uid === this.creator) return ['*'];
    try { return (await this.env.DB.prepare('SELECT item FROM world_items WHERE user_id = ? AND game_id = ?').bind(uid, this.worldId).all()).results.map((r) => r.item); } catch (e) { return []; }
  }
  ownsBlaster(me, w) { return !this.shopLock || !this.shopLock.has(w) || (me.wi && (me.wi.includes('*') || me.wi.includes('b-' + w))); }

  /* ---------- minigames ---------- */
  async loadGame(worldId) {
    if (this.game !== undefined) return;
    this.game = null;
    try {
      const b = builtinWorld(worldId);
      this.crownSecs = 0;
      if (b) { this.game = b.game ? gameConfig(null, b) : null; if (b.v2) this.crownSecs = Number(b.get().world.crown) || 0; }
      else if (worldId && this.env.DB) {
        const row = await this.env.DB.prepare("SELECT data, user_id FROM games WHERE id = ? AND kind = '3d'").bind(worldId).first();
        if (row) {
          const data = JSON.parse(row.data);
          if (data && data.engine === 2) this.crownSecs = Math.max(0, Math.min(600, Number(data.crown) || 0));
          this.game = gameConfig(data);
          // blasters this world sells are locked until you buy them
          this.shopLock = shopBlasters(data); this.creator = row.user_id; this.worldId = worldId;
        }
      }
    } catch (e) { this.game = null; }
    if (this.game) this.round = { phase: 'wait', n: 0 };
  }
  players() { return [...this.alive().map(att).filter((a) => a.kind === 'play'), ...this.botList()]; }
  /* ---------- bots (private servers of Blockyard minigame worlds) ---------- */
  async loadBots(code, world, wake) {
    if (!this.bots) this.bots = { n: 0, skill: 'normal', owner: null, host: null };
    if (this.botsFor === code || !code || !this.env.DB) return;
    this.botsFor = code;
    try {
      const r = await this.env.DB.prepare('SELECT owner_id, private, bots, bot_skill, world FROM servers WHERE code = ?').bind(code).first();
      const b = r && builtinWorld(r.world);
      if (r && r.private && b && b.game) Object.assign(this.bots, { n: Math.max(0, Math.min(BOTS.max, r.bots | 0)), skill: BOTS.skills.includes(r.bot_skill) ? r.bot_skill : 'normal', owner: r.owner_id });
      // after a nap: if the owner is still here, they keep driving the bots
      const ownerHere = this.alive().map(att).find((a) => a.kind === 'play' && a.uid === this.bots.owner);
      if (wake && ownerHere && !this.bots.host) this.bots.host = ownerHere.id;
    } catch (e) { /* no bots then */ }
  }
  botList() {
    const b = this.bots;
    if (!b || !b.host || !b.n) return [];
    return Array.from({ length: b.n }, (_, i) => ({ id: 'bot' + (i + 1), name: BOT_NAMES[i] + ' (bot)', look: BOT_LOOKS[i], lvl: 1, uid: null, bot: true, kind: 'play' }));
  }
  removeBots(keepHost) {
    for (const b of this.botList()) { this.pos.delete(b.id); this.broadcast({ t: 'leave', id: b.id }); }
    if (!keepHost && this.bots) this.bots.host = null;
  }
  roundOut(extra) {
    const R = this.round;
    if (!R) return null;
    return { practice: R.practice || undefined, phase: R.phase, mode: R.mode, left: R.ends ? Math.max(0, R.ends - Date.now()) : 0, it: R.it ? [...R.it] : [], alive: R.alive ? [...R.alive] : [], fin: R.fin || [],
      scores: R.scores ? Object.fromEntries([...R.scores].map(([k, v]) => [k, Math.round(v * 10) / 10])) : {}, lava: R.lava, results: R.results, need: ROUND.minPlayers, ...extra };
  }
  sendRound(extra) {
    this.broadcast({ t: 'round', ...this.roundOut(extra) });
    // wake up when this part of the round is over, even if nobody is moving
    const R = this.round;
    if (R && R.ends && R.ends !== this.alarmFor) { this.alarmFor = R.ends; this.state.storage.setAlarm(R.ends + 30).catch(() => {}); }
  }
  // Moves the round along. Called whenever something happens (players send positions many times a second).
  tick() {
    const R = this.round;
    if (!R || !this.game) return;
    const now = Date.now(), here = this.players(), n = here.length;
    if (R.phase === 'wait') {
      if (n >= ROUND.minPlayers) { R.mode = this.game.modes[R.n++ % this.game.modes.length]; R.phase = 'intro'; R.ends = now + ROUND.wait * 1000; R.results = null; this.sendRound(); }
      return;
    }
    if (R.phase === 'intro') {
      if (n < ROUND.minPlayers) { R.phase = 'wait'; R.ends = 0; this.sendRound(); return; }
      if (now < R.ends) return;
      // go! everyone here right now is in the round
      R.phase = 'play'; R.start = now; R.ends = now + GAMES[R.mode].secs * 1000;
      R.ids = new Set(here.map((a) => a.id)); R.names = Object.fromEntries(here.map((a) => [a.id, { name: a.name, uid: a.uid }]));
      R.practice = [...R.ids].some((x) => String(x).startsWith('bot')); // rounds with bots are practice: no coins
      R.alive = new Set(R.ids); R.fin = []; R.scores = new Map(); R.seen = new Map(); R.startCount = R.ids.size;
      R.it = new Set(); R.hits = new Map(); R.lastShot = new Map(); R.safe = new Map();
      if (R.mode === 'tag') { const list = [...R.ids]; const k = n >= 6 ? 2 : 1; while (R.it.size < k) R.it.add(list[Math.floor(Math.random() * list.length)]); R.firstIt = new Set(R.it); }
      R.lava = R.mode === 'lava' ? lavaLevel(this.game.areas.lava, 0) : undefined;
      this.sendRound();
      return;
    }
    if (R.phase === 'play') {
      const ids = new Set(here.map((a) => a.id));
      for (const id of [...R.ids]) if (!ids.has(id)) { R.ids.delete(id); R.alive.delete(id); R.it.delete(id); }
      if (R.mode === 'lava') {
        const lv = lavaLevel(this.game.areas.lava, (now - R.start) / 1000);
        if (lv !== R.lava) { R.lava = lv; this.sendRound(); }
      }
      const free = [...R.ids].filter((id) => !R.it.has(id));
      const over = now >= R.ends || R.ids.size === 0
        || (R.mode === 'race' && R.fin.length >= R.ids.size)
        || (R.mode === 'tag' && (free.length === 0 || R.it.size === 0))
        || (R.mode === 'lava' && R.alive.size <= (R.startCount > 1 ? 1 : 0));
      if (over) this.endRound();
      return;
    }
    if (R.phase === 'results' && now >= R.ends) {
      if (n >= ROUND.minPlayers) { R.mode = this.game.modes[R.n++ % this.game.modes.length]; R.phase = 'intro'; R.ends = now + ROUND.wait * 1000; }
      else { R.phase = 'wait'; R.ends = 0; }
      R.results = null; this.sendRound();
    }
  }
  // Keeps score from where players are (King of the Hill, Rising Lava).
  watch(me, st) {
    const R = this.round;
    if (!R || R.phase !== 'play' || !R.ids.has(me.id)) { this.tick(); return; }
    const now = Date.now();
    if (R.mode === 'koth') {
      const last = R.seen.get(me.id) || now; R.seen.set(me.id, now);
      if (onHill(this.game.areas.koth, st.p[0], st.p[1], st.p[2])) R.scores.set(me.id, (R.scores.get(me.id) || 0) + Math.min(0.5, (now - last) / 1000));
      if (!R.lastScores || now - R.lastScores > 1000) { R.lastScores = now; this.sendRound(); }
    } else if (R.mode === 'lava' && R.alive.has(me.id) && R.lava != null && st.p[1] < R.lava - 0.6 && inBox(this.game.areas.lava, st.p[0], st.p[2])) {
      R.alive.delete(me.id); this.sendRound({ ev: { out: me.id } });
    }
    this.tick();
  }
  gameMsg(me, msg) {
    const R = this.round;
    if (!R || R.phase !== 'play' || !R.ids.has(me.id)) return;
    if (msg.t === 'fin' && R.mode === 'race' && !R.fin.includes(me.id)) { R.fin.push(me.id); this.sendRound({ ev: { fin: me.id } }); }
    else if (msg.t === 'out' && R.mode === 'lava' && R.alive.has(me.id)) { R.alive.delete(me.id); this.sendRound({ ev: { out: me.id } }); }
    else if (msg.t === 'tag' && R.mode === 'tag' && R.it.has(me.id) && R.ids.has(msg.id) && !R.it.has(msg.id) && Date.now() - R.start >= ROUND.itWait - 300) {
      const a = this.posOf(me.id), b = this.posOf(msg.id);
      if (a && b && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < ROUND.tagReach + 1.2) { R.it.add(msg.id); this.sendRound({ ev: { tag: msg.id, by: me.id } }); }
    }
    else if (msg.t === 'hit' && R.mode === 'paint' && msg.id !== me.id && R.ids.has(msg.id)) {
      // the blaster decides how often you can hit, how far, and how much paint
      let wid = Object.hasOwn(WEAPONS, msg.w) ? msg.w : 'blaster';
      if (!this.ownsBlaster(me, wid)) wid = 'blaster'; // a blaster from the world's shop you didn't buy
      const wp = WEAPONS[wid], now = Date.now();
      const last = R.lastShot.get(me.id) || { at: 0, w: wid };
      // reload time is the blaster you last hit with; switching blasters takes a moment too
      if (now - last.at < WEAPONS[last.w].every - 60 || (last.w !== wid && now - last.at < ROUND.swapMs)) return;
      if (now - (R.safe.get(msg.id) || 0) < ROUND.safeMs) return; // just splatted: a moment to get away
      const a = this.posOf(me.id), b = this.posOf(msg.id);
      if (!a || !b || Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > wp.range + 2) return;
      R.lastShot.set(me.id, { at: now, w: wid });
      const n = (R.hits.get(msg.id) || 0) + wp.dmg;
      if (n >= ROUND.hp) {
        R.hits.set(msg.id, 0); R.safe.set(msg.id, now); R.scores.set(me.id, (R.scores.get(me.id) || 0) + 1);
        this.sendRound({ ev: { splat: msg.id, by: me.id, w: wid } });
      } else { R.hits.set(msg.id, n); this.broadcast({ t: 'paint', id: msg.id, by: me.id, n, w: wid }); }
    }
    this.tick();
  }
  posOf(id) {
    const st = this.pos.get(id);
    if (st) return st.p;
    const a = this.state.getWebSockets().map(att).find((x) => x && x.id === id);
    return a && a.p;
  }
  endRound() {
    const R = this.round, mode = R.mode, name = (id) => (R.names[id] || {}).name || '?';
    const count = Object.keys(R.names).length;
    let winners = []; // [id, place, prize]
    if (mode === 'race') winners = R.fin.slice(0, 3).map((id, i) => [id, i + 1, [PRIZE.first, PRIZE.second, PRIZE.third][i]]);
    else if (mode === 'tag') {
      const free = [...R.ids].filter((id) => !R.it.has(id));
      winners = (free.length ? free : [...R.firstIt].filter((id) => R.ids.has(id))).map((id) => [id, 1, PRIZE.win]);
    } else if (mode === 'paint') winners = [...R.scores].filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id], i) => [id, i + 1, i ? PRIZE.second : PRIZE.first]);
    else if (mode === 'koth') winners = [...R.scores].filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id], i) => [id, i + 1, i ? PRIZE.second : PRIZE.first]);
    else if (mode === 'lava') winners = [...R.alive].filter((id) => R.ids.has(id)).map((id, _, all) => [id, 1, all.length === 1 ? PRIZE.first : PRIZE.win]);
    if (count < ROUND.minPlayers || R.practice) winners = winners.map(([id, pl]) => [id, pl, 0]);
    R.phase = 'results'; R.ends = Date.now() + ROUND.results * 1000;
    R.results = winners.map(([id, place, coins]) => ({ id, name: name(id), place, coins, score: R.scores.get(id) }));
    this.sendRound();
    this.award(mode, winners.filter((w) => w[2] > 0 && R.names[w[0]].uid).map(([id, place, coins]) => ({ id, uid: R.names[id].uid, coins, place })));
  }
  async award(mode, list) {
    const db = this.env.DB;
    if (!db || !list.length) return;
    await loadEvents(db);
    const day = Date.now() - (Date.now() % 86400e3);
    for (const w of list) {
      try {
        const got = await db.prepare("SELECT COALESCE(SUM(delta), 0) AS n FROM ledger WHERE user_id = ? AND why LIKE 'game%' AND at >= ?").bind(w.uid, day).first();
        const coins = Math.min(w.coins, Math.max(0, PRIZE.dailyCap - got.n));
        // winning gives XP even after the daily coin cap
        const stmts = [...questBumps(db, w.uid, { game: 1 }), xpStmt(db, w.uid, w.place === 1 ? XP.win : XP.place)];
        if (coins) stmts.push(...coinStmts(db, w.uid, coins, 'game ' + mode));
        if (stmts.length) await db.batch(stmts);
        const ws = this.alive().find((x) => { const a = att(x); return a && a.id === w.id; });
        if (ws) send(ws, { t: 'prize', coins, capped: coins < w.coins, xp: w.place === 1 ? XP.win : XP.place });
      } catch (e) { /* the round still counts, just no coins */ }
    }
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
      this.doc = { id: row.id, kind: '3d', meta: { n: cleanText(data.n, 40) || row.name, mode: data.mode === 'hangout' ? 'hangout' : 'obby', sky: Object.hasOwn(SKIES, data.sky) ? data.sky : 'day', game: GAME_TYPES.includes(data.game) ? data.game : '', gear: data.gear === 'off' ? 'off' : 'on', gearBan: cleanGearBan(data.gearBan), logic: cleanLogic(data.logic), hotbar: data.hotbar === true, compass: data.compass === true, music: isSong(data.music) ? data.music : '', shop: cleanShop(data.shop) }, grid };
    } else {
      const lv = { n: row.name, style: 'adventure', theme: 'meadow', form: 'hopper', speed: '~', w: 48, h: 12, d: '', ...data };
      this.doc = { id: row.id, kind: '2d', meta: { n: cleanText(lv.n, LIMITS.name) || row.name, style: lv.style === 'rush' ? 'rush' : 'adventure', theme: THEMES.includes(lv.theme) ? lv.theme : 'meadow', form: FORMS.includes(lv.form) ? lv.form : 'hopper', speed: Object.hasOwn(SPEED_NAMES, lv.speed) ? lv.speed : '~' }, w: lv.w | 0, h: lv.h | 0, a: String(lv.d || '').split('') };
      if (this.doc.a.length !== this.doc.w * this.doc.h) { this.doc.w = 48; this.doc.h = 12; this.doc.a = Array(48 * 12).fill('.'); }
    }
  }
  docOut() {
    const d = this.doc;
    if (!d) return null;
    if (d.kind === '3d') { const { game, gear, logic, gearBan, hotbar, compass, music, shop, ...m } = d.meta; return { kind: '3d', v: 1, ...m, ...(game && m.mode === 'hangout' ? { game } : {}), ...(gear === 'off' ? { gear: 'off' } : {}), ...(gearBan && gearBan.length ? { gearBan } : {}), ...(logic && logic.length ? { logic } : {}), ...(hotbar ? { hotbar: true } : {}), ...(compass ? { compass: true } : {}), ...(music ? { music } : {}), ...(shop && shop.length ? { shop } : {}), b: encodeBlocks(d.grid) }; }
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
        if (Object.hasOwn(SKIES, op.f.sky)) f.sky = op.f.sky;
        if (op.f.game === '' || GAME_TYPES.includes(op.f.game)) f.game = op.f.game;
        if (op.f.gear === 'on' || op.f.gear === 'off') f.gear = op.f.gear;
        if (Array.isArray(op.f.gearBan)) f.gearBan = cleanGearBan(op.f.gearBan);
        if (Array.isArray(op.f.logic) && JSON.stringify(op.f.logic).length < 60000) f.logic = cleanLogic(op.f.logic);
        if (typeof op.f.hotbar === 'boolean') f.hotbar = op.f.hotbar;
        if (typeof op.f.compass === 'boolean') f.compass = op.f.compass;
        if (op.f.music === '' || isSong(op.f.music)) f.music = op.f.music;
        if (Array.isArray(op.f.shop)) f.shop = cleanShop(op.f.shop);
      } else {
        if (op.f.style === 'rush' || op.f.style === 'adventure') f.style = op.f.style;
        if (THEMES.includes(op.f.theme)) f.theme = op.f.theme;
        if (FORMS.includes(op.f.form)) f.form = op.f.form;
        if (typeof op.f.speed === 'string' && Object.hasOwn(SPEED_NAMES, op.f.speed)) f.speed = op.f.speed;
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
        const x = b[0] | 0, y = b[1] | 0, z = b[2] | 0, t = b[3] | 0, c = (b[4] | 0) & 63;
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
    } catch (e) {
      // didn't save: try again in a few seconds
      this.dirty = true;
      this.saveAt = Date.now() + SAVE_DELAY * 3;
      try { await this.state.storage.setAlarm(this.saveAt); } catch (e2) { /* next change will retry */ }
    }
  }

  /* ---------- checking runs ---------- */
  verify(job) {
    try {
      if (job.type === '2d') return { ok: true, run: runReplay(job.raw ? job.level : normalizeLevel(job.level), String(job.replay || ''), job.opts || {}) };
      if (job.type === '3d') {
        const world = job.builtin ? builtinWorld(job.builtin).get().world : job.world;
        if (world && world.engine === 2) return { ok: true, run: runReplay2(world, String(job.replay || ''), job.opts || {}) };
        return { ok: true, run: runReplay3d(world, String(job.replay || ''), job.opts || {}) };
      }
      if (job.type === 'publish3d' && job.world && job.world.engine === 2) {
        // engine v2 (parts): check and clean every part, the picture, and the creator's run for obbies
        const w = normalizeParts(job.world);
        const run = w.world.mode === 'obby' ? runReplay2(w.world, String(job.replay || ''), job.opts || {}) : null;
        return { ok: true, world: w.world, blocks: w.info.blocks, coins: w.info.coins.length, thumb: partsThumb(w.world), run };
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
  return { id: a.id, name: a.name, look: a.look, lvl: a.lvl || 1, role: a.role || undefined, title: a.title || undefined, dn: a.dn || undefined, tags: a.tags && a.tags.length ? a.tags : undefined, admin: a.admin || undefined, pm: a.perm || undefined, p: st.p || null, r: st.r || 0, a: st.a || 0 };
}
// No word filter (Blockyard's choice), just tidy: no invisible characters, no giant messages.
export function cleanChat(m) {
  return String(m == null ? '' : m).replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
}
