# Keyfall spec v2 — 1:1 web rebuild of the user's own Unity game (Typewriter Command), as a 1v1 duel

Reference (authoritative for every mechanic, number, layout, visual and sound): `tasks/keyfall-reference.md`
(decompiled C# lives in scratchpad `ref/out/src/`, read-only, if a detail is missing). "Copy as-is" unless changed below.

## Changes vs reference (only these)
1. No score, multiplier, flawless/quickdraw/lightning/multikill labels, high score, pause, revenge tracker scoring.
2. Match = 2:00 (`DURATION_MS = 120_000`), 3 s countdown before t = 0. HUD: Health bottom-left (as original), WPM where score was (bottom-right), timer top-center.
3. Tutorial balloons kept but faster: first balloon at 1 s, next 3 s after previous (or 0.1 s after one dies), 3 balloons, phase ends at 10 s or 3 gone; balloon moveSpeed 1.4 (slower than original 1.5). Bombers a bit faster: speed 1.45 + 0.085/spawn, max 4.2. Day/night cycle 80 s (40 s day + 40 s night), random start at day or night. No name field: identity = wallet account (minus `.testnet`) or "Guest". First bomber 4 s after tutorial ends (was 9). Choppers start at 45 s, first one 12 s later. All other ramps as original.
4. 1v1: each seat plays its own independent sim. Both sims use the same seed, so the spawn SCHEDULE (times, sides, heights, kinds, words of balloons/bombers/choppers) is identical. Fairness rule: entity word = pick from its bucket using rng seeded by `hash(seed, entity_id)`; entity ids for scheduled spawns come from a schedule counter (identical across seats); bombs use id = `bomber_id * 1000 + pass_no` with the same hash pick. Anti-repeat (last 20) applies only to scheduled spawns. Drop the starting-letter diversity rule (state-dependent). Schedule must never depend on player actions: tutorial phase is a fixed 10 s (no early end on kills; balloons every 3 s regardless of kills), and the bomber word-length ramp advances one step per 8 bombers SPAWNED (original: per 5 killed). Fireball id = chopper_id*1000 + shot_no. Empty-sky boost: while no typeable enemy (balloon/bomber/bomb/chopper) is on screen, the schedule clock (tutorial/balloon/bomber/chopper timers) runs 1.2x. Both seats still get the same enemies, words, sides and heights in the same order; a player who clears the sky gets the next ones sooner. Match timer stays real time.
5. Players never see each other during the match. No PvP effects.
6. End: a city at 0 HP loses immediately (if both reach 0 in the same tick: higher WPM, else draw). At 2:00: higher HP, then higher WPM, else draw (`winner: null` -> refund).
7. WPM = (chars of words destroyed by the player) / 5 / (t_minutes), 0 for t < 1 s, rounded.
8. Typing: exactly the original per-key rules (lock onto shortest prefix match, strike rules, backspace never strikes, auto-submit 0.15 s after a full word, Enter submits, 3 strikes = 1 s stun, turret 180°/s, fires when |Δ| < 1°, laser 0.2 s, kill on fire). Input max 16 chars, a-z only (lowercased) + backspace.
9. Words: `games/keyfall/client/public/words.txt` (484 original words, 3-12 letters). Buckets by length: bomb/balloon 2-4 (len<=3 weight 3, len 4 weight 1), bomber 4-7 with the original GameManager length ramp, chopper 6-8.

## Units
World units exactly as reference: view x ∈ [-8.889, 8.889], y ∈ [-5, 5], 108 px/unit at 1920x1080. Sim at fixed 50 Hz (`DT = 20 ms`) in both Rust and TS.

## Snapshot (`View`) — produced by TS sim and by server, consumed by renderer
```ts
type Kind = 'balloon' | 'bomber' | 'bomb' | 'chopper' | 'fireball';
type Ent = { id: number; k: Kind; x: number; y: number; vx: number; vy: number; w: string; flip: boolean }; // w = '' for fireball
type Fx = // one-shot events since last snapshot, for sound/visual
  | { e: 'key' } | { e: 'strike' } | { e: 'stun' } | { e: 'laser'; x: number; y: number } | { e: 'boom'; x: number; y: number }
  | { e: 'bombfall' } | { e: 'chopperfire' } | { e: 'cityhit'; dmg: number } | { e: 'siren' };
type View = {
  phase: 'wait' | 'count' | 'live' | 'over'; count_ms: number; left_ms: number; t_ms: number;
  hp: number; wpm: number; strikes: number; stun_ms: number;
  input: string; target: number | null;          // server's input buffer + locked entity id
  gun: number; pivot: number;                    // turret angles, radians (TurretGun, GunPivot)
  ents: Ent[]; fx: Fx[];
  names: [string, string]; conn: [boolean, boolean];
  result?: { winner: 0 | 1 | null; reason: 'ko' | 'time' | 'forfeit'; hp: [number, number]; wpm: [number, number] };
};
```

## WebSocket protocol (server :8789; env PORT NEAR_RPC CONTRACT_ID REFEREE_ID REFEREE_KEY)
Unchanged from v1 for: hello/nonce, host, peek, join, rejoin (token, 15 s grace), NEP-413 `keyfall:<matchId>`, on-chain checks, report_result, errors. Removed: `watch`, `type`.
- Client -> server: `{t:'k', c}` one key: c = single lowercase letter a-z, `'\b'` backspace, `'\n'` enter. Max 30 msgs/s per socket (extra dropped).
- Server -> each seat (own sim only, never the opponent's): `{t:'state', ...View}` at 20 Hz while count/live (fx accumulated since last send), once on change while wait.
- On end: `{t:'over', ...View}` with `result` set (both seats' final hp + wpm), then room removed.
- Disconnect while live: that seat's sim keeps running (enemies keep attacking); not back in 15 s -> opponent wins `forfeit`.

## Client rendering (latency hiding)
Renderer draws the latest View, extrapolating entity positions with vx/vy by time since the snapshot (cap 150 ms). Typed letters are echoed locally at once (local input string, reset to server `input` whenever server input changes or after a kill/strike). Day/night cycle, clouds, smoke, shake, flashes, squash-stretch, crosshair spin, explosion animation are client-only cosmetics driven by `t_ms` and `fx`.
