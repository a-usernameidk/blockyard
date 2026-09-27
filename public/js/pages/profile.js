// A player's page: their look, stars, badges, closet, games, and where they're playing right now.
import { $, el, session, show, go, addRoute, pipCanvas, plural, needLogin, ask } from '../app.js';
import { pfpCanvas, titleText, titleClass, tagPills } from '../pfp.js';
import { PFP_BGS, parsePfp, cleanDisplay, DISPLAY } from '../names.js';
import { PIP_EMOJIS } from '../emoji.js';
import { renderMe } from './account.js';
import { api } from '../api.js';
import { findItem, valueOf } from '../cosmetics.js';
import { ACHIEVEMENTS, progress } from '../progress.js';
import { itemPreview } from './closet.js';
import { publishedCard, diffFace } from './play.js';
import { playerWorldCard } from './worlds.js';
import { manageUser } from './admin.js';
import { friendsNow, checkFriends, openFriends } from './account.js';
import { toast } from '../app.js';
import { openDMs, startLive, openGift } from './social.js';

// "Add friend" / "Friends" / "Request sent" for someone's profile
function friendButton(name) {
  const b = el('button', { class: 'btn', type: 'button' });
  const lower = name.toLowerCase();
  const paint = () => {
    const d = friendsNow();
    const has = (list) => d && list.some((f) => f.name.toLowerCase() === lower);
    const state = !d ? 'none' : has(d.friends) ? 'friends' : has(d.incoming) ? 'incoming' : has(d.outgoing) ? 'sent' : 'none';
    b.textContent = { friends: 'Friends ✓', incoming: 'Accept friend request', sent: 'Friend request sent', none: 'Add friend' }[state];
    b.className = 'btn' + (state === 'none' || state === 'incoming' ? ' btn-grass' : '');
    b.onclick = async () => {
      if (!session.user) { needLogin('Friends need an account.'); return; }
      if (state === 'friends' || state === 'sent') { openFriends(); return; }
      try { const r = await api.friend(name, 'add'); toast(r.status === 'friends' ? `You and ${name} are friends now!` : `Friend request sent to ${name}.`); await checkFriends(); paint(); } catch (e) { toast(e.message); }
    };
  };
  paint();
  if (session.user && !friendsNow()) checkFriends().then(paint);
  return b;
}

