// Tiny sound effects made from beeps, so there are no sound files to load.
import { store } from './api.js';

let ac = null;
let muted = store.get('muted', false);

export function isMuted() { return muted; }

// Three volume sliders (Settings > Sound): music, game sound effects, and menu / chat / pop-up sounds.
export const VOLUMES = [['music', 'Music'], ['sfx', 'Sound effects'], ['ui', 'Menus, chat and pop-ups']];
let vol = { music: 1, sfx: 1, ui: 1, ...(store.get('vol', {}) || {}) };
for (const k of Object.keys(vol)) { const v = Number(vol[k]); vol[k] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; }
export const getVolume = (bus) => vol[bus] ?? 1;
export function setVolume(bus, v) { vol = { ...vol, [bus]: Math.max(0, Math.min(1, Number(v) || 0)) }; store.set('vol', vol); }
const UI_SOUNDS = new Set(['chat', 'send', 'open', 'close', 'pop', 'notify', 'leave', 'join', 'error', 'buy', 'badge']);
export function setMuted(m) { muted = m; store.set('muted', m); if (m) { halt(); emit(); } else if (gameSong || preview) play(); }

// Browsers only allow sound after a click or key press.
export function unlockAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; }
}

let bus = 'sfx'; // which slider the sound being played right now listens to
function tone(freq, dur, { type = 'square', vol: loud = 0.06, slide = 0, delay = 0, on = bus } = {}) {
  if (!ac || muted) return;
  const vol = loud * (vol0(on));
  if (vol <= 0.0002) return;
  const t0 = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ac.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  jump: () => tone(330, 0.12, { slide: 300 }),
  flap: () => tone(420, 0.08, { slide: 200, vol: 0.04 }),
  flip: () => tone(500, 0.1, { slide: -250, type: 'triangle', vol: 0.08 }),
  coin: () => { tone(988, 0.06, { vol: 0.05 }); tone(1319, 0.12, { vol: 0.05, delay: 0.06 }); },
  key: () => { tone(660, 0.08, { type: 'triangle', vol: 0.08 }); tone(880, 0.08, { type: 'triangle', vol: 0.08, delay: 0.08 }); tone(1100, 0.14, { type: 'triangle', vol: 0.08, delay: 0.16 }); },
  door: () => tone(160, 0.25, { type: 'sawtooth', slide: -60, vol: 0.05 }),
  bounce: () => tone(200, 0.22, { slide: 600, type: 'triangle', vol: 0.09 }),
  ring: () => tone(700, 0.12, { slide: 500, type: 'triangle', vol: 0.08 }),
  portal: () => { tone(520, 0.1, { type: 'triangle', vol: 0.07 }); tone(780, 0.14, { type: 'triangle', vol: 0.07, delay: 0.07 }); },
  snap: () => tone(900, 0.07, { slide: -500, vol: 0.05 }),
  land: () => tone(90, 0.12, { type: 'triangle', slide: -40, vol: 0.12 }),
  stomp: () => tone(220, 0.12, { slide: -120, vol: 0.08 }),
  crumble: () => tone(120, 0.15, { type: 'sawtooth', vol: 0.04 }),
  checkpoint: () => { tone(523, 0.1, { type: 'triangle', vol: 0.08 }); tone(784, 0.18, { type: 'triangle', vol: 0.08, delay: 0.1 }); },
  die: () => tone(300, 0.35, { type: 'sawtooth', slide: -250, vol: 0.07 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.08, delay: i * 0.11 })),
  chat: () => tone(880, 0.05, { type: 'sine', vol: 0.05 }),
  speed: () => tone(400, 0.2, { slide: 700, type: 'square', vol: 0.04 }),
  place: () => tone(260, 0.05, { type: 'square', vol: 0.05, slide: 60 }),
  break: () => tone(180, 0.07, { type: 'sawtooth', vol: 0.04, slide: -80 }),
  join: () => { tone(660, 0.07, { type: 'sine', vol: 0.05 }); tone(990, 0.1, { type: 'sine', vol: 0.05, delay: 0.07 }); },
  // chat, menus and pop-ups
  send: () => tone(620, 0.07, { type: 'sine', slide: 380, vol: 0.05 }),
  open: () => { tone(440, 0.05, { type: 'triangle', vol: 0.05 }); tone(660, 0.06, { type: 'triangle', vol: 0.05, delay: 0.04 }); },
  close: () => { tone(660, 0.05, { type: 'triangle', vol: 0.04 }); tone(440, 0.06, { type: 'triangle', vol: 0.04, delay: 0.04 }); },
  pop: () => tone(900, 0.06, { type: 'sine', slide: 500, vol: 0.06 }),
  notify: () => { tone(784, 0.08, { type: 'sine', vol: 0.05 }); tone(1047, 0.08, { type: 'sine', vol: 0.05, delay: 0.09 }); tone(1319, 0.12, { type: 'sine', vol: 0.045, delay: 0.18 }); },
  leave: () => { tone(660, 0.07, { type: 'sine', vol: 0.04 }); tone(440, 0.1, { type: 'sine', vol: 0.04, delay: 0.07 }); },
  error: () => tone(160, 0.18, { type: 'square', slide: -40, vol: 0.04 }),
  // games
  tick: () => tone(1000, 0.04, { type: 'square', vol: 0.04 }),
  go: () => { tone(523, 0.08, { type: 'square', vol: 0.05 }); tone(1047, 0.25, { type: 'square', vol: 0.05, delay: 0.08 }); },
  hit: () => tone(240, 0.08, { type: 'square', slide: -120, vol: 0.06 }),
  splat: () => { tone(180, 0.2, { type: 'sawtooth', slide: -120, vol: 0.06 }); tone(90, 0.25, { type: 'triangle', vol: 0.08, delay: 0.05 }); },
  shoot: () => tone(700, 0.06, { type: 'square', slide: -400, vol: 0.035 }),
  tagged: () => { tone(880, 0.06, { type: 'square', vol: 0.05 }); tone(440, 0.12, { type: 'square', vol: 0.05, delay: 0.06 }); },
  buy: () => [880, 1109, 1319, 1760].forEach((f, i) => tone(f, 0.07, { type: 'triangle', vol: 0.05, delay: i * 0.05 })),
  badge: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, { type: 'triangle', vol: 0.07, delay: i * 0.09 })),
  whoosh: () => tone(200, 0.25, { type: 'sawtooth', slide: 900, vol: 0.03 }),
};

