// Bots for private servers of Blockyard's minigame worlds. Only the server owner's computer runs them:
// each bot has its own little physics sim (the same one players use), a "brain" that decides where to go,
// and its position is sent to the room like a player's. The room checks everything they do.
import { createSim, step3, STEP3, packInput, yawIndex, KEY } from './physics3d.js';
import { solidType, SX, SZ } from './world.js';
import { ROUND, WEAPONS, BOT_SKILL, inBox, onHill } from './games.js';

const WEAPON_PICK = ['blaster', 'rapid', 'splatter', 'sniper'];
const r2 = (v) => Math.round(v * 100) / 100;

// opts: { world, grid, cfg, way, ids: ['bot1', ...], skill, send(msg), lobby: [x, y, z] }
export function createBots(opts) {
  const sk = BOT_SKILL[opts.skill] || BOT_SKILL.normal;
  const lobby = opts.cfg.lobby || [64.5, 1, 64.5];
  const bots = opts.ids.map((id, i) => {
    const S = createSim({ ...opts.world, mode: 'hangout' }, opts.grid);
    S.obby = false;
    const b = { id, S, plan: null, pause: 0, late: 0, bits: 0, yaw: 0, think: Math.random() * sk.think, target: null, wi: 1, inRound: false, frozen: 0, lastAct: 0, lastShot: 0, weapon: WEAPON_PICK[i % WEAPON_PICK.length], out: false, finSent: false, facing: 0, idle: 0, emote: 0 };
    place(b, lobby, 5, false);
    return b;
  });
  const solid = (S, x, y, z) => solidType(S.grid.get(Math.floor(x), Math.floor(y), Math.floor(z)));
  function place(b, at, spread, obby) {
    const S = b.S;
    S.spawn = { x: at[0] + (Math.random() - 0.5) * spread, y: at[1], z: at[2] + (Math.random() - 0.5) * spread };
    S.p = { ...S.spawn }; S.v.x = S.v.y = S.v.z = 0; S.cp = null; S.cpIdx = -1; S.won = false; S.obby = obby; S.onGround = false;
    b.wi = 1; b.target = null; b.finSent = false; b.out = false;
  }
  // walk toward (tx, tz); jump over gaps and up steps (sometimes they mess up, less when they're smarter)
  function drive(b, tx, tz, run = true) {
    const S = b.S, dx = tx - S.p.x, dz = tz - S.p.z, dist = Math.hypot(dx, dz);
    b.yaw = Math.atan2(dx, -dz);
    let bits = run && dist > 0.25 ? KEY.fwd : 0;
    if (S.onGround && bits) {
      const ux = dx / (dist || 1), uz = dz / (dist || 1);
      const gap = !solid(S, S.p.x + ux * 0.5, S.p.y - 0.5, S.p.z + uz * 0.5) && dist > 0.6;
      const wall = solid(S, S.p.x + ux * 0.6, S.p.y + 0.5, S.p.z + uz * 0.6);
      // clumsier bots sometimes jump late (and fall)
      if ((gap || wall) && !(b.late > 0)) { if (Math.random() < sk.miss) b.late = 12; else bits |= KEY.jump; }
    }
    if (b.late > 0) b.late--;
    b.bits = bits;
    return dist;
  }
  // follow a list of points (race course, lava tower, the hill)
  function follow(b, path) {
    const S = b.S;
    if (!path || !path.length) return;
    if (b.wi >= path.length) b.wi = path.length - 1;
    // fell back down? pick up from the closest point
    const cur = path[b.wi];
    if (S.p.y < cur[1] - 3) { let best = 0, bd = 1e9; path.forEach((p, i) => { const d = Math.hypot(p[0] - S.p.x, (p[1] - S.p.y) * 2, p[2] - S.p.z); if (d < bd) { bd = d; best = i; } }); b.wi = Math.min(path.length - 1, best + 1); }
    const t = path[b.wi];
    const d = drive(b, t[0], t[2]);
    if (S.onGround && d < 1.2 && Math.abs(t[1] - S.p.y) < 0.8 && b.wi < path.length - 1) b.wi++;
  }
  const near = (list, S, fn) => { let best = null, bd = 1e9; for (const o of list) { if (!fn(o)) continue; const d = Math.hypot(o.pos[0] - S.p.x, o.pos[2] - S.p.z); if (d < bd) { bd = d; best = o; } } return best ? { o: best, d: bd } : null; };
  function lineClear(from, to) {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2], len = Math.hypot(dx, dy, dz);
    for (let t = 1; t < len; t += 0.5) { const k = t / len; if (solidType(opts.grid.get(Math.floor(from[0] + dx * k), Math.floor(from[1] + dy * k), Math.floor(from[2] + dz * k)))) return false; }
    return true;
  }
  // every physics step: carry out the plan (steering and jumping need quick reflexes)
  function act(b, now) {
    const pl = b.plan;
    if (!pl || now < b.frozen || now < b.pause) { b.bits = 0; return; }
    if (pl.type === 'path') follow(b, pl.path);
    else if (pl.type === 'point') { if (drive(b, pl.x, pl.z) < (pl.stop || 0.3)) b.bits = 0; }
    else if (pl.type === 'spin') { b.bits = Math.random() < 0.3 ? KEY.fwd : 0; b.yaw += 0.05; }
    else b.bits = 0;
  }
  // a few times a second: decide what to do (smarter bots decide more often)
  function brain(b, g, now) {
    const S = b.S, rs = g.rs, area = rs.mode && opts.cfg.areas[rs.mode];
    b.emote = 0;
    if (Math.random() > sk.press) b.pause = now + 250 + Math.random() * 300; // hesitate
    const go = (x, z, stop) => { b.plan = { type: 'point', x, z, stop }; };
    if (!b.inRound || rs.phase !== 'play' || !area) {
      // in the lobby: wander around, sometimes dance
      if (!b.target || Math.random() < 0.05) b.target = [lobby[0] + (Math.random() - 0.5) * 12, lobby[2] + (Math.random() - 0.5) * 12];
      if (b.idle > 0) { b.idle -= sk.think; b.plan = null; b.emote = 2; return; }
      if (Math.hypot(b.target[0] - S.p.x, b.target[1] - S.p.z) < 1) { b.target = null; if (Math.random() < 0.3) b.idle = 1.5 + Math.random() * 3; }
      else go(b.target[0], b.target[1]);
      return;
    }
    const others = g.players.filter((o) => o.id !== b.id && o.pos && rs.alive.has(o.id));
    switch (rs.mode) {
      case 'race': b.plan = { type: 'path', path: opts.way }; break;
      case 'koth': b.plan = onHill(area, S.p.x, S.p.y, S.p.z) ? { type: 'spin' } : { type: 'path', path: area.path }; break;
      case 'lava': b.plan = b.out ? null : { type: 'path', path: area.path }; break;
      case 'tag': {
        if (rs.it.has(b.id)) {
          const t = near(others, S, (o) => !rs.it.has(o.id));
          if (t) {
            go(t.o.pos[0], t.o.pos[2], 0.1);
            if (t.d < ROUND.tagReach && Math.abs(t.o.pos[1] - S.p.y) < 1.4 && now - b.lastAct > 400) { b.lastAct = now; opts.send({ t: 'botact', id: b.id, a: 'tag', target: t.o.id }); }
          }
        } else {
          const t = near(others, S, (o) => rs.it.has(o.id));
          const box = area.box || [8, 84, 44, 120], cx = (box[0] + box[2]) / 2, cz = (box[1] + box[3]) / 2;
          if (t && t.d < 14) {
            // run away (a bit sideways, and back toward the middle near the walls)
            let ax = S.p.x - t.o.pos[0], az = S.p.z - t.o.pos[2];
            const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
            const side = (b.id.charCodeAt(3) % 2 ? 1 : -1) * 0.6;
            let tx = S.p.x + (ax - az * side) * 6, tz = S.p.z + (az + ax * side) * 6;
            if (tx < box[0] + 3 || tx > box[2] - 3 || tz < box[1] + 3 || tz > box[3] - 3) { tx = cx + (Math.random() - 0.5) * 10; tz = cz + (Math.random() - 0.5) * 10; }
            go(tx, tz);
          } else {
            if (!b.target || Math.random() < 0.04 || Math.hypot(b.target[0] - S.p.x, b.target[1] - S.p.z) < 1) b.target = [cx + (Math.random() - 0.5) * 24, cz + (Math.random() - 0.5) * 24];
            go(b.target[0], b.target[1]);
          }
        }
        break;
      }
      case 'paint': {
        const wp = WEAPONS[b.weapon], t = near(others, S, () => true);
        if (!t) { b.plan = null; break; }
        const want = wp.range * 0.55;
        if (t.d > want) go(t.o.pos[0], t.o.pos[2]);
        else { const a = Math.atan2(t.o.pos[0] - S.p.x, -(t.o.pos[2] - S.p.z)) + Math.PI / 2 * (b.id.charCodeAt(3) % 2 ? 1 : -1); go(S.p.x + Math.sin(a) * 3, S.p.z - Math.cos(a) * 3); }
        // shoot: the smarter the bot, the more often it hits
        if (t.d < wp.range && now - b.lastShot > wp.every + 60) {
          b.lastShot = now;
          const from = [S.p.x, S.p.y + 1.25, S.p.z], to = [t.o.pos[0], t.o.pos[1] + 0.8, t.o.pos[2]];
          const chance = sk.aim * (1 - (t.d / wp.range) * 0.5);
          if (lineClear(from, to) && Math.random() < chance) opts.send({ t: 'botact', id: b.id, a: 'hit', target: t.o.id, w: b.weapon });
        }
        break;
      }
    }
  }
  let acc = 0, lastSend = 0;
  return {
    ids: opts.ids,
    // g: { rs, players: [{ id, pos }] } (humans and bots), called every frame
    frame(dt, g) {
      const now = performance.now();
      acc = Math.min(acc + dt, 0.25);
      while (acc >= STEP3) {
        for (const b of bots) {
          b.think -= STEP3;
          if (b.think <= 0) { b.think = sk.think * (0.7 + Math.random() * 0.6); brain(b, g, now); }
          act(b, now);
          step3(b.S, packInput(b.bits, yawIndex(b.yaw)));
          for (const e of b.S.events) if (e.t === 'win' && b.inRound && g.rs.mode === 'race' && !b.finSent) { b.finSent = true; opts.send({ t: 'botact', id: b.id, a: 'fin' }); }
          b.S.events.length = 0;
          // rising lava got the bot
          if (g.rs.mode === 'lava' && b.inRound && !b.out && g.rs.lava != null && b.S.p.y < g.rs.lava - 0.6 && inBox(opts.cfg.areas.lava, b.S.p.x, b.S.p.z)) {
            b.out = true; opts.send({ t: 'botact', id: b.id, a: 'out' }); b.inRound = false; place(b, lobby, 5, false);
          }
        }
        acc -= STEP3;
      }
      for (const b of bots) {
        const hv = Math.hypot(b.S.v.x, b.S.v.z);
        if (hv > 0.6) { let d = Math.atan2(b.S.v.x, b.S.v.z) - b.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); b.facing += d * Math.min(1, dt * 12); }
      }
      if (now - lastSend > 150) {
        lastSend = now;
        const l = bots.map((b) => [b.id, r2(b.S.p.x), r2(b.S.p.y), r2(b.S.p.z), r2(b.facing), (Math.hypot(b.S.v.x, b.S.v.z) > 0.6 ? 1 : 0) | (!b.S.onGround && b.S.air > 4 ? 2 : 0) | (b.emote << 2)]);
        opts.send({ t: 'bots', l });
        return l; // the host draws its own bots from this
      }
      return null;
    },
    // a round started or ended
    round(m, rs, prevPhase) {
      for (const b of bots) {
        if (m.phase === 'play' && prevPhase !== 'play' && rs.alive.has(b.id)) {
          const a = opts.cfg.areas[m.mode];
          b.inRound = true; b.frozen = 0; b.weapon = WEAPON_PICK[Math.floor(Math.random() * WEAPON_PICK.length)];
          if (m.mode === 'tag' && a.spawns) {
            if (rs.it.has(b.id)) { place(b, a.itSpawn || a.spawn, 1, false); b.frozen = performance.now() + ROUND.itWait; }
            else { const free = [...rs.alive].filter((id) => !rs.it.has(id)).sort(); place(b, a.spawns[Math.max(0, free.indexOf(b.id)) % a.spawns.length], 1, false); }
          } else if (m.mode === 'paint' && a.spawns) place(b, a.spawns[Math.floor(Math.random() * a.spawns.length)], 1, false);
          else place(b, a.spawn, m.mode === 'race' ? 2 : 5, m.mode === 'race');
        } else if (m.phase !== 'play' && b.inRound) { b.inRound = false; place(b, lobby, 5, false); }
        if (m.ev && m.ev.tag === b.id) b.frozen = performance.now() + 1500;
        if (m.ev && m.ev.splat === b.id) { const a = opts.cfg.areas.paint; place(b, a.spawns ? a.spawns[Math.floor(Math.random() * a.spawns.length)] : a.spawn, 1, false); }
      }
    },
  };
}
