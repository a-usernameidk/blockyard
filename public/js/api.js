// Saving things: this browser (localStorage) and the online server (Cloudflare Worker).
import { toWire } from './format.js';

/* ---------------- this browser ---------------- */
const PREFIX = 'blockyard:';
export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(PREFIX + key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch (e) { return false; }
  },
};

// Levels you made. Saved only in this browser until you publish them.
export const mine = {
  list() {
    // levels saved by the first version of Blockyard used a different key
    const old = store.get('mine', null);
    if (old && !store.get('games', null)) { store.set('games', old.map((g) => ({ ...g, style: 'adventure', theme: 'meadow' }))); }
    return store.get('games', []);
  },
  get(id) { return this.list().find((g) => g.id === id) || null; },
  save(lv) {
    const all = this.list().filter((g) => g.id !== lv.id);
    all.unshift({ ...lv, updated: Date.now() });
    return store.set('games', all);
  },
  remove(id) { store.set('games', this.list().filter((g) => g.id !== id)); },
};

export function newId() { return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

const COLORS = ['#ff6b35', '#ff5d8f', '#3a86ff', '#44c06a', '#b06cff', '#ffd23f', '#2ec4b6', '#f4f4f4'];
export const PLAYER_COLORS = COLORS;
export const profile = {
  get() { return { name: '', color: COLORS[0], ...store.get('profile', {}) }; },
  set(p) { store.set('profile', p); },
};

export const bests = {
  get(id) { return store.get('best:' + id, null); },
  // keeps the best: highest progress, then fastest time
  record(id, r) {
    const old = this.get(id);
    if (!old || r.progress > old.progress || (r.progress === old.progress && r.won && (!old.time || r.time < old.time))) store.set('best:' + id, r);
  },
};

/* ---------------- online server ---------------- */
let onlineCheck = null;
// True only when the Cloudflare backend and its database are running.
export function isOnline() {
  if (!onlineCheck) {
    onlineCheck = request('GET', '/health').then((j) => !!(j && j.ok && j.db)).catch(() => false);
  }
  return onlineCheck;
}

async function request(method, path, body, headers = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch('/api' + path, {
      method, signal: ctl.signal, cache: 'no-store',
      headers: body ? { 'content-type': 'application/json', ...headers } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok || !data) throw new Error((data && data.error) || `The server answered with an error (${r.status}).`);
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('The server took too long to answer. Try again.');
    if (e instanceof TypeError) throw new Error("Couldn't reach the server. Check your internet connection.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const enc = encodeURIComponent;
export const api = {
  list: ({ sort = 'new', style = '', q = '', page = 0 } = {}) => request('GET', `/games?${new URLSearchParams({ sort, style, q, page })}`),
  get: (id) => request('GET', `/games/${enc(id)}`),
  publish: (lv, creator, desc) => request('POST', '/games', { level: toWire(lv), creator, desc }),
  update: (id, key, lv, creator, desc) => request('PUT', `/games/${enc(id)}`, { level: toWire(lv), creator, desc }, { 'x-edit-key': key }),
  remove: (id, key) => request('DELETE', `/games/${enc(id)}`, null, { 'x-edit-key': key }),
  play: (id) => request('POST', `/games/${enc(id)}/play`),
  like: (id) => request('POST', `/games/${enc(id)}/like`),
  report: (id, reason) => request('POST', `/games/${enc(id)}/report`, { reason }),
  admin: (key, method, path, body) => request(method, '/admin' + path, body, { 'x-admin-key': key }),
};
