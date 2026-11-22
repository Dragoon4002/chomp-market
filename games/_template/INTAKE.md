# Intake: <Game Name>

Copy `games/_template/` to `games/<slug>/` (slug = folder name, `[a-z0-9-]`), fill this in, then run the port skill on it.

## Layout
- `game.json`: portal manifest. Fields:
  - `engine`: html5 | godot | unity | next
  - `entry`: file inside `build/` that the portal hosts. Use `url` instead for an externally hosted app.
  - `thumb`: path inside `build/`, or `/dash/x.png` for a market asset.
  - `settle`: `result` or `frames`
  - `soon: true` hides Play.
- `src/`: upstream source as downloaded, then our fork of it.
- `build/`: web export, the only folder that is served. It's served at `/g/<slug>/…` inside a sandboxed iframe with an opaque origin, so there's no access to cookies or localStorage (IndexedDB saves fail).

## Source & license
- URL:
- License (checked in repo): <!-- MIT/Apache/BSD/CC0 OK. GPL/AGPL/none = stop -->
- Engine + version:
- How to download: <!-- git clone … src/  |  curl -L … | bsdtar -xf - -C src/ -->
- How to build to web: <!-- html5: copy src → build. godot: Web export, Thread Support OFF. unity: WebGL, compression gzip/brotli OK (route sets Content-Encoding) -->

## Keep
<!-- core mechanics, art, sfx worth keeping -->

## Strip
<!-- sections/files/systems to delete: ads, analytics, login, IAP, menus, level select, external APIs … -->

## Add features
<!-- e.g. same-seed 1v1 duel, timer, score → result, monster skin, … -->

## Integration
- Load SDK: `<script src="/chomp-sdk.js"></script>` (Godot: `JavaScriptBridge.eval`. Unity: `.jslib` calling `window.Chomp`)
- `Chomp.onSession(s => …)`: `s = { wallet, mode: "free"|"staked", stake, seed }`. Use `seed` for all randomness.
- `Chomp.ready()` once loaded. `Chomp.start()` at match start.
- `Chomp.result({ winner?, score?, tapeHash? })` at match end.
- `Chomp.frames(f)` for each input batch (`settle: "frames"` only).
- Where in the code each call goes:

## Done checklist
- [ ] License OK, `LICENSE` kept in `build/`
- [ ] Strip list done, no external network calls left
- [ ] Features added
- [ ] SDK events fire (portal footer shows last event)
- [ ] `/play/<slug>` loads, no console errors, `soon` removed
