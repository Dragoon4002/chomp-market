import { bs58, ix, myMatches, randomMatchId, readMatch, requestFaucet, useBalance, useWallet } from '@xyz/platform';
import { type Reclaim, reclaims, remember } from './stakes.ts';
// Keyfall's chain seam: chomp program escrows the stake, keyfall server referee settles.

export const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');
const GAME = 'keyfall';

export function useKeyfall() {
  const w = useWallet();
  const { balance } = useBalance();
  if (DEMO) return {
    account: 'demo-player' as string | null, kind: '' as string, signIn: async () => {}, faucet: async () => {}, balance: (25n * 10n ** 9n).toString() as string | null,
    createMatch: async (_stakeLamports: string) => 1, joinMatch: async (_id: number): Promise<unknown> => null, cancel: async (_id: number): Promise<unknown> => null,
    reclaims: async (): Promise<Reclaim[]> => [], reclaim: async (_r: Reclaim): Promise<unknown> => null,
    sign: async (_matchId: number, _nonce: string) => '',
  };
  const me = w.signedAccountId;
  return {
    account: (me || null) as string | null,
    kind: w.kind as string,
    signIn: async () => { await w.signIn(); },
    faucet: async () => { await requestFaucet(me); },
    balance,
    createMatch: async (stakeLamports: string) => {
      const id = randomMatchId();
      remember(GAME, Number(id)); // before send: a tab closed mid-confirm still finds the stake (Reclaim list)
      await w.sendIxs([ix.openMatch(me, GAME, id, stakeLamports)]);
      return Number(id);
    },
    joinMatch: (id: number): Promise<unknown> => { remember(GAME, id); return w.sendIxs([ix.joinMatch(me, GAME, id)]); },
    cancel: (id: number): Promise<unknown> => w.sendIxs([ix.cancel(me, GAME, id, me, null)]), // host, seat still open
    reclaims: async () => {
      for (const id of await myMatches(GAME, me).catch(() => [])) remember(GAME, id); // sandbox has no localStorage
      return reclaims(GAME, me, (id) => readMatch(GAME, id));
    },
    reclaim: (r: Reclaim): Promise<unknown> => w.sendIxs([ix.cancel(me, GAME, r.id, r.m.a, r.m.b)]),
    // seat proof; nonce = server hello nonce (base64 string as sent)
    sign: async (matchId: number, nonce: string) =>
      bs58.encode(await w.signBytes(new TextEncoder().encode(`chomp:${GAME}:${matchId}:${nonce}`))),
  };
}
