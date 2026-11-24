// Canvas renderer: reads sim state + UI state, never writes either. Art from art/manifest.json, shapes as fallback.
import { GLYPH, COST, MATCH_T, OT_T, CORE_HP, dropOf } from './sim.js?v=2';
import { W, H, HEXES, CORE, BLOCKED, center, key, isPath, zoneOf, hexAt } from './map.js?v=1';

const ME = '#3fa9ff', FOE = '#ff5a6a', GOLD = '#e0b04a', NAVY = '#1c1f3f', MAG = '#e040fb';
let art = { v: 0, tile: 32, sprites: {} };
const imgs = {}, tinted = new Map();

export async function loadArt() {
  try {
    const r = await fetch('art/manifest.json?v=' + Date.now());
    if (!r.ok) return;
    art = await r.json();
    for (const [k, sp] of Object.entries(art.sprites ?? {})) {
      const im = new Image();
      im.onload = () => (imgs[k] = im);
      im.src = `art/${sp.src}?v=${art.v}`;
    }
  } catch { /* shapes only */ }
}

// tint:true sprites are neutral grey; colour by DNA hue, cached per (key, hue)
function imgOf(key, hue) {
  const im = imgs[key], sp = art.sprites?.[key];
  if (!im || !sp?.tint || hue == null) return im;
  const id = key + '|' + hue;
  let c = tinted.get(id);
  if (!c) {
    c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = `hsla(${hue},70%,50%,0.55)`;
    g.fillRect(0, 0, c.width, c.height);
    tinted.set(id, c);
  }
  return c;
}

// Draws sprite `key` anchored at (x,y) px; size from manifest tiles * T * scale. False if no art.
function sprite(ctx, key, x, y, T, { hue, frame = 0, rot = 0, scale = 1 } = {}) {
  const sp = art.sprites?.[key], im = imgOf(key, hue);
  if (!sp || !im) return false;
  const n = sp.frames || 1, fw = (im.naturalWidth || im.width) / n, fh = im.naturalHeight || im.height;
  const w = sp.w * T * scale, h = sp.h * T * scale, [ax, ay] = sp.anchor ?? [0.5, 0.5];
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(im, (frame % n) * fw, 0, fw, fh, -ax * w, -ay * h, w, h);
  ctx.restore();
  return true;
}
const frameOf = (key, ms) => { const sp = art.sprites?.[key]; return sp?.frames ? Math.floor((ms * (sp.fps || 8)) / 1000) : 0; };

