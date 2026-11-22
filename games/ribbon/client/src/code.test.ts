import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromCode, toCode } from './code.ts';

test('room code round-trips and rejects junk', () => {
  for (let id = 0; id < 331776; id += 97) assert.equal(fromCode(toCode(id)), id);
  assert.match(toCode(12), /^[A-HJ-NP-Z]{4}$/);
  assert.notEqual(toCode(12).slice(0, 3), toCode(13).slice(0, 3)); // neighbours don't share a prefix
  assert.equal(fromCode(toCode(42).toLowerCase()), 42);
  for (const bad of ['', 'ABC', 'ABCDE', 'AB1D', 'ABIO']) assert.equal(fromCode(bad), null);
});
