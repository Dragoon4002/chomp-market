import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rank } from './leaderboard.ts';
import type { MatchView } from './chain.ts';

const m = (host: string, guest: string | null, winner: number | null, stake: string, status: MatchView['status'] = 'settled') =>
  ({ host, guest, winner, stake, status }) as MatchView;

test('rank by wins and by net coins won', () => {
  const ms = [m('a', 'b', 0, '1000'), m('a', 'b', 0, '0'), m('b', 'c', 0, '10000'), m('a', 'c', 1, '0', 'live'), m('a', null, null, '5', 'refund')];
  const wins = rank(ms, 10, 'wins');
  assert.deepEqual(wins.map((r) => [r.account, r.wins, r.played]), [['a', 2, 2], ['b', 1, 3], ['c', 0, 1]]);
  assert.equal(wins[0].won, 998n);
  assert.deepEqual(rank(ms, 10, 'won').map((r) => [r.account, r.won]), [['b', 9980n], ['a', 998n], ['c', 0n]]);
});
