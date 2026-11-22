// Ribbon Rush canvas renderer. Draws in a fixed 768x512 logical space scaled to the canvas backing store.
import { CLOSE_AT, CLOSE_EVERY, FADE, FREEZE, H, MAX_RING, TICK_HZ, W, type Sim } from './sim.ts';
import { COLORS, NAMES } from './riders.ts';
export { COLORS, NAMES };
export const CELL = 16;
const VW = W * CELL, VH = H * CELL, BANDS = 6;
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const px = (i: number) => ((i % W) + 0.5) * CELL, py = (i: number) => (((i / W) | 0) + 0.5) * CELL;

// ponytail: module-level state, one live canvas at a time (play or home preview).
let bg: HTMLCanvasElement | null = null, lastSim: Sim | null = null, alive = [true, true], shakeAt = -1e9, last = 0;
let parts: { x: number; y: number; vx: number; vy: number; life: number; col: string }[] = [];
const seen = new Uint8Array(W * H), path = new Int32Array(W * H + 1);

function background(w: number, h: number, k: number) {
  const b = document.createElement('canvas');
  b.width = w; b.height = h;
  const c = b.getContext('2d')!;
  c.scale(k, k);
  const g = c.createRadialGradient(VW / 2, VH / 2, 40, VW / 2, VH / 2, VW * 0.7);
  g.addColorStop(0, '#12142a'); g.addColorStop(1, '#06070f');
  c.fillStyle = g; c.fillRect(0, 0, VW, VH);
  c.fillStyle = 'rgba(120,130,200,0.16)';
  for (let y = 1; y < H; y++) for (let x = 1; x < W; x++) c.fillRect(x * CELL - 0.75, y * CELL - 0.75, 1.5, 1.5);
  c.strokeStyle = 'rgba(140,150,230,0.25)'; c.lineWidth = 2; c.strokeRect(1, 1, VW - 2, VH - 2);
  return b;
}

function pill(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = 'rgba(6,7,16,0.78)') {
  c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, h / 2); c.fill();
}

function banner(c: CanvasRenderingContext2D, text: string, size: number, y: number, a: number, col = '#f4f1ff', sub = '') {
  if (a <= 0) return;
  c.globalAlpha = Math.min(1, a);
  c.font = '600 15px system-ui, sans-serif';
  const sw = sub ? c.measureText(sub).width : 0;
  c.font = `800 ${size}px system-ui, sans-serif`;
  const w = Math.max(c.measureText(text).width, sw) + 56, h = size * 1.25 + (sub ? 24 : 0);
  pill(c, VW / 2 - w / 2, y - size * 0.62 - 6, w, h + 12, 'rgba(6,7,16,0.82)');
  c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 18;
  c.fillText(text, VW / 2, y);
  c.shadowBlur = 0;
  if (sub) { c.font = '600 15px system-ui, sans-serif'; c.fillStyle = '#b9bce0'; c.fillText(sub, VW / 2, y + size * 0.62 + 10); }
  c.globalAlpha = 1;
}

// Link a seat's cells newest-first: neighbour of same owner whose expire is 0..2 below the current one (boost lays 2 per tick).
function trace(sim: Sim, o: number, start: number): number {
  let n = 0, cur = start;
  while (cur >= 0) {
    seen[cur] = 1; path[n++] = cur;
    const e = sim.expire[cur], x = cur % W, y = (cur / W) | 0;
    let best = -1, be = 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx, ej = sim.expire[j];
      if (seen[j] || sim.owner[j] !== o || ej <= sim.tick || ej > e || ej + 2 < e || ej <= be) continue;
      best = j; be = ej;
    }
    cur = best;
  }
  return n;
}

// Stroke the path tail→head in age bands: one stroke (and one shadowBlur) per band.
function ribbon(c: CanvasRenderingContext2D, sim: Sim, o: number, n: number, head: number) {
  const life = (k: number) => (k < 0 ? 1 : (sim.expire[path[k]] - sim.tick) / FADE);
  const X = (k: number) => (k < 0 ? (sim.riders[o].x + 0.5) * CELL : px(path[k])), Y = (k: number) => (k < 0 ? (sim.riders[o].y + 0.5) * CELL : py(path[k]));
  const lo = head ? -1 : 0;
  let k = n - 1;
  while (k >= lo) {
    const b = Math.min(BANDS - 1, (life(k) * BANDS) | 0);
    c.beginPath(); c.moveTo(X(k), Y(k));
    let j = k - 1;
    while (j >= lo && Math.min(BANDS - 1, (life(j) * BANDS) | 0) === b) { c.lineTo(X(j), Y(j)); j--; }
    if (j >= lo) c.lineTo(X(j), Y(j)); else if (j === k - 1) c.lineTo(X(k) + 0.01, Y(k));
    const f = (b + 1) / BANDS;
    c.globalAlpha = 0.12 + 0.88 * f * f;
    c.strokeStyle = COLORS[o]; c.lineWidth = 2 + 6 * f;
    c.shadowColor = COLORS[o]; c.shadowBlur = f > 0.5 ? 18 * f : 0;
    c.stroke();
    c.shadowBlur = 0;
    if (f > 0.4) { c.globalAlpha = 0.55 * f; c.strokeStyle = '#fff'; c.lineWidth = 1.5 * f + 0.5; c.stroke(); }
    k = j;
  }
  c.globalAlpha = 1;
}

