// Tomb Delve game logic. Pure + deterministic: no Math.random, no clock. Same code runs in the browser (animation)
// and in node (sim.mjs); the Private ER program mirrors it. Every exported fn returns a new Run, never mutates input.
import { rng, type Dna, type SkillKind } from './genes.ts';

// ---- sha256 (pure, sync, so node + browser + any replay get the same H) ----
const PRIMES: number[] = [];
for (let n = 2; PRIMES.length < 64; n++) if (PRIMES.every((p) => n % p)) PRIMES.push(n);
const frac = (x: number) => ((x % 1) * 2 ** 32) | 0;
const K = PRIMES.map((p) => frac(Math.cbrt(p)));
const H0 = PRIMES.slice(0, 8).map((p) => frac(Math.sqrt(p)));
const ror = (x: number, n: number) => (x >>> n) | (x << (32 - n));
export function sha256(msg: string): string {
  const b = Array.from(new TextEncoder().encode(msg)), bits = b.length * 8;
  b.push(0x80);
  while (b.length % 64 !== 56) b.push(0);
  for (let i = 7; i >= 0; i--) b.push(i > 3 ? 0 : (bits >>> (i * 8)) & 255); // ponytail: msg < 512MB
  const h = H0.slice(), w: number[] = [];
  for (let o = 0; o < b.length; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = (b[o + 4 * i] << 24) | (b[o + 4 * i + 1] << 16) | (b[o + 4 * i + 2] << 8) | b[o + 4 * i + 3];
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      w[i] = (w[i - 16] + (ror(x, 7) ^ ror(x, 18) ^ (x >>> 3)) + w[i - 7] + (ror(y, 17) ^ ror(y, 19) ^ (y >>> 10))) | 0;
    }
    let [a, bb, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    [a, bb, c, d, e, f, g, hh].forEach((v, i) => (h[i] = (h[i] + v) | 0));
  }
  return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
const h32 = (hex: string) => parseInt(hex.slice(0, 8), 16);

// ---- tables (numbers from INTAKE.md) ----
export type Cls = 'tank' | 'berserker' | 'rogue' | 'thief';
export type CardId = 'strike' | 'guard' | 'wall' | 'rampage' | 'backstab' | 'pickpocket' | 'leap' | 'drain' | 'evade';
export const CLASSES: Record<Cls, { name: string; stat: string; hp: number; st: number; sig: CardId; passive: string }> = {
  tank: { name: 'Tank', stat: 'def', hp: 40, st: 3, sig: 'wall', passive: 'Block carries over 1 turn' },
  berserker: { name: 'Berserker', stat: 'str', hp: 32, st: 3, sig: 'rampage', passive: '+2 dmg below 50% HP' },
  rogue: { name: 'Rogue', stat: 'spd', hp: 28, st: 4, sig: 'backstab', passive: '15% crit' },
  thief: { name: 'Thief', stat: 'dex', hp: 30, st: 3, sig: 'pickpocket', passive: 'Sees mimics, +1 relic per chest' },
};
export const CARDS: Record<CardId, { name: string; cost: number; kind: 'attack' | 'skill' | 'signature'; text: string; dmg?: number; block?: number }> = {
  strike: { name: 'Strike', cost: 1, kind: 'attack', text: '6 dmg', dmg: 6 },
  guard: { name: 'Guard', cost: 1, kind: 'skill', text: 'Block 5', block: 5 },
  wall: { name: 'Shield Wall', cost: 2, kind: 'signature', text: 'Block 12', block: 12 },
  rampage: { name: 'Rampage', cost: 2, kind: 'signature', text: '6 dmg +1 per missing 10% HP', dmg: 6 },
  backstab: { name: 'Backstab', cost: 1, kind: 'signature', text: '8 dmg, ×2 vs defending', dmg: 8 },
  pickpocket: { name: 'Pickpocket', cost: 1, kind: 'signature', text: '4 dmg, 25% steal a relic', dmg: 4 },
  leap: { name: 'Leap', cost: 1, kind: 'skill', text: 'Avoid the next hit' },
  drain: { name: 'Drain', cost: 1, kind: 'attack', text: '5 dmg, heal 5', dmg: 5 },
  evade: { name: 'Evade', cost: 0, kind: 'skill', text: 'Block 4', block: 4 },
};
export type MonId = 'mummy' | 'scarab' | 'golem' | 'jackal' | 'elite' | 'mimic';
export const MONS: Record<MonId, { name: string; hp: number; atk: number; rule: string }> = {
  mummy: { name: 'Mummy', hp: 22, atk: 6, rule: 'Heals below 30% HP' },
  scarab: { name: 'Scarab Swarm', hp: 14, atk: 5, rule: 'Always attacks' },
  golem: { name: 'Sand Golem', hp: 30, atk: 8, rule: 'Defends every 2nd turn' },
  jackal: { name: 'Jackal', hp: 16, atk: 3, rule: 'Attacks twice' },
  elite: { name: 'Tomb Guardian', hp: 48, atk: 9, rule: 'Defends every 3rd turn' },
  mimic: { name: 'Mimic', hp: 20, atk: 7, rule: 'Always attacks' },
};
const MON4: MonId[] = ['mummy', 'scarab', 'golem', 'jackal'];
export const RELICS = [ // lamports; legendary has no decay
  { name: 'Pottery Shard', art: 'shard', base: 3_400_000, w: 75 },
  { name: 'Bronze Ankh', art: 'ankh', base: 10_000_000, w: 17 },
  { name: 'Gold Mask', art: 'mask', base: 30_000_000, w: 6 },
  { name: 'Canopic Jar', art: 'canopic', base: 100_000_000, w: 1.8 },
  { name: 'Eye of Ra', art: 'eye-of-ra', base: 500_000_000, w: 0.2 },
];
export type ItemId = 'potion' | 'tonic' | 'armor' | 'blade';
export const ITEMS: Record<ItemId, { name: string; art: string; price: number; text: string }> = {
  potion: { name: 'Health Potion', art: 'potion-hp', price: 5_000_000, text: '+15 HP' },
  tonic: { name: 'Stamina Tonic', art: 'tonic', price: 4_000_000, text: '+2 stamina for 1 turn' },
  armor: { name: 'Bronze Armor', art: 'armor', price: 20_000_000, text: '+6 max HP' },
  blade: { name: 'Iron Blade', art: 'blade', price: 20_000_000, text: '+2 dmg' },
};
export const ENTRY = 50_000_000;
export const T_TARGET = 5_000_000_000;
export const ROOMS = 10, MIMIC_P = 0.15, BOOST = 1.3;

// ---- types ----
export interface Intent { kind: 'attack' | 'defend' | 'heal'; n: number; hits: number }
export interface Mon { id: MonId; name: string; hp: number; max: number; atk: number; block: number }
export interface Combat {
  mon: Mon; intent: Intent; draw: CardId[]; hand: CardId[]; disc: CardId[];
  st: number; block: number; carry: number; dodge: boolean; turn: number;
  seed: number; n: number; stolen: boolean; won: boolean; log: string;
}
export interface Room { kind: 'monster' | 'chest' | 'item' | 'elite'; mon: MonId; relic: number; relic2: number; mimic: boolean }
export interface Run {
  vrf: string; runId: string; cls: Cls; skills: SkillKind[];
  hp: number; max: number; dmg: number; potions: number; tonics: number; relics: number[];
  set: number; room: number; H: string; rooms: Room[]; done: boolean; revived: boolean; dead: boolean; c: Combat | null;
}

// Class = highest DNA stat, ties def > str > spd > dex.
export function classOf(d: Dna): Cls {
  const k = (['def', 'str', 'spd', 'dex'] as const).reduce((a, k) => (d[k] > d[a] ? k : a));
  return ({ def: 'tank', str: 'berserker', spd: 'rogue', dex: 'thief' } as const)[k];
}

const has = (r: Run, s: SkillKind) => r.skills.includes(s);
export const stMax = (r: Run) => CLASSES[r.cls].st + (has(r, 'Speed') ? 1 : 0);
const handSize = (r: Run) => (has(r, 'Agility') ? 6 : 5);
const clone = <T,>(x: T): T => structuredClone(x);
const rand = (c: Combat) => rng((c.seed + Math.imul(c.n++, 0x9e3779b9)) >>> 0)();

export function deckOf(cls: Cls, skills: SkillKind[]): CardId[] {
  const sig = CLASSES[cls].sig;
  const d: CardId[] = [sig, sig, 'strike', 'strike', 'strike', 'strike', 'strike', 'strike', 'guard', 'guard', 'guard', 'guard'];
  const swap = (from: CardId, to: CardId) => (d[d.lastIndexOf(from)] = to);
  if (skills.includes('AirJump')) swap('guard', 'leap');
  if (skills.includes('Lifesteal')) swap('strike', 'drain');
  if (skills.includes('QuickDodge')) swap('guard', 'evade');
  return d;
}

function rollTier(r: () => number, set: number) {
  const ws = RELICS.map((x, i) => x.w * BOOST ** ((set - 1) * i)); // each tier step ×BOOST per set
  let u = r() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ws.length; i++) if ((u -= ws[i]) < 0) return i;
  return 0;
}

