// Your progress: stars, best runs, stats, badges, and your closet.
// Guests keep it in this browser. With an account, coins and items live on the server
// (they only change through checked runs, the shop and trades), and the rest syncs.
import { store } from './api.js';
import { SHOP, FREE, itemKey } from './cosmetics.js';
import { WORLDS, BUILTIN } from './levels.js';

// Badges. They used to pay coins; now coins only come from runs the server checks.
export const ACHIEVEMENTS = [
  { id: 'first', name: 'First steps', text: 'Beat any level' },
  { id: 'world1', name: 'World 1 clear', text: 'Beat every level in World 1' },
  { id: 'world2', name: 'World 2 clear', text: 'Beat every level in World 2' },
  { id: 'stars10', name: 'Star collector', text: 'Earn 10 stars' },
  { id: 'stars30', name: 'Star hoarder', text: 'Earn 30 stars' },
  { id: 'allstars', name: 'Perfectionist', text: 'Earn every star' },
  { id: 'flawless', name: 'Flawless party', text: 'Beat Portal Party without dying' },
  { id: 'coins500', name: 'Piggy bank', text: 'Grab 500 coins in levels' },
  { id: 'jumps1000', name: 'Bouncy', text: 'Jump 1000 times' },
  { id: 'stomp25', name: 'Stomper', text: 'Stomp 25 walkers' },
  { id: 'portals100', name: 'Shape shifter', text: 'Go through 100 portals' },
  { id: 'die100', name: 'Never give up', text: 'Respawn 100 times' },
  { id: 'endless250', name: 'Long run', text: 'Reach 250 m in Endless Rush' },
  { id: 'endless1000', name: 'Marathon', text: 'Reach 1000 m in Endless Rush' },
  { id: 'daily1', name: 'Daily player', text: 'Finish a daily challenge' },
  { id: 'daily5', name: 'Regular', text: 'Finish 5 daily challenges' },
  { id: 'obby1', name: 'Obby climber', text: 'Beat a 3D obby' },
  { id: 'obbyall', name: 'Obby master', text: 'Beat every built-in 3D obby' },
  { id: 'social', name: 'Hello there', text: 'Chat in a 3D server' },
  { id: 'trader', name: 'Trader', text: 'Finish a trade' },
  { id: 'builder', name: 'Builder', text: 'Save a level or world you made' },
  { id: 'proven', name: 'Proven', text: 'Beat your own level in Test' },
  { id: 'publisher', name: 'Published', text: 'Publish a level or world' },
  { id: 'teamwork', name: 'Teamwork', text: 'Build with a friend' },
  { id: 'shopper', name: 'Fresh look', text: 'Buy something in the shop' },
  // the hard (and weird) ones
  { id: 'nightowl', name: 'Night Owl', text: 'Play between midnight and 4 AM', hard: true },
  { id: 'jumps25k', name: 'Pogo Stick Brain', text: 'Jump 25,000 times', hard: true },
  { id: 'die1000', name: 'Professional Faller', text: 'Respawn 1,000 times', hard: true },
  { id: 'stomp250', name: 'Walker Wrecker', text: 'Stomp 250 walkers', hard: true },
  { id: 'portals1000', name: 'Dimension Hopper', text: 'Go through 1,000 portals', hard: true },
  { id: 'coins5000', name: 'Dragon Hoard', text: 'Grab 5,000 coins in levels', hard: true },
  { id: 'endless2500', name: 'Light Speed', text: 'Reach 2,500 m in Endless Rush', hard: true },
  { id: 'daily30', name: 'Creature of Habit', text: 'Finish 30 daily challenges', hard: true },
  { id: 'skyflawless', name: 'Cloud Walker', text: 'Beat Sky Gauntlet without falling once', hard: true },
  { id: 'finalflawless', name: 'Untouchable Legend', text: 'Beat Final Rush without dying', hard: true },
  { id: 'hyperdrive', name: 'Hyperdrive Survivor', text: 'Beat Hyperdrive, the first level in Nightmare Nebula', hard: true },
  { id: 'nebula', name: 'Treasure Hunter', text: 'Beat Grand Line, the longest level in Blockyard', hard: true },
  { id: 'hyperflawless', name: 'Normal Mode Hero', text: 'Beat Hyperdrive without dying once (no checkpoints)', hard: true },
  { id: 'towerspeed', name: 'Elevator? Never Heard of It', text: 'Beat Tower of Tries in under 25 seconds', hard: true },
  { id: 'insane', name: 'Asylum Escapee', text: 'Beat an Insane (9★) level or obby', hard: true },
  { id: 'demon', name: 'Demon Slayer', text: 'Beat a Demon (10★) level', hard: true },
  { id: 'rstars100', name: 'Star Eater', text: 'Earn 100 difficulty stars', hard: true },
  { id: 'tycoon', name: 'Tycoon', text: 'Have 10,000 coins at once', hard: true },
  { id: 'collector', name: 'Museum Curator', text: 'Own 25 different items', hard: true },
  { id: 'friends10', name: 'Popular Pip', text: 'Have 10 friends', hard: true },
  { id: 'followers1', name: 'First Fan', text: 'Get your first follower' },
  { id: 'followers10', name: 'Rising Star', text: 'Have 10 followers' },
  { id: 'followers50', name: 'Famous Pip', text: 'Have 50 followers', hard: true },
  { id: 'followers100', name: 'Superstar', text: 'Have 100 followers', hard: true },
  { id: 'chat500', name: 'Chatterbox', text: 'Send 500 chat messages in 3D servers', hard: true },
  { id: 'dance200', name: 'Disco Inferno', text: 'Dance 200 times', hard: true },
  { id: 'spin100', name: 'Spin Cycle', text: 'Spin 100 times', hard: true },
  { id: 'snow50', name: 'Snowball Sniper', text: 'Hit 50 players with snowballs', hard: true },
  { id: 'splat100', name: 'Paint Picasso', text: 'Splat 100 players in Paintball', hard: true },
  { id: 'race25', name: 'Photo Finish', text: 'Win 25 races', hard: true },
  { id: 'tag10', name: 'Slippery Eel', text: 'Win Tag 10 times', hard: true },
  { id: 'koth10', name: 'Hill Hog', text: 'Win King of the Hill 10 times', hard: true },
  { id: 'lava10', name: 'Floor Is Lava Pro', text: 'Win Rising Lava 10 times', hard: true },
  { id: 'tourist', name: 'World Tourist', text: 'Visit every Blockyard world', hard: true },
  { id: 'publish10', name: 'Architect', text: 'Publish 10 levels or worlds', hard: true },
  { id: 'trades25', name: 'Wall Street Pip', text: 'Finish 25 trades', hard: true },
  { id: 'buy25', name: 'Shopaholic', text: 'Buy 25 things in the shop', hard: true },
  { id: 'chosen', name: 'The Chosen One', text: 'You 100%ed everything: every other badge in Blockyard', hard: true, chosen: true },
];
// Blockyard's own 3D worlds (for World Tourist)
export const TOUR = ['plaza', 'town', 'mg-race', 'mg-tag', 'mg-paint', 'mg-koth', 'mg-lava', 'mg-tycoon', 'sunny', 'tower', 'lava', 'factory', 'sky'];
export const OBBIES = ['sunny', 'tower', 'lava', 'factory', 'sky'];
const STAR_REWARD = 10;
const blank = () => ({
  v: 2, coins: 0, levels: {}, owned: FREE.slice(), equip: { color: '#ff6b35', hat: 'none', trail: 'none', pet: 'none', gear: 'none' }, ach: {},
  stats: { wins: 0, jumps: 0, stomps: 0, portals: 0, deaths: 0, coins: 0, endlessBest: 0, dailies: 0, saved: 0, proven: 0, published: 0, bought: 0, obbies: 0, chats: 0, trades: 0, team: 0 },
  daily: {}, updated: 0,
});
function clean(p) {
  const b = blank();
  if (!p || typeof p !== 'object') return b;
  return {
    ...b, ...p,
    coins: Math.max(0, Math.floor(Number(p.coins) || 0)),
    levels: typeof p.levels === 'object' && p.levels ? p.levels : {},
    owned: Array.isArray(p.owned) ? [...new Set([...FREE, ...p.owned])] : b.owned,
    equip: { ...b.equip, ...(p.equip || {}) },
    ach: typeof p.ach === 'object' && p.ach ? p.ach : {},
    stats: { ...b.stats, ...(p.stats || {}) },
    daily: typeof p.daily === 'object' && p.daily ? p.daily : {},
  };
}

