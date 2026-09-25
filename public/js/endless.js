// Builds Rush courses out of hand-made chunks. Same seed = same course,
// so the server can rebuild a daily course and check a replay on it.
// Every chunk here was checked by the level bot (see README).

const H = 14; // rows 0-1 ceiling, rows 12-13 floor, rows 2-11 open

// Each chunk: form, difficulty (1-3), width, and rows to fill in.
// Row numbers are real rows. Row 12 is the floor: '#' ground, '.' pit, 'L' lava.
const C = (form, diff, w, rows) => ({ form, diff, w, rows });
const col = (from, to, x, str) => { const r = {}; for (let y = from; y <= to; y++) r[y] = ' '.repeat(x) + str; return r; };
const merge = (...parts) => {
  const out = {};
  for (const p of parts) for (const y in p) {
    const a = out[y] || '', b = p[y];
    let s = '';
    for (let i = 0; i < Math.max(a.length, b.length); i++) { const cb = b[i]; s += cb && cb !== ' ' && cb !== '.' ? cb : (a[i] || cb || ' '); }
    out[y] = s;
  }
  return out;
};

export const CHUNKS = [
  // Hopper
  C('hopper', 1, 14, { 10: '.....o', 11: '.....^' }),
  C('hopper', 1, 16, { 10: '......oo', 11: '......^^' }),
  C('hopper', 1, 16, { 10: '.....oo', 11: '....XXXX^^' }),
  C('hopper', 1, 16, { 9: '......oo', 12: '#####....#######' }),
  C('hopper', 2, 16, { 9: '.......o', 11: '......^^^' }),
  C('hopper', 2, 20, merge(col(9, 10, 8, 'XXXXXXXX'), { 8: '.........ooo', 11: '.....^^^XXXXXXXX', 12: '####B###############' })),
  C('hopper', 2, 18, { 8: '........y', 12: '#####......#######' }),
  C('hopper', 2, 20, { 8: '...........oo', 9: '...........XX', 10: '.......XX..XX', 11: '...XX..XX..XX' }),
  C('hopper', 3, 18, { 7: '....XXXXXXXXXX', 11: '.......^....^' }),
  { ...C('hopper', 3, 20, { 11: '....^^...^^...^^' }), notFast: true },
  // Jet
  C('jet', 1, 20, merge(col(7, 11, 5, 'XX'), col(2, 6, 13, 'XX'), { 4: '.....oo', 9: '.............oo' })),
  C('jet', 2, 18, merge(col(2, 5, 4, 'XXXXXXXXX'), col(9, 11, 4, 'XXXXXXXXX'), { 7: '.....ooooooo' })),
  C('jet', 2, 20, merge(col(5, 8, 9, 'XX'), { 11: '^^^^^^^^^^^^^^^^^^^^', 3: '.........oo' })),
  { ...C('jet', 3, 24, merge(col(6, 11, 4, 'XX'), col(2, 7, 12, 'XX'), col(6, 11, 20, 'XX'))), notFast: true },
  // Dart
  C('dart', 1, 20, merge(col(7, 11, 5, 'XX'), col(2, 6, 12, 'XX'), { 4: '.....oo' })),
  C('dart', 2, 26, merge(col(6, 11, 4, 'XX'), col(2, 7, 11, 'XX'), col(6, 11, 18, 'XX'), col(2, 7, 24, 'XX'))),
  C('dart', 3, 18, merge(col(2, 5, 4, 'XXXXXXXXX'), col(9, 11, 4, 'XXXXXXXXX'))),
  // Flapper
  C('flapper', 1, 20, merge(col(7, 10, 6, 'XX'), col(2, 5, 14, 'XX'), { 11: '^^^^^^^^^^^^^^^^^^^^', 5: '......oo' })),
  C('flapper', 2, 20, merge(col(2, 4, 5, 'XX'), col(8, 10, 10, 'XX'), col(2, 5, 16, 'XX'), { 11: '^^^^^^^^^^^^^^^^^^^^' })),
  // Glider
  C('glider', 1, 20, merge(col(6, 7, 8, 'XX'), { 2: 'vvvvvvvvvvvvvvvvvvvv', 11: '^^^^^^^^^^^^^^^^^^^^', 4: '........oo' })),
  C('glider', 2, 22, merge(col(3, 6, 6, 'XX'), col(7, 10, 15, 'XX'), { 2: 'vvvvvvvvvvvvvvvvvvvvvv', 11: '^^^^^^^^^^^^^^^^^^^^^^' })),
  // Roller
  C('roller', 1, 20, { 11: '........^^^^', 3: '.........oo' }),
  C('roller', 2, 24, { 11: '......^^^^', 2: '...............vvvv' }),
  // Snapper
  C('snapper', 1, 22, { 12: '#####LLLLLL#####', 2: '..............vvvv', 3: '......oo' }),
  C('snapper', 2, 24, { 12: '####LLLLL#########LLLLL#', 2: '............vvvv' }),
  // Springer
  C('springer', 1, 20, { 11: '.....X....XX..^^', 10: '..........XX' }),
  C('springer', 2, 22, merge(col(9, 11, 6, 'XX'), col(10, 11, 15, 'XX'), { 11: '......XX^^^....XX', 8: '......oo' })),
];

