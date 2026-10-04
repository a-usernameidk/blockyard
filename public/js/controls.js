// Your own keys and camera feel. Saved on this computer (Settings > Controls).
// The arrow keys always work too, so nobody can lock themselves out.
import { store } from './api.js';

// [action, what it does, default key]
export const ACTIONS = [
  ['fwd', 'Move forward (2D: jump)', 'KeyW'],
  ['back', 'Move back', 'KeyS'],
  ['left', 'Move left', 'KeyA'],
  ['right', 'Move right', 'KeyD'],
  ['jump', 'Jump', 'Space'],
  ['camL', 'Turn camera left', 'KeyQ'],
  ['camR', 'Turn camera right', 'KeyE'],
  ['respawn', 'Respawn / restart', 'KeyR'],
  ['shift', 'Shift lock', 'ShiftLeft'],
  ['shoot', 'Throw snowball / shoot', 'KeyX'],
  ['shop', 'Open a shop', 'KeyB'],
  ['spec', 'Spectate', 'KeyV'],
  ['bag', 'Backpack (hotbar worlds)', 'Backquote'],
  ['build', 'Build mode (server Builders)', 'KeyG'],
  ['use', 'Use / interact (cars, doors, fishing)', 'KeyF'],
  ['fly', 'Fly on/off (admins)', 'KeyH'],
  ['down', 'Fly down (admins)', 'KeyC'],
];
const DEFAULT = Object.fromEntries(ACTIONS.map(([a, , k]) => [a, k]));
// always on, whatever you pick
const BACKUP = { ArrowUp: 'fwd', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right', ShiftRight: 'shift', ControlLeft: 'down' };
// keys that already mean something everywhere (chat, closing, emotes and hotbar slots)
export const RESERVED = /^(Escape|Enter|NumpadEnter|Slash|Tab|Digit[0-9]|Arrow(Up|Down|Left|Right)|Meta.*|OS.*)$/;

let binds = null;
function load() {
  const saved = store.get('keys', {});
  binds = { ...DEFAULT };
  for (const [a, k] of Object.entries(saved || {})) if (DEFAULT[a] && typeof k === 'string' && k.length < 30 && !RESERVED.test(k)) binds[a] = k;
  return binds;
}
export const keyOf = (action) => (binds || load())[action];
// which action a key press means (or null)
export function actionOf(code) {
  const b = binds || load();
  for (const a in b) if (b[a] === code) return a;
  return BACKUP[code] || null;
}
// Change one key. If another action had it, they swap. Returns the action that swapped (or null).
export function setKey(action, code) {
  if (!DEFAULT[action] || RESERVED.test(code)) return null;
  const b = { ...(binds || load()) };
  const other = Object.keys(b).find((a) => a !== action && b[a] === code) || null;
  if (other) b[other] = b[action];
  b[action] = code;
  binds = b;
  store.set('keys', b);
  return other;
}
export function resetKeys() { store.set('keys', {}); binds = null; load(); }

// "KeyW" -> "W", "Space" -> "Space", "ShiftLeft" -> "Left Shift"
export function keyLabel(code) {
  if (!code) return '?';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return 'Num ' + code.slice(6);
  const m = code.match(/^(Shift|Control|Alt)(Left|Right)$/);
  if (m) return `${m[2]} ${m[1] === 'Control' ? 'Ctrl' : m[1]}`;
  return { Space: 'Space', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Backslash: '\\', CapsLock: 'Caps Lock', Backspace: 'Backspace' }[code] || code;
}
export const keyName = (action) => keyLabel(keyOf(action));

// Camera: how fast the mouse (or a finger) turns it, and whether up and down are flipped.
export const SENS = { min: 0.25, max: 3 };
export const sensitivity = () => { const v = Number(store.get('sens', 1)); return Number.isFinite(v) ? Math.max(SENS.min, Math.min(SENS.max, v)) : 1; };
export const setSensitivity = (v) => store.set('sens', Math.max(SENS.min, Math.min(SENS.max, Number(v) || 1)));
export const invertY = () => !!store.get('invert-y', false);
export const setInvertY = (on) => store.set('invert-y', !!on);
