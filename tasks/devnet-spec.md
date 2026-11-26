# Devnet spec (shared contract between parallel agents) — 2026-11-24

Network: Solana **devnet**. RPC `https://api.devnet.solana.com` (env `SOLANA_RPC` / `NEXT_PUBLIC_SOLANA_RPC`).
MagicBlock devnet ER: `https://devnet.magicblock.app` (env `NEXT_PUBLIC_ER_RPC`).
Keys live in `/.keys/` (gitignored, NEVER commit, never print secret bytes). Deployer = `~/.config/solana/id.json` (HbseebKe6kTNeMEWHxB2rCqR16AV8BCmVnp8Y19zCM6Q).

| key | pubkey | file |
|---|---|---|
| chomp program | `4m5U9NJaLNyDzZj926jE9Y9nvKYJf82MQEcabbbGqcNf` | `.keys/chomp.json` |
| pet-den program | `2shkiB14DfoCSKawmYMv3qsGTBCxuN4onKQuztYyG2ue` | `.keys/pet_den.json` |
| sealed-house program | `FGYiydgg6XWauRUq9eyMwHFuwJjG5TM2ndLNQVEJjfR4` | `.keys/sealed_house.json` |
| faucet wallet | `6xsSHCPLVxs67fWYSqvhpXTjke1JtNMyENTNirh9N885` | `.keys/faucet.json` |
| referee brawler | `FzdGvCBbZPdCorBUuL9ttYoVgXqmZnGfVJh5KKvjNsCd` | `.keys/referee-brawler.json` |
| referee keyfall | `Dr1HKPprNX8Pw3PGQqcKJL386JnaJC5RCBz5vzZF3K7T` | `.keys/referee-keyfall.json` |
| referee coinflip | `4R7VK5F1XQKXW4WCSa7VY2VSVrzqVn4DQgNuHWj1J9fd` | `.keys/referee-coinflip.json` |
| referee ribbon | `89aRdvkLHTKENHqXMa2qAW6fTohrxgCffTwdbZjKMSTr` | `.keys/referee-ribbon.json` |
| referee monster-siege | `HTaKsvFSvuCr6uwwSYCBMYE1x4U3gzaTbiU3ouC68Y4b` | `.keys/referee-monster-siege.json` |

## 1. `chomp` program (`programs/chomp/`, Anchor 1.0.2 standalone crate like `games/sealed-house/program`)
Anchor encoding: ix data = `sha256("global:<ix_name>")[..8]` ‖ borsh args. Account data = `sha256("account:<Name>")[..8]` ‖ borsh fields. Pubkey = 32 bytes, u64/i64 LE, String = u32 len ‖ utf8.

Accounts (PDAs of chomp program):
- `Config` `["config"]`: `authority: Pubkey, fee_bps: u16, bump: u8`. Its lamports above rent = house vault (fees).
- `Game` `["game", slug_utf8]`: `slug: String (<=16), referee: Pubkey, bump: u8`.
- `Match` `["match", game_pda, id_u64_le]`: `game: Pubkey, id: u64, a: Pubkey, b: Pubkey (Pubkey::default() = open seat), stake: u64, created: i64, bump: u8`. Stake lamports held in the Match PDA. Closed (rent → a) on settle/cancel, so "account missing" = finished.
- `Score` `["score", game_pda, player]`: `best: u64, last: u64, plays: u32, tape: [u8;32], bump: u8`.

Instructions (accounts in this order):
| ix | args | accounts | rule |
|---|---|---|---|
| `init` | `fee_bps: u16` | authority (signer, mut), config (mut), system_program | once |
| `register_game` | `slug: String, referee: Pubkey` | authority (signer, mut), config, game (mut, init_if_needed), system_program | authority == config.authority; re-call updates referee |
| `open_match` | `id: u64, stake: u64` | a (signer, mut), game, match (mut, init), system_program | stake >= 0; transfers stake a → match |
| `join_match` | — | b (signer, mut), match (mut), system_program | seat open, b != a; transfers stake b → match |
| `settle` | `winner: u8` (0 = a, 1 = b, 2 = draw/refund) | referee (signer), game, match (mut, close = a), a (mut), b (mut), config (mut) | referee == game.referee, seat b filled. pot = 2·stake, fee = pot·fee_bps/10000 → config, rest → winner. draw: refund both, no fee |
| `cancel` | — | caller (signer), match (mut, close = a), a (mut), b (open seat: pass `11111111111111111111111111111111`; filled: match.b writable) | caller == a and seat open → refund a; OR now > created + 7200 → refund both (anyone) |
| `submit_score` | `score: u64, tape: [u8;32]` | player (signer, mut), game, score (mut, init_if_needed), system_program | plays += 1, last = score, best = max |

