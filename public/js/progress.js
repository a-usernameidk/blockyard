// Your progress: stars, coins, best runs, stats, achievements and closet items.
// Guests keep it in this browser. With an account it also syncs to the server.
import { store } from './api.js';
import { SHOP, FREE, itemKey } from './cosmetics.js';
import { WORLDS, BUILTIN } from './levels.js';

export const ACHIEVEMENTS = [
  { id: 'first', name: 'First steps', text: 'Beat any level', reward: 20 },
  { id: 'world1', name: 'World 1 clear', text: 'Beat every level in World 1', reward: 100 },
  { id: 'world2', name: 'World 2 clear', text: 'Beat every level in World 2', reward: 150 },
  { id: 'stars10', name: 'Star collector', text: 'Earn 10 stars', reward: 40 },
  { id: 'stars30', name: 'Star hoarder', text: 'Earn 30 stars', reward: 100 },
  { id: 'allstars', name: 'Perfectionist', text: 'Earn every star', reward: 300 },
  { id: 'flawless', name: 'Flawless party', text: 'Beat Portal Party without dying', reward: 150 },
  { id: 'coins500', name: 'Piggy bank', text: 'Grab 500 coins in levels', reward: 50 },
  { id: 'jumps1000', name: 'Bouncy', text: 'Jump 1000 times', reward: 40 },
  { id: 'stomp25', name: 'Stomper', text: 'Stomp 25 walkers', reward: 40 },
  { id: 'portals100', name: 'Shape shifter', text: 'Go through 100 portals', reward: 40 },
  { id: 'die100', name: 'Never give up', text: 'Respawn 100 times', reward: 30 },
  { id: 'endless250', name: 'Long run', text: 'Reach 250 m in Endless Rush', reward: 40 },
  { id: 'endless1000', name: 'Marathon', text: 'Reach 1000 m in Endless Rush', reward: 150 },
  { id: 'daily1', name: 'Daily player', text: 'Finish a daily challenge', reward: 30 },
  { id: 'daily5', name: 'Regular', text: 'Finish 5 daily challenges', reward: 100 },
  { id: 'builder', name: 'Builder', text: 'Save a level you made', reward: 20 },
  { id: 'proven', name: 'Proven', text: 'Beat your own level in Test', reward: 20 },
  { id: 'publisher', name: 'Published', text: 'Publish a level to Discover', reward: 50 },
  { id: 'shopper', name: 'Fresh look', text: 'Buy something in the closet', reward: 20 },
];

