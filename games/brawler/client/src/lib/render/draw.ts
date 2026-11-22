// Canvas renderer: dynamic camera, stage, fighters, hit FX, HUD. Render-only state (particles, shake) lives here.
import { STAGES, HURT_H, MAX_HP, hitboxOf, type GameState, type SimEvent, type StageId } from '../sim/sim.ts';
import { paintBackground, paintStage, paintFront } from './stage.ts';
import { poseFor, type Look } from './rig.ts';
import { drawHero, hero, heroOf, heroReady, tintOf } from './cutout.ts';
import { isBot } from '../bot.ts';
import { artReady, paintArtBackground, paintArtStage, paintArtFront } from './artstage.ts';
import { lookOf, randomDna, type Dna } from '../genes.ts';

export const W = 1280, H = 720;

// Per-match players (set from the chosen monsters). Defaults: two fixed demo monsters.
const DNAS: Dna[] = [{ ...randomDna(7), hue: 172 }, { ...randomDna(8), hue: 24 }];
const LOOKS: Look[] = DNAS.map(lookOf), HEROES: string[] = DNAS.map(heroOf), TINTS = DNAS.map(tintOf);
const NAMES = ['P1', 'P2'], ACCOUNTS = ['', ''];

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: 'spark' | 'dust' | 'ring' | 'beam' }

