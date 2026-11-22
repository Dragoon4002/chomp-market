
## 2026-11-14 — character animation requests
- "Use image X as reference" for a character = build from that art (painted cutout), not the procedural rig. Don't reuse existing rig poses when user asks for "new/better animations".
- Sprite deliverable = transparent PNG frames + spritesheet + JSON (anchor, fps, phases), one character only unless told otherwise.
- Don't stall on art-method questions once intent is clear; pick the option closest to the user's words and show results.

- Deadline math: run `date -u` before stating time left; session date can be off by a day (said "deadline passed" with 5 h left, 2026-11-14).

- When work has independent parts (env/id switches, smoke tests, docs) spawn parallel agents with disjoint files instead of doing them serially; only keep truly sequential steps (same keys/accounts) inline.
## 2026-11-15 — "implement this game" from a reference build
- User's reference game = copy it (their own art, sounds, enemies, flow, feel), then adapt only what they asked (1v1, timer, drop points/multiplier). Don't reinvent visuals/mechanics from string-skimming.
- Before planning a port: decompile code (exact rules/consts) + extract assets. Show user a side-by-side of reference vs plan before building.

## 2026-11-15 — ribbon title art
- User said "use this for title" while `references/` held 2 images (one added mid-session). Used the stale one (mockup with painted buttons). Rule: re-`ls` the references dir right before applying art; if >1 candidate, pick the one without baked UI (clean art) or ask in one line.

## 2026-11-15 — asset swap broke user's browser (trails + tiny sprites)
- Changing art file dimensions without cache-busting: user's browser mixed cached old PNGs with new scale -> tiny sky, smeared trails. Always version asset URLs (`?v=`) when files change in place.
- Canvas renderers must clear every frame; never rely on a background sprite covering the canvas.
- Headless screenshots use a fresh cache, so they can't catch this. After an asset swap, say "hard refresh" and bust caches anyway.
