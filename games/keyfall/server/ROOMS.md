# Keyfall multiplayer room backend

How 1v1 rooms work in `keyfall-server` (`src/lib.rs`), from connect to on-chain payout. Game rules live in `src/game.rs` and `tasks/keyfall-spec.md`; this file covers rooms, the wire protocol, auth, settlement and failure handling.

## Overview

```
 browser A ─┐                         ┌─ chain seam (crates/chain: chomp Match PDA + settle)
            │  WebSocket (JSON)       │
 browser B ─┼──► keyfall-server ──────┤
            │   rooms: HashMap<code,  │
            │   Room> behind a Mutex  │
            │   ticker: every 50 ms
```

- One process, all state in memory. Exactly one instance may run (rooms are not shared).
- A **room** is a 4-letter code (`A-Z`) holding two seats, two authoritative sims (one per seat, same seed) and the match phase.
- Clients send only keystrokes. The server simulates both games and sends each player only their own view, so a client can't fake hits, damage or the result, or see the opponent during the match.
- Money never touches the server: stakes escrowed in the chomp Match PDA; the referee can only `settle`.

## Components

| Piece | Where | Job |
|---|---|---|
| `App` | `lib.rs` | `rooms: Mutex<HashMap<String, Room>>`, `chain: Arc<Chain>` |
| `Room` | `lib.rs` | `match_id`, `stake`, `names[2]`, `tokens[2]`, `conns[2]`, `gone_ms[2]`, `phase`, `count_ms`, `sims[2]` |
| `Session` | `lib.rs` | one per socket: hello nonce, `(code, seat)` once seated, rate limit |
| ticker | `router()` | `tokio::time::interval(50 ms)` → `App::tick()` |
| `Sim` | `game.rs` | rules; stepped at 50 Hz (20 ms) inside each 50 ms tick |
| `Chain` | `crates/chain` | `match_info`, `settle`, `verify_sig` |

## Room lifecycle

```
            host                 join (2nd seat)          3 s            win / time / forfeit
  (none) ─────────► wait ───────────────────────► count ──────► live ─────────────────────► over ─► removed
                     │                              │             │
                     └ host leaves: room removed    └─ seat drops: 15 s grace (rejoin with token), else forfeit
```

| Phase | What happens each tick | Leaves when |
|---|---|---|
| `wait` | nothing; one `state` sent when something changed | guest joins → `count`; host disconnects → room deleted |
| `count` | `count_ms -= 50`; `state` to both seats | `count_ms` hits 0 → `live` |
| `live` | `acc += 50`; step both sims every 20 ms; check `verdict`; `state` to both seats | verdict, forfeit |
| `over` | send `over` with `result` to both seats, referee `settle(matchId, winner ?? 2)` if staked, close sockets, delete room | — |

Disconnects during `count`/`live`: the seat's `conn` becomes `None` and `gone_ms` grows by 50 ms per tick. The sim keeps running (enemies keep attacking). `gone_ms ≥ 15 000` → the other seat wins (`forfeit`). Both seats gone at once → winner by the rules at that moment (`rank`), reason `forfeit`.

## Wire protocol

JSON text frames, max 4 KiB, max 30 messages per second per socket (extra are dropped silently). Unknown messages are ignored. Errors come back as `{t:'error', msg}`.

### Server → client

| Message | When |
|---|---|
| `{t:'hello', nonce}` | on connect; 32 random bytes, base64. Seat auth must sign it. |
| `{t:'room', code, seat, token, matchId}` | after a successful `host` / `join` / `rejoin`. Keep `token` to rejoin. |
| `{t:'peek', code, matchId, stake, host, full}` | reply to `peek` |
| `{t:'state', ...View, phase, count_ms, left_ms, names, conn}` | 20 Hz in `count`/`live`; on change in `wait`. Own sim only. |
| `{t:'over', ...View, result:{winner, reason, hp:[a,b], wpm:[a,b]}}` | match end, then the socket closes. Only place the opponent's numbers appear. |
| `{t:'error', msg}` | rejected request |

`View` (see `tasks/keyfall-spec.md`): `hp, wpm, strikes, stun_ms, input, target, gun, pivot, ents[], fx[], t_ms`. `fx` are one-shot events accumulated since the last view (sounds, laser, explosions).

### Client → server

| Message | Allowed when | Effect |
|---|---|---|
| `{t:'host', name, matchId?, account?, auth?}` | not seated | create room, seat 0 |
| `{t:'join', code, name, account?, auth?}` | not seated | take seat 1 of a `wait` room; starts countdown |
| `{t:'rejoin', code, token}` | not seated | retake your seat in a running room |
| `{t:'peek', code}` | any time | room info before joining (is it staked, how much) |
| `{t:'k', c}` | seated, phase `live` | one key: `a`-`z`, `\b` backspace, `\n` enter |

