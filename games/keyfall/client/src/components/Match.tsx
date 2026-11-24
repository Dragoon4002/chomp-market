// In-match presentation: Canvas2D port of GameScene (reference §1, §3, §4, §6) + original HUD, driven by View snapshots.
import { useEffect, useRef, useState } from 'react';
import { BASE, GUN, HP, type Ent, type Fx, type View } from '@/lib/game.ts';
import type { Match } from '@/lib/match.ts';
import { W, H, PX, World, fit, lit, loadArt, mul, spr, sx, sy, type Art, type RGB } from '@/components/scene.tsx';
import { isMuted, play, setMuted, unlock } from '@/components/sfx.ts';

const TP: Record<Ent['k'], number> = { balloon: 0, bomber: 0.4, bomb: 0.5, chopper: 0.4, fireball: 0 }; // TargetPoint local y
const LABEL: Record<Ent['k'], number> = { balloon: 0.72, bomber: 0.5, bomb: 0.72, chopper: 0.75, fireball: 0 };
const SHAKE = { typing: [0.03, 0.5, 0.01, 80], boom: [0.15, 1.5, 0.05, 250], city: [0.3, 3, 0.1, 400] } as const;
const FONT = 'OpenDyslexic';
const DEG = Math.PI / 180;

type Pend = { k: string; at: number };
const applyKeys = (s: string, ks: Pend[]) => ks.reduce((a, { k }) => (k === '\b' ? a.slice(0, -1) : k === '\n' ? '' : a.length < 16 ? a + k : a), s);

function lockOf(v: View, shown: string): Ent | undefined {
  if (!shown) return;
  const t = v.ents.find((e) => e.id === v.target);
  if (t) return t;
  let best: Ent | undefined;
  for (const e of v.ents) if (e.w && e.w.startsWith(shown) && (!best || e.w.length < best.w.length)) best = e;
  return best;
}

const keyOf = (e: KeyboardEvent) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (/^[a-z]$/i.test(e.key)) return e.key.toLowerCase();
  return e.key === 'Backspace' ? '\b' : e.key === 'Enter' ? '\n' : null;
};

export function MuteButton() {
  const [m, set] = useState(isMuted);
  return (
    <button className="icon-btn" aria-label={m ? 'Unmute' : 'Mute'} aria-pressed={m} onClick={() => { unlock(); setMuted(!m); set(!m); }}>
      <svg viewBox="0 0 12 12" width="22" height="22" shapeRendering="crispEdges" aria-hidden>
        <path fill="currentColor" d="M1 4h2v4H1zM3 4h1V3h1V2h1v8H5V9H4V8H3z" />
        {m ? <path fill="currentColor" d="M8 4h1v1H8zM9 5h1v1H9zM10 4h1v1h-1zM10 6h1v1h-1zM8 6h1v1H8zM9 6h1v1H9zM8 7h1v1H8zM10 7h1v1h-1z" />
          : <path fill="currentColor" d="M8 5h1v2H8zM9 3h1v1H9zM10 4h1v4h-1zM9 8h1v1H9z" />}
      </svg>
    </button>
  );
}

