import { Composition } from 'remotion';
import { FPS, FRAMES, Toss, type Face } from './Toss.tsx';

// Toss-<from><to>: h = heads, t = tails. 3:2, transparent (see remotion.config.ts).
const CASES: [string, Face, Face][] = [['hh', 'heads', 'heads'], ['ht', 'heads', 'tails'], ['th', 'tails', 'heads'], ['tt', 'tails', 'tails']];

export const Root: React.FC = () => (
  <>
    {CASES.map(([id, from, to]) => (
      <Composition key={id} id={`Toss-${id}`} component={Toss} durationInFrames={FRAMES} fps={FPS} width={1200} height={800} defaultProps={{ from, to }} />
    ))}
  </>
);
