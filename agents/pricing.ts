// NPC merchant pricing: every rule in one pure function, shared by the merchant bots (agents/merchant.ts),
// the market's "Merchant (NPC)" tooltip and the /economy fast-forward. All amounts in NEAR. Inputs are public chain data.

export const FLOOR = 0.5;     // cash under this = broke: no restock / buybacks, clearance prices until sales refill it
export const RESERVE = 0.1;   // buybacks may dip under FLOOR (a bargain is a bargain) but never under this gas reserve
export const MARKUP = 1.2;    // merchant margin over the presale (mint) price at target stock
export const HOUR = 3_600_000;

export interface Shelf { base: number; stock: number; target: number; soldLastHour: number; cash: number; floor?: number }
export interface Quote { open: boolean; ask: number; bid?: number; why: string }

/** Wanted stock: cheap commons keep a deeper shelf than rares. */
export const targetFor = (base: number) => (base <= 0.05 ? 6 : 3);

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const n = (x: number) => String(r3(x));

export function price({ base, stock, target, soldLastHour, cash, floor = FLOOR }: Shelf): Quote {
  const lo = base * 0.5, hi = base * 3;
  if (cash < floor) {
    const ask = r3(lo);
    return { open: false, ask, why: `Broke: ${n(cash)} NEAR cash is under the ${n(floor)} floor → no restocking, clearing ${stock} at ${ask} NEAR until sales refill the till` };
  }
  const glut = 0.4 * (target - stock) / Math.max(1, target); // +40% when empty, -40% at 2× target
  const demand = 0.1 * soldLastHour;                         // +10% per sale in the last hour
  const ask = r3(clamp(base * MARKUP * (1 + glut) * (1 + demand), lo, hi));
  const bid = stock < 2 * target ? r3(Math.min(ask * 0.6, base * 0.9)) : undefined;
  const why = `${stock} in stock (target ${target}), ${soldLastHour} sold in the last hour → ${ask} NEAR` + (bid ? `; buys back at ≤ ${bid}` : '');
  return { open: true, ask, bid, why };
}

/** Units to mint from the presale: only when open and the shelf is at half target or less, keeping twice the floor in the till. */
export const restock = ({ base, stock, target, cash, floor = FLOOR }: Shelf) =>
  cash < floor || stock > target / 2 ? 0 : Math.max(0, Math.min(target - stock, Math.floor((cash - 2 * floor) / base + 1e-9)));

/** Secondary sales in the last hour from `price_history` ([ms, yocto][]); presale mints (at exactly `base`) are not demand. */
export const soldSince = (history: [number, string][], base: number, now: number) =>
  history.filter(([t, p]) => t > now - HOUR && Math.abs(yocto2near(p) - base) > 1e-9).length;

export const yocto2near = (y: string | bigint) => Number(BigInt(y) / 10n ** 18n) / 1e6;
export const near2yocto = (x: number) => (BigInt(Math.round(x * 1000)) * 10n ** 21n).toString();
