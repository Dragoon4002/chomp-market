# Brawler Arena

A real-time 1v1 platform fighter on NEAR testnet. Monsters are NEP-171 NFTs whose on-chain DNA sets their stats, skills are NEP-245 tokens that players trade and equip, and every staked match, spectator bet and tournament settles in a contract. Every result can be replayed and checked against the hash the referee posted on-chain.

- **Game:** https://13-54-190-122.sslip.io
- **Market:** https://market.13-54-190-122.sslip.io
- **Game server:** `wss://52-64-167-184.sslip.io` (AWS EC2, Caddy TLS; client + market on a second EC2 box)
- **Network:** NEAR testnet. **License:** MIT.

## Problem

Wagered online games ask players to trust the operator: that it holds the stakes, reports the real winner and pays out. Game items are usually database rows the player can't sell, lend or take elsewhere. Brawler Arena puts the money, the result and the items on NEAR:

- The game server never holds funds. It can only report a result, through a referee key.
- The result is reproducible. Anyone can re-run the input tape in the browser and compare its hash with the contract.
- Monsters and skills are tokens the player owns. They trade on a player-run market, can be rented out, and change how the monster fights.

## How to try it

Practice and watching need no wallet. Anything that moves NEAR needs a NEAR **testnet** wallet (HOT, Meteor, MyNearWallet or any wallet in the near-connect selector) with a little testnet NEAR.

1. **Practice vs bot (no wallet).** Open `<game url>` → press **Practice vs bot** → you fight a local bot. Keys: WASD move, Space jump, J light, K heavy, L block, C dodge (full table in [Controls](#controls)).
2. **Host a room and call a bot.** Press **Play** → create a free room → in the room lobby press **Call bot** → a bot joins with a "bot" chip, says hi in chat → press **Start** → you fight it online through the server (rollback netcode, server referee).
3. **Get monsters.** Connect wallet → **Monsters** → **Claim 3 starter monsters** (one-time, 0.1 NEAR storage deposit, excess refunded) → three gen-0 monster NFTs appear with stat bars from their DNA, plus 3 starter skill units.
4. **Staked room.** Click **Balance** in the header → deposit testnet NEAR into your platform balance → **Play** → create a room with a stake and pick a monster → a second wallet joins with the same stake → fight → the winner's balance gets 2× stake minus 0.1% fee. The monster is locked for the match (it can't be sold or transferred until it ends).
5. **Spectator betting.** From a second browser, open **Lobby** → **Watch** a live bettable room → the betting card shows live order-book prices per fighter → buy a side → after the fight, **Account → Claims** shows the payout to claim.
6. **Verify a replay.** **Account → History** (or a player profile) → **Replay** on any finished match → `/replay/<id>` re-runs the tape locally → the **Fairness check** panel shows ✓/✗ for the re-run winner, the tape hash vs the server record, and the tape hash vs `tape_hash` stored on the platform contract for that match.
7. **Customize skills.** **Skills** (or **Customize** on a monster) → pick a monster → put up to 3 owned skills in its slots → live stat preview → **Save** sends one `equip` transaction → the next chain match uses those skills (the server reads them from `get_monster`, not from the client).
8. **Market.** Open `<market url>` → home shows top skill (24h), hottest monster, live presale → open a skill → buy from a presale or from a player listing → **Me** lists your skills; list free units for sale, cancel listings, withdraw owed proceeds. Creators (allow-listed by the contract owner) publish collections, skills and presales at **Create**. `?demo` runs the market on mock data without a wallet.
9. **Sell, rent, breed monsters.** Open a monster (**Monsters** → click it) → **Sell or rent out** sets a price or a daily rent → another wallet buys or rents it from the same page; a renter can fight with it until the rental ends but can't sell, transfer or re-equip it. Breeding (`/breed`, 0.1 NEAR, 1 h cooldown, child mixes parents' DNA) and the in-game monster market (`/market`) work by URL; their hub buttons show "Soon". Monster listings also appear on the market app.
10. **Tournaments.** **Cups** → create or enter a 4/8-player bracket with an entry fee → bracket advances as matches settle → winner claims the pot (`claim_tournament`).

## Games With Real Economies track

