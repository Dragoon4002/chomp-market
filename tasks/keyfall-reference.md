# Typewriter Command: reverse-engineering report (for a 1:1 web rebuild)

The source is a Unity **6000.3.4f1** Mono Windows build (`TypewriterCommand.exe`). It has two scenes: `level0 = Assets/Scenes/MainMenu.unity` and `level1 = Assets/Scenes/GameScene.unity`.
Nothing was executed. The C# was decompiled with ilspycmd 8.2 inside the `dotnet/sdk:8.0` container. Assets were parsed with UnityPy 1.25.4, using TypeTreeGeneratorAPI 0.0.10 to build typetrees from the Managed DLLs. That generator has a bug: it drops the align flag on `m_Enabled`. It was patched in `tools/extract.py`.

**How to read this report.** Many values have two sources: a C# field default and a value serialized in the scene or prefab. **The serialized value wins** in the built game, and it is the value given here. Where the two differ, the code default appears as `(code: X)`.

Paths below are relative to `ref/`. The key raw dumps are:
- `out/src/*.cs`: decompiled source for 40 classes.
- `out/summary_level1.txt` (game), `out/summary_level0.txt` (menu), `out/summary_sharedassets1.assets.txt` (prefabs): a compact hierarchy with transforms and component fields.
- `out/hierarchy_*.txt`: the full hierarchy with every field.
- `out/objects/*.json`: every object's full typetree.
- `out/sprites.json`: sprite rects, pivots and PPU.

---

## 1. Coordinate system, camera, resolution

- **Default resolution:** 1920x1080 (16:9). The WebGL default (960x600) is also set but unused.
- **Main Camera (both scenes):** orthographic, size **5**, at (0,0,-10).
  - Visible world: x ∈ [-8.89, 8.89], y ∈ [-5, 5]. That is 108 px per unit at 1080p.
  - Game background color: (0.455, 0.541, 0.698). It is hidden by `SkyBG` anyway.
- **Sprite sizes:** world size = px / PPU. Most game art is PPU 16. Background, rock and explosion art is PPU 12.
- **Sorting:** a single sorting layer, `Default`. Draw order follows `sortingOrder` (lower draws first):

| order | object |
|---|---|
| -100 | SkyBG (sky gradient, 20x11.17u, pivot bottom-center at (0,-4.188)) |
| -85 | clouds (runtime) |
| -80 | Sun, Moon (alpha 0.784) |
| -75 | BGLayer1 mountains (0,-5.708) |
| -70 | BGLayer2 dunes (0,-4.688), alpha 0.862 |
| -25 / -10 | rocks at y=-4 (x = -7, -3.958, 6, 7.958) |
| 0 | CitySmoke particles |
| 5 | CityImage x2, Bomber, Chopper, TutorialBalloon |
| 10 | Laser LineRenderer; Chopper word-label canvas |
| 15 | TurretBase |
| 25 | TurretGun |
| 50 | Ground (SandGroundTile, tiled 20x2u, pivot bottom at y=-6, so it covers y -6..-4); Bomb/Bomber word-label canvases |
| 100 | Bomb, ChopperFireball, Balloon word canvas |
| 200 | Explosion |
| UI | overlay canvas, sortingOrder 200 |

- **Tags:** `City`, `BombDropZone`, `ChopperAttackZone`. 2D physics gravity is -9.81, but every body uses gravityScale 0.

### Static game-scene layout (world units)

| object | position | notes |
|---|---|---|
| City root | (0,-4) | BoxCollider2D trigger, offset (0,0.5), size 3x1, so it covers x[-1.5,1.5] y[-4,-3]. Tag City. |
| City/CityImage | (1,-4) | sprite 28x44 @16 = 1.75x2.75u, pivot bottom |
| City/CityImage (1) | (-1,-4) | same sprite with flipX |
| City/TargetPoint | (0,-3) | aim point for fireballs |
| City/BombDropZone | trigger | offset (0,5), size 1x10, so x[-0.5,0.5] y[-4,6] |
| City/ChopperAttackZone | trigger | offset (0,5), size 7.5x10, so x[-3.75,3.75] y[-4,6] |
| City/CitySmoke | (0,-4.1), rot 60° | ParticleSystem |
| City/TurretBase | (0,-4) | sprite 24x12 @16 = 1.5x0.75, pivot bottom-center |
| TurretBase/GunPivot | (0,-3.65) | TurretController #1 |
| GunPivot/TurretGun | (0,-3.65) | sprite 23x6 @16 = 1.44x0.375, **pivot (0,0.5)** (rotates about its left end); TurretController #2 + LineRenderer |
| TurretGun/FiringPoint | local (1.3,0) | unused by code; the laser starts at the TurretGun origin |
| Sun / Moon | local y -3.5 / -2.75 under SkyBG (-4.188) | animated, see §6 |
| Spawn x | ±12 | off-screen; enemies enter from the left or right edge |

Rough reconstruction: `out/scene_layout.png`. It is unlit, uses sample enemies, and outlines the trigger zones.

---

## 2. Game flow

### Main menu (level0)
- **Scene contents:** the same sky, ground and rocks as the game. There are two `CityImage` sprites at (±1,-4) at sortingOrder 0, but no turret. There are no enemies.
- **`MainMenuManager.dynamicSky` is null.** The menu sky therefore always starts at time 0. `PlayGame` does not save the time of day.
- **Canvas:** CanvasScaler ScaleWithScreenSize, reference 1920x1080, match 0.5. Positions are anchored at the center:

| element | position (px) | size | text / notes |
|---|---|---|---|
| Title | (0,350) | — | "TYPEWRITER COMMAND", 72pt bold, white |
| PlayButton | (0,150) | 300x80 | "PLAY", auto-size ~44, uppercase. Loads "GameScene". |
| HowToPlayButton | (0,30) | 400x80 | "HOW TO PLAY", 30 bold |
| Music slider | container (0,-120) | slider 300x30 at x+70 | label "Music:" 28 at x-180; fill color (0.623,0.699,0.470) |
| SFX slider | container (0,-200) | slider 300x30 at x+70 | label "SFX:" 28 at x-180; fill color (0.733,0.447,0.623) |
| QuitButton | (0,-360) | 300x80 | "Quit", 24 bold uppercase. Calls Application.Quit. |