// H = sha256(vrf ‖ runId ‖ setIdx); rooms decoded from H in order (pity needs the previous rooms).
export function rollSet(vrf: string, runId: string, set: number): { H: string; rooms: Room[] } {
  const H = sha256(`${vrf}|${runId}|${set}`), r = rng(h32(H)), rooms: Room[] = [];
  let pity = 0;
  for (let i = 0; i < ROOMS; i++) {
    const mon = MON4[Math.floor(r() * 4)], relic = rollTier(r, set), relic2 = rollTier(r, set), mimic = r() < MIMIC_P, u = r();
    const chest = Math.min(0.5, 0.24 + 0.05 * pity);
    const kind = i === ROOMS - 1 ? 'elite' : u < 0.01 ? 'item' : u < 0.01 + chest ? 'chest' : 'monster';
    if (kind === 'chest') pity = 0; else if (kind !== 'item') pity++;
    rooms.push({ kind, mon: kind === 'elite' ? 'elite' : mon, relic, relic2, mimic });
  }
  return { H, rooms };
}

export function intentOf(m: Mon, turn: number): Intent {
  const atk: Intent = { kind: 'attack', n: m.atk, hits: 1 };
  if (m.id === 'mummy') return m.hp < m.max * 0.3 ? { kind: 'heal', n: Math.ceil(m.max * 0.2), hits: 0 } : atk;
  if (m.id === 'golem') return turn % 2 === 1 ? { kind: 'defend', n: m.atk + 4, hits: 0 } : atk;
  if (m.id === 'jackal') return { ...atk, hits: 2 };
  if (m.id === 'elite') return turn % 3 === 2 ? { kind: 'defend', n: m.atk + 4, hits: 0 } : atk;
  return atk; // scarab, mimic
}

