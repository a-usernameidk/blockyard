// Logging in and out, the account pop-up, the coin counter, sound buttons, and sending
// a guest's finished runs to the server once they have an account.
import { $, $$, el, session, ask, toast, openModal, closeModal, copyText, pipCanvas, route, go, currentView, timeAgo } from '../app.js';
import { api, auth, accounts, isOnline, store } from '../api.js';
import { progress, proofs } from '../progress.js';
import { isRude } from '../format.js';
import { drawTile } from '../render2d.js';
import { levelOf, xpFor } from '../cosmetics.js';
import { iconCanvas } from '../art.js';
import { diffName } from '../stars.js';
import { isMuted, setMuted, unlockAudio, isMusicOn, setMusicOn } from '../audio.js';

/* ---------------- header ---------------- */
export function renderMe() {
  const w = progress.wallet;
  $('#coin-count').textContent = w ? w.coins : progress.data.coins;
  $('#coin-chip').title = w ? 'Your coins' : 'Coins you earned as a guest. Log in to keep them.';
  $('#coin-chip').classList.toggle('guest', !w);
  $('#me-dot').style.background = progress.data.equip.color;
  $('#me-name').textContent = session.user ? session.user.name : 'Log in';
  $('#me-lvl').hidden = !w; if (w) $('#me-lvl').textContent = `Lv ${levelOf(w.xp)}`;
}
// A level-up gets a party.
let lastLevel = 0;
function levelCheck(w) {
  if (!w || !session.user) return;
  const lv = levelOf(w.xp);
  if (lastLevel && lv > lastLevel) { toast(`LEVEL UP! You're level ${lv} now!`, 'toast-ach'); import('../audio.js').then((a) => a.sfx && a.sfx('win')).catch(() => {}); }
  lastLevel = lv;
}
$('#coin-icon').append((() => { const cv = document.createElement('canvas'); const dpr = Math.min(2, devicePixelRatio || 1); cv.width = cv.height = 22 * dpr; cv.style.width = cv.style.height = '22px'; const c = cv.getContext('2d'); c.scale(dpr * 22 / 32, dpr * 22 / 32); drawTile(c, 'o', 0, 0, () => '.', 0, 'meadow', 'icon'); return cv; })());

let syncTimer = 0;
progress.onChange(() => {
  renderMe();
  for (const a of progress.takeNewAchievements()) { toast(`New badge: ${a.name}!`, 'toast-ach'); import('../audio.js').then((x) => x.sfx(a.id === 'chosen' ? 'win' : 'badge')).catch(() => {}); }
  if (session.user && session.online) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => api.saveProgress(progress.data).catch(() => {}), 1500);
  }
});
addEventListener('pagehide', () => { if (session.user && session.online) try { api.saveProgress(progress.data); } catch (e) { /* best effort */ } });

