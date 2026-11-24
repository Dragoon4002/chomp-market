// Cutout heroes: image parts cut in Blender (games/brawler/sprites/cutout/cut.py) driven by the same Pose as rig.ts.
// The source art is the idle pose, so every bone rotates by (pose - POSES.idle). Render-only.
import { BASE } from '../nav.ts';
import { POSES, type Pose } from './rig.ts';
import type { Dna } from '../genes.ts';

type V = [number, number];
interface Part { name: string; bone: keyof Pose | 'cape'; parent: string | null; pivot: V; at: V; img: HTMLImageElement }
interface Hero { feet: V; hip: V; height: number; parts: Part[]; byName: Map<string, Part> }

const I = POSES.idle;
const HEIGHT = 100; // game units for the full image height
const heroes = new Map<string, Hero | false | null>(); // null: loading, false: failed

// Hero per monster, derived from DNA so every client agrees with no extra data on the wire.
// Five equal 72° hue bands, each centred on that hero's colour: red, green, teal, blue, purple.
export const HERO_IDS = ['bramdra', 'makvel', 'grodrasu', 'lortor', 'torfen'] as const;
export type HeroId = typeof HERO_IDS[number];
export const heroOf = (dna: Dna): HeroId => HERO_IDS[Math.round(dna.hue / 72) % 5];
// Only 5 art sets, picked by hue bucket: hue x5 spreads one bucket over the whole colour wheel so siblings look distinct.
export const tintOf = (dna: Dna) => `hue-rotate(${(dna.hue * 5 + dna.accent) % 360}deg) saturate(${0.85 + dna.pattern * 0.2})`;

// Starts loading on first call; null until every part image is ready.
export function hero(name: string): Hero | null {
  if (!heroes.has(name)) {
    heroes.set(name, null);
    const dir = `${BASE}/chars/${name}/cutout/`;
    fetch(dir + 'rig.json').then((r) => r.json()).then(async (h: Hero) => {
      await Promise.all(h.parts.map((p) => { p.img = new Image(); p.img.src = `${dir}${p.name}.png`; return p.img.decode(); }));
      h.byName = new Map(h.parts.map((p) => [p.name, p]));
      heroes.set(name, h);
    }).catch((e) => { console.warn('cutout hero', name, e); heroes.set(name, false); });
  }
  return heroes.get(name) || null;
}
export const heroReady = (name: string) => (hero(name), heroes.get(name) !== null);

// Canvas rotation for a part. Limbs: + pose angle = toward facing = counter-clockwise on canvas.
// Arms hang off the torso but their pose angles are world angles, so undo the torso lean.
function rot(p: Pose, bone: Part['bone']): number {
  const dt = p.t - I.t;
  switch (bone) {
    case 't': return dt;
    case 'h': return p.h - I.h;
    case 'cape': return (p.tail - I.tail) * 0.35;
    case 'fu': case 'bu': return -(p[bone] - I[bone]) - dt;
    default: return -(p[bone] - I[bone]);
  }
}

function place(ctx: CanvasRenderingContext2D, h: Hero, part: Part, p: Pose) {
  if (part.parent) place(ctx, h, h.byName.get(part.parent)!, p);
  const [x, y] = part.pivot;
  ctx.translate(x, y); ctx.rotate(rot(p, part.bone)); ctx.translate(-x, -y);
}

// Fighter-local space: origin at feet, facing right.
const tinted = new WeakMap<Hero, Map<string, CanvasImageSource[]>>();
function partsIn(h: Hero, tint: string): CanvasImageSource[] {
  if (!tint) return h.parts.map((x) => x.img);
  let m = tinted.get(h);
  if (!m) tinted.set(h, (m = new Map()));
  let out = m.get(tint);
  if (!out) {
    out = h.parts.map(({ img }) => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d')!;
      g.filter = tint; g.drawImage(img, 0, 0);
      return c;
    });
    m.set(tint, out);
  }
  return out;
}

export function drawHero(ctx: CanvasRenderingContext2D, p: Pose, h: Hero, flash: boolean, tint = '') {
  const k = HEIGHT / h.height;
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(-h.feet[0], -h.feet[1] + (p.y - I.y) / k);
  if (p.r) { ctx.translate(...h.hip); ctx.rotate(p.r); ctx.translate(-h.hip[0], -h.hip[1]); }
  if (flash) ctx.filter = 'brightness(0) invert(1)';
  const imgs = partsIn(h, flash ? '' : tint);
  h.parts.forEach((part, i) => {
    ctx.save(); place(ctx, h, part, p); ctx.drawImage(imgs[i], ...part.at); ctx.restore();
  });
  ctx.restore();
}
