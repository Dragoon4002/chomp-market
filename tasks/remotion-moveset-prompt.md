# Brawler Arena moveset video: prompt for a Remotion session

Paste everything below the line into a new Claude Code session opened at the repo root.

---

Use the **remotion** skill. Make a moveset showcase video for our game, Brawler Arena, showing one fighter performing every action: movement, jumps, dodges, and all 14 attacks, each labelled. Drive the real game code, not hand-made animation. The game rules are deterministic and the renderer is pure, so this fits Remotion's frame-driven model exactly.

## Output
- 1920x1080, **60 fps** (the sim runs at 60 Hz, so one video frame = one game frame and the frame data stays exact). About 75–90 s total.
- Composition id `Moveset`. Render to `games/brawler/video/out/moveset.mp4`.
- Create the Remotion project at `games/brawler/video/`. Add `/games/brawler/video/out/` and `node_modules` to `.gitignore`.

## Game code to reuse (import from `../client/src/...`, don't copy)
- `render/rig.ts`: `poseFor(fighter, frame)` picks and blends the pose, and `drawMonster(ctx, pose, look, flash)` draws a fighter on a 2D canvas (origin at the feet, facing right; flip with `ctx.scale(facing, 1)`).
- `render/parts.ts`: the SVG part library the rig draws.
- `sim/sim.ts`: `newGame(stats, stage)`, `step(state, inputs)`, `hitboxOf(f)`, input bits `IN.{LEFT,RIGHT,UP,DOWN,JUMP,LIGHT,HEAVY,DODGE}`. Pure and deterministic.
- `sim/moves.ts`: frame data for every move.
- `genes.ts`: `lookOf(dna)`, `statsOf(dna)`, `randomDna(seed)`, `nameFor(seed)`.
- `stages.ts`: stage geometry (`ember` = Ember Ruins).
- Imports use explicit `.ts` extensions. Make sure Remotion's webpack/TS config resolves them (`allowImportingTsExtensions` or a webpack override).
- **Do NOT import `render/draw.ts`**: it uses `Math.random()` for shake and particles, which breaks Remotion's determinism. Draw the stage yourself (simple platforms) and use seeded `random('seed')` for any particles.

## Fighter
- **Hero:** Bramdra, our gen-1 roster fighter #0: `{ ...randomDna(1000), horn: 0, tail: 0, pattern: 0, eye: 0, hue: 10 }`. Name from `nameFor(1000)`. Sword, swept horns.
- **Training dummy:** roster #1, Veloxpel: `{ ...randomDna(8919), horn: 1, tail: 1, pattern: 0, eye: 1, hue: 57 }`. Gives attacks something to hit, and shows hitstun, tumble and KO. The dummy's inputs stay 0, except where noted.
- **Painted art:** use `assets/creatures/horned-heroes/bramdra.png` (copy into the Remotion `public/`, load with `staticFile`) for the title and end cards only. It's a still image, so the gameplay uses the vector rig.

## How to drive each scene
For each scene, make a fresh `newGame([heroStats, dummyStats], 'ember')`, place the fighters (set `x`, `y`, `facing`), then pre-warm with neutral inputs until both are grounded and idle. Then follow an **input script**: a list of `{ frames, hero, dummy }` steps. Step the sim once per video frame up to `useCurrentFrame()`. Re-simulate from the scene start every frame (cheap: under 400 steps), or memoise per scene. Draw with `poseFor` + `drawMonster` on a `<canvas>` sized 1920x1080 inside the component, redrawn in `useLayoutEffect` keyed on the frame.
- Camera: fixed per scene, framed on the action (zoom ~1.6 so the fighters read well). No random shake.
- Lower third on every scene: **action name**, **input** (keyboard, P1 layout), and a frame-data chip for attacks (startup / active / recovery, damage).
- Optional debug overlay: draw `hitboxOf(f)` as a translucent red box on active frames, plus the 50x90 hurtbox in green, on the attack scenes.
- Between scenes: 12-frame fade. Section title cards for Movement / Defense / Ground attacks / Air attacks / Getting hit.

