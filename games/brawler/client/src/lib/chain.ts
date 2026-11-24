// Brawler's single chain seam: chomp program escrows 1v1 stakes, brawler server referee settles (no client settle).
// Spectator betting, tournaments, claims and the old platform balance have no Solana backend yet: they reject with SOON.
import { bs58, fmt, ix, randomMatchId, readMatch, requestFaucet, SOON, toLamports, UNIT, useBalance, useWallet as useBaseWallet, usePlatform } from '@xyz/platform';
import { DEMO, DEMO_ACCOUNT, DEMO_BALANCE, demoArena } from './demo.ts';
import { remember } from './stakes.ts';

export { fmt, requestFaucet, toLamports, UNIT, usePlatform };
export const toYocto = toLamports; // old name, amounts are lamports
export const GAME = 'brawler';

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
  `Not enough SOL (${fmt(have ?? '0')} of ${fmt(need)} ${UNIT}). Get devnet SOL in Account.`;

const off = (..._: unknown[]): Promise<never> => Promise.reject(new Error(SOON));
export function useArena() {
  const p = usePlatform();
  if (DEMO) return demoArena;
  // dev-only ?as=<account>: play without a wallet (browser tests); compiled out of production builds
  const account = (process.env.NODE_ENV === 'development' && new URLSearchParams(location.search).get('as')) || p.w.signedAccountId;
  // throw before wallet opens if balance short
  const need = async (lamports: string) => {
    if (BigInt(lamports) === 0n || !account) return;
    // wallet read (portal bridge retries 429s); a failed read skips the check, the tx itself still fails if short
    const have = await p.w.getBalance(account).then(String, () => null);
    if (have !== null && BigInt(have) < BigInt(lamports)) throw new Error(lowBalance(have, lamports));
  };
  const send = (i: Parameters<typeof p.w.sendIxs>[0][number]) => p.w.sendIxs([i]);
  return {
    ready: true,
    account,
    signIn: p.w.signIn,
    // monsterId ignored: monster NFTs are not on Solana yet
    createMatch: async (_bettable: boolean, stake: string, _monsterId?: string): Promise<number | null> => {
      await need(stake);
      const id = randomMatchId();
      remember(GAME, Number(id)); // before send: a tab closed mid-confirm still finds the stake (Funds > Reclaim)
      await send(ix.openMatch(account, GAME, id, stake));
      return Number(id);
    },
    joinMatch: async (id: number, stake: string, _monsterId?: string) => {
      const m = await readMatch(GAME, id);
      if (!m || m.b) throw new Error('That staked seat is already taken or the match closed.');
      await need(String(m.stake)); // chain stake wins over what the room advertised
      if (String(m.stake) !== stake) throw new Error(`Room stake changed to ${fmt(m.stake)} ${UNIT}; reopen the invite.`);
      remember(GAME, id);
      await send(ix.joinMatch(account, GAME, id));
      return true;
    },
    cancelMatch: (id: number) => send(ix.cancel(account, GAME, id, account, null)), // host, seat still open
    getMatch: async (_id: number): Promise<MatchView | null> => null, // ponytail: no reader needs the chain view now (referee settles)
    listMatches: async (_from = 0, _limit = 50): Promise<MatchView[]> => [], // ponytail: no match index on Solana yet; history comes from the server
    listTournaments: off, getTournament: off, createTournament: off, enterTournament: off, claimTournament: off, cancelTournament: off,
    placeOrder: off, cancelOrder: off, settle: off, getBook: off, getFills: off, claim: off, expire: off,
    getPrices: off, config: off,
    getPosition: off as (id: number, account: string) => Promise<PositionView | null>,
    getOrders: off as (id: number, account: string) => Promise<OrderView[]>,
    claimable: off as (id: number, account: string) => Promise<string>,
  };
}

// Signed seat proof for the game server: base58 ed25519 over `chomp:brawler:<matchId>:<hello.nonce>`. undefined in demo.
export type SignMatch = (matchId: number, nonce: string) => Promise<string>;
export function useSignMatch(): SignMatch | undefined {
  const w = useBaseWallet();
  if (DEMO) return undefined;
  return async (matchId, nonce) => bs58.encode(await w.signBytes(new TextEncoder().encode(`chomp:${GAME}:${matchId}:${nonce}`)));
}

export function useWallet() {
  const w = useBaseWallet();
  if (!DEMO) return w;
  return { ...w, loading: false, signedAccountId: DEMO_ACCOUNT, network: 'demo', getBalance: async () => 12_345n * 10n ** 6n, signIn: async () => {}, signOut: async () => alert('Demo: wallet disconnected') };
}

export function useUnifiedBalance() {
  const b = useBalance();
  return DEMO ? { balance: DEMO_BALANCE, refresh: () => {} } : b;
}