let key = 'progress:guest';
let data = clean(store.get(key, null));
let wallet = null; // accounts only: { coins, items: { key: qty }, look }
// Bring over best runs saved by the first version of Blockyard.
if (!store.get(key, null)) {
  for (const lv of BUILTIN) {
    const b = store.get('best:' + lv.id, null);
    if (b && b.won) data.levels[lv.id] = { won: true, progress: 1, time: b.time ?? null, stars: [1, 0, 0], coins: 0 };
  }
  const old = store.get('profile', null);
  if (old && FREE.includes(old.color)) data.equip.color = old.color;
  store.set(key, data);
}
const listeners = new Set();
let pendingAch = [];

function save() {
  data.updated = Date.now();
  // the server owns coins and items for accounts, so don't keep stale copies
  store.set(key, wallet ? { ...data, coins: 0, owned: FREE.slice() } : data);
  for (const fn of listeners) fn(data);
}

export function merge(a, b) {
  a = clean(a); b = clean(b);
  const newer = (a.updated || 0) >= (b.updated || 0) ? a : b;
  const out = clean(newer);
  for (const id of new Set([...Object.keys(a.levels), ...Object.keys(b.levels)])) {
    const x = a.levels[id] || {}, y = b.levels[id] || {};
    const times = [x.time, y.time].filter((t) => typeof t === 'number');
    out.levels[id] = {
      won: !!(x.won || y.won), progress: Math.max(x.progress || 0, y.progress || 0),
      time: times.length ? Math.min(...times) : null,
      stars: [0, 1, 2].map((i) => Math.max((x.stars || [])[i] || 0, (y.stars || [])[i] || 0)),
      coins: Math.max(x.coins || 0, y.coins || 0),
    };
  }
  out.owned = [...new Set([...a.owned, ...b.owned])];
  out.ach = { ...b.ach, ...a.ach };
  for (const s of new Set([...Object.keys(a.stats), ...Object.keys(b.stats)])) out.stats[s] = Math.max(a.stats[s] || 0, b.stats[s] || 0);
  for (const d of new Set([...Object.keys(a.daily), ...Object.keys(b.daily)])) {
    const x = a.daily[d] || {}, y = b.daily[d] || {};
    out.daily[d] = { best: Math.max(x.best || 0, y.best || 0), won: !!(x.won || y.won), attempts: Math.max(x.attempts || 0, y.attempts || 0) };
  }
  return out;
}

