// Copied from games/brawler/client/src/lib/genes.ts (rng, Dna, randomDna, skills, lookOf). Don't import across games.

export interface Dna {
  str: number; dex: number; def: number; spd: number; // 3..9 each, sum 22
  hue: number; accent: number; // 0..359
  horn: number; // 0..3
  tail: number; // 0..2
  pattern: number; // 0..2
  eye: number; // 0..3
  size: number; // 90..115 (% visual scale only)
}

export const STAT_KEYS = ['str', 'dex', 'def', 'spd'] as const;
export const STAT_SUM = 22;

// mulberry32: tiny seeded PRNG.
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

// Push stats back into 3..9 with sum 22, nudging random stats.
function normalize(d: Dna, r: () => number) {
  for (const k of STAT_KEYS) d[k] = Math.max(3, Math.min(9, Math.round(d[k])));
  let sum = STAT_KEYS.reduce((s, k) => s + d[k], 0);
  while (sum !== STAT_SUM) {
    const k = pick(r, STAT_KEYS);
    if (sum > STAT_SUM && d[k] > 3) { d[k]--; sum--; }
    else if (sum < STAT_SUM && d[k] < 9) { d[k]++; sum++; }
  }
  return d;
}

export function randomDna(seed: number): Dna {
  const r = rng(seed);
  return normalize({
    str: int(r, 3, 9), dex: int(r, 3, 9), def: int(r, 3, 9), spd: int(r, 3, 9),
    hue: int(r, 0, 359), accent: int(r, 0, 359),
    horn: int(r, 0, 3), tail: int(r, 0, 2), pattern: int(r, 0, 2), eye: int(r, 0, 3),
    size: int(r, 92, 112),
  }, r);
}

export const SKILL_KINDS = ['Power', 'Agility', 'Durability', 'Speed', 'AirJump', 'Lifesteal', 'QuickDodge', 'SecondWind'] as const;
export type SkillKind = (typeof SKILL_KINDS)[number];
export interface Skill { kind: SkillKind; mag: number }

export interface Look {
  body: string; belly: string; dark: string; horn: string; eye: string; mark: string;
  hornStyle: number; tailStyle: number; pattern: number; eyeStyle: number; scale: number;
}
export function lookOf(d: Dna): Look {
  return {
    body: `hsl(${d.hue} 58% 56%)`, belly: `hsl(${d.hue} 70% 86%)`, dark: `hsl(${d.hue} 50% 38%)`,
    horn: `hsl(${d.accent} 55% 88%)`, mark: `hsl(${d.accent} 70% 42%)`, eye: '#1b1426',
    hornStyle: d.horn, tailStyle: d.tail, pattern: d.pattern, eyeStyle: d.eye, scale: d.size / 100,
  };
}
