// Pip emojis: 50 little Pip faces for chat and messages. Type :name: (or pick one from the Pip button)
// and it shows as a picture. Everything is drawn in code, so there are no image files to load.
import { INK, drawHat } from './art.js';

// [name, body color, eyes, mouth, extras, hat]
const LIST = [
  ['happy', '#ff6b35', 'normal', 'smile'], ['grin', '#ff6b35', 'normal', 'grin'], ['lol', '#ffd23f', 'happy', 'grin', 'joy'],
  ['love', '#ff5d8f', 'heart', 'smile', 'blush'], ['starstruck', '#ffd23f', 'star', 'grin'], ['wink', '#ff6b35', 'wink', 'smile'],
  ['cool', '#3a86ff', 'shades', 'smirk'], ['sad', '#7cc8ff', 'sad', 'frown'], ['cry', '#7cc8ff', 'closed', 'frown', 'tears'],
  ['angry', '#e63946', 'angry', 'frown', 'vein'], ['rage', '#b5121b', 'angry', 'teeth', 'fire'], ['shock', '#ffd23f', 'wide', 'o'],
  ['scared', '#a8d8ff', 'wide', 'wavy', 'sweat'], ['sleepy', '#b06cff', 'closed', 'flat', 'zzz'], ['dizzy', '#5fd07c', 'spiral', 'wavy'],
  ['sick', '#8fbf4a', 'closed', 'wavy', 'sweat'], ['cold', '#bfe6ff', 'wide', 'teeth', 'snow'], ['hot', '#ff5a1f', 'closed', 'open', 'sweat'],
  ['think', '#ff6b35', 'side', 'flat', 'question'], ['idea', '#ffd23f', 'wide', 'o', 'bulb'], ['confused', '#b06cff', 'uneven', 'wavy', 'question'],
  ['nervous', '#ffb02e', 'normal', 'wavy', 'sweat'], ['shy', '#ff9ec4', 'happy', 'smile', 'blush'], ['kiss', '#ff5d8f', 'closed', 'kiss', 'heart'],
  ['tongue', '#44c06a', 'wink', 'tongue'], ['money', '#44c06a', 'money', 'grin'], ['dead', '#a3abc2', 'x', 'tongue'],
  ['party', '#ff5d8f', 'happy', 'grin', 'confetti', 'party'], ['king', '#ffd23f', 'normal', 'smirk', null, 'crown'], ['wizard', '#5a3fd6', 'normal', 'o', 'sparkle', 'wizard'],
  ['boo', '#f4f4f4', 'wide', 'o'], ['alien', '#5fd07c', 'alien', 'flat'], ['glitch', '#3d405b', 'dot', 'flat', 'sparkle'],
  ['yes', '#44c06a', 'happy', 'grin', 'check'], ['no', '#e63946', 'closed', 'frown', 'cross'], ['gg', '#3a86ff', 'happy', 'grin', 'gg'],
  ['hype', '#ff9f1c', 'star', 'open', 'exclaim'], ['sus', '#e63946', 'sus', 'flat'], ['bruh', '#a3abc2', 'half', 'flat'],
  ['smug', '#b06cff', 'half', 'smirk'], ['hearts', '#ff5d8f', 'happy', 'smile', 'hearts'], ['chef', '#ff6b35', 'happy', 'smile', null, 'chef'],
  ['cowboy', '#ff9f1c', 'normal', 'grin', null, 'cowboy'], ['viking', '#e63946', 'angry', 'teeth', null, 'viking'], ['bunny', '#ff9ec4', 'normal', 'smile', null, 'bunny'],
  ['halo', '#f4f4f4', 'happy', 'smile', null, 'halo'], ['devil', '#b5121b', 'half', 'smirk', null, 'horns'], ['music', '#3a86ff', 'closed', 'smile', 'notes', 'headphones'],
  ['wave', '#ff6b35', 'happy', 'grin', 'wave'], ['pip', '#ff6b35', 'normal', 'smile', null, 'none'],
];
export const PIP_EMOJIS = LIST.map(([name, color, eyes, mouth, extra, hat]) => ({ name, color, eyes, mouth, extra: extra || null, hat: hat || null }));
const BY_NAME = new Map(PIP_EMOJIS.map((e) => [e.name, e]));

