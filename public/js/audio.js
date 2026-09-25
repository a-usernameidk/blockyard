// Tiny sound effects made from beeps, so there are no sound files to load.
import { store } from './api.js';

let ac = null;
let muted = store.get('muted', false);

export function isMuted() { return muted; }
export function setMuted(m) { muted = m; store.set('muted', m); if (m) stopMusic(); }

// Browsers only allow sound after a click or key press.
export function unlockAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; }
}

function tone(freq, dur, { type = 'square', vol = 0.06, slide = 0, delay = 0 } = {}) {
  if (!ac || muted) return;
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
};

export function sfx(name) { const s = SOUNDS[name]; if (s) s(); }

/* ---------------- music: tiny looping tunes made from beeps ---------------- */
let musicOn = store.get('music', true);
let timer = 0, nextTime = 0, stepN = 0, song = null;
export function isMusicOn() { return musicOn; }
export function setMusicOn(on) { musicOn = on; store.set('music', on); if (!on) stopMusic(); }

// Notes are semitones above A3 (0 = A3). null = rest. 16 steps per bar.
const SONGS = {
  adventure: {
    bpm: 112,
    lead: [7, null, 10, null, 12, null, 10, 7, 5, null, 7, null, 3, null, null, null, 7, null, 10, null, 12, null, 15, 14, 12, null, 10, null, 7, null, null, null],
    bass: [-12, null, null, null, -5, null, null, null, -9, null, null, null, -7, null, null, null],
  },
  rush: {
    bpm: 150,
    lead: [12, 12, 15, 12, 17, null, 15, 12, 10, 10, 12, 10, 7, null, 10, null, 12, 12, 15, 12, 19, null, 17, 15, 14, null, 12, null, 10, 12, 14, null],
    bass: [-12, null, -12, null, -9, null, -9, null, -5, null, -5, null, -7, null, -7, null],
  },
};
const freq = (n) => 220 * Math.pow(2, n / 12);

export function startMusic(name) {
  stopMusic();
  if (!musicOn || muted) return;
  unlockAudio();
  if (!ac) return;
  song = SONGS[name]; stepN = 0; nextTime = ac.currentTime + 0.1;
  timer = setInterval(schedule, 60);
}
export function stopMusic() { clearInterval(timer); timer = 0; song = null; }
function schedule() {
  if (!song || !ac) return;
  const len = 60 / song.bpm / 4;
  while (nextTime < ac.currentTime + 0.25) {
    const d = nextTime - ac.currentTime;
    const l = song.lead[stepN % song.lead.length], b = song.bass[stepN % song.bass.length];
    if (l !== null) tone(freq(l), len * 0.9, { type: 'square', vol: 0.018, delay: d });
    if (b !== null) tone(freq(b), len * 1.8, { type: 'triangle', vol: 0.05, delay: d });
    if (stepN % 4 === 0) tone(60, 0.05, { type: 'sine', vol: 0.05, delay: d, slide: -20 });
    nextTime += len; stepN++;
  }
}
