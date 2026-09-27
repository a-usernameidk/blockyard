// Drawing profile pictures, and the names of titles (badges plus OG, Beta Tester and Admin).
import { drawPip, INK } from './art.js';
import { drawEmoji, PIP_EMOJIS } from './emoji.js';
import { PFP_BGS, parsePfp, SPECIAL_TITLES, TAGS } from './names.js';
import { ACHIEVEMENTS } from './progress.js';

// A round profile picture. look = that player's look (for "my Pip").
export function pfpCanvas(pfp, look = {}, size = 40) {
  const { pic, bg } = parsePfp(pfp);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(size * dpr); cv.style.width = cv.style.height = size + 'px';
  cv.className = 'pfp';
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  const r = size / 2;
  c.save(); c.beginPath(); c.arc(r, r, r - 1, 0, Math.PI * 2); c.fillStyle = PFP_BGS[bg] || PFP_BGS[5]; c.fill(); c.clip();
  const e = pic !== 'pip' && PIP_EMOJIS.find((x) => x.name === pic);
  if (e) { c.translate(r, r * 1.08); drawEmoji(c, e, size * 0.58); }
  else { c.translate(r, size * 0.64); drawPip(c, size * 0.56, look.color || '#ff6b35', { t: 1, look: 1, hat: look.hat }); }
  c.restore();
  c.lineWidth = Math.max(1.5, size / 22); c.strokeStyle = INK; c.beginPath(); c.arc(r, r, r - c.lineWidth / 2, 0, Math.PI * 2); c.stroke();
  cv.setAttribute('aria-hidden', 'true');
  return cv;
}

// The name of a title: a badge's name, or OG / Beta Tester / Admin
export function titleText(id) {
  if (!id) return '';
  if (SPECIAL_TITLES[id]) return SPECIAL_TITLES[id];
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  return a ? a.name : '';
}
export const titleClass = (id) => (SPECIAL_TITLES[id] ? ' t-' + id : '');
// Role pills for OG and Beta Tester
export const tagPills = (tags, make) => (tags || []).filter((t) => TAGS[t]).map((t) => make(t, TAGS[t]));
