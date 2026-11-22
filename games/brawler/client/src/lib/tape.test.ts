import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate, tapeHash } from './tape.ts';

test('tape hash matches the server vector', async () => {
  // same vector in server src/referee.rs tape_hash_vector
  assert.equal(await tapeHash('grove', [0, 131073, 33488896, 511]), '91912f4e425ec1507030483e503bb4c7a7d60c2abd476ce4447ca3b226b1a57c');
});

test('headless replay of a golden tape reaches the recorded winner', () => {
  const g = JSON.parse(readFileSync(new URL('../../../sim/testdata/golden.json', import.meta.url), 'utf8'));
  for (const run of g.runs) {
    const s = simulate({ stage: run.stage, frames: run.tape, players: run.dna.map((dna: unknown, i: number) => ({ name: '', account: '', dna, skills: run.skills?.[i] })) });
    assert.equal(s.winner, run.winner);
  }
});
