// Everything in Pip's Closet. Prices are in coins, and every item is worth its price.
// need: { stars: n } or { ach: 'id' } means you earn it instead of buying it (earned items can't be traded).
// stock: limited items. Only that many exist, ever. When they sell out you can only get one by trading.
// Limited is only for the really special stuff (6 items). Recolors of one item are its "variants" and show up
// together in the shop under that item (see VARIANTS and variantGroups); a variant can be limited on its own.

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
  { id: '#1fb5a0', name: 'Trophy teal', need: { level: 3 }, hint: 'Reach level 3 (Trophy Road)' },
  { id: '#c8a2ff', name: 'Lavender', price: 70 },
  { id: '#0077b6', name: 'Ocean', price: 90 },
  { id: '#e0b12a', name: 'Gold', price: 700 },
  { id: '#9ff0ff', name: 'Diamond', price: 1200 },
  // the big color drop
  { id: '#ffb4a2', name: 'Peach', price: 50 }, { id: '#ff7f50', name: 'Coral', price: 60 }, { id: '#fa8072', name: 'Salmon', price: 60 },
  { id: '#87ceeb', name: 'Sky', price: 60 }, { id: '#1b2a6b', name: 'Navy', price: 90 }, { id: '#008080', name: 'Teal', price: 80 },
  { id: '#2d6a4f', name: 'Forest', price: 80 }, { id: '#808000', name: 'Olive', price: 70 }, { id: '#fff44f', name: 'Lemon', price: 50 },
  { id: '#ffc300', name: 'Sunflower', price: 60 }, { id: '#ff6347', name: 'Tomato', price: 60 }, { id: '#8e4585', name: 'Plum', price: 90 },
  { id: '#d63384', name: 'Magenta', price: 90 }, { id: '#8e9aff', name: 'Periwinkle', price: 80 }, { id: '#00d1ff', name: 'Cyan', price: 80 },
  { id: '#7fffd4', name: 'Aqua', price: 70 }, { id: '#e6c79c', name: 'Sand', price: 50 }, { id: '#c68642', name: 'Caramel', price: 70 },
  { id: '#6c7a89', name: 'Slate', price: 70 }, { id: '#c0c7d1', name: 'Silver', price: 120 }, { id: '#36454f', name: 'Charcoal', price: 90 },
  { id: '#39ff14', name: 'Neon Green', price: 150 }, { id: '#ff1493', name: 'Hot Pink', price: 150 }, { id: '#ffb6c1', name: 'Blush', price: 60 },
  { id: '#8b6b4a', name: 'Mocha', price: 70 }, { id: '#d6f5ff', name: 'Ice', price: 90 }, { id: '#6b8e23', name: 'Moss', price: 70 },
  { id: '#8a1c4b', name: 'Berry', price: 90 }, { id: '#ff7518', name: 'Pumpkin', price: 80 }, { id: '#d4a017', name: 'Mustard', price: 70 },
  { id: '#1560bd', name: 'Denim', price: 80 }, { id: '#fff5d1', name: 'Cream', price: 60 }, { id: '#6a0dad', name: 'Grape Soda', price: 100 },
  { id: '#c1121f', name: 'Ruby', price: 1500 }, { id: '#0f9d58', name: 'Emerald', price: 1500 }, { id: '#1a4fd6', name: 'Sapphire', price: 1500 },
  { id: '#14161f', name: 'Obsidian', price: 2000 }, { id: '#e8a598', name: 'Rose Gold', price: 1800 }, { id: '#f0ead6', name: 'Pearl', price: 1800 },
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
  { id: 'viking', name: 'Viking helmet', price: 600 },
  { id: 'chef', name: 'Chef hat', price: 500 },
  { id: 'bunny', name: 'Bunny ears', price: 240 },
  { id: 'cowboy', name: 'Cowboy hat', price: 280 },
  { id: 'unicorn', name: 'Unicorn horn', price: 900 },
  // new shapes
  { id: 'pirate', name: 'Pirate hat', price: 400 }, { id: 'antlers', name: 'Antlers', price: 350 }, { id: 'catears', name: 'Cat ears', price: 250 },
  { id: 'santa', name: 'Santa hat', price: 300 }, { id: 'grad', name: 'Graduation cap', price: 450 }, { id: 'astronaut', name: 'Astronaut helmet', price: 3000, stock: 10 },
  // recolors (see VARIANTS below)
  { id: 'cap-red', name: 'Red cap', price: 80 }, { id: 'cap-green', name: 'Green cap', price: 80 }, { id: 'cap-black', name: 'Black cap', price: 100 },
  { id: 'cap-pink', name: 'Pink cap', price: 80 }, { id: 'cap-gold', name: 'Golden cap', price: 1200 },
  { id: 'beanie-blue', name: 'Blue beanie', price: 160 }, { id: 'beanie-green', name: 'Green beanie', price: 160 }, { id: 'beanie-purple', name: 'Purple beanie', price: 160 }, { id: 'beanie-black', name: 'Black beanie', price: 180 },
  { id: 'party-gold', name: 'Gold party hat', price: 250 }, { id: 'party-mint', name: 'Mint party hat', price: 140 }, { id: 'party-red', name: 'Red party hat', price: 140 },
  { id: 'tophat-white', name: 'White top hat', price: 320 }, { id: 'tophat-purple', name: 'Purple top hat', price: 320 }, { id: 'tophat-gold', name: 'Golden top hat', price: 2500 },
  { id: 'bow-blue', name: 'Blue bow', price: 90 }, { id: 'bow-red', name: 'Red bow', price: 90 }, { id: 'bow-mint', name: 'Mint bow', price: 90 }, { id: 'bow-black', name: 'Black bow', price: 110 },
  { id: 'crown-silver', name: 'Silver crown', price: 1500 }, { id: 'crown-ruby', name: 'Ruby crown', price: 5000, stock: 5 },
  { id: 'wizard-fire', name: 'Fire wizard hat', price: 600 }, { id: 'wizard-forest', name: 'Forest wizard hat', price: 600 }, { id: 'wizard-ice', name: 'Ice wizard hat', price: 600 },
  { id: 'cowboy-black', name: 'Black cowboy hat', price: 320 }, { id: 'cowboy-white', name: 'White cowboy hat', price: 320 },
  { id: 'headphones-mint', name: 'Mint headphones', price: 200 }, { id: 'headphones-gold', name: 'Gold headphones', price: 900 },
  { id: 'horns-black', name: 'Shadow horns', price: 260 }, { id: 'horns-gold', name: 'Golden horns', price: 800 },
  // badge-only: earn the badge to unlock them (they can't be bought or traded)
  { id: 'crown-demon', name: 'Demon crown', need: { ach: 'demon' }, hint: 'Earn the Demon Slayer badge' },
  { id: 'wizard-star', name: 'Starry wizard hat', need: { ach: 'rstars100' }, hint: 'Earn the Star Eater badge' },
  { id: 'headphones-dj', name: 'DJ headphones', need: { ach: 'dance200' }, hint: 'Earn the Disco Inferno badge' },
  { id: 'cap-racer', name: 'Racing cap', need: { ach: 'race25' }, hint: 'Earn the Photo Finish badge' },
  { id: 'tophat-tycoon', name: 'Tycoon top hat', need: { ach: 'tycoon' }, hint: 'Earn the Tycoon badge' },
  { id: 'horns-lava', name: 'Lava horns', need: { ach: 'lava10' }, hint: 'Earn the Floor Is Lava Pro badge' },
  // Trophy Road (reach the level)
  { id: 'cap-trophy', name: 'Trophy cap', need: { level: 5 }, hint: 'Reach level 5 (Trophy Road)' },
  { id: 'party-trophy', name: 'Trophy party hat', need: { level: 10 }, hint: 'Reach level 10 (Trophy Road)' },
  { id: 'crown-trophy', name: 'Trophy crown', need: { level: 20 }, hint: 'Reach level 20 (Trophy Road)' },
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
  { id: 'lightning', name: 'Lightning', price: 800 },
  { id: 'confetti', name: 'Confetti', price: 260 },
  { id: 'snow', name: 'Snowflakes', price: 260 },
  { id: 'galaxy', name: 'Galaxy', price: 1000 },
  { id: 'leaves', name: 'Leaves', price: 220 }, { id: 'mint', name: 'Mint breeze', price: 220 }, { id: 'lava', name: 'Lava drips', price: 320 },
  { id: 'ice', name: 'Ice shards', price: 300 }, { id: 'candy', name: 'Candy', price: 260 }, { id: 'ocean', name: 'Ocean spray', price: 280 },
  { id: 'toxic', name: 'Toxic goo', price: 350 }, { id: 'sakura', name: 'Cherry blossoms', price: 380 }, { id: 'shadow', name: 'Shadow', price: 400 },
  { id: 'sunset', name: 'Sunset', price: 420 }, { id: 'goldtrail', name: 'Gold dust', price: 1500 }, { id: 'void', name: 'The Void', price: 2500, stock: 8 },
  // badge-only
  { id: 'paintsplat', name: 'Paint splats', need: { ach: 'splat100' }, hint: 'Earn the Paint Picasso badge' },
  { id: 'frost', name: 'Frostbite', need: { ach: 'snow50' }, hint: 'Earn the Snowball Sniper badge' },
  { id: 'nebula', name: 'Nebula', need: { ach: 'nebula' }, hint: 'Earn the Treasure Hunter badge' },
  { id: 'chosen', name: 'Chosen glow', need: { ach: 'chosen' }, hint: 'Earn The Chosen One badge' },
];

