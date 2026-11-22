import { Composition } from 'remotion';
import { Moveset, timeline } from './Moveset.tsx';
import { CELL, Frames, FRAMES_TOTAL, Preview, Sheet, sheetCols } from './lortor/Sprites.tsx';
import { ANIMS } from './lortor/anims.ts';

export const Root: React.FC = () => (
  <>
    <Composition id="Moveset-Lortor" component={Moveset} durationInFrames={timeline('lortor').total} fps={60} width={1920} height={1080} defaultProps={{ hero: 'lortor' as const }} />
    <Composition id="Moveset-Veloxpel" component={Moveset} durationInFrames={timeline('veloxpel').total} fps={60} width={1920} height={1080} defaultProps={{ hero: 'veloxpel' as const }} />
    <Composition id="Lortor-Frames" component={Frames} durationInFrames={FRAMES_TOTAL} fps={60} width={CELL} height={CELL} />
    <Composition id="Lortor-Preview" component={Preview} durationInFrames={600} fps={60} width={1920} height={1080} />
    <Composition id="Lortor-Sheet" component={Sheet} durationInFrames={1} fps={60} width={CELL} height={CELL} defaultProps={{ anim: 'idle' }}
      calculateMetadata={({ props }) => { const a = ANIMS.find((x) => x.name === props.anim)!; const c = sheetCols(a); return { width: c * CELL, height: Math.ceil(a.frames / c) * CELL }; }} />
  </>
);
