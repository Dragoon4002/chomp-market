// node games/sealed-house/build/smoke.mjs
// 1) logic: splitmix + contents parity with program/src/logic.rs, tie rules, payouts.
// 2) page: serves build/ on :3312 inside a fake portal host, plays a session headless
//    (lot 1 bid all-in + sell back, then pass), checks SDK events and no console errors.
// Needs playwright (PW=<path to playwright module> to override) and Chrome at /usr/bin/google-chrome.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rng, contents, winner, split, buyback, resolveLot, baseSeed, value, EMPTY } from './game.js';

// ---- 1. logic ----
assert.equal(new Rng(0).next(), 0xe220a8397b1dcdafn, 'splitmix64 reference vector');
const c = contents(42n); // same vector as logic.rs contents_parity_with_js
assert.deepEqual([c.n, c.weight, c.glow, c.items], [6, 228, 2, [0x00, 0x00, 0x21, 0x01, 0x02, 0x31, EMPTY]]);
assert.equal(winner([{ key: 'a', amount: 0 }], 1n), -1, 'zero bids never win');
const t1 = [{ key: 'a0', amount: 9 }, { key: 'b1', amount: 9 }, { key: 'b2', amount: 3 }];
const seen = new Set();
for (let s = 0n; s < 64n; s++) {
  const w = winner(t1, s);
  assert.equal(t1[w].key, [...t1].reverse()[winner([...t1].reverse(), s)].key, 'tie result independent of order');
  seen.add(w);
}
assert.deepEqual([...seen].sort(), [0, 1], 'both tied bidders can win');
assert.deepEqual(split(1000), [950, 50]);
assert.equal(buyback([0x00, 0x20, 0x40, EMPTY, EMPTY, EMPTY, EMPTY], 0b111), 1440);
assert.deepEqual(resolveLot(baseSeed('x'), 2, 77), resolveLot(baseSeed('x'), 2, 77), 'deterministic');
console.log('PASS logic');

// ---- 2. page ----
const root = fileURLToPath(new URL('.', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const SEED = 'smoke-7';
const HOST = `<!doctype html><link rel="icon" href="data:,"><body style="margin:0"><iframe id="f" src="/index.html?fast" style="width:390px;height:800px;border:0"></iframe><script>
window.events = [];
addEventListener('message', (e) => {
  if (e.data?.chomp !== 1) return;
  events.push(e.data);
  if (e.data.type === 'ready') f.contentWindow.postMessage({ chomp: 1, type: 'session', data: { wallet: 'mock', mode: 'free', stake: 0, seed: '${SEED}' } }, '*');
});</script></body>`;
const server = http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (p === '/host.html') return res.writeHead(200, { 'content-type': 'text/html' }).end(HOST);
  try {
    const f = normalize(join(root, p === '/' ? 'index.html' : p));
    if (!f.startsWith(root)) throw 0;
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(3312);

const pw = await import(process.env.PW ?? 'playwright').catch(() => import('playwright-core'));
const browser = await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => errors.push('failed ' + r.url()));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto('http://localhost:3312/host.html');
  const fr = page.frameLocator('#f');
  await fr.locator('#startBtn:enabled').click();
  // lot 1: all-in, sell everything
  await fr.locator('#num').fill('1000');
  await fr.locator('#sealBtn').click();
  await fr.locator('#nextBtn:enabled').click();
  for (let i = 1; i < 5; i++) { await fr.locator('#passBtn:enabled').click(); await fr.locator('#nextBtn:enabled').click(); }
  await fr.locator('#final:not([hidden])').waitFor();
  await page.waitForFunction(() => window.events.some((e) => e.type === 'match:result'));
  const events = await page.evaluate(() => window.events);
  const types = events.map((e) => e.type);
  assert.deepEqual(types, ['ready', 'match:start', 'match:result'], 'sdk event order');
  const res = events[2].data;
  // expected: replay the same session in node
  const r = resolveLot(baseSeed(SEED), 0, 1000);
  const want = 1000 - (r.w === 0 ? r.price - buyback(r.lot.items, (1 << r.lot.n) - 1) : 0);
  assert.equal(res.score, want, 'score matches node replay');
  assert.match(res.tapeHash, /^[0-9a-f]{16}$/);
  const listed = r.lot.items.reduce((s, it) => s + value(it), 0);
  assert.deepEqual(errors, [], 'no console errors');
  console.log(`PASS page: lot1 ${r.w === 0 ? 'won' : 'lost'} at ${r.price} (listed ${listed}), score ${res.score}, tape ${res.tapeHash}`);
} finally {
  await browser.close();
  server.close();
}
