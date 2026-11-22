# Platform integration guide (wallet, rooms, market)

Reference for any session building a game on this platform. Brawler (`games/brawler`) is the reference implementation; copy its patterns. Paths are repo-relative. Verified against code on 2026-11-15 (after merge of main into `image`).

If you are adding game `<id>`, the checklist is at the bottom (§5).

---

## 1. Wallet button + sign-in

### 1.1 Shared package: `@xyz/platform` (`packages/platform/index.ts`)
Every game client imports wallet + balance from here. Do NOT add another wallet lib.

| Export | What |
|---|---|
| `NearProvider` | from `near-connect-hooks`. Wrap app: `<NearProvider config={{ network: NETWORK }}>` |
| `useNearWallet()` | wallet ctx. Returns `WalletOverride` value if set (social login), else base wallet. Always use this, never `useBaseWallet` directly |
| `WalletOverride` | React context; social login provides a replacement signer through it |
| `NETWORK` | `'testnet'` |
| `PLATFORM_ID` | env `NEXT_PUBLIC_PLATFORM_ID`, default `v3.brawler-platform-5c8e2b.testnet` |
| `MARKET_URL` | env `NEXT_PUBLIC_MARKET_URL`, default `http://localhost:3100` |
| `GAS` | 30 Tgas |
| `toYocto`, `fmt` | NEAR <-> yocto helpers |
| `usePlatform()` | `{ w, call(method, args, deposit='0', gas), view, balanceOf, deposit(yocto), withdraw(yocto) }` against platform contract. `call` fires `balanceChanged()` |
| `useBalance()` | `{ balance: yocto\|null, refresh }`; platform `balance_of`, polls 15 s + refetches on `balanceChanged()` |

Peer deps: `near-api-js ^7.2`, `near-connect-hooks ^1.1.6`, `react 19`.

Money model: players hold a **unified balance on the platform contract** (`deposit` / `withdraw` / `balance_of`). Stakes and bets are debited from it, so match calls need no per-call NEAR transfer. Spend calls attach 1 yocto (forces full-access-key signature).

### 1.2 The button (brawler)
- Header: `games/brawler/client/src/components/Title.tsx:37-38`
  - balance chip (button) → opens `FundsDialog`
  - wallet chip `<a className="hub-count wallet" href="/account">` showing `short(accountId)` or "Connect wallet"
- Account page: `components/account/Account.tsx`: Sign in / Disconnect, game balance + wallet balance, deposit/withdraw, `withdrawOwed` (market sale proceeds).
- Provider tree: `components/App.tsx:74-83`: `<NearProvider config={{network: NETWORK}}><SocialProvider>…`
- Short ids: `lib/format.ts:5` `short(a)`: 64-hex implicit id → `abc...xyz`; >22 chars → 20 + `…`. Use it; never show raw implicit ids.

### 1.3 Game-specific wallet hooks (brawler `lib/near.ts`)
- `GAME = 'brawler'`, `CONTRACT_ID = PLATFORM_ID`
- `useWallet()` (:103): wallet or fake under `?demo`
- `useArena()` (:37): `{ ready, account, signIn, createMatch(bettable, stakeYocto, monsterId?) → matchId|null, joinMatch, settle, claim, expire, … }`. Gas 30 Tgas, 100 Tgas if NFT locked, 150 Tgas tournaments.
- `useSignMatch()` (:91-101): NEP-413 seat proof, see §2.4.
- Dev only: `?as=<account>` override.

