// Drawing for the 2D engine: backgrounds, tiles, player forms, enemies.
import { T } from './engine2d.js';
import { FORM_INFO } from './format.js';
import { drawPip, drawForm } from './art.js';

export const INK = '#1d2340';

export const THEMES = {
  meadow:  { sky: ['#7cc8ff', '#d6efff'], dirt: '#b27a45', dot: '#935f32', top: '#44c06a', topDark: '#2a8a45', hill: '#a9e4a6', hill2: '#8fd48d', deco: 'clouds', edit: '#a8dcff' },
  dunes:   { sky: ['#ffb86b', '#ffe6b8'], dirt: '#d9a55b', dot: '#bf8a42', top: '#f6d98a', topDark: '#c9a24c', hill: '#f2c887', hill2: '#e7b36c', deco: 'sun', edit: '#ffd9a8' },
  frost:   { sky: ['#9fd8ff', '#f0faff'], dirt: '#6f8fb8', dot: '#5b779c', top: '#f4fbff', topDark: '#b9d4ec', hill: '#d6ecfb', hill2: '#c0e0f6', deco: 'snow', edit: '#cdebff' },
  night:   { sky: ['#171b44', '#3d2f70'], dirt: '#3a3f7a', dot: '#2e3264', top: '#8a6bff', topDark: '#5a3fd6', hill: '#262a60', hill2: '#1f2252', deco: 'stars', edit: '#2b2f66' },
  volcano: { sky: ['#2c1422', '#8a3b2e'], dirt: '#4a3a3a', dot: '#3a2c2c', top: '#ff7a3d', topDark: '#c24a1d', hill: '#4a2226', hill2: '#3a1a1e', deco: 'embers', edit: '#5a2c30' },
};

export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------------- background ---------------- */
// Seeded "random" so stars and clouds stay put.
const hash = (n) => { n = (n << 13) ^ n; return ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 0x7fffffff; };

export function drawBackground(ctx, themeName, camX, camY, VW, VH, t) {
  const th = THEMES[themeName] || THEMES.meadow;
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  if (th.deco === 'stars') {
    for (let i = 0; i < 70; i++) {
      const x = ((hash(i) * 2400 - camX * 0.05) % 2400 + 2400) % 2400 * (VW / 800);
      const y = hash(i + 99) * VH * 0.8;
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + i);
      ctx.fillStyle = `rgba(255,255,255,${0.35 + tw * 0.55})`;
      ctx.fillRect(Math.round(x) % VW, Math.round(y), 2, 2);
    }
    ctx.fillStyle = '#fff6c9'; ctx.beginPath(); ctx.arc(VW - 110, 80, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = th.sky[0]; ctx.beginPath(); ctx.arc(VW - 98, 72, 26, 0, Math.PI * 2); ctx.fill();
  } else if (th.deco === 'sun') {
    ctx.fillStyle = 'rgba(255,245,200,.9)'; ctx.beginPath(); ctx.arc(VW - 140, 90, 44, 0, Math.PI * 2); ctx.fill();
  } else if (th.deco === 'embers') {
    for (let i = 0; i < 26; i++) {
      const y = VH - ((t * (20 + hash(i) * 30) + hash(i + 7) * VH) % VH);
      const x = ((hash(i + 3) * VW - camX * 0.2) % VW + VW) % VW + Math.sin(t + i) * 8;
      ctx.fillStyle = `rgba(255,${120 + (i % 5) * 20},60,${0.3 + hash(i + 1) * 0.5})`;
      ctx.fillRect(x, y, 3, 3);
    }
  } else {
    ctx.fillStyle = th.deco === 'snow' ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.9)';
    const co = -(camX * 0.15) % 260;
    for (let i = -1; i < VW / 260 + 2; i++) {
      const x = co + i * 260, y = 50 + (((i % 2) + 2) % 2) * 34;
      rr(ctx, x, y, 90, 26, 13); ctx.fill(); rr(ctx, x + 22, y - 14, 46, 26, 13); ctx.fill();
    }
    if (th.deco === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      for (let i = 0; i < 40; i++) {
        const y = ((t * (18 + hash(i) * 20) + hash(i + 5) * VH) % VH);
        const x = ((hash(i + 2) * VW - camX * 0.3 + Math.sin(t + i) * 10) % VW + VW) % VW;
        ctx.fillRect(x, y, 3, 3);
      }
    }
  }
  const hillY = VH + 40 - Math.max(-60, Math.min(60, camY * 0.1));
  ctx.fillStyle = th.hill2;
  const ho2 = -(camX * 0.2) % 300;
  for (let i = -1; i < VW / 300 + 2; i++) { ctx.beginPath(); ctx.arc(ho2 + i * 300 + 150, hillY + 20, 190, Math.PI, 0); ctx.fill(); }
  ctx.fillStyle = th.hill;
  const ho = -(camX * 0.35) % 220;
  for (let i = -1; i < VW / 220 + 2; i++) { ctx.beginPath(); ctx.arc(ho + i * 220 + 110, hillY, 150, Math.PI, 0); ctx.fill(); }
}

