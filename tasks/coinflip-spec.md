# Coinflip spec (game id `coinflip`): backend handoff

Client + coin art done (`games/coinflip/client`, `games/coinflip/art`). Backend not started. This file = everything needed to build it in a fresh session. Plan/progress: `tasks/todo.md` § "New game: Coinflip".

## Rules (decided with user, 2026-11-15)
- Host picks side (0 = Heads, NEAR mark / 1 = Tails, plain coin) + stake (0 = free) -> room = platform match.
- Guest joins, takes other side. Nobody joins in 60 s -> house bot joins (free AND staked rooms).
- House bot = brawler referee account `referee.v2.brawler-platform-5c8e2b.testnet` (has FullAccess key, verified). Bot skips a room when its platform balance < 2 NEAR or < stake.
- Both seated -> 3 s countdown -> flip. Random 0/1 comes from the contract (`env::random_seed()`), not the server.
- Client animates coin from host side (start) to result (end): 4 cases 0->0, 0->1, 1->0, 1->1. Already built.
- Winner gets 2x stake minus platform fee (`fee_bps`, default 10). Payout lands via platform `claim(match_id)` (credits balance).
- No spectator betting (`bettable=false`), no tournaments, no NFTs.

## Randomness
- `env::random_seed()`: 32 bytes, block producer signs prev block hash -> deterministic + verifiable. Docs: https://docs.near.org/smart-contracts/security/random
- Docs rule: bet and resolve in different blocks. Here enforced by flip requiring `now_ms >= started_ms + 3000`.
- Known risk (accepted, testnet): block producer can predict/skip seed (docs: validator win odds 1/2 -> 3/4).

## Platform contract (unchanged): `contracts/platform/src/lib.rs`, id `PLATFORM_ID` in `packages/platform/index.ts` (`v2.brawler-platform-5c8e2b.testnet`)
Used:
- `create_match(game, stake, bettable, monster_id)` 1 yocto -> match id. `join_match(match_id, monster_id)` 1 yocto. `cancel_match(match_id)` host, Open only.
- `report_result(match_id, winner: Option<u8>, kos: Option<[u8;2]>, tape_hash: Option<String>)`: only game's `referee_id`, Live only, tape_hash = 64 lowercase hex.
- `get_match(match_id) -> MatchView {id, game, host, guest, stake, status, winner, created_ms, started_ms, tape_hash, ...}` (status strings `open`/`live`/settled/refund, see `lib.rs` ~line 965).
- `list_matches(from, limit, game)`, `balance_of(account_id)`, `claim(match_id)`, `expire(match_id)` (anyone, 2 h).
- `register_game(game, referee_id, assets_id)` owner only, 3 args.

## 1. Coin contract `games/coinflip/contract/` (NEW, ~80 LOC, near-sdk like `games/brawler/contract`)
Registered as coinflip's referee: `register_game("coinflip", <coin contract id>, None)`. So platform needs no change.

State: `platform: AccountId`, `sides: LookupMap<u64, u8>`.

| fn | who | does |
|---|---|---|
| `new(platform)` | init | |
| `set_side(match_id, side: u8)` | host | side <= 1. Promise `platform.get_match` -> `on_side(match_id, side, caller)`: require game=="coinflip", host==caller, status open, side not set yet. Store. |
| `flip(match_id)` | anyone (client, bot) | Promise `platform.get_match` -> `on_flip(match_id)` |
| `on_flip` (private) | callback | require game=="coinflip", status live, `block_timestamp_ms >= started_ms + 3000`. `seed = env::random_seed()`, `r = seed[0] & 1`, `side = sides.get(id).unwrap_or(0)` (unset = heads), `winner = if r == side {0} else {1}`. Call `platform.report_result(id, Some(winner), None, Some(hex(seed)))`. Remove side entry. |
| `get_side(match_id) -> Option<u8>` | view | lobby shows host side |

- Double flip: second `report_result` fails on "Match not live" -> harmless, no extra state.
- Gas: `flip` ~100 Tgas total (view 5, callback ~60 incl. report_result).
- Result face for clients: `parseInt(tape_hash.slice(0, 2), 16) & 1`. Seed public on-chain = proof.
- Tests (`cargo test`, unit with `testing_env!`): winner mapping 4 cases (side x r), unset side = heads, flip before 3 s rejected, not-live rejected, wrong game rejected, set_side by non-host / twice rejected.
- Root `Cargo.toml`: add `games/coinflip/contract` to `exclude` (wasm toolchain), like brawler.

