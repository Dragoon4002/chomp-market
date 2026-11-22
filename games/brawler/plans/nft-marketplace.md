# NFT marketplace + skill NFTs plan

Goal: creators publish skill NFT types, run presales, users trade on a separate market client, and players equip skills on monsters. Equipped skills change fights deterministically (TS sim + Rust referee agree) and can't move during a match.

## 0. What exists (read before building)

- `games/brawler/contract` (`monsters`): NEP-171/177/181 monsters, an in-contract market (`list/delist/buy`), rentals, seasons, `owed` + `withdraw_owed` for failed payouts, and storage `charge(before, fee)` that refunds excess.
  - `lock(token, account, until)` returns `Dna`. `busy()` blocks transfer, list, breed and rent.
- `contracts/platform`: calls the assets contract's `lock/unlock/record_result` for the game registered with `register_game(game, referee, assets_id)`. **No platform code change is needed.** Skills ride on the monster lock.
- Where stats come from:
  - TS: `genes.ts statsOf()` → `sim.ts statMods()`. The only call site is `lib/session.ts:51 newGame(players.map(p => statsOf(p.dna)))`.
  - Rust: `sim/src/genes.rs stats_of()` → `sim/src/lib.rs stat_mods()`.
  - Server: `server/src/lib.rs monster_dna()` (a `get_monster` view) → `game.rs begin/go_live` → `referee.rs Referee::new(dna)`.
  - `protocol.rs players()` sends the DNA to clients in `start`, and `session.ts:183` uses it for chain matches.
- `market/` is the existing static-export Next hub (xyz.com) with a games list and wallet, using `@xyz/platform`. **The marketplace goes here.** It is already the separate client, so no new app.
- Clients deploy to Vercel. The box (infra/) runs `brawler-server` + Caddy (`Caddyfile.j2`, one `reverse_proxy` block).

## 1. Token standards + contract design

**Decision: one contract for monsters and skills.** Extend the `monsters` crate with `skills.rs` (NEP-245) and `market.rs` (skill listings + presales). Why:
- Equip, lock and transfer checks run in one contract with no cross-contract calls, approvals or resolve callbacks.
- The platform's existing `lock` freezes the loadout for free.
- The market client has one contract to index.
- Ceiling: the market can only trade this game's assets. Upgrade path is a NEP-178 approval market if third-party NFTs are ever wanted.

| asset | standard | why |
|---|---|---|
| monsters | NEP-171 (as is) | 1/1, unique DNA, history |
| skills | **NEP-245 multi-token**, hand-rolled (near-contract-standards 5.30 has no MT) | fungible editions, one balance per (account, skill). NEP-171 editions would need one token per unit, which is storage-heavy and makes "5 Speed I" unreadable |

### Skill data model (`skills.rs`)
```
SkillKind = Power(str) | Agility(dex) | Durability(def) | Speed(spd)
Rarity    = Common | Rare | Epic          // cosmetic + supply; magnitude is bounded separately
SkillType { id: u32 /* token_id "skill:<id>" */, collection: u32, name, kind, mag: u8 /* 1..=2 */, rarity,
            max_supply: Option<u128>, minted: u128, creator: AccountId, royalty_bps: u16 /* <= 1000 */, media: String }
Collection { id: u32, name, description, media, creator }
balances: LookupMap<(AccountId, u32), u128>   // free units only
loadout:  LookupMap<TokenId, Vec<u32>>        // per monster, units escrowed out of owner balance
```

### Slot rules and balance caps
These are enforced at `equip` and **re-clamped in both sims** (trust boundary):
- 3 slots per monster, and a skill id at most once per loadout.
- Bonus per stat is ≤ +2 and total bonus is ≤ +3. An effective stat may exceed the DNA 3..9 range, up to 11.
- Effects come through the existing `stat_mods`, no new formulas:
  - `spd` +1 → run +0.35
  - `def` +1 → kb_taken −0.04
  - `str` +1 → dmg +0.05
  - `dex` +2 → startup −1 frame (`startup()` already floors at 2 with `js_max(2, …)`)
