// Bot: reads sim state, emits card plays {seat, card, x2, y}. Own seeded rng, so bot-vs-bot replays are deterministic.
import { rng } from './sim.js?v=2';
import { HEXES, PATH, CORE, center, dropKind, key } from './map.js?v=1';

const NEXT = [[2, 0], [-2, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const ATTACK = PATH.filter((h) => dropKind(0, ...h) === 'attack');
const GROUND = [0, 1].map((seat) => HEXES.filter((h) => dropKind(seat, ...h) === 'defend'));
const PATHSET = new Set(PATH.map((h) => key(...h)));
// own-zone ground hexes touching the path, nearest to own core first
const GUARD = [0, 1].map((seat) => {
  const [cx, cy] = center(...CORE[seat]), dist = (h) => { const [x, y] = center(...h); return (x - cx) ** 2 + (y - cy) ** 2; };
  return GROUND[seat].filter(([x, y]) => NEXT.some(([dx, dy]) => PATHSET.has(key(x + dx, y + dy)))).sort((a, b) => dist(a) - dist(b));
});

export function makeBot(seat, level, seed) {
  const r = rng(seed ^ (seat ? 0x51ed27 : 0x2c1b3c));
  let lastCounter = -999;
  const any = (xs) => xs[Math.floor(r() * xs.length)];
  const free = (p, h) => !p.defs.some((d) => d.hx === h[0] && d.hy === h[1]);
  const play = (card, h) => ({ seat, card, x2: h[0], y: h[1] });
  return (s) => {
    if (s.over || s.t % 10) return null; // think 3x/s
    const p = s.P[seat], can = p.hand.filter((ci) => p.cards[ci].cost * 60 <= p.e);
    if (!can.length) return null;
    if (level === 'easy') { // random affordable card on a random valid hex, at 6+ energy
      if (p.e < 6 * 60) return null;
      const ci = can[Math.floor(r() * can.length)], ground = GROUND[seat].filter((h) => free(p, h));
      return play(ci, p.cards[ci].m && ground.length && r() < 0.5 ? any(ground) : any(ATTACK));
    }
    // hard: enemy squad on the board -> station the cheapest monster next to the path; else attack with the biggest card at 10
    const byCost = can.slice().sort((a, b) => p.cards[a].cost - p.cards[b].cost || a - b);
    if (s.units.some((u) => u.seat !== seat) && s.t - lastCounter > 90) {
      const ci = byCost.find((c) => p.cards[c].m), h = GUARD[seat].find((g) => free(p, g));
      if (ci != null && h) { lastCounter = s.t; return play(ci, h); }
    }
    if (p.e >= 600) return play(byCost[byCost.length - 1], any(ATTACK));
    return null;
  };
}
