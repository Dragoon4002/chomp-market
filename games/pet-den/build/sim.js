// Pet Den sim: pure, integer-only, no clock. Mirror of program/src/sim.rs (same constants, same order).
export const MAX = 100, SICK_BELOW = 20, HAPPY_AT = 50, MAX_CATCHUP = 10000;
export const NEED = [20, 60, 150]; // xp to evolve out of tier i
export const TIERS = ['Hatchling', 'Junior', 'Adult', 'Elder'];
export const SPECIES = ['bramdra', 'grodrasu', 'lortor', 'makvel', 'torfen'];

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
const SYL = ['gro', 'mak', 'zu', 'rha', 'vel', 'tor', 'ki', 'bram', 'ox', 'nyx', 'pel', 'dra', 'su', 'qua', 'lor', 'fen'];
export function lookOf(dna) {
  const r = rng(dna);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const n = pick(SYL) + pick(SYL);
  return { species: pick(SPECIES), hue: Math.floor(r() * 360), name: n[0].toUpperCase() + n.slice(1) };
}

export const newStats = () => ({ full: 80, joy: 80, energy: 80, hygiene: 80, health: 100, asleep: false, alive: true, tier: 0, xp: 0, age: 0, streak: 0, best_streak: 0 });
const low = (s) => Math.min(s.full, s.joy, s.energy, s.hygiene);
export const isSick = (s) => low(s) < SICK_BELOW;
const add = (v, d) => Math.max(0, Math.min(MAX, v + d));

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
export function act(s, kind, score = 0) {
  if (!s.alive) return 'Dead';
  if (s.asleep && kind !== 'sleep') return 'Asleep';
  if (kind === 'feed') {
    if (s.full >= 90) s.joy = add(s.joy, -10); // overfed
    s.full = add(s.full, 25); s.hygiene = add(s.hygiene, -5);
  } else if (kind === 'play') {
    if (s.energy < 10) return 'Tired';
    score = Math.max(0, Math.min(10, score | 0));
    s.energy -= 10; s.joy = add(s.joy, 5 + 3 * score); s.xp += score;
  } else if (kind === 'clean') s.hygiene = MAX;
  else if (kind === 'sleep') s.asleep = !s.asleep;
  else return 'BadAction';
  return null;
}

export function evolve(s) {
  if (!s.alive) return 'Dead';
  if (s.tier >= NEED.length) return 'MaxTier';
  if (s.xp < NEED[s.tier]) return 'NotReady';
  if (isSick(s)) return 'Sick';
  s.tier++; s.health = MAX;
  return null;
}

// EF: what the pet would list for. Tier dominates, best care streak adds a premium. Display only.
export const valueOf = (s) => Math.round((s.tier + 1) ** 2 * 10 * (1 + s.best_streak / 100)) / 10;
export const scoreOf = (s) => s.tier * 1000 + s.xp;
