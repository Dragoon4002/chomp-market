import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { commitOf, flip } from './flip.ts';

const seed = new Uint8Array(32).fill(1);

test('commit = sha256(seed)', async () => {
  assert.equal(await commitOf(seed), createHash('sha256').update(seed).digest('hex'));
});

test('result = sha256(seed ‖ clientSeed)[0] & 1', async () => {
  const want = createHash('sha256').update(seed).update('abc').digest()[0] & 1;
  assert.equal(await flip(seed, 'abc'), want);
});