// Stretches image `key` over a rect (hud/arena art). False if no art.
function pic(ctx, key, x, y, w, h, hue) {
  const im = art.sprites?.[key] && imgOf(key, hue);
  if (!im) return false;
  ctx.drawImage(im, x, y, w, h);
  return true;
}
function hex(ctx, x, y, r) { // pointy-top hexagon path
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 2; ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); }
  ctx.closePath();
}
function rrect(ctx, x, y, w, h, r, fill, stroke, lw = 2) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
// Outlined text, never under 11 px (small phones); maxW squeezes it horizontally rather than overflow.
function text(ctx, str, x, y, size, col = '#fff', align = 'center', maxW = undefined) {
  size = Math.max(11, size);
  ctx.font = `800 ${Math.round(size)}px system-ui,sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, size * 0.18); ctx.strokeStyle = '#0b0c1f'; ctx.strokeText(str, x, y, maxW);
  ctx.fillStyle = col; ctx.fillText(str, x, y, maxW);
}

// Tray rects (fractions of the tray), from the hud.tray manifest entry; this copy is the no-art fallback (landscape:
// energy row left, 4 cards + Next right, as the reference).
const TRAY = { w: 20, h: 3.6, bar: [0.1, 0.44, 0.3, 0.16], gem: [0.065, 0.52], next: [0.875, 0.3, 0.075, 0.6],
  cards: [0.44, 0.545, 0.65, 0.755].map((x) => [x, 0.08, 0.095, 0.84]) };
const sz = (key, w, h) => [art.sprites?.[key]?.w ?? w, art.sprites?.[key]?.h ?? h]; // manifest size in T (1 T = 1 hex = 1000 sim units)
const R_HEX = 1000 / Math.sqrt(3); // hex corner radius, sim units
// World rect the arena covers: from the arena art when it says so, else the board plus a scenery ring.
const worldRect = () => (art.sprites?.arena?.world && imgs.arena ? art.sprites.arena.world : [-1000, -1000, W + 1000, H + 1000]);

// Layout in px. T = px per hex. Fit the board (+1.2 hex each side, HUD strip above, tray below); the arena art
// around it may spill off-screen. The tray shrinks to the screen width if needed.
// sa = safe-area insets {l,t,r,b} px: board, HUD and tray stay inside them (notch / home bar); only art spills out.
const HUD_T = 1.7, GAP_T = 0.3, NO_SA = { l: 0, t: 0, r: 0, b: 0 };
export function layout(cw, ch, sa = NO_SA) {
  const wr = worldRect(), aw = (wr[2] - wr[0]) / 1000, ah = (wr[3] - wr[1]) / 1000;
  const tp = { ...TRAY, ...art.sprites?.['hud.tray'] }, fw = (W + 2400) / 1000, fh = HUD_T + H / 1000 + GAP_T + tp.h;
  const sw = cw - sa.l - sa.r, sh = ch - sa.t - sa.b; // safe rect size
  const T = Math.max(6, Math.min(sw / fw, sh / fh)), k = T / 1000;
  const top = sa.t + Math.max(0, (sh - fh * T) / 2), by = top + HUD_T * T; // by = screen y of world y 0
  const ts = Math.min(1, sw / (tp.w * T)), tw = tp.w * T * ts, th = tp.h * T * ts;
  const tray = { x: sa.l + (sw - tw) / 2, y: Math.min(by + (H / 1000 + GAP_T) * T, sa.t + sh - th), w: tw, h: th };
  const R = ([x, y, w, h]) => ({ x: tray.x + x * tray.w, y: tray.y + y * tray.h, w: w * tray.w, h: h * tray.h });
  return { T, k, cw, ch, sx: sa.l, sw, wr, top, ax: sa.l + sw / 2 - (W / 2 - wr[0]) * k, ay: by + wr[1] * k, by, aw, ah, tray, cards: tp.cards.map(R), next: R(tp.next),
    bar: R(tp.bar), label: tp.label && R(tp.label), gem: [tray.x + tp.gem[0] * tray.w, tray.y + tp.gem[1] * tray.h], portrait: ch > cw };
}
// Seat 1 sees the board point-mirrored, so every player has their own core on the right.
export const toScreen = (L, flip, x, y) => [L.ax + ((flip ? W - x : x) - L.wr[0]) * L.k, L.ay + ((flip ? H - y : y) - L.wr[1]) * L.k];
export const toWorld = (L, flip, px, py) => {
  const x = (px - L.ax) / L.k + L.wr[0], y = (py - L.ay) / L.k + L.wr[1];
  return [flip ? W - x : x, flip ? H - y : y];
};
// Hex + role under a screen point for the selected card (null kind = invalid drop).
export function dropAt(L, s, ui, px, py) {
  const h = hexAt(...toWorld(L, ui.seat === 1, px, py));
  return { h, kind: h && ui.sel != null ? dropOf(s, ui.seat, s.P[ui.seat].hand[ui.sel], ...h) : null };
}
// Anchored sprite's top edge, for HP bars.
const topOf = (key, y, T, w, h) => y - (art.sprites?.[key]?.anchor?.[1] ?? 0.5) * sz(key, w, h)[1] * T;

function bar(ctx, x, y, w, h, f, col) {
  ctx.fillStyle = '#0b0c1f'; ctx.fillRect(x - w / 2 - 1.5, y - 1.5, w + 3, h + 3);
  ctx.fillStyle = col; ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, f)), h);
}
function glyph(ctx, g, x, y, size, col = '#fff') {
  ctx.fillStyle = col; ctx.font = `bold ${Math.round(size)}px system-ui,sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g, x, y);
}
function shadow(ctx, x, y, rx, col) {
  ctx.fillStyle = col + '88'; ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.4, 0, 0, Math.PI * 2); ctx.fill();
}