// Pets follow you around in 3D worlds.
export const PETS = [
  { id: 'none', name: 'No pet', price: 0 },
  { id: 'slime', name: 'Slime', price: 250 },
  { id: 'chick', name: 'Chick', price: 300 },
  { id: 'pup', name: 'Pup', price: 400 },
  { id: 'kitty', name: 'Kitty', price: 400 },
  { id: 'bee', name: 'Bumble bee', need: { stars: 45 }, hint: 'Earn 45 stars' },
  { id: 'dragon', name: 'Mini dragon', price: 1500 },
  { id: 'slime-blue', name: 'Blue slime', price: 300 }, { id: 'slime-lava', name: 'Lava slime', price: 450 }, { id: 'slime-ghost', name: 'Ghost', price: 600 },
  { id: 'kitty-black', name: 'Black cat', price: 450 }, { id: 'kitty-fox', name: 'Fox', price: 550 }, { id: 'pup-snow', name: 'Snow pup', price: 500 },
  { id: 'slime-gold', name: 'Golden slime', price: 4000, stock: 6 },
  // badge-only
  { id: 'slime-demon', name: 'Demon slime', need: { ach: 'insane' }, hint: 'Earn the Asylum Escapee badge' },
  { id: 'kitty-tiger', name: 'Tiger', need: { ach: 'koth10' }, hint: 'Earn the Hill Hog badge' },
  { id: 'pup-gold', name: 'Golden pup', need: { ach: 'friends10' }, hint: 'Earn the Popular Pip badge' },
  { id: 'slime-star', name: 'Star slime', need: { ach: 'followers10' }, hint: 'Earn the Rising Star badge' },
  // Trophy Road
  { id: 'pup-sky', name: 'Sky pup', need: { level: 7 }, hint: 'Reach level 7 (Trophy Road)' },
  { id: 'slime-trophy', name: 'Trophy slime', need: { level: 15 }, hint: 'Reach level 15 (Trophy Road)' },
  { id: 'kitty-champ', name: 'Champion cat', need: { level: 30 }, hint: 'Reach level 30 (Trophy Road)' },
];
// Recolored items: [looks like, main color, second color]
export const VARIANTS = {
  'cap-red': ['cap', '#e63946', '#b5121b'], 'cap-green': ['cap', '#44c06a', '#2a8a45'], 'cap-black': ['cap', '#3d405b', '#1d2340'], 'cap-pink': ['cap', '#ff5d8f', '#d63d6f'], 'cap-gold': ['cap', '#e0b12a', '#b8901a'],
  'beanie-blue': ['beanie', '#3a86ff'], 'beanie-green': ['beanie', '#44c06a'], 'beanie-purple': ['beanie', '#b06cff'], 'beanie-black': ['beanie', '#3d405b'],
  'party-gold': ['party', '#e0b12a', '#ffffff'], 'party-mint': ['party', '#2ec4b6', '#ff5d8f'], 'party-red': ['party', '#e63946', '#ffd23f'],
  'tophat-white': ['tophat', '#f4f4f4', '#1d2340'], 'tophat-purple': ['tophat', '#5a3fd6', '#ffd23f'], 'tophat-gold': ['tophat', '#e0b12a', '#1d2340'],
  'bow-blue': ['bow', '#3a86ff'], 'bow-red': ['bow', '#e63946'], 'bow-mint': ['bow', '#2ec4b6'], 'bow-black': ['bow', '#3d405b'],
  'crown-silver': ['crown', '#c8d0e0'], 'crown-ruby': ['crown', '#e63946'],
  'wizard-fire': ['wizard', '#e63946'], 'wizard-forest': ['wizard', '#2a8a45'], 'wizard-ice': ['wizard', '#7cc8ff'],
  'cowboy-black': ['cowboy', '#3d405b', '#1d2340'], 'cowboy-white': ['cowboy', '#f4f0e0', '#c8b890'],
  'headphones-mint': ['headphones', '#2ec4b6'], 'headphones-gold': ['headphones', '#e0b12a'],
  'horns-black': ['horns', '#3d405b'], 'horns-gold': ['horns', '#e0b12a'],
  'slime-blue': ['slime', '#7cc8ff'], 'slime-lava': ['slime', '#ff5a1f'], 'slime-ghost': ['slime', '#f4f4f4'], 'slime-gold': ['slime', '#ffd23f'],
  'crown-demon': ['crown', '#8a1020'], 'wizard-star': ['wizard', '#1b2a6b'], 'headphones-dj': ['headphones', '#b06cff'], 'cap-racer': ['cap', '#ffd23f', '#1d2340'],
  'tophat-tycoon': ['tophat', '#2d6a4f', '#e0b12a'], 'horns-lava': ['horns', '#ff5a1f'],
  'slime-demon': ['slime', '#8a1020'], 'kitty-tiger': ['kitty', '#ff9f1c', '#1d2340'], 'pup-gold': ['pup', '#ffd23f', '#e0b12a'], 'slime-star': ['slime', '#b06cff'],
  'cap-trophy': ['cap', '#1fb5a0', '#127a6b'], 'party-trophy': ['party', '#1fb5a0', '#ffd23f'], 'crown-trophy': ['crown', '#1fb5a0'],
  'pup-sky': ['pup', '#8ecae6', '#219ebc'], 'slime-trophy': ['slime', '#1fb5a0'], 'kitty-champ': ['kitty', '#ffd23f', '#1fb5a0'],
  'kitty-black': ['kitty', '#3d405b', '#1d2340'], 'kitty-fox': ['kitty', '#ff8c42', '#c85a1e'], 'pup-snow': ['pup', '#f4f4f4', '#c8d0e0'],
};
export const variant = (id) => VARIANTS[id] || [id, null, null];
// One shop card per item: the item and all its variants (recolors), in shop order. [{ base, list: [items] }]
export function variantGroups(kind) {
  const items = SHOP[kind] || [], groups = new Map();
  for (const it of items) {
    const b = VARIANTS[it.id] && items.some((x) => x.id === VARIANTS[it.id][0]) ? VARIANTS[it.id][0] : it.id;
    if (!groups.has(b)) groups.set(b, { base: items.find((x) => x.id === b), list: [] });
    groups.get(b).list.push(it);
  }
  for (const g of groups.values()) g.list.sort((a, c) => (a.id === g.base.id ? -1 : c.id === g.base.id ? 1 : 0));
  return [...groups.values()];
}
export const groupOf = (kind, id) => variantGroups(kind).find((g) => g.list.some((x) => x.id === id)) || null;

