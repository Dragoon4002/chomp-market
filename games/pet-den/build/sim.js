// Pet Den sim: pure, integer-only, no clock. Mirror of program/src/sim.rs (same constants, same order).
export const MAX = 100, SICK_BELOW = 20, HAPPY_AT = 50, MAX_CATCHUP = 10000;
export const NEED = [20, 60, 150]; // xp to evolve out of tier i
export const TIERS = ['Baby', 'Junior', 'Adult', 'Elder']; // the egg is pre-tier (hatch = create)
export const SPECIES = ['bramdra', 'grodrasu', 'lortor', 'makvel', 'torfen'];
export const KIN = ['Emberkin', 'Tidekin', 'Frostkin', 'Thornkin', 'Shadowkin']; // display names per species
export const HABITATS = [
  { name: 'Moonlit Grove', aura: 'Moonlight', tags: ['🌙 Moon', '🌀 Shadow', '🍃 Calm'] },
  { name: 'Crystal Lagoon', aura: 'Crystal Focus', tags: ['💎 Crystal', '💧 Tide', '✨ Clarity'] },
  { name: 'Ember Cliffs', aura: 'Ember Heat', tags: ['🔥 Ember', '⛰️ Stone', '⚡ Fury'] },
];
export const HAB_AURA = 20, HOME_BONUS = 25, SMART = 50, SMART_BONUS = 15, INTERACT_CD = 5, LEVEL_XP = 10;
export const PERSONALITY = ['Playful', 'Brave', 'Curious', 'Calm', 'Sassy', 'Loyal'];
export const RARITY = ['Common', 'Rare', 'Epic', 'Legendary'];

// mulberry32, same as games/brawler genes.ts / monster-siege sim.js
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// DNA u32 bytes: 0 species, 1 hue, 2 str base, 3 int base (same layout as Stats::new in sim.rs).
const byte = (dna, i) => (dna >>> (8 * i)) & 0xff;
const SYL = ['gro', 'mak', 'zu', 'rha', 'vel', 'tor', 'ki', 'bram', 'ox', 'nyx', 'pel', 'dra', 'su', 'qua', 'lor', 'fen'];
export function lookOf(dna) {
  const r = rng(dna), pick = (xs) => xs[Math.floor(r() * xs.length)];
  const n = pick(SYL) + pick(SYL), kind = byte(dna, 0) % 5, base = byte(dna, 2) % 21 + byte(dna, 3) % 21; // 0..40
  return {
    kind, species: SPECIES[kind], kin: KIN[kind], name: n[0].toUpperCase() + n.slice(1),
    hue: (byte(dna, 1) % 81) - 40, // mild tint so the species stays readable
    personality: PERSONALITY[(byte(dna, 2) ^ byte(dna, 3)) % 6],
    rarity: RARITY[base >= 34 ? 3 : base >= 26 ? 2 : base >= 16 ? 1 : 0],
  };
}

// Copy of breed() in games/brawler/client/src/lib/genes.ts, on our 4-byte DNA: each gene from a or b,
// hue mixed, 20% chance one gene mutates. Pure + seeded. TODO(solana): breed ix + VRF seed.
export function breed(a, b, seed) {
  const r = rng(seed), from = (i) => (r() < 0.5 ? byte(a, i) : byte(b, i));
  const g = [from(0), 0, from(2), from(3)];
  const ha = byte(a, 1), hb = byte(b, 1), t = r(); // hueMix: shortest way round the 256-step wheel
  let d = ((hb - ha + 384) % 256) - 128;
  g[1] = (ha + Math.round(d * t) + 256) % 256;
  let mutated = null;
  if (r() < 0.2) { mutated = Math.floor(r() * 4); g[mutated] = Math.floor(r() * 256); }
  return { dna: (g[0] | (g[1] << 8) | (g[2] << 16) | (g[3] << 24)) >>> 0, mutated };
}