/* ---------------- tiles ---------------- */
const PORTAL_COLORS = { u: '#3a86ff', n: '#3a86ff', '<': '#ff9f1c', '~': '#35d0ff', '>': '#44c06a', '*': '#ff5d8f', m: '#ff5d8f', q: '#44c06a' };
for (const f in FORM_INFO) PORTAL_COLORS[FORM_INFO[f].tile] = FORM_INFO[f].color;
const FORM_OF = {};
for (const f in FORM_INFO) FORM_OF[FORM_INFO[f].tile] = f;
const SOLIDISH = new Set(['#', 'X', 'I', 'C', 'D', 'B']);

// n = neighbor lookup (dx, dy) -> tile char. mode: 'game' | 'editor' | 'icon'
export function drawTile(ctx, c, x, y, n, t, theme, mode = 'game', extra = {}) {
  const th = THEMES[theme] || THEMES.meadow;
  ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
  switch (c) {
    case '#': {
      ctx.fillStyle = th.dirt; ctx.fillRect(x, y, T, T);
      ctx.fillStyle = th.dot; ctx.fillRect(x + 6, y + 15, 4, 4); ctx.fillRect(x + 21, y + 23, 4, 4); ctx.fillRect(x + 15, y + 27, 3, 3);
      if (!SOLIDISH.has(n(0, -1))) {
        ctx.fillStyle = th.top; ctx.fillRect(x, y, T, 9);
        ctx.fillStyle = th.topDark; ctx.fillRect(x, y + 9, T, 3);
        if (theme === 'meadow') { ctx.fillStyle = th.top; ctx.fillRect(x + 4, y + 11, 4, 3); ctx.fillRect(x + 19, y + 11, 5, 4); }
      }
      ctx.strokeStyle = 'rgba(29,35,64,.25)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
      break;
    }
    case 'X': {
      const night = theme === 'night' || theme === 'volcano';
      ctx.fillStyle = night ? '#6e7596' : '#9aa3bc'; ctx.fillRect(x, y, T, T);
      ctx.fillStyle = night ? '#8a91b3' : '#c3c9da'; ctx.fillRect(x, y, T, 4); ctx.fillRect(x, y, 4, T);
      ctx.fillStyle = night ? '#4f5574' : '#747c98'; ctx.fillRect(x, y + T - 4, T, 4); ctx.fillRect(x + T - 4, y, 4, T);
      ctx.strokeStyle = 'rgba(29,35,64,.45)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
      break;
    }
    case 'I': {
      ctx.fillStyle = '#bfefff'; ctx.fillRect(x, y, T, T);
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 6, y + 20); ctx.lineTo(x + 18, y + 8); ctx.moveTo(x + 14, y + 26); ctx.lineTo(x + 24, y + 16); ctx.stroke();
      ctx.strokeStyle = '#5aa9d6'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
      break;
    }
    case '=': {
      ctx.fillStyle = '#c98a4b'; rr(ctx, x, y + 1, T, 11, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#a86d35'; ctx.fillRect(x + 10, y + 4, 2, 6); ctx.fillRect(x + 22, y + 4, 2, 6);
      break;
    }
    case 'C': {
      const s = extra.shake ? (Math.sin(t * 60) * 2) : 0;
      ctx.save(); ctx.translate(s, 0);
      ctx.fillStyle = '#dcb47a'; ctx.fillRect(x, y, T, T);
      ctx.strokeStyle = '#8a6235'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 8, y); ctx.lineTo(x + 13, y + 12); ctx.lineTo(x + 9, y + 20); ctx.moveTo(x + 13, y + 12); ctx.lineTo(x + 24, y + 16); ctx.lineTo(x + 26, y + T); ctx.stroke();
      ctx.strokeStyle = 'rgba(29,35,64,.4)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
      ctx.restore();
      break;
    }
    case 'D': {
      ctx.fillStyle = '#7a5230'; ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#8f6440'; ctx.fillRect(x + 3, y + 2, 11, T - 4); ctx.fillRect(x + 18, y + 2, 11, T - 4);
      if (n(0, -1) !== 'D') { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x + 16, y + 12, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = INK; ctx.fillRect(x + 15, y + 12, 2, 6); }
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.75, y + 0.75, T - 1.5, T - 1.5);
      break;
    }
    case '^': case 'v': {
      const up = c === '^';
      ctx.fillStyle = theme === 'night' || theme === 'volcano' ? '#f1f3ff' : '#e4eaf7';
      ctx.beginPath();
      if (up) { ctx.moveTo(x + 3, y + T); ctx.lineTo(x + 16, y + 5); ctx.lineTo(x + 29, y + T); }
      else { ctx.moveTo(x + 3, y); ctx.lineTo(x + 16, y + T - 5); ctx.lineTo(x + 29, y); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(29,35,64,.18)'; ctx.beginPath();
      if (up) { ctx.moveTo(x + 16, y + 5); ctx.lineTo(x + 29, y + T); ctx.lineTo(x + 18, y + T); } else { ctx.moveTo(x + 16, y + T - 5); ctx.lineTo(x + 29, y); ctx.lineTo(x + 18, y); }
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'L': {
      const top = n(0, -1) === 'L' ? 0 : 9;
      ctx.fillStyle = '#ff5a1f'; ctx.fillRect(x, y + top, T, T - top);
      ctx.fillStyle = '#ffb02e';
      if (top) {
        ctx.beginPath(); ctx.moveTo(x, y + top + 3);
        for (let i = 0; i <= 8; i++) ctx.lineTo(x + i * 4, y + top + Math.sin(t * 4 + (x + i * 4) * 0.2) * 2);
        ctx.lineTo(x + T, y + top + 6); ctx.lineTo(x, y + top + 6); ctx.closePath(); ctx.fill();
      }
      const b = (t * 0.7 + x * 0.013) % 1;
      ctx.fillStyle = 'rgba(255,220,120,.8)'; ctx.beginPath(); ctx.arc(x + 10 + (x % 12), y + T - b * (T - top), 2.5, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'o': {
      const bob = mode === 'game' ? Math.sin(t * 4 + x * 0.05) * 3 : 0;
      const spin = mode === 'game' ? Math.abs(Math.cos(t * 2.5 + x * 0.03)) : 1;
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.ellipse(x + 16, y + 16 + bob, 2 + 8 * spin, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff3b0'; ctx.fillRect(x + 14, y + 10 + bob, 3, 8);
      break;
    }
    case 'k': {
      const bob = mode === 'game' ? Math.sin(t * 3 + x) * 2 : 0;
      ctx.save(); ctx.translate(x + 16, y + 16 + bob); ctx.rotate(-0.5);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(-6, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      rr(ctx, -1, -2.5, 15, 5, 2); ctx.fill(); ctx.stroke();
      ctx.fillRect(8, 1, 3, 5); ctx.strokeRect(8, 1, 3, 5);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-6, 0, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      break;
    }
    case 'B': {
      ctx.fillStyle = '#6b3d8f'; ctx.fillRect(x + 4, y + 18, T - 8, 14); ctx.strokeRect(x + 4, y + 18, T - 8, 14);
      ctx.fillStyle = '#ff5d8f'; rr(ctx, x + 1, y + 10, T - 2, 10, 5); ctx.fill(); ctx.stroke();
      break;
    }
    case 'y': case 'r': {
      const pulse = mode === 'game' ? 1 + Math.sin(t * 6) * 0.08 : 1;
      ctx.save(); ctx.translate(x + 16, y + 16); ctx.scale(pulse, pulse);
      ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = c === 'y' ? '#ffd23f' : '#3a86ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.stroke();
      if (c === 'r') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(0, -4); ctx.lineTo(4, 2); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      break;
    }
    case 'M': {
      drawPlatform(ctx, x, y + 2, T);
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.moveTo(x + 3, y + 25); ctx.lineTo(x + 10, y + 20); ctx.lineTo(x + 10, y + 30); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 29, y + 25); ctx.lineTo(x + 22, y + 20); ctx.lineTo(x + 22, y + 30); ctx.closePath(); ctx.fill();
      ctx.fillRect(x + 10, y + 24, 12, 2);
      break;
    }
    case 'E': drawWalker(ctx, { x: x + 3, y: y + 8, w: 26, h: 24, vx: -1 }, 0); break;
    case 'P': {
      const on = extra.active;
      // a column of checkpoints draws as one tall pole with a flag on top
      if (n(0, -1) === 'P') { ctx.fillStyle = on ? 'rgba(68,192,106,.18)' : 'rgba(255,255,255,.12)'; ctx.fillRect(x + 2, y, T - 4, T); ctx.fillStyle = '#fff'; ctx.fillRect(x + 7, y - 1, 4, T + 2); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 7, y); ctx.lineTo(x + 7, y + T); ctx.moveTo(x + 11, y); ctx.lineTo(x + 11, y + T); ctx.stroke(); break; }
      if (n(0, 1) === 'P') { ctx.fillStyle = on ? 'rgba(68,192,106,.18)' : 'rgba(255,255,255,.12)'; ctx.fillRect(x + 2, y + 3, T - 4, T - 3); }
      ctx.fillStyle = '#fff'; ctx.fillRect(x + 7, y + 3, 4, T - 3); ctx.strokeRect(x + 7, y + 3, 4, T - 3);
      ctx.fillStyle = on ? '#44c06a' : '#b8bfd6';
      const wave = mode === 'game' && on ? Math.sin(t * 6) * 2 : 0;
      ctx.beginPath(); ctx.moveTo(x + 11, y + 4); ctx.lineTo(x + 27, y + 8 + wave); ctx.lineTo(x + 11, y + 14); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'G': {
      const wave = mode === 'game' ? Math.sin(t * 6) * 3 : 0;
      if (n(0, -1) === 'G') {
        // tall finish lines just draw a checkered strip
        drawChecker(ctx, x + 10, y, 12, T);
        break;
      }
      if (n(0, 1) === 'G') { drawChecker(ctx, x + 10, y + 12, 12, T - 12); }
      ctx.fillStyle = '#fff'; ctx.fillRect(x + 7, y + 2, 4, T - 4); ctx.strokeRect(x + 7, y + 2, 4, T - 4);
      ctx.fillStyle = '#ff5d8f'; ctx.beginPath(); ctx.moveTo(x + 11, y + 3); ctx.lineTo(x + 29, y + 9 + wave); ctx.lineTo(x + 11, y + 16); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (n(0, 1) !== 'G') { ctx.fillStyle = '#44c06a'; ctx.fillRect(x + 3, y + T - 5, 12, 5); }
      break;
    }
    case 'S': {
      if (mode === 'game') break;
      ctx.save(); ctx.translate(x + 16, y + 17); drawPip(ctx, 20, '#ff6b35', { t: 1, look: 1 }); ctx.restore();
      break;
    }
    case '.': {
      if (mode !== 'icon') break;
      ctx.strokeStyle = '#d33'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x + 8, y + 8); ctx.lineTo(x + 24, y + 24); ctx.moveTo(x + 24, y + 8); ctx.lineTo(x + 8, y + 24); ctx.stroke();
      break;
    }
    default: {
      if (PORTAL_COLORS[c]) drawPortal(ctx, c, x, y, n, t, mode);
    }
  }
}

function drawChecker(ctx, x, y, w, h) {
  const s = 6;
  for (let j = 0; j * s < h; j++) for (let i = 0; i * s < w; i++) {
    ctx.fillStyle = (i + j) % 2 ? '#1d2340' : '#ffffff';
    ctx.fillRect(x + i * s, y + j * s, s, Math.min(s, h - j * s));
  }
  ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawPortal(ctx, c, x, y, n, t, mode) {
  const color = PORTAL_COLORS[c];
  const topEnd = n(0, -1) !== c, botEnd = n(0, 1) !== c;
  const glow = mode === 'game' ? 0.25 + 0.15 * Math.sin(t * 5 + y * 0.05) : 0.3;
  ctx.save();
  ctx.globalAlpha = glow; ctx.fillStyle = color;
  ctx.fillRect(x + 4, y + (topEnd ? 6 : 0), T - 8, T - (topEnd ? 6 : 0) - (botEnd ? 6 : 0));
  ctx.globalAlpha = 1;
  ctx.strokeStyle = INK; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(x + 6, y + (topEnd ? 8 : 0)); ctx.lineTo(x + 6, y + T - (botEnd ? 8 : 0));
  ctx.moveTo(x + 26, y + (topEnd ? 8 : 0)); ctx.lineTo(x + 26, y + T - (botEnd ? 8 : 0)); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
  if (topEnd) { ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x + 16, y + 10, 10, Math.PI, 0); ctx.stroke(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke(); }
  if (botEnd) { ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x + 16, y + T - 10, 10, 0, Math.PI); ctx.stroke(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke(); }
  // icon on the top tile of each portal
  if (topEnd || mode === 'icon') {
    ctx.translate(x + 16, y + 17);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    if (FORM_OF[c]) { drawFormIcon(ctx, FORM_OF[c], 11, color); }
    else if (c === 'u' || c === 'n') {
      ctx.beginPath();
      if (c === 'u') { ctx.moveTo(-6, 3); ctx.lineTo(0, -6); ctx.lineTo(6, 3); } else { ctx.moveTo(-6, -3); ctx.lineTo(0, 6); ctx.lineTo(6, -3); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (c === 'm' || c === 'q') {
      const r = c === 'm' ? 3.5 : 6.5; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else {
      const k = { '<': 1, '~': 1, '>': 2, '*': 3 }[c], dirn = c === '<' ? -1 : 1;
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff';
      for (let i = 0; i < k; i++) { const ox = (i - (k - 1) / 2) * 5 * dirn; ctx.beginPath(); ctx.moveTo(ox - 2 * dirn, -5); ctx.lineTo(ox + 3 * dirn, 0); ctx.lineTo(ox - 2 * dirn, 5); ctx.stroke(); }
    }
  }
  ctx.restore();
}

// A tiny version of each rush form, used on portals and in the editor.
function drawFormIcon(ctx, form, s, color) {
  ctx.fillStyle = color === '#f4f4f4' ? '#fff' : color;
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  const h = s / 2;
  switch (form) {
    case 'roller': ctx.beginPath(); ctx.arc(0, 0, h, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
    case 'dart': ctx.beginPath(); ctx.moveTo(-h, -h); ctx.lineTo(h, 0); ctx.lineTo(-h, h); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case 'flapper': ctx.beginPath(); ctx.arc(0, 0, h * 0.7, Math.PI, 0); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0, 1, h, h * 0.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
    case 'jet': ctx.beginPath(); ctx.moveTo(-h, 0); ctx.lineTo(h, -h * 0.4); ctx.lineTo(h, h * 0.6); ctx.lineTo(-h, h * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case 'glider': ctx.fillRect(-h * 0.6, -h * 0.6, h * 1.2, h * 1.2); ctx.strokeRect(-h * 0.6, -h * 0.6, h * 1.2, h * 1.2); ctx.beginPath(); ctx.moveTo(-h, -h); ctx.lineTo(0, -h * 0.4); ctx.lineTo(h, -h); ctx.stroke(); break;
    default: ctx.fillRect(-h, -h, s, s); ctx.strokeRect(-h, -h, s, s);
  }
}

export function drawPlatform(ctx, x, y, w) {
  ctx.lineWidth = 2; ctx.strokeStyle = INK;
  ctx.fillStyle = '#c98a4b'; rr(ctx, x, y, w, 14, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ff5d8f'; ctx.fillRect(x + 3, y + 4, 6, 6); ctx.fillRect(x + w - 9, y + 4, 6, 6);
}

export function drawWalker(ctx, e, t) {
  const step = Math.sin(t * 12) * 2;
  const x = e.x, y = e.y, w = e.w, h = e.h;
  ctx.lineWidth = 2; ctx.strokeStyle = INK;
  ctx.fillStyle = '#4a2c6b'; ctx.fillRect(x + 3, y + h - 5 + step * 0.5, 7, 5); ctx.fillRect(x + w - 10, y + h - 5 - step * 0.5, 7, 5);
  ctx.fillStyle = '#8a4fd6'; rr(ctx, x, y, w, h - 3, 8); ctx.fill(); ctx.stroke();
  const d = e.vx < 0 ? -2 : 2;
  ctx.fillStyle = '#fff'; ctx.fillRect(x + 6 + d, y + 6, 6, 7); ctx.fillRect(x + 14 + d, y + 6, 6, 7);
  ctx.fillStyle = INK; ctx.fillRect(x + 8 + d, y + 8, 3, 5); ctx.fillRect(x + 16 + d, y + 8, 3, 5);
  ctx.fillRect(x + 5 + d, y + 4, 8, 2); ctx.fillRect(x + 14 + d, y + 4, 8, 2);
}

/* ---------------- player (Pip, see art.js) ---------------- */
// fx = { land: 0..1 squash after landing }
export function drawPlayer(ctx, p, color, t, rush, fx = {}) {
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy));
  if (p.grav === -1) ctx.scale(1, -1);
  const air = !p.onGround;
  if (!rush) {
    const land = fx.land || 0;
    const up = p.vy * p.grav < -80 ? Math.min(0.14, -p.vy * p.grav / 5000) : 0;
    const sy = 1 + up - land * 0.22, sx = 1 - up * 0.8 + land * 0.2;
    const size = p.h * 0.84;
    ctx.translate(0, p.h / 2 - (size / 2 * sy + size * 0.14));
    drawPip(ctx, size, color, { t, look: p.face, run: Math.min(1, Math.abs(p.vx) / 200), air, mouth: air ? 'open' : 'smile', sx, sy, hat: fx.hat });
    ctx.restore();
    return;
  }
  // feet sit at the bottom of the hitbox for the upright forms
  ctx.rotate(p.grav === -1 ? -p.rot : p.rot);
  drawForm(ctx, p.form, p.w, color, { t, look: 1, run: 1, air, hat: fx.hat });
  ctx.restore();
}

/* ---------------- whole-level draw (game + thumbnails) ---------------- */
export function drawMap(ctx, map, w, h, x0, x1, y0, y1, t, theme, mode, extras) {
  const at = (tx, ty) => (tx < 0 || tx >= w || ty < 0 || ty >= h) ? (ty >= h ? '#' : '.') : map[ty * w + tx];
  for (let ty = Math.max(0, y0); ty <= Math.min(h - 1, y1); ty++) {
    for (let tx = Math.max(0, x0); tx <= Math.min(w - 1, x1); tx++) {
      const c = map[ty * w + tx];
      if (c === '.') continue;
      const i = ty * w + tx;
      drawTile(ctx, c, tx * T, ty * T, (dx, dy) => at(tx + dx, ty + dy), t, theme, mode, extras ? extras(i) : undefined);
    }
  }
}

const THUMB = { '#': null, X: '#9aa3bc', I: '#bfefff', '=': '#c98a4b', C: '#dcb47a', D: '#7a5230', '^': '#e4eaf7', v: '#e4eaf7', L: '#ff5a1f', o: '#ffd23f', k: '#ffd23f', B: '#ff5d8f', y: '#ffd23f', r: '#3a86ff', M: '#c98a4b', E: '#8a4fd6', P: '#ffffff', S: '#ff6b35', G: '#ff5d8f' };
export function drawThumb(cv, lv, s = 4, maxW = 0) {
  const w = maxW ? Math.min(lv.w, maxW) : lv.w;
  cv.width = w * s; cv.height = lv.h * s;
  const ctx = cv.getContext('2d');
  const th = THEMES[lv.theme] || THEMES.meadow;
  const g = ctx.createLinearGradient(0, 0, 0, cv.height);
  g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < lv.h; y++) for (let x = 0; x < w; x++) {
    const c = lv.d[y * lv.w + x];
    if (c === '.') continue;
    let col = THUMB[c];
    if (c === '#') col = SOLIDISH.has(y > 0 ? lv.d[(y - 1) * lv.w + x] : '.') ? th.dirt : th.top;
    if (!col) col = PORTAL_COLORS[c] || '#fff';
    ctx.fillStyle = col; ctx.fillRect(x * s, y * s, s, s);
  }
}

// Start of a level, for thumbnails: show a window around the start block.
export function thumbWindow(lv, cols) {
  if (lv.w <= cols) return lv;
  const si = lv.d.indexOf('S');
  const sx = si < 0 ? 0 : si % lv.w;
  const x0 = Math.max(0, Math.min(lv.w - cols, sx - 3));
  let d = '';
  for (let y = 0; y < lv.h; y++) d += lv.d.slice(y * lv.w + x0, y * lv.w + x0 + cols);
  return { ...lv, w: cols, d };
}