// Gear changes how you move. It works in hangouts and minigames, but never in obbies (so times stay fair).
export const GEAR = [
  { id: 'none', name: 'No gear', price: 0 },
  { id: 'speed', name: 'Speed coil', price: 600 },
  { id: 'gravity', name: 'Gravity coil', price: 600 },
  { id: 'boots', name: 'Double-jump boots', price: 900 },
  { id: 'jetpack', name: 'Jetpack', price: 2500, stock: 10 },
  { id: 'turbo', name: 'Turbo shoes', price: 1200 }, { id: 'moon', name: 'Moon boots', price: 1000 }, { id: 'spring', name: 'Spring shoes', price: 1400 },
  { id: 'feather', name: 'Feather cape', price: 800 }, { id: 'rocket', name: 'Rocket pack', price: 6000, stock: 5 },
];
// what each one does to movement (see physics3d.js)
export const GEAR_MODS = { speed: { speed: 1.45 }, gravity: { grav: 0.5 }, boots: { jumps: 1 }, jetpack: { jet: 75 },
  turbo: { speed: 1.7 }, moon: { grav: 0.35 }, spring: { jumps: 2 }, feather: { grav: 0.65, speed: 1.15 }, rocket: { jet: 130, speed: 1.15 } };

// Gear comes in categories, and each piece has a tier (1 = basic, 2 = advanced, 3 = legendary).
// World makers can turn off whole categories or single pieces of gear in their worlds.
export const GEAR_CATS = {
  speed: { name: 'Speed', items: ['speed', 'turbo'] },
  float: { name: 'Floaty', items: ['gravity', 'feather', 'moon'] },
  jump: { name: 'Jumping', items: ['boots', 'spring'] },
  fly: { name: 'Flying', items: ['jetpack', 'rocket'] },
};
export const GEAR_TIER = { speed: 1, turbo: 2, gravity: 1, feather: 1, moon: 2, boots: 1, spring: 2, jetpack: 2, rocket: 3 };
export const TIER_NAME = ['', 'Tier 1 (basic)', 'Tier 2 (advanced)', 'Tier 3 (legendary)'];
export const gearCat = (id) => Object.keys(GEAR_CATS).find((c) => GEAR_CATS[c].items.includes(id)) || null;
// Can this gear be used in this world? (off: no gear at all; gearBan: categories and single gear the maker turned off)
export function gearAllowed(world, id) {
  if (!id || id === 'none' || !world || world.gear === 'off') return false;
  const ban = Array.isArray(world.gearBan) ? world.gearBan : [];
  return !ban.includes(id) && !ban.includes(gearCat(id));
}
export const cleanGearBan = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => GEAR_CATS[x] || GEAR_TIER[x]))].slice(0, 20) : []);
export const SHOP = { color: COLORS, hat: HATS, trail: TRAILS, pet: PETS, gear: GEAR };
export const KINDS = ['hat', 'color', 'trail', 'pet', 'gear'];
export const FREE = [...COLORS, ...HATS, ...TRAILS, ...PETS, ...GEAR].filter((i) => i.price === 0 && !i.need).map((i) => i.id);
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
// Rarity: limited items by how few were made, everything else by price.
export const RARITY = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
export function rarityOf(item) {
  if (item.stock) return item.stock <= 15 ? 4 : item.stock <= 60 ? 3 : 2;
  return item.price >= 2500 ? 3 : item.price >= 700 ? 2 : item.price >= 200 ? 1 : 0;
}
// Normal (not limited) items are only in the shop on some days: the rarer, the less often.
// The same for everyone, and it changes at midnight UTC. Free and earned items are always there.
export const STOCK_CHANCE = [0.85, 0.65, 0.45, 0.25];
export function inStockOn(key, item, date) {
  if (!item || isFree(item) || item.need || item.stock) return true;
  let h = 2166136261;
  for (const ch of key + '|' + date) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  return (h % 1000) < STOCK_CHANCE[Math.min(3, rarityOf(item))] * 1000;
}
export const MAX_BUY = 10; // how many of one item you can buy at once
export const LIMITED = [...COLORS.map((i) => ['color', i]), ...HATS.map((i) => ['hat', i]), ...TRAILS.map((i) => ['trail', i]), ...PETS.map((i) => ['pet', i]), ...GEAR.map((i) => ['gear', i])].filter(([, i]) => i.stock).map(([k, i]) => ({ key: itemKey(k, i.id), stock: i.stock }));