/* ---------------- sound ---------------- */
export function renderMute() {
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
const changed = () => { renderMe(); checkFriends(); checkMail(); for (const fn of signedInFns) fn(session.user); };

export async function startSession() {
  const on = await isOnline();
  session.online = on;
  try { const h = await fetch('/api/health').then((r) => r.json()); session.rooms = !!h.rooms; } catch (e) { session.rooms = false; }
  if (!on) { progress.use(null); changed(); return; }
  let r = null;
  if (auth.token) {
    try { r = await api.me(); } catch (e) { if (e.status === 401) { forget(auth.token); auth.token = ''; } }
  }
  // no login saved in the page (or it ran out): the saved-login cookie may still have one
  if (!r && !auth.token) { try { r = await api.me(); if (r.token) auth.use(r.token, true); } catch (e) { /* guest */ } }
  if (r) {
    session.user = r.user;
    progress.use(r.user.id, r);
    lastLevel = levelOf(r.wallet && r.wallet.xp);
    remember();
    claimProofs();
  } else progress.use(null);
  changed();
}
// Put the current account in the saved list (only when it's kept on this computer).
function remember() {
  if (!session.user || !auth.kept) return;
  accounts.save({ id: session.user.id, name: session.user.name, token: auth.token, color: progress.data.equip.color });
}
function forget(token) { for (const a of accounts.list()) if (a.token === token) accounts.remove(a.id); }
async function saveNow() {
  clearTimeout(syncTimer);
  if (session.user && session.online) { try { await api.saveProgress(progress.data); } catch (e) { /* best effort */ } }
}
// Switch to another account saved on this computer.
export async function switchTo(acc) {
  if (session.user && session.user.id === acc.id) return;
  let r;
  try { r = await api.meAs(acc.token); } catch (e) {
    if (e.status === 401) { accounts.remove(acc.id); toast(`${acc.name} isn't logged in anymore. Log in again.`); renderSaved(); openAccount('login', acc.name); } else toast(e.message);
    return;
  }
  await saveNow();
  closeModal($('#account-modal'));
  auth.use(acc.token, true);
  session.user = r.user;
  progress.use(r.user.id, r);
  remember();
  changed();
  // live rooms were opened as the old account, so go somewhere safe
  if (['w3', 'build', 'edit', 'play', 'admin'].includes(currentView())) go('#/'); else route();
  toast(`You're playing as ${r.user.name} now.`);
}
// Wallet changed on the server (bought, sold, traded, earned).
export function setWallet(w) { if (w) { progress.setWallet(w); levelCheck(w); renderMe(); } }
export async function refreshWallet() { if (!session.user) return; try { const r = await api.me(); progress.setAccount(r); levelCheck(r.wallet); renderMe(); } catch (e) { /* later */ } }

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

async function signedIn(res, { fresh = false, keep = true } = {}) {
  await saveNow();
  auth.use(res.token, keep);
  session.user = res.user;
  let bring = false;
  if (!fresh && progress.guestHasProgress()) {
    bring = await ask('Bring your guest progress?', 'You played as a guest in this browser. Add those stars and runs to this account? Runs that earned coins get checked by the server and pay out.', [{ label: 'Yes, add them', value: true, cls: 'btn-sun' }, { label: 'No, leave them', value: false }]);
  }
  progress.use(res.user.id, res);
  remember();
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
// The saved-accounts list: "Continue as" when logged out, "Switch to" when logged in.
function accountCard(a, label) {
  return el('div', { class: 'acct-card' }, el('span', { class: 'dot', style: `background:${/^#[0-9a-f]{6}$/i.test(a.color) ? a.color : '#ff6b35'}` }), el('b', {}, a.name),
    el('button', { class: 'btn btn-sun', type: 'button', onclick: () => switchTo(a) }, label),
    el('button', { class: 'btn', type: 'button', title: `Forget ${a.name} on this computer`, 'aria-label': `Forget ${a.name} on this computer`, onclick: () => { accounts.remove(a.id); renderSaved(); } }, '✕'));
}
function renderSaved() {
  const others = accounts.list().filter((a) => !session.user || a.id !== session.user.id);
  const out = $('#acct-saved');
  out.hidden = !!session.user || !others.length || adding;
  out.replaceChildren(...(others.length ? [el('h3', {}, 'Saved on this computer'), ...others.map((a) => accountCard(a, 'Continue'))] : []));
  $('#acct-switch').replaceChildren(...(session.user ? [
    el('h3', {}, others.length ? 'Switch account' : 'More accounts'),
    ...others.map((a) => accountCard(a, 'Switch')),
    el('div', { class: 'row' }, el('button', { class: 'btn', type: 'button', onclick: addAccount }, 'Add another account')),
  ] : []));
}
let adding = false;
async function addAccount() {
  await saveNow();
  adding = true;
  $('#acct-in').hidden = true; $('#acct-out').hidden = false;
  setAcctMode('login');
  $('#acct-name').value = ''; $('#acct-pw').value = '';
  $('#acct-hint').textContent = session.user ? `Log in to another account. ${session.user.name} stays saved here${auth.kept ? '' : ' if you tick "Keep me logged in" next time'}, so you can switch back.` : '';
  renderSaved();
  $('#acct-name').focus();
}
export function openAccount(mode, name) {
  adding = false;
  isOnline().then((on) => {
    $('#acct-offline').hidden = on;
    $('#acct-out').hidden = !on || !!session.user;
    $('#acct-in').hidden = !on || !session.user;
    if (name) $('#acct-name').value = name;
    renderSaved();
    if (session.user) {
      $('#acct-user').textContent = session.user.name;
      const w = progress.wallet;
      $('#acct-sum').textContent = `${progress.totalStars()} stars, ${w ? w.coins : 0} coins, ${Object.keys(progress.data.ach).length} badges`;
      const xp = w ? w.xp || 0 : 0, lv = levelOf(xp), a = xpFor(lv), b = xpFor(lv + 1);
      $('#acct-xp-fill').style.width = `${Math.round((xp - a) / (b - a) * 100)}%`;
      $('#acct-xp-text').textContent = `Level ${lv}: ${xp - a} / ${b - a} XP to level ${lv + 1}. Every coin you earn playing is 1 XP.`;
      $('#acct-admin').hidden = !session.user.admin;
      $('#acct-builder').hidden = !(session.user.admin || ['builder', 'builderpro'].includes(session.user.role));
      const wn = session.user.warnings || 0;
      $('#acct-warn').hidden = !wn;
      $('#acct-warn').textContent = `⚠️ ${wn} of 3 warnings. 3 is a ban. Earn them back by making levels lots of people like and play, or by sending reports that turn out to be right.`;
      $('#acct-in-msg').textContent = '';
      $('#acct-pip').replaceWith(Object.assign(pipCanvas(56), { id: 'acct-pip' }));
    } else setAcctMode(mode || 'login');
    openModal('#account-modal');
  });
}
$('#me-btn').addEventListener('click', () => openAccount());
$('#acct-profile').addEventListener('click', () => { closeModal($('#account-modal')); if (session.user) go('#/u/' + session.user.name); });
$('#acct-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#acct-name').value.trim(), pw = $('#acct-pw').value, msg = $('#acct-msg');
  if (acctMode === 'signup' && isRude(name)) { msg.textContent = 'Pick a different username. That one has a blocked word in it.'; return; }
  $('#acct-go').disabled = true; msg.textContent = 'One sec…';
  try {
    const keep = $('#acct-keep').checked;
    const wasAdding = adding && session.user;
    if (acctMode === 'login') {
      const r = await api.login(name, pw, keep);
      closeModal($('#account-modal'));
      if (wasAdding) await leaveRooms();
      await signedIn(r, { keep });
      toast(`Welcome back, ${r.user.name}!`);
    } else if (acctMode === 'signup') {
      // a second account starts fresh; guest progress only goes to your first one
      const r = await api.signup(name, pw, wasAdding ? {} : progress.data, keep);
      closeModal($('#account-modal'));
      if (wasAdding) await leaveRooms();
      await signedIn(r, { fresh: !wasAdding, keep });
      showRecovery(r.recovery);
    } else {
      const r = await api.recover(name, $('#acct-rec').value, pw, keep);
      closeModal($('#account-modal'));
      if (wasAdding) await leaveRooms();
      await signedIn(r, { keep });
      showRecovery(r.recovery);
    }
    adding = false;
    $('#acct-pw').value = ''; msg.textContent = '';
  } catch (err) { msg.textContent = err.message; }
  $('#acct-go').disabled = false;
});
async function leaveRooms() { if (['w3', 'build', 'edit', 'play', 'admin'].includes(currentView())) go('#/'); }
function showRecovery(code) { $('#rec-code').textContent = code; openModal('#recovery-modal'); }
$('#rec-copy').addEventListener('click', (e) => copyText($('#rec-code').textContent, e.currentTarget, 'Copy code'));
function signedOut() {
  auth.token = ''; session.user = null;
  progress.use(null);
  changed(); route();
}
$('#acct-logout').addEventListener('click', async () => {
  const was = session.user;
  await saveNow();
  try { await api.logout(); } catch (e) { /* still log out here */ }
  if (was) accounts.remove(was.id);
  closeModal($('#account-modal'));
  signedOut();
  toast(accounts.list().length ? 'Logged out. Click "Log in" to pick another saved account.' : 'Logged out. You are playing as a guest now.');
});
/* ---------------- change my password ---------------- */
$('#acct-pw-change').addEventListener('click', async () => {
  closeModal($('#account-modal'));
  const old = el('input', { type: 'password', maxlength: '72', autocomplete: 'current-password', placeholder: 'Old password', 'aria-label': 'Old password' });
  const pw = el('input', { type: 'password', maxlength: '72', autocomplete: 'new-password', placeholder: 'New password (6 or more letters)', 'aria-label': 'New password' });
  const ok = await ask('Change my password', 'Type your old password, then the new one. Other computers get logged out, this one stays in.', [{ label: 'Change it', value: true, cls: 'btn-sun' }], el('div', { class: 'stack' }, old, pw));
  if (!ok) return;
  try { await api.changePassword(old.value, pw.value); toast('Password changed!'); } catch (e) { toast(e.message); }
});