| Track asks for | What we built |
|---|---|
| Player-owned markets | Monsters: in-contract `list` / `buy`, 2.5% fee, 5% royalty to the breeder. Skills: `list_skill` / `buy_skill` with partial fills, creator royalty (≤10%), `price_history` on-chain (last 64 trades) for charts. Creators run presales (window, total cap, per-wallet cap, allowlist). The market app reads contract views directly, no indexer. |
| NEP-245 | Skills are a hand-rolled NEP-245 multi-token in the monsters contract: token id `skill:<id>`, `mt_transfer`, `mt_batch_transfer`, `mt_balance_of`, `mt_supply`, `mt_token`, `mt_mint` / `mt_transfer` events. |
| Economy affects gameplay | Equipped skills change the fight. Stat skills add to DNA stats before `stat_mods` (≤ +2 per stat, ≤ +3 total, max 3 skills). Effect skills: Air Jump (3 air jumps), Lifesteal (heal dealt/5), Quick Dodge (dodge cooldown −1/3), Second Wind (heal 30 once per stock at ≤50 HP). Same rules in the TS sim and the Rust referee, golden-tested. |
| Provable fairness | Deterministic sim (no randomness, no clock, no trig). The referee re-simulates the confirmed tape, posts winner + SHA-256 tape hash on-chain; `/replay/<id>` recomputes both in the browser. |
| Agents / NPCs | Bots (`agents/`) join free rooms on "Call bot" and play over the normal client protocol; a commentator posts play-by-play in chat. Bots never touch money. |
| Players never notice the chain | Practice, watching and free rooms need no wallet. Stakes come from one in-contract balance, so a match is one call, not a transfer per round. |
| NEAR Intents | **Balance** → **Add funds from any chain**: pick a token from the live 1Click `/v0/tokens` list (USDC on Base/Arbitrum/Solana, ETH, BTC, SOL first), enter an amount, get a live `dry: true` 1Click quote to NEAR (send, receive, fees, ETA). Funding is off: Intents runs on mainnet only (no testnet) and the game is on testnet, so no deposit address is generated. Browser calls 1Click directly (CORS open, no API key). |

## NFTs That Do Something track

