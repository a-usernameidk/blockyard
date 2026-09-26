// Logging in and out, the account pop-up, the coin counter, sound buttons, and sending
// a guest's finished runs to the server once they have an account.
import { $, $$, el, session, ask, toast, openModal, closeModal, copyText, pipCanvas, route, go } from '../app.js';
import { api, auth, isOnline, store } from '../api.js';
import { progress, proofs } from '../progress.js';
import { isRude } from '../format.js';
import { drawTile } from '../render2d.js';
import { iconCanvas } from '../art.js';
import { isMuted, setMuted, unlockAudio, isMusicOn, setMusicOn } from '../audio.js';

/* ---------------- header ---------------- */
export function renderMe() {
  const w = progress.wallet;
  $('#coin-count').textContent = w ? w.coins : progress.data.coins;
  $('#coin-chip').title = w ? 'Your coins' : 'Coins you earned as a guest. Log in to keep them.';
  $('#coin-chip').classList.toggle('guest', !w);
  $('#me-dot').style.background = progress.data.equip.color;
  $('#me-name').textContent = session.user ? session.user.name : 'Log in';
}
$('#coin-icon').append((() => { const cv = document.createElement('canvas'); const dpr = Math.min(2, devicePixelRatio || 1); cv.width = cv.height = 22 * dpr; cv.style.width = cv.style.height = '22px'; const c = cv.getContext('2d'); c.scale(dpr * 22 / 32, dpr * 22 / 32); drawTile(c, 'o', 0, 0, () => '.', 0, 'meadow', 'icon'); return cv; })());

let syncTimer = 0;
progress.onChange(() => {
  renderMe();
  for (const a of progress.takeNewAchievements()) toast(`New badge: ${a.name}`, 'toast-ach');
  if (session.user && session.online) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => api.saveProgress(progress.data).catch(() => {}), 1500);
  }
});
addEventListener('pagehide', () => { if (session.user && session.online) try { api.saveProgress(progress.data); } catch (e) { /* best effort */ } });

/* ---------------- sound ---------------- */
function renderMute() {
  const m = isMuted(), mu = isMusicOn();
  $('#mute').replaceChildren(iconCanvas(m ? 'mute' : 'sound', 24)); $('#mute').setAttribute('aria-pressed', String(!m)); $('#mute').title = m ? 'Sound effects off' : 'Sound effects on';
  $('#music').replaceChildren(iconCanvas(mu ? 'music' : 'music-off', 24)); $('#music').setAttribute('aria-pressed', String(mu)); $('#music').title = mu ? 'Music on' : 'Music off';
}
$('#mute').addEventListener('click', () => { setMuted(!isMuted()); renderMute(); unlockAudio(); });
$('#music').addEventListener('click', () => { setMusicOn(!isMusicOn()); renderMute(); unlockAudio(); });
addEventListener('pointerdown', unlockAudio, { once: true });
renderMute();

/* ---------------- session ---------------- */
const signedInFns = new Set();
export function onSession(fn) { signedInFns.add(fn); }
const changed = () => { renderMe(); for (const fn of signedInFns) fn(session.user); };

export async function startSession() {
  const on = await isOnline();
  session.online = on;
  try { const h = await fetch('/api/health').then((r) => r.json()); session.rooms = !!h.rooms; } catch (e) { session.rooms = false; }
  if (!on || !auth.token) { progress.use(null); changed(); return; }
  try {
    const r = await api.me();
    session.user = r.user;
    progress.use(r.user.id, r);
    claimProofs();
  } catch (e) {
    if (e.status === 401) auth.token = '';
    progress.use(null);
  }
  changed();
}
// Wallet changed on the server (bought, sold, traded, earned).
export function setWallet(w) { if (w) { progress.setWallet(w); renderMe(); } }
export async function refreshWallet() { if (!session.user) return; try { const r = await api.me(); progress.setAccount(r); renderMe(); } catch (e) { /* later */ } }

// Runs finished as a guest get checked by the server now, and pay out for real.
async function claimProofs() {
  const list = proofs.list();
  if (!list.length || !session.user) return;
  proofs.clear();
  let total = 0, n = 0;
  for (const p of list) {
    try { const r = await api.finish(p); total += r.earned || 0; if (r.wallet) setWallet(r.wallet); n++; } catch (e) { /* skip the ones that don't check out */ }
  }
  if (total) toast(`Your guest runs were checked: +${total} coins!`, 'toast-ach');
}

async function signedIn(res, { fresh = false } = {}) {
  auth.token = res.token;
  session.user = res.user;
  let bring = false;
  if (!fresh && progress.guestHasProgress()) {
    bring = await ask('Bring your guest progress?', 'You played as a guest in this browser. Add those stars and runs to this account? Runs that earned coins get checked by the server and pay out.', [{ label: 'Yes, add them', value: true, cls: 'btn-sun' }, { label: 'No, leave them', value: false }]);
  }
  progress.use(res.user.id, res);
  if (fresh || bring) { progress.absorbGuest(); claimProofs(); }
  else proofs.clear();
  api.saveProgress(progress.data).catch(() => {});
  changed();
  route();
}

