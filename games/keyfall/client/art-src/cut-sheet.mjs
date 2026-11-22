// Cut Keyfall sprites out of the user's asset sheet (black bg) into transparent PNGs sized for the renderer (ART_X = 8).
// node cut.mjs <sheet.png> <origArtDir> <outArtDir> <outLogoPath>
// Run from games/keyfall: node client/art-src/cut-sheet.mjs "reference/KEYFALL Game Asset Collection.png" client/public/art/orig client/public/art client/public/art/logo.png
import sharp from 'sharp';
const [SHEET, ORIG, OUT, LOGO] = process.argv.slice(2);
const X = 8; // renderer ART_X: image px = original px * 8

// [name, x0, x1, y0, y1, mode, size] mode: 'fill' = flood-fill black bg, 'lum' = brightness -> alpha (glows)
// size: ['w', px] fit width, ['h', px] fit height, 'native' keep
const CUTS = [
  ['city', 12, 1524, 200, 344, 'fill', 'native'],
  ['turret_base', 24, 246, 354, 492, 'fill', ['w', 24 * X]],
  ['turret_gun', 276, 498, 396, 456, 'fill', ['w', 23 * X]],
  ['bomber', 522, 870, 372, 480, 'fill', ['w', 30 * X]],
  ['chopper_a', 888, 1194, 366, 486, 'fill', ['w', 31 * X]],
  ['chopper_b', 1206, 1512, 360, 486, 'fill', ['w', 31 * X]],
  ['bomb', 42, 174, 504, 672, 'fill', ['h', 32 * X]],
  ['fireball', 234, 408, 522, 648, 'fill', ['w', 16 * X]],
  ['balloon', 468, 600, 498, 666, 'fill', ['h', 31 * X]],
  ['explosion_0', 792, 912, 540, 642, 'fill', 'exp'],
  ['explosion_1', 930, 1068, 522, 648, 'fill', 'exp'],
  ['explosion_2', 1088, 1226, 522, 648, 'fill', 'exp'],
  ['explosion_3', 1248, 1368, 534, 636, 'fill', 'exp'],
  ['smoke', 30, 174, 684, 810, 'fill', ['w', 32 * X]],
  ['cloud_0', 216, 510, 690, 786, 'fill', ['w', 28 * X]],
  ['cloud_1', 540, 774, 684, 798, 'fill', ['w', 27 * X]],
  ['cloud_2', 798, 1116, 702, 774, 'fill', ['w', 29 * X]],
  ['sun', 1152, 1320, 672, 822, 'lum', ['w', 48 * X]],
  ['moon', 1362, 1488, 684, 810, 'fill', ['w', 24 * X]],
  ['crosshair', 60, 234, 828, 996, 'lum', ['w', 96 * X]],
  ['logo', 354, 1362, 828, 1002, 'fill', 'native'],
];

const sheet = await sharp(SHEET).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const SW = sheet.info.width;

