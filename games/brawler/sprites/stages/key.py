# Usage: blender -b --factory-startup --python key.py -- <art.png> <out fg.png> [x,y,r ...light-source circles]
# Key flat-black background out of stage art: flood from borders over dark pixels, soft alpha by brightness.
import bpy, numpy as np, sys
a = sys.argv[sys.argv.index('--')+1:]; src, out = a[0], a[1]
im = bpy.data.images.load(src); w, h = im.size
px = np.array(im.pixels[:], np.float32).reshape(h, w, 4)[::-1].copy()
print('alpha min', px[..., 3].min(), 'transparent frac', (px[..., 3] < 0.5).mean())
if px[..., 3].min() < 0.5: raise SystemExit  # already has alpha
m = px[..., :3].max(-1) * 255
cand = m < 45
def grow(seed, ok):
    while True:
        g = seed.copy(); g[1:] |= seed[:-1]; g[:-1] |= seed[1:]; g[:, 1:] |= seed[:, :-1]; g[:, :-1] |= seed[:, 1:]
        g &= ok
        if (g == seed).all(): return seed
        seed = g
seed = np.zeros_like(cand); seed[0] = cand[0]; seed[-1] = cand[-1]; seed[:, 0] = cand[:, 0]; seed[:, -1] = cand[:, -1]
black = m < 8  # big pure-black pockets enclosed by art (e.g. inside rope loops): erode so thin outlines never seed
er = black.copy()
for _ in range(4): er[1:-1, 1:-1] &= er[:-2, 1:-1] & er[2:, 1:-1] & er[1:-1, :-2] & er[1:-1, 2:]
bg = grow(seed | er, cand)
r, b = px[..., 0] * 255, px[..., 2] * 255
warm = (m < 170) & (r > b * 1.6)
inner = bg.copy()
for _ in range(3): inner[1:-1, 1:-1] &= inner[:-2, 1:-1] & inner[2:, 1:-1] & inner[1:-1, :-2] & inner[1:-1, 2:]
near = np.zeros_like(bg)  # glow keyed only inside given circles: args 'x,y,r' (light sources)
yy, xx = np.mgrid[0:h, 0:w]
for c in a[2:]:
    cx, cy, cr = map(float, c.split(',')); near |= (xx - cx) ** 2 + (yy - cy) ** 2 < cr ** 2
glow = grow(inner & warm & (m > 18) & near, warm & near)  # lantern light: seeded only from warm-tinted background, so art outlines don't leak it
al = np.where(glow & ~bg, np.clip((m - 10) / 170, 0, 1) ** 1.5, 1.0)
al = np.where(bg, np.clip((m - 10) / 35, 0, 1), al)
px[..., :3] = np.where(al[..., None] > 0, px[..., :3] / np.maximum(al[..., None], 1e-3), 0).clip(0, 1)
px[..., 3] = al
o = bpy.data.images.new('o', w, h, alpha=True); o.pixels = np.ascontiguousarray(px[::-1]).ravel()
o.filepath_raw = out; o.file_format = 'PNG'; o.save(); print('keyed', out)
