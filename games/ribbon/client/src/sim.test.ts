import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim, input, FADE } from './sim.ts';

const N = input(null, false);
const run = (s: Sim, n: number, ins = [N, N]) => { for (let i = 0; i < n; i++) s.step(ins); };

test('wall crash scores other seat', () => {
  const t = new Sim();
  run(t, 16, [input(0, false), N]); // up from y=16 hits wall at tick 17
  assert.equal(t.riders[0].alive, true);
  t.step([N, N]);
  assert.equal(t.riders[0].alive, false);
  assert.deepEqual(t.score, [0, 1]);
  assert.equal(t.rounds, 1);
});

test('no 180 reversal', () => {
  const s = new Sim();
  s.step([input(3, false), input(1, false)]);
  assert.equal(s.riders[0].dir, 1);
  assert.equal(s.riders[1].dir, 3);
  assert.equal(s.riders[0].x, 9);
});

test('head-on draw', () => {
  const s = new Sim();
  s.riders[1].y = 16; s.riders[1].x = 10; // seat0 at 8 → 9, seat1 at 10 → 9
  s.step([N, N]);
  assert.deepEqual(s.riders.map((r) => r.alive), [false, false]);
  assert.deepEqual(s.score, [0, 0]);
  assert.equal(s.rounds, 1);
});

test('boost moves 2 and is one-shot', () => {
  const s = new Sim();
  s.step([input(null, true), N]);
  assert.equal(s.riders[0].x, 10);
  assert.equal(s.cell(8, 16), 1);
  assert.equal(s.cell(9, 16), 1);
  run(s, 14);
  assert.equal(s.riders[0].x, 8 + 30);
  s.step([input(null, true), N]);
  assert.equal(s.riders[0].x, 39);
});

test('fade frees cell after FADE', () => {
  const s = new Sim();
  s.step([N, N]); // lays (8,16) at tick 1, expires 1+FADE
  s.tick = FADE - 1; // skip ahead
  assert.equal(s.cell(8, 16), 1);
  Object.assign(s.riders[0], { x: 8, y: 15, dir: 2 });
  s.step([N, N]); // tick FADE: still solid → crash
  assert.equal(s.riders[0].alive, false);
  const t = new Sim();
  t.step([N, N]);
  t.tick = FADE;
  Object.assign(t.riders[0], { x: 8, y: 15, dir: 2 });
  t.step([N, N]); // tick FADE+1: freed → drives through
  assert.equal(t.riders[0].alive, true);
  assert.equal(t.cell(8, 16), 0);
});

test('match ends at 2 wins', () => {
  const s = new Sim();
  while (!s.done && s.tick < 1000) s.step([input(0, false), N]); // seat0 suicides into top wall every round
  assert.equal(s.done, true);
  assert.equal(s.winner, 1);
  assert.deepEqual(s.score, [0, 2]);
  const r = s.rounds;
  s.step([N, N]);
  assert.equal(s.rounds, r); // frozen after done
});
