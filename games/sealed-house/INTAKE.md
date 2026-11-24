# Intake: Sealed House

Pitch: Storage Wars on Solana. Each lot is a sealed vault whose contents MagicBlock VRF rolled. You get three hints, seal one bid against three rival collectors, and the highest bid opens the vault. Sell the loot back at 90% or keep it.
Demo moment (10s): a 13 kg vault shows an Old Tonic and ✨✨. The bids flip: Moxie wins at 434, the vault opens to a Canopic Jar and a Lifesteal Token worth 410 listed, so Moxie overpaid.

## Layout
- `game.json`: `engine: html5`, `entry: index.html`, `settle: result`, `thumb: art/chest.svg`.
- `src/`: none. Plain JS, so `build/` is the source.
- `build/`: `index.html` (UI + SDK wiring), `game.js` (pure logic, mirrors the Rust), `chain.js` (mock chain adapter with `TODO(solana)` hooks), `chomp-sdk.js` (standalone copy), `art/`, `smoke.mjs`, `LICENSE`.
- `program/`: standalone Anchor crate. It has its own empty `[workspace]`, so it isn't in the root workspace. Its `Cargo.lock` pins the anchor macro crates to `=1.0.2`.

## Source & license
- URL: none, built from scratch. The sealed-auction design follows `magicblock-examples/sealed-auction` (MIT), but no code was copied from it.
- License: MIT (ours).
- Art: copied, not imported, from `games/tomb-delve/build/art/{relics,items,chests}` and `games/brawler/client/public/skills/` (both ours, MIT). `art/egg.svg` is new.
- Engine + version: vanilla ES modules + DOM/CSS. No deps, no build step.
- How to build to web: nothing to build. `build/` is served as is.

## Keep
- Tomb Delve's 5-tier relic ladder (common → legendary) and its chest art.
- Brawler skill-token icons, used as tradeable skill tokens.

## Strip
- n/a (from scratch).

## Add features
- Lot = sealed vault with 3–7 items. Tier odds per slot: 60 / 25 / 10 / 4 / 1 %. Listed values: 10 / 30 / 90 / 300 / 1500.
- Three hints, all derived from the same seed:
  - weight: junk is heavy, gems are light, plus jitter
  - item #0 shown face up
  - glow count: number of items that are rare or better
- Sealed bids use **commit-reveal**. Why not PER: commit-reveal runs on the base layer with plain Anchor. It needs no TEE auth token, no permission accounts and no delegation, and judges can verify it from the program alone. The escrowed deposit (≥ bid) leaks only an upper bound; overfund it to hide the bid. PER is the upgrade path if that leak matters.
- Highest bid wins. Ties are sorted by bidder key, then picked by VRF bytes 8..16. Unrevealed bids can't win and forfeit their deposit to the fee vault.
- Payment: 95% of the winning bid goes to the House treasury (which funds buybacks) and 5% to the fee vault. The winner sells items back at 90% of listed value or keeps them.
- Solo play: 3 seeded bot bidders (cautious 0.45, sharp 0.6, bold 0.72 × hint-based estimate × 0.7–1.3 noise). They read the same hints as the player. Tuning check (4k lots): a player bidding ~0.7× estimate wins ~34% of lots at +15 EV/lot, while 1.0× estimate wins every lot and loses money.
- Session: 5 lots, 💰1000 start. Score = final bankroll + kept items at buyback value.

## Integration
- Load SDK: `<script src="/chomp-sdk.js"></script>` (copied into `build/` for static serving).
- `Chomp.onSession`: the session goes into `session`. Standalone falls back to `?seed=` after 300 ms. `baseSeed(seed)` → lot i randomness = splitmix64(base + i) → [contents seed, tie seed]. This stands in for the VRF bytes.
- `Chomp.ready()`: at the end of the module script.
- `Chomp.start()`: on the Start click.
- `Chomp.result({ winner: 'you'|'house', score, tapeHash })`: in `finish()` after lot 5. `tapeHash` = fnv64 of the seed plus each lot's `{bid, keep}`.
- Stakes: free-only for now (client result trusted). For a verifiable version, move to the program: each lot settles on chain, so the score is the wallet's lamport delta.

## Map
- Entry: `build/index.html` module script.
- Loop: `newLot` → `seal` → `chain.revealAndSettle` → `openVault` → `nextBtn` (sell back) → `finish`.
- RNG: only `game.js` `Rng` (splitmix64), seeded from `Chomp.session.seed`. Its output for a given seed is identical to `program/src/logic.rs` (vector asserted on both sides: `contents(42)`).
- Input: DOM range/number/buttons. Score/end: `finish()`. Network/storage: none. No localStorage.
- Time: `setTimeout` is used only for reveal animations (`?fast` zeroes them). Logic never reads the clock.
- Chain hooks (`TODO(solana)` in `build/chain.js` and `program/src/lib.rs`): VRF `create_lot`/`fill_lot`, escrow `commit_bid`, `reveal_bid` + `settle` crank, `sell_back`, and an NFT mint for kept items.

## Program (`program/`)
- Accounts: `House` PDA `["house"]` (authority, lot counter; its lamports are the buyback treasury), `FeeVault` PDA `["fee", house]`, `Lot` PDA `["lot", id]`, `Bid` PDA `["bid", lot, bidder]`.
- Instructions:
  - `init_house(fund)`
  - `create_lot(commit_secs, reveal_secs, client_seed)`: base-layer VRF request with `#[vrf]`, `DEFAULT_QUEUE`
  - `fill_lot(randomness)`: `#[vrf_callback]`, writes contents and hints, opens the commit window
  - `commit_bid(commitment, deposit)`: escrows lamports in the Bid PDA
  - `reveal_bid(amount, salt)`: checks `sha256(amount_le ‖ salt ‖ bidder)`
  - `settle()`: permissionless. Takes every `[bid, bidder]` pair as remaining accounts and closes all Bid PDAs.
  - `sell_back(mask)`
- Pure logic in `logic.rs`: `contents`, `winner`, `split`, `buyback`, with `cargo test` unit tests.

## Done checklist
- [x] License OK, `LICENSE` kept in `build/`
- [x] No external network calls
- [x] Features added
- [x] SDK events fire (smoke host page checks ready → match:start → match:result)
- [ ] `/play/sealed-house` loads in the portal (main agent runs portal tests)
