import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IN, newGame } from '../games/brawler/client/src/lib/sim/sim.ts';
import { bot, isBot } from '../games/brawler/client/src/lib/bot.ts';
import { pilot, template, type View } from './brain.ts';

test('isBot', () => {
  assert.ok(isBot('bot-1.brawler'));
  for (const a of ['', undefined, 'ana.testnet', 'bot-1.brawler.testnet', 'robot-1.brawler']) assert.ok(!isBot(a), String(a));
});

test('difficulty knob', () => {
  const s = newGame(undefined, 'ember');
  s.fighters[1].x = s.fighters[0].x + 50; s.frame = 0; // in range, attack frame
  const raw = bot(s, 0);
  assert.ok(raw & (IN.LIGHT | IN.HEAVY));
  assert.equal(pilot('hard', () => 0.5)(s, 0), raw); // instant, no misses
  const easy = pilot('easy', () => 0); // rand 0: always miss attacks + flip
  const outs = Array.from({ length: 16 }, () => easy(s, 0));
  assert.deepEqual(outs.slice(0, 15), Array(15).fill(0)); // 15 frames reaction lag
  assert.equal(outs[15] & (IN.LIGHT | IN.HEAVY), 0);
  assert.equal(pilot('nope' as any, () => 1)(s, 0), 0); // unknown level -> medium (6f lag)
});

test('templates', () => {
  const v: View = { fighters: [{ name: 'Ash', stocks: 2, damage: 0 }, { name: 'Bo', stocks: 1, damage: 120 }], secs: 30 };
  assert.match(template({ kind: 'ko', who: 1, v }), /Bo goes DOWN.*1 stock left/);
  assert.match(template({ kind: 'over', who: 0, v, winner: 0 }), /Ash takes it/);
});
