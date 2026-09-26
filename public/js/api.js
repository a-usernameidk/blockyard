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

// 3D worlds made by guests (accounts keep them on the server as projects).
export const myWorlds = {
  list() { return store.get('worlds', []); },
  get(id) { return this.list().find((w) => w.id === id) || null; },
  save(w) { const all = this.list().filter((x) => x.id !== w.id); all.unshift({ ...w, updated: Date.now() }); return store.set('worlds', all.slice(0, 12)); },
  remove(id) { store.set('worlds', this.list().filter((w) => w.id !== id)); },
};

export function newId() { return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ---------------- online server ---------------- */
let onlineCheck = null;
// True only when the Cloudflare backend and its database are running.
export function isOnline() {
  if (!onlineCheck) {
    onlineCheck = request('GET', '/health').then((j) => !!(j && j.ok && j.db)).catch(() => false);
  }
  return onlineCheck;
}

// The login token for this browser (empty for guests).
export const auth = {
  get token() { return store.get('token', ''); },
  set token(t) { store.set('token', t || ''); },
};

async function request(method, path, body, headers = {}, wait = 12000) {
  if (auth.token) headers = { authorization: 'Bearer ' + auth.token, ...headers };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), wait);
  try {
    const r = await fetch('/api' + path, {
      method, signal: ctl.signal, cache: 'no-store',
      headers: body ? { 'content-type': 'application/json', ...headers } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok || !data) { const err = new Error((data && data.error) || `The server answered with an error (${r.status}).`); err.status = r.status; throw err; }
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
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString();
export const api = {
  signup: (name, password, progress) => request('POST', '/auth/signup', { name, password, progress }),
  login: (name, password) => request('POST', '/auth/login', { name, password }),
  recover: (name, recovery, password) => request('POST', '/auth/recover', { name, recovery, password }),
  logout: () => request('POST', '/auth/logout'),
  me: () => request('GET', '/me'),
  deleteMe: () => request('DELETE', '/me'),
  saveProgress: (progress) => request('PUT', '/me/progress', { progress }),
  myGames: () => request('GET', '/me/games'),
  list: ({ kind = '2d', sort = 'new', style = '', q = '', page = 0, creator = '', rewarding = '' } = {}) => request('GET', `/games?${qs({ kind, sort, style, q, page, creator, rewarding })}`),
  get: (id) => request('GET', `/games/${enc(id)}`),
  publish: (lv, desc, replay, extra = {}) => request('POST', '/games', { level: toWire(lv), desc, replay, ...extra }),
  update: (id, lv, desc, replay, editKey, extra = {}) => request('PUT', `/games/${enc(id)}`, { level: toWire(lv), desc, replay, ...extra }, editKey ? { 'x-edit-key': editKey } : {}),
  publish3d: (world, desc, replay, extra = {}) => request('POST', '/games', { kind: '3d', world, desc, replay, ...extra }),
  update3d: (id, world, desc, replay, extra = {}) => request('PUT', `/games/${enc(id)}`, { kind: '3d', world, desc, replay, ...extra }),
  visibility: (id, visibility) => request('PUT', `/games/${enc(id)}`, { only: 'visibility', visibility }),
  remove: (id, editKey) => request('DELETE', `/games/${enc(id)}`, null, editKey ? { 'x-edit-key': editKey } : {}),
  play: (id) => request('POST', `/games/${enc(id)}/play`),
  like: (id) => request('POST', `/games/${enc(id)}/like`),
  report: (id, reason) => request('POST', `/games/${enc(id)}/report`, { reason }),
  daily: (date) => request('GET', `/daily?date=${enc(date)}`),
  postDaily: (date, replay) => request('POST', '/daily', { date, replay }),
  admin: (method, path, body) => request(method, '/admin' + path, body),
  // coins, closet, trades
  look: (look) => request('PUT', '/me/look', look),
  shop: () => request('GET', '/shop'),
  buy: (key) => request('POST', '/shop/buy', { key }),
  sell: (key) => request('POST', '/shop/sell', { key }),
  finish: (body) => request('POST', '/finish', body, {}, 20000),
  trades: () => request('GET', '/trades'),
  offer: (body) => request('POST', '/trades', body),
  tradeAction: (id, action) => request('POST', `/trades/${enc(id)}`, { action }),
  users: (q) => request('GET', `/users?${qs({ q })}`),
  user: (name) => request('GET', `/users/${enc(name)}`),
  // projects
  projects: () => request('GET', '/projects'),
  newProject: (kind, name, data) => request('POST', '/projects', { kind, name, data }),
  project: (id) => request('GET', `/projects/${enc(id)}`),
  saveProject: (id, data) => request('PUT', `/projects/${enc(id)}`, { data }),
  deleteProject: (id) => request('DELETE', `/projects/${enc(id)}`),
  collab: (id, name, action) => request('POST', `/projects/${enc(id)}/collab`, { name, action }),
  // live rooms
  online: () => request('GET', '/online'),
  servers: (world) => request('GET', `/servers?${qs({ world })}`),
  privateServer: (world) => request('POST', '/servers', { world }),
  joinRoom: (body) => request('POST', '/rooms/join', body),
  editRoom: (project) => request('POST', '/rooms/edit', { project }),
};
