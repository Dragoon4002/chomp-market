# Chomp Market

A Solana game portal where you stake devnet SOL on skill matches, win VRF-sealed loot, and raise on-chain pets, all in one wallet.

Built for Solana Blitz v10 (MagicBlock, theme "Entertainment Finance"):

- **Compete**: 1v1 staked matches (brawler, keyfall, ribbon, coinflip) escrowed by the `chomp` program and settled by a Rust referee; per-game `submit_score` leaderboards.
- **Own**: `pet-den` pets are on-chain accounts you create, care for, evolve and release; `sealed-house` loot is yours after you win a lot.
- **Trade**: `sealed-house` blind-bid auctions for vaults, with `sell_back` at 90%. The market UI (listings, collections, launchpad) is mock data for now.
- **Win**: winner takes the pot in staked matches (2.5% fee); sealed-house vault contents rolled by MagicBlock VRF.

- Live: <TBD>
- Demo video: <TBD>
- Deck: <TBD>

All on-chain parts are **devnet only**. Market pages use mock data with `?demo` (the marketplace program is not built yet, see Limitations).

## Try it

**No wallet** (open `/play/<slug>` signed out; the portal runs games in free mode, nothing on chain):

- `brawler`: "Practice vs bot" on the title screen.
- `keyfall`: "Practice" button.
- `monster-siege`: "VS AI" mode.
- `sealed-house`: mock chain, bots bid against you, session seed stands in for VRF.
- `pet-den`: in-memory copy of the program (same sim).
- `tomb-delve`, `eggmerger`: solo runs (eggmerger shows a mock 0.05 SOL pot).

**Devnet wallet**:

1. Connect. A burner keypair is created in the browser (`chomp:burner` in localStorage).
2. Fund it with the in-app faucet (0.2 SOL, rate limited).
3. Open or join a staked match in brawler / keyfall / ribbon / coinflip. No opponent within ~20 s in ribbon: the stake is cancelled/refunded and you race the bot unstaked (bots never touch money).
4. Win: the referee calls `settle`, the pot goes to the winner's wallet.
5. `sealed-house`: open a lot (VRF request), bid, settle, keep or `sell_back`. `pet-den`: create and care for a pet on chain.

## Games

| slug | type | on-chain | status |
|---|---|---|---|
| `brawler` | 1v1 fighter, rollback netcode, Rust referee | stake via `chomp` (open/join/settle) + score | staked e2e on devnet |
| `keyfall` | 1v1 typing duel | stake via `chomp` | staked e2e on devnet |
| `ribbon` | 1v1 trail racer | stake via `chomp` | staked e2e on devnet |
| `coinflip` | commit-reveal heads/tails | stake via `chomp` | staked e2e on devnet |
| `monster-siege` | 1v1 card/tower duel (html5) | score only (`submit_score`) | playable; referee key registered, staking not tested |
| `tomb-delve` | card dungeon extraction (Next export) | score only | playable |
| `eggmerger` | drop-and-merge physics puzzle, deterministic sim + Node replay referee | none yet: pot program (`enter_run`/`settle_run`), VRF seed and ER drops are TODO; not in `scripts/devnet-init.ts` registration list | free play only, mock pot; uncommitted (replaces `2048`) |
| `pet-den` | tamagotchi-style pets | own program `pet_den` (create, care, evolve, release) | playable on base layer |
| `sealed-house` | blind-bid vault auction | own program `sealed_house` (lot, bid, settle, sell_back) + MagicBlock VRF | playable on devnet |

Each game lives in `games/<slug>/` with `game.json` (portal manifest) and `INTAKE.md` (design + integration notes). The portal reads every `game.json` at build time.

## Solana + MagicBlock

