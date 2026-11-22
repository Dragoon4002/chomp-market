# Economy spec (binding interface for all agents)

Features: 1 monster NFTs, 2 on-chain fight provenance, 3 P2P market, 4 on-chain breeding, 5 rentals, 7 seasons + tournaments.
Decisions: SEPARATE monsters contract; arena talks to it via cross-contract calls. Monster is OPTIONAL for normal
staked matches, REQUIRED for tournaments. Tournaments = entry-fee pot (testnet). Demo mode (`?demo`) must keep
working for every new screen with fake data.

Deviating from a name/arg/shape below breaks other agents. If you must, write it under "Deviations" at the bottom.

## Monsters contract — `contracts/monsters/` (crate `monsters`, near-sdk 5.30, near-contract-standards)

Token id = decimal string counter ("0", "1", ...). `init new(owner_id, arena_id)`.

NEP-171 core + NEP-177 metadata + NEP-181 enumeration (near-contract-standards). No NEP-178 approvals (market is in-contract).
`nft_transfer`/`nft_transfer_call` panic "Monster is busy" while locked or rented out; a transfer clears listing + rent offer.

### Types (JSON)
```
Dna { str,dex,def,spd: u8 (3..9, sum 22), hue,accent: u16 (0..359), horn: u8 0..3, tail: u8 0..2, pattern: u8 0..2, eye: u8 0..3, size: u8 90..115 }
Record { w: u32, l: u32, ko: u32 }
Rental { renter: AccountId, until_ms: u64 }
RentOffer { price_per_day: U128, max_days: u32 }
MonsterView {
  token_id: String, owner_id: AccountId, name: String, gen: u32, parents: Option<[String;2]>,
  breeder: AccountId,          // account that minted/bred it (royalty receiver)
  born_ms: u64, dna: Dna, record: Record, titles: Vec<String>,
  price: Option<U128>,         // listed for sale
  rent_offer: Option<RentOffer>,
  rental: Option<Rental>,      // only if still active (until_ms > now)
  locked_until_ms: u64,        // 0 = free; lock is in a match/tournament
  cooldown_until_ms: u64,      // breeding cooldown
}
HistoryEntry { match_id: u64, vs: Option<String> /*opponent token*/, won: Option<bool> /*None = void*/, kos: u8, ms: u64, tournament: Option<u64> }
SeasonView { id: u32, name: String, ends_ms: u64, active: bool }
ConfigView { owner, arena, treasury: U128, breed_fee: U128, market_fee_bps: u32, royalty_bps: u32, rent_fee_bps: u32 }
```

### Calls
- `hatch_starters()` payable: once per account, mints 3 gen-0 (random DNA from env::random_seed, same rules as `src/lib/genes.ts randomDna/nameFor`). Deposit covers storage, excess refunded. Panic "Starters already claimed".
- `breed(a: String, b: String) -> MonsterView` payable: caller owns both, a≠b, neither rented out / locked / on cooldown. Deposit ≥ breed_fee (0.1 NEAR) + storage; fee → treasury. Child gen = max+1, parents set, breeder = caller. Cooldown 1 h on both parents. Port `breed()` from `src/lib/genes.ts` (mulberry32 rng, same normalize).
- `list(token_id, price: U128)` / `delist(token_id)`: owner only, not locked / rented.
- `buy(token_id)` payable == price: seller gets price − market fee (2.5%) − royalty (5% to breeder, only if breeder ≠ seller and gen > 0). Fee → treasury. Transfers token (emit NEP-171 transfer event), clears listing/offer.
- `offer_rent(token_id, price_per_day: U128, max_days: u32)` / `cancel_rent_offer(token_id)`: owner only.
- `rent(token_id, days: u32)` payable == price_per_day × days, 1 ≤ days ≤ max_days, no active rental, not locked, not listed: owner gets amount − rent fee (2.5%). Sets rental. Offer stays (can re-rent after expiry).
- Renter rights: ONLY fighting (arena `lock`). Owner while rented out: no transfer/list/breed/lock.

### Arena-only (predecessor == arena_id)
- `lock(token_id, account_id, until_ms) -> Dna`: account is owner (no active rental) or active renter; not already locked (expired lock = free); not listed. Sets locked_until_ms.
- `unlock(locks: Vec<(String, u64)>)`: each (token_id, until_ms passed to `lock`); clears the lock ONLY if locked_until_ms == until_ms (else a newer lock owns it; ignored). Unknown tokens ignored.
- `record_result(match_id: u64, tokens: [Option<String>;2], winner: Option<u8>, kos: [u8;2], tournament: Option<u64>)`: w/l/ko, history (cap 50 newest per token), season wins if season active. Does NOT unlock.
- `add_title(token_id, title: String)`.

