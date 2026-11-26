# Intake: Tomb Delve

From-scratch game (no fork). Modules: Cards + Dungeon + Extraction + Monsters (characters = brawler NFT monsters).
Pitch: card-battle your NFT monster through a cursed pyramid, extract relics at camp, pawn them at live market price. Die and you lose everything you carried.
Demo moment (10s): chest opens on a gold mask → camp → extract → archaeologist scans it and pays 0.03 SOL → the common shard price ticks down after three sales.

## Layout
- `game.json`: `engine: next`, `entry: index.html`, `soon: true`. `settle: result` because the portal type has only result|frames. Real trust is logic on the Private ER (see Stakes), not a client score.
- `src/`: Next.js app (App Router). `output: 'export'`, `basePath: '/g/tomb-delve'`, `images.unoptimized`.
- `build/`: `next build` static export copied here. It's the only folder served, at `/g/tomb-delve/…`, in a sandboxed iframe with an opaque origin. No localStorage or IndexedDB; the run state lives on the ER, with a mock in memory.

## Source & license
- URL: none, from scratch. Reuses `games/brawler/client/src/lib/genes.ts` (`rng`, `Dna`, `SKILL_KINDS`, `lookOf`). Copy, don't import across games.
- License: MIT (ours). Skipped forks: slaytheweb is AGPL. No MIT card crawler fits.
- Engine + version: Next.js 15 + React 19, plain CSS. No game library.
- How to download: n/a
- How to build to web: `cd src && npm run build` (next build, then `export.mjs` copies out/ into ../build and renames `_next` to `_n`: Next dev blocks `/_next` requests from the portal's opaque-origin iframe)

## Keep
- Brawler monster DNA → class + stats, and the skill → card mapping. `lookOf` colors for the player character until the new art arrives.

## Strip
- n/a (from scratch). Write no wallet code inside the game; chain calls go through chomp-sdk or portal hooks.

## Add features
### Flow
Entry (0.05 SOL) → set of 10 rooms → camp → (extract | buy potions or gear + next set) …
Each room: encounter → "Continue" → corridor walk animation (parallax layers translating, ~1.2s) → room zooms in (CSS `scale` 0.6→1, ~0.5s) → next encounter plays out.
Extraction is allowed **only at camp**.

### Rooms
- Room odds: 75% monster, 24% chest, 1% loose item.
- Pity: +5 points of chest odds for each consecutive monster, capped at 50%, reset when a chest appears.
- Room 10 of every set is an elite monster.
- Set N scales monster HP/attack by ×(1 + 0.5·(N−1)), and each relic tier step's weight by ×1.3 per set (tier k weight × 1.3^((N−1)·k), `BOOST` in sim.ts).
- Seed per set, all inside the Private ER:
  - `H = sha256(vrf ‖ runId ‖ setIdx)`
  - `rooms[i] = decode(H, i)`: room type, monster id, chest relic, mimic flag.
  - Only the current room is revealed to the player. At run end, `vrf` + `H` are published so anyone can recompute.
  - The next set's VRF is requested while the player is at camp.

### Combat (cards, one resource: stamina)
- Class deck of 12 cards. Draw 5 per turn.
- Play cards until stamina or the hand runs out, then end the turn.
- Monster turn, deterministic from (type, HP%, turn):

  | Monster | Rule |
  |---|---|
  | Mummy | heals when below 30% HP |
  | Scarab swarm | always attacks |
  | Golem | defends every 2nd turn |
  | Jackal | attacks twice |

- Monster intent hidden; behaviour still deterministic from (type, HP%, turn).
- Monsters drop nothing. Relics come only from chests and loose items.

### Classes
- The class comes from the highest DNA stat; ties go def > str > spd > dex.
- Each deck holds 2 copies of the class signature move.

| Class | Stat | HP / Stamina | Signature move | Passive |
|---|---|---|---|---|
| Tank | def | 40/3 | Shield Wall: block 12, costs 2 | block carries over 1 turn |
| Berserker | str | 32/3 | Rampage: 6 dmg + 1 per missing 10% HP, costs 2 | +2 dmg below 50% HP |
| Rogue | spd | 28/4 | Backstab: 8 dmg, ×2 vs a defending monster, costs 1 | 15% crit |
| Thief | dex | 30/3 | Pickpocket: 4 dmg + 25% chance of an extra relic, costs 1 | sees mimics; +1 relic roll per chest |

### Skills (from the NFT) → cards or passives

| Skill | Effect |
|---|---|
| Power | +2 to attack cards |
| Agility | draw 6 |
| Durability | +8 HP |
| Speed | +1 stamina |
| AirJump | Leap card: avoid the next hit |
| Lifesteal | Drain card |
| QuickDodge | Evade card |
| SecondWind | revive once per run at 30% HP |

### Chests
- Ignore or open.
- A mimic chest starts a fight. The Thief sees mimics.
- An opened chest gives 1 relic, rolled from the seed.

### Death
- You lose everything carried: the gear and potions you brought plus all relics found.
- The character NFT is locked for 1h (an on-chain timestamp). You can play another character.

### Relics and pawn shop (prices in SOL)
Set-1 drop odds:

| Tier | Example relic | Set-1 drop odds | Base price |
|---|---|---|---|
| Common | pottery shard | 75% | 0.0034 |
| Uncommon | bronze ankh | 17% | 0.010 |
| Rare | gold mask | 6% | 0.030 |
| Epic | canopic jar | 1.8% | 0.10 |
| Legendary | named + serial, e.g. Eye of Ra #3 | 0.2% | 0.5, no decay |

- Sell quote: `quote = base × 0.92^(net_sold_24h) × min(1, T / T_target)`
  - `net_sold_24h` = sells − buys per relic type over a rolling 24h. Prices recover as old sales age out.
  - `T` = treasury balance. `T_target` = 5 SOL (the devnet seed).
- The shop sells relics back at **1.20× quote**.
- Guards:
  - Total payouts are capped at 20% of `T` per day.
  - A legendary sale is capped at 3% of `T` (paid over time if the cap is hit).
  - The treasury never pays more than it holds.

### Sinks

| Item | Price (SOL) | Effect |
|---|---|---|
| Entry | 0.05 | — |
| Health potion | 0.005 | +15 HP |
| Stamina tonic | 0.004 | +2 stamina for 1 turn |
| Bronze armor | 0.02 | +6 max HP |
| Iron blade | 0.02 | +2 dmg |

- Gear and potions are inventory entries, not NFTs.
- Inflow split: 85% treasury, 10% protocol, 5% to the character NFT's vault.

### Economy check
- Target return to players: 80–92% overall. **Set 1 alone never covers the entry fee** (sim: ~60%); you must push to set 2+ to profit (sim averages incl. deaths: set 2 ~95%, set 3 ~98%; survivors profit).
- `sim.mjs` (Monte Carlo, 10k bot runs split evenly: extract after set 1 / 2 / 3, all play the same blocking style, bail at <60% HP) prints RTP per depth and overall. Fails if overall is outside 80–92% **or** set-1 extraction RTP ≥ 100%. Run: `node --experimental-strip-types --no-warnings sim.mjs`. Last run: set1 60.3%, set2 95.4%, set3 97.6%, overall 85.3%, deaths 11.9%.

## Integration
- Load SDK: `<script src="/chomp-sdk.js"></script>` in the root layout.
- `Chomp.onSession(s => …)`: `s = { wallet, mode, stake, seed }`. In mock mode, `seed` stands in for the VRF value. All randomness comes from `rng(seed)`; no `Math.random`, no wall clock in logic.
- `Chomp.ready()` once loaded. `Chomp.start()` on paying entry. `Chomp.result({ score: extractedValueLamports, tapeHash })` on extract or death.
- Where each call goes: `app/layout.tsx` (sdk), `app/page.tsx` (ready/onSession/start/result). Mock ER + treasury: `lib/chain.ts`.
- Stakes: verifiable through **logic on the Private ER**. Run PDA = {character mint, HP, inventory, setIdx, roomIdx, pity, H hidden}. Each turn's card list is one session-key transaction; the ER program resolves combat. The client runs the same pure `lib/sim.ts` only for animation.
- Hooks to leave as `// TODO(solana): …`:
  - VRF request per set
  - Private ER run PDA and room reveal
  - escrow for the entry fee
  - NFT read (DNA, skills) and death lock
  - treasury PDA plus pawn buy/sell
  - session keys

## Map
- Entry: `src/app/page.tsx` → `<Game/>` state machine: title → pick character → entry → room → corridor → camp → pawn → end.
- Loop: `src/lib/sim.ts`, pure functions:
  - `rollSet(vrf, runId, setIdx)` → rooms
  - `startCombat`, `playTurn(state, cards[])`, `monsterAct`
  - `openChest`, `pawnQuote`
- RNG: `rng()` from genes.ts, seeded per set from `H`.
- Input: click/tap on cards, Continue, End Turn, Open/Ignore. Mobile-first: portrait, hand at the bottom.
- Score/end: extract at camp or death → `Chomp.result`.
- Network/storage: none in the game; mock ER in memory.
- Time: animation uses CSS transitions only; logic has no timers.

## Done checklist
- [x] License OK, `LICENSE` kept in `build/`
- [x] Strip list done, no external network calls left
- [x] Features added: 4 classes, 4 monsters + elite, 10-room sets + camp, corridor walk/zoom, pawn shop with decay
- [x] `sim.mjs` passes (return 80–92%), plus a determinism check: same seed + same turns → same end state
- [x] SDK events fire (portal footer shows last event)
- [x] `/play/tomb-delve` loads, no console errors, `soon` removed
- [x] Art: placeholder shapes now; swap in the user's art pack later (version asset URLs with `?v=`)

## Cut (add when …)
- Relics as equippable charms: when the shop's buy side needs demand.
- Player-to-player relic market: when the pawn shop is live.
- Tomb Race PvP (same seed): after the solo game ships.
- Sealed Sarcophagus auction (PER): if time remains.
- MP and spells: when a class needs a second resource.
- If the Private ER blocks us: server commit-reveal fallback (hash published at set start, revealed at run end).