- **Button colors:** fill (0.368,0.310,0.365). Slider background 0.2 gray, handle 0.9 gray, 20 px wide.
- **Every button** plays `TypewriterPress` on click (`UIButtonSound`).
- **Volume:**
  - Music volume = slider × **0.5** (maxMusicVolume).
  - SFX volume = slider × **0.5**. The scene sets maxSFXVolume 0.5 (code: 1).
  - Both are saved in PlayerPrefs `MusicVolume` and `SFXVolume` as the raw slider value 0..1. The default is 1.
- **How To Play panel:** full-screen black at alpha 0.949.
  - Title "HOW TO PLAY", 56 bold, color (1,1,0.3), at (0,350).
  - Instructions text, 28pt uppercase, left-aligned, 1200x600 box:

    "OBJECTIVE:\nDefend your city from incoming threats!\n\nCONTROLS:\nType the words that appear on enemies to destroy them\nComplete the word before they reach your city\n\nTIPS:\n• Fast typing = More points\n• Watch for different enemy types\n• Keep your city safe!"
  - CLOSE button 250x80 at (0,-350), 36pt.

### Game scene (level1) timeline
- t is measured from scene start (`TutorialManager.Start`).
- **On start:** if PlayerPrefs `MenuDayTime` exists, the sky time is set to it and the key is deleted.

**1. Tutorial phase (balloons), t = 0 until the phase ends**
- The first balloon spawns at t=**2 s** (code: 3).
- Each later balloon spawns **6 s** after the previous one. It spawns 0.1 s after a balloon is destroyed, if that is sooner.
- Total: **3 balloons**.
- The phase ends when t ≥ **20 s** OR 3 balloons are "destroyed". A balloon that flies off-screen also counts as destroyed, because `OnDestroy` increments the counter.
- Balloons still alive when the phase ends stay on screen.

**2. Bomber phase**
- Starts the moment the tutorial ends.
- The BomberSpawner timer only counts down while this phase is active. The first bomber therefore appears **9 s** after the tutorial ends.

**3. Chopper phase**
- Starts at t ≥ **60 s**, regardless of the tutorial.
- The first chopper appears **20 s** later (t ≈ 80 s).
- Bombers keep spawning during this phase.

**Other flow**
- **Survival score:** +10 points every 1 s of survival (`pointsPerSecond`).
- **Pause:** Esc toggles pause, or click the pause icon (top-right, 48x48, 20 px margin).
  - Sets `Time.timeScale = 0`.
  - Panel is black at alpha 0.8, with buttons Resume (0,50) and "Main Menu" (0,-50), each 300x50, 24pt.
  - Main Menu saves `MenuDayTime` and loads MainMenu.
  - The input field stays focused while paused, and the onValueChanged logic still runs.
- **Game over:** triggered when health ≤ 0.
  - `timeScale = 0`. The GameUI HUD is hidden and the panel is shown (black at alpha 0.9). The labels are:

| label | position | style |
|---|---|---|
| "GAME OVER" | (0,150) | 72 bold, red |
| "Final Score: N" | (0,50) | 48, white |
| "High Score: N" | (0,-10) | 36, gold (1,0.839,0) |
| "★ NEW HIGH SCORE! ★" | (0,-70) | 42 bold, gold; shown only if score > stored |

  - Buttons: Try Again (-150,-150) reloads the scene; Main Menu (150,-150) saves the sky time. Both are 200x60.
  - High score is stored in PlayerPrefs `HighScore` (int).

---

## 3. Enemies and projectiles

All typed enemies inherit from `Enemy`. Each has a `targetWord`, an `explosionPrefab`, a word label (TMP), and a `TargetPoint` child used for aim, crosshair and laser.

- **Registration:** an enemy registers with `GameManager.activeEnemies` in Start and unregisters in OnDestroy.
- **Word label:** a world-space child canvas scaled 0.015.
  - Font: TMP 30pt OpenDyslexic Bold Italic, white, centered, with outline 0.1 and underlay. Style is Bold+UPPERCASE (Bomb: normal style).
  - Effective text height ≈ 0.45 u.
  - Label offset above the sprite: Bomber +0.5, Bomb +0.72, Balloon +0.72, Chopper +0.75.
  - Text is not lit by Light2D.
- **No SpawnCoordinator in the scene.** `SpawnCoordinator` exists in code (entry queue, ±0.5 y-jitter, 2 u spacing), but **no instance is in GameScene**. Spawns and wraps therefore happen at the exact computed position, with no queueing.

### TutorialBalloon
- **Sprite:** `TutorialBalloon` 22x31 @16 (1.375x1.94 u), pivot center. Kinematic body, trigger box 1x1.
- **Spawn:** x = ±12 with a 50/50 side. y = U(**1.8, 3.4**) (code: 3, 3.8).
- **Facing:** flipX = came from the right. The sprite faces right by default.
- **Movement:**
  - x += dir × **1.5** u/s. This is the prefab `moveSpeed`. `TutorialManager.balloonSpeed=1.25` is never used.
  - y = startY + sin(bobTimer) × **0.15**. bobTimer advances at 1 rad/s and starts at a random phase.
- **Exit:** destroyed when |x| > 12. It does not wrap and does no damage.
- **Word:** same generator as bomb words (3–4 letters).

