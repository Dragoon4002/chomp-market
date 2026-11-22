import type { Api, Collection, Kind, Monster, Point, Presale, Rarity, Skill, SkillListing } from "./assets";

const ME = "demo.testnet";
const N = (n: number) => (BigInt(Math.round(n * 1e4)) * 10n ** 20n).toString();
const H = 3_600_000, NOW = Date.now();
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), 150));

const collections: Collection[] = [
  { id: 0, name: "Arena Basics", description: "Stat boosts every brawler starts with. Always in stock.", media: "", creator: "brawler-owner.testnet" },
  { id: 1, name: "Ember Forge", description: "Hot-blooded techniques forged in the volcano pits.", media: "", creator: "ember-forge.testnet" },
  { id: 2, name: "Moonlit Moves", description: "Light-footed tricks for aerial fighters.", media: "", creator: ME },
];

const S = (id: number, collection: number, name: string, kind: Kind, mag: number, rarity: Rarity, supply: number | null, minted: number, base: number): Skill & { base: number } => ({
  id, collection, name, kind, mag, rarity, max_supply: supply, minted,
  creator: collections[collection].creator, royalty_bps: collection ? 500 : 0, media: "", floor: null, last_price: null, listed_qty: 0, base,
});
const skills = [
  S(0, 0, "Power I", "Power", 1, "Common", null, 1840, 0.05),
  S(1, 0, "Agility I", "Agility", 1, "Common", null, 1512, 0.05),
  S(2, 0, "Durability I", "Durability", 1, "Common", null, 1377, 0.05),
  S(3, 0, "Speed I", "Speed", 1, "Common", null, 2045, 0.05),
  S(4, 0, "Power II", "Power", 2, "Rare", 200, 200, 0.62),
  S(5, 0, "Agility II", "Agility", 2, "Rare", 200, 184, 0.48),
  S(6, 0, "Durability II", "Durability", 2, "Rare", 200, 171, 0.41),
  S(7, 0, "Speed II", "Speed", 2, "Rare", 200, 196, 0.7),
  S(8, 2, "Moon Hop", "AirJump", 1, "Epic", 100, 88, 2.4),
  S(9, 1, "Ember Fang", "Lifesteal", 1, "Epic", 80, 80, 3.1),
  S(10, 2, "Shadow Slip", "QuickDodge", 1, "Rare", 150, 139, 1.15),
  S(11, 1, "Phoenix Heart", "SecondWind", 1, "Epic", 60, 0, 4.2),
  S(12, 1, "Ember Fury", "Power", 2, "Rare", 200, 137, 0.55),
];

const history: Record<string, Point[]> = {};
const walk = (base: number, n: number, drift: number): Point[] => {
  let p = base * (1 - drift * 0.6);
  return Array.from({ length: n }, (_, i) => {
    p = Math.max(0.01, p * (1 + (rnd() - 0.5) * 0.12 + drift / n));
    return [NOW - (n - i) * 1.5 * H, N(p)] as Point;
  });
};
for (const s of skills) {
  history[`skill:${s.id}`] = s.rarity === "Common" ? walk(0.05, 12, 0).map(([t]) => [t, N(0.05)]) : s.minted === 0 ? [] : walk(s.base, 48, s.id % 3 === 1 ? -0.25 : 0.2 + (s.id % 4) * 0.12);
}
history["monsters"] = walk(3.2, 48, 0.35);

const SELLERS = ["kitsune.testnet", "brawlmaster.testnet", "zed.testnet", "lumen.testnet", "oxide.testnet", "pip.testnet"];
const listings: SkillListing[] = [];
for (const s of skills) {
  if (s.rarity === "Common" || s.minted === 0) continue;
  const n = 2 + (s.id % 3);
  for (let i = 0; i < n; i++) listings.push({ seller: SELLERS[(s.id + i) % SELLERS.length], skill: s.id, qty: 1 + Math.floor(rnd() * 4), price_each: N(s.base * (1 + i * 0.08 + rnd() * 0.05)) });
}
listings.push({ seller: ME, skill: 9, qty: 1, price_each: N(3.6) });

