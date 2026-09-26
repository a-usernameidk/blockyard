// Hand-drawn art for Blockyard: Pip the mascot, its forms, and UI icons.
// Everything is drawn with canvas paths, no images or emoji.

export const INK = '#1d2340';
const BULB = '#ffd23f';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/* ---------------- Pip ----------------
   Drawn centered on (0, 0), body is s wide.
   st: { t, look (-1..1), run (0..1), air, mouth ('smile'|'open'|'o'), feet (bool), sx, sy (squash) } */
export function drawPip(ctx, s, color, st = {}) {
  const t = st.t || 0, look = st.look ?? 1, run = st.run || 0;
  const sx = st.sx || 1, sy = st.sy || 1;
  const lw = Math.max(1.5, s / 10);
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = lw;
  const h = s * 0.5;
  // feet
  if (st.feet !== false) {
    const step = run > 0.05 && !st.air ? Math.sin(t * 22) * s * 0.12 * run : 0;
    const fy = h * sy - s * 0.02;
    ctx.fillStyle = INK;
    for (const [fx, d] of [[-0.28, 1], [0.28, -1]]) {
      const ox = fx * s + step * d, oy = st.air ? -s * 0.04 : Math.max(0, -step * d) * -0.6;
      rr(ctx, ox - s * 0.14, fy + oy, s * 0.28, s * 0.16, s * 0.07); ctx.fill();
    }
  }
  ctx.scale(sx, sy);
  // antenna with a glowing bulb, Pip's signature (hidden under hats)
  const hat = st.hat && st.hat !== 'none' ? st.hat : null;
  const sway = Math.sin(t * 5) * 0.12 - look * 0.1 * run;
  if (!hat) {
  ctx.save();
  ctx.translate(-h * 0.2, -h);
  ctx.rotate(sway);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 0.06, -s * 0.2, 0, -s * 0.32); ctx.stroke();
  ctx.fillStyle = BULB; ctx.beginPath(); ctx.arc(0, -s * 0.36, s * 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
  }
  // body
  ctx.fillStyle = color; rr(ctx, -h, -h, s, s, s * 0.28); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.28)'; rr(ctx, -h + s * 0.1, -h + s * 0.08, s * 0.34, s * 0.14, s * 0.07); ctx.fill();
  ctx.fillStyle = shade(color, 0.78); ctx.beginPath(); ctx.moveTo(-h, h * 0.35); ctx.lineTo(h, h * 0.35); ctx.lineTo(h, h - s * 0.2);
  ctx.arcTo(h, h, h - s * 0.28, h, s * 0.28); ctx.lineTo(-h + s * 0.28, h); ctx.arcTo(-h, h, -h, h - s * 0.28, s * 0.28); ctx.closePath(); ctx.fill();
  rr(ctx, -h, -h, s, s, s * 0.28); ctx.stroke();
  // face
  const blink = (t % 3.3) < 0.11;
  const ex = look * s * 0.08;
  for (const side of [-1, 1]) {
    const cx = ex + side * s * 0.17, cy = -s * 0.08;
    if (blink) { ctx.beginPath(); ctx.moveTo(cx - s * 0.08, cy); ctx.lineTo(cx + s * 0.08, cy); ctx.stroke(); continue; }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.11, s * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = lw * 0.7; ctx.stroke(); ctx.lineWidth = lw;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(cx + look * s * 0.035, cy + s * 0.02, s * 0.055, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + look * s * 0.035 + s * 0.02, cy - s * 0.02, s * 0.02, 0, Math.PI * 2); ctx.fill();
  }
  // cheeks
  ctx.fillStyle = 'rgba(255,93,143,.45)';
  ctx.beginPath(); ctx.ellipse(ex - s * 0.3, s * 0.1, s * 0.06, s * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(ex + s * 0.3, s * 0.1, s * 0.06, s * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  if (hat) drawHat(ctx, hat, s, t, look, lw);
  // mouth
  ctx.lineWidth = lw * 0.8;
  const mx = ex, my = s * 0.14;
  if (st.mouth === 'open') { ctx.fillStyle = '#7a2340'; ctx.beginPath(); ctx.ellipse(mx, my + s * 0.02, s * 0.07, s * 0.06, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  else if (st.mouth === 'o') { ctx.beginPath(); ctx.arc(mx, my + s * 0.02, s * 0.035, 0, Math.PI * 2); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(mx, my - s * 0.03, s * 0.08, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
  ctx.restore();
}

/* ---------------- hats ---------------- */
// Drawn on Pip's head. s = body size, the head top is at y = -s/2.
export function drawHat(ctx, hat, s, t = 0, look = 1, lw = 2) {
  const h = s / 2, top = -h;
  ctx.save();
  ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const fill = (c) => { ctx.fillStyle = c; ctx.fill(); ctx.stroke(); };
  switch (hat) {
    case 'cap':
      ctx.beginPath(); ctx.moveTo(-h * 0.85, top + s * 0.08); ctx.quadraticCurveTo(0, top - s * 0.42, h * 0.85, top + s * 0.08); ctx.closePath(); fill('#3a86ff');
      ctx.beginPath(); ctx.ellipse(look * h * 0.75, top + s * 0.07, h * 0.55, s * 0.07, 0, 0, Math.PI * 2); fill('#2a64c8');
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, top - s * 0.14, s * 0.05, 0, Math.PI * 2); ctx.fill();
      break;
    case 'bow':
      ctx.translate(-h * 0.35, top + s * 0.02); ctx.rotate(-0.3);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s * 0.3, -s * 0.18); ctx.lineTo(-s * 0.3, s * 0.16); ctx.closePath(); fill('#ff5d8f');
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.3, -s * 0.18); ctx.lineTo(s * 0.3, s * 0.16); ctx.closePath(); fill('#ff5d8f');
      ctx.beginPath(); ctx.arc(0, 0, s * 0.08, 0, Math.PI * 2); fill('#ffd23f');
      break;
    case 'sprout':
      ctx.lineWidth = lw * 1.2; ctx.strokeStyle = '#2a8a45';
      ctx.beginPath(); ctx.moveTo(0, top); ctx.quadraticCurveTo(s * 0.05, top - s * 0.2, 0, top - s * 0.3); ctx.stroke();
      ctx.lineWidth = lw; ctx.strokeStyle = INK;
      for (const d of [-1, 1]) {
        ctx.save(); ctx.translate(0, top - s * 0.28); ctx.rotate(d * (0.6 + Math.sin(t * 3) * 0.1));
        ctx.beginPath(); ctx.ellipse(d * s * 0.14, 0, s * 0.15, s * 0.07, 0, 0, Math.PI * 2); fill('#5fd07c'); ctx.restore();
      }
      break;
    case 'party':
      ctx.beginPath(); ctx.moveTo(-h * 0.55, top + s * 0.06); ctx.lineTo(h * 0.1, top - s * 0.58); ctx.lineTo(h * 0.6, top + s * 0.06); ctx.closePath(); fill('#b06cff');
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = lw * 1.2;
      ctx.beginPath(); ctx.moveTo(-h * 0.3, top - s * 0.08); ctx.lineTo(h * 0.42, top - s * 0.05); ctx.moveTo(-h * 0.08, top - s * 0.3); ctx.lineTo(h * 0.28, top - s * 0.28); ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(h * 0.1, top - s * 0.6, s * 0.08, 0, Math.PI * 2); fill('#ff5d8f');
      break;
    case 'beanie':
      ctx.beginPath(); ctx.moveTo(-h * 0.92, top + s * 0.12); ctx.quadraticCurveTo(0, top - s * 0.52, h * 0.92, top + s * 0.12); ctx.closePath(); fill('#e63946');
      ctx.beginPath(); ctx.rect(-h * 0.95, top + s * 0.02, s * 0.95, s * 0.13); fill('#f4f4f4');
      ctx.beginPath(); ctx.arc(0, top - s * 0.24, s * 0.1, 0, Math.PI * 2); fill('#f4f4f4');
      break;
    case 'headphones':
      ctx.lineWidth = lw * 2.4; ctx.beginPath(); ctx.arc(0, top + s * 0.2, h * 0.95, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.lineWidth = lw * 1.3; ctx.strokeStyle = '#ff5d8f'; ctx.stroke(); ctx.strokeStyle = INK; ctx.lineWidth = lw;
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * h * 0.98, top + s * 0.28, s * 0.1, s * 0.16, 0, 0, Math.PI * 2); fill('#3d405b'); }
      break;
    case 'horns':
      for (const d of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(d * h * 0.62, top + s * 0.05); ctx.quadraticCurveTo(d * h * 0.95, top - s * 0.12, d * h * 0.78, top - s * 0.3);
        ctx.quadraticCurveTo(d * h * 0.6, top - s * 0.1, d * h * 0.3, top + s * 0.05); ctx.closePath(); fill('#e63946');
      }
      break;
    case 'tophat':
      ctx.beginPath(); ctx.ellipse(0, top + s * 0.02, h * 0.85, s * 0.08, 0, 0, Math.PI * 2); fill('#1d2340');
      ctx.beginPath(); ctx.rect(-h * 0.5, top - s * 0.5, h, s * 0.5); fill('#1d2340');
      ctx.fillStyle = '#e63946'; ctx.fillRect(-h * 0.5 + 1, top - s * 0.12, h - 2, s * 0.1);
      break;
    case 'propeller': {
      ctx.beginPath(); ctx.moveTo(-h * 0.8, top + s * 0.08); ctx.quadraticCurveTo(0, top - s * 0.4, h * 0.8, top + s * 0.08); ctx.closePath(); fill('#ffd23f');
      ctx.fillStyle = '#3a86ff'; ctx.fillRect(-h * 0.1, top - s * 0.28, h * 0.2, s * 0.14);
      const a = t * 18;
      ctx.beginPath(); ctx.ellipse(0, top - s * 0.3, Math.abs(Math.cos(a)) * s * 0.4 + 1, s * 0.05, 0, 0, Math.PI * 2); fill('#ff5d8f');
      break;
    }
    case 'crown':
      ctx.beginPath(); ctx.moveTo(-h * 0.7, top + s * 0.08); ctx.lineTo(-h * 0.75, top - s * 0.25); ctx.lineTo(-h * 0.35, top - s * 0.08); ctx.lineTo(0, top - s * 0.34);
      ctx.lineTo(h * 0.35, top - s * 0.08); ctx.lineTo(h * 0.75, top - s * 0.25); ctx.lineTo(h * 0.7, top + s * 0.08); ctx.closePath(); fill('#ffd23f');
      for (const [x, c] of [[-h * 0.4, '#ff5d8f'], [0, '#3a86ff'], [h * 0.4, '#44c06a']]) { ctx.beginPath(); ctx.arc(x, top - s * 0.01, s * 0.05, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); }
      break;
    case 'halo': {
      const bob = Math.sin(t * 3) * s * 0.03;
      ctx.lineWidth = lw * 2.2; ctx.beginPath(); ctx.ellipse(0, top - s * 0.28 + bob, h * 0.65, s * 0.1, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = lw * 1.2; ctx.strokeStyle = '#ffe66d'; ctx.stroke();
      break;
    }
    case 'viking':
      ctx.beginPath(); ctx.moveTo(-h * 0.9, top + s * 0.1); ctx.quadraticCurveTo(0, top - s * 0.45, h * 0.9, top + s * 0.1); ctx.closePath(); fill('#a3abc2');
      ctx.beginPath(); ctx.rect(-h * 0.92, top + s * 0.02, s * 0.92, s * 0.1); fill('#c98b4f');
      for (const d of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(d * h * 0.7, top - s * 0.02); ctx.quadraticCurveTo(d * h * 1.25, top - s * 0.1, d * h * 1.2, top - s * 0.42);
        ctx.quadraticCurveTo(d * h * 1.0, top - s * 0.18, d * h * 0.55, top - s * 0.14); ctx.closePath(); fill('#f4f0e0');
      }
      break;
    case 'bunny':
      for (const d of [-1, 1]) {
        ctx.save(); ctx.translate(d * h * 0.35, top - s * 0.2); ctx.rotate(d * (0.15 + Math.sin(t * 2 + d) * 0.06));
        ctx.beginPath(); ctx.ellipse(0, -s * 0.12, s * 0.1, s * 0.3, 0, 0, Math.PI * 2); fill('#ffffff');
        ctx.fillStyle = '#ffb3c7'; ctx.beginPath(); ctx.ellipse(0, -s * 0.12, s * 0.045, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      break;
    case 'cowboy':
      ctx.beginPath(); ctx.ellipse(0, top + s * 0.03, h * 1.2, s * 0.09, 0, 0, Math.PI * 2); fill('#a0612b');
      ctx.beginPath(); ctx.moveTo(-h * 0.55, top + s * 0.02); ctx.lineTo(-h * 0.45, top - s * 0.34); ctx.quadraticCurveTo(0, top - s * 0.24, h * 0.45, top - s * 0.34); ctx.lineTo(h * 0.55, top + s * 0.02); ctx.closePath(); fill('#b8733a');
      ctx.fillStyle = '#5a3418'; ctx.fillRect(-h * 0.53, top - s * 0.08, h * 1.06, s * 0.08);
      break;
    case 'unicorn':
      ctx.beginPath(); ctx.moveTo(-s * 0.1, top + s * 0.02); ctx.lineTo(look * s * 0.05, top - s * 0.55); ctx.lineTo(s * 0.1, top + s * 0.02); ctx.closePath(); fill('#ffffff');
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = lw * 1.1; ctx.beginPath(); ctx.moveTo(-s * 0.07, top - s * 0.1); ctx.lineTo(s * 0.07, top - s * 0.16); ctx.moveTo(-s * 0.04, top - s * 0.27); ctx.lineTo(s * 0.05, top - s * 0.32); ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(-look * h * 0.55, top + s * 0.02, s * 0.1, 0, Math.PI * 2); fill('#b06cff');
      break;
    case 'chef':
      ctx.beginPath(); ctx.rect(-h * 0.55, top - s * 0.12, h * 1.1, s * 0.2); fill('#ffffff');
      ctx.beginPath(); ctx.arc(-h * 0.35, top - s * 0.24, s * 0.16, 0, Math.PI * 2); ctx.arc(h * 0.35, top - s * 0.24, s * 0.16, 0, Math.PI * 2); fill('#ffffff');
      ctx.beginPath(); ctx.arc(0, top - s * 0.34, s * 0.19, 0, Math.PI * 2); fill('#ffffff');
      break;
    case 'wizard':
      ctx.beginPath(); ctx.moveTo(-h * 0.95, top + s * 0.08); ctx.lineTo(h * 0.95, top + s * 0.08); ctx.lineTo(h * 0.35, top - s * 0.05);
      ctx.quadraticCurveTo(h * 0.2, top - s * 0.55, -look * h * 0.7, top - s * 0.62); ctx.quadraticCurveTo(-h * 0.1, top - s * 0.3, -h * 0.35, top - s * 0.05); ctx.closePath(); fill('#5a3fd6');
      ctx.fillStyle = '#ffd23f'; for (const [x, y] of [[-h * 0.1, -s * 0.16], [h * 0.25, -s * 0.3]]) { ctx.beginPath(); ctx.arc(x, top + y, s * 0.035, 0, Math.PI * 2); ctx.fill(); }
      break;
  }
  ctx.restore();
}

/* ---------------- Pip's rush forms ---------------- */
// Drawn centered, already rotated and flipped by the caller. s = hitbox size.
export function drawForm(ctx, form, s, color, st) {
  const h = s / 2;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1.5, s / 10);
  const pip = (size, ox = 0, oy = 0, extra = {}) => { ctx.save(); ctx.translate(ox, oy); drawPip(ctx, size, color, { ...st, feet: false, ...extra }); ctx.restore(); };
  switch (form) {
    case 'hopper': pip(s * 0.95, 0, 0, { mouth: st.air ? 'open' : 'smile' }); break;
    case 'jet': {
      pip(s * 0.62, s * 0.08, -h * 0.55, { mouth: 'open' });
      ctx.fillStyle = '#e8ecf8';
      ctx.beginPath(); ctx.moveTo(-h * 1.35, h * 0.05); ctx.quadraticCurveTo(-h * 0.2, -h * 0.25, h * 1.3, h * 0.05);
      ctx.quadraticCurveTo(h * 1.1, h * 0.75, -h * 1.1, h * 0.75); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff5d8f'; ctx.beginPath(); ctx.moveTo(-h * 1.35, h * 0.05); ctx.lineTo(-h * 1.7, -h * 0.5); ctx.lineTo(-h * 0.8, h * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
      const fl = 0.7 + Math.sin(st.t * 40) * 0.3;
      ctx.fillStyle = BULB; ctx.beginPath(); ctx.moveTo(-h * 1.15, h * 0.25); ctx.lineTo(-h * (1.5 + fl * 0.5), h * 0.45); ctx.lineTo(-h * 1.15, h * 0.62); ctx.closePath(); ctx.fill();
      break;
    }
    case 'roller': {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, h, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(color, 0.78); ctx.beginPath(); ctx.arc(0, 0, h, 0.15 * Math.PI, 0.85 * Math.PI); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, h, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = BULB; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.arc(0, 0, h * 0.72, 1.2 * Math.PI, 1.8 * Math.PI); ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s / 10);
      for (const side of [-1, 1]) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(side * h * 0.3, -h * 0.05, h * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(side * h * 0.3 + h * 0.06, -h * 0.02, h * 0.1, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'flapper': {
      ctx.fillStyle = 'rgba(191,239,255,.75)'; ctx.beginPath(); ctx.arc(0, -h * 0.05, h * 0.78, Math.PI, 0); ctx.closePath(); ctx.fill();
      pip(s * 0.5, 0, -h * 0.28, { mouth: 'o' });
      ctx.beginPath(); ctx.arc(0, -h * 0.05, h * 0.78, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, h * 0.22, h * 1.15, h * 0.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (let i = -1; i <= 1; i++) { ctx.fillStyle = (Math.floor(st.t * 8) + i) % 2 ? BULB : '#fff'; ctx.beginPath(); ctx.arc(i * h * 0.6, h * 0.22, h * 0.1, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'dart': {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(h * 1.25, 0); ctx.lineTo(-h, -h); ctx.lineTo(-h * 0.45, 0); ctx.lineTo(-h, h); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(h * 0.15, -h * 0.05, h * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(h * 0.25, -h * 0.05, h * 0.15, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'springer': {
      const ext = st.air ? h * 0.5 : 0;
      ctx.strokeStyle = '#9aa3bc'; ctx.lineWidth = s * 0.09;
      ctx.beginPath(); ctx.moveTo(0, h * 0.4);
      for (let i = 1; i <= 4; i++) ctx.lineTo((i % 2 ? -1 : 1) * h * 0.35, h * 0.4 + (h * 0.18 + ext * 0.25) * i);
      ctx.stroke(); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s / 10);
      ctx.fillStyle = INK; rr(ctx, -h * 0.5, h * 0.4 + h * 0.72 + ext, h, h * 0.22, h * 0.1); ctx.fill();
      pip(s * 0.8, 0, -h * 0.2, { mouth: st.air ? 'open' : 'smile' });
      break;
    }
    case 'snapper': {
      const k = Math.sin(st.t * 24) * h * 0.12;
      for (const sx of [-1, 1]) for (const [oy, d] of [[-h * 0.15, 1], [h * 0.3, -1]]) {
        ctx.beginPath(); ctx.moveTo(sx * h * 0.5, oy); ctx.lineTo(sx * h * 1.05, oy + h * 0.1 + k * d); ctx.lineTo(sx * h * 1.15, oy + h * 0.7 + k * d); ctx.stroke();
      }
      pip(s * 0.82, 0, 0, { mouth: 'o' });
      break;
    }
    case 'glider': {
      const flap = Math.sin(st.t * 14) * h * 0.2;
      ctx.fillStyle = '#fff';
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(sx * h * 0.4, -h * 0.1); ctx.quadraticCurveTo(sx * h * 1.3, -h * 0.9 - flap, sx * h * 1.6, -h * 0.2 - flap);
        ctx.quadraticCurveTo(sx * h * 1.1, -h * 0.2, sx * h * 0.4, h * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      pip(s * 0.8, 0, 0, { mouth: 'smile' });
      break;
    }
  }
}

/* ---------------- UI icons ----------------
   Drawn into a box of size s at (x, y). Used for editor tools and buttons. */
export function drawIcon(ctx, name, x, y, s, color = INK) {
  ctx.save();
  ctx.translate(x + s / 2, y + s / 2);
  const u = s / 32;
  ctx.scale(u, u);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.fillStyle = color;
  switch (name) {
    case 'move': {
      ctx.fillStyle = '#3a86ff';
      for (let i = 0; i < 4; i++) {
        ctx.save(); ctx.rotate(i * Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(6, -6); ctx.lineTo(2.5, -6); ctx.lineTo(2.5, -2.5); ctx.lineTo(-2.5, -2.5); ctx.lineTo(-2.5, -6); ctx.lineTo(-6, -6); ctx.closePath();
        ctx.fill(); ctx.stroke(); ctx.restore();
      }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    }
    case 'erase': {
      ctx.rotate(-0.6);
      ctx.fillStyle = '#ff9fbf'; rr(ctx, -12, -7, 14, 14, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8ecf8'; rr(ctx, 2, -7, 10, 14, 3); ctx.fill(); ctx.stroke();
      ctx.rotate(0.6);
      ctx.strokeStyle = 'rgba(29,35,64,.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, 13); ctx.lineTo(10, 13); ctx.stroke();
      break;
    }
    case 'pick': {
      ctx.rotate(0.8);
      ctx.fillStyle = '#e8ecf8'; rr(ctx, -3.5, -6, 7, 16, 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff5d8f'; rr(ctx, -5.5, -14, 11, 9, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3a86ff'; ctx.beginPath(); ctx.moveTo(-3.5, 4); ctx.lineTo(3.5, 4); ctx.lineTo(0, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'left': case 'right': case 'up': case 'down': {
      ctx.rotate({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[name]);
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-5, -11); ctx.lineTo(-5, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'turn-left': case 'turn-right': {
      if (name === 'turn-left') ctx.scale(-1, 1);
      ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(0, 2, 9, Math.PI * 1.05, Math.PI * 0.3); ctx.stroke();
      ctx.lineWidth = 2.5; ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(0, 2, 9, Math.PI * 1.05, Math.PI * 0.3); ctx.stroke();
      ctx.strokeStyle = INK; ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(1, 8); ctx.lineTo(12, 14); ctx.lineTo(13, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'sound': case 'mute': case 'music': case 'music-off': {
      if (name.startsWith('music')) {
        ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(-6, 8, 5, 4, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(8, 5, 5, 4, -0.4, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-2, 7); ctx.lineTo(-2, -10); ctx.lineTo(12, -13); ctx.lineTo(12, 4); ctx.stroke();
      } else {
        ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(-12, -5); ctx.lineTo(-6, -5); ctx.lineTo(2, -12); ctx.lineTo(2, 12); ctx.lineTo(-6, 5); ctx.lineTo(-12, 5); ctx.closePath(); ctx.fill();
        if (name === 'sound') { ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(3, 0, 7, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(3, 0, 12, -0.9, 0.9); ctx.stroke(); }
      }
      if (name === 'mute' || name === 'music-off') { ctx.strokeStyle = '#ff5d8f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-13, -13); ctx.lineTo(13, 13); ctx.stroke(); }
      break;
    }
    case 'lock': {
      ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(0, -3, 7, Math.PI, 0); ctx.lineTo(7, 2); ctx.moveTo(-7, 2); ctx.lineTo(-7, -3); ctx.stroke();
      ctx.lineWidth = 2.5; ctx.fillStyle = '#9aa3bc'; rr(ctx, -10, 1, 20, 14, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 7, 2.5, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'star': {
      ctx.fillStyle = BULB; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 5.5 : 12, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

// Makes a canvas element with an icon on it, sized for buttons.
export function iconCanvas(name, size = 28, color) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = size * dpr; cv.height = size * dpr;
  cv.style.width = size + 'px'; cv.style.height = size + 'px';
  cv.setAttribute('aria-hidden', 'true');
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  drawIcon(c, name, 0, 0, size, color);
  return cv;
}

// Pets, drawn around (0, 0) = the middle of their feet. s = size.
export function drawPet(ctx, id, s, t = 0) {
  const k = s / 40;
  ctx.save(); ctx.scale(k, k);
  ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
  const fill = (c) => { ctx.fillStyle = c; ctx.fill(); ctx.stroke(); };
  const eyes = (x, y, gap = 7, r = 2.6) => { ctx.fillStyle = INK; for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(x + d * gap, y, r, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = '#fff'; for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(x + d * gap + 0.8, y - 0.9, 0.9, 0, Math.PI * 2); ctx.fill(); } };
  if (id === 'slime') {
    const sq = 1 + Math.sin(t * 6) * 0.06;
    ctx.beginPath(); ctx.moveTo(-16 * sq, 0); ctx.quadraticCurveTo(-16 * sq, -26 / sq, 0, -26 / sq); ctx.quadraticCurveTo(16 * sq, -26 / sq, 16 * sq, 0); ctx.closePath(); fill('#7be07b');
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(-7, -17, 3, 5, -0.4, 0, Math.PI * 2); ctx.fill();
    eyes(1, -11, 5.5);
  } else if (id === 'chick') {
    ctx.beginPath(); ctx.arc(0, -13, 13, 0, Math.PI * 2); fill('#ffd23f');
    ctx.beginPath(); ctx.moveTo(10, -14); ctx.lineTo(18, -11); ctx.lineTo(10, -8); ctx.closePath(); fill('#ff9f1c');
    ctx.beginPath(); ctx.ellipse(-4, -10, 6, 4, 0.5 + Math.sin(t * 12) * 0.3, 0, Math.PI * 2); fill('#f0b800');
    eyes(4, -17, 4, 2.2);
  } else if (id === 'pup' || id === 'kitty') {
    const body = id === 'pup' ? '#c98b4f' : '#a3abc2', dark = id === 'pup' ? '#8d5a2b' : '#6b7391';
    ctx.beginPath(); ctx.ellipse(-4, -9, 14, 8, 0, 0, Math.PI * 2); fill(body);
    ctx.beginPath(); ctx.moveTo(-17, -12); ctx.quadraticCurveTo(-24, -20 + Math.sin(t * 10) * 4, -20, -24); ctx.stroke();
    ctx.beginPath(); ctx.arc(9, -17, 10, 0, Math.PI * 2); fill(body);
    if (id === 'pup') { ctx.beginPath(); ctx.ellipse(1, -18, 4, 8, 0.3, 0, Math.PI * 2); fill(dark); ctx.beginPath(); ctx.ellipse(17, -18, 4, 8, -0.3, 0, Math.PI * 2); fill(dark); }
    else for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(9 + d * 3, -25); ctx.lineTo(9 + d * 9, -32); ctx.lineTo(9 + d * 9, -22); ctx.closePath(); fill(body); }
    eyes(9, -18, 4.2, 2.2);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(12, -13, 1.8, 0, Math.PI * 2); ctx.fill();
  } else if (id === 'bee') {
    const wing = Math.sin(t * 30) * 0.4;
    ctx.fillStyle = 'rgba(220,240,255,.9)'; for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * 5, -26, 5, 9, d * (0.5 + wing), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(0, -15, 13, 10, 0, 0, Math.PI * 2); fill('#ffd23f');
    ctx.fillStyle = INK; ctx.fillRect(-4, -24, 4, 18); ctx.fillRect(4, -23, 3, 16);
    eyes(7, -17, 3, 1.8);
  } else if (id === 'dragon') {
    const wing = Math.sin(t * 8) * 0.5;
    for (const d of [-1, 1]) { ctx.save(); ctx.translate(-2, -20); ctx.rotate(d * (0.6 + wing)); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(d * 16, -10); ctx.lineTo(d * 12, 2); ctx.closePath(); fill('#ff5d8f'); ctx.restore(); }
    ctx.beginPath(); ctx.ellipse(-3, -11, 12, 9, 0, 0, Math.PI * 2); fill('#8a5cf6');
    ctx.beginPath(); ctx.moveTo(-14, -9); ctx.quadraticCurveTo(-24, -6, -22, -16); ctx.stroke();
    ctx.beginPath(); ctx.arc(10, -19, 9, 0, Math.PI * 2); fill('#8a5cf6');
    ctx.beginPath(); ctx.moveTo(6, -27); ctx.lineTo(8, -33); ctx.lineTo(11, -27); ctx.closePath(); fill('#ffd23f');
    eyes(11, -20, 3.6, 2);
    if (Math.sin(t * 2) > 0.85) { ctx.fillStyle = '#ffb02e'; ctx.beginPath(); ctx.arc(22, -16, 3, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

// Gear icons for the closet.
export function drawGear(ctx, id, s) {
  const k = s / 40;
  ctx.save(); ctx.scale(k, k); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
  const fill = (c) => { ctx.fillStyle = c; ctx.fill(); ctx.stroke(); };
  if (id === 'speed' || id === 'gravity') {
    const c = id === 'speed' ? '#3a86ff' : '#b06cff';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(0, -8 + i * 6, 12, 4, 0, 0, Math.PI * 2); ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.stroke(); }
    ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.rect(-3, -18, 6, 34); fill('#8a90a8');
  } else if (id === 'boots') {
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(d * 4, -14); ctx.lineTo(d * 4 + d * 8, -14); ctx.lineTo(d * 4 + d * 8, 4); ctx.lineTo(d * 4 + d * 16, 4); ctx.lineTo(d * 4 + d * 16, 12); ctx.lineTo(d * 4, 12); ctx.closePath(); fill('#e63946'); }
    ctx.fillStyle = '#fff'; ctx.fillRect(-14, 6, 8, 3); ctx.fillRect(6, 6, 8, 3);
    ctx.fillStyle = '#ffd23f'; for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(d * 12, -12); ctx.lineTo(d * 20, -18); ctx.lineTo(d * 16, -8); ctx.closePath(); ctx.fill(); }
  } else if (id === 'jetpack') {
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.rect(d * 8 - 6, -16, 12, 26); fill('#a3abc2'); ctx.beginPath(); ctx.moveTo(d * 8 - 5, 10); ctx.lineTo(d * 8, 20); ctx.lineTo(d * 8 + 5, 10); ctx.closePath(); fill('#ff9f1c'); }
    ctx.beginPath(); ctx.rect(-4, -12, 8, 14); fill('#e63946');
  } else {
    ctx.fillStyle = 'rgba(29,35,64,.25)'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