### Bomber
- **Sprite:** `Plane1` 30x13 @16 (1.875x0.81 u), pivot (0.5,0.615), facing right. Kinematic, trigger box 1.875x0.812. Not animated.
- **Spawn:** x = ±12, y = U(**2.4, 3.8**) (code: 3, 3.8).
- **Movement:** horizontal `Translate` at the current speed. It flips by side.
- **Wrap:** when x > 12 it teleports to x = -12 and moves right. When x < -12 it teleports to x = 12 and moves left. Each wrap re-arms the bomb. **Bombers never leave.** They loop forever until killed.
- **Bomb drop:** when the bomber's collider enters `BombDropZone` and the bomb is not yet dropped this pass, it spawns a Bomb at its own position.
  - Overlap happens when |x| < 0.5 + 0.9375 ≈ **1.44**, i.e. just before the city center.
  - It sets HasFiredBomb, which lowers its kill points, and marks the revenge tracker "dropped bomb".
- **Speed and spawn ramp:** see §5.
- **Word:** 4–7 letters, by difficulty level.

### Bomb (parachute bomb, typeable)
- **Sprite:** `Bomb` 16x32 @32 (0.5x1 u), pivot center. It has a parachute drawn in.
- **Physics:** dynamic Rigidbody2D, gravityScale 0, trigger box 0.5x1 at offset (0,0.25).
- **Movement:** velocity forced each frame to (vx, **-1.3**) u/s (code: 2). It falls straight down.
- **Word:** 3–4 letters, weighted (see §4).
- **Sound:** plays `BombFall` on spawn, stopped when the bomb is hit or destroyed.
- **City hit:** bottom reaches y ≈ -3 (city trigger top), so the bomb center is at about -2.75. From a spawn y of 2.4–3.8 the fall takes ~4–5 s. On hit:
  - stop the fall sound and play Explosion;
  - City.FlashRed (siren, red flash, city-hit shake);
  - CityHealthManager.OnBombHit: **-10 HP**;
  - mark the source bomber's revenge tracker "attacked city";
  - then `DestroyWithExplosion()`.
- **Bug: city hits reward the player.** Because the hit calls `DestroyWithExplosion()`, which calls `AwardScore()`:
  - the player is awarded bomb points (250 × multiplier) even though the bomb hit the city;
  - a "WORD KIA" dog tag shows;
  - the multikill timer advances;
  - the explosion sound plays twice.
- **Typing it out:** the turret lasers it and you get 250 points.

### Chopper
- **Sprite:** `Chopper` Frame_0..2, 31x15 @16 (1.94x0.94 u), pivot (0.484,0.467), facing right.
  - Animator `Idle`: 3 frames over 0.15 s, looping (~20 fps rotor).
  - Kinematic, trigger box 2x0.5. Label at +0.75. TargetPoint local (0,0.4).
- **Spawn:** x = ±12, y = U(**2.5, 3.5**) (code: 3, 3.8). Speed **1.1** (code: 1.5).
- **Approach:**
  - Moves with `transform.Translate(Vector2.right × dir × speed × dt)`. This is in **local space**.
  - It tilts toward -15° when moving right and +15° when moving left, via `LerpAngle` at tiltSpeed 2 /s.
  - **Because the translate is local, the chopper drifts downward** at about speed × sin(tilt) ≈ 0.28 u/s while approaching.
- **Hover and fire:**
  - On entering `ChopperAttackZone`, it stops moving. The collider half-width is 1, so it stops at |x| ≈ 4.75.
  - It levels out (tilt lerps to 0).
  - It fires a fireball immediately, then every **1.0 s** (`fireRate`), forever.
  - It never wraps or leaves.
- **Fireball:** spawns at the chopper position and flies toward City.TargetPoint (0,-3), direction normalized at spawn. Plays the `ChopperFire` sound at 0.8 volume.
- **Word:** 6–8 letters.

### ChopperFireball (not typeable)
- **Sprite:** `ChopperFireball` 8x8 @16 (0.5 u), sortingOrder 100. Dynamic body, gravity 0, trigger 0.5x0.5.
- **Movement:** straight line at **3 u/s**. From (±4.75, ~2) to (0,-3) that is ~7 u, about 2.3 s.
- **City hit:**
  - Explosion sound, City.FlashRed, **-5 HP** (`fireballDamage`);
  - marks the source chopper's revenge tracker;
  - spawns an Explosion (scale U(0.7,1.3), random rotation);
  - destroys itself.
- **Sustained damage:** each hovering chopper deals 5 HP/s once its fireballs start landing.

### Explosion
- **Sprite:** `Explosion` Frame_0..3 (19–23 px @12, about 1.6–1.9 u).
- **Animation:** non-looping clip, 0.4 s, ~0.1 s per frame. It holds Frame_3 after the clip ends.
- **Lifetime:** destroyed after **1.0 s**.
- **Spawn:** random z-rotation 0–360 and uniform scale U(0.7,1.3). Material BrightnessLit2D.

### Revenge tracker
- A component is added lazily to an enemy.
- `MarkDroppedBomb`: informational only.
- `MarkAttackedCity`: set when the enemy's bomb or fireball hits the city.
- On kill, `HasAttackedCity` gives a REVENGE bonus of +250 base points.

### Damage and health
- `maxHealth` is **100**.
- Bomb hit: -10. Fireball hit: -5.
- Health is clamped at 0. When it reaches 0, OnGameOver fires.
- **There is no health bar.** The HUD shows the text "Health: N", and smoke intensity grows with damage (§6).

### Multikill
- A kill within **2 s** of the previous kill adds MULTIKILL to the score popup and **+0.25** to the multiplier (code: 1.0).
- The multiplier change is applied after the kill is scored.

---

## 4. Typing rules (`PlayerInput`)

### Input field
- **Layout:** a TMP_InputField 360x80 at the bottom-center, 15 px from the bottom.
- **Look:**
  - Background (0.125,0.221,0.273,0.611).
  - Placeholder "Type word...", 24pt, light gray, rendered uppercase.
  - Text 24pt white, uppercase display.
  - Caret width 1, blink rate 0.85.
- **Focus:** the field is re-focused every frame. It accepts any characters and has no length limit.

### On each value change (case-insensitive)

**Empty input**
- Clear the target and reset.

