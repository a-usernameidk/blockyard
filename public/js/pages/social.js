// Messages with friends, live trades, sending coins, and the little pop-ups when something new happens.
// The page asks the server "anything new?" every few seconds while it's open.
import { $, el, session, toast, openModal, closeModal, go, timeAgo, needLogin, currentView, addRoute, replaceRoute, route } from '../app.js';
import { api, store } from '../api.js';
import { progress } from '../progress.js';
import { findItem, canTrade } from '../cosmetics.js';
import { itemPreview } from './closet.js';
import { emojiNodes, emojiButton } from '../emoji.js';
import { sfx } from '../audio.js';
import { groupsState } from './groups.js';
import { NOTIFY, notifyOn, deviceNotes, askDeviceNotes, deviceNote } from '../notify.js';
import { setWallet, refreshWallet, onSession, setMailCount, friendsNow, checkFriends } from './account.js';

export { NOTIFY, notifyOn, deviceNotes, askDeviceNotes };

/* ---------------- pop-ups ---------------- */
// hash: where "pressing the notification" should take you (used for the device notification)
function note(title, text, actions = [], secs = 8, hash = '') {
  if (document.hidden) { deviceNote(title, text, hash); secs = Math.max(secs, 60); }
  const card = el('div', { class: 'note', role: 'status' },
    el('b', {}, title), text ? el('p', {}, ...emojiNodes(text, 18)) : null,
    el('div', { class: 'row' }, ...actions.map(([label, fn, cls]) => el('button', { class: 'btn ' + (cls || ''), type: 'button', onclick: () => { card.remove(); fn(); } }, label)),
      el('button', { class: 'btn btn-ghost', type: 'button', 'aria-label': 'Dismiss', onclick: () => card.remove() }, '✕')));
  $('#notes').append(card);
  while ($('#notes').children.length > 3) $('#notes').firstChild.remove();
  // a pop-up that arrived while you were on another tab waits for you to come back before it starts counting down
  const arm = () => setTimeout(() => card.remove(), Math.min(secs, 12) * 1000);
  if (document.hidden) document.addEventListener('visibilitychange', arm, { once: true }); else setTimeout(() => card.remove(), secs * 1000);
  if (notifyOn('sound')) sfx('notify');
}

/* ---------------- checking for new stuff ---------------- */
let since = 0, timer = 0, seenInvite = '';
const setCount = (sel, n) => { const c = $(sel); if (!c) return; c.hidden = !n; c.textContent = n > 99 ? '99+' : String(n); };
// every 12 seconds while you're looking, every 30 while Blockyard is in another tab (browsers slow that to about a minute)
function schedule(ms) { clearTimeout(timer); timer = setTimeout(pulse, ms || (document.hidden ? 30000 : 12000)); }
// "(3) Blockyard" in the tab's name
const TITLE = document.title;
function setTitle(n) { document.title = n ? `(${n > 99 ? '99+' : n}) ${TITLE}` : TITLE; }
async function pulse() {
  if (!session.user || !session.online) return;
  try {
    const r = await api.pulse(since);
    const first = !since;
    since = r.now;
    setCount('#dm-count', r.dms); setMailCount(r.mail); setCount('#groups-count', r.groups || 0);
    setTitle(r.dms + r.mail + (r.groups || 0));
    if (!first) for (const e of r.events) showEvent(e);
    if (r.invite && r.invite.id !== seenInvite) {
      seenInvite = r.invite.id;
      if (notifyOn('trade') && live.id !== r.invite.id) note(`${r.invite.from} wants to live trade!`, 'Open a trade window together and swap items or coins.', [['Trade', () => acceptLive(r.invite.id), 'btn-sun'], ['No thanks', () => api.liveAct(r.invite.id, 'decline').catch(() => {})]], 25);
    }
    // someone said yes to my invite: the window is already open and polling
  } catch (e) { /* try again later */ }
  schedule();
}
export const pulseNow = () => schedule(200);
function showEvent(e) {
  if (e.kind === 'dm') {
    if (!document.hidden && !$('#dm-modal').hidden && dm.current && dm.current.toLowerCase() === e.from.toLowerCase()) { openThread(dm.current, true); return; }
    if (notifyOn('dm')) note(`💬 ${e.from}`, e.text, [['Reply', () => openDMs(e.from), 'btn-sun']], 8, '#/dm/' + e.from);
    return;
  }
  if (e.kind === 'group') {
    // already looking at that channel: the chat itself shows it
    if (!document.hidden && currentView() === 'groups' && groupsState.gid === e.gid && groupsState.cid === e.cid) return;
    const hash = `#/groups/${e.gid}/${e.cid}`;
    if (notifyOn('group')) note(e.mention ? `🔔 ${e.from} mentioned you in ${e.group}` : `👥 ${e.from} in ${e.group} #${e.channel}`, e.text, [['Open', () => go(hash), 'btn-sun']], e.mention ? 14 : 8, hash);
    if (currentView() === 'groups') dispatchEvent(new CustomEvent('by:groups-new', { detail: e }));
    return;
  }
  if (e.mail === 'group' && e.group) { note('👥 ' + e.text, 'Press Join to hop in.', [['Join', () => go('#/groups/join/' + e.group), 'btn-grass']], 25, '#/groups/join/' + e.group); return; }
  if (e.mail === 'invite' && e.join) { note('🎮 ' + e.text, 'Go play with them right now.', [['Join', () => go('#/join/' + e.join), 'btn-grass']], 25, '#/join/' + e.join); return; }
  if (e.mail === 'coins') { refreshWallet(); if (notifyOn('coins')) note('🪙 ' + e.text, '', [['Mailbox', () => $('#mail-btn').click()]]); return; }
  if (e.mail === 'trade') { if (notifyOn('trade')) note('🔁 ' + e.text, '', [['See trades', () => go('#/closet/trades'), 'btn-sun']], 8, '#/closet/trades'); return; }
  if (e.mail === 'warning') { note('⚠️ ' + e.text, 'Open your mailbox to read it.', [['Mailbox', () => $('#mail-btn').click()]], 15); refreshWallet(); return; }
  if (notifyOn('mail')) note('✉️ ' + e.text, '', [['Mailbox', () => $('#mail-btn').click()]]);
}
onSession((user) => {
  since = 0; clearTimeout(timer);
  $('#dm-btn').hidden = !user;
  if (user) pulse(); else { setCount('#dm-count', 0); setCount('#groups-count', 0); setTitle(0); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && session.user) schedule(300); });

