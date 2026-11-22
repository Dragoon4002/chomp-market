# Chomp Market

Real-time 1v1 browser games (Brawler, Ribbon Rush, Keyfall, Coinflip) with a deterministic sim, rollback netcode, server referee with replayable input tapes, bots and a player market.

**Status:** being ported to **Solana + MagicBlock** (Ephemeral Rollups for match state, VRF for randomness). The previous chain contracts and wallet code were removed; the codebase is chain-agnostic. Chain calls go through one stub seam per app (marked `TODO(solana)`) that throws "coming soon", so practice, free online rooms, bots, spectating and replays work; staking, betting, tournaments, monster/skill trading show the UI but are not wired.

Chain seams: `packages/platform/index.ts` (shared TS wallet/balance), `games/brawler/client/src/lib/chain.ts`, `games/brawler/client/src/lib/nft.ts`, `games/keyfall/client/src/lib/chain.ts`, `games/coinflip/client/src/lib/api.ts`, `games/ribbon/client/src/App.tsx`, `market/lib/assets.ts`, `crates/chain` (Rust servers). `grep -rn "TODO(solana)"` lists them all.

## Features

- Practice vs bot, no wallet, keyboard / gamepad / touch.
- Online rooms: public or private, spectators, chat, rematch.
- Rollback netcode (P2P with relay fallback); reconnect to a fight within 30 s.
- Provable fairness: deterministic sim (no randomness, no clock, no trig); the referee re-simulates the confirmed tape and records a SHA-256 tape hash; `/replay/<id>` re-runs it in the browser.
- Monsters with DNA-driven stats and equippable skills (same rules in the TS sim and the Rust referee, golden-tested).
- Bots: press "Call bot" in a free room and a bot joins (`agents/`).

## Repo

| Path | What |
|---|---|
| `games/brawler/client/` | game client (Next.js) |
| `games/brawler/server/` | Rust WebSocket server: relay, lobby, referee, tapes, history |
| `games/brawler/sim/` | Rust port of the sim, golden-tested against the TS sim |
| `games/ribbon/client/` | Ribbon Rush client (Next.js) |
| `games/ribbon/server/` | Ribbon Rush Rust WebSocket server: authoritative sim, referee, tapes |
| `games/ribbon/sim/` | Ribbon Rush Rust sim, golden-tested against the TS twin |
| `games/keyfall/client/` | Keyfall client (Next.js); `src/lib/game.ts` runs the rules locally for practice |
| `games/keyfall/server/` | Keyfall Rust WebSocket server: authoritative rules, rooms, referee |
| `games/coinflip/client/` | Coinflip client (Next.js); commit-reveal flip in `src/lib/flip.ts` |
| `crates/chain/` | Rust chain seam for game servers (stub, `TODO(solana)`) |
| `packages/platform/` | shared TS wallet + balance hooks (stub, `TODO(solana)`) |
| `agents/` | bot service |
| `market/` | skill + monster marketplace (Next.js + Tailwind, bun) |
| `scripts/` | golden vectors |
| `infra/` | Terraform, Ansible, Docker, Caddy |

## Run

```sh
npm install && npm test && npm run build      # all TS workspaces
cargo test --workspace                         # rust sim + server
make dev                                       # backend in docker, ws :8787 (BRAWLER_PORT)
cargo run -p brawler-server                    # same, no docker
npm run dev -w @xyz/brawler                    # http://localhost:3000
cd market && bun install && bun dev           # market, http://localhost:3000 (?demo for mock data)
cargo run -p ribbon-server                     # ribbon ws :8788
npm run dev -w @xyz/ribbon                     # http://localhost:3001 (?demo = local bot, no wallet/server)
cargo run -p keyfall-server                    # keyfall ws :8789
npm run dev -w @xyz/keyfall                    # http://localhost:3002 (?demo = practice vs bot, no wallet/server)
npm run dev -w @xyz/coinflip                   # http://localhost:3003 (?demo = local, no wallet/server)
```

- Server env: `PORT`, `HISTORY_FILE`. Free rooms only until the Solana port.
- Client env (build-time): `NEXT_PUBLIC_SERVER_URL` (default: same origin), `NEXT_PUBLIC_PLATFORM_ID`, `NEXT_PUBLIC_MARKET_URL`, `NEXT_PUBLIC_MONSTERS_ID`, `NEXT_PUBLIC_ASSET_URL`. Market: `NEXT_PUBLIC_ASSETS_ID`, `NEXT_PUBLIC_PLATFORM_ID`, `NEXT_PUBLIC_BRAWLER_URL`, `NEXT_PUBLIC_DEMO=1`.
- Golden vectors: `node --experimental-strip-types scripts/golden.ts` after any TS sim change, then `cargo test`.
- New game: `games/<id>/{client,server}`.

