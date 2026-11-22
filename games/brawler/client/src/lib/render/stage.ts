// Procedural arena art. Render-only; geometry comes from stages.ts so visuals always match collision.
// Static art (sky, parallax silhouettes, platforms) is painted once per stage into offscreen canvases;
// only light/water/particles animate per frame.
import { STAGES, type StageId, type Rect, type Ledge } from '../stages.ts';
import { paintArtBackground, paintArtStage } from './artstage.ts';

const INK = '#140c1f';
const VW = 1280, VH = 720; // logical viewport (matches draw.ts)
const TILE = 2048; // parallax layer width; silhouettes are periodic over it so they tile seamlessly
const TAU = Math.PI * 2;

type C = CanvasRenderingContext2D;
type Cam = { x: number; y: number };

// Seeded RNG so decoration placement is identical every paint.
function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function canvas(w: number, h: number): [HTMLCanvasElement, C] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

// ---------------------------------------------------------------- shared shapes

function outline(c: C, w = 5) { c.lineWidth = w; c.strokeStyle = INK; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }

function vgrad(c: C, y0: number, y1: number, stops: string[]) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}

// Periodic ridge line: sum of sines whose periods divide TILE, so x=0 and x=TILE match.
function ridge(x: number, seed: number, amp: number, harmonics = [2, 5, 11, 23]) {
  let y = 0;
  harmonics.forEach((h, i) => { y += Math.sin((x / TILE) * TAU * h + seed * (i + 1)) * amp / (i + 1.3); });
  return y;
}

// Hanging rock / root mass under a floating island.
function underside(c: C, x0: number, x1: number, y: number, depth: number, fill: CanvasGradient | string, seed: number, rim = 'rgba(255,255,255,0.15)') {
  const r = rng(seed), mid = (x0 + x1) / 2, n = 14;
  c.beginPath(); c.moveTo(x0, y);
  for (let i = 1; i < n; i++) {
    const k = i / n, x = x0 + (x1 - x0) * k;
    const taper = Math.sin(k * Math.PI); // deepest in the middle
    c.lineTo(x + (r() - 0.5) * 18, y + depth * taper * (0.55 + r() * 0.45) + (Math.abs(x - mid) < 40 ? depth * 0.25 : 0));
  }
  c.lineTo(x1, y); c.closePath();
  c.fillStyle = fill; c.fill();
  c.save(); c.clip(); c.fillStyle = vgrad(c, y, y + depth * 0.5, [rim, 'rgba(0,0,0,0)']); c.fillRect(x0, y, x1 - x0, depth); c.restore();
  outline(c);
  // strata cracks
  c.strokeStyle = 'rgba(20,12,31,0.45)'; c.lineWidth = 2.5;
  for (let i = 0; i < 7; i++) {
    const x = x0 + 40 + r() * (x1 - x0 - 80), yy = y + 20 + r() * depth * 0.45;
    c.beginPath(); c.moveTo(x, yy); c.lineTo(x + 14 + r() * 20, yy + 10 + r() * 16); c.lineTo(x + 6 + r() * 30, yy + 30 + r() * 20); c.stroke();
  }
}

// Chunky stone slab: dark side, lit top band, rim highlight, block seams, ink outline.
function stoneSlab(c: C, s: Rect, top: string, side: string, rim: string, seed: number) {
  const r = rng(seed), w = s.x1 - s.x0, h = s.y1 - s.y;
  c.beginPath(); c.roundRect(s.x0, s.y, w, h, 8);
  c.fillStyle = side; c.fill();
  // block seams in two staggered rows
  c.strokeStyle = 'rgba(20,12,31,0.5)'; c.lineWidth = 2.5;
  for (let row = 0; row < 2; row++) {
    const yy = s.y + 18 + row * (h - 18) / 2;
    c.beginPath(); c.moveTo(s.x0 + 4, yy); c.lineTo(s.x1 - 4, yy); c.stroke();
    for (let x = s.x0 + 30 + row * 35 + r() * 20; x < s.x1 - 20; x += 70 + r() * 30) {
      c.beginPath(); c.moveTo(x, yy); c.lineTo(x, Math.min(s.y1 - 4, yy + (h - 18) / 2)); c.stroke();
    }
  }
  c.fillStyle = top; c.fillRect(s.x0, s.y, w, 16);
  c.fillStyle = rim; c.fillRect(s.x0 + 6, s.y + 2, w - 12, 3);
  // chips along the top edge
  c.fillStyle = side;
  for (let x = s.x0 + 40 + r() * 40; x < s.x1 - 40; x += 90 + r() * 80) { c.beginPath(); c.moveTo(x, s.y + 16); c.lineTo(x + 8, s.y + 9); c.lineTo(x + 16, s.y + 16); c.fill(); }
  c.beginPath(); c.roundRect(s.x0, s.y, w, h, 8); outline(c);
}

