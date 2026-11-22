import { PLATFORM_ID, useBalance, usePlatform } from '@xyz/platform';
// TODO(solana): chain seam for keyfall; calls go through @xyz/platform stubs (throw "coming soon").

export const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');
const GAME = 'keyfall';
const ONE_YOCTO = '1'; // spend calls need full-access key -> wallet confirm

export type MatchAuth = { publicKey: string; signature: string };

export function useKeyfall() {
  const p = usePlatform();
  const { balance } = useBalance();
  if (DEMO) return {
    account: 'demo-player.testnet' as string | null, signIn: async () => {}, balance: (25n * 10n ** 24n).toString() as string | null,
    createMatch: async (_stakeYocto: string) => 1, joinMatch: async (_id: number): Promise<unknown> => null,
    sign: async (_matchId: number, _nonce: string): Promise<MatchAuth> => ({ publicKey: '', signature: '' }),
  };
  return {
    account: (p.w.signedAccountId || null) as string | null,
    signIn: async () => { await p.w.signIn(); },
    balance,
    createMatch: async (stakeYocto: string) =>
      Number(await p.call('create_match', { game: GAME, stake: stakeYocto, bettable: false, monster_id: null }, ONE_YOCTO)),
    joinMatch: (id: number): Promise<unknown> => p.call('join_match', { match_id: id, monster_id: null }, ONE_YOCTO),
    // seat proof (TODO(solana): wallet signMessage); nonce = server hello nonce (base64)
    sign: async (matchId: number, nonce: string): Promise<MatchAuth> => {
      const s = await p.w.signMessage({ message: `${GAME}:${matchId}`, recipient: PLATFORM_ID, nonce: Uint8Array.from(atob(nonce), (c) => c.charCodeAt(0)) });
      return { publicKey: String(s.publicKey), signature: String(s.signature) };
    },
  };
}
