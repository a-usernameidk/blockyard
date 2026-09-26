// Records the buttons pressed on every physics step, so a run can be played back exactly.
// The server uses runReplay() (2D) and runReplay3d() in physics3d.js to check that a run really happened.
import { createGame, step } from './engine2d.js';

// bits: 1 = left, 2 = right, 4 = jump held, 8 = jump pressed this step
export const inputBits = (i) => (i.left ? 1 : 0) | (i.right ? 2 : 0) | (i.hold ? 4 : 0) | (i.pressed ? 8 : 0);

// [4, 4, 4, 0] -> "4.3,0". Numbers are base 36 to keep it short.
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

// maxValue: 16 for 2D runs, 8192 for 3D runs. rate: steps per second (for the error message).
// truncate: keep the first maxSteps steps instead of refusing a run that's too long.
export function decodeReplay(str, maxSteps, { maxValue = 16, rate = 120, truncate = false } = {}) {
  if (typeof str !== 'string' || str.length > 600000 || !/^[0-9a-z.,]*$/.test(str)) throw new Error('That run recording is broken.');
  const runs = [];
  let total = 0;
  for (const part of str.split(',')) {
    if (!part) continue;
    const [b, c] = part.split('.');
    const bits = parseInt(b, 36);
    let count = c ? parseInt(c, 36) : 1;
    if (!(bits >= 0 && bits < maxValue) || !(count > 0)) throw new Error('That run recording is broken.');
    if (total + count > maxSteps) {
      if (!truncate) throw new Error(`That run is too long to check. Runs can be up to ${Math.round(maxSteps / rate)} seconds.`);
      count = maxSteps - total;
      if (count > 0) runs.push([bits, count]);
      break;
    }
    total += count;
    runs.push([bits, count]);
  }
  return runs;
}

// Plays the recording on the level. stopOnDeath: for endless and daily runs, one life only.
export function runReplay(level, str, { maxSteps = 14400, stopOnDeath = false, truncate = false } = {}) {
  const runs = decodeReplay(str, maxSteps, { truncate });
  const G = createGame(level);
  const input = { left: false, right: false, hold: false, pressed: false };
  let steps = 0;
  const out = (won) => ({ won, progress: won ? 1 : G.best, steps, time: G.runTime, deaths: G.runDeaths, coins: G.coins, totalCoins: G.totalCoins, x: G.p.x, dead: !!G.dead });
  for (const [bits, count] of runs) {
    for (let i = 0; i < count; i++) {
      input.left = !!(bits & 1); input.right = !!(bits & 2); input.hold = !!(bits & 4); input.pressed = !!(bits & 8);
      step(G, input);
      G.events.length = 0;
      steps++;
      if (G.won) return out(true);
      if (stopOnDeath && G.dead) return out(false);
    }
  }
  return out(false);
}
