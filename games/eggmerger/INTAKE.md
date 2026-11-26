# Intake: EggMerger

Replaces 2048 (deleted). Drop-and-merge physics puzzle, own art + theme (monster eggs, not fruit).

## Pitch
Drop monster eggs into a cursed nest. Two of a kind merge into the next stage. Two bramdra fuse into an **Elder** that bursts out of the nest and pays from the shared **Brood Pot** (devnet SOL). If the nest overflows, the run is over.

**Demo moment (10s):** pay 0.001 SOL → drop → merge chain → bramdra + bramdra → Elder roars out → "+0.0x SOL" burst into the wallet, pot counter ticks down.

## Layout
- `game.json`: `soon: true` until playable.
- `build/`: plain HTML/JS + canvas, no build step. `build/vendor/matter.min.js` (MIT, keep its license header). `build/art/` = copied assets.
- `referee/`: Node script that replays the drop tape with the same `build/sim.js`.

## Source & license
- From scratch. Physics: matter.js 0.19 (MIT, https://github.com/liabru/matter-js), vendored as a single file.
- No third-party merge-game code or art. The tier art is ours (brawler assets).

## Loops
- **30s:** aim, drop, chain merges.
- **5min:** one run: build up to an Elder (or several) before overflow.
- **Return:** the pot grows from every entry. A visible "Pot: X SOL" means a big pot = a big pop. Best score of the week goes on the leaderboard (`submit_score`).

## Rules / numbers
- Nest: 400×600 logical px, lid line at y=100. Pieces are circles.
- Drop: tap/click sets x; 500ms cooldown between drops. Only tiers 1-4 drop. Next piece is shown.
- Tier chain (radius px):

| T | Piece | Art | r |
|---|---|---|---|
| 1 | teal egg | `ui/egg-teal.webp` | 16 |
| 2 | purple egg | `ui/egg-purple.webp` | 22 |
| 3 | gold egg | `ui/egg-gold.webp` | 29 |
| 4 | cracked egg | `ui/egg-hatch.webp` | 37 |
| 5 | torfen | `chars/torfen/cutout/head.png` | 46 |
| 6 | makvel | `chars/makvel/cutout/head.png` | 56 |
| 7 | lortor | `chars/lortor/cutout/head.png` | 67 |
| 8 | grodrasu | `chars/grodrasu/cutout/head.png` | 79 |
| 9 | bramdra | `chars/bramdra/cutout/head.png` | 92 |
| 10 | **Elder** | bramdra head + gold glow (CSS/canvas shadow) | pops instantly |

(Asset paths are relative to `games/brawler/client/public/`. Copy them into `build/art/`.)
- Merge: on contact, two same-tier pieces → one piece of tier+1 at the midpoint. Score += 2^tier.
- **Elder pop:** a T9+T9 merge spawns no piece. It plays the pop animation, `elders += 1`, and the run continues.
- **Overflow:** any settled piece (speed < 0.2) above the lid for 2s (120 ticks) → game over.
- Run cap: 600s, then auto-end, so the referee replay is bounded.

## Economy (devnet SOL, no emissions)
- Entry: **0.001 SOL**. Keep it tiny so people replay and push scores.
- Split per entry: **80% → Brood Pot PDA**, **10% → monster vault cut** (the holder pool; until it exists, this goes to treasury), **10% → fee/treasury**.
- Each Elder pop pays **15% of the current pot** (recomputed per pop, so several pops in a run each take 15% of what's left). The pot can't drain to 0 and the house has no exposure.
- Seed the pot with 0.05 SOL at launch so the first pops feel real.
- Owned/sellable: nothing minted in v1. Value = SOL out of the pot.

## Trust
- **Settle:** `moves`. Tape = `[{tick, x}]` per drop (tiny: ~100-300 entries per run).
- **VRF:** decides the run seed → the next-piece queue (seeded PRNG: tiers 1-4, weights 40/30/20/10).
- **ER:** the run PDA is delegated to the ER. Each drop = a gasless `drop(tick, x)` tx signed by a session key, appended to the run PDA. That gives a tamper-proof tape. It's committed to the base layer at the end.
- **Referee:** reads the tape from the run PDA, replays `sim.js` in Node (fixed 60Hz step, `Engine.update(engine, 1000/60)`, no wall clock, no `Math.random`), computes `elders` and `score`, and calls `settle_run` → pays `elders` pops from the pot. **The referee's result wins**: client physics is display only, since floats can drift across browsers.
- A client-reported score alone is never paid.

## Modules → mechanics → chain hook
| Module | Mechanic | Hook |
|---|---|---|
| Puzzle | drop, merge, overflow | `// TODO(solana): VRF seed for the piece queue` |
| Raffle/Jackpot (pot) | entry feeds the pot, Elder pop pays 15% | `// TODO(solana): escrow: enter_run (0.001 SOL → pot/vault/fee), settle_run (referee pays pops)` |
| ER | per-drop tx with a session key | `// TODO(solana): ER: delegate run PDA, drop(tick,x), commit+undelegate at end` |
| Leaderboard | weekly best score | existing `chomp.submit_score('eggmerger', score)` |

**Chain gap:** `chomp` only has 1v1 match escrow plus `submit_score`. A solo pot needs new instructions: `init_pot`, `enter_run`, `drop` (ER), `settle_run` (referee-signed), either added to `chomp` or in a small `egg_pot` program under `games/eggmerger/program/` (the pet-den/sealed-house pattern). Decide at build time. Prefer a separate program so `chomp` stays untouched.

## Integration
- `<script src="/chomp-sdk.js"></script>`
- `Chomp.onSession(s => …)`: use `s.seed` for the PRNG. `s.mode` free = no entry; pot mode = entry tx first.
- `Chomp.ready()` once the art is loaded. `Chomp.start()` on the first drop.
- `Chomp.frames([{tick,x}])` per drop (until ER drop txs are wired).
- `Chomp.result({ score, elders, tapeHash })` at game over.

## Keep / Strip
- Keep from 2048: nothing (deleted).
- Strip: n/a (from scratch).

## Cut list
- Shiny Elder NFT mint: add when the market program exists.
- Power-ups (shake, remove a piece): add if retention data asks for it.
- 1v1 same-seed duel: add after the solo pot ships (reuses `chomp` match escrow).
- Holder vault distribution: the 10% sits in treasury until monster vault PDAs exist.

## Map
- **Entry:** `build/index.html:111` `newRun()` → `sim.create(seed)` (`build/sim.js:53`). Boot/ready `index.html:190`, session `index.html:102` (fallback seed `:191`).
- **Loop:** `build/index.html:168` `frame()`: rAF accumulator → fixed 60 Hz `step()` (`build/sim.js:76`, `Engine.update(engine, 1000/60)`); merges in the same step (pairs scan).
- **RNG:** `build/sim.js:34` mulberry32(seed) → `roll` `sim.js:44` (tiers 1-4, 40/30/20/10). Only randomness in the sim. Seed string → u32: digits pass through, else FNV-1a (`index.html`, `referee/replay.mjs`).
- **Input:** `build/index.html:158` pointerup → `tryDrop` `:122` → `sim.drop` `build/sim.js:65` (30-tick cooldown, x clamped to the walls + rounded). Tape entry `{tick, x}` → `Chomp.frames` `:129`.
- **End:** `build/sim.js:106` overflow (settled above the lid for 120 ticks), `:107` 600 s cap → `finish()` `index.html:132` → `Chomp.result({score, elders, tapeHash})` `:137`.
- **Time sources:** none in the sim. rAF time only paces steps and FX; `Math.random` only for the free-mode seed and the coin shower (render).
- **Determinism:** V8's sin/cos differ between Node 22 and Chrome 158 (we measured it), so `sim.js:22` swaps matter's `Math.sin/cos` for `+-*/`-only versions while the sim runs. Browser live 1150 = Node referee 1150 on a captured portal tape.
- **Referee:** `referee/replay.mjs <seed> <tape.json>` → `{score, elders}` via `sim.replay` `build/sim.js:116`.

## Done checklist
- [x] matter.js MIT header kept in `build/vendor/`
- [x] No external network calls
- [x] Deterministic: the same seed + tape gives the same score in browser and Node (smoke test)
- [x] SDK events fire (portal footer shows match:result)
- [x] `/play/eggmerger` loads, no console errors, `soon` removed
