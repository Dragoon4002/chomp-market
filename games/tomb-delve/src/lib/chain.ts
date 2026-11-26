// In-memory mock of the Private ER + treasury. No chain code here; each TODO(solana) marks the real hook.
// ponytail: module-level state, resets on reload. Real state lives in the run/treasury PDAs.
import { randomDna, type Dna, type SkillKind } from './genes.ts';
import { classOf, pawnQuote, sha256, ENTRY, ITEMS, RELICS, T_TARGET, type Cls, type ItemId } from './sim.ts';

export interface Char { id: string; name: string; dna: Dna; cls: Cls; skills: SkillKind[]; lockedUntil: number }

const SKILLS: Record<Cls, SkillKind[]> = {
  tank: ['Durability', 'QuickDodge'], berserker: ['Power', 'SecondWind'], rogue: ['Speed', 'AirJump'], thief: ['Agility', 'Lifesteal'],
};
const NAMES: Record<Cls, string> = { tank: 'Brammox', berserker: 'Grotor', rogue: 'Nyxvel', thief: 'Kipel' };

// TODO(solana): NFT — read the player's monster NFTs (DNA, skills) instead of these 4 demo seeds.
const chars: Char[] = [];
for (let s = 1; chars.length < 4; s++) {
  const dna = randomDna(s), cls = classOf(dna);
  if (!chars.some((c) => c.cls === cls)) chars.push({ id: `demo-${s}`, name: NAMES[cls], dna, cls, skills: SKILLS[cls], lockedUntil: 0 });
}
chars.sort((a, b) => Object.keys(SKILLS).indexOf(a.cls) - Object.keys(SKILLS).indexOf(b.cls));

const SOL = 1_000_000_000, DAY = 86_400_000;
export const state = { balance: 1 * SOL, treasury: 5 * SOL, protocol: 0, owed: 0, legendaries: 0, runs: 0 };
const trades: { tier: number; t: number; n: number }[] = []; // n: +1 sell, -1 buy
const payouts: { t: number; amt: number }[] = [];

export const getChars = () => chars;
export const fmt = (lamports: number) => (lamports / SOL).toFixed(4);

// Inflow split: 85% treasury, 10% protocol, 5% the character NFT's vault.
function pay(amt: number) {
  if (state.balance < amt) return false;
  state.balance -= amt;
  state.treasury += Math.floor(amt * 0.85);
  state.protocol += Math.floor(amt * 0.1); // vault share (5%) not modeled per character
  return true;
}

// TODO(solana): escrow — entry fee into escrow, run PDA created + delegated to the Private ER.
// TODO(solana): session-key — mint a session key here so each turn is one signed tx without wallet popups.
export function payEntry(): string | null {
  return pay(ENTRY) ? `run-${++state.runs}` : null;
}
// TODO(solana): treasury — camp purchases are inventory entries on the run PDA, SOL to treasury split.
export const buyItem = (item: ItemId) => pay(ITEMS[item].price);

// TODO(solana): VRF — request per set; mock uses the portal session seed.
export const requestVrf = (sessionSeed: string, set: number) => sha256(`${sessionSeed}|vrf|${set}`);

// TODO(solana): NFT — on-chain death-lock timestamp on the character.
export function lockChar(id: string, now: number) {
  const c = chars.find((x) => x.id === id);
  if (c) c.lockedUntil = now + 3_600_000;
}

export function netSold(tier: number, now: number) {
  return trades.filter((x) => x.tier === tier && now - x.t < DAY).reduce((s, x) => s + x.n, 0);
}
// TODO(solana): treasury — quote read from the treasury PDA + per-type counters.
export const quote = (tier: number, now: number) => pawnQuote(RELICS[tier].base, tier === 4 ? 0 : netSold(tier, now), state.treasury, T_TARGET);
export const buyQuote = (tier: number, now: number) => Math.ceil(quote(tier, now) * 1.2);

// TODO(solana): treasury — pawn sell. Guards: 20% of T per day, legendary ≤3% of T (rest owed), never more than T.
export function sell(tier: number, now: number) {
  const q = quote(tier, now);
  const today = payouts.filter((x) => now - x.t < DAY).reduce((s, x) => s + x.amt, 0);
  let amt = Math.min(q, Math.max(0, Math.floor(state.treasury * 0.2) - today), state.treasury);
  if (tier === 4) amt = Math.min(amt, Math.floor(state.treasury * 0.03));
  state.owed += q - amt; // ponytail: owed is just a counter, real version streams it from the treasury PDA
  state.treasury -= amt; state.balance += amt;
  payouts.push({ t: now, amt });
  trades.push({ tier, t: now, n: 1 });
  if (tier === 4) state.legendaries++;
  return amt;
}
// TODO(solana): treasury — pawn buy-back at 1.20× quote.
export function buyRelic(tier: number, now: number) {
  const p = buyQuote(tier, now);
  if (state.balance < p) return false;
  state.balance -= p; state.treasury += p;
  trades.push({ tier, t: now, n: -1 });
  return true;
}

// DEMO ONLY: test buttons for the mock. Delete with the demo panel when real chain wiring lands.
export const demo = {
  faucet: () => { state.balance += SOL; },
  unlockAll: () => chars.forEach((c) => (c.lockedUntil = 0)),
  resetMarket: () => { trades.length = 0; payouts.length = 0; state.treasury = 5 * SOL; },
};
