# Testnet deployments

## v3 + monsters v2 (current live, 2026-11-15)

| role | account |
|---|---|
| platform v3 (signed settle, order book) | [v3.brawler-platform-5c8e2b.testnet](https://testnet.nearblocks.io/address/v3.brawler-platform-5c8e2b.testnet) |
| monsters + NEP-245 skills | [v2.brawler-monsters-5c8e2b.testnet](https://testnet.nearblocks.io/address/v2.brawler-monsters-5c8e2b.testnet) |
| referee (unchanged) | [referee.v2.brawler-platform-5c8e2b.testnet](https://testnet.nearblocks.io/address/referee.v2.brawler-platform-5c8e2b.testnet) |

Skills: 12 types seeded (ids 0-11), shop listings for the four "I" skills, Air Jump presale 24h.

| step | tx |
|---|---|
| platform v3 create+deploy+`new` | [96LECGG3Fe…](https://testnet.nearblocks.io/txns/96LECGG3FehbdntwcYyk2qNP2DCKZSF1wqv5VpMfjDkL) |
| `register_game("brawler", …)` | [FqqcKGhd2U…](https://testnet.nearblocks.io/txns/FqqcKGhd2UNJgc1eeWovqDULSF75dpUM5pdD5n1QcjnJ) |
| monsters v2 create+deploy | [8J7eiGg6ty…](https://testnet.nearblocks.io/txns/8J7eiGg6tyJx7Z5CKH3hG8aVizc5yG5B4GfftZbQovMw) |
| monsters `set_arena(v3)` | [FRtU3mp7jP…](https://testnet.nearblocks.io/txns/FRtU3mp7jPBiW9S5iBGnDKfu78ZdYp35Nakrtq6ojUVi) |

e2e 2026-11-15 19:28Z (`node scripts/testnet-e2e.mjs`, v3 + monsters v2): all asserts passed. Tx log (tail, from breed on):

| step | tx |
|---|---|
| breed | [eA4R1bQq8h…](https://testnet.nearblocks.io/txns/eA4R1bQq8hACTYwiCqQynMMGFoWh3MPC8v3FBXFtHok) |
| list | [659p3vrQsu…](https://testnet.nearblocks.io/txns/659p3vrQsubsXYtthBY85tiZJF7gNnU9U3oZY2b6fiAe) |
| buy monster | [CRcyQFuu2d…](https://testnet.nearblocks.io/txns/CRcyQFuu2dq5CypH9ofzQfKGHY2RWB88tt8yKESeU6ri) |
| offer_rent | [BZGNn8wjo6…](https://testnet.nearblocks.io/txns/BZGNn8wjo6E5YkxxQDgFMie9zQsGmBJas1PQvSKMbzb4) |
| rent 1 day | [G3DVcS8Txn…](https://testnet.nearblocks.io/txns/G3DVcS8TxnJtZ185b8ZMNUKpg8KUvgYdUyTZkPNcJ2ch) |
| create e | [Fa8ikv4nyt…](https://testnet.nearblocks.io/txns/Fa8ikv4nytrgukkqxYgUo8GaQR5HG6spPfyHzLgCCeaw) |
| hatch_starters e | [7RMAwGBsyp…](https://testnet.nearblocks.io/txns/7RMAwGBsypamvWvAkT9VBpdnzRjMW9FMiQ4RoMQLvX3v) |
| list (seller e) | [2fwRpC4Yvc…](https://testnet.nearblocks.io/txns/2fwRpC4Yvc28ecgnShpJhR5zxWz7xKt8YCWxku7EjCbJ) |
| delete e.brawler-monsters-5c8e2b.testnet | [7yyHTiu54u…](https://testnet.nearblocks.io/txns/7yyHTiu54uEcZugawqomDUUjgUi7hCXKLPBpBwQsQ1VS) |
| buy from deleted seller (payout fails, expected) | [JARVEdWswG…](https://testnet.nearblocks.io/txns/JARVEdWswGgUyzXA7fpS7tudoEN8tiRGUUxXw2sQBo7K) |
| create e | [HQWqm4wJJR…](https://testnet.nearblocks.io/txns/HQWqm4wJJRfsKMnwrBTeAmLuZVS3pmCQSEHHdHdU6KXu) |
| withdraw_owed | [ESPywuY2aX…](https://testnet.nearblocks.io/txns/ESPywuY2aXzitdJGL2Njk8788QEwSNapDquiZPqX4iSX) |
| create_tournament 4 | [67XeTcXoZr…](https://testnet.nearblocks.io/txns/67XeTcXoZrMEHsRwipxjYZVuS65bYhqYgdYGAvfh9Cen) |
| enter_tournament a | [FstYPwSz3f…](https://testnet.nearblocks.io/txns/FstYPwSz3fb3m8v1wdTh1e1LW7Sdp8Pxxy3YWQ8EXhGs) |
| enter_tournament b | [3uvetALmZL…](https://testnet.nearblocks.io/txns/3uvetALmZLsF8AA7mcpX4MZXqPNG3qoqYSHoDtDD1iBv) |
| enter_tournament c | [F6xdY5rQCu…](https://testnet.nearblocks.io/txns/F6xdY5rQCuCt2oa3jfasvJq65EvFBuABd786YRYFu6Pj) |
| enter_tournament d | [J98A9QxyhJ…](https://testnet.nearblocks.io/txns/J98A9QxyhJNb8kDLjTgyTkJi4x2xh7cQSg7VQ2k5QhgH) |
| settle t-semi1 w1 by b | [6xESq78TBu…](https://testnet.nearblocks.io/txns/6xESq78TBu1rYDHhw6q4GErgsnzfZTadhVXxm5rabeGx) |
| report t-semi2 void kos[0,2] | [CSM9ZkwkuY…](https://testnet.nearblocks.io/txns/CSM9ZkwkuYQsMVdddpXZU39zpd7j1ziazatVrrJkb4L5) |
| report final w1 (d) | [5wZMmbcJz5…](https://testnet.nearblocks.io/txns/5wZMmbcJz54Sd3rGiXU7Jsj9V8UQ3SQ9nWraE1zTH8Ss) |
| claim_tournament | [G1hpsMPyCH…](https://testnet.nearblocks.io/txns/G1hpsMPyCHuCFDnepYtcGkcmSao8FQKMeyQUPoFock8X) |
| withdraw a 0.1499 | [EgX3fMgztW…](https://testnet.nearblocks.io/txns/EgX3fMgztWQM56GEsnzha6afKfxjcEBGrk7Go5LEVY3d) |
| withdraw b 0.05 | [4tjV13K23m…](https://testnet.nearblocks.io/txns/4tjV13K23mjm4wzN9yVqoRh5HpUXKhLGNByCJybKTahX) |
| withdraw c 0.11197 | [DaDztnaH6u…](https://testnet.nearblocks.io/txns/DaDztnaH6u3KnmT1kx1KmTyX8t1WnqUkQZi3qibAutAE) |
| withdraw d 0.16792 | [Dd6pxjC8eD…](https://testnet.nearblocks.io/txns/Dd6pxjC8eDWvEKGgsPo42r2ftati2jgpheJWcG14usKm) |
| delete a.brawler-monsters-5c8e2b.testnet | [9UkhgLCB4B…](https://testnet.nearblocks.io/txns/9UkhgLCB4B6mDgE144ddqNPmqJSVfXc6P2JeQ3SFFAk3) |
| delete b.brawler-monsters-5c8e2b.testnet | [AohZVRvEoS…](https://testnet.nearblocks.io/txns/AohZVRvEoSd7okds4FQXkK5mdhaxGMHgpA7YUKQKmGZL) |
| delete c.brawler-monsters-5c8e2b.testnet | [EPNwKc3zva…](https://testnet.nearblocks.io/txns/EPNwKc3zvaWC9uFgGvB1u9sEiPHFZoqD2csL38NNb6FQ) |
| delete d.brawler-monsters-5c8e2b.testnet | [Fb3PehBTce…](https://testnet.nearblocks.io/txns/Fb3PehBTceoUWpYHod2erzw1N8gjfLMSW4vioRw2vKjz) |
| delete e.brawler-monsters-5c8e2b.testnet | [CfeSqkF97G…](https://testnet.nearblocks.io/txns/CfeSqkF97GJgQ7HXcuumGqdz1Z9cZ8Wyy7eMMSucAif6) |

## v3 deploy notes (pre-deploy)

Gasless `settle` by attestation + order-book market; fresh state, so a new account `v3.brawler-platform-5c8e2b.testnet`.
Preflight 2026-11-15: wasm 317200 B, needs 3.722 NEAR spendable on `brawler-platform-5c8e2b.testnet` (3.672 to the new account
+ gas), has 0.265 -> short 3.457 NEAR; monsters owner ok. Nothing sent.

Switch steps once funded:
1. `cd contracts/platform && cargo near build non-reproducible-wasm`
2. `node scripts/deploy-platform-v3.mjs` (preflight, then one tx create+deploy+`new`, then `wire-platform.mjs`:
   `register_game("brawler", referee.v2.brawler-platform-5c8e2b.testnet, brawler-monsters-5c8e2b.testnet, <referee public key from ~/.near-credentials>)`
   + monsters `set_arena(v3)` by the monsters owner). New monsters contract later: `MONSTERS_ID=<id> node scripts/wire-platform.mjs`.
3. `node scripts/testnet-e2e.mjs` (defaults to v3: order book, settle by winner, forged/replayed settle rejected, fallback report, tournament).
4. Point defaults at v3: `packages/platform/index.ts` PLATFORM_ID, server/infra `CONTRACT_ID`, README tables. Server keeps
   `REFEREE_ID`/`REFEREE_KEY` (same key); it logs `referee: gasless attestations` once the contract holds its key.
   The v2 treasury (≈1.57 NEAR) can be withdrawn by the owner (`withdraw_treasury`) once v2 is retired.

## v2 (superseded, 2026-11-14)

| role | account |
|---|---|
| platform (arena.wasm) | [v2.brawler-platform-5c8e2b.testnet](https://testnet.nearblocks.io/address/v2.brawler-platform-5c8e2b.testnet) |
| platform owner | [brawler-platform-5c8e2b.testnet](https://testnet.nearblocks.io/address/brawler-platform-5c8e2b.testnet) |
| referee (game "brawler") | [referee.v2.brawler-platform-5c8e2b.testnet](https://testnet.nearblocks.io/address/referee.v2.brawler-platform-5c8e2b.testnet) |
| monsters (unchanged, `set_arena` -> v2) | [brawler-monsters-5c8e2b.testnet](https://testnet.nearblocks.io/address/brawler-monsters-5c8e2b.testnet) |

Config: fee 10 bps, min_bet 0.01, max_bet 100, seed 0.5 NEAR (every bettable room seeds the config seed, stake or not), treasury funded 1.5 NEAR.
Keys: `~/.near-credentials/testnet/<account>.json`.

Deploy txs: create v2 `H2sX5ki3iABGYi9dCxXC25srMLro8te6NL7nX5Mb9vho`, deploy `2jJY3DfukMXcubGGrG1mbcy9oYCo9n11ErLYk3iSLBsU`,
new `8wQ35R3R6xCvursohayPmjW7EZr3s3x9bV6cdmezhVC8`, create referee `5eGpnQ7VCUDLCrT79HqbpM7mZkcWJWToGfQ3brWqMnW4`,
register_game `62F8bvUihZZ4RqrLmcozM7BFMnZdc4aCxMvsHdxbmrte`, set_limits `9jz4zqJzb2CdkGGpWJVujhHMwRViiHbkGcgNXJgvnb7S`,
set_seed `ip3ubYsPX5A53xBfrJrEyuMydgHTgSqTSw2rsMmgheY`, fund `J2spQ9oVCUun4phZHNtNY2tAZ2yYBuMMsjuW5SoHL9EE`,
monsters set_arena `AmDFAiztdj7dPFmVcY7sEFY4C8tsCXz9aJEf8NspqWnT`.

Code upgrade 2026-11-14 (bettable free rooms, seed independent of stake): `6AaoAfj2mnNufnmnzjaYiG82turjMEGwtZdiW64JoEei`.

v1 (`brawler-platform-5c8e2b.testnet`, referee `referee.brawler-platform-5c8e2b.testnet`) is superseded; monsters no longer accept its lock/unlock.

## e2e

`node scripts/testnet-e2e.mjs` (throwaway subaccounts of the monsters account, deleted at end; `--cleanup` after a crash).

Run 2026-11-14 (accounts `e2emwgmo64q{a..e}.brawler-monsters-5c8e2b.testnet`): all asserts passed. Checks: tape_hash stored, winner gets
2x stake - 0.1%, winning bettor profits, losing bettor 0, unjoin refunds guest + reopens, void refunds, failed sale payout -> owed ->
withdraw_owed, void semi advances seat with more KOs, champion gets pot - 0.1%, all balances withdrawn.

| step | tx |
|---|---|
| create a | [42Yop8ynmv…](https://testnet.nearblocks.io/txns/42Yop8ynmvM7KZnzqe2yucTCGEkPEZxUFe7FMGxgPp8o) |
| create b | [BmmFoxAuU7…](https://testnet.nearblocks.io/txns/BmmFoxAuU7CEXDx9zHML5a9mNJvEFxVEkmVZ4AFvvsAM) |
| create c | [2KngUjduPh…](https://testnet.nearblocks.io/txns/2KngUjduPhy2ttVBzz8aCzPSQ5SmtcgNKiq2bsmgQGsc) |
| create d | [FLqvo67GhE…](https://testnet.nearblocks.io/txns/FLqvo67GhEd74sKg1t8vyazH2odfkvHQ4MZ25RWV8jSE) |
| deposit a | [CLBBbC6gjX…](https://testnet.nearblocks.io/txns/CLBBbC6gjXBMDNgZPPmaG1tpCe2umCXgoAczn2DK7eKt) |
| deposit b | [56GWzHqbUU…](https://testnet.nearblocks.io/txns/56GWzHqbUUj2jPpaCtvKCEa8Wr2NVHoUPeYkjJZtBMXu) |
| deposit c | [FuLvn7Zpd5…](https://testnet.nearblocks.io/txns/FuLvn7Zpd58pEGrEqn7r3ACaB5aFWdqowbeaNssFfmQT) |
| deposit d | [J3eh3jnxTb…](https://testnet.nearblocks.io/txns/J3eh3jnxTbpojV6GnK4hJx7VjTV5husfsz1vcKybwKVs) |
| create_match bettable 0.05 | [7u9tdbtRj3…](https://testnet.nearblocks.io/txns/7u9tdbtRj35e8DXNrj8rhW73seRWG4iDvkidBA99zZdG) |
| join_match | [9Wm7qVwTBg…](https://testnet.nearblocks.io/txns/9Wm7qVwTBgM25qQWiU3fH4CQwWX2ESUfk6mFwBBudnQL) |
| buy c side0 0.02 | [Bh2hKGkYuu…](https://testnet.nearblocks.io/txns/Bh2hKGkYuuGHbvCH15vXE4eouHb5AhMECVH1TRNF9x7g) |
| buy d side1 0.02 | [9Df6xuRnEY…](https://testnet.nearblocks.io/txns/9Df6xuRnEYdT23Ly8DxfnwkpRDLoc4SnRPsmVTALXa1o) |
| report_result w0 + tape_hash | [8ZE43bD8f1…](https://testnet.nearblocks.io/txns/8ZE43bD8f1unEPdwUsJmtx6nWVgSRGFt6dicYmJX2LGx) |
| claim winner a | [EHrMdiUT4Y…](https://testnet.nearblocks.io/txns/EHrMdiUT4YYxDZy81MxoShMjrM5qUtHSV9STWdD7PpNL) |
| claim bettor c | [FRZNGrny4R…](https://testnet.nearblocks.io/txns/FRZNGrny4RpbribbVMLuzF2DB993oYsNP1e3s8zmQvGg) |
| create_match 0.05 | [4yxymzwMUy…](https://testnet.nearblocks.io/txns/4yxymzwMUynYpsP9dpRmiR1E6LWE22THAPRiyaM8Rq9N) |
| join_match b | [CBx9tv7HCy…](https://testnet.nearblocks.io/txns/CBx9tv7HCygW2AsQFA6B8CRqBttoYiTGpp6JhjcZwzif) |
| unjoin (referee) | [BaL4yMRxus…](https://testnet.nearblocks.io/txns/BaL4yMRxusgF2e6Audg9ckabnNRj7tLyoCtuSZKffpUb) |
| join_match c | [B22uxHH4En…](https://testnet.nearblocks.io/txns/B22uxHH4EnomYyvoqgvEe2PCjDVcv142GqHevSUb6ARr) |
| report_result void | [AseQwTh2EQ…](https://testnet.nearblocks.io/txns/AseQwTh2EQVy3cAe2DzwJgUamAwWqKoV837RKvRNs9Vy) |
| claim void a | [GvMYpzBxW3…](https://testnet.nearblocks.io/txns/GvMYpzBxW3SfuGSVS9QkEEwjk2qaEHmd3C1SFDQhgPk) |
| claim void c | [HE7Zpumcbk…](https://testnet.nearblocks.io/txns/HE7ZpumcbkQ9ajTTsf76u5qbPXKX6Bz6VcNnp5B61Gti) |
| hatch_starters a | [12kV7ZuYdj…](https://testnet.nearblocks.io/txns/12kV7ZuYdjRjJmszBnumi9L9rNdYpBnQ76STcvFeBWmK) |
| hatch_starters b | [ACwSnejMvE…](https://testnet.nearblocks.io/txns/ACwSnejMvECJn45igPoi2wVqkYpuYYyjVybug4PU7eEL) |
| hatch_starters c | [3iApLz1ibN…](https://testnet.nearblocks.io/txns/3iApLz1ibNmU17zzwWnCNpDvkENtKNRDmdDdUdRFFoVx) |
| hatch_starters d | [B2tfGVGLjx…](https://testnet.nearblocks.io/txns/B2tfGVGLjxvfoNDbEBFxoTRXogG3JQGkHnHQ4rLUUhki) |
| breed | [CNAvLr4uGJ…](https://testnet.nearblocks.io/txns/CNAvLr4uGJMAFxdNPd4X62QktQauukBZQbYompgac94m) |
| list | [45ocFVUEwz…](https://testnet.nearblocks.io/txns/45ocFVUEwzzaaZSzU3ZY1xJbBfNcLYi8WujMEAAsgukd) |
| buy monster | [Edp4mLKfmm…](https://testnet.nearblocks.io/txns/Edp4mLKfmm93pzpoJFNNZnwTmMGrCMvZq8AkEWUXW9Vi) |
| offer_rent | [GBDkFAQW7u…](https://testnet.nearblocks.io/txns/GBDkFAQW7uKt39wYEig9zZavjczq87jXtp3fwujiQVmU) |
| rent 1 day | [H8d7FykFFv…](https://testnet.nearblocks.io/txns/H8d7FykFFvV7xh3825R5f1khnRzQEkHpwrS2zvMWTF2y) |
| create e | [EFyDeB2n6x…](https://testnet.nearblocks.io/txns/EFyDeB2n6xXsBJW7GaGKG6PjBMWE8xmktVZYAsn5rFcD) |
| hatch_starters e | [BA4DJtyPA9…](https://testnet.nearblocks.io/txns/BA4DJtyPA921AaTWszfU6m1yu4riGQd46smmTf3LjfGF) |
| list (seller e) | [8FASmqWHa3…](https://testnet.nearblocks.io/txns/8FASmqWHa3G9x4C6H4HGg1ApxzobL749Q7ffEXKopYhF) |
| delete e.brawler-monsters-5c8e2b.testnet | [7YPtwKR2ix…](https://testnet.nearblocks.io/txns/7YPtwKR2ixUEwYma2THzrMWd2spuUweQZqgyCBGi3D96) |
| buy from deleted seller (payout fails, expected) | [8AMZtDrR9P…](https://testnet.nearblocks.io/txns/8AMZtDrR9PG9HkiYyuDHwyaPQNNhVHAwBTmXuLVN8MD2) |
| create e | [DtgEcY6VJQ…](https://testnet.nearblocks.io/txns/DtgEcY6VJQUEbAgXscbY7XFxaF8p7fzgRpAyVDSMwm6q) |
| withdraw_owed | [2U6xxwApgQ…](https://testnet.nearblocks.io/txns/2U6xxwApgQwUwQzYVK3FaYcGK81MBP5Yff5FgJvomhyG) |
| create_tournament 4 | [8XL6qUFFcv…](https://testnet.nearblocks.io/txns/8XL6qUFFcv7rEkpZiACVsGieWyaQ9156gCmo9EfSxjNo) |
| enter_tournament a | [7fhX6zCUZB…](https://testnet.nearblocks.io/txns/7fhX6zCUZBnPUemjixujmUJYnWdzKvDHptTkSkS37re2) |
| enter_tournament b | [Hhnuc19qzt…](https://testnet.nearblocks.io/txns/Hhnuc19qztivgWX8KLjsfoLhAjzs3FsBhdTKH5tZ1NxJ) |
| enter_tournament c | [2RFvNUSvsK…](https://testnet.nearblocks.io/txns/2RFvNUSvsKwyMgo3H31VshsQkasjCoTjEbN3kpuNBzTL) |
| enter_tournament d | [EM3562kYD1…](https://testnet.nearblocks.io/txns/EM3562kYD1dySgYU7kzvHtUahFR8CpvQxgNgzyg9Fd2V) |
| report t-semi1 w1 (b) | [Dfg4EfoWhg…](https://testnet.nearblocks.io/txns/Dfg4EfoWhgX5rPk5wyFY1HreD7gasn6TRBaPdDutxaQM) |
| report t-semi2 void kos[0,2] | [DXVTkF5mN6…](https://testnet.nearblocks.io/txns/DXVTkF5mN6nGQD3Gqi8nLfFLwyLzhZZLN2gwWuPsgTes) |
| report final w1 (d) | [4ZdKpcW32u…](https://testnet.nearblocks.io/txns/4ZdKpcW32uNXFTV79FhS4jA9VREAQvM5m1qfB4SeCsCr) |
| claim_tournament | [3Q76gMQ5Rr…](https://testnet.nearblocks.io/txns/3Q76gMQ5Rr4vsXuTwAH35FjJmsyWowBty74Vv8Wm3J2A) |
| withdraw a 0.1499 | [xqshuSznbw…](https://testnet.nearblocks.io/txns/xqshuSznbwGpWTpTGUgKA9g47BUex1qr9xRMjR6uEQv) |
| withdraw b 0.05 | [8zpihShMrs…](https://testnet.nearblocks.io/txns/8zpihShMrsqRqKefArrcnYNh5i5S7guGADaz8xTzZYeD) |
| withdraw c 0.114255507287796513289511 | [55sMFJp2Hy…](https://testnet.nearblocks.io/txns/55sMFJp2HyCBTBvv13kDBXTK7ZmKh67EK8AV7tnUDKw8) |
| withdraw d 0.15992 | [6nweANt4V4…](https://testnet.nearblocks.io/txns/6nweANt4V4GhSwm5xhHovVNiEi6CHVFnWnFsmoB9bshb) |
| delete a.brawler-monsters-5c8e2b.testnet | [4iivd4cuV8…](https://testnet.nearblocks.io/txns/4iivd4cuV8ftbXZuf9V1BX1NgHuymT4x6VKimUerHZYw) |
| delete b.brawler-monsters-5c8e2b.testnet | [BBRSdCWaU3…](https://testnet.nearblocks.io/txns/BBRSdCWaU3U7fMyGCWde8iJT1VJgcuKgnvy4gh74nSGi) |
| delete c.brawler-monsters-5c8e2b.testnet | [AuzjkJ3oNP…](https://testnet.nearblocks.io/txns/AuzjkJ3oNP5yMiRnFSFZ4c2SPE2P8S4rt2PXtoWxqnQ8) |
| delete d.brawler-monsters-5c8e2b.testnet | [GkrqDUH1Jy…](https://testnet.nearblocks.io/txns/GkrqDUH1JyaBDgf8i3pdDHucbdUSeY1TFeRS9pgb9Fdq) |
| delete e.brawler-monsters-5c8e2b.testnet | [GCWmWzPPK9…](https://testnet.nearblocks.io/txns/GCWmWzPPK9jXWhH1wtDEjBruKYemUh2C7cSeNduuDtvw) |