// difficulty faces they've beaten: verified (Blockyard's and admin-rated levels) and unverified (not rated yet)
const FACE_STARS = { easy: 1, normal: 3, hard: 5, harder: 7, insane: 9, demon: 10 };
function facesBox(f) {
  if (!f) return null;
  const row = (label, o) => {
    const keys = [...Object.keys(FACE_STARS), 'unrated'].filter((k) => o[k]);
    return el('div', { class: 'faces-row' }, el('b', {}, label), ...(keys.length ? keys.map((k) => el('span', { class: 'face-count', title: k }, k === 'unrated' ? el('span', { class: 'unrated' }, '?') : diffFace(FACE_STARS[k], 34), `×${o[k]}`)) : [el('span', { class: 'small' }, 'None yet')]));
  };
  return el('div', { class: 'faces-box' }, el('h2', {}, 'Difficulty faces beaten'), row('Verified', f.verified || {}), row('Unverified', f.unverified || {}),
    el('p', { class: 'small' }, "Verified: Blockyard's levels and player levels the admin rated. Unverified: player levels that aren't rated yet (by what players voted)."));
}
// Follow: hear about new levels and worlds they publish (no need to be friends)
function followButton(u) {
  let on = !!u.iFollow;
  const b = el('button', { class: 'btn ' + (on ? '' : 'btn-grass'), type: 'button' }, on ? 'Following ✓' : 'Follow');
  b.addEventListener('click', async () => {
    if (!session.user) { needLogin('Following needs an account.'); return; }
    b.disabled = true;
    try {
      const r = await api.follow(u.name, !on); on = r.following;
      b.textContent = on ? 'Following ✓' : 'Follow'; b.className = 'btn ' + (on ? '' : 'btn-grass');
      const c = document.querySelector('.follow-count'); if (c) c.textContent = plural(r.followers, 'follower');
      toast(on ? `You follow ${u.name}. You'll hear about their new levels and worlds.` : `You stopped following ${u.name}.`);
    } catch (e) { toast(e.message); }
    b.disabled = false;
  });
  return b;
}
async function showProfile(name) {
  show('profile', '');
  const page = $('#profile-page');
  page.replaceChildren(el('p', { class: 'msg' }, 'Loading…'));
  let u;
  try { u = await api.user(name); } catch (e) { page.replaceChildren(el('div', { class: 'panel-note' }, el('h3', {}, "Couldn't find that player"), el('p', {}, e.message))); return; }
  const me = session.user && session.user.name.toLowerCase() === u.name.toLowerCase();
  if (me) progress.peak('followers', u.followers || 0);
  const badges = Object.keys(u.badges || {}).map((b) => ACHIEVEMENTS.find((a) => a.id === b)).filter(Boolean);
  const items = u.items.map((i) => ({ ...i, f: findItem(i.key) })).filter((i) => i.f);
  const games2d = u.games.filter((g) => g.kind !== '3d'), games3d = u.games.filter((g) => g.kind === '3d');
  page.replaceChildren(
    el('div', { class: 'profile-head' }, pipCanvas(120, u.look),
      el('div', {},
        el('div', { class: 'profile-name' }, pfpCanvas(u.pfp, u.look, 64),
          el('div', {},
            el('h1', {}, u.display || u.name,
              titleText(u.title) ? el('span', { class: 'title-pill' + titleClass(u.title), title: 'Their title' }, titleText(u.title)) : null,
              ...tagPills(u.tags, (t, name) => el('span', { class: 'role-badge ' + t }, name)),
              u.role === 'builder' ? el('span', { class: 'role-badge' }, 'Builder') : u.role === 'builderpro' ? el('span', { class: 'role-badge pro' }, 'Builder Pro') : null,
              u.admin ? el('span', { class: 'role-badge admin' }, u.owner ? 'Owner' : 'Admin') : null),
            el('p', { class: 'username' }, '@' + u.name))),
        el('p', { class: 'lede' }, `Playing since ${new Date(u.since).toLocaleDateString()}. `, el('b', { class: 'follow-count' }, plural(u.followers || 0, 'follower')), ` · ${u.following || 0} following`),
        el('div', { class: 'card-meta' }, u.rstars ? el('span', { class: 'tag tag-diff', title: 'Stars from beating rated levels and obbies' }, `${u.rstars}★ difficulty stars`) : null, el('span', { class: 'tag' }, plural(u.stars, 'level star')), el('span', { class: 'tag' }, `Items worth ${u.value} coins`), el('span', { class: 'tag' }, plural(u.games.length, 'published game'))),
        u.playing ? el('p', { class: 'playing' }, el('span', { class: 'live-dot' }), `Playing ${u.playing.name || 'a player world'} right now`) : null,
        el('div', { class: 'row' },
          !me ? el('button', { class: 'btn btn-sun', type: 'button', onclick: () => (session.user ? go('#/closet/trade/' + u.name) : needLogin('Trading needs an account.')) }, 'Trade with them') : el('button', { class: 'btn', type: 'button', 'data-go': '#/closet' }, 'Change my look'),
          me ? el('button', { class: 'btn btn-sun', type: 'button', onclick: () => editProfile(u) }, 'Edit profile') : null,
          !me ? friendButton(u.name) : el('button', { class: 'btn', type: 'button', onclick: openFriends }, 'My friends'),
          !me ? followButton(u) : null,
          u.playing && u.playing.code && !me ? el('button', { class: 'btn btn-grass', type: 'button', onclick: () => go('#/join/' + u.playing.code) }, 'Join them') : null),
        !me ? el('div', { class: 'row' },
          el('button', { class: 'btn', type: 'button', onclick: () => openDMs(u.name) }, 'Message'),
          el('button', { class: 'btn btn-sun', type: 'button', onclick: () => startLive(u.name) }, 'Live trade'),
          el('button', { class: 'btn', type: 'button', onclick: () => openGift(u.name) }, 'Send coins')) : null,
        session.user && session.user.admin ? el('div', { class: 'admin-strip row' }, el('b', {}, 'Admin'),
          el('button', { class: 'btn btn-sun', type: 'button', onclick: () => manageUser(u.name) }, me ? 'Give myself coins or items' : 'Coins, items, kick, ban…')) : null)),
    facesBox(u.faces),
    badges.length ? el('h2', {}, 'Badges') : null,
    badges.length ? el('div', { class: 'chips' }, ...badges.sort((a, b) => (b.chosen ? 2 : b.hard ? 1 : 0) - (a.chosen ? 2 : a.hard ? 1 : 0)).map((b) => el('span', { class: 'chip' + (b.hard ? ' chip-hard' : '') + (b.chosen ? ' chip-chosen' : ''), title: b.text }, b.name))) : null,
    el('h2', {}, 'Items'),
    items.length ? el('div', { class: 'items' }, ...items.map((i) => el('div', { class: 'item' }, itemPreview(i.f.kind, i.f.item), el('span', { class: 'item-name' }, i.f.item.name), el('span', { class: 'item-price' }, `Worth ${valueOf(i.f.item)}${i.qty > 1 ? ` (x${i.qty})` : ''}`)))) : el('p', { class: 'small' }, 'Nothing to trade yet.'),
    games3d.length ? el('h2', {}, 'Worlds') : null,
    games3d.length ? el('div', { class: 'grid' }, ...games3d.map(playerWorldCard)) : null,
    games2d.length ? el('h2', {}, 'Levels') : null,
    games2d.length ? el('div', { class: 'grid' }, ...games2d.map(publishedCard).filter(Boolean)) : null);
}
// Your display name and profile picture
async function editProfile(u) {
  let pick = parsePfp(u.pfp);
  const preview = el('span', { class: 'pfp-preview' });
  const drawPrev = () => preview.replaceChildren(pfpCanvas(`${pick.pic}.${pick.bg}`, u.look, 84));
  const pics = el('div', { class: 'pfp-grid', role: 'group', 'aria-label': 'Picture' });
  const bgs = el('div', { class: 'pfp-bgs', role: 'group', 'aria-label': 'Background' });
  const mark = () => {
    for (const b of pics.children) b.classList.toggle('on', b.dataset.pic === pick.pic);
    for (const b of bgs.children) b.classList.toggle('on', Number(b.dataset.bg) === pick.bg);
    drawPrev();
  };
  for (const pic of ['pip', ...PIP_EMOJIS.map((e) => e.name)]) {
    pics.append(el('button', { class: 'pfp-opt', type: 'button', 'data-pic': pic, title: pic === 'pip' ? 'My Pip (with my color and hat)' : `:${pic}:`, onclick: () => { pick.pic = pic; mark(); } }, pfpCanvas(`${pic}.${pick.bg}`, u.look, 38)));
  }
  PFP_BGS.forEach((c, i) => bgs.append(el('button', { class: 'pfp-bg', type: 'button', 'data-bg': String(i), style: `background:${c}`, 'aria-label': 'Background ' + (i + 1), onclick: () => { pick.bg = i; mark(); } })));
  const name = el('input', { type: 'text', maxlength: String(DISPLAY.max), value: u.display || '', placeholder: u.name, 'aria-label': 'Display name' });
  const since = session.user && session.user.displayAt ? Date.now() - session.user.displayAt : Infinity;
  const hint = el('p', { class: 'small' }, `Everyone sees this instead of your username (your @${u.name} still shows under it). ${DISPLAY.min} to ${DISPLAY.max} letters, numbers and spaces. You can change it once a day${session.user && session.user.owner ? ' (not you, you\'re the owner)' : ''}. Leave it empty to use your username.`);
  mark();
  const body = el('div', { class: 'stack edit-profile' },
    el('div', { class: 'row' }, preview, el('div', { class: 'stack', style: 'flex:1' }, el('b', {}, 'Display name'), name)), hint,
    since < 24 * 3600e3 && !(session.user && session.user.owner) ? el('p', { class: 'small' }, '⏳ You changed your display name less than a day ago.') : null,
    el('b', {}, 'Profile picture'), pics, el('b', {}, 'Background'), bgs);
  const ok = await ask('Edit profile', '', [{ label: 'Save', value: true, cls: 'btn-sun' }], body);
  if (!ok) return;
  const newPfp = `${pick.pic}.${pick.bg}`, newName = name.value.trim();
  try {
    if (newPfp !== (u.pfp || 'pip.5')) { const r = await api.setPfp(newPfp); session.user.pfp = r.pfp; }
    if (newName !== (u.display || '')) {
      if (newName && newName.toLowerCase() !== u.name.toLowerCase() && !cleanDisplay(newName)) throw new Error(`Display names are ${DISPLAY.min} to ${DISPLAY.max} letters, numbers and spaces (and _ . - ' !).`);
      const r = await api.setDisplay(newName); session.user.display = r.display; session.user.displayAt = Date.now();
    }
    toast('Profile saved!'); renderMe();
  } catch (e) { toast(e.message); }
  showProfile(u.name);
}
addRoute(/^#\/u\/([A-Za-z0-9_]{3,16})$/, (m) => showProfile(m[1]));
