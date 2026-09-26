// The Settings page (theme, 3D graphics, sound, pop-ups, and the admin's mail) and the Builder page
// (Builders set what their levels pay; Builder Pros can set anyone's).
import { $, el, session, show, addRoute, toast, plural, needLogin } from '../app.js';
import { api, store } from '../api.js';
import { THEMES, themeMode, setTheme, GFX, GFX_ORDER, gfxMode, setGfx } from '../settings.js';
import { isMuted, setMuted, isMusicOn, setMusicOn, unlockAudio } from '../audio.js';
import { NOTIFY, notifyOn } from './social.js';
import { renderMute } from './account.js';

const section = (title, ...kids) => el('section', { class: 'panel settings-box' }, el('h2', {}, title), ...kids);
const check = (label, on, change) => {
  const box = el('input', { type: 'checkbox' });
  box.checked = on;
  box.addEventListener('change', () => change(box.checked));
  return el('label', { class: 'check' }, box, ' ', label);
};
const choice = (name, options, current, change) => el('div', { class: 'choices', role: 'radiogroup' }, ...options.map(([v, label, info]) => {
  const r = el('input', { type: 'radio', name, value: v });
  r.checked = v === current;
  r.addEventListener('change', () => change(v));
  return el('label', { class: 'choice' }, r, el('span', {}, el('b', {}, label), info ? el('span', { class: 'small' }, info) : null));
}));

async function showSettings() {
  show('settings', '');
  const body = $('#settings-body');
  const notes = NOTIFY.map(([k, label]) => check(label, notifyOn(k), (on) => { const s = store.get('notify', {}); s[k] = on; store.set('notify', s); }));
  body.replaceChildren(
    section('Look', el('p', { class: 'small' }, 'Light or dark colors for the whole site.'),
      choice('theme', Object.entries(THEMES).map(([k, v]) => [k, v]), themeMode(), (v) => { setTheme(v); toast(`Theme: ${THEMES[v]}`); })),
    section('3D graphics', el('p', { class: 'small' }, 'How worlds are drawn. If 3D feels slow or choppy, pick a faster one. You can also switch with the Graphics button inside a world.'),
      choice('gfx', GFX_ORDER.map((k) => [k, GFX[k].name, GFX[k].info]), gfxMode(), (v) => { setGfx(v); toast(`Graphics: ${GFX[v].name}`); })),
    section('Sound',
      check('Sound effects', !isMuted(), (on) => { setMuted(!on); renderMute(); unlockAudio(); }),
      check('Music', isMusicOn(), (on) => { setMusicOn(on); renderMute(); unlockAudio(); })),
    section('Pop-up notifications', el('p', { class: 'small' }, 'Pick which little pop-ups you get. Your mailbox and messages still keep everything.'), ...notes),
  );
  if (session.user) {
    const wn = session.user.warnings || 0;
    body.append(section('My account',
      el('p', {}, wn ? `⚠️ You have ${wn} of 3 warnings. 3 is a ban.` : 'No warnings. Nice!'),
      el('p', { class: 'small' }, 'Warnings come from breaking the rules (like mean chat, bad levels, or farming coins with extra accounts). You can earn them back: every 3 reports you send that the admin agrees with takes one away, and so does a level of yours reaching 20 likes and 100 plays.'),
      el('div', { class: 'row' }, el('button', { class: 'btn', type: 'button', onclick: () => $('#acct-pw-change').click() }, 'Change my password'))));
  }
  if (session.user && session.user.admin) {
    const box = el('div', {}, el('p', { class: 'small' }, 'Loading…'));
    body.append(section('Admin mail', el('p', { class: 'small' }, 'Which things send you a mail. They always go in the Admin log too.'), box));
    try {
      const n = await api.admin('GET', '/notify');
      const set = async (k, on) => { try { await api.admin('POST', '/notify', { [k]: on }); toast('Saved.'); } catch (e) { toast(e.message); } };
      box.replaceChildren(
        check('A Builder Pro changes what someone else\'s level pays', n.bpPay, (on) => set('bpPay', on)),
        check('Someone gets caught farming coins with extra accounts', n.farm, (on) => set('farm', on)),
        check('A level gets hidden by 10 reports and needs a review', n.review, (on) => set('review', on)));
    } catch (e) { box.replaceChildren(el('p', { class: 'small' }, e.message)); }
  }
}