### Seasons (owner, 1 yocto)
- `start_season(name: String, ends_ms: u64)` (panics if one active). `end_season()` (owner, any time after ends_ms… or early): top 3 by season wins get titles "<name> Champion", "<name> Runner-up", "<name> Third".
- Views: `get_season() -> Option<SeasonView>`, `get_leaderboard(limit: u32) -> Vec<(String, u32)>` (token, wins), desc.

### Views
`get_monster(token_id) -> Option<MonsterView>`, `monsters_of(account_id, from: u32, limit: u32) -> Vec<MonsterView>` (owned),
`rented_by(account_id) -> Vec<MonsterView>` (active rentals held), `get_history(token_id) -> Vec<HistoryEntry>` (newest first),
`listings(from, limit) -> Vec<MonsterView>`, `rent_offers(from, limit) -> Vec<MonsterView>`, `starters_claimed(account_id) -> bool`, `config() -> ConfigView`.
Owner: `set_arena`, `set_fees(breed_fee, market_fee_bps, royalty_bps, rent_fee_bps)`, `withdraw_treasury(amount)` (1 yocto).

## Arena contract changes — `contracts/arena/`

`new(owner_id, referee_id, monsters_id)` (fresh deploy as v3; no migration).
- `create_match(bettable, monster_id: Option<String>) -> u64` payable. With monster: Promise `monsters.lock(monster, host, now+3h)` → `#[private] on_create(...)` creates the match (or refunds deposit on failure, returns promise result). Without: unchanged.
- `join_match(match_id, monster_id: Option<String>)` payable, same lock pattern → `on_join`; if match no longer Open in callback → refund + unlock.
- `report_result(match_id, winner: Option<u8>, kos: Option<[u8;2]>)` (kos[i] = KOs scored BY seat i). If any monster on match → detached `monsters.record_result(...)` then `monsters.unlock` (non-tournament). Referee attaches 100 Tgas.
- `cancel_match` / `expire` → unlock any monsters (detached).
- `MatchView` adds `monsters: [Option<String>;2]`, `tournament: Option<u64>`.

### Tournaments (arena)
- `create_tournament(size: u8 /*4|8*/, entry_fee: U128, bettable: bool) -> u64` owner only (1 yocto).
- `enter_tournament(id, monster_id: String)` payable == entry_fee → lock monster until now+24h → `on_enter` registers (refund+unlock if full/failed). Fee → pot. Same account cannot enter twice.
- When full: round-1 matches created Live directly (host = entrant 2i, guest = 2i+1, stake 0, monsters set, bettable if tournament bettable AND treasury ≥ seed). Status live.
- On `report_result` of a tournament match: winner seat advances (void → seat 0 advances, `ponytail:` note), loser's monster unlocked. Next-round match created when both feeders finished. Final: champion recorded, monster unlocked, `monsters.add_title(champion_monster, "Tournament #<id> Champion")`. Champion pulls prize via `claim_tournament(id)` = pot − fee_bps (same fee_bps), fee → treasury; same claimed-flag + on_claim-restore pattern.
- `cancel_tournament(id)`: anyone, only if still Open and > 24 h old → entrants pull refunds via `claim_tournament`; monsters unlocked.
- Views: `get_tournament(id) -> Option<TournamentView>`, `list_tournaments(from, limit) -> Vec<TournamentView>` newest first.
```
TournamentView { id: u64, size: u8, entry_fee: U128, pot: U128, bettable: bool, status: "open"|"live"|"done"|"cancelled",
  entrants: Vec<{ account: AccountId, monster: String }>, rounds: Vec<Vec<Option<u64>>> /*match ids per round, None = not created yet*/,
  champion: Option<AccountId>, created_ms: u64 }
```