**Partial match**
- `FindPartialMatch`: among active enemies whose word starts with the input, choose the one with the **shortest** word. Ties go to the first in HashSet order.

**A match is found**
- **New target** (different enemy):
  - Clear the old target.
  - `targetingStartTime = now`.
  - The enemy starts squash-stretch and shakes.
  - No key sound plays on this first key.
- **Same target and the input got longer:**
  - squash-stretch;
  - green label flash (this is cancelled immediately by `StopFlashing` below; it is effectively invisible);
  - `TypewriterPress` SFX;
  - typing camera shake.
- **Full word typed:**
  - input text flashes green;
  - the label turns solid green;
  - the sprite flashes white continuously (ping-pong, speed 10);
  - **auto-submits after 0.15 s.** Enter is not needed.
- **Still partial:**
  - input text pulses green for 0.2 s;
  - the target's flashes stop.

**No match, and the key was not a backspace**
- **A target exists**, `lastValidInput` is non-empty, and the target's word still starts with `lastValidInput`:
  - **STRIKE.**
  - Label flashes red; input text flashes red 0.2 s; `ErrorShort` SFX (only if this is not the 3rd strike); typing shake.
  - `IncorrectWordFeedback` quick feedback: TurretGun and TurretBase flash black for 0.15 s.
  - The wrong character **stays in the field**. Every further non-backspace key is another strike until the player backspaces.
- **Nothing was typed validly yet** (first character matches nothing):
  - clear the target;
  - input text flashes red (a 0.2 s step);
  - `ErrorShort`;
  - **STRIKE.**
- **The target died meanwhile** (for example, its bomb hit the city): no strike.

**Backspace never strikes.**

### Submit (`OnWordSubmitted`)
This runs from the auto-submit or the Enter key.
- If an enemy has that exact word:
  - `turret.TargetEnemy(enemy)`;
  - if no typing error was made: FLAWLESS +0.5 multiplier;
  - if elapsed since `targetingStartTime` ≤ **0.15 s × word length**: LIGHTNING +1.5;
  - otherwise if elapsed ≤ **0.3 s × word length**: QUICKDRAW +0.75;
  - strikes reset to 0.
- In every case: clear the target, empty the field, and re-focus it.
- A wrong word submitted with Enter is silently cleared. No strike.

### Strikes and stun
- **MAX_STRIKES = 3.** Each strike applies -0.125 to the multiplier (floored at 1).
- **On the 3rd strike, a full stun of 1.0 s:**
  - strikes reset;
  - **multiplier resets to 1**;
  - `ErrorThreeStrikes` SFX;
  - the input container is hidden (alpha 0) and the text is cleared;
  - the turret is frozen (no rotation and no firing);
  - city-hit camera shake;
  - `IncorrectWordFeedback` long form: the input is non-interactable and its background is darkened ×0.5 for `feedbackDuration` **1 s**, then ×2 back.
- Strikes do not decay over time. Only a successful submit or a stun clears them.

### Turret and laser
There are two `TurretController`s.
- **GunPivot controller** (no laser; `playerInput` set): while you are partially typing, it rotates GunPivot toward the current partial target's TargetPoint at **180°/s** (`MoveTowardsAngle`).
- **TurretGun controller** (has the LineRenderer; the one that receives `TargetEnemy`): after a submit, it rotates the TurretGun's world rotation toward the target at 180°/s. It **fires when |Δangle| < 1°**:
  - plays the `LaserFire` SFX;
  - draws the line from the TurretGun origin (0,-3.65) to the target's TargetPoint;
  - the line lasts **0.2 s** (`laserDuration`), width 0.1 u, material `LaserLineMaterial` color **cyan (0,1,1)**, gradient white→white;
  - calls `target.DestroyWithExplosion()`.
- **Targets are queued one at a time.** A new submit overwrites `currentTarget`. In theory, submitting a second word before the turret fires on the first would retarget. In practice, fast submits arrive while the turret is still rotating.
- **While stunned:** neither controller rotates.

### Crosshair
- The overlay UI Image `icon_crosshair` is 32x32 px, color (1,0,0,0.8).
- It follows the current partial target's TargetPoint (world→screen) and spins at 180°/s.
- It is hidden when there is no target.

### Kill (`Enemy.DestroyWithExplosion`)
1. `Explosion` SFX.
2. Spawn the Explosion prefab at the sprite position (scale U(0.7,1.3), rotation U(0,360)).
3. Explosion camera shake.
4. AwardScore.
5. Destroy.

### Scoring
This is planned to be dropped, but is recorded here.
- **Base points:**

| target | base points |
|---|---|
| Balloon | 500 |
| Bomber, no bomb dropped this pass | 750 |
| Bomber, after dropping | 500 |
| Bomb | 250 |
| Chopper | 1500 |
| Revenge bonus | +250 |

- **Points awarded** = round((base + revenge) × currentMultiplier).
- **Score popup:**
  - "+N [MULTIKILL][REVENGE][FLAWLESS][LIGHTNING|QUICKDRAW]".
  - Color priority: multikill orange (1,0.5,0) > revenge (1,0.2,0.2) > lightning (0.5,0.5,1) > quickdraw (1,0.8,0) > flawless (0,1,0.5) > yellow.
  - FLAWLESS is never shown: the flag is always passed false (bug).
  - Animation: appear 0.15 s (scale 0→1.5 with squash 0.2), hold 0.8 s, shrink 0.3 s.
- **Multiplier:**
  - Minimum 1.0.
  - Flawless +0.5, quickdraw +0.75, lightning +1.5, multikill +0.25, strike -0.125, 3 strikes → reset to 1.
  - Shown as "x{0.00}". It pulses (scale 1.3, yellow) when it rises.
- **Dog tag:** "{WORD} KIA", red (1,0.2,0.2), 20pt, bottom-left at (20,70). It blinks 3× over 0.6 s, then clears.

---

## 5. Difficulty ramp and constants

### Bomber spawner (scene values win)

