import { useNearWallet } from '@xyz/platform';
import { sanitize, sanitizeSkills, SKILL_KINDS, type Monster, type Skill, type SkillKind } from './genes.ts';
import { DEMO, demoMonsters } from './demo.ts';

export const MONSTERS_ID: string = process.env.NEXT_PUBLIC_MONSTERS_ID ?? 'v2.brawler-monsters-5c8e2b.testnet';
export const MARKET_URL: string = process.env.NEXT_PUBLIC_MARKET_URL ?? 'http://localhost:3100';
const GAS = '30000000000000', GAS_X = '100000000000000';
const NEAR = (n: number) => (BigInt(Math.round(n * 1000)) * 10n ** 21n).toString();

// Contract JSON (see tasks/economy-spec.md)
export interface MonsterView {
  token_id: string; owner_id: string; name: string; gen: number; parents: [string, string] | null; breeder: string;
  born_ms: number; dna: unknown; record: { w: number; l: number; ko: number }; titles: string[];
  price: string | null; rent_offer: { price_per_day: string; max_days: number } | null;
  rental: { renter: string; until_ms: number } | null; locked_until_ms: number; cooldown_until_ms: number;
  skills?: { id: number; kind: unknown; mag: number }[];
}
export type Rarity = 'Common' | 'Rare' | 'Epic';
export interface SkillType { id: number; name: string; kind: SkillKind; mag: number; rarity: Rarity; media?: string }
export interface OwnedSkill extends SkillType { free: number; listed: number }
export interface HistoryEntry { match_id: number; vs: string | null; won: boolean | null; kos: number; ms: number; tournament: number | null }
export interface ConfigView { owner: string; arena: string; treasury: string; breed_fee: string; market_fee_bps: number; royalty_bps: number; rent_fee_bps: number }

export type NftMonster = Monster & {
  owner: string; breeder: string; titles: string[]; price?: string;
  rentOffer?: { pricePerDay: string; maxDays: number }; rental?: { renter: string; untilMs: number };
  lockedUntil: number; cooldownUntil: number;
  skills: Skill[]; skillIds: number[]; // equipped
};

const toSkillType = (v: any): SkillType | null => {
  const kind = SKILL_KINDS.find((k) => k === v?.kind);
  return kind ? { id: +v.id, name: String(v.name ?? kind), kind, mag: +v.mag || 1, rarity: (['Common', 'Rare', 'Epic'] as const).find((r) => r === v.rarity) ?? 'Common', media: v.media } : null;
};
// skills_of rows: [skill, free, listed] tuples (U128 strings) or {skill|id, free, listed}.
export const joinOwned = (rows: any[], types: SkillType[]): OwnedSkill[] => rows.flatMap((r) => {
  const [id, free, listed] = Array.isArray(r) ? r : [r.skill ?? r.id, r.free, r.listed];
  const t = types.find((x) => x.id === +id);
  return t && +free + +(listed ?? 0) > 0 ? [{ ...t, free: +free, listed: +(listed ?? 0) }] : [];
});

export const toMonster = (v: MonsterView): NftMonster => ({
  id: v.token_id, name: v.name, gen: v.gen, parents: v.parents ?? null, born: v.born_ms,
  record: { w: v.record?.w ?? 0, l: v.record?.l ?? 0, ko: v.record?.ko ?? 0 }, dna: sanitize(v.dna),
  owner: v.owner_id, breeder: v.breeder, titles: v.titles ?? [],
  price: v.price ?? undefined,
  rentOffer: v.rent_offer ? { pricePerDay: v.rent_offer.price_per_day, maxDays: v.rent_offer.max_days } : undefined,
  rental: v.rental ? { renter: v.rental.renter, untilMs: v.rental.until_ms } : undefined,
  lockedUntil: v.locked_until_ms ?? 0, cooldownUntil: v.cooldown_until_ms ?? 0,
  skills: sanitizeSkills(v.skills), skillIds: (v.skills ?? []).map((s) => +s.id),
});

