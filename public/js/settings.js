// Things you can set for yourself on this computer: light or dark look, and how the 3D worlds are drawn.
import { store } from './api.js';

// 3D graphics, from fastest to prettiest. dpr = how many screen pixels each drawn pixel covers.
export const GFX = {
  perf: { name: 'Extreme performance', info: 'For slow or old Chromebooks: half the pixels, no clouds or shadows, shorter view. Smooth but blurry.', low: true, dpr: () => 0.5, far: 80, clouds: false, shadows: false },
  fast: { name: 'Fast', info: 'Less detail, runs faster.', low: true, dpr: () => 1, far: 140, clouds: true, shadows: true },
  pretty: { name: 'Pretty', info: 'The normal look.', low: false, dpr: () => Math.min(2, window.devicePixelRatio || 1), far: 230, clouds: true, shadows: true },
  ultra: { name: 'Extreme quality', info: 'Extra sharp, and you can see much further. Needs a fast computer.', low: false, dpr: () => Math.min(3, (window.devicePixelRatio || 1) * 1.5), far: 320, clouds: true, shadows: true },
};
export const GFX_ORDER = ['perf', 'fast', 'pretty', 'ultra'];
export function gfxMode() {
  const m = store.get('gfx', '');
  return GFX[m] ? m : store.get('gfx-low', false) ? 'fast' : 'pretty';
}
export function setGfx(m) { if (!GFX[m]) return; store.set('gfx', m); store.set('gfx-low', GFX[m].low); }
export const gfx = () => ({ mode: gfxMode(), ...GFX[gfxMode()] });

// Light, dark, or whatever the computer uses
export const THEMES = { system: 'Match my computer', light: 'Light', dark: 'Dark' };
export function themeMode() { const t = store.get('theme', 'system'); return THEMES[t] ? t : 'system'; }
export function applyTheme() {
  const t = themeMode();
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}
export function setTheme(t) { if (!THEMES[t]) return; store.set('theme', t); applyTheme(); }
applyTheme();