Events: none (YAGNI). Fee default 250 bps.
Registered games (slug → referee): brawler, keyfall, coinflip, ribbon, monster-siege → their referee key above; `2048`, `tomb-delve`, `pet-den`, `sealed-house` → referee = authority (deployer), score only.

## 2. Wallet (`packages/platform`, TS, `@solana/web3.js` v1)
`Wallet` keeps old shape so callers compile: `signedAccountId` = base58 pubkey ('' signed out), `loading`, `network: 'devnet'`, `signIn()`, `signOut()`, `getBalance(pubkey) → bigint lamports`, plus new:
- `kind: 'burner' | 'privy' | 'bridge' | ''`
- `sendIxs(ixs: Ix[], opts?: { er?: boolean }) → Promise<string /*sig*/>`
- `signBytes(msg: Uint8Array) → Promise<Uint8Array /*64-byte ed25519 sig*/>`
- `Ix = { programId: string; keys: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string /*base64*/ }`
- Impl picked at runtime: inside an iframe (`parent !== window`) → **bridge** (postMessage to portal, below); else burner (keypair in localStorage `chomp:burner`) or Privy (`NEXT_PUBLIC_PRIVY_APP_ID` set).
- `chomp.ts` helpers exported from `@xyz/platform`: `CHOMP_ID`, `pda.{config,game,match,score}`, `ix.{openMatch,joinMatch,settle,cancel,submitScore}` returning `Ix`, `readMatch(game, id) → {a,b,stake,created}|null`, `readScore(game, player)`, `randomMatchId() → bigint`.
- Amounts: lamports. `UNIT = 'SOL'`, `fmt(lamports)`, `toLamports('0.1')`. Keep `toYocto`/`fmt` names as aliases so old callers compile (`toYocto` = toLamports).
- Faucet: `requestFaucet(pubkey)` → `POST ${MARKET_URL}/api/faucet {pubkey}`.

## 3. Portal bridge (market play page ⇄ game iframe), extends `chomp-sdk.js`
Messages all carry `{ chomp: 1, type, data }`.
- game → portal `type: 'req'`, `data: { id: number, method, params }`; portal → game `type: 'res'`, `data: { id, ok: boolean, value?, error?: string }`.
- methods:
  - `connect` → `{ wallet }` (asks portal to sign in if signed out)
  - `tx` params `{ ixs: Ix[], er?: boolean }` → signature. Portal signs + sends with the user's wallet. **Portal rejects any ix whose programId is not in the allowlist** (chomp, pet-den, sealed-house, MagicBlock delegation/permission/VRF program ids, ComputeBudget). No raw SystemProgram transfers from games.
  - `rpc` params `{ method, params, er?: boolean }` → JSON-RPC `result`. Read-only allowlist: getAccountInfo, getMultipleAccounts, getProgramAccounts, getBalance, getSignatureStatuses, getSlot, getLatestBlockhash.
  - `pda` params `{ programId, seeds: Seed[] }` → `{ address, bump }`; `Seed = { s: string } | { pk: string } | { u8: number } | { u64: string } | { hex: string }`.
  - `sign` params `{ message: string /*utf8*/ }` → base58 64-byte signature (seat auth for game servers).
- SDK (`window.Chomp`) adds: `Chomp.connect()`, `Chomp.tx(ixs, {er})`, `Chomp.rpc(method, params, {er})`, `Chomp.pda(programId, seeds)`, `Chomp.sign(message)` — each returns a Promise resolved by the matching `res`.
- Session now: `{ wallet, network: 'devnet', mode, stake, seed, programs: { chomp, petDen, sealedHouse } }`.
- On `match:result` with numeric `score`, the portal itself sends `submit_score(<slug>, score, tapeHash→32 bytes or zero)` when signed in (generic on-chain leaderboard for every game).