/* ---------------- mailbox ---------------- */
export function setMailCount(n) { const c = $('#mail-count'); c.hidden = !n; c.textContent = String(n); $('#mail-btn').hidden = !session.user; }
export async function checkMail() {
  if (!session.user) { setMailCount(0); return; }
  try { const r = await api.mail(); setMailCount(r.unread); return r; } catch (e) { return null; }
}
// the admin verifies a level's difficulty right from the mailbox
function rateButtons(m) {
  const r = m.data.rate, msg = el('span', { class: 'small' });
  const set = async (n) => { try { await api.admin('POST', '/games/' + r.game, { action: 'stars', amount: n }); msg.textContent = n ? `Rated ${n}★ ${diffName(n)}. Beating it gives stars and coins now.` : 'Left unrated.'; } catch (e) { msg.textContent = e.message; } };
  const pick = el('select', { 'aria-label': 'Pick a different rating' }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => el('option', { value: String(n) }, `${n}★ ${diffName(n)}`)));
  pick.value = String(r.stars);
  return el('span', { class: 'row' }, el('button', { class: 'btn btn-grass', type: 'button', onclick: () => set(r.stars) }, `Accept ${r.stars}★ ${diffName(r.stars)}`), pick, el('button', { class: 'btn', type: 'button', onclick: () => set(Number(pick.value)) }, 'Use this'), el('button', { class: 'btn', type: 'button', 'data-go': '#/p/' + r.game }, 'Play it'), msg);
}
const MAIL_ICON = { admin: '🛡️', gift: '🎁', role: '⭐', trade: '🔁', earn: '🪙', coins: '🪙', welcome: '🎉', warning: '⚠️' };
async function openMail() {
  const list = $('#mail-list');
  list.replaceChildren(el('p', { class: 'small' }, 'Loading…'));
  openModal('#mail-modal');
  const r = await checkMail();
  if (!r) { list.replaceChildren(el('p', { class: 'small' }, "Couldn't load your mail.")); return; }
  list.replaceChildren(...(r.mail.length ? r.mail.map((m) => el('div', { class: 'mail' + (m.read ? '' : ' unread') },
    el('h3', {}, el('span', {}, `${MAIL_ICON[m.kind] || '✉️'} ${m.title}`), el('span', { class: 'small' }, timeAgo(m.at))),
    el('p', {}, m.body),
    el('div', { class: 'row' },
      m.data && m.data.rate ? rateButtons(m) : null,
      m.data && m.data.go ? el('button', { class: 'btn btn-grass', type: 'button', onclick: () => { closeModal($('#mail-modal')); go(m.data.go); } }, 'Play it') : null,
      m.data && m.data.profile ? el('button', { class: 'btn', type: 'button', onclick: () => { closeModal($('#mail-modal')); go('#/u/' + m.data.profile); } }, 'See profile') : null,
      m.data && m.data.join ? el('button', { class: 'btn btn-grass', type: 'button', onclick: () => { closeModal($('#mail-modal')); go('#/join/' + m.data.join); } }, 'Join') : null,
      m.data && m.data.manage ? el('button', { class: 'btn btn-sun', type: 'button', onclick: () => { closeModal($('#mail-modal')); go('#/u/' + m.data.manage); } }, `Manage ${m.data.manage}`) : null,
      m.data && m.data.claim ? el('button', { class: 'btn btn-sun', type: 'button', onclick: async (e) => { const b = e.currentTarget; try { const r = await api.mailAction(m.id, 'claim'); setWallet(r.wallet); toast(`+${r.coins} coins!`); b.textContent = 'Claimed'; } catch (err) { b.textContent = err.status === 409 ? 'Claimed' : err.message; } b.disabled = true; } }, `Claim ${m.data.claim} coins`) : null,
      m.kind === 'trade' ? el('button', { class: 'btn btn-sun', type: 'button', onclick: () => { closeModal($('#mail-modal')); go('#/closet/trades'); } }, 'See trades') : null,
      m.kind === 'gift' ? el('button', { class: 'btn', type: 'button', onclick: () => { closeModal($('#mail-modal')); go('#/closet/mine'); } }, 'Open My Items') : null,
      m.kind === 'earn' && m.data && m.data.game ? el('button', { class: 'btn', type: 'button', onclick: () => { closeModal($('#mail-modal')); go('#/create'); } }, 'My games') : null,
      el('button', { class: 'btn', type: 'button', onclick: async (e) => { try { await api.mailAction(m.id, 'delete'); e.target.closest('.mail').remove(); } catch (err) { toast(err.message); } } }, 'Delete'))))
    : [el('p', { class: 'mail-empty' }, 'No mail yet. Gifts, trade offers and what your levels earn show up here.')]));
  if (r.unread) { api.mailAction('all', 'read').catch(() => {}); setMailCount(0); }
}
$('#mail-btn').addEventListener('click', openMail);
$('#mail-clear').addEventListener('click', async () => { try { await api.mailAction('all', 'delete'); openMail(); } catch (e) { toast(e.message); } });

