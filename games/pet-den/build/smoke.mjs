// node games/pet-den/build/smoke.mjs : sim parity vectors (same as program/src/sim.rs tests) + headless page check.
// Headless part: serves build/ on :3311, launches its own /usr/bin/google-chrome and drives it over CDP (Node built-in WebSocket, no deps).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newStats, advance, act, evolve, MAX_CATCHUP } from './sim.js';

// ---- sim: mirrors sim.rs tests ----
{
  const s = advance(newStats(), 10);
  assert.deepEqual([s.full, s.joy, s.energy, s.hygiene, s.age, s.xp, s.streak, s.health], [70, 70, 70, 70, 10, 10, 10, 100]);
  advance(s, MAX_CATCHUP);
  assert.equal(s.alive, false); assert.equal(s.health, 0); assert.equal(s.best_streak, 30);
  assert.equal(act(s, 'feed'), 'Dead');
}
{
  const s = newStats();
  act(s, 'feed'); assert.deepEqual([s.full, s.hygiene], [100, 75]);
  act(s, 'feed'); assert.equal(s.joy, 70);
  act(s, 'clean'); assert.equal(s.hygiene, 100);
  act(s, 'play', 99); assert.deepEqual([s.energy, s.joy, s.xp], [70, 100, 10]);
  s.energy = 5; assert.equal(act(s, 'play', 3), 'Tired');
  act(s, 'sleep'); assert.equal(act(s, 'feed'), 'Asleep');
  advance(s, 32); assert.equal(s.asleep, false); assert.equal(s.energy, 100);
}
{
  const s = newStats();
  assert.equal(evolve(s), 'NotReady');
  s.xp = 20; s.full = 10; assert.equal(evolve(s), 'Sick');
  s.full = 80; assert.equal(evolve(s), null); assert.equal(s.tier, 1);
  s.xp = 1000; evolve(s); evolve(s); assert.equal(evolve(s), 'MaxTier');
}
console.log('PASS sim parity');

// ---- headless page ----
const root = dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname;
    const body = await readFile(join(root, p === '/' ? 'index.html' : p.slice(1)));
    res.writeHead(200, { 'content-type': TYPES[extname(p || '.html')] || 'text/html' }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(3311);

const profile = mkdtempSync(join(tmpdir(), 'petden-'));
const chrome = spawn('/usr/bin/google-chrome', ['--headless=new', '--remote-debugging-port=0', '--no-first-run', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: true });
const errors = [];
try {
  let tabs;
  // port 0 + DevToolsActivePort: our own Chrome, never another process's debug port
  for (let i = 0; i < 100 && !tabs; i++) {
    try { const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); }
    catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = {};
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id) pending[m.id]?.(m);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
  };
  const send = (method, params = {}) => new Promise((r) => { pending[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 780, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:3311/?seed=7' });
  let before;
  for (let i = 0; i < 50 && !before; i++) { await new Promise((r) => setTimeout(r, 100)); before = await evalJs('window.petden?.chain?.pet && JSON.stringify(window.petden.chain.pet.stats)'); }
  assert.ok(before, 'pet hatched');
  before = JSON.parse(before);
  await evalJs(`document.querySelector('[data-act=clean]').click()`); // hygiene 80 -> 100
  await evalJs(`document.querySelector('[data-act=feed]').click()`);
  await new Promise((r) => setTimeout(r, 300));
  const after = JSON.parse(await evalJs('JSON.stringify(window.petden.chain.pet.stats)'));
  assert.ok(after.full > before.full, `feed raised food ${before.full} -> ${after.full}`);
  assert.equal(after.hygiene, 95, 'clean then feed -> 95');
  const ui = await evalJs(`[document.getElementById('name').textContent, document.getElementById('pet').naturalWidth, document.querySelectorAll('.bar').length]`);
  assert.ok(ui[1] > 0, 'pet art loaded'); assert.equal(ui[2], 6, 'six bars');
  assert.deepEqual(errors, [], 'no console errors');
  console.log(`PASS page: ${ui[0]} food ${before.full}->${after.full}, hygiene ${before.hygiene}->${after.hygiene}, no console errors`);
  ws.close();
} finally {
  try { process.kill(-chrome.pid); } catch { /* gone */ } server.close();
  setTimeout(() => rmSync(profile, { recursive: true, force: true }), 300);
}
