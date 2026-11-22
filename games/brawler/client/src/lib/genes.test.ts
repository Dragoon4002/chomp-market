import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomDna, breed, sanitize, sanitizeSkills, applySkills, statsOf, STAT_KEYS, STAT_SUM, type Dna } from './genes.ts';

const valid = (d: Dna) => {
  assert.equal(STAT_KEYS.reduce((s, k) => s + d[k], 0), STAT_SUM);
  for (const k of STAT_KEYS) assert.ok(d[k] >= 3 && d[k] <= 9, `${k}=${d[k]}`);
  assert.ok(d.horn >= 0 && d.horn <= 3 && d.tail >= 0 && d.tail <= 2 && d.size >= 90 && d.size <= 115);
};

test('random dna always valid', () => { for (let s = 0; s < 500; s++) valid(randomDna(s)); });

test('breed is deterministic and valid', () => {
  const a = randomDna(1), b = randomDna(2);
  assert.deepEqual(breed(a, b, 99), breed(a, b, 99));
  for (let s = 0; s < 500; s++) valid(breed(a, b, s).dna);
});

test('offspring traits come from parents unless mutated', () => {
  const a = randomDna(10), b = randomDna(20);
  for (let s = 0; s < 200; s++) {
    const { dna, mutated } = breed(a, b, s);
    for (const k of ['horn', 'tail', 'pattern', 'eye', 'accent'] as const) {
      if (mutated !== k) assert.ok(dna[k] === a[k] || dna[k] === b[k], `${k} not inherited`);
    }
  }
});

test('sanitize clamps hostile input', () => {
  valid(sanitize({ str: 999, dex: -5, def: 'x', spd: NaN, horn: 50, size: 1e9 }));
  valid(sanitize(null));
});

test('skills match shared fixture (sim/testdata/skills.json, also asserted in rust)', () => {
  const t = JSON.parse(readFileSync(new URL('../../../sim/testdata/skills.json', import.meta.url), 'utf8'));
  const base = statsOf(sanitize(t.base));
  for (const c of t.cases) {
    const sk = sanitizeSkills(c.in);
    assert.deepEqual(sk, c.out, JSON.stringify(c.in));
    assert.deepEqual(applySkills(base, sk), c.stats, JSON.stringify(c.in));
  }
});
