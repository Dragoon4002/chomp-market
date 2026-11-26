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
import { newStats, advance, act, evolve, ready, bonus, level, breed, MAX_CATCHUP } from './sim.js';

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
  s.xp = 16; assert.deepEqual([ready(s), evolve(s)], [96, 'NotReady']); // +20% aura
  s.xp = 20; s.full = 10; assert.equal(evolve(s), 'Sick');
  s.full = 80; assert.equal(evolve(s), null); assert.equal(s.tier, 1);
  s.xp = 1000; evolve(s); evolve(s); assert.equal(evolve(s), 'MaxTier');
}
{ // growth_and_new_actions in sim.rs
  const s = newStats(0xA1B2C3D4);
  assert.deepEqual([s.str, s.int, s.kind], [20, 24, 2]);
  assert.equal(act(s, 'feed', 0, 1), null); assert.equal(act(s, 'play', 7, 1), null);
  assert.equal(act(s, 'train'), null); assert.equal(act(s, 'interact'), null);
  assert.equal(act(s, 'interact'), 'Cooldown');
  advance(s, 5); assert.equal(act(s, 'interact'), null);
  assert.equal(act(s, 'habitat', 3), 'BadAction'); assert.equal(act(s, 'habitat', 1), null);
  assert.equal(act(s, 'clean', 0, 1), null);
  assert.deepEqual([s.full, s.joy, s.energy, s.hygiene, s.health], [90, 100, 50, 100, 100]);
  assert.deepEqual([s.xp, s.age, s.str, s.int, s.habitat, s.calm_until], [13, 5, 22, 26, 1, 10]);
  assert.deepEqual([ready(s), bonus(s), level(s)], [94, 45, 2]);
  assert.equal(evolve(s), 'NotReady');
}
{ // breed: deterministic, genes come from the parents
  const x = breed(0xA1B2C3D4, 0x01020304, 42), y = breed(0xA1B2C3D4, 0x01020304, 42);
  assert.deepEqual(x, y);
  for (let k = 1; k < 30; k++) { const z = breed(0xA1B2C3D4, 0xA1B2C3D4, k); if (z.mutated === null) assert.equal(z.dna, 0xA1B2C3D4, 'same parents, no mutation -> same DNA'); }
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:3311/?seed=7' });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = async (expr) => evalJs(`(() => { const S = window.petden.chain.st, P = S.pets[S.sel], s = P && P.stats; return ${expr}; })()`);
  const click = async (sel) => { const ok = await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b || b.disabled) return false; b.click(); return true; })()`); assert.ok(ok, `clickable: ${sel}`); await wait(120); };
  let up;
  for (let i = 0; i < 50 && !up; i++) { await wait(100); up = await evalJs('!!window.petden?.chain?.st?.pets?.length'); }
  assert.ok(up, 'pet hatched');
  await S('(S.inv.treat = 0, S.inv.soap = 0, S.inv.toy = 0, s.full = 80, s.hygiene = 80, s.joy = 50, 1)'); // plain actions first
  // dock: every action
  await click('[data-act=clean]'); assert.equal(await S('s.hygiene'), 100);
  await click('[data-act=feed]'); assert.deepEqual(await S('[s.full, s.hygiene]'), [100, 95]);
  const str = await S('s.str'); await click('[data-act=train]'); assert.equal(await S('s.str'), str + 2, 'train +2 str');
  const joy = await S('s.joy'); await click('[data-act=interact]'); assert.equal(await S('s.joy'), joy + 10, 'interact +10 joy');
  await click('[data-act=play]'); // candy game
  for (let i = 0; i < 10; i++) await evalJs(`document.getElementById('ball').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))`);
  await wait(200); assert.equal(await S('S.n.play'), 1, 'candy game played');
  await click('[data-act=sleep]'); assert.equal(await S('s.asleep'), true);
  await click('[data-act=sleep]'); assert.equal(await S('s.asleep'), false);
  // habitat gear, rename
  await click('#hgear'); assert.equal(await S('s.habitat'), 1);
  await click('#rename'); await evalJs(`(() => { const i = document.querySelector('#name input'); i.value = 'Quavel'; i.dispatchEvent(new Event('blur')); })()`); await wait(100);
  assert.equal(await S('P.name'), 'Quavel');
  // evolve (commit to chain)
  await S('(s.xp = 20, 1)'); await click('#evolve'); assert.equal(await S('s.tier'), 1, 'evolved');
  // every tab opens with content
  for (const t of ['pets', 'breed', 'city', 'board', 'inv', 'shop', 'quests', 'games', 'ach']) {
    await click(`[data-tab=${t}]`);
    assert.ok(await evalJs(`document.getElementById('sheet').classList.contains('on') && document.getElementById('sbody').children.length > 0`), `tab ${t}`);
  }
  // shop: buy a treat
  await click('[data-tab=shop]'); const coins = await S('S.coins'); await click('[data-buy=treat]');
  assert.deepEqual(await S('[S.coins, S.inv.treat]'), [coins - 20, 1]);
  // roster: hatch the egg, buy another
  await click('[data-hatch="0"]'); assert.equal(await S('S.pets.length'), 2, 'hatched');
  await S('(S.coins += 200, 1)'); await click('#addegg'); assert.equal(await S('S.eggs.length'), 1, 'bought egg');
  // breeding: make both Adult, breed -> egg
  await S('(S.pets.forEach((p) => (p.stats.tier = 2)), 1)');
  await click('[data-tab=breed]'); await click('#dobreed'); assert.equal(await S('[S.eggs.length, S.n.breed]').then(String), '2,1', 'bred');
  // city: send the selected pet on the courier job
  await click('[data-tab=city]'); await click('[data-job="0"]'); assert.ok(await S('!!P.job'), 'job started');
  // mini games hub: reaction rush with pet 0 (pet 1 is working)
  await S('(S.sel = 0, 1)'); await click('[data-tab=games]'); await click('[data-game=react]');
  for (let i = 0; i < 5; i++) { await evalJs(`document.getElementById('react').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))`); await wait(30); }
  await wait(200); assert.equal(await S('S.n.games'), 2, 'reaction game played');
  // quests + achievements: claim whatever is claimable
  await S('(S.n.feed += 3, S.n.train += 2, S.n.win += 1, S.n.play += 3, S.n.job += 1, S.n.hatch += 1, 1)');
  await click('[data-tab=quests]'); const g0 = await S('S.coins + S.gems'); await click('[data-quest="0"]'); assert.ok((await S('S.coins + S.gems')) > g0, 'quest claimed');
  await click('[data-tab=ach]'); await click('[data-ach=evolve]'); assert.ok(await S('S.ach.includes("evolve")'), 'achievement claimed');
  await click('[data-tab=board]'); assert.ok(await evalJs(`document.querySelectorAll('#sbody tr.you').length >= 2`), 'leaderboard has my pets');
  await click('#sclose');
  const real = errors;
  assert.deepEqual(real, [], 'no console errors');
  console.log(`PASS page: 6 dock actions, 9 tabs, shop/hatch/breed/job/games/quest/achievement/evolve/rename, no console errors`);
  ws.close();
} finally {
  try { process.kill(-chrome.pid); } catch { /* gone */ } server.close();
  setTimeout(() => rmSync(profile, { recursive: true, force: true }), 300);
}