## Frontend data layer
- `src/near.ts`: `useArena()` gains `createMatch(bettable, stakeYocto, monsterId?)`, `joinMatch(id, stakeYocto, monsterId?)`, `listTournaments()`, `getTournament(id)`, `createTournament(size, feeYocto, bettable)`, `enterTournament(id, monsterId, feeYocto)`, `claimTournament(id)`, `cancelTournament(id)`. `MatchView` gains `monsters`, `tournament`. Export `TournamentView`. `MONSTERS_ID` from `NEXT_PUBLIC_MONSTERS_ID`.
- NEW `src/nft.ts`: `useMonsters()` returns `{ mine(): Promise<NftMonster[]> /*owned + rented-in*/, get(id), history(id), hatchStarters(), startersClaimed(), breed(a,b), list(id, yocto), delist(id), buy(id, yocto), offerRent(id, perDayYocto, maxDays), cancelRent(id), rent(id, days, totalYocto), listings(), rentOffers(), season(), leaderboard(), config() }`. `NftMonster = Monster & { owner, breeder, titles, price?, rentOffer?, rental?, lockedUntil, cooldownUntil }` (Monster from genes.ts; record/dna/gen/parents/born map 1:1; id = token_id).
- Demo: `demoMonsters` + demo tournament data in `src/demo.ts` style (fake, in-memory, seeded by store.ts localStorage monsters). Non-demo uses contract views/calls via near-connect-hooks like near.ts.

## UI (`src/app/`)
Collection/Detail/Breed switch to `useMonsters()`. Detail: titles, history, owner actions (list/delist, offer/cancel rent), visitor actions (buy, rent), busy badges. New routes: `#/market` (Sale / Rent tabs), `#/season`, `#/tournaments`, `#/tournament/:id` (bracket, enter w/ picker, play my match, claim). Play/OnlineStart pass selected monster id to create/join. Hub buttons for new pages.

## Deviations
(agents append here)
- relay (server): new client msg `{t:'match', matchId, account, name, dna, stage?, view?}` opens/joins room for an on-chain Live match (tournament play). Reply `{t:'room', code}` or `{t:'error', msg}`. `start` msg now carries `players:[{name,dna,account}]` with chain DNA — UI must render fighters from it. Env `MONSTERS_ID`.
- arena: `create_match` returns `u64` without monster; with monster the tx result is `on_create`'s `u64 | null` (null = lock failed / treasury can't seed → deposit refunded). `join_match` / `on_join` / `enter_tournament` / `on_enter` tx result = `bool` (false = refunded + unlocked). Attach ≥100 Tgas to these when a monster is involved.
- arena: `TournamentView` also has `claimed: Vec<bool>` (by entrant index) so UI can hide claim button.
- arena (per coordinator): tournament entry locks until now+72h (not 24h); arena calls `unlock(locks: Vec<(String, u64)>)` passing the exact until_ms it locked with.
- monsters: `hatch_starters()` returns `Vec<MonsterView>` (spec gave no return). Starter seeds = base, base+1, base+2 (base = random_seed[0..4] LE u32); breed seed = base; child name = `nameFor(seed)`.
- monsters: `record_result` counts season wins only for tournament matches (`tournament.is_some()`, so free 0-stake matches can't farm them) and only while `active && now < ends_ms`; record/history update for every match. Contract keeps a running top 3 (ties: first to reach the count first); `end_season` titles those. `get_leaderboard` = that top 3 + the season's first 200 winning tokens below it (bounded scan). Leaderboard = current or last-ended season.
- monsters: failed seller/royalty/rent payouts (and failed treasury withdrawals) are credited to the payee's owed balance, not treasury. New call `withdraw_owed() -> U128` (pull all; restored if the transfer fails, panics "Nothing owed"), view `owed_of(account_id) -> U128`. `on_pay(to, amount)` callback gained `to`.
- monsters: arena `lock` by the renter panics "Rental ends before the match" if `until_ms > rental.until_ms`.
- monsters: a bounced `nft_transfer_call` clears listing, rent offer AND any rental the receiver sold meanwhile (rent stays with the receiver).
- monsters: `list`/`offer_rent` require exactly 1 yocto (`#[payable]`, function-call keys can't list). `delist`/`cancel_rent_offer` take no deposit. Prices must be > 0; `max_days` 1..=365.
- genes: `hueMix` now ends with `% 360` in both `src/lib/genes.ts` and `contracts/monsters/src/genes.rs` (was able to return 360). Gene port is bit-exact.
- arena (review fixes): match monster lock = now+5h (was 3h). `enter_tournament` panics "Entry closed" once tournament > 24 h old and "Attach 150 Tgas" if prepaid gas < 150 Tgas (frontend must attach 150 Tgas). Void/expired bracket match advances a random seat (`random_seed[0] & 1`), not seat 0. New `#[private] on_refund(amount)`: failed bounce refund → treasury.