const vol0 = (b) => { const v = getVolume(b); return v * v; }; // squared: the slider feels even from quiet to loud
export function sfx(name) { const s = SOUNDS[name]; if (!s) return; bus = UI_SOUNDS.has(name) ? 'ui' : 'sfx'; try { s(); } finally { bus = 'sfx'; } }

/* ---------------- music: tiny looping tunes made from beeps ---------------- */
let musicOn = store.get('music', true);
let timer = 0, nextTime = 0, stepN = 0, song = null;
export function isMusicOn() { return musicOn; }
export function setMusicOn(on) { musicOn = on; store.set('music', on); if (!on) { halt(); emit(); } else if (gameSong || preview) play(); }

// Notes are semitones above A3 (0 = A3). null = rest. 16 steps per bar.
const SONGS = {
  adventure: {
    bpm: 112,
    lead: [7, null, 10, null, 12, null, 10, 7, 5, null, 7, null, 3, null, null, null, 7, null, 10, null, 12, null, 15, 14, 12, null, 10, null, 7, null, null, null],
    bass: [-12, null, null, null, -5, null, null, null, -9, null, null, null, -7, null, null, null],
  },
  chill: {
    bpm: 92,
    lead: [12, null, null, 15, null, 19, null, null, 17, null, 15, null, 12, null, null, null, 10, null, null, 12, null, 15, null, null, 14, null, 12, null, 10, null, null, null],
    bass: [-12, null, null, null, -8, null, null, null, -10, null, null, null, -5, null, null, null],
  },
  rush: {
    bpm: 150,
    lead: [12, 12, 15, 12, 17, null, 15, 12, 10, 10, 12, 10, 7, null, 10, null, 12, 12, 15, 12, 19, null, 17, 15, 14, null, 12, null, 10, 12, 14, null],
    bass: [-12, null, -12, null, -9, null, -9, null, -5, null, -5, null, -7, null, -7, null],
  },
};
// more little tunes: Snowy Town, minigames, space and volcano levels
Object.assign(SONGS, {
  snow: {
    bpm: 100,
    lead: [19, null, 17, null, 15, null, 12, null, 14, null, 15, null, 17, null, null, null, 19, null, 22, null, 19, null, 17, 15, 14, null, 12, null, 14, null, null, null],
    bass: [-5, null, null, null, -9, null, null, null, -7, null, null, null, -12, null, null, null],
  },
  game: {
    bpm: 132,
    lead: [12, null, 12, 15, null, 12, 17, null, 15, null, 12, null, 10, 12, null, null, 12, null, 12, 15, null, 17, 19, null, 22, null, 19, null, 17, null, 15, null],
    bass: [-12, -12, null, -12, -9, -9, null, -9, -5, -5, null, -5, -7, -7, null, -7],
  },
  space: {
    bpm: 84,
    lead: [7, null, null, 12, null, null, 14, null, 19, null, null, 17, null, 14, null, null, 12, null, null, 14, null, null, 10, null, 7, null, null, null, 5, null, null, null],
    bass: [-17, null, null, null, null, null, null, null, -14, null, null, null, null, null, null, null],
  },
  volcano: {
    bpm: 126,
    lead: [0, null, 3, null, 0, null, 6, 5, 3, null, 0, null, -2, null, 0, null, 0, null, 3, null, 7, null, 6, 5, 3, null, 5, null, 3, null, 0, null],
    bass: [-24, null, -24, null, -21, null, -21, null, -19, null, -19, null, -18, null, -18, null],
  },
});
// Songs you buy in the Shop (Shop > Music). wave = the lead's sound (square by default).
const _ = null;
Object.assign(SONGS, {
  sunny: { bpm: 120, lead: [15, _, 19, _, 22, _, 19, _, 20, _, 19, 17, 15, _, _, _, 15, _, 19, _, 22, _, 24, _, 22, _, 20, 19, 17, _, 15, _], bass: [-9, _, -9, _, -4, _, -4, _, -2, _, -2, _, -4, _, -4, _] },
  pixel: { bpm: 140, lead: [12, 15, 19, 15, 12, 15, 19, 22, 21, _, 19, _, 17, _, 15, _, 12, 15, 19, 15, 12, 15, 19, 24, 22, _, 21, _, 19, _, _, _], bass: [-12, _, 0, _, -12, _, 0, _, -9, _, 3, _, -7, _, 5, _] },
  night: { bpm: 100, wave: 'sawtooth', lv: 0.012, lead: [7, _, _, 10, _, _, 12, _, 14, _, 12, _, 10, _, 7, _, 5, _, _, 7, _, _, 10, _, 12, _, 10, _, 7, _, _, _], bass: [-17, _, -17, _, -17, _, -17, _, -19, _, -19, _, -15, _, -15, _] },
  waves: { bpm: 88, wave: 'triangle', lv: 0.05, lead: [12, _, 16, _, 19, _, _, _, 17, _, 16, _, 14, _, _, _, 12, _, 16, _, 19, _, 21, _, 19, _, _, _, _, _, _, _], bass: [-12, _, _, _, -7, _, _, _, -10, _, _, _, -5, _, _, _] },
  dream: { bpm: 96, wave: 'sine', lv: 0.06, lead: [19, _, 17, _, 19, _, 22, _, 24, _, _, _, 22, _, 19, _, 17, _, 15, _, 17, _, 19, _, 15, _, _, _, _, _, _, _], bass: [-9, _, _, _, -14, _, _, _, -12, _, _, _, -7, _, _, _] },
  victory: { bpm: 144, lead: [12, _, 12, 12, 19, _, _, _, 17, _, 19, _, 21, _, 19, _, 12, _, 12, 12, 19, _, _, _, 24, _, 23, _, 24, _, _, _], bass: [-12, _, -12, _, -5, _, -5, _, -7, _, -7, _, -5, _, -5, _] },
  boss: { bpm: 160, wave: 'sawtooth', lv: 0.012, lead: [0, _, 0, 3, _, 0, 6, _, 5, _, 3, _, 0, _, -2, _, 0, _, 0, 3, _, 0, 7, _, 8, _, 7, _, 6, _, 3, _], bass: [-24, -24, _, -24, -21, -21, _, -21, -22, -22, _, -22, -19, -19, _, -19] },
  groove: { bpm: 116, lead: [12, _, _, 12, 15, _, 12, _, _, 10, _, 12, _, _, _, _, 12, _, _, 12, 15, _, 17, _, 15, _, 12, _, 10, _, _, _], bass: [-12, _, -12, -10, _, -12, _, -5, -12, _, -12, -10, _, -7, _, -5] },
  legend: { bpm: 108, lead: [7, _, _, _, 12, _, _, _, 14, _, 15, _, 17, _, _, _, 19, _, 17, _, 15, _, 14, _, 12, _, _, _, _, _, _, _, 7, _, _, _, 12, _, _, _, 14, _, 15, _, 17, _, _, _, 22, _, 19, _, 17, _, 15, _, 19, _, _, _, _, _, _, _], bass: [-17, _, _, _, -12, _, _, _, -14, _, _, _, -10, _, _, _] },
});
export const hasSong = (id) => Object.hasOwn(SONGS, id);
const freq = (n) => 220 * Math.pow(2, n / 12);