export const newStats = (dna = 0) => ({
  full: 80, joy: 80, energy: 80, hygiene: 80, health: 100, asleep: false, alive: true, tier: 0, xp: 0, age: 0, streak: 0, best_streak: 0,
  str: 10 + byte(dna, 2) % 21, int: 10 + byte(dna, 3) % 21, kind: byte(dna, 0) % 5, habitat: 0, calm_until: 0,
});
const low = (s) => Math.min(s.full, s.joy, s.energy, s.hygiene);
export const isSick = (s) => low(s) < SICK_BELOW;
const add = (v, d) => Math.max(0, Math.min(MAX, v + d));
export const level = (s) => 1 + Math.floor(s.xp / LEVEL_XP);
// Environment influence on evolve readiness, as [label, %] rows (bonus() in sim.rs is their sum).
export const influence = (s) => [
  [HABITATS[s.habitat].aura, HAB_AURA],
  ...((s.kind + 2) % 3 === s.habitat ? [['Home turf', HOME_BONUS]] : []),
  ...(s.int >= SMART ? [['High Intelligence', SMART_BONUS]] : []),
];
export const bonus = (s) => influence(s).reduce((a, [, p]) => a + p, 0);
export const ready = (s) => (s.tier >= NEED.length ? 100 : Math.min(100, Math.floor((s.xp * (100 + bonus(s))) / NEED[s.tier])));

function tick1(s) {
  s.age++;
  s.full = add(s.full, -1);
  s.hygiene = add(s.hygiene, -1);
  if (s.asleep) { s.energy = add(s.energy, 3); if (s.energy === MAX) s.asleep = false; }
  else { s.energy = add(s.energy, -1); s.joy = add(s.joy, -1); }
  if (isSick(s)) {
    s.health = add(s.health, -2); s.streak = 0;
    if (s.health === 0) s.alive = false; // ran away
  } else if (low(s) >= HAPPY_AT) {
    s.health = add(s.health, 1); s.xp++; s.streak++; s.best_streak = Math.max(s.best_streak, s.streak);
  }
}

export function advance(s, n) {
  for (let i = 0; i < Math.min(n, MAX_CATCHUP) && s.alive; i++) tick1(s);
  return s;
}

// Returns null on success, else an error string (same names as SimError).
// kind: feed|play|clean|sleep|train|interact|habitat. score: mini-game 0-10 (habitat: index). boost: item used (0/1).
export function act(s, kind, score = 0, boost = 0) {
  if (!s.alive) return 'Dead';
  if (s.asleep && kind !== 'sleep') return 'Asleep';
  const b = Math.min(1, boost | 0);
  if (kind === 'feed') {
    if (s.full >= 90) s.joy = add(s.joy, -10); // overfed
    s.full = add(s.full, 25 + 15 * b); s.hygiene = add(s.hygiene, -5); s.joy = add(s.joy, 5 * b);
  } else if (kind === 'play') {
    if (s.energy < 10) return 'Tired';
    score = Math.max(0, Math.min(10, score | 0));
    s.energy -= 10; s.joy = add(s.joy, 5 + 3 * score + 10 * b); s.xp += score; s.int = add(s.int, 1 + (score >> 2));
  } else if (kind === 'clean') { s.hygiene = MAX; s.health = add(s.health, 5 * b); }
  else if (kind === 'sleep') s.asleep = !s.asleep;
  else if (kind === 'train') {
    if (s.energy < 15) return 'Tired';
    s.energy -= 15; s.full = add(s.full, -5); s.str = add(s.str, 2); s.xp += 1;
  } else if (kind === 'interact') {
    if (s.age < s.calm_until) return 'Cooldown';
    s.joy = add(s.joy, 10); s.calm_until = s.age + INTERACT_CD;
  } else if (kind === 'habitat') {
    if (!(score >= 0 && score < 3)) return 'BadAction';
    s.habitat = score;
  } else return 'BadAction';
  return null;
}

export function evolve(s) {
  if (!s.alive) return 'Dead';
  if (s.tier >= NEED.length) return 'MaxTier';
  if (ready(s) < 100) return 'NotReady';
  if (isSick(s)) return 'Sick';
  s.tier++; s.health = MAX;
  return null;
}

// EF: what the pet would list for. Tier dominates, best care streak adds a premium. Display only.
export const valueOf = (s) => Math.round((s.tier + 1) ** 2 * 10 * (1 + s.best_streak / 100)) / 10;
export const scoreOf = (s) => s.tier * 1000 + s.xp;
