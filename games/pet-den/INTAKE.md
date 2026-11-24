# Intake: Pet Den

Tamagotchi-style virtual pet. Your monster lives on Solana devnet (`pet_den` program, base layer): stats, every care tap and evolutions are on chain. A MagicBlock **Private Ephemeral Rollup** (TEE) path (owner-only reads, gasless care, evolve commits back to base) is kept in the program but not wired in the client yet (see Chain). **Free play only.** Original game, MIT.

## Layout
- `game.json`: html5, entry `index.html`, settle `result`.
- `src/`: none (from scratch). Code lives in `build/`, no build step, no deps.
- `build/`: `index.html` (markup + CSS, placeholder SVG scene), `ui.js` (DOM render, actions, mini-games, edge loop, chomp-sdk), `features.js` (shop, jobs, breeding, quests, achievements, leaderboard; pure functions on the state), `sim.js` (pure sim, mirror of `program/src/sim.rs`), `chain.js` (chain adapter: real devnet backend via the portal bridge, in-memory mock otherwise; roster + soft economy state), `chomp-sdk.js` (copy), `art/` (`<species>.png` heads from brawler `cutout/head.png`; `body-<species>.png` rest-pose full bodies composed once offline from brawler `cutout/*.png` + `rig.json`), `thumb.png`, `LICENSE`, `smoke.mjs`. Changed module URLs carry `?v=N` (chain/features/ui at `?v=3`).
- **Background swap point:** drop `build/art/habitat-bg.webp` in and it covers the placeholder SVG scene (`.scene .bg` in `index.html`, a CSS `background-image` layered over the inline SVG). After dropping the file, uncomment the `background:` line in `.scene .bg` (kept commented so a missing file never 404s). Habitat changes tint the placeholder only (`.scene.h1/.h2`).
- `program/`: standalone Anchor 1.0.2 crate (`[workspace]` table keeps it out of the root workspace), `ephemeral-rollups-sdk 0.18` with `anchor,access-control`. Its `Cargo.lock` pins the anchor macro crates to 1.0.2 (they float to 1.2.x otherwise and break `#[account(init)]`). Build: `cd program && cargo build-sbf` → `target/deploy/pet_den.so`; `cargo test` = sim tests. Program id `2shkiB14DfoCSKawmYMv3qsGTBCxuN4onKQuztYyG2ue` (`.keys/pet_den.json`), deployed by `scripts/devnet-setup.sh`.

## Source & license
- URL: none, from scratch. License: MIT (ours). Engine: plain JS + DOM, ES modules.

## Keep (reuse from repo)
- Monster heads from brawler chars. `rng` (mulberry32) and the name syllables from `genes.ts` via monster-siege `sim.js`.

## Strip
- n/a. Never add: stakes, wallet popups, network calls besides the SDK.

## Add features
- **Stats** 0-100: food (shown as Hunger), joy, energy, hygiene, health. Plus age, xp, tier, streak. **Growth:** str/int base 10-30 from DNA bytes 2/3, Train +2 str, Play +1+score/4 int. **Level** = 1 + xp/10. **Personality/rarity** derived from DNA (display). DNA u32 bytes: 0 species, 1 hue, 2 str, 3 int.
- **Tick** (1 per 2 s in the client demo, 60 s on chain): food/hygiene −1, awake: energy/joy −1, asleep: energy +3 (auto-wake at 100).
  - Any of food/joy/energy/hygiene < 20 → **sick**: health −2, streak reset. Health 0 → **runs away** (dead).
  - All ≥ 50 → **happy**: health +1, xp +1, streak +1.
- **Actions**: feed (+25 food, −5 hygiene, −10 joy if already ≥ 90), play (mini-game score 0-10 → joy +5+3·score, xp +score, int up, −10 energy, needs 10), clean (hygiene 100), sleep/wake, train (−15 energy, −5 food, +2 str, +1 xp, needs 15), interact (+10 joy, 5-tick cooldown), habitat (move, gear button). Items boost: treat → feed +15 food +5 joy, toy → play +10 joy, soap → clean +5 health (auto-used when owned).
- **Evolve**: readiness = xp·(100+bonus)/need ≥ 100% (need 20 / 60 / 150) and not sick → Baby → Junior → Adult → Elder (Egg is pre-tier: hatch = create), health refilled. Bonus: habitat aura +20%, home habitat for the species +25%, int ≥ 50 +15%. Bigger sprite.
- **EF hook: care streak.** Consecutive happy ticks; best streak adds a premium to the listed value (`value ×(tier+1)²·(1+best/100)`). TODO(solana): Magic Action after the evolve commit pays a streak bonus into the pet's earnings vault.
- **Roster** (max 8 pets + eggs): switch pets, each its own sim. Eggs hatch from the rail; "+" buys one (150 coins); DNA from session seed + counter (stands in for VRF). Run-away pets are released to free the slot.
- **Breeding**: two Adult+ pets, 50 coins, 30-tick rest each → egg with mixed DNA (`breed` copied from brawler `genes.ts`, adapted to 4 byte-genes, 20% mutation).
- **City**: jobs board, str/int gates, pet busy N ticks (keeps decaying), pays coins on return. TODO(solana): earnings vault.
- **Economy**: coins (soft) + gems (premium). Shop: treat/toy/soap for coins, Mystery Egg for gems. Quests: 3 seeded, claim all to roll a new set. 8 achievements with rewards. Leaderboard: your pets + seeded bots by level/value. Mini Games: Candy Tap + Reaction Rush (seeded). Name edit (pencil). Mood derived from stats.