/* ---------------- DMs ---------------- */
const dm = { current: null, timer: 0 };
export async function openDMs(name) {
  if (!session.user) { needLogin('Messages need an account.'); return; }
  openModal('#dm-modal');
  dm.current = null;
  $('#dm-who').replaceChildren(el('p', { class: 'small' }, 'Pick a friend to message.'));
  $('#dm-msgs').replaceChildren(); $('#dm-form').hidden = true;
  await loadChats();
  if (name) openThread(name);
}
async function loadChats() {
  const box = $('#dm-chats');
  try {
    if (!friendsNow()) await checkFriends();
    const { chats } = await api.dms();
    const f = friendsNow();
    const names = new Set(chats.map((c) => c.name.toLowerCase()));
    const rest = f ? f.friends.filter((x) => !names.has(x.name.toLowerCase())).map((x) => ({ name: x.name, color: x.look.color, last: '', unread: 0 })) : [];
    const all = [...chats, ...rest];
    box.replaceChildren(...(all.length ? all.map((c) => el('button', { class: 'dm-chat' + (dm.current && dm.current.toLowerCase() === c.name.toLowerCase() ? ' on' : ''), type: 'button', onclick: () => openThread(c.name) },
      el('span', { class: 'dot', style: `background:${c.color}` }), el('span', { class: 'who' }, el('b', {}, c.name), el('span', { class: 'small' }, ...(c.last ? [c.mine ? 'You: ' : '', ...emojiNodes(c.last, 16)] : ['Say hi!']))),
      c.unread ? el('span', { class: 'count' }, String(c.unread)) : null))
      : [el('p', { class: 'small' }, 'No friends yet. Add friends from their profile, then you can message them.')]));
  } catch (e) { box.replaceChildren(el('p', { class: 'small' }, e.message)); }
}
async function openThread(name, quiet) {
  dm.current = name;
  clearTimeout(dm.timer);
  try {
    const r = await api.dmThread(name);
    dm.current = r.name;
    const reasons = el('select', { 'aria-label': 'Why are you reporting them?' }, ...[['mean', 'Mean or bullying'], ['spam', 'Spamming'], ['personal', 'Asking for or sharing personal info'], ['other', 'Something else']].map(([v, l]) => el('option', { value: v }, l)));
    const rep = el('span', { class: 'row', hidden: true }, reasons, el('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { try { await api.dmReport(r.name, reasons.value); toast('Report sent. The admin only sees the last few messages of this chat.'); rep.hidden = true; } catch (e) { toast(e.message); } } }, 'Send report'));
    $('#dm-who').replaceChildren(el('span', { class: 'dot', style: `background:${r.color}` }), el('a', { class: 'linkish', href: '#/u/' + r.name, onclick: () => closeModal($('#dm-modal')) }, r.name),
      el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { rep.hidden = !rep.hidden; } }, 'Report'), rep);
    const list = $('#dm-msgs');
    const before = list.children.length;
    list.replaceChildren(...r.messages.map((m) => el('li', { class: m.me ? 'me' : '' }, el('span', {}, ...emojiNodes(m.text, 22)), el('small', {}, timeAgo(m.at)))));
    if (quiet && before && r.messages.length > before && !r.messages[r.messages.length - 1].me) sfx('chat');
    if (!r.messages.length) list.append(el('li', { class: 'dm-empty' }, r.friends ? `Say hi to ${r.name}!` : `You can only message friends. Add ${r.name} as a friend first.`));
    list.scrollTop = list.scrollHeight;
    $('#dm-form').hidden = !r.friends;
    if (!quiet) { loadChats(); if (r.friends) $('#dm-input').focus(); }
    api.pulse(Date.now()).then((p) => setCount('#dm-count', p.dms)).catch(() => {});
  } catch (e) { $('#dm-who').replaceChildren(el('p', { class: 'msg' }, e.message)); }
  // keep the chat fresh while it's open
  dm.timer = setTimeout(() => { if (!$('#dm-modal').hidden && dm.current === name) openThread(name, true); }, 5000);
}
$('#dm-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#dm-input').value.trim();
  if (!text || !dm.current) return;
  try { await api.dmSend(dm.current, text); $('#dm-input').value = ''; sfx('send'); openThread(dm.current, true); loadChats(); } catch (err) { toast(err.message); sfx('error'); }
});
$('#dm-btn').addEventListener('click', () => { sfx('open'); openDMs(); });
$('#dm-form').insertBefore(emojiButton((code) => { const i = $('#dm-input'); i.value = (i.value + ' ' + code).trim().slice(0, 300); i.focus(); }), $('#dm-form button[type=submit]'));
addEventListener('by:dm', (e) => openDMs(e.detail));
// pressing a "new message" notification lands here
addRoute(/^#\/dm\/([A-Za-z0-9_]{3,20})$/, (m) => { replaceRoute('#/'); route('#/'); openDMs(m[1]); });
addEventListener('by:pulse', () => pulseNow());

/* ---------------- sending coins ---------------- */
let giftTo = '';
export function openGift(name) {
  if (!session.user) { needLogin('Sending coins needs an account.'); return; }
  giftTo = name;
  $('#gift-h').textContent = `Send coins to ${name}`;
  $('#gift-info').textContent = `You have ${progress.wallet ? progress.wallet.coins : 0} coins. You can send up to 500 a day once you're level 3. Making extra accounts to farm coins gets your coins wiped and 2 warnings.`;
  $('#gift-msg').textContent = ''; $('#gift-note').value = '';
  openModal('#gift-modal');
}
$('#gift-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api.gift(giftTo, Number($('#gift-amount').value), $('#gift-note').value);
    setWallet(r.wallet);
    closeModal($('#gift-modal'));
    toast(`Sent ${r.sent} coins to ${r.to}!`);
  } catch (err) { $('#gift-msg').textContent = err.message; }
});

