# Title screen layers from assets/Title Screen: 1-4 are full-frame art on white or transparent (front -> back), 5 is the sky.
# White is removed by flooding from the borders over near-white pixels; edge pixels are un-mixed from white (soft alpha).
# Run: blender -b --factory-startup --python title.py -- "<assets/Title Screen>" <outdir>
import bpy, os, shutil, sys
import numpy as np

a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]
os.makedirs(out, exist_ok=True)
NAMES = {'1': 'warriors', '2': 'sides', '3': 'clouds', '4': 'far'}

def nb_or(m):
    g = m.copy(); g[1:] |= m[:-1]; g[:-1] |= m[1:]; g[:, 1:] |= m[:, :-1]; g[:, :-1] |= m[:, 1:]
    return g

def grow_from(seed, ok):
    while True:
        g = nb_or(seed) & ok
        if (g == seed).all(): return seed
        seed = g

for k, name in NAMES.items():
    im = bpy.data.images.load(os.path.join(src, k + '.png')); W, H = im.size
    px = np.array(im.pixels[:], np.float32).reshape(H, W, 4)[::-1].copy()
    lo = px[..., :3].min(-1)
    near_white = lo > 0.80
    bg = np.zeros((H, W), bool); bg[0] = near_white[0]; bg[-1] = near_white[-1]; bg[:, 0] = near_white[:, 0]; bg[:, -1] = near_white[:, -1]
    while True:
        g = nb_or(bg) & near_white
        if (g == bg).all(): break
        bg = g
    # enclosed white pockets (inside arches, between branches/cape folds): solid near-white areas >= ~7px across.
    # Thin glints (blade edges, horn highlights) can't hold a 7px core, so they stay.
    # Warriors skip this: their blades, horns, visor and spark core are legit white.
    strict = name != 'warriors'
    if strict:
        core = lo > 0.93
        for _ in range(3): core &= ~nb_or(~core)
        bg |= grow_from(core, near_white)
    edge = bg.copy()
    for _ in range(4 if strict else 3): edge = nb_or(edge)
    # alpha from distance to white near the background; strict also fades light rims: c = a*f + (1-a)*1
    al = np.where(edge, np.clip((0.95 - lo) / 0.35, 0, 1) if strict else np.clip((1 - lo) / 0.2, 0, 1), 1.0)
    f = np.where(al[..., None] > 0, (px[..., :3] - (1 - al[..., None])) / np.maximum(al[..., None], 1e-3), 0)
    px[..., :3] = np.clip(f, 0, 1); px[..., 3] = al * px[..., 3]  # keep any transparency the source already has
    o = bpy.data.images.new(name, W, H, alpha=True); o.pixels = np.ascontiguousarray(px[::-1]).ravel()
    o.filepath_raw = os.path.join(out, name + '.png'); o.file_format = 'PNG'; o.save()
    print('layer', name, W, H, 'transparent', round(float((px[..., 3] < 0.5).mean()), 2))
shutil.copy(os.path.join(src, '5.png'), os.path.join(out, 'sky.png'))
print('layer sky (copied)')