/* ---------------- Builder page ---------------- */
const PAY = { builder: [0, 10, 25], builderpro: [0, 10, 25, 50, 100] };
const roleOf = () => (!session.user ? '' : session.user.admin ? 'builderpro' : session.user.role);
function payRow(g, mine) {
  const opts = PAY[roleOf()] || [0];
  const sel = el('select', { 'aria-label': `What ${g.name} pays` }, ...[...new Set([...opts, g.reward || 0])].sort((a, b) => a - b).map((n) => el('option', { value: String(n), disabled: !opts.includes(n) }, n ? `Pays ${n} coins` : 'Pays nothing')));
  sel.value = String(g.reward || 0);
  sel.addEventListener('change', async () => {
    try { await api.gameReward(g.id, Number(sel.value)); g.reward = Number(sel.value); toast(Number(sel.value) ? `"${g.name}" pays ${sel.value} coins now (once per player).` : `"${g.name}" doesn't pay coins anymore.`); }
    catch (e) { toast(e.message); sel.value = String(g.reward || 0); }
  });
  return el('div', { class: 'admin-row small-row' },
    el('span', {}, el('a', { class: 'linkish', href: g.kind === '3d' ? '#/w/' + g.id : '#/p/' + g.id }, el('b', {}, g.name)), mine ? '' : ` by ${g.creator}`),
    el('span', { class: 'small' }, `${g.kind === '3d' ? '3D world' : '2D level'}, ${plural(g.plays || 0, 'play')}, ${plural(g.likes || 0, 'like')}`), sel);
}
async function showBuilder() {
  show('builder', '');
  const body = $('#builder-body'), role = roleOf();
  if (!session.user) { $('#builder-lede').textContent = ''; body.replaceChildren(el('p', {}, 'Log in first.')); needLogin('The Builder page needs an account.'); return; }
  if (!PAY[role]) { $('#builder-lede').textContent = 'Builders are players the admin picks to make their levels pay coins. Keep making great levels!'; body.replaceChildren(); return; }
  $('#builder-lede').textContent = role === 'builderpro'
    ? 'You\'re a Builder Pro: set what your own levels pay, and other players\' levels too (up to 100 coins). The admin sees every change you make to someone else\'s level.'
    : 'You\'re a Builder: set what your own published levels and worlds pay (10 or 25 coins, once per player).';
  const mineBox = el('div', {}, el('p', { class: 'small' }, 'Loading…'));
  body.replaceChildren(el('h2', {}, 'My levels and worlds'), mineBox);
  try {
    const { games } = await api.myGames();
    const pub = games.filter((g) => !g.hidden);
    mineBox.replaceChildren(...(pub.length ? pub.map((g) => payRow(g, true)) : [el('p', { class: 'small' }, 'You have not published anything yet. Publish from the Create page.')]));
  } catch (e) { mineBox.replaceChildren(el('p', { class: 'small' }, e.message)); }
  if (role !== 'builderpro') return;
  const q = el('input', { placeholder: 'Level or world name, or a player', maxlength: '40', 'aria-label': 'Search levels' });
  const results = el('div', {});
  const search = async () => {
    results.replaceChildren(el('p', { class: 'small' }, 'Searching…'));
    try {
      const [a, b] = await Promise.all([api.list({ q: q.value.trim(), kind: '2d', sort: 'top' }), api.list({ q: q.value.trim(), kind: '3d', sort: 'top' })]);
      const all = [...a.games, ...b.games].filter((g) => !session.user || g.creator.toLowerCase() !== session.user.name.toLowerCase());
      results.replaceChildren(...(all.length ? all.map((g) => payRow(g, false)) : [el('p', { class: 'small' }, 'Nothing found.')]));
    } catch (e) { results.replaceChildren(el('p', { class: 'small' }, e.message)); }
  };
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  body.append(el('h2', {}, 'Other players\' levels'), el('div', { class: 'row' }, q, el('button', { class: 'btn btn-sun', type: 'button', onclick: search }, 'Search')), results);
  search();
}

addRoute(/^#\/settings$/, () => showSettings());
addRoute(/^#\/builder$/, () => showBuilder());
