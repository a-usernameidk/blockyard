// A player's page: their look, stars, badges, closet, games, and where they're playing right now.
import { $, el, session, show, go, addRoute, pipCanvas, plural, needLogin } from '../app.js';
import { api } from '../api.js';
import { findItem, valueOf } from '../cosmetics.js';
import { ACHIEVEMENTS } from '../progress.js';
import { itemPreview } from './closet.js';
import { publishedCard } from './play.js';
import { playerWorldCard } from './worlds.js';
import { manageUser } from './admin.js';
import { friendsNow, checkFriends, openFriends } from './account.js';
import { toast } from '../app.js';

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

async function showProfile(name) {
  show('profile', '');
  const page = $('#profile-page');
  page.replaceChildren(el('p', { class: 'msg' }, 'Loading…'));
  let u;
  try { u = await api.user(name); } catch (e) { page.replaceChildren(el('div', { class: 'panel-note' }, el('h3', {}, "Couldn't find that player"), el('p', {}, e.message))); return; }
  const me = session.user && session.user.name.toLowerCase() === u.name.toLowerCase();
  const badges = Object.keys(u.badges || {}).map((b) => ACHIEVEMENTS.find((a) => a.id === b)).filter(Boolean);
  const items = u.items.map((i) => ({ ...i, f: findItem(i.key) })).filter((i) => i.f);
  const games2d = u.games.filter((g) => g.kind !== '3d'), games3d = u.games.filter((g) => g.kind === '3d');
  page.replaceChildren(
    el('div', { class: 'profile-head' }, pipCanvas(120, u.look),
      el('div', {},
        el('h1', {}, u.name),
        el('p', { class: 'lede' }, `Playing since ${new Date(u.since).toLocaleDateString()}.`),
        el('div', { class: 'card-meta' }, el('span', { class: 'tag' }, plural(u.stars, 'star')), el('span', { class: 'tag' }, `Closet worth ${u.value} coins`), el('span', { class: 'tag' }, plural(u.games.length, 'published game'))),
        u.playing ? el('p', { class: 'playing' }, el('span', { class: 'live-dot' }), `Playing ${u.playing.name || 'a player world'} right now`) : null,
        el('div', { class: 'row' },
          !me ? el('button', { class: 'btn btn-sun', type: 'button', onclick: () => (session.user ? go('#/closet/trade/' + u.name) : needLogin('Trading needs an account.')) }, 'Trade with them') : el('button', { class: 'btn', type: 'button', 'data-go': '#/closet' }, 'Change my look'),
          !me ? friendButton(u.name) : el('button', { class: 'btn', type: 'button', onclick: openFriends }, 'My friends'),
          u.playing && u.playing.code && !me ? el('button', { class: 'btn btn-grass', type: 'button', onclick: () => go('#/join/' + u.playing.code) }, 'Join them') : null),
        session.user && session.user.admin ? el('div', { class: 'admin-strip row' }, el('b', {}, 'Admin'),
          el('button', { class: 'btn btn-sun', type: 'button', onclick: () => manageUser(u.name) }, me ? 'Give myself coins or items' : 'Coins, items, kick, ban…')) : null)),
    badges.length ? el('h2', {}, 'Badges') : null,
    badges.length ? el('div', { class: 'chips' }, ...badges.map((b) => el('span', { class: 'chip', title: b.text }, b.name))) : null,
    el('h2', {}, 'Closet'),
    items.length ? el('div', { class: 'items' }, ...items.map((i) => el('div', { class: 'item' }, itemPreview(i.f.kind, i.f.item), el('span', { class: 'item-name' }, i.f.item.name), el('span', { class: 'item-price' }, `Worth ${valueOf(i.f.item)}${i.qty > 1 ? ` (x${i.qty})` : ''}`)))) : el('p', { class: 'small' }, 'Nothing to trade yet.'),
    games3d.length ? el('h2', {}, 'Worlds') : null,
    games3d.length ? el('div', { class: 'grid' }, ...games3d.map(playerWorldCard)) : null,
    games2d.length ? el('h2', {}, 'Levels') : null,
    games2d.length ? el('div', { class: 'grid' }, ...games2d.map(publishedCard).filter(Boolean)) : null);
}
addRoute(/^#\/u\/([A-Za-z0-9_]{3,16})$/, (m) => showProfile(m[1]));