| field | scene | code default |
|---|---|---|
| initialSpawnInterval | **9** | 7 |
| minSpawnInterval | 1.5 | 1.5 |
| intervalDecreaseRate | 0.15 per spawn | 0.15 |
| minSpawnHeight / maxSpawnHeight | **2.4 / 3.8** | 3 / 3.8 |
| spawnDistanceFromCenter | 12 | 12 |
| initialBomberSpeed | **1.2** | 1.5 |
| maxBomberSpeed | 3.5 | 3.5 |
| speedIncreaseRate | **0.07** per spawn | 0.05 |

- **Sequence:** spawn k (k=0,1,…) uses speed = min(3.5, 1.2 + 0.07k).
- **Gap before spawn k+1** = max(1.5, 9 - 0.15k). The first gap is 9.
- **Min interval** is reached after 50 spawns. **Max speed** is reached after 33 spawns.
- The prefab `Bomber.moveSpeed=2` is overridden by `SetMoveSpeed`.

### Bomber word length (`GameManager`)
- Level L = floor(bombersKilled / 5). Only bombers count; kills of any kind are counted on unregister, and bombers only unregister when killed.
- Word length range: min = clamp(4 + L/5, 4, 7) and max = clamp(5 + L/2, 5, 7), using integer division.

| L | lengths |
|---|---|
| 0–1 | 4–5 |
| 2–3 | 4–6 |
| 4 | 4–7 |
| 5–9 | 5–7 |
| 10–14 | 6–7 |
| 15+ | 7 |

- **Fallback:** if fewer than 10 words fit, the range widens by ±1 up to 3 times.

### Chopper spawner

| field | scene | code default |
|---|---|---|
| initialSpawnInterval | 20 | 20 |
| minSpawnInterval | 8 | 8 |
| intervalDecreaseRate | 0.5 | 0.5 |
| height | **2.5 – 3.5** | 3 – 3.8 |
| chopperSpeed | **1.1** | 1.5 |

- Gap after spawn k = max(8, 20 - 0.5k).
- Prefab values: fireRate 1.0, tiltAngle 15, tiltSpeed 2.

### Tutorial

| field | scene | code default |
|---|---|---|
| totalTutorialBalloons | 3 | 3 |
| tutorialDuration | 20 | 20 |
| chopperStartDelay | 60 | 60 |
| initialSpawnInterval | **2** | 3 |
| balloonSpawnDelay | 6 | 6 |
| height | **1.8 – 3.4** | 3 – 3.8 |
| balloonSpeed | 1.25 (unused) | 1.5 |

- Balloon prefab values: moveSpeed 1.5, wrapBoundary 12, bobAmplitude 0.15, bobFrequency 1.

### Words (`WordDictionary` asset)
- recentWordMemorySize 20; diversityPreference 80%.
- **Anti-repeat:** the last 20 words per category are excluded. Bomb and balloon words share one queue.
- **Starting-letter diversity:** with 80% probability, the pick avoids words whose first letter matches any active enemy's first letter, if possible.
- **Bomb weighting:** 2- and 3-letter words have weight 3 each; 4-letter words have weight 1. The list has no 2-letter words. Before filters, P(3-letter) = 81/190 ≈ 43%.

### Other constants

| item | value |
|---|---|
| Bomb parachuteSpeed | **1.3** (code: 2) |
| Fireball speed | 3 |
| Explosion lifetime | 1 |
| City damage | bombDamage 10, fireballDamage 5 |
| City smoke | emission 0 → 50 and lifetime 1 → 5 s, lerped by damage fraction |
| Turret | rotationSpeed 180, laserDuration 0.2, both controllers |
| Crosshair rotation | 180 |
| PlayerInput consts | MAX_STRIKES 3, FULL_STUN_DURATION 1, WORD_COMPLETION_DISPLAY_TIME 0.15, QUICKDRAW 0.3 s/char, LIGHTNING 0.15 s/char |
| GameStats | maxHealth 100; balloon 500; bomberNoBomb 750; bomberWithBomb 500; bomb 250; chopper 1500; revenge 250; flawless 0.5; multikill **0.25** (code: 1); quickdraw 0.75; lightning 1.5; strikePenalty 0.125; multikillWindow 2 s; minMultiplier 1; pointsPerSecond 10 |
| IncorrectWordFeedback | feedbackDuration 1, quick 0.15, flashColor black; flashSprites = TurretGun, TurretBase |

---

## 6. Visuals

### Day/night cycle (`DynamicSky`, on SkyBG, in both scenes)
- **Cycle:** cycleDuration **60 s**. The first 30 s are day and the last 30 s are night. The cycle starts at time 0 (dawn) unless `MenuDayTime` carries over.
- **Global light:** the `DayLight` Global Light2D (intensity 1) color is overwritten every frame. Serialized colors:

| name | color (r,g,b) |
|---|---|
| dawn | (0.481, 0.200, 0.106) |
| noon | (1.000, 0.753, 0.457) |
| dusk | (0.613, 0.136, 0.002) |
| night | (0.100, 0.100, 0.300) |

  Code defaults, for reference: dawn (1,0.4,0.2), noon (1,1,0.6), dusk (1,0.3,0.1), night (0.1,0.1,0.3).
- **Light schedule** (p = progress within the half-cycle):

| phase | p | light |
|---|---|---|
| Day | < 0.2 | lerp dawn → noon |
| Day | 0.2 – 0.8 | noon |
| Day | > 0.8 | lerp noon → dusk |
| Night | < 0.2 | lerp dusk → night |
| Night | 0.2 – 0.8 | night |
| Night | > 0.8 | lerp night → dawn |

