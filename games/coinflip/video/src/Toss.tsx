import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';

// 3D coin toss: start face -> N tumbles about X -> end face, face-on at both ends.
// Heads = public/head.png (flattened from brawler ui/coin.webp by face.py), tails = star.
export type Face = 'heads' | 'tails';
export const FPS = 60;
export const FRAMES = 120;

const D = 300; // coin diameter px
const T = 26; // thickness px
const SLICES = 27; // stacked discs (1/px) fake a solid edge
const LIFT = 210; // apex height px
const SPINS = 6; // full turns in flight
const UP = 8; // flight starts
const DOWN = 84; // lands

const STAR = (() => {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 62 : 150;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    p.push(`${(256 + r * Math.cos(a)).toFixed(1)},${(256 + r * Math.sin(a)).toFixed(1)}`);
  }
  return p.join(' ');
})();

// rim + dark disc match head.png palette
const Tails = () => (
  <svg viewBox="0 0 512 512" width={D} height={D}>
    <defs>
      <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#d9cbea" />
        <stop offset="0.45" stopColor="#7d6c93" />
        <stop offset="1" stopColor="#c7b6dc" />
      </linearGradient>
      <radialGradient id="disc" cx="0.4" cy="0.35" r="0.75">
        <stop offset="0" stopColor="#4a4250" />
        <stop offset="1" stopColor="#2b2530" />
      </radialGradient>
    </defs>
    <circle cx="256" cy="256" r="254" fill="url(#rim)" />
    <circle cx="256" cy="256" r="216" fill="url(#disc)" stroke="#1d1922" strokeWidth="6" />
    <polygon points={STAR} fill="#2a2430" stroke="#2a2430" strokeWidth="34" strokeLinejoin="round" transform="translate(4 8)" opacity="0.6" />
    <polygon points={STAR} fill="#efeaf5" stroke="#efeaf5" strokeWidth="30" strokeLinejoin="round" />
  </svg>
);

export const Toss: React.FC<{ from: Face; to: Face }> = ({ from, to }) => {
  const f = useCurrentFrame();
  const start = from === 'tails' ? 180 : 0;
  const turn = SPINS * 360 + (from === to ? 0 : 180);
  const t = interpolate(f, [UP, DOWN], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const arc = 4 * t * (1 - t); // 0 -> 1 at apex -> 0

  // spin: fast off the thumb, slowing into the catch; lands exactly on end face
  const rx = start + turn * Easing.out(Easing.cubic)(t);
  // anticipation dip, flight arc, then two small damped bounces
  const dip = interpolate(f, [0, 4, UP], [0, 10, 0], { extrapolateRight: 'clamp' });
  const land = f > DOWN ? -22 * Math.abs(Math.sin(((f - DOWN) / 26) * Math.PI)) * Math.exp(-(f - DOWN) / 12) : 0;
  const y = dip - LIFT * arc + land;
  const s = 1 + 0.22 * arc; // nearer at apex
  // slight wobble so the edge reads as 3D; zero at both ends
  const wob = f > DOWN ? 7 * Math.sin((f - DOWN) / 4) * Math.exp(-(f - DOWN) / 9) : 0;
  const ry = 18 * Math.sin(Math.PI * t);
  const rz = -10 * Math.sin(Math.PI * t);

  // cheap lighting: faces darken as they tilt away
  const lit = (a: number) => 0.55 + 0.45 * Math.max(0, Math.cos((a * Math.PI) / 180));
  const front = lit(rx + wob);
  const back = lit(rx + wob - 180);
  const edge = 0.6 + 0.5 * Math.abs(Math.sin(((rx + wob) * Math.PI) / 180));

  const face: React.CSSProperties = { position: 'absolute', inset: 0, borderRadius: '50%', backfaceVisibility: 'hidden' };
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      {/* contact shadow, shrinks + fades with height */}
      <div style={{
        position: 'absolute', top: '50%', width: D * 0.9, height: D * 0.16, borderRadius: '50%',
        transform: `translateY(${D / 2 + 34}px) scale(${1 - 0.55 * arc})`,
        background: 'radial-gradient(closest-side, rgba(0,0,0,0.5), transparent)', opacity: 1 - 0.6 * arc,
      }} />
      <div style={{ perspective: 1400, transform: `translateY(${y}px) scale(${s})` }}>
        <div style={{ width: D, height: D, position: 'relative', transformStyle: 'preserve-3d', transform: `rotateZ(${rz}deg) rotateY(${ry}deg) rotateX(${rx + wob}deg)` }}>
          {Array.from({ length: SLICES }, (_, i) => (
            <div key={i} style={{
              position: 'absolute', inset: 2, borderRadius: '50%',
              transform: `translateZ(${-T / 2 + (i * T) / (SLICES - 1)}px)`,
              background: `hsl(268 16% ${38 + 18 * Math.sin((i / (SLICES - 1)) * Math.PI)}%)`, filter: `brightness(${edge})`,
            }} />
          ))}
          <Img src={staticFile('head.png')} style={{ ...face, width: D, height: D, transform: `translateZ(${T / 2 + 0.5}px)`, filter: `brightness(${front})` }} />
          <div style={{ ...face, transform: `rotateX(180deg) translateZ(${T / 2 + 0.5}px)`, filter: `brightness(${back})` }}><Tails /></div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
