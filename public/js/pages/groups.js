// Groups: Blockyard's own Discord. Your groups down the side, channels, a chat with replies, reactions and
// polls, members with roles, invite links, and a notification setting for every group.
// On a phone it's one column at a time: groups -> channels -> chat, with a back button.
import { $, el, session, show, go, addRoute, toast, ask, needLogin, timeAgo, copyText, siteBase, onLeave } from '../app.js';
import { api } from '../api.js';
import { emojiNodes, emojiButton } from '../emoji.js';
import { sfx } from '../audio.js';
import { deviceNotes, askDeviceNotes } from '../notify.js';

const COLORS = ['#ff6b35', '#3a86ff', '#44c06a', '#9b5de5', '#ff5d8f', '#ffd23f', '#4cc9f0', '#1d1d2c'];
const NOTIFY = [[2, 'Every message'], [1, 'Only @mentions and replies to me'], [0, 'Nothing']];
const S = { mine: [], discover: [], gid: '', cid: 0, group: null, channels: [], msgs: [], reply: null, timer: 0, more: false, members: null, busy: false };
export const groupsState = S;

const initials = (n) => n.split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
const icon = (g, size = '') => el('span', { class: 'g-icon ' + size, style: `background:${g.color}` }, initials(g.name));
const badge = (n) => (n ? el('span', { class: 'count g-count' }, n > 99 ? '99+' : String(n)) : null);
const page = () => $('#groups-root');
let navNo = 0;

/* ---------------- the three columns ---------------- */
function railNode() {
  return el('nav', { class: 'g-rail', 'aria-label': 'Your groups' },
    ...S.mine.map((g) => el('button', { class: 'g-railbtn' + (g.id === S.gid ? ' on' : ''), type: 'button', title: g.name, 'aria-label': g.name + (g.unread ? `, ${g.unread} new` : ''), onclick: () => go('#/groups/' + g.id) }, icon(g), badge(g.unread))),
    el('button', { class: 'g-railbtn g-add', type: 'button', title: 'Make a group', 'aria-label': 'Make a group', onclick: createGroup }, el('span', { class: 'g-icon' }, '+')),
    el('button', { class: 'g-railbtn g-add' + (!S.gid ? ' on' : ''), type: 'button', title: 'Find groups', 'aria-label': 'Find groups', onclick: () => go('#/groups') }, el('span', { class: 'g-icon' }, '🧭')));
}
// the chat fills the screen under the header, however tall the header is on this device
function measure() { const r = page(); if (r && !r.closest('[hidden]')) r.style.setProperty('--g-top', Math.round(r.getBoundingClientRect().top + scrollY) + 'px'); }
addEventListener('resize', measure);
// phones: while you type, the chat shrinks to the part of the screen the keyboard leaves free
if (window.visualViewport) {
  const fit = () => { document.documentElement.style.setProperty('--vvh', Math.round(visualViewport.height) + 'px'); const l = $('#g-msgs'); if (l && document.body.classList.contains('typing')) l.scrollTop = l.scrollHeight; };
  visualViewport.addEventListener('resize', fit); fit();
}
document.addEventListener('focusin', (e) => { if (e.target.id === 'g-input') document.body.classList.add('typing'); });
document.addEventListener('focusout', (e) => { if (e.target.id === 'g-input') document.body.classList.remove('typing'); });
function frame() {
  const rail = railNode();
  const side = el('aside', { class: 'g-side' });
  const main = el('section', { class: 'g-main' });
  const col = S.gid ? (S.cid ? 'chat' : 'side') : 'home';
  page().replaceChildren(el('div', { class: 'g-app', 'data-col': col }, rail, side, main));
  document.body.dataset.gcol = col;
  measure();
  return { side, main };
}
const setCol = (c) => { const a = page().querySelector('.g-app'); if (a) a.dataset.col = c; document.body.dataset.gcol = c; };

