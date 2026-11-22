import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardId, recoverEd25519, validSignRequest } from './fastauth.ts';

const b64 = (o: unknown) => btoa(JSON.stringify(o));

test('recoverEd25519: raw array and big_r/s forms', () => {
  const raw = Array.from({ length: 64 }, (_, i) => i);
  assert.deepEqual([...recoverEd25519(b64({ signature: raw }))], raw);
  const r = '02' + 'aa'.repeat(32), s = 'bb'.repeat(31); // 33-byte R, short S gets left-padded
  const sig = recoverEd25519(b64({ big_r: { affine_point: r }, s: { scalar: s } }));
  assert.equal(sig.length, 64);
  assert.ok(sig.subarray(0, 32).every((x) => x === 0xaa));
  assert.equal(sig[32], 0);
  assert.ok(sig.subarray(33).every((x) => x === 0xbb));
  assert.throws(() => recoverEd25519(b64(null)));
});

test('validSignRequest', () => {
  const ok = { guardId: guardId(), verifyPayload: 'jwt', signPayload: [1, 2, 255] };
  assert.ok(validSignRequest(ok));
  assert.ok(!validSignRequest({ ...ok, guardId: 'jwt#https://evil/' }));
  assert.ok(!validSignRequest({ ...ok, signPayload: [256] }));
  assert.ok(!validSignRequest({ ...ok, verifyPayload: 'x'.repeat(9000) }));
  assert.ok(!validSignRequest(null));
});
