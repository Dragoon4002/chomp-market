// Monster genetics: DNA -> fight stats + look, deterministic breeding.
// Pure + seeded so the same rules can be mirrored in the NEAR contract (Phase 2).
import type { Stats } from './sim/sim.ts';

export interface Dna {
  str: number; dex: number; def: number; spd: number; // 3..9 each, sum 22
  hue: number; accent: number; // 0..359
  horn: number; // 0..3
  tail: number; // 0..2
  pattern: number; // 0..2
  eye: number; // 0..3
  size: number; // 90..115 (% visual scale only — hurtbox stays fair)
}

export interface Monster {
  id: string;
  name: string;
  gen: number;
  parents: [string, string] | null;
  born: number; // ms epoch
  record: { w: number; l: number; ko: number };
  dna: Dna;
  skills?: Skill[]; // equipped (chain monsters)
}

export const STAT_KEYS = ['str', 'dex', 'def', 'spd'] as const;
export const STAT_SUM = 22;
const GENE_RANGES = { horn: 4, tail: 3, pattern: 3, eye: 4 } as const;

// mulberry32: tiny seeded PRNG (render/app side only; never used inside the fight sim).
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

const SYL = ['gro', 'mak', 'zu', 'rha', 'vel', 'tor', 'ki', 'bram', 'ox', 'nyx', 'pel', 'dra', 'su', 'qua', 'lor', 'fen'];
export function nameFor(seed: number) {
  const r = rng(seed ^ 0x9e3779b9);
  const n = pick(r, SYL) + pick(r, SYL) + (r() < 0.4 ? pick(r, SYL) : '');
  return n[0].toUpperCase() + n.slice(1);
}

const hueMix = (a: number, b: number, k: number) => {
  const d = ((b - a + 540) % 360) - 180; // shortest arc
  return Math.round((a + d * k + 360) % 360) % 360;
};

// Each gene comes from one parent (stats may blend), hues drift, 20% chance of one mutated gene.
export function breed(a: Dna, b: Dna, seed: number): { dna: Dna; mutated: keyof Dna | null } {
  const r = rng(seed);
  const from = <K extends keyof Dna>(k: K) => (r() < 0.5 ? a[k] : b[k]);
  const d: Dna = {
    str: 0, dex: 0, def: 0, spd: 0,
    hue: hueMix(a.hue, b.hue, r()), accent: from('accent'),
    horn: from('horn'), tail: from('tail'), pattern: from('pattern'), eye: from('eye'),
    size: Math.round((a.size + b.size) / 2 + int(r, -3, 3)),
  };
  for (const k of STAT_KEYS) d[k] = r() < 0.7 ? from(k) : (a[k] + b[k]) / 2;
  let mutated: keyof Dna | null = null;
  if (r() < 0.2) {
    mutated = pick(r, ['str', 'dex', 'def', 'spd', 'hue', 'horn', 'tail', 'pattern', 'eye'] as const);
    if (mutated in GENE_RANGES) (d as any)[mutated] = int(r, 0, GENE_RANGES[mutated as keyof typeof GENE_RANGES] - 1);
    else if (mutated === 'hue') d.hue = int(r, 0, 359);
    else d[mutated] += r() < 0.5 ? -2 : 2;
  }
  d.size = Math.max(90, Math.min(115, d.size));
  return { dna: normalize(d, r), mutated };
}

// Trust boundary: DNA from a peer / storage / chain gets clamped into valid ranges.
export function sanitize(x: any): Dna {
  const n = (v: any, lo: number, hi: number, dflt: number) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : dflt);
  const d: Dna = {
    str: n(x?.str, 3, 9, 6), dex: n(x?.dex, 3, 9, 5), def: n(x?.def, 3, 9, 5), spd: n(x?.spd, 3, 9, 6),
    hue: n(x?.hue, 0, 359, 170), accent: n(x?.accent, 0, 359, 40),
    horn: n(x?.horn, 0, 3, 0), tail: n(x?.tail, 0, 2, 0), pattern: n(x?.pattern, 0, 2, 0), eye: n(x?.eye, 0, 3, 0),
    size: n(x?.size, 90, 115, 100),
  };
  return normalize(d, rng(1));
}

export const statsOf = (d: Dna): Stats => ({ str: d.str, dex: d.dex, def: d.def, spd: d.spd });

// Skills: first 4 kinds bump a stat (mag 1..2), the rest are effects (Stats.fx bit 1 << (index - 4)).
export const SKILL_KINDS = ['Power', 'Agility', 'Durability', 'Speed', 'AirJump', 'Lifesteal', 'QuickDodge', 'SecondWind'] as const;
export type SkillKind = (typeof SKILL_KINDS)[number];
export interface Skill { kind: SkillKind; mag: number }
export const SKILL_SLOTS = 3, SKILL_STAT_MAX = 2, SKILL_TOTAL_MAX = 3, SKILL_FX_MAX = 2, STAT_CAP = 11;

// Trust boundary, mirrored in sim/src/genes.rs sanitize_skills: entries breaking a cap are dropped in order.
export function sanitizeSkills(x: unknown): Skill[] {
  const out: Skill[] = [], per = [0, 0, 0, 0];
  let total = 0, fx = 0;
  if (!Array.isArray(x)) return out;
  for (const s of x) {
    if (out.length >= SKILL_SLOTS) break;
    const kind = (s as any)?.kind as SkillKind, i = SKILL_KINDS.indexOf(kind);
    if (i < 0) continue;
    if (i >= 4) {
      if (fx >= SKILL_FX_MAX || out.some((o) => o.kind === kind)) continue;
      fx++; out.push({ kind, mag: 1 }); continue;
    }
    const m = (s as any).mag, v = m !== null && typeof m === 'object' ? NaN : +m;
    if (!Number.isFinite(v)) continue;
    const mag = Math.max(1, Math.min(2, Math.round(v)));
    if (per[i] + mag > SKILL_STAT_MAX || total + mag > SKILL_TOTAL_MAX) continue;
    per[i] += mag; total += mag; out.push({ kind, mag });
  }
  return out;
}

export function applySkills(s: Stats, skills: Skill[]): Stats {
  const r = { ...s, fx: s.fx ?? 0 };
  for (const k of skills) {
    const i = SKILL_KINDS.indexOf(k.kind);
    if (i >= 4) r.fx |= 1 << (i - 4);
    else if (i >= 0) r[STAT_KEYS[i]] = Math.min(STAT_CAP, r[STAT_KEYS[i]] + k.mag);
  }
  return r;
}

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

// Archetype label from dominant stat — flavour text for cards.
export function archetype(d: Dna) {
  const top = STAT_KEYS.reduce((a, k) => (d[k] > d[a] ? k : a), 'str' as (typeof STAT_KEYS)[number]);
  return { str: 'Bruiser', dex: 'Duelist', def: 'Bulwark', spd: 'Skirmisher' }[top];
}
