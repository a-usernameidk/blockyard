// Little helpers for building Blockyard's own Engine v2 games in code (Rusty Road, Greyscale, Reel Rivals,
// Crown Chaos). Everything is made the same way every time, so the server builds the exact same world.
export function kit(seed = 1) {
  const parts = [];
  const r3 = (v) => Math.round(v * 1000) / 1000;
  // add(shape, [x, y, z] middle, [sx, sy, sz] size, color, material, extra)
  const add = (s, p, z, c, m = 'plastic', extra = {}) => {
    const q = { s, p: p.map(r3), z: z.map(r3), r: (extra.r || [0, 0, 0]).map(r3), c, m, ...extra };
    q.r = (extra.r || [0, 0, 0]).map(r3);
    parts.push(q); return q;
  };
  const shape = (s) => (x, y, z, sx, sy, sz, c, m, extra) => add(s, [x, y, z], [sx, sy, sz], c, m, extra);
  // a seeded "random" so scenery lands in the same spots every time
  let st = seed >>> 0;
  const rnd = (a = 1, b) => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; const f = st / 4294967296; return b === undefined ? f * a : a + f * (b - a); };
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  return { parts, add, box: shape('box'), cyl: shape('cyl'), ball: (x, y, z, d, c, m, extra) => add('ball', [x, y, z], [d, d, d], c, m, extra), wedge: shape('wedge'), cone: shape('cone'), pyramid: shape('pyramid'), half: shape('halfcyl'), corner: shape('corner'), rnd, pick };
}