- **Lighting model:** the light multiplies all lit sprites (Sprite-Lit-Default and BrightnessLit2D). It does **not** affect UI or TMP text. For the web, multiply the world layer by this color, but not the HUD or word labels.
- **Sun and moon:**
  - Day: sun localY = -3.5 + sin(p·π) × **14** (`celestialPeakHeight`, code: 5). The moon is hidden.
  - Night: moon localY = -2.75 + sin(p·π) × 14. The sun is hidden.
  - Both are parented to SkyBG at y -4.188, at x 0, with alpha 0.784.
  - The peak is far above the top of the screen. The sun is only visible on screen roughly when p < 0.36 or p > 0.64. It rises from behind the mountains, exits the top, and comes back down.
  - Sun is 48 px @16 = 3 u; Moon is 24 px @16 = 1.5 u. Both have pivot bottom-center.
- **Clouds:**
  - **10** initial clouds (code: 20) at random x ∈ [-12, 12], y = U(**-3, 4**) world.
  - Sprite: one random Cloud Frame_0..3 (≈27–29x11–13 @16 ≈ 1.75 u), random flipX.
  - sortingOrder **-85** (behind the mountains), alpha 0.882 from the prefab color.
  - Scale × (1 ± U(0.25)).
  - Speed U(0.5, 1.5) u/s, **always moving right**.
  - When x > 12 the cloud is destroyed and a new one spawns at x = -12. `cloudSpawnY=3` is unused.
  - The cloud prefab's Animator (Cloud_Clip, 4 frames, 0.4 s loop) is **disabled** at spawn.

### Post-processing (URP Global Volume, both scenes)
- Bloom: threshold 0.5, intensity 1.2, scatter 1.0, max 6 iterations.
- Tonemapping: mode 2 = ACES.
- Vignette: black, intensity 0.2, smoothness 0.5, rounded.
- Film grain: type 2, intensity 0.2, response 0.8.
- Chromatic aberration: 0.05.

### `BrightnessLit2D` material
- A custom shader. Its source was not recoverable; only the compiled shader exists.
- Properties: `_BrightnessThreshold` 0.5, `_EmissionBoost` 1.5.
- Used on: city, turret, sun, moon, every enemy, the fireball and explosions.
- **Inference:** pixels brighter than 0.5 are boosted ×1.5, behaving like emissive pixels, so lit windows, explosions and the sun stay bright at night and feed the bloom.
- Sky, mountains, rocks and ground use plain Sprite-Lit-Default.

### Feedback effects (code defaults; these components are added at runtime)

**Enemy squash-stretch**
- Runs for 0.3 s with s = sin(πt/0.3).
- scaleX = 1 + 0.15s, scaleY = 1 + 0.075s.

**Enemy shake**
- Runs for 0.3 s with amplitude 0.03 × (1 - t/0.3).
- Offset = (sin(time × 30), cos(time × 39)) × amplitude.

**FlashEffect**
- `FlashOnce`: lerps toward the flash color by sin(π·t/d), then restores the original color.
- `Flash`: a hard set, then restore after d.
- `FlashContinuous`: ping-pong.
- On TMP text it also tints the glow color.

**City hit**
- Every SpriteRenderer under City (both CityImage, TurretBase, TurretGun) runs `FlashOnce` red for 0.3 s.
- Siren and city-hit shake.

**Camera shake**
- Each frame: random offset ±pos, random z-rotation ±rot, random ortho size ±zoom. All three decay linearly to 0 over the duration.
- A new shake replaces any shake already running.

| shake | pos | rot ° | zoom | duration s |
|---|---|---|---|---|
| typing | 0.03 | 0.5 | 0.01 | 0.08 |
| explosion | 0.15 | 1.5 | 0.05 | 0.25 |
| city hit / stun | 0.3 | 3.0 | 0.1 | 0.4 |

**City smoke particles** (CitySmoke at (0,-4.1), rotated 60°)
- Shape: circle, radius 1, arc 60.
- Start speed 5, size 1, color white.
- Color over lifetime: white → (0.887,0.626,0.28) at 18%; alpha 1 → 0.
- Size over lifetime: 1 → 0.
- Force over lifetime: y 1 → 0.
- Texture: `SmokeParticle`. Material ParticleAlpha.
- Emission starts at 0 and is set from health as described in §5.

**HUD text effects**
- Health text on damage: shake ±10 px for 0.5 s; color lerps toward red by sin.
- Multiplier on increase: pulse to scale 1.3 and yellow over 0.3 s.

### HUD (game)
- **Canvas:** overlay, CanvasScaler **ConstantPixelSize, scale 1**, so sizes are raw pixels at any resolution.
- **Font:** every element uses TMP **OpenDyslexic Bold Italic**.
  - Glow material (GLOW_ON, glow color 1.5 white at alpha 0.5, outer 0.05) for the HUD.
  - The "NoGlow" variant for menus and panels.
  - All have a black outline of 0.1 and a soft black underlay (alpha 0.5, dilate 0.51, softness 0.48).

| element | anchor | position | size | text |
|---|---|---|---|---|
| HealthText | bottom-left | (20,20) | 300x50 | "Health: 100", 24 bold uppercase, white |
| ScoreText | bottom-right | (-20,20) | 300x30 | "Score: 0", 24, right-aligned |
| MultiplierText | bottom-right | (-20,60) | 200x25 | "x1.00", 24, color (1,0.916,0.665) |
| DogTagText | bottom-left | (20,70) | 320x40 | 20pt, red |
| InputFieldContainer | bottom-center | (0,15) | 360x80 | — |
| PauseButton | top-right | (-20,-20) | 48x48 | — |

---

## 7. Audio

**Mixer:** `MainAudioMixer` with groups Master, Music and SFX. Its effect settings were not inspected.

**SFX pool**
- 10 AudioSources. The menu instance, `DontDestroyOnLoad`, persists; the game scene's own instance (pool 15) is destroyed as a duplicate.
- Per play:
  - pitch U(0.95, 1.05);
  - volume U(0.9, 1.0) × attenuation × SFX volume.
- Attenuation = lerp(1, 0.75, (activeVoices - 1) / (pool - 1)).

