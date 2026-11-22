# Brawler bots

Bots that play, over the normal client protocol (free rooms only, nothing on-chain). Each seat runs the client sim + `Netplay` rollback on a 60 Hz clock like the browser, over the relay, mirroring its tape to the referee.
- **Called bots** (`bot-1.brawler` ... `bot-9.brawler`): when a host waiting alone in a free room presses "Call bot", the server flags the room in the lobby (`wantsBot`) and a bot joins under a monster name (shown with a "bot" chip), says hi, fights once the host presses Start and accepts rematches. Bots never host and never fight each other.
- **Commentator**: template play-by-play in live rooms' chat (start / KO / damage swing / comeback / over).
- **NPC skill merchants**: pricing rules live in `pricing.ts` (pure, unit-tested; the market imports it). The on-chain merchant bot is not ported yet. TODO(solana): re-add it against the Solana skills program.

```sh
npm test
SERVER_URL=ws://localhost:8787 npm start
docker compose -f infra/compose.yml up -d agents
```

| env | default | |
|---|---|---|
| `SERVER_URL` | `ws://localhost:8787` | game server WS |
| `COMMENTATOR` | `1` | `0` disables |
| `BOT_LEVEL` | `medium` | bot skill: `easy` / `medium` / `hard` (reaction lag, dropped attacks, input noise) |
| `COMMENTATOR_NAME` | `Bot Commentator` | chat name |
