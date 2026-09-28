// The loading screen for the big parts of Blockyard (the 3D builder, the v2 editor, 3D worlds).
// It downloads each code file (and the files it needs) itself, so it can show a percent and what's loading right now,
// then imports them (the browser already has them by then). If a file is missing it says which one.
import { el } from './app.js';

const NAMES = {
  'play3d.js': '3D worlds', 'build3d.js': '3D builder', 'build2.js': 'Engine v2 editor', 'gl.js': '3D graphics',
  'gl2.js': 'HD graphics', 'mesh3d.js': 'block shapes', 'partsmesh.js': 'part shapes', 'parts.js': 'parts and materials',
  'phys2.js': 'Engine v2 physics', 'physics3d.js': '3D physics', 'world.js': 'world blocks', 'avatar3d.js': 'avatars and hats',
  'logic.js': 'Logic blocks', 'logicEditor.js': 'Logic editor', 'net.js': 'online rooms', 'bots3d.js': 'bots',
  'games.js': 'minigames', 'musicbox.js': 'music box', 'audio.js': 'sounds and music', 'cosmetics.js': 'shop items',
  'controls.js': 'controls', 'replay.js': 'replays', 'tycoon.js': 'Tycoon', 'worlds3d.js': 'built-in worlds',
  'templates.js': 'templates', 'thumb3d.js': 'world pictures', 'settings.js': 'settings',
};
// FILEMAP (made by tests/tools/loadmap.mjs)
const SIZES = {"build3d.js":42916,"gl.js":29276,"world.js":20488,"format.js":9644,"logic.js":12045,"cosmetics.js":20711,"mesh3d.js":11738,"gl2.js":48344,"partsmesh.js":5223,"parts.js":12636,"avatar3d.js":19004,"net.js":1909,"api.js":12232,"audio.js":13212,"play3d.js":115878,"physics3d.js":20920,"replay.js":2804,"engine2d.js":22008,"phys2.js":13856,"musicbox.js":4357,"progress.js":19220,"levels.js":186646,"games.js":5122,"pfp.js":1835,"art.js":32237,"emoji.js":17836,"names.js":2191,"settings.js":3630,"bots3d.js":10967,"tycoon.js":33371,"controls.js":3598,"logicEditor.js":9043,"build2.js":34729};
const PLANS = {"build3d.js":["build3d.js","gl.js","world.js","format.js","logic.js","cosmetics.js","mesh3d.js","gl2.js","partsmesh.js","parts.js","avatar3d.js","net.js","api.js","audio.js","play3d.js","physics3d.js","replay.js","engine2d.js","phys2.js","musicbox.js","progress.js","levels.js","games.js","pfp.js","art.js","emoji.js","names.js","settings.js","bots3d.js","tycoon.js","controls.js","logicEditor.js"],"build2.js":["build2.js","gl.js","world.js","format.js","logic.js","cosmetics.js","mesh3d.js","gl2.js","partsmesh.js","parts.js","phys2.js","physics3d.js","replay.js","engine2d.js","progress.js","api.js","levels.js","play3d.js","avatar3d.js","net.js","audio.js","musicbox.js","games.js","pfp.js","art.js","emoji.js","names.js","settings.js","bots3d.js","tycoon.js","controls.js"],"play3d.js":["play3d.js","gl.js","world.js","format.js","logic.js","cosmetics.js","mesh3d.js","gl2.js","partsmesh.js","parts.js","physics3d.js","replay.js","engine2d.js","phys2.js","avatar3d.js","net.js","api.js","audio.js","musicbox.js","progress.js","levels.js","games.js","pfp.js","art.js","emoji.js","names.js","settings.js","bots3d.js","tycoon.js","controls.js"]};
// END FILEMAP
const nice = (url) => { const f = url.split('/').pop().split('?')[0]; return NAMES[f] ? `${NAMES[f]} (${f})` : f; };
const IMPORT_RE = /(?:^|[;\s])(?:import|export)\s*(?:[^'"`;]*?\sfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]/g;
const done = new Set(); // files this page already downloaded
const pct = (x) => (Math.min(100, Math.max(0, x))).toFixed(2).padStart(5, '0') + '%';

// Show a loader in `root`, download `entries` (paths relative to /js/, like 'build2.js') and everything they import,
// then import them. Returns the modules in the same order. Throws after showing what went wrong.
export async function loadWithProgress(root, entries, { title = 'Loading' } = {}) {
  const base = new URL('./', import.meta.url);
  const urls = entries.map((e) => new URL(e, base).href);
  const bar = el('div', { class: 'ld-fill' });
  const num = el('span', { class: 'ld-pct' }, pct(0));
  const what = el('p', { class: 'ld-what small' }, 'Getting started…');
  const box = el('div', { class: 'ld', role: 'status', 'aria-live': 'polite' },
    el('div', { class: 'ld-top' }, el('h3', {}, title), num), el('div', { class: 'ld-bar' }, bar), what);
  let shown = 0;
  const set = (p, text) => { shown = Math.max(shown, p); bar.style.width = shown.toFixed(2) + '%'; num.textContent = pct(shown); if (text) what.textContent = text; };
  const need = urls.some((u) => !done.has(u));
  if (need) root.replaceChildren(box);

  // 1) download (0 - 90%). Files the page already has are skipped. The plan (from the file map) says what's coming,
  // so the percent moves smoothly; files not in the map count as an average-sized file.
  const have0 = new Set(performance.getEntriesByType('resource').map((r) => r.name.split('?')[0]).filter((n) => /\.js$/.test(n)));
  for (const u of have0) if (!urls.includes(u)) done.add(u);
  const rel = (u) => u.startsWith(base.href) ? u.slice(base.href.length) : u;
  const seen = new Set(), sizes = new Map(), got = new Map(), active = new Set();
  const plan = new Set(); for (const e of entries) for (const f of PLANS[e] || [e]) { const u = new URL(f, base).href; if (!done.has(u) || urls.includes(u)) plan.add(u); }
  let failed = null;
  const guess = (u) => sizes.get(u) || SIZES[rel(u)] || 20000;
  const update = () => {
    let have = 0, total = 0;
    for (const u of new Set([...plan, ...seen])) { const s = Math.max(guess(u), got.get(u) || 0); total += s; have += Math.min(got.get(u) || 0, s); }
    const cur = [...active].pop();
    set(total ? (have / total) * 90 : 0, cur ? `Downloading ${nice(cur)}… (${[...seen].filter((u) => done.has(u)).length} of ${Math.max(plan.size, seen.size)} files)` : null);
  };
  const one = async (u) => {
    active.add(u); update();
    const r = await fetch(u, { cache: 'no-cache' }).catch(() => null);
    if (!r || !r.ok) { failed = { file: u, why: r ? 'error ' + r.status : 'no connection' }; active.delete(u); return []; }
    let text = '';
    if (r.body && r.body.getReader) {
      const rd = r.body.getReader(), dec = new TextDecoder(); let n = 0;
      for (;;) { const { value, done: end } = await rd.read(); if (end) break; n += value.length; text += dec.decode(value, { stream: true }); got.set(u, n); update(); }
      text += dec.decode();
    } else text = await r.text();
    sizes.set(u, got.get(u) || text.length); got.set(u, got.get(u) || text.length); active.delete(u); done.add(u); update();
    const next = []; let m; IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(text))) next.push(new URL(m[1], u).href);
    return next;
  };
  if (need) {
    let queue = urls.slice();
    for (const u of queue) seen.add(u);
    while (queue.length && !failed) {
      const batch = queue.splice(0, 6);
      const found = (await Promise.all(batch.map(one))).flat();
      for (const u of found) if (!seen.has(u) && !done.has(u)) { seen.add(u); queue.push(u); }
    }
    if (failed) { showError(root, `Couldn't download ${nice(failed.file)} (${failed.why}).`, failed.file); throw new Error('load failed'); }
  }

  // 2) start the code (90 - 99%)
  const mods = [];
  for (let i = 0; i < urls.length; i++) {
    set(90 + (i / urls.length) * 9, `Starting ${nice(urls[i])}…`);
    await new Promise((r) => requestAnimationFrame(() => r()));
    try { mods.push(await import(urls[i])); }
    catch (e) { showError(root, `Couldn't start ${nice(urls[i])}: ${e.message}`, urls[i]); throw e; }
  }
  set(99, 'Building the world…');
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  return mods;
}

function showError(root, text, file) {
  const path = new URL(file).pathname.replace(/^\//, 'public/');
  root.replaceChildren(el('div', { class: 'panel-note' },
    el('h3', {}, 'This part of Blockyard didn’t load'),
    el('p', {}, text),
    el('p', { class: 'small' }, `If you run this site: make sure ${path} is uploaded, then refresh.`),
    el('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, 'Try again')));
}