// The game asks for its own song (startMusic). The music box can pick one of your songs instead (setSongPick),
// or pause the music. What's playing = your pick if you made one, else the game's song.
let gameSong = null, pick = store.get('song', null), userPaused = false, playing = null, preview = null;
const listeners = new Set();
const emit = () => { for (const f of listeners) try { f(nowPlaying()); } catch (e) { /* a closed box */ } };
export const onMusic = (f) => { listeners.add(f); return () => listeners.delete(f); };
export const nowPlaying = () => ({ playing, gameSong, pick, paused: userPaused, off: !musicOn || muted });
export function setSongPick(id) { pick = id && hasSong(id) ? id : null; store.set('song', pick); if (gameSong) play(); else emit(); }
export function setSongPaused(p) { userPaused = !!p; if (userPaused) halt(); else if (gameSong) play(); emit(); }
export function startMusic(name) { gameSong = SONGS[name] ? name : null; play(); }
export function stopMusic() { gameSong = null; preview = null; halt(); emit(); }
// the Shop's Listen button: plays that song until you stop it (or leave the page)
export function previewSong(id) { preview = id && hasSong(id) ? id : null; if (preview) play(); else if (gameSong) play(); else { halt(); emit(); } }
export const previewing = () => preview;
function halt() { clearInterval(timer); timer = 0; song = null; playing = null; }
function play() {
  halt();
  const name = preview || pick || gameSong;
  if (!name || !musicOn || muted || (userPaused && !preview)) { emit(); return; }
  unlockAudio();
  if (!ac) { emit(); return; }
  song = SONGS[name]; playing = name; stepN = 0; nextTime = ac.currentTime + 0.1;
  timer = setInterval(schedule, 60);
  emit();
}
function schedule() {
  if (!song || !ac) return;
  const len = 60 / song.bpm / 4;
  while (nextTime < ac.currentTime + 0.25) {
    const d = nextTime - ac.currentTime;
    const l = song.lead[stepN % song.lead.length], b = song.bass[stepN % song.bass.length];
    if (l !== null) tone(freq(l), len * 0.9, { type: song.wave || 'square', vol: song.lv || 0.018, delay: d, on: 'music' });
    if (b !== null) tone(freq(b), len * 1.8, { type: 'triangle', vol: 0.05, delay: d, on: 'music' });
    if (stepN % 4 === 0) tone(60, 0.05, { type: 'sine', vol: 0.05, delay: d, slide: -20, on: 'music' });
    nextTime += len; stepN++;
  }
}