- **`chomp` program** (`programs/chomp/`, Anchor): match escrow (`open_match`, `join_match`, `settle`, `cancel`) with a 2.5% fee, plus per-game `submit_score` leaderboard. A per-game referee key settles matches; anyone can `cancel`/refund after 2 h. Spec: `tasks/devnet-spec.md`.
- **`pet_den`, `sealed_house`**: standalone Anchor programs in `games/<slug>/program/`.
- **MagicBlock VRF: used for real** in `sealed-house` (vault contents rolled by the VRF callback on devnet).
  - Program: `games/sealed-house/program/src/lib.rs` (`ephemeral-rollups-sdk` 0.18 with `vrf` feature; `create_lot` requests randomness via `#[vrf]`, `fill_lot` is the `#[vrf_callback]` signed by the scoped VRF identity).
  - Client: `games/sealed-house/build/chain.js` sends `create_lot` to the devnet VRF queue and polls until the callback fills the lot.
- **MagicBlock Ephemeral Rollups: not used yet.** `pet-den` runs on the base layer. The Private ER path (delegation, gasless care, commit back on evolve) is kept in the program (`games/pet-den/program/src/lib.rs`: `#[ephemeral]`, `create_permission`, `delegate_pet`, `evolve_commit`) and `NEXT_PUBLIC_ER_RPC` is plumbed through the bridge (`er: true`), but it is not wired in the shipped flow.
- **Session keys: not used.** Only TODOs (`games/pet-den/program/src/lib.rs`, `games/tomb-delve/src/lib/chain.ts`).
- Marketplace spin via VRF and item trading are not implemented on chain (spin page is mock). Staked-match seeds come from the portal, not VRF.

### Devnet programs