function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function star(c, x, y, r, n = 5, inner = 0.45) { c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rad = i % 2 ? r * inner : r; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } c.closePath(); }
function heart(c, x, y, s) { c.beginPath(); c.moveTo(x, y + s * 0.35); c.bezierCurveTo(x - s * 1.1, y - s * 0.3, x - s * 0.45, y - s * 1.05, x, y - s * 0.35); c.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s * 1.1, y - s * 0.3, x, y + s * 0.35); c.closePath(); }
function shadeHex(hex, k) { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }

// Draws one emoji centered at (0, 0), s = body size.
export function drawEmoji(c, e, s) {
  const h = s / 2, lw = Math.max(1.5, s / 11);
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = lw;
  c.translate(0, s * 0.08);
  if (!e.hat) { // antenna
    c.beginPath(); c.moveTo(-h * 0.2, -h); c.quadraticCurveTo(-h * 0.2 + s * 0.06, -h - s * 0.14, -h * 0.2, -h - s * 0.22); c.stroke();
    c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(-h * 0.2, -h - s * 0.26, s * 0.08, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  c.fillStyle = e.color; rr(c, -h, -h, s, s, s * 0.28); c.fill();
  c.fillStyle = 'rgba(255,255,255,.3)'; rr(c, -h + s * 0.1, -h + s * 0.08, s * 0.34, s * 0.13, s * 0.06); c.fill();
  c.fillStyle = shadeHex(e.color, 0.8); c.save(); rr(c, -h, -h, s, s, s * 0.28); c.clip(); c.fillRect(-h, h * 0.4, s, h); c.restore();
  rr(c, -h, -h, s, s, s * 0.28); c.stroke();
  const ey = -s * 0.07, exs = [-s * 0.19, s * 0.19];
  const white = (x, y, rx, ry) => { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); c.lineWidth = lw * 0.7; c.stroke(); c.lineWidth = lw; };
  const pupil = (x, y, rx, ry) => { c.fillStyle = INK; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x + rx * 0.35, y - ry * 0.35, rx * 0.35, 0, Math.PI * 2); c.fill(); };
  const arcEye = (x, up) => { c.beginPath(); c.arc(x, ey + (up ? s * 0.04 : -s * 0.02), s * 0.09, up ? Math.PI * 1.1 : 0.1 * Math.PI, up ? Math.PI * 1.9 : 0.9 * Math.PI); c.stroke(); };
  const brow = (x, tilt) => { c.beginPath(); c.moveTo(x - s * 0.11, ey - s * 0.17 - tilt * s * 0.05); c.lineTo(x + s * 0.11, ey - s * 0.17 + tilt * s * 0.05); c.stroke(); };
  for (const [i, x] of exs.entries()) {
    const side = i ? 1 : -1;
    switch (e.eyes) {
      case 'happy': arcEye(x, true); break;
      case 'closed': arcEye(x, false); break;
      case 'wink': if (i) arcEye(x, true); else { white(x, ey, s * 0.1, s * 0.13); pupil(x + s * 0.02, ey + s * 0.02, s * 0.05, s * 0.07); } break;
      case 'wide': white(x, ey, s * 0.13, s * 0.16); pupil(x, ey, s * 0.04, s * 0.05); break;
      case 'heart': c.fillStyle = '#e63946'; heart(c, x, ey + s * 0.02, s * 0.14); c.fill(); c.lineWidth = lw * 0.6; c.stroke(); c.lineWidth = lw; break;
      case 'star': c.fillStyle = '#ffd23f'; star(c, x, ey, s * 0.13); c.fill(); c.lineWidth = lw * 0.6; c.stroke(); c.lineWidth = lw; break;
      case 'x': c.beginPath(); c.moveTo(x - s * 0.08, ey - s * 0.08); c.lineTo(x + s * 0.08, ey + s * 0.08); c.moveTo(x + s * 0.08, ey - s * 0.08); c.lineTo(x - s * 0.08, ey + s * 0.08); c.stroke(); break;
      case 'spiral': c.beginPath(); for (let a = 0; a < Math.PI * 5; a += 0.3) { const r = a * s * 0.008; c.lineTo(x + Math.cos(a) * r, ey + Math.sin(a) * r); } c.lineWidth = lw * 0.7; c.stroke(); c.lineWidth = lw; break;
      case 'money': c.fillStyle = '#2a8a45'; c.font = `900 ${s * 0.3}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('$', x, ey + s * 0.01); break;
      case 'dot': c.fillStyle = '#7cff9e'; c.fillRect(x - s * 0.05, ey - s * 0.05, s * 0.1, s * 0.1); break;
      case 'alien': c.fillStyle = INK; c.beginPath(); c.ellipse(x, ey, s * 0.12, s * 0.08, side * 0.5, 0, Math.PI * 2); c.fill(); break;
      case 'half': white(x, ey, s * 0.1, s * 0.12); pupil(x, ey + s * 0.03, s * 0.05, s * 0.06); c.fillStyle = e.color; c.fillRect(x - s * 0.13, ey - s * 0.14, s * 0.26, s * 0.12); c.beginPath(); c.moveTo(x - s * 0.12, ey - s * 0.02); c.lineTo(x + s * 0.12, ey - s * 0.02); c.stroke(); break;
      case 'sus': white(x, ey, s * 0.1, s * 0.12); pupil(x + s * 0.05, ey + s * 0.02, s * 0.045, s * 0.06); c.fillStyle = e.color; c.fillRect(x - s * 0.13, ey - s * 0.14, s * 0.26, s * 0.1); c.beginPath(); c.moveTo(x - s * 0.12, ey - s * 0.04 - side * s * 0.02); c.lineTo(x + s * 0.12, ey - s * 0.04 + side * s * 0.02); c.stroke(); break;
      case 'side': white(x, ey, s * 0.1, s * 0.13); pupil(x + s * 0.05, ey - s * 0.03, s * 0.045, s * 0.065); break;
      case 'uneven': white(x, ey, s * (i ? 0.12 : 0.08), s * (i ? 0.15 : 0.1)); pupil(x, ey, s * 0.04, s * 0.055); break;
      case 'shades': break;
      default: white(x, ey, s * 0.1, s * 0.13); pupil(x + s * 0.015, ey + s * 0.02, s * 0.05, s * 0.07);
    }
    if (e.eyes === 'angry') brow(x, -side);
    if (e.eyes === 'sad') brow(x, side);
  }
  if (e.eyes === 'angry' || e.eyes === 'sad') for (const x of exs) { white(x, ey + s * 0.02, s * 0.09, s * 0.1); pupil(x, ey + s * 0.04, s * 0.045, s * 0.055); }
  if (e.eyes === 'shades') { c.fillStyle = INK; rr(c, -s * 0.34, ey - s * 0.09, s * 0.3, s * 0.17, s * 0.05); c.fill(); rr(c, s * 0.04, ey - s * 0.09, s * 0.3, s * 0.17, s * 0.05); c.fill(); c.fillRect(-s * 0.05, ey - s * 0.07, s * 0.1, s * 0.03); c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(-s * 0.3, ey - s * 0.06, s * 0.08, s * 0.03); c.fillRect(s * 0.08, ey - s * 0.06, s * 0.08, s * 0.03); }
  // cheeks
  c.fillStyle = e.extra === 'blush' ? 'rgba(255,60,110,.7)' : 'rgba(255,93,143,.45)';
  for (const x of [-s * 0.31, s * 0.31]) { c.beginPath(); c.ellipse(x, s * 0.1, s * (e.extra === 'blush' ? 0.09 : 0.06), s * 0.04, 0, 0, Math.PI * 2); c.fill(); }
  // mouth
  const my = s * 0.17; c.lineWidth = lw * 0.85;
  switch (e.mouth) {
    case 'grin': c.fillStyle = '#7a2340'; c.beginPath(); c.moveTo(-s * 0.13, my - s * 0.03); c.lineTo(s * 0.13, my - s * 0.03); c.arc(0, my - s * 0.03, s * 0.13, 0, Math.PI); c.closePath(); c.fill(); c.stroke(); break;
    case 'open': c.fillStyle = '#7a2340'; c.beginPath(); c.ellipse(0, my, s * 0.08, s * 0.07, 0, 0, Math.PI * 2); c.fill(); c.stroke(); break;
    case 'o': c.beginPath(); c.arc(0, my, s * 0.045, 0, Math.PI * 2); c.stroke(); break;
    case 'flat': c.beginPath(); c.moveTo(-s * 0.08, my); c.lineTo(s * 0.08, my); c.stroke(); break;
    case 'frown': c.beginPath(); c.arc(0, my + s * 0.07, s * 0.08, 1.2 * Math.PI, 1.8 * Math.PI); c.stroke(); break;
    case 'wavy': c.beginPath(); for (let k = 0; k <= 8; k++) { const x = -s * 0.12 + k * s * 0.03; c.lineTo(x, my + (k % 2 ? -1 : 1) * s * 0.02); } c.stroke(); break;
    case 'tongue': c.beginPath(); c.moveTo(-s * 0.09, my - s * 0.01); c.lineTo(s * 0.09, my - s * 0.01); c.stroke(); c.fillStyle = '#ff5d8f'; c.beginPath(); c.ellipse(s * 0.02, my + s * 0.05, s * 0.05, s * 0.06, 0, 0, Math.PI * 2); c.fill(); c.stroke(); break;
    case 'teeth': c.fillStyle = '#fff'; rr(c, -s * 0.12, my - s * 0.05, s * 0.24, s * 0.1, s * 0.03); c.fill(); c.stroke(); for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(k * s * 0.06, my - s * 0.05); c.lineTo(k * s * 0.06, my + s * 0.05); c.stroke(); } break;
    case 'smirk': c.beginPath(); c.moveTo(-s * 0.08, my); c.quadraticCurveTo(s * 0.04, my + s * 0.03, s * 0.1, my - s * 0.04); c.stroke(); break;
    case 'kiss': c.fillStyle = '#e63946'; heart(c, 0, my, s * 0.07); c.fill(); break;
    default: c.beginPath(); c.arc(0, my - s * 0.04, s * 0.09, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
  }
  c.lineWidth = lw;
  if (e.hat && e.hat !== 'none') { c.save(); c.translate(0, 0); drawHat(c, e.hat, s, 0, 0, lw); c.restore(); }
  // extras
  const drop = (x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(x, y - r * 1.6); c.quadraticCurveTo(x + r, y - r * 0.2, x, y + r); c.quadraticCurveTo(x - r, y - r * 0.2, x, y - r * 1.6); c.fill(); c.lineWidth = lw * 0.5; c.stroke(); c.lineWidth = lw; };
  const txt = (t, x, y, size, col) => { c.font = `900 ${size}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = lw * 0.9; c.strokeText(t, x, y); c.fillStyle = col; c.fillText(t, x, y); c.lineWidth = lw; };
  switch (e.extra) {
    case 'joy': drop(-s * 0.36, ey + s * 0.1, s * 0.06, '#7cc8ff'); drop(s * 0.36, ey + s * 0.1, s * 0.06, '#7cc8ff'); break;
    case 'tears': drop(-s * 0.2, ey + s * 0.16, s * 0.06, '#7cc8ff'); drop(s * 0.2, ey + s * 0.2, s * 0.06, '#7cc8ff'); break;
    case 'sweat': drop(s * 0.42, -h * 0.55, s * 0.08, '#7cc8ff'); break;
    case 'vein': c.strokeStyle = '#b5121b'; c.lineWidth = lw * 0.9; for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { c.beginPath(); c.moveTo(s * 0.33 + a * s * 0.03, -h * 0.62 + b * s * 0.03); c.quadraticCurveTo(s * 0.33 + a * s * 0.1, -h * 0.62 + b * s * 0.03, s * 0.33 + a * s * 0.1, -h * 0.62 + b * s * 0.1); c.stroke(); } c.strokeStyle = INK; c.lineWidth = lw; break;
    case 'fire': for (const [x, k] of [[-s * 0.25, 1], [0, 1.3], [s * 0.25, 1]]) { c.fillStyle = '#ff9f1c'; c.beginPath(); c.moveTo(x - s * 0.1 * k, -h); c.quadraticCurveTo(x, -h - s * 0.4 * k, x + s * 0.1 * k, -h); c.fill(); c.fillStyle = '#ffe66d'; c.beginPath(); c.moveTo(x - s * 0.05 * k, -h); c.quadraticCurveTo(x, -h - s * 0.2 * k, x + s * 0.05 * k, -h); c.fill(); } break;
    case 'zzz': txt('z', s * 0.35, -h * 0.8, s * 0.2, '#fff'); txt('Z', s * 0.5, -h * 1.1, s * 0.28, '#fff'); break;
    case 'snow': for (const [x, y] of [[-s * 0.45, -h * 0.9], [s * 0.45, -h * 0.7], [s * 0.3, -h * 1.1]]) txt('*', x, y, s * 0.3, '#fff'); break;
    case 'question': txt('?', s * 0.44, -h * 0.85, s * 0.4, '#ffd23f'); break;
    case 'exclaim': txt('!', s * 0.44, -h * 0.85, s * 0.42, '#ffd23f'); break;
    case 'bulb': c.fillStyle = '#ffe66d'; c.beginPath(); c.arc(s * 0.4, -h * 0.95, s * 0.13, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = '#a3abc2'; c.fillRect(s * 0.34, -h * 0.95 + s * 0.12, s * 0.12, s * 0.07); break;
    case 'heart': c.fillStyle = '#e63946'; heart(c, s * 0.42, -h * 0.75, s * 0.14); c.fill(); c.lineWidth = lw * 0.6; c.stroke(); c.lineWidth = lw; break;
    case 'hearts': for (const [x, y, k] of [[-s * 0.45, -h * 0.8, 0.11], [s * 0.45, -h * 0.9, 0.14], [s * 0.2, -h * 1.25, 0.09]]) { c.fillStyle = '#e63946'; heart(c, x, y, s * k); c.fill(); c.lineWidth = lw * 0.5; c.stroke(); c.lineWidth = lw; } break;
    case 'sparkle': for (const [x, y, r] of [[-s * 0.45, -h * 0.7, 0.09], [s * 0.46, -h * 0.5, 0.11], [s * 0.3, -h * 1.15, 0.07]]) { c.fillStyle = '#ffe66d'; star(c, x, y, s * r, 4, 0.35); c.fill(); } break;
    case 'confetti': ['#ffd23f', '#3a86ff', '#44c06a', '#b06cff', '#ff5d8f'].forEach((col, k) => { c.fillStyle = col; c.save(); c.translate(-s * 0.5 + k * s * 0.25, -h * 1.05 + (k % 2) * s * 0.12); c.rotate(k); c.fillRect(-s * 0.04, -s * 0.02, s * 0.08, s * 0.04); c.restore(); }); break;
    case 'check': c.strokeStyle = '#2a8a45'; c.lineWidth = lw * 1.6; c.beginPath(); c.moveTo(s * 0.28, -h * 0.85); c.lineTo(s * 0.38, -h * 0.72); c.lineTo(s * 0.56, -h * 1.05); c.stroke(); c.strokeStyle = INK; c.lineWidth = lw; break;
    case 'cross': c.strokeStyle = '#fff'; c.lineWidth = lw * 1.6; c.beginPath(); c.moveTo(s * 0.3, -h * 1.05); c.lineTo(s * 0.52, -h * 0.75); c.moveTo(s * 0.52, -h * 1.05); c.lineTo(s * 0.3, -h * 0.75); c.stroke(); c.strokeStyle = INK; c.lineWidth = lw; break;
    case 'gg': txt('GG', s * 0.34, -h * 0.95, s * 0.3, '#ffd23f'); break;
    case 'notes': txt('♪', -s * 0.46, -h * 0.8, s * 0.3, '#fff'); txt('♫', s * 0.48, -h * 1.0, s * 0.3, '#fff'); break;
    case 'wave': c.fillStyle = e.color; c.save(); c.translate(s * 0.55, -h * 0.35); c.rotate(-0.5); rr(c, -s * 0.07, -s * 0.2, s * 0.14, s * 0.32, s * 0.06); c.fill(); c.stroke(); c.restore(); c.beginPath(); c.arc(s * 0.62, -h * 0.72, s * 0.12, -1, -0.2); c.stroke(); break;
  }
  c.restore();
}

// A picture of one emoji (cached as an image URL).
const cache = new Map();
export function emojiURL(name, px = 64) {
  const key = name + px;
  if (cache.has(key)) return cache.get(key);
  const e = BY_NAME.get(name);
  if (!e) return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const c = cv.getContext('2d');
  c.translate(px / 2, px / 2 + px * 0.04);
  drawEmoji(c, e, px * 0.56);
  const url = cv.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
export const isEmoji = (name) => BY_NAME.has(name);
export const emojiImg = (name, size = 22) => {
  const img = document.createElement('img');
  img.className = 'pip-emoji'; img.src = emojiURL(name, 64); img.alt = `:${name}:`; img.title = `:${name}:`; img.width = img.height = size; img.draggable = false;
  return img;
};
// Text with :name: codes -> text and pictures. A message that is only emojis shows them bigger.
export function emojiNodes(text, size = 22) {
  const parts = String(text).split(/(:[a-z]+:)/g).filter((p) => p !== '');
  const only = parts.every((p) => /^:[a-z]+:$/.test(p) && isEmoji(p.slice(1, -1)) || !p.trim());
  return parts.map((p) => { const m = /^:([a-z]+):$/.exec(p); return m && isEmoji(m[1]) ? emojiImg(m[1], only && parts.length <= 3 ? size * 1.8 : size) : document.createTextNode(p); });
}
// The Pip button: opens a grid of every emoji; picking one calls onPick(':name:')
export function emojiButton(onPick, { up = true } = {}) {
  const wrap = document.createElement('span'); wrap.className = 'emoji-wrap';
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn emoji-btn'; btn.title = 'Pip emojis'; btn.setAttribute('aria-label', 'Pip emojis');
  btn.append(emojiImg('happy', 22));
  const pop = document.createElement('div'); pop.className = 'emoji-pop' + (up ? ' up' : ''); pop.hidden = true; pop.setAttribute('role', 'dialog');
  wrap.append(btn, pop);
  let built = false;
  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (!built) {
      built = true;
      for (const e of PIP_EMOJIS) {
        const b = document.createElement('button'); b.type = 'button'; b.title = `:${e.name}:`; b.append(emojiImg(e.name, 30));
        b.addEventListener('click', (x) => { x.preventDefault(); onPick(`:${e.name}:`); pop.hidden = true; import('./audio.js').then((a) => a.sfx('pop')).catch(() => {}); });
        pop.append(b);
      }
    }
    pop.hidden = !pop.hidden;
    if (!pop.hidden) import('./audio.js').then((a) => a.sfx('open')).catch(() => {});
  });
  document.addEventListener('pointerdown', (ev) => { if (!wrap.contains(ev.target)) pop.hidden = true; });
  return wrap;
}
