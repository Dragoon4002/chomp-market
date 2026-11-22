// Golden vectors for ribbon-sim (rust). Regen: node --experimental-strip-types scripts/ribbon-golden.ts
import { writeFileSync } from 'node:fs';
import { Sim, W, H } from '../games/ribbon/client/src/sim.ts';

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const free = (s: Sim, x: number, y: number) => x >= s.ring && y >= s.ring && x < W - s.ring && y < H - s.ring && !s.cell(x, y);

// LCG noise; `smart` seats dodge walls/trails so rounds reach the ring.
function bot(s: Sim, i: number, rnd: () => number, smart: boolean) {
  const r = s.riders[i], n = rnd();
  let d = n < (smart ? 8 : 40) ? n & 3 : 7;
  if (smart) { // take the longest straight run if the planned one is short
    const run = (k: number) => { let m = 0; while (m < 20 && free(s, r.x + DX[k] * (m + 1), r.y + DY[k] * (m + 1))) m++; return m; };
    const k = d === 7 ? r.dir : d;
    if (k === (r.dir + 2) % 4 || run(k) < 3) d = [0, 1, 2, 3].filter((j) => j !== (r.dir + 2) % 4).sort((a, b) => run(b) - run(a))[0];
  }
  return d | (n > (smart ? 254 : 250) ? 8 : 0);
}

const runs = [];
const seen = { ring: 0, draw: 0, boost: 0, tie: 0 };
for (let n = 0; n < 10; n++) {
  let seed = 7 + n * 31;
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 16 & 255;
  const s = new Sim(), ins: number[][] = [], hashes: number[] = [];
  while (!s.done && ins.length < 4000) {
    const v = [bot(s, 0, rnd, n % 3 !== 0), bot(s, 1, rnd, n % 2 === 0)];
    const r0 = s.rounds, sc = s.score.join();
    s.step(v);
    ins.push(v);
    hashes.push(s.hash());
    if (s.ring) seen.ring++;
    if (s.riders.some((r) => r.boostLeft)) seen.boost++;
    if (s.rounds > r0 && s.score.join() === sc) seen.draw++;
  }
  if (s.done && s.winner < 0) seen.tie++;
  runs.push({ ins, hashes });
  console.log(`run ${n}: ${ins.length} ticks, rounds ${s.rounds}, score ${s.score}, winner ${s.winner}`);
}
writeFileSync(new URL('../games/ribbon/sim/testdata/golden.json', import.meta.url), JSON.stringify({ runs }));
console.log(seen);
if (!seen.ring || !seen.draw || !seen.boost) throw new Error('golden tapes must hit ring, draw, boost');
