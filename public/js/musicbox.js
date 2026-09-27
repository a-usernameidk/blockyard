// The music box: a little square in every game (2D and 3D). Play your own songs (bought in Shop > Music)
// instead of the game's music, skip, pause, or shrink it down to a 🎵 button. It remembers your pick and if it's small.
import { MUSIC } from './cosmetics.js';
import { progress } from './progress.js';
import { store } from './api.js';
import { onMusic, nowPlaying, setSongPick, setSongPaused, isMuted } from './audio.js';

const mk = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids) if (c != null) e.append(c);
  return e;
};
const nameOf = (id) => (MUSIC.find((m) => m.id === id) || { name: id }).name;
// your songs: the free ones and the ones you bought ('none' = the game's own music)
const mySongs = () => MUSIC.filter((m) => m.id !== 'none' && progress.owns('music', m.id)).map((m) => m.id);

let box = null, off = null;
// Put the box in a game. parent = the game's stage element. Returns an unmount function.
export function mountMusicBox(parent) {
  unmountMusicBox();
  const np = nowPlaying();
  if (np.pick && !mySongs().includes(np.pick)) setSongPick(null); // you sold it, or another account
  const title = mk('span', { class: 'mbox-name' });
  const sub = mk('span', { class: 'mbox-sub small' });
  const btn = (label, aria, fn) => mk('button', { class: 'mbox-btn', type: 'button', 'aria-label': aria, title: aria, onclick: (e) => { e.stopPropagation(); fn(); e.currentTarget.blur(); } }, label);
  const list = () => [null, ...mySongs()]; // null = game music
  const skip = (d) => { const l = list(), i = l.indexOf(nowPlaying().pick); setSongPick(l[(i + d + l.length) % l.length]); };
  const playBtn = btn('⏸', 'Pause', () => setSongPaused(!nowPlaying().paused));
  const pickSel = mk('select', { class: 'mbox-pick', 'aria-label': 'Pick a song' });
  pickSel.addEventListener('change', () => { setSongPick(pickSel.value || null); pickSel.blur(); });
  pickSel.addEventListener('keydown', (e) => e.stopPropagation());
  const small = () => store.get('mboxSmall', innerWidth < 720); // phones start with it small
  const el = mk('div', { class: 'mbox' + (small() ? ' small' : ''), role: 'group', 'aria-label': 'Music' });
  const open = mk('button', { class: 'mbox-open', type: 'button', 'aria-label': 'Open the music box', title: 'Music', onclick: (e) => { e.stopPropagation(); store.set('mboxSmall', false); el.classList.remove('small'); e.currentTarget.blur(); } }, '🎵');
  const full = mk('div', { class: 'mbox-full' },
    mk('div', { class: 'mbox-top' }, mk('span', { class: 'mbox-note', 'aria-hidden': 'true' }, '🎵'), mk('span', { class: 'mbox-text' }, title, sub),
      btn('▾', 'Make it small', () => { store.set('mboxSmall', true); el.classList.add('small'); })),
    mk('div', { class: 'mbox-row' }, btn('⏮', 'Last song', () => skip(-1)), playBtn, btn('⏭', 'Next song', () => skip(1)), pickSel));
  el.append(open, full);
  // taps and clicks on the box don't jump or move the camera
  for (const t of ['pointerdown', 'mousedown', 'touchstart', 'click', 'contextmenu']) el.addEventListener(t, (e) => e.stopPropagation());
  const draw = (np) => {
    const cur = np.pick || np.gameSong;
    title.textContent = np.off ? 'Music is off' : cur ? nameOf(cur) : 'No music here';
    sub.textContent = np.off ? (isMuted() ? 'Sound is muted' : 'Turn music on in Settings') : np.pick ? 'Your song' : 'Game music';
    playBtn.textContent = np.paused ? '▶' : '⏸';
    playBtn.setAttribute('aria-label', np.paused ? 'Play' : 'Pause'); playBtn.title = np.paused ? 'Play' : 'Pause';
    el.classList.toggle('paused', np.paused || np.off);
    const want = [['', 'Game music'], ...mySongs().map((id) => [id, nameOf(id)])];
    if (pickSel.options.length !== want.length) pickSel.replaceChildren(...want.map(([v, n]) => mk('option', { value: v }, n)));
    pickSel.value = np.pick || '';
    open.textContent = np.paused || np.off ? '🔇' : '🎵';
  };
  off = onMusic(draw);
  draw(nowPlaying());
  parent.append(el);
  box = el;
  return unmountMusicBox;
}
export function unmountMusicBox() { if (off) off(); off = null; if (box) box.remove(); box = null; }