const STAR_REWARD = 10;
const blank = () => ({
  v: 1, coins: 0, levels: {}, owned: FREE.slice(), equip: { color: '#ff6b35', hat: 'none', trail: 'none' }, ach: {},
  stats: { wins: 0, jumps: 0, stomps: 0, portals: 0, deaths: 0, coins: 0, endlessBest: 0, dailies: 0, saved: 0, proven: 0, published: 0, bought: 0 },
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
// Bring over best runs saved by the older version of Blockyard.
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
  store.set(key, data);
  for (const fn of listeners) fn(data);
}

export function merge(a, b, addCoins = false) {
  a = clean(a); b = clean(b);
  const newer = (a.updated || 0) >= (b.updated || 0) ? a : b;
  const out = clean(newer);
  out.coins = addCoins ? a.coins + b.coins : newer.coins;
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
  for (const s in out.stats) out.stats[s] = Math.max(a.stats[s] || 0, b.stats[s] || 0);
  for (const d of new Set([...Object.keys(a.daily), ...Object.keys(b.daily)])) {
    const x = a.daily[d] || {}, y = b.daily[d] || {};
    out.daily[d] = { best: Math.max(x.best || 0, y.best || 0), won: !!(x.won || y.won), attempts: Math.max(x.attempts || 0, y.attempts || 0) };
  }
  return out;
}

export const progress = {
  get data() { return data; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  // Switch between the guest save and an account save.
  use(userId, serverData) {
    key = userId ? 'progress:u:' + userId : 'progress:guest';
    const local = store.get(key, null);
    data = serverData ? merge(serverData, local) : clean(local);
    save();
  },
  guestHasProgress() {
    const g = clean(store.get('progress:guest', null));
    return g.coins > 0 || Object.keys(g.levels).length > 0 || g.owned.length > FREE.length;
  },
  clearGuest() { store.set('progress:guest', blank()); },
  absorbGuest() {
    data = merge(data, store.get('progress:guest', null), true);
    store.set('progress:guest', blank());
    save();
  },
  level(id) { return data.levels[id] || null; },
  stars(id) { const l = data.levels[id]; return l && l.stars ? l.stars : [0, 0, 0]; },
  totalStars() { return Object.values(data.levels).reduce((n, l) => n + (l.stars || []).reduce((a, b) => a + (b ? 1 : 0), 0), 0); },
  maxStars() { return BUILTIN.length * 3; },

  // Called when a run ends. meta: { builtin, par, rush }
  finish(id, r, meta = {}) {
    const e = data.levels[id] || (data.levels[id] = { won: false, progress: 0, time: null, stars: [0, 0, 0], coins: 0 });
    const out = { newBest: false, stars: e.stars.slice(), newStars: [], coinsEarned: 0 };
    if (r.won) {
      if (!e.won || e.time === null || r.time < e.time) { out.newBest = e.won; e.time = Math.round(r.time * 10) / 10; }
      e.won = true; e.progress = 1;
      data.stats.wins++;
      if (meta.builtin) {
        const got = [1, r.totalCoins ? (r.coins >= r.totalCoins ? 1 : 0) : (r.deaths === 0 ? 1 : 0), meta.rush ? (r.deaths === 0 ? 1 : 0) : (meta.par && r.time <= meta.par ? 1 : 0)];
        got.forEach((g, i) => { if (g && !e.stars[i]) { e.stars[i] = 1; out.newStars.push(i); out.coinsEarned += STAR_REWARD; } });
        if (r.coins > e.coins) { out.coinsEarned += r.coins - e.coins; e.coins = r.coins; }
        if (id === 'b-party' && r.deaths === 0) grant('flawless');
      }
      out.stars = e.stars.slice();
    } else if (r.progress > e.progress + 0.001) { out.newBest = true; e.progress = r.progress; }
    data.coins += out.coinsEarned;
    checkAll(); save();
    return out;
  },
  endless(distance, coins) {
    const best = data.stats.endlessBest;
    const earned = coins + Math.floor(distance / 25);
    data.stats.endlessBest = Math.max(best, distance);
    data.coins += earned;
    checkAll(); save();
    return { newBest: distance > best, earned, best: data.stats.endlessBest };
  },
  daily(date, pct, won) {
    const d = data.daily[date] || (data.daily[date] = { best: 0, won: false, attempts: 0 });
    d.attempts++;
    const out = { newBest: pct > d.best + 0.001, earned: 0 };
    d.best = Math.max(d.best, pct);
    if (won && !d.won) { d.won = true; data.stats.dailies++; out.earned = 30; data.coins += 30; }
    checkAll(); save();
    return out;
  },
  stat(name, n = 1) { data.stats[name] = (data.stats[name] || 0) + n; },
  flush() { checkAll(); save(); },
  achieve(id) { grant(id); save(); },
  takeNewAchievements() { const a = pendingAch; pendingAch = []; return a; },

  owns(kind, id) { return FREE.includes(id) || data.owned.includes(itemKey(kind, id)); },
  canUnlock(item) {
    if (!item.need) return true;
    if (item.need.stars) return this.totalStars() >= item.need.stars;
    if (item.need.ach) return !!data.ach[item.need.ach];
    return false;
  },
  buy(kind, id) {
    const item = SHOP[kind].find((i) => i.id === id);
    if (!item || this.owns(kind, id)) return 'owned';
    if (item.need) { if (!this.canUnlock(item)) return 'locked'; }
    else if (data.coins < item.price) return 'poor';
    else data.coins -= item.price;
    data.owned.push(itemKey(kind, id));
    data.stats.bought++;
    grant('shopper');
    data.equip[kind] = id;
    save();
    return 'ok';
  },
  equip(kind, id) { if (this.owns(kind, id)) { data.equip[kind] = id; save(); } },
};

function grant(id) {
  if (data.ach[id]) return;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return;
  data.ach[id] = Date.now();
  data.coins += a.reward;
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
}