| program | id | explorer |
|---|---|---|
| chomp | `4m5U9NJaLNyDzZj926jE9Y9nvKYJf82MQEcabbbGqcNf` | [view](https://explorer.solana.com/address/4m5U9NJaLNyDzZj926jE9Y9nvKYJf82MQEcabbbGqcNf?cluster=devnet) |
| pet-den | `2shkiB14DfoCSKawmYMv3qsGTBCxuN4onKQuztYyG2ue` | [view](https://explorer.solana.com/address/2shkiB14DfoCSKawmYMv3qsGTBCxuN4onKQuztYyG2ue?cluster=devnet) |
| sealed-house | `FGYiydgg6XWauRUq9eyMwHFuwJjG5TM2ndLNQVEJjfR4` | [view](https://explorer.solana.com/address/FGYiydgg6XWauRUq9eyMwHFuwJjG5TM2ndLNQVEJjfR4?cluster=devnet) |

## Built during Blitz vs ported

Blitz window: 2026-11-20 to 2026-11-27. All commits on this repo are dated 2026-11-23 or later.

**Ported** (commit `9857517`, 2026-11-23, "import brawler arena (NEAR snapshot)"): an earlier NEAR project, Brawler Arena. It brought the game clients/sims/servers for `brawler`, `keyfall`, `ribbon`, `coinflip`, a market shell, `agents/` and `infra/`. NEAR contracts, wallet and settlement were stripped in `bac167a`, `811aa2a`, `9d46b1b` (2026-11-23).

**Built during Blitz** (2026-11-23 to 2026-11-25, plus uncommitted work):

- `chomp` Anchor program (escrow + scores), burner wallet + faucet, portal iframe bridge, `crates/chain` referee settle (`c0e76c2`).
- Solana staking wired into the 4 ported games (`0fd97ef`, `11a938b`, `67ea8d4`, `73c3fde`).
- Plug-and-play portal and market v2 UI (`fa73b26`, `d40f286`, `b17f36b`).
- New games: `monster-siege` (`9de2f70`), `tomb-delve` (`9dd1309`), `pet-den` + `pet_den` program (`5ea4ee8`, `5519bca`, `47fcbf1`), `sealed-house` + `sealed_house` program with VRF (`259855d`, `ddac586`).
- `eggmerger` (not yet committed; replaces `2048`, which was added and then removed during Blitz).
- Render deploy for game servers (`5ca3485`).

## Wallet

- **Burner**: keypair in localStorage (`chomp:burner`), created on first connect. Fund it with the in-app faucet (`/api/faucet`, 0.2 SOL, rate limited).
- Inside a game iframe the wallet is a **bridge** to the portal's wallet (games never hold keys).
- **Privy** (embedded/external wallets) is implemented but hidden for now and untested; it needs `NEXT_PUBLIC_PRIVY_APP_ID`.

## Architecture

```
market (Next.js)  /play/<slug>  --sandboxed iframe-->  /g/<slug>/  (static game build)
        ^                                               |  window.Chomp (public/chomp-sdk.js)
        '------------- postMessage bridge ---------------'  connect | tx | rpc | pda | sign
market  /g/<slug>-ws/*  --rewrite-->  game server (Rust, referee)  --settle-->  chomp program
```

- **Sandbox**: iframe has an opaque origin (no cookies/localStorage, no access to the burner) and `/g` serves a CSP.
- **Bridge allowlist**: `tx` is rejected unless every instruction targets chomp / pet-den / sealed-house / MagicBlock programs / ComputeBudget. No raw SystemProgram transfers. Chomp instructions are bound to the game's slug. `rpc` is read-only methods only.
- **Referee servers** (brawler, keyfall, ribbon, coinflip): authenticate seats by an ed25519 signature from the wallet (`wallet.signBytes`), re-simulate / compute the result, and call `settle` with their own referee key. Finished match ids are tracked in memory.
- On a numeric `score` result the portal itself sends `submit_score` when signed in.
- Brawler/ribbon keep a deterministic Rust sim (golden-tested against the TS twin); the referee records a SHA-256 tape hash; `/replay/<id>` re-runs it.

| path | what |
|---|---|
| `market/` | portal + marketplace (Next.js, Tailwind, bun) |
| `programs/chomp/` | chomp Anchor program |
| `games/<slug>/` | game: `client/` or `build/` (served), `server/` (Rust), `program/`, `game.json`, `INTAKE.md` |
| `crates/chain/` | Rust RPC read, referee settle, ed25519 verify |
| `packages/platform/` | shared TS wallet (burner/Privy/bridge) + chomp helpers |
| `scripts/` | `devnet-setup.sh`, `devnet-init.ts`, `serve-games.ts`, golden vectors |
| `agents/` | bot service |
| `infra/` | Terraform, Ansible, Docker, Caddy (legacy EC2 deploy) |

## Run locally

Needs node, bun, Rust, Solana CLI + Anchor (to deploy programs).

**1. Devnet setup** (only to deploy your own programs; the ids above are already live). Needs a funded deployer at `~/.config/solana/id.json` and keypairs in `.keys/` (gitignored, never commit):

```sh
scripts/devnet-setup.sh            # fund faucet+referees, deploy 3 programs, init(250 bps), register all 9 games; prints env
scripts/devnet-setup.sh --only chomp
```

**2. Market**

```sh
cd market && bun install && bun dev          # http://localhost:3100  (?demo = mock market data)
```

**3. Games** (static builds served detached, so they survive market reloads)

```sh
npm install
npm run games                                # http://localhost:3200/g/<slug>/ ; proxies /g/<slug>-ws to servers
# market/.env.local: NEXT_PUBLIC_GAMES_ORIGIN=http://localhost:3200
```

**4. Game servers** (only needed for staked/online games; no `REFEREE_KEYPAIR` = free rooms only)

```sh
REFEREE_KEYPAIR=.keys/referee-brawler.json cargo run -p brawler-server --release   # :8787
REFEREE_KEYPAIR=.keys/referee-ribbon.json  cargo run -p ribbon-server              # :8788
REFEREE_KEYPAIR=.keys/referee-keyfall.json cargo run -p keyfall-server             # :8789
REFEREE_KEYPAIR=.keys/referee-coinflip.json cargo run -p coinflip-server           # :8791
cargo run -p monster-siege-server                                                  # :8790 lockstep relay for live 1v1 (free, no stakes)
```

Static client builds (`games/<slug>/build/`) come from each client's Next export (`npm run build -w <ws>`).

### Env vars

| var | where | what |
|---|---|---|
| `NEXT_PUBLIC_CHOMP_ID` | market | chomp program id |
| `NEXT_PUBLIC_PET_DEN_ID` | market | pet-den program id |
| `NEXT_PUBLIC_SEALED_HOUSE_ID` | market | sealed-house program id |
| `NEXT_PUBLIC_SOLANA_RPC` | market | RPC (default public devnet; it 429s, use a dedicated one) |
| `NEXT_PUBLIC_ER_RPC` | market | MagicBlock ER RPC (`https://devnet.magicblock.app`) |
| `NEXT_PUBLIC_GAMES_ORIGIN` | market | where game builds are served (empty = same origin) |
| `NEXT_PUBLIC_PRIVY_APP_ID` | market | enables Privy (hidden for now) |
| `FAUCET_KEYPAIR` / `FAUCET_SECRET` | market (server) | faucet key: file path (local) / keypair JSON (hosted) |
| `SOLANA_RPC` | market + servers | server-side RPC |
| `CHOMP_PROGRAM_ID` | servers | chomp program id |
| `REFEREE_KEYPAIR` | servers | path to `.keys/referee-<slug>.json` |
| `<SLUG>_SERVER` | market, serve-games | upstream for `/g/<slug>-ws` (e.g. `BRAWLER_SERVER`, `MONSTER_SIEGE_SERVER`), default `http://127.0.0.1:<port>` |

`.keys/` holds program, faucet and referee keypairs and is gitignored. Never commit it or print its contents.

### Tests

```sh
npm test && cargo test --workspace
node --experimental-strip-types scripts/golden.ts   # after any TS sim change, then cargo test
cd market && bunx tsc --noEmit -p . && bun run build
```

## Deploy

- **Market**: Vercel (Next, `output: standalone`). Set the env vars above and `FAUCET_SECRET`.
- **Game servers are not served by Vercel.** `render.yaml` is a Render Blueprint for brawler, keyfall, ribbon, coinflip, monster-siege (`infra/game-server.Dockerfile`, set `REFEREE_SECRET` in the dashboard; unset = free rooms only). Or host the Rust servers separately (one instance each, rooms are in-memory) and point the market at them with `<SLUG>_SERVER`, e.g. `BRAWLER_SERVER=https://brawler.example.com`. Game static builds must ship with the market (`games/*/build`) or from `NEXT_PUBLIC_GAMES_ORIGIN`.
- Legacy EC2/Caddy flow: `infra/README.md`.

## Known limitations

- Devnet only. Public devnet RPC rate-limits (429); use a dedicated RPC.
- Marketplace (listings, sales, offers, cart tx, spin) is mock data / stubs: no marketplace program or indexer yet. Buyer/seller, per-item sale history and tx links are missing.
- No ER usage; pet-den and sealed-house run on base layer.
- `sealed-house`: lot contents are readable on chain, so `sell_back` can be drained (decision pending). Bids use commit-reveal, not PER.
- `submit_score` is not verified on chain (client-reported); no fee withdraw instruction; deployer can swap a game's referee; finished match ids are in-memory only.
- Privy hidden (untested). Coinflip art still shows old NEAR glyphs. Portal doesn't forward `?room=` to the iframe; 390px iframe is small.
- Free play only for monster-siege, tomb-delve, eggmerger; no staking path. eggmerger pot is mock and it is not registered on chain yet.
- `scripts/devnet-init.ts` (run by `devnet-setup.sh`) still registers `2048` (removed) and not `eggmerger`.

## License

MIT, see [LICENSE](LICENSE).
