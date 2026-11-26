import { useEffect, useRef } from 'react';
import { BASE } from '@/lib/nav.ts';
import { archetype, STAT_KEYS, type Dna, type Monster, type Skill } from '@/lib/genes.ts';
import { skillLabel } from '@/components/monsters/text.ts';
import { idlePose, type Pose } from '@/lib/render/rig.ts';
import { drawHero, hero, heroOf, tintOf } from '@/lib/render/cutout.ts';
import { isBot } from '@/lib/bot.ts';
import { drawStageThumb } from '@/lib/render/stage.ts';
import type { StageId } from '@/lib/stages.ts';

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const ASSET_URL = process.env.NEXT_PUBLIC_ASSET_URL ?? `${BASE}/ui`;
const ASSET_V = 2; // bump after re-uploading art (Blob files are cached for a year)
export const asset = (name: string) => `${ASSET_URL}/${name}.webp?v=${ASSET_V}`;
// CSS can't build url() from a variable, so expose the images theme.css uses as --img-<name>.
for (const n of ['btn-orange', 'btn-gold', 'btn-teal', 'btn-dark', 'btn-red']) document.documentElement.style.setProperty(`--img-${n}`, `url("${asset(n)}")`);

export function Logo({ className }: { className?: string }) {
  return <img className={className} src={asset('logo')} alt="Brawler Arena" draggable={false} />;
}

// Decorative sheet icon (sized by CSS, 1.3em by default), or a /public path. Text next to it carries the meaning.
export function Ico({ n, className = 'ico' }: { n: string; className?: string }) {
  return <img className={className} src={n.startsWith('/') ? BASE + n : asset(n)} alt="" aria-hidden="true" draggable={false} />;
}

export const SkillChip = ({ s }: { s: Skill }) => <span className="chip row-ico skill-chip"><Ico n={`/skills/${s.kind}.svg`} />{skillLabel(s)}</span>;
export const SkillChips = ({ skills }: { skills?: Skill[] }) =>
  skills?.length ? <span className="badges" aria-label="Equipped skills">{skills.map((s, i) => <SkillChip key={i} s={s} />)}</span> : null;

export const BotTag = ({ account }: { account?: string }) => (isBot(account) ? <span className="bot-tag" title="Computer opponent">bot</span> : null);

export const TYPE_ICON = { Bruiser: 'type-bruiser', Duelist: 'type-duelist', Bulwark: 'type-bulwark', Skirmisher: 'type-skirmisher' } as Record<string, string>;
export const STAGE_ICON = { ember: 'arena-ember', grove: 'arena-grove', docks: 'arena-docks' } as Record<StageId, string>;

export function Portrait({ dna, size = 200, pose, flip = false, className = 'portrait' }: { dna: Dna; size?: number; pose?: Pose; flip?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, ctx = c.getContext('2d')!;
    const dpr = devicePixelRatio || 1;
    c.width = size * dpr; c.height = size * dpr;
    ctx.scale(dpr, dpr);
    let raf = 0, t = 0;
    const paint = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const k = size / 170;
      ctx.translate(size / 2, size * 0.86); ctx.scale(k * (flip ? -1 : 1), k);
      ctx.fillStyle = 'rgb(12 8 22 / 0.35)';
      ctx.beginPath(); ctx.ellipse(0, 4, 38, 8, 0, 0, Math.PI * 2); ctx.fill();
      const h = hero(heroOf(dna));
      if (h) drawHero(ctx, pose ?? idlePose(t), h, false, tintOf(dna));
      t++;
      if (!h || (!reduceMotion() && !pose)) raf = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(raf);
  }, [dna, size, pose, flip]);
  return <canvas ref={ref} className={className} style={{ width: '100%', maxWidth: size, aspectRatio: '1', justifySelf: 'center' }} aria-hidden="true" />;
}

const STAT_LABEL = { str: 'Strength', dex: 'Dexterity', def: 'Defence', spd: 'Speed' } as const;
// `boosted`: effective stats after skills (up to 11), extra pips glow.
export function Stats({ dna, boosted }: { dna: Dna; boosted?: Record<(typeof STAT_KEYS)[number], number> }) {
  const n = boosted ? 11 : 9;
  return (
    <div className="stats">
      {STAT_KEYS.map((k) => {
        const v = boosted?.[k] ?? dna[k];
        return (
          <div className="stat" key={k} style={{ ['--c' as string]: `var(--stat-${k})` }}>
            <span className="row-ico"><Ico n={`stat-${k}`} />{STAT_LABEL[k]}</span>
            <span className="pips" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} role="meter" aria-label={STAT_LABEL[k]} aria-valuemin={3} aria-valuemax={n} aria-valuenow={v}>
              {Array.from({ length: n }, (_, i) => <span key={i} className={`pip ${i < dna[k] ? 'on' : i < v ? 'on bonus' : ''}`} />)}
            </span>
            <b className={v > dna[k] ? 'boost' : undefined}>{v}</b>
          </div>
        );
      })}
    </div>
  );
}

