# Platform contract

One NEAR balance per player, shared by every game. Matches, spectator order books, tournaments keyed by `game`.
Source `platform/src/lib.rs`, tests `platform/src/tests.rs`.

```sh
cd platform
cargo test
cargo near build non-reproducible-wasm  # -> target/near/arena.wasm
```

Init `new(owner_id)`. v3 is a fresh deploy (state layout changed, no migration from v2): `node scripts/deploy-platform-v3.mjs`
(balance preflight first, exits with the exact shortfall and no tx if short), rewire with `node scripts/wire-platform.mjs`.

## Balance
- `deposit()` attach NEAR -> balance. `withdraw(amount)` -> transfer, re-credited if transfer fails. `balance_of(account_id)`.
- Stakes, orders, entry fees debit balance; results, claims, refunds credit it. Never per-match transfers.
- Spend calls (`create_match`, `join_match`, `place_order`, `enter_tournament`) need exactly 1 yocto attached:
  wallet confirm, fn-call keys can't spend.

## Games
- Owner `register_game(game, referee_id, assets_id?, referee_key?)` (1 yocto, upsert). `get_game(game)`, `list_games()`.
- `referee_key` = ed25519 public key whose attestations `settle` accepts. Rotate: `set_referee_key(game, key?)` by owner (1 yocto) or the referee.
- `referee_id` alone may `report_kos` / `report_result` / `unjoin` that game's matches (tournament matches inherit tournament's game).
- `assets_id`: optional NFT contract w/ `lock(token_id, account_id, until_ms)`, `unlock(locks)`, `record_result(...)`,
  `add_title(token_id, title)`. Brawler -> monsters contract. No assets -> monster ids rejected.

## Match flow
1. Host `create_match(game, stake, bettable, monster_id?)`. Any room can be bettable (free or staked), no house money. Monster: lock first (attach >= 100 Tgas), `on_create` opens or re-credits.
2. Guest `join_match(match_id, monster_id?)`: debits same stake, Live.
3. Result, either:
   - **`settle(match_id, winner | null, kos, tape_hash, signature)`, anyone, no deposit, 100 Tgas.** `signature` = base64 ed25519 by the game's
     `referee_key` over sha256 of the utf8 message
     `<game>-settle|<platform account id>|<match_id>|<winner 0/1 or none>|<k0>,<k1>|<tape_hash>`
     e.g. `brawler-settle|v3.brawler-platform-5c8e2b.testnet|12|0|3,1|9f86…0a08`. Only Live matches (replay -> "Match not live"), bad sig -> "Bad signature".
     Same message built in `games/brawler/server/src/referee.rs` (shared test vector in both test suites).
   - referee `report_result(match_id, winner | null, kos?, tape_hash?)` (fallback, the game server sends it after SETTLE_FALLBACK_S unsettled).
   Both: tape_hash = 64-char lowercase sha256 hex (in MatchView), winner's balance credited 2×stake − 0.1% at once (void: stakes back), book closes, tournament bracket advances.
4. Guest joined but fight never started: referee `unjoin(match_id)` refunds guest, reopens (rejected once the book has fills: void instead).
5. `cancel_match` (host, Open) / `expire` (anyone, 2 h) void and credit stakes.

## Spectator order book (per match, while Open/Live, players excluded)
- Binary shares: side 0 = seat 0 wins, side 1 = seat 1 wins. Face value `UNIT` = 0.01 NEAR; a share at `p` bps costs p × 1e18 yocto.
- `place_order(match_id, side, price_bps 1..9999, qty)` (1 yocto, 100 Tgas) -> `{id | null, filled, cost}`: bid for `qty` shares.
  Matches resting bids on the other side with prices summing >= 10000, best first then oldest, at the maker's price
  (taker pays 10000 − maker price, keeps the improvement); at most 20 fills per call; own orders are skipped (never self-match);
  remainder rests (max 100 resting per side, "Book full"). Debits exactly fills + resting escrow. Max escrow per order `max_bet` (`set_limits`).
  Each fill mints one complete set (side-0 + side-1 share) backed by exactly UNIT: no house, no seed.
- `cancel_order(match_id, order_id)` refunds the unfilled rest while the book is open.
- `claim(match_id)` after the result: winning shares UNIT each − fee_bps (to treasury), void -> exactly what was paid, plus any unfilled escrow.
- Views: `get_book(match_id)` -> `[[[price_bps, qty]…], […]]` bids per side aggregated, best first (ask for side s = 10000 − best bid of the other side), empty once closed;
  `get_orders(match_id, account_id)`; `get_position(match_id, account_id)` -> `{shares: [n, n], paid: [yocto, yocto], open, claimed}`;
  `get_fills(match_id, limit ≤ 20)` newest first `{id, taker, maker, side, price_bps (taker's), qty, ms}`; `get_prices(match_id)` -> `[(ms, side-0 bps)]` per fill;
  `claimable(match_id, account_id)`; `config()` -> `{owner, fee_bps, max_bet, unit, treasury}`. MatchView `price_bps` = last fill (side 0), `collateral` = sets × UNIT, `fills`.

## Tournaments
- Owner `create_tournament(game, size 4|8, entry_fee, bettable)`. `enter_tournament(id, monster_id)` (1 yocto, >= 150 Tgas),
  24 h entry window, monster locked 72 h. Full -> bracket of zero-stake Live matches (book open if bettable); void/expired -> seat with more reported KOs advances, tie -> seat 0 (lower entrant index).
- `claim_tournament(id)`: champion pot − 0.1%; `cancel_tournament(id)` after 24 h unfilled -> fees back.
- Views `get_tournament`, `list_tournaments(from, limit, game?)`, `list_matches(from, limit, game?)` (newest first, filter scans newest 500).

## Trust
- Results come only from the referee key (signature or referee account). Give the referee account a fn-call key scoped to `report_kos`, `report_result`, `unjoin`, `set_referee_key`.
- Owner calls need 1 yocto (full-access key).
- Market can't be drained by colluding players: players can't trade their own match and every share is paid for by a counterparty.
- Storage for balances, matches, orders paid from contract balance; add storage deposits before mainnet.