| clip (out/audio/) | length | when |
|---|---|---|
| TypewriterCommand.wav | 85.3 s, 48 kHz stereo | **Music.** Loops forever and persists across scenes. Volume = music slider × 0.5. |
| TypewriterPress.wav | 0.08 s | Each correct keystroke after the first key of a target; every UI button click |
| ErrorShort.wav | 0.46 s | Strike 1 or 2 |
| ErrorThreeStrikes.wav | 1.30 s | 3rd strike / stun |
| LaserFire.wav | 0.66 s | Turret fires |
| Explosion.wav | 1.71 s | Enemy killed; bomb or fireball hits the city (twice for a bomb hit) |
| BombFall.wav | 2.94 s | A bomb spawns; stopped when it hits the city or is destroyed |
| ChopperFire.wav | 2.04 s | Each fireball, at volume ×0.8 |
| CityAttackedSiren.wav | 8.89 s | Any city hit (pitch ×0.98). Not restarted while already playing. |

---

## 8. Asset inventory (`ref/out/`)

### Sprites
36 sprite PNGs are in `sprites/`. 6 of them are Unity default UI and splash sprites (`res_*`, `ggm_*`), which are unused by the game. Contact sheet: `sprites_sheet.png`.

| file (ref/out/) | texture/name | px rect | pivot | ppu | world size (u) | used by |
|---|---|---|---|---|---|---|
| sprites/s1_Frame_3__22.png | Explosion/Frame_3 | 23x22 | 0.522,0.500 | 12 | 1.92x1.83 | Explosion prefab anim (0.1s/frame, 0.4s, no loop) |
| sprites/s1_Plane1__23.png | Bomber/Plane1 | 30x13 | 0.500,0.615 | 16 | 1.88x0.81 | Bomber prefab |
| sprites/s1_TutorialBalloon__24.png | TutorialBalloon/TutorialBalloon | 22x31 | 0.500,0.484 | 16 | 1.38x1.94 | TutorialBalloon prefab |
| sprites/s1_Frame_2__25.png | Explosion/Frame_2 | 21x21 | 0.524,0.524 | 12 | 1.75x1.75 | Explosion prefab anim (0.1s/frame, 0.4s, no loop) |
| sprites/s1_Frame_0__26.png | Explosion/Frame_0 | 19x19 | 0.526,0.526 | 12 | 1.58x1.58 | Explosion prefab anim (0.1s/frame, 0.4s, no loop) |
| sprites/s1_ChopperFireball__27.png | ChopperFireball/ChopperFireball | 8x8 | 0.500,0.500 | 16 | 0.50x0.50 | ChopperFireball prefab |
| sprites/s1_Frame_1__28.png | Explosion/Frame_1 | 21x21 | 0.524,0.524 | 12 | 1.75x1.75 | Explosion prefab anim (0.1s/frame, 0.4s, no loop) |
| sprites/s1_icon_pause__29.png | icon_pause/icon_pause | 96x96 | 0.500,0.500 | 48 | 2.00x2.00 | UI PauseButton |
| sprites/s1_icon_crosshair__30.png | icon_crosshair/icon_crosshair | 96x96 | 0.500,0.500 | 48 | 2.00x2.00 | UI Crosshair |
| sprites/s1_TurretGun__31.png | TurretGun/TurretGun | 23x6 | 0.000,0.500 | 16 | 1.44x0.38 | City/TurretBase/GunPivot/TurretGun |
| sprites/s1_TurretBase__32.png | TurretBase/TurretBase | 24x12 | 0.500,0.000 | 16 | 1.50x0.75 | City/TurretBase |
| sprites/s1_Frame_0__33.png | Chopper/Frame_0 | 31x15 | 0.484,0.467 | 16 | 1.94x0.94 | Chopper prefab Idle anim (3 frames/0.15s loop) |
| sprites/s1_Bomb__34.png | Bomb/Bomb | 16x32 | 0.500,0.500 | 32 | 0.50x1.00 | Bomb prefab |
| sprites/s1_Frame_1__35.png | Chopper/Frame_1 | 31x15 | 0.484,0.467 | 16 | 1.94x0.94 | Chopper prefab Idle anim (3 frames/0.15s loop) |
| sprites/s1_Frame_2__36.png | Chopper/Frame_2 | 31x15 | 0.484,0.467 | 16 | 1.94x0.94 | Chopper prefab Idle anim (3 frames/0.15s loop) |
| sprites/s0_Frame_1__33.png | RockFormations/Frame_1 | 32x16 | 0.500,0.000 | 12 | 2.67x1.33 | Ground/Rock* |
| sprites/s0_Frame_1__34.png | BackgroundLayers/Frame_1 | 240x35 | 0.500,0.000 | 12 | 20.00x2.92 | Frame_0=BGLayer1 mountains (-75), Frame_1=BGLayer2 dunes (-70, a=.862) |
| sprites/s0_Sun__35.png | Sun/Sun | 48x48 | 0.500,0.000 | 16 | 3.00x3.00 | SkyBG/Sun |
| sprites/s0_Frame_1__36.png | Cloud/Frame_1 | 27x12 | 0.444,-0.083 | 16 | 1.69x0.75 | DynamicSky random cloud sprite (animator disabled) |
| sprites/s0_Moon__37.png | Moon/Moon | 24x24 | 0.500,0.000 | 16 | 1.50x1.50 | SkyBG/Moon |
| sprites/s0_Frame_0__38.png | Cloud/Frame_0 | 28x11 | 0.464,-0.273 | 16 | 1.75x0.69 | DynamicSky random cloud sprite (animator disabled) |
| sprites/s0_Frame_3__39.png | Cloud/Frame_3 | 29x13 | 0.483,-0.077 | 16 | 1.81x0.81 | DynamicSky random cloud sprite (animator disabled) |
| sprites/s0_Frame_2__40.png | Cloud/Frame_2 | 28x12 | 0.500,-0.167 | 16 | 1.75x0.75 | DynamicSky random cloud sprite (animator disabled) |
| sprites/s0_SkyBG__41.png | SkyBG/SkyBG | 240x134 | 0.500,0.000 | 12 | 20.00x11.17 | SkyBG (both scenes) |
| sprites/s0_Frame_2__42.png | RockFormations/Frame_2 | 32x14 | 0.500,0.000 | 12 | 2.67x1.17 | Ground/Rock* |
| sprites/s0_Frame_0__43.png | RockFormations/Frame_0 | 31x15 | 0.516,0.000 | 12 | 2.58x1.25 | Ground/Rock* |
| sprites/s0_SandGroundTile__44.png | SandGroundTile/SandGroundTile | 16x16 | 0.500,0.000 | 16 | 1.00x1.00 | Ground (tiled 20x2) |
| sprites/s0_Frame_0__45.png | BackgroundLayers/Frame_0 | 240x65 | 0.500,0.000 | 12 | 20.00x5.42 | Frame_0=BGLayer1 mountains (-75), Frame_1=BGLayer2 dunes (-70, a=.862) |
| sprites/s0_CityImage__46.png | CityImage/CityImage | 28x44 | 0.500,0.000 | 16 | 1.75x2.75 | City/CityImage x2 (one flipX) + menu |