const presales: Presale[] = [
  ...[0, 1, 2, 3].map((skill) => ({ id: skill, skill, price: N(0.05), start_ms: NOW - 30 * 24 * H, end_ms: null, cap_total: null, per_wallet: null, sold: skills[skill].minted, allowlist: false, ended: false })),
  { id: 4, skill: 12, price: N(0.5), start_ms: NOW - 9 * H, end_ms: NOW + 15 * H, cap_total: 200, per_wallet: 2, sold: 137, allowlist: false, ended: false },
  { id: 5, skill: 11, price: N(1.5), start_ms: NOW + 6 * H, end_ms: NOW + 30 * H, cap_total: 60, per_wallet: 1, sold: 0, allowlist: true, ended: false },
  { id: 6, skill: 9, price: N(1.2), start_ms: NOW - 72 * H, end_ms: NOW - 48 * H, cap_total: 80, per_wallet: 2, sold: 80, allowlist: false, ended: true },
];
const bought: Record<number, number> = { 4: 1 };

const NAMES = ["Grubble", "Snaptooth", "Mossback", "Pyrokit", "Vexwing", "Bramblor", "Quillfin", "Lumox", "Thudd", "Zappy", "Cindra"];
const dna = () => {
  const s = [3, 3, 3, 3];
  for (let k = 0; k < 10; k++) { const i = Math.floor(rnd() * 4); if (s[i] < 9) s[i]++; else k--; }
  return { str: s[0], dex: s[1], def: s[2], spd: s[3], hue: Math.floor(rnd() * 360), accent: Math.floor(rnd() * 360) };
};
const monsters: Monster[] = NAMES.map((name, i) => {
  const w = Math.floor(rnd() * 30);
  return {
    token_id: String(100 + i), owner_id: i < 3 ? ME : SELLERS[i % SELLERS.length], name, gen: i % 3, dna: dna(),
    record: { w, l: Math.floor(rnd() * 20), ko: w * 2 + Math.floor(rnd() * 9) }, price: i >= 3 && i !== 9 ? N(1 + rnd() * 7) : i === 2 ? N(4.5) : null,
    locked_until_ms: 0, skills: i === 0 ? [{ id: 3, kind: "Speed", mag: 1 }, { id: 8, kind: "AirJump", mag: 1 }] : i === 1 ? [{ id: 0, kind: "Power", mag: 1 }] : [],
  };
});
const free: Record<number, number> = { 0: 2, 1: 1, 3: 3, 5: 1, 9: 1, 10: 2 };
let owed = N(0.42);

const refresh = () => {
  for (const s of skills) {
    const ls = listings.filter((l) => l.skill === s.id);
    const h = history[`skill:${s.id}`];
    s.floor = ls.length ? ls.reduce((a, l) => (BigInt(l.price_each) < BigInt(a) ? l.price_each : a), ls[0].price_each) : null;
    s.listed_qty = ls.reduce((a, l) => a + l.qty, 0);
    s.last_price = h.length ? h[h.length - 1][1] : null;
  }
};
refresh();
const fail = (m: string) => Promise.reject(new Error(m));
const ok = () => { refresh(); return wait(true); };