export function createRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const cam = { x: 800, y: 450, z: 0.8 };
  let shake = 0;
  const parts: Particle[] = [];
  const squash = [0, 0];
  let showBoxes = false;
  let stageId: StageId = 'ember';
  const q = new URLSearchParams(location.search), PICK = [q.get('p1'), q.get('p2')]; // debug: ?p1=<hero>&p2=<hero>
  const nameOf = (i: number) => PICK[i] ?? HEROES[i];
  const ready = (id: StageId) => artReady(id) && [0, 1].every((i) => heroReady(nameOf(i)));
  const onKey = (e: KeyboardEvent) => { if (e.code === 'Backquote') showBoxes = !showBoxes; };
  addEventListener('keydown', onKey);

  function resize() {
    const dpr = devicePixelRatio || 1;
    const box = canvas.parentElement; // fit the container (full screen in a fight, a column when watching)
    const s = Math.min((box?.clientWidth || innerWidth) / W, (box?.clientHeight || innerHeight) / H);
    canvas.style.width = `${W * s}px`; canvas.style.height = `${H * s}px`;
    canvas.width = W * s * dpr; canvas.height = H * s * dpr;
    ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
  }
  const fit = new ResizeObserver(resize);
  if (canvas.parentElement) fit.observe(canvas.parentElement);
  resize();

  const burst = (x: number, y: number, n: number, speed: number, color: string, kind: Particle['kind'], size = 4, life = 22) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: size * (0.6 + Math.random() * 0.8), color, kind });
    }
  };

  function onEvents(events: SimEvent[]) {
    for (const e of events) {
      if (e.kind === 'hit') {
        const big = e.power > 14;
        burst(e.x, e.y, big ? 22 : 10, big ? 16 : 10, big ? '#ffe36b' : '#fff', 'spark', big ? 5 : 3.5);
        parts.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 12, max: 12, size: big ? 90 : 50, color: '#fff', kind: 'ring' });
        shake = Math.max(shake, Math.min(22, e.power * 0.7));
      } else if (e.kind === 'ko') {
        const bz = STAGES[stageId].blast;
        const x = Math.max(bz.x0 + 120, Math.min(bz.x1 - 120, e.x)), y = Math.max(bz.y0 + 120, Math.min(bz.y1 - 120, e.y));
        parts.push({ x, y, vx: 0, vy: 0, life: 40, max: 40, size: 1, color: LOOKS[e.who].body, kind: 'beam' });
        burst(x, y, 40, 26, LOOKS[e.who].body, 'spark', 7, 34);
        shake = 30;
      } else if (e.kind === 'land') {
        squash[e.who] = Math.min(0.3, e.power / 45);
        burst(e.x, e.y, 6, 3, 'rgba(220,210,190,0.8)', 'dust', 6, 18);
      } else if (e.kind === 'jump') {
        burst(e.x, e.y, 5, 2.5, 'rgba(220,210,190,0.8)', 'dust', 5, 14);
      }
    }
  }

  function updateCamera(s: GameState) {
    const live = s.fighters.filter((f) => f.state !== 'dead');
    const xs = live.length ? live.map((f) => f.x) : [800], ys = live.length ? live.map((f) => f.y - 45) : [500];
    const b = STAGES[s.stage].cam;
    const x0 = Math.min(...xs, b.x0), x1 = Math.max(...xs, b.x1), y0 = Math.min(...ys, b.y0), y1 = Math.max(...ys, b.y1);
    const z = Math.max(0.42, Math.min(1.0, W / (x1 - x0 + 520), H / (y1 - y0 + 380)));
    cam.x += ((x0 + x1) / 2 - cam.x) * 0.1;
    cam.y += ((y0 + y1) / 2 - cam.y) * 0.1;
    cam.z += (z - cam.z) * 0.08;
  }

  // Same colour on the fighter's tag and its HUD card: gold = you, else blue / red by seat.
  const isYou = (i: number) => NAMES[i].endsWith(' (you)');
  const colorOf = (i: number) => (isYou(i) ? '#ffd166' : ['#4fc3ff', '#ff6b6b'][i]);

  // Floating label over each fighter, constant on-screen size whatever the camera zoom.
  function nameTag(x: number, y: number, i: number) {
    const acc = ACCOUNTS[i];
    const text = isYou(i) ? 'You' : isBot(acc) ? `${NAMES[i]} · bot` : acc ? (acc.length > 22 ? acc.slice(0, 20) + '…' : acc) : NAMES[i];
    ctx.save();
    ctx.translate(x, y); ctx.scale(1 / cam.z, 1 / cam.z);
    ctx.font = "800 16px Nunito, system-ui"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 22;
    ctx.fillStyle = colorOf(i); ctx.strokeStyle = '#0c0816'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(-w / 2, -14, w, 28, 14); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-7, 14); ctx.lineTo(7, 14); ctx.lineTo(0, 23); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0c0816'; ctx.fillText(text, 0, 1);
    ctx.restore();
  }

  function fighters(s: GameState) {
    s.fighters.forEach((f, i) => {
      if (f.state === 'dead') return;
      squash[i] *= 0.82;
      const p = poseFor(f, s.frame);
      ctx.save();
      ctx.translate(f.x, f.y);
      if (f.invuln > 0 && Math.floor(s.frame / 4) % 2) ctx.globalAlpha = f.state === 'dodge' ? 0.55 : 0.35;
      ctx.scale(f.facing * (1 + squash[i]), 1 - squash[i]);
      const flash = f.hitlag > 0 && f.state === 'hitstun', h = hero(nameOf(i));
      if (h) drawHero(ctx, p, h, flash, TINTS[i]);
      ctx.restore();
      nameTag(f.x, f.y - HURT_H - 30, i);

      if (f.state === 'block') { // shield arc on the guarded (front) side
        ctx.save();
        ctx.globalAlpha = 0.5 + 0.15 * Math.sin(s.frame / 4); ctx.strokeStyle = '#9ad8ff'; ctx.lineWidth = 7; ctx.lineCap = 'round';
        ctx.beginPath();
        const a0 = f.facing === 1 ? -1.1 : Math.PI - 1.1;
        ctx.arc(f.x, f.y - HURT_H / 2, 58, a0, a0 + 2.2);
        ctx.stroke(); ctx.restore();
      }
      const hb = hitboxOf(f);
      if (hb) { // strike swoosh
        ctx.save();
        ctx.globalAlpha = 0.55; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.ellipse(hb.x + hb.w / 2, hb.y + hb.h / 2, hb.w / 2, hb.h / 2, 0, f.facing === 1 ? -1.4 : Math.PI - 0.9, f.facing === 1 ? 0.9 : Math.PI + 1.4);
        ctx.stroke(); ctx.restore();
      }
      if (f.state === 'hitstun' && Math.hypot(f.vx, f.vy) > 12 && s.frame % 2 === 0) {
        parts.push({ x: f.x, y: f.y - 45, vx: 0, vy: 0, life: 20, max: 20, size: 14, color: 'rgba(255,255,255,0.5)', kind: 'dust' });
      }
      if (showBoxes) {
        ctx.strokeStyle = '#0f0'; ctx.lineWidth = 2; ctx.strokeRect(f.x - 25, f.y - HURT_H, 50, HURT_H);
        if (hb) { ctx.strokeStyle = '#f33'; ctx.strokeRect(hb.x, hb.y, hb.w, hb.h); }
      }
    });
  }

  function particles() {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vx *= 0.9; p.vy *= 0.9;
      if (p.kind === 'dust') p.vy -= 0.1;
      const k = p.life / p.max;
      ctx.globalAlpha = Math.max(0, k);
      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color; ctx.lineWidth = 5 * k;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - k) + 10, 0, Math.PI * 2); ctx.stroke();
      } else if (p.kind === 'beam') {
        ctx.fillStyle = p.color; ctx.fillRect(p.x - 60 * k, -2000, 120 * k, 5000);
        ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 20 * k, -2000, 40 * k, 5000);
      } else if (p.kind === 'spark') {
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size * k; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2, p.y - p.vy * 2); ctx.stroke();
      } else {
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.4 - k), 0, Math.PI * 2); ctx.fill();
      }
      if (--p.life <= 0) parts.splice(i, 1);
    }
    ctx.globalAlpha = 1;
  }

  const hpShown = [MAX_HP, MAX_HP]; // trailing "chip" bar

  function hud(s: GameState, banner: string, info: string) {
    s.fighters.forEach((f, i) => {
      const cw = 400, ch = ACCOUNTS[i] ? 128 : 104, x = i === 0 ? 24 : W - 24 - cw, y = 18, R = i === 1;
      const hp = f.state === 'dead' ? 0 : Math.max(0, MAX_HP - f.damage), k = hp / MAX_HP;
      hpShown[i] = hp > hpShown[i] ? hp : hpShown[i] + (hp - hpShown[i]) * 0.06;
      const col = colorOf(i), pad = 20, tx = R ? x + cw - pad : x + pad;
      ctx.fillStyle = 'rgba(20,14,38,0.86)'; ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 18); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(R ? x + cw - 11 : x + 4, y + 12, 7, ch - 24, 3); ctx.fill();
      ctx.textAlign = R ? 'right' : 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = "30px 'Lilita One', system-ui"; ctx.fillStyle = col;
      ctx.fillText(NAMES[i], tx, y + 40, cw - 140);
      let by = y + 58;
      if (isBot(ACCOUNTS[i])) { // bots show a "bot" chip instead of their account
        const px = R ? tx - 46 : tx;
        ctx.fillStyle = '#5ce1e6'; ctx.beginPath(); ctx.roundRect(px, y + 50, 46, 22, 11); ctx.fill();
        ctx.font = "800 15px Nunito, system-ui"; ctx.fillStyle = '#0c0816'; ctx.textAlign = 'center'; ctx.fillText('bot', px + 23, y + 66);
        ctx.textAlign = R ? 'right' : 'left'; by = y + 80;
      } else if (ACCOUNTS[i]) {
        ctx.font = "700 18px Nunito, system-ui"; ctx.fillStyle = 'rgba(255,243,220,0.65)';
        const a = ACCOUNTS[i].length > 30 ? ACCOUNTS[i].slice(0, 28) + '…' : ACCOUNTS[i];
        ctx.fillText(a, tx, y + 66, cw - 2 * pad); by = y + 80;
      }
      for (let n = 0; n < 3; n++) { // stocks, filled = left
        const cx = R ? x + pad + 12 + n * 30 : x + cw - pad - 12 - n * 30;
        ctx.beginPath(); ctx.arc(cx, y + 29, 11, 0, Math.PI * 2);
        ctx.fillStyle = n < f.stocks ? col : 'rgba(255,255,255,0.08)'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#0c0816'; ctx.stroke();
      }
      const bx = x + pad, bw = cw - 2 * pad, bh = 30;
      ctx.fillStyle = '#0c0816'; ctx.beginPath(); ctx.roundRect(bx - 3, by - 3, bw + 6, bh + 6, 11); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 9); ctx.clip();
      ctx.fillStyle = '#2a2140'; ctx.fillRect(bx, by, bw, bh);
      const fill = (w: number) => (R ? ctx.fillRect(bx + bw - w, by, w, bh) : ctx.fillRect(bx, by, w, bh));
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; fill(bw * hpShown[i] / MAX_HP);
      ctx.fillStyle = `hsl(${120 * k}, 72%, 48%)`; fill(bw * k);
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(bx, by, bw, bh * 0.4);
      ctx.restore();
      ctx.font = "22px 'Lilita One', system-ui"; ctx.lineWidth = 4; ctx.strokeStyle = '#0c0816'; ctx.fillStyle = '#fff';
      ctx.textAlign = R ? 'right' : 'left';
      const hx = R ? bx + bw - 10 : bx + 10, kx = R ? bx + 10 : bx + bw - 10, mid = by + bh / 2 + 7;
      ctx.strokeText(`${Math.ceil(hp)}`, hx, mid); ctx.fillText(`${Math.ceil(hp)}`, hx, mid);
      ctx.textAlign = R ? 'left' : 'right'; ctx.font = "800 16px Nunito, system-ui";
      ctx.strokeText(`KB +${f.damage}%`, kx, mid - 1); ctx.fillText(`KB +${f.damage}%`, kx, mid - 1);
    });
    if (info) {
      ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(info, W / 2, H - 12);
    }
    if (banner) {
      ctx.font = 'bold 28px system-ui'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, H / 2 - 40, W, 70);
      ctx.fillStyle = '#fff'; ctx.fillText(banner, W / 2, H / 2 + 8);
    }
  }

  function loading() {
    ctx.fillStyle = '#140c24'; ctx.fillRect(0, 0, W, H);
    ctx.font = "40px 'Lilita One', system-ui"; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText(`Loading arena${'.'.repeat(1 + (Math.floor(performance.now() / 400) % 3))}`, W / 2, H / 2 + 14);
  }

  function draw(s: GameState, banner = '', info = '') {
    if (!ready(s.stage)) return loading();
    if (s.stage !== stageId) { stageId = s.stage; parts.length = 0; }
    updateCamera(s);
    const t = performance.now() / 1000;
    if (!paintArtBackground(ctx, stageId, cam, W, H)) paintBackground(ctx, stageId, cam);
    ctx.save();
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    shake *= 0.85;
    ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    const art = paintArtStage(ctx, stageId); // ?art trial: painted platforms replace procedural stage + front layer
    if (!art) paintStage(ctx, stageId, t);
    fighters(s); particles();
    if (art) paintArtFront(ctx, stageId); else paintFront(ctx, stageId, t);
    ctx.restore();
    hud(s, banner, info);
  }

  return {
    draw, onEvents, ready,
    setPlayers: (names: string[], dnas?: Dna[], accounts?: string[]) => {
      NAMES.splice(0, 2, ...names);
      ACCOUNTS.splice(0, 2, ...(accounts ?? ['', '']));
      if (dnas) { LOOKS.splice(0, 2, ...dnas.map(lookOf)); HEROES.splice(0, 2, ...dnas.map(heroOf)); TINTS.splice(0, 2, ...dnas.map(tintOf)); }
    },
    destroy: () => { removeEventListener('keydown', onKey); fit.disconnect(); },
  };
}
