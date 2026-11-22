import { IN, type GameState } from './sim/sim.ts';
import { STAGES } from './stages.ts';

// Tiny scripted fighter so demo fights move on their own: walk at the rival, swing when close, jump now and then.
export function bot(s: GameState, me: number) {
  const f = s.fighters[me], o = s.fighters[1 - me], dx = o.x - f.x, t = s.frame + me * 37;
  let b = Math.abs(dx) > 70 ? (dx > 0 ? IN.RIGHT : IN.LEFT) : 0;
  if (Math.abs(dx) < 90 && t % 24 < 2) b |= t % 96 < 24 ? IN.HEAVY : IN.LIGHT;
  if (o.y < f.y - 80 && t % 30 === 0) b |= IN.JUMP;
  // off the ground (60px margin from edges/gaps): head for the solid nearest the opponent, jumping across gaps
  const g = STAGES[s.stage].solids.map((r) => ({ lo: r.x0 + 60, hi: r.x1 - 60 }));
  if (!g.some((r) => f.x >= r.lo && f.x <= r.hi)) {
    const mid = (r: { lo: number; hi: number }) => (r.lo + r.hi) / 2;
    const to = g.reduce((a, r) => (Math.abs(o.x - mid(r)) < Math.abs(o.x - mid(a)) ? r : a));
    const goal = Math.min(to.hi, Math.max(to.lo, f.x < mid(to) ? to.lo + 40 : to.hi - 40));
    b = (f.x < goal ? IN.RIGHT : IN.LEFT) | (t % 20 === 0 ? IN.JUMP : 0);
  }
  return b;
}

export const isBot = (account?: string) => !!account && /^bot-\d+\.brawler$/.test(account);
