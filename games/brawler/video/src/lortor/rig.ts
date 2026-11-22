// Lortor cut-out puppet: the painted lortor.png sliced into layers by polygon clips, driven by a small skeleton.
// All coordinates are source-image pixels (368x350, facing right, feet on y=333).

export interface Pose {
  x: number; y: number; // root offset (px, +y = down)
  lean: number; spin: number; // deg: lean pivots at the hip, spin at body centre (flips/rolls)
  sx: number; sy: number; // squash/stretch about the feet
  head: number; cape: number; armB: number; // deg
  sh: number; el: number; ham: number; // front arm: shoulder, elbow, hammer-in-fist (deg)
  fBx: number; fBy: number; fFx: number; fFy: number; // foot targets vs rest ankle (IK)
  plant: number; // 1 = feet stay put in world while root moves (grounded), 0 = feet ride with the body (air)
  blink: number; glow: number; trail: number; streak: number;
  back: number; // >0.5: hammer arm drawn behind the body (over-the-shoulder windups)
}
export const REST: Pose = {
  x: 0, y: 0, lean: 0, spin: 0, sx: 1, sy: 1, head: 0, cape: 0, armB: 0, sh: 0, el: 0, ham: 0,
  fBx: 0, fBy: 0, fFx: 0, fFy: 0, plant: 1, blink: 0, glow: 0, trail: 0, streak: 0, back: 0,
};

type V = [number, number];
const J = {
  neck: [160, 118] as V, capeP: [100, 120] as V, shB: [118, 150] as V,
  hipC: [168, 222] as V, center: [170, 228] as V, feet: [170, 333] as V,
  hipB: [148, 222] as V, kneeB: [143, 268] as V, ankB: [130, 315] as V,
  hipF: [188, 222] as V, kneeF: [200, 270] as V, ankF: [200, 315] as V,
  shF: [194, 140] as V, elF: [192, 172] as V, wrF: [207, 190] as V, grip: [226, 188] as V,
  hamHead: [312, 150] as V, hamOut: [352, 150] as V, hamIn: [272, 168] as V,
};

// Layer outlines (flat x,y lists). Overlaps are hidden by draw order.
const POLY = {
  cape: [
    [97, 112, 80, 132, 55, 162, 30, 195, 14, 216, 10, 252, 20, 282, 42, 294, 80, 292, 96, 280, 100, 256, 92, 246, 102, 230, 106, 200, 101, 170],
  ],
  armB: [[94, 158, 126, 154, 133, 176, 131, 200, 146, 205, 151, 226, 146, 243, 112, 249, 80, 257, 70, 249, 106, 233, 99, 214, 92, 195, 91, 175]],
  thighB: [[129, 212, 170, 212, 172, 250, 162, 286, 127, 286, 125, 250]],
  shinB: [[124, 268, 162, 268, 164, 300, 157, 334, 96, 336, 94, 318, 116, 300]],
  thighF: [[164, 212, 209, 212, 215, 250, 223, 262, 219, 287, 191, 288, 180, 262, 169, 246]],
  shinF: [[177, 266, 216, 266, 222, 294, 244, 314, 244, 336, 170, 336, 175, 300]],
  torso: [[96, 140, 104, 121, 124, 110, 146, 110, 153, 119, 184, 119, 195, 110, 209, 119, 215, 140, 212, 158, 205, 166, 206, 199, 214, 205, 217, 240, 215, 256, 200, 263, 185, 253, 170, 257, 150, 259, 134, 251, 131, 226, 114, 216, 104, 196, 99, 170], [138, 252, 178, 252, 176, 300, 160, 302, 146, 296]],
  head: [[88, 22, 105, 17, 120, 11, 150, 19, 170, 27, 181, 40, 196, 55, 201, 66, 198, 80, 199, 91, 193, 101, 188, 111, 182, 119, 165, 123, 150, 119, 140, 109, 125, 101, 110, 101, 100, 105, 85, 113, 68, 114, 77, 98, 99, 89, 102, 70, 107, 50, 94, 40]],
  fist: [[198, 176, 206, 168, 221, 162, 241, 164, 250, 177, 250, 199, 241, 211, 222, 214, 207, 208, 199, 194]],
  hammer: [[244, 166, 261, 158, 269, 150, 266, 128, 279, 111, 290, 103, 301, 99, 321, 103, 346, 127, 356, 160, 353, 176, 336, 193, 320, 201, 299, 199, 289, 191, 275, 183, 250, 191, 244, 181]],
};
const EYE = [162, 74, 172, 70, 186, 70, 196, 74, 197, 86, 186, 89, 170, 88, 162, 83];