export interface MonstersApi {
  mine(): Promise<NftMonster[]>; // owned + rented-in
  get(id: string): Promise<NftMonster | null>;
  history(id: string): Promise<HistoryEntry[]>;
  hatchStarters(): Promise<unknown>;
  startersClaimed(): Promise<boolean>;
  breed(a: string, b: string): Promise<NftMonster | null>;
  list(id: string, yocto: string): Promise<unknown>;
  delist(id: string): Promise<unknown>;
  buy(id: string, yocto: string): Promise<unknown>;
  offerRent(id: string, perDayYocto: string, maxDays: number): Promise<unknown>;
  cancelRent(id: string): Promise<unknown>;
  rent(id: string, days: number, totalYocto: string): Promise<unknown>;
  listings(): Promise<NftMonster[]>;
  rentOffers(): Promise<NftMonster[]>;
  config(): Promise<ConfigView>;
  owed(): Promise<string>; // failed sale/rent payouts waiting for you (yocto)
  withdrawOwed(): Promise<unknown>;
  skillTypes(): Promise<SkillType[]>;
  skills(): Promise<OwnedSkill[]>; // your balances (free units; equipped ones sit on the monster)
  equip(id: string, skillIds: number[]): Promise<unknown>; // replaces the whole loadout
}

export function useMonsters(): MonstersApi {
  const w = useNearWallet();
  if (DEMO) return demoMonsters;
  const call = (method: string, args: Record<string, unknown>, deposit = '0', gas = GAS) =>
    w.callFunction({ contractId: MONSTERS_ID, method, args, gas, deposit });
  const view = <T,>(method: string, args: Record<string, unknown> = {}) =>
    w.viewFunction({ contractId: MONSTERS_ID, method, args }) as Promise<T>;
  const views = async (method: string, args: Record<string, unknown>) => (await view<MonsterView[]>(method, args)).map(toMonster);
  const config = () => view<ConfigView>('config');
  const skillTypes = async () => {
    const all: unknown[] = [];
    for (let from = 0; ; from += 50) {
      const page = await view<unknown[]>('skill_types', { from, limit: 50 });
      all.push(...page);
      if (page.length < 50) return all.map(toSkillType).filter((t): t is SkillType => !!t);
    }
  };
  return {
    mine: async () => {
      const me = w.signedAccountId;
      if (!me) return [];
      const [own, rented] = await Promise.all([views('monsters_of', { account_id: me, from: 0, limit: 100 }), views('rented_by', { account_id: me })]);
      return [...own, ...rented.filter((r) => !own.some((o) => o.id === r.id))];
    },
    get: async (id) => { const v = await view<MonsterView | null>('get_monster', { token_id: id }); return v ? toMonster(v) : null; },
    history: (id) => view<HistoryEntry[]>('get_history', { token_id: id }),
    hatchStarters: () => call('hatch_starters', {}, NEAR(0.1), GAS_X),
    startersClaimed: () => view<boolean>('starters_claimed', { account_id: w.signedAccountId }),
    breed: async (a, b) => {
      const fee = BigInt((await config()).breed_fee) + BigInt(NEAR(0.05)); // fee + storage; contract refunds excess
      const v = await call('breed', { a, b }, fee.toString(), GAS_X) as MonsterView | null;
      return v ? toMonster(v) : null;
    },
    list: (id, yocto) => call('list', { token_id: id, price: yocto }, '1'),
    delist: (id) => call('delist', { token_id: id }),
    buy: (id, yocto) => call('buy', { token_id: id }, yocto, GAS_X),
    offerRent: (id, perDay, maxDays) => call('offer_rent', { token_id: id, price_per_day: perDay, max_days: maxDays }, '1'),
    cancelRent: (id) => call('cancel_rent_offer', { token_id: id }),
    rent: (id, days, total) => call('rent', { token_id: id, days }, total, GAS_X),
    listings: () => views('listings', { from: 0, limit: 50 }),
    rentOffers: () => views('rent_offers', { from: 0, limit: 50 }),
    config,
    owed: async () => (w.signedAccountId ? view<string>('owed_of', { account_id: w.signedAccountId }) : '0'),
    withdrawOwed: () => call('withdraw_owed', {}, '0', GAS_X),
    skillTypes,
    skills: async () => {
      if (!w.signedAccountId) return [];
      const [rows, types] = await Promise.all([view<any[]>('skills_of', { account_id: w.signedAccountId }), skillTypes()]);
      return joinOwned(rows, types);
    },
    equip: (id, skillIds) => call('equip', { token_id: id, skills: skillIds }, '1', GAS_X),
  };
}
