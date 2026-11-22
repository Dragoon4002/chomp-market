import type { MatchView } from './chain.ts';

export interface Row { account: string; wins: number; played: number; won: bigint }

// won = net coin profit from staked wins (opponent's stake minus the pot fee).
export function rank(matches: MatchView[], feeBps: number, by: 'wins' | 'won'): Row[] {
  const rows = new Map<string, Row>();
  const row = (a: string) => rows.get(a) ?? rows.set(a, { account: a, wins: 0, played: 0, won: 0n }).get(a)!;
  for (const m of matches) {
    if (m.status !== 'settled' || m.winner === null || !m.guest) continue;
    const seats = [m.host, m.guest];
    seats.forEach((a) => row(a).played++);
    const w = row(seats[m.winner]), stake = BigInt(m.stake);
    w.wins++;
    w.won += stake - (2n * stake * BigInt(feeBps)) / 10000n;
  }
  const key = (r: Row) => (by === 'wins' ? [BigInt(r.wins), r.won] : [r.won, BigInt(r.wins)]);
  return [...rows.values()].sort((x, y) => {
    const [a1, a2] = key(x), [b1, b2] = key(y);
    return b1 !== a1 ? (b1 > a1 ? 1 : -1) : b2 !== a2 ? (b2 > a2 ? 1 : -1) : 0;
  });
}
