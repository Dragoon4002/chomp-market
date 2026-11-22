import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Market, UNIT, cost, simulate, sweep } from './market.ts';

test('books balance exactly for every outcome, many random runs', () => {
  for (let run = 1; run <= 40; run++) for (const winner of [0, 1, null] as const) {
    const { audit, market } = simulate({ run, winner, traders: 6 + (run % 5), orders: 30 + run });
    assert.equal(audit.dust, 0n, `run ${run} winner ${winner}`);
    for (const [who] of market.positions) assert.equal(market.due(who), 0n);
  }
});

test('cross at maker price: taker gets price improvement, partial fill rests', () => {
  const m = new Market();
  assert.deepEqual(m.place('a', 1, 4000, 10), { id: 0, filled: 0, cost: cost(4000, 10) }); // a backs side 1 @ 40%
  const r = m.place('b', 0, 7000, 15); // b willing to pay 70% for side 0; a's 40% leaves 60% for b
  assert.deepEqual(r, { id: 1, filled: 10, cost: cost(6000, 10) + cost(7000, 5) });
  assert.deepEqual(m.levels(0), [[7000, 5]]);
  assert.deepEqual(m.levels(1), []);
  assert.equal(m.price, 6000);
  assert.equal(m.collateral, 10n * UNIT);
  assert.deepEqual(m.fills[0], { id: 0, taker: 'b', maker: 'a', side: 0, price_bps: 6000, qty: 10, ms: m.fills[0].ms });
});

test('no cross below 100%; own orders never match', () => {
  const m = new Market();
  m.place('a', 1, 4000, 10);
  assert.equal(m.place('b', 0, 5999, 1).filled, 0);
  assert.equal(m.place('a', 0, 9000, 3).filled, 0); // skips own
  assert.equal(m.place('c', 0, 6000, 2).filled, 2);
});

test('cancel refunds unfilled escrow only; closed book rejects', () => {
  const m = new Market();
  m.place('a', 1, 4000, 10);
  m.place('b', 0, 6000, 4);
  assert.equal(m.cancel('a', 0), cost(4000, 6));
  assert.throws(() => m.cancel('a', 0), /No such order/);
  m.finish(1);
  assert.throws(() => m.cancel('b', 1), /Book closed/);
  assert.throws(() => m.place('b', 0, 5000, 1), /Book closed/);
  const gross = 4n * UNIT;
  assert.equal(m.claim('a'), gross - gross / 1000n);
  assert.throws(() => m.claim('b'), /Nothing to claim/);
});

test('void refunds exactly what was paid plus resting escrow', () => {
  const m = new Market();
  m.place('a', 1, 4000, 10);
  m.place('b', 0, 7000, 15);
  m.finish(null);
  assert.equal(m.claim('a'), cost(4000, 10));
  assert.equal(m.claim('b'), cost(6000, 10) + cost(7000, 5));
  assert.equal(m.audit().dust, 0n);
});

test('guards', () => {
  const m = new Market(10n, UNIT);
  assert.throws(() => m.place('a', 0, 0, 1), /Bad price/);
  assert.throws(() => m.place('a', 0, 10_000, 1), /Bad price/);
  assert.throws(() => m.place('a', 0, 5000, 0), /Bad qty/);
  assert.throws(() => m.place('a', 0, 5000, 3), /Order above maximum/);
});

test('sweep walks asks to spend a budget', () => {
  const book: [[number, number][], [number, number][]] = [[], [[4000, 2], [3000, 5]]]; // side-0 asks: 60% x2, 70% x5
  assert.deepEqual(sweep(book, 0, cost(6000, 2) + cost(7000, 1)), { qty: 3, price: 7000 });
  assert.deepEqual(sweep(book, 0, cost(6000, 1)), { qty: 1, price: 6000 });
  assert.equal(sweep(book, 1, UNIT), null);
});