const SKIN = '#4c84c6', SKIN_D = '#2d568f', INK = '#17121f', LEATHER = '#4d3527', WOOD = '#5d4636', RUNE = '#5ff0e0';

const d2r = Math.PI / 180;
const rot = (m: DOMMatrix, [px, py]: V, deg: number) => (deg ? m.translate(px, py).rotate(deg).translate(-px, -py) : m);
const apply = (m: DOMMatrix, [x, y]: V): V => { const p = m.transformPoint({ x, y }); return [p.x, p.y]; };
const ang = (a: V, b: V) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const dist = (a: V, b: V) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// Two-bone IK, knee bends forward (+x). Returns thigh rotation and shin rotation relative to thigh (deg).
function ik(hip: V, knee: V, ank: V, target: V): [number, number] {
  const l1 = dist(hip, knee), l2 = dist(knee, ank);
  const d = Math.max(1, Math.min(l1 + l2 - 0.01, dist(hip, target)));
  const base = ang(hip, target);
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const k: V = [hip[0] + Math.cos(base - a) * l1, hip[1] + Math.sin(base - a) * l1];
  const thigh = ang(hip, k) - ang(hip, knee);
  const shin = ang(k, target) - ang(knee, ank);
  return [thigh / d2r, (shin - thigh) / d2r];
}

// Every bone matrix for a pose (source space -> cell space). Shared by drawing and trail sampling.
export function bones(p: Pose, base: DOMMatrix) {
  let root = rot(base.translate(J.feet[0], J.feet[1]).scale(p.sx, p.sy).translate(-J.feet[0], -J.feet[1]), J.center, 0);
  root = rot(root.translate(p.x, p.y), J.center, p.spin);
  const upper = rot(root, J.hipC, p.lean);
  const k = 1 - p.plant;
  const leg = (hip: V, knee: V, ank: V, fx: number, fy: number) => {
    const [t, s] = ik(hip, knee, ank, [ank[0] + fx - p.x * (1 - k), ank[1] + fy - p.y * (1 - k)]);
    const thigh = rot(root, hip, t);
    return { thigh, shin: rot(thigh, knee, s) };
  };
  const shoulder = rot(upper, J.shF, p.sh), elbow = rot(shoulder, J.elF, p.el);
  return {
    root, upper,
    cape: rot(upper, J.capeP, p.cape), armB: rot(upper, J.shB, p.armB), head: rot(upper, J.neck, p.head),
    legB: leg(J.hipB, J.kneeB, J.ankB, p.fBx, p.fBy), legF: leg(J.hipF, J.kneeF, J.ankF, p.fFx, p.fFy),
    shoulder, elbow, hammer: rot(elbow, J.grip, p.ham),
  };
}
export type Bones = ReturnType<typeof bones>;
export const hammerEdge = (b: Bones): [V, V] => [apply(b.hammer, J.hamOut), apply(b.hammer, J.hamHead)];