const PORTAL = { hopper: 'h', jet: 'j', roller: 'l', flapper: 'f', dart: 'd', springer: 's', snapper: 'z', glider: 'w' };
const FLYING = new Set(['jet', 'dart', 'flapper', 'glider']);
const UNLOCK = { hopper: 0, jet: 100, dart: 220, roller: 220, flapper: 350, glider: 350, springer: 480, snapper: 480 };

export function rng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let s = h >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// opts: { length (tiles), name, theme, ramp: true makes it faster and harder the further you go }
export function buildCourse(seed, { length = 2400, name = 'Endless Rush', theme = 'night', ramp = true, maxDiff = 3 } = {}) {
  const rand = rng(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const cols = []; // each column is an array of H chars
  const empty = () => { const c = Array(H).fill('.'); c[0] = c[1] = 'X'; c[12] = c[13] = '#'; return c; };
  const pushEmpty = (n) => { for (let i = 0; i < n; i++) cols.push(empty()); };
  const portalCol = (ch) => { const c = empty(); for (let y = 2; y <= 11; y++) c[y] = ch; cols.push(c); };
  pushEmpty(10);
  cols[2][11] = 'S';
  let form = 'hopper', speed = '~';
  while (cols.length < length) {
    const dist = cols.length;
    const tier = !ramp ? maxDiff : dist < 250 ? 1 : dist < 700 ? 2 : maxDiff;
    const wantSpeed = !ramp ? '~' : dist < 600 ? '~' : dist < 1500 ? '>' : '*';
    let next = form;
    if (dist >= 30) {
      const forms = Object.keys(UNLOCK).filter((f) => UNLOCK[f] <= (ramp ? dist : 999) && f !== form);
      if (forms.length) next = pick(forms);
    }
    if (next !== form || wantSpeed !== speed) {
      portalCol('n');
      portalCol(PORTAL[next]);
      if (wantSpeed !== speed) { portalCol(wantSpeed); speed = wantSpeed; }
      pushEmpty(FLYING.has(next) ? 4 : 8);
    }
    form = next;
    const pool = CHUNKS.filter((c) => c.form === form && c.diff <= tier && !(speed === '*' && c.notFast));
    const n = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const ch = pick(pool);
      for (let x = 0; x < ch.w; x++) {
        const c = empty();
        for (const y in ch.rows) {
          const t = ch.rows[y][x];
          if (!t || t === ' ') continue;
          c[y] = t;
          if (+y === 12) c[13] = t === '.' ? '.' : '#';
        }
        cols.push(c);
      }
      pushEmpty(3);
    }
  }
  portalCol('n'); portalCol('h'); pushEmpty(6);
  const end = empty(); for (let y = 2; y <= 11; y++) end[y] = 'G'; cols.push(end);
  pushEmpty(4);
  const w = cols.length;
  let d = '';
  for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) d += cols[x][y];
  return { v: 2, n: name, style: 'rush', theme, form: 'hopper', speed: '~', w, h: H, d };
}

// The daily course: same for everyone on the same date (UTC).
export function todayUTC(date = new Date()) { return date.toISOString().slice(0, 10); }
export function dailyCourse(dateStr) {
  const themes = ['meadow', 'dunes', 'frost', 'night', 'volcano'];
  const r = rng('theme' + dateStr);
  return buildCourse('daily-' + dateStr, { length: 300, name: 'Daily ' + dateStr, theme: themes[Math.floor(r() * themes.length)], ramp: false, maxDiff: 2 });
}
export function endlessCourse(seed) { return buildCourse('endless-' + seed, { length: 2400 }); }