## 2. Bot server `games/coinflip/server/` (NEW Rust crate `coinflip-server`, no HTTP, worker loop)
Deps: tokio, serde_json, near-svc only. Env: `NEAR_RPC CONTRACT_ID(platform) COIN_ID REFEREE_ID REFEREE_KEY`.
Loop every 5 s:
1. `list_matches(0, 50, "coinflip")`.
2. Open, `now - created_ms >= 60_000`, host != referee, `balance_of(referee) >= max(2 NEAR, stake)` -> `join_match(id, null)` with 1 yocto as referee.
3. Live, `now - started_ms >= 15_000`, no tape_hash -> `coin.flip(id)` (backstop; bot-joined rooms: flip right after join + 3 s).
4. Settled + referee was seat winner + not claimed -> `claim(id)` (bot winnings back to pool). Check `claimable(id, referee)` view.
- Pure decision fn `fn act(m: &MatchView, now_ms, pool) -> Option<Action>` + one `cargo test` over its cases (age, pool < 2 NEAR, stake > pool, own match, live stale).
- ponytail: polling, no ws; stateless (restart-safe, everything read from chain).

## 3. near-svc change `crates/near-svc/src/lib.rs`
- `call_now` / `send` need attached deposit for `join_match` (1 yocto). Add `deposit: u128` arg (`.deposit(NearToken::from_yoctonear(deposit))` on the tx). Update existing callers to pass 0: `games/brawler/server/src/game.rs`, `games/ribbon/server/src/lib.rs` (unjoin). (keyfall has none).
- `Near::send` signs with contract = `self.contract` (platform). `coin.flip` needs a different receiver: add `receiver: Option<&str>` or a second `Near` with `contract = COIN_ID`. Laziest: second `Near` instance.
- Risk: brawler server signs with the same referee key concurrently -> nonce clashes. Existing 5x retry covers it; if not, add a second FullAccess key to referee for the bot (ask user).

## 4. Client changes `games/coinflip/client/src/lib/api.ts` (live impl only; demo stays)
- Drop server calls (`SERVER_URL`, `/room`, `/rooms`, `/flip`, NEP-413 `auth`), drop `commit`/`clientSeed` from `Room`.
- `createRoom`: `create_match` then `coin.set_side(id, side)` (2nd wallet tx, 100 Tgas, no deposit).
- `listRooms`: `list_matches` + `coin.get_side` per open match.
- `watchRoom`: poll `get_match`; when live and `now >= started_ms + 3000` and I'm seated -> call `coin.flip(id)` once. Result = tape_hash first byte & 1. Then prompt/auto `claim(id)` for winner.
- `RoomView` already does 3 s countdown + start->end animation; use `started_ms` instead of local `liveAt` if clocks agree.
- Result screen `Reveal` (App.tsx): replace commit/verify line with "random seed <tape_hash> · tx link" (nearblocks testnet).
- Need `COIN_ID` const (`NEXT_PUBLIC_COIN_ID`). `@xyz/platform` `p.call`/`p.view` hardcode `PLATFORM_ID`; for coin use `p.w.callFunction({contractId: COIN_ID, ...})` / `p.w.viewFunction` directly (no platform pkg change).

## 5. Wiring (other sessions edit these too: append small hunks only)
- Root `Cargo.toml`: member `games/coinflip/server`, exclude `games/coinflip/contract`.
- `Makefile`: `test` + `cd games/coinflip/contract && cargo test`; `wasm` + coin contract build; `push-image` add image.
- `infra/coinflip-server.Dockerfile` (copy keyfall's), `infra/compose.yml` service (no port, env above). No Caddy route (no HTTP).
- `market/lib/assets.ts` `GAMES` entry `{ id: "coinflip", name: "Coinflip", url: NEXT_PUBLIC_COINFLIP_URL || ... }`.
- README: table row + short Coinflip section.

## 6. Needs user OK first (txs/deploys)
1. Create + deploy coin contract account (e.g. `coinflip.<platform owner>.testnet`), `new(platform)`.
2. `register_game("coinflip", <coin id>, null)` on platform (owner key).
3. Referee deposit >= 2 NEAR into platform balance (bot pool).
4. Deploy bot server, client to Vercel, push.

## Verify (definition of done)
`cargo test --workspace`, `cd games/coinflip/contract && cargo test`, platform contract tests unchanged, `npm test`, client `?demo`, then testnet: create room -> wait 60 s -> bot joins -> flip -> settled, winner claim works.
