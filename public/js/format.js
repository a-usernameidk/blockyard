// Level format. The game AND the server both use this file,
// so there is no browser-only code in here.
//
// A level is a grid of characters, one per tile. Example tiles:
//   '.' empty   '#' ground   '^' spike   'o' coin   'S' start   'G' goal
// The full list is TILES below. To add a new block type, add it to TILES,
// then teach engine2d.js what it does and render2d.js how to draw it.

export const VERSION = 2;
export const LIMITS = { minW: 16, maxW: 400, minH: 10, maxH: 40, name: 40, desc: 140, creator: 20 };
export const STYLES = ['adventure', 'rush'];
export const THEMES = ['meadow', 'dunes', 'frost', 'night', 'volcano'];
export const THEME_NAMES = { meadow: 'Meadow', dunes: 'Dunes', frost: 'Frost', night: 'Night', volcano: 'Volcano' };

// Rush forms (inspired by one-button rhythm runners, all our own names)
export const FORMS = ['hopper', 'jet', 'roller', 'flapper', 'dart', 'springer', 'snapper', 'glider'];
export const FORM_INFO = {
  hopper:   { name: 'Hopper',   tile: 'h', color: '#44c06a', how: 'Tap to jump. Hold to keep jumping.' },
  jet:      { name: 'Jet',      tile: 'j', color: '#ff5d8f', how: 'Hold to fly up, let go to drop.' },
  roller:   { name: 'Roller',   tile: 'l', color: '#ff9f1c', how: 'Tap to flip gravity while rolling.' },
  flapper:  { name: 'Flapper',  tile: 'f', color: '#b06cff', how: 'Tap for a little hop, even in the air.' },
  dart:     { name: 'Dart',     tile: 'd', color: '#35d0ff', how: 'Hold to zig up, let go to zag down.' },
  springer: { name: 'Springer', tile: 's', color: '#f4f4f4', how: 'Hold longer to jump higher.' },
  snapper:  { name: 'Snapper',  tile: 'z', color: '#2ec4b6', how: 'Tap to snap to the ceiling or floor.' },
  glider:   { name: 'Glider',   tile: 'w', color: '#ffd23f', how: 'Tap to flip gravity in midair.' },
};
export const SPEEDS = { '<': 0.8, '~': 1, '>': 1.3, '*': 1.6 };
export const SPEED_NAMES = { '<': 'Slow', '~': 'Normal', '>': 'Fast', '*': 'Very fast' };

// group: which editor tab it lives in. rush: only works in Rush levels.
export const TILES = {
  '.': { name: 'Erase', group: 'tools' },
  '#': { name: 'Ground', group: 'blocks', solid: true, tip: 'Solid ground. Gets a grassy top.' },
  'X': { name: 'Stone', group: 'blocks', solid: true, tip: 'Solid stone block.' },
  'I': { name: 'Ice', group: 'blocks', solid: true, tip: 'Slippery to run on in Adventure levels.' },
  '=': { name: 'Ledge', group: 'blocks', tip: 'Jump up through it from below, stand on top.' },
  'C': { name: 'Crumble', group: 'blocks', solid: true, tip: 'Breaks a moment after you land on it, then comes back.' },
  'D': { name: 'Door', group: 'blocks', solid: true, tip: 'Opens when you touch it holding a key.' },
  '^': { name: 'Spike', group: 'danger', tip: 'Touch it and you respawn.' },
  'v': { name: 'Ceiling spike', group: 'danger', tip: 'A spike that points down.' },
  'L': { name: 'Lava', group: 'danger', tip: 'Hot. Do not touch.' },
  'E': { name: 'Walker', group: 'danger', tip: 'Walks back and forth. Land on its head to beat it.' },
  'o': { name: 'Coin', group: 'items', tip: 'Collect them all for bragging rights.' },
  'k': { name: 'Key', group: 'items', tip: 'Opens one door.' },
  'B': { name: 'Bounce pad', group: 'items', solid: true, tip: 'Launches you when you land on it.' },
  'y': { name: 'Jump ring', group: 'items', tip: 'Press jump while touching it to jump again in midair.' },
  'r': { name: 'Flip ring', group: 'items', tip: 'Press jump while touching it to flip gravity.' },
  'M': { name: 'Mover', group: 'items', tip: 'A platform that slides left and right. Put a few side by side for a wider one.' },
  'P': { name: 'Checkpoint', group: 'items', tip: 'After you touch it, you respawn here. In Rush levels, checkpoints only show up in Practice mode.' },
  'S': { name: 'Start', group: 'tools', tip: 'Where the player spawns. One per level.' },
  'G': { name: 'Goal', group: 'tools', tip: 'Touch it to win.' },
  'u': { name: 'Upside down', group: 'portals', tip: 'Flips gravity so you fall up.' },
  'n': { name: 'Right way up', group: 'portals', tip: 'Puts gravity back to normal.' },
  'h': { name: 'Hopper', group: 'portals', rush: true, form: 'hopper' },
  'j': { name: 'Jet', group: 'portals', rush: true, form: 'jet' },
  'l': { name: 'Roller', group: 'portals', rush: true, form: 'roller' },
  'f': { name: 'Flapper', group: 'portals', rush: true, form: 'flapper' },
  'd': { name: 'Dart', group: 'portals', rush: true, form: 'dart' },
  's': { name: 'Springer', group: 'portals', rush: true, form: 'springer' },
  'z': { name: 'Snapper', group: 'portals', rush: true, form: 'snapper' },
  'w': { name: 'Glider', group: 'portals', rush: true, form: 'glider' },
  '<': { name: 'Slow', group: 'portals', speed: '<', tip: 'Slow speed portal. Works in Adventure and Rush.' },
  '~': { name: 'Normal', group: 'portals', speed: '~', tip: 'Normal speed portal. Works in Adventure and Rush.' },
  '>': { name: 'Fast', group: 'portals', speed: '>', tip: 'Fast speed portal: run and fly faster. Works in Adventure and Rush.' },
  '*': { name: 'Very fast', group: 'portals', speed: '*', tip: 'Very fast speed portal. Works in Adventure and Rush.' },
  'm': { name: 'Tiny', group: 'portals', rush: true, tip: 'Makes you tiny.' },
  'q': { name: 'Full size', group: 'portals', rush: true, tip: 'Back to full size.' },
};
for (const f of FORMS) TILES[FORM_INFO[f].tile].tip = FORM_INFO[f].name + ' portal. ' + FORM_INFO[f].how;
export const ALPHABET = Object.keys(TILES).join('');
const ALLOWED = new Set(ALPHABET);