- Max swing is about 1/3 of the DNA range: a nudge, not pay-to-win.

### Methods
- **Publish**
  - owner: `add_creator(acct)` / `remove_creator`
  - creator: `create_collection(name, description, media)`, `create_skill(collection, name, kind, mag, rarity, max_supply?, royalty_bps, media)`, `mint_skill(skill, to, qty)` (airdrop, within supply)
- **Presale**
  - `create_presale(skill, price, start_ms, end_ms?, cap_total?, per_wallet?, allowlist?: Vec<AccountId>)` (skill creator only)
  - `buy_presale(id, qty)`: checks the window, caps, allowlist (`LookupSet<(u32, AccountId)>`) and `max_supply`, then mints. Deposit is ≥ price*qty plus storage; storage is measured and the excess refunded through `charge`.
  - `end_presale(id)`
  - A presale with no `end_ms` and no cap is the permanent shop. This is the abundant supply of Commons.
- **Proceeds**: credit `owed[creator] += net` (pull, cheaper than a push per buy). Pulled with the existing `withdraw_owed`. Fee is `market_fee_bps` to treasury.
- **Skill market**
  - `list_skill(skill, qty, price_each)`: 1 yocto + storage. Escrows qty out of free balance. One listing per (seller, skill), re-listing replaces it.
  - `cancel_skill_listing(skill)`
  - `buy_skill(seller, skill, qty)`: deposit = qty*price + storage. Fee to treasury, creator royalty to `owed`, rest paid with `pay()`.
