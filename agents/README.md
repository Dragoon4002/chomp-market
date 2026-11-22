# Brawler bots

Bots that play, over the normal client protocol (free rooms only, nothing on-chain). Each seat runs the client sim + `Netplay` rollback on a 60 Hz clock like the browser, over the relay, mirroring its tape to the referee.
- **Called bots** (`bot-1.brawler` ... `bot-9.brawler`): when a host waiting alone in a free room presses "Call bot", the server flags the room in the lobby (`wantsBot`) and a bot joins under a monster name (shown with a "bot" chip), says hi, fights once the host presses Start and accepts rematches. Bots never host and never fight each other.
- **Commentator**: template play-by-play in live rooms' chat (start / KO / damage swing / comeback / over).
- **NPC skill merchants** (`merchant.ts`, on-chain, testnet): each merchant is its own NEAR wallet (`smithy.brawler-platform-5c8e2b.testnet` sells stat skills 0-7, `alchemist.brawler-platform-5c8e2b.testnet` sells effect skills 8-11; catalog by account prefix). Every tick: read own stock (`skills_of`), demand (`price_history`, last hour, presale mints excluded) and cash (balance) → `pricing.ts` → restock from the presale when the shelf is at half target (keeps 2× the cash floor), buy back player listings at ≤ bid, re-list everything (`list_skill`) when the ask moved > 3% or stock changed. Cash under the floor = broke: no restock/buybacks, clearance at 0.5× mint price until sales refill it. All rules live in `pricing.ts` (pure, unit-tested); the market imports the same file to explain each merchant listing, and `/economy` fast-forwards a week with it.

```sh
npm test
SERVER_URL=ws://localhost:8787 npm start
ONCE=1 MERCHANTS=smithy.brawler-platform-5c8e2b.testnet,alchemist.brawler-platform-5c8e2b.testnet node --experimental-strip-types merchant.ts  # one merchant pass, keys from ~/.near-credentials
docker compose -f infra/compose.yml up -d agents
```

| env | default | |
|---|---|---|
| `SERVER_URL` | `ws://localhost:8787` | game server WS |
| `COMMENTATOR` | `1` | `0` disables |
| `BOT_LEVEL` | `medium` | bot skill: `easy` / `medium` / `hard` (reaction lag, dropped attacks, input noise) |
| `COMMENTATOR_NAME` | `Bot Commentator` | chat name |
| `MERCHANTS` | empty (off) | comma list of merchant account ids |
| `MERCHANT_KEYS` | `{}` | JSON `{"<account id>": "ed25519:<secret>"}`; falls back to `~/.near-credentials/testnet/<id>.json` |
| `MERCHANT_EVERY_S` | `120` | merchant tick |
| `ASSETS_ID` | `v2.brawler-monsters-5c8e2b.testnet` | skills contract |
| `NEAR_RPC` | `https://test.rpc.fastnear.com` | RPC (429s are retried with backoff) |
