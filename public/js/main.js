// Blockyard starts here. Each page lives in js/pages/, shared bits are in js/app.js.
import { $, route, currentView } from './app.js';
import './settings.js';
import './pages/home.js';
import './pages/play.js';
import './pages/worlds.js';
import './pages/create.js';
import './pages/closet.js';
import './pages/profile.js';
import './pages/admin.js';
import './pages/social.js';
import './pages/settings.js';
import './pages/top.js';
import './pages/rules.js';
import { renderMe, startSession, onSession, checkFriends, checkMail } from './pages/account.js';
import { checkTrades } from './pages/closet.js';
import { loadOnline } from './pages/worlds.js';
import { drawPip } from './art.js';
import { stopMusic } from './audio.js';

/* ---------------- crashes ---------------- */
function showCrash(err) {
  stopMusic();
  $('#crash-detail').textContent = err && err.message ? 'Error: ' + err.message : '';
  $('#crash-modal').hidden = false;
}
addEventListener('blockyard-crash', (e) => showCrash(e.detail));
addEventListener('error', (e) => { if (e.filename && e.filename.includes('/js/')) showCrash(e.error || e); });
addEventListener('unhandledrejection', (e) => { if (e.reason instanceof Error && !e.reason.status && !/fetch|server|network|login|WebSocket/i.test(e.reason.message)) showCrash(e.reason); });
$('#crash-reload').addEventListener('click', () => location.reload());

/* ---------------- start ---------------- */
(function drawLogo() {
  const cv = $('#logo-pip'), c = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = 44 * dpr; cv.height = 44 * dpr; c.scale(dpr, dpr);
  c.translate(22, 24);
  drawPip(c, 24, '#ff6b35', { t: 1, look: 1 });
})();
renderMe();
onSession(() => { checkTrades(); });
// Wait a moment for the account to load so pages don't flash the guest version first.
let routed = false;
const first = () => { if (!routed) { routed = true; route(); } };
setTimeout(first, 2500);
startSession().then(() => {
  if (!routed) first();
  else if (!['w3', 'build', 'edit', 'play'].includes(currentView())) route();
  loadOnline(true);
});
setInterval(() => { if (!document.hidden) { loadOnline(); checkTrades(); checkFriends(); checkMail(); } }, 60000);