// Wooden plank ledge (soft platform).
function plank(c: C, l: Ledge, wood: string, light: string, dark: string) {
  const w = l.x1 - l.x0;
  c.beginPath(); c.roundRect(l.x0 - 6, l.y, w + 12, 16, 5);
  c.fillStyle = wood; c.fill();
  c.fillStyle = light; c.fillRect(l.x0 - 2, l.y + 2, w + 4, 4);
  c.strokeStyle = dark; c.lineWidth = 2;
  for (let x = l.x0 + 34; x < l.x1 - 10; x += 46) { c.beginPath(); c.moveTo(x, l.y + 3); c.lineTo(x, l.y + 15); c.stroke(); }
  c.beginPath(); c.roundRect(l.x0 - 6, l.y, w + 12, 16, 5); outline(c, 4);
  c.fillStyle = INK;
  for (const x of [l.x0 + 8, l.x1 - 8]) { c.beginPath(); c.arc(x, l.y + 9, 2.5, 0, TAU); c.fill(); }
}

function glow(c: C, x: number, y: number, r: number, color: string, alpha = 1) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = alpha; c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.globalAlpha = 1;
}

// ---------------------------------------------------------------- per-stage art

interface Art {
  sky: (c: C) => void; // VW x VH, static
  layers: { k: number; y: number; paint: (c: C) => void }[]; // TILE x 400 parallax strips, far -> near
  world: (c: C) => void; // static stage art in world coords
  under?: (c: C, t: number) => void; // animated, behind the static stage art
  live?: (c: C, t: number) => void; // animated, over stage art, behind fighters
  front: (c: C, t: number) => void; // animated, over fighters (world coords)
}

const silhouette = (c: C, color: string, base: number, amp: number, seed: number, h = [2, 5, 11, 23]) => {
  c.fillStyle = color; c.beginPath(); c.moveTo(0, 400);
  for (let x = 0; x <= TILE; x += 16) c.lineTo(x, base + ridge(x, seed, amp, h));
  c.lineTo(TILE, 400); c.fill();
};

