// Hand-keyed Lortor animations. Each param is its own sparse track; a key's ease shapes the segment arriving at it.
// Attack lengths come from the sim's frame data for Lortor (DEX 7 => startup -1), so sprite frames line up 1:1 with game frames.
import { MOVES, type MoveId } from '../../../client/src/lib/sim/moves.ts';
import { REST, type Pose } from './rig.ts';

type Ease = 'io' | 'in' | 'out' | 'back' | 'snap' | 'lin';
type Key = [at: number, pose: Partial<Pose>, ease?: Ease];
export interface Anim { name: string; frames: number; loop: boolean; keys: Key[]; phases?: { startup: number; active: number; recovery: number } }

const E: Record<Ease, (t: number) => number> = {
  io: (t) => t * t * (3 - 2 * t), in: (t) => t * t * t, out: (t) => 1 - (1 - t) ** 3, lin: (t) => t, snap: (t) => (t >= 1 ? 1 : 0),
  back: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
};

const LORTOR_DEX_SHIFT = -1; // floor((5 - 7) / 2), see statMods()
const su = (id: MoveId) => Math.max(2, MOVES[id].startup + LORTOR_DEX_SHIFT);
const phases = (id: MoveId) => ({ startup: su(id), active: MOVES[id].active, recovery: MOVES[id].recovery });
const len = (id: MoveId) => su(id) + MOVES[id].active + MOVES[id].recovery;

// Attack template: rest -> wind (end of startup) -> strike (active) -> rest, with a trail over the active frames.
function attack(id: MoveId, wind: Partial<Pose>, strike: Partial<Pose>, extra: Key[] = [], from: Partial<Pose> = {}, follow: Partial<Pose> = {}): Anim {
  const s = su(id), a = MOVES[id].active, n = len(id);
  return {
    name: id, frames: n, loop: false, phases: phases(id),
    keys: [
      [0, { ...REST, ...from }],
      [s - 1, { ...from, ...wind }, 'out'],
      [s, { trail: 1 }, 'snap'],
      [s + 1, { ...from, ...strike }, 'out'],
      [s + a, { ...from, ...strike, ...follow }, 'out'],
      [s + a, { trail: 0 }, 'snap'],
      [n, { ...REST, ...from }, 'io'],
      ...extra,
    ],
  };
}

const AIR: Partial<Pose> = { plant: 0, fBx: -4, fBy: -16, fFx: 6, fFy: -22, armB: -25, sh: -20, cape: 30 };
const TUCK: Partial<Pose> = { plant: 0, fBx: 12, fBy: -46, fFx: 18, fFy: -52, armB: -10, sh: 10, el: -20, ham: -30 };
const CROUCH: Partial<Pose> = { y: 14, sx: 1.04, sy: 0.95, lean: 14 };