/* ---------------- live trades ---------------- */
const live = { id: null, t: null, timer: 0, busy: false, mine: [] };
export async function startLive(name) {
  if (!session.user) { needLogin('Trading needs an account.'); return; }
  try { const r = await api.liveStart(name); openLive(r.id, r.trade); } catch (e) { toast(e.message); }
}
async function acceptLive(id) {
  try { const r = await api.liveAct(id, 'accept'); openLive(id, r.trade); } catch (e) { toast(e.message); }
}
function openLive(id, t) {
  live.id = id; live.t = null;
  openModal('#live-modal');
  drawLive(t);
  pollLive();
}
async function pollLive() {
  clearTimeout(live.timer);
  if (!live.id || $('#live-modal').hidden) { live.id = null; return; }
  try { if (!live.busy) drawLive((await api.live(live.id)).trade); } catch (e) { /* keep trying */ }
  if (live.t && ['invite', 'open'].includes(live.t.status)) live.timer = setTimeout(pollLive, 1300);
}
const chip = (k, onclick) => {
  const f = findItem(k);
  if (!f) return null;
  return el(onclick ? 'button' : 'div', { class: 'item mini', type: onclick ? 'button' : undefined, onclick }, itemPreview(f.kind, f.item, 40), el('span', { class: 'item-name' }, f.item.name));
};
function drawLive(t) {
  const was = live.t;
  live.t = t;
  const open = t.status === 'open';
  $('#live-h').textContent = `Live trade with ${t.them.name}`;
  $('#live-them-h').textContent = `${t.them.name} gives`;
  const msg = {
    invite: t.invited ? 'Say yes to start.' : `Waiting for ${t.them.name} to say yes…`,
    open: t.me.ready && t.them.ready ? 'Swapping…' : t.me.ready ? `You're ready. Waiting for ${t.them.name}…` : t.them.ready ? `${t.them.name} is ready! Check the trade, then press Ready.` : 'Add items or coins, then both press Ready. Changing anything un-readies both of you.',
    done: 'Trade done! Your new stuff is in My Items.', cancelled: 'This trade was cancelled.', declined: `${t.them.name} said no thanks.`, expired: 'This trade timed out.', failed: "The trade couldn't happen (someone doesn't have those items or coins anymore).",
  }[t.status] || t.status;
  $('#live-status').textContent = msg;
  live.mine = t.me.items.slice();
  $('#live-mine').replaceChildren(...(t.me.items.length ? t.me.items.map((k) => chip(k)) : [el('p', { class: 'small' }, 'Nothing yet')]));
  $('#live-theirs').replaceChildren(...(t.them.items.length ? t.them.items.map((k) => chip(k)) : [el('p', { class: 'small' }, 'Nothing yet')]));
  $('#live-them-coins').textContent = `+ ${t.them.coins} coins${t.them.ready ? '  ✓ Ready' : ''}`;
  if (document.activeElement !== $('#live-coins')) $('#live-coins').value = String(t.me.coins);
  $('#live-coins').disabled = !open;
  const w = progress.wallet;
  const mineAll = w ? Object.entries(w.items).filter(([k, q]) => q > 0 && findItem(k) && canTrade(findItem(k).item)).map(([k]) => k) : [];
  $('#live-pick').replaceChildren(...(mineAll.length ? mineAll.map((k) => { const c = chip(k, () => toggleItem(k)); if (live.mine.includes(k)) c.classList.add('on'); c.disabled = !open; return c; }) : [el('p', { class: 'small' }, 'You have nothing to trade yet. Coins still work!')]));
  $('#live-ready').hidden = !open && !(t.status === 'invite' && t.invited);
  $('#live-ready').textContent = t.status === 'invite' ? 'Say yes' : t.me.ready ? 'Not ready' : 'Ready';
  $('#live-cancel').textContent = ['invite', 'open'].includes(t.status) ? (t.status === 'invite' && t.invited ? 'No thanks' : 'Cancel trade') : 'Close';
  if (t.status === 'done' && was && was.status !== 'done') { refreshWallet(); toast('Trade done!', 'toast-ach'); sfx('buy'); }
}
async function act(action, extra) {
  if (!live.id) return;
  live.busy = true;
  try { drawLive((await api.liveAct(live.id, action, extra)).trade); } catch (e) { toast(e.message); }
  live.busy = false;
  if (live.t && ['invite', 'open'].includes(live.t.status)) pollLive();
}
function toggleItem(k) {
  const items = live.mine.includes(k) ? live.mine.filter((x) => x !== k) : [...live.mine, k];
  act('set', { items, coins: Number($('#live-coins').value) || 0 });
}
let coinTimer = 0;
$('#live-coins').addEventListener('input', () => { clearTimeout(coinTimer); coinTimer = setTimeout(() => act('set', { items: live.mine, coins: Math.max(0, Math.floor(Number($('#live-coins').value) || 0)) }), 600); });
$('#live-ready').addEventListener('click', () => {
  const t = live.t;
  if (!t) return;
  if (t.status === 'invite') act('accept');
  else act(t.me.ready ? 'unready' : 'ready', { v: t.v });
});
$('#live-cancel').addEventListener('click', () => {
  const t = live.t;
  if (t && ['invite', 'open'].includes(t.status)) act(t.status === 'invite' && t.invited ? 'decline' : 'cancel');
  clearTimeout(live.timer); live.id = null;
  closeModal($('#live-modal'));
});
