# Intake: Monster Siege

Real-time 1v1 card duel on a landscape hex board. Each card is either a squad marching the path at the opponent's core or a defender stationed on your ground, decided by where you drop it. **Free play only.** Original game: our names, rules, and art. No Clash Royale names or assets.

## Layout
- `game.json`: html5, entry `index.html`, settle `result`, `soon: true`.
- `src/`: empty (from scratch). Code lives directly in `build/`, with no build step.
- `build/`: `index.html`, `map.js` (hex geometry, path, zones, drop rules), `sim.js` (pure deterministic sim), `render.js` (canvas), `bot.js`, `net.js` (phase 2), `LICENSE` (MIT), `smoke.mjs`.

## Source & license
- URL: none. From scratch, no fork. Searched candidates: no browser JS repo had a license, and the forkable ones were C++, Godot or Unity.
- License: MIT (ours).
- Engine + version: plain JS + Canvas 2D, ES modules, no deps.
- How to download: n/a.
- How to build to web: none. `build/` is served as-is.

## Keep (reuse from repo)
- `games/brawler/client/src/lib/genes.ts`: port `Dna`, `statsOf`, `STAT_KEYS`, `SKILL_KINDS`, `sanitizeSkills`, `rng` (mulberry32) to plain JS in `sim.js`, with a comment pointing back to the source.
- Monster look: tint by `dna.hue`/`accent`. Placeholder shapes plus archetype glyph.

## Strip
- n/a (from scratch). Never add: stakes, escrow, wallet popups, network calls besides the SDK and the phase-2 relay.

## Add features

### Board
- **Landscape hex board** (`build/map.js`): 11 rows of pointy-top hexes, 1 hex = 1000 sim units. One S-shaped **path** of 25 hexes links the two **cores** (HP 3000): seat 0 on the right, seat 1 on the left. Rocks/water hexes are blocked. Point-symmetric.
- **Zones** are fixed by column (`map.zoneOf`): right third = seat 0, left third = seat 1, middle neutral. Midfield crystals/arches in the art are decoration.
- Live 1v1: seat 1 sees the board point-mirrored, so everyone's own core is on the right.
- Layout (as `references/Fantasy Hex-Grid Strategy Battle UI.png`): enemy plate top-left, you top-right, timer top-centre, arena middle, tray at the bottom (energy row left, 4 cards + Next right). Desktop and phone landscape, scaled to fit; a portrait screen gets a "rotate your device" hint over the scaled board.
- Fixed timestep 30 Hz, integer math, no `Date`/`performance.now` inside the sim. All randomness from `rng(seed)`.

### Loadout (pre-match screen)
- Pick a **deck of 8 cards**. Cards are monsters, and empty slots auto-fill with **Grunt** cards. No starting defenders.
- No owned monsters → demo monsters (7 + 1 Grunt).

### Cards and energy
- Hand of **4**, plus a "next" preview. A played card goes to the back of the deck, so cards cycle and can be replayed.
- Energy: max 10, start 5, **+1 every 2s** (60 ticks), **×2 in the last 60s** and in overtime.
- Play = drag a card onto a hex (or tap card, tap hex). **The drop hex picks the role:**
  - any **path** hex → **attack**: the squad spawns at your own core and walks the path hex by hex to the enemy core.
  - free **ground in your zone** → **defend**: the monster is stationed there for the rest of the match (defender stats below, HP = 1200 × def/Durability %). One defender per hex, **no cap** (energy is the limit).
  - blocked, enemy/neutral ground, occupied, cores → rejected: card stays in hand, no energy spent. **Grunts are path-only.**
- While dragging, valid hexes glow (path = ⚔ attack, own free ground = 🛡 defend); the ghost shows ⚔/🛡 for the hovered hex, red ✕ if invalid.

### Monster archetype
The highest DNA stat sets the archetype. Ties resolve in the order str > dex > spd > def. Each stat point above or below 5 scales the base value by ±8%: str → damage, dex → fire rate, def → HP, spd → range (defender) or move speed (attacker).

| Top stat | Archetype | As defender (dmg / rate / range tiles) | As squad leader | Card cost |
|---|---|---|---|---|
| str | Cannon | 120 / 0.67/s / 4, splash r1 | slow tank, high HP | 5 |
| dex | Rapid | 25 / 4/s / 3.5 | fast attacks, low HP | 3 |
| spd | Sniper | 200 / 0.33/s / 8, single target | fast raider, targets defenders | 4 |
| def | Bulwark | 40 / 1/s / 3, slows enemies 30% in range | wall, draws aggro | 4 |
| — | Grunt (card only) | — | 3 weak minions, no leader | 2 |

- Squad = leader + 3 minions at 40% of the leader's stats. Leader dies → its minions take −30% damage.
- Units stay on the path. Each tick they attack what is in range (bulwark leader > nearest enemy unit (snipers skip units) > nearest enemy defender > enemy core), else keep walking. Defenders beside the path get hit; far ones (snipers) are safe. Defenders shoot enemy units in range; the core never shoots. Destroyed defenders free their hex.

### Skills
Skills are the monster's equipped brawler skills (`SKILL_KINDS`, capped by `sanitizeSkills`) and apply in both roles:

