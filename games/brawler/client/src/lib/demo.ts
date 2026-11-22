import { randomDna, nameFor, type Skill } from './genes.ts';
import { UNIT } from '@xyz/platform';
import type { Attestation, Book, FillView, Limits, MatchView, OrderView, PositionView, TournamentView } from './chain.ts';
import type { HistoryEntry, MonstersApi, NftMonster, SkillType } from './nft.ts';
import { breedPair, monsters as storeMonsters } from './store.ts';
import { Market } from './market.ts';

export const DEMO = new URLSearchParams(location.search).has('demo');
export const DEMO_ACCOUNT = 'demo-player.testnet';
export const DEMO_BALANCE = (25n * 10n ** 24n).toString(); // 25 coins
const AMT = (n: number) => (BigInt(Math.round(n * 1000)) * 10n ** 21n).toString();
const mon = (seed: number) => ({ name: nameFor(seed), dna: randomDna(seed), account: `${nameFor(seed).toLowerCase()}.testnet` });

export const DEMO_ROOMS = [
  { code: 'LIVE', pub: true, status: 'live', stage: 'ember', bettable: true, matchId: 1, stake: AMT(0.5), winner: null, watchers: 14, players: [mon(11), mon(12)] },
  { code: 'GROV', pub: false, status: 'live', stage: 'grove', bettable: true, matchId: 2, stake: AMT(2), winner: null, watchers: 3, players: [mon(21), mon(22)] },
  { code: 'OPEN', pub: true, status: 'waiting', stage: 'docks', bettable: true, matchId: 3, stake: AMT(0.1), winner: null, watchers: 0, players: [mon(31)] },
  { code: 'FREE', pub: true, status: 'waiting', stage: 'ember', bettable: false, matchId: null, stake: '0', winner: null, watchers: 1, players: [mon(41)] },
] as const;

// Canned chat for the room lobby / watch demos.
export const demoChat = (a: string, b: string) => [
  [a, 0, 'gl hf!'], [b, 1, 'you too. no heavy spam pls'], ['fan-ana.testnet', -1, 'backing the blue one'], [a, 0, 'arena ok?'], [b, 1, 'docks plz'], ['Spectator', -1, 'this is gonna be close'],
].map(([from, seat, text], i, l) => ({ from: from as string, seat: seat as number, text: text as string, ts: Date.now() - (l.length - i) * 25_000 }));