function shuffle(c: Combat, xs: CardId[]) {
  for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(rand(c) * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; }
  return xs;
}
function drawCards(c: Combat, k: number) {
  for (let i = 0; i < k; i++) {
    if (!c.draw.length) { c.draw = shuffle(c, c.disc); c.disc = []; }
    const x = c.draw.pop();
    if (x) c.hand.push(x);
  }
}

export function startCombat(run: Run, id: MonId): Combat {
  const s = 1 + 0.5 * (run.set - 1), b = MONS[id], hp = Math.round(b.hp * s);
  const mon: Mon = { id, name: b.name, hp, max: hp, atk: Math.round(b.atk * s), block: 0 };
  const c: Combat = {
    mon, intent: intentOf(mon, 0), draw: [], hand: [], disc: [], st: stMax(run), block: 0, carry: 0, dodge: false, turn: 0,
    seed: (h32(run.H) ^ Math.imul(run.room + 1, 0x85ebca6b)) >>> 0, n: 0, stolen: false, won: false, log: `A ${b.name} blocks the way.`,
  };
  c.draw = shuffle(c, deckOf(run.cls, run.skills));
  drawCards(c, handSize(run));
  return c;
}

function enter(r: Run) {
  const room = r.rooms[r.room];
  r.done = false; r.c = null;
  if (room.kind === 'monster' || room.kind === 'elite') r.c = startCombat(r, room.mon);
  if (room.kind === 'item') { r.relics.push(room.relic); r.done = true; }
}

export function newRun(vrf: string, runId: string, cls: Cls, skills: SkillKind[]): Run {
  const hp = CLASSES[cls].hp + (skills.includes('Durability') ? 8 : 0);
  const r: Run = { vrf, runId, cls, skills, hp, max: hp, dmg: 0, potions: 0, tonics: 0, relics: [], set: 0, room: 0, H: '', rooms: [], done: false, revived: false, dead: false, c: null };
  return nextSet(r, vrf);
}

// TODO(solana): VRF — vrf for set N+1 is requested while the player sits at camp.
export function nextSet(run: Run, vrf: string): Run {
  const r = clone(run);
  r.set++; r.vrf = vrf; r.room = 0;
  ({ H: r.H, rooms: r.rooms } = rollSet(vrf, r.runId, r.set));
  enter(r);
  return r;
}

export const atCamp = (r: Run) => r.room >= ROOMS;

export function advance(run: Run): Run {
  if (!run.done || run.dead || atCamp(run)) return run;
  const r = clone(run);
  r.room++;
  if (atCamp(r)) { r.c = null; r.done = false; } else enter(r);
  return r;
}

export function openChest(run: Run): Run {
  const room = run.rooms[run.room];
  if (run.done || run.c || room?.kind !== 'chest') return run;
  const r = clone(run);
  if (room.mimic) { r.c = startCombat(r, 'mimic'); return r; } // monsters drop nothing, mimics included
  r.relics.push(room.relic);
  if (r.cls === 'thief') r.relics.push(room.relic2);
  r.done = true;
  return r;
}
export const ignoreChest = (run: Run): Run => (run.rooms[run.room]?.kind === 'chest' && !run.c && !run.done ? { ...run, done: true } : run);

