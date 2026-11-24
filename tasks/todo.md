# brawler_arena base battle

- [x] Scaffold Vite + TS + Canvas2D
- [x] Deterministic sim (states, moves, hits, KO, stocks) + node:test suite
- [x] Bone rig + poses + FX + HUD + camera
- [x] Input (2 keyboard sets + gamepads, tap latch)
- [x] Lockstep netplay + ws relay + menu
- [x] README

## Review
- `npm test` 7/7, `tsc --noEmit` clean, `vite build` ok.
- Headless Chrome: local match renders, attacks/swoosh/hitboxes visible.
- Two-browser online match 15 s random inputs: no desync, same stocks both sides.
- KO thresholds (dummy, side/top KO): sHeavy ~120% center / ~70% edge, nHeavy ~120%, dHeavy ~150-190%.
- Next: NFT stats → `Stats`/`Look`, rollback if latency hurts, deploy relay.

# Perp betting cards (plan: ~/.claude/plans/parallel-popping-peach.md)
- [x] Contract: AMM buy/sell, house seed, positions, history, claim/refund, views
- [x] Contract tests (conservation settle A/B/refund, slippage, guards, history cap, failed sell)
- [x] near.ts + demo.ts API
- [x] Watch: FighterCard x2 + PriceChart, Claims -> positions
- [x] CSS: canvas + cards column / phone stack
- [x] tsc, npm test, demo screenshots + playwright flow
- [x] Deploy v2 + testnet run (v2.brawler-platform-5c8e2b.testnet, see contracts/DEPLOYMENTS.md; buy-only AMM, no sell)

## Review (perp)
- cargo test 28/28 (conservation settle A / B / refund within 100 yocto dust, slippage, guards, history cap, failed sell -> owed), wasm builds, 0 warnings.
- tsc clean, npm test 22/22.
- Demo 1280x800 + 390x844: cards match sketch, chart splits green/red at even line, HUD clear, phone stage sticky.
- Playwright: max/min/empty validation msgs, Long/Short/Close msgs on clicked card.
- draw.ts canvas now fits parent (ResizeObserver) so watch column doesn't overlap.
- Pending: deploy v2 + fund treasury + referee FC key + testnet run (needs user OK).

# Economy: NFTs, provenance, market, breeding, rentals, seasons + tournaments (spec: tasks/economy-spec.md)
- [x] W1 monsters contract (opus)
- [x] W1 arena: monster hooks + tournaments (opus)
- [x] W1 data layer near.ts/nft.ts/demo (sonnet)
- [x] W1 referee/relay: chain DNA, per-seat KOs, tournament rooms (sonnet)
- [x] W2 UI screens (sonnet)
- [x] W3 review (opus) + cargo test x2, tsc, npm test, demo check
- [x] Review fixes: random void advance, lock lengths 5h/72h + 24h entry window, owed map, O(1) season end, tournament-only season wins, NEP-413 seat auth, 5 min no-show forfeit
- [x] Deploy monsters + arena v3 to testnet (seed 1 NEAR, treasury 4 NEAR); smoke: hatch, create+cancel lock/unlock ok

## Review (economy)
- arena cargo test 46/46, monsters 44/44, both wasm 0 warnings. tsc clean, npm test 30/30, vite build ok, server boots.
- Demo screenshots of all new routes at 1280x800 + 390x844 (scratchpad).
- Not tested: real wallet signing, live cross-contract calls, end-to-end tournament on testnet.
- Known/deferred: relay reconnect mid-match; bettable 0-stake spam drains treasury seed (pre-existing); random_seed bias by block producers (testnet ok).

# Multi-game refactor (plan v2, not started)

## Target layout (grouped per game)
```
market/                 # xyz.com vite app: game list, wallet, balance, deposit/withdraw
games/brawler/
  client/               # vite app (current src/) -> brawler.xyz.com
  server/               # rust ws svc: relay + lobby + referee
  sim/                  # rust crate: sim port + genes, no near deps
  contract/             # monsters NFT contract (from contracts/monsters)
packages/platform/      # ts: wallet hooks, platform contract calls, balance hook. used by market + every client
crates/near-svc/        # rust: near-api wrapper: view, NEP-413 verify, per-match referee tx queue. reused by every game server
contracts/platform/     # arena generalized
Cargo.toml              # workspace: games/*/server, games/*/sim, crates/*. contracts excluded (wasm toolchain)
package.json            # npm workspaces: market, games/*/client, packages/*
```

## Phases
- [ ] P1 move: git mv into layout, no logic change. tests + builds green.
- [ ] P2 platform contract (from arena):
  - deposit/withdraw/balance_of; stake/bet/entry fee debit balance, payouts credit it
  - Match/Tournament get `game`; `register_game(game, referee, assets: Option<AccountId>)` owner only
  - assets contract = current ext_monsters iface (lock -> Dna, unlock, record_result, add_title), per game instead of global
  - port + extend tests (conservation w/ balances); fresh testnet deploy
- [ ] P3 rust sim + golden test:
  - sim crate: port sim.ts/moves.ts/stages.ts; genes from monsters genes.rs (split near derive out, contract re-exports)
  - scripts/golden.ts dumps per-frame fighter fields for N seeded tapes -> games/brawler/sim/testdata/golden.json
  - cargo test: bit-exact every frame
  - traps: JS Math.round (half -> +inf) != f64::round, use (x+0.5).floor(); `|0`/Math.imul/>>> -> i32/u32 wrapping ops; client hash() stays TS-only
- [ ] P4 rust brawler server (tokio + axum ws): same protocol as server/relay.ts. referee via crates/near-svc. delete server/.
- [ ] P5 market app + packages/platform; brawler client reads balance from it, deposit links to xyz.com.
- [ ] P6 deploy: market + brawler client static (vercel), brawler server -> ws.brawler.xyz.com.
- [ ] comments caveman-trimmed per file as moved.

## Design calls
- Unified payment = balance in platform contract. one source of truth, no sync/custody. ponytail: no off-chain payment svc until fiat/offchain credits.
- One platform contract; new game = register_game + rust server (+ optional assets contract w/ same 4 methods).
- Subdomains: each origin = own wallet connect (near-connect localStorage per origin). accepted cost.
- Rust over Go: NEAR has no official Go SDK (community, stale); official rust `near-api` crate covers view, signed fn calls, NEP-413 verify. reuse genes.rs. one backend lang w/ contracts.

# Gen-1 SVG character art (v2: monster-folk humanoids, weapon from tail gene)
- [x] render/parts.ts: SVG path part library (limbs, torso, skull/jaw, 4 horns, 3 tails, 3 patterns, 4 eyes)
- [x] rig.ts drawMonster -> Path2D parts, cel rim light/shadow, ink outline, blink
## Review
- npm test 30/30; no tsc errors in render/ (pre-existing refactor errors elsewhere). Variant sheet screenshot ok.