| Track asks for | What we built |
|---|---|
| NEP-171 | Monsters are NEP-171/177/181 NFTs (`nft_transfer`, `nft_token`, `nft_tokens_for_owner`, metadata). |
| Dynamic NFTs | DNA is generated on-chain (`hatch_starters`, `breed` mixes parents' DNA) and sets fight stats. The token keeps changing after mint: win/loss/KO record, match history (last 50), season wins, titles, equipped skills, rental and lock state. |
| Hold inventory | The skill loadout is stored on the monster. Equipped units leave the owner's free balance and travel with the monster on `nft_transfer` and `buy`; the new owner can unequip them into their own balance. |
| Access rights | Rental: `offer_rent` / `rent(days)`. For the rental period the renter may enter matches with the monster (the platform's `lock` accepts the renter); the owner can't sell, transfer or re-equip it, and the renter can't either. |
| Ownership with behavior | While a monster fights, the platform locks it (`lock` until the match ends): no transfer, sale, breed or equip. `report_result` unlocks it and writes the result to the token. |
| Earn royalties | Breeder gets 5% of every resale of a monster it bred; skill creators get their royalty on every skill resale and presale proceeds via `owed` / `withdraw_owed`. |

## Contracts (testnet)

| Contract | Account | What it does |
|---|---|---|
| Platform | [`v3.brawler-platform-5c8e2b.testnet`](https://testnet.nearblocks.io/address/v3.brawler-platform-5c8e2b.testnet) | balances, staked matches, signed settle, order-book spectator market, tournaments, per-game referee |
| Monsters + skills | [`v2.brawler-monsters-5c8e2b.testnet`](https://testnet.nearblocks.io/address/v2.brawler-monsters-5c8e2b.testnet) | monster NFTs (hatch, breed, list/buy, rent, match locks) plus NEP-245 skills (presales, skill market, `equip`) from `games/brawler/contract` |
| Referee | [`referee.v2.brawler-platform-5c8e2b.testnet`](https://testnet.nearblocks.io/address/referee.v2.brawler-platform-5c8e2b.testnet) | the game server's key; signs results (v3) / reports them (v2) |
| Platform owner | [`brawler-platform-5c8e2b.testnet`](https://testnet.nearblocks.io/address/brawler-platform-5c8e2b.testnet) | registers games, owns the monsters contract, creator of the "Arena Basics" skills |

Superseded: platform v1 `brawler-platform-5c8e2b.testnet`, platform v2 `v2.brawler-platform-5c8e2b.testnet`, monsters v1 `brawler-monsters-5c8e2b.testnet`. Deploy and end-to-end transaction log: [`contracts/DEPLOYMENTS.md`](contracts/DEPLOYMENTS.md). Skills interface: [`games/brawler/plans/skills-interface.md`](games/brawler/plans/skills-interface.md).

## What's on-chain

| On-chain | Off-chain |
|---|---|
| Deposits, withdrawals, in-contract balance | Live fight inputs (WebRTC P2P, or WebSocket relay) |
| Match stakes, escrow, payout (`create_match`, `join_match`, `settle` / `report_result`) | Room lobby, chat, matchmaking |
| Guest refund before the fight (`unjoin`), voids and expiry | Rendering, sound |
| Spectator prediction market: order book, `place_order`, `cancel_order`, `claim` | Full input tapes (served at `/tape/<id>`) |
| SHA-256 hash of every settled match's input tape (`tape_hash`) | Free friendly matches |
| Tournaments: entry, bracket advance, `claim_tournament` | Bots |
| Monster NFTs, DNA, breeding, sales, rentals, lock during a match | |
| Skill tokens, presales, skill listings, price history, loadouts | |

## How we use NEAR

- **Escrow without trust:** stakes and bets live in the platform contract. The game server never holds funds: it signs the result off-chain with its referee key and the winner's own `settle` tx posts it (verified with `ed25519_verify`), so the referee spends no gas; it falls back to `report_result` only if nobody settles within 5 min.
- **Provable fairness:** the sim is deterministic. The referee re-simulates both players' inputs, reports the winner and the tape's SHA-256 on-chain. Anyone can open `/replay/<id>`: the browser re-runs the tape, recomputes the hash and checks both against the contract.
- **Prediction markets per fight:** each bettable match (staked or free) gets a binary order book: shares of "A wins" / "B wins", 0.01 NEAR face value. Every fill pairs two real traders, no house money, so colluding fighters have nothing to drain.
- **NFT gameplay assets:** monster stats come from on-chain DNA, and the NFT is locked while it fights, so it can't be sold mid-match.
- **Assets the game reads:** the server reads DNA and equipped skills from `get_monster` at match start. Client-claimed stats are never trusted.
- **What moves with a monster on transfer:** the NFT carries its DNA, record, titles and fight history; the new owner gets all of it. A monster that is locked in a match or rented out can't be transferred, listed or bred, so the seller can't sell it mid-fight or while a renter holds it. A transfer clears any sale listing and rent offer, so the old owner can't collect on it afterwards. In-contract sales pay 5% royalty to the breeder (gen > 0) and 2.5% to the treasury (`games/brawler/contract/README.md`).
- **One balance across games:** the platform registers games with their own referee; Brawler is the first.
- **Wallet only when money moves:** Practice vs bot and watching need no wallet.

## Built during the hackathon

Hackathon window: 2026-10-19 → 2026-11-14 (Q-001). The first commit in this repository is 2026-11-11 (`git log --reverse --date=short`) and no commit predates 2026-10-19, so there is **no pre-hackathon baseline**: the whole history is hackathon work.

Libraries and tools used (Q-005):

- TS: Next.js 16, React 19, `near-api-js` 7, `@hot-labs/near-connect` + `near-connect-hooks` (wallet selector), Tailwind 4 (market), bun (market), TypeScript.
- Rust: `near-sdk` / `near-contract-standards` 5.30 (contracts), `cargo-near`, `axum` (WebSocket server), `near-api` (referee RPC), `sha2`, `serde`, `rand`, `ethnum`.
- Infra: Terraform, Ansible, Docker, Caddy on two EC2 boxes (server, clients); UI art in Vercel Blob.
- Art and video: Blender (`games/brawler/sprites/*.blend`), Remotion (`games/brawler/video/`); Godot 4 for the experimental `games/brawler/godot/` client.
- AI-assisted code: most code was written with AI coding agents (Claude Code), directed and reviewed by the team. Plans and specs the agents worked from are in `games/brawler/plans/` and `tasks/`.

## Features

- Practice vs bot, no wallet, keyboard / gamepad / touch.
- Online rooms: public or private, free or staked, spectators, chat, rematch.
- Rollback netcode (P2P with relay fallback); reconnect to a fight within 30 s.
- Live spectator market with price chart.
- Tournaments (4/8 players), leaderboard by wins and NEAR won, player profiles and match history with replays.
- Monsters: hatch starters (with 3 starter skill units), breed, sell, rent.
- Skills: equip up to 3 on a monster; buy, sell and publish them on the market app.
- Bots: press "Call bot" in a free room and a bot joins, marked with a "bot" chip (`agents/`).

## Try it (judges)

1. Open https://13-54-190-122.sslip.io and press "Practice vs bot". You fight a bot right away, no wallet needed.
2. Connect a NEAR testnet wallet and host a free room, then press "Call bot" and a bot joins. For a staked room, join as the guest from a second browser with another wallet (bots only play free rooms). The stake moves into the platform contract (`create_match` / `join_match`).
3. Open the lobby in another browser and watch the room. Buy a side in the live prediction market and watch the price chart move as orders fill.
4. Finish the fight. The winner's `settle` tx posts the referee-signed result (fallback: referee `report_result` after 5 min), the pot goes to the winner's in-contract balance, and spectators `claim`.
5. Open `/replay/<match id>`. Your browser re-runs the input tape, recomputes its SHA-256 and checks both the hash and the winner against the contract.
6. Go to Monsters: hatch starters, breed two of them, list one for sale or rent. Each one's record and titles update on-chain after it fights.

## Hackathon

Built at NEAR HACKATHON (2026-11-01 to 2026-11-14). The first commit is 2026-11-11; all code was written during the hackathon. There is no pre-hackathon baseline and no other project by the same team.

| Track | What fits |
|---|---|
| `games` | Player-owned markets (monster sales and rentals, a prediction market per fight), staked matches, tournaments; order-book prices move with demand, no dev patch. |
| `nfts` | NEP-171/177/181 monsters with dynamic on-chain state (DNA, win/loss record, titles, fight history), breeder royalties on resale, rentals, and a lock while the monster fights. |
| `open` | Provably fair real-time fights: a deterministic sim plus the on-chain tape hash, re-checkable in any browser. |

NEP-245 skill tokens (`games/brawler/contract/src/skills.rs`) are deployed on the testnet monsters contract `v2.brawler-monsters-5c8e2b.testnet` (12 skills seeded, see `contracts/DEPLOYMENTS.md`).

### Built with

- **NEAR:** `near-sdk`, `near-contract-standards` (NEP-171/177/181), `near-api` (Rust), `near-api-js`, `@hot-labs/near-connect` + `near-connect-hooks` (wallet, NEP-413 sign-in).
- **Client:** Next.js, React. Market app: Next.js, Tailwind, bun.
- **Server:** Rust `axum`, `tokio`, `tokio-tungstenite`, `serde`.
- **Tooling:** Godot (experimental port in `games/brawler/godot/`), Remotion (moveset video), Blender + Python (sprites), Terraform, Ansible, Docker, Caddy.
- **AI:** most code was written with Claude Code (Anthropic) as the coding agent, under human direction and review.
- No game templates or boilerplate were used.

## Repo

| Path | What |
|---|---|
| `games/brawler/client/` | game client (Next.js) |
| `games/brawler/server/` | Rust WebSocket server: relay, lobby, referee, tapes, history |
| `games/brawler/sim/` | Rust port of the sim, golden-tested against the TS sim |
| `games/brawler/contract/` | monsters + skills contract (NEP-171 + NEP-245) |
| `games/ribbon/client/` | Ribbon Rush client (Next.js) |
| `games/ribbon/server/` | Ribbon Rush Rust WebSocket server: authoritative sim, referee, tapes |
| `games/ribbon/sim/` | Ribbon Rush Rust sim, golden-tested against the TS twin |
| `games/keyfall/client/` | Keyfall client (Next.js); `src/lib/game.ts` runs the rules locally for practice |
| `games/keyfall/server/` | Keyfall Rust WebSocket server: authoritative rules, rooms, referee |
| `games/coinflip/client/` | Coinflip client (Next.js); commit-reveal flip in `src/lib/flip.ts` |
| `contracts/platform/` | platform contract |
| `crates/near-svc/` | Rust NEAR RPC, NEP-413 verify, referee tx queue |
| `packages/platform/` | shared TS wallet + balance hooks |
| `agents/` | bot service |
| `market/` | skill + monster marketplace (Next.js + Tailwind, bun) |
| `scripts/` | testnet deploy (`deploy-monsters-v2.mjs`), skill seed (`seed-skills.mjs`), e2e (`testnet-e2e.mjs`), golden vectors |
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

- Server env: `PORT NEAR_RPC CONTRACT_ID MONSTERS_ID REFEREE_ID REFEREE_KEY SETTLE_FALLBACK_S` (default 300). No CONTRACT_ID = free rooms only. Attestations only when the contract's `referee_key` is REFEREE_KEY's public key, else direct `report_result`.
- Room lobby: a staked guest who leaves before the host presses Start frees the seat; referee `unjoin` refunds their stake and reopens the match (rejected once bets exist).
- Client env (build-time): `NEXT_PUBLIC_SERVER_URL` (default: same origin), `NEXT_PUBLIC_PLATFORM_ID`, `NEXT_PUBLIC_MARKET_URL`, `NEXT_PUBLIC_MONSTERS_ID`, `NEXT_PUBLIC_ASSET_URL`. Market: `NEXT_PUBLIC_ASSETS_ID`, `NEXT_PUBLIC_PLATFORM_ID`, `NEXT_PUBLIC_BRAWLER_URL`, `NEXT_PUBLIC_DEMO=1`.
- Golden vectors: `node --experimental-strip-types scripts/golden.ts` after any TS sim change, then `cargo test`.
- Contracts: `make wasm`; `node scripts/deploy-monsters-v2.mjs --check` prints the balance preflight, without `--check` it deploys, registers the game and seeds skills.
- New game: `games/<id>/{client,server}`, `register_game(id, referee, assets?, referee_key?)` on platform.

## Ribbon Rush

Second game on the same platform contract (id `ribbon`). Two riders on a grid leave trails; trails fade, the ring closes in, each rider gets one boost per round, best of 3. Registered with no assets contract, so no NFTs and no tournaments; staked and bettable matches work. The server runs the sim authoritatively and its referee reports the winner and tape hash on-chain.

- Server env: `PORT` (8788) `NEAR_RPC CONTRACT_ID REFEREE_ID REFEREE_KEY TAPE_DIR`. Prod: `wss://ribbon.<domain>`.
- Client env: `NEXT_PUBLIC_SERVER_URL`, `NEXT_PUBLIC_MARKET_URL`. Demo: http://localhost:3001/?demo

## Keyfall

Third game on the platform contract (id `keyfall`): a 1v1 typing duel. Both players get the same seeded stream of words falling down their own lane. Type a word and press Space or Enter to destroy it, and your opponent loses health equal to its length. A word that reaches your base costs you its length. Three wrong submissions in a row stun you for 2 s. Each player starts with 600 HP and the match lasts 5:00. At 0 HP you lose; when time runs out, higher HP wins, then higher WPM, otherwise it's a draw and stakes are refunded.

- The server owns the clock, the word stream, health and WPM. Clients only send the words they type (at most 20 per second), so a client can't fake hits or damage.
- Staked rooms: the host calls `create_match("keyfall", stake, false, null)` and the guest calls `join_match`. Each seat proves its wallet with a NEP-413 signature of `keyfall:<matchId>` over the server's nonce. Only the referee settles, with `report_result(match_id, winner, null, null)`; a draw is reported as `winner: null`, which refunds both stakes.
- A disconnected player has 15 s to rejoin (the words keep falling); after that the opponent wins by forfeit.
- No assets contract, no spectator betting UI, no tournaments yet. Practice vs bot (easy/medium/hard) and `?demo` run the rules in the browser with no wallet or server.
- Server env: `PORT` (8789) `NEAR_RPC CONTRACT_ID REFEREE_ID REFEREE_KEY`. Prod: `wss://keyfall.<domain>`. Client env: `NEXT_PUBLIC_SERVER_URL`, `NEXT_PUBLIC_MARKET_URL`.
- Rules and protocol: `tasks/keyfall-spec.md`.

## Coinflip

Fourth game, built for the platform contract (game id `coinflip`; no `register_game` recorded in `contracts/DEPLOYMENTS.md` yet): staked heads-or-tails rooms (`create_match` / `join_match`, no monsters, no betting). Commit-reveal: the server commits `sha256(seed)` before the flip, the result is `sha256(seed ‖ clientSeed)[0] & 1`, so either player can check it. Client only in this repo (expects a server at `?server=`, default `http://localhost:8790`); `?demo` runs everything in the browser.

## Deploy

Two EC2 boxes behind Caddy TLS: **server** runs the game server and bots (rooms are in-memory, so exactly one instance); **clients** runs the game client and market (Next standalone). Domains are `<eip>.sslip.io`, no DNS setup. Needs `terraform`, `ansible`, `jq`, docker buildx, AWS creds. Details in `infra/README.md`.

```sh
cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars   # set ssh_cidr
make deploy-infra                     # 2x EC2 + EIP + SG
export REFEREE_KEY=...                # referee private key (CONTRACT_ID/MONSTERS_ID/REFEREE_ID have defaults)
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
- **Server**: relays inputs, records the confirmed tape, re-simulates it as referee, signs the result + tape hash for on-chain `settle` (fallback: reports it), and serves history and tapes.

## License

MIT, see [LICENSE](LICENSE).
