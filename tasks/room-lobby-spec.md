# Room lobby + spectator UX spec

Shared contract between the server (games/brawler/server) and the client (games/brawler/client). Anything not listed here keeps today's behavior and wire format.

## User flow

1. **Play** → two tabs: **Create** | **Join**.
   - **Create**: stake amount (NEAR, 0 = free), public/private, "let spectators bet". Create → (if stake > 0 or bettable: wallet `create_match`, host stake debited) → the **room lobby** screen.
   - **Join**: room-code box on top, public lobby list below (open rooms show host, monster, stake, Join; live rooms show Watch). Joining a staked room asks the wallet for `join_match` (debits the exact host stake) *before* entering the room lobby.
2. **Room lobby** (both players, same WebSocket that later plays the fight):
   - two player cards (portrait, name, archetype, "host"/"challenger", empty slot until someone joins), room code with copy button, stake + bettable chips.
   - each player can **change their monster** (picker) any time while waiting.
   - host can **change the arena** while waiting; challenger sees it update.
   - **chat** panel.
   - host has **Start** (enabled only when the challenger seat is filled). Challenger sees "Waiting for host to start". Fight begins only when host presses Start.
   - Leave button / Esc → back to lobby.
3. **Fight** → existing canvas + end dialog (Rematch R / Back to lobby Esc). Rematch keeps working as today.
4. **Spectators** (Watch): YouTube-style layout.
   - top bar: "Who will win?" with both player names/portraits and live odds (price of A vs B from the market, as % / bar).
   - main: fight canvas.
   - right sidebar: betting window (pick a side, amount, quote, Buy) on top, chat below. On narrow screens the sidebar stacks under the canvas.
   - market is the existing on-chain prediction market (`buy`, `quote_buy`, `get_prices`): price of A = b/(a+b), so buying A raises A's price and lowers B's. Free rooms (no matchId / not bettable) show chat only, plus a note that betting needs a staked bettable room.

## Protocol changes

Client → server (new / changed):
- `{t:'host', ...}` unchanged. Server replies `room` as today, then `roomstate`.
- `{t:'join', ...}` — **no longer starts the match.** Seats the guest, replies `room` (with `seat:1`), then broadcasts `roomstate`.
- `{t:'set', name?, dna?, stage?}` — only while `status == waiting` and only from a seated player. `name`/`dna` update the sender's seat (sanitized as today). `stage` accepted only from seat 0. Broadcast `roomstate`.
- `{t:'chat', text}` — from seated players or spectators in the room. Trim, max 200 chars, drop empty; rate-limit 1 msg / 500 ms per socket (excess silently dropped). Broadcast `{t:'chat', from, seat, text, ts}` to players + spectators of that room. `from` = player name for seats, `"Spectator"` (or the `account` they sent in `watch`, if any) for spectators. `seat` is 0/1 for players, -1 for spectators. Server keeps the last 50 chat lines per room.
- `{t:'begin'}` — only from seat 0, only when `status == waiting` and both seats are connected. Runs the existing start sequence (`game::begin`: chain DNA, rtt/delay, `start` to both, `spec` to spectators, lobby update). Error otherwise ("Waiting for a challenger" / "Only the host can start").
- `{t:'watch', code, account?}` — unchanged, plus server sends `roomstate` and `chatlog` after `spec`.

Server → client (new):
- `{t:'roomstate', code, status:'waiting'|'live'|'done', stage, stake, matchId, bettable, pub, view, seats:[{name, dna, account, connected}], spectators:n}` — sent to players + spectators on: host, join, set, leave, begin, finish, rematch reset.
- `{t:'chatlog', lines:[{from, seat, text, ts}]}` — sent once to anyone entering the room (host, join, watch).
- `{t:'chat', from, seat, text, ts}`.

Leaving while waiting:
- guest leaves → seat removed, room stays `waiting`, broadcast `roomstate` (on-chain: the guest's stake stays in the contract match; out of scope, note it in README).
- host leaves → room removed, guest gets `{t:'left'}` and is returned to the lobby by the client.

Lobby listing (`lobby_msg`): include `stake`, and waiting rooms stay listed while the host is connected.

Unchanged: tapes, referee, rematch, forfeit, spectator frames, `pick`/peer signalling during the start sequence.

## Non-goals
- No chat persistence beyond the in-memory 50 lines. No moderation beyond length + rate limit.
- Godot client is not updated.