# Godot fight client at /godot (plan, not started — awaiting OK)
Goal: Godot 4 web export served at `/godot`, playing same fights as web client. Original gen-1 monster-folk art only.
Layout: project `games/brawler/godot/` -> export (single-threaded, no COOP/COEP) to `games/brawler/client/public/godot/`.
- [ ] 0. Install Godot 4.4.1 stable + web export templates to ~/.local (one-time ~1 GB download, needs OK)
- [ ] 1. Scaffold project.godot, 1280x720 stretch, web export preset (threads off), npm script `godot:build`
- [ ] 2. Port sim (sim.ts, moves.ts, stages.ts) -> GDScript. Parity test: TS dumps seeded random-input replay + per-frame state hash; `godot --headless` replays, must match every frame (keeps referee + cross-play valid)
- [ ] 3. Art: script exports parts.ts paths -> .svg files (white base, tinted per DNA via modulate); Node2D bone tree; port pose tables + poseFor/attack tweening
- [ ] 4. Stage platforms/backdrop (3 stages), camera follow/zoom, shake, hit sparks, HUD (hp, stocks)
- [ ] 5. Input: same keymap (WASD+Space/Z/X/C, arrows+numpad) + gamepads
- [ ] 6. Modes: local hot-seat; online via relay WebSocket (relay-only lockstep, `go p2p:false`; WebRTC later)
- [ ] 7. Embed contract: URL params / postMessage in (room, seat, dna x2, stage, relay URL); result postMessage out. React wallet/claims untouched
- [ ] 8. Hosting: Vite serves public/godot; `/godot` -> `/godot/` redirect; long cache on .wasm/.pck
- [ ] 9. Verify: parity test green, export builds, Chrome screenshot /godot, local match, 2-window online match vs web client
Est: ~1-2 days of sessions.

## Godot v1 progress (games/brawler/godot)
- [x] data.json from TS source (moves, stages, SVG parts, 8-fighter gen-1 roster) via tools/export-data.ts
- [x] svgpath.gd (SVG subset -> polygons), sim.gd (port of sim.ts), rig.gd (poses + cel-shaded parts), game.gd (loop, input, camera, stages, fx, HUD, menu, wallet buttons)
- [x] /godot React page + near_bridge.gd postMessage bridge (tested with stub in demo mode)
- [x] Headless: 1800 frames random demo fight, 0 runtime errors; rendered fight + menu frames checked
- [x] `npm run godot:build` (GODOT=<binary>) -> client/public/godot/game/
- [x] Web templates installed (nothreads only); export builds; /godot boots game in Chrome, in-game Connect + Create room round-trip via bridge (demo)
- [ ] Online play, TS<->GD sim parity test, real-wallet test

## Image heroes (web): cutout rig vs sprite sheet (lortor, torfen)
- [x] Cutout rig: Blender cut (games/brawler/sprites/cutout/cut.py + <hero>.json) -> client/public/chars/<hero>/cutout/; render/cutout.ts drives parts with rig.ts poses; `?p1=lortor&p2=torfen`
- [x] Verified: all poses + attack strikes (scratch gallery), demo bot fight renders
- [x] Sprite sheet (Blender mesh-deform renders, sprites/build.py, render/sheet.ts) -> client/public/chars/<hero>/sheet.*; `&style=sheet`
- [ ] User picks preferred style

## Art stages + heroes as defaults (staging)
- [x] Merge origin/main into staging (Arena.tsx conflict resolved)
- [x] Stage geometry from painted art: stages.ts + sim/src/stages.rs, golden regen, sim/server/client tests green, godot data.json re-exported
- [x] Art is default render (fight, thumbnails, backdrops); procedural fallback while loading; grove keeps procedural sky (needs platform-free bg)
- [x] Heroes from DNA (5 equal hue bands) in fights + portraits; cutout rig default; ?p1/?p2/&style=sheet debug only
- [x] Bot follows stage solids (crosses grove gap)
- [ ] Godot visuals still procedural (geometry synced only)

# Game 2: Ribbon Rush (`ribbon`), grid trail racer (plan, awaiting OK)

## Game
- 2 riders, 48x32 grid, 15 Hz tick. Each tick: move 1 cell, leave trail. Hit wall/trail/other rider = crash.
- Twist (original): trail cells fade after 90 ticks (6 s). After 20 s, walls close in 1 ring per 5 s, so every round ends.
- Input: absolute dir (no 180 reversal). One boost/round = 2 cells/tick for 15 ticks.
- Both crash same tick = draw round, replay. Best of 3 rounds. `kos[i]` = rounds seat i won.
- Fixed spawns, no RNG, integer-only state, so TS/Rust parity is trivial.

## Fit to platform (no contract change)
- `register_game("ribbon", referee, None)`. 3 args, no `referee_key` param (prompt was wrong). No assets contract, no `monster_id`, so zero cross-contract calls.
- No tournaments (contract always locks a monster for them). Staked + bettable matches work.
- Lobby = chain `list_matches(game:"ribbon")`. No server lobby.
- Auth: NEP-413 msg `ribbon:<matchId>` via `near.verify_auth`. Server checks `get_match`: Live, game=="ribbon", accounts == host/guest.
- Settle: server `report_result{winner, kos, tape_hash}`. `tape_hash` = sha256(u8 dirs per tick, both seats).
- Forfeit: seat silent 10 s → other wins. No-show 5 min after Live → void (`winner:null`). Guest leaves pre-start → `unjoin` (brawler rule).

## Netcode
- Server-authoritative. Server runs Rust sim and broadcasts `tick{n, d:[d0,d1]}`. Clients replay same TS sim for render. Watchers get same stream.
- ponytail: no lag comp/prediction. 15 Hz grid tolerates ~100 ms. Add client prediction if it feels laggy.
- Protocol (JSON `{t}`): c→s `auth{matchId,account,auth}`, `watch{matchId}`, `dir{d}`, `boost`. s→c `hello{nonce}`, `start{seat,at}`, `tick{n,d}`, `round{n,score}`, `over{winner,kos,reason}`, `error{msg}`.

## Layout
```
games/ribbon/
  sim/      rust crate ribbon-sim (~150 LOC) + tests/golden.rs
  server/   rust crate ribbon-server (axum ws, near-svc) ~400 LOC + tests/match.rs
  client/   Next.js @xyz/ribbon: canvas, sim.ts (TS twin), lobby/create/join, ?demo bot
```
- No contract/. No shared server crate extracted yet. ponytail: brawler rooms are tangled with DNA/stage. Extract when game 3 lands.

