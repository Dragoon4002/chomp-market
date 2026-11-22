// Export Lortor sprites: per-animation transparent PNG frames + one spritesheet per animation + lortor.json.
// npm run lortor   (writes out/lortor/)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { ANIMS } from './anims.ts';

const OUT = 'out/lortor', SEQ = `${OUT}/_seq`, CELL = 640, ANCHOR = [320, 540];
const cols = (n: number) => Math.min(8, n); // keep in sync with sheetCols() in Sprites.tsx
const rx = (args: string[]) => execFileSync('npx', ['remotion', ...args], { stdio: 'inherit' });

rmSync(OUT, { recursive: true, force: true });
mkdirSync(SEQ, { recursive: true });
rx(['bundle', '--out-dir', `${OUT}/_bundle`]);
rx(['render', `${OUT}/_bundle`, 'Lortor-Frames', SEQ, '--sequence', '--image-format=png']);

const files = readdirSync(SEQ).filter((f) => f.endsWith('.png')).sort();
let at = 0;
const anims: Record<string, unknown> = {};
for (const a of ANIMS) {
  const dir = `${OUT}/frames/${a.name}`;
  mkdirSync(dir, { recursive: true });
  for (let f = 0; f < a.frames; f++) renameSync(`${SEQ}/${files[at + f]}`, `${dir}/${a.name}_${String(f).padStart(3, '0')}.png`);
  at += a.frames;
  mkdirSync(`${OUT}/sheets`, { recursive: true });
  rx(['still', `${OUT}/_bundle`, 'Lortor-Sheet', `${OUT}/sheets/${a.name}.png`, `--props=${JSON.stringify({ anim: a.name })}`]);
  anims[a.name] = { frames: a.frames, loop: a.loop, cols: cols(a.frames), rows: Math.ceil(a.frames / cols(a.frames)), sheet: `sheets/${a.name}.png`, ...(a.phases ? { phases: a.phases } : {}) };
}
if (at !== files.length) throw new Error(`frame count mismatch: ${files.length} rendered, ${at} expected`);
rmSync(SEQ, { recursive: true }); rmSync(`${OUT}/_bundle`, { recursive: true });
writeFileSync(`${OUT}/lortor.json`, JSON.stringify({
  character: 'Lortor', fps: 60, cell: [CELL, CELL], anchor: ANCHOR, facing: 'right',
  note: 'anchor = feet (sim x,y). Sprite is source-scale: ~320px from feet to horn tip; scale to taste. Attack phases match the sim frame data (startup/active/recovery).',
  anims,
}, null, 1));
console.log(`exported ${ANIMS.length} animations, ${at} frames -> ${OUT}`);
