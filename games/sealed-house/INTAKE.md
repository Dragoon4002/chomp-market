# Intake: Sealed House

Pitch: Storage Wars on Solana. Each lot is a sealed vault whose contents MagicBlock VRF rolled. You get three hints, seal one bid against three rival collectors, and the highest bid opens the vault. Sell the loot back at 90% or keep it.
Demo moment (10s): a 13 kg vault shows an Old Tonic and ✨✨. The bids flip: Moxie wins at 434, the vault opens to a Canopic Jar and a Lifesteal Token worth 410 listed, so Moxie overpaid.

## Layout
- `game.json`: `engine: html5`, `entry: index.html`, `settle: result`, `thumb: art/chest.svg`.
- `src/`: none. Plain JS, so `build/` is the source.
- `build/`: `index.html` (UI + SDK wiring), `game.js` (pure logic, mirrors the Rust), `chain.js` (chain adapter: real devnet program in the portal, mock otherwise), `chomp-sdk.js` (standalone copy), `art/`, `smoke.mjs`, `LICENSE`.
- `program/`: standalone Anchor crate. It has its own empty `[workspace]`, so it isn't in the root workspace. Its `Cargo.lock` pins the anchor macro crates to `=1.0.2`. Build: `cargo build-sbf` → `program/target/deploy/sealed_house.so` (deployed by `scripts/devnet-setup.sh` with `.keys/sealed_house.json`). `program/devnet.mjs`: `init_house` if missing + one real solo lot with a throwaway wallet.

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
- Stakes: no portal stake. Signed in, every lot is real devnet SOL (1 coin = 10,000 lamports, 💰1000 = 0.01 SOL). The reported score is still the client bankroll; the wallet's lamport delta is the verifiable version.

## Map
- Entry: `build/index.html` module script.
- Loop: `newLot` → `seal` → `chain.revealAndSettle` → `openVault` → `nextBtn` (sell back) → `finish`.
- RNG: only `game.js` `Rng` (splitmix64), seeded from `Chomp.session.seed`. Its output for a given seed is identical to `program/src/logic.rs` (vector asserted on both sides: `contents(42)`).
- Input: DOM range/number/buttons. Score/end: `finish()`. Network: only via `Chomp.tx` / `Chomp.rpc` / `Chomp.pda` (portal bridge) when signed in. No localStorage.
- Time: `setTimeout` for reveal animations (`?fast` zeroes them). On chain the bid clock = the lot's commit window (Clock sysvar read via RPC); game logic never reads the clock.
- Chain (`build/chain.js`): `chainFor(session)` picks `solanaChain` when `session.wallet`, `Chomp.tx` and `session.programs.sealedHouse` exist, else `mockChain` (standalone / signed out / `smoke.mjs`). Hand-encoded Anchor ixs (precomputed discriminators, fixed PDAs for house/fee/identity), accounts read with `getAccountInfo` base64.
- Solo flow per lot (5 lots, every one real): `create_lot` (player pays lot rent ≈0.0018 SOL + VRF fee ≈0.0005 SOL) → poll until the VRF `fill_lot` callback writes contents, hints and the 3 bot bids → `commit_bid` with deposit = whole bankroll (hides the bid) → wait for chain clock ≥ `commit_end` → `reveal_bid` + `settle` in one tx → `sell_back(mask)` if won. Pass = no commit. Sell-back failure (treasury low) keeps the items instead.
- Bots: computed on chain in `fill_lot` (`logic.rs bot_bids`, f64 ops in the same order as `game.js botBids`, parity vectors on both sides). Their max is the lot's reserve: the player wins only with a strictly higher bid (ties → house; the mock still uses the VRF tiebreak). Bots never move SOL.
- Remaining TODO(solana): NFT mint for kept items.

## Program (`program/`)
- Program id `FGYiydgg6XWauRUq9eyMwHFuwJjG5TM2ndLNQVEJjfR4` (`.keys/sealed_house.json`). House `D44FRx8KC8Pf5wHTBWgf9whN2HM5FtAsPWVo2KiHf9dk`, fee vault `AzSe4fuW6v58p3nr9cYjK477K8eWgsbRxJLwsFi2ZaXP`, VRF identity `89LYim3W5ZwUHzHDM6haGE22RoJ49UGoCrVnrqdr3bme`.
- Accounts: `House` PDA `["house"]` (authority, lot counter; its lamports are the buyback treasury), `FeeVault` PDA `["fee", house]`, `Lot` PDA `["lot", id_u64_le]` (138 bytes, adds `revealed: u16`, `bots: [u64; 3]`), `Bid` PDA `["bid", lot, bidder]`.
- Instructions:
  - `init_house(fund)`
  - `create_lot(commit_secs, reveal_secs, client_seed)`: anyone (payer). Base-layer VRF request with `#[vrf]`, `DEFAULT_QUEUE` `Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh` (live on devnet, oracle fulfilling). Accounts: payer, house, lot, oracle_queue, system_program, program_identity, vrf_program, slot_hashes. Client uses 25 s commit / 20 s reveal.
  - `fill_lot(randomness)`: `#[vrf_callback]` (signer must be the scoped VRF identity PDA `["identity", program]` of the VRF program, declared as a const `VRF_IDENTITY`: the macro's default derives it at runtime ≈1.1M CU and the oracle's callback runs out of compute; now ≈7k CU), writes contents, hints and bot bids, opens the commit window
  - `commit_bid(commitment, deposit)`: escrows lamports in the Bid PDA
  - `reveal_bid(amount, salt)`: checks `sha256(amount_le ‖ salt ‖ bidder)`
  - `settle()`: permissionless, after `reveal_end` or as soon as every bid is revealed (after `commit_end`). Takes every `[bid, bidder]` pair as remaining accounts and closes all Bid PDAs. Top revealed bid must beat the bot reserve.
  - `sell_back(mask)`
- Pure logic in `logic.rs`: `contents`, `estimate`, `bot_bids`, `winner`, `split`, `buyback`, with `cargo test` unit tests.
- Verified on a local validator (VRF program + queue cloned from devnet): `init_house`, `create_lot` (VRF CPI) ok; with a preloaded filled lot: commit → reveal + settle → sell_back, lamports match (house +95% of bid − buyback).

## Done checklist
- [x] License OK, `LICENSE` kept in `build/`
- [x] No external network calls
- [x] Features added
- [x] SDK events fire (smoke host page checks ready → match:start → match:result)
- [ ] `/play/sealed-house` loads in the portal (main agent runs portal tests)