## Tasks (parallel agents after OK; sim API + protocol above are the contract between them)
- [x] A1 sim: `ribbon-sim` Rust + `client/src/sim.ts` twin + `scripts/ribbon-golden.ts` → `sim/testdata/golden.json` + cargo golden test + node:test
- [x] A2 server: ws, auth, tick loop, referee, forfeit/no-show/unjoin, `/tape/<id>`; integration test (2 ws clients play to end, no referee env)
- [x] A3 client: Next app, wallet via @xyz/platform, open matches list, create/join (stake, bettable), sign NEP-413, play canvas, watch, `?demo` local bot (no wallet/server)
- [x] A4 wiring: root Cargo members, Makefile test/wasm (wasm unchanged, no contract), `infra/ribbon-server.Dockerfile`, compose service, Caddy `ribbon.{{domain}}` → ribbon-server:8788, market GAMES list (2 entries replace BRAWLER_URL link), README rows + section
- [x] P client polish: ribbons+game feel (draw.ts), HUD, touch/mobile, home onboarding. tsc/test/build green, demo shots desk+mob (priority, user 2026-11-15); backend gaps (forfeit/no-show/chain auth tests) later
- [x] Title screen: art public/title.png (reference), hotspots on painted Play/How/Matches in % of image; wallet+gear real buttons clamped to viewport + modals: play/how/matches/settings; riders Cyan/Amber
- [x] Waiting room modal (chain poll -> play when live; fixes host-stuck-on-open client side) + room code join (Matches modal, ?room=<id> link)
- [x] 4-letter room codes (code.ts: affine scramble of match id, brawler alphabet, +test) + 20 s bot fill: cancel on chain (refund) -> unstaked practice vs bot
- [ ] A5 review fixes: med unjoin race, ?server phishing, no reconnect: ponytail-review + correctness review of money/referee path
- [ ] Verify: `npm test`, `cargo test --workspace`, contract tests, run client `?demo` + local server 2-tab match, screenshots
- [ ] (needs OK) testnet `register_game`, deploy, push

## Open questions
1. Name/id `ribbon` / "Ribbon Rush" ok?
2. Twist ok (fading trails + closing walls + 1 boost)?
3. Best of 3 ok?
4. Referee: reuse brawler referee account + key, or new?
5. Bots service (like brawler agents/)? Default skip, demo bot only.
6. Server URL: subdomain `ribbon.<domain>` ok?
7. No tournaments for ribbon ok?

# New game: Keyfall (id `keyfall`) — 1v1 typing duel (from reference/Windows TypewriterCommand)

## Reference (Unity build, read via strings)
Words ride enemies falling on city. Type word + submit = turret kills it. Bomb lands = city hp loss. Wrong word = strike, 3 strikes = full stun. Score + multiplier (quickdraw/lightning/multikill) -> **dropped**.

## Rules (1v1)
- 2 lanes, one per player. Same seeded word stream in both lanes (fair).
- 5:00 timer, server-owned, 10 Hz tick. 3 s countdown.
- Spawn interval ramps 3.0 s -> 1.0 s, fall time 9 s -> 5 s over match. Word len ramps 3-5 -> 5-9.
- Type word + Space/Enter. Exact match in your lane (lowest first) -> word dies, **opponent hp -= len**.
- Word hits your base -> **your hp -= len**.
- Wrong submit = strike. 3 strikes -> 2 s stun (input ignored). Kill clears strikes.
- HP 600 each. hp 0 -> lose. Both 0 same tick or timer end -> higher hp wins -> tie: higher WPM (correct chars) -> tie: draw (refund).
- WPM = correct chars / 5 / minutes elapsed. Server computes. Shown live both sides.
- All numbers = consts at top of game.rs / game.ts (tuning knobs).

## Trust
- Server authoritative: client sends only `{t:'type', w}`. Server owns spawns, hp, timer, winner. Rate limit 20 msg/s.
- Seat auth NEP-413 `keyfall:<matchId>` recipient PLATFORM_ID, nonce = server hello (near-svc `verify_auth`).
- Only server referee calls `report_result(id, winner|null, null, null)`. No contract change.

## Build
- [x] `games/keyfall/server/` Rust crate `keyfall-server`: main.rs (env, axum), lib.rs (rooms + ws), game.rs (rules + cargo test). Deps: axum/tokio/serde/near-svc only (no rand crate, xorshift).
  - ws: hello{nonce} -> host{name, matchId?, account?, auth?} -> room{code} | join{code,...} | watch{code}. Both in -> countdown -> 10 Hz `s` snapshots -> `over{winner, reason, hp, wpm}`.
  - on-chain: check get_match game=="keyfall", status, host/guest accounts match seats.
  - disconnect live: 15 s grace, `rejoin{code, account?, auth?}` re-seats; else opponent wins.
- [x] `words.txt` (~800 own-picked common words) in `games/keyfall/client/public/`; Rust `include_str!` same file.
- [x] `games/keyfall/client/` Next.js, `@xyz/platform`. Screens: Title (Practice vs bot / Host / Join code) -> Match (my lane big, opp lane small, hp bars, WPM, timer, input box) -> Result.
  - DOM + CSS falling words, original look (no reference art).
  - Staked: `create_match('keyfall', stake, false, null)` / `join_match`, sign NEP-413, host/join with auth.
- [x] `lib/game.ts` TS port of rules for practice/`?demo` (local bot, set WPM + typo rate). No server, no wallet. node:test check.
  - ponytail: rules duplicated TS+Rust; demo never settles money so no golden test.
- [x] NEP-413 seat sign kept local in `games/keyfall/client/src/lib/chain.ts` (one caller; platform pkg untouched).
- [x] Root Cargo.toml member, Makefile test (cargo covers it), `infra/keyfall-server.Dockerfile`, compose service :8788, Caddy `handle_path /keyfall*` -> keyfall-server.
- [x] README: repo table row + Keyfall section.
- [x] Checks: `cargo test -p keyfall-server` (kill/miss/stun/timer/winner/draw/report args), `npm test` (game.ts), `cargo test --workspace`, platform contract tests unchanged, run client `?demo` + 2-browser local server match, screenshots.
- [ ] Ask before: `register_game("keyfall", referee.v2..., null)` tx, deploys, push.

## Skipped (add when asked)
Market games strip, spectator betting UI (bettable=false), tournaments, bots in server, replays/tape hash, reconnect, lobby room list, NFTs/assets contract.

## Answers
keyfall ok; kill+miss dmg ok; 15 s grace; market skip; reuse brawler referee; betting skip.

# New game: Coinflip (id `coinflip`) — PvP coin flip (plan, awaiting OK)

