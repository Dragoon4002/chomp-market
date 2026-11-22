// Mirror of the contract's order book (contracts/platform): math, rounding and error messages.

export const ONE = 10n ** 24n; // 1 coin in base units (24 dp)
export const UNIT = ONE / 100n; // a winning share pays 0.01 coin
export const PER_BPS = UNIT / 10_000n; // cost of 1 share at 1 bps
const BPS = 10_000n;
export const MAX_FILLS = 20;
export const MAX_BOOK = 100;

export interface Order { id: number; who: string; side: number; price_bps: number; qty: number; filled: number; ms: number }
export interface Fill { id: number; taker: string; maker: string; side: number; price_bps: number; qty: number; ms: number }
export interface Pos { shares: [number, number]; paid: [bigint, bigint]; open: bigint; claimed: boolean }
export type Kind = 'order' | 'cancel' | 'payout' | 'refund' | 'fee';
export interface Entry { who: string; kind: Kind; amt: bigint }
export type Level = [number, number]; // [price_bps, qty]

export const cost = (price: number, qty: number) => BigInt(price) * BigInt(qty) * PER_BPS;

/** Walk `side`'s asks (the other side's bids) to spend up to `budget`: [qty, worst price] or null when empty. */
export function sweep(book: [Level[], Level[]], side: number, budget: bigint): { qty: number; price: number } | null {
  let qty = 0, price = 0, left = budget;
  for (const [p, q] of book[1 - side]) {
    const ask = 10_000 - p, n = Math.min(q, Number(left / cost(ask, 1)));
    if (n <= 0) break;
    qty += n; price = ask; left -= cost(ask, n);
    if (n < q) break;
  }
  return qty ? { qty, price } : null;
}

export class Market {
  status: 'open' | 'live' | 'settled' | 'refund' = 'live';
  winner: number | null = null;
  books: [Order[], Order[]] = [[], []]; // bids per side, best first (price desc, then oldest)
  positions = new Map<string, Pos>();
  fills: Fill[] = [];
  history: [number, number][] = []; // [ms, side 0 price bps] per fill
  ledger: Entry[] = [];
  collateral = 0n;
  seq = 0;
  feeBps: bigint; maxBet: bigint;
  constructor(feeBps = 10n, maxBet = 100n * ONE) { this.feeBps = feeBps; this.maxBet = maxBet; }

  get price() { return this.history.length ? this.history[this.history.length - 1][1] : 5000; }
  pos(who: string) {
    let p = this.positions.get(who);
    if (!p) this.positions.set(who, p = { shares: [0, 0], paid: [0n, 0n], open: 0n, claimed: false });
    return p;
  }

  place(who: string, side: number, price: number, qty: number, ms = Date.now()) {
    if (this.status !== 'open' && this.status !== 'live') throw new Error('Book closed');
    if (side !== 0 && side !== 1) throw new Error('side must be 0 or 1');
    if (!Number.isInteger(price) || price < 1 || price > 9999) throw new Error('Bad price');
    if (!Number.isInteger(qty) || qty < 1) throw new Error('Bad qty');
    if (cost(price, qty) > this.maxBet) throw new Error('Order above maximum');
    const opp = this.books[1 - side], hits = opp.filter((o) => o.who !== who && o.price_bps + price >= 10_000).slice(0, MAX_FILLS);
    if (hits.reduce((s, o) => s + o.qty, 0) < qty && this.books[side].length >= MAX_BOOK) throw new Error('Book full');
    const me = this.pos(who);
    let rem = qty, paid = 0n, n = 0;
    for (let i = 0; i < opp.length && rem > 0 && n < MAX_FILLS;) {
      const o = opp[i];
      if (o.price_bps + price < 10_000) break;
      if (o.who === who) { i++; continue; }
      const f = Math.min(rem, o.qty), mine = cost(10_000 - o.price_bps, f), theirs = cost(o.price_bps, f), mp = this.pos(o.who);
      mp.open -= theirs; mp.paid[o.side] += theirs; mp.shares[o.side] += f;
      me.paid[side] += mine; me.shares[side] += f;
      o.qty -= f; o.filled += f; rem -= f; paid += mine; n++;
      this.collateral += BigInt(f) * UNIT;
      this.fills.push({ id: this.fills.length, taker: who, maker: o.who, side, price_bps: 10_000 - o.price_bps, qty: f, ms });
      this.history.push([ms, side === 0 ? 10_000 - o.price_bps : o.price_bps]);
      if (o.qty === 0) opp.splice(i, 1);
    }
    let id: number | null = null;
    if (rem > 0) {
      const book = this.books[side];
      id = this.seq++;
      const at = book.findIndex((o) => o.price_bps < price);
      book.splice(at < 0 ? book.length : at, 0, { id, who, side, price_bps: price, qty: rem, filled: qty - rem, ms });
      me.open += cost(price, rem); paid += cost(price, rem);
    }
    this.ledger.push({ who, kind: 'order', amt: paid });
    return { id, filled: qty - rem, cost: paid };
  }

