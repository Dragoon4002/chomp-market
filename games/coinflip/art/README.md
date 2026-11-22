Re-render: from repo root run `blender -b -P games/coinflip/art/coin.py` (EEVEE, ~12s; add `-- --engine cycles` for Cycles CPU).
Writes heads.png, tails.png, spin.png (24 frames x 256px, 15deg/frame about X, frame 0 heads, 12 tails) to games/coinflip/client/public/coin/.
Tweak geometry/lights/materials in coin.py (build() and scene_setup()); keep spin.png < 1.5 MB.