export const ANIMS: Anim[] = [
  { name: 'idle', frames: 96, loop: true, keys: [
    [0, { y: 0, lean: 0, head: 0, sh: 0, ham: 0, armB: 0, cape: 0, blink: 0 }],
    [48, { y: 3, lean: 2, head: 3, sh: 4, ham: -5, armB: 4, cape: 4 }],
    [96, { y: 0, lean: 0, head: 0, sh: 0, ham: 0, armB: 0, cape: 0 }],
    [70, { blink: 0 }, 'snap'], [71, { blink: 1 }, 'snap'], [75, { blink: 0 }, 'snap'],
  ] },
  { name: 'run', frames: 24, loop: true, keys: [
    [0, { y: 4, lean: 20, head: -9, sh: 30, ham: -30, armB: -40, cape: 36, fFx: 12, fFy: 0, fBx: 5, fBy: -34 }],
    [5, { y: 8, fFx: -22, fFy: 0, fBx: 50, fBy: -34 }],
    [9, { y: -8, cape: 48 }],
    [10, { fFx: -68, fFy: -6, fBx: 75, fBy: -14 }],
    [12, { y: 4, sh: -22, ham: -10, armB: 38, fFx: -64, fFy: -30, fBx: 82, fBy: 0 }],
    [14, { fFx: -65, fFy: -30 }],
    [17, { y: 8, fBx: 46, fBy: 0, fFx: -28, fFy: -34 }],
    [18, { fFx: -30, fFy: -34 }],
    [21, { y: -8, cape: 36, fFx: 5, fFy: -14, fBx: 0, fBy: -6 }],
    [22, { fBx: -4, fBy: -30 }],
    [24, { y: 4, sh: 30, ham: -30, armB: -40, fFx: 12, fFy: 0, fBx: 5, fBy: -34 }],
  ] },
  { name: 'jumpsquat', frames: 3, loop: false, keys: [
    [0, { y: 4, sy: 0.96, sx: 1.03, lean: 6 }],
    [3, { y: 14, sy: 0.88, sx: 1.1, lean: 16, head: 6, sh: 18, ham: 10, armB: 22, cape: -8 }, 'out'],
  ] },
  { name: 'jump', frames: 20, loop: false, keys: [
    [0, { ...AIR, sy: 1.14, sx: 0.9, lean: -6, sh: -55, ham: -25, armB: -50, cape: -20, fBx: -8, fBy: 4, fFx: -2, fFy: 2 }],
    [8, { sy: 1.03, sx: 0.98, lean: 0, fBx: 0, fBy: -20, fFx: 12, fFy: -30, cape: 5 }, 'out'],
    [20, { ...AIR, sy: 1, sx: 1, lean: 4, sh: -25, ham: -15, armB: -30 }, 'io'],
  ] },
  { name: 'fall', frames: 16, loop: true, keys: [
    [0, { ...AIR, fFx: 10, fFy: -8, fBx: -6, fBy: -4, cape: 40, sh: -30, armB: -40 }],
    [8, { cape: 52, sh: -36, armB: -48, fFy: -12 }],
    [16, { cape: 40, sh: -30, armB: -40, fFy: -8 }],
  ] },
  { name: 'fastFall', frames: 8, loop: true, keys: [
    [0, { plant: 0, sy: 1.1, sx: 0.94, lean: -3, fBx: -2, fBy: 4, fFx: 2, fFy: 4, sh: -75, el: -10, ham: -35, armB: -90, cape: 85, streak: 1 }],
    [4, { cape: 95, streak: 0.7 }],
    [8, { cape: 85, streak: 1 }],
  ] },
  { name: 'airJump', frames: 22, loop: false, keys: [
    [0, { ...AIR, spin: 0, sy: 1.12, sx: 0.92, sh: -60, armB: -60 }],
    [4, { ...TUCK, sy: 1, sx: 1 }, 'out'],
    [16, { spin: 360 }, 'out'],
    [12, { cape: 60 }],
    [22, { ...AIR, spin: 360, cape: 30 }, 'io'],
  ] },
  { name: 'land', frames: 8, loop: false, keys: [
    [0, { y: 10, sy: 0.82, sx: 1.16, lean: 16, head: 8, sh: 22, ham: 12, armB: 25, cape: -15 }],
    [8, { y: 0, sy: 1, sx: 1, lean: 0, head: 0, sh: 0, ham: 0, armB: 0, cape: 0 }, 'back'],
  ] },
  { name: 'dodge', frames: 22, loop: false, keys: [
    [0, { ...CROUCH, spin: 0 }],
    [3, { ...TUCK, plant: 0, y: -6, sy: 0.92, sx: 1.06, spin: 30 }, 'out'],
    [17, { spin: 360, cape: 50 }, 'io'],
    [10, { y: -105, sy: 0.85 }, 'out'], [16, { y: -30 }, 'in'],
    [19, { ...CROUCH, plant: 1, fBx: 0, fBy: 0, fFx: 0, fFy: 0, armB: 0, sh: 0, el: 0, ham: 0, cape: 0 }, 'out'],
    [22, { y: 0, sx: 1, sy: 1, lean: 0, spin: 360 }, 'back'],
  ] },
  { name: 'airDodge', frames: 24, loop: false, keys: [
    [0, { ...AIR, spin: 0, sy: 1.15, sx: 0.88 }],
    [3, { ...TUCK, sy: 1, sx: 1 }, 'out'],
    [14, { spin: -360 }, 'out'],
    [10, { cape: 70 }],
    [24, { ...AIR, spin: -360 }, 'io'],
  ] },

  // ground attacks
  attack('jab1', { sh: 18, el: 10, lean: -6, ham: -10 }, { sh: -38, el: 24, ham: 30, lean: 12, fFx: 10, head: 4, armB: 20 }),
  attack('jab2', { sh: 30, ham: 55, lean: 4, y: 4 }, { sh: -55, ham: -45, lean: 8, head: -6, armB: 30, fFx: 6 }),
  attack('jab3', { ...CROUCH, y: 12, sh: 45, ham: 20, armB: 30, head: 6 }, { y: -10, sy: 1.08, sx: 0.95, lean: -12, sh: -125, el: -10, ham: 60, head: -10, armB: -40, fBx: -6, fBy: -10, cape: 25 }),
  attack('sideLight', { lean: -12, sh: -110, ham: -35, back: 1, fFx: -6, head: -4, armB: 25 }, { lean: 20, y: 8, sh: 12, ham: 65, fFx: 28, head: 6, armB: -30, cape: 20, back: 0 }),
  attack('downLight', { ...CROUCH, y: 22, lean: 22, sh: -40, ham: -75, fFx: 18, back: 1 }, { ...CROUCH, y: 26, lean: 26, sh: 20, ham: 15, back: 0, fFx: 30, armB: 35, cape: 25 }),
  attack('nHeavy', { ...CROUCH, y: 18, lean: 18, sh: 40, ham: 25, armB: 40, glow: 1, head: 8 }, { y: -12, sy: 1.1, sx: 0.94, lean: -14, sh: -150, el: -5, ham: 70, armB: -60, head: -14, cape: 30, glow: 0.4, fBy: -8 },
    [[3, { glow: 0.3 }], [8, { glow: 0.6 }], [10, { glow: 0.35 }], [14, { glow: 1 }]]),
  attack('sHeavy', { lean: -18, y: 6, sh: -116, el: 0, ham: -35, back: 1, armB: -35, fFx: 10, glow: 1, head: -6 }, { lean: 28, y: 10, sh: -56, el: 15, ham: 91, armB: 45, fFx: 34, head: 10, cape: 40, glow: 0.3, back: 0 },
    [[4, { glow: 0.3 }], [9, { glow: 0.7 }], [12, { glow: 0.4 }]], {}, { ham: 125, sh: -20 }),
  attack('dHeavy', { ...CROUCH, y: 24, lean: 6, sh: 85, ham: 95, armB: -20, glow: 1, fFx: 14, fBx: -10 }, { ...CROUCH, y: 24, lean: 18, sh: -35, ham: 60, armB: 40, fFx: 22, fBx: -14, cape: 45, glow: 0.3 },
    [[5, { glow: 0.4 }], [10, { glow: 0.8 }]]),

  // air attacks
  attack('airNeutral', { sh: 60, ham: 30, lean: 10 }, { sh: -170, ham: 45, lean: -14, head: -10, armB: -50, cape: 50, fFx: 14, fFy: -34 }, [], AIR),
  attack('airSide', { lean: 8, fFx: -14, fFy: -50, sh: 40, ham: -10, armB: -20 }, { lean: -24, fFx: 64, fFy: -54, fBx: -10, fBy: -10, sh: 60, ham: -20, armB: -60, head: -6, cape: 40 }, [], AIR),
  attack('airDown', { ...TUCK, lean: -6, sh: -160, el: -10, ham: 95, head: -8 }, { lean: 16, sh: 22, el: 10, ham: 100, head: 10, fBy: -30, fFy: -36, cape: 70 }, [], AIR),
  attack('airSideHeavy', { ...TUCK, lean: 10, sh: 50, ham: -20, glow: 1 }, { lean: -68, y: -20, fFx: 78, fFy: -62, fBx: 62, fBy: -46, sh: 95, ham: -40, armB: 70, head: 22, cape: 70, glow: 0.3 },
    [[4, { glow: 0.4 }], [8, { glow: 0.9 }]], AIR),
  {
    name: 'recovery', frames: len('recovery'), loop: false, phases: phases('recovery'),
    keys: [
      [0, { ...AIR, spin: 0, trail: 0 }],
      [su('recovery') - 1, { ...TUCK, sh: 20, ham: 20 }, 'out'],
      [su('recovery'), { trail: 1, sy: 1.14, sx: 0.9 }, 'snap'],
      [su('recovery') + 2, { ...AIR, sh: -150, el: 0, ham: 85, fFx: -4, fFy: 0, fBx: -8, fBy: 4, armB: -80, cape: -30 }, 'out'],
      [su('recovery') + MOVES.recovery.active, { spin: 720, sy: 1, sx: 1 }, 'lin'],
      [su('recovery') + MOVES.recovery.active, { trail: 0 }, 'snap'],
      [len('recovery'), { ...AIR, spin: 720, cape: 40 }, 'io'],
    ],
  },
  { name: 'groundPound', frames: su('groundPound'), loop: false, phases: phases('groundPound'), keys: [
    [0, { ...AIR }],
    [su('groundPound'), { ...TUCK, spin: -20, sh: -165, el: -10, ham: 100, glow: 1, cape: 20 }, 'out'],
  ] },
  { name: 'groundPoundFall', frames: 6, loop: true, keys: [
    [0, { plant: 0, sy: 1.16, sx: 0.9, sh: 15, el: 10, ham: 115, fBx: -6, fBy: -24, fFx: 4, fFy: -30, armB: -80, cape: 95, streak: 1, glow: 0.8, trail: 0 }],
    [3, { cape: 105, streak: 0.6, glow: 1 }],
    [6, { cape: 95, streak: 1, glow: 0.8 }],
  ] },
  { name: 'groundPoundLand', frames: MOVES.groundPound.recovery, loop: false, keys: [
    [0, { ...CROUCH, y: 26, sy: 0.8, sx: 1.18, lean: 26, sh: -8, ham: 100, fFx: 18, fBx: -12, armB: 40, head: 12, cape: -20, glow: 1 }],
    [6, { y: 18, sy: 0.94, sx: 1.04, glow: 0 }, 'out'],
    [18, { y: 0, sy: 1, sx: 1, lean: 0, sh: 0, ham: 0, fFx: 0, fBx: 0, armB: 0, head: 0, cape: 0 }, 'io'],
  ] },

  // getting hit
  { name: 'hurt', frames: 20, loop: false, keys: [
    [0, { lean: -20, head: -18, sh: 35, ham: 30, armB: 45, sx: 0.93, sy: 1.04, blink: 1, cape: 35, x: -6 }],
    [3, { lean: -24, head: -22, x: -8 }, 'out'],
    [20, { lean: -10, head: -8, sh: 15, ham: 10, armB: 20, sx: 1, sy: 1, cape: 15, x: -2 }, 'io'],
  ] },
  { name: 'tumble', frames: 24, loop: true, keys: [
    [0, { plant: 0, spin: 0, blink: 1, sh: 50, ham: 40, armB: -70, fFx: 30, fFy: -30, fBx: -24, fBy: -10, cape: 60, head: -15 }],
    [12, { sh: -40, ham: -30, armB: 60, fFx: -10, fFy: -40, fBx: 20, fBy: -24 }],
    [24, { spin: -360, sh: 50, ham: 40, armB: -70, fFx: 30, fFy: -30, fBx: -24, fBy: -10 }, 'lin'],
  ] },
];

export function poseAt(a: Anim, f: number): Pose {
  const out = { ...REST } as Record<keyof Pose, number>;
  for (const k of Object.keys(REST) as (keyof Pose)[]) {
    const ks = a.keys.filter(([, p]) => p[k] !== undefined).sort((x, y) => x[0] - y[0]);
    if (!ks.length) continue;
    if (f <= ks[0][0]) { out[k] = ks[0][1][k]!; continue; }
    const j = ks.findIndex(([at]) => at >= f);
    if (j < 0) { out[k] = ks[ks.length - 1][1][k]!; continue; }
    const [a0, p0] = ks[j - 1], [a1, p1, e = 'io'] = ks[j];
    out[k] = p0[k]! + (p1[k]! - p0[k]!) * E[e]((f - a0) / (a1 - a0));
  }
  return out as Pose;
}
