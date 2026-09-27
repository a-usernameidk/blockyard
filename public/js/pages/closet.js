// The Shop (it used to be called Pip's Closet): buying (with daily deals and limited items), your stuff (wear it or sell it), trades and badges.
import { $, $$, el, session, show, go, addRoute, ask, toast, needLogin, pipCanvas, plural, timeAgo, onLeave, currentView } from '../app.js';
import { api, isOnline } from '../api.js';
import { progress, ACHIEVEMENTS } from '../progress.js';
import { SHOP, KINDS, FREE, itemKey, findItem, canTrade, valueOf, sellPrice, rarityOf as baseRarity, RARITY, MAX_BUY, GEAR_CATS, GEAR_TIER, TIER_NAME, gearCat, variantGroups, groupOf, xpFor } from '../cosmetics.js';
import { drawPip, drawPet, drawGear } from '../art.js';
import { setWallet, openAccount } from './account.js';
import { SPECIAL_TITLES } from '../names.js';

let tab = 'shop', kind = 'hat', pick = null, raf = 0, shopInfo = null, jumpTo = null;
const KIND_LABEL = { hat: 'Hats', color: 'Colors', trail: 'Trails', pet: 'Pets', gear: 'Gear', music: 'Music' };
onLeave('closet', () => cancelAnimationFrame(raf));

/* ---------------- drawing items ---------------- */
const TRAIL_SAMPLE = { confetti: '#ff5d8f', snow: '#8fd3ff', galaxy: '#b06cff', sparkle: '#ffd23f', bubbles: '#7cc8ff', hearts: '#ff5d8f', notes: '#1d2340', fire: '#ff5a1f', rainbow: null, stars: '#ffd23f', lightning: '#7cc8ff',
  leaves: '#44c06a', mint: '#2ec4b6', lava: '#ff5a1f', ice: '#7cc8ff', candy: '#ff5d8f', ocean: '#0077b6', toxic: '#39ff14', sakura: '#ffb7c5', shadow: '#3d405b', sunset: '#ff9f1c', goldtrail: '#e0b12a', void: '#5a3fd6', paintsplat: '#ff5d8f', frost: '#7cc8ff', nebula: '#5a3fd6', chosen: '#ffd23f' };