let acctMode = 'login';
function setAcctMode(m) {
  acctMode = m;
  $$('[data-acct]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.acct === m)));
  $('#acct-rec-wrap').hidden = m !== 'recover';
  $('#acct-pw-label').textContent = m === 'recover' ? 'New password' : 'Password';
  $('#acct-pw').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('#acct-go').textContent = { login: 'Log in', signup: 'Make my account', recover: 'Reset password' }[m];
  $('#acct-hint').textContent = {
    login: 'Accounts can earn coins, trade, chat in 3D worlds, build with friends and publish.',
    signup: "Pick a username (not your real name) and a password. No email needed. Your guest stars come with you.",
    recover: 'Type the recovery code you got when you made your account, then pick a new password.',
  }[m];
  $('#acct-msg').textContent = '';
}
$$('[data-acct]').forEach((b) => b.addEventListener('click', () => setAcctMode(b.dataset.acct)));
export function openAccount(mode) {
  isOnline().then((on) => {
    $('#acct-offline').hidden = on;
    $('#acct-out').hidden = !on || !!session.user;
    $('#acct-in').hidden = !on || !session.user;
    if (session.user) {
      $('#acct-user').textContent = session.user.name;
      const w = progress.wallet;
      $('#acct-sum').textContent = `${progress.totalStars()} stars, ${w ? w.coins : 0} coins, ${Object.keys(progress.data.ach).length} badges`;
      $('#acct-admin').hidden = !session.user.admin;
      $('#acct-in-msg').textContent = '';
      $('#acct-pip').replaceWith(Object.assign(pipCanvas(56), { id: 'acct-pip' }));
    } else setAcctMode(mode || 'login');
    $('#acct-gfx').textContent = store.get('gfx-low', false) ? 'Fast (switch to pretty)' : 'Pretty (switch to fast)';
    openModal('#account-modal');
  });
}
$('#me-btn').addEventListener('click', () => openAccount());
$('#acct-gfx').addEventListener('click', () => { store.set('gfx-low', !store.get('gfx-low', false)); $('#acct-gfx').textContent = store.get('gfx-low', false) ? 'Fast (switch to pretty)' : 'Pretty (switch to fast)'; });
$('#acct-profile').addEventListener('click', () => { closeModal($('#account-modal')); if (session.user) go('#/u/' + session.user.name); });
$('#acct-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#acct-name').value.trim(), pw = $('#acct-pw').value, msg = $('#acct-msg');
  if (acctMode === 'signup' && isRude(name)) { msg.textContent = 'Pick a different username. That one has a blocked word in it.'; return; }
  $('#acct-go').disabled = true; msg.textContent = 'One sec…';
  try {
    if (acctMode === 'login') { const r = await api.login(name, pw); closeModal($('#account-modal')); await signedIn(r); toast(`Welcome back, ${r.user.name}!`); }
    else if (acctMode === 'signup') {
      const r = await api.signup(name, pw, progress.data);
      closeModal($('#account-modal'));
      await signedIn(r, { fresh: true });
      showRecovery(r.recovery);
    } else {
      const r = await api.recover(name, $('#acct-rec').value, pw);
      closeModal($('#account-modal'));
      await signedIn(r);
      showRecovery(r.recovery);
    }
    $('#acct-pw').value = ''; msg.textContent = '';
  } catch (err) { msg.textContent = err.message; }
  $('#acct-go').disabled = false;
});
function showRecovery(code) { $('#rec-code').textContent = code; openModal('#recovery-modal'); }
$('#rec-copy').addEventListener('click', (e) => copyText($('#rec-code').textContent, e.currentTarget, 'Copy code'));
function signedOut() {
  auth.token = ''; session.user = null;
  progress.use(null);
  changed(); route();
}
$('#acct-logout').addEventListener('click', async () => {
  try { await api.saveProgress(progress.data); await api.logout(); } catch (e) { /* still log out here */ }
  closeModal($('#account-modal'));
  signedOut();
  toast('Logged out. You are playing as a guest now.');
});
$('#acct-delete').addEventListener('click', async () => {
  closeModal($('#account-modal'));
  const ok = await ask('Delete your account?', 'This removes your account, your coins and items, your projects, and every game you published. It cannot be undone.', [{ label: 'Delete everything', value: true, cls: 'btn-danger' }]);
  if (!ok) return;
  try { await api.deleteMe(); signedOut(); toast('Your account is deleted.'); } catch (e) { toast(e.message); }
});