## Actions to show (in this order)
Controls (P1): A/D move, W up, S down, Space jump, Z light, X heavy, C dodge.

### Movement
1. **Idle**: breathing loop + blink. No input, ~90 frames.
2. **Run**: hold D, ~60 frames; then release to show friction stop. Also turn around (hold A).
3. **Jump (full)**: hold Space through the 3-frame jumpsquat → rise, apex, fall, land (dust + squash).
4. **Short hop**: tap Space (release before jumpsquat ends) → lower jump.
5. **Double jump**: jump, then Space twice more in the air (2 air jumps per airtime).
6. **Fast fall**: at the jump apex, tap S → falls at double gravity, faster cap.
7. **Drop through platform**: stand on a soft ledge (Ember has two at y=430), tap S → falls through.
8. **Landing lag**: do an aerial and land mid-move → 6-frame landing state.

### Defense
9. **Ground dodge**: C (+ direction) → quick slide, 15 invulnerable frames, 50-frame cooldown. Show the transparency blink.
10. **Air dodge**: in the air, C + direction (8 directions) → burst, 17 invulnerable frames, once per airtime. Show a diagonal one.

### Ground attacks (light = Z, heavy = X)
| # | Move | Input | Startup / Active / Recovery | Damage | Notes |
|---|---|---|---|---|---|
| 11 | Jab 1 | Z | 5 / 3 / 12 | 5 | starts the 3-hit chain |
| 12 | Jab 2 | Z again during jab 1 recovery | 4 / 3 / 12 | 5 | |
| 13 | Jab 3 (finisher) | Z again during jab 2 recovery | 6 / 4 / 18 | 8 | launches |
| 14 | Side light | D/A + Z | 8 / 4 / 16 | 10 | lunge forward |
| 15 | Down light | S + Z | 7 / 4 / 14 | 9 | low sweep |
| 16 | Neutral heavy | X | 16 / 5 / 24 | 18 | overhead, hits both sides, launches up |
| 17 | Side heavy | D/A + X | 18 / 5 / 26 | 20 | big lunge, strongest horizontal |
| 18 | Down heavy | S + X | 15 / 6 / 24 | 17 | tail sweep, hits both sides |

Show 11–13 as one chained combo on the dummy, then each other move once on the dummy.

### Air attacks (while airborne)
| # | Move | Input | Startup / Active / Recovery | Damage | Notes |
|---|---|---|---|---|---|
| 19 | Neutral air | Z | 6 / 6 / 12 | 9 | overhead arc, hits both sides |
| 20 | Side air | D/A + Z | 7 / 5 / 14 | 10 | flying kick |
| 21 | Down air | S + Z | 8 / 6 / 14 | 10 | spike (knocks down) |
| 22 | Side air heavy | D/A + X | 14 / 6 / 22 | 17 | lunging dropkick |
| 23 | Recovery | X (no direction) | 5 / 12 / 20 | 12 | spinning rise, once per airtime, restored on landing or when hit |
| 24 | Ground pound | S + X | 10 / until landing / 18 | 16 | hovers, then slams down until it lands |

### Getting hit
25. **Hitstun / hurt**: dummy uses jab on the hero → hurt pose, eyes shut, white hit flash during hitlag.
26. **Tumble**: a strong hit (side heavy at high damage) → spinning tumble.
27. **KO + respawn**: raise the hero's `damage` to ~150 beforehand so a side heavy sends them past the blast zone → KO beam, then respawn after 90 frames, dropping in with 120 invulnerable frames (blinking).

Startup values above are base values. The sim adds `floor((5 - dex) / 2)` from the fighter's Dexterity stat (minimum 2), so read the real number from `startup(f, MOVES[id])` for the chip.

## Done when
- `npx remotion still Moveset out/check.png --frame=<n>` looks right for a jump apex, a heavy attack's active frame, and the KO beam (view them).
- The full render exists at `games/brawler/video/out/moveset.mp4`; report its duration and size.
- No `Math.random`, CSS animation or timers anywhere in the composition.
