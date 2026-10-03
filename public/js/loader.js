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
const SIZES = {"build3d.js":42916,"gl.js":29276,"world.js":20488,"format.js":9644,"logic.js":12045,"cosmetics.js":20711,"mesh3d.js":11738,"gl2.js":61231,"partsmesh.js":7186,"parts.js":15197,"bscript.js":27838,"grass.js":5058,"avatar3d.js":19004,"net.js":1909,"api.js":12232,"audio.js":13212,"play3d.js":118514,"loader.js":14601,"app.js":6941,"art.js":32237,"progress.js":19220,"levels.js":186646,"physics3d.js":20920,"replay.js":2804,"engine2d.js":22008,"phys2.js":27769,"musicbox.js":4357,"games.js":5122,"pfp.js":1835,"emoji.js":17836,"names.js":2191,"settings.js":5384,"bots3d.js":10967,"tycoon.js":33371,"controls.js":3598,"logicEditor.js":9043,"build2.js":45377,"bsdocs.js":11174};
const PLANS = {"build3d.js":["build3d.js","gl.js","world.js","format.js","logic.js","cosmetics.js","mesh3d.js","gl2.js","partsmesh.js","parts.js","bscript.js","grass.js","avatar3d.js","net.js","api.js","audio.js","play3d.js","loader.js","app.js","art.js","progress.js","levels.js","physics3d.js","replay.js","engine2d.js","phys2.js","musicbox.js","games.js","pfp.js","emoji.js","names.js","settings.js","bots3d.js","tycoon.js","controls.js","logicEditor.js"],"build2.js":["build2.js","gl.js","world.js","format.js","logic.js","cosmetics.js","mesh3d.js","gl2.js","partsmesh.js","parts.js","bscript.js","grass.js","loader.js","app.js","art.js","progress.js","api.js","levels.js","bsdocs.js","phys2.js","physics3d.js","replay.js","engine2d.js","play3d.js","avatar3d.js","net.js","audio.js","musicbox.js","games.js","pfp.js","emoji.js","names.js","settings.js","bots3d.js","tycoon.js","controls.js"],"play3d.js":["play3d.js","gl.js","world.js","format.js","logic.js","cosmetics.js","mesh3d.js","gl2.js","partsmesh.js","parts.js","bscript.js","grass.js","loader.js","app.js","art.js","progress.js","api.js","levels.js","physics3d.js","replay.js","engine2d.js","phys2.js","avatar3d.js","net.js","audio.js","musicbox.js","games.js","pfp.js","emoji.js","names.js","settings.js","bots3d.js","tycoon.js","controls.js"]};
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
  const fails = []; // { file, code, why }
  const guess = (u) => sizes.get(u) || SIZES[rel(u)] || 20000;
  const update = () => {
    let have = 0, total = 0;
    for (const u of new Set([...plan, ...seen])) { const s = Math.max(guess(u), got.get(u) || 0); total += s; have += Math.min(got.get(u) || 0, s); }
    const cur = [...active].pop();
    set(total ? (have / total) * 90 : 0, cur ? `Downloading ${nice(cur)}… (${[...seen].filter((u) => done.has(u)).length} of ${Math.max(plan.size, seen.size)} files)` : null);
  };
  const one = async (u) => {
    active.add(u); update();
    const stop = new AbortController(), timer = setTimeout(() => stop.abort(), 30000);
    const bad = (code, why) => { fails.push({ file: u, code, why }); active.delete(u); clearTimeout(timer); return []; };
    let r;
    try { r = await fetch(u, { cache: 'no-cache', signal: stop.signal }); }
    catch (e) { return stop.signal.aborted ? bad('BY-107', 'took more than 30 seconds') : bad(navigator.onLine === false ? 'BY-103' : 'BY-108', navigator.onLine === false ? 'you are offline' : 'the download was cut off (' + (e.message || 'network error') + ')'); }
    if (r.status === 404) return bad('BY-101', 'not found on the site (404)');
    if (r.status === 401 || r.status === 403) return bad('BY-104', 'blocked (' + r.status + ')');
    if (r.status >= 500) return bad('BY-102', 'the server had a problem (' + r.status + ')');
    if (!r.ok) return bad('BY-106', 'error ' + r.status);
    let text = '';
    try {
      if (r.body && r.body.getReader) {
        const rd = r.body.getReader(), dec = new TextDecoder(); let n = 0;
        for (;;) { const { value, done: end } = await rd.read(); if (end) break; n += value.length; text += dec.decode(value, { stream: true }); got.set(u, n); update(); }
        text += dec.decode();
      } else text = await r.text();
    } catch (e) { return stop.signal.aborted ? bad('BY-107', 'took more than 30 seconds') : bad('BY-108', 'the download was cut off'); }
    clearTimeout(timer);
    // a missing file can come back as the home page (HTML) instead of a 404
    if (/html/i.test(r.headers.get('content-type') || '') || /^\s*</.test(text)) return bad('BY-105', 'the site sent a web page instead of the code (the file is probably missing)');
    if (!text.trim()) return bad('BY-109', 'the file is empty');
    sizes.set(u, got.get(u) || text.length); got.set(u, got.get(u) || text.length); active.delete(u); done.add(u); update();
    const next = []; let m; IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(text))) next.push(new URL(m[1], u).href);
    return next;
  };
  if (need) {
    // check every file (the map's list too, so files needed by a missing file are checked as well)
    let queue = [...new Set([...urls, ...plan])];
    for (const u of queue) seen.add(u);
    while (queue.length) {
      const batch = queue.splice(0, 6);
      const found = (await Promise.all(batch.map(one))).flat();
      for (const u of found) if (!seen.has(u) && !done.has(u)) { seen.add(u); queue.push(u); }
    }
    if (fails.length) {
      const codes = [...new Set(fails.map((x) => x.code))];
      showError(root, { code: codes.join(' '), title: fails.length === 1 ? 'A file didn\u2019t download' : `${fails.length} files didn\u2019t download`,
        list: fails.map((x) => `${x.code}: ${nice(x.file)} (${pathOf(x.file)}): ${x.why}`), fix: codes.map((c) => ERRORS[c]).filter(Boolean) });
      throw new Error('load failed');
    }
  }

  // 2) start the code (90 - 99%)
  const mods = [];
  for (let i = 0; i < urls.length; i++) {
    set(90 + (i / urls.length) * 9, `Starting ${nice(urls[i])}…`);
    await new Promise((r) => requestAnimationFrame(() => r()));
    try { mods.push(await import(urls[i])); }
    catch (e) {
      const msg = String(e && e.message || e);
      const code = /export named|provide an export|does not provide/i.test(msg) ? 'BY-202' : /SyntaxError|Unexpected|Invalid or unexpected/i.test(e.name + msg) ? 'BY-201' : /Failed to fetch|dynamically imported module|Importing a module script failed/i.test(msg) ? 'BY-204' : 'BY-203';
      showError(root, { code, title: 'The code didn\u2019t start', list: [`${code}: ${nice(urls[i])}: ${msg}`], fix: [ERRORS[code]] });
      throw e;
    }
  }
  set(99, 'Building the world…');
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  return mods;
}

