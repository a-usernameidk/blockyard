// Admin page: see reports, hide, show or delete published levels.
import { api } from './api.js';
import { normalizeLevel } from './format.js';
import { drawThumb, thumbWindow } from './render2d.js';

const $ = (s) => document.querySelector(s);
let key = '';
try { key = sessionStorage.getItem('by-admin') || ''; } catch (e) { /* ok */ }

const REASONS = { rude: 'rude', personal: 'personal info', broken: 'broken', copied: 'copied', other: 'other' };

async function load() {
  const msg = $('#msg');
  msg.textContent = 'Loading…';
  try {
    const { games } = await api.admin(key, 'GET', '/games');
    msg.textContent = games.length ? '' : 'No published levels yet.';
    try { sessionStorage.setItem('by-admin', key); } catch (e) { /* ok */ }
    const list = $('#list'); list.innerHTML = '';
    for (const g of games) list.append(rowFor(g));
  } catch (e) { msg.textContent = e.message; }
}

function rowFor(g) {
  const row = document.createElement('div');
  row.className = 'adm-row' + (g.hidden ? ' hidden-game' : '');
  const cv = document.createElement('canvas');
  try { drawThumb(cv, thumbWindow(normalizeLevel(g.level), 40), 4); } catch (e) { /* bad data */ }
  const info = document.createElement('div');
  const reasons = Object.entries(g.reasons).map(([r, n]) => `${n} ${REASONS[r] || r}`).join(', ');
  info.innerHTML = '<h3></h3><p class="small"></p><p class="small"></p>';
  info.querySelector('h3').textContent = g.name;
  info.querySelectorAll('p')[0].textContent = `by ${g.creator}. ${g.plays} plays, ${g.likes} likes. ${g.hidden ? 'Hidden.' : 'Visible.'}`;
  info.querySelectorAll('p')[1].textContent = g.reports ? `Reports: ${reasons}` : 'No reports.';
  const actions = document.createElement('div');
  actions.className = 'row';
  const btn = (label, cls, action) => {
    const b = document.createElement('button');
    b.className = 'btn ' + cls; b.textContent = label;
    b.addEventListener('click', async () => {
      if (action === 'delete' && b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Click again to delete'; return; }
      b.disabled = true;
      try { await api.admin(key, 'POST', '/games/' + g.id, { action }); load(); } catch (e) { $('#msg').textContent = e.message; b.disabled = false; }
    });
    return b;
  };
  const view = document.createElement('a');
  view.className = 'btn'; view.href = './#/p/' + g.id; view.textContent = 'Play'; view.target = '_blank';
  actions.append(view, g.hidden ? btn('Show', 'btn-grass', 'show') : btn('Hide', '', 'hide'));
  if (g.reports) actions.append(btn('Clear reports', '', 'clear'));
  actions.append(btn('Delete', 'btn-danger', 'delete'));
  row.append(cv, info, actions);
  return row;
}

$('#login').addEventListener('submit', (e) => { e.preventDefault(); key = $('#key').value; load(); });
if (key) { $('#key').value = key; load(); }
