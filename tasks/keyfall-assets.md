# Keyfall art to generate

Drop finished files in `games/keyfall/client/public/art/` with the exact file names below. All PNG.
Game renders on a 1920x1080 logical canvas (16:9); sizes below are final pixel sizes at that scale.
Style line to append to every prompt (keep identical so the set matches): `2D side-view game sprite, same art style as the rest of the set, clean outlines, soft cel shading, no text, no watermark, no drop shadow on the canvas`.

| # | File | Size (px) | Background | Prompt |
|---|---|---|---|---|
| 1 | `sky_day.png` | 1920x1080 | opaque | Daytime sky backdrop for a 2D side-view city defense game, light blue gradient sky, a few faint distant hills along the bottom 20%, empty middle for gameplay. |
| 2 | `sky_night.png` | 1920x1080 | opaque | Same composition as sky_day but at night: deep navy gradient, small scattered stars, dark distant hills along the bottom 20%. |
| 3 | `city.png` | 1920x360 | transparent background | Wide city skyline seen from the side, row of varied buildings with lit windows, flat ground strip at the very bottom, fills full width edge to edge, transparent background above the rooftops. |
| 4 | `turret_base.png` | 192x160 | transparent background | Anti-air turret base / bunker sitting on a rooftop, front-facing side view, no barrel, transparent background. |
| 5 | `turret_barrel.png` | 192x48 | transparent background | Anti-air cannon barrel lying horizontal pointing right, mount end on the left edge (it rotates around its left-center point), transparent background. |
| 6 | `bomber.png` | 320x140 | transparent background | Propeller bomber plane, side view facing right, bomb bay visible under the fuselage, transparent background. |
| 7 | `chopper_1.png` | 300x170 | transparent background | Attack helicopter, side view facing right, main rotor blades spread wide, transparent background. |
| 8 | `chopper_2.png` | 300x170 | transparent background | Exactly the same helicopter as chopper_1 (same position and size) but the main rotor blades are rotated to a different angle, for a 2-frame spin animation, transparent background. |
| 9 | `bomb.png` | 110x180 | transparent background | Small bomb hanging under an open parachute, bomb at bottom, parachute canopy on top, side view, transparent background. |
| 10 | `fireball.png` | 96x96 | transparent background | Glowing fireball projectile with a short flame trail pointing to the upper-left (it travels down-right), transparent background. |
| 11 | `balloon.png` | 130x200 | transparent background | Floating hot-air style target balloon with a small basket, side view, transparent background. |
| 12 | `explosion.png` | 1152x192 | transparent background | Sprite sheet, 6 frames in one horizontal row, each frame 192x192, an explosion animation from small flash to big fireball to fading smoke puff, frames evenly spaced, transparent background. |
| 13 | `smoke.png` | 128x128 | transparent background | Single soft grey smoke puff, round and fluffy, transparent background. |
| 14 | `cloud_1.png` | 400x180 | transparent background | Fluffy white cartoon cloud, wide and flat, transparent background. |
| 15 | `cloud_2.png` | 320x160 | transparent background | Different fluffy white cartoon cloud, rounder, transparent background. |
| 16 | `cloud_3.png` | 480x200 | transparent background | Different long thin white cartoon cloud, transparent background. |
| 17 | `sun.png` | 180x180 | transparent background | Warm yellow sun with soft glow, transparent background. |
| 18 | `moon.png` | 160x160 | transparent background | Pale crescent moon with soft glow, transparent background. |
| 19 | `crosshair.png` | 128x128 | transparent background | Red targeting reticle / crosshair, thin circle with four tick marks, centered, transparent background. |
| 20 | `logo.png` | 1200x400 | transparent background | Game title logo text "KEYFALL" in a bold military stencil / typewriter style, slight 3D bevel, transparent background. |

Not needed as images (drawn in code): word labels, laser shot line, health bar, WPM readout, menus, screen flash, camera shake.
