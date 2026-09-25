// Records the buttons pressed on every physics step, so a run can be played back exactly.
// The server uses runReplay() to check that a level was really beaten.
import { createGame, step } from './engine2d.js';

// bits: 1 = left, 2 = right, 4 = jump held, 8 = jump pressed this step
export const inputBits = (i) => (i.left ? 1 : 0) | (i.right ? 2 : 0) | (i.hold ? 4 : 0) | (i.pressed ? 8 : 0);

// ["4.30", "0.12", ...] -> "4.30,0.12". Numbers are base 36 to keep it short.
export function encodeReplay(frames) {
  const out = [];
  for (let i = 0; i < frames.length;) {
    let j = i;
    while (j < frames.length && frames[j] === frames[i]) j++;
    out.push(frames[i].toString(36) + (j - i > 1 ? '.' + (j - i).toString(36) : ''));
    i = j;
  }
  return out.join(',');
}

export function decodeReplay(str, maxSteps) {
  if (typeof str !== 'string' || str.length > 400000 || !/^[0-9a-z.,]*$/.test(str)) throw new Error('That run recording is broken.');
  const runs = [];
  let total = 0;
  for (const part of str.split(',')) {
    if (!part) continue;
    const [b, c] = part.split('.');
    const bits = parseInt(b, 36), count = c ? parseInt(c, 36) : 1;
    if (!(bits >= 0 && bits < 16) || !(count > 0)) throw new Error('That run recording is broken.');
    total += count;
    if (total > maxSteps) throw new Error(`That run is too long to check. Winning runs can be up to ${Math.round(maxSteps / 120)} seconds.`);
    runs.push([bits, count]);
  }
  return runs;
}

// Plays the recording on the level. stopOnDeath: for endless and daily runs, one life only.
export function runReplay(level, str, { maxSteps = 14400, stopOnDeath = false } = {}) {
  const runs = decodeReplay(str, maxSteps);
  const G = createGame(level);
  const input = { left: false, right: false, hold: false, pressed: false };
  let steps = 0;
  for (const [bits, count] of runs) {
    for (let i = 0; i < count; i++) {
      input.left = !!(bits & 1); input.right = !!(bits & 2); input.hold = !!(bits & 4); input.pressed = !!(bits & 8);
      step(G, input);
      G.events.length = 0;
      steps++;
      if (G.won) return { won: true, progress: 1, steps, time: G.runTime, deaths: G.runDeaths, coins: G.coins, x: G.p.x };
      if (stopOnDeath && G.dead) return { won: false, progress: G.best, steps, coins: G.coins, x: G.p.x };
    }
  }
  return { won: false, progress: G.best, steps, coins: G.coins, x: G.p.x };
}