### Textures
78 PNGs are in `textures/`. The relevant ones are the `s0_*` and `s1_*` atlases:
- `s1_Bomber__10`, `s1_Chopper__5` (3-frame sheet), `s1_Explosion__6` (4 frames), `s1_SmokeParticle__13` (smoke particle texture);
- `s0_Cloud__13` (4 frames), `s0_BackgroundLayers__11` (2 layers), `s0_RockFormations__8` (3 frames), sky, sun, moon, city and others.

The `ggm_*` textures are URP post-processing and Unity defaults (grain textures and similar). They are not needed.

Not exported (a PIL error on Alpha8 atlases): the dynamic TMP font atlases. They are not needed; the source fonts are below.

### Fonts (`fonts/`)

| file | size | used by |
|---|---|---|
| OpenDyslexic-BoldItalic.otf | 234 KB | **All game and menu text.** It is the source for the TMP assets `OpenDyslexic` (glow) and `OpenDyslexicNoGlow`. The atlas material is confusingly named "PixelifySans… Atlas Material", but the face is OpenDyslexic Bold Italic. |
| LiberationSans.ttf | 350 KB | TMP default font, unused |
| PerfectDOSVGA437.ttf | 81 KB | Only referenced in resources.assets (TMP resources); unused in the scenes |

### Audio
9 WAV files in `audio/`, decoded from the build. Sizes: music 16.4 MB; siren 1.57 MB; the others are under 330 KB. See §7.

### Text
- `text/WordDictionary_allWords.txt` (3.9 KB): the raw comma-separated word list.
- `text/words.json`: the list split into the three game buckets.
- Other `text/*.txt` files are TMP and Unity defaults, irrelevant.

### Animations
These were read from the AnimationClip objects. Frame timing is approximated: uniform spacing over the clip length.

| clip | frames | length | loop |
|---|---|---|---|
| Chopper `Idle` | 3 | 0.15 s | yes |
| `Explosion` | 4 | 0.4 s | no |
| `Cloud_Clip` | 4 | 0.4 s | yes (unused at runtime) |

---

## 9. Word list

- **Location in the build:** a `WordDictionary` ScriptableObject in sharedassets1, field `allWords`. It is not a TextAsset.
- **Extracted to:** `out/text/WordDictionary_allWords.txt`.
- **Parsing:** split on `, \n \r space`, trim, uppercase. **Duplicates are not removed.**
- **Totals:** 495 tokens, 484 unique. The 11 duplicates are ACE, FURY, CODE, GRID, KING, PALADIN, CRUSADER, CHIEFTAIN, BRIGADE, CHIEF, BOSS. Duplicates double their pick chance.
- **By length:**

| length | count |
|---|---|
| 3 | 27 |
| 4 | 109 |
| 5 | 90 |
| 6 | 90 |
| 7 | 91 |
| 8 | 40 |
| 9 | 25 |
| 10 | 13 |
| 11 | 8 |
| 12 | 2 |

  Words of 9–12 letters are never used.
- **Game buckets** (they overlap):

| bucket | lengths | count | used for |
|---|---|---|---|
| bomb / balloon | 2–4 | **136** (27×3 + 109×4) | bombs and balloons |
| bomber | 4–7 | **380** | bombers |
| chopper | 6–8 | **221** | choppers |

- **Theme:** military / sci-fi words. The list starts "Air, Jet, Gun, Ace, Sky, War, Red, Zap, Nuke, Ion, …".

---

## 10. Known quirks and bugs (decide whether to keep them)
1. A bomb hitting the city still awards the player bomb points (×multiplier), shows a KIA tag, and counts toward multikill.
2. The FLAWLESS popup tag never shows, but the +0.5 multiplier still applies.
3. The per-keystroke green label flash is cancelled the same frame by `StopFlashing`.
4. A wrong character persists. Each further key is a strike until backspace.
5. Choppers sink while approaching (local-space translate with tilt).
6. Escaped balloons count as destroyed for ending the tutorial.
7. `TutorialManager.balloonSpeed`, `SpawnCoordinator`, `FiringPoint` and `cloudSpawnY` are unused.
8. `UIManager` exists twice: one copy on the GameManager object with half its references null, one on the UI canvas. Both update the HUD.
9. The menu sky does not sync to the game. Only game→menu→game carries the time of day.
10. The SFX volume read at Awake uses the raw slider value. The ×0.5 scale is applied only once the menu `Start` runs.

## 11. Not recovered or uncertain
- The HLSL for `BrightnessLit2D`, and for the Particle/Laser shaders. Only the property values above are known.
- Exact per-keyframe timing inside the animation clips (uniform spacing is assumed).
- Audio mixer group volumes and effects.
- The `Unknown (655991488)` object in globalgamemanagers. PlayerSettings needed a raw byte scan because its typetree size mismatched; the screen size came from that scan.
