# Score improvements (2026-11-14)

Rules: `../Hackathon_reference/HACKATHON.md`. Submission checklist: `judging-plan.md`.

## How points are won and lost

- Hints are optional (Q-011). Agent NPCs, social login, Intents, NEP-245, sub-accounts = bonus if present, no penalty if absent.
- AI screening first (Q-017): reproducibility, feature verification, preliminary score. A README claim that fails a check costs more than a feature never claimed.
- `games`: judged on game loop, not token. Bonus if players never notice the chain.
- `nfts`: NFTs that act like accounts (own money, earn, hold inventory, gate access).
- Demo post needs a video (Q-012). Hosted demo = plus.

## Before deadline (23:59 UTC 2026-11-14)

- [x] MIT LICENSE
- [x] README: judge steps, track fit, libs + AI code disclosed
- [x] README step 2: "Call bot" free rooms only
- [x] README: what moves with a monster on transfer
- [x] `submission.md`: bots join via "Call bot", don't host
- [ ] Logged-out browser: check watching a room needs no wallet (README claims it)
- [ ] 60-90 s demo video
- [ ] X post (user publishes)
- [ ] Merge staging -> main, push
- [ ] Submit once: tracks `games`, `nfts`, `open`

## Games track (gain vs effort)

| # | Improvement | Gain | Effort | Hits |
|---|---|---|---|---|
| 1 | Function-call access key for game calls (seat, stake, bet) after one wallet sign-in; no popup per action | High | 2-4 h | "never notice chain" |
| 2 | Wallet-free online play: guest login for free rooms (NEP-413 seat proof skipped when no stake) | High | 1-2 h | no popups in normal loop |
| 3 | Bots get testnet accounts; stake in staked rooms and bet in spectator markets, rules in one file | High | 4-6 h | Agent NPCs with wallets |
| 4 | Deploy NEP-245 skills; earn/buy/equip skills in normal play | Med | 2-3 h + upgrade risk | NEP-245 items |
| 5 | Price tooltip on market: why price moved (pool sizes, last trades) from `lib/market.ts` | Med | 1 h | pricing reasoning |
| 6 | Fast-forward economy demo: `MarketSim` extended to many matches, monster prices, rentals over a simulated week | Med | 2-3 h | watch economy move |
| 7 | Social/email login (e.g. a wallet with email onboarding in near-connect) | High | unknown, check docs | social login |
| 8 | NEAR Intents: deposit from another chain into platform balance | Low-Med | 4 h+, mainnet only (Q-007) | Intents hint |

## NFTs track (gain vs effort)

| # | Improvement | Gain | Effort | Hits |
|---|---|---|---|---|
| 1 | Monster earns: per-NFT balance for prize share / rent income, paid to current holder, moves on transfer | High | 3-4 h | NFT owns money |
| 2 | Per-NFT history adds earnings, payouts, past holders (index `nft_transfer` events) | Med | 2 h | history view |
| 3 | Holder-only page: e.g. a monster's training room, gated by NEP-413 signature + `nft_token` owner check | Med | 1-2 h | gated page |
| 4 | Tests: transfer while locked, transfer clears listing, sale during payout | Med | 1-2 h | transfer tests |
| 5 | README threat model: every way a seller could keep value, what stops it | Med | 30 min | threat model |
| 6 | Sub-account per monster (`<id>.monsters.testnet`) holding its earnings | High | 6 h+ | sub-accounts hint |

## Demo video + X post

- First line: user problem, not project name. E.g. "Online fighting games ask you to trust the server. Here the chain holds the money and checks the result."
- One full moment: host staked room -> fight -> KO -> payout shown -> `/replay` hash matches contract.
- Show spectator market price moving live.
- Say NEAR's role concretely: escrow without server custody, tape hash on-chain, NFT locked while fighting.
- End: live link + repo + one real question to viewers.
- 60-90 s. No intro slides, no architecture.

## During judging (2026-11-16 to 11-18)

- Keep AWS box + Vercel up to 11-18, ideally 11-25 (Q-012).
- No pushes to `main` after the deadline; work on `staging`.
- Repo stays public, LICENSE stays.
- Watch server logs for crashes; bots + commentator running so lobby isn't empty.
