// Procedural skeletal rig: bones + keyframed poses, tweened like the reference game's bone animations.
// Render-only. Reads sim state, never writes it. Art comes from the SVG part library in parts.ts.
import { MOVES, type MoveId } from '../sim/moves.ts';
import { startup, type Fighter } from '../sim/sim.ts';
import type { Look } from '../genes.ts';
import * as A from './parts.ts';

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
  run1: P({ y: -2, t: 0.32, fu: -0.6, fl: 1.2, bu: 0.8, bl: 1.0, ft: 0.95, fs: -0.4, bt: -0.6, bs: -1.3, tail: 0.1 }),
  run2: P({ y: 3, t: 0.3, fu: 0.8, fl: 1.0, bu: -0.6, bl: 1.2, ft: -0.6, fs: -1.3, bt: 0.95, bs: -0.4, tail: 0.25 }),
  squat: P({ y: 11, t: 0.42, h: 0.1, fu: -0.3, fl: 0.8, bu: -0.5, bl: 0.8, ft: 0.95, fs: -1.7, bt: 0.55, bs: -1.6 }),
  rise: P({ y: -2, t: 0.1, h: -0.15, fu: 2.2, fl: 0.3, bu: -0.8, bl: 0.6, ft: 0.75, fs: -1.4, bt: -0.2, bs: -0.6, tail: -0.2 }),
  fall: P({ t: 0.05, fu: 1.4, fl: 0.4, bu: -1.0, bl: 0.5, ft: 0.3, fs: -0.2, bt: -0.1, bs: -0.3, tail: 0.6 }),
  tuck: P({ y: 6, t: 0.6, h: 0.3, fu: 0.8, fl: 1.9, bu: 0.6, bl: 1.9, ft: 1.4, fs: -2.3, bt: 1.0, bs: -2.3, tail: 1.0, blink: 1 }),
  hurt: P({ t: -0.5, h: -0.45, fu: -1.2, fl: 0.5, bu: -1.6, bl: 0.3, ft: 0.5, fs: -0.2, bt: -0.4, bs: -0.3, tail: 1.1, jaw: 0.5, blink: 1 }),
  guard: P({ y: 5, t: -0.2, h: 0.15, fu: 1.1, fl: 2.3, bu: 0.9, bl: 2.3, ft: 0.45, fs: -0.7, bt: -0.35, bs: -0.5 }),
  tumble: P({ t: -0.9, h: -0.6, fu: -2.4, fl: 0.4, bu: 2.4, bl: 0.4, ft: 1.0, fs: -0.6, bt: -0.8, bs: -0.6, tail: 1.4, jaw: 0.6, blink: 1 }),
};

