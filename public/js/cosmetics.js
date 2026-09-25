// Everything in Pip's Closet. Prices are in coins.
// need: { stars: n } or { ach: 'id' } means it unlocks from progress instead of coins.

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
  { id: '#7ae582', name: 'Glow', price: 120, need: { stars: 15 }, hint: 'Earn 15 stars' },
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
];

export const SHOP = { color: COLORS, hat: HATS, trail: TRAILS };
export const FREE = [...COLORS, ...HATS, ...TRAILS].filter((i) => i.price === 0 && !i.need).map((i) => i.id);
export const itemKey = (kind, id) => kind + ':' + id;