// Player levels: every coin you earn by playing is also 1 XP.
export const xpFor = (lvl) => 20 * (lvl - 1) * (lvl - 1);
// Where XP comes from (Wave 3): playing, not spending. Daily quests and the daily bonus still give XP too.
export const XP = { star: 25, win: 40, place: 20, minute: 1, minutesPerDay: 120 };
// Trophy Road: every step unlocks at a level. Coins are claimed once; items unlock in the Shop (they can't be traded).
export const ROAD = [
  { lv: 2, coins: 100 }, { lv: 3, item: 'color:#1fb5a0' }, { lv: 4, coins: 150 }, { lv: 5, item: 'hat:cap-trophy' },
  { lv: 6, coins: 200 }, { lv: 7, item: 'pet:pup-sky' }, { lv: 8, coins: 250 }, { lv: 10, item: 'hat:party-trophy' },
  { lv: 12, coins: 400 }, { lv: 15, item: 'pet:slime-trophy' }, { lv: 18, coins: 600 }, { lv: 20, item: 'hat:crown-trophy' },
  { lv: 25, coins: 1000 }, { lv: 30, item: 'pet:kitty-champ' }, { lv: 40, coins: 2500 }, { lv: 50, coins: 5000 },
];
export const levelOf = (xp) => Math.floor(Math.sqrt(Math.max(0, xp || 0) / 20)) + 1;