const match = (id: number, status: MatchView['status'], price = 5000, kos = 1): MatchView => ({
  id, game: 'brawler', host: DEMO_ROOMS[0].players[0].account, guest: DEMO_ROOMS[0].players[1].account, stake: AMT(0.5), bettable: true,
  status, winner: status === 'settled' ? 0 : null, kos, price_bps: price, collateral: '0', fills: 0,
  created_ms: Date.now() - 600_000, started_ms: Date.now() - 300_000, monsters: [null, null], tournament: null,
});
const MATCHES: MatchView[] = [
  match(1, 'live'),
  match(4, 'settled', 7300), match(5, 'refund'),
  { ...match(6, 'open', 5000, 0), host: DEMO_ACCOUNT },
  { ...match(7, 'live', 5000, 0), started_ms: Date.now() - 3 * 3600_000, host: DEMO_ACCOUNT },
];
const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 400));
const sent = (what: string) => { alert(`Demo: ${what}. In the real app your wallet asks you to confirm.`); return wait(null); };
// Match 1 (room LIVE) is a real order book run in the browser with the contract's math: bots quote around a drifting
// fair price every few seconds, your orders match against them, and the demo fight's result settles it.
export const LIVE = new Market();
const BOTS = ['fan-ana.testnet', 'fan-bo.testnet', 'fan-cy.testnet', 'fan-dee.testnet', 'fan-eli.testnet'];
let fair = 5600;
const botTrade = (t: number) => {
  fair = Math.min(9000, Math.max(1000, fair + Math.round((Math.random() - 0.5) * 500)));
  const side = Math.random() < 0.5 ? 0 : 1, mine = side ? 10_000 - fair : fair;
  try { LIVE.place(BOTS[Math.floor(Math.random() * BOTS.length)], side, mine + Math.round((Math.random() - 0.6) * 600), 5 + Math.floor(Math.random() ** 2 * 80), t); } catch { /* skipped */ }
};
if (DEMO) {
  for (let i = 0; i < 40; i++) botTrade(Date.now() - (40 - i) * 6000); // the last 4 minutes of trading
  try { LIVE.place(DEMO_ACCOUNT, 0, 9000, 20, Date.now() - 60_000); } catch { /* no asks */ }
  setInterval(() => LIVE.status === 'live' && botTrade(Date.now()), 3000);
}
const liveView = (): MatchView => ({ ...match(1, LIVE.status), winner: LIVE.winner, price_bps: LIVE.price, collateral: LIVE.collateral.toString(), fills: LIVE.fills.length });
const posView = (): PositionView | null => {
  const p = LIVE.positions.get(DEMO_ACCOUNT);
  return p ? { shares: [...p.shares], paid: [p.paid[0].toString(), p.paid[1].toString()], open: p.open.toString(), claimed: p.claimed } : null;
};
/** Demo fight ended: settle the market (null = void). */
export const demoSettle = (id: number | null, winner: number | null) => { if (id === 1 && LIVE.status === 'live') LIVE.finish(winner); };
const POS: Record<number, PositionView> = {
  4: { shares: [300, 0], paid: [AMT(2), '0'], open: '0', claimed: false },
};
const tx = <T,>(f: () => T) => wait(null).then(f); // wallet round trip, then the call

// In-memory NFTs, seeded from the localStorage collection so Collection shows your demo monsters.
const HOUR = 3600_000, DAY = 24 * HOUR;
const fake = (seed: number, owner: string, extra: Partial<NftMonster> = {}): NftMonster => ({
  id: `d${seed}`, name: nameFor(seed), gen: seed % 3, parents: null, born: Date.now() - (seed % 9 + 1) * DAY,
  record: { w: seed % 7, l: seed % 4, ko: seed % 5 }, dna: randomDna(seed), owner, breeder: owner, titles: [],
  lockedUntil: 0, cooldownUntil: 0, skills: [], skillIds: [], ...extra,
});
const SKILL_TYPES: SkillType[] = ([
  ['Iron Fist', 'Power', 1, 'Common'], ['Quick Hands', 'Agility', 1, 'Common'], ['Thick Hide', 'Durability', 1, 'Common'], ['Swift Feet', 'Speed', 1, 'Common'],
  ['Titan Fist', 'Power', 2, 'Rare'], ['Gale Feet', 'Speed', 2, 'Rare'], ['Feather Step', 'AirJump', 1, 'Epic'], ['Vampire Fang', 'Lifesteal', 1, 'Rare'],
  ['Shadow Roll', 'QuickDodge', 1, 'Rare'], ['Second Wind', 'SecondWind', 1, 'Epic'],
] as const).map(([name, kind, mag, rarity], i) => ({ id: i + 1, name, kind, mag, rarity, media: `/skills/${kind}.svg` }));
const FREE: Record<number, number> = { 1: 3, 2: 1, 3: 2, 4: 1, 6: 1, 8: 1, 9: 1, 10: 1 };
const loadout = (ids: number[]): Skill[] => ids.map((id) => SKILL_TYPES.find((t) => t.id === id)!).map(({ kind, mag }) => ({ kind, mag }));
const OTHERS = [61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72].map((n) => fake(n, `${nameFor(n).toLowerCase()}.testnet`));
const NFTS: NftMonster[] = [];
if (DEMO) {
  storeMonsters().forEach((m, i) => NFTS.push({
    ...m, owner: DEMO_ACCOUNT, breeder: DEMO_ACCOUNT, titles: i === 0 ? ['Season 1 Runner-up', 'Tournament #3 Champion'] : [], lockedUntil: 0, cooldownUntil: 0,
    skillIds: i === 0 ? [5, 7] : [], skills: loadout(i === 0 ? [5, 7] : []),
  }));
  NFTS.push(
    ...OTHERS.slice(0, 4).map((m, i) => ({ ...m, price: AMT([0.5, 1, 2.5, 4][i]) })), // for sale
    ...OTHERS.slice(4, 7).map((m, i) => ({ ...m, rentOffer: { pricePerDay: AMT([0.05, 0.1, 0.2][i]), maxDays: [3, 7, 14][i] } })), // for rent
    ...OTHERS.slice(7),
  );
}
const find = (id: string) => NFTS.find((m) => m.id === id) ?? null;
const patch = (id: string, p: Partial<NftMonster>) => { const m = find(id); if (m) Object.assign(m, { ...p }); };
const mineNow = () => NFTS.filter((m) => m.owner === DEMO_ACCOUNT || (m.rental && m.rental.renter === DEMO_ACCOUNT && m.rental.untilMs > Date.now()));
const HIST: Record<string, HistoryEntry[]> = {};
const histOf = (id: string): HistoryEntry[] => HIST[id] ??= [3, 2, 1, 0].map((n) => ({
  match_id: 40 + n, vs: OTHERS[(n + id.length) % OTHERS.length].id, won: n === 2 ? false : n === 0 ? null : true, kos: n === 2 ? 0 : 1 + (n % 2),
  ms: Date.now() - (n + 1) * 5 * HOUR, tournament: n === 3 ? 3 : null,
}));
let claimed = false;
const mutate = (what: string, f: () => void) => wait(null).then(() => { f(); alert(`Demo: ${what}. In the real app your wallet asks you to confirm.`); return null; });

