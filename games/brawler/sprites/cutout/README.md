# Cutout heroes

Turns one hero PNG (chibi, 3/4 view, facing right) into 11 rigid parts driven by the vector rig's poses (`client/src/lib/render/rig.ts`). No per-hero code: a hero is a config + a folder of PNGs.

## Add a hero

1. Write `<hero>.json` (copy `lortor.json`). Coordinates are source-image pixels.
   - `feet`: ground point between the feet (becomes the fighter origin). `hip`: spin centre. `height`: px that map to 100 game units.
   - `parts`, in draw order (back → front): `cape, backThigh, backShin, frontThigh, frontShin, torso, backUpper, backFore, head, frontUpper, frontFore`. Keep names/bones/parents as in `lortor.json`.
   - Each part: `poly` (outline), `pivot` (joint it rotates about), `fill` (px of inpaint painted under the parts drawn above it, so moving parts leave no hole). `torso` has `"rest": true` (takes every pixel not claimed) and `fillPoly` (keeps its fill inside the real body).
2. Cut (Blender 5, headless):
   ```sh
   blender -b --factory-startup --python cut.py -- <hero>.json ../../client/public/chars/<hero>/cutout overlay.png
   ```
   `overlay.png` colours each part + marks pivots: check it.
3. Preview every pose: `node preview/serve.mjs`, then open `http://localhost:3124/?h=<hero>`.
4. Play it: `/?demo&p1=<hero>&p2=lortor#/fight/fight`.

## Use in the web game

```ts
import { hero, drawHero } from '@/lib/render/cutout.ts';
const h = hero('lortor');                 // starts loading; null until ready
if (h) drawHero(ctx, pose, h, flash);     // fighter-local space: feet at origin, facing right
```
Pose comes from `poseFor(fighter, frame)`, same as `drawMonster`, so every move animates with no extra data.
