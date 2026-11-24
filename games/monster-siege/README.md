# Monster Siege

Real-time 1v1 hex-board card duel (landscape). Drop a card on the path = squad marches from your core; on free ground in your zone = permanent defender. Spec: `INTAKE.md`. Client is plain JS in `build/` (no build step); relay in `server/`.

## Run

```sh
node games/monster-siege/build/smoke.mjs                      # determinism, bot-vs-bot, drop rules, mirror symmetry
python3 -m http.server -d games/monster-siege/build 8091      # standalone: http://localhost:8091/?seed=42
cd market && bun dev                                          # portal (restart after game.json changes): http://localhost:3100/play/monster-siege
cargo run -p monster-siege-server                             # live 1v1 relay on ws://localhost:8790 (PORT env)
cargo test -p monster-siege-server
```

Live 1v1: open the game in two tabs (add `?ws=ws://host:port` for a non-default relay), Host in one, type the 4-letter code + Join in the other.
Debug: `?selftest` runs bot vs bot at 12x; `r` toggles defender ranges. Seat 1 sees the board point-mirrored (own core always on the right).

## Relay protocol (JSON over ws, lockstep, server never runs the sim)

| Client → server | Effect |
|---|---|
| `{t:'host', name, loadout:{deck}}` | new room, seat 0 → `{t:'room', code, seat, token}` |
| `{t:'join', code, name, loadout}` | seat 1; 3 s count, then `start` to both |
| `{t:'rejoin', code, token}` | retake seat within 15 s; gets `start` with the full play log |
| `{t:'play', card, x2, y}` | card = deck index 0..7, hex (x2 0..40, y 0..10, `build/map.js`) → broadcast `{t:'play', seat, card, x2, y, apply_tick: tick + 6}` |
| `{t:'over'}` | both sent → room removed |

Server → client: `start {seed, loadouts, names, plays, tick}`, `beat {tick}` every 3 ticks (30 Hz clock), `peer {conn:[a,b]}`, `forfeit {winner}` (seat gone > 15 s), `error {msg}`.
Clients step the sim only while `t < beat`, applying plays whose `apply_tick == t`; invalid plays (not in hand, no energy, bad hex for the card) are dropped by the sim on both sides.
Limits: 8 KiB frames, 20 msgs/s and 4 plays/s per socket. Room removed at match end (both `over`, or 4:05 of ticks).