export const demoMonsters: MonstersApi = {
  mine: () => wait(mineNow().map((m) => ({ ...m }))),
  get: (id) => wait(find(id) ? { ...find(id)! } : null),
  history: (id) => wait(histOf(id)),
  hatchStarters: () => mutate('3 starter monsters hatched', () => { claimed = true; }),
  startersClaimed: () => wait(claimed || NFTS.some((m) => m.owner === DEMO_ACCOUNT)),
  breed: async (a, b) => {
    const [ma, mb] = [find(a), find(b)];
    if (!ma || !mb) return null;
    await sent('breeding fee paid, new monster born');
    const { child } = breedPair(ma, mb); // also lands in the localStorage collection
    const c: NftMonster = { ...child, owner: DEMO_ACCOUNT, breeder: DEMO_ACCOUNT, titles: [], lockedUntil: 0, cooldownUntil: 0, skills: [], skillIds: [] };
    NFTS.push(c);
    patch(a, { cooldownUntil: Date.now() + HOUR }); patch(b, { cooldownUntil: Date.now() + HOUR });
    return { ...c };
  },
  list: (id, y) => mutate('monster listed for sale', () => patch(id, { price: y })),
  delist: (id) => mutate('listing removed', () => patch(id, { price: undefined })),
  buy: (id, y) => mutate(`monster bought for ${fmtN(y)} ${UNIT}`, () => patch(id, { owner: DEMO_ACCOUNT, price: undefined, rentOffer: undefined })),
  offerRent: (id, p, d) => mutate('rent offer published', () => patch(id, { rentOffer: { pricePerDay: p, maxDays: d } })),
  cancelRent: (id) => mutate('rent offer cancelled', () => patch(id, { rentOffer: undefined })),
  rent: (id, days) => mutate(`monster rented for ${days} day(s)`, () => patch(id, { rental: { renter: DEMO_ACCOUNT, untilMs: Date.now() + days * DAY } })),
  listings: () => wait(NFTS.filter((m) => m.price).map((m) => ({ ...m }))),
  rentOffers: () => wait(NFTS.filter((m) => m.rentOffer).map((m) => ({ ...m }))),
  owed: () => wait('0'),
  withdrawOwed: () => sent(`owed ${UNIT} sent to your wallet`),
  skillTypes: () => wait(SKILL_TYPES),
  skills: () => wait(SKILL_TYPES.filter((t) => FREE[t.id]).map((t) => ({ ...t, free: FREE[t.id], listed: 0 }))),
  equip: (id, ids) => mutate('skills equipped', () => {
    const m = find(id)!;
    m.skillIds.forEach((s) => { FREE[s] = (FREE[s] ?? 0) + 1; });
    ids.forEach((s) => { FREE[s]--; });
    patch(id, { skillIds: [...ids], skills: loadout(ids) });
  }),
  config: () => wait({ owner: 'admin.testnet', arena: 'arena.testnet', treasury: AMT(3), breed_fee: AMT(0.1), market_fee_bps: 250, royalty_bps: 500, rent_fee_bps: 250 }),
};
const fmtN = (y: string) => Number(BigInt(y) / 10n ** 21n) / 1000;

