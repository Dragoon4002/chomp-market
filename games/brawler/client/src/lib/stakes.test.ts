import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPIRE_S, reclaimAt, reclaims, remember, saved } from './stakes.ts';

test('reclaimAt: host open seat now, filled after expiry, else nothing', () => {
  const m = { a: 'A', b: null, stake: 1n, created: 100 };
  assert.equal(reclaimAt(m, 'A'), 0);
  assert.equal(reclaimAt(m, 'B'), null);
  assert.equal(reclaimAt({ ...m, b: 'B' }, 'B'), 100 + EXPIRE_S);
});

test('reclaims drops closed matches, keeps RPC failures (no localStorage -> memory)', async () => {
  remember('t', 1); remember('t', 2); remember('t', 3); remember('t', 1);
  const chain: Record<number, unknown> = { 1: { a: 'A', b: null, stake: 1n, created: 0 }, 2: null };
  const r = await reclaims('t', 'A', async (id) => { if (id === 3) throw new Error('rpc'); return chain[id] as never; });
  assert.deepEqual(r.map((x) => x.id), [1]);
  assert.deepEqual(saved('t').map((e) => e.id).sort(), [1, 3]);
});