### 1.4 Social login (NEAR Auth / FastAuth, optional)
`components/account/Social.tsx`, `lib/fastauth.ts`:
- Auth0 (Google/email) → MPC-derived key (`FASTAUTH.mpcId`, domain_id 1) → implicit account. One MPC-signed tx adds a local full-access key.
- Session: localStorage `fastauth:session = { accountId, key }`.
- `SocialProvider` sets `WalletOverride` to a signer that overrides `callFunction`, `callFunctionRaw`, `transfer`, `signNEP413Message`. `signIn` opens `SocialDialog` ("Continue with Google / email" or "Use a NEAR wallet" → `base.signIn()`).
- API routes (need `FASTAUTH_RELAYER_ID`, `FASTAUTH_RELAYER_KEY`): `app/api/fastauth/route.ts` (relays `sign`), `app/api/fastauth/fund/route.ts` (verifies Auth0 JWT, one-time 0.3 NEAR to the caller's own implicit account).
- Env: `NEXT_PUBLIC_FASTAUTH` (`off` disables; Dockerfiles default `off`), `NEXT_PUBLIC_FASTAUTH_CLIENT_ID`, `_DOMAIN`, `_CONTRACT_ID`, `_MPC_ID`, `_RPC`.
- Because it is plugged in through `WalletOverride`, game code calling `useNearWallet()` works unchanged with either wallet.

### 1.5 Funds dialog
`components/account/Funds.tsx` `FundsDialog({ onClose })`: deposit/withdraw platform balance. `AnyChain` section = NEAR Intents dry quotes (`lib/intents.ts`, 1Click API, dest `nep141:wrap.near`). Quotes only; confirm disabled on testnet.

### 1.6 Session sharing with market
- Only via same origin (same localStorage key `fastauth:session`).
- Dev: set `MARKET_DEV_ORIGIN` → brawler `next.config.ts:11-14` rewrites `/shop/*` to the market (market supports `basePath` via `MARKET_BASE_PATH`).
- Prod: market is on `market.<domain>` (separate origin) → wallet/social sessions NOT shared; user signs in again. near-connect sessions are per origin.

### 1.7 State of other games
ribbon/keyfall/coinflip use `@xyz/platform` (`NearProvider`, `usePlatform`, `useBalance`, `MARKET_URL`) with plain `p.w.signIn()`. No `SocialProvider`, no `FundsDialog`, no `short()` (keyfall shows full id). **For a new game: use `@xyz/platform`, use `short()`, add the balance chip + wallet chip in your title/header.** Copying `SocialProvider` is optional.

---

## 2. Room code plan

### 2.1 Codes
- Alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ` (24 letters, no I/O), 4 chars. Brawler: server-generated random, retried until unused (`games/brawler/server/src/room.rs:15, :222`). Codes get reused after a room dies; the server tells rooms apart by `Room.uid`.
- Client input: 4 chars, uppercased (`rooms/OnlineStart.tsx:115`).
- Variants:
  - Ribbon: code **is** the on-chain matchId, `games/ribbon/client/src/code.ts` `toCode(id)`/`fromCode(code)` (affine scramble A=7919, B=104729, N=24^4; ids ≥ 331776 wrap). No server lookup needed.
  - Keyfall: 4 random A-Z letters (server `lib.rs:252`).
- **Recommended for new games:** brawler-style server code (works for free + staked rooms). Use the ribbon scheme only if every match is on-chain.

### 2.2 URLs
Brawler (path routes, `App.tsx:49-71`): `/play`, `/play/join/<CODE>` (invite link; free rooms auto-join, staked rooms need one click so the wallet popup is not blocked), `/watch/<CODE>`, `/replay/<key>`, `/lobby`.
Query: `?demo` (no wallet/server), `?server=` (override `NEXT_PUBLIC_SERVER_URL`), `?as=` (dev).
Ribbon/keyfall: `?room=<CODE>` prefills the join box. Either works; whatever you choose, an invite link must open straight into join.
Reload rejoins: brawler keeps the live fight in sessionStorage (`Arena.tsx:24-27`); keyfall uses `keyfall:seat` with a rejoin token.

### 2.3 Flow (create / join)
```
HOST                                  CHAIN (platform)                SERVER (ws)
stake>0 or bettable?
  createMatch(game, stake, bettable, nft?) ─► matchId
ws connect ◄──────────────────────────────────────────────────────── {t:'hello', nonce}
{t:'host', …, matchId|null, stake, account, auth?} ───────────────► room{code, seat}
share /play/join/<CODE>

GUEST
{t:'peek', code} ─────────────────────────────────────────────────► peek{room}  (has matchId, stake)
matchId != null?
  joinMatch(matchId, nft?) ─► ok / null (null = NFT lock failed, stake refunded)
{t:'join', code, …, account, auth?} ──────────────────────────────► roomstate{…seats}
host {t:'begin'} ─────────────────────────────────────────────────► start{matchId, players, seat, delay}
```
Free rooms skip the chain completely (matchId null, no auth).

### 2.4 Seat proof (NEP-413)
Client: `w.signNEP413Message({ message: '<game>:<matchId>', recipient: PLATFORM_ID, nonce: <hello nonce bytes> })` → send `auth: { publicKey, signature }` with `host`/`join`/`rejoin`.
Server: `crates/near-svc/src/lib.rs:78` `Near::verify_auth(auth, account, message, nonce)` (async), which must be a FullAccess key of `account`. Then check the on-chain match: `game == <id>` and `account` is a seat. Skipped when `CONTRACT_ID` is unset (local dev).
- Message: use `<game>:<matchId>` (ribbon, keyfall). Brawler alone uses `brawler-arena:<matchId>` (legacy).
- Nonce: 32 random bytes, **base64** (brawler, keyfall). Ribbon uses hex. Use base64.
- Reuse `near-svc` (`near_svc::Near`); do not hand-roll signature checks.

### 2.5 WS protocol (brawler, spec at `games/brawler/server/src/lib.rs:8-35`, builders `protocol.rs`)
- C→S first message: `host` | `join` | `rejoin{code, account, auth?}` | `watch{code}` | `lobby` | `peek{code}` | `match{matchId,…}` (tournament, no room).
- S→C: `hello`, `room`, `roomstate`, `lobby`, `peek`, `start`, `over{winner, reason, settle}`, `resume`, `rejoin`, `left`, `rematch`, `chat`, `error{msg}`, `ping`.
- In room: `set`, `begin` (host), `callbot`, `chat` (≤200 chars, 1/500 ms), `rematch` (free only), `hb` (1 s heartbeat).
- HTTP: `GET /history/{account}`, `GET /tape/{key}`.
Minimum for a new game: `hello`, `host`, `join`, `peek`, `rejoin`, `room`/`roomstate`, `start`, `over`, `error`, `hb`. The rest is optional.

### 2.6 Results + settlement
Server is authoritative and the referee settles. Two modes:
1. **Signed settle (brawler, gasless):** `settle_msg = "{game}-settle|{contract}|{match_id}|{winner|none}|{k0},{k1}|{tape_hash}"` (`contracts/platform/src/lib.rs:249`). The referee key signs sha256(msg) and sends it in `over.settle`; the client submits platform `settle(...)`. Enabled only if `get_game(id).referee_key` equals the server key. Fallback: the referee calls `report_result` itself after `SETTLE_FALLBACK_S` (default 300).
2. **Direct (ribbon, keyfall):** referee calls `report_result(match_id, winner|null, kos|null, tape_hash|null)`. `winner: null` = draw/void → refund both stakes.
Start with (2); add (1) when gas matters.
`tape_hash` (brawler) = sha256(stage utf8 ‖ 0x00 ‖ frames u32 LE). Optional for other games.

### 2.7 Timers (brawler `game.rs:11-13`; pick similar)
`FORFEIT` 30 s silent → opponent wins (both gone → void). `NO_SHOW` 5 min in waiting room → present seat wins. `DONE_TTL` 120 s → room removed. Paid guest leaves before start → referee `unjoin` (or void). Ribbon: 10 s / 300 s / 60 s. Keyfall: 15 s rejoin grace. Client shows a "forfeit in N s" countdown.

### 2.8 Spectators / betting (optional)
Bettable matches (`create_match(..., bettable=true, ...)`) get a per-match binary order book on the platform: `place_order(match_id, side, price_bps, qty)` (1 yocto), `cancel_order`, `get_book`, `get_orders`, `get_fills`, `get_prices`, `claim`, `claimable`. UI ref: `games/brawler/client/src/components/rooms/Watch.tsx`. Lobby/spectator spec: `tasks/room-lobby-spec.md` (its betting section is outdated; it describes the old `buy`/`quote_buy`).

---

## 3. Marketplace connection

### 3.1 Contracts
**Platform** (`contracts/platform/src/lib.rs`), one contract shared by all games:
- `register_game(game, referee_id, assets_id: Option, referee_key: Option<ed25519>)` (owner only, :760). Game id ≤32 chars. Older notes say 3 args; it is 4.
- `get_game`, `list_games`, `set_referee_key`.
- Matches: `create_match(game, stake, bettable, monster_id?)`, `join_match(match_id, monster_id?)`, `cancel_match`, `report_result`, `settle`, `unjoin`, `expire`, `list_matches(from, limit, game?)`.
- Tournaments: `create_tournament`, `enter_tournament`, `claim_tournament`, `cancel_tournament`, `list_tournaments(…, game?)`.
- Balance: `deposit`, `withdraw`, `balance_of`.

**Assets contract** (optional, per game; brawler's = `games/brawler/contract`):
- Must implement the platform's `ext_assets` (:44): `lock(token_id, account_id, until_ms)`, `unlock(locks)`, `record_result(match_id, tokens, winner, kos, tournament)`, `add_title(token_id, title)`. The platform locks the NFT passed as `monster_id` for the match and records the result on it.
- Brawler: monsters NEP-171 (hatch, breed, list/buy, rent, seasons) + skills NEP-245 (`skill:<id>`; collections, presales, listings, `equip`).
- Games without NFTs (ribbon, keyfall): `assets_id = null`. Staking and betting still work; no NFT use or tournaments.

### 3.2 Using owned NFTs in a match (brawler)
- Client: `lib/nft.ts` `MONSTERS_ID` (env `NEXT_PUBLIC_MONSTERS_ID`), `useMonsters()`; `hooks/useMons.ts` `usePlayable()` → lockable on-chain monsters + local (casual only).
- Pass id to `createMatch`/`joinMatch` → platform locks it.
- Server: `monster_load` (`server/src/lib.rs:118`) views `get_monster` on chain; **chain stats override client-sent stats** (never trust client NFT data).

### 3.3 Market ↔ game links
- Market knows games statically: `market/lib/assets.ts` `GAMES = [{ id, name, url }]` (url from env, e.g. `NEXT_PUBLIC_BRAWLER_URL`, `NEXT_PUBLIC_RIBBON_URL`). These render as header links (`market/components/ui.tsx`). It does not read `list_games`.
- Item page: "Fight with it in Brawler Arena" → `BRAWLER_URL` (`market/app/item/page.tsx:206`).
- Market assets source: `ASSETS_ID` (env `NEXT_PUBLIC_ASSETS_ID`); `useAssets()` = all market reads/writes (skills, collections, presales, monsters, buy/list, `withdrawOwed`). It is wired to brawler's assets contract only. A new game with its own NFTs needs its assets contract added to the market (not done yet for any second game).
- Game → market: `MARKET_URL` ("Get skills", "Deposit" links, new tab).
- Market sign-in: `market/lib/social.ts` + `components/signin.tsx` re-implement social login (same storage key); `useAssets` uses `social?.accountId || wallet.signedAccountId`. Market does not use `@xyz/platform`.
- NPC merchants (`agents/merchant.ts`, pricing `agents/pricing.ts`, market badge `market/lib/merchants.ts`) list brawler skills; brawler-only.

---

## 4. Infra per game
- Server: Rust crate `games/<id>/server` using `near_svc::Near`; env `PORT NEAR_RPC CONTRACT_ID REFEREE_ID REFEREE_KEY` (+ game-specific). Ports used: brawler 8787, ribbon 8788, keyfall 8789, coinflip planned 8790 → next free 8791.
- `infra/<id>-server.Dockerfile` (+ `.dockerignore`), service in `infra/compose.yml`, `ports: !reset []` in `compose.prod.yml` (+ caddy `depends_on`), `<id>.{{ domain }}` block in `infra/ansible/templates/Caddyfile.server.j2`, `$(call ship,<id>-server,server,<id>-server)` in Makefile `push-image`. Add the crate to root `Cargo.toml` workspace.
- Client dev ports: brawler 3000, ribbon 3001, coinflip 3003, keyfall 3004, market 3100.
- Client env: `NEXT_PUBLIC_SERVER_URL=wss://<id>.<server domain>`, `NEXT_PUBLIC_MARKET_URL`, optional `NEXT_PUBLIC_PLATFORM_ID`.

---

## 5. New-game checklist
1. `games/<id>/client` (Next) depends on `@xyz/platform`; wrap in `NearProvider`; header = balance chip (`useBalance` + deposit) + wallet chip (`short(account)` / "Connect wallet"); deposit link → `MARKET_URL` or a funds dialog.
2. `?demo` mode: local rules, no wallet/server.
3. Rooms: 4-letter code (§2.1), invite URL opens join (§2.2), `peek` before join so the guest sees the stake.
4. Staked: host `create_match('<id>', stake, bettable, null)` → matchId → ws `host`; guest `join_match` → ws `join`. NEP-413 `<id>:<matchId>`, base64 hello nonce, server `verify_auth` + on-chain game/seat check.
5. Server authoritative; referee `report_result` (draw = `null` → refund). Forfeit/no-show/rejoin timers.
6. Owner runs `register_game('<id>', referee, assets|null, referee_key|null)` on the platform.
7. Market: add `{ id, name, url: process.env.NEXT_PUBLIC_<ID>_URL || … }` to `GAMES` in `market/lib/assets.ts`.
8. Infra per §4.
9. Doc: game section in root `README.md` + `tasks/<id>-spec.md`.

Known gaps (do not assume these exist): no dynamic game list in the market, no market UI for non-brawler assets, prod market not sharing the session, coinflip has no server yet (`tasks/coinflip-spec.md` plans a chain-only version).
