import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toBase, price, restock, soldSince, targetFor } from './pricing.ts';

const s = { base: 0.05, stock: 6, target: 6, soldLastHour: 0, cash: 2 };

test('price moves with stock and demand, clamped', () => {
  const at = price(s);
  assert.equal(at.ask, 0.06); // MARKUP at target
  assert.ok(price({ ...s, stock: 12 }).ask < at.ask, 'glut → cheaper');
  assert.ok(price({ ...s, stock: 1 }).ask > at.ask, 'scarce → pricier');
  assert.ok(price({ ...s, soldLastHour: 3 }).ask > at.ask, 'demand → pricier');
  assert.equal(price({ ...s, stock: 0, soldLastHour: 99 }).ask, 0.15); // 3× base
  assert.equal(price({ ...s, stock: 100 }).ask, 0.025); // 0.5× base
  assert.equal(price({ ...s, stock: 12 }).bid, undefined); // full shelf: no buybacks
  assert.match(price({ ...s, stock: 12, target: 8, soldLastHour: 3 }).why, /^12 in stock \(target 8\), 3 sold in the last hour → 0\.\d+ SOL; buys back at ≤ 0\.\d+$/);
});

test('broke rule', () => {
  const q = price({ ...s, cash: 0.3 });
  assert.equal(q.open, false);
  assert.equal(q.ask, 0.025);
  assert.equal(q.bid, undefined);
  assert.match(q.why, /Broke/);
  assert.equal(restock({ ...s, stock: 0, cash: 0.3 }), 0);
});

test('restock', () => {
  assert.equal(restock({ ...s, stock: 4 }), 0); // above half target
  assert.equal(restock({ ...s, stock: 2 }), 4);
  assert.equal(restock({ ...s, stock: 0, cash: 1.1 }), 2); // keeps 2× floor
  assert.equal(targetFor(0.25), 3);
});

test('demand from price_history ignores presale mints and old sales', () => {
  const now = 10 * 3_600_000;
  const h: [number, string][] = [[now - 7_200_000, toBase(0.07)], [now - 60_000, toBase(0.05)], [now - 30_000, toBase(0.07)], [now - 1, toBase(0.061)]];
  assert.equal(soldSince(h, 0.05, now), 2);
});