// Per-move [wind-up, strike]. Startup tweens rest->wind, first active frames snap wind->strike, recovery eases back.
const ATTACK: Record<MoveId, [Partial<Pose>, Partial<Pose>]> = {
  jab1: [{ fu: 0.2, fl: 1.9, t: 0.0 }, { fu: 1.55, fl: 0.05, t: 0.25, jaw: 0.3 }],
  jab2: [{ bu: 0.1, bl: 1.9, fu: 0.3, fl: 1.6 }, { bu: 1.55, bl: 0.05, fu: 0.2, fl: 1.5, t: 0.3, jaw: 0.3 }],
  jab3: [{ fu: -0.3, fl: 1.7, y: 7, t: 0.3 }, { fu: 2.5, fl: 0.2, t: 0.05, y: -4, h: -0.3, jaw: 0.6 }],
  sideLight: [{ fu: -0.9, fl: 1.2, t: -0.1 }, { fu: 1.6, fl: 0.1, t: 0.5, ft: 0.85, fs: -0.3, bt: -0.75, bs: -0.4, jaw: 0.5 }],
  downLight: [{ y: 10, t: 0.25, ft: 0.9, fs: -1.7 }, { y: 13, t: -0.2, ft: 1.55, fs: 0, bt: -0.2, bs: -1.6, fu: -0.6, bu: 0.6 }],
  airNeutral: [{ fu: -1.6, fl: 0.4, bu: -1.4, bl: 0.4, t: 0.3 }, { fu: 3.0, fl: 0.2, bu: 2.6, bl: 0.2, t: -0.2, h: -0.4, jaw: 0.5 }],
  airSide: [{ ft: 0.9, fs: -2.1, t: -0.2, bt: 0.4, bs: -1.6 }, { ft: 1.65, fs: 0, t: -0.45, bt: -0.4, bs: -1.2, fu: -1.0, bu: -1.0, jaw: 0.3 }],
  airDown: [{ ft: 0.8, fs: -1.9, bt: 0.6, bs: -1.9, t: 0.3 }, { ft: 0.1, fs: 0, bt: -0.1, bs: 0, y: 6, t: 0.1, fu: 2.4, bu: 2.4 }],
  nHeavy: [{ y: 13, t: 0.5, fu: -0.6, fl: 1.7, bu: -0.6, bl: 1.7, ft: 0.85, fs: -1.5, bt: 0.4, bs: -1.4 }, { y: -7, t: -0.2, h: -0.55, fu: 3.0, fl: 0.1, bu: 2.8, bl: 0.1, ft: 0.1, fs: -0.1, bt: -0.1, bs: -0.1, jaw: 0.8 }],
  sHeavy: [{ t: -0.45, fu: -2.3, fl: 0.5, bu: -1.9, bl: 0.4, ft: 0.4, bt: -0.5 }, { t: 0.65, fu: 1.6, fl: 0, bu: 1.2, bl: 0.2, ft: 0.95, fs: -0.2, bt: -0.85, bs: -0.3, jaw: 0.8 }],
  dHeavy: [{ y: 9, t: 0.35, tail: -0.6, fu: 0.9, fl: 1.4 }, { y: 11, t: 0.1, tail: 2.6, fu: 1.6, fl: 0, bu: -1.6, bl: 0, ft: 0.9, fs: -0.6, bt: -0.9, bs: -0.6, jaw: 0.6 }],
  airSideHeavy: [{ t: -0.3, ft: 1.2, fs: -2.1, bt: 1.2, bs: -2.1 }, { t: -0.85, ft: 1.7, fs: 0, bt: 1.5, bs: 0, fu: -2.0, bu: -2.0, jaw: 0.6 }],
  recovery: [{ y: 6, t: 0.35, fu: -0.4, fl: 1.7 }, { t: -0.1, fu: 3.05, fl: 0, bu: -0.8, bl: 0.5, ft: 0.2, fs: -1.2, bt: -0.4, bs: -0.4, h: -0.4, jaw: 0.7 }],
  groundPound: [{ t: 0.5, ft: 1.3, fs: -2.1, bt: 1.1, bs: -2.1, fu: 2.6, fl: 0.8, bu: 2.6, bl: 0.8 }, { t: 0.2, fu: 0.1, fl: 0, bu: 0.1, bl: 0, ft: 0.2, fs: -0.3, bt: -0.3, bs: -0.3, jaw: 0.8 }],
};

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export function lerpPose(a: Pose, b: Pose, k: number): Pose {
  const o = { ...a };
  for (const key in a) (o as any)[key] = (a as any)[key] + ((b as any)[key] - (a as any)[key]) * k;
  return o;
}

const blinkAt = (now: number) => (now % 170 < 6 ? 1 : 0); // ~every 2.8 s at 60 fps
const breathe = (now: number) => ({ ...lerpPose(POSES.idle, POSES.idle2, (Math.sin(now / 9) + 1) / 2), blink: blinkAt(now) });

// Pick + blend the pose for a fighter this frame.
export function poseFor(f: Fighter, now: number): Pose {
  const rest = f.grounded ? POSES.idle : POSES.fall;
  switch (f.state) {
    case 'idle': return breathe(now);
    case 'run': {
      const c = (f.t % 24) / 24;
      return { ...lerpPose(POSES.run1, POSES.run2, ease(c < 0.5 ? c * 2 : 2 - c * 2)), blink: blinkAt(now) };
    }
    case 'jumpsquat': case 'land': return POSES.squat;
    case 'air': return lerpPose(POSES.rise, POSES.fall, ease((f.vy + 8) / 16));
    case 'block': return POSES.guard;
    case 'dodge': return { ...POSES.tuck, r: f.grounded ? 0 : f.t * 0.45 * f.facing };
    case 'hitstun': {
      const big = Math.hypot(f.vx, f.vy) > 10;
      return big ? { ...POSES.tumble, r: -f.t * 0.35 } : POSES.hurt;
    }
    case 'attack': {
      const m = MOVES[f.move!], [w, h] = ATTACK[f.move!];
      const su = startup(f, m), end = su + m.active;
      const wind = { ...rest, ...w }, hit = { ...rest, ...w, ...h };
      if (f.t < su) return lerpPose(rest, wind, ease(f.t / su));
      if (f.t < end) {
        const p = lerpPose(wind, hit, Math.min(1, (f.t - su + 1) / 2));
        return f.move === 'recovery' ? { ...p, r: (f.t - su) * 0.55 } : p;
      }
      return lerpPose(hit, rest, ease((f.t - end) / m.recovery));
    }
    default: return rest;
  }
}

export type { Look } from '../genes.ts';

type V = [number, number];
const down = (o: V, a: number, len: number): V => [o[0] + Math.sin(a) * len, o[1] + Math.cos(a) * len];