function drawTrailSample(c, k, x, y, t) {
  if (k === 'rainbow') {
    ['#ff5d8f', '#ff9f1c', '#ffd23f', '#44c06a', '#3a86ff', '#b06cff'].forEach((col, i) => {
      c.strokeStyle = col; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath();
      for (let n = 0; n < 20; n++) { const px = x - n * 6, py = y + (i - 2.5) * 4 + Math.sin(t * 4 - n * 0.4) * 6; if (n) c.lineTo(px, py); else c.moveTo(px, py); }
      c.stroke();
    });
    return;
  }
  for (let n = 0; n < 6; n++) {
    const px = x - n * 18, py = y + Math.sin(t * 3 + n) * 10 - (k === 'fire' || k === 'bubbles' ? n * 3 : 0), s = 6 - n * 0.6;
    c.globalAlpha = 1 - n / 7; c.fillStyle = TRAIL_SAMPLE[k]; c.strokeStyle = TRAIL_SAMPLE[k];
    c.beginPath();
    if (k === 'bubbles') { c.lineWidth = 2; c.arc(px, py, s, 0, Math.PI * 2); c.stroke(); }
    else if (k === 'hearts') { c.moveTo(px, py + s); c.bezierCurveTo(px - s * 1.6, py - s * 0.4, px - s * 0.5, py - s * 1.5, px, py - s * 0.4); c.bezierCurveTo(px + s * 0.5, py - s * 1.5, px + s * 1.6, py - s * 0.4, px, py + s); c.fill(); }
    else if (k === 'notes') { c.ellipse(px, py + s, s * 0.7, s * 0.5, -0.4, 0, Math.PI * 2); c.fill(); c.fillRect(px + s * 0.4, py - s * 1.2, 2, s * 2.2); }
    else if (k === 'confetti' || k === 'galaxy') { c.fillStyle = (k === 'confetti' ? ['#ff5d8f', '#ffd23f', '#44c06a', '#3a86ff', '#b06cff'] : ['#5a3fd6', '#b06cff', '#7cc8ff'])[n % (k === 'confetti' ? 5 : 3)]; c.fillRect(px - s / 2, py - s / 2, s, s * 0.7); }
    else if (k === 'fire') { c.fillStyle = ['#ff5a1f', '#ffb02e', '#ffd23f'][n % 3]; c.fillRect(px - s / 2, py - s / 2, s, s); }
    else if (k === 'lightning') { c.fillStyle = n % 2 ? '#ffe66d' : '#7cc8ff'; c.moveTo(px - s * 0.3, py - s * 1.4); c.lineTo(px + s * 0.5, py - s * 0.2); c.lineTo(px, py - s * 0.1); c.lineTo(px + s * 0.3, py + s * 1.4); c.lineTo(px - s * 0.5, py + s * 0.1); c.lineTo(px, py); c.closePath(); c.fill(); }
    else { const m = k === 'stars' ? 5 : 4; for (let i = 0; i < m * 2; i++) { const r = i % 2 ? s * 0.4 : s * 1.2, a = i * Math.PI / m + t; c.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r); } c.closePath(); c.fill(); }
    c.globalAlpha = 1;
  }
}
export function itemPreview(k, item, size = 64) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size * dpr; cv.style.width = cv.style.height = size + 'px';
  const c = cv.getContext('2d'); c.scale(dpr, dpr); c.scale(size / 64, size / 64);
  const eq = progress.data.equip;
  if (k === 'music') {
    // a music note on a colored record, colored by the song
    let hsh = 0; for (const ch of item.id) hsh = (hsh * 31 + ch.charCodeAt(0)) % 360;
    c.fillStyle = item.id === 'none' ? '#c8d0e0' : `hsl(${hsh}, 75%, 62%)`; c.strokeStyle = '#1d2340'; c.lineWidth = 3;
    c.beginPath(); c.arc(32, 32, 25, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#1d2340'; c.beginPath(); c.ellipse(26, 42, 7, 5.5, -0.4, 0, Math.PI * 2); c.fill();
    c.fillRect(31, 17, 3.5, 26); c.beginPath(); c.moveTo(34, 17); c.quadraticCurveTo(44, 21, 42, 31); c.quadraticCurveTo(40, 24, 34, 24); c.fill();
  } else if (k === 'gear') {
    c.save(); c.translate(32, 36); drawGear(c, item.id, 40); c.restore();
  } else if (k === 'pet') {
    c.save(); c.translate(22, 42); drawPip(c, 22, eq.color, { t: 1, hat: 'none' }); c.restore();
    if (item.id !== 'none') { c.save(); c.translate(44, 44); drawPet(c, item.id, 26, 1); c.restore(); }
  } else if (k === 'trail') {
    if (item.id !== 'none') drawTrailSample(c, item.id, 44, 36, 1);
    c.save(); c.translate(46, 40); drawPip(c, 22, eq.color, { t: 1, hat: 'none' }); c.restore();
  } else {
    c.save(); c.translate(32, 38);
    drawPip(c, 32, k === 'color' ? item.id : eq.color, { t: 1, look: 1, hat: k === 'hat' ? item.id : 'none' });
    c.restore();
  }
  cv.setAttribute('aria-hidden', 'true');
  return cv;
}
function outfit() { const eq = { ...progress.data.equip }; if (pick) eq[pick.kind] = pick.id; return eq; }
function closetLoop() {
  cancelAnimationFrame(raf);
  const cv = $('#closet-canvas'), c = cv.getContext('2d');
  const t0 = performance.now();
  const tick = (now) => {
    if (currentView() !== 'closet') return;
    const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (!W) { raf = requestAnimationFrame(tick); return; }
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = (now - t0) / 1000, eq = outfit();
    c.fillStyle = '#ffe3ef'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#ffd0e2'; for (let x = -H; x < W; x += 36) { c.beginPath(); c.moveTo(x, H); c.lineTo(x + H, 0); c.lineTo(x + H + 18, 0); c.lineTo(x + 18, H); c.fill(); }
    c.fillStyle = 'rgba(29,35,64,.15)'; c.beginPath(); c.ellipse(W / 2, H * 0.8, W * 0.22, 12, 0, 0, Math.PI * 2); c.fill();
    if (eq.trail && eq.trail !== 'none') drawTrailSample(c, eq.trail, W / 2 - 40, H * 0.62, t);
    const hop = Math.abs(Math.sin(t * 2.2)) * 18;
    c.save(); c.translate(W / 2, H * 0.8 - hop - 58);
    drawPip(c, 90, eq.color, { t, look: Math.sin(t * 0.7), air: hop > 3, mouth: hop > 3 ? 'open' : 'smile', hat: eq.hat, sy: hop > 3 ? 1.05 : 1 });
    c.restore();
    if (eq.pet && eq.pet !== 'none') { const ph = Math.abs(Math.sin(t * 3.1 + 1)) * 10; c.save(); c.translate(W / 2 + 90, H * 0.8 - 22 - ph); drawPet(c, eq.pet, 46, t); c.restore(); }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

/* ---------------- page ---------------- */
async function showCloset(t = 'shop', tradeWith) {
  show('closet');
  tab = t;
  $$('[data-ctab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ctab === tab)));
  $('#closet-main').hidden = !['shop', 'mine'].includes(tab);
  $('#closet-trades').hidden = tab !== 'trades';
  $('#closet-market').hidden = tab !== 'market';
  $('#closet-chests').hidden = tab !== 'chests';
  $('#closet-badges').hidden = tab !== 'badges';
  $('#closet-road').hidden = tab !== 'road';
  renderWallet();
  loadStats();
  if (tab === 'shop' || tab === 'mine') {
    pick = tab === 'shop' ? jumpTo : null; jumpTo = null;
    closetLoop();
    if (!shopInfo && (await isOnline())) { try { shopInfo = await api.shop(); } catch (e) { /* no deals then */ } }
    render();
  } else if (tab === 'trades') renderTrades(tradeWith);
  else if (tab === 'market') renderMarket();
  else if (tab === 'chests') renderChests();
  else if (tab === 'road') renderRoad();
  else renderBadges();
}
$$('[data-ctab]').forEach((b) => b.addEventListener('click', () => go(b.dataset.ctab === 'shop' ? '#/closet' : '#/closet/' + b.dataset.ctab)));
function renderWallet() {
  const w = progress.wallet;
  $('#shop-wallet').textContent = w ? `${w.coins} coins` : 'Guest';
  $('#closet-lede').textContent = w ? 'The shop changes every day: rarer things are in stock less often. Limited items run out and only come back if the admin restocks them. You can own more than one of anything.' : 'Log in to buy, sell and trade. Coins come from built-in levels, 3D obbies, Endless, the daily challenge and levels that pay coins.';
}
// same rule as the server: the bigger of today's deal and a shop-wide sale (limited items are never on sale)
// today's deals only have so many at the deal price (for everyone), then it's the normal price
const dealLeftOf = (key) => (shopInfo && shopInfo.dealLeft && key in shopInfo.dealLeft ? shopInfo.dealLeft[key] : null);
const onDeal = (key, item) => !!shopInfo && shopInfo.featured.items.includes(key) && !item.stock && dealLeftOf(key) !== 0;
const dealPrice = (key, item) => {
  if (!shopInfo) return item.price;
  const f = shopInfo.featured, sale = f.sale && f.sale.until > Date.now() && !item.stock ? f.sale.off : 0;
  return Math.floor(item.price * (100 - Math.max(onDeal(key, item) ? f.off : 0, sale)) / 100);
};
// normal items rotate in and out of the shop each day (rarer ones are in stock less often)
const outToday = (key) => !!(shopInfo && shopInfo.outToday && shopInfo.outToday.includes(key));
function priceTag(key, item) {
  if (item.need) return el('span', { class: 'item-price' }, item.hint);
  if (outToday(key)) return el('span', { class: 'item-price' }, `${item.price} coins`, el('span', { class: 'stock out' }, ' Not in stock today'));
  const p = dealPrice(key, item);
  const left = item.stock && shopInfo ? shopInfo.stock[key] : null;
  const dl = shopInfo && shopInfo.featured.items.includes(key) && !item.stock ? dealLeftOf(key) : null;
  return el('span', { class: 'item-price' }, p < item.price ? [el('s', {}, String(item.price)), ` ${p} coins`] : `${p} coins`, item.stock ? el('span', { class: 'stock' + (left === 0 ? ' out' : '') }, left === 0 ? ' Sold out' : left != null ? ` ${left} left` : ' Limited') : null,
    dl != null ? el('span', { class: 'stock' + (dl === 0 ? ' out' : '') }, dl === 0 ? ' Deal sold out' : ` ${dl} left at this price`) : null);
}
function itemButton(k, item, { status, onclick }) {
  const key = itemKey(k, item.id), on = progress.data.equip[k] === item.id;
  const owned = progress.owns(k, item.id);
  return el('button', { class: `item${on ? ' on' : ''}${pick && pick.key === key ? ' pick' : ''}${!owned && item.need && !progress.canUnlock(item) ? ' locked' : ''}${item.stock ? ' limited' : ''}`, type: 'button', onclick },
    itemPreview(k, item), el('span', { class: 'item-name' }, item.name), status || priceTag(key, item));
}
function render() {
  const body = $('#closet-body');
  const choose = (k, item) => () => { pick = { kind: k, id: item.id, key: itemKey(k, item.id), item }; render(); };
  const statusOf = (k, item) => {
    const on = progress.data.equip[k] === item.id;
    if (on) return el('span', { class: 'item-price' }, 'Wearing');
    if (progress.owns(k, item.id)) return el('span', { class: 'item-price' }, FREE.includes(item.id) ? 'Free' : 'Owned');
    return null;
  };
  if (tab === 'shop') {
    const chips = el('div', { class: 'chips' }, ...KINDS.map((k) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(k === kind), onclick: () => { kind = k; pick = null; render(); } }, KIND_LABEL[k])));
    const deals = shopInfo ? shopInfo.featured.items.map(findItem).filter(Boolean) : [];
    const gone = (k, i) => i.stock && shopInfo && shopInfo.stock[itemKey(k, i.id)] === 0 && !progress.owns(k, i.id);
    const limitedAll = KINDS.flatMap((k) => SHOP[k].filter((i) => i.stock).map((i) => ({ kind: k, item: i })));
    const limited = limitedAll.filter((f) => !gone(f.kind, f.item)), soldOut = limitedAll.length - limited.length;
    body.replaceChildren(
      shopInfo && shopInfo.featured.sale && shopInfo.featured.sale.until > Date.now() ? el('p', { class: 'sale-banner' }, `SALE! Everything is ${shopInfo.featured.sale.off}% off (except limited items) until ${new Date(shopInfo.featured.sale.until).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.`) : null,
      deals.length ? el('div', { class: 'shelf' }, el('h3', {}, `Today's deals: ${shopInfo.featured.off}% off`), el('div', { class: 'items' }, ...deals.map((f) => itemButton(f.kind, f.item, { status: statusOf(f.kind, f.item), onclick: choose(f.kind, f.item) })))) : null,
      el('div', { class: 'shelf' }, el('h3', {}, 'Limited'),
        soldOut ? el('p', { class: 'small' }, `${soldOut} limited ${soldOut === 1 ? 'item has' : 'items have'} sold out. Find them on the `, el('a', { href: '#/closet/market' }, 'Reseller shop'), ' or trade for them.') : null,
        el('div', { class: 'items' }, ...limited.map((f) => itemButton(f.kind, f.item, { status: statusOf(f.kind, f.item), onclick: choose(f.kind, f.item) })))),
      el('div', { class: 'shelf' }, el('div', { class: 'shelf-head' }, el('h3', {}, 'Everything'), chips),
        ...(kind === 'gear'
          ? [['none'], ...Object.values(GEAR_CATS).map((C) => C.items)].map((ids, i) => { const list = SHOP.gear.filter((g) => ids.includes(g.id) && !gone('gear', g)); return list.length ? el('div', {}, i ? el('h4', { class: 'gear-group' }, Object.values(GEAR_CATS)[i - 1].name) : null, el('div', { class: 'items' }, ...list.map((item) => itemButton('gear', item, { status: statusOf('gear', item), onclick: choose('gear', item) })))) : null; })
          : [el('div', { class: 'items' }, ...variantGroups(kind).filter((g) => !(kind === 'music' && g.base.id === 'none')).map((g) => {
            // one card per item: its variants (recolors) are picked in the caption
            const list = g.list.filter((item) => !gone(kind, item) || g.list.length > 1);
            if (!list.length) return null;
            const shown = pick && pick.kind === kind && list.some((x) => x.id === pick.id) ? pick.item : list[0];
            const b = itemButton(kind, shown, { status: statusOf(kind, shown), onclick: choose(kind, shown) });
            if (list.length > 1) { b.append(el('span', { class: 'variant-count' }, `${list.length} styles`)); if (list.some((x) => !x.need || progress.canUnlock(x) || progress.owns(kind, x.id))) b.classList.remove('locked'); }
            return b;
          }))])));
  } else {
    const groups = KINDS.map((k) => {
      const owned = SHOP[k].filter((i) => progress.owns(k, i.id));
      return el('div', { class: 'shelf' }, el('h3', {}, KIND_LABEL[k]), el('div', { class: 'items' }, ...owned.map((item) => {
        const qty = progress.wallet ? progress.wallet.items[itemKey(k, item.id)] || 0 : 0;
        return itemButton(k, item, { status: el('span', { class: 'item-price' }, progress.data.equip[k] === item.id ? 'Wearing' : canTrade(item) ? `Worth ${valueOf(item)}${qty > 1 ? ` (x${qty})` : ''}` : item.need ? 'Earned' : 'Free'), onclick: choose(k, item) });
      })));
    });
    const w = progress.wallet;
    const total = w ? Object.entries(w.items).reduce((n, [k, q]) => { const f = findItem(k); return n + (f && canTrade(f.item) ? valueOf(f.item) * q : 0); }, 0) : 0;
    body.replaceChildren(el('p', { class: 'lede' }, w ? `Your items are worth ${total} coins. Selling gives back half of what an item is worth.` : 'Guests can wear the free stuff and anything bought in this browser before.'), ...groups);
  }
  renderCaption();
}
function renderCaption() {
  const cap = $('#closet-caption'); cap.replaceChildren();
  if (!pick) { cap.textContent = tab === 'shop' ? 'Pick something to try it on.' : 'Pick something to wear it or sell it.'; return; }
  const { kind: k, id, key, item } = pick;
  const owned = progress.owns(k, id), wearing = progress.data.equip[k] === id;
  const w = progress.wallet;
  const buttons = [];
  if (k === 'music') { if (id !== 'none') buttons.push(listenBtn(id)); }
  else if (owned) buttons.push(el('button', { class: 'btn btn-grass', type: 'button', disabled: wearing, onclick: () => wear(k, id) }, wearing ? 'Wearing it' : 'Wear it'));
  if (owned && w && canTrade(item) && (w.items[key] || 0) > 0) {
    if (!item.stock) buttons.push(el('button', { class: 'btn btn-danger', type: 'button', onclick: () => sell(key, item) }, `Sell for ${sellPrice(item)}`));
    buttons.push(el('button', { class: 'btn', type: 'button', onclick: () => resell(key, item) }, 'Sell on Reseller shop'));
  }
  if (!owned || (w && canTrade(item))) {
    if (!w) buttons.push(el('button', { class: 'btn btn-sun', type: 'button', onclick: () => openAccount() }, 'Log in to buy'));
    else if (item.need) buttons.push(progress.canUnlock(item) ? el('button', { class: 'btn btn-sun', type: 'button', onclick: () => buy(key, item) }, 'Unlock it') : el('button', { class: 'btn', type: 'button', disabled: true }, 'Locked'));
    else {
      const price = dealPrice(key, item), left = item.stock && shopInfo ? shopInfo.stock[key] : null;
      const most = Math.max(1, Math.min(MAX_BUY, left == null ? MAX_BUY : left));
      const qty = el('input', { type: 'number', min: '1', max: String(most), value: '1', class: 'qty', 'aria-label': 'How many' });
      const dl = shopInfo && shopInfo.featured.items.includes(key) && !item.stock ? dealLeftOf(key) : null;
      const most2 = dl ? Math.min(most, dl) : most;
      const b = el('button', { class: 'btn btn-sun', type: 'button', onclick: () => buy(key, item, Math.max(1, Math.min(most2, Math.floor(+qty.value || 1))), price) });
      if (dl) qty.max = String(most2);
      const upd = () => {
        const n = Math.max(1, Math.min(most2, Math.floor(+qty.value || 1)));
        b.disabled = false;
        b.textContent = `${owned ? 'Buy more' : 'Buy'}${n > 1 ? ` ${n}` : ''} for ${price * n} coins`;
        if (left === 0) { b.disabled = true; b.textContent = 'Sold out. Try the Reseller shop'; }
        else if (outToday(key)) { b.disabled = true; b.textContent = 'Not in stock today. Check back tomorrow'; }
        else if (w.coins < price * n) { b.disabled = true; b.textContent = `Need ${price * n - w.coins} more coins`; }
      };
      qty.addEventListener('input', upd); upd();
      buttons.push(el('label', { class: 'qty-label' }, 'How many ', qty), b);
    }
  }
  // variants: all the styles of this item, each with its own price, stock and lock
  const grp = groupOf(k, id);
  const styles = grp && grp.list.length > 1 ? el('div', { class: 'variants', role: 'group', 'aria-label': 'Styles' }, ...grp.list.map((v) => {
    const vk = itemKey(k, v.id), left = v.stock && shopInfo ? shopInfo.stock[vk] : null;
    const note = progress.owns(k, v.id) ? 'Owned' : v.need ? (v.need.level ? `Level ${v.need.level}` : v.need.stars ? `${v.need.stars} stars` : 'Badge') : v.stock ? (left === 0 ? 'Sold out' : left != null ? `${left} left` : 'Limited') : `${dealPrice(vk, v)}`;
    return el('button', { class: 'variant' + (v.stock ? ' limited' : '') + (v.id === id ? ' on' : ''), type: 'button', 'aria-pressed': String(v.id === id), title: v.name, onclick: () => { pick = { kind: k, id: v.id, key: vk, item: v }; render(); } },
      itemPreview(k, v, 34), el('span', {}, v.name), el('span', { class: 'small' }, note));
  })) : null;
  cap.append(el('b', {}, item.name), item.need && !owned ? el('span', { class: 'small' }, ` ${item.hint}.`) : null, statsLine(key, item), styles, el('div', { class: 'row' }, ...buttons));
}
// songs: listen before you buy (plays until you press Stop or leave the Shop)
function listenBtn(id) {
  const on = () => audioMod && audioMod.previewing() === id;
  const b = el('button', { class: 'btn btn-grass', type: 'button', onclick: async () => {
    audioMod = audioMod || await import('../audio.js');
    audioMod.unlockAudio();
    audioMod.previewSong(on() ? null : id);
    b.textContent = on() ? '⏹ Stop' : '▶ Listen';
  } }, on() ? '⏹ Stop' : '▶ Listen');
  return b;
}
let audioMod = null;
onLeave('closet', () => { if (audioMod) audioMod.previewSong(null); });
async function wear(k, id) {
  if (progress.wallet) {
    try { const r = await api.look({ [k]: id }); setWallet(r.wallet); } catch (e) { toast(e.message); return; }
  } else progress.equipLocal(k, id);
  pick = null; render();
}
async function buy(key, item, qty = 1, expect) {
  if (!session.user) { needLogin('Buying needs an account, so your coins are safe on the server.'); return; }
  try {
    const r = await api.buy(key, qty, expect);
    setWallet(r.wallet);
    const f = findItem(key);
    if (f.kind !== 'music') await api.look({ [f.kind]: f.id }).then((x) => setWallet(x.wallet)).catch(() => {});
    progress.stat('bought'); progress.flush();
    import('../audio.js').then((a) => a.sfx('buy')).catch(() => {});
    toast(qty > 1 ? `You got ${qty} ${item.name}!` : `New ${f.kind === 'color' ? 'color' : f.kind}: ${item.name}!`);
    if (item.stock || (shopInfo && shopInfo.featured.items.includes(key))) try { shopInfo = await api.shop(); } catch (e) { /* ok */ }
    pick = null; render(); renderWallet();
  } catch (e) { toast(e.message); if (/deal|price/.test(e.message)) try { shopInfo = await api.shop(); render(); } catch (e2) { /* ok */ } }
}
async function sell(key, item) {
  const ok = await ask(`Sell ${item.name}?`, `You get ${sellPrice(item)} coins back. For more, try the Reseller shop, where players set the price.`, [{ label: `Sell for ${sellPrice(item)}`, value: true, cls: 'btn-danger' }]);
  if (!ok) return;
  try { const r = await api.sell(key); setWallet(r.wallet); toast(`Sold for ${r.got} coins.`); pick = null; render(); renderWallet(); }
  catch (e) { toast(e.message); }
}

/* ---------------- trades ---------------- */
function chipsOf(keys, coins) {
  const out = keys.map((k) => { const f = findItem(k); return f ? el('span', { class: 'trade-item' }, itemPreview(f.kind, f.item, 40), f.item.name) : null; });
  if (coins) out.push(el('span', { class: 'trade-item coins' }, `${coins} coins`));
  if (!out.length) out.push(el('span', { class: 'small' }, 'nothing'));
  return el('div', { class: 'trade-items' }, ...out);
}
const valueOfKeys = (keys, coins) => keys.reduce((n, k) => { const f = findItem(k); return n + (f ? worthOf(k, f.item) : 0); }, 0) + (coins || 0);
async function renderTrades(withName) {
  const box = $('#closet-trades');
  if (!session.user) { box.replaceChildren(el('div', { class: 'panel-note' }, el('h3', {}, 'Trading needs an account'), el('p', {}, 'Log in to swap items and coins with other players.'), el('button', { class: 'btn btn-sun', type: 'button', onclick: () => openAccount() }, 'Log in or sign up'))); return; }
  box.replaceChildren(el('p', { class: 'msg' }, 'Loading…'));
  if (withName) { composer(withName); return; }
  let t;
  try { t = await api.trades(); } catch (e) { box.replaceChildren(el('p', { class: 'msg' }, e.message)); return; }
  updateTradeCount(t.incoming.length);
  const row = (x, actions) => el('div', { class: 'trade' },
    el('div', { class: 'trade-head' }, el('b', {}, x.from === session.user.name ? `You → ${x.to}` : `${x.from} → you`), el('span', { class: 'small' }, timeAgo(x.at))),
    el('div', { class: 'trade-sides' },
      el('div', {}, el('p', { class: 'small' }, `${x.from} gives (worth ${valueOfKeys(x.give, x.giveCoins)})`), chipsOf(x.give, x.giveCoins)),
      el('div', {}, el('p', { class: 'small' }, `${x.to} gives (worth ${valueOfKeys(x.want, x.wantCoins)})`), chipsOf(x.want, x.wantCoins))),
    actions ? el('div', { class: 'row' }, ...actions) : el('p', { class: 'small trade-status' }, { done: 'Done', declined: 'Declined', cancelled: 'Cancelled', expired: 'Expired', failed: "Couldn't happen: someone didn't have the stuff anymore" }[x.status] || x.status));
  const act = (id, action, label, cls) => el('button', { class: 'btn ' + cls, type: 'button', onclick: async () => {
    try { const r = await api.tradeAction(id, action); if (r.wallet) setWallet(r.wallet); if (action === 'accept') { progress.stat('trades'); progress.flush(); toast('Trade done!'); } renderTrades(); }
    catch (e) { toast(e.message); renderTrades(); }
  } }, label);
  box.replaceChildren(
    el('div', { class: 'row trade-new' }, el('button', { class: 'btn btn-sun btn-big', type: 'button', onclick: () => composer('') }, 'New trade'), el('p', { class: 'small' }, 'Offer items and coins, ask for theirs. They have 3 days to answer. Nothing moves until they accept.')),
    el('h2', {}, 'Offers to you'), t.incoming.length ? el('div', { class: 'trades' }, ...t.incoming.map((x) => row(x, [act(x.id, 'accept', 'Accept', 'btn-grass'), act(x.id, 'decline', 'Decline', '')]))) : el('p', { class: 'small' }, 'No offers right now.'),
    el('h2', {}, 'Your offers'), t.outgoing.length ? el('div', { class: 'trades' }, ...t.outgoing.map((x) => row(x, [act(x.id, 'cancel', 'Cancel', 'btn-danger')]))) : el('p', { class: 'small' }, 'You have no offers waiting.'),
    t.history.length ? el('h2', {}, 'Past trades') : null, t.history.length ? el('div', { class: 'trades' }, ...t.history.map((x) => row(x))) : null);
}
function updateTradeCount(n) { const c = $('#trade-count'); c.hidden = !n; c.textContent = String(n); }
export async function checkTrades() { if (!session.user) { updateTradeCount(0); return; } try { const t = await api.trades(); updateTradeCount(t.incoming.length); } catch (e) { /* later */ } }

function composer(name) {
  const box = $('#closet-trades');
  const w = progress.wallet;
  const state = { to: name, theirs: [], give: new Set(), want: new Set(), giveCoins: 0, wantCoins: 0 };
  const who = el('input', { placeholder: 'Their username', maxlength: '16', value: name || '', autocomplete: 'off', 'aria-label': 'Who do you want to trade with?' });
  const sugg = el('div', { class: 'sugg' });
  const theirBox = el('div', { class: 'items small-items' }), myBox = el('div', { class: 'items small-items' });
  const giveCoins = el('input', { type: 'number', min: '0', max: String(w ? w.coins : 0), value: '0', 'aria-label': 'Coins you give' });
  const wantCoins = el('input', { type: 'number', min: '0', value: '0', 'aria-label': 'Coins you want' });
  const summary = el('p', { class: 'small' }), msg = el('p', { class: 'msg' });
  const mine = Object.keys(w.items).map(findItem).filter((f) => f && canTrade(f.item));
  const toggle = (set, key, btn) => { if (set.has(key)) set.delete(key); else if (set.size < 8) set.add(key); btn.classList.toggle('pick', set.has(key)); sum(); };
  const sum = () => { summary.textContent = `You give ${valueOfKeys([...state.give], +giveCoins.value || 0)} worth, you get ${valueOfKeys([...state.want], +wantCoins.value || 0)} worth.`; };
  myBox.replaceChildren(...(mine.length ? mine.map((f) => { const b = itemButton(f.kind, f.item, { status: el('span', { class: 'item-price' }, `Worth ${valueOf(f.item)}`), onclick: () => toggle(state.give, f.key, b) }); return b; }) : [el('p', { class: 'small' }, "You don't have any tradeable items yet. Buy some in the shop, or offer coins.")]));
  async function loadThem() {
    const n = who.value.trim();
    theirBox.replaceChildren(el('p', { class: 'small' }, n ? 'Loading…' : 'Type a username to see their items.'));
    state.want.clear(); sum();
    if (!n) return;
    try {
      const u = await api.user(n);
      state.to = u.name;
      theirBox.replaceChildren(...(u.items.length ? u.items.map(({ key }) => { const f = findItem(key); const b = itemButton(f.kind, f.item, { status: el('span', { class: 'item-price' }, `Worth ${valueOf(f.item)}`), onclick: () => toggle(state.want, key, b) }); return b; }) : [el('p', { class: 'small' }, `${u.name} has no tradeable items. You can still ask for coins.`)]));
    } catch (e) { theirBox.replaceChildren(el('p', { class: 'small' }, e.message)); state.to = ''; }
  }
  let qt = 0;
  who.addEventListener('input', () => {
    clearTimeout(qt);
    qt = setTimeout(async () => {
      const q = who.value.trim();
      sugg.replaceChildren();
      if (q.length >= 2) try { const r = await api.users(q); sugg.replaceChildren(...r.users.filter((u) => u.name !== session.user.name).map((u) => el('button', { class: 'chip', type: 'button', onclick: () => { who.value = u.name; sugg.replaceChildren(); loadThem(); } }, u.name))); } catch (e) { /* ok */ }
    }, 250);
  });
  who.addEventListener('change', loadThem);
  giveCoins.addEventListener('input', sum); wantCoins.addEventListener('input', sum);
  const send = el('button', { class: 'btn btn-sun btn-big', type: 'button', onclick: async () => {
    if (!state.to) { msg.textContent = 'Pick who to trade with.'; return; }
    send.disabled = true; msg.textContent = 'Sending…';
    try {
      await api.offer({ to: state.to, give: [...state.give], want: [...state.want], giveCoins: +giveCoins.value || 0, wantCoins: +wantCoins.value || 0 });
      toast(`Offer sent to ${state.to}.`);
      go('#/closet/trades');
    } catch (e) { msg.textContent = e.message; send.disabled = false; }
  } }, 'Send offer');
  box.replaceChildren(
    el('div', { class: 'row' }, el('button', { class: 'btn', type: 'button', onclick: () => go('#/closet/trades') }, 'Back to trades')),
    el('h2', {}, 'New trade'),
    el('label', { class: 'label' }, 'Trade with'), el('div', { class: 'row' }, who, el('button', { class: 'btn', type: 'button', onclick: loadThem }, 'Look up')), sugg,
    el('div', { class: 'trade-compose' },
      el('div', {}, el('h3', {}, 'You give'), myBox, el('label', { class: 'label' }, 'Plus coins ', giveCoins)),
      el('div', {}, el('h3', {}, 'You get'), theirBox, el('label', { class: 'label' }, 'Plus coins ', wantCoins))),
    summary, msg, send);
  sum();
  if (name) loadThem(); else theirBox.replaceChildren(el('p', { class: 'small' }, 'Type a username to see their items.'));
}

/* ---------------- badges ---------------- */
function renderBadges() {
  const list = $('#ach-list'); list.innerHTML = '';
  const got = progress.data.ach;
  // wear one of your badges as a title
  const pickBox = $('#title-pick'), sel = $('#title-select');
  pickBox.hidden = !session.user;
  if (session.user) {
    const mine = ACHIEVEMENTS.filter((a) => got[a.id]);
    // special titles: Admin (only the owner), and OG / Beta Tester for players the admin gave them to
    const special = [...(session.user.owner ? ['admin'] : []), ...(session.user.tags || [])].filter((t) => SPECIAL_TITLES[t]);
    sel.replaceChildren(el('option', { value: '' }, 'No title'),
      ...(special.length ? [el('optgroup', { label: 'Special' }, ...special.map((t) => el('option', { value: t }, SPECIAL_TITLES[t])))] : []),
      el('optgroup', { label: 'Badges' }, ...mine.map((a) => el('option', { value: a.id }, a.name))));
    const cur = session.user.title;
    sel.value = cur && (special.includes(cur) || got[cur]) ? cur : '';
    sel.onchange = async () => {
      try { await api.saveProgress(progress.data).catch(() => {}); const r = await api.setTitle(sel.value); session.user.title = r.title; toast(r.title ? `You're wearing "${sel.selectedOptions[0].textContent}" as your title.` : 'Title taken off.'); }
      catch (e) { toast(e.message); sel.value = session.user.title || ''; }
    };
  }
  $('#ach-count').textContent = `${Object.keys(got).filter((k) => ACHIEVEMENTS.some((a) => a.id === k)).length} of ${ACHIEVEMENTS.length}`;
  // badge-only items: which badge unlocks what
  const rewards = {};
  for (const k of KINDS) for (const item of SHOP[k]) if (item.need && item.need.ach) (rewards[item.need.ach] ||= []).push({ k, item });
  for (const a of ACHIEVEMENTS) {
    const rw = rewards[a.id];
    list.append(el('div', { class: 'ach' + (got[a.id] ? ' got' : '') + (a.hard ? ' hard' : '') + (a.chosen ? ' chosen' : '') }, pipBadge(got[a.id]), el('div', {}, el('b', {}, a.name, a.hard ? el('span', { class: 'hard-tag' }, a.chosen ? 'LEGENDARY' : 'HARD') : null), el('span', { class: 'small' }, a.text),
      rw ? el('span', { class: 'ach-reward' }, ...rw.map(({ k, item }) => el('button', { class: 'chip', type: 'button', title: got[a.id] ? 'Unlock it in the shop' : 'Earn this badge to unlock it', onclick: () => { kind = k; jumpTo = { kind: k, id: item.id, key: itemKey(k, item.id), item }; go('#/closet'); } }, itemPreview(k, item, 22), `${got[a.id] ? '🎁' : '🔒'} ${item.name}`))) : null)));
  }
  const s = progress.data.stats;
  $('#stats-list').innerHTML = '';
  for (const [label, v] of [['Levels beaten', s.wins], ['Stars', progress.totalStars()], ['Obbies beaten', s.obbies], ['Jumps', s.jumps], ['Coins grabbed', s.coins], ['Walkers stomped', s.stomps], ['Portals', s.portals], ['Respawns', s.deaths], ['Endless best', `${Math.floor(s.endlessBest)} m`], ['Dailies cleared', s.dailies], ['Trades', s.trades], ['Minigame wins', (s.win_race || 0) + (s.win_tag || 0) + (s.win_paint || 0) + (s.win_koth || 0) + (s.win_lava || 0)], ['Paintball splats', s.splats || 0], ['Snowball hits', s.snowhits || 0], ['Dances', s.dances || 0]]) {
    $('#stats-list').append(el('div', { class: 'stat' }, el('span', { class: 'stat-v' }, String(v)), el('span', { class: 'small' }, label)));
  }
}
function pipBadge(on) {
  const cv = pipCanvas(34, on ? {} : { color: '#a3abc2', hat: 'none' });
  if (!on) cv.style.opacity = '0.5';
  return cv;
}

addRoute(/^#\/closet$/, () => showCloset('shop'));
addRoute(/^#\/shop$/, () => showCloset('shop'));
addRoute(/^#\/closet\/(mine|trades|badges|market|chests|road)$/, (m) => showCloset(m[1]));
addRoute(/^#\/closet\/trade\/([A-Za-z0-9_]{0,16})$/, (m) => showCloset('trades', m[1] || ''));

/* ---------------- the shop keeper in 3D worlds ---------------- */
// Fills `host` (an overlay inside the 3D stage) with a small shop. looked(equip) is called after you wear or buy something.
export async function shopPanel(host, { close, looked }) {
  let k = 'hat', sel = null;
  const coins = el('span', { class: 'tag tag-pay' });
  const grid = el('div', { class: 'items' });
  const cap = el('div', { class: 'shop-cap' });
  const chips = el('div', { class: 'chips' });
  const panel = el('div', { class: 'panel shop-panel', role: 'dialog', 'aria-label': 'Shop' },
    el('div', { class: 'shop-head' }, el('h2', {}, 'Shop keeper'), coins, el('button', { class: 'btn', type: 'button', onclick: close }, 'Close')),
    el('p', { class: 'small' }, '"Welcome! Pick something to try it on. Buy it and you wear it right away."'),
    chips, grid, cap);
  host.replaceChildren(panel);
  if (!shopInfo && (await isOnline())) { try { shopInfo = await api.shop(); } catch (e) { /* no deals */ } }
  const draw = () => {
    const w = progress.wallet;
    coins.textContent = w ? `${w.coins} coins` : 'Guest';
    chips.replaceChildren(...KINDS.map((x) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(x === k), onclick: () => { k = x; sel = null; draw(); } }, KIND_LABEL[x])));
    grid.replaceChildren(...variantGroups(k).map((g) => {
      const item = sel && g.list.some((x) => x.id === sel.item.id) ? sel.item : g.list.find((x) => progress.data.equip[k] === x.id) || g.list[0];
      const key = itemKey(k, item.id), owned = progress.owns(k, item.id), on = progress.data.equip[k] === item.id;
      return el('button', { class: `item${on ? ' on' : ''}${sel && sel.key === key ? ' pick' : ''}${item.stock ? ' limited' : ''}`, type: 'button', onclick: () => { sel = { key, item }; draw(); } },
        itemPreview(k, item, 52), el('span', { class: 'item-name' }, item.name), on ? el('span', { class: 'item-price' }, 'Wearing') : owned ? el('span', { class: 'item-price' }, 'Owned') : priceTag(key, item),
        g.list.length > 1 ? el('span', { class: 'variant-count' }, `${g.list.length} styles`) : null);
    }));
    cap.replaceChildren();
    if (!sel) { cap.append(el('p', { class: 'small' }, 'Pick something.')); return; }
    const { key, item } = sel, owned = progress.owns(k, item.id), wearing = progress.data.equip[k] === item.id;
    const btns = [];
    if (owned) btns.push(el('button', { class: 'btn btn-grass', type: 'button', disabled: wearing, onclick: async () => { await wear(k, item.id); looked({ ...progress.data.equip }); draw(); } }, wearing ? 'Wearing it' : 'Wear it'));
    else if (!w) btns.push(el('button', { class: 'btn btn-sun', type: 'button', onclick: () => { close(); openAccount(); } }, 'Log in to buy'));
    else if (item.need) btns.push(el('button', { class: 'btn', type: 'button', disabled: true }, item.hint));
    else {
      const price = dealPrice(key, item), left = item.stock && shopInfo ? shopInfo.stock[key] : null;
      const b = el('button', { class: 'btn btn-sun', type: 'button', onclick: async () => { b.disabled = true; await buy(key, item, 1, price); looked({ ...progress.data.equip }); draw(); } }, `Buy for ${price} coins`);
      if (left === 0) { b.disabled = true; b.textContent = 'Sold out'; } else if (outToday(key)) { b.disabled = true; b.textContent = 'Not in stock today'; } else if (w.coins < price) { b.disabled = true; b.textContent = `Need ${price - w.coins} more coins`; }
      btns.push(b);
    }
    const grp = groupOf(k, item.id);
    const styles = grp && grp.list.length > 1 ? el('div', { class: 'variants' }, ...grp.list.map((v) => el('button', { class: 'variant' + (v.stock ? ' limited' : '') + (v.id === item.id ? ' on' : ''), type: 'button', 'aria-pressed': String(v.id === item.id), title: v.name, onclick: () => { sel = { key: itemKey(k, v.id), item: v }; draw(); } }, itemPreview(k, v, 30), el('span', {}, v.name)))) : null;
    cap.append(el('b', {}, item.name), styles, el('div', { class: 'row' }, ...btns));
  };
  draw();
}

/* ---------------- item stats: rarity, store worth and real worth ---------------- */
let stats = null, statsAt = 0;
async function loadStats(force) {
  if (!force && stats && Date.now() - statsAt < 60e3) return;
  if (!(await isOnline())) return;
  try { stats = (await api.itemStats()).stats; statsAt = Date.now(); } catch (e) { return; }
  if (pick && ['shop', 'mine'].includes(tab)) renderCaption();
}
// What something really sells for: the average of its last 10 Reseller sales, or the shop price if nobody sold one yet.
function worthOf(key, item) { const s = stats && stats[key]; return s && s.rap ? s.rap : valueOf(item); }
function rarityOf(key, item) {
  const s = stats && stats[key], n = s ? s.exist : null;
  let r = baseRarity(item);
  if (item.stock && n != null && n <= 5 && s.left === 0) r = 5; // almost none left in the whole game
  return RARITY[r];
}
function statsLine(key, item) {
  if (!canTrade(item)) return null;
  const s = stats && stats[key];
  const real = s && s.rap, r = rarityOf(key, item);
  const cat = key.startsWith('gear:') ? gearCat(item.id) : null;
  const bits = [el('span', { class: 'rarity r-' + r.toLowerCase() }, r), cat ? el('span', { class: 'gear-cat' }, `${GEAR_CATS[cat].name} gear, ${TIER_NAME[GEAR_TIER[item.id]]}`) : null, el('span', {}, `Store worth ${valueOf(item)}`),
    el('span', { class: real && real > valueOf(item) ? 'up' : real && real < valueOf(item) ? 'down' : '' }, real ? `Real worth ${real}` : 'Real worth: no sales yet')];
  if (s) bits.push(el('span', {}, `${s.exist} exist`), el('span', {}, `${s.owners} ${s.owners === 1 ? 'owner' : 'owners'}`));
  if (item.stock && s && s.left != null) bits.push(el('span', {}, s.left ? `${s.left} left in shop` : 'Sold out forever'));
  if (s && s.forSale) bits.push(el('a', { href: '#/closet/market', onclick: (e) => { e.preventDefault(); marketFocus = key; if (tab === 'market') showListings(key); else go('#/closet/market'); } }, `${s.forSale} for sale from ${s.low}`));
  return el('div', { class: 'item-stats' }, ...bits);
}

/* ---------------- the Reseller shop ---------------- */
async function resell(key, item) {
  if (!session.user) { needLogin('Selling needs an account.'); return; }
  const guess = Math.max(1, worthOf(key, item));
  const input = el('input', { type: 'number', min: '1', max: '1000000', value: String(guess), 'aria-label': 'Price in coins' });
  const note = el('p', { class: 'small' });
  const upd = () => { const p = Math.floor(+input.value || 0); note.textContent = p > 0 ? `If it sells you get all ${p} coins. It leaves My Items until it sells, and you can take it down any time.` : 'Pick a price.'; };
  input.addEventListener('input', upd); upd();
  const ok = await ask(`Sell ${item.name} on the Reseller shop`, `Other players can buy it for the price you pick. Real worth right now: ${worthOf(key, item)} coins.`, [{ label: 'Put it up for sale', value: true, cls: 'btn-sun' }], el('div', {}, el('label', { class: 'label' }, 'Price ', input), note));
  if (!ok) return;
  try {
    const r = await api.marketSell(key, Math.floor(+input.value || 0));
    setWallet(r.wallet); renderWallet(); toast(`${item.name} is for sale!`); loadStats(true);
    pick = null;
    if (tab === 'market') renderMarket(); else render();
  } catch (e) { toast(e.message); }
}
let marketFocus = '';
async function renderMarket() {
  const box = $('#closet-market');
  if (marketFocus) { const k = marketFocus; marketFocus = ''; showListings(k); return; }
  if (!(await isOnline())) { box.replaceChildren(el('p', { class: 'msg' }, 'The Reseller shop needs the online server.')); return; }
  box.replaceChildren(el('p', { class: 'msg' }, 'Loading…'));
  let m;
  try { m = await api.market(); } catch (e) { box.replaceChildren(el('p', { class: 'msg' }, e.message)); return; }
  await loadStats();
  const w = progress.wallet;
  const forSale = m.items.map((x) => ({ ...x, f: findItem(x.item) })).filter((x) => x.f);
  const tile = (f, status, onclick) => el('button', { class: 'item' + (f.item.stock ? ' limited' : ''), type: 'button', onclick }, itemPreview(f.kind, f.item), el('span', { class: 'item-name' }, f.item.name), status);
  const mineRows = m.mine.map((l) => { const f = findItem(l.item); return f ? el('div', { class: 'market-row' }, itemPreview(f.kind, f.item, 40), el('b', {}, f.item.name), el('span', { class: 'small' }, `${l.price} coins, ${timeAgo(l.at)}`),
    el('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { try { const r = await api.marketCancel(l.id); setWallet(r.wallet); renderWallet(); toast('Taken down. It is back in My Items.'); loadStats(true); renderMarket(); } catch (e) { toast(e.message); } } }, 'Take it down')) : null; });
  const sellable = w ? Object.keys(w.items).filter((k) => (w.items[k] || 0) > 0).map(findItem).filter((f) => f && canTrade(f.item)) : [];
  box.replaceChildren(
    el('p', { class: 'lede' }, `Buy and sell with other players. This is the only place to get limited items after they sell out. Sellers pick the price and get all of it.`),
    el('h2', {}, 'For sale'),
    forSale.length ? el('div', { class: 'items' }, ...forSale.map((x) => tile(x.f, el('span', { class: 'item-price' }, `from ${x.low} coins`, el('span', { class: 'stock' }, ` ${x.n} for sale`)), () => showListings(x.item)))) : el('p', { class: 'small' }, 'Nothing for sale yet. Be the first!'),
    session.user ? el('h2', {}, 'Your things for sale') : null,
    session.user ? (mineRows.length ? el('div', { class: 'market-rows' }, ...mineRows) : el('p', { class: 'small' }, 'You are not selling anything.')) : null,
    session.user ? el('h2', {}, 'Sell something') : el('div', { class: 'panel-note' }, el('p', {}, 'Log in to buy and sell.'), el('button', { class: 'btn btn-sun', type: 'button', onclick: () => openAccount() }, 'Log in or sign up')),
    session.user ? (sellable.length ? el('div', { class: 'items small-items' }, ...sellable.map((f) => tile(f, el('span', { class: 'item-price' }, `Worth ${worthOf(f.key, f.item)}`), () => resell(f.key, f.item)))) : el('p', { class: 'small' }, "You don't have anything to sell yet.")) : null);
}
async function showListings(key) {
  const box = $('#closet-market'), f = findItem(key);
  if (!f) return;
  box.replaceChildren(el('p', { class: 'msg' }, 'Loading…'));
  let d;
  try { d = await api.marketItem(key); } catch (e) { box.replaceChildren(el('p', { class: 'msg' }, e.message)); return; }
  await loadStats();
  const w = progress.wallet, me = session.user && session.user.name;
  const rows = d.listings.map((l) => {
    const b = el('button', { class: 'btn btn-sun', type: 'button', onclick: async () => {
      const ok = await ask(`Buy ${f.item.name}?`, `From ${l.name} for ${l.price} coins.`, [{ label: `Buy for ${l.price}`, value: true, cls: 'btn-sun' }]);
      if (!ok) return;
      try {
        const r = await api.marketBuy(l.id); setWallet(r.wallet); renderWallet();
        import('../audio.js').then((a) => a.sfx('buy')).catch(() => {});
        progress.stat('bought'); progress.flush();
        toast(`You got ${f.item.name}!`); loadStats(true); showListings(key);
      } catch (e) { toast(e.message); showListings(key); }
    } }, `Buy for ${l.price}`);
    if (!w) { b.disabled = true; b.textContent = 'Log in to buy'; }
    else if (l.name === me) { b.disabled = true; b.textContent = 'Yours'; }
    else if (w.coins < l.price) { b.disabled = true; b.textContent = `Need ${l.price - w.coins} more`; }
    return el('div', { class: 'market-row' }, el('b', {}, `${l.price} coins`), el('span', { class: 'small' }, `${l.name}, ${timeAgo(l.at)}`), b);
  });
  box.replaceChildren(
    el('div', { class: 'row' }, el('button', { class: 'btn', type: 'button', onclick: () => renderMarket() }, 'Back to the Reseller shop')),
    el('div', { class: 'market-detail' }, itemPreview(f.kind, f.item, 96), el('div', {}, el('h2', {}, f.item.name), statsLine(key, f.item))),
    el('h3', {}, 'For sale (cheapest first)'),
    rows.length ? el('div', { class: 'market-rows' }, ...rows) : el('p', { class: 'small' }, 'None for sale right now.'),
    el('h3', {}, 'Last sales'),
    d.sales.length ? el('div', { class: 'market-rows' }, ...d.sales.map((s) => el('div', { class: 'market-row' }, el('b', {}, `${s.price} coins`), el('span', { class: 'small' }, timeAgo(s.sold_at))))) : el('p', { class: 'small' }, 'Nobody has sold one here yet.'));
}

/* ---------------- chests ---------------- */
function drawChest(c, color, open, shake, t) {
  c.save();
  c.translate(48 + (shake ? Math.sin(t * 60) * 3 * shake : 0), 60);
  const dark = 'rgba(0,0,0,.25)';
  c.fillStyle = 'rgba(29,35,64,.18)'; c.beginPath(); c.ellipse(0, 26, 34, 6, 0, 0, Math.PI * 2); c.fill();
  // glow when open
  if (open > 0) { const g = c.createRadialGradient(0, -8, 2, 0, -8, 50); g.addColorStop(0, `rgba(255,240,150,${0.9 * open})`); g.addColorStop(1, 'rgba(255,240,150,0)'); c.fillStyle = g; c.fillRect(-50, -60, 100, 80); }
  c.fillStyle = color; c.fillRect(-30, -8, 60, 32);
  c.fillStyle = dark; c.fillRect(-30, 4, 60, 4); c.fillRect(-24, -8, 5, 32); c.fillRect(19, -8, 5, 32);
  c.strokeStyle = '#1d2340'; c.lineWidth = 2.5; c.strokeRect(-30, -8, 60, 32);
  // lid swings back as it opens
  c.save(); c.translate(0, -8); c.scale(1, 1 - open * 1.6);
  c.fillStyle = color; c.beginPath(); c.moveTo(-30, 0); c.lineTo(-30, -12); c.quadraticCurveTo(0, -26, 30, -12); c.lineTo(30, 0); c.closePath(); c.fill();
  c.fillStyle = dark; c.fillRect(-24, -18, 5, 18); c.fillRect(19, -18, 5, 18);
  c.stroke(); c.restore();
  if (open < 0.3) { c.fillStyle = '#ffd23f'; c.fillRect(-6, -12, 12, 12); c.strokeRect(-6, -12, 12, 12); c.fillStyle = '#1d2340'; c.fillRect(-1.5, -8, 3, 5); }
  c.restore();
}
function chestCanvas(color, size = 96) {
  const dpr = Math.min(2, devicePixelRatio || 1), cv = document.createElement('canvas');
  cv.width = cv.height = size * dpr; cv.style.width = cv.style.height = size + 'px';
  const c = cv.getContext('2d'); c.scale(dpr * size / 96, dpr * size / 96);
  drawChest(c, color, 0, 0, 0);
  cv.setAttribute('aria-hidden', 'true');
  return cv;
}
/* ---------------- Trophy Road: rewards for leveling up ---------------- */
async function renderRoad() {
  const box = $('#closet-road');
  if (!(await isOnline()) || !progress.wallet) { box.replaceChildren(el('p', { class: 'msg' }, 'Log in to walk the Trophy Road.'), el('div', { class: 'row' }, el('button', { class: 'btn btn-sun', type: 'button', onclick: () => openAccount() }, 'Log in'))); return; }
  let r;
  try { r = await api.road(); } catch (e) { box.replaceChildren(el('p', { class: 'msg' }, e.message)); return; }
  const lvl = r.level, next = xpFor(lvl + 1), from = xpFor(lvl), pct = Math.max(0, Math.min(100, Math.round(((r.xp - from) / (next - from)) * 100)));
  const X = r.xpRules;
  const stepEl = (s) => {
    const f = s.item ? findItem(s.item) : null;
    const what = s.coins ? `${s.coins} coins` : f ? f.item.name : s.item;
    const btn = s.claimed ? el('span', { class: 'tag road-got' }, 'Got it ✓')
      : s.open ? el('button', { class: 'btn btn-sun', type: 'button', onclick: async (e) => {
        e.target.disabled = true;
        try { const res = await api.claimRoad(s.lv); setWallet(res.wallet); renderWallet(); toast(`You got ${res.got}!`); import('../audio.js').then((a) => a.sfx(s.coins ? 'coin' : 'badge')).catch(() => {}); renderRoad(); } catch (err) { toast(err.message); e.target.disabled = false; }
      } }, 'Claim')
        : el('span', { class: 'small' }, `Level ${s.lv}`);
    const pic = s.coins ? el('span', { class: 'road-coin', 'aria-hidden': 'true' }, '🪙') : itemPreview(f.kind, f.item, 48);
    return el('li', { class: 'road-step' + (s.open ? ' open' : '') + (s.claimed ? ' got' : '') },
      el('span', { class: 'road-lv' }, String(s.lv)), pic, el('span', { class: 'road-what' }, el('b', {}, what), f ? el('span', { class: 'small' }, s.item.split(':')[0] === 'color' ? 'color' : s.item.split(':')[0]) : null), btn);
  };
  const ready = r.steps.filter((s) => s.open && !s.claimed).length;
  box.replaceChildren(
    el('div', { class: 'section-head' }, el('h2', {}, `Level ${lvl}`), el('span', { class: 'small' }, `${r.xp} XP · ${next - r.xp} XP to level ${lvl + 1}`)),
    el('div', { class: 'progress-track road-bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, el('div', { class: 'progress-bar', style: `width:${pct}%` })),
    el('p', { class: 'small road-how' }, `Get XP by playing: +${X.star} for every new star, +${X.win} for winning a minigame (+${X.place} for 2nd or 3rd), +${X.minute} for every minute in 3D worlds (up to ${X.minutesPerDay} a day), plus daily quests and the daily bonus.`),
    ready ? el('p', { class: 'msg' }, `${ready} reward${ready === 1 ? '' : 's'} ready to claim!`) : null,
    el('ol', { class: 'road' }, ...r.steps.map(stepEl)));
}

async function renderChests() {
  const box = $('#closet-chests');
  if (!(await isOnline())) { box.replaceChildren(el('p', { class: 'msg' }, 'Chests need the online server.')); return; }
  let list;
  try { list = (await api.chests()).chests; } catch (e) { box.replaceChildren(el('p', { class: 'msg' }, e.message)); return; }
  const w = progress.wallet;
  const oddsText = (o) => o.kind === 'coins' ? `${o.lo}–${o.hi} coins` : `an item worth ${o.lo}–${o.hi}`;
  box.replaceChildren(
    el('p', { class: 'lede' }, 'Spend coins on a chest and get a surprise: coins or an item (something new if it can). The odds are written on each chest. Limited items never come out of chests.'),
    el('div', { class: 'chests' }, ...list.map((ch) => {
      const b = el('button', { class: 'btn btn-sun btn-big', type: 'button', onclick: () => (w ? openIt(ch) : openAccount()) }, w ? `Open for ${ch.price}` : 'Log in to open');
      if (w && w.coins < ch.price) { b.disabled = true; b.textContent = `Need ${ch.price - w.coins} more coins`; }
      return el('div', { class: 'chest' }, chestCanvas(ch.color), el('h3', {}, ch.name),
        el('ul', { class: 'odds' }, ...ch.odds.map((o) => el('li', {}, el('b', {}, `${o.pct}%`), ` ${oddsText(o)}`))), b);
    })),
    el('div', { id: 'chest-stage' }));
  async function openIt(ch) {
    const ok = await ask(`Open the ${ch.name}?`, `It costs ${ch.price} coins.`, [{ label: `Open for ${ch.price}`, value: true, cls: 'btn-sun' }]);
    if (!ok) return;
    let r;
    try { r = await api.openChest(ch.id); } catch (e) { toast(e.message); return; }
    setWallet(r.wallet); renderWallet();
    await openChestAnim(ch, r.prize);
    renderChests();
  }
}
function openChestAnim(ch, prize) {
  return new Promise((resolve) => {
    const dpr = Math.min(2, devicePixelRatio || 1), size = 160;
    const cv = el('canvas', { 'aria-hidden': 'true' }); cv.width = cv.height = size * dpr; cv.style.width = cv.style.height = size + 'px';
    const c = cv.getContext('2d');
    const out = el('div', { class: 'chest-prize', 'aria-live': 'polite' });
    const f = prize.kind === 'item' ? findItem(prize.key) : null;
    const done = el('button', { class: 'btn btn-sun', type: 'button', hidden: true, onclick: () => { modal.remove(); resolve(); } }, 'Nice!');
    const wearBtn = f ? el('button', { class: 'btn btn-grass', type: 'button', hidden: true, onclick: async () => { await wear(f.kind, f.id).catch(() => {}); modal.remove(); resolve(); } }, 'Wear it') : null;
    const modal = el('div', { class: 'chest-stage', role: 'dialog', 'aria-label': 'Opening ' + ch.name }, el('div', { class: 'panel' }, el('h2', {}, ch.name), cv, out, el('div', { class: 'row' }, wearBtn, done)));
    document.body.append(modal);
    const audio = import('../audio.js').catch(() => null);
    const t0 = performance.now();
    let revealed = false;
    const tick = (now) => {
      if (!modal.isConnected) return;
      const t = (now - t0) / 1000;
      const shake = t < 1.2 ? Math.min(1, t) : 0, open = t < 1.2 ? 0 : Math.min(1, (t - 1.2) * 3);
      c.setTransform(dpr * size / 96, 0, 0, dpr * size / 96, 0, 0); c.clearRect(0, 0, 96, 96);
      drawChest(c, ch.color, open, shake, t);
      if (open > 0) { for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + t, rr = 10 + open * 30; c.fillStyle = ['#ffd23f', '#ff5d8f', '#7cc8ff', '#44c06a'][i % 4]; c.fillRect(48 + Math.cos(a) * rr - 2, 44 + Math.sin(a) * rr * 0.6 - 2, 4, 4); } }
      if (t > 1.3 && !revealed) {
        revealed = true;
        audio.then((a) => a && a.sfx(prize.kind === 'item' ? 'badge' : 'coin'));
        if (f) out.replaceChildren(itemPreview(f.kind, f.item, 96), el('b', {}, `${f.item.name}!`), el('span', { class: 'small' }, `Worth ${valueOf(f.item)} coins`));
        else out.replaceChildren(el('span', { class: 'big-coins' }, `+${prize.coins}`), el('span', { class: 'small' }, 'coins'));
        done.hidden = false; if (wearBtn) wearBtn.hidden = false;
        done.focus();
      }
      if (t < 3) requestAnimationFrame(tick);
    };
    audio.then((a) => a && a.sfx('open'));
    requestAnimationFrame(tick);
  });
}
