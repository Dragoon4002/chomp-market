import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PRED, Netplay } from './net.ts';
import { newGame, step, hash } from './sim/sim.ts';

// Two peers over a link that drops 30% of packets and delays the rest 0-5 ticks (like an unreliable DataChannel).
test('lockstep survives packet loss, peers stay in sync', () => {
  let seed = 7;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  let now = 0, lag = false;
  const wire: { at: number; to: number; m: object }[] = [];
  const peers = [0, 1].map((seat) => {
    const s = newGame();
    const net = new Netplay((m) => { if (rnd() > 0.3) wire.push({ at: now + Math.floor(rnd() * 6), to: 1 - seat, m: JSON.parse(JSON.stringify(m)) }); }, seat, 3);
    return { s, net };
  });
  for (now = 0; now < 3000; now++) {
    for (let i = wire.length - 1; i >= 0; i--) if (wire[i].at <= now) { peers[wire[i].to].net.onMessage(wire[i].m as any); wire.splice(i, 1); }
    for (const p of peers) { p.net.tick(() => Math.floor(rnd() * 512), (inp) => step(p.s, inp), () => hash(p.s)); lag ||= p.net.lagging; }
  }
  const [a, b] = peers;
  assert.ok(a.net.frame > 1500 && b.net.frame > 1500, `frames ${a.net.frame} ${b.net.frame}`);
  assert.equal(a.net.desync || b.net.desync, false);
  assert.equal(lag, false, 'jitter within the prediction window never shows the banner');
});

// Peer drops mid-fight and comes back as a fresh Netplay resumed at the survivor's confirmed frame (server tape).
test('reconnect: resumed peer continues in sync from the survivor tape', () => {
  let now = 0;
  let wire: { at: number; to: number; m: object }[] = [];
  const tapes: number[][][] = [[], []];
  const peer = (seat: number, start = 0, s = newGame()) => {
    const net = new Netplay((m) => wire.push({ at: now + 2, to: 1 - seat, m: JSON.parse(JSON.stringify(m)) }), seat, 3, start);
    return { s, net, seat };
  };
  const peers = [peer(0), peer(1)];
  let alive = true;
  const run = (ticks: number) => {
    for (const end = now + ticks; now < end; now++) {
      for (let i = wire.length - 1; i >= 0; i--) if (wire[i].at <= now) { const w = wire.splice(i, 1)[0]; if (alive || w.to === 0) peers[w.to].net.onMessage(w.m as any); }
      for (const p of alive ? peers : []) p.net.tick(() => (now * 7 + p.seat * 13) % 512, (inp) => { step(p.s, inp); tapes[p.seat].push(inp); }, () => hash(p.s));
    }
  };
  run(600);
  alive = false; // seat 1 gone (its in-flight packets still land); survivor frozen behind the "reconnecting" banner
  run(60);
  const [a] = peers;
  const f = a.net.frame;
  a.net.resync((m) => wire.push({ at: now + 2, to: 1, m: JSON.parse(JSON.stringify(m)) }));
  wire = wire.filter((w) => w.to === 0);
  const s = newGame();
  tapes[1] = tapes[0].slice();
  for (const inp of tapes[1]) step(s, inp);
  peers[1] = peer(1, f, s);
  alive = true;
  run(1200);
  assert.ok(a.net.frame > f + 1000 && peers[1].net.frame > f + 1000, `frames ${a.net.frame} ${peers[1].net.frame}`);
  assert.equal(a.net.desync || peers[1].net.desync, false);
  const n = Math.min(tapes[0].length, tapes[1].length);
  assert.deepEqual(tapes[1].slice(0, n), tapes[0].slice(0, n));
});

// Peer silent: local sim keeps running on prediction for MAX_PRED frames (no freeze), banner only after a real hold-up.
test('predicts through short gaps, lagging only after a sustained stall', () => {
  const net = new Netplay(() => {}, 0, 2);
  const tick = () => net.tick(() => 0, () => {}, () => 0);
  for (let i = 0; i < 5; i++) tick();
  assert.equal(net.stalled, false, 'prediction covers a short gap');
  assert.equal(net.frame, 2, 'only the prefilled frames are confirmed');
  for (let i = 0; i < 20 && !net.stalled; i++) tick();
  assert.equal(net.head - net.frame, MAX_PRED, 'runs ahead exactly the prediction window');
  assert.equal(net.predicted().length, MAX_PRED);
  assert.equal(net.lagging, false, 'micro-stall must not show the banner');
  net.onMessage({ t: 'in', f: 2, b: [0, 0, 0] });
  tick();
  assert.equal(net.frame, 5);
  assert.equal(net.stallTicks, 0);
  for (let i = 0; i < 40; i++) tick();
  assert.equal(net.lagging, true);
});
