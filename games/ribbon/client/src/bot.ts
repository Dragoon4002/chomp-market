import { CLOSE_AT, CLOSE_EVERY, H, MAX_RING, W, input, type Sim } from './sim.ts';

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const REACH = W * H; // ponytail: plain flood fill, no lookahead on opponent moves; minimax if the bot gets too easy
const AHEAD = 20; // ticks of ring lookahead

// Greedy bot: pick the non-reverse dir whose next cell opens onto the most reachable free space.
export function bot(sim: Sim, seat: number): number {
  const me = sim.riders[seat], foe = sim.riders[1 - seat], t = sim.roundTick + AHEAD;
  const g = t < CLOSE_AT ? 0 : Math.min(MAX_RING, 1 + Math.floor((t - CLOSE_AT) / CLOSE_EVERY)); // ring soon
  const free = (x: number, y: number) =>
    x >= g && y >= g && x < W - g && y < H - g && !sim.cell(x, y) && !(x === foe.x && y === foe.y) && !(x === foe.x + DX[foe.dir] && y === foe.y + DY[foe.dir]); // foe head + its next cell (no head-ons)
  let best = me.dir, bestN = -1;
  for (let d = 0; d < 4; d++) {
    if (d === (me.dir + 2) % 4) continue;
    const sx = me.x + DX[d], sy = me.y + DY[d];
    if (!free(sx, sy)) continue;
    const seen = new Set([sy * W + sx]), q = [[sx, sy]];
    while (q.length && seen.size < REACH) {
      const [x, y] = q.pop()!;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k], i = ny * W + nx;
        if (!seen.has(i) && free(nx, ny)) { seen.add(i); q.push([nx, ny]); }
      }
    }
    const n = seen.size + (d === me.dir ? 1 : 0); // tie -> keep going straight
    if (n > bestN) { bestN = n; best = d; }
  }
  return input(best, false);
}
