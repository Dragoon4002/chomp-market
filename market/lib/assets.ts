"use client";
import { demoApi } from "./demo";

export const ASSETS_ID = process.env.NEXT_PUBLIC_ASSETS_ID || "";
export const BRAWLER_URL = process.env.NEXT_PUBLIC_BRAWLER_URL || "http://localhost:3000";
// ponytail: hosted fallbacks are placeholders; set NEXT_PUBLIC_<GAME>_URL per deploy
export const GAMES = [
  { id: "ribbon", soon: true, name: "Ribbon Rush", url: process.env.NEXT_PUBLIC_RIBBON_URL || "https://ribbon-rush.vercel.app", desc: "Fast-paced racing battles with strategy and power-ups." },
  { id: "brawler", name: "Brawler Arena", url: BRAWLER_URL, desc: "Action-packed arena battles with unique heroes and abilities." },
  { id: "keyfall", soon: true, name: "Keyfall", url: process.env.NEXT_PUBLIC_KEYFALL_URL || "http://localhost:3004", desc: "Type fast, shoot down bombers, defend your city in a 1v1 duel." },
  { id: "coinflip", soon: true, name: "CoinFlip", url: process.env.NEXT_PUBLIC_COINFLIP_URL || "http://localhost:3003", desc: "Heads or tails. A simple, fast, and fair game." },
];
export const art = (f: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/dash/${f}`;
export const DEMO =
  process.env.NEXT_PUBLIC_DEMO === "1" ||
  (typeof window !== "undefined" &&
    (new URLSearchParams(location.search).has("demo") || sessionStorage.getItem("demo") === "1") &&
    (sessionStorage.setItem("demo", "1"), true));

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

// TODO(solana): wallet adapter + program/MagicBlock reads. Signed-out stub: views come back empty, calls throw.
const SOON = () => Promise.reject(new Error("On-chain trading coming soon (Solana port in progress)"));
const none = <T,>(v: T) => () => Promise.resolve(v);

export function useAssets(): Api {
  if (DEMO) return demoApi;
  return {
    demo: false, account: null, signIn: () => alert("Wallet sign-in coming soon (Solana port in progress)"), signOut: () => {},
    skills: none([]), collections: none([]), presales: none([]), monsters: none([]), monster: none(null), history: none([]),
    skillListings: none([]), presaleBought: none(0), presaleAllowed: none(false), isCreator: none(false), holdings: none([]),
    myMonsters: none([]), owed: none("0"),
    buySkill: SOON, listSkill: SOON, cancelSkillListing: SOON, buyPresale: SOON, buyMonster: SOON, listMonster: SOON,
    delistMonster: SOON, createCollection: SOON, createSkill: SOON, createPresale: SOON, withdrawOwed: SOON,
  };
}

// TODO(solana): 24-decimal base units kept from the old chain; switch to lamports (1e9).
export const toYocto = (n: string | number) => {
  const [i, f = ""] = String(n).split(".");
  return (BigInt(i || "0") * 10n ** 24n + BigInt((f + "0".repeat(24)).slice(0, 24))).toString();
};
export const amount = (y: string | bigint | null | undefined) => (y == null ? 0 : Number(BigInt(y)) / 1e24);
export const fmt = (y: string | bigint | null | undefined) => {
  const n = amount(y);
  return n === 0 ? "0" : n < 0.01 ? n.toPrecision(2) : n.toFixed(n < 10 ? 3 : 2).replace(/\.?0+$/, "");
};
export const change24 = (h: Point[]) => {
  if (h.length < 2) return 0;
  const last = amount(h[h.length - 1][1]);
  const cut = Date.now() - 86_400_000;
  const prev = amount([...h].reverse().find(([t]) => t <= cut)?.[1] ?? h[0][1]);
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