## Game
- Host picks side (Heads = NEAR mark / Tails = plain coin) + stake -> room open.
- Guest joins (takes other side) OR host presses "Call bot" -> house bot joins.
- Server flips, referee settles. Winner gets 2x stake minus platform fee. Coin spin anim lands on result.

## Fairness (commit-reveal, ~10 lines)
- Host registers room -> server makes 32-byte `seed`, shows `commit = sha256(seed)` in lobby before anyone joins.
- Guest client sends random `client_seed` (bot: `"bot"`). `flip = sha256(seed ‖ client_seed)[0] & 1` (0 heads, 1 tails).
- `report_result(id, winner, null, tape_hash = hex(seed))` -> seed public on-chain, anyone checks vs commit. Exactly 64 hex, fits contract check.

## Fit to platform (no contract change)
- `create_match("coinflip", stake, false, null)` / `join_match(id, null)`. Seat 0 host, 1 guest. `register_game("coinflip", referee, None)`.
- Bettable=false (flip instant, no market time). No tournaments.

## Server `games/coinflip/server` (Rust axum, HTTP JSON, no ws), port 8790. One `main.rs` + `lib.rs`.
- `POST /room {matchId, account, side, auth}` -> `{commit}`. auth = NEP-413 msg `coinflip:<id>:<side>`, nonce = sha256(msg). Chain check: game=="coinflip", host==account, status Open, not registered.
- `GET /rooms` -> `[{matchId, side, commit, result?}]` (lobby merges with chain `list_matches(game:"coinflip")`).
- `POST /flip {matchId, account, clientSeed, auth}` msg `coinflip:<id>:<clientSeed>`. Chain: Live, guest==account. -> flip, `report_result`, `{result, seed, winner}`.
- Guest joined but no `/flip` in 60 s -> server flips with `client_seed=""`.
- `POST /bot {matchId, account, auth}` (host auth `coinflip:<id>:bot`) -> bot account `join_match` on-chain, then flip.
- `GET /room/:id` -> host polls for result (1 s). ponytail: polling, no ws.
- Free rooms (stake 0, no CONTRACT_ID) for local dev: same flow, chain checks skipped.
- ponytail: rooms in memory. Restart = open rooms lose side -> host `cancel_match`; live ones `expire` after 2 h refunds. Add JSON file if it bites.

## near-svc change (needed for bot)
- `join_match` is `#[payable]` 1 yocto + signed by bot. Referee key = function-call key -> can't attach deposit. Bot needs own account + full-access key.
- Add `deposit` to `Near::send` path: new `call_as(signer, method, args, tgas, deposit)`? Laziest: second `Near` instance built with bot creds as "referee", plus `deposit: u128` arg on `call_now` (existing 3 callers pass 0). 1 small diff in shared crate.

## Coin art (Blender 5.3, scripted)
- `games/coinflip/art/coin.py`: cylinder coin, gold metal. Heads: embossed NEAR "N" mark (curve geometry built in script). Tails: plain ring + ridged rim + center star/"T"-less generic pattern.
- `blender -b -P coin.py` -> 24-frame spin strip (one full flip) + still heads/tails -> `client/public/coin/{spin.webp|png, heads.png, tails.png}` 256px, transparent.
- Client: CSS steps animation over strip N loops, ends on result frame. No three.js.

## Client `games/coinflip/client` (Next.js, `@xyz/platform`, port 3003)
- Screens: Lobby (open rooms: host, stake, side, commit; Create form: side + stake) -> Room (coin, waiting / Call bot / Cancel) -> Result (won/lost, seed + verify line).
- Join = `join_match` tx -> sign NEP-413 -> `/flip`.
- `?demo`: local rooms + bot, `crypto.getRandomValues` flip, no wallet/server.
- Shared flip fn TS twin (`lib/flip.ts`) for verify display only.