const INK = '#1b1426';
const SHADE = 'rgb(20 8 40 / 0.32)', LIGHT = 'rgb(255 255 255 / 0.36)', DIM = 'rgb(20 8 40 / 0.28)';
const METAL = '#cfd6e6', LEATHER = '#6b4530', BOOT = '#3a2c40';
const FLASH: Look = { body: '#fff', belly: '#fff', dark: '#ddd', horn: '#fff', eye: '#fff', mark: '#eee', hornStyle: 0, tailStyle: 0, pattern: 0, eyeStyle: 0, scale: 1 };

// Path2D built lazily (not available in node tests) and cached per SVG string.
const cache = new Map<string, Path2D>();
const path = (d: string) => { let p = cache.get(d); if (!p) cache.set(d, (p = new Path2D(d))); return p; };

// Cel-shaded part: fill, then light rim on top + shadow rim on bottom (world-vertical, whatever the bone angle), ink outline.
// `world` = the fighter-space matrix captured before any bone rotation. `dim` darkens far-side limbs.
function part(ctx: CanvasRenderingContext2D, world: DOMMatrix, d: string, fill: string, line = 2.5, dim = false) {
  const p = path(d);
  ctx.fillStyle = fill; ctx.fill(p);
  const m = ctx.getTransform().invertSelf().multiplySelf(world); // fighter space -> this part's space
  ctx.save(); ctx.clip(p);
  for (const [dy, col] of [[-3.5, SHADE], [2.5, LIGHT]] as const) {
    const q = new Path2D(); q.addPath(p); q.addPath(p, { e: m.c * dy, f: m.d * dy });
    ctx.fillStyle = col; ctx.fill(q, 'evenodd'); // part minus its shifted copy = a rim
  }
  if (dim) { ctx.fillStyle = DIM; ctx.fill(p); }
  ctx.restore();
  if (line) { ctx.strokeStyle = INK; ctx.lineWidth = line; ctx.lineJoin = 'round'; ctx.stroke(p); }
}

// Flat detail (no shading).
function flat(ctx: CanvasRenderingContext2D, d: string, fill: string, line = 0) {
  const p = path(d);
  ctx.fillStyle = fill; ctx.fill(p);
  if (line) { ctx.strokeStyle = INK; ctx.lineWidth = line; ctx.stroke(p); }
}
const line = (ctx: CanvasRenderingContext2D, d: string, col: string, w: number) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(path(d)); };

// Run fn in a bone's local space: origin at joint, bone along +y.
function bone(ctx: CanvasRenderingContext2D, at: V, a: number, fn: () => void) {
  ctx.save(); ctx.translate(...at); ctx.rotate(-a); fn(); ctx.restore();
}

function face(ctx: CanvasRenderingContext2D, L: Look, angry: boolean, blink: number, open: boolean) {
  if (L.eyeStyle === 3) { // visor
    flat(ctx, A.VISOR, METAL, 2);
    line(ctx, A.VISOR_SLIT, blink > 0.5 ? INK : L.horn, 2.2);
  } else if (blink > 0.5) {
    line(ctx, 'M3-4.5Q7.5-2.5 12-4.5', INK, 2);
  } else {
    flat(ctx, A.EYE, '#fff');
    const [x, y, r] = A.EYE_C;
    ctx.save(); ctx.clip(path(A.EYE));
    ctx.fillStyle = L.mark; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = L.eye; ctx.beginPath(); ctx.arc(x + 0.5, y, r * 0.55, 0, Math.PI * 2); ctx.fill();
    if (L.eyeStyle === 2 && !angry) { ctx.fillStyle = L.body; ctx.fillRect(0, -10, 14, 4.6); } // sleepy lid
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke(path(A.EYE));
  }
  if (L.eyeStyle !== 3) flat(ctx, angry || L.eyeStyle === 1 ? A.BROW_ANGRY : A.BROW, INK);
  if (open) flat(ctx, A.MOUTH_OPEN, '#5a1830', 1.6); else line(ctx, A.MOUTH, INK, 1.6);
}

