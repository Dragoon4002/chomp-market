import { useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, Sequence, continueRender, delayRender, staticFile, useCurrentFrame } from 'remotion';
import { bones, drawLortor, hammerEdge } from './rig.ts';
import { ANIMS, poseAt, type Anim } from './anims.ts';

// Sprite cell: 640x640, source feet (170,333) pinned to (320,540). Game anchor = (320,540).
export const CELL = 640, ANCHOR = [320, 540] as const;
const BASE = () => new DOMMatrix().translate(ANCHOR[0] - 170, ANCHOR[1] - 333);

const useLortor = () => {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [h] = useState(() => delayRender('lortor.png'));
  useLayoutEffect(() => {
    const i = new Image();
    i.onload = () => { setImg(i); continueRender(h); };
    i.src = staticFile('lortor/lortor.png');
  }, [h]);
  return img;
};

// One sprite frame into ctx at the current transform (cell space).
export function paintFrame(ctx: CanvasRenderingContext2D, img: HTMLImageElement, a: Anim, f: number, at: DOMMatrix) {
  const base = at.multiply(BASE()), p = poseAt(a, f);
  const trail = p.trail > 0.5 ? Array.from({ length: 21 }, (_, k) => hammerEdge(bones(poseAt(a, Math.max(0, f - 5 + k / 4)), base))) : [];
  drawLortor(ctx, img, p, bones(p, base), trail);
}

const Canvas: React.FC<{ w: number; h: number; draw: (ctx: CanvasRenderingContext2D, img: HTMLImageElement) => void; deps: unknown[] }> = ({ w, h, draw, deps }) => {
  const ref = useRef<HTMLCanvasElement>(null), img = useLortor();
  useLayoutEffect(() => {
    if (!img) return;
    const ctx = ref.current!.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
    draw(ctx, img);
  }, [img, ...deps]);
  return <canvas ref={ref} width={w} height={h} style={{ position: 'absolute', left: 0, top: 0 }} />;
};

// Every animation back to back on a transparent 640x640 cell (render as a PNG sequence).
export const FRAMES_TOTAL = ANIMS.reduce((n, a) => n + a.frames, 0);
export const Frames: React.FC = () => {
  let at = 0;
  return (
    <AbsoluteFill>
      {ANIMS.map((a) => { const from = at; at += a.frames; return <Sequence key={a.name} from={from} durationInFrames={a.frames}><Cell a={a} /></Sequence>; })}
    </AbsoluteFill>
  );
};
const Cell: React.FC<{ a: Anim }> = ({ a }) => {
  const f = useCurrentFrame();
  return <Canvas w={CELL} h={CELL} deps={[f, a]} draw={(ctx, img) => paintFrame(ctx, img, a, f, new DOMMatrix())} />;
};

// Spritesheet still for one animation: frames left-to-right, top-to-bottom.
export const sheetCols = (a: Anim) => Math.min(8, a.frames);
export const Sheet: React.FC<{ anim: string }> = ({ anim }) => {
  const a = ANIMS.find((x) => x.name === anim)!, cols = sheetCols(a), rows = Math.ceil(a.frames / cols);
  return <Canvas w={cols * CELL} h={rows * CELL} deps={[a]} draw={(ctx, img) => {
    for (let f = 0; f < a.frames; f++) paintFrame(ctx, img, a, f, new DOMMatrix().translate((f % cols) * CELL, Math.floor(f / cols) * CELL));
  }} />;
};

// Review reel: every animation looping in a labelled grid.
export const Preview: React.FC = () => {
  const vf = useCurrentFrame(), cols = 7, cw = 1920 / cols, ch = 1080 / Math.ceil(ANIMS.length / cols), s = Math.min(cw, ch) / CELL * 1.25;
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 40%, #233554, #0b0716 75%)', fontFamily: 'system-ui, sans-serif' }}>
      <Canvas w={1920} h={1080} deps={[vf]} draw={(ctx, img) => {
        ANIMS.forEach((a, i) => {
          const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch;
          const hold = a.loop ? 0 : 20, f = (vf % (a.frames + hold));
          ctx.save();
          ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(cx + 4, cy + 4, cw - 8, ch - 8);
          ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.moveTo(cx + 10, cy + ch - 30); ctx.lineTo(cx + cw - 10, cy + ch - 30); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 18px system-ui'; ctx.fillText(a.name, cx + 12, cy + 26);
          ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '14px system-ui';
          ctx.fillText(a.phases ? `${a.phases.startup}/${a.phases.active}/${a.phases.recovery}` : `${a.frames}f${a.loop ? ' loop' : ''}`, cx + 12, cy + 46);
          ctx.restore();
          paintFrame(ctx, img, a, Math.min(f, a.frames - 1), new DOMMatrix().translate(cx + cw / 2 - ANCHOR[0] * s, cy + ch - 30 - ANCHOR[1] * s).scale(s));
        });
      }} />
    </AbsoluteFill>
  );
};
