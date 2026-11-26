// EggMerger renderer: canvas only, reads sim state, never writes it. Wall clock + Math.random allowed here (display only).
import { W, H, LID, SPAWN_Y, WALL, R, pieces } from './sim.js';

const COLORS = ['', '#3fd6c6', '#a26bff', '#ffc845', '#f08a4b', '#7bd36a', '#e0507a', '#4aa3ff', '#c46bff', '#ff6a3d'];
export const art = {};
const load = (k, src) => new Promise((ok) => {
  const i = new Image();
  i.onload = () => { art[k] = i; ok(); };
  i.onerror = () => ok(); // missing art → drawn fallback
  i.src = src;
});
export const loadArt = () => Promise.all([
  ...R.slice(1).map((_, i) => load('t' + (i + 1), `art/t${i + 1}.webp`)),
  load('elder', 'art/elder.webp'), load('nest', 'art/nest.webp'), load('burst', 'art/burst.webp'), load('coin', 'art/coin.webp').then(gild),
]);
// coin art is silver: multiply gold over it once, keep its alpha
function gild() {
  const i = art.coin;
  if (!i) return;
  const c = Object.assign(document.createElement('canvas'), { width: i.width, height: i.height }), g = c.getContext('2d');
  g.drawImage(i, 0, 0);
  g.globalCompositeOperation = 'multiply'; g.fillStyle = '#ffc23a'; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(i, 0, 0);
  art.coin = c;
}

// ---- fx: fed sim events by index.html ----
const fx = { pops: new Map(), flashes: [], coins: [], shake: 0, chain: 0, chainT: 0 };
export function onEvents(events, now) {
  for (const e of events) {
    if (e.type === 'merge') {
      fx.pops.set(e.id, now);
      fx.flashes.push({ x: e.x, y: e.y, r: R[e.tier] * 1.9, t: now, life: 320 });
      fx.chain = now - fx.chainT < 700 ? fx.chain + 1 : 1;
      fx.chainT = now;
      if (fx.chain >= 3 || e.tier >= 7) fx.shake = Math.max(fx.shake, 4 + Math.min(10, fx.chain * 2 + (e.tier - 6) * 2));
    }
    if (e.type === 'elder') {
      fx.flashes.push({ x: e.x, y: e.y, r: 260, t: now, life: 900 });
      fx.shake = 14;
      for (let i = 0; i < 46; i++) fx.coins.push({ x: Math.random() * W, y: -20 - Math.random() * 300, vy: 2 + Math.random() * 3, vx: (Math.random() - 0.5) * 1.5, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3, s: 12 + Math.random() * 10 });
    }
  }
}

function disc(ctx, tier, x, y, r, angle, sx = 1, sy = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  ctx.rotate(angle);
  const img = art['t' + tier];
  if (img) ctx.drawImage(img, -r, -r, r * 2, r * 2);
  else {
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#fff8');
    g.addColorStop(0.25, COLORS[tier]);
    g.addColorStop(1, '#0006');
    ctx.fillStyle = COLORS[tier];
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#0008'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(r * 0.8)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tier, 0, 1);
  }
  ctx.restore();
}

// aim = {x, cur, ready} or null (not playing)
export function render(ctx, s, aim, now) {
  ctx.save();
  if (fx.shake > 0.3) { ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake); fx.shake *= 0.9; }
  // nest
  if (art.nest) ctx.drawImage(art.nest, -8, -8, W + 16, H + 16);
  else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1d1236'); g.addColorStop(0.55, '#2b1a3f'); g.addColorStop(1, '#3a2412');
    ctx.fillStyle = g; ctx.fillRect(-8, -8, W + 16, H + 16);
    ctx.fillStyle = '#0004';
    ctx.beginPath(); ctx.ellipse(W / 2, H + 40, W * 0.75, 140, 0, 0, 7); ctx.fill();
  }
  // lid line: pulses red while in overflow danger
  const d = s?.danger || 0;
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = d ? 3 + 2 * Math.sin(now / 70) : 2;
  ctx.strokeStyle = d ? `rgba(255,${60 - 40 * d},${60 - 40 * d},${0.55 + 0.45 * Math.abs(Math.sin(now / 90))})` : '#ffffff55';
  if (d) { ctx.shadowColor = '#ff2a2a'; ctx.shadowBlur = 12 + 18 * d; }
  ctx.beginPath(); ctx.moveTo(0, LID); ctx.lineTo(W, LID); ctx.stroke();
  ctx.restore();
  if (d > 0.15) { ctx.fillStyle = `rgba(255,30,40,${0.12 * d * (1 + Math.sin(now / 80))})`; ctx.fillRect(0, 0, W, LID); }

  // aim guide + held piece
  if (aim && s && !s.over) {
    const r = R[aim.cur], x = Math.min(W - WALL - r, Math.max(WALL + r, aim.x));
    ctx.save();
    ctx.setLineDash([3, 9]); ctx.lineCap = 'round'; ctx.lineWidth = 3;
    ctx.strokeStyle = aim.ready ? '#ffffffb0' : '#ffffff40';
    ctx.beginPath(); ctx.moveTo(x, SPAWN_Y + r + 6); ctx.lineTo(x, H); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = aim.ready ? 1 : 0.45;
    disc(ctx, aim.cur, x, SPAWN_Y, r, 0, 1, 1 + 0.03 * Math.sin(now / 180));
    ctx.globalAlpha = 1;
  }

  // pieces (squash pop on merge)
  if (s) for (const b of pieces(s)) {
    const t0 = fx.pops.get(b.id);
    let sx = 1, sy = 1;
    if (t0 !== undefined) {
      const k = (now - t0) / 260;
      if (k >= 1) fx.pops.delete(b.id);
      else { const w = Math.sin(k * Math.PI * 2) * (1 - k) * 0.3; sx = 1 + w; sy = 1 - w; const g = 0.6 + 0.4 * Math.min(1, k * 3); sx *= g; sy *= g; }
    }
    disc(ctx, b.tier, b.position.x, b.position.y, R[b.tier], b.angle, sx, sy);
  }

  // burst flashes
  fx.flashes = fx.flashes.filter((f) => {
    const k = (now - f.t) / f.life;
    if (k >= 1) return false;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(f.x, f.y); ctx.rotate(k * 1.2);
    const r = f.r * (0.6 + 0.6 * k);
    if (art.burst) ctx.drawImage(art.burst, -r, -r, r * 2, r * 2);
    else { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#ffd76a'); g.addColorStop(1, '#ffd76a00'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); }
    ctx.restore();
    return true;
  });
  ctx.restore();

  // coin shower (outside the shake)
  fx.coins = fx.coins.filter((c) => {
    c.vy += 0.12; c.y += c.vy; c.x += c.vx; c.a += c.va;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a); ctx.scale(Math.abs(Math.cos(c.a * 2)) * 0.7 + 0.3, 1);
    if (art.coin) ctx.drawImage(art.coin, -c.s, -c.s, c.s * 2, c.s * 2);
    else { ctx.fillStyle = '#ffcf4a'; ctx.strokeStyle = '#a86d00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, c.s * 0.8, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.restore();
    return c.y < H + 40;
  });

  // next-piece preview
  if (s && !s.over) {
    ctx.fillStyle = '#0007';
    ctx.beginPath(); ctx.roundRect(W - 62, 8, 54, 64, 12); ctx.fill();
    ctx.fillStyle = '#ffffffb0'; ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('NEXT', W - 35, 22);
    disc(ctx, s.next, W - 35, 46, 18, 0);
  }
}