// Draw in fighter-local space: origin at feet, facing right. Caller handles translate/flip.
export function drawMonster(ctx: CanvasRenderingContext2D, p: Pose, look: Look, flash: boolean) {
  const L = flash ? FLASH : look;
  const skin = L.body, cloth = L.dark, armor = L.mark, boot = flash ? '#eee' : BOOT, metal = flash ? '#fff' : METAL, leather = flash ? '#eee' : LEATHER;
  const hip: V = [0, -44 + p.y];
  ctx.save();
  ctx.scale(look.scale, look.scale);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const w = ctx.getTransform(); // light stays world-vertical, even mid-spin
  if (p.r) { ctx.translate(hip[0], hip[1]); ctx.rotate(p.r); ctx.translate(-hip[0], -hip[1]); }

  const up = Math.PI - p.t, neck = down(hip, up, 30), shoulder = down(hip, up, 24);

  const leg = (u: number, l: number, far: boolean) => {
    const knee = down(hip, u, 22), ankle = down(knee, u + l, 23);
    bone(ctx, hip, u, () => part(ctx, w, A.LIMB.thigh, cloth, 2.5, far));
    bone(ctx, knee, u + l, () => { part(ctx, w, A.LIMB.shin, boot, 2.5, far); line(ctx, A.BOOT_TOP, metal, 2); part(ctx, w, A.KNEE, armor, 1.8, far); });
    ctx.save(); ctx.translate(...ankle); ctx.rotate(Math.max(-0.5, Math.min(0.5, -(u + l) * 0.3)));
    part(ctx, w, A.FOOT, boot, 2.5, far);
    ctx.restore();
  };
  const arm = (u: number, l: number, far: boolean) => {
    const elbow = down(shoulder, u, 20);
    bone(ctx, shoulder, u, () => part(ctx, w, A.LIMB.upper, skin, 2.5, far));
    bone(ctx, elbow, u + l, () => {
      part(ctx, w, A.LIMB.fore, skin, 2.5, far);
      part(ctx, w, A.GAUNTLET, leather, 2.2, far); line(ctx, A.CUFF, metal, 2.5);
      if (!far) { // weapon in the front fist, drawn under the fingers
        const wp = A.WEAPON[look.tailStyle] ?? A.WEAPON[0];
        part(ctx, w, wp.grip, leather, 2);
        part(ctx, w, wp.head, metal, 2.2);
        line(ctx, A.BLADE_EDGE[look.tailStyle] ?? A.BLADE_EDGE[0], 'rgb(255 255 255 / 0.7)', 1.4);
        if (wp.guard) part(ctx, w, wp.guard, L.horn, 2);
      }
      part(ctx, w, A.FIST, skin, 2.2, far); line(ctx, A.KNUCKLES, 'rgb(27 20 38 / 0.4)', 1.2);
    });
    if (!far) bone(ctx, shoulder, u, () => part(ctx, w, A.PAULDRON, armor, 2.5));
  };

  // tail: two thin bones sweeping back from the hip
  // hangs back-and-down at rest, lifts as p.tail rises (whips up on dHeavy), tip curls upward
  const ta = -(1.0 + p.tail * 0.5), ta2 = ta - 0.7;
  bone(ctx, hip, ta, () => part(ctx, w, A.LIMB.tail1, skin, 2.2, true));
  bone(ctx, down(hip, ta, 18), ta2, () => {
    part(ctx, w, A.TAIL_TIP[look.tailStyle] ?? A.TAIL_TIP[0], armor, 2);
    part(ctx, w, A.LIMB.tail2, skin, 2, true);
  });

  leg(p.bt, p.bs, true);
  arm(p.bu, p.bl, true);

  // torso: body, chest plate + trim, belt, tasset
  ctx.save(); ctx.translate((hip[0] + neck[0]) / 2, (hip[1] + neck[1]) / 2); ctx.rotate(p.t);
  part(ctx, w, A.TORSO, cloth);
  part(ctx, w, A.PLATE, armor, 2.2);
  if (A.TRIM[look.pattern]) flat(ctx, A.TRIM[look.pattern], L.horn, 1.2);
  part(ctx, w, A.TASSET, cloth, 2.2);
  part(ctx, w, A.BELT, leather, 2);
  part(ctx, w, A.BUCKLE, metal, 1.6);
  ctx.restore();

  // neck + head
  const ha = p.t + p.h;
  bone(ctx, down(neck, up, -4), Math.PI - ha, () => part(ctx, w, A.LIMB.neck, skin, 2.2));
  const head = down(neck, Math.PI - ha, 14);
  const horn = A.HORNS[look.hornStyle] ?? A.HORNS[0];
  ctx.save(); ctx.translate(...head); ctx.rotate(ha);
  if (horn.far) part(ctx, w, horn.far, L.horn, 2.2, true);
  part(ctx, w, A.HEAD, skin);
  part(ctx, w, A.HAIR, armor, 2.2);
  part(ctx, w, A.EAR, skin, 2);
  if (horn.near) part(ctx, w, horn.near, L.horn, 2.2);
  if (horn.curl) { line(ctx, horn.curl, INK, 9); line(ctx, horn.curl, L.horn, 5); }
  face(ctx, L, p.jaw > 0.4, p.blink, p.jaw > 0.2);
  ctx.restore();

  leg(p.ft, p.fs, false);
  arm(p.fu, p.fl, false);
  ctx.restore();
}

// Idle pose for portraits / menus (render-only).
export function idlePose(now: number): Pose {
  return breathe(now);
}
