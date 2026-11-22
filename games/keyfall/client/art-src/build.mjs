// Rasterize art-src/*.svg -> public/art/*.png (4x of orig/), copy hud/*.svg -> public/svg/. Run from repo root: node games/keyfall/client/art-src/build.mjs
import { createRequire } from 'module';
import fs from 'fs';
import { fileURLToPath } from 'url';
const here = fileURLToPath(new URL('.', import.meta.url));
const sharp = createRequire(here + '../../../../package.json')('sharp'); // repo-root dep, no new package
const art = here + '../public/art/';
for (const f of fs.readdirSync(here).filter((f) => f.endsWith('.svg'))) {
  const n = f.slice(0, -4);
  const o = await sharp(art + 'orig/' + n + '.png').metadata();
  let img = sharp(here + f);
  const m = await img.metadata();
  if (m.width !== o.width * 4 || m.height !== o.height * 4) throw new Error(`${n}: ${m.width}x${m.height} != 4x ${o.width}x${o.height}`);
  if (n === 'sky' || n === 'sand') img = img.flatten();
  await img.png().toFile(art + n + '.png');
}
for (const f of fs.readdirSync(here + 'hud')) fs.copyFileSync(here + 'hud/' + f, here + '../public/svg/' + f);
console.log('ok');