/* ---------------- no group picked: your groups + groups to join ---------------- */
async function showHome() {
  S.gid = ''; S.cid = 0; stopPoll();
  const nav = ++navNo; // if you go somewhere else while this loads, the newer page wins
  show('groups', 'groups');
  if (!session.user) { page().replaceChildren(el('div', { class: 'panel-note' }, el('h3', {}, 'Groups need an account'), el('p', {}, 'Log in to make a group with your friends, chat in channels and vote in polls.'), el('button', { class: 'btn btn-sun', type: 'button', onclick: () => needLogin('Groups need an account.') }, 'Log in or sign up'))); return; }
  try { const r = await api.groups(); if (nav !== navNo) return; S.mine = r.mine; S.discover = r.discover; } catch (e) { if (nav === navNo) page().replaceChildren(el('p', { class: 'msg' }, e.message)); return; }
  const { side, main } = frame();
  side.hidden = true;
  const card = (g, mine) => el('button', { class: 'g-card', type: 'button', onclick: () => (mine ? go('#/groups/' + g.id) : joinFromList(g)) },
    icon(g, 'big'), el('span', { class: 'g-card-text' }, el('b', {}, g.name), el('span', { class: 'small' }, g.descr || 'No description yet.'), el('span', { class: 'small g-meta' }, `${g.members} member${g.members === 1 ? '' : 's'}`, mine && g.unread ? el('span', { class: 'count g-count' }, String(g.unread)) : null)),
    el('span', { class: 'btn ' + (mine ? '' : 'btn-grass') }, mine ? 'Open' : 'Join'));
  main.replaceChildren(
    el('div', { class: 'g-home' },
      el('div', { class: 'section-head' }, el('h1', {}, 'Groups'), el('button', { class: 'btn btn-sun', type: 'button', onclick: createGroup }, '+ Make a group')),
      el('p', { class: 'lede' }, 'Make a group for your friends, your obby crew or your fans. Every group has channels, polls and its own notifications.'),
      el('div', { class: 'row g-joinrow' }, el('input', { id: 'g-code', placeholder: 'Got an invite code or link?', 'aria-label': 'Invite code', autocomplete: 'off' }), el('button', { class: 'btn', type: 'button', onclick: () => { const c = ($('#g-code').value.match(/[A-Za-z0-9]{8}\s*$/) || [''])[0].trim(); if (c) joinCode(c); else toast('Paste the 8-letter invite code (or the whole link).'); } }, 'Join')),
      deviceNotes() === 'off' ? el('div', { class: 'g-bell' }, el('span', {}, '🔔 Want a notification when someone messages your group, even while you are on another tab?'), el('button', { class: 'btn btn-grass', type: 'button', onclick: async (e) => { const st = await askDeviceNotes(true); if (st === 'on') { toast('Notifications are on.'); e.target.closest('.g-bell').remove(); } else toast(st === 'blocked' ? 'Your browser is blocking them. Allow notifications for this site, then try again.' : 'Not turned on.'); } }, 'Turn on')) : null,
      el('h2', {}, 'Your groups'),
      S.mine.length ? el('div', { class: 'g-cards' }, ...S.mine.map((g) => card(g, true))) : el('p', { class: 'small' }, "You're not in a group yet. Make one, or join one below."),
      el('h2', {}, 'Groups to join'),
      S.discover.length ? el('div', { class: 'g-cards' }, ...S.discover.map((g) => card(g, false))) : el('p', { class: 'small' }, 'No open groups yet. Be the first to make one!')));
}
async function joinFromList(g) {
  try { await api.groupJoin(g.id); sfx('badge'); toast(`You joined ${g.name}!`); go('#/groups/' + g.id); } catch (e) { toast(e.message); }
}
async function joinCode(code) {
  if (!session.user) { needLogin('Joining a group needs an account.'); return; }
  try { const r = await api.groupJoinCode(code); sfx('badge'); toast(r.already ? "You're already in that group." : 'You joined the group!'); go('#/groups/' + r.id); }
  catch (e) { toast(e.message); go('#/groups'); }
}
async function createGroup() {
  if (!session.user) { needLogin('Making a group needs an account.'); return; }
  let color = COLORS[1];
  const name = el('input', { maxlength: '28', placeholder: 'Group name', 'aria-label': 'Group name' });
  const descr = el('input', { maxlength: '160', placeholder: 'What is it about? (optional)', 'aria-label': 'Description' });
  const open = el('input', { type: 'checkbox' }); open.checked = true;
  const sw = el('div', { class: 'row g-swatches' }, ...COLORS.map((c) => el('button', { class: 'swatch' + (c === color ? ' on' : ''), type: 'button', style: `background:${c}`, 'aria-label': 'Color ' + c, onclick: (e) => { color = c; for (const b of sw.children) b.classList.toggle('on', b === e.currentTarget); } })));
  const ok = await ask('Make a group', 'You can change all of this later.', [{ label: 'Make it', value: true, cls: 'btn-sun' }],
    el('div', { class: 'g-form' }, name, descr, sw, el('label', { class: 'check' }, open, ' Anyone can find and join it (untick for invite only)')));
  if (!ok) return;
  try { const r = await api.groupCreate({ name: name.value, descr: descr.value, color, open: open.checked }); sfx('badge'); go('#/groups/' + r.id); } catch (e) { toast(e.message); }
}

