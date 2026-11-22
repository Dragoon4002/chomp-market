// Brawler's single chain seam. Calls go through @xyz/platform stubs (throw SOON) unless DEMO.
// TODO(solana): back useArena/useSignMatch/useWallet with the Solana program + MagicBlock ER/VRF.
import { fmt, PLATFORM_ID, toYocto, UNIT, useBalance, useWallet as useBaseWallet, usePlatform } from '@xyz/platform';
import { DEMO, DEMO_ACCOUNT, DEMO_BALANCE, demoArena } from './demo.ts';

export { fmt, toYocto, UNIT, usePlatform };
export const CONTRACT_ID = PLATFORM_ID;
export const GAME = 'brawler';
// TODO(solana): compute budget per ix; values are passed through to the stub unused.
const GAS = '0', GAS_X = '0', GAS_T = '0';
const ONE_YOCTO = '1';

export interface MatchView {
  id: number; game: string; host: string; guest: string | null; stake: string; bettable: boolean;
  status: 'open' | 'live' | 'settled' | 'refund'; winner: number | null; kos: number;
  price_bps: number; collateral: string; fills: number; // price_bps = last fill, fighter 0's side, 0..10000
  created_ms: number; started_ms: number;
  monsters: [string | null, string | null]; tournament: number | null;
  tape_hash?: string | null; // sha256 of the referee's input tape (see lib/tape.ts)
}
export interface TournamentView {
  id: number; game: string; size: number; entry_fee: string; pot: string; bettable: boolean; status: 'open' | 'live' | 'done' | 'cancelled';
  entrants: { account: string; monster: string }[]; rounds: (number | null)[][]; // match ids per round, null = not created yet
  champion: string | null; created_ms: number;
  claimed?: boolean[]; // per entrant: prize/refund already taken
}
export interface PositionView { shares: [number, number]; paid: [string, string]; open: string; claimed: boolean }
export interface OrderView { id: number; side: number; price_bps: number; qty: number; filled: number; ms: number }
export interface FillView { id: number; taker: string; maker: string; side: number; price_bps: number; qty: number; ms: number }
export type Book = [[number, number][], [number, number][]]; // per side: [price_bps, qty] bids, best first
export interface Limits { owner: string; fee_bps: number; max_bet: string; unit: string; treasury: string }
// referee's signed result, from the server's `over`; anyone can submit it via `settle`
export interface Attestation { match_id: number; winner: number | null; kos: [number, number]; tape_hash: string; signature: string }

export const lowBalance = (have: string | null, need: string) =>
  `Not enough balance (${fmt(have ?? '0')} of ${fmt(need)} ${UNIT}). Top up in Account.`;

