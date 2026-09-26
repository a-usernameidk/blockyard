// Shared bits for every page: finding elements, building HTML, pages and links, pop-ups, toasts.
import { drawPip } from './art.js';
import { progress } from './progress.js';

// Leaving something out with null or false (like `x ? el(...) : null`) means "nothing here",
// the same as in el() below, instead of the word "null" showing up on the page.
for (const name of ['append', 'prepend', 'replaceChildren']) {
  const orig = Element.prototype[name];
  Element.prototype[name] = function (...kids) { return orig.apply(this, kids.filter((k) => k != null && k !== false)); };
}

export const $ = (s) => document.querySelector(s);
export const $$ = (s) => [...document.querySelectorAll(s)];
export const session = { user: null, online: false, rooms: false };

export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}

/* ---------------- pages ---------------- */
const VIEWS = ['home', 'levels', 'discover', 'play', 'edit', 'worlds', 'world', 'w3', 'build', 'create', 'closet', 'profile', 'daily', 'admin', 'settings', 'builder', 'top'];
let current = '';
const leaving = new Map(); // view -> functions to call when leaving it
export const currentView = () => current;
export function onLeave(view, fn) { if (!leaving.has(view)) leaving.set(view, []); leaving.get(view).push(fn); }
export function show(name, nav) {
  if (current && current !== name) for (const fn of leaving.get(current) || []) { try { fn(name); } catch (e) { console.error(e); } }
  current = name;
  for (const v of VIEWS) { const s = document.getElementById('view-' + v); if (s) s.hidden = v !== name; }
  $$('[data-nav]').forEach((b) => { if (b.dataset.nav === (nav || name)) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  document.body.dataset.view = name;
  scrollTo(0, 0);
}

const routes = [];
let fallback = () => {};
// route(pattern, handler): pattern is a RegExp matched against the hash, handler gets the match
export function addRoute(re, fn) { routes.push([re, fn]); }
export function defaultRoute(fn) { fallback = fn; }
let lastRoute = null;
export function route(to) {
  const h = to || location.hash || '#/';
  lastRoute = h;
  for (const [re, fn] of routes) { const m = h.match(re); if (m) { fn(m); return; } }
  fallback([h]);
}
export function go(hash) {
  try { if (location.hash !== hash) history.pushState(null, '', hash); } catch (e) { /* some embedded previews block this */ }
  route(hash);
}
export function replaceRoute(hash) { try { history.replaceState(null, '', hash); } catch (e) { /* ok */ } lastRoute = hash; }
addEventListener('popstate', () => route());
addEventListener('hashchange', () => { if (location.hash !== lastRoute) route(); });
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-go]');
  if (!t) return;
  e.preventDefault();
  const m = t.closest('.modal'); if (m) m.hidden = true;
  go(t.dataset.go);
});

/* ---------------- pop-ups ---------------- */
export function openModal(id) {
  const m = $(id); m.hidden = false;
  const f = m.querySelector('input:not([readonly]):not([hidden]), select, button:not([hidden])');
  if (f) setTimeout(() => f.focus(), 30);
}
export function closeModal(m) { m.hidden = true; }
document.addEventListener('click', (e) => { const c = e.target.closest('[data-close]'); if (c) closeModal(c.closest('.modal')); });
$$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); }));
addEventListener('keydown', (e) => { if (e.key === 'Escape') { const m = $$('.modal').find((x) => !x.hidden); if (m) { e.stopImmediatePropagation(); closeModal(m); } } }, true);

// A question with buttons. extra: an element to show under the text (like an input).
export function ask(title, text, buttons, extra) {
  return new Promise((resolve) => {
    $('#ask-h').textContent = title; $('#ask-text').textContent = text;
    $('#ask-extra').replaceChildren(...(extra ? [extra] : []));
    const row = $('#ask-buttons'); row.innerHTML = '';
    const done = (v) => { $('#ask-modal').hidden = true; resolve(v); };
    for (const b of buttons) row.append(el('button', { class: 'btn ' + (b.cls || ''), type: 'button', onclick: () => done(b.value) }, b.label));
    row.append(el('button', { class: 'btn', type: 'button', onclick: () => done(null) }, buttons.length ? 'Cancel' : 'OK'));
    openModal('#ask-modal');
  });
}
export function toast(text, kind = '') {
  const t = el('div', { class: 'toast ' + kind }, text);
  $('#toasts').append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}
export async function copyText(text, btn, label) {
  try { await navigator.clipboard.writeText(text); if (btn) btn.textContent = 'Copied'; }
  catch (e) { if (btn) btn.textContent = 'Select and copy it'; }
  if (btn) setTimeout(() => { btn.textContent = label; }, 1800);
}
export const siteBase = () => location.href.split('#')[0];
export function needLogin(reason) {
  ask('Log in first', `${reason} It only takes a username and a password.`, [{ label: 'Log in or sign up', value: true, cls: 'btn-sun' }])
    .then((v) => { if (v) $('#me-btn').click(); });
}

/* ---------------- little pictures ---------------- */
export function pipCanvas(size, opts = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = size * dpr; cv.height = size * dpr; cv.style.width = cv.style.height = size + 'px';
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  const eq = { ...progress.data.equip, ...opts };
  c.translate(size / 2, size * 0.58);
  drawPip(c, size * 0.5, eq.color, { t: 1, look: 1, hat: eq.hat });
  cv.setAttribute('aria-hidden', 'true');
  return cv;
}
export function paintCanvas(cv, fn) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = cv.clientWidth || Number(cv.getAttribute('width')) || 200, H = cv.clientHeight || Number(cv.getAttribute('height')) || 120;
  cv.width = W * dpr; cv.height = H * dpr;
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  fn(c, W, H);
}
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export function timeAgo(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return plural(Math.floor(s / 60), 'minute') + ' ago';
  if (s < 86400) return plural(Math.floor(s / 3600), 'hour') + ' ago';
  return plural(Math.floor(s / 86400), 'day') + ' ago';
}
