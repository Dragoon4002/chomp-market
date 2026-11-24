# Intake: Pet Den

Tamagotchi-style virtual pet. Your monster lives in a MagicBlock **Private Ephemeral Rollup** (TEE): its stats and every care tap are private (owner-only read) and gasless. Only an evolution commits back to base, where the new tier makes the monster worth more on the market. **Free play only.** Original game, MIT.

## Layout
- `game.json`: html5, entry `index.html`, settle `result`.
- `src/`: none (from scratch). Code lives in `build/`, no build step, no deps.
- `build/`: `index.html` (DOM UI + edge loop), `sim.js` (pure sim, mirror of `program/src/sim.rs`), `chain.js` (mock adapter + `TODO(solana)` hooks), `chomp-sdk.js` (copy), `art/` (5 monster heads copied from `games/brawler/client/public/chars/*/cutout/head.png`), `thumb.png`, `LICENSE`, `smoke.mjs`.
- `program/`: standalone Anchor 1.0.2 crate (`[workspace]` table keeps it out of the root workspace), `ephemeral-rollups-sdk 0.18` with `anchor,access-control`. Its `Cargo.lock` pins the anchor macro crates to 1.0.2 (they float to 1.2.x otherwise and break `#[account(init)]`).

## Source & license
- URL: none, from scratch. License: MIT (ours). Engine: plain JS + DOM, ES modules.

## Keep (reuse from repo)
- Monster heads from brawler chars. `rng` (mulberry32) and the name syllables from `genes.ts` via monster-siege `sim.js`.

## Strip
- n/a. Never add: stakes, wallet popups, network calls besides the SDK.

## Add features
- **Stats** 0-100: food, joy, energy, hygiene, health. Plus age, xp, tier, streak.
- **Tick** (1 per 2 s in the client demo, 60 s on chain): food/hygiene −1, awake: energy/joy −1, asleep: energy +3 (auto-wake at 100).
  - Any of food/joy/energy/hygiene < 20 → **sick**: health −2, streak reset. Health 0 → **runs away** (dead).
  - All ≥ 50 → **happy**: health +1, xp +1, streak +1.
- **Actions**: feed (+25 food, −5 hygiene, −10 joy if already ≥ 90), play (5 s tap-the-candy mini-game, score 0-10 → joy +5+3·score, xp +score, −10 energy, needs 10), clean (hygiene 100), sleep/wake.
- **Evolve**: xp ≥ 20 / 60 / 150 and not sick → Hatchling → Junior → Adult → Elder, health refilled. Bigger sprite.
- **EF hook: care streak.** Consecutive happy ticks; best streak adds a premium to the listed value (`value ×(tier+1)²·(1+best/100)`). TODO(solana): Magic Action after the evolve commit pays a streak bonus into the pet's earnings vault.
- New egg after a runaway (DNA from the session seed).

## Integration
- `Chomp.onSession` → boot (seed → DNA, owner = wallet). `Chomp.ready()` at load.
- `Chomp.start()` on the first care action of a run. `Chomp.result({ winner, score: tier·1000+xp, tier, reason })` on **evolve** (`winner: "you"`) or **runaway** (`winner: "none"`).
- Stakes: free-only. Play score is client-reported (it's your own pet).

## Map
- Entry: `build/index.html` module script. Loop: `setInterval` 500 ms → `chain.tick(Date.now())`; `chain.js` turns real ms into whole ticks (`TICK_MS`), the only clock. Sim has no clock.
- RNG: `rng(session.seedU ^ playIndex)` for mini-game candy positions, `lookOf(dna)` for species/hue/name.
- Storage: `localStorage` in try/catch (works standalone, in-memory inside the portal sandbox).

## Chain (program/)
| ix | layer | does |
|---|---|---|
| `create_pet(dna)` | base | init Pet PDA `["pet", owner]`, CPI `CreatePermission` (member = owner, AUTHORITY + TX_LOGS) |
| `delegate_pet` | base | `DelegatePermission` + delegate Pet to the TEE validator (remaining_accounts[0]) |
| `tick` | PER | catch up decay from `Clock` |
| `care(action, score)` | PER | owner only, catch up then feed/play/clean/sleep |
| `evolve` | PER | level up, then `CommitAndUndelegatePermission` + `commit_and_undelegate` Pet → tier public on base |

## Done checklist
- [x] License OK, `LICENSE` in `build/`
- [x] No external network calls
- [x] Features added
- [x] SDK events fire (ready/start/result)
- [ ] `/play/pet-den` loads in the portal (main agent)