/* ---------- runs a guest finished: sent to the server when they make an account ---------- */
const PROOFS = 'proofs';
export const proofs = {
  list() { return store.get(PROOFS, []); },
  add(p) { const l = this.list().filter((x) => !(x.kind === p.kind && x.id === p.id && x.replay === p.replay)); l.push({ ...p, at: Date.now() }); store.set(PROOFS, l.slice(-40)); },
  clear() { store.set(PROOFS, []); },
};

export const progress = {
  get data() { return data; },
  get wallet() { return wallet; },
  get account() { return !!wallet; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  // Switch between the guest save and an account save. res: what the server sent (/me, login, signup).
  use(userId, res) {
    key = userId ? 'progress:u:' + userId : 'progress:guest';
    const local = store.get(key, null);
    data = res && res.progress ? merge(res.progress, local) : clean(local);
    wallet = null;
    if (userId && res) this.setAccount(res); else save();
  },
  setAccount(res) {
    if (res.wallet) this.setWallet(res.wallet, false);
    // stars the server has seen you earn
    for (const [id, l] of Object.entries(res.levels || {})) {
      const e = data.levels[id] || (data.levels[id] = { won: false, progress: 0, time: null, stars: [0, 0, 0], coins: 0 });
      if (l.stars & 1) { e.won = true; e.progress = 1; }
      e.stars = [0, 1, 2].map((i) => ((e.stars || [])[i] || (l.stars & (1 << i)) ? 1 : 0));
      e.coins = Math.max(e.coins || 0, l.coins || 0);
      if (typeof l.best === 'number' && (e.time == null || l.best < e.time)) e.time = l.best;
    }
    for (const b of Object.keys(res.badges || {})) if (!data.ach[b]) data.ach[b] = Date.now();
    checkAll(); save();
  },
  setWallet(w, notify = true) {
    wallet = w;
    data.coins = w.coins;
    data.owned = [...new Set([...FREE, ...Object.keys(w.items).map((k) => k.slice(k.indexOf(':') + 1))])];
    data.equip = { ...data.equip, ...w.look };
    if (notify) { checkAll(); save(); }
  },
  itemsOwned() { return wallet ? wallet.items : null; },
  guestHasProgress() {
    const g = clean(store.get('progress:guest', null));
    return Object.keys(g.levels).length > 0 || proofs.list().length > 0;
  },
  clearGuest() { store.set('progress:guest', blank()); },
  absorbGuest() {
    data = merge(data, store.get('progress:guest', null));
    store.set('progress:guest', blank());
    if (wallet) this.setWallet(wallet, false);
    save();
  },
  level(id) { return data.levels[id] || null; },
  stars(id) { const l = data.levels[id]; return l && l.stars ? l.stars : [0, 0, 0]; },
  totalStars() { return BUILTIN.reduce((n, lv) => n + this.stars(lv.id).reduce((a, b) => a + (b ? 1 : 0), 0), 0); },
  maxStars() { return BUILTIN.length * 3; },

  // Called when a 2D run ends. meta: { builtin, par, rush }. Coins here are a guess for guests;
  // for accounts the server's answer replaces it.
  finish(id, r, meta = {}) {
    const e = data.levels[id] || (data.levels[id] = { won: false, progress: 0, time: null, stars: [0, 0, 0], coins: 0 });
    const out = { newBest: false, stars: e.stars.slice(), newStars: [], coinsEarned: 0 };
    if (r.won) {
      if (!e.won || e.time === null || r.time < e.time) { out.newBest = e.won; e.time = Math.round(r.time * 10) / 10; }
      e.won = true; e.progress = 1;
      data.stats.wins++;
      if (id === 'b-final' && r.deaths === 0) grant('finalflawless');
      if (id === 'b-hyper') grant('hyperdrive');
      if (id === 'b-grand') grant('nebula');
      if (id === 'b-hyper' && r.deaths === 0) grant('hyperflawless');
      if ((meta.stars || 0) >= 9) grant('insane');
      if ((meta.stars || 0) >= 10) grant('demon');
      if (meta.builtin) {
        const got = [1, r.totalCoins ? (r.coins >= r.totalCoins ? 1 : 0) : (r.deaths === 0 ? 1 : 0), meta.rush ? (r.deaths === 0 ? 1 : 0) : (meta.par && r.time <= meta.par ? 1 : 0)];
        got.forEach((g, i) => { if (g && !e.stars[i]) { e.stars[i] = 1; out.newStars.push(i); out.coinsEarned += STAR_REWARD; } });
        if (r.coins > e.coins) { out.coinsEarned += r.coins - e.coins; e.coins = r.coins; }
        if (id === 'b-party' && r.deaths === 0) grant('flawless');
        if (!wallet && out.coinsEarned && r.replay) proofs.add({ kind: 'level', id, replay: r.replay });
      }
      out.stars = e.stars.slice();
    } else if (r.progress > e.progress + 0.001) { out.newBest = true; e.progress = r.progress; }
    if (!wallet) data.coins += out.coinsEarned;
    checkAll(); save();
    return out;
  },
  // A 3D obby cleared (built-in ones pay coins).
  finishWorld(id, r) {
    const k = 'w:' + id;
    const e = data.levels[k] || (data.levels[k] = { won: false, progress: 0, time: null, stars: [0, 0, 0], coins: 0 });
    const first = !e.won;
    e.won = true; e.progress = 1;
    if (e.time == null || r.time < e.time) e.time = Math.round(r.time * 10) / 10;
    if (r.deaths === 0) e.stars[1] = 1;
    e.stars[0] = 1;
    e.coins = Math.max(e.coins || 0, r.coins);
    if (first) data.stats.obbies++;
    if (id === 'sky' && r.deaths === 0 && !r.noProof) grant('skyflawless');
    if (id === 'tower' && r.time < 25 && !r.noProof) grant('towerspeed');
    checkAll(); save();
    return { first };
  },
  endless(distance, coins) {
    const best = data.stats.endlessBest;
    const earned = coins + Math.floor(distance / 25);
    data.stats.endlessBest = Math.max(best, distance);
    if (!wallet) data.coins += earned;
    checkAll(); save();
    return { newBest: distance > best, earned, best: data.stats.endlessBest };
  },
  daily(date, pct, won) {
    const d = data.daily[date] || (data.daily[date] = { best: 0, won: false, attempts: 0 });
    d.attempts++;
    const out = { newBest: pct > d.best + 0.001, earned: 0 };
    d.best = Math.max(d.best, pct);
    if (won && !d.won) { d.won = true; data.stats.dailies++; out.earned = wallet ? 30 : 0; }
    checkAll(); save();
    return out;
  },
  stat(name, n = 1) { data.stats[name] = (data.stats[name] || 0) + n; },
  // keep the biggest number seen (friends, etc.)
  peak(name, v) { if (v > (data.stats[name] || 0)) { data.stats[name] = v; checkAll(); save(); } },
  visit(worldId) { if (!data.stats['v_' + worldId]) { data.stats['v_' + worldId] = 1; checkAll(); save(); } },
  special(id) { grant(id); checkAll(); save(); },
  flush() { checkAll(); save(); },
  achieve(id) { grant(id); save(); },
  takeNewAchievements() { const a = pendingAch; pendingAch = []; return a; },

  owns(kind, id) {
    if (FREE.includes(id)) return true;
    if (wallet) return (wallet.items[itemKey(kind, id)] || 0) > 0;
    return data.owned.includes(itemKey(kind, id)) || data.owned.includes(id);
  },
  canUnlock(item) {
    if (!item.need) return true;
    if (item.need.stars) return this.totalStars() >= item.need.stars;
    if (item.need.ach) return !!data.ach[item.need.ach];
    return false;
  },
  // guests can still change into things they own in this browser
  equipLocal(kind, id) { if (this.owns(kind, id)) { data.equip[kind] = id; save(); } },
};

function grant(id) {
  if (data.ach[id]) return;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return;
  data.ach[id] = Date.now();
  pendingAch.push(a);
}

function checkAll() {
  const s = data.stats, stars = progress.totalStars();
  const won = (id) => data.levels[id] && data.levels[id].won;
  if (s.wins >= 1) grant('first');
  WORLDS.forEach((w, i) => { if (w.ids.every(won)) grant('world' + (i + 1)); });
  if (stars >= 10) grant('stars10');
  if (stars >= 30) grant('stars30');
  if (stars >= progress.maxStars()) grant('allstars');
  if (s.coins >= 500) grant('coins500');
  if (s.jumps >= 1000) grant('jumps1000');
  if (s.stomps >= 25) grant('stomp25');
  if (s.portals >= 100) grant('portals100');
  if (s.deaths >= 100) grant('die100');
  if (s.endlessBest >= 250) grant('endless250');
  if (s.endlessBest >= 1000) grant('endless1000');
  if (s.dailies >= 1) grant('daily1');
  if (s.dailies >= 5) grant('daily5');
  if (s.saved >= 1) grant('builder');
  if (s.proven >= 1) grant('proven');
  if (s.published >= 1) grant('publisher');
  if (s.bought >= 1) grant('shopper');
  if (s.chats >= 1) grant('social');
  if (s.trades >= 1) grant('trader');
  if (s.team >= 1) grant('teamwork');
  if (OBBIES.some((id) => won('w:' + id))) grant('obby1');
  if (OBBIES.every((id) => won('w:' + id))) grant('obbyall');
  // the hard ones
  const h = new Date().getHours();
  if (h >= 0 && h < 4 && s.wins + s.obbies + s.chats > 0) grant('nightowl');
  if (s.jumps >= 25000) grant('jumps25k');
  if (s.deaths >= 1000) grant('die1000');
  if (s.stomps >= 250) grant('stomp250');
  if (s.portals >= 1000) grant('portals1000');
  if (s.coins >= 5000) grant('coins5000');
  if (s.endlessBest >= 2500) grant('endless2500');
  if (s.dailies >= 30) grant('daily30');
  if (s.chats >= 500) grant('chat500');
  if ((s.dances || 0) >= 200) grant('dance200');
  if ((s.spins || 0) >= 100) grant('spin100');
  if ((s.snowhits || 0) >= 50) grant('snow50');
  if ((s.splats || 0) >= 100) grant('splat100');
  if ((s.win_race || 0) >= 25) grant('race25');
  if ((s.win_tag || 0) >= 10) grant('tag10');
  if ((s.win_koth || 0) >= 10) grant('koth10');
  if ((s.win_lava || 0) >= 10) grant('lava10');
  if ((s.friends || 0) >= 10) grant('friends10');
  for (const n of [1, 10, 50, 100]) if ((s.followers || 0) >= n) grant('followers' + n);
  if (s.published >= 10) grant('publish10');
  if (s.trades >= 25) grant('trades25');
  if (s.bought >= 25) grant('buy25');
  if (TOUR.every((id) => s['v_' + id])) grant('tourist');
  if (wallet) {
    if (wallet.coins >= 10000) grant('tycoon');
    if ((wallet.rstars || 0) >= 100) grant('rstars100');
    if (Object.values(wallet.items || {}).filter((q) => q > 0).length >= 25) grant('collector');
  }
  // every other badge: you are The Chosen One
  if (ACHIEVEMENTS.every((a) => a.chosen || data.ach[a.id])) grant('chosen');
}