  cancel(who: string, id: number) {
    if (this.status !== 'open' && this.status !== 'live') throw new Error('Book closed');
    for (const book of this.books) {
      const i = book.findIndex((o) => o.id === id && o.who === who);
      if (i < 0) continue;
      const back = cost(book[i].price_bps, book[i].qty);
      book.splice(i, 1);
      this.pos(who).open -= back;
      this.ledger.push({ who, kind: 'cancel', amt: back });
      return back;
    }
    throw new Error('No such order');
  }

  finish(winner: number | null) {
    if (this.status !== 'open' && this.status !== 'live') throw new Error('Match not live');
    this.winner = winner;
    this.status = winner === null ? 'refund' : 'settled';
  }

  levels(side: number): Level[] {
    if (this.status !== 'open' && this.status !== 'live') return [];
    const out: Level[] = [];
    for (const o of this.books[side]) {
      if (out.length && out[out.length - 1][0] === o.price_bps) out[out.length - 1][1] += o.qty;
      else out.push([o.price_bps, o.qty]);
    }
    return out;
  }
  orders(who: string) { return this.status === 'open' || this.status === 'live' ? [...this.books[0], ...this.books[1]].filter((o) => o.who === who) : []; }

  /** [due, fee] for `who` now. */
  split(who: string): [bigint, bigint] {
    const p = this.positions.get(who);
    if (!p || p.claimed) return [0n, 0n];
    if (this.status === 'settled') {
      const gross = BigInt(p.shares[this.winner!]) * UNIT, fee = (gross * this.feeBps) / BPS;
      return [gross - fee + p.open, fee];
    }
    if (this.status === 'refund') return [p.paid[0] + p.paid[1] + p.open, 0n];
    return [0n, 0n];
  }
  due(who: string) { return this.split(who)[0]; }

  claim(who: string) {
    const [amt, fee] = this.split(who);
    if (amt <= 0n) throw new Error('Nothing to claim');
    this.positions.get(who)!.claimed = true;
    this.ledger.push({ who, kind: this.status === 'refund' ? 'refund' : 'payout', amt: amt });
    if (fee) this.ledger.push({ who: 'house', kind: 'fee', amt: fee });
    return amt;
  }

  /** Money in (orders - cancels) vs out (payouts + refunds + fees). Exact: dust must be 0 once all claimed. */
  audit() {
    const sum = (k: Kind) => this.ledger.filter((e) => e.kind === k).reduce((s, e) => s + e.amt, 0n);
    const inn = sum('order') - sum('cancel'), payouts = sum('payout') + sum('refund'), fees = sum('fee');
    return { in: inn, payouts, fees, out: payouts + fees, dust: inn - payouts - fees };
  }
}

/** Seeded random book: traders quote around a hidden fair price that drifts with the fight. */
export function simulate({ traders = 8, orders = 60, winner = 'auto' as number | null | 'auto', run = 1 }) {
  let r = run * 7919 + 13;
  const rnd = () => ((r = (r * 48271) % 2147483647) / 2147483647);
  const m = new Market();
  const names = Array.from({ length: traders }, (_, i) => `fan-${String.fromCharCode(97 + (i % 26))}${i >= 26 ? i : ''}.testnet`);
  let fair = 5000;
  for (let i = 0; i < orders; i++) {
    fair = Math.min(9500, Math.max(500, fair + Math.round((rnd() - 0.5) * 800)));
    const who = names[Math.floor(rnd() * traders)], side = rnd() < 0.5 ? 0 : 1;
    const mine = side === 0 ? fair : 10_000 - fair, price = Math.min(9999, Math.max(1, mine + Math.round((rnd() - 0.5) * 600)));
    m.place(who, side, price, 1 + Math.floor(rnd() ** 2 * 200), i * 1000);
    if (rnd() < 0.1) { const o = m.orders(who)[0]; if (o) m.cancel(who, o.id); }
  }
  m.finish(winner === 'auto' ? (fair >= 5000 ? 0 : 1) : winner);
  for (const who of names) if (m.due(who) > 0n) m.claim(who);
  return { market: m, names, audit: m.audit() };
}