- **NEP-245 core**: `mt_transfer`, `mt_batch_transfer` (1 yocto, free units only, so equipped and listed units can't move), `mt_balance_of`, `mt_batch_balance_of`, `mt_token`, `mt_supply`.
  - Skip `mt_transfer_call` until some contract needs to receive skills.
- **Equip**: `equip(token_id, skills: Vec<u32>)`, 1 yocto, replaces the whole loadout.
  - Requires the owner (not a renter), `!busy`, and the caps above.
  - Returns the old units to the owner's balance and takes the new ones.
- **Transfer/sale hook**: `before_transfer` (already called on transfer and buy) unequips everything back to the *seller*. Loadouts don't travel with the monster.
- **Rentals**: a renter fights with the owner's loadout. It's frozen anyway because the monster is busy.
- **Monster royalties (NEP-199)**: add `nft_payout` / `nft_transfer_payout` (breeder royalty, same math as `buy`) so external markets pay royalties. P3.

### Lock invariant
`lock()` sets `locked_until_ms`, so `busy` is true. `equip` requires `!busy`, and the escrowed units aren't in the free balance, so they can't be transferred or listed. Nothing changes between lock and the server's read at `begin`.

### Views
- `skill_types(from, limit)` returns each `SkillTypeView` with `floor`, `last_price`, `listed_qty`.
- Also: `collections(from, limit)`, `skill_listings(skill, from, limit)`, `skills_of(account)` → `[(skill, free, listed)]`, `presales(from, limit)`, `presale_bought(id, account)`, `is_creator(acct)`, `price_history(key)` (`key` = `"skill:<id>"` or `"monsters"`).
- `MonsterView` gains `skills: [{id, kind, mag}]`. **The server gets this through its existing `get_monster` call.**

### Storage
- Every payable mint/buy/list uses the measured `charge(before, price)` pattern.
- `mt_transfer` and `equip` storage is paid from contract balance; owner pre-funds about 5 N. Ceiling: transfer spam could drain it. Upgrade is NEP-145 `storage_deposit` if abused.

### Events (NEP-297)
- `nft_*`: already emitted by the standards.
- NEP-245 `{"standard":"nep245","version":"1.0.0","event":"mt_mint|mt_transfer|mt_burn"}`, emitted by hand via `EVENT_JSON:`.
- Custom `{"standard":"brawler","version":"1.0.0","event":…}` for `collection_create`, `skill_create`, `presale_create`, `presale_buy`, `list`, `delist`, `sale` (`{key, qty, price, seller, buyer}`, also on monster `buy`), `equip`.
- These exist so an indexer can be added later without a redeploy.

## 2. Search + indexing

**Recommendation: no indexer.** The catalog is tens of skill types and fewer than 500 listings, so the client pulls paginated views and filters in the browser.
- **Price history** lives on chain: `price_history: LookupMap<String, Vec<(u64 ms, U128 price)>>`, a ring of 64 pushed on every `sale` / `presale_buy`. This mirrors the platform's `get_prices` for the betting AMM.
- **Sparklines**: plot that ring.
- **"24H gain"**: last price vs the last price before now−24h, computed client side.
- **Search**: load `skill_types` + `collections` + monster `listings` once (cached about 30 s), then substring/token match on name, kind, rarity, collection and owner.
- **Upgrade, if the catalog outgrows views**: a tiny Node cron on the box that reads the NEP-297 logs above from the FastNEAR/nearblocks API into SQLite. Not now.

## 3. Skills → gameplay (exact touch points)

Rule: skills only adjust **integer stats before `stat_mods`**. That means no new sim state, no float-order risk, and golden `fields` already cover mods.

| layer | file / function | change |
|---|---|---|
| Rust sim | `sim/src/genes.rs` | `pub struct Skill { kind: u8, mag: u16 }`, `sanitize_skills(&Value) -> Vec<Skill>` (≤3, clamp mag 1..2, per-stat ≤2, total ≤3; drop extras in order), `apply_skills(Stats, &[Skill]) -> Stats` (add, cap 11) |
| TS sim | `client/src/lib/genes.ts` (next to `statsOf`, l.111) | `Skill`, `sanitizeSkills`, `applySkills`, an exact mirror of the Rust code |
| server fetch | `server/src/lib.rs monster_dna` → `monster_load(token) -> Option<(Dna, Vec<Skill>)>`, reading `m["skills"]` | same view call |
| server seats | `room.rs Seat` + `skills: Vec<Skill>` (default empty); `game.rs begin/go_live` sets it from chain | off-chain rooms keep `[]`, so client-claimed skills are never trusted |
| referee | `referee.rs Referee::new` takes `[Stats;2]`, built as `apply_skills(stats_of(dna), &skills)` | |
| wire | `protocol.rs players()` + `"skills"` | `start`, `spec` and `roomstate` all carry it |
| client | `session.ts` `Player`/`Seat` + `skills?: Skill[]`; l.183 parse with `sanitizeSkills`; l.51 `applySkills(statsOf(p.dna), p.skills ?? [])` | |
| local/bot fights | `Arena.tsx startBotFight` passes `mon.skills` (unverified, fine offline) | |
| godot | `godot/sim.gd` takes stats, so only `near_bridge.gd` would need it | out of scope, noted |

**Golden/parity**
- New `sim/testdata/skills.json`: about 12 cases of raw JSON skills → expected sanitized list + stats, including over-cap, dupes, junk types and stat 11.
- Asserted in `client/src/lib/genes.test.ts` and in a `sim/src/genes.rs` test.
- `scripts/golden.ts`: add 2 runs with skills (record `skills` per run) and regenerate `golden.json`.
- `sim/tests/golden.rs`: apply `skills` when present.

**Lock/unlock**: unchanged.
1. `create_match` / `join_match` / `enter_tournament` call `lock`, so the loadout is frozen.
2. `report_result` triggers `record_result` + `unlock`, after which `equip` works again.
3. `expire` / cancel unlock as today.

## 4. Market client (`market/`)

- **Stack**: the existing `market/` workspace (Next 16, `output: 'export'`, `@xyz/platform` wallet).
- **Shared code**: add `ASSETS_ID` + skill/monster view types + `useAssets()` (view/call wrapper, same shape as `usePlatform`) to `packages/platform`. The game's `nft.ts` imports `MONSTERS_ID` from there.
- **Theme**:
  - Copy the brawler tokens (`--panel-2 --gold --up --down --stat-*`) into `market/src/app/globals.css`. It already has most of them.
  - Chunky outline (`--outline`, `--drop`) and `--font-display` headline.
  - Faint grid background: CSS `background-image: linear-gradient(...)` at 40 px.
  - Sparklines: inline SVG `<polyline>`, no chart library.

Pages are static routes with query params, because a static export has no dynamic routing:

| route | content |
|---|---|
| `/` | "Trade in the Arena" headline, a big rounded search (⌘K / Ctrl+K focuses it, Enter → `/search?q=`), and 3 cards: **Top Skill (24H)** (biggest gainer), **Hottest Monster** (top recent sale or season wins), **Live Presale** (cumulative sold sparkline + % of cap). Each card footer: icon + name + value + green/red %. Games list moves below. |
| `/search?q=&type=skill\|monster\|collection&kind=&rarity=&sort=price\|change\|new` | filter chips + result grid |
| `/item?id=skill:3` or `?id=monster:12` | big chart, listings table, buy qty, "list yours" form; monster: stats bars, record, link to game |
| `/collection?id=` | collection skills + presales (countdown, cap bar, allowlist badge, buy) |
| `/create` | gated by `is_creator`: forms for collection → skill → presale |
| `/me` | skills (free/equipped/listed), monsters, my listings (cancel), `owed` withdraw |

**Monster art**: v1 is a hue-tinted emblem from `dna.hue/accent` plus stat chips. Sharing the game's `Portrait` (ui.tsx, depends on render/*) is P3.

**Skill art**: 4 kind SVGs × rarity frame, in `market/public/skills/` and the game's `public/skills/`. `media` points to an absolute URL.

**Deploy**
- Default: Vercel project root `market/` (same as today), env `NEXT_PUBLIC_ASSETS_ID`, `NEXT_PUBLIC_PLATFORM_ID`, `NEXT_PUBLIC_BRAWLER_URL`.
- On the box instead: build `out/` locally, have ansible `synchronize` it to `/srv/market`, mount it into caddy in `compose.prod.yml`, and add `market.{{ domain }} { root * /srv/market; try_files {path} {path}.html {path}/index.html; file_server }` to `Caddyfile.j2`. No Node runtime needed.

## 5. Game client changes

- **`nft.ts`**:
  - `MonsterView.skills`
  - `toMonster` maps `skills`
  - `MonstersApi` adds `skills()` (`skills_of` joined with `skill_types`, cached) and `equip(id, skillIds)` (1 yocto)
  - demo fixtures in `demo.ts`
- **`/customize`** (new `components/monsters/Customize.tsx` + route in `App.tsx`):
  - monster picker (reuse the `Play.tsx` roster-pick pattern / `useMons`)
  - 3 slots, an owned-skills inventory (free count, kind/rarity), click to slot or unslot
  - live effective-stats preview (`applySkills`, reuse the stat bars from Badges/Detail)
  - Save sends the `equip` tx
  - Disabled with a reason when busy, locked, rented, or the cap is hit. "Get skills" links to market.
- **Play**: `Play.tsx` shows equipped skill chips plus a "Customize" link. Chain matches need nothing else, because the server sends skills.
- **Account**: skills tile (owned/equipped count) + list, plus a market link.

## 6. Redeploy / migration

Monster state changes, so this is a fresh deploy. The old monsters account is abandoned and starters are re-hatched. Coordinate with the in-flight platform redeploy: reuse its platform account if it's live, otherwise redeploy that too.

1. `cargo test` + `cargo near build` for `games/brawler/contract` (and `contracts/platform` if redeploying).
2. Create `brawler-monsters-<sfx>.testnet` and fund it with about 10 N (storage pool).
3. `new(owner_id, arena_id=<platform>)`.
4. Platform owner: `register_game("brawler", <referee>, <new monsters>)` (1 yocto, upsert).
5. Seed with `scripts/seed-skills.sh` (near CLI, idempotent-ish):
   - `add_creator(owner)`
   - `create_collection("Arena Basics")`
   - 8 skills: 4 kinds × Common mag1 (unlimited) + Rare mag2 (supply 200)
   - permanent shop presales for the Commons (0.05 N)
   - 1 time-boxed Rare presale (24 h, cap 200, 2/wallet)
   - optional `mint_skill` airdrop to test accounts
6. Server env `MONSTERS_ID` (infra compose), then `make deploy`.
7. Client env (`NEXT_PUBLIC_MONSTERS_ID` / `NEXT_PUBLIC_ASSETS_ID`), plus the default in `packages/platform/index.ts` and `nft.ts`. Redeploy both Vercel apps.
8. Update `games/brawler/contract/README.md` + root README env table.

## 7. Phased tasks

**P1: contract (≈1.5 d)**
- [ ] `skills.rs`: types, collections, creators, NEP-245 core + events
- [ ] presales (window, caps, allowlist, supply) → `owed` proceeds
- [ ] skill listings/buy + fees/royalty + `price_history` ring; `sale` event on monster `buy` too
- [ ] `equip` + caps; `before_transfer` unequip; `MonsterView.skills`
- [ ] views; unit tests (`tests.rs`)

**P2: sim + server (≈0.5 d)**
- [ ] `apply_skills`/`sanitize_skills` in Rust + TS, `testdata/skills.json` parity tests
- [ ] golden runs with skills, regen + `golden.rs`
- [ ] server: `monster_load`, `Seat.skills`, referee stats, `players()` skills; `tests/match.rs` case
- [ ] client `session.ts` wiring

**P3: game client (≈0.75 d)**
- [ ] `nft.ts` skills/equip + demo data
- [ ] `/customize` page; Play chips; Account skills tile

**P4: market client (≈1.5 d)**
- [ ] `packages/platform` `ASSETS_ID` + `useAssets`
- [ ] theme tokens, grid bg, Sparkline component
- [ ] `/` home (search ⌘K, 3 cards), `/search`, `/item`, `/collection`, `/create`, `/me`

**P5: deploy + seed (≈0.5 d)**
- [ ] new account, init, `register_game`, `seed-skills.sh`, env updates, deploys
- [ ] testnet e2e + browser pass

Optional: [ ] NEP-199 payout, [ ] shared Portrait in market, [ ] Caddy-hosted market, [ ] event indexer.

## 8. Test plan

- **Contract unit** (`tests.rs`)
  - creator gating
  - supply cap; presale before/after window; `per_wallet`, `cap_total`, allowlist reject/accept
  - fee + royalty math, `owed` credit, `withdraw_owed`
  - listing escrow (can't `mt_transfer` listed units), buy partial qty, cancel returns units
  - equip: caps/dupes/unowned rejected; can't equip while locked or rented; equipped units not transferable
  - monster transfer and `buy` unequip back to seller
  - storage refund; event log shape (`EVENT_JSON:` assert)
- **Sim parity**
  - `skills.json` passes in TS and Rust
  - golden with skills is bit-exact (`npm test` + `cargo test --workspace`)
  - sanity test: a +2 spd fighter covers more distance in N frames
- **Server**: `tests/match.rs`, where a chain seat with skills puts skills in `start` and the referee stats differ from a no-skill seat.
- **e2e** (`contracts/e2e`): deploy both → create skill → presale buy → equip → `create_match` (lock) → `equip` panics → `report_result` → unlock → `equip` ok.
- **Testnet manual**: buy a Common in market, equip in `/customize`, play a chain match from 2 browsers with no desync, and confirm the referee result matches both clients.
- **Browser**: market home at 375 px and 1280 px, ⌘K focus, keyboard nav, card sparklines, buy flow; customize slots at mobile width; demo mode still works.

## 9. Risks

- **Pay-to-win perception**: caps are small and Commons are cheap/abundant. The caps live in one constant per sim, easy to tune.
- **Stats > 9 never exercised by the sim**: `stat_mods` is linear and `startup` is floored. Golden runs with stat 11 cover it.
- **Parity drift** between TS and Rust skill logic: one shared JSON fixture, run in both test suites.
- **Platform redeploy collision**: `register_game` must point at the new monsters account. Do it last and verify with `get_game("brawler")`.
- **Contract-paid storage** for `mt_transfer`/`equip`: monitor balance, NEP-145 if abused.
- **Wasm size/gas**: the crate is about 1.5k lines and adds about 700, fine. The history ring is capped at 64.
- **Static export routes**: query-param pages only, no `[id]` folders.

## Decisions (2026-11-14, user) — these override anything above

1. **Market client is new.** Delete the old `market/` workspace (and its references: root `package.json` workspaces, `NEXT_PUBLIC_MARKET_URL` links in the game, README rows). Create a fresh Next.js + Tailwind CSS app with bun (`bun create next-app`, App Router, TypeScript, Tailwind) at `market/`, managed by bun (own `bun.lock`, excluded from the npm workspaces). §4 pages/theme still apply; Tailwind replaces the hand-written CSS (theme tokens go in the Tailwind theme).
2. **Skills include new effects**, not only stat bumps. Effect skills (mag fixed 1, at most one of each, at most 2 effect skills per loadout), integer math only, mirrored exactly in TS + Rust sims with golden coverage:
   - `AirJump`: +1 air jump (3 instead of 2).
   - `Lifesteal`: when your hit lands, heal floor(damage dealt / 5) (damage counter can't go below 0).
   - `QuickDodge`: dodge cooldown reduced by floor(cooldown / 3).
   - `SecondWind`: once per stock, when HP first drops to ≤ 50, heal 30.
   Stat skills (Power/Agility/Durability/Speed, mag 1..2) keep the §1 caps.
3. **Caps** (kept as planned): 3 slots per monster; stat skills give at most +2 to one stat and +3 total; at most 2 effect skills.
4. **Creators: owner-approved only** (`add_creator`), as planned.
5. **Loadout travels with the monster.** On transfer/sale, equipped units stay in the monster's escrow; the new owner gets them equipped and can unequip into their own balance. (Replaces "unequip back to seller" in §1.)
6. **Starters get free Common skills**: `hatch_starters` also credits 3 random Common stat skills (mag 1) to the player's free balance.
7. **Prices**: Commons 0.05 NEAR permanent shop; Rare presale 24 h, cap 200, 2 per wallet.
8. **Hosting: AWS box**, same as the game: `https://market.13-54-190-122.sslip.io` (Caddy site block), shipped as an image like `brawler-client` (`make push-market`).
9. **Platform**: reuse `v2.brawler-platform-5c8e2b.testnet`; fresh monsters account; `register_game` upsert points `brawler` assets at it; monsters `arena_id` = v2 platform.
10. Godot: no.

## Unresolved questions (answered above)

- market = extend `market/` hub (xyz.com) or new app? plan says extend
- skills only Power/Agility/Durability/Speed stat bumps, or want new effects (extra jump, heal)? plan = stat bumps only
- caps +2/stat, +3 total, 3 slots ok?
- creators = owner allowlist only, or anyone (with fee)?
- loadout on sale: back to seller (plan) or travels w/ monster?
- starters get free Common skills?
- Commons price 0.05 N, Rare presale 24h/200/2-per-wallet ok?
- market on Vercel (default) or Caddy on box?
- platform: reuse parallel redeploy acct or redeploy again?
- godot client skills support needed?
