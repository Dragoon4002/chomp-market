// Pure game logic. Mirrors program/src/logic.rs 1:1 (same splitmix64 stream), so a lot
// generated here from a seed equals the lot the VRF callback writes on chain from the same seed.
const M = (1n << 64n) - 1n;
export class Rng {
  constructor(seed) { this.s = BigInt.asUintN(64, BigInt(seed)); }
  next() { // splitmix64 -> BigInt
    this.s = (this.s + 0x9E3779B97F4A7C15n) & M;
    let z = this.s;
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & M;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & M;
    return z ^ (z >> 31n);
  }
  int(n) { return Number(this.next() % BigInt(n)); }
  unit() { return Number(this.next() >> 11n) / 2 ** 53; }
}

export const EMPTY = 0xff;
export const TIER_CUM = [600, 850, 950, 990, 1000];
export const VALUE = [10, 30, 90, 300, 1500];
export const WEIGHT = [40, 30, 20, 20, 10];
export const FEE_BPS = 500, BUYBACK_BPS = 9000;
export const TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
// [name, art] per tier; lengths are KINDS in logic.rs
export const ITEMS = [
  [['Pottery Shard', 'art/shard.svg'], ['Health Potion', 'art/potion-hp.svg'], ['Old Tonic', 'art/tonic.svg']],
  [['Bronze Ankh', 'art/ankh.svg'], ['Rusty Blade', 'art/blade.svg'], ['Scale Armor', 'art/armor.svg'], ['Speed Token', 'art/Speed.svg']],
  [['Gold Mask', 'art/mask.svg'], ['Power Token', 'art/Power.svg'], ['Lifesteal Token', 'art/Lifesteal.svg'], ['Monster Egg', 'art/egg.svg']],
  [['Canopic Jar', 'art/canopic.svg'], ['Second Wind Token', 'art/SecondWind.svg']],
  [['Eye of Ra', 'art/eye-of-ra.svg']],
];
export const tier = (it) => it >> 4;
export const value = (it) => (it === EMPTY ? 0 : VALUE[tier(it)]);
export const itemInfo = (it) => { const [name, art] = ITEMS[tier(it)][it & 15]; return { name, art, tier: TIERS[tier(it)], value: value(it) }; };

export function contents(seed) {
  const r = new Rng(seed), n = 3 + r.int(5), items = Array(7).fill(EMPTY);
  let weight = 0, glow = 0;
  for (let i = 0; i < n; i++) {
    const roll = r.int(1000), t = TIER_CUM.findIndex((x) => roll < x), kind = r.int(ITEMS[t].length);
    items[i] = (t << 4) | kind;
    weight += WEIGHT[t] + r.int(10);
    glow += t >= 2 ? 1 : 0;
  }
  return { items, n, weight, glow, shown: items[0] };
}

// Highest revealed bid wins; ties sorted by key then picked with tieSeed (VRF bytes 8..16 on chain).
export function winner(bids, tieSeed) {
  const top = Math.max(0, ...bids.map((b) => b.amount ?? 0));
  if (top <= 0) return -1;
  const tied = bids.map((b, i) => i).filter((i) => bids[i].amount === top).sort((a, b) => (bids[a].key < bids[b].key ? -1 : 1));
  return tied[new Rng(tieSeed).int(tied.length)];
}
export const split = (price) => { const fee = Math.floor((price * FEE_BPS) / 10000); return [price - fee, fee]; };
export const buyback = (items, mask) => Math.floor((items.reduce((s, it, i) => s + (mask >> i & 1 ? value(it) : 0), 0) * BUYBACK_BPS) / 10000);

// ---- session ----
export const START = 1000, LOTS = 5;
const fnv64 = (str) => { let h = 0xcbf29ce484222325n; for (const c of String(str)) h = ((h ^ BigInt(c.charCodeAt(0))) * 0x100000001b3n) & M; return h; };
export const baseSeed = (seed) => (/^\d+$/.test(String(seed)) ? BigInt(seed) : fnv64(seed));
// Stand-in for the VRF output of lot i: [contents seed, tie seed] (= randomness bytes 0..8, 8..16).
export function lotRandomness(base, i) { const r = new Rng(base + BigInt(i)); return [r.next(), r.next()]; }

// ---- bots: read the same 3 hints a human sees ----
export const BOTS = [
  { key: 'b1', name: 'Grizzle', style: 0.45, blurb: 'cautious' },
  { key: 'b2', name: 'Vex', style: 0.6, blurb: 'sharp' },
  { key: 'b3', name: 'Moxie', style: 0.72, blurb: 'bold' },
];
const AVG_HI = (100 * 90 + 40 * 300 + 10 * 1500) / 150; // mean value of a glowing item
const AVG_LO = (600 * 10 + 250 * 30) / 850;
const W_HI = 23.8, W_LO = 41.6; // mean weight of a glowing / plain item (tenths of kg)
export function estimate(lot) {
  const shownHi = tier(lot.shown) >= 2 ? 1 : 0, hidHi = lot.glow - shownHi;
  const rest = lot.weight - (WEIGHT[tier(lot.shown)] + 4.5) - hidHi * W_HI;
  const lo = Math.max(0, Math.round(rest / W_LO));
  return value(lot.shown) + hidHi * AVG_HI + lo * AVG_LO;
}
export function botBids(lot, contentsSeed) {
  const r = new Rng(contentsSeed ^ 0xb075n), est = estimate(lot);
  return BOTS.map((b) => Math.max(0, Math.round(est * b.style * (0.7 + 0.6 * r.unit()))));
}

// One lot, all bids known: who wins, what it costs, what was inside.
export function resolveLot(base, i, playerBid) {
  const [cs, ts] = lotRandomness(base, i), lot = contents(cs);
  const bids = [{ key: 'a0', amount: playerBid }, ...botBids(lot, cs).map((amount, j) => ({ key: BOTS[j].key, amount }))];
  const w = winner(bids, ts);
  return { lot, bids, w, price: w < 0 ? 0 : bids[w].amount, tie: w >= 0 && bids.filter((b) => b.amount === bids[w].amount).length > 1 };
}

export const tapeHash = (x) => fnv64(JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? v.toString() : v))).toString(16).padStart(16, '0');
