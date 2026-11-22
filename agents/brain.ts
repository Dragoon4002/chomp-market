import { IN, type GameState } from '../games/brawler/client/src/lib/sim/sim.ts';
import { STAGES } from '../games/brawler/client/src/lib/stages.ts';
import { bot } from '../games/brawler/client/src/lib/bot.ts';

export interface Fighter { name: string; stocks: number; damage: number }
export interface View { fighters: [Fighter, Fighter]; secs: number }

/* ---------- fighter AI ---------- */

const safe = (s: GameState) => STAGES[s.stage].solids.map((r) => ({ lo: r.x0 + 60, hi: r.x1 - 60 }));
const offStage = (s: GameState, me: number) => !safe(s).some((r) => s.fighters[me].x >= r.lo && s.fighters[me].x <= r.hi);

// lag = extra reaction frames, miss = chance an attack input is dropped, noise = chance of a random input flip per frame
export const LEVELS = {
  easy: { lag: 15, miss: 0.6, noise: 0.06 },
  medium: { lag: 6, miss: 0.3, noise: 0.03 },
  hard: { lag: 0, miss: 0, noise: 0.01 },
};
export type Level = keyof typeof LEVELS;
const ATK = IN.LIGHT | IN.HEAVY, FLIPS = [IN.JUMP, IN.LEFT, IN.RIGHT, IN.HEAVY];

export function pilot(level: Level, rand = Math.random) {
  const { lag, miss, noise } = LEVELS[level] ?? LEVELS.medium, q: number[] = [];
  return (s: GameState, me: number) => {
    let b = bot(s, me);
    if (offStage(s, me)) { q.length = 0; return b; } // recover at full skill: losing should come from fighting, not falling off
    if (b & ATK && rand() < miss) b &= ~ATK;
    if (rand() < noise) b ^= FLIPS[Math.floor(rand() * FLIPS.length)];
    q.push(b);
    return q.length > lag ? q.shift()! : 0;
  };
}

/* ---------- commentator ---------- */

export interface Moment { kind: 'start' | 'ko' | 'swing' | 'comeback' | 'over'; who: number; v: View; winner?: number | null }

export function template(m: Moment) {
  const f = m.v.fighters, n = f[m.who]?.name, o = f[1 - m.who]?.name;
  switch (m.kind) {
    case 'start': return `We are LIVE! ${f[0].name} vs ${f[1].name}, three stocks each!`;
    case 'ko': return `${n} goes DOWN! ${n} has ${f[m.who].stocks} stock${f[m.who].stocks === 1 ? '' : 's'} left!`;
    case 'swing': return `Huge combo from ${o}! ${n} is up to ${Math.round(f[m.who].damage)} damage!`;
    case 'comeback': return `${n} has clawed it back! ${f[0].stocks}-${f[1].stocks}, anyone's game!`;
    case 'over': return m.winner == null ? 'Match voided.' : `It's over! ${f[m.winner].name} takes it!`;
  }
}