/* ---------------- a group: channels on the left, chat on the right ---------------- */
async function showGroup(gid, cid) {
  show('groups', 'groups');
  if (!session.user) { showHome(); return; }
  stopPoll();
  const nav = ++navNo;
  S.gid = gid; S.cid = Number(cid) || 0; S.reply = null; S.members = null;
  let r;
  try { [r] = await Promise.all([api.group(gid), api.groups().then((x) => { S.mine = x.mine; S.discover = x.discover; })]); }
  catch (e) { if (nav === navNo) { toast(e.message); go('#/groups'); } return; }
  if (nav !== navNo) return;
  S.group = r.group; S.channels = r.channels;
  if (!S.group.role && !S.group.admin) { frontDoor(); return; }
  const wide = matchMedia('(min-width: 761px)').matches;
  if (!S.cid && wide && S.channels.length) S.cid = S.channels[0].id;
  const { side, main } = frame();
  drawSide(side);
  if (S.cid) openChannel(main); else main.replaceChildren(el('p', { class: 'small g-pick' }, 'Pick a channel.'));
}
function frontDoor() {
  const g = S.group; const { side, main } = frame(); side.hidden = true; setCol('chat');
  main.replaceChildren(el('div', { class: 'g-door' }, icon(g, 'huge'), el('h1', {}, g.name), el('p', {}, g.descr || ''), el('p', { class: 'small' }, `${g.members} member${g.members === 1 ? '' : 's'} · made by ${g.owner}`),
    g.open ? el('button', { class: 'btn btn-big btn-grass', type: 'button', onclick: () => joinFromList(g) }, 'Join this group') : el('p', { class: 'small' }, 'This group is invite only. Ask a member for the invite link.'),
    el('button', { class: 'btn', type: 'button', onclick: () => go('#/groups') }, 'Back to groups')));
}
function drawSide(side) {
  const g = S.group, top = g.role === 'owner' || g.admin;
  side.replaceChildren(
    el('div', { class: 'g-side-head' }, el('button', { class: 'btn g-back', type: 'button', 'aria-label': 'Back to groups', onclick: () => go('#/groups') }, '‹'), icon(g), el('b', { class: 'g-name' }, g.name),
      el('button', { class: 'btn g-gear', type: 'button', 'aria-label': 'Group settings', title: 'Group settings', onclick: groupMenu }, '⚙')),
    g.descr ? el('p', { class: 'small g-descr' }, g.descr) : null,
    el('div', { class: 'g-chans' }, ...S.channels.map((c) => el('button', { class: 'g-chan' + (c.id === S.cid ? ' on' : '') + (c.unread ? ' unread' : ''), type: 'button', onclick: () => go(`#/groups/${g.id}/${c.id}`) },
      el('span', { class: 'g-hash' }, c.kind === 'news' ? '📣' : '#'), el('span', { class: 'g-chan-name' }, c.name), badge(c.unread)))),
    top ? el('button', { class: 'btn g-small', type: 'button', onclick: addChannel }, '+ Add a channel') : null,
    el('div', { class: 'g-side-foot' },
      el('button', { class: 'btn g-small', type: 'button', onclick: showMembers }, `👥 Members (${g.members})`),
      el('button', { class: 'btn g-small', type: 'button', onclick: inviteMenu }, '✉ Invite')));
}
async function addChannel() {
  const name = el('input', { maxlength: '24', placeholder: 'channel-name', 'aria-label': 'Channel name' });
  const news = el('input', { type: 'checkbox' });
  const ok = await ask('Add a channel', '', [{ label: 'Add it', value: true, cls: 'btn-sun' }], el('div', { class: 'g-form' }, name, el('label', { class: 'check' }, news, ' News channel (only the owner and mods can post; everyone can react and vote)')));
  if (!ok) return;
  try { const r = await api.groupChannelAdd(S.gid, name.value, news.checked ? 'news' : 'text'); go(`#/groups/${S.gid}/${r.id}`); } catch (e) { toast(e.message); }
}
async function editChannel(ch) {
  const name = el('input', { maxlength: '24', value: ch.name, 'aria-label': 'Channel name' });
  const v = await ask('# ' + ch.name, '', [{ label: 'Rename', value: 'rename', cls: 'btn-sun' }, { label: 'Delete channel', value: 'delete', cls: 'btn-danger' }], el('div', { class: 'g-form' }, name));
  if (!v) return;
  try {
    if (v === 'rename') { await api.groupChannelAct(S.gid, ch.id, 'rename', { name: name.value }); showGroup(S.gid, ch.id); }
    else if (await ask(`Delete #${ch.name}?`, 'Every message in it is deleted.', [{ label: 'Delete it', value: true, cls: 'btn-danger' }])) { await api.groupChannelAct(S.gid, ch.id, 'delete'); go('#/groups/' + S.gid); }
  } catch (e) { toast(e.message); }
}

