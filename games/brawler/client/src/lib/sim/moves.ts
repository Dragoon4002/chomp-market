// Frame data. 60 fps. Hitbox relative to fighter feet, facing right (y negative = up).
// Knockback direction (ax, ay) is a unit vector written as literals so the sim never calls trig.
// Timings modelled on the reference game's anim phase markers (startup / active / recovery), tuned by feel.

export interface MoveDef {
  name: string;
  air: boolean;
  startup: number;
  active: number;
  recovery: number;
  hb: { x: number; y: number; w: number; h: number };
  dmg: number;
  base: number; // base knockback
  growth: number; // extra knockback per % damage on the target
  ax: number;
  ay: number;
  selfVx?: number; // lunge applied on first active frame
  selfVy?: number;
  away?: boolean; // knockback x follows target side, not facing (hits both sides)
  untilLand?: boolean; // active frames last until grounded (ground pound)
}

const DATA = {
  jab1: { name: 'jab1', air: false, startup: 5, active: 3, recovery: 12, hb: { x: 18, y: -72, w: 55, h: 30 }, dmg: 5, base: 5, growth: 0.02, ax: 0.5, ay: -0.866 },
  jab2: { name: 'jab2', air: false, startup: 4, active: 3, recovery: 12, hb: { x: 18, y: -72, w: 55, h: 30 }, dmg: 5, base: 5, growth: 0.02, ax: 0.5, ay: -0.866 },
  jab3: { name: 'jab3', air: false, startup: 6, active: 4, recovery: 18, hb: { x: 18, y: -80, w: 72, h: 42 }, dmg: 8, base: 8, growth: 0.08, ax: 0.8, ay: -0.6 },
  sideLight: { name: 'sideLight', air: false, startup: 8, active: 4, recovery: 16, hb: { x: 15, y: -66, w: 78, h: 30 }, dmg: 10, base: 7, growth: 0.1, ax: 0.94, ay: -0.342, selfVx: 7 },
  downLight: { name: 'downLight', air: false, startup: 7, active: 4, recovery: 14, hb: { x: 8, y: -26, w: 82, h: 26 }, dmg: 9, base: 7, growth: 0.07, ax: 0.5, ay: -0.866 },
  airNeutral: { name: 'airNeutral', air: true, startup: 6, active: 6, recovery: 12, hb: { x: -42, y: -118, w: 84, h: 48 }, dmg: 9, base: 7, growth: 0.08, ax: 0.259, ay: -0.966, away: true },
  airSide: { name: 'airSide', air: true, startup: 7, active: 5, recovery: 14, hb: { x: 15, y: -72, w: 72, h: 36 }, dmg: 10, base: 7, growth: 0.1, ax: 0.866, ay: -0.5 },
  airDown: { name: 'airDown', air: true, startup: 8, active: 6, recovery: 14, hb: { x: -8, y: -22, w: 58, h: 46 }, dmg: 10, base: 6, growth: 0.06, ax: 0.342, ay: 0.94 },
  nHeavy: { name: 'nHeavy', air: false, startup: 16, active: 5, recovery: 24, hb: { x: -36, y: -152, w: 72, h: 82 }, dmg: 18, base: 10, growth: 0.18, ax: 0.174, ay: -0.985, away: true },
  sHeavy: { name: 'sHeavy', air: false, startup: 18, active: 5, recovery: 26, hb: { x: 18, y: -82, w: 96, h: 52 }, dmg: 20, base: 10, growth: 0.15, ax: 0.906, ay: -0.423, selfVx: 9 },
  dHeavy: { name: 'dHeavy', air: false, startup: 15, active: 6, recovery: 24, hb: { x: -82, y: -40, w: 164, h: 40 }, dmg: 17, base: 10, growth: 0.16, ax: 0.6, ay: -0.8, away: true },
  airSideHeavy: { name: 'airSideHeavy', air: true, startup: 14, active: 6, recovery: 22, hb: { x: 18, y: -82, w: 92, h: 46 }, dmg: 17, base: 9, growth: 0.15, ax: 0.906, ay: -0.423, selfVx: 6 },
  recovery: { name: 'recovery', air: true, startup: 5, active: 12, recovery: 20, hb: { x: -12, y: -132, w: 62, h: 112 }, dmg: 12, base: 9, growth: 0.1, ax: 0.342, ay: -0.94, selfVx: 2, selfVy: -19 },
  groundPound: { name: 'groundPound', air: true, startup: 10, active: 1, recovery: 18, hb: { x: -32, y: -34, w: 84, h: 44 }, dmg: 16, base: 9, growth: 0.15, ax: 0.5, ay: -0.866, selfVx: 0, selfVy: 22, untilLand: true, away: true },
} satisfies Record<string, MoveDef>;

export type MoveId = keyof typeof DATA;
export const MOVES: Record<MoveId, MoveDef> = DATA;
