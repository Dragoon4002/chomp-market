// Painted stage art: screen-space backdrop + world-space platform image. Source art: assets/stages/<id> -> public/stages/<id>
// (black bg keyed by sprites/stages/key.py; walkable surfaces measured with sprites/stages/surf.py and written into stages.ts).
import { STAGES, type StageId } from '../stages.ts';
import { BASE } from '../nav.ts';

// s = world units per image px; `at` pins image point (px, py) to world point (wx, wy). Must agree with stages.ts geometry.
const ART: Record<StageId, { s: number; at: [px: number, py: number, wx: number, wy: number]; bg: boolean }> = {
  ember: { s: 0.85, at: [837, 452, 800, 600], bg: true },
  docks: { s: 0.87, at: [708.5, 621, 800.0, 640], bg: true },
  grove: { s: 1.09, at: [734, 559, 800, 620], bg: false },
};

const imgs = new Map<string, HTMLImageElement | false | null>(); // null: loading, false: failed
function img(src: string) {
  if (!imgs.has(src)) { imgs.set(src, null); const i = new Image(); i.src = BASE + src; i.decode().then(() => imgs.set(src, i), () => imgs.set(src, false)); }
  return imgs.get(src) || null;
}
const srcs = (id: StageId) => [...(ART[id].bg ? ['bg'] : []), 'fg', 'top'].map((n) => `/stages/${id}/${n}.webp`);
export const artReady = (id: StageId) => srcs(id).every((s) => (img(s), imgs.get(s) !== null));

// Screen-space backdrop, cover-fit with a little parallax. false = not ready / none (caller paints procedural sky).
export function paintArtBackground(c: CanvasRenderingContext2D, id: StageId, cam: { x: number; y: number }, W: number, H: number) {
  const i = ART[id].bg ? img(`/stages/${id}/bg.webp`) : null;
  if (!i) return false;
  const k = Math.max(W / i.width, H / i.height) * 1.12;
  c.drawImage(i, (W - i.width * k) / 2 - (cam.x - 800) * 0.04, (H - i.height * k) / 2 - (cam.y - 450) * 0.03, i.width * k, i.height * k);
  return true;
}

// World-space platforms. false = not ready (caller paints procedural stage).
export function paintArtStage(c: CanvasRenderingContext2D, id: StageId) {
  const i = img(`/stages/${id}/fg.webp`);
  if (!i) return false;
  const { s, at: [px, py, wx, wy] } = ART[id];
  c.drawImage(i, wx - px * s, wy - py * s, i.width * s, i.height * s);
  return true;
}

// Front layer (clouds / sea+crane / canopy): static, blurred once at load, drawn over fighters, stretched 1:1 over the blast box.
const TOP_BLUR = 4; // px
const blurred = new Map<string, HTMLCanvasElement>();

const EXT = 3000, IN = 8; // camera at min zoom sees well past the blast box: smear the (un-faded) edge pixels outward

export function paintArtFront(c: CanvasRenderingContext2D, id: StageId) {
  const i = img(`/stages/${id}/top.webp`);
  if (!i) return;
  let o = blurred.get(id);
  if (!o) {
    o = document.createElement('canvas'); o.width = i.width; o.height = i.height;
    const x = o.getContext('2d')!; x.filter = `blur(${TOP_BLUR}px)`; x.drawImage(i, 0, 0);
    blurred.set(id, o);
  }
  const b = STAGES[id].blast, w = b.x1 - b.x0, h = b.y1 - b.y0, W = o.width, H = o.height;
  const xs = [[0, IN, b.x0 - EXT, EXT], [IN, W - 2 * IN, b.x0, w], [W - IN, IN, b.x1, EXT]]; // [src x, src w, dest x, dest w]
  const ys = [[0, IN, b.y0 - EXT, EXT], [IN, H - 2 * IN, b.y0, h], [H - IN, IN, b.y1, EXT]];
  for (const [sy, sh, dy, dh] of ys) for (const [sx, sw, dx, dw] of xs) {
    const mid = sx === IN && sy === IN; // centre = the art itself; edges/corners use the outer IN px as a stretched strip
    if (mid) c.drawImage(o, 0, 0, W, H, b.x0, b.y0, w, h);
    else c.drawImage(o, sx, sy, sw, sh, dx, dy, dw, dh);
  }
}