/* ---------------- the chat ---------------- */
function openChannel(main) {
  const ch = S.channels.find((c) => c.id === S.cid);
  if (!ch) { go('#/groups/' + S.gid); return; }
  setCol('chat');
  const g = S.group, canPost = ch.kind !== 'news' || g.role === 'owner' || g.role === 'mod';
  const list = el('ol', { class: 'g-msgs', id: 'g-msgs', 'aria-live': 'polite' });
  const pinned = el('div', { class: 'g-pinned', hidden: true });
  const replyBar = el('div', { class: 'g-replybar', hidden: true });
  const input = el('textarea', { id: 'g-input', rows: '1', maxlength: '500', placeholder: canPost ? (matchMedia('(max-width: 760px)').matches ? 'Message' : `Message #${ch.name}`) : 'Only the owner and mods can post here', 'aria-label': 'Message', disabled: !canPost });
  const send = async () => {
    const m = input.value.trim(); if (!m || S.busy) return;
    S.busy = true;
    try { await api.groupSend(S.gid, S.cid, { m, reply: S.reply ? S.reply.id : 0 }); input.value = ''; input.style.height = ''; setReply(null); sfx('send'); await poll(true); }
    catch (e) { toast(e.message); }
    S.busy = false;
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); send(); } });
  input.addEventListener('input', () => { input.style.height = ''; input.style.height = Math.min(120, input.scrollHeight) + 'px'; });
  const setReply = (m) => { S.reply = m; replyBar.hidden = !m; if (m) { replyBar.replaceChildren(el('span', { class: 'small' }, 'Replying to ', el('b', {}, m.name), ': ' + m.text.slice(0, 60)), el('button', { class: 'btn g-x', type: 'button', 'aria-label': 'Stop replying', onclick: () => setReply(null) }, '✕')); input.focus(); } };
  S.setReply = setReply;
  const form = el('div', { class: 'g-compose' }, replyBar,
    el('div', { class: 'g-compose-row' },
      canPost ? el('button', { class: 'btn g-poll', type: 'button', title: 'Start a poll', 'aria-label': 'Start a poll', onclick: makePoll }, '📊') : null,
      input, canPost ? emojiButton((code) => { input.value += code; input.focus(); }) : null,
      canPost ? el('button', { class: 'btn btn-sun', type: 'button', onclick: send }, 'Send') : null));
  main.replaceChildren(
    el('div', { class: 'g-chat-head' }, el('button', { class: 'btn g-back', type: 'button', 'aria-label': 'Back to channels', onclick: () => { stopPoll(); S.cid = 0; history.replaceState(null, '', '#/groups/' + S.gid); setCol('side'); const s = page().querySelector('.g-side'); if (s) drawSide(s); } }, '‹'),
      el('b', {}, (ch.kind === 'news' ? '📣 ' : '# ') + ch.name), el('span', { class: 'small g-chat-group' }, g.name),
      g.role === 'owner' || g.admin ? el('button', { class: 'btn g-small', type: 'button', title: 'Rename or delete this channel', 'aria-label': 'Rename or delete this channel', onclick: () => editChannel(ch) }, '✎') : null,
      el('button', { class: 'btn g-small g-members-btn', type: 'button', title: 'Members', 'aria-label': 'Members', onclick: showMembers }, '👥')),
    pinned, list, form);
  S.msgs = []; S.more = false;
  loadFirst(list, pinned);
}
async function loadFirst(list, pinned) {
  list.replaceChildren(el('li', { class: 'g-empty' }, 'Loading…'));
  try {
    const gid = S.gid, cid = S.cid;
    const r = await api.groupMessages(gid, cid);
    if (gid !== S.gid || cid !== S.cid || !list.isConnected) return;
    S.msgs = r.messages; S.more = r.more;
    if (r.pinned) { pinned.hidden = false; pinned.replaceChildren(el('span', {}, '📌 ', el('b', {}, r.pinned.name + ': '), ...emojiNodes(r.pinned.text.slice(0, 140) || (r.pinned.poll ? r.pinned.poll.q : ''), 16))); }
    drawMsgs(true);
    const c = S.channels.find((x) => x.id === S.cid); if (c) c.unread = 0;
    const s = page().querySelector('.g-side'); if (s) drawSide(s);
    dispatchEvent(new Event('by:pulse'));
    startPoll();
  } catch (e) { list.replaceChildren(el('li', { class: 'g-empty' }, e.message)); }
}
const fmtTime = (t) => { const d = new Date(t), now = new Date(); const hm = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); return d.toDateString() === now.toDateString() ? hm : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + hm; };
// text with Pip emojis, and @names lit up (yours brighter)
function richText(text) {
  const me = session.user ? session.user.name.toLowerCase() : '';
  const out = [];
  for (const part of String(text).split(/(@[A-Za-z0-9_]{3,20})/g)) {
    if (/^@[A-Za-z0-9_]{3,20}$/.test(part)) out.push(el('span', { class: 'g-at' + (part.slice(1).toLowerCase() === me || part.toLowerCase() === '@everyone' ? ' you' : '') }, part));
    else out.push(...emojiNodes(part, 20));
  }
  return out;
}
function pollCard(m) {
  const p = m.poll, total = Math.max(1, p.total);
  const left = p.ends - Date.now();
  return el('div', { class: 'g-pollcard' }, el('b', {}, '📊 ' + p.q),
    ...p.options.map((o, i) => el('button', { class: 'g-opt' + (o.me ? ' you' : ''), type: 'button', disabled: p.over, onclick: async () => { try { await api.groupVote(S.gid, p.id, i); sfx('pop'); poll(true); } catch (e) { toast(e.message); } } },
      el('span', { class: 'g-opt-bar', style: `width:${Math.round(o.n / total * 100)}%` }), el('span', { class: 'g-opt-text' }, (o.me ? '✓ ' : '') + o.t), el('span', { class: 'g-opt-n' }, `${o.n} · ${Math.round(o.n / total * 100)}%`))),
    el('span', { class: 'small' }, `${p.total} vote${p.total === 1 ? '' : 's'} · ` + (p.over ? 'poll over' : left > 3600e3 ? `${Math.round(left / 3600e3)} hours left` : `${Math.max(1, Math.round(left / 60e3))} minutes left`) + (p.multi ? ' · pick as many as you like' : '')));
}
function msgNode(m, prev) {
  const g = S.group, mod = g.role === 'owner' || g.role === 'mod' || g.admin;
  const joined = prev && prev.name === m.name && m.at - prev.at < 5 * 60e3 && !m.reply && !prev.poll && !m.poll;
  const reacts = el('div', { class: 'g-reacts' }, ...m.reacts.map((r) => el('button', { class: 'g-react' + (r.me ? ' you' : ''), type: 'button', onclick: () => react(m, r.e) }, r.e + ' ' + r.n)));
  const picker = el('div', { class: 'g-picker', hidden: true }, ...(g.reactions || []).map((e) => el('button', { type: 'button', class: 'g-react', onclick: () => { picker.hidden = true; react(m, e); } }, e)));
  const tools = el('div', { class: 'g-tools' },
    el('button', { type: 'button', title: 'React', 'aria-label': 'React', onclick: () => { picker.hidden = !picker.hidden; } }, '😊'),
    el('button', { type: 'button', title: 'Reply', 'aria-label': 'Reply', onclick: () => S.setReply && S.setReply(m) }, '↩'),
    mod ? el('button', { type: 'button', title: m.pinned ? 'Unpin' : 'Pin', 'aria-label': 'Pin', onclick: async () => { try { await api.groupMsgAct(S.gid, m.id, 'pin'); toast(m.pinned ? 'Unpinned.' : 'Pinned to the top of the channel.'); showGroup(S.gid, S.cid); } catch (e) { toast(e.message); } } }, '📌') : null,
    m.me || mod ? el('button', { type: 'button', title: 'Delete', 'aria-label': 'Delete', onclick: async () => { if (!(await ask('Delete this message?', m.text.slice(0, 120) || 'This poll', [{ label: 'Delete', value: true, cls: 'btn-danger' }]))) return; try { await api.groupMsgAct(S.gid, m.id, 'delete'); S.msgs = S.msgs.filter((x) => x.id !== m.id); drawMsgs(); } catch (e) { toast(e.message); } } }, '🗑') : null,
    !m.me ? el('button', { type: 'button', title: 'Report', 'aria-label': 'Report', onclick: async () => { const why = await ask(`Report ${m.name}'s message?`, 'An admin will look at it and the messages around it.', [{ label: 'Being mean', value: 'mean' }, { label: 'Spam', value: 'spam' }, { label: 'Sharing personal info', value: 'personal' }, { label: 'Something else', value: 'other' }]); if (!why) return; try { await api.groupMsgAct(S.gid, m.id, 'report', { reason: why }); toast('Reported. Thanks for keeping Blockyard nice.'); } catch (e) { toast(e.message); } } }, '🚩') : null);
  // on a phone there is no hover: tapping a message shows its buttons
  return el('li', { class: 'g-msg' + (joined ? ' joined' : '') + (m.me ? ' mine' : '') + (richMention(m) ? ' pinged' : ''), 'data-id': String(m.id), onclick: (e) => { if (e.target.closest('button, a')) return; const li = e.currentTarget, was = li.classList.contains('open'); for (const o of li.parentNode.querySelectorAll('.open')) o.classList.remove('open'); if (!was) li.classList.add('open'); } },
    joined ? el('span', { class: 'g-avatar-gap' }) : el('a', { class: 'g-avatar', style: `background:${m.color}`, href: '#/u/' + encodeURIComponent(m.name), 'aria-label': m.name + "'s profile" }, m.name[0].toUpperCase()),
    el('div', { class: 'g-body' },
      joined ? null : el('div', { class: 'g-by' }, el('a', { class: 'g-who', href: '#/u/' + encodeURIComponent(m.name) }, m.name), m.role === 'owner' ? el('span', { class: 'g-role owner' }, 'Owner') : m.role === 'mod' ? el('span', { class: 'g-role' }, 'Mod') : null, el('span', { class: 'g-time' }, fmtTime(m.at))),
      m.reply ? el('div', { class: 'g-quote' }, el('b', {}, m.reply.name + ': '), m.reply.text || '📊 poll') : null,
      m.poll ? pollCard(m) : el('div', { class: 'g-text' }, ...richText(m.text)),
      reacts, picker),
    tools);
}
const richMention = (m) => { const me = session.user ? '@' + session.user.name.toLowerCase() : '~'; const t = m.text.toLowerCase(); return !m.me && (t.includes(me) || t.includes('@everyone')); };
function drawMsgs(toEnd) {
  const list = $('#g-msgs'); if (!list) return;
  const atEnd = toEnd || list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  const nodes = [];
  if (S.more) nodes.push(el('li', { class: 'g-empty' }, el('button', { class: 'btn g-small', type: 'button', onclick: loadOlder }, 'Show older messages')));
  if (!S.msgs.length) nodes.push(el('li', { class: 'g-empty' }, 'No messages yet. Say hi!'));
  S.msgs.forEach((m, i) => nodes.push(msgNode(m, S.msgs[i - 1])));
  list.replaceChildren(...nodes);
  if (atEnd) list.scrollTop = list.scrollHeight;
}
async function loadOlder() {
  if (!S.msgs.length) return;
  try { const list = $('#g-msgs'), h = list.scrollHeight; const r = await api.groupMessages(S.gid, S.cid, { before: S.msgs[0].id }); S.msgs = [...r.messages, ...S.msgs]; S.more = r.messages.length >= 50; drawMsgs(); list.scrollTop = list.scrollHeight - h; } catch (e) { toast(e.message); }
}
async function react(m, e) { try { await api.groupMsgAct(S.gid, m.id, 'react', { e }); sfx('pop'); poll(true); } catch (err) { toast(err.message); } }
async function makePoll() {
  const q = el('input', { maxlength: '140', placeholder: 'Ask a question', 'aria-label': 'Question' });
  const opts = el('div', { class: 'g-form' });
  const addOpt = () => { if (opts.children.length < 8) opts.append(el('input', { maxlength: '60', placeholder: 'Answer ' + (opts.children.length + 1), 'aria-label': 'Answer ' + (opts.children.length + 1) })); };
  addOpt(); addOpt(); addOpt();
  const multi = el('input', { type: 'checkbox' });
  const hours = el('select', { 'aria-label': 'How long' }, ...[[1, '1 hour'], [6, '6 hours'], [24, '1 day'], [72, '3 days'], [168, '1 week']].map(([v, n]) => el('option', { value: String(v) }, n))); hours.value = '24';
  const ok = await ask('Start a poll', '', [{ label: 'Post the poll', value: true, cls: 'btn-sun' }],
    el('div', { class: 'g-form' }, q, opts, el('button', { class: 'btn g-small', type: 'button', onclick: addOpt }, '+ Another answer'), el('label', { class: 'check' }, multi, ' People can pick more than one'), el('label', {}, 'Open for ', hours)));
  if (!ok) return;
  try { await api.groupSend(S.gid, S.cid, { poll: { q: q.value, options: [...opts.children].map((i) => i.value), multi: multi.checked, hours: Number(hours.value) } }); sfx('send'); poll(true); } catch (e) { toast(e.message); }
}

