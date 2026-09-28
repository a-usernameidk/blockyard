// Things you can set for yourself on this computer: light or dark look, and how the 3D worlds are drawn.
import { store } from './api.js';

// 3D graphics, from fastest to prettiest. dpr = how many screen pixels each drawn pixel covers.
export const GFX = {
  perf: { name: 'Extreme performance', info: 'For slow or old Chromebooks: half the pixels, no clouds or shadows, shorter view. Smooth but blurry.', low: true, dpr: () => 0.5, far: 80, clouds: false, shadows: false },
  fast: { name: 'Fast', info: 'Less detail, runs faster.', low: true, dpr: () => 1, far: 140, clouds: true, shadows: true },
  pretty: { name: 'Pretty', info: 'HD graphics: real shadows from the sun, shiny materials, glowing lights and smooth edges.', low: false, dpr: () => Math.min(2, window.devicePixelRatio || 1), far: 230, clouds: true, shadows: true, hd: { shadowSize: 2048, shadowRange: 44, msaa: 4, bloom: 0.9 } },
  ultra: { name: 'Extreme quality', info: 'HD graphics turned all the way up: sharper, sharper shadows that reach further, and you see much further. Needs a strong computer.', low: false, dpr: () => Math.min(3, (window.devicePixelRatio || 1) * 1.5), far: 320, clouds: true, shadows: true, hd: { shadowSize: 4096, shadowRange: 70, msaa: 4, bloom: 1 } },
};
// Auto: starts at Pretty and watches how smooth the game is. If it gets choppy it steps down
// (Fast, then Extreme performance); when there's lots of room again it steps back up.
const AUTO_STEPS = ['perf', 'fast', 'pretty'];
let autoAt = 2, fpsAvg = 60, calm = 0, since = 0;
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
export const GFX_ORDER = ['auto', 'perf', 'fast', 'pretty', 'ultra'];
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