// What each error code means and how to fix it (also in the README under "Error codes").
export const ERRORS = {
  'BY-101': 'A code file is missing from the site. Upload it to GitHub in the folder shown (public/js/...), wait for Cloudflare to finish, then refresh.',
  'BY-102': 'Cloudflare had a problem sending the file. Wait a minute and try again. If it keeps happening, check the Worker in the Cloudflare dashboard.',
  'BY-103': 'This computer is offline. Check the Wi-Fi and try again.',
  'BY-104': 'Something blocked the file (a school or work filter, an ad blocker, or the site settings). Try turning off the blocker for this site.',
  'BY-105': 'The site sent back a web page instead of the code file, so the file is almost surely not uploaded (or it is in the wrong folder).',
  'BY-106': 'The site answered with an unusual error. Try again, then check the Cloudflare deploy.',
  'BY-107': 'A file took more than 30 seconds. The internet is very slow or something is holding it up. Try again.',
  'BY-108': 'The download stopped halfway (network trouble, or an extension blocked it). Try again.',
  'BY-109': 'A code file on the site is empty. Upload it again (it probably got cut off).',
  'BY-201': 'A code file is broken (it has a typing mistake or got cut off). Upload that file again from the newest zip.',
  'BY-202': 'The code files are from different updates (one file needs something a newer version of another file has). Upload ALL files from the newest full zip.',
  'BY-203': 'The code crashed while starting. Send the details to the Blockyard admins.',
  'BY-204': 'The browser could not load one of the files it needs. Refresh with Ctrl+Shift+R. If it keeps happening, upload the newest full zip.',
  'BY-301': 'This browser has no WebGL 2 (newer 3D graphics). Turn on "Use graphics acceleration when available" in Chrome settings > System, restart Chrome, and update your graphics driver.',
  'BY-302': 'The HD graphics started but then failed on this graphics card. Update Windows and the graphics driver. On Snapdragon laptops, make sure Chrome is the ARM64 version (chrome://settings/help).',
  'BY-303': 'This browser has 3D graphics (WebGL) turned off completely. Turn on graphics acceleration in the browser settings.',
};
export const VERSION = '16.2';
const pathOf = (u) => { try { return new URL(u).pathname.replace(/^\//, 'public/'); } catch { return u; } };

// Everything useful for finding a problem, as text to copy and send.
export function debugInfo(extra = []) {
  let gpu = 'unknown', webgl2 = false, webgl1 = false;
  try {
    const c = document.createElement('canvas'); const g2 = c.getContext('webgl2'); webgl2 = !!g2;
    const g = g2 || document.createElement('canvas').getContext('webgl'); webgl1 = !!g;
    const x = g && g.getExtension('WEBGL_debug_renderer_info'); if (x) gpu = g.getParameter(x.UNMASKED_RENDERER_WEBGL);
  } catch { /* no 3D at all */ }
  return [
    'Blockyard update ' + VERSION, 'Time: ' + new Date().toISOString(), 'Page: ' + location.href,
    ...extra,
    'Browser: ' + navigator.userAgent, 'Platform: ' + (navigator.userAgentData ? navigator.userAgentData.platform : navigator.platform),
    'Screen: ' + screen.width + 'x' + screen.height + ' @' + devicePixelRatio + 'x', 'Online: ' + navigator.onLine,
    'WebGL 2: ' + webgl2 + ', WebGL 1: ' + webgl1, 'Graphics card: ' + gpu, 'HD error: ' + (window.__hdError || 'none'),
  ].join('\n');
}

// The error box: code, what happened, how to fix it, Try again + Copy details.
export function showError(root, { code, title, list = [], fix = [], extra = [] }) {
  const details = debugInfo(['Error: ' + code, ...list]);
  const copy = el('button', { class: 'btn', type: 'button', onclick: async () => {
    try { await navigator.clipboard.writeText(details); copy.textContent = 'Copied!'; }
    catch { pre.hidden = false; copy.textContent = 'Select the text below'; }
  } }, 'Copy details');
  const pre = el('pre', { class: 'err-details' }, details); pre.hidden = true;
  const more = el('button', { class: 'btn', type: 'button', onclick: () => { pre.hidden = !pre.hidden; more.textContent = pre.hidden ? 'Show details' : 'Hide details'; } }, 'Show details');
  root.replaceChildren(el('div', { class: 'panel-note err-box' },
    el('div', { class: 'err-top' }, el('span', { class: 'err-code' }, code), el('h3', {}, title)),
    list.length ? el('ul', { class: 'err-list' }, ...list.map((t) => el('li', {}, t))) : null,
    ...extra,
    fix.length ? el('div', { class: 'err-fix' }, el('b', {}, 'How to fix it'), ...[...new Set(fix)].map((t) => el('p', { class: 'small' }, t))) : null,
    el('div', { class: 'row err-btns' },
      el('button', { class: 'btn btn-grass', type: 'button', onclick: () => location.reload() }, 'Try again'), copy, more),
    pre));
  console.warn('[Blockyard ' + code + ']\n' + details);
}