/* ---------------- staying up to date while a channel is open ---------------- */
function stopPoll() { clearTimeout(S.timer); S.timer = 0; }
function startPoll() { stopPoll(); S.timer = setTimeout(() => poll(), 4000); }
async function poll(now) {
  if (!S.cid || !$('#g-msgs')) { stopPoll(); return; }
  if (document.hidden && !now) { startPoll(); return; }
  stopPoll();
  const gid = S.gid, cid = S.cid;
  try {
    const last = S.msgs.length ? S.msgs[S.msgs.length - 1].id : 0;
    const r = last ? await api.groupMessages(gid, cid, { after: last, fresh: 1 }) : await api.groupMessages(gid, cid);
    if (gid !== S.gid || cid !== S.cid) return;
    let changed = r.messages.length > 0;
    if (r.fresh) {
      // the newest 30 as they are now: reactions and votes changed, deleted ones are gone
      const lo = r.fresh.length ? r.fresh[0].id : Infinity, F = new Map(r.fresh.map((m) => [m.id, m]));
      const before = JSON.stringify(S.msgs.filter((m) => m.id >= lo));
      S.msgs = S.msgs.filter((m) => m.id < lo || F.has(m.id)).map((m) => F.get(m.id) || m);
      if (JSON.stringify(S.msgs.filter((m) => m.id >= lo)) !== before) changed = true;
    }
    if (r.messages.length) { S.msgs.push(...r.messages); if (r.messages.some((m) => !m.me)) sfx('chat'); }
    if (!last) { S.msgs = r.messages; changed = true; }
    if (changed) drawMsgs(r.messages.some((m) => m.me));
  } catch (e) { /* try again */ }
  if (S.cid === cid) startPoll();
}