| Skill | Effect |
|---|---|
| Power | +10% damage per mag |
| Agility | +10% fire rate per mag |
| Durability | +10% HP per mag |
| Speed | +0.5 range (defender) or +10% move speed (attacker) per mag |
| AirJump | the first time a unit would stop for a defender, it hops 3 hexes down the path instead (per unit) |
| Lifesteal | heals 15% of damage dealt |
| QuickDodge | every 5th hit taken misses (counter, not random) |
| SecondWind | the leader revives once at 30% HP |

### Match
- **3:00** + up to **60s overtime**. Overtime only if both cores have the same HP % at 3:00; the first core damage in overtime wins.
- Win: enemy core destroyed. Otherwise the higher core HP % wins. Still tied after overtime = draw.

### Modes
1. **vs Bot** (phase 1): easy = random affordable card at 6+ energy on a random valid hex (path or own ground); hard = when an enemy squad is on the board, stations its cheapest monster on a free own-zone hex next to the path (nearest its core first, every 3 s); else attacks with its highest-cost card at 10 energy.
2. **Live 1v1** (phase 2): lockstep over a WebSocket relay. Messages are `{card, x2, y}`, applied at tick+6 (200ms) on both clients, with the same seed and the same sim. Reuse the brawler/keyfall server room pattern; ask before adding a new server dep.

## Integration
- Load SDK: `<script src="/chomp-sdk.js"></script>` in `build/index.html`.
- `Chomp.onSession(s => …)`: use `s.seed` for deck order + minion spawn jitter. `s.mode` is always `"free"`.
- `Chomp.ready()` once loaded (after the loadout screen renders). `Chomp.start()` on countdown end.
- `Chomp.result({ winner, score })` on match end. `score` = your core HP % × 100 + enemy defenders destroyed × 500.
- Where in the code each call goes: `index.html` boot → `onSession`/`ready`; `main loop` match start → `start`; `sim.ended` → `result`.
- Stakes: **free-only**. Client result trusted.
- Chain hooks (comments only, no chain code):
  - `// TODO(solana): NFT` read the player's Core monster assets (DNA + equipped skills) for the loadout.
  - `// TODO(solana): VRF` deck order seed (free play uses `s.seed`).
  - `// TODO(solana): VRF` 10% skill-token drop roll for the winner.
  - `// TODO(solana): ER` (optional, phase 3) write card plays to a delegated match PDA for on-chain tape.

## Map
- `build/sim.js`: genes port (top, credits brawler `genes.ts`), `archetypeOf`, `defenderStats`/`leaderStats`, `newMatch(seed, loadouts)` (sanitizes peer decks, shuffles), `dropOf` (role of a drop: attack/defend/null), `step(state, inputs)` (structuredClone, then: card plays → energy → defenders shoot → units attack-in-range or walk the path → deaths). Units hold `d` = integer distance along `map.PATH`; `map.pathPos(d)` is exactly mirror-symmetric, `verdict` (end condition), `scoreOf`.
- RNG call sites: `newMatch` deck shuffle (`rng(seed)`), `spawn` minion jitter (`nextRand(s)`, state-held `s.rs`). Bot has its own `rng(seed ^ k)` in `bot.js`. No clocks in sim.
- Input `{seat, card, x2, y}`: `index.html` pointer handlers → `render.dropAt` (screen → hex, un-mirrored for seat 1) → `play()` → vs-bot `g.pending` (applied next tick) or live `net.play` → server stamps `apply_tick` → `net.inputsAt(t)`.
- Loop: `index.html` `frame()`/`tick()`: vs-bot fixed 30 Hz accumulator; live steps only while `s.t < beat`.
- SDK: `ready()` at boot (portal replies with session), 300 ms fallback to `?seed=`/random; `start()` at countdown end (vs-bot); `result({winner:'you'|'opponent'|'draw', score, reason})` in `finish()`.
- Leader stats (not in this intake) live in `LEAD`/`GRUNT` in `sim.js`: hp, dmg, rate, move, range.
- Relay: `server/` (`monster-siege-server`, port 8790), protocol in `README.md`.

## Cut list
- Spell cards: add when skills-only feels thin.
- More lanes or gates: add if matches end too fast.
- Stakes, escrow, referee replay: add if we leave free-only.
- Spectator bets: add when Fight Tap Grid ships.
- Monster XP and levels, seasons (SOAR): add after core loop is fun.
- Brawler cutout art for monsters: add after placeholder shapes play well.

## Done checklist
- [x] License OK, `LICENSE` kept in `build/`
- [x] Strip list done, no external network calls left (only SDK + `?ws=` relay; `build/chomp-sdk.js` is a copy so a plain static server has `/chomp-sdk.js`)
- [x] Features added (phase 1: vs Bot; phase 2: live 1v1, two-tab headless check: identical state signatures)
- [x] `smoke.mjs`: same seed + same input tape gives the same result twice; bot vs bot (easy/hard, 4 seeds) ends within 4:00 of sim time and damages a core; drop rules (path → squad at own core, own ground → defender, enemy ground/neutral/blocked/core/occupied/grunt-on-ground rejected with no energy spent); mirror symmetry (seat-swapped mirrored tape → mirrored state)
- [x] Landscape hex rework: shots in `references/shots/` (1280×720, 932×430, mid-drag highlights, portrait hint)
- [ ] SDK events fire (portal footer shows last event): wired, not checked in the portal (needs `market` dev restart)
- [~] standalone `build/` loads, vs-bot plays to end, no console errors (headless Chrome, `?selftest`). `/play/monster-siege` not checked; `soon: false` set
