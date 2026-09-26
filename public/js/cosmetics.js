// Everything in Pip's Closet. Prices are in coins, and every item is worth its price.
// need: { stars: n } or { ach: 'id' } means you earn it instead of buying it (earned items can't be traded).
// stock: limited items. Only that many exist, ever. When they sell out you can only get one by trading.

export const COLORS = [
  { id: '#ff6b35', name: 'Tangerine', price: 0 },
  { id: '#3a86ff', name: 'Blueberry', price: 0 },
  { id: '#44c06a', name: 'Lime', price: 0 },
  { id: '#ff5d8f', name: 'Bubblegum', price: 0 },
  { id: '#b06cff', name: 'Grape', price: 30 },
  { id: '#ffd23f', name: 'Banana', price: 30 },
  { id: '#2ec4b6', name: 'Mint', price: 40 },
  { id: '#f4f4f4', name: 'Marshmallow', price: 40 },
  { id: '#e63946', name: 'Cherry', price: 60 },
  { id: '#8d5a2b', name: 'Cocoa', price: 60 },
  { id: '#3d405b', name: 'Midnight', price: 80 },
  { id: '#7ae582', name: 'Glow', need: { stars: 15 }, hint: 'Earn 15 stars' },
  { id: '#c8a2ff', name: 'Lavender', price: 70 },
  { id: '#0077b6', name: 'Ocean', price: 90 },
  { id: '#e0b12a', name: 'Gold', price: 700, stock: 20 },
  { id: '#9ff0ff', name: 'Diamond', price: 1200, stock: 10 },
];

export const HATS = [
  { id: 'none', name: 'No hat', price: 0 },
  { id: 'cap', name: 'Ball cap', price: 60 },
  { id: 'bow', name: 'Big bow', price: 80 },
  { id: 'sprout', name: 'Sprout', price: 100 },
  { id: 'party', name: 'Party hat', price: 120 },
  { id: 'beanie', name: 'Beanie', price: 150 },
  { id: 'headphones', name: 'Headphones', price: 180 },
  { id: 'horns', name: 'Little horns', price: 220 },
  { id: 'tophat', name: 'Top hat', price: 260 },
  { id: 'propeller', name: 'Propeller cap', price: 320 },
  { id: 'crown', name: 'Crown', need: { stars: 30 }, hint: 'Earn 30 stars' },
  { id: 'halo', name: 'Halo', need: { ach: 'flawless' }, hint: 'Beat Portal Party without dying' },
  { id: 'wizard', name: 'Wizard hat', need: { ach: 'endless1000' }, hint: 'Reach 1000 m in Endless Rush' },
  { id: 'viking', name: 'Viking helmet', price: 600, stock: 25 },
  { id: 'chef', name: 'Chef hat', price: 500, stock: 25 },
  { id: 'bunny', name: 'Bunny ears', price: 240 },
  { id: 'cowboy', name: 'Cowboy hat', price: 280 },
  { id: 'unicorn', name: 'Unicorn horn', price: 900, stock: 20 },
];

export const TRAILS = [
  { id: 'none', name: 'No trail', price: 0 },
  { id: 'sparkle', name: 'Sparkles', price: 150 },
  { id: 'bubbles', name: 'Bubbles', price: 180 },
  { id: 'hearts', name: 'Hearts', price: 220 },
  { id: 'notes', name: 'Music notes', price: 220 },
  { id: 'fire', name: 'Flames', price: 300 },
  { id: 'rainbow', name: 'Rainbow', price: 450 },
  { id: 'stars', name: 'Stardust', need: { ach: 'daily5' }, hint: 'Finish 5 daily challenges' },
  { id: 'lightning', name: 'Lightning', price: 800, stock: 15 },
  { id: 'confetti', name: 'Confetti', price: 260 },
  { id: 'snow', name: 'Snowflakes', price: 260 },
  { id: 'galaxy', name: 'Galaxy', price: 1000, stock: 12 },
];

// Pets follow you around in 3D worlds.
export const PETS = [
  { id: 'none', name: 'No pet', price: 0 },
  { id: 'slime', name: 'Slime', price: 250 },
  { id: 'chick', name: 'Chick', price: 300 },
  { id: 'pup', name: 'Pup', price: 400 },
  { id: 'kitty', name: 'Kitty', price: 400 },
  { id: 'bee', name: 'Bumble bee', need: { stars: 45 }, hint: 'Earn 45 stars' },
  { id: 'dragon', name: 'Mini dragon', price: 1500, stock: 10 },
];

export const SHOP = { color: COLORS, hat: HATS, trail: TRAILS, pet: PETS };
export const KINDS = ['hat', 'color', 'trail', 'pet'];
export const FREE = [...COLORS, ...HATS, ...TRAILS, ...PETS].filter((i) => i.price === 0 && !i.need).map((i) => i.id);
export const itemKey = (kind, id) => kind + ':' + id;
// 'hat:cap' -> { kind, item } or null
export function findItem(key) {
  const i = typeof key === 'string' ? key.indexOf(':') : -1;
  if (i < 0) return null;
  const kind = key.slice(0, i), id = key.slice(i + 1);
  const item = SHOP[kind] && SHOP[kind].find((x) => x.id === id);
  return item ? { kind, id, item, key } : null;
}
export const isFree = (item) => item.price === 0 && !item.need;
export const canTrade = (item) => !isFree(item) && !item.need;
export const valueOf = (item) => (item.need ? 0 : item.price || 0);
export const sellPrice = (item) => Math.floor(valueOf(item) / 2);
export const LIMITED = [...COLORS.map((i) => ['color', i]), ...HATS.map((i) => ['hat', i]), ...TRAILS.map((i) => ['trail', i]), ...PETS.map((i) => ['pet', i])].filter(([, i]) => i.stock).map(([k, i]) => ({ key: itemKey(k, i.id), stock: i.stock }));

// Player levels: every coin you earn by playing is also 1 XP.
export const xpFor = (lvl) => 20 * (lvl - 1) * (lvl - 1);
export const levelOf = (xp) => Math.floor(Math.sqrt(Math.max(0, xp || 0) / 20)) + 1;