// TODO(solana): platform program ixs (matches, order book, tournaments) — method names kept from the old contract.
export function useArena() {
  const p = usePlatform();
  if (DEMO) return demoArena;
  const { call, view } = p;
  // dev-only ?as=<account>: play without a wallet (browser tests); compiled out of production builds
  const account = (process.env.NODE_ENV === 'development' && new URLSearchParams(location.search).get('as')) || p.w.signedAccountId;
  // throw before wallet opens if balance short
  const need = async (yocto: string) => {
    if (BigInt(yocto) === 0n || !account) return;
    const have = await p.balanceOf(account);
    if (BigInt(have) < BigInt(yocto)) throw new Error(lowBalance(have, yocto));
  };
  return {
    ready: !!CONTRACT_ID,
    account,
    signIn: p.w.signIn,
    // null = monster lock failed, stake refunded
    createMatch: async (bettable: boolean, stakeYocto: string, monsterId?: string): Promise<number | null> => {
      await need(stakeYocto);
      const r = await call('create_match', { game: GAME, stake: stakeYocto, bettable, monster_id: monsterId ?? null }, ONE_YOCTO, monsterId ? GAS_X : GAS);
      return r == null ? null : Number(r);
    },
    joinMatch: async (id: number, stakeYocto: string, monsterId?: string) => {
      await need(stakeYocto);
      return call('join_match', { match_id: id, monster_id: monsterId ?? null }, ONE_YOCTO, monsterId ? GAS_X : GAS);
    },
    listTournaments: (from = 0, limit = 30) => view<TournamentView[]>('list_tournaments', { from, limit, game: GAME }),
    getTournament: (id: number) => view<TournamentView | null>('get_tournament', { id }),
    createTournament: async (size: number, feeYocto: string, bettable: boolean) =>
      Number(await call('create_tournament', { game: GAME, size, entry_fee: feeYocto, bettable }, '1')),
    enterTournament: async (id: number, monsterId: string, feeYocto: string) => { await need(feeYocto); return call('enter_tournament', { id, monster_id: monsterId }, ONE_YOCTO, GAS_T); },
    claimTournament: (id: number) => call('claim_tournament', { id }),
    cancelTournament: (id: number) => call('cancel_tournament', { id }),
    cancelMatch: (id: number) => call('cancel_match', { match_id: id }),
    placeOrder: async (id: number, side: number, priceBps: number, qty: number) => {
      await need((BigInt(priceBps) * BigInt(qty) * 10n ** 18n).toString());
      return call('place_order', { match_id: id, side, price_bps: priceBps, qty }, ONE_YOCTO, GAS_X) as Promise<{ id: number | null; filled: number; cost: string }>;
    },
    cancelOrder: (id: number, orderId: number) => call('cancel_order', { match_id: id, order_id: orderId }),
    settle: (a: Attestation) => call('settle', { ...a }, '0', GAS_X),
    getBook: (id: number) => view<Book>('get_book', { match_id: id }),
    getOrders: (id: number, account: string) => view<OrderView[]>('get_orders', { match_id: id, account_id: account }),
    getFills: (id: number) => view<FillView[]>('get_fills', { match_id: id, limit: 6 }),
    claim: (id: number) => call('claim', { match_id: id }),
    expire: (id: number) => call('expire', { match_id: id }),
    getMatch: (id: number) => view<MatchView | null>('get_match', { match_id: id }),
    getPosition: (id: number, account: string) => view<PositionView | null>('get_position', { match_id: id, account_id: account }),
    getPrices: (id: number) => view<[number, number][]>('get_prices', { match_id: id }),
    config: () => view<Limits>('config'),
    claimable: (id: number, account: string) => view<string>('claimable', { match_id: id, account_id: account }),
    listMatches: (from = 0, limit = 50) => view<MatchView[]>('list_matches', { from, limit, game: GAME }),
  };
}

// Signed seat proof for game server (server verifies in crates/chain). undefined in demo.
// TODO(solana): ed25519 signMessage from the wallet adapter.
export type MatchAuth = { publicKey: string; signature: string };
export type SignMatch = (matchId: number, nonce: string) => Promise<MatchAuth>;
export function useSignMatch(): SignMatch | undefined {
  const w = useBaseWallet();
  if (DEMO) return undefined;
  return async (matchId, nonce) => {
    const s = await w.signMessage({ message: `brawler-arena:${matchId}`, recipient: CONTRACT_ID, nonce: Uint8Array.from(atob(nonce), (c) => c.charCodeAt(0)) });
    return { publicKey: String(s.publicKey), signature: String(s.signature) };
  };
}

export function useWallet() {
  const w = useBaseWallet();
  if (!DEMO) return w;
  return { ...w, loading: false, signedAccountId: DEMO_ACCOUNT, network: 'demo', getBalance: async () => 12_345n * 10n ** 21n, signIn: async () => {}, signOut: async () => alert('Demo: wallet disconnected') };
}

export function useUnifiedBalance() {
  const b = useBalance();
  return DEMO ? { balance: DEMO_BALANCE, refresh: () => {} } : b;
}