function layer(ctx: CanvasRenderingContext2D, img: CanvasImageSource, m: DOMMatrix, polys: number[][]) {
  ctx.save();
  ctx.setTransform(m);
  ctx.beginPath();
  for (const q of polys) { ctx.moveTo(q[0], q[1]); for (let i = 2; i < q.length; i += 2) ctx.lineTo(q[i], q[i + 1]); ctx.closePath(); }
  ctx.clip();
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

// Hand-drawn limb for the arm the painting hides (shoulder->elbow->wrist).
function limb(ctx: CanvasRenderingContext2D, m: DOMMatrix, a: V, b: V, w: number, fill: string) {
  ctx.save(); ctx.setTransform(m);
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = w + 5; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  ctx.strokeStyle = fill; ctx.lineWidth = w; ctx.stroke();
  ctx.strokeStyle = SKIN_D; ctx.lineWidth = w * 0.35; ctx.beginPath(); ctx.moveTo(a[0] - w * 0.2, a[1] + w * 0.15); ctx.lineTo(b[0] - w * 0.2, b[1] + w * 0.15); ctx.stroke();
  ctx.restore();
}

export function drawLortor(ctx: CanvasRenderingContext2D, img: CanvasImageSource, p: Pose, b: Bones, trail: [V, V][]) {
  ctx.imageSmoothingQuality = 'high';
  const arm = () => {
    // weapon trail: ribbon through the hammer's recent outer/inner edge positions
    if (trail.length > 1) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (let i = 1; i < trail.length; i++) {
        const [o0, i0] = trail[i - 1], [o1, i1] = trail[i], k = i / trail.length;
        ctx.globalAlpha = 0.1 + 0.45 * k;
        ctx.fillStyle = k > 0.7 ? '#ffffff' : RUNE;
        ctx.beginPath(); ctx.moveTo(...o0); ctx.lineTo(...o1); ctx.lineTo(...i1); ctx.lineTo(...i0); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    limb(ctx, b.elbow, J.elF, J.wrF, 15, SKIN); // forearm
    ctx.save(); ctx.setTransform(b.hammer); // handle stub hidden under the fist in the painting
    ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(250, 178); ctx.lineTo(206, 199); ctx.stroke();
    ctx.strokeStyle = WOOD; ctx.lineWidth = 6; ctx.stroke(); ctx.restore();
    if (p.glow > 0) { // rune charge on the hammer face
      ctx.save(); ctx.setTransform(b.hammer);
      const g = ctx.createRadialGradient(J.hamHead[0], J.hamHead[1], 2, J.hamHead[0], J.hamHead[1], 60);
      g.addColorStop(0, `rgba(170,255,245,${0.6 * p.glow})`); g.addColorStop(0.35, `rgba(60,230,215,${0.25 * p.glow})`); g.addColorStop(0.7, `rgba(60,230,215,${0.06 * p.glow})`); g.addColorStop(1, 'rgba(60,230,215,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(J.hamHead[0], J.hamHead[1], 60, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    layer(ctx, img, b.hammer, POLY.hammer);
    layer(ctx, img, b.elbow, POLY.fist);
  };
  if (p.streak > 0) { // fast-fall / dive speed lines above the body
    ctx.save(); ctx.setTransform(b.root); ctx.globalAlpha = p.streak * 0.6; ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
    [[120, 4, 90], [165, 3, 130], [215, 4, 100], [245, 2, 70]].forEach(([x, w, l], i) => { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, -10 - i * 12); ctx.lineTo(x, -10 - i * 12 - l); ctx.stroke(); });
    ctx.restore();
  }
  layer(ctx, img, b.cape, POLY.cape);
  if (p.back > 0.5) arm();
  layer(ctx, img, b.armB, POLY.armB);
  layer(ctx, img, b.legB.shin, POLY.shinB); layer(ctx, img, b.legB.thigh, POLY.thighB);
  layer(ctx, img, b.legF.shin, POLY.shinF); layer(ctx, img, b.legF.thigh, POLY.thighF);
  limb(ctx, b.shoulder, J.shF, J.elF, 17, SKIN); // upper arm, mostly behind the torso
  layer(ctx, img, b.upper, POLY.torso);
  layer(ctx, img, b.head, POLY.head);
  if (p.blink > 0.5) { // shut eye: skin lid + lash line
    ctx.save(); ctx.setTransform(b.head);
    ctx.beginPath(); for (let i = 0; i < EYE.length; i += 2) ctx.lineTo(EYE[i], EYE[i + 1]); ctx.closePath();
    ctx.fillStyle = SKIN; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(164, 80); ctx.quadraticCurveTo(180, 86, 196, 79); ctx.stroke();
    ctx.restore();
  }
  if (p.back <= 0.5) arm();
}