/* ---------------- members, invites, settings ---------------- */
async function showMembers() {
  const g = S.group, top = g.role === 'owner' || g.admin, mod = top || g.role === 'mod';
  let r; try { r = await api.groupMembers(S.gid); } catch (e) { toast(e.message); return; }
  const act = async (name, a, sure) => { if (sure && !(await ask(sure, '', [{ label: 'Yes', value: true, cls: 'btn-danger' }]))) return; try { await api.groupMember(S.gid, name, a); toast('Done.'); showMembers(); } catch (e) { toast(e.message); } };
  const rows = r.members.map((m) => el('li', { class: 'g-member' },
    el('span', { class: 'g-avatar small', style: `background:${m.color}` }, m.name[0].toUpperCase()), el('span', { class: 'g-dot' + (m.online ? ' on' : '') , title: m.online ? 'Online' : 'Offline' }),
    el('a', { class: 'g-who', href: '#/u/' + encodeURIComponent(m.name), onclick: () => { $('#ask-modal').hidden = true; } }, m.name),
    m.role !== 'member' ? el('span', { class: 'g-role ' + (m.role === 'owner' ? 'owner' : '') }, m.role === 'owner' ? 'Owner' : 'Mod') : null,
    el('span', { class: 'g-member-acts' },
      top && m.role === 'member' ? el('button', { class: 'btn g-small', type: 'button', onclick: () => act(m.name, 'mod') }, 'Make mod') : null,
      top && m.role === 'mod' ? el('button', { class: 'btn g-small', type: 'button', onclick: () => act(m.name, 'member') }, 'Remove mod') : null,
      g.role === 'owner' && m.role !== 'owner' ? el('button', { class: 'btn g-small', type: 'button', onclick: () => act(m.name, 'owner', `Give the whole group to ${m.name}? You become a mod.`) }, 'Make owner') : null,
      mod && m.role !== 'owner' && (top || m.role === 'member') && m.name !== session.user.name ? el('button', { class: 'btn g-small', type: 'button', onclick: () => act(m.name, 'kick', `Remove ${m.name} from the group?`) }, 'Remove') : null,
      mod && m.role !== 'owner' && (top || m.role === 'member') && m.name !== session.user.name ? el('button', { class: 'btn g-small btn-danger', type: 'button', onclick: () => act(m.name, 'ban', `Ban ${m.name}? They can't come back.`) }, 'Ban') : null)));
  ask(`Members of ${g.name}`, `${r.members.filter((m) => m.online).length} online · ${r.members.length} members`, [], el('ul', { class: 'g-memberlist' }, ...rows));
}
function inviteLink() { return siteBase() + '#/groups/join/' + S.group.code; }
async function inviteMenu() {
  const g = S.group;
  const name = el('input', { maxlength: '20', placeholder: "A friend's name", 'aria-label': "Friend's name" });
  const link = g.code ? el('input', { readonly: true, value: inviteLink(), 'aria-label': 'Invite link', onfocus: (e) => e.target.select() }) : null;
  const copy = g.code ? el('button', { class: 'btn', type: 'button', onclick: (e) => copyText(inviteLink(), e.currentTarget, 'Copy link') }, 'Copy link') : null;
  const ok = await ask('Invite to ' + g.name, g.code ? 'Send a friend an invite in their mailbox, or share the link with anyone.' : 'Send a friend an invite in their mailbox.', [{ label: 'Send invite', value: true, cls: 'btn-sun' }],
    el('div', { class: 'g-form' }, name, g.code ? el('div', { class: 'row' }, link, copy) : el('p', { class: 'small' }, 'Only the owner and mods see the invite link.')));
  if (!ok || !name.value.trim()) return;
  try { await api.groupInvite(S.gid, name.value.trim()); toast(`Invite sent to ${name.value.trim()}.`); } catch (e) { toast(e.message); }
}
async function groupMenu() {
  const g = S.group, top = g.role === 'owner' || g.admin;
  let color = g.color;
  const notify = el('select', { 'aria-label': 'Notifications' }, ...NOTIFY.map(([v, n]) => el('option', { value: String(v) }, n))); notify.value = String(g.notify);
  const name = el('input', { maxlength: '28', value: g.name, 'aria-label': 'Group name' });
  const descr = el('input', { maxlength: '160', value: g.descr, placeholder: 'Description', 'aria-label': 'Description' });
  const open = el('input', { type: 'checkbox' }); open.checked = g.open;
  const sw = el('div', { class: 'row g-swatches' }, ...COLORS.map((c) => el('button', { class: 'swatch' + (c === color ? ' on' : ''), type: 'button', style: `background:${c}`, 'aria-label': 'Color ' + c, onclick: (e) => { color = c; for (const b of sw.children) b.classList.toggle('on', b === e.currentTarget); } })));
  const choice = await ask(g.name, '', [{ label: 'Save', value: 'save', cls: 'btn-sun' }, ...(g.role === 'owner' ? [{ label: 'Delete group', value: 'delete', cls: 'btn-danger' }] : g.role ? [{ label: 'Leave group', value: 'leave', cls: 'btn-danger' }] : [])],
    el('div', { class: 'g-form' }, el('label', {}, 'Notify me about ', notify),
      ...(top ? [el('h3', {}, 'The group'), name, descr, sw, el('label', { class: 'check' }, open, ' Anyone can find and join it'), el('button', { class: 'btn g-small', type: 'button', onclick: async () => { try { await api.groupSettings(S.gid, { newCode: true }); toast('New invite link made. The old one stopped working.'); } catch (e) { toast(e.message); } } }, 'Make a new invite link')] : [])));
  if (!choice) return;
  try {
    if (choice === 'save') { await api.groupSettings(S.gid, top ? { notify: Number(notify.value), name: name.value, descr: descr.value, color, open: open.checked } : { notify: Number(notify.value) }); toast('Saved.'); showGroup(S.gid, S.cid); }
    else if (choice === 'leave') { if (await ask(`Leave ${g.name}?`, '', [{ label: 'Leave', value: true, cls: 'btn-danger' }])) { await api.groupLeave(S.gid); go('#/groups'); } }
    else if (choice === 'delete') { if (await ask(`Delete ${g.name} for everyone?`, 'Every channel and message in it is deleted. This cannot be undone.', [{ label: 'Delete it', value: true, cls: 'btn-danger' }])) { await api.groupDelete(S.gid); toast('Group deleted.'); go('#/groups'); } }
  } catch (e) { toast(e.message); }
}

onLeave('groups', () => { navNo++; stopPoll(); delete document.body.dataset.gcol; });
// a message arrived somewhere else in your groups: update the little counts
addEventListener('by:groups-new', async (e) => {
  const d = e.detail;
  const g = S.mine.find((x) => x.id === d.gid); if (g) g.unread = (g.unread || 0) + 1;
  if (d.gid === S.gid) { const c = S.channels.find((x) => x.id === d.cid); if (c && c.id !== S.cid) c.unread = (c.unread || 0) + 1; const s = page().querySelector('.g-side'); if (s && !s.hidden) drawSide(s); }
  const rail = page().querySelector('.g-rail'); if (rail) rail.replaceWith(railNode());
});
addRoute(/^#\/groups$/, () => showHome());
addRoute(/^#\/groups\/join\/([A-Za-z0-9]{8})$/, (m) => { navNo++; show('groups', 'groups'); joinCode(m[1]); });
addRoute(/^#\/groups\/([A-Za-z0-9]{10})$/, (m) => showGroup(m[1], 0));
addRoute(/^#\/groups\/([A-Za-z0-9]{10})\/(\d+)$/, (m) => showGroup(m[1], m[2]));