const mm = (id: number, host: string, guest: string, mh: string, mg: string, status: MatchView['status'], tournament: number, winner: number | null = null): MatchView => ({
  ...match(id, status, 5000, 0), host, guest, stake: '0', winner, monsters: [mh, mg], tournament, started_ms: Date.now() - 2 * HOUR,
});
const ent = (n: number) => ({ account: OTHERS[n].owner, monster: OTHERS[n].id });
const me = (): { account: string; monster: string } => ({ account: DEMO_ACCOUNT, monster: mineNow()[0]?.id ?? OTHERS[0].id });
const TOURNAMENTS: TournamentView[] = [
  { id: 1, game: 'brawler', size: 4, entry_fee: AMT(0.2), pot: AMT(0.4), bettable: true, status: 'open', entrants: [ent(0), ent(1)], rounds: [[null, null], [null]], champion: null, created_ms: Date.now() - 3 * HOUR },
  { id: 2, game: 'brawler', size: 8, entry_fee: AMT(0.5), pot: AMT(4), bettable: true, status: 'live', entrants: [me(), ent(1), ent(2), ent(3), ent(4), ent(5), ent(6), ent(7)],
    rounds: [[101, 102, 103, 104], [null, 105], [null]], champion: null, created_ms: Date.now() - 6 * HOUR },
  { id: 3, game: 'brawler', size: 4, entry_fee: AMT(0.1), pot: AMT(0.4), bettable: false, status: 'done', entrants: [ent(8), ent(9), ent(10), ent(11)],
    rounds: [[201, 202], [203]], champion: OTHERS[8].owner, created_ms: Date.now() - 2 * DAY },
];
{
  const t2 = TOURNAMENTS[1].entrants, t3 = TOURNAMENTS[2].entrants;
  const m = (id: number, t: TournamentView['entrants'], a: number, b: number, st: MatchView['status'], tn: number, w: number | null = null) =>
    mm(id, t[a].account, t[b].account, t[a].monster, t[b].monster, st, tn, w);
  MATCHES.push(
    m(101, t2, 0, 1, 'live', 2), m(102, t2, 2, 3, 'settled', 2, 0), m(103, t2, 4, 5, 'settled', 2, 1), m(104, t2, 6, 7, 'settled', 2, 0), m(105, t2, 5, 6, 'live', 2),
    m(201, t3, 0, 1, 'settled', 3, 0), m(202, t3, 2, 3, 'settled', 3, 1), m(203, t3, 0, 3, 'settled', 3, 0),
  );
}

