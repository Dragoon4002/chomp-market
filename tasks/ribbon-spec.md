# Ribbon Rush (`ribbon`) shared spec — binding for sim / server / client agents

## Sim (integer only, identical in Rust `games/ribbon/sim` and TS `games/ribbon/client/src/sim.ts`)
- W=48, H=32, TICK_HZ=15, FADE=90 ticks, CLOSE_AT=300 ticks, CLOSE_EVERY=75, MAX_RING=12, BOOST_TICKS=15, FREEZE=30, WIN_ROUNDS=2, MAX_ROUNDS=9.
- Dir: 0=up(y-1) 1=right(x+1) 2=down(y+1) 3=left(x-1).
- Input byte per seat per tick: bits0-2 = dir 0..3 or 7 (no change); bit3 (8) = boost. Helper `input(dir|null, boost) -> u8`.
- Spawns each round: seat0 (8,16) dir 1; seat1 (39,15) dir 3. Grid cleared.
- Grid stores per cell `expire` tick (u32, 0 = empty) + owner seat. Cell is solid iff expire > tick.
- Rider: x,y,dir,boost_left,boost_used,alive.
- `step([a,b])`:
  1. tick += 1. If done: return.
  2. If freeze > 0: freeze -= 1; if freeze hits 0 → reset round (spawns, clear grid, round_tick=0). Return.
  3. round_tick += 1. ring = round_tick < CLOSE_AT ? 0 : min(MAX_RING, 1 + (round_tick-CLOSE_AT)/CLOSE_EVERY).
  4. For each seat: d = in & 7; if d<4 and d != (dir+2)%4 → dir = d. If in & 8 and !boost_used → boost_used=true, boost_left=BOOST_TICKS.
  5. moves[i] = boost_left>0 ? 2 : 1; then if boost_left>0, boost_left -= 1.
  6. For sub in 0..2: for each alive seat with moves>sub: lay trail at current cell (expire = tick+FADE, owner=seat), move 1 cell. Then for each moved seat: crash if x<ring||y<ring||x>=W-ring||y>=H-ring or cell solid. If both moved this sub and heads on same cell → both crash. Stop sub loop once anyone crashed.
  7. If any crashed: if exactly one → other seat score += 1. rounds += 1. If any score==WIN_ROUNDS → done, winner=that seat. Else if rounds>=MAX_ROUNDS → done, winner = higher score or -1 on tie. Else freeze = FREEZE.
- Fields: tick, round_tick, rounds, score[2], riders[2], ring, freeze, done, winner (-1 none).
- `cell(x,y)` → 0 empty, 1 seat0 trail, 2 seat1 trail (solid only).
- `hash()` → u32 FNV-1a over: tick, round_tick, rounds, score0, score1, ring, freeze, done, winner+1, then per rider x,y,dir,boost_left,boost_used,alive (each value fed as one u32 LE, 4 bytes). Used by golden test.
- Rust API: `pub struct Sim`, `Sim::new()`, `step(&mut self, ins: [u8;2])`, `cell(&self,x,y)->u8`, `hash(&self)->u32`, `pub fn input(dir: Option<u8>, boost: bool)->u8`, pub fields as above (riders: `[Rider;2]`, winner: i8).
- TS API: `export class Sim` same names camelCase (roundTick, boostLeft, boostUsed), `export function input(dir: number|null, boost: boolean): number`, consts exported.

## Protocol (ws JSON `{t:...}`), server `games/ribbon/server`, default PORT 8788
- s→c on connect: `hello{nonce}` (hex 32 bytes; client passes to NEP-413 sign as nonce).
- c→s `auth{matchId, account, auth:{publicKey, signature}}`. NEP-413 message `ribbon:<matchId>`, recipient = CONTRACT_ID. Dev mode (no CONTRACT_ID): no auth/chain check, first 2 distinct accounts take seats 0/1.
- c→s `watch{matchId}` → spectator.
- s→c `sync{seat (-1 watcher), ticks:[[a,b],...]}` on auth/watch/reconnect: client rebuilds sim by replaying.
- s→c `start{at}` (unix ms when ticking starts, 3 s countdown) once both seats in.
- c→s `in{v}` input byte; server keeps latest dir per seat for next tick; boost bit latched until consumed.
- s→c `tick{n, d:[a,b]}` each tick (broadcast to seats + watchers).
- s→c `over{winner, kos:[s0,s1], reason}` reason: "win" | "forfeit" | "void".
- s→c `error{msg}`.
- HTTP GET `/tape/{matchId}` → `{ticks:[[a,b],...]}`.

## Referee rules
- Chain check on auth: `get_match{match_id}` status Live, game=="ribbon", account==host→seat0, ==guest→seat1.
- End: `report_result{match_id, winner, kos:[s0,s1], tape_hash}` 100 Tgas via near-svc `call`. tape_hash = sha256 hex of concatenated [a,b] bytes for every tick.
- Seat disconnected 10 s while live → other wins ("forfeit"). Both gone → void (winner null).
- Second seat never arrives within 5 min of first auth: if host present & guest absent → `call_now unjoin`, fallback void; else void.
- Env: PORT, NEAR_RPC, CONTRACT_ID, REFEREE_ID, REFEREE_KEY, TAPE_DIR (default ./tapes), TICK_MS (default 66, tests override).
