import { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, Img, Sequence, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { HURT_H, HURT_W, MAX_HP, STAGES, hitboxOf, startup, type Fighter } from '../../client/src/lib/sim/sim.ts';
import { MOVES, type MoveId } from '../../client/src/lib/sim/moves.ts';
import { drawMonster, poseFor } from '../../client/src/lib/render/rig.ts';
import { paintBackground, paintFront, paintStage } from '../../client/src/lib/render/stage.ts';
import type { Look } from '../../client/src/lib/genes.ts';
import { HEROES, SCENES, sceneLength, simulate, type HeroId, type Scene } from './scenes.ts';

// Canvas is painted in the game's 1280x720 logical space, scaled 1.5x to 1080p.
const W = 1280, H = 720, S = 1.5, FADE = 12;
const TITLE = 150, CARD = 70, END = 150, REPLAY = 40; // REPLAY sim frames shown at half speed
const alpha = (hsl: string, a: number) => hsl.replace(')', ` / ${a})`);
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

const MOVE_NAME: Record<MoveId, string> = {
  jab1: 'Jab 1', jab2: 'Jab 2', jab3: 'Jab 3', sideLight: 'Side light', downLight: 'Down light',
  nHeavy: 'Neutral heavy', sHeavy: 'Side heavy', dHeavy: 'Down heavy',
  airNeutral: 'Neutral air', airSide: 'Side air', airDown: 'Down air', airSideHeavy: 'Side air heavy',
  recovery: 'Recovery', groundPound: 'Ground pound',
};

// Attack scenes get a half-speed replay of the hit window after the real-time pass.
const replayFrom = (hero: HeroId, i: number) => {
  if (!SCENES[i].hits) return -1;
  const a0 = simulate(hero, i).findIndex((f) => f.fighters[0].move);
  return Math.max(0, a0 - 6);
};
const sceneDur = (hero: HeroId, i: number) => sceneLength(SCENES[i]) + (replayFrom(hero, i) >= 0 ? REPLAY * 2 : 0);

type Seg = { kind: 'title' | 'end' } | { kind: 'card'; section: string } | { kind: 'scene'; i: number };
export function timeline(hero: HeroId) {
  const segs: (Seg & { from: number; dur: number })[] = [];
  let at = 0, sec = '';
  const add = (s: Seg, dur: number) => { segs.push({ ...s, from: at, dur }); at += dur; };
  add({ kind: 'title' }, TITLE);
  SCENES.forEach((sc, i) => {
    if (sc.section !== sec) add({ kind: 'card', section: (sec = sc.section) }, CARD);
    add({ kind: 'scene', i }, sceneDur(hero, i));
  });
  add({ kind: 'end' }, END);
  return { segs, total: at };
}

const Fade: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, FADE, dur - FADE, dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

export const Moveset: React.FC<{ hero: HeroId }> = ({ hero }) => {
  const { segs } = timeline(hero);
  return (
    <AbsoluteFill style={{ background: '#0b0716', fontFamily: FONT, color: '#fff' }}>
      {segs.map((s, n) => (
        <Sequence key={n} from={s.from} durationInFrames={s.dur}>
          <Fade dur={s.dur}>
            {s.kind === 'scene' ? <Play hero={hero} i={s.i} dur={s.dur} />
              : s.kind === 'card' ? <Card title={s.section} hero={hero} />
              : <Hero hero={hero} end={s.kind === 'end'} />}
          </Fade>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- gameplay

const Play: React.FC<{ hero: HeroId; i: number; dur: number }> = ({ hero, i }) => {
  const vf = useCurrentFrame(), sc = SCENES[i], frames = simulate(hero, i);
  const len = sceneLength(sc), r0 = replayFrom(hero, i);
  const replay = r0 >= 0 && vf >= len;
  const k = replay ? Math.min(frames.length - 1, r0 + Math.floor((vf - len) / 2)) : Math.min(vf, len);
  return (
    <AbsoluteFill>
      <Arena hero={hero} sc={sc} frames={frames} k={k} />
      <Lower hero={hero} sc={sc} frames={frames} k={k} />
      {replay && <div style={{ position: 'absolute', top: 40, right: 56, padding: '10px 22px', borderRadius: 10, background: 'rgba(255,214,90,0.92)', color: '#1b1426', fontWeight: 800, fontSize: 30, letterSpacing: 2 }}>REPLAY ½×</div>}
    </AbsoluteFill>
  );
};

const Arena: React.FC<{ hero: HeroId; sc: Scene; frames: ReturnType<typeof simulate>; k: number }> = ({ hero, sc, frames, k }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const looks: Look[] = [HEROES[hero].hero.look, HEROES[hero].dummy.look];
  useLayoutEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    const { cam } = sc, fs = frames[k].fighters;
    ctx.setTransform(S, 0, 0, S, 0, 0);
    paintBackground(ctx, 'ember', cam);
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    paintStage(ctx, 'ember', k / 60);
    fs.forEach((f, i) => { if (i === 0 || sc.dummy) drawFighter(ctx, f, i, looks[i], frames, k); });
    if (sc.hits) boxes(ctx, fs, !!sc.dummy);
    fx(ctx, frames, k, sc, looks);
    paintFront(ctx, 'ember', k / 60);
    ctx.restore();
  }, [k, sc, frames, hero]);
  return <canvas ref={ref} width={W * S} height={H * S} style={{ width: '100%', height: '100%' }} />;
};

function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, i: number, look: Look, frames: ReturnType<typeof simulate>, k: number) {
  if (f.state === 'dead') return;
  // landing squash from the latest land event (pure function of its age)
  let sq = 0;
  for (let j = k; j >= Math.max(1, k - 20); j--) {
    const e = frames[j].events.find((e) => e.kind === 'land' && e.who === i);
    if (e) { sq = Math.min(0.3, e.power / 45) * 0.82 ** (k - j); break; }
  }
  ctx.save();
  ctx.translate(f.x, f.y);
  if (f.invuln > 0 && Math.floor(k / 4) % 2) ctx.globalAlpha = f.state === 'dodge' ? 0.55 : 0.35;
  ctx.scale(f.facing * (1 + sq), 1 - sq);
  drawMonster(ctx, poseFor(f, k), look, f.hitlag > 0 && f.state === 'hitstun');
  ctx.restore();
  const hb = hitboxOf(f);
  if (hb) { // strike swoosh, same as the game
    ctx.save();
    ctx.globalAlpha = 0.55; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(hb.x + hb.w / 2, hb.y + hb.h / 2, hb.w / 2, hb.h / 2, 0, f.facing === 1 ? -1.4 : Math.PI - 0.9, f.facing === 1 ? 0.9 : Math.PI + 1.4);
    ctx.stroke(); ctx.restore();
  }
}

// Debug overlay: hurtboxes (green) + active hitbox (red).
function boxes(ctx: CanvasRenderingContext2D, fs: Fighter[], dummy: boolean) {
  ctx.save(); ctx.lineWidth = 2;
  fs.forEach((f, i) => {
    if (f.state === 'dead' || (i === 1 && !dummy)) return;
    ctx.strokeStyle = 'rgba(80,255,120,0.8)'; ctx.fillStyle = 'rgba(80,255,120,0.10)';
    ctx.fillRect(f.x - HURT_W / 2, f.y - HURT_H, HURT_W, HURT_H); ctx.strokeRect(f.x - HURT_W / 2, f.y - HURT_H, HURT_W, HURT_H);
    const hb = hitboxOf(f);
    if (hb) { ctx.strokeStyle = 'rgba(255,60,60,0.95)'; ctx.fillStyle = 'rgba(255,60,60,0.30)'; ctx.fillRect(hb.x, hb.y, hb.w, hb.h); ctx.strokeRect(hb.x, hb.y, hb.w, hb.h); }
  });
  ctx.restore();
}

// Particles derived from sim events by age: no stored state, so any frame renders on its own.
function fx(ctx: CanvasRenderingContext2D, frames: ReturnType<typeof simulate>, k: number, sc: Scene, looks: Look[]) {
  const { cam } = sc, vw = W / 2 / cam.z, vh = H / 2 / cam.z;
  const decay = (v: number, a: number) => v * (1 - 0.9 ** a) * 10; // distance travelled with 0.9 drag
  for (let j = Math.max(1, k - 45); j <= k; j++) {
    frames[j].events.forEach((e, n) => {
      const a = k - j, seed = `${j}-${n}`;
      const burst = (count: number, speed: number, life: number, draw: (x: number, y: number, vx: number, vy: number, t: number, s: number) => void) => {
        if (a >= life) return;
        for (let q = 0; q < count; q++) {
          const ang = random(`${seed}a${q}`) * Math.PI * 2, v = speed * (0.4 + random(`${seed}v${q}`) * 0.6);
          const vx = Math.cos(ang) * v, vy = Math.sin(ang) * v;
          draw(e.x + decay(vx, a), e.y + decay(vy, a), vx * 0.9 ** a, vy * 0.9 ** a, 1 - a / life, 0.6 + random(`${seed}s${q}`) * 0.8);
        }
      };
      ctx.save();
      if (e.kind === 'hit') {
        const big = e.power > 14, col = big ? '#ffe36b' : '#fff';
        if (a < 12) { ctx.globalAlpha = 1 - a / 12; ctx.strokeStyle = '#fff'; ctx.lineWidth = 5 * (1 - a / 12); ctx.beginPath(); ctx.arc(e.x, e.y, (big ? 90 : 50) * (a / 12) + 10, 0, Math.PI * 2); ctx.stroke(); }
        burst(big ? 22 : 10, big ? 16 : 10, 22, (x, y, vx, vy, t, s) => {
          ctx.globalAlpha = t; ctx.strokeStyle = col; ctx.lineWidth = (big ? 5 : 3.5) * s * t; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - vx * 2, y - vy * 2); ctx.stroke();
        });
      } else if (e.kind === 'ko') {
        const x = Math.max(cam.x - vw + 80, Math.min(cam.x + vw - 80, e.x)), y = Math.max(cam.y - vh + 80, Math.min(cam.y + vh - 80, e.y));
        if (a < 40) {
          const t = 1 - a / 40; ctx.globalAlpha = t;
          ctx.fillStyle = looks[e.who].body; ctx.fillRect(x - 60 * t, cam.y - vh - 50, 120 * t, vh * 2 + 100);
          ctx.fillStyle = '#fff'; ctx.fillRect(x - 20 * t, cam.y - vh - 50, 40 * t, vh * 2 + 100);
        }
        burst(40, 26, 34, (px, py, vx, vy, t, s) => {
          ctx.globalAlpha = t; ctx.strokeStyle = looks[e.who].body; ctx.lineWidth = 7 * s * t; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(px - e.x + x, py - e.y + y); ctx.lineTo(px - e.x + x - vx * 2, py - e.y + y - vy * 2); ctx.stroke();
        });
      } else if (e.kind === 'land' || e.kind === 'jump') {
        if ((e.who === 1 && !sc.dummy)) { ctx.restore(); return; }
        burst(e.kind === 'land' ? 6 : 5, e.kind === 'land' ? 3 : 2.5, 18, (x, y, _vx, _vy, t, s) => {
          ctx.globalAlpha = t * 0.8; ctx.fillStyle = 'rgb(220,210,190)';
          ctx.beginPath(); ctx.arc(x, y - a * 0.5, (e.kind === 'land' ? 6 : 5) * s * (1.4 - t), 0, Math.PI * 2); ctx.fill();
        });
      }
      ctx.restore();
    });
  }
}

// ---------------------------------------------------------------- overlays

const KEY = (t: string) => (
  <span style={{ display: 'inline-block', padding: '4px 14px', margin: '0 4px', borderRadius: 8, background: '#f3ecff', color: '#1b1426', fontWeight: 800, boxShadow: '0 4px 0 #8d7fb0' }}>{t}</span>
);
// "D + Z (airborne)" -> key caps for single keys/Space, plain text for the rest.
const inputCaps = (s: string) => s.split(/(\b[A-Z]\b|Space)/).map((p, n) => (/^([A-Z]|Space)$/.test(p) ? <span key={n}>{KEY(p)}</span> : <span key={n} style={{ opacity: 0.85 }}>{p}</span>));

const Lower: React.FC<{ hero: HeroId; sc: Scene; frames: ReturnType<typeof simulate>; k: number }> = ({ hero, sc, frames, k }) => {
  const h = HEROES[hero], f = frames[k].fighters[0], d = frames[k].fighters[1];
  // chip follows the hero's latest move in this scene
  let id: MoveId | null = null, live: Fighter | null = null;
  for (let j = k; j >= 0 && !id; j--) if (frames[j].fighters[0].move) { id = frames[j].fighters[0].move; live = frames[j].fighters[0]; }
  const m = id ? MOVES[id] : null;
  const panel: React.CSSProperties = { background: 'rgba(14,9,28,0.82)', border: '2px solid rgba(255,255,255,0.12)', borderRadius: 18, padding: '18px 28px' };
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 36, left: 48, ...panel, padding: '12px 24px', display: 'flex', gap: 18, alignItems: 'center' }}>
        <div style={{ width: 16, height: 48, borderRadius: 4, background: h.hero.look.body }} />
        <div>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{h.hero.name}</div>
          <div style={{ fontSize: 20, opacity: 0.7 }}>{sc.section} · state: {f.state}{f.state === 'attack' ? ` (t=${f.t})` : ''}</div>
        </div>
        {(sc.dummy || f.damage > 0) && <div style={{ marginLeft: 24, fontSize: 22, opacity: 0.85, lineHeight: 1.35 }}>
          {f.state !== 'dead' && <div>{h.hero.name}: {f.damage}% · {MAX_HP - f.damage} HP</div>}
          {sc.dummy && <div>{h.dummy.name}: {d.damage}%</div>}
        </div>}
      </div>
      <div style={{ position: 'absolute', left: 48, right: 48, bottom: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
        <div style={{ ...panel, borderLeft: `10px solid ${h.hero.look.body}` }}>
          <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: -1 }}>{sc.title}</div>
          <div style={{ fontSize: 30, marginTop: 10 }}>{inputCaps(sc.input)}</div>
        </div>
        {m && live && (
          <div style={{ ...panel, display: 'flex', gap: 26, alignItems: 'center' }}>
            <div style={{ fontSize: 30, fontWeight: 800, marginRight: 6 }}>{MOVE_NAME[id!]}</div>
            {([['Startup', startup(live, m), '#7fd1ff'], ['Active', m.untilLand ? 'land' : m.active, '#ff6b6b'], ['Recovery', m.recovery, '#c9b6ff'], ['Damage', Math.round(m.dmg * live.mod.dmg), '#ffe36b']] as const).map(([l, v, c]) => (
              <div key={l} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1.5 }}>{l}</div>
                <div style={{ fontSize: 44, fontWeight: 900, color: c }}>{v}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

const Card: React.FC<{ title: string; hero: HeroId }> = ({ title, hero }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 14 } });
  const c = HEROES[hero].hero.look.body;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 45%, ${alpha(c, 0.35)}, #0b0716 70%)`, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 32, letterSpacing: 8, opacity: 0.7, textTransform: 'uppercase' }}>{HEROES[hero].hero.name}</div>
      <div style={{ fontSize: 140, fontWeight: 900, transform: `scale(${0.7 + 0.3 * s})`, opacity: s }}>{title}</div>
      <div style={{ width: 600 * s, height: 8, borderRadius: 4, background: c }} />
    </AbsoluteFill>
  );
};

