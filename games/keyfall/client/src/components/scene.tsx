// Canvas2D port of the original scene art (tasks/keyfall-reference.md §1, §6, §8).
// Logical canvas 1920x1080, camera ortho 5 => 108 px per world unit, y up.
import { useEffect, useRef } from 'react';

export const W = 1920, H = 1080, PX = 108;
export const sx = (x: number) => W / 2 + x * PX;
export const sy = (y: number) => H / 2 - y * PX;

const NAMES = ['bomber', 'balloon', 'bomb', 'fireball', 'chopper_0', 'chopper_1', 'chopper_2', 'explosion_0', 'explosion_1', 'explosion_2', 'explosion_3',
  'turret_base', 'turret_gun', 'crosshair', 'sky', 'bg_mountains', 'bg_dunes', 'rock_0', 'rock_1', 'rock_2', 'sand', 'city', 'sun', 'moon',
  'cloud_0', 'cloud_1', 'cloud_2', 'cloud_3', 'smoke'] as const;
export type Art = Record<(typeof NAMES)[number], HTMLImageElement>;

let artP: Promise<Art> | null = null;
// Bump when art files change so browsers don't mix cached old sprites with new sizes.
const ART_V = 3;
export const loadArt = () => (artP ??= Promise.all(NAMES.map((n) => new Promise<[string, HTMLImageElement]>((ok, no) => {
  const i = new Image();
  i.onload = () => ok([n, i]);
  i.onerror = no;
  i.src = `/art/${n}.png?v=${ART_V}`;
}))).then((a) => Object.fromEntries(a) as Art));

export type RGB = [number, number, number];
const WHITE: RGB = [1, 1, 1];

