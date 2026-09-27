// The rules page, and the little "by using Blockyard you agree" bar new visitors see first.
// Until they press "I agree", the page is visible but can't be used (except the rules page itself).
import { $, show, addRoute } from '../app.js';
import { store } from '../api.js';

const TOS_VERSION = 1;
const agreed = () => store.get('tos', 0) >= TOS_VERSION;
function gate() {
  const on = !agreed();
  $('#tos-gate').hidden = !on;
  const main = document.querySelector('main');
  main.inert = on && document.body.dataset.view !== 'rules';
  document.body.classList.toggle('tos-pending', on);
}
$('#tos-ok').addEventListener('click', () => { store.set('tos', TOS_VERSION); gate(); });
new MutationObserver(gate).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
gate();

addRoute(/^#\/rules$/, () => show('rules'));