const Hero: React.FC<{ hero: HeroId; end: boolean }> = ({ hero, end }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const h = HEROES[hero].hero, s = spring({ frame: f, fps, config: { damping: 16 } });
  const stats = [['STR', h.stats.str], ['DEX', h.stats.dex], ['DEF', h.stats.def], ['SPD', h.stats.spd]] as const;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 30% 50%, ${alpha(h.look.body, 0.4)}, #0b0716 65%)`, flexDirection: 'row', alignItems: 'center', padding: '0 140px', gap: 80 }}>
      <Img src={staticFile(h.art)} style={{ height: 720, transform: `translateX(${(1 - s) * -200}px) scale(${0.9 + 0.1 * s})`, opacity: s, filter: 'drop-shadow(0 30px 40px rgba(0,0,0,0.6))' }} />
      <div style={{ opacity: s, transform: `translateY(${(1 - s) * 40}px)` }}>
        <div style={{ fontSize: 34, letterSpacing: 8, opacity: 0.7 }}>BRAWLER ARENA</div>
        <div style={{ fontSize: 170, fontWeight: 900, lineHeight: 1, color: h.look.belly }}>{h.name}</div>
        <div style={{ fontSize: 40, marginTop: 12, opacity: 0.85 }}>{end ? 'Every move. Real frame data.' : `Gen-1 ${h.type} · Full moveset`}</div>
        {!end && <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: 'auto 420px auto', gap: '14px 20px', alignItems: 'center', fontSize: 30 }}>
          {stats.map(([k, v], n) => [
            <b key={k}>{k}</b>,
            <div key={k + 'b'} style={{ height: 22, borderRadius: 11, background: 'rgba(255,255,255,0.12)' }}>
              <div style={{ height: '100%', borderRadius: 11, background: h.look.body, width: `${(v / 9) * 100 * interpolate(f, [10 + n * 6, 40 + n * 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}%` }} />
            </div>,
            <span key={k + 'v'}>{v}</span>,
          ])}
        </div>}
        {end && <div style={{ fontSize: 30, marginTop: 30, opacity: 0.6 }}>Stage: {STAGES.ember.name}</div>}
      </div>
    </AbsoluteFill>
  );
};