const ember: Art = {
  sky(c) {
    c.fillStyle = vgrad(c, 0, VH, ['#1b1236', '#3d2560', '#8a3f6e', '#e0744a', '#f7b46a']); c.fillRect(0, 0, VW, VH);
    glow(c, VW * 0.5, VH * 0.78, 340, 'rgba(255,190,110,0.85)');
    c.fillStyle = '#ffd99a'; c.beginPath(); c.arc(VW * 0.5, VH * 0.8, 70, 0, TAU); c.fill();
    // cloud streaks
    c.fillStyle = 'rgba(255,170,140,0.25)';
    const r = rng(7);
    for (let i = 0; i < 9; i++) { c.beginPath(); c.ellipse(r() * VW, 120 + r() * 300, 120 + r() * 160, 6 + r() * 8, 0, 0, TAU); c.fill(); }
  },
  layers: [
    { k: 0.08, y: 330, paint: (c) => silhouette(c, '#4b2b5e', 150, 90, 1) },
    {
      k: 0.18, y: 360, paint: (c) => {
        silhouette(c, '#33204a', 210, 50, 3);
        // ruined towers / arches on the ridge
        const r = rng(11); c.fillStyle = '#33204a';
        for (let x = 60; x < TILE - 60; x += 220 + r() * 160) {
          const h = 90 + r() * 120, w = 30 + r() * 20, base = 215 + ridge(x, 3, 50);
          c.fillRect(x, base - h, w, h);
          c.fillStyle = 'rgba(255,170,90,0.55)'; // lit windows
          for (let wy = base - h + 22; wy < base - 20; wy += 34) if (r() > 0.4) c.fillRect(x + w / 2 - 3, wy, 6, 10);
          c.fillStyle = '#33204a';
          c.beginPath(); c.moveTo(x, base - h); c.lineTo(x + w * 0.3, base - h - 18); c.lineTo(x + w * 0.6, base - h - 4); c.lineTo(x + w, base - h - 12); c.lineTo(x + w, base - h); c.fill();
          if (r() > 0.5) { c.beginPath(); c.arc(x + w + 40, base - h * 0.6, 40, Math.PI, 0); c.lineTo(x + w + 80, base); c.lineTo(x + w + 70, base); c.arc(x + w + 40, base - h * 0.6 + 8, 30, 0, Math.PI, true); c.lineTo(x + w, base); c.fill(); }
        }
      },
    },
  ],
  world(c) {
    const st = STAGES.ember, m = st.solids[0];
    underside(c, m.x0 + 10, m.x1 - 10, m.y1 - 6, 280, vgrad(c, m.y1, m.y1 + 280, ['#8a6a90', '#5a3e72', '#2e1d48']), 5, 'rgba(255,170,110,0.45)');
    // floating rock chunks drifting under the island
    for (const [x, y, r] of [[470, 800, 22], [560, 900, 14], [1130, 800, 22], [1040, 900, 14], [800, 1020, 18]] as const) {
      c.beginPath(); c.moveTo(x - r, y - r * 0.3); c.lineTo(x - r * 0.4, y - r * 0.7); c.lineTo(x + r * 0.7, y - r * 0.5); c.lineTo(x + r, y); c.lineTo(x + r * 0.2, y + r * 1.1); c.lineTo(x - r * 0.6, y + r * 0.6); c.closePath();
      c.fillStyle = '#6b4e7c'; c.fill(); outline(c, 4);
      c.fillStyle = '#ffb36b'; c.fillRect(x - r * 0.4, y - r * 0.6, r * 0.9, 2.5);
    }
    // broken pillars standing on the island (decor, behind fighters)
    for (const [x, h] of [[440, 250], [1160, 210]] as const) {
      c.beginPath(); c.moveTo(x - 26, m.y); c.lineTo(x - 26, m.y - h); c.lineTo(x - 10, m.y - h - 22); c.lineTo(x + 4, m.y - h - 6); c.lineTo(x + 26, m.y - h - 16); c.lineTo(x + 26, m.y); c.closePath();
      c.fillStyle = vgrad(c, m.y - h, m.y, ['#9c86a8', '#6e5a80']); c.fill();
      c.strokeStyle = 'rgba(20,12,31,0.35)'; c.lineWidth = 3;
      for (const dx of [-10, 6]) { c.beginPath(); c.moveTo(x + dx, m.y - h + 6); c.lineTo(x + dx, m.y - 6); c.stroke(); }
      c.fillStyle = '#ffb36b'; c.fillRect(x + 18, m.y - h, 5, h - 6); // sunset rim light
      c.beginPath(); c.moveTo(x - 26, m.y); c.lineTo(x - 26, m.y - h); c.lineTo(x - 10, m.y - h - 22); c.lineTo(x + 4, m.y - h - 6); c.lineTo(x + 26, m.y - h - 16); c.lineTo(x + 26, m.y); outline(c);
      // lantern arm
      const dir = x < 800 ? 1 : -1;
      c.beginPath(); c.moveTo(x, m.y - h + 40); c.lineTo(x + dir * 70, m.y - h + 40); outline(c, 9);
      c.strokeStyle = '#6e5a80'; c.lineWidth = 4; c.beginPath(); c.moveTo(x, m.y - h + 40); c.lineTo(x + dir * 70, m.y - h + 40); c.stroke();
    }
    stoneSlab(c, m, '#a58fb5', '#6b5680', '#ffc58a', 21);
    // chains holding the ledges
    for (const l of st.soft) {
      for (const x of [l.x0 + 14, l.x1 - 14]) {
        c.strokeStyle = INK; c.lineWidth = 3; c.setLineDash([7, 5]);
        c.beginPath(); c.moveTo(x, l.y); c.lineTo(x, l.y - 520); c.stroke(); c.setLineDash([]);
      }
      plank(c, l, '#9a6a42', '#d29a62', '#5d3c22');
    }
  },
  live(c, t) {
    const m = STAGES.ember.solids[0];
    for (const [x, h] of [[440, 250], [1160, 210]] as const) {
      const dir = x < 800 ? 1 : -1, ax = x + dir * 64, ay = m.y - h + 40, sw = Math.sin(t * 1.6 + x) * 0.12;
      const lx = ax + Math.sin(sw) * 44, ly = ay + Math.cos(sw) * 44;
      glow(c, lx, ly, 70 + Math.sin(t * 9 + x) * 4, 'rgba(255,170,80,0.55)');
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(lx, ly - 14); outline(c, 2);
      c.beginPath(); c.roundRect(lx - 11, ly - 14, 22, 28, 5); c.fillStyle = '#ffcf6e'; c.fill(); outline(c, 3);
      c.fillStyle = INK; c.fillRect(lx - 13, ly - 17, 26, 5); c.fillRect(lx - 13, ly + 12, 26, 5);
    }
  },
  front(c, t) {
    // rising embers
    for (let i = 0; i < 36; i++) {
      const s = (i * 0.6180339) % 1, speed = 40 + s * 50;
      const y = 1000 - ((t * speed + s * 1400) % 1300), x = 200 + s * 1200 + Math.sin(t * 0.9 + i) * 26;
      c.globalAlpha = 0.55 + Math.sin(t * 5 + i) * 0.35;
      c.fillStyle = i % 3 ? '#ffb05a' : '#ffe39a';
      c.beginPath(); c.arc(x, y, 2 + s * 2.5, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  },
};

const grove: Art = {
  sky(c) {
    c.fillStyle = vgrad(c, 0, VH, ['#0d1a2e', '#1f3358', '#4a4a86', '#8a5f9e', '#c98fb3']); c.fillRect(0, 0, VW, VH);
    glow(c, VW * 0.72, 150, 220, 'rgba(210,230,255,0.5)');
    c.fillStyle = '#e8f1ff'; c.beginPath(); c.arc(VW * 0.72, 150, 46, 0, TAU); c.fill();
    c.fillStyle = 'rgba(160,190,230,0.5)'; c.beginPath(); c.arc(VW * 0.72 + 14, 140, 9, 0, TAU); c.arc(VW * 0.72 - 12, 162, 6, 0, TAU); c.fill();
    const r = rng(3); c.fillStyle = '#fff';
    for (let i = 0; i < 70; i++) { c.globalAlpha = 0.3 + r() * 0.6; c.fillRect(r() * VW, r() * VH * 0.5, 2, 2); }
    c.globalAlpha = 1;
  },
  layers: [
    {
      k: 0.07, y: 250, paint: (c) => {
        // giant far trees: trunks + canopy blobs
        const r = rng(4); c.fillStyle = '#1d3350';
        for (let x = 40; x < TILE; x += 260 + r() * 120) {
          const w = 40 + r() * 30; c.fillRect(x, 120, w, 300);
          for (let j = 0; j < 5; j++) { c.beginPath(); c.arc(x + w / 2 + (r() - 0.5) * 220, 80 + r() * 90, 60 + r() * 50, 0, TAU); c.fill(); }
        }
      },
    },
    { k: 0.16, y: 380, paint: (c) => silhouette(c, '#173046', 160, 60, 2, [3, 7, 13, 29]) },
    {
      k: 0.28, y: 420, paint: (c) => {
        silhouette(c, '#10243a', 210, 40, 6, [4, 9, 19, 37]);
        const r = rng(9); c.fillStyle = '#10243a';
        for (let x = 0; x < TILE; x += 90 + r() * 90) { c.beginPath(); c.moveTo(x, 220); c.lineTo(x + 26, 80 + r() * 60); c.lineTo(x + 52, 220); c.fill(); } // pines
      },
    },
  ],
  world(c) {
    const st = STAGES.grove;
    for (const [i, m] of st.solids.entries()) {
      const mid = (m.x0 + m.x1) / 2;
      // great trunk under each island
      c.beginPath(); c.moveTo(mid - 70, m.y1); c.bezierCurveTo(mid - 50, m.y1 + 200, mid - 90, m.y1 + 500, mid - 120, m.y1 + 700);
      c.lineTo(mid + 120, m.y1 + 700); c.bezierCurveTo(mid + 90, m.y1 + 500, mid + 50, m.y1 + 200, mid + 70, m.y1); c.closePath();
      c.fillStyle = vgrad(c, m.y1, m.y1 + 700, ['#5a3d4a', '#38253a', '#1c1426']); c.fill(); outline(c);
      underside(c, m.x0 + 8, m.x1 - 8, m.y1 - 6, 120, vgrad(c, m.y1, m.y1 + 120, ['#6e4e62', '#3a2840']), 30 + i, 'rgba(150,230,200,0.3)');
      // roots
      const r = rng(40 + i); c.strokeStyle = INK; c.lineWidth = 4;
      for (let k = 0; k < 6; k++) { const x = m.x0 + 30 + r() * (m.x1 - m.x0 - 60); c.beginPath(); c.moveTo(x, m.y1 + 10); c.quadraticCurveTo(x + (r() - 0.5) * 60, m.y1 + 80, x + (r() - 0.5) * 40, m.y1 + 120 + r() * 80); c.stroke(); }
      stoneSlab(c, m, '#4fa88a', '#5c4060', '#b8f0c9', 50 + i);
      // moss lip + leaf tufts
      c.fillStyle = '#3d8a70';
      for (let x = m.x0 + 6; x < m.x1 - 6; x += 22) { c.beginPath(); c.arc(x + 11, m.y + 15, 10, 0, Math.PI); c.fill(); }
      for (let k = 0; k < 5; k++) {
        const x = m.x0 + 30 + r() * (m.x1 - m.x0 - 60);
        c.fillStyle = '#6fd1a4'; c.beginPath(); c.ellipse(x, m.y - 2, 14, 6, -0.4, 0, TAU); c.ellipse(x + 12, m.y - 3, 12, 5, 0.4, 0, TAU); c.fill();
      }
    }
    // hanging vines for the high centre branch
    const top = st.soft[1];
    for (const x of [top.x0 + 20, top.x1 - 20]) {
      c.beginPath(); c.moveTo(x, top.y); c.bezierCurveTo(x - 20, top.y - 200, x + 20, top.y - 400, x, top.y - 700); outline(c, 7);
      c.strokeStyle = '#3d8a70'; c.lineWidth = 4; c.stroke();
    }
    // branches (soft)
    for (const l of st.soft) {
      const w = l.x1 - l.x0;
      c.beginPath(); c.roundRect(l.x0 - 8, l.y, w + 16, 15, 7);
      c.fillStyle = '#7a5640'; c.fill();
      c.fillStyle = '#a6795a'; c.fillRect(l.x0, l.y + 2, w, 4);
      c.beginPath(); c.roundRect(l.x0 - 8, l.y, w + 16, 15, 7); outline(c, 4);
      for (const x of [l.x0 - 8, l.x1 + 8]) {
        for (const [dx, dy, rot] of [[0, -6, -0.5], [10, 2, 0.3], [-10, 4, 2.6]] as const) {
          c.beginPath(); c.ellipse(x + dx, l.y + dy, 15, 7, rot, 0, TAU); c.fillStyle = '#5cc296'; c.fill(); outline(c, 3);
        }
      }
    }
  },
  under(c, t) {
    // swaying hanging vines from the canopy above the gap
    for (const [i, x] of [600, 720, 880, 1000].entries()) {
      const sw = Math.sin(t * 0.8 + i) * 12;
      c.beginPath(); c.moveTo(x, -300); c.quadraticCurveTo(x + sw, 0, x + sw * 1.6, 150 + (i % 2) * 40);
      c.strokeStyle = 'rgba(40,90,80,0.8)'; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#4fa88a'; c.beginPath(); c.ellipse(x + sw * 1.6, 155 + (i % 2) * 40, 6, 3, 0.6, 0, TAU); c.fill();
    }
  },
  front(c, t) {
    for (let i = 0; i < 28; i++) {
      const s = (i * 0.7548776) % 1, s2 = (i * 0.5698403) % 1;
      const x = 250 + s * 1100 + Math.sin(t * 0.5 + i * 2) * 60, y = 180 + s2 * 520 + Math.cos(t * 0.7 + i) * 40;
      const a = 0.4 + 0.6 * Math.max(0, Math.sin(t * 2.2 + i * 1.7));
      glow(c, x, y, 16, 'rgba(210,255,140,0.9)', a * 0.6);
      c.globalAlpha = a; c.fillStyle = '#f4ffb0'; c.beginPath(); c.arc(x, y, 2.4, 0, TAU); c.fill(); c.globalAlpha = 1;
    }
  },
};

const docks: Art = {
  sky(c) {
    c.fillStyle = vgrad(c, 0, VH, ['#050a1e', '#0d1a40', '#1f3266', '#3a4a7a']); c.fillRect(0, 0, VW, VH);
    const r = rng(12); c.fillStyle = '#fff';
    for (let i = 0; i < 120; i++) { c.globalAlpha = 0.25 + r() * 0.7; const s = r() < 0.1 ? 3 : 2; c.fillRect(r() * VW, r() * VH * 0.6, s, s); }
    c.globalAlpha = 1;
    glow(c, VW * 0.3, 170, 260, 'rgba(255,220,140,0.45)');
    c.fillStyle = '#ffe9b0'; c.beginPath(); c.arc(VW * 0.3, 170, 58, 0, TAU); c.fill();
    c.fillStyle = 'rgba(220,190,120,0.5)'; c.beginPath(); c.arc(VW * 0.3 - 18, 158, 11, 0, TAU); c.arc(VW * 0.3 + 16, 186, 8, 0, TAU); c.fill();
  },
  layers: [
    {
      k: 0.06, y: 360, paint: (c) => {
        silhouette(c, '#141f45', 120, 30, 8);
        // ship silhouette + lighthouse
        c.fillStyle = '#0e1736';
        const sx = 700, sy = 150;
        c.beginPath(); c.moveTo(sx - 120, sy); c.lineTo(sx + 130, sy); c.lineTo(sx + 100, sy + 34); c.lineTo(sx - 95, sy + 34); c.fill();
        c.fillRect(sx - 4, sy - 150, 6, 150); c.fillRect(sx + 60, sy - 110, 5, 110);
        c.beginPath(); c.moveTo(sx + 2, sy - 140); c.quadraticCurveTo(sx + 60, sy - 80, sx + 4, sy - 20); c.fill();
        c.beginPath(); c.moveTo(sx - 6, sy - 130); c.quadraticCurveTo(sx - 70, sy - 75, sx - 6, sy - 25); c.fill();
        c.beginPath(); c.moveTo(sx + 63, sy - 100); c.quadraticCurveTo(sx + 105, sy - 60, sx + 64, sy - 18); c.fill();
        c.fillRect(1500, 40, 24, 120); c.beginPath(); c.moveTo(1496, 40); c.lineTo(1512, 20); c.lineTo(1528, 40); c.fill();
        c.fillStyle = '#ffd77a'; c.fillRect(1504, 46, 16, 10);
      },
    },
  ],
  world(c) {
    const st = STAGES.docks, m = st.solids[0];
    // pier posts down into the water
    for (let x = m.x0 + 30; x <= m.x1 - 30; x += 118) {
      c.beginPath(); c.rect(x - 12, m.y1 - 4, 24, 220); c.fillStyle = vgrad(c, m.y1, m.y1 + 220, ['#5a4030', '#2a1d20']); c.fill(); outline(c, 4);
    }
    // deck
    c.beginPath(); c.roundRect(m.x0, m.y, m.x1 - m.x0, m.y1 - m.y, 6); c.fillStyle = '#7a5638'; c.fill();
    c.strokeStyle = 'rgba(20,12,31,0.55)'; c.lineWidth = 2.5;
    for (let x = m.x0 + 40; x < m.x1; x += 40) { c.beginPath(); c.moveTo(x, m.y + 14); c.lineTo(x, m.y1 - 4); c.stroke(); }
    c.fillStyle = '#a77b52'; c.fillRect(m.x0, m.y, m.x1 - m.x0, 14);
    c.fillStyle = '#f4cf7a'; c.fillRect(m.x0 + 6, m.y + 2, m.x1 - m.x0 - 12, 3); // moonlit rim
    c.fillStyle = '#4e3426'; c.fillRect(m.x0, m.y1 - 12, m.x1 - m.x0, 8); // beam
    c.beginPath(); c.roundRect(m.x0, m.y, m.x1 - m.x0, m.y1 - m.y, 6); outline(c);
    // lamp posts at both ends
    for (const x of [m.x0 + 22, m.x1 - 22]) {
      c.beginPath(); c.rect(x - 5, m.y - 150, 10, 150); c.fillStyle = '#2b2a3a'; c.fill(); outline(c, 3);
      c.beginPath(); c.roundRect(x - 14, m.y - 186, 28, 36, 6); c.fillStyle = '#ffd77a'; c.fill(); outline(c, 4);
    }
    // crates hung from crane ropes (soft platforms = crate lids)
    for (const l of st.soft) {
      const w = l.x1 - l.x0, h = 66;
      for (const x of [l.x0 + 18, l.x1 - 18]) { c.beginPath(); c.moveTo(x, l.y); c.lineTo((l.x0 + l.x1) / 2, l.y - 70); outline(c, 3); }
      c.beginPath(); c.moveTo((l.x0 + l.x1) / 2, l.y - 70); c.lineTo((l.x0 + l.x1) / 2, l.y - 700); outline(c, 3);
      c.beginPath(); c.rect(l.x0, l.y, w, h); c.fillStyle = '#9b7046'; c.fill();
      c.strokeStyle = '#6a4a2c'; c.lineWidth = 6;
      c.beginPath(); c.moveTo(l.x0 + 6, l.y + 6); c.lineTo(l.x1 - 6, l.y + h - 6); c.moveTo(l.x1 - 6, l.y + 6); c.lineTo(l.x0 + 6, l.y + h - 6); c.stroke();
      c.fillStyle = '#c99a62'; c.fillRect(l.x0, l.y, w, 12);
      c.fillStyle = '#f4cf7a'; c.fillRect(l.x0 + 4, l.y + 2, w - 8, 3);
      c.beginPath(); c.rect(l.x0, l.y, w, h); outline(c, 4);
      c.beginPath(); c.moveTo(l.x0, l.y + 12); c.lineTo(l.x1, l.y + 12); outline(c, 3);
    }
  },
  live(c, t) {
    const m = STAGES.docks.solids[0];
    for (const x of [m.x0 + 22, m.x1 - 22]) glow(c, x, m.y - 168, 90 + Math.sin(t * 7 + x) * 5, 'rgba(255,210,120,0.45)');
  },
  under(c, t) {
    // far water body behind the posts; front() adds wave bands over the post bases
    c.fillStyle = vgrad(c, 740, 1300, ['#1c2f63', '#0b1638', '#050b20']);
    c.fillRect(-800, 740, 3200, 700);
    // moon reflection streak
    for (let i = 0; i < 9; i++) {
      const y = 760 + i * 22, w = 60 - i * 4 + Math.sin(t * 2 + i) * 14;
      c.globalAlpha = 0.5 - i * 0.04; c.fillStyle = '#ffe2a0';
      c.fillRect(560 + Math.sin(t * 1.3 + i * 1.7) * 18 - w / 2, y, w, 4);
    }
    c.globalAlpha = 1;
  },
  front(c, t) {
    // wave bands over the post bases
    for (let row = 0; row < 4; row++) {
      const y = 770 + row * 34, amp = 7 - row, sp = 1.2 + row * 0.3;
      c.beginPath(); c.moveTo(-800, 1400);
      for (let x = -800; x <= 2400; x += 40) c.lineTo(x, y + Math.sin(x / 70 + t * sp + row) * amp);
      c.lineTo(2400, 1400); c.closePath();
      c.fillStyle = ['rgba(40,70,140,0.55)', 'rgba(25,45,100,0.7)', 'rgba(15,30,75,0.85)', '#0a1534'][row]; c.fill();
      c.beginPath();
      for (let x = -800; x <= 2400; x += 40) c.lineTo(x, y + Math.sin(x / 70 + t * sp + row) * amp);
      c.strokeStyle = 'rgba(200,220,255,0.25)'; c.lineWidth = 2; c.stroke();
    }
    // spray around the pier posts
    const m = STAGES.docks.solids[0];
    for (let i = 0; i < 24; i++) {
      const x0 = m.x0 + 30 + (i % 9) * 118, ph = (t * 0.9 + i * 0.37) % 1;
      c.globalAlpha = (1 - ph) * 0.7; c.fillStyle = '#d8e8ff';
      c.beginPath(); c.arc(x0 + (i % 2 ? 1 : -1) * ph * 26, 772 - Math.sin(ph * Math.PI) * 30, 2.5, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  },
};

const ART: Record<StageId, Art> = { ember, grove, docks };

// ---------------------------------------------------------------- caches + public API

// World-space static art is cached over this rect (camera zoom never exceeds 1, so 1.25x stays crisp).
const WORLD = { x: -100, y: -450, w: 1800, h: 1450, s: 1.25 };
interface Cache { sky: HTMLCanvasElement; layers: HTMLCanvasElement[]; world: HTMLCanvasElement }
const cache = new Map<StageId, Cache>();

function built(id: StageId): Cache {
  let k = cache.get(id);
  if (k) return k;
  const art = ART[id];
  const [sky, sc] = canvas(VW, VH); art.sky(sc);
  const layers = art.layers.map((l) => { const [cv, lc] = canvas(TILE, 400); l.paint(lc); return cv; });
  const [world, wc] = canvas(WORLD.w * WORLD.s, WORLD.h * WORLD.s);
  wc.scale(WORLD.s, WORLD.s); wc.translate(-WORLD.x, -WORLD.y); art.world(wc);
  k = { sky, layers, world };
  cache.set(id, k);
  return k;
}

// Screen-space sky + parallax. cam = world point at screen centre.
export function paintBackground(c: C, id: StageId, cam: Cam) {
  const k = built(id), art = ART[id];
  c.drawImage(k.sky, 0, 0);
  art.layers.forEach((l, i) => {
    const off = -(((cam.x * l.k) % TILE) + TILE) % TILE;
    const y = l.y - (cam.y - 450) * l.k * 0.6;
    for (let x = off; x < VW; x += TILE) c.drawImage(k.layers[i], x, y);
    c.fillStyle = sampleBottom(k.layers[i]); c.fillRect(0, y + 399, VW, VH);
  });
}

// Fill under a strip with its own bottom colour so zooming out never shows sky below it.
const bottoms = new WeakMap<HTMLCanvasElement, string>();
function sampleBottom(cv: HTMLCanvasElement) {
  let col = bottoms.get(cv);
  if (!col) { const d = cv.getContext('2d')!.getImageData(TILE / 2, 399, 1, 1).data; col = `rgb(${d[0]},${d[1]},${d[2]})`; bottoms.set(cv, col); }
  return col;
}

// World-space layers. Call inside the camera transform: paintStage before fighters, paintFront after.
export function paintStage(c: C, id: StageId, t: number) {
  ART[id].under?.(c, t);
  c.drawImage(built(id).world, WORLD.x, WORLD.y, WORLD.w, WORLD.h);
  ART[id].live?.(c, t);
}
export function paintFront(c: C, id: StageId, t: number) { ART[id].front(c, t); }

// Static preview for the arena-select screen. Returns false while the painted art is still loading (repaint later).
export function drawStageThumb(c: C, id: StageId, w: number, h: number, t = 0) {
  c.save();
  c.scale(w / VW, h / VH);
  const cam = { x: 800, y: 470 };
  if (!paintArtBackground(c, id, cam, VW, VH)) paintBackground(c, id, cam);
  const z = 0.82;
  c.translate(VW / 2, VH / 2); c.scale(z, z); c.translate(-800, -470);
  const art = paintArtStage(c, id);
  if (!art) { paintStage(c, id, t); paintFront(c, id, t); }
  c.restore();
  return art;
}
