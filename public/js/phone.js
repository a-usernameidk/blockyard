// Phones: the tab bar along the bottom and the "More" sheet.
// Nothing here is new behaviour: the sheet's buttons press the same header buttons a computer shows,
// and the little red counts are copied from the header's so they always agree.
import { $, $$, openModal, closeModal } from './app.js';
import { sfx } from './audio.js';

const sheet = $('#more-modal');
$('#tab-more').addEventListener('click', () => { sfx('open'); labels(); openModal('#more-modal'); });
// a sheet button with data-sheet presses that header button (Messages, Mailbox, Account, Sound, Music)
for (const b of $$('[data-sheet]')) {
  b.addEventListener('click', () => {
    if (!b.hasAttribute('data-stay')) closeModal(sheet);
    const t = $(b.dataset.sheet);
    if (t) t.click();
    labels();
  });
}
function labels() {
  const on = (id) => $(id).getAttribute('aria-pressed') === 'true';
  $('#sheet-mute').firstChild.textContent = on('#mute') ? '🔊' : '🔇';
  $('#sheet-mute').querySelector('span').textContent = on('#mute') ? 'Sound: on' : 'Sound: off';
  $('#sheet-music').firstChild.textContent = on('#music') ? '🎵' : '🔕';
  $('#sheet-music').querySelector('span').textContent = on('#music') ? 'Music: on' : 'Music: off';
  // Messages and Mailbox only exist once you're logged in
  $('#sheet-dm').hidden = $('#dm-btn').hidden;
  $('#sheet-mail').hidden = $('#mail-btn').hidden;
}

// copy a count (or the green "people are online" dot) from the header to its twin down here
function mirror(from, to) {
  const a = $(from), b = $(to);
  if (!a || !b) return;
  const sync = () => { b.hidden = a.hidden; b.textContent = a.textContent; total(); };
  new MutationObserver(sync).observe(a, { attributes: true, childList: true, characterData: true, subtree: true });
  sync();
}
// the More tab shows how many things are waiting inside it
function total() {
  const n = ['#dm-count', '#mail-count'].reduce((s, id) => s + ($(id).hidden ? 0 : Number($(id).textContent) || 0), 0);
  const c = $('#tab-more-count');
  c.hidden = !n; c.textContent = n > 99 ? '99+' : String(n);
}
mirror('#dm-count', '#sheet-dm-count');
mirror('#mail-count', '#sheet-mail-count');
mirror('#groups-count', '#tab-groups-count');
mirror('#nav-online', '#tab-online');
