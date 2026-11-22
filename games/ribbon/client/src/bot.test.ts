import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim, input } from './sim.ts';
import { bot } from './bot.ts';

test('bot outlives a rider driving straight into the wall', () => {
  const s = new Sim();
  while (s.rounds === 0 && s.tick < 500) s.step([input(null, false), bot(s, 1)]);
  assert.deepEqual(s.score, [0, 1]);
});

test('bot survives alone for a long stretch', () => {
  const s = new Sim();
  s.riders[0].alive = false; // ponytail: dead seat 0 just sits; bot must avoid its own fading trail + ring
  let t = 0;
  while (s.riders[1].alive && t++ < 600) s.step([7, bot(s, 1)]);
  assert.ok(t > 400, `bot died at ${t}`);
});