// Same shape as useArena(): views return canned data, calls just announce themselves.
export const demoArena = {
  ready: true, account: DEMO_ACCOUNT, signIn: async () => {},
  createMatch: async (_bettable?: boolean, _stake?: string, _monsterId?: string) => { await sent('match created and stake escrowed'); return 99; },
  joinMatch: (_id?: number, _stake?: string, _monsterId?: string) => sent('stake matched, joining'),
  listTournaments: (): Promise<TournamentView[]> => wait([...TOURNAMENTS].reverse()),
  getTournament: (id: number): Promise<TournamentView | null> => wait(TOURNAMENTS.find((t) => t.id === id) ?? null),
  createTournament: async (size: number, feeYocto: string, bettable: boolean) => {
    await sent('tournament created');
    const id = TOURNAMENTS.length + 1;
    TOURNAMENTS.push({ id, game: 'brawler', size, entry_fee: feeYocto, pot: '0', bettable, status: 'open', entrants: [], rounds: size === 8 ? [[null, null, null, null], [null, null], [null]] : [[null, null], [null]], champion: null, created_ms: Date.now() });
    return id;
  },
  enterTournament: (id: number, monsterId: string, feeYocto: string) => tx(() => {
    const t = TOURNAMENTS.find((x) => x.id === id);
    if (!t || t.status !== 'open' || t.entrants.length >= t.size) throw new Error('Tournament is not open');
    t.entrants.push({ account: DEMO_ACCOUNT, monster: monsterId });
    t.pot = (BigInt(t.pot) + BigInt(feeYocto)).toString();
    alert('Demo: entered tournament. In the real app your wallet asks you to confirm.');
    return null;
  }),
  claimTournament: () => sent('prize added to your balance'),
  cancelTournament: () => sent('tournament cancelled, entry fees refundable'),
  cancelMatch: () => sent('match cancelled, stake refunded'),
  placeOrder: (id: number, side: number, priceBps: number, qty: number) => id === 1 ? tx(() => LIVE.place(DEMO_ACCOUNT, side, priceBps, qty)).then((r) => ({ ...r, cost: r.cost.toString() })) : sent('order placed').then(() => ({ id: null, filled: 0, cost: '0' })),
  cancelOrder: (id: number, orderId: number) => (id === 1 ? tx(() => LIVE.cancel(DEMO_ACCOUNT, orderId)) : sent('order cancelled')),
  settle: (_a: Attestation) => sent('result settled on-chain, winnings in your balance'),
  getBook: (id: number): Promise<Book> => wait(id === 1 ? [LIVE.levels(0), LIVE.levels(1)] : [[], []]),
  getOrders: (id: number): Promise<OrderView[]> => wait(id === 1 ? LIVE.orders(DEMO_ACCOUNT).map(({ who: _w, ...o }) => o) : []),
  getFills: (id: number): Promise<FillView[]> => wait(id === 1 ? LIVE.fills.slice(-6).reverse() : []),
  claim: (id: number) => id === 1 ? tx(() => LIVE.claim(DEMO_ACCOUNT)) : sent('winnings added to your balance'),
  expire: () => sent('match released for refund'),
  getMatch: (id: number) => wait(id === 1 ? liveView() : MATCHES.find((m) => m.id === id) ?? match(id, 'live')),
  getPosition: (id: number): Promise<PositionView | null> => wait(id === 1 ? posView() : POS[id] ?? null),
  getPrices: (id: number): Promise<[number, number][]> => wait(id === 1 ? LIVE.history.map(([t, b]) => [t, b]) : []),
  config: (): Promise<Limits> => wait({ owner: DEMO_ACCOUNT, fee_bps: 10, max_bet: AMT(100), unit: AMT(0.01), treasury: '0' }),
  claimable: (id: number) => wait(id === 1 ? LIVE.due(DEMO_ACCOUNT).toString() : id === 4 ? AMT(3) : id === 5 ? AMT(0.3) : '0'),
  listMatches: () => wait(MATCHES.map((m) => (m.id === 1 ? liveView() : m))),
};