## Wiring
- Root Cargo member `games/coinflip/server`. Makefile `test` covered by `cargo test --workspace`; `wasm` unchanged (no contract). `dev` echo line.
- `infra/coinflip-server.Dockerfile` (copy keyfall's), compose service :8790 (+ BOT_ID/BOT_KEY env), Caddy route like keyfall.
- market `GAMES` entry, README row + section.

## Checks (one each)
- server: `cargo test -p coinflip-server`: commit/reveal verify, flip deterministic, winner mapping (host side vs result), double-register rejected, timeout auto-flip (free room flow end to end, no chain).
- client: node:test `flip.ts` matches Rust vector.
- `npm test`, `cargo test --workspace`, platform contract tests unchanged, run client `?demo` + local server 2-tab free match + bot, screenshots incl coin renders.
- Ask before: testnet `register_game`, bot account create + deposit, deploys, push.

## Note
- keyfall/ribbon sessions editing same shared files (compose, Makefile, market, README, Cargo.toml). I append only, small hunks.

## Open questions
1. Name "Coinflip" ok, or other display name?
2. Bot staked (needs bot account + full key + NEAR deposit, near-svc deposit arg) or free rooms only (no near-svc change)?
3. Bot account: create new `coinflip-bot.<…>.testnet`, who funds?
4. Commit-reveal ok, or plain server RNG?
5. Bettable skip ok?
6. Reuse brawler referee account?

## Answers (2026-11-15)
1 name ok. 2 bot joins if no one in 60 s. 3 bot staked from house pool account; pool < 2 NEAR -> no bot. 4 use NEAR provable randomness. 5 skip betting. 6 reuse brawler referee.
- NEAR randomness = `env::random_seed()`: block producer signs prev block hash (verifiable). Contract-only, so commit-reveal server RNG replaced -> backend redesign needed (see Backend options). Docs: bet + resolve must be separate blocks.

## Client (in progress, 2 agents)
- [x] Blender coin: `games/coinflip/art/coin.py` -> `client/public/coin/{spin,heads,tails}.png`
- [x] Next client `games/coinflip/client` (lobby, room, result, `?demo` bot, flip.ts + test)

## Backend (ask before starting)

## Review (keyfall)
- Built by 3 parallel agents (server / client libs / client UI) against `tasks/keyfall-spec.md`; infra + README by main.
- cargo test --workspace green (keyfall rules 1/1), platform contract 62/62 (unchanged), npm test green (keyfall game.ts 7/7), tsc + next build ok.
- Smoke: 2 ws clients vs real server (host/peek/join/count/live/kill dmg/stun/disconnect). Browser: practice vs bot, online host+join via share link, disconnect banner, result; 1280x800 + 390x844 screenshots in scratchpad.
- Not tested: staked host/join with real wallet, report_result on testnet (needs register_game tx), docker image build.
- Shared files also edited by parallel `ribbon` session: Cargo.toml, Makefile, compose*, Caddyfile, brawler/ribbon Dockerfiles (+keyfall COPY), README, infra/README.
Proposal A (recommended): tiny coin contract = referee for "coinflip". No platform change, flip on-chain.
- `games/coinflip/contract` (~80 LOC): `set_side(match_id, side)` (host, checks platform `get_match` via callback: host==caller, Open), `flip(match_id)` anyone, later block than join: `get_match` -> Live -> `r = env::random_seed()[0] & 1` -> `report_result(id, winner, None, hex(random_seed))`.
- `register_game("coinflip", <coin contract>, None)`. Seed on-chain as tape_hash = proof.
- Server `games/coinflip/server` shrinks to house bot loop (near-svc): every 5 s `list_matches(coinflip)`; Open > 60 s + house platform balance >= 2 NEAR + side set -> house `join_match` -> `flip`. Also flips Live matches nobody flipped in 15 s.
- near-svc: `call_now` gets `deposit` arg (join_match needs 1 yocto; 3 callers pass 0). House = full-access key.
- Risk: block producer can predict/skip seed (NEAR docs). Testnet ok.
Proposal B: platform contract gets `flip` -> migration/redeploy. Rejected unless asked.
- [x] Client: coin starts on host side, lands on result (4 cases 0->0/0->1/1->0/1->1 via start frame + 72|84 frames), 3 s "flip in N" after both seated. Verified headless: end frames match result.

## Backend plan v2 (answers: random 0/1 from contract, bot staked+free, house = brawler referee)
- [ ] `games/coinflip/contract` coin contract (registered as coinflip referee, no platform change): `set_side(match_id, side)` host via `get_match` callback; `flip(match_id)` anyone, block > join block: `random_seed()[0] & 1` -> `report_result(id, winner, None, hex(random_seed))`. cargo test: winner mapping 4 cases, double flip, not-live, wrong host.
- [ ] `games/coinflip/server` Rust bot loop (near-svc), signer = brawler referee (full-access key, verified): poll 5 s `list_matches(coinflip)`; Open > 60 s, side set, referee platform balance >= 2 NEAR + stake -> `join_match` (1 yocto) -> wait 3 s -> `flip`. Flips Live matches unflipped > 15 s. test: decision fn (age, pool, stake).
- [ ] near-svc `call_now` + `deposit` arg (callers pass 0).
- [ ] Client live api -> coin contract (set_side after create, flip after 3 s), drop server commit/clientSeed; reveal = on-chain seed hex.
- [ ] Wiring: Cargo member + contract exclude, Makefile wasm/test, Dockerfile, compose (no port, worker), market entry, README.
- [ ] Ask before: deploy coin contract, `register_game("coinflip", coin, None)`, referee deposit to platform.
- Backend handoff spec: `tasks/coinflip-spec.md`

# Keyfall v2: 1:1 rebuild of reference (user: "very different, copy the game directly")
Source of truth: scratchpad `ref/REPORT.md` (decompiled C# + scene values), `ref/out/` (sprites, audio, fonts, words.json).

## Copy as-is
- Art: original pixel sprites (sky, bg layers, rocks, sand tiles, city, turret base/gun, bomber, chopper 3 frames, bomb w/ parachute, fireball, balloon, explosion 4 frames, smoke, clouds 4, sun, moon, crosshair). Nearest-neighbor, 1920x1080 logical, ortho 5 -> 108 px/unit.
- Audio: 9 clips (music loop, typewriter key, laser, explosion, bomb fall, chopper fire, siren, error, 3-strike error).
- Font: OpenDyslexic Bold Italic (OFL) for words + HUD.
- Words: original 484-word list + buckets (bomb/balloon 3-4, bomber 4-5 -> 7, chopper 6-8).
- Mechanics: tutorial balloons (3, 20 s) -> bombers (wrap, gap 9 s -> 1.5 s, speed 1.2 -> 3.5, parachute bomb w/ own word, 1.3/s, 10 dmg) -> choppers from 60 s (hover ~4.75 from city, fireball 5 dmg every 1 s, not typeable). City HP 100.
- Typing: lock onto shortest matching word, auto-submit 0.15 s after complete, wrong key = strike, 3 strikes = 1 s stun. Turret rotates 180°/s, cyan laser 0.2 s, explosion + shake + flash, city smoke grows w/ damage.
- Day/night: 60 s cycle tint, sun/moon arcs. Bloom/vignette approximated in CSS/canvas (cheap glow only).

## Drop / change
- Score, multiplier, quickdraw/lightning/multikill labels, high score, pause.
- Add: 5:00 timer, WPM in HUD (replaces score slot). Health bottom-left as original.
- Player sees only own screen. No PvP attacks; same seed = identical waves both sides.
- End: city 0 -> loses; 5:00 -> higher HP, then WPM, else draw (refund).

## Arch
- Rust server authoritative (reuse rooms/auth/referee in `server/src/lib.rs`, rewrite `game.rs`): one sim per seat, same seed. Client sends each keystroke `{t:'k', c}` (+ backspace); server owns lock-on, strikes, kills, bombs, hp. 20 Hz snapshots w/ velocities; client extrapolates + echoes typed letters locally.
- TS sim (`lib/game.ts`) = same rules for practice/`?demo` (no bot needed: practice is solo vs waves, like original; optional ghost bot skipped).
- Client: canvas renderer replacing DOM lanes; restyle menus/room/result to reference look (pixel font, sand/sky palette).
- Checks: cargo test (spawn ramps, bomb drop + dmg, lock-on, strikes/stun, end rules), node test (same cases TS), browser screenshots side-by-side w/ `ref/out/scene_layout.png`.

## Answers
1. Original art now + new SVGs for some (logo, HUD icons, panels). 2. Opponent hidden until result. 3. Balloons kept, faster (1 s / 3 s gap / 10 s max). 4. Name Keyfall.
- Spec: `tasks/keyfall-spec.md` v2; reference copied to `tasks/keyfall-reference.md`. Assets copied to client/public/{art,sfx,fonts}, words.txt = original 484 words.
- [x] Rust sim+server v2 (7 tests)  - [x] TS sim+hooks v2 (10 tests)  - [x] canvas renderer + UI + SVGs  - [ ] README update (rules changed)  - [x] verify + screenshots (scratchpad v2-*.png)
- Fairness: schedule independent of kills (tutorial fixed 10 s, bomber word ramp per 8 spawned).
- Open: sky tint warmer than original (BrightnessLit2D shader not recovered).
- [x] Client restyle: layout/flow from user reference shots (header bet bar + side picker + Create Flip, ALL GAMES rows w/ VS + IN-PLAY + watch, room modal countdown/spin/WON + Fairness). Own palette/art, no reference branding. tsc + npm test green.
- v2.1 (user changes): no name field (wallet account / Guest), 2:00 match, balloons 1.4, bombers 1.45+0.085/spawn max 4.2, day/night 80 s cycle random start, art restyled to platform style (4x vector-cartoon PNGs from `client/art-src/`, originals in `public/art/orig/`), renderer ART_X=4 + smoothing, tint lift 0.6. Tests: server 7/7, TS 10/10, tsc ok, browser no errors.

# Ribbon ↔ platform parity (per tasks/platform-integration.md) — plan, awaiting OK
Already OK: @xyz/platform provider/calls, assets=null, direct report_result, NEP-413 `ribbon:<id>` via near-svc + chain seat check, ?demo, infra (compose/caddy server.j2/Makefile), market GAMES entry, README + ribbon-spec.md, 4-letter code (ribbon scheme ok: every staked match on-chain; bot = local practice).

## Client
- [x] C1 title chips like brawler (coin + wallet icons copied from brawler public/ui; Funds + Account modals): balance chip (`useBalance`, click → deposit at MARKET_URL) + wallet chip `short(account)` / "Connect wallet". `short()` = 2-line copy of brawler lib/format.ts
- [ ] C2 invite link opens straight into join: `?room=CODE` → "Join race" popup with peek (get_match: host, stake, pot, bettable, status) + one Join click (wallet popup needs user gesture). Own/live/finished cases as now
- [ ] C3 reload rejoin: sessionStorage `ribbon:play` {id, watch}; on load, if match still live → back into Play (server already re-seats same account)
- [ ] C4 ws reconnect w/ backoff + re-auth; `hb` every 1 s; "opponent left — forfeit in N s" banner from server `left{seat, at}`

## Server
- [ ] S1 hello nonce base64 (guide: use base64; ribbon uses hex) — server + client
- [ ] S2 `hb` → last-seen per seat; silent > grace = gone (fixes half-open socket); broadcast `left{seat, at}` / `back{seat}`
- [ ] S3 review fixes: no_show unjoin race (remove room before await), input from stale conn, `?server=` only in demo/dev, require CONTRACT_ID unless DEV=1

## Chain (needs OK, tx)
- [ ] `register_game("ribbon", <referee>, null, null)` — 4 args now; referee_key null = direct report_result mode

## Skipped (optional per guide)
- SocialProvider/FastAuth, FundsDialog (link to market instead), signed gasless settle, NFTs/tournaments

## Open questions
1. Forfeit grace: keep 10 s or match brawler 30 s?
2. Copy brawler SocialProvider (Google/email login) too, or wallet-only?
3. Referee account for register_game: reuse brawler's REFEREE_ID?
- v2.2 art: user rejected vector set. Now: sprites cut from user's `games/keyfall/reference/KEYFALL Game Asset Collection.png` (`client/art-src/cut-sheet.mjs`: flood-fill black bg + enclosed-hole removal, lum-alpha for sun/crosshair), backdrop (sky/mountains/dunes/rocks/sand) = original pixel art x8 nearest. ART_X=8, city = one full-width skyline, fireball rotated to velocity, logo.png. Dead: vector SVG sources in `client/art-src/*.svg` + build.mjs/gen.mjs, `public/svg/logo.svg` (ask user before deleting).
- [x] Duel page: blurred arena art bg, rider cards (portrait/name/colour/pips/boost, crashed state), top bar (leave, race code, wallet). Roster in src/riders.ts (stand-ins Lortor/Torfen) — swap for brawler monster names + art when provided
- [x] Fix: live client dropped every server tick (`m.n === sim.tick + 1`; server n is 0-based = sim.tick)
- [x] Result = overlay on duel page (Over in Play, 'over' screen + old main/header CSS removed)
- [x] Neon title page per games/coinflip/reference/Neon Coinflip Arena UI.png: wallet chip (short acct + balance -> market) + Connect/Disconnect, glowing title panel, table. Art slots: public/title.png (banner), public/bg.png (page bg). tsc + test green, no h-scroll 1774/390.
- [x] Duel page re-laid per references/Neon Ribbon Rush Duel.png: framed board, rider chips (hex portrait) + round/ring pill on frame top, key-cap controls bar, text logo, arena bg = public/title.png
- [x] title.png = full-page bg (art top, panel starts under it; phone offsets bg under wallet bar). banner img removed.
- [x] Remotion toss videos: games/coinflip/video (Toss-hh/ht/th/tt, 1200x800 60fps 2 s, VP9 alpha) -> client/public/coin/toss-{hh,ht,th,tt}.webm. Head = brawler ui/coin.webp flattened (face.py), tails = star. Chrome alpha + start/end faces verified. Not wired into client yet.
- [x] Room modal plays toss-<side><result>.webm (idle = first frame of toss-<side><side>), landed on video end. Verified desk+phone; fixed dup key when result==side.

# Game portal (plan: ~/.claude/plans/fizzy-seeking-sphinx-of-37382104-4226-4746-9167-1050224bb82a.md)
- [x] games/<slug>/{game.json,INTAKE.md,src/,build/} convention + games/_template
- [x] next.config reads games/*/game.json -> CHOMP_GAMES; market/lib/games.ts
- [x] /play grid (tag chips), /play/[slug] sandboxed iframe player, GameCard shared w/ home
- [x] /g/[slug]/[...path] build server (MIME, .gz/.br, CORS, traversal guard)
- [x] public/chomp-sdk.js postMessage bridge (ready/start/result/frames <-> session)
- [x] 2048 (MIT) smoke game; first-party games get game.json (url)
- [x] market Dockerfile ships games/*/build

## Review (portal)
- tsc clean, `bun run build` ok.
- curl: /g/2048/* 200 w/ right MIME + ACAO *; `..%2F` / `%2E%2E` / bad slug -> 404.
- Headless Chrome: /play 2 playable + 3 soon cards; /play/2048 renders, bridge `ready` -> `session` w/ seed, frame origin `null`, parent.localStorage blocked, 0 console errors.
- Not verified: docker image build, Godot/Unity export through /g route.

# Market v2: hosted "Shop" look + Fractal/Ronin patterns (2026-11-24)
Refs: hosted crawl (scratchpad crawl/hosted), Fractal crawl, `market/inspirations/ronin/*.png`. Data = `useAssets()` (demo until Solana port, `TODO(solana)` seams). Units -> lamports (1e9). No new deps.

## Foundation (inline, shared files)
- [x] Theme: hosted purple tokens (sky/ink/panel/cream/muted), Lilita One display + Nunito body, 3px ink borders, hard `shadow-drop`
- [x] Shell: logo, nav (Market, Browse, Collections, Launchpad, Spin, Activity, Games, Create), compact search (not on home), cart icon w/ count, account pill menu (My stuff, Economy, Watchlist, Log out)
- [x] MonsterArt -> hero sprites `/heroes/*.webp` hue-rotated (hosted recipe)
- [x] assets.ts: lamports, `Machine` + `machines()/spin()`, base58-style demo accounts, `EXPLORER` link helper
- [x] shared: `Tabs`, `Breadcrumb`, `Star` (watchlist, localStorage), `Skel` loaders, `Table`, cart store (localStorage) + `CartDrawer`

## Pages (parallel agents, disjoint files)
- [x] `/` home: hosted hero + search, 3 stat cards, Fortune Spin row, Trending collections (24h/7d/30d), Top skills big-rank row, Featured games, Recent sales strip, Top movers + Monsters for sale, Launchpad apply banner
- [x] `/search` explore: filter sidebar w/ counts (type, kind, rarity, collection, price, monster stat mins), toolbar (sort, refresh, only mine, grid/list), URL state
- [x] `/collections` Ronin table (All/Watchlist/Owned, 24H/7D/30D/All, sortable floor/volume/sales, 7D trend, supply, listed) ; `/collection?id=` Fractal hero + stats strip + info card + tabs Items/Activity/Presales
- [x] `/item`: breadcrumb, star, attributes grid, chain facts + explorer, sales history table, add-to-cart
- [x] `/launchpad` (All/Live/Upcoming/Completed + search, % minted bars, SOLD OUT ribbon, apply hero) ; `/launch?id=` detail (stat chips, start→end, mint panel, recent mints)
- [x] `/spin` machines (lucky/latest drop strips, tabs, spin counts, out of stock) ; `/spin?id=` odds table + spin animation + result
- [x] `/activity` global sales table (filters type/collection, time+price)
- [x] `/me` tabs Inventory/Listings/Monsters/Watchlist/Proceeds
- [x] `/create` presale preview card (draft→preview)

## Verify
- [x] `tsc` + `next build`; headless screenshots 1440 + 390 every route `?demo`; no h-scroll; Ctrl K

## Review
- All pages built on demo data. tsc clean, `next build` green (17 routes). 20 routes × 390/1440 checked by headless CDP: no h-scroll, no console errors, no overlays.
- New: `/collections`, `/activity`, `/launchpad`, `/launch`, `/spin`; shared `lib/stats.ts` (volume/sales from price history), `lib/local.ts` (watchlist + cart), `components/presale-card.tsx`, `app/launchpad/drop-card.tsx`, `public/heroes/*.webp`.
- Api additions: `machines()`, `drops()`, `spin()` (stub `TODO(solana)`: MagicBlock VRF). Units now lamports.
- Gaps (need chain/indexer): buyer/seller in activity, per-monster sale history, tx explorer links on sales, offers/trait bids, cart as one tx (`TODO(solana)` in CartDrawer).

## Tomb Delve landscape battle UI (2026-11-24)
Ref: games/tomb-delve/reference/Egyptian Scarab Swarm Battle UI.png
- [x] Art agent: landscape placeholder art in ref style → games/tomb-delve/src/public/art/{bg/*-l, ui/*, cards/l-*, cards/art/*, icons/{inventory,relic,deck,map}}.svg
- [x] UI agent: all screens landscape 1672x941 scaled stage; battle layout per ref; banner + "Room n/10" only (no tracker, no levels); monster intent HIDDEN; popups Inventory/Relics/Deck/Map; heroes = brawler cutout rig (cutout.ts + rig.ts poses, PNG parts copied)
- [x] sim.mjs still passes; tsc + build; headless playthrough + screenshots vs ref

# Brawler Arena in the market (2026-11-24)
Goal: brawler playable at /play/brawler, same origin as market, so one ngrok tunnel covers it (practice + online free rooms).
Today: game.json url=localhost:3000 (separate dev server), WS = ws://<host>:8787 → both dead for remote users.

## Client (games/brawler/client)
- [x] Static export: move `src/app/[[...slug]]/page.tsx` → `src/app/page.tsx`; next.config `output:'export'`, `basePath:'/g/brawler'`, `images.unoptimized`, drop headers/rewrites; export script copies out → ../build, `_next`→`assets` (reuse tomb-delve export.mjs)
- [x] Router: hash routing in `lib/nav.ts` (`#/practice`), only seam. App click interceptor keeps `href="/..."` links working unchanged. Works in sandboxed iframe (no pushState) + deep links survive reload
- [x] Assets: one `BASE` const prefix for `/stages /chars /skills /title /ui` (~10 call sites)
- [x] WS default `session.ts:48` → `${ws|wss}://${location.host}/brawler-ws` (`?server=` + NEXT_PUBLIC_SERVER_URL overrides kept)
- [x] SDK: `<script src="/chomp-sdk.js">` + `Chomp.ready()`, `Chomp.result()` on match over
- [x] MARKET_URL default → `/`

## Market
- [x] `next.config.ts` rewrite `/brawler-ws/:path*` → `http://127.0.0.1:8787/:path*` (Next proxies WS upgrade; verify in `next start`)
- [x] `games/brawler/game.json`: drop `url`, add `entry: index.html`
- [x] `BRAWLER_URL` default → `/play/brawler`

## Verify
- [x] brawler tsc + tests; market tsc + build
- [x] `cargo run -p brawler-server --release` + market prod: /play/brawler practice fight renders (headless screenshot), online room create/join over /brawler-ws (2 headless tabs or ws smoke)
- [x] same through ngrok URL

## Review (brawler)
- WS path is `/g/brawler-ws` (sibling of basePath), proxied by market `next.config.ts` rewrite (prod `next start` proxies the upgrade) and by `scripts/serve-games.ts` (dev :3200). Brawler's own `next dev` (:3000/g/brawler/) has the same rewrite.
- Build: `cd games/brawler/client && npm run build` → `games/brawler/build` (EXPORT=1; Docker standalone path unchanged).
- Verified: tsc, 41 tests, practice fight renders, market gets `ready`, `wss://<ngrok>/g/brawler-ws` host+join room, /history via tunnel.
- Not done: `build/` not committed; sandbox has no storage so collection resets per load; staked/NFT still `TODO(solana)`.

# UI polish pass: every game + market to brawler quality (2026-11-24)
Audit shots: scratchpad/audit/<game>/. Bar = brawler: full-bleed art, logo, icon tiles, chunky gradient CTAs w/ icons, HUD chips, every screen styled, results/lobby/modals real screens. Own art style per game (refs in games/<slug>/references).
Execution: 1 agent per game + 1 market, disjoint files, each verifies w/ headless shots 1440x900 + 390x844 + game smoke test.

## monster-siege (build/index.html, render.js)
- [ ] Menu/deck builder: arena bg, logo, monster tiles in card.frame w/ cost gem + archetype icon + stat bars, 8-slot deck tray, fixed CTA bar
- [ ] Gradient CTAs w/ icons; Easy/Hard segmented toggle
- [ ] Result modal: crest, core %, kills, score, Rematch/Menu (drop 3s auto-return)
- [ ] Host lobby: big room code + copy, 2 player slots, cancel; styled error toasts
- [ ] Countdown: big animated number, no black strip
- [ ] Pause chip + Resume/Forfeit modal
- [ ] Portrait "rotate" screen; battle layout: fill bottom gap, AI chip overlap, style fullscreen btn

## tomb-delve (src/app/page.tsx, globals.css, art-gen2.py)
- [ ] Fill viewport (no letterbox); portrait rotate overlay
- [ ] Title: logo plate, tagline scroll, CTA text fit, HUD chips
- [ ] Pick: framed hero cards, stat chips, lock overlay
- [ ] Corridor: walking hero + plate + room pips
- [ ] Battle: pips, Lv/HP labels, enemy intent chip, log as toast
- [ ] Camp: hero position, carried relics as icon chips
- [ ] Pawn: styled scanbox, NPC speech bubble, SOL chip
- [ ] End: framed result modal (relics + SOL / death)
- [ ] Deck/Map modals: mini card frames, pips; demo panel → themed corner gear

## pet-den (build/index.html, ui.js)
- [ ] #sheet → centred modal, blurred backdrop, painted header (fixes all 9 tabs)
- [ ] Leaderboard podium; Breeding parent♥parent→egg; City/Shop/Quests/Achievements card grids w/ locks + reward chips
- [ ] Mini games: arena bg, HUD chip, result card
- [ ] Bell log dropdown; evolve full-screen flash; habitat thumbs; mobile nav scroll

## sealed-house (build/index.html, game.js)
- [ ] Final result hero card + collection grid + Play again
- [ ] Reveal: fix compact title overlap, tier burst, bigger item art
- [ ] My Bids/History/Leaderboard: row cards, podium, art empty states
- [ ] Full-bleed stage bg, fill dead space; timer slot shows lot result after lock

## 2048 (build/style, index.html)
- [ ] Reskin to Chomp theme: header, score chips, tile palette, game-over/win modal w/ CTAs

## market (components/ui.tsx, app/*)
- [ ] Btn → chunky gradient CTA w/ icon (global)
- [ ] Home: hero slides only w/ real hero art; show all games (drop slice(0,8)); Market Highlights art-first cards
- [ ] /play poster + loading/error state
- [ ] /collections stacked rows <sm + banner; /search empty-skill cards; /collection banners + grid fill
- [ ] /item rarity glow, hide "List yours" at 0; /me profile banner + HUD stats; /activity monster names; /economy x-axis; /create layout
- [ ] Nav strips: edge fade

## Art (needs decision)
- [ ] Painted thumb+hero for 2048, monster-siege (key art), pet-den, sealed-house; regen tomb-delve hero; logos for siege/tomb; victory/defeat crests

# Devnet: chomp program + wallets/faucet + every game on devnet (spec: tasks/devnet-spec.md)
- [x] A chomp program (match escrow/settle/cancel, score) + tests + setup/deploy scripts
- [x] B platform pkg (burner + Privy + iframe bridge, chomp helpers) + market (connect UI, /api/faucet, portal bridge, auto submit_score)
- [x] C crates/chain (RPC read, referee settle, ed25519 auth) + brawler/keyfall/coinflip/ribbon servers
- [x] D brawler/keyfall/coinflip/ribbon clients: stake = open/join match, seat auth via signBytes
- [x] E pet-den program + chain.js on devnet
- [x] F sealed-house program + chain.js on devnet (VRF)
- [x] G tomb-delve / monster-siege / 2048 via portal score
- [x] Deploy all 3 programs (needs user SOL top-up), init + register games, fund faucet/referees
- [x] Review each impl + smoke on devnet

## Review (devnet, 2026-11-25)
- Live devnet: chomp 4m5U9N… (upgraded: join resets expiry, overflow checks), pet-den 2shkiB…, sealed-house FGYiyd… (VRF callback CU fix 1.18M→7k, bid bond ≥ reserve, window caps, lot-bound commit).
- Real round trips: chomp open/join/settle/cancel/score; coinflip staked match via server referee; brawler settle w/ confirm; pet-den create→care→evolve→release; sealed-house VRF lot→bid→settle→sell_back; 2048 submit_score via portal bridge; faucet drip + rate limit.
- Portal bridge: program allowlist = 3 programs, chomp ixs bound to slug, stake confirm(), sign prefix per slug, /g CSP sandbox (no burner theft).
- Open: sealed-house lot contents public → sell_back drain (user decision pending); submit_score unverified; deployer can swap referee; no fee withdraw; Privy untested (needs NEXT_PUBLIC_PRIVY_APP_ID); brawler/keyfall/ribbon not played e2e vs live server; finished-id set in-memory.

# Portal: keyfall/ribbon/coinflip into marketplace + live devnet e2e (2026-11-25)
- [x] generic /g/<slug>-ws proxy (market next.config + serve-games); coinflip server → 8791 (siege owns 8790); game.json un-soon
- [x] keyfall static export at /g/keyfall + staked e2e
- [x] ribbon static export at /g/ribbon + staked e2e
- [x] coinflip static export at /g/coinflip + staked e2e
- [x] brawler staked e2e live server + score games in portal
- [x] root fixes after e2e: portal sandbox + /g CSP allow-forms; crates/chain RPC error ≠ "match not found" + JSON "Too many requests" retry; platform balanceOf via wallet (no fake 0); platform `myMatches` (chain scan) feeds reclaim lists in brawler/keyfall/coinflip (sandbox has no localStorage); coinflip default stake 0.01
## Review (portal e2e)
- All 9 games 200 on /play + /g on :3150; /play lists all with Play Now.
- Devnet staked e2e through real portal UI (2 burners each): brawler (KO), keyfall, ribbon, coinflip — referee settle confirmed, balances = stake·2·0.975. Host cancel refunds; reclaim works.
- Score games: monster-siege, tomb-delve submit_score on chain; pet-den create_pet; sealed-house lot+bid+settle.
- Open: public devnet RPC 429s (use dedicated RPC); coinflip art still NEAR "N"; portal doesn't forward ?room= to iframe; 390px iframe tiny (fullscreen); pet-den/sealed-house sigs not in portal footer; monster-siege no tapeHash; keyfall no Chomp.result score.
