# Judging readiness (2026-11-14)

Parallel worktree agents, merged + verified by orchestrator, then one final push + deploy.

## Wave 1 (parallel)
- [x] A ui: Practice vs bot (no wallet), touch pad, hide /godot
- [x] B contracts (v2.brawler-platform-5c8e2b.testnet): tape_hash on settle, guest unjoin refund, bettable drain fix, tournament void bias, fresh testnet deploy, money-path e2e
- [x] C server+client: persist tapes, /tape endpoint, report tape hash, unjoin on guest leave, /replay page, mid-match reconnect
- [x] D bots: exhibition + challenger fighters, commentator (user: bots play, no LLM, no betting): NEAR AI Cloud bettor agents + match commentator
- [x] E hosting: client container on AWS box behind Caddy (live URL)

## Wave 2 (after merge)
- [x] README rewrite (pitch, live URL, contracts + explorer, on-chain table, NEAR usage), branding
- [x] NEAR Hunt submission + X post text (user submits)
- [ ] Demo video 60-90 s
- [ ] Verify all, push, deploy

## Notes
- Wallet: user asked (2026-11-14) wallet required for online rooms; practice is wallet-free.
- NEAR Hunt listing / X post need user's accounts.

## Submission checklist (NEAR HACKATHON, deadline 2026-11-14T23:59:00Z — run `date -u`)
Rules: `../Hackathon_reference/HACKATHON.md`, live https://nearhackathon.com/HACKATHON.md (re-read before submit).
- [x] 01 Build. Code since announcement (2026-10-19) counts; first commit 2026-11-11
- [x] 02 Repo public (github.com/Dragoon4002/brawler-arena, verified PUBLIC 2026-11-14)
- [ ] 03 X demo post: "built at NEAR HACKATHON", tag @NEARProtocol + #NEARHackathon (opt @NearLegion @NearBuilders), video attached (screenshots not enough, Q-012). Draft in `submission.md`; user posts
- [ ] 04 Submit repo link + demo post link (both required). POST /api/applications, print payload, user confirms. One shot, fixes via /request-changes
- [x] LICENSE file (Q-014)
- [x] README: libs/templates/AI code (Q-005), track hints used
- [ ] main merged + pushed before deadline
- [ ] Keep hosted demo up to 2026-11-18 (ideally 11-25)

Payload values from user (never guess): projectName, leadName, email, size (`1`/`2 - 4`/...), tracks [games, nfts, open], nearAddress (mainnet), projectUrl, demoUrl, idea (20-2000 chars), consent (read notice verbatim). requestId: generate once, reuse on retry. Never commit payload.
