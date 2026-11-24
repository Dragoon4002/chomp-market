import { SOON } from '@xyz/platform';
import { sanitize, sanitizeSkills, SKILL_KINDS, type Monster, type Skill, type SkillKind } from './genes.ts';
import { DEMO, demoMonsters } from './demo.ts';

export const MONSTERS_ID: string = process.env.NEXT_PUBLIC_MONSTERS_ID ?? '';
export const MARKET_URL: string = process.env.NEXT_PUBLIC_MARKET_URL ?? '/';

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

// Monster NFTs + skill tokens have no Solana program yet: reads are empty (local monsters only), writes reject with SOON.
const off = (..._: unknown[]): Promise<never> => Promise.reject(new Error(SOON));
const NFT_OFF: MonstersApi = {
  mine: async () => [], get: async () => null, history: async () => [], startersClaimed: async () => true,
  listings: async () => [], rentOffers: async () => [], owed: async () => '0', skillTypes: async () => [], skills: async () => [],
  hatchStarters: off, breed: off, list: off, delist: off, buy: off, offerRent: off, cancelRent: off, rent: off, config: off, withdrawOwed: off, equip: off,
};
export function useMonsters(): MonstersApi {
  return DEMO ? demoMonsters : NFT_OFF;
}
