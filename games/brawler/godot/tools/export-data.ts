// TS is the source of truth; godot/data.json is generated so the Godot client never drifts.
import { writeFileSync } from 'node:fs';
import { MOVES } from '../../client/src/lib/sim/moves.ts';
import { STAGES } from '../../client/src/lib/stages.ts';
import * as PARTS from '../../client/src/lib/render/parts.ts';
import { lookOf, nameFor, randomDna, statsOf, archetype } from '../../client/src/lib/genes.ts';

// Godot reads hex, not hsl().
const hex = (c: string) => {
  const m = c.match(/hsl\((\d+) (\d+)% (\d+)%\)/);
  if (!m) return c;
  const [h, s, l] = [+m[1], +m[2] / 100, +m[3] / 100];
  const f = (n: number) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
};

// Gen-1 roster: seeded DNA, genes spread so every horn / weapon / trim / eye variant shows up.
const roster = Array.from({ length: 8 }, (_, i) => {
  const seed = 1000 + i * 7919;
  const dna = { ...randomDna(seed), horn: i % 4, tail: i % 3, pattern: (i >> 1) % 3, eye: (i + (i >> 2)) % 4, hue: (i * 47 + 10) % 360 };
  const look = lookOf(dna);
  return {
    name: nameFor(seed), type: archetype(dna), stats: statsOf(dna),
    look: { ...look, body: hex(look.body), belly: hex(look.belly), dark: hex(look.dark), horn: hex(look.horn), mark: hex(look.mark) },
  };
});

const { seg: _seg, ...parts } = PARTS; // seg() is a generator; its outputs are already in LIMB
const out = { moves: MOVES, stages: STAGES, parts, roster };
const file = new URL('../data.json', import.meta.url);
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`wrote ${file.pathname}: ${Object.keys(MOVES).length} moves, ${Object.keys(STAGES).length} stages, ${roster.length} fighters`);
