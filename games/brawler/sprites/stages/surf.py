# Usage: blender -b --factory-startup --python surf.py -- <fg.png> <y0> <y1>   (prints first opaque row per 20px column)
# Print walkable surfaces: per 10px column band, first opaque row from top, plus runs.
import bpy, numpy as np, sys
a = sys.argv[sys.argv.index('--')+1:]
im = bpy.data.images.load(a[0]); w, h = im.size
al = np.array(im.pixels[:], np.float32).reshape(h, w, 4)[::-1][..., 3] > 0.5
y0, y1 = int(a[1]), int(a[2])  # search band
for x in range(0, w, 20):
    col = al[y0:y1, x]
    ys = np.nonzero(col)[0]
    print(x, (y0 + ys[0]) if len(ys) else '-', end=' | ')
print()