export function render(cv: HTMLCanvasElement, sim: Sim, startAt: number, seat: number) {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
  // ponytail: width from CSS, height from grid aspect; CSS must size the canvas (width:100%) or it grows with dpr.
  const dpr = devicePixelRatio || 1, cw = Math.min(4096, Math.round((cv.clientWidth || VW) * dpr)), ch = Math.round((cw * VH) / VW);
  if (cv.width !== cw || cv.height !== ch || !bg || bg.width !== cw) { cv.width = cw; cv.height = ch; bg = background(cw, ch, cw / VW); }
  const k = cw / VW, c = cv.getContext('2d')!;
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.shadowBlur = 0; c.globalCompositeOperation = 'source-over';
  c.drawImage(bg, 0, 0);

  // crash detection → particles + shake
  if (sim !== lastSim) { lastSim = sim; alive = sim.riders.map((r) => r.alive); parts = []; }
  sim.riders.forEach((r, i) => {
    if (alive[i] && !r.alive) {
      shakeAt = now;
      const x = (Math.max(0, Math.min(W - 1, r.x)) + 0.5) * CELL, y = (Math.max(0, Math.min(H - 1, r.y)) + 0.5) * CELL;
      for (let p = 0; p < 48; p++) {
        const a = Math.random() * 6.283, s = 40 + Math.random() * 260;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.7, col: p % 3 ? COLORS[i] : '#fff' });
      }
      parts.push({ x, y, vx: 0, vy: 0, life: 0.6, col: '' }); // shockwave ring
    }
    alive[i] = r.alive;
  });
  const sh = Math.max(0, 1 - (now - shakeAt) / 250) * 7;
  c.setTransform(k, 0, 0, k, (Math.random() - 0.5) * sh * k, (Math.random() - 0.5) * sh * k);
  c.lineCap = 'round'; c.lineJoin = 'round';

  // closing ring
  const t = now / 1000, g = sim.ring * CELL;
  if (g) {
    c.fillStyle = 'rgba(255,60,100,0.16)';
    c.fillRect(0, 0, VW, g); c.fillRect(0, VH - g, VW, g); c.fillRect(0, g, g, VH - 2 * g); c.fillRect(VW - g, g, g, VH - 2 * g);
    c.strokeStyle = '#ff466e'; c.lineWidth = 2.5; c.shadowColor = '#ff466e'; c.shadowBlur = 14;
    c.strokeRect(g, g, VW - 2 * g, VH - 2 * g); c.shadowBlur = 0;
  }
  const live = !sim.freeze && !sim.done;
  const toStep = sim.roundTick < CLOSE_AT ? CLOSE_AT - sim.roundTick : CLOSE_EVERY - ((sim.roundTick - CLOSE_AT) % CLOSE_EVERY);
  if (live && sim.ring < MAX_RING && toStep <= (sim.ring ? TICK_HZ : 3 * TICK_HZ)) {
    const n = (sim.ring + 1) * CELL, pulse = 0.5 + 0.5 * Math.sin(t * 14);
    c.globalAlpha = 0.25 + 0.6 * pulse; c.strokeStyle = '#ff466e'; c.lineWidth = 2; c.setLineDash([8, 8]);
    c.strokeRect(n, n, VW - 2 * n, VH - 2 * n); c.setLineDash([]);
    if (!sim.ring) { c.lineWidth = 6; c.globalAlpha = 0.35 + 0.5 * pulse; c.strokeRect(3, 3, VW - 6, VH - 6); }
    c.globalAlpha = 1;
  }

  // ribbons
  seen.fill(0);
  for (let o = 0; o < 2; o++) {
    for (let first = 1; ; first = 0) {
      // first path starts next to the rider (newest cells tie on expire when boosting); leftovers start at max expire
      let start = -1, se = sim.tick;
      const r = sim.riders[o];
      for (let d = 0; first && d < 4; d++) {
        const nx = r.x + DX[d], ny = r.y + DY[d], i = ny * W + nx;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && sim.owner[i] === o && sim.expire[i] > se) { start = i; se = sim.expire[i]; }
      }
      const adj = start >= 0 && r.x >= 0 && r.y >= 0 && r.x < W && r.y < H;
      if (start < 0) for (let i = 0; i < W * H; i++) if (!seen[i] && sim.owner[i] === o && sim.expire[i] > se) { start = i; se = sim.expire[i]; }
      if (start < 0) break;
      ribbon(c, sim, o, trace(sim, o, start), adj ? 1 : 0);
    }
  }

  // riders
  sim.riders.forEach((r, i) => {
    if (!r.alive) return;
    const x = (r.x + 0.5) * CELL, y = (r.y + 0.5) * CELL;
    if (r.boostLeft > 0) {
      const bx = -DX[r.dir] * CELL, by = -DY[r.dir] * CELL, ox = -by * 0.55, oy = bx * 0.55;
      c.globalCompositeOperation = 'lighter';
      for (let a = 1; a <= 4; a++) {
        c.globalAlpha = 0.4 * (1 - a / 5); c.fillStyle = COLORS[i];
        c.beginPath(); c.arc(x + bx * a * 0.7, y + by * a * 0.7, CELL * (0.5 - a * 0.06), 0, 7); c.fill();
      }
      c.strokeStyle = '#fff'; c.lineWidth = 1.2;
      for (const s of [-1, 1]) {
        const j = Math.random() * 0.8;
        c.globalAlpha = 0.6; c.beginPath();
        c.moveTo(x + ox * s + bx * (0.6 + j), y + oy * s + by * (0.6 + j)); c.lineTo(x + ox * s + bx * (3 + j), y + oy * s + by * (3 + j)); c.stroke();
      }
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    }
    c.shadowColor = COLORS[i]; c.shadowBlur = r.boostLeft ? 30 : 16;
    c.fillStyle = COLORS[i]; c.beginPath(); c.arc(x, y, CELL * 0.55, 0, 7); c.fill();
    c.shadowBlur = 0; c.fillStyle = '#fff'; c.beginPath(); c.arc(x + DX[r.dir] * 2, y + DY[r.dir] * 2, CELL * 0.24, 0, 7); c.fill();
  });

  // particles
  if (parts.length) {
    c.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      p.life -= dt;
      if (p.life <= 0) continue;
      if (!p.col) {
        const f = 1 - p.life / 0.6;
        c.globalAlpha = 0.8 * (1 - f); c.strokeStyle = '#fff'; c.lineWidth = 3 * (1 - f) + 0.5;
        c.beginPath(); c.arc(p.x, p.y, 6 + f * 70, 0, 7); c.stroke();
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92;
      c.globalAlpha = Math.min(1, p.life * 1.6); c.strokeStyle = p.col; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.06, p.y - p.vy * 0.06); c.stroke();
    }
    parts = parts.filter((p) => p.life > 0);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  }

  // HUD (no shake)
  c.setTransform(k, 0, 0, k, 0, 0);
  c.textBaseline = 'middle';
  // rider chips + round/ring pill live in the DOM frame now (App.tsx)
  c.textAlign = 'center';

  // banners
  const ms = startAt - Date.now();
  if (ms > 0) {
    const fr = (ms % 1000) / 1000, s = 1 + 0.35 * fr * fr * fr;
    c.save(); c.translate(VW / 2, VH / 2); c.scale(s, s); c.translate(-VW / 2, -VH / 2);
    banner(c, String(Math.ceil(ms / 1000)), 96, VH / 2, 1, seat >= 0 ? COLORS[seat] : '#f4f1ff', seat >= 0 ? `you ride ${NAMES[seat]}` : 'get ready');
    c.restore();
  } else if (sim.done) {
    banner(c, sim.winner < 0 ? 'Draw' : sim.winner === seat ? 'You win!' : seat >= 0 ? 'You lose' : `${NAMES[sim.winner]} wins`, 56, VH / 2, 1, sim.winner < 0 || (seat >= 0 && sim.winner !== seat) ? '#f4f1ff' : COLORS[sim.winner], `${sim.score[0]} : ${sim.score[1]}`);
  } else if (sim.freeze) {
    const [a, b] = sim.riders.map((r) => r.alive), el = FREEZE - sim.freeze;
    banner(c, a === b ? 'Double crash' : `${NAMES[a ? 0 : 1]} takes round ${sim.rounds}`, 40, VH / 2, Math.min(el, sim.freeze) / 4, a === b ? '#f4f1ff' : COLORS[a ? 0 : 1], `${sim.score[0]} : ${sim.score[1]}`);
  } else if (sim.roundTick < TICK_HZ && (sim.tick > 0 || startAt > 0)) {
    banner(c, `Round ${sim.rounds + 1}`, 44, VH / 2, (1 - sim.roundTick / TICK_HZ) * 1.5);
  } else if (sim.roundTick >= CLOSE_AT - 3 * TICK_HZ && sim.roundTick < CLOSE_AT) {
    banner(c, 'Ring closing', 34, VH * 0.78, 0.65 + 0.35 * Math.sin(t * 10), '#ff6f8f');
  }
}