export const demoApi: Api = {
  demo: true, account: ME, signIn: () => {}, signOut: () => alert("Demo mode: wallet stays connected."),
  skills: () => wait(skills.map(({ base, ...s }) => (void base, s))),
  collections: () => wait(collections),
  presales: () => wait(presales),
  monsters: () => wait(monsters.filter((m) => m.price)),
  monster: (id) => wait(monsters.find((m) => m.token_id === id) ?? null),
  history: (key) => wait(history[key] ?? []),
  skillListings: (skill) => wait(listings.filter((l) => l.skill === skill).sort((a, b) => (BigInt(a.price_each) < BigInt(b.price_each) ? -1 : 1))),
  presaleBought: (id) => wait(bought[id] ?? 0),
  presaleAllowed: (id) => wait(id !== 5),
  isCreator: () => wait(true),
  holdings: () => wait(skills.flatMap((s) => {
    const listed = listings.filter((l) => l.seller === ME && l.skill === s.id).reduce((a, l) => a + l.qty, 0);
    const equipped = monsters.filter((m) => m.owner_id === ME).flatMap((m) => m.skills).filter((x) => x.id === s.id).length;
    return free[s.id] || listed || equipped ? [{ skill: s.id, free: free[s.id] ?? 0, listed, equipped }] : [];
  })),
  myMonsters: () => wait(monsters.filter((m) => m.owner_id === ME)),
  owed: () => wait(owed),
  buySkill: (l, qty) => {
    const row = listings.find((x) => x.seller === l.seller && x.skill === l.skill);
    if (!row || row.qty < qty) return fail("Listing changed, refresh.");
    if (row.seller === ME) return fail("That's your own listing.");
    row.qty -= qty;
    if (row.qty === 0) listings.splice(listings.indexOf(row), 1);
    free[l.skill] = (free[l.skill] ?? 0) + qty;
    history[`skill:${l.skill}`].push([Date.now(), row.price_each]);
    return ok();
  },
  listSkill: (skill, qty, priceEach) => {
    const have = free[skill] ?? 0;
    if (qty < 1 || qty > have) return fail(`You have ${have} free.`);
    const old = listings.find((x) => x.seller === ME && x.skill === skill);
    if (old) { free[skill] = have + old.qty; listings.splice(listings.indexOf(old), 1); }
    free[skill] -= qty;
    listings.push({ seller: ME, skill, qty, price_each: priceEach });
    return ok();
  },
  cancelSkillListing: (skill) => {
    const old = listings.find((x) => x.seller === ME && x.skill === skill);
    if (old) { free[skill] = (free[skill] ?? 0) + old.qty; listings.splice(listings.indexOf(old), 1); }
    return ok();
  },
  buyPresale: (p, qty) => {
    const ps = presales.find((x) => x.id === p.id)!;
    const now = Date.now();
    if (now < ps.start_ms || (ps.end_ms && now > ps.end_ms) || ps.ended) return fail("Presale is not live.");
    if (ps.allowlist && ps.id === 5) return fail("You're not on the allowlist.");
    if (ps.per_wallet && (bought[ps.id] ?? 0) + qty > ps.per_wallet) return fail(`Max ${ps.per_wallet} per wallet.`);
    if (ps.cap_total && ps.sold + qty > ps.cap_total) return fail("Sold out.");
    ps.sold += qty;
    bought[ps.id] = (bought[ps.id] ?? 0) + qty;
    skills[ps.skill].minted += qty;
    free[ps.skill] = (free[ps.skill] ?? 0) + qty;
    for (let i = 0; i < qty; i++) history[`skill:${ps.skill}`].push([now, ps.price]);
    return ok();
  },
  buyMonster: (m) => {
    const x = monsters.find((y) => y.token_id === m.token_id)!;
    if (x.owner_id === ME) return fail("That's your monster.");
    x.owner_id = ME; history.monsters.push([Date.now(), x.price!]); x.price = null;
    return ok();
  },
  listMonster: (id, price) => { monsters.find((y) => y.token_id === id)!.price = price; return ok(); },
  delistMonster: (id) => { monsters.find((y) => y.token_id === id)!.price = null; return ok(); },
  createCollection: (c) => { collections.push({ ...c, id: collections.length, creator: ME }); return ok(); },
  createSkill: (s) => {
    const id = skills.length;
    skills.push({ ...s, id, minted: 0, creator: ME, floor: null, last_price: null, listed_qty: 0, base: 0 });
    history[`skill:${id}`] = [];
    return ok();
  },
  createPresale: (p) => { presales.push({ ...p, id: presales.length, sold: 0, allowlist: !!p.allowlist?.length, ended: false }); return ok(); },
  withdrawOwed: () => { owed = "0"; return ok(); },
};
