# Ribbon Rush: online multiplayer requirements

What is needed to take Ribbon Rush from demo/practice to real two-player staked races on NEAR testnet.
Companion docs: `tasks/ribbon-spec.md` (sim, protocol, referee rules), `tasks/platform-integration.md` (platform guide).

## 1. Where things stand (2026-11-15)

| Piece | State |
|---|---|
| Sim (Rust + TS twin, golden-tested) | Done. Server runs the Rust copy; client replays the TS copy |
| Server `games/ribbon/server` | Server-authoritative 15 Hz, NEP-413 seat auth via `near-svc`, chain seat check, `report_result` with tape hash, forfeit 10 s, no-show 5 min, unjoin, `/tape/{id}`. 2 integration tests (dev mode) |
| Client live path | Wallet, create/join/cancel/claim, waiting room (chain poll, 20 s bot fallback = cancel + practice), 4-letter room codes, duel page, result overlay. Tick-numbering bug fixed, **not yet run against a live server in a browser** |
| Chain | **`ribbon` not registered** on `v3.brawler-platform-5c8e2b.testnet` |
| Infra | Server: Dockerfile + compose service + Caddy `ribbon.{{ domain }}`. Client: **no container / Caddy entry yet** (clients now run on the box via `compose.clients.yml`) |

## 2. What I need from you

### 2.1 Chain + keys (blocking)
| # | Item | Why | Default if you don't say |
|---|---|---|---|
| K1 | Platform owner signs `register_game("ribbon", <referee>, null, null)` | Contract rejects unknown games; 4th arg `referee_key` null = referee calls `report_result` directly | I prepare the exact `near` CLI command; you run it or OK me running it |
| K2 | Referee account id + key for the server (`REFEREE_ID`, `REFEREE_KEY`) | Only the referee can report results | Reuse brawler's referee (same env already on the box) |
| K3 | Two testnet wallets with platform balance (≥ 0.5 NEAR each, deposited via market) | End-to-end staked test | You provide; or I use `scripts/faucet.sh` + two fresh accounts if you OK it |

### 2.2 Hosting (blocking for public play, not for local)
| # | Item | Default |
|---|---|---|
| H1 | Deploy `ribbon-server` to the box (`make push-image` + ansible) | Ask before running |
| H2 | Host the client: add `ribbon-client` to `compose.clients.yml` + `Caddyfile.clients.j2` (like `brawler-client`), or Vercel | Box, same as brawler; URL `ribbon.<domain>` is taken by the ws server, so client at `play-ribbon.<domain>` or serve both from one host (client + `/ws` path) — **you pick** |
| H3 | Env: `NEXT_PUBLIC_SERVER_URL=wss://ribbon.<domain>`, `NEXT_PUBLIC_PLATFORM_ID`, `NEXT_PUBLIC_MARKET_URL`; market `NEXT_PUBLIC_RIBBON_URL` | Filled once H2 is decided |

### 2.3 Game decisions
| # | Question | Default |
|---|---|---|
| D1 | Forfeit grace when a player drops: 10 s (now) or 30 s (brawler) | 30 s with on-screen countdown |
| D2 | Free online rooms (no stake, no chain) as well as staked? Guide recommends brawler-style server codes if yes | Staked only (stake may be small); free play = practice vs bot |
| D3 | Quick match (auto-pair with any open race of the same stake) | No; codes + Matches list only |
| D4 | Spectator betting UI on bettable races (platform order book; brawler `Watch.tsx`) | Later; watch-only for now |
| D5 | Online bots (server-side, like brawler `agents/`) | No; bots never touch stakes (brawler rule). Local practice only |
| D6 | Rematch for staked races | "Rematch" = new race, same stake, opponent gets the code |
| D7 | Rider roster: monster names, colours, portraits from brawler | You send the list; until then Lortor / Torfen stand-ins (`src/riders.ts`) |
| D8 | Server region / latency target | Same box as brawler; acceptable if RTT < 120 ms (15 Hz grid, no prediction) |
| D9 | Login: wallet only, or add brawler's Google/email (FastAuth) | Wallet only |

## 3. Work I will do (after OK)

### Client
- [ ] Invite link `?room=CODE` opens a **Join race** popup: peek `get_match` (host, stake, pot, bettable, status) + one Join click (wallet popup needs a user gesture)
- [ ] Reconnect with backoff + re-auth; 1 s heartbeat (`hb`)
- [ ] "Opponent left — forfeit in N s" banner (server `left{seat, at}` / `back{seat}`)
- [ ] Rejoin after reload: `sessionStorage` `ribbon:play` → if match still live, straight back into the duel
- [ ] Claim only after the chain shows the result (poll `get_match` until `settled`/`refund`, then enable Claim; show payout)
- [ ] Dev-only `?as=<account>` override (dev server without `CONTRACT_ID`) so two local tabs can play without wallets
- [ ] `?server=` honoured only in demo/dev builds (security review finding)

### Server
- [ ] Hello nonce as base64 (guide standard; client + server)
- [ ] `hb` handling: last-seen per seat; silent > grace = gone (fixes half-open sockets); broadcast `left` / `back`
- [ ] Forfeit grace per D1
- [ ] Review fixes: remove room before awaiting `unjoin` (race), ignore input from a replaced socket, keep finished match ids so a late re-auth can't start a second game, cap watchers + rooms, require `CONTRACT_ID` in prod unless `DEV=1`
- [ ] Finished-room reconnect: send `sync` + `over` before the chain status check

### Tests
- [ ] Server: forfeit, no-show/unjoin, reconnect, stale-socket input (dev mode, short timers via env)
- [ ] Local 2-tab run (dev server + `?as=`) with screenshots
- [ ] Testnet end-to-end (after K1–K3): create → share code → join → race → `report_result` lands → both claim; plus cancel/refund and a bot-fallback cancel. Tx links logged in `contracts/DEPLOYMENTS.md`

## 4. Done when
1. Two people on different machines finish a staked race over `wss://`, the referee reports the right winner on chain, and the winner's Claim credits `2 × stake − fee`.
2. Draw / void refunds both stakes.
3. A dropped player can reconnect within the grace and keep playing; past it, the other wins.
4. Spectators can watch any live race by code.
5. `npm test`, `cargo test --workspace` and the server tests are green.

## 5. Order
1. Local: client + server items + tests (no chain needed, dev mode)
2. Your K1–K3 → testnet run against a local server
3. Your H1–H3 → deploy, public run
