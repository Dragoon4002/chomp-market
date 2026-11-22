"use client";
import { useNearWallet } from "near-connect-hooks";
import { nearToYocto, yoctoToNear } from "near-api-js";
import { demoApi } from "./demo";
import { openSocial, socialCall, socialSignOut, useSocial } from "./social";
import { FASTAUTH } from "./fastauth";

export const ASSETS_ID = process.env.NEXT_PUBLIC_ASSETS_ID || "v2.brawler-monsters-5c8e2b.testnet";
export const BRAWLER_URL = process.env.NEXT_PUBLIC_BRAWLER_URL || "http://localhost:3000";
// ponytail: hosted fallbacks are placeholders; set NEXT_PUBLIC_<GAME>_URL per deploy
export const GAMES = [
  { id: "ribbon", soon: true, name: "Ribbon Rush", url: process.env.NEXT_PUBLIC_RIBBON_URL || "https://ribbon-rush.vercel.app", desc: "Fast-paced racing battles with strategy and power-ups." },
  { id: "brawler", name: "Brawler Arena", url: BRAWLER_URL, desc: "Action-packed arena battles with unique heroes and abilities." },
  { id: "keyfall", soon: true, name: "Keyfall", url: process.env.NEXT_PUBLIC_KEYFALL_URL || "http://localhost:3004", desc: "Type fast, shoot down bombers, defend your city in a 1v1 duel." },
  { id: "coinflip", soon: true, name: "CoinFlip", url: process.env.NEXT_PUBLIC_COINFLIP_URL || "http://localhost:3003", desc: "Heads or tails, settled on NEAR. A simple, fast, and fair game." },
];
export const art = (f: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/dash/${f}`;
export const DEMO =
  process.env.NEXT_PUBLIC_DEMO === "1" ||
  (typeof window !== "undefined" &&
    (new URLSearchParams(location.search).has("demo") || sessionStorage.getItem("demo") === "1") &&
    (sessionStorage.setItem("demo", "1"), true));
const GAS = "30000000000000", GAS_X = "100000000000000";
const STORAGE = nearToYocto("0.02"); // contract refunds unused storage deposit

export const STAT_KINDS = ["Power", "Agility", "Durability", "Speed"] as const;
export const EFFECT_KINDS = ["AirJump", "Lifesteal", "QuickDodge", "SecondWind"] as const;
export const KINDS = [...STAT_KINDS, ...EFFECT_KINDS];
export const RARITIES = ["Common", "Rare", "Epic"] as const;
export type Kind = (typeof KINDS)[number];
export type Rarity = (typeof RARITIES)[number];

export interface Skill {
  id: number; collection: number; name: string; kind: Kind; mag: number; rarity: Rarity;
  max_supply: number | null; minted: number; creator: string; royalty_bps: number; media: string;
  floor: string | null; last_price: string | null; listed_qty: number;
}
export interface Collection { id: number; name: string; description: string; media: string; creator: string }
export interface Presale {
  id: number; skill: number; price: string; start_ms: number; end_ms: number | null;
  cap_total: number | null; per_wallet: number | null; sold: number; allowlist: boolean; ended: boolean;
}
export interface SkillListing { seller: string; skill: number; qty: number; price_each: string }
export interface Dna { str: number; dex: number; def: number; spd: number; hue: number; accent: number }
export interface Monster {
  token_id: string; owner_id: string; name: string; gen: number; dna: Dna;
  record: { w: number; l: number; ko: number }; price: string | null; locked_until_ms: number;
  skills: { id: number; kind: Kind; mag: number }[];
}
export interface Holding { skill: number; free: number; listed: number; equipped: number }
export type Point = [number, string];
export interface NewSkill { collection: number; name: string; kind: Kind; mag: number; rarity: Rarity; max_supply: number | null; royalty_bps: number; media: string }
export interface NewPresale { skill: number; price: string; start_ms: number; end_ms: number | null; cap_total: number | null; per_wallet: number | null; allowlist: string[] | null }

export interface Api {
  demo: boolean; account: string | null; signIn(): void; signOut(): void;
  skills(): Promise<Skill[]>;
  collections(): Promise<Collection[]>;
  presales(): Promise<Presale[]>;
  monsters(): Promise<Monster[]>;
  monster(id: string): Promise<Monster | null>;
  history(key: string): Promise<Point[]>;
  skillListings(skill: number): Promise<SkillListing[]>;
  presaleBought(id: number): Promise<number>;
  presaleAllowed(id: number): Promise<boolean>;
  isCreator(): Promise<boolean>;
  holdings(): Promise<Holding[]>;
  myMonsters(): Promise<Monster[]>;
  owed(): Promise<string>;
  buySkill(l: SkillListing, qty: number): Promise<unknown>;
  listSkill(skill: number, qty: number, priceEach: string): Promise<unknown>;
  cancelSkillListing(skill: number): Promise<unknown>;
  buyPresale(p: Presale, qty: number): Promise<unknown>;
  buyMonster(m: Monster): Promise<unknown>;
  listMonster(id: string, price: string): Promise<unknown>;
  delistMonster(id: string): Promise<unknown>;
  createCollection(c: { name: string; description: string; media: string }): Promise<unknown>;
  createSkill(s: NewSkill): Promise<unknown>;
  createPresale(p: NewPresale): Promise<unknown>;
  withdrawOwed(): Promise<unknown>;
}

const cache = new Map<string, { t: number; p: Promise<unknown> }>();
const cached = <T,>(key: string, f: () => Promise<T>): Promise<T> => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 30_000) return hit.p as Promise<T>;
  const p = f().catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { t: Date.now(), p });
  return p;
};

export function useAssets(): Api {
  const w = useNearWallet();
  const social = useSocial();
  if (DEMO) return demoApi;
  const me = social?.accountId || w.signedAccountId || null;
  const view = <T,>(method: string, args: Record<string, unknown> = {}) =>
    w.viewFunction({ contractId: ASSETS_ID, method, args }) as Promise<T>;
  const call = (method: string, args: Record<string, unknown>, deposit: bigint | string = "1", gas = GAS) => {
    cache.clear();
    const p = { contractId: ASSETS_ID, method, args, gas, deposit: String(deposit) };
    return social ? socialCall(social, p) : w.callFunction(p);
  };
  const page = <T,>(method: string) => cached(method, async () => {
    const all: T[] = [];
    for (let from = 0; ; from += 50) {
      const rows = await view<T[]>(method, { from, limit: 50 });
      all.push(...rows);
      if (rows.length < 50) return all;
    }
  });
  const mine = () => (me ? view<Monster[]>("monsters_of", { account_id: me, from: 0, limit: 50 }) : Promise.resolve([]));
  return {
    demo: false, account: me, signIn: () => (FASTAUTH.enabled ? openSocial() : w.signIn()), signOut: () => (social ? socialSignOut() : w.signOut()),
    skills: () => page<Skill>("skill_types"),
    collections: () => page<Collection>("collections"),
    presales: () => page<Presale>("presales"),
    monsters: () => page<Monster>("listings"),
    monster: (id) => view<Monster | null>("get_monster", { token_id: id }),
    history: (key) => cached(`h:${key}`, () => view<Point[]>("price_history", { key })),
    skillListings: (skill) => view<SkillListing[]>("skill_listings", { skill, from: 0, limit: 50 }),
    presaleBought: (id) => (me ? view<number>("presale_bought", { id, account_id: me }) : Promise.resolve(0)),
    presaleAllowed: (id) => (me ? view<boolean>("presale_allowed", { id, account_id: me }) : Promise.resolve(false)),
    isCreator: () => (me ? view<boolean>("is_creator", { account_id: me }) : Promise.resolve(false)),
    holdings: async () => {
      if (!me) return [];
      const [rows, mons] = await Promise.all([view<[number, number, number][]>("skills_of", { account_id: me }), mine()]);
      return rows.map(([skill, free, listed]) => ({ skill, free, listed, equipped: mons.flatMap((m) => m.skills).filter((s) => s.id === skill).length }));
    },
    myMonsters: mine,
    owed: () => (me ? view<string>("owed_of", { account_id: me }) : Promise.resolve("0")),
    buySkill: (l, qty) => call("buy_skill", { seller: l.seller, skill: l.skill, qty }, BigInt(l.price_each) * BigInt(qty) + STORAGE, GAS_X),
    listSkill: (skill, qty, priceEach) => call("list_skill", { skill, qty, price_each: priceEach }, STORAGE),
    cancelSkillListing: (skill) => call("cancel_skill_listing", { skill }, "0"),
    buyPresale: (p, qty) => call("buy_presale", { id: p.id, qty }, BigInt(p.price) * BigInt(qty) + STORAGE, GAS_X),
    buyMonster: (m) => call("buy", { token_id: m.token_id }, m.price ?? "0", GAS_X),
    listMonster: (id, price) => call("list", { token_id: id, price }),
    delistMonster: (id) => call("delist", { token_id: id }, "0"),
    createCollection: (c) => call("create_collection", c, STORAGE),
    createSkill: (s) => call("create_skill", { ...s }, STORAGE),
    createPresale: (p) => call("create_presale", { ...p }, STORAGE + nearToYocto("0.002") * BigInt(p.allowlist?.length ?? 0)),
    withdrawOwed: () => call("withdraw_owed", {}, "0", GAS_X),
  };
}

export const toYocto = (n: string | number) => nearToYocto(String(n) as `${number}`).toString();
export const near = (y: string | bigint | null | undefined) => (y == null ? 0 : Number(yoctoToNear(BigInt(y))));
export const fmt = (y: string | bigint | null | undefined) => {
  const n = near(y);
  return n === 0 ? "0" : n < 0.01 ? n.toPrecision(2) : n.toFixed(n < 10 ? 3 : 2).replace(/\.?0+$/, "");
};
export const change24 = (h: Point[]) => {
  if (h.length < 2) return 0;
  const last = near(h[h.length - 1][1]);
  const cut = Date.now() - 86_400_000;
  const prev = near([...h].reverse().find(([t]) => t <= cut)?.[1] ?? h[0][1]);
  return prev ? ((last - prev) / prev) * 100 : 0;
};
export const skillKey = (id: number) => `skill:${id}`;
export const KIND_LABEL: Record<Kind, string> = {
  Power: "Power", Agility: "Agility", Durability: "Durability", Speed: "Speed",
  AirJump: "Air Jump", Lifesteal: "Lifesteal", QuickDodge: "Quick Dodge", SecondWind: "Second Wind",
};
export const KIND_DESC: Record<Kind, string> = {
  Power: "+STR · more damage", Agility: "+DEX · faster startup", Durability: "+DEF · less knockback", Speed: "+SPD · faster run",
  AirJump: "3 air jumps instead of 2", Lifesteal: "Heal 1/5 of damage dealt", QuickDodge: "Dodge cooldown −1/3", SecondWind: "Heal 30 once per stock at ≤50 HP",
};