## Integration
- `Chomp.onSession` → boot (seed → DNA, owner = wallet). `Chomp.ready()` at load.
- `Chomp.start()` on the first care action of a run. `Chomp.result({ winner, score: tier·1000+xp, tier, reason })` on **evolve** (`winner: "you"`) or **runaway** (`winner: "none"`).
- Stakes: free-only. Play score is client-reported (it's your own pet).

## Map
- Entry: `build/index.html` module script. Loop: `setInterval` 500 ms → `chain.tick(Date.now())`; `chain.js` turns real ms into whole ticks (`TICK_MS`), the only clock. Sim has no clock.
- RNG: `rng(session.seedU ^ playIndex)` for mini-game candy positions, `lookOf(dna)` for species/hue/name.
- Storage: `localStorage` in try/catch (works standalone, in-memory inside the portal sandbox).

## Chain (program/)
Real today: **base layer on devnet**. Pet PDA `["pet", owner, [idx]]`, idx < 8. Tick is lazy: `care`/`evolve` catch up decay from `Clock` (`TICK_SECS = 60`), nobody sends tick txs.

| ix | layer | does |
|---|---|---|
| `create_pet(idx, dna)` | base | init Pet PDA |
| `care(action, score, item)` | base (or PER) | owner only, catch up then 0 feed / 1 play / 2 clean / 3 sleep / 4 train / 5 interact / 6 habitat(score); item = boost |
| `tick` | base (or PER) | catch up only (client never sends it) |
| `evolve` | base | catch up + level up (fails if the pet is delegated) |
| `release` | base | close the Pet (rent → owner), frees the slot |
| `create_permission(idx)` | base, PER only | CPI `CreatePermission` (member = owner, AUTHORITY + TX_LOGS) |
| `delegate_pet(idx)` | base, PER only | `DelegatePermission` + delegate Pet to the TEE validator (remaining_accounts[0]) |
| `evolve_commit` | PER only | level up, `CommitAndUndelegatePermission` + `commit_and_undelegate` Pet |

Client (`build/chain.js`): real backend when `Chomp.tx` exists, `session.wallet` is set and we're in the portal iframe; else the in-memory mock (standalone, signed out, `smoke.mjs`). Boot fails over to the mock with a toast (e.g. no devnet SOL for rent ≈0.0015 SOL).
- Writes: `Chomp.tx` with hand-encoded Anchor ix (disc consts in `chain.js`), only on user actions: hatch → `create_pet`, care taps → `care`, evolve → `evolve`, release → `release`. Each action is pre-checked with `sim.js` (no fee for a doomed tx), then confirmed via `getSignatureStatuses` and re-read. Program errors (6000+) map back to sim error names.
- Reads: `Chomp.rpc('getMultipleAccounts')` on the 8 PDAs (`Chomp.pda`) at boot; between txs the client projects decay from the account's `last_ts` (same math as `catch_up`).
- Client-only (not on chain): coins, gems, items/shop, quests, achievements, jobs, breeding rest, eggs, names, leaderboard. Inside the portal sandbox `localStorage` throws, so this soft state resets per load. `st.t` (jobs/breeding clock) stays on the 2 s demo tick.
- Why not the PER: devnet TEE reads need an auth token (`getAuthToken` challenge signed by the wallet) on `devnet-tee.magicblock.app?token=…`; the bridge's `rpc {er:true}` goes to the plain ER endpoint without a token, so the iframe can't read a private pet. To enable: bridge carries the TEE token, then `create_permission` + `delegate_pet` after create, care via `Chomp.tx(..., {er:true})`, `evolve_commit` instead of `evolve`.
- Known gaps: DNA is client-chosen (TODO VRF), item boost + play score are client-reported, one wallet popup/tx fee per care tap unless the portal wallet auto-signs (TODO session keys).

## Done checklist
- [x] License OK, `LICENSE` in `build/`
- [x] No external network calls
- [x] Features added
- [x] SDK events fire (ready/start/result)
- [ ] `/play/pet-den` loads in the portal (main agent)