// Camp purchases (SOL is charged by chain.ts). Inventory only, lost on death.
export function useItem(run: Run, item: ItemId, bought = false): Run {
  const r = clone(run);
  if (item === 'armor') { r.max += 6; r.hp += 6; }
  else if (item === 'blade') r.dmg += 2;
  else if (bought) item === 'potion' ? r.potions++ : r.tonics++;
  else if (item === 'potion' && r.potions > 0 && r.hp < r.max) { r.potions--; r.hp = Math.min(r.max, r.hp + 15); }
  else if (item === 'tonic' && r.tonics > 0 && r.c && !r.c.won) { r.tonics--; r.c.st += 2; }
  return r;
}

export function playCard(run: Run, i: number): Run {
  const c0 = run.c, id = c0?.hand[i];
  if (!c0 || !id || c0.won || run.dead || CARDS[id].cost > c0.st) return run;
  const r = clone(run), c = r.c!, m = c.mon, card = CARDS[id];
  c.st -= card.cost; c.hand.splice(i, 1); c.disc.push(id);
  c.log = card.name;
  if (card.dmg !== undefined) {
    let d = card.dmg + (has(r, 'Power') ? 2 : 0) + r.dmg + (r.cls === 'berserker' && r.hp < r.max / 2 ? 2 : 0);
    if (id === 'rampage') d += Math.floor(((r.max - r.hp) / r.max) * 10);
    if (id === 'backstab' && (m.block > 0 || c.intent.kind === 'defend')) d *= 2;
    if (r.cls === 'rogue' && rand(c) < 0.15) { d *= 2; c.log += ' — crit!'; }
    const a = Math.min(m.block, d);
    m.block -= a; m.hp = Math.max(0, m.hp - (d - a));
    c.log += ` hits for ${d - a}`;
    if (id === 'drain') r.hp = Math.min(r.max, r.hp + 5);
    if (id === 'pickpocket' && !c.stolen && rand(c) < 0.25) { // ponytail: 1 steal per fight, else stalling a healing mummy farms relics
      c.stolen = true;
      r.relics.push(rollTier(() => rand(c), r.set));
      c.log += ', stole a relic!';
    }
    if (m.hp <= 0) { c.won = true; r.done = true; c.log = `${m.name} falls.`; }
  }
  if (card.block) c.block += card.block;
  if (id === 'leap') c.dodge = true;
  return r;
}

// Monster acts on its hidden intent: deterministic from (type, HP%, turn).
function monsterAct(r: Run, c: Combat) {
  const m = c.mon, it = c.intent;
  m.block = 0;
  if (it.kind === 'heal') m.hp = Math.min(m.max, m.hp + it.n);
  if (it.kind === 'defend') m.block = it.n;
  let taken = 0;
  for (let h = 0; h < it.hits; h++) {
    if (c.dodge) { c.dodge = false; continue; }
    let d = it.n;
    const a = Math.min(c.carry, d); c.carry -= a; d -= a;
    const b = Math.min(c.block, d); c.block -= b; d -= b;
    r.hp -= d; taken += d;
  }
  c.log = it.kind === 'attack' ? `${m.name} hits you for ${taken}` : it.kind === 'heal' ? `${m.name} heals ${it.n}` : `${m.name} braces (block ${it.n})`;
}

export function endTurn(run: Run): Run {
  if (!run.c || run.c.won || run.dead) return run;
  const r = clone(run), c = r.c!;
  c.disc.push(...c.hand); c.hand = [];
  monsterAct(r, c);
  if (r.hp <= 0) {
    if (has(r, 'SecondWind') && !r.revived) { r.revived = true; r.hp = Math.ceil(r.max * 0.3); c.log += ' — Second Wind!'; }
    else { r.hp = 0; r.dead = true; return r; }
  }
  c.turn++;
  c.carry = r.cls === 'tank' ? c.block : 0; // tank block lives one extra turn
  c.block = 0;
  c.intent = intentOf(c.mon, c.turn);
  c.st = stMax(r);
  drawCards(c, handSize(r));
  return r;
}

// One ER transaction per turn: card indices into the hand as it shrinks.
export const playTurn = (run: Run, cards: number[]): Run => endTurn(cards.reduce(playCard, run));

// quote = base × 0.92^netSold24h × min(1, T / Ttarget)
export const pawnQuote = (base: number, netSold24h: number, T: number, Ttarget = T_TARGET) =>
  Math.floor(base * 0.92 ** netSold24h * Math.min(1, T / Ttarget));