`name` is display only (the client sends the wallet account without `.testnet`, or `Guest`). It is never trusted for anything else.

## Free vs staked rooms

### Free room (no `matchId`)

1. A: `host {name}` → `room {code, seat:0, token}`. A shares `?room=CODE`.
2. B: `peek {code}` (stake `"0"`), then `join {code, name}` → `room {seat:1}`; countdown starts.
3. Match runs; `over` to both. Nothing on chain.

### Staked room (`matchId`)

Chain matches: client opens a chomp Match PDA (random u64 id), sends `matchId` + `account` + `sig` (base58 ed25519 over utf8 `chomp:keyfall:<matchId>:<hello.nonce>`). Server checks host = Match.a, guest = Match.b via `crates/chain`, and `settle`s on end. Without REFEREE_KEYPAIR the server refuses any `matchId` ("create a free room").

## Ending a match

`game::verdict` runs after every 20 ms sim step:

1. A city at 0 HP loses at once. Both at 0 in the same step → higher WPM, else draw.
2. At 2:00 → higher HP, then higher WPM, else draw.

Forfeits come from the room (grace expiry), not the sim.

## Fairness

Both sims get the same seed. Entity ids, kinds, words, sides and heights come from `hash(seed, id)`, so both players face the same enemies with the same words in the same order. The only per-player difference is timing: a player who clears their sky gets the next spawns sooner (schedule clock runs 1.2× while no enemy is on screen).

## Security and limits

| Threat | Mitigation |
|---|---|
| Client fakes hits, damage or result | server-authoritative sims; client sends only keys |
| Someone takes another wallet's staked seat | `host`/`guest` must match the chain match, plus a wallet signature |
| Replayed signature | nonce is per socket (hello) |
| Seat hijack on reconnect | `rejoin` needs the 128-bit random seat token from `room` |
| Spam / flooding | 4 KiB frames, 30 msg/s per socket, one key per `k` message |
| Server steals funds | referee can only post results; funds stay on-chain |
| Opponent scouting | each seat only ever receives its own view |

## Config

| Env | Default | Meaning |
|---|---|---|
| `PORT` | `8789` | listen port |

## Run and test

```sh
cargo run -p keyfall-server                 # ws://localhost:8789, free rooms
cargo test -p keyfall-server                # rules + end rules + same-seed fairness
npm run dev -w @xyz/keyfall                 # client on :3004 (?server=ws://host:port to override)
```

Manual two-player check: open the client in two windows, Host duel in one, open the `?room=CODE` link in the other. Close one window during the match: the other shows "disconnected"; reopen within 15 s and it rejoins (token in `sessionStorage`), otherwise the open window wins by forfeit.

## Known gaps (decide before mainnet)

1. **Restart loses rooms.** State is in memory. A staked match that was live when the server restarted is never reported; players must wait for `cancel` after 2 h to refund. Fix: persist `(code, matchId, seed, tokens, key log)` and replay on boot, or report `null` (refund) for orphaned live matches on startup.
2. **Host leaves after the guest paid.** If the host disconnects from a `wait` room after the guest's `join_match` landed but before the guest's `join` reaches the server, the room is deleted and the match stays `live` on chain. Same refund path (`expire`). Fix: keep staked rooms for a grace period instead of deleting them, or have the referee call `unjoin`/`report_result(null)`.
3. **Failed `report_result`.** After 5 retries the call is only logged; the match stays live until `expire`. Fix: a retry queue persisted to disk.
4. **Single instance.** Rooms live in one process; horizontal scaling needs sticky routing by room code or a shared store.
5. **No lobby list, no spectators, no rematch.** Players share room codes; `watch` was removed (the opponent is hidden by design).
6. **Rate limit drops silently.** A client sending more than 30 keys per second loses keys without notice (about 360 WPM, far above human speed).
7. **Tokens aren't bound to the wallet.** Anyone holding the seat token can rejoin that seat. The token is only ever sent to the socket that took the seat, and it lives in that tab's `sessionStorage`.

## Adding a feature: where it goes

| Change | Touch |
|---|---|
| new client message | `Session::on_msg` match arm (+ guard: seated or not) |
| new per-tick behaviour | `Room::step` |
| new end condition | `game::verdict` (sim) or `Room::step` (room-level, like forfeit) |
| new on-chain check | `App::get_match` filter in `host` / `join` |
| new field in views | `Room::view` (room-level) or `Sim::view` (game-level) |