const clock = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function MatchView({ m, onMenu }: { m: Match; onMenu: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [, bump] = useState(0);
  const [hits, setHits] = useState(0);
  const [flash, setFlash] = useState<{ c: 'ok' | 'bad'; n: number }>({ c: 'ok', n: 0 });
  const pend = useRef<Pend[]>([]);
  const lastIn = useRef('');
  const mr = useRef(m);
  mr.current = m;
  const v = m.view;

  // Local echo (spec "latency hiding"): server input + keys typed since it last changed.
  if (v && v.input !== lastIn.current) { lastIn.current = v.input; pend.current = []; }
  const now = performance.now();
  pend.current = pend.current.filter((p) => now - p.at < 400);
  const shown = v ? applyKeys(v.input, pend.current) : '';
  const ui = useRef({ shown, lock: undefined as number | undefined });
  ui.current = { shown, lock: v ? lockOf(v, shown)?.id : undefined };

  const live = v?.phase === 'live', stunned = !!v && v.stun_ms > 0;
  const press = (k: string) => {
    unlock();
    mr.current.send(k);
    if (live && !stunned) { pend.current.push({ k, at: performance.now() }); bump((n) => n + 1); }
  };
  const pressRef = useRef(press);
  pressRef.current = press;

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const p = mr.current.view?.phase;
      if (p !== 'live' && p !== 'count') return;
      if ((e.target as Element | null)?.closest?.('.chat')) return; // chat input owns its keys
      const k = keyOf(e);
      if (!k) return;
      e.preventDefault();
      pressRef.current(k);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  // Render loop: world + enemies + labels + effects, all client-side cosmetics driven by View + Fx.
  useEffect(() => {
    let raf = 0, dead = false, last = performance.now();
    const world = new World();
    const booms: { x: number; y: number; t: number; r: number; s: number }[] = [];
    const lasers: { x: number; y: number; t: number }[] = [];
    const sq = new Map<number, number>(), tilt = new Map<number, number>();
    let shake = { p: 0, r: 0, z: 0, d: 1, t: -1e9 }, cityAt = -1e9, blackAt = -1e9, redAt = -1e9, lastLock: number | undefined;
    const doShake = (s: readonly number[], t: number) => { shake = { p: s[0], r: s[1], z: s[2], d: s[3], t }; };
    void document.fonts?.load(`48px ${FONT}`);

    const fx = (f: Fx, t: number) => {
      switch (f.e) {
        case 'key': play('typewriter_press'); doShake(SHAKE.typing, t); if (ui.current.lock != null) sq.set(ui.current.lock, t); setFlash((x) => ({ c: 'ok', n: x.n + 1 })); break;
        case 'strike': play('error_short'); doShake(SHAKE.typing, t); blackAt = t; redAt = t; setFlash((x) => ({ c: 'bad', n: x.n + 1 })); break;
        case 'stun': play('error_three_strikes'); doShake(SHAKE.city, t); blackAt = t; break;
        case 'laser': play('laser_fire'); lasers.push({ x: f.x, y: f.y, t }); break;
        case 'boom': play('explosion'); booms.push({ x: f.x, y: f.y, t, r: Math.random() * 2 * Math.PI, s: 0.7 + Math.random() * 0.6 }); doShake(SHAKE.boom, t); break;
        case 'bombfall': play('bomb_fall'); break;
        case 'chopperfire': play('chopper_fire', 0.8); break;
        case 'cityhit': cityAt = t; doShake(SHAKE.city, t); setHits((n) => n + 1); break;
        case 'siren': play('city_attacked_siren'); break;
      }
    };

    const label = (g: CanvasRenderingContext2D, e: Ent, x: number, y: number, typed: number, col: string) => {
      const w = e.w.toUpperCase(), em = 0.45 * PX;
      g.font = `${em}px ${FONT}, sans-serif`;
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      const tw = g.measureText(w).width, x0 = sx(x) - tw / 2, Y = sy(y);
      g.save();
      g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
      g.lineWidth = 8; g.strokeStyle = '#000';
      g.strokeText(w, x0, Y);
      g.restore();
      const a = w.slice(0, typed), b = w.slice(typed);
      g.fillStyle = '#00ff00'; g.fillText(a, x0, Y);
      g.fillStyle = col; g.fillText(b, x0 + g.measureText(a).width, Y);
    };

    loadArt().then((art: Art) => {
      const frame = (t: number) => {
        if (dead) return;
        const dt = Math.min(0.1, (t - last) / 1000);
        last = t;
        const M = mr.current;
        for (const f of M.takeFx()) fx(f, t);
        const v = M.view, cv = ref.current;
        if (!v || !cv) { raf = requestAnimationFrame(frame); return; }
        const g = cv.getContext('2d')!;
        fit(g, cv, false);
        const ex = Math.min(150, Math.max(0, t - M.at)) / 1000;
        const ents = v.ents.map((e) => ({ ...e, x: e.x + e.vx * ex, y: e.y + e.vy * ex }));
        const { shown, lock } = ui.current;
        if (lock !== lastLock) { if (lock != null) sq.set(lock, t); lastLock = lock; }

        // ScreenShake: random pos/rot/zoom decaying linearly
        g.save();
        const k = 1 - (t - shake.t) / shake.d;
        if (k > 0) {
          const r = () => Math.random() * 2 - 1;
          g.translate(W / 2 + r() * shake.p * k * PX, H / 2 + r() * shake.p * k * PX);
          g.rotate(r() * shake.r * k * DEG);
          g.scale(5 / (5 + r() * shake.z * k), 5 / (5 + r() * shake.z * k));
          g.translate(-W / 2, -H / 2);
        }
        world.step(dt, 1 - Math.max(0, v.hp) / HP);
        const light = world.back(g, art, v.t_ms / 1000), b = lit(light);
        const cs = t - cityAt < 300 ? Math.sin(((t - cityAt) / 300) * Math.PI) : 0;
        const cityC = mul(b, [1, 1 - cs, 1 - cs]);
        const turC: RGB = t - blackAt < 150 ? [0, 0, 0] : cityC;
        world.city(g, art, cityC);

        const fx2 = (e: Ent) => {
          const s0 = sq.get(e.id), el = s0 == null ? 1 : (t - s0) / 300;
          if (el >= 1) return { kx: 1, ky: 1, dx: 0, dy: 0 };
          const s = Math.sin(el * Math.PI), a = 0.03 * (1 - el);
          return { kx: 1 + 0.15 * s, ky: 1 + 0.075 * s, dx: Math.sin((t / 1000) * 30) * a, dy: Math.cos((t / 1000) * 39) * a };
        };
        const FIREBALL_DIR = Math.atan2(-0.75, 1);
        const body = (e: Ent) => {
          const q = fx2(e), o = { flip: e.flip, kx: q.kx, ky: q.ky, c: b }, x = e.x + q.dx, y = e.y + q.dy;
          if (e.k === 'balloon') spr(g, art.balloon, x, y, 16, 0.5, 0.484, o);
          else if (e.k === 'bomber') spr(g, art.bomber, x, y, 16, 0.5, 0.615, o);
          else if (e.k === 'chopper') {
            const want = e.vx > 0 ? -15 * DEG : e.vx < 0 ? 15 * DEG : 0, cur = tilt.get(e.id) ?? want;
            const r = cur + (want - cur) * Math.min(1, 2 * dt);
            tilt.set(e.id, r);
            spr(g, art[`chopper_${Math.floor(t / 50) % 3}` as 'chopper_0'], x, y, 16, 0.484, 0.467, { ...o, rot: r });
          } else if (e.k === 'bomb') spr(g, art.bomb, x, y, 32, 0.5, 0.5, o);
          // comet art flies down-right (trail up-left): rotate to velocity, pivot on the head
          else spr(g, art.fireball, x, y, 16, 0.82, 0.25, { c: b, rot: Math.atan2(e.vy, e.vx) - FIREBALL_DIR });
        };
        for (const e of ents) if (e.k !== 'bomb' && e.k !== 'fireball') body(e);
        // laser (order 10): TurretGun origin -> target point, 0.1 u, cyan, 0.2 s
        for (const l of lasers) {
          if (t - l.t > 200) continue;
          g.save();
          g.lineCap = 'round';
          g.shadowColor = '#0ff'; g.shadowBlur = 24;
          g.strokeStyle = '#0ff'; g.lineWidth = 0.1 * PX;
          g.beginPath(); g.moveTo(sx(GUN.x), sy(GUN.y)); g.lineTo(sx(l.x), sy(l.y)); g.stroke();
          g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 0.03 * PX; g.stroke();
          g.restore();
        }
        spr(g, art.turret_base, 0, -4, 16, 0.5, 0, { c: turC });
        spr(g, art.turret_gun, GUN.x, GUN.y, 16, 0, 0.5, { rot: v.gun, c: turC });
        for (const e of ents) if (e.k === 'bomb' || e.k === 'fireball') body(e);
        for (const x of booms) {
          const el = t - x.t;
          if (el > 1000) continue;
          const f = Math.min(3, Math.floor(el / 100));
          spr(g, art[`explosion_${f}` as 'explosion_0'], x.x, x.y, 12 / x.s, 0.52, 0.51, { rot: x.r, c: b });
        }
        // word labels: unlit, OpenDyslexic, white + black outline; locked target shows typed prefix green
        for (const e of ents) {
          if (!e.w) continue;
          const q = fx2(e), on = e.id === lock;
          let n = 0;
          if (on) while (n < shown.length && n < e.w.length && shown[n] === e.w[n]) n++;
          const col = on && t - redAt < 200 ? '#ff0000' : '#fff';
          label(g, e, e.x + q.dx, e.y + q.dy + LABEL[e.k], n, col);
        }
        // crosshair: UI 32x32, red .8, spins 180°/s on the partial target
        const tg = ents.find((e) => e.id === lock);
        if (tg) spr(g, art.crosshair, tg.x, tg.y + TP[tg.k], (96 * PX) / 32, 0.5, 0.5, { rot: -(t / 1000) * Math.PI, a: 0.8, c: [1, 0, 0] });
        g.restore();
        // post: vignette (black, 0.2)
        const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,.35)');
        g.fillStyle = vg; g.fillRect(0, 0, W, H);
        while (booms.length && t - booms[0].t > 1000) booms.shift();
        while (lasers.length && t - lasers[0].t > 200) lasers.shift();
        for (const id of sq.keys()) if (!v.ents.some((e) => e.id === id)) { sq.delete(id); tilt.delete(id); }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }, () => {});
    return () => { dead = true; cancelAnimationFrame(raf); };
  }, []);

  if (!v) return null;
  return (
    <main className="play">
      <div className="stage">
        <canvas ref={ref} className="world" aria-label="Battlefield" />
        <div className="hud">
          <p className="hud-t timer"><img src={`${BASE}/svg/timer.svg`} alt="" />{clock(v.left_ms)}</p>
          <div className="hud-tr">
            <MuteButton />
            <button className="icon-btn" aria-label="Leave match" onClick={onMenu}>
              <svg viewBox="0 0 12 12" width="22" height="22" shapeRendering="crispEdges" aria-hidden><path fill="currentColor" d="M2 2h2v1h1v1h2V3h1V2h2v2H9v1H8v2h1v1h1v2H8V9H7V8H5v1H4v1H2V8h1V7h1V5H3V4H2z" /></svg>
            </button>
          </div>
          <p key={hits} className={`hud-t health ${hits ? 'hit' : ''}`}><img src={`${BASE}/svg/hp.svg`} alt="" />Health: {Math.max(0, v.hp)}</p>
          <p className="hud-t wpm"><img src={`${BASE}/svg/wpm.svg`} alt="" />WPM: {v.wpm}</p>
          <label className={`inbox ${stunned ? 'stun' : ''}`}>
            <span key={flash.n} className={`intext ${flash.n ? flash.c : ''}`}>
              {shown ? shown.toUpperCase() : <span className="ph">Type word...</span>}
              {live && !stunned && <i className="caret" />}
            </span>
            {/* virtual keyboards: keys arrive as beforeinput, never as usable keydown */}
            <input className="sink" aria-label="Type the word on an enemy" autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} value=""
              onChange={() => {}}
              onBeforeInput={(e) => {
                e.preventDefault();
                const ne = e.nativeEvent as InputEvent;
                if (ne.inputType === 'deleteContentBackward') return press('\b');
                if (ne.inputType === 'insertLineBreak') return press('\n');
                for (const c of (ne.data ?? '').toLowerCase()) if (c >= 'a' && c <= 'z') press(c);
              }} />
          </label>
          {v.phase === 'count' && <p key={Math.ceil(v.count_ms / 1000)} className="count" aria-live="assertive">{Math.max(1, Math.ceil(v.count_ms / 1000))}</p>}
          {stunned && <p className="stunned" role="status">Jammed! {(v.stun_ms / 1000).toFixed(1)}</p>}
          {v.strikes > 0 && !stunned && <p className="strikes" aria-label={`${v.strikes} of 3 strikes`}>{'✕'.repeat(v.strikes)}</p>}
        </div>
      </div>
    </main>
  );
}
