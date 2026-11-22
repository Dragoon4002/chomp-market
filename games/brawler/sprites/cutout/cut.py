# Cut a hero image into rig parts for the web cutout renderer.
# Run: blender -b --factory-startup --python cut.py -- <config.json> <outdir> [overlay.png]
# Each part = pixels inside its polygon (later parts win overlaps; the 'rest' part takes what's left),
# plus `fill` px of diffusion-inpaint under parts drawn above it, so rotating parts don't open holes.
import bpy, json, os, sys
import numpy as np

args = sys.argv[sys.argv.index('--') + 1:]
cfg = json.load(open(args[0])); out = args[1]
root = os.path.abspath(os.path.join(os.path.dirname(args[0]), '../../../..'))
os.makedirs(out, exist_ok=True)

def load(p):
    im = bpy.data.images.load(p); w, h = im.size
    return np.array(im.pixels[:], np.float32).reshape(h, w, 4)[::-1].copy()

def save(a, p):
    h, w = a.shape[:2]
    im = bpy.data.images.new('o', w, h, alpha=True)
    im.pixels = np.ascontiguousarray(a[::-1]).ravel(); im.filepath_raw = p; im.file_format = 'PNG'; im.save()
    bpy.data.images.remove(im)

px = load(os.path.join(root, cfg['src'])); H, W = px.shape[:2]
sil = px[..., 3] > 0.02
yy, xx = np.mgrid[0:H, 0:W] + 0.5

def poly_mask(pts):
    m = np.zeros((H, W), bool); n = len(pts)
    for i in range(n):
        (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % n]
        if y0 == y1: continue
        c = ((y0 <= yy) & (yy < y1)) | ((y1 <= yy) & (yy < y0))
        xi = x0 + (yy - y0) * (x1 - x0) / (y1 - y0)
        m ^= c & (xx < xi)
    return m

def nb(a):  # 4-neighbour shifts, zero padded
    p = np.pad(a, [(1, 1), (1, 1)] + [(0, 0)] * (a.ndim - 2))
    return [p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]]

parts = cfg['parts']
own = np.full((H, W), -1)
for i, p in enumerate(parts):
    if 'poly' in p: own[poly_mask(p['poly']) & sil] = i
rest = next(i for i, p in enumerate(parts) if p.get('rest'))
own[(own < 0) & sil] = rest

meta = {'feet': cfg['feet'], 'hip': cfg['hip'], 'height': cfg['height'], 'parts': []}
comp = np.zeros_like(px)
for i, p in enumerate(parts):
    known = own == i
    col = px[..., :3] * known[..., None]; alpha = np.where(known, px[..., 3], 0)
    target = sil & (own > i)  # only fill under parts drawn above this one
    if 'fillPoly' in p: target &= poly_mask(p['fillPoly'])  # keep fill inside the real body
    for _ in range(p.get('fill', 0)):
        cand = target & ~known
        ks = nb(known.astype(np.float32)); n = sum(ks)
        grow = cand & (n > 0)
        if not grow.any(): break
        cs = sum(c * k[..., None] for c, k in zip(nb(col), ks)); as_ = sum(a * k for a, k in zip(nb(alpha), ks))
        col[grow] = cs[grow] / n[grow, None]; alpha[grow] = as_[grow] / n[grow]
        known = known | grow
    filled = known & (own != i)
    for _ in range(150 if filled.any() else 0):  # relax fill to a smooth (Laplace) patch: kills edge-copy streaks
        ks = nb(known.astype(np.float32)); n = np.maximum(sum(ks), 1)
        cs = sum(c * k[..., None] for c, k in zip(nb(col), ks)); as_ = sum(a * k for a, k in zip(nb(alpha), ks))
        col[filled] = cs[filled] / n[filled, None]; alpha[filled] = as_[filled] / n[filled]
    layer = np.dstack([col, alpha])
    ys, xs = np.nonzero(alpha > 0.01)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    save(layer[y0:y1, x0:x1], os.path.join(out, p['name'] + '.png'))
    meta['parts'].append({k: p[k] for k in ('name', 'bone', 'parent', 'pivot')} | {'at': [int(x0), int(y0)]})
    a = layer[..., 3:4]; comp = layer * a + comp * (1 - a)  # straight-alpha over
json.dump(meta, open(os.path.join(out, 'rig.json'), 'w'), indent=1)

err = np.abs(comp[..., :3] * comp[..., 3:] - px[..., :3] * px[..., 3:]).max()
print('REASSEMBLY max err', round(float(err), 4))
if len(args) > 2:  # ownership overlay for eyeballing the polygons
    pal = np.array([[1,0,0],[0,1,0],[0,0,1],[1,1,0],[1,0,1],[0,1,1],[1,.5,0],[.5,0,1],[0,.5,0],[.5,.5,1],[1,.6,.8]], np.float32)
    o = np.ones((H, W, 4), np.float32); a = px[..., 3:4]; o[..., :3] = px[..., :3] * a + (1 - a)
    m = own >= 0; o[m, :3] = o[m, :3] * 0.45 + pal[own[m] % len(pal)] * 0.55
    for p in parts:
        x, y = map(int, p['pivot']); o[max(0,y-2):y+3, max(0,x-2):x+3, :3] = 0
    save(o.repeat(2, 0).repeat(2, 1), args[2])