// Multiply-tinted copy of a sprite (Light2D colour, red/black flashes). Cached per quantised colour.
const tints = new WeakMap<CanvasImageSource, Map<string, HTMLCanvasElement>>();
export function tint(img: HTMLImageElement | HTMLCanvasElement, c: RGB): CanvasImageSource {
  const q = c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 48));
  if (q[0] === 48 && q[1] === 48 && q[2] === 48) return img;
  let m = tints.get(img);
  if (!m) tints.set(img, (m = new Map()));
  const key = q.join();
  let cv = m.get(key);
  if (!cv) {
    if (m.size > 96) m.clear(); // ponytail: light drifts slowly, a flat clear is enough
    cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d')!;
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgb(${q.map((v) => (v / 48) * 255).join(',')})`;
    g.fillRect(0, 0, cv.width, cv.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(img, 0, 0);
    m.set(key, cv);
  }
  return cv;
}

// Art is drawn at 8x the original pixel size (user's painted asset sheet; backdrop = original pixel art upscaled); world size = px / (ppu * ART_X).
const ART_X = 8;
export type SprOpts = { flip?: boolean; rot?: number; kx?: number; ky?: number; a?: number; c?: RGB };
// Draw a sprite at world (x,y) with Unity pivot (px,py) measured from bottom-left, size = px/ppu units.
export function spr(g: CanvasRenderingContext2D, img: HTMLImageElement | HTMLCanvasElement, x: number, y: number, ppu: number, px: number, py: number, o: SprOpts = {}) {
  const w = (img.width / (ppu * ART_X)) * PX, h = (img.height / (ppu * ART_X)) * PX;
  g.save();
  g.translate(sx(x), sy(y));
  if (o.rot) g.rotate(-o.rot);
  g.scale((o.flip ? -1 : 1) * (o.kx ?? 1), o.ky ?? 1);
  if (o.a != null) g.globalAlpha *= o.a;
  g.drawImage(o.c ? tint(img, o.c) : img, -px * w, -(1 - py) * h, w, h);
  g.restore();
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const mul = (a: RGB, b: RGB): RGB => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];

// DynamicSky colours; cycle stretched to 80 s (40 s day + 40 s night) so a 2 min match goes day-night-day or night-day-night.
const CYCLE = 80, SKY_OFFSET = Math.random() < 0.5 ? 0 : CYCLE / 2;
const DAWN: RGB = [0.481, 0.2, 0.106], NOON: RGB = [1, 0.753, 0.457], DUSK: RGB = [0.613, 0.136, 0.002], NIGHT: RGB = [0.1, 0.1, 0.3];
export function sky(t: number) {
  const n = ((((t + SKY_OFFSET) % CYCLE) + CYCLE) % CYCLE) / CYCLE, day = n < 0.5, p = day ? n * 2 : (n - 0.5) * 2;
  const [a, b, c] = day ? [DAWN, NOON, DUSK] : [DUSK, NIGHT, DAWN];
  const light = p < 0.2 ? mix(a, b, p * 5) : p < 0.8 ? b : mix(b, c, (p - 0.8) * 5);
  return { day, p, light };
}
// BrightnessLit2D (bright pixels boosted x1.5, emissive-ish): approximated as a lifted light colour.
// 0.6 lift: the restyled art is already lit, so the original light colour only tints it.
const LIFT = 0.6;
export const lit = (l: RGB): RGB => [l[0] + (1 - l[0]) * LIFT, l[1] + (1 - l[1]) * LIFT, l[2] + (1 - l[2]) * LIFT];

const PIV: [number, number][] = [[0.464, -0.273], [0.444, -0.083], [0.5, -0.167], [0.483, -0.077]];
type Cloud = { f: number; x: number; y: number; s: number; flip: boolean; v: number };
type Puff = { x: number; y: number; vx: number; vy: number; age: number; life: number };
const U = (a: number, b: number) => a + Math.random() * (b - a);
const cloud = (x: number): Cloud => ({ f: (Math.random() * 4) | 0, x, y: U(-3, 4), s: 1 + U(-0.25, 0.25), flip: Math.random() > 0.5, v: U(0.5, 1.5) });

// Background + city state (clouds, smoke) owned by one canvas.
export class World {
  clouds = Array.from({ length: 10 }, () => cloud(U(-12, 12)));
  puffs: Puff[] = [];
  emit = 0;
  ground: HTMLCanvasElement | null = null;

  step(dt: number, dmg: number) {
    for (const c of this.clouds) { c.x += c.v * dt; if (c.x > 12) Object.assign(c, cloud(-12)); }
    // CitySmoke: emission 0->50/s, lifetime 1->5 s by damage fraction; circle r=1, 60° arc rotated 60°, speed 5, force y 1->0.
    this.emit += lerp(0, 50, dmg) * dt;
    for (; this.emit >= 1; this.emit--) {
      const a = ((60 + Math.random() * 60) * Math.PI) / 180;
      this.puffs.push({ x: Math.cos(a), y: -4.1 + Math.sin(a), vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, age: 0, life: lerp(1, 5, dmg) });
    }
    for (const p of this.puffs) { p.age += dt; p.vy += (1 - p.age / p.life) * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.puffs = this.puffs.filter((p) => p.age < p.life);
  }

  // Everything behind the enemies: sky .. rocks, smoke, ground. t = sky clock (s).
  back(g: CanvasRenderingContext2D, art: Art, t: number) {
    const { day, p, light } = sky(t), b = lit(light);
    spr(g, art.sky, 0, -4.188, 12, 0.5, 0, { c: light });
    for (const c of this.clouds) {
      const im = art[`cloud_${c.f}` as 'cloud_0'];
      spr(g, im, c.x, c.y, 16 / c.s, PIV[c.f][0], PIV[c.f][1], { flip: c.flip, a: 0.882, c: light });
    }
    const arc = Math.sin(p * Math.PI) * 14;
    if (day) spr(g, art.sun, 0, -4.188 - 3.5 + arc, 16, 0.5, 0, { a: 0.784, c: b });
    else spr(g, art.moon, 0, -4.188 - 2.75 + arc, 16, 0.5, 0, { a: 0.784, c: b });
    spr(g, art.bg_mountains, 0, -5.708, 12, 0.5, 0, { c: light });
    spr(g, art.bg_dunes, 0, -4.688, 12, 0.5, 0, { a: 0.862, c: light });
    spr(g, art.rock_1, 6, -4, 12, 0.5, 0, { flip: true, c: light });
    spr(g, art.rock_2, -7, -4, 12, 0.5, 0, { c: light });
    spr(g, art.rock_0, -3.958, -4, 12, 0.516, 0, { c: light });
    spr(g, art.rock_0, 7.958, -4, 12, 0.516, 0, { flip: true, c: light });
    for (const q of this.puffs) {
      const k = q.age / q.life, s = 1 - k;
      if (s > 0.01) spr(g, art.smoke, q.x, q.y, 32 / s, 0.5, 0.5, { a: 1 - k, c: k < 0.18 ? WHITE : [0.887, 0.626, 0.28] });
    }
    if (!this.ground) {
      const c = (this.ground = document.createElement('canvas'));
      c.width = 20 * 16 * ART_X; c.height = 32 * ART_X;
      const gg = c.getContext('2d')!;
      for (let i = 0; i < 20; i++) for (let j = 0; j < 2; j++) gg.drawImage(art.sand, i * 16 * ART_X, j * 16 * ART_X);
    }
    spr(g, this.ground, 0, -6, 16, 0.5, 0, { c: light });
    return light;
  }

  city(g: CanvasRenderingContext2D, art: Art, c: RGB) {
    // one skyline strip across the full view width (replaces the original's two mirrored buildings)
    spr(g, art.city, 0, -4, art.city.width / (17.8 * ART_X), 0.5, 0, { c });
  }
}

export function fit(g: CanvasRenderingContext2D, cv: HTMLCanvasElement, cover: boolean) {
  const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1;
  const w = Math.round(r.width * d), h = Math.round(r.height * d);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  // clear every frame: nothing may rely on the sky covering the canvas (letterbox bars, partial art)
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  const s = (cover ? Math.max : Math.min)(w / W, h / H);
  g.setTransform(s, 0, 0, s, (w - W * s) / 2, (h - H * s) / 2);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
}

// Main-menu scene: same sky, ground, rocks and both city images, no turret, no enemies. Fills the screen.
export function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0, dead = false, last = performance.now();
    const t0 = last, w = new World();
    loadArt().then((art) => {
      const frame = (now: number) => {
        if (dead) return;
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        const cv = ref.current;
        if (!cv) return;
        const g = cv.getContext('2d')!;
        fit(g, cv, true);
        w.step(dt, 0);
        const light = w.back(g, art, (now - t0) / 1000);
        w.city(g, art, lit(light));
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }, () => {});
    return () => { dead = true; cancelAnimationFrame(raf); };
  }, []);
  return <canvas ref={ref} className="backdrop" aria-hidden />;
}
