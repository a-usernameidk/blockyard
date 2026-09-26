// Draws the little raised map of a 3D world used on cards.
import { BLOCKS, PALETTE, SKIES, readThumb, worldThumb, decodeBlocks } from './world.js';

const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const css = (c, k) => `rgb(${Math.round(Math.min(255, c[0] * k))},${Math.round(Math.min(255, c[1] * k))},${Math.round(Math.min(255, c[2] * k))})`;

export function drawWorldThumb(cv, thumb, skyId = 'day') {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = cv.clientWidth || 320, H = cv.clientHeight || 128;
  cv.width = W * dpr; cv.height = H * dpr;
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  const sky = SKIES[skyId] || SKIES.day;
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, sky.top); g.addColorStop(1, sky.bottom);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const t = readThumb(thumb);
  if (!t) return;
  let maxY = 1, minY = 99;
  for (const [ty, , y] of t.cells) if (ty) { maxY = Math.max(maxY, y); minY = Math.min(minY, y); }
  const lift = Math.min(3, 40 / Math.max(1, maxY - minY + 1));
  const cs = Math.min(W * 0.8 / t.N, (H - 10) / (t.N * 0.55 + (maxY - minY) * lift / 8 + 2));
  const ox = (W - t.N * cs) / 2, oy = H - 8 - t.N * cs * 0.55;
  for (let r = 0; r < t.N; r++) for (let col = 0; col < t.N; col++) {
    const [ty, co, y] = t.cells[r * t.N + col];
    if (!ty || !BLOCKS[ty]) continue;
    const b = BLOCKS[ty];
    const base = rgb(b.tint ? PALETTE[co & 15] : b.color || '#ffd23f');
    const hy = (y - minY + 1) * lift * cs / 8;
    const x = ox + col * cs, sy = oy + r * cs * 0.55 - hy;
    c.fillStyle = css(base, 0.62); c.fillRect(x, sy + cs * 0.55, cs + 0.5, hy + 2);
    c.fillStyle = css(base, b.glow ? 1.15 : 0.95 + 0.1 * ((col + r) % 2)); c.fillRect(x, sy, cs + 0.5, cs * 0.55 + 0.5);
  }
}
export function thumbOfWorld(world) { try { return worldThumb(decodeBlocks(world.b)); } catch (e) { return ''; } }