/* ---------- run-length encoding: "....####" -> ".4#4" ---------- */
export function rle(s) {
  let out = '';
  for (let i = 0; i < s.length;) {
    let j = i;
    while (j < s.length && s[j] === s[i]) j++;
    out += s[i] + (j - i > 1 ? j - i : '');
    i = j;
  }
  return out;
}
export function unrle(s, max = LIMITS.maxW * LIMITS.maxH) {
  let out = '';
  for (let i = 0; i < s.length;) {
    const c = s[i++];
    let n = '';
    while (i < s.length && s[i] >= '0' && s[i] <= '9') n += s[i++];
    const count = n ? parseInt(n, 10) : 1;
    if (out.length + count > max) throw new Error('Level data is too big.');
    out += c.repeat(count);
  }
  return out;
}

/* ---------- base64url that handles emoji and accents ---------- */
export function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64decode(s) {
  s = String(s).trim().replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* ---------- text cleanup + a small name filter ---------- */
export function cleanText(s, max) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
// Add words here if people get creative. Matching ignores spaces, symbols and l33t speak.
const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'cock', 'nigg', 'fag', 'retard', 'whore', 'slut', 'porn', 'nazi', 'rape', 'asshole', 'penis', 'vagina', 'kys'];
export function isRude(s) {
  const flat = String(s).toLowerCase()
    .replace(/[0@4]/g, (c) => ({ 0: 'o', '@': 'a', 4: 'a' }[c]))
    .replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[5$]/g, 's').replace(/7/g, 't')
    .replace(/[^a-z]/g, '');
  return BLOCKED.some((w) => flat.includes(w));
}

/* ---------- validate + clean any level that comes from outside ---------- */
export function normalizeLevel(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('That is not a level.');
  const w = Number(raw.w), h = Number(raw.h);
  if (!Number.isInteger(w) || w < LIMITS.minW || w > LIMITS.maxW) throw new Error(`Width must be ${LIMITS.minW} to ${LIMITS.maxW} blocks.`);
  if (!Number.isInteger(h) || h < LIMITS.minH || h > LIMITS.maxH) throw new Error(`Height must be ${LIMITS.minH} to ${LIMITS.maxH} blocks.`);
  const d = unrle(String(raw.d ?? ''), w * h);
  if (d.length !== w * h) throw new Error('Level data is the wrong size.');
  for (const c of d) if (!ALLOWED.has(c)) throw new Error('Level has a block type this version does not know.');
  const style = STYLES.includes(raw.style) ? raw.style : 'adventure';
  const starts = d.split('S').length - 1;
  if (starts === 0) throw new Error('Level needs a Start block.');
  if (starts > 1) throw new Error('Level can only have one Start block.');
  if (style === 'adventure' && !d.includes('G')) throw new Error('Adventure levels need a Goal.');
  return {
    v: VERSION,
    n: cleanText(raw.n, LIMITS.name) || 'Untitled',
    style,
    theme: THEMES.includes(raw.theme) ? raw.theme : 'meadow',
    form: FORMS.includes(raw.form) ? raw.form : 'hopper',
    speed: raw.speed in SPEEDS ? raw.speed : '~',
    w, h, d,
  };
}

// What gets sent over the network or packed into a share code.
export function toWire(lv) {
  return { v: VERSION, n: lv.n, style: lv.style, theme: lv.theme, form: lv.form, speed: lv.speed, w: lv.w, h: lv.h, d: rle(lv.d) };
}
export function encodeShare(lv) { return b64encode(JSON.stringify(toWire(lv))); }
export function decodeShare(code) {
  let obj;
  try { obj = JSON.parse(b64decode(code)); } catch (e) { throw new Error("That code didn't load. Check that you copied all of it."); }
  return normalizeLevel(obj);
}

export function countTiles(d, c) { let n = 0; for (let i = 0; i < d.length; i++) if (d[i] === c) n++; return n; }