## Ribbon Rush

Second game (id `ribbon`). Two riders on a grid leave trails; trails fade, the ring closes in, each rider gets one boost per round, best of 3. The server runs the sim authoritatively; its referee computes the winner and tape hash.

- Server env: `PORT` (8788) `TAPE_DIR`. Prod: `wss://ribbon.<domain>`.
- Client env: `NEXT_PUBLIC_SERVER_URL`, `NEXT_PUBLIC_MARKET_URL`. Demo: http://localhost:3001/?demo

## Keyfall

Third game (id `keyfall`): a 1v1 typing duel. Both players get the same seeded stream of words falling down their own lane. Type a word and press Space or Enter to destroy it, and your opponent loses health equal to its length. A word that reaches your base costs you its length. Three wrong submissions in a row stun you for 2 s. Each player starts with 600 HP and the match lasts 5:00. At 0 HP you lose; when time runs out, higher HP wins, then higher WPM, otherwise it's a draw.

- The server owns the clock, the word stream, health and WPM. Clients only send the words they type (at most 20 per second), so a client can't fake hits or damage.
- A disconnected player has 15 s to rejoin (the words keep falling); after that the opponent wins by forfeit.
- Practice vs bot (easy/medium/hard) and `?demo` run the rules in the browser with no wallet or server.
- Server env: `PORT` (8789). Prod: `wss://keyfall.<domain>`. Client env: `NEXT_PUBLIC_SERVER_URL`, `NEXT_PUBLIC_MARKET_URL`.
- Rules and protocol: `tasks/keyfall-spec.md`.

## Coinflip

Fourth game (id `coinflip`): heads-or-tails rooms. Commit-reveal: the server commits `sha256(seed)` before the flip, the result is `sha256(seed ‖ clientSeed)[0] & 1`, so either player can check it. Server in `games/coinflip/server` (client expects it at `?server=`, default `http://localhost:8790`); `?demo` runs everything in the browser.

## Deploy

Two EC2 boxes behind Caddy TLS: **server** runs the game server and bots (rooms are in-memory, so exactly one instance); **clients** runs the game client and market (Next standalone). Domains are `<eip>.sslip.io`, no DNS setup. Needs `terraform`, `ansible`, `jq`, docker buildx, AWS creds. Details in `infra/README.md`.

```sh
cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars   # set ssh_cidr
make deploy-infra                     # 2x EC2 + EIP + SG
make deploy                           # docker + repo (main) on both, build+ship 4 images, compose up
```

- `?server=wss://<domain>` on the game URL overrides the server for a quick test.
- Redeploy: `make deploy ANSIBLE_ARGS="-e repo_version=<sha>"`.

## Controls

Practice vs bot from the title screen, or play online: host a room, join by code, or watch from the lobby. Phones get an on-screen stick and buttons.

| | Move / aim | Jump | Light | Heavy | Block | Dodge |
|---|---|---|---|---|---|---|
| Keyboard | WASD (or arrows) | Space or W | J | K | L (hold) | C |
| Mouse / alternates | | | Right click / Z | Left click / X | Q (hold) | |
| Gamepad | Stick / D-pad | A | X | B / Y | | Bumpers / triggers |

Block (grounded, hold L or Q): hits from the front deal 1/5 damage and a small push instead of launching you; hits from behind land in full. You can't move or attack while blocking.

Hold a direction with an attack to pick the move (neutral, side or down; ground or air). Air neutral heavy is the recovery move; air down heavy is the ground pound. Hold down on a thin platform to drop through it. Press ` to show hitboxes and Esc to return to the menu.

## How it works

- **`src/lib/sim/`**: deterministic simulation at a fixed 60 Hz. No DOM, no randomness, no trig, no clock: the same inputs always produce the same state, in TS and in the Rust port.
  - Fighter states: idle, run, jumpsquat, air, land, dodge, attack, hitstun, block, dead.
  - Each stock has 200 HP; damage raises knockback: (base + damage% × growth) × defence modifier.
  - Hitlag on impact, hitstun scaled by knockback, 6-frame input buffer, frame data in `moves.ts`.
- **`src/lib/render/`**: procedural bone rig with keyframed poses, a fit-both camera, hit sparks, screen shake and KO beams. Reads sim state only.
- **`src/lib/net.ts`**: rollback netplay. The local sim predicts the opponent's input up to 10 frames ahead and re-simulates when real input arrives; clients compare state hashes every second.
- **Server**: relays inputs, records the confirmed tape, re-simulates it as referee, computes the result + tape hash (on-chain posting: `TODO(solana)`), and serves history and tapes.

## License

MIT, see [LICENSE](LICENSE).
