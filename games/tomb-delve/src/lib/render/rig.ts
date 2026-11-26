// Pose bits copied from games/brawler/client/src/lib/render/rig.ts (Pose, POSES, lerpPose, two ATTACK keyframes).
// Brawler's sim-driven poseFor is replaced by a tiny time-based driver (heroPose). Render-only.

// Angles in radians. Limbs: 0 = straight down, + = toward facing. Lower bones are relative to upper.
// t = torso lean (+ forward), h = head tilt, y = hip drop, r = whole-body spin, blink = 0 open .. 1 shut.
export interface Pose {
  y: number; t: number; h: number; r: number;
  fu: number; fl: number; bu: number; bl: number; // front / back arm
  ft: number; fs: number; bt: number; bs: number; // front / back leg (thigh, shin)
  tail: number; jaw: number; blink: number;
}

const P = (p: Partial<Pose>): Pose => ({
  y: 0, t: 0.08, h: -0.05, r: 0, fu: 0.4, fl: 1.4, bu: -0.1, bl: 1.2, ft: 0.25, fs: -0.3, bt: -0.2, bs: -0.2, tail: 0.3, jaw: 0, blink: 0, ...p,
});

export const POSES = {
  idle: P({}),
  idle2: P({ y: 2, t: 0.13, h: 0, fu: 0.48, fl: 1.55, bl: 1.35, tail: 0.45 }),
  hurt: P({ t: -0.5, h: -0.45, fu: -1.2, fl: 0.5, bu: -1.6, bl: 0.3, ft: 0.5, fs: -0.2, bt: -0.4, bs: -0.3, tail: 1.1, jaw: 0.5, blink: 1 }),
  guard: P({ y: 5, t: -0.2, h: 0.15, fu: 1.1, fl: 2.3, bu: 0.9, bl: 2.3, ft: 0.45, fs: -0.7, bt: -0.35, bs: -0.5 }),
  tumble: P({ t: -0.9, h: -0.6, fu: -2.4, fl: 0.4, bu: 2.4, bl: 0.4, ft: 1.0, fs: -0.6, bt: -0.8, bs: -0.6, tail: 1.4, jaw: 0.6, blink: 1 }),
};

// brawler ATTACK.sHeavy [wind-up, strike]
const WIND = P({ t: -0.45, fu: -2.3, fl: 0.5, bu: -1.9, bl: 0.4, ft: 0.4, bt: -0.5 });
const HIT = { ...WIND, ...P({ t: 0.65, fu: 1.6, fl: 0, bu: 1.2, bl: 0.2, ft: 0.95, fs: -0.2, bt: -0.85, bs: -0.3, jaw: 0.8 }) };

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export function lerpPose(a: Pose, b: Pose, k: number): Pose {
  const o = { ...a };
  for (const key in a) (o as any)[key] = (a as any)[key] + ((b as any)[key] - (a as any)[key]) * k;
  return o;
}

export type Anim = 'idle' | 'attack' | 'guard' | 'hurt' | 'dead';
// ms = time since the anim started, now = clock for breathing/blink.
export function heroPose(anim: Anim, ms: number, now: number): Pose {
  const rest = { ...lerpPose(POSES.idle, POSES.idle2, (Math.sin(now / 150) + 1) / 2), blink: now % 2800 < 100 ? 1 : 0 };
  // in -> hold -> out back to rest
  const hold = (to: Pose, inMs: number, holdMs: number, outMs: number) =>
    ms < inMs ? lerpPose(rest, to, ease(ms / inMs)) : lerpPose(to, rest, ease((ms - inMs - holdMs) / outMs));
  if (anim === 'attack') return ms < 160 ? lerpPose(rest, WIND, ease(ms / 160)) : ms < 240 ? lerpPose(WIND, HIT, (ms - 160) / 80) : lerpPose(HIT, rest, ease((ms - 240) / 320));
  if (anim === 'guard') return hold(POSES.guard, 120, 400, 300);
  if (anim === 'hurt') return hold(POSES.hurt, 80, 250, 350);
  if (anim === 'dead') return { ...lerpPose(rest, POSES.tumble, ease(ms / 500)), r: -ease(ms / 700) * 1.4 };
  return rest;
}