export function MonsterCard({ m, onClick, selected, href, extra, disabled }: { m: Monster; onClick?: () => void; selected?: boolean; href?: string; extra?: React.ReactNode; disabled?: boolean }) {
  const body = (
    <>
      <Portrait dna={m.dna} size={200} />
      <div className="tile-head"><h3>{m.name}</h3><span className="chip">Gen {m.gen}</span></div>
      <span className="tile-meta row-ico"><Ico n={TYPE_ICON[archetype(m.dna)]} />{archetype(m.dna)}, {m.record.w} wins, {m.record.l} losses</span>
      {extra}
      <Stats dna={m.dna} />
    </>
  );
  return href
    ? <a className="tile" href={href}>{body}</a>
    : <button type="button" className="tile" aria-pressed={selected} disabled={disabled} onClick={onClick}>{body}</button>;
}

const TITLE = [
  { n: '5', d: 0, z: 1 },
  { n: '4', d: 6, z: 1.5 },
  { n: '3', d: 12, z: 1.01 },
  { n: '2', d: 16, z: 1.1 },
  { n: '1', d: 34, z: 0.8 },
] as const;
const STAGE_W = 1980, STAGE_H = 1280;
export function TitleArt({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, ctx = c.getContext('2d')!;
    const imgs = TITLE.map((l) => { if (!l.z) return null; const i = new Image(); i.src = `${BASE}/title/${l.n}.webp`; return i; });
    const aim = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
    let raf = 0, last = -1e9;
    const draw = () => {
      const dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
      const k = Math.max(w / STAGE_W, h / STAGE_H) * 0.905;
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (w - STAGE_W * k) / 2, dpr * (h - STAGE_H * k) / 2);
      imgs.forEach((im, i) => {
        if (!im?.complete || !im.naturalWidth) return;
        const { d, z } = TITLE[i], f = Math.max(STAGE_W / im.naturalWidth, STAGE_H / im.naturalHeight) * z;
        const w2 = im.naturalWidth * f, h2 = im.naturalHeight * f;
        ctx.drawImage(im, (STAGE_W - w2) / 2 - cur.x * d, (STAGE_H - h2) / 2 - cur.y * d * 0.5, w2, h2);
      });
    };
    const still = reduceMotion();
    imgs.forEach((im) => im?.addEventListener('load', () => still && draw()));
    if (still) addEventListener('resize', draw);
    const frame = (t: number) => {
      const idle = t - last > 3000;
      const tx = idle ? Math.sin(t / 3200) * 0.6 : aim.x, ty = idle ? Math.sin(t / 1600) * 0.4 : aim.y;
      cur.x += (tx - cur.x) * 0.06; cur.y += (ty - cur.y) * 0.06;
      draw();
      raf = requestAnimationFrame(frame);
    };
    if (!still) raf = requestAnimationFrame(frame);
    const onMove = (e: PointerEvent) => { aim.x = (e.clientX / innerWidth) * 2 - 1; aim.y = (e.clientY / innerHeight) * 2 - 1; last = performance.now(); };
    addEventListener('pointermove', onMove);
    return () => { cancelAnimationFrame(raf); removeEventListener('pointermove', onMove); removeEventListener('resize', draw); };
  }, []);
  return <canvas ref={ref} className={`title-art ${className ?? ''}`} aria-hidden="true" />;
}

export function ArenaBackdrop({ id, className }: { id: StageId; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, ctx = c.getContext('2d')!;
    let raf = 0;
    const paint = () => {
      const dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const s = Math.max(w / 1280, h / 720);
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (w - 1280 * s) / 2, dpr * (h - 720 * s) / 2);
      const ready = drawStageThumb(ctx, id, 1280, 720, performance.now() / 1000); // seconds, same clock as the fight renderer
      if (!ready || !reduceMotion()) raf = requestAnimationFrame(paint);
    };
    paint();
    const onResize = () => { if (reduceMotion()) paint(); };
    addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', onResize); };
  }, [id]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}

export function StageThumb({ id, className }: { id: StageId; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, dpr = devicePixelRatio || 1;
    const w = c.clientWidth || 320, h = Math.round(w * 9 / 16);
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext('2d')!;
    let raf = 0;
    const paint = () => { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); if (!drawStageThumb(ctx, id, w, h)) raf = requestAnimationFrame(paint); };
    paint();
    return () => cancelAnimationFrame(raf);
  }, [id]);
  return <canvas ref={ref} className={className} style={{ width: '100%', aspectRatio: '16 / 9' }} aria-hidden="true" />;
}

export function HubDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); ref.current?.querySelector('input')?.focus(); }, []);
  return (
    <dialog ref={ref} className="hub-dialog" aria-label={title} onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <header><h2>{title}</h2><button type="button" className="hub-x" aria-label="Close" onClick={() => ref.current?.close()}><Ico n="icon-close" /></button></header>
      {children}
    </dialog>
  );
}
