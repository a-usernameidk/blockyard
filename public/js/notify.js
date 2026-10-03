// Notification settings, and notifications from your device (the ones that show up while Blockyard is in
// another tab or the window is minimized). The pop-ups inside the page are in pages/social.js.
import { go } from './app.js';
import { store } from './api.js';

/* ---------------- notification settings ---------------- */
export const NOTIFY = [
  ['dm', 'New messages from friends'],
  ['group', 'Group messages (every group also has its own setting, under its ⚙)'],
  ['trade', 'Trade offers and live trade invites'],
  ['coins', 'Coins people send you'],
  ['mail', 'Other mail (gifts, what your levels earn, roles)'],
  ['sound', 'Play a sound with pop-ups'],
];
export const notifyOn = (k) => store.get('notify', {})[k] !== false;

/* ---------------- notifications from your device (when Blockyard is in another tab) ---------------- */
// 'on' | 'off' (not asked yet, or switched off here) | 'blocked' (said no in the browser) | 'none' (this browser can't)
export function deviceNotes() {
  if (!('Notification' in window)) return 'none';
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' && store.get('notify-device', true) ? 'on' : 'off';
}
let swReg = null;
function readySW() {
  // phones only show a notification through a "service worker". Ours does nothing else (it never touches page loads).
  if (swReg || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; }).catch(() => {});
}
export async function askDeviceNotes(on = true) {
  if (!('Notification' in window)) return 'none';
  store.set('notify-device', on);
  if (on && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) { /* old browsers */ } }
  if (deviceNotes() === 'on') readySW();
  return deviceNotes();
}
if (deviceNotes() === 'on') readySW();
export function deviceNote(title, text, hash) {
  if (deviceNotes() !== 'on') return;
  const opts = { body: text || '', tag: hash || title, data: { hash: hash || '' }, icon: 'img/icon-192.png', badge: 'img/icon-192.png' };
  try {
    if (swReg && swReg.showNotification) { swReg.showNotification(title, opts); return; }
    const n = new Notification(title, opts);
    n.onclick = () => { window.focus(); if (hash) go(hash); n.close(); };
  } catch (e) { /* this browser only allows them through the service worker, which isn't ready */ }
}
// pressing a device notification brings this tab forward and opens the right page
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.by === 'open' && e.data.hash) go(e.data.hash); });