/* ---------------- friends ---------------- */
let friendData = null;
export async function checkFriends() {
  if (!session.user) { setFriendCount(0); return; }
  try { friendData = await api.friends(); setFriendCount(friendData.incoming.length); progress.peak('friends', friendData.friends.length); } catch (e) { /* later */ }
}
function setFriendCount(n) {
  for (const id of ['#me-count', '#friend-count']) { const c = $(id); c.hidden = !n; c.textContent = String(n); }
  $('#me-count').title = n ? `${n} friend request${n > 1 ? 's' : ''}` : '';
}
export function friendsNow() { return friendData; }
const friendDot = (f) => el('span', { class: 'dot', style: `background:${f.look.color}` });
function renderFriends() {
  const d = friendData, body = $('#fl-body');
  if (!d) { body.replaceChildren(el('p', { class: 'small' }, 'Loading…')); return; }
  const act = (name, action, done) => async () => { try { await api.friend(name, action); if (done) toast(done); await checkFriends(); renderFriends(); } catch (e) { $('#fl-msg').textContent = e.message; } };
  body.replaceChildren(
    d.incoming.length ? el('h3', {}, 'Friend requests') : null,
    ...d.incoming.map((f) => el('div', { class: 'friend-row' }, friendDot(f), el('span', { class: 'who' }, el('b', {}, f.name)),
      el('button', { class: 'btn btn-grass', type: 'button', onclick: act(f.name, 'accept', `You and ${f.name} are friends now!`) }, 'Accept'),
      el('button', { class: 'btn', type: 'button', onclick: act(f.name, 'remove') }, 'No thanks'))),
    el('h3', {}, d.friends.length ? `Friends (${d.friends.filter((f) => f.online).length} online)` : 'No friends yet'),
    d.friends.length ? null : el('p', { class: 'small' }, 'Type a username above, or press "Add friend" on someone\'s profile. They have to say yes.'),
    ...d.friends.map((f) => el('div', { class: 'friend-row' }, friendDot(f),
      el('span', { class: 'who' }, el('a', { class: 'linkish', href: '#/u/' + f.name, 'data-go': '#/u/' + f.name }, f.name), el('span', { class: 'small' }, f.online ? (f.online.site ? 'Online' : `Playing ${f.online.name}`) : 'Offline')),
      f.online && f.online.code ? el('button', { class: 'btn btn-grass', type: 'button', onclick: () => { closeModal($('#friends-list-modal')); go('#/join/' + f.online.code); } }, 'Join') : null,
      el('button', { class: 'btn', type: 'button', onclick: () => { closeModal($('#friends-list-modal')); dispatchEvent(new CustomEvent('by:dm', { detail: f.name })); } }, 'Message'),
      el('button', { class: 'btn', type: 'button', title: `Unfriend ${f.name}`, onclick: act(f.name, 'remove', `Removed ${f.name}.`) }, 'Remove'))),
    d.outgoing.length ? el('h3', {}, 'Waiting for them to say yes') : null,
    ...d.outgoing.map((f) => el('div', { class: 'friend-row' }, friendDot(f), el('span', { class: 'who' }, f.name), el('button', { class: 'btn', type: 'button', onclick: act(f.name, 'remove') }, 'Cancel'))));
}
export async function openFriends() {
  if (!session.user) { openAccount(); return; }
  $('#fl-msg').textContent = '';
  renderFriends(); openModal('#friends-list-modal');
  await checkFriends(); renderFriends();
}
$('#acct-friends').addEventListener('click', () => { closeModal($('#account-modal')); openFriends(); });
$('#fl-add').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#fl-name').value.trim();
  if (!name) return;
  try { const r = await api.friend(name, 'add'); $('#fl-msg').textContent = r.status === 'friends' ? `You and ${name} are friends now!` : `Request sent to ${name}.`; $('#fl-name').value = ''; await checkFriends(); renderFriends(); }
  catch (err) { $('#fl-msg').textContent = err.message; }
});

$('#acct-delete').addEventListener('click', async () => {
  closeModal($('#account-modal'));
  const ok = await ask('Delete your account?', 'This removes your account, your coins and items, your projects, and every game you published. It cannot be undone.', [{ label: 'Delete everything', value: true, cls: 'btn-danger' }]);
  if (!ok) return;
  try { const id = session.user && session.user.id; await api.deleteMe(); if (id) accounts.remove(id); signedOut(); toast('Your account is deleted.'); } catch (e) { toast(e.message); }
});