function cut([name, x0, x1, y0, y1, mode]) {
  const w = x1 - x0, h = y1 - y0, px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((y + y0) * SW + x + x0) * 3, d = (y * w + x) * 4;
    px[d] = sheet.data[s]; px[d + 1] = sheet.data[s + 1]; px[d + 2] = sheet.data[s + 2]; px[d + 3] = 255;
  }
  const mx = (i) => Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
  if (mode === 'lum') {
    for (let i = 0; i < w * h; i++) {
      const a = mx(i);
      if (a < 6) { px[i * 4 + 3] = 0; continue; }
      for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.min(255, (px[i * 4 + c] * 255) / a);
      px[i * 4 + 3] = a;
    }
  } else {
    // flood fill near-black from the crop border (8-connected), so dark outlines inside sprites survive
    const T = 34, bg = new Uint8Array(w * h), st = [];
    const push = (i) => { if (!bg[i] && mx(i) < T) { bg[i] = 1; st.push(i); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (st.length) {
      const i = st.pop(), x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) push(ny * w + nx);
      }
    }
    // enclosed black holes (e.g. under the parachute): dark components not touching the border with a thick core
    const seen = new Uint8Array(w * h), dark = (i) => mx(i) < T;
    const core = (i) => { const x = i % w, y = (i / w) | 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h || !dark(ny * w + nx)) return false; } return true; };
    for (let s0 = 0; s0 < w * h; s0++) {
      if (bg[s0] || seen[s0] || !dark(s0)) continue;
      const comp = [s0], q = [s0]; seen[s0] = 1; let cores = 0;
      while (q.length) {
        const i = q.pop(), x = i % w, y = (i / w) | 0; if (core(i)) cores++;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, k = ny * w + nx;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[k] && !bg[k] && dark(k)) { seen[k] = 1; q.push(k); comp.push(k); }
        }
      }
      if (cores >= 12) for (const i of comp) if (mx(i) < 22) bg[i] = 1;
    }
    for (let i = 0; i < w * h; i++) {
      if (bg[i]) { px[i * 4 + 3] = 0; continue; }
      // soften the 1px rim next to background: alpha from brightness, keeps anti-aliasing
      const x = i % w, y = (i / w) | 0;
      const rim = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w]);
      if (rim) px[i * 4 + 3] = Math.min(255, mx(i) * 4);
    }
  }
  // trim to alpha bbox
  let a0 = w, a1 = -1, b0 = h, b1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 8) {
    a0 = Math.min(a0, x); a1 = Math.max(a1, x); b0 = Math.min(b0, y); b1 = Math.max(b1, y);
  }
  const tw = a1 - a0 + 1, th = b1 - b0 + 1, t = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y++) Buffer.from(px.buffer, ((y + b0) * w + a0) * 4, tw * 4).copy(t, y * tw * 4);
  return { name, buf: t, w: tw, h: th };
}

const img = (c) => sharp(c.buf, { raw: { width: c.w, height: c.h, channels: 4 } });
const cuts = CUTS.map((c) => ({ ...cut(c), size: c[6] }));
const expMax = Math.max(...cuts.filter((c) => c.size === 'exp').map((c) => c.w));
for (const c of cuts) {
  let s = img(c);
  if (c.size === 'exp') s = s.resize({ width: Math.round((c.w * 23 * X) / expMax), kernel: 'lanczos3' });
  else if (c.size !== 'native') s = s.resize(c.size[0] === 'w' ? { width: c.size[1], kernel: 'lanczos3' } : { height: c.size[1], kernel: 'lanczos3' });
  const dest = c.name === 'logo' ? LOGO : `${OUT}/${c.name}.png`;
  const r = await s.png().toFile(dest);
  console.log(c.name.padEnd(12), `${c.w}x${c.h} -> ${r.width}x${r.height}`);
}
// chopper anim is 3 frames: A B A, padded to one canvas (bottom-aligned on the skids) so the body doesn't jump
const ca = await sharp(`${OUT}/chopper_a.png`).metadata(), cb = await sharp(`${OUT}/chopper_b.png`).metadata();
const CHH = Math.max(ca.height, cb.height), pad = (m) => ({ top: CHH - m.height, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } });
for (const [n, f, m] of [['chopper_0', 'chopper_a', ca], ['chopper_1', 'chopper_b', cb], ['chopper_2', 'chopper_a', ca]]) await sharp(`${OUT}/${f}.png`).extend(pad(m)).toFile(`${OUT}/${n}.png`);
await sharp(`${OUT}/cloud_0.png`).flop().toFile(`${OUT}/cloud_3.png`);
// backdrop from the original pixel art, nearest-neighbour upscale (crisp)
for (const n of ['sky', 'bg_mountains', 'bg_dunes', 'rock_0', 'rock_1', 'rock_2', 'sand']) {
  const m = await sharp(`${ORIG}/${n}.png`).metadata();
  await sharp(`${ORIG}/${n}.png`).resize({ width: m.width * X, kernel: 'nearest' }).png().toFile(`${OUT}/${n}.png`);
  console.log(n.padEnd(12), `orig ${m.width}x${m.height} x${X}`);
}
