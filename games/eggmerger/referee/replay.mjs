// node games/eggmerger/referee/replay.mjs <seed> <tape.json>  →  {"score":…,"elders":…}
// The referee's result wins; client physics is display only.
// TODO(solana): read the tape from the run PDA (committed from the ER) instead of a file, then settle_run: pay elders × 15% of the current pot (recomputed per pop).
import { readFileSync } from 'node:fs';
import { replay } from '../build/sim.js';

const [seed, file] = process.argv.slice(2);
if (!seed || !file) { console.error('usage: node referee/replay.mjs <seed> <tape.json>'); process.exit(2); }
const hash = (str) => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const tape = JSON.parse(readFileSync(file, 'utf8'));
if (!Array.isArray(tape) || !tape.every((d) => Number.isInteger(d?.tick) && Number.isFinite(d?.x))) { console.error('bad tape'); process.exit(2); }
console.log(JSON.stringify(replay(/^\d+$/.test(seed) ? Number(seed) >>> 0 : hash(seed), tape)));