const live = []; // fx with age (render-side only)
let lastT = -1;

// ui: {seat, sel, drag:{x,y}|null, ms, banner, names}
function hexFill(ctx, L, flip, hx, hy, fill, stroke) {
  const [x, y] = toScreen(L, flip, ...center(hx, hy));
  hex(ctx, x, y, R_HEX * L.k * 0.96);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  return [x, y];
}
// One-hex overlay sprite (hex.ok / hex.attack / hex.bad / hex.base*) or a canvas hex in `col`.
function hexOver(ctx, L, flip, h, k, col) {
  const [x, y] = toScreen(L, flip, ...center(...h));
  if (!sprite(ctx, k, x, y, L.T)) { hex(ctx, x, y, R_HEX * L.k * 0.92); ctx.fillStyle = col; ctx.fill(); }
  return [x, y];
}

// ui: {seat, sel, drag:{x,y,moved}|null, ms, banner, names, ai, showRange}
// ctx arrives pre-scaled to CSS px (caller owns the DPR transform).
export function render(ctx, cw, ch, s, ui) {
  const L = layout(cw, ch, ui.sa), { T } = L, flip = ui.seat === 1, P = (x, y) => toScreen(L, flip, x, y);
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = '#1a1840'; ctx.fillRect(0, 0, cw, ch);
  if (!pic(ctx, 'arena', L.ax, L.ay, L.aw * T, L.ah * T)) { // no baked arena: canvas hexes (zones, path, rocks)
    const [x0, y0] = P(flip ? W + 600 : -600, flip ? H + 600 : -600), [x1, y1] = P(flip ? -600 : W + 600, flip ? -600 : H + 600);
    rrect(ctx, x0, y0, x1 - x0, y1 - y0, T * 0.8, '#3a3550', '#5b5470', 4);
    for (const [hx, hy] of HEXES) {
      const z = zoneOf(hx), mine = z === ui.seat;
      const fill = BLOCKED.has(key(hx, hy)) ? '#5e5870' : isPath(hx, hy) ? '#e0b98a' : z < 0 ? '#5d8f3c' : mine ? '#2f6fb8' : '#a8384a';
      hexFill(ctx, L, flip, hx, hy, fill, '#00000030');
    }
  }
  // drag targets: path = attack, own free ground = defend; hovered invalid hex = bad
  const sel = ui.sel != null, hov = sel && ui.drag?.moved ? dropAt(L, s, ui, ui.drag.x, ui.drag.y) : null;
  if (sel) for (const h of HEXES) {
    const kd = dropOf(s, ui.seat, s.P[ui.seat].hand[ui.sel], ...h);
    if (kd) hexOver(ctx, L, flip, h, kd === 'attack' ? 'hex.attack' : 'hex.ok', kd === 'attack' ? '#ffb02e66' : '#4dff9a55');
  }
  if (hov?.h) hexOver(ctx, L, flip, hov.h, hov.kind ? (hov.kind === 'attack' ? 'hex.attack' : 'hex.ok') : 'hex.bad', hov.kind ? '#ffffff55' : '#ff304099');

  for (let seat = 0; seat < 2; seat++) {
    const mine = seat === ui.seat, col = mine ? ME : FOE, p = s.P[seat];
    const [cx, cy] = P(...center(...CORE[seat]));
    const ck = mine ? 'core' : 'coreEnemy';
    if (!sprite(ctx, ck, cx, cy, T)) {
      ctx.fillStyle = '#3b3846'; ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(cx - T * 0.8, cy - T * 0.9, 1.6 * T, 1.6 * T, T * 0.3); ctx.fill(); ctx.stroke();
      glyph(ctx, '♛', cx, cy - T * 0.1, T, col);
    }
    bar(ctx, cx, topOf(ck, cy, T, 2, 2) - T * 0.2, 1.6 * T, T * 0.14, p.core / CORE_HP, col);
    for (const d of p.defs) { // defender on a team-coloured hex plinth
      const [x, y] = hexOver(ctx, L, flip, [d.hx, d.hy], mine ? 'hex.base' : 'hex.baseEnemy', mine ? '#1f5fae' : '#9c2a3c');
      if (!imgs[mine ? 'hex.base' : 'hex.baseEnemy']) { hex(ctx, x, y, R_HEX * L.k * 0.92); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(); }
      const uk = 'unit.' + d.arch, hue = d.m.dna.hue;
      if (!sprite(ctx, uk, x, y + T * 0.15, T, { hue, frame: frameOf(uk, ui.ms + d.id * 97), scale: 0.8 })) {
        ctx.fillStyle = `hsl(${hue},65%,55%)`; ctx.beginPath(); ctx.arc(x, y, T * 0.3, 0, 7); ctx.fill();
        glyph(ctx, GLYPH[d.arch], x, y, T * 0.4);
      }
      bar(ctx, x, y - T * 0.75, T * 0.8, T * 0.1, d.hp / d.max, col);
      if (ui.showRange) { ctx.strokeStyle = col + '50'; ctx.beginPath(); ctx.arc(x, y, d.range * L.k, 0, 7); ctx.stroke(); }
    }
  }
  // units
  for (const u of s.units) {
    const mine = u.seat === ui.seat, col = mine ? ME : FOE, [x, y0] = P(u.x, u.y), y = y0 + (u.lead ? 0 : ((u.id % 3) - 1) * T * 0.2);
    const key = u.lead ? 'unit.' + u.arch : u.from === 'grunt' ? 'unit.grunt' : 'unit.minion';
    const r = u.lead ? T * 0.42 : T * 0.26, hue = u.from === 'grunt' ? null : u.hue;
    shadow(ctx, x, y + r * 0.6, r * 1.1, col);
    if (!sprite(ctx, key, x, y, T, { hue, frame: frameOf(key, ui.ms + u.id * 97), scale: 0.8 })) {
      ctx.fillStyle = hue == null ? '#9a9a9a' : `hsl(${u.hue},65%,55%)`;
      ctx.strokeStyle = hue == null ? '#555' : `hsl(${u.accent},70%,40%)`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
      if (u.lead) glyph(ctx, GLYPH[u.arch], x, y, r * 1.1);
    }
    bar(ctx, x, y - r - T * 0.18, r * 2, T * 0.09, u.hp / u.max, col);
  }
  // fx
  if (s.t !== lastT) { lastT = s.t; for (const f of s.fx) if (f.x != null) live.push({ ...f, at: ui.ms }); }
  for (let i = live.length - 1; i >= 0; i--) {
    const f = live[i], age = ui.ms - f.at;
    if (age > 350 || age < 0) { live.splice(i, 1); continue; }
    const [x, y] = P(f.x, f.y), k = age / 350;
    if (f.k === 'shot' || (f.k === 'hit' && f.x1 != null)) {
      const [x1, y1] = P(f.x1, f.y1), px = x1 + (x - x1) * Math.min(1, k * 2), py = y1 + (y - y1) * Math.min(1, k * 2);
      const hue = f.seat === ui.seat ? 205 : 355;
      if (f.k === 'shot' && !sprite(ctx, 'fx.shot', px, py, T, { hue, rot: Math.atan2(y - y1, x - x1) + Math.PI / 2 })) {
        ctx.fillStyle = f.seat === ui.seat ? ME : FOE; ctx.beginPath(); ctx.arc(px, py, T * 0.1, 0, 7); ctx.fill();
      }
      if (f.k === 'hit' && k > 0.4 && !sprite(ctx, 'fx.hit', x, y, T, { frame: Math.floor(k * 3) })) {
        ctx.strokeStyle = '#fff8'; ctx.beginPath(); ctx.arc(x, y, T * 0.2 * k, 0, 7); ctx.stroke();
      }
    } else if (f.k === 'splash') {
      if (!sprite(ctx, 'fx.splash', x, y, T, { hue: 30, frame: Math.floor(k * 4) })) {
        ctx.strokeStyle = `rgba(255,180,80,${1 - k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, T * k, 0, 7); ctx.stroke();
      }
    } else if (f.k === 'miss' || f.k === 'revive' || f.k === 'hop') {
      glyph(ctx, { miss: 'miss', revive: '♥', hop: '⤒' }[f.k], x, y - k * T, T * 0.35, '#fff');
    } else if (f.k === 'die' || f.k === 'padDead') {
      ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - k)})`; ctx.beginPath(); ctx.arc(x, y, T * 0.5 * k, 0, 7); ctx.fill();
    }
  }
  hud(ctx, L, s, ui);
  return L; // caller hit-tests input against the layout actually drawn
}

// Team plate (hud.bar, neutral): avatar overlaps the outer 28%, team fill in `slot`, name + % above it. right = mirrored.
function plate(ctx, x, y, right, name, ai, f, col, T) {
  const [pw, ph] = sz('hud.bar', 4.25, 1.25), w = pw * T, h = ph * T;
  let [sx, sy, sw, sh] = art.sprites?.['hud.bar']?.slot ?? [0.2794, 0.575, 0.6618, 0.25];
  if (right) sx = 1 - sx - sw;
  ctx.save();
  if (right) { ctx.translate(2 * x + w, 0); ctx.scale(-1, 1); }
  if (!pic(ctx, 'hud.bar', x, y, w, h)) rrect(ctx, x + w * 0.15, y + h * 0.15, w * 0.85, h * 0.75, h * 0.2, NAVY + 'e6', GOLD, 2);
  ctx.restore();
  const bx = x + sx * w, by = y + sy * h, bw = sw * w, bh = sh * h;
  rrect(ctx, bx, by, bw, bh, bh * 0.3, '#0b0c1f');
  const fw = bw * Math.max(0, Math.min(1, f));
  if (fw > 0) rrect(ctx, right ? bx + bw - fw : bx, by, fw, bh, bh * 0.3, col);
  const ty = by - h * 0.24, fs = h * 0.32, pad = T * 0.08; // name (+AI) above the slot, % inside it at the inner end
  text(ctx, `${Math.ceil(f * 100)}%`, right ? bx + pad : bx + bw - pad, by + bh / 2, bh * 1.05, '#fff', right ? 'left' : 'right');
  const nx = right ? bx + bw - pad : bx + pad;
  text(ctx, name, nx, ty, fs, '#fff', right ? 'right' : 'left');
  if (ai) {
    const tx = nx + ctx.measureText(name).width + T * 0.12, th = Math.max(fs * 0.9, 13), tw = th * 1.45;
    rrect(ctx, tx, ty - th / 2, tw, th, 3, '#0b0c1f', '#ffffff55', 1);
    text(ctx, 'AI', tx + tw / 2, ty, fs * 0.6, '#fff');
  }
  const [aw, ah] = sz('hud.avatar', 1.5, 1.5), ax = right ? x + w + T * 0.1 - aw * T : x - T * 0.1, ay = y + h / 2 - (ah * T) / 2;
  if (!pic(ctx, 'hud.avatar', ax, ay, aw * T, ah * T, right ? 205 : 355)) {
    const cx = ax + (aw * T) / 2, cy = y + h / 2, r = (aw * T) / 2;
    hex(ctx, cx, cy, r); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#0b0c1f'; ctx.stroke();
    hex(ctx, cx, cy, r * 0.72); ctx.fillStyle = '#0b0c1fcc'; ctx.fill();
    text(ctx, name[0].toUpperCase(), cx, cy, r * 0.8, col);
  }
}

function hud(ctx, L, s, ui) {
  const { T, tray } = L, cw = L.sw, x0 = L.sx, me = s.P[ui.seat], foe = s.P[1 - ui.seat], fy = L.top;
  // top: foe plate at the screen's top-left, clock centre, me plate top-right
  const [pw] = sz('hud.bar', 4.25, 1.25), py = fy + 0.2 * T;
  plate(ctx, x0 + 0.3 * T, py, false, ui.names?.[1 - ui.seat] ?? 'Foe', ui.ai, foe.core / CORE_HP, FOE, T);
  plate(ctx, x0 + cw - (0.3 + pw) * T, py, true, ui.names?.[ui.seat] ?? 'You', false, me.core / CORE_HP, ME, T);
  const ot = s.t >= MATCH_T, left = Math.max(0, (ot ? MATCH_T + OT_T : MATCH_T) - s.t), sec = Math.ceil(left / 30);
  const [tW, tH] = sz('hud.timer', 3.5, 1.75), tw = tW * T, th = tH * T, tx = x0 + (cw - tw) / 2, ty = fy;
  if (!pic(ctx, 'hud.timer', tx, ty, tw, th)) {
    rrect(ctx, tx + tw * 0.1, ty + th * 0.25, tw * 0.8, th * 0.6, th * 0.15, '#0b0c1f', GOLD, 3);
  }
  const [rx, ry, rw, rh] = art.sprites?.['hud.timer']?.text ?? [0.15, 0.34, 0.7, 0.46];
  const cx = tx + (rx + rw / 2) * tw, cy = ty + (ry + rh / 2) * th, ch = rh * th;
  const clock = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  if (ot) text(ctx, 'OT ' + clock, cx, cy, ch * 0.8, '#ff8a3d');
  else text(ctx, clock, cx, cy, ch * 0.95, s.t >= MATCH_T - 1800 ? '#ffcf4a' : '#fff');
  // tray
  if (!pic(ctx, 'hud.tray', tray.x, tray.y, tray.w, tray.h)) rrect(ctx, tray.x, tray.y, tray.w, tray.h, T * 0.4, NAVY + 'f2', GOLD, 2);
  // energy: 10 hud.energySeg tiles in `bar`, gem at `gem`, "n / 10" at the bar's right end
  const e = me.e / 60, b = L.bar, sw = b.w / 10, segCol = s.t >= MATCH_T - 1800 ? '#ff8ff0' : MAG;
  for (let i = 0; i < 10; i++) {
    const fill = Math.max(0, Math.min(1, e - i)), sx = b.x + i * sw;
    if (fill <= 0) continue;
    ctx.save(); ctx.beginPath(); ctx.rect(sx, b.y, sw * fill, b.h); ctx.clip();
    if (fill < 1) ctx.globalAlpha = 0.55;
    if (!pic(ctx, 'hud.energySeg', sx, b.y, sw, b.h)) rrect(ctx, sx + 1.5, b.y + 2, sw - 3, b.h - 4, 3, segCol);
    ctx.restore();
  }
  const lb = L.label; // "n / 10" in the tray's label rect, else at the bar's right end
  if (lb) text(ctx, `${Math.floor(e)} / 10`, lb.x + lb.w / 2, lb.y + lb.h / 2, lb.h * 0.6, '#fff');
  else text(ctx, `${Math.floor(e)} / 10`, b.x + b.w - T * 0.15, b.y + b.h / 2, b.h * 0.7, '#fff', 'right');
  const [gx, gy] = L.gem;
  if (!sprite(ctx, 'ui.energy', gx, gy, T)) {
    hex(ctx, gx, gy, 0.45 * T); ctx.fillStyle = MAG; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#0b0c1f'; ctx.stroke();
  }
  text(ctx, String(Math.floor(e)), gx, gy, 0.45 * T, '#fff');
  // hand
  me.hand.forEach((ci, i) => {
    const r = L.cards[i], c = me.cards[ci], up = ui.sel === i ? T * 0.35 : 0;
    if (up) rrect(ctx, r.x - 3, r.y - up - 3, r.w + 6, r.h + 6, r.w * 0.1, GOLD + '99');
    card(ctx, r.x, r.y - up, r.w, r.h, c, T, c.cost * 60 > me.e);
  });
  const nc = me.cards[me.q[0]];
  text(ctx, 'Next', L.next.x + L.next.w / 2, L.next.y - Math.max(T * 0.3, 8), T * 0.36, '#fff');
  card(ctx, L.next.x, L.next.y, L.next.w, L.next.h, nc, T, false);
  if (ui.drag?.moved && ui.sel != null) { // ghost: monster + role icon for the hovered hex (red cross = invalid)
    const c = me.cards[me.hand[ui.sel]], { x, y } = ui.drag, { kind } = dropAt(L, s, ui, x, y), uk = c.m ? 'unit.' + c.arch : 'unit.grunt';
    ctx.globalAlpha = 0.85;
    if (!sprite(ctx, uk, x, y, T, { hue: c.m?.dna.hue })) glyph(ctx, GLYPH[c.arch], x, y, T * 0.8, ME);
    ctx.globalAlpha = 1;
    const ix = x + T * 0.45, iy = y - T * 0.75;
    if (!kind) { ctx.beginPath(); ctx.arc(ix, iy, T * 0.3, 0, 7); ctx.fillStyle = '#e0283c'; ctx.fill(); text(ctx, '✕', ix, iy, T * 0.36, '#fff'); }
    else if (!sprite(ctx, kind === 'attack' ? 'ui.sword' : 'ui.shield', ix, iy, T)) {
      ctx.beginPath(); ctx.arc(ix, iy, T * 0.3, 0, 7); ctx.fillStyle = kind === 'attack' ? '#e0a020' : '#2f8fe8'; ctx.fill();
      text(ctx, kind === 'attack' ? '⚔' : '🛡', ix, iy, T * 0.34, '#fff');
    }
  }
  const midY = L.by + (H * L.k) / 2;
  if (ui.banner) {
    ctx.fillStyle = '#000a'; ctx.fillRect(0, midY - 1.2 * T, L.cw, 2.4 * T);
    text(ctx, ui.banner, x0 + cw / 2, midY, T * 0.9, '#fff');
  }
  if (L.portrait) { // no portrait layout: scaled board + hint
    ctx.fillStyle = '#000b'; ctx.fillRect(0, midY - 1.4 * T, L.cw, 2.8 * T);
    text(ctx, '⟳ Rotate your device', x0 + cw / 2, midY, Math.max(14, T * 0.7), '#ffcf4a');
  }
}

// Card: hue-tinted portrait in `window`, card.frame on top, name in `name`, cost at `gem`. dim = unaffordable.
function card(ctx, x, y, w, h, c, T, dim) {
  const hue = c.m ? c.m.dna.hue : null, fr = imgs['card.frame'] ? art.sprites['card.frame'] : {};
  const [wx, wy, ww, wh] = fr.window ?? [0.07, 0.05, 0.86, 0.68], [nx, ny, nw, nh] = fr.name ?? [0.08, 0.77, 0.84, 0.18], [gx, gy] = fr.gem ?? [0.14, 0.1];
  if (!imgs['card.frame']) rrect(ctx, x, y, w, h, w * 0.08, NAVY);
  const pim = imgOf('card.' + c.arch, hue);
  ctx.fillStyle = hue == null ? '#666' : `hsl(${hue},45%,${pim ? 22 : 45}%)`; ctx.fillRect(x + wx * w, y + wy * h, ww * w, wh * h);
  if (pim) ctx.drawImage(pim, x + wx * w, y + wy * h, ww * w, wh * h);
  else glyph(ctx, GLYPH[c.arch], x + w / 2, y + (wy + wh / 2) * h, w * 0.4);
  if (imgs['card.frame']) ctx.drawImage(imgs['card.frame'], x, y, w, h);
  else {
    rrect(ctx, x, y, w, h, w * 0.08, null, GOLD, Math.max(2, w * 0.04));
    rrect(ctx, x + nx * w, y + ny * h, nw * w, nh * h, w * 0.05, '#0b0c1f');
    hex(ctx, x + gx * w, y + gy * h, w * 0.13); ctx.fillStyle = MAG; ctx.fill();
  }
  const name = c.m ? c.m.name : 'Grunts';
  text(ctx, name, x + (nx + nw / 2) * w, y + (ny + nh / 2) * h, Math.min(nh * h * 0.6, (nw * w * 1.6) / name.length), '#fff', 'center', nw * w);
  if (dim) { ctx.fillStyle = '#0b0c1fa8'; ctx.beginPath(); ctx.roundRect(x, y, w, h, w * 0.08); ctx.fill(); }
  text(ctx, String(COST[c.arch]), x + gx * w, y + gy * h, w * 0.17, '#fff');
}
