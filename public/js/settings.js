// Things you can set for yourself on this computer: light or dark look, and how the 3D worlds are drawn.
import { store } from './api.js';

// 3D graphics, from fastest to prettiest. dpr = how many screen pixels each drawn pixel covers.
export const GFX = {
  perf: { name: 'Potato', info: 'For slow or old computers: half the pixels, no clouds or shadows, short view. Smooth but blurry.', low: true, dpr: () => 0.5, far: 80, clouds: false, shadows: false },
  fast: { name: 'Low', info: 'The classic look with less detail. Runs fast.', low: true, dpr: () => 1, far: 140, clouds: true, shadows: true },
  med: { name: 'Medium', info: 'HD graphics on a budget: softer shadows, lighter smoothing, thinner grass, a bit less sharp.', low: false, dpr: () => Math.min(1.25, window.devicePixelRatio || 1), far: 180, clouds: true, shadows: true, hd: { shadowSize: 1024, shadowRange: 36, msaa: 2, bloom: 0.9, grass: 2, grassFar: 60 } },
  pretty: { name: 'High', info: 'Full HD graphics: real shadows from the sun, shiny materials, glowing lights, smooth edges and thick grass.', low: false, dpr: () => Math.min(2, window.devicePixelRatio || 1), far: 230, clouds: true, shadows: true, hd: { shadowSize: 2048, shadowRange: 44, msaa: 4, bloom: 0.9, grass: 4, grassFar: 80 } },
  ultra: { name: 'Max', info: 'Everything turned all the way up: extra sharp, sharper shadows that reach further, the thickest grass, and you see much further. Needs a strong computer.', low: false, dpr: () => Math.min(3, (window.devicePixelRatio || 1) * 1.5), far: 320, clouds: true, shadows: true, hd: { shadowSize: 4096, shadowRange: 70, msaa: 4, bloom: 1, grass: 7, grassFar: 120 } },
};
// Custom: you pick every setting yourself (Settings > 3D graphics > Custom)
export const CUSTOM_DEFAULT = { far: 230, scale: 100, hd: true, shadows: 'high', aa: 4, glow: true, clouds: true, grass: 'high' };
export const customGfx = () => ({ ...CUSTOM_DEFAULT, ...(store.get('gfx-custom', null) || {}) });
export function setCustomGfx(patch) { store.set('gfx-custom', { ...customGfx(), ...patch }); }
const SHADOW_Q = { low: [1024, 36], high: [2048, 44], ultra: [4096, 70] };
function customMode() {
  const c = customGfx(), sq = SHADOW_Q[c.shadows] || SHADOW_Q.high;
  const far = Math.min(400, Math.max(40, Number(c.far) || 230)), scale = Math.min(200, Math.max(25, Number(c.scale) || 100));
  return { name: 'Custom', low: !c.hd, dpr: () => Math.min(3, Math.max(0.25, (window.devicePixelRatio || 1) * scale / 100)), far, clouds: !!c.clouds, shadows: c.shadows !== 'off',
    info: 'Your own settings: view distance, sharpness, shadows, smooth edges, glow and clouds.',
    hd: c.hd ? { shadowSize: sq[0], shadowRange: sq[1], msaa: [0, 2, 4].includes(Number(c.aa)) ? Number(c.aa) : 4, bloom: c.glow ? 0.9 : 0, noShadow: c.shadows === 'off', grass: { off: 0, low: 2, high: 4, ultra: 8 }[c.grass] ?? 4, grassFar: c.grass === 'ultra' ? 120 : 80 } : null };
}
Object.defineProperty(GFX, 'custom', { enumerable: true, get: customMode });
// Auto: starts at High and watches how smooth the game is. If it gets choppy it steps down
// (Medium, Low, then Potato); when there's lots of room again it steps back up.
const AUTO_STEPS = ['perf', 'fast', 'med', 'pretty'];
let autoAt = 3, fpsAvg = 60, calm = 0, since = 0;
GFX.auto = {
  name: 'Auto', auto: true, low: false,
  info: 'Picks for you: it watches how smooth the game runs and turns the quality down or up by itself. Best for most computers.',
  get step() { return AUTO_STEPS[autoAt]; },
  dpr: () => GFX[AUTO_STEPS[autoAt]].dpr(),
  get far() { return GFX[AUTO_STEPS[autoAt]].far; },
  get clouds() { return GFX[AUTO_STEPS[autoAt]].clouds; },
  get shadows() { return GFX[AUTO_STEPS[autoAt]].shadows; },
  get hd() { return GFX.pretty.hd; },
  // called every frame with the frame time; returns the new step name when it changes
  tick(dt) {
    if (!(dt > 0) || dt > 0.5) return null;
    fpsAvg += (1 / dt - fpsAvg) * 0.05;
    since += dt;
    if (since < 2) return null; // let it settle after a change
    if (fpsAvg < 38 && autoAt > 0) { autoAt--; since = 0; calm = 0; fpsAvg = 50; return AUTO_STEPS[autoAt]; }
    calm = fpsAvg > 57 ? calm + dt : 0;
    if (calm > 10 && autoAt < AUTO_STEPS.length - 1) { autoAt++; since = 0; calm = 0; return AUTO_STEPS[autoAt]; }
    return null;
  },
};
export const GFX_ORDER = ['auto', 'perf', 'fast', 'med', 'pretty', 'ultra', 'custom'];
export function gfxMode() {
  const m = store.get('gfx', '');
  return GFX[m] ? m : store.get('gfx-low', false) ? 'fast' : 'auto';
}
export function setGfx(m) { if (!GFX[m]) return; store.set('gfx', m); store.set('gfx-low', !!GFX[m].low); }
// (Auto is handed over as itself, because its settings change while you play)
export const gfx = () => { const m = gfxMode(); if (m === 'auto') { GFX.auto.mode = 'auto'; return GFX.auto; } return { mode: m, ...GFX[m] }; };

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
