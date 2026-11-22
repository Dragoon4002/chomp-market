# monsters

NEP-171/177/181 monster NFTs for Brawler Arena: on-chain genes, breeding, P2P market, rentals, seasons.
Token id = "0", "1", ... Init: `new(owner_id, arena_id)`. Genes are an exact port of `src/genes.ts` (same u32 seed → same monster); seed = first 4 bytes of `env::random_seed()`.

Skills (NEP-245 `"skill:<id>"`, presales, skill market, `equip`): see `../plans/skills-interface.md`. Deploy: `node scripts/deploy-monsters-v2.mjs` (balance preflight; `--check` only checks).

## Calls
| call | who | deposit |
|---|---|---|
| `hatch_starters()` → 3 gen-0 | anyone, once | storage (measured, < 0.1 N; excess refunded) |
| `breed(a, b)` → child | owner of both (free, off cooldown) | `breed_fee` + storage, excess refunded |
| `list(id, price)` / `delist(id)` | token owner (list: not locked/rented) | list: 1 yocto |
| `buy(id)` | anyone | == price |
| `offer_rent(id, price_per_day, max_days)` / `cancel_rent_offer(id)` | token owner | offer: 1 yocto |
| `rent(id, days)` | anyone but owner | == price_per_day × days |
| `nft_transfer` / `nft_transfer_call` | owner, not busy | 1 yocto |
| `lock(id, account, until_ms)` → Dna, `unlock([(id, until_ms)])`, `record_result(...)`, `add_title(id, t)` | arena only | — |
| `start_season(name, ends_ms)`, `end_season()`, `set_arena`, `set_fees`, `withdraw_treasury` | owner | 1 yocto |

Views: `get_monster`, `monsters_of`, `rented_by`, `get_history` (newest first, 50 max), `listings`, `rent_offers`, `starters_claimed`, `config`, `get_season`, `get_leaderboard`, plus NEP `nft_token`/`nft_tokens`/`nft_tokens_for_owner`/`nft_metadata`.

## Fees (defaults, `set_fees`)
- breed 0.1 NEAR → treasury; 1 h cooldown on both parents; child gen = max(parents) + 1.
- sale: 2.5% market fee → treasury, 5% royalty → breeder (only gen > 0 and breeder ≠ seller), rest → seller.
- rent: 2.5% → treasury, rest → owner. Offer stays after a rental ends.
- caps: market + royalty ≤ 50%, rent ≤ 50%.

## Trust
- Busy = locked (`locked_until_ms > now`) or rented out. Busy monsters can't be transferred/listed/bred; transfers clear listing + rent offer.
- Renter can only fight (arena `lock`); owner can't lock while rented out. Locks expire on their own; `unlock` only clears the exact lock it was given.
- The arena account is fully trusted for locks, results, history and titles. The owner is trusted for seasons, fees and treasury.
- Payouts are push transfers; a failed one is credited to `treasury` (owner makes the payee whole). Minting storage is paid by the caller; history/titles/rentals storage by the contract.
- Randomness = block `random_seed`: fine for cosmetics/stats on testnet, a validator could bias it.
