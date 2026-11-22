# Skills contract interface (monsters contract, final)

Contract: `v2.brawler-monsters-5c8e2b.testnet` (deployed via `scripts/deploy-monsters-v2.mjs`). All existing monster methods are unchanged.

## Conventions
- Skill id `u32` (JSON number) in all custom methods. NEP-245 token id = `"skill:<id>"` (string).
- **Unit counts are JSON numbers (u32)**: `qty`, `free`, `listed`, `minted`, `sold`, `max_supply`, `cap_total`, `per_wallet`, `listed_qty`. Only the NEP-245 `mt_*` methods use U128 strings for amounts.
- Prices and NEAR amounts are yocto U128 strings.
- Account args are named `account_id` (the plan's `acct`/`account`).
- `kind` strings: `"Power" | "Agility" | "Durability" | "Speed"` (stat, mag 1..2) and `"AirJump" | "Lifesteal" | "QuickDodge" | "SecondWind"` (effect, mag 1). Stat mapping: Power=str, Agility=dex, Durability=def, Speed=spd.
- `rarity` strings: `"Common" | "Rare" | "Epic"`.

## JSON shapes
```ts
type SkillKind = 'Power'|'Agility'|'Durability'|'Speed'|'AirJump'|'Lifesteal'|'QuickDodge'|'SecondWind';
type Rarity = 'Common'|'Rare'|'Epic';
type SkillType = { id: number; collection: number; name: string; kind: SkillKind; mag: number; rarity: Rarity;
  max_supply: number | null; minted: number; creator: string; royalty_bps: number; media: string };
type SkillTypeView = SkillType & { floor: string | null; last_price: string | null; listed_qty: number };
type Collection = { id: number; name: string; description: string; media: string; creator: string };
type SkillListing = { seller: string; skill: number; qty: number; price_each: string };
type Presale = { id: number; skill: number; price: string; start_ms: number; end_ms: number | null;
  cap_total: number | null; per_wallet: number | null; allowlist: boolean; sold: number; ended: boolean };
type SkillRef = { id: number; kind: SkillKind; mag: number };
// MonsterView (get_monster, monsters_of, listings, ...) gains:
//   skills: SkillRef[]   // equipped, in slot order
```

## Calls
| method | args | who | deposit |
|---|---|---|---|
| `add_creator` / `remove_creator` | `{account_id}` | contract owner | 1 yocto |
| `create_collection` → id | `{name, description, media}` | creator | storage (~0.01 N, excess refunded) |
| `create_skill` → id | `{collection, name, kind, mag, rarity, max_supply: number\|null, royalty_bps (≤1000), media}` | collection's creator | storage |
| `mint_skill` | `{skill, to, qty}` | skill creator, within supply | storage |
| `create_presale` → id | `{skill, price, start_ms, end_ms\|null, cap_total\|null, per_wallet\|null, allowlist: string[]\|null}` | skill creator | storage |
| `buy_presale` | `{id, qty}` | anyone (allowlisted if set) | ≥ price×qty + storage (~0.01 N), excess refunded |
| `end_presale` | `{id}` | skill creator or owner | — |
| `list_skill` | `{skill, qty, price_each}` | holder; escrows qty free units; re-listing replaces | ≥ 1 yocto + storage (attach ~0.01 N) |
| `cancel_skill_listing` | `{skill}` | seller | — |
| `buy_skill` | `{seller, skill, qty}` (partial qty ok) | anyone but seller | ≥ qty×price_each + storage (~0.01 N) |
| `equip` | `{token_id, skills: number[]}` replaces whole loadout, `[]` = unequip | monster owner (not renter); not busy (locked/rented), not listed | 1 yocto |
| `mt_transfer` | `{receiver_id, token_id: "skill:<id>", amount: "<n>", approval: null, memo: null}` | holder (free units only) | 1 yocto |
| `mt_batch_transfer` | `{receiver_id, token_ids, amounts, approvals: null, memo: null}` | holder | 1 yocto |
| `withdraw_owed` (existing) | `{}` | creators pull presale proceeds + royalties | — |

Money: `market_fee_bps` (config, default 250) of every presale buy and skill sale → treasury. Presale: rest → `owed[creator]`. Skill sale: `royalty_bps` → `owed[creator]` (0 when seller is the creator), rest pushed to seller (failure → seller's `owed`).

Equip caps (contract panics): `Max 3 skills`, `Skill equipped twice` (same id), `Effect equipped twice` (same effect kind), `Max +2 per stat`, `Max +3 total stat bonus`, `Max 2 effect skills`, `Not enough free skill units`, `Monster is busy`, `Monster is listed for sale`, `Not your monster`.

Loadout travels with the monster on `nft_transfer` and `buy`; the new owner can `equip(token, [])` to move the units into their own free balance.

`hatch_starters` also credits 3 Common mag-1 stat skill units (picked by the hatch seed from existing Common mag-1 stat types; none if no such types exist yet). Client's 0.1 N deposit still covers storage.

## Views
| method | args | returns |
|---|---|---|
| `skill_types` | `{from, limit}` (limit ≤ 50) | `SkillTypeView[]` (floor = cheapest listing price_each, last_price = last sale/presale price) |
| `collections` | `{from, limit}` | `Collection[]` |
| `skill_listings` | `{skill, from, limit}` | `SkillListing[]` (unsorted) |
| `skills_of` | `{account_id}` | `[skill_id, free, listed][]` (numbers; only skills held) — equipped units are on the monsters (`MonsterView.skills`) |
| `presales` | `{from, limit}` | `Presale[]` |
| `presale_bought` | `{id, account_id}` | number |
| `presale_allowed` | `{id, account_id}` | bool (true when no allowlist) — extra, not in plan |
| `is_creator` | `{account_id}` | bool |
| `price_history` | `{key}` `"skill:<id>"` or `"monsters"` | `[ms, price][]` oldest first, last 64 (presale buys + sales; monsters = all monster `buy`s) |
| `mt_balance_of` | `{account_id, token_id}` | U128 string, free units |
| `mt_batch_balance_of` | `{account_id, token_ids}` | U128[] |
| `mt_supply` / `mt_batch_supply` | `{token_id}` / `{token_ids}` | minted, U128 \| null |
| `mt_token` | `{token_ids}` | `({token_id, owner_id: null} \| null)[]` |

## Events (NEP-297, `EVENT_JSON:` logs, `data` is a 1-element array)
- `{"standard":"nep245","version":"1.0.0","event":"mt_mint","data":[{owner_id, token_ids, amounts}]}` (presale buy, mint_skill, starter skills)
- `nep245` `mt_transfer` `{old_owner_id, new_owner_id, token_ids, amounts}` (mt_transfer, buy_skill)
- `{"standard":"brawler","version":"1.0.0","event": ...}`:
  - `collection_create` (Collection), `skill_create` (SkillType), `presale_create` (Presale)
  - `presale_buy` `{id, key, qty, price, buyer}`
  - `list` `{key, seller, qty, price}`, `delist` `{key, seller}`
  - `sale` `{key, qty, price, seller, buyer}`; monster buys add `token_id`, key `"monsters"`, qty 1
  - `equip` `{token_id, owner, skills: number[]}`
- No `mt_burn` (nothing burns).

## Seed (`scripts/seed-skills.mjs`)
Collection "Arena Basics" (creator = owner `brawler-platform-5c8e2b.testnet`), royalty 500 bps, media `${MARKET_URL}/skills/<kind lowercased>.svg` (e.g. `/skills/airjump.svg`, collection `/skills/collection.svg`):
- `Power I`, `Agility I`, `Durability I`, `Speed I`: Common mag 1, unlimited, permanent shop presale 0.05 N.
- `Power II` … `Speed II`: Rare mag 2, supply 200.
- `Air Jump`, `Lifesteal`, `Quick Dodge`, `Second Wind`: Rare effect, supply 200.
- One Rare presale: `Air Jump` (env `RARE_PRESALE`), 0.2 N (env `RARE_PRICE`), 24 h, cap 200, 2 per wallet.

## Deviations from the plan
- Counts are u32 JSON numbers, not U128 strings.
- `equip` also refuses a monster listed for sale (stops a seller swapping the loadout under a buyer).
- Loadout stored on the monster record (not a separate map) — internal only.
- Creator create calls are payable (storage measured, excess refunded); `end_presale` needs no deposit.
- Extra views: `presale_allowed`, `mt_batch_supply`.
- Seed is a node script (`seed-skills.mjs`), not `seed-skills.sh`; Rare presale price (0.2 N) was unspecified.