## 4. Game servers (`crates/chain`, Rust)
`Chain::from_env(game_slug)`: env `SOLANA_RPC` (default devnet), `CHOMP_PROGRAM_ID` (default above), `REFEREE_KEYPAIR` (path; unset = free rooms only, `enabled() == false`).
- `async fn match_info(&self, id: u64) -> Option<MatchInfo { a: String, b: Option<String>, stake: u64, created: i64 }>`
- `async fn settle(&self, id: u64, winner: u8, pair: &[String; 2]) -> Result<String /*sig*/, String>` (confirmed)
- `fn verify_sig(pubkey_b58: &str, message: &[u8], sig_b58: &str) -> bool` (ed25519)
- Seat auth: client calls `wallet.signBytes(utf8(message))`, sends `{ account: pubkey, sig: base58 }`; server checks `verify_sig` and that `account` is `a`/`b` of the match.
- Old methods (`view`, `verify_auth`) may be removed once callers are migrated.

## 5. Setup script (`scripts/devnet-setup.sh` + `scripts/devnet-init.ts`)
Idempotent: fund faucet (2 SOL) + each referee (0.05 SOL) from deployer, deploy chomp / pet-den / sealed-house with `.keys/*.json` as program ids, `init(250)`, `register_game` for every slug. Prints env lines to paste into `market/.env.local` and server env.

**Deployed** chomp on devnet; Config PDA `MtaUB6EcA2K7exQKtk6k2uoChDmsQL1i935JVx11BNn`; all 9 games registered. Game data: referee at offset `12 + slug.len()`. No fee withdraw ix yet.

## 6. Server auth protocol (from agent C)
All sigs: `sig = base58(wallet.signBytes(utf8(message)))` (64-byte ed25519), sent as top-level field `sig` next to `account` (base58 pubkey). Old `auth` field is gone. `matchId` = Match PDA u64 id, sent as a JSON number. **`randomMatchId()` must stay < 2^53** (servers echo matchId as a JSON number; brawler only parses numbers). Free rooms (no `matchId`, or server without `REFEREE_KEYPAIR`) unchanged, `sig` ignored. Referee calls `settle(id, winner, &[a, b])` on result (0 = a, 1 = b, 2 = draw/void): re-reads match, refuses if seats changed, confirms ≤30 s with 2 rebroadcasts; fallback is `cancel` 2 h after join (`join_match` resets `created`). Servers reject finished match ids (in-memory set).
| server | msgs carrying sig | message signed | seat rule |
|---|---|---|---|
| brawler (ws) | `host`, `join`, `match`, `rejoin` (staked only) | `chomp:brawler:<matchId>:<hello.nonce>` (nonce = base64 string exactly as in `hello`) | host: account = a (open match before hosting); join: account = b (call `join_match` before `join`); match: a→seat 0, b→seat 1, b filled. Chain room stake = Match.stake (lamports, string). `match` takes optional `pub`; `bettable` always false on chain rooms. Monster NFT DNA/skills lookup removed (skills = []). |
| keyfall (ws) | `host`, `join` (staked) | `chomp:keyfall:<matchId>:<hello.nonce>` (base64 as sent) | host = a, join = b. `rejoin` still uses seat `token`. |
| ribbon (ws) | `auth {matchId, account, sig}` | `chomp:ribbon:<matchId>:<hello.nonce>` (hex as sent) | a→seat 0, b→seat 1, b must be filled |
| coinflip (http) | `POST /room {matchId, account, side, sig}`, `POST /flip {matchId, account, clientSeed, sig}` | `coinflip:<matchId>:<side>` / `coinflip:<matchId>:<clientSeed>` (no nonce) | room: account = a (b may be open); flip: b filled, account ∈ {a,b}; winner = result == side ? 0 : 1 |
Server env: `SOLANA_RPC`, `CHOMP_PROGRAM_ID`, `REFEREE_KEYPAIR=.keys/referee-<game>.json`.
