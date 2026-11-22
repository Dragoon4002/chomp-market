import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortTokens, toBase, type Token } from './intents.ts';

test('toBase converts decimals to base units', () => {
  assert.equal(toBase('10', 6), '10000000');
  assert.equal(toBase('0.001', 8), '100000');
  assert.equal(toBase('.5', 18), '500000000000000000');
  assert.equal(toBase('1.1234567', 6), '1123456');
  for (const bad of ['', '.', 'abc', '-1', '1e3']) assert.throws(() => toBase(bad, 6));
});

test('sortTokens puts shortlist first and drops NEAR-chain assets', () => {
  const t = (blockchain: string, symbol: string) => ({ assetId: `${blockchain}:${symbol}`, decimals: 6, blockchain, symbol, price: 1 }) as Token;
  const out = sortTokens([t('near', 'wNEAR'), t('tron', 'USDT'), t('bsc', 'BNB(DEPRECATED)'), t('btc', 'BTC'), t('base', 'USDC')]);
  assert.deepEqual(out.map((x) => x.assetId), ['base:USDC', 'btc:BTC', 'tron:USDT']);
});
