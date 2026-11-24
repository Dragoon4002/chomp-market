// Card portraits from brawler head cutouts -> neutral-grey 128px squares (card.<key>.png). Needs google-chrome (headless canvas, no deps).
// Run: node bake.mjs && node gen.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const CHARS = '../../../brawler/client/public/chars';
const PICK = { cannon: 'lortor', rapid: 'makvel', sniper: 'grodrasu', bulwark: 'torfen', grunt: 'bramdra' }; // hammer, slim, visor, ram, plain
const srcs = Object.fromEntries(Object.entries(PICK).map(([k, h]) => [k, 'data:image/png;base64,' + readFileSync(`${CHARS}/${h}/cutout/head.png`).toString('base64')]));
const html = `<pre id=o></pre><script>
const S = ${JSON.stringify(srcs)}, out = {};
Promise.all(Object.entries(S).map(([k, s]) => new Promise((ok) => { const im = new Image(); im.onload = () => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const z = 120 / Math.max(im.width, im.height); g.drawImage(im, 64 - im.width * z / 2, 64 - im.height * z / 2, im.width * z, im.height * z);
  const d = g.getImageData(0, 0, 128, 128), p = d.data; let sum = 0, n = 0;
  for (let i = 0; i < p.length; i += 4) if (p[i + 3] > 128) { sum += 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]; n++; }
  const gain = 150 / (sum / n); // centre mean luminance on ~#969696 for the runtime tint
  for (let i = 0; i < p.length; i += 4) { const l = Math.min(255, (0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]) * gain); p[i] = p[i + 1] = p[i + 2] = l; }
  g.putImageData(d, 0, 0); out[k] = c.toDataURL(); ok(); }; im.src = s; })))
  .then(() => { document.getElementById('o').textContent = JSON.stringify(out); });
</script>`;
const f = mkdtempSync(tmpdir() + '/bake') + '/b.html';
writeFileSync(f, html);
const dom = execFileSync('google-chrome', ['--headless', '--disable-gpu', '--virtual-time-budget=5000', '--dump-dom', 'file://' + f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const out = JSON.parse(dom.match(/<pre id="o">(.*)<\/pre>/s)[1].replace(/&quot;/g, '"'));
for (const [k, u] of Object.entries(out)) writeFileSync(`card.${k}.png`, Buffer.from(u.split(',')[1], 'base64'));
console.log('baked', Object.keys(out).join(' '));
