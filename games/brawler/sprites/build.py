# Blender sprite-sheet builder: layered, armature-deformed image planes driven by rig.ts poses.
# Run: blender --background --factory-startup --python build.py -- <lortor|torfen> [segonly]
import bpy, sys, os, json, math
import numpy as np
from mathutils import Vector, Quaternion

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SCRATCH = os.environ.get('SPRITE_SCRATCH', '/tmp/sprites')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['lortor']
NAME = argv[0]
SEGONLY = 'segonly' in argv
OUT_PX_PER_UNIT = 2.5

# ---------------------------------------------------------------- poses (copied from client/src/lib/render/rig.ts)
BASE = dict(y=0, t=0.08, h=-0.05, r=0, fu=0.4, fl=1.4, bu=-0.1, bl=1.2, ft=0.25, fs=-0.3, bt=-0.2, bs=-0.2, tail=0.3, jaw=0, blink=0)
P = lambda **k: {**BASE, **k}
POSES = dict(
    idle=P(),
    idle2=P(y=2, t=0.13, h=0, fu=0.48, fl=1.55, bl=1.35, tail=0.45),
    run1=P(y=-2, t=0.32, fu=-0.6, fl=1.2, bu=0.8, bl=1.0, ft=0.95, fs=-0.4, bt=-0.6, bs=-1.3, tail=0.1),
    run2=P(y=3, t=0.3, fu=0.8, fl=1.0, bu=-0.6, bl=1.2, ft=-0.6, fs=-1.3, bt=0.95, bs=-0.4, tail=0.25),
    squat=P(y=11, t=0.42, h=0.1, fu=-0.3, fl=0.8, bu=-0.5, bl=0.8, ft=0.95, fs=-1.7, bt=0.55, bs=-1.6),
    rise=P(y=-2, t=0.1, h=-0.15, fu=2.2, fl=0.3, bu=-0.8, bl=0.6, ft=0.75, fs=-1.4, bt=-0.2, bs=-0.6, tail=-0.2),
    fall=P(t=0.05, fu=1.4, fl=0.4, bu=-1.0, bl=0.5, ft=0.3, fs=-0.2, bt=-0.1, bs=-0.3, tail=0.6),
    tuck=P(y=6, t=0.6, h=0.3, fu=0.8, fl=1.9, bu=0.6, bl=1.9, ft=1.4, fs=-2.3, bt=1.0, bs=-2.3, tail=1.0, blink=1),
    hurt=P(t=-0.5, h=-0.45, fu=-1.2, fl=0.5, bu=-1.6, bl=0.3, ft=0.5, fs=-0.2, bt=-0.4, bs=-0.3, tail=1.1, jaw=0.5, blink=1),
    guard=P(y=5, t=-0.2, h=0.15, fu=1.1, fl=2.3, bu=0.9, bl=2.3, ft=0.45, fs=-0.7, bt=-0.35, bs=-0.5),
    tumble=P(t=-0.9, h=-0.6, fu=-2.4, fl=0.4, bu=2.4, bl=0.4, ft=1.0, fs=-0.6, bt=-0.8, bs=-0.6, tail=1.4, jaw=0.6, blink=1),
)
ATTACK = dict(
    jab1=[dict(fu=0.2, fl=1.9, t=0.0), dict(fu=1.55, fl=0.05, t=0.25, jaw=0.3)],
    jab2=[dict(bu=0.1, bl=1.9, fu=0.3, fl=1.6), dict(bu=1.55, bl=0.05, fu=0.2, fl=1.5, t=0.3, jaw=0.3)],
    jab3=[dict(fu=-0.3, fl=1.7, y=7, t=0.3), dict(fu=2.5, fl=0.2, t=0.05, y=-4, h=-0.3, jaw=0.6)],
    sideLight=[dict(fu=-0.9, fl=1.2, t=-0.1), dict(fu=1.6, fl=0.1, t=0.5, ft=0.85, fs=-0.3, bt=-0.75, bs=-0.4, jaw=0.5)],
    downLight=[dict(y=10, t=0.25, ft=0.9, fs=-1.7), dict(y=13, t=-0.2, ft=1.55, fs=0, bt=-0.2, bs=-1.6, fu=-0.6, bu=0.6)],
    airNeutral=[dict(fu=-1.6, fl=0.4, bu=-1.4, bl=0.4, t=0.3), dict(fu=3.0, fl=0.2, bu=2.6, bl=0.2, t=-0.2, h=-0.4, jaw=0.5)],
    airSide=[dict(ft=0.9, fs=-2.1, t=-0.2, bt=0.4, bs=-1.6), dict(ft=1.65, fs=0, t=-0.45, bt=-0.4, bs=-1.2, fu=-1.0, bu=-1.0, jaw=0.3)],
    airDown=[dict(ft=0.8, fs=-1.9, bt=0.6, bs=-1.9, t=0.3), dict(ft=0.1, fs=0, bt=-0.1, bs=0, y=6, t=0.1, fu=2.4, bu=2.4)],
    nHeavy=[dict(y=13, t=0.5, fu=-0.6, fl=1.7, bu=-0.6, bl=1.7, ft=0.85, fs=-1.5, bt=0.4, bs=-1.4), dict(y=-7, t=-0.2, h=-0.55, fu=3.0, fl=0.1, bu=2.8, bl=0.1, ft=0.1, fs=-0.1, bt=-0.1, bs=-0.1, jaw=0.8)],
    sHeavy=[dict(t=-0.45, fu=-2.3, fl=0.5, bu=-1.9, bl=0.4, ft=0.4, bt=-0.5), dict(t=0.65, fu=1.6, fl=0, bu=1.2, bl=0.2, ft=0.95, fs=-0.2, bt=-0.85, bs=-0.3, jaw=0.8)],
    dHeavy=[dict(y=9, t=0.35, tail=-0.6, fu=0.9, fl=1.4), dict(y=11, t=0.1, tail=2.6, fu=1.6, fl=0, bu=-1.6, bl=0, ft=0.9, fs=-0.6, bt=-0.9, bs=-0.6, jaw=0.6)],
    airSideHeavy=[dict(t=-0.3, ft=1.2, fs=-2.1, bt=1.2, bs=-2.1), dict(t=-0.85, ft=1.7, fs=0, bt=1.5, bs=0, fu=-2.0, bu=-2.0, jaw=0.6)],
    recovery=[dict(y=6, t=0.35, fu=-0.4, fl=1.7), dict(t=-0.1, fu=3.05, fl=0, bu=-0.8, bl=0.5, ft=0.2, fs=-1.2, bt=-0.4, bs=-0.4, h=-0.4, jaw=0.7)],
    groundPound=[dict(t=0.5, ft=1.3, fs=-2.1, bt=1.1, bs=-2.1, fu=2.6, fl=0.8, bu=2.6, bl=0.8), dict(t=0.2, fu=0.1, fl=0, bu=0.1, bl=0, ft=0.2, fs=-0.3, bt=-0.3, bs=-0.3, jaw=0.8)],
)
AIR = {'airNeutral', 'airSide', 'airDown', 'airSideHeavy', 'recovery', 'groundPound'}  # MOVES[m].air in sim/moves.ts

def lerp(a, b, k): return {key: a[key] + (b[key] - a[key]) * k for key in a}
ease = lambda x: 0 if x <= 0 else 1 if x >= 1 else x * x * (3 - 2 * x)

def frame_list():
    fr = []
    for i in range(4): fr.append((f'idle_{i}', lerp(POSES['idle'], POSES['idle2'], (math.sin(2 * math.pi * i / 4) + 1) / 2)))
    for i in range(6):
        c = i / 6
        fr.append((f'run_{i}', lerp(POSES['run1'], POSES['run2'], ease(c * 2 if c < 0.5 else 2 - c * 2))))
    for n in ['squat', 'rise', 'fall', 'tuck', 'hurt', 'guard', 'tumble']: fr.append((n, POSES[n]))
    for m, (w, h) in ATTACK.items():
        rest = POSES['fall'] if m in AIR else POSES['idle']
        fr.append((f'{m}_wind', {**rest, **w}))
        fr.append((f'{m}_strike', {**rest, **w, **h}))
    return fr

# ---------------------------------------------------------------- per-character source-art rig (source px, y down)
CHARS = {
    'lortor': dict(
        top=12, feet=337,
        J=dict(H=(165, 218), N=(165, 125), HT=(160, 40),
               FS=(197, 140), FE=(186, 180), FW=(228, 190), BS=(120, 140), BE=(106, 182), BW=(132, 220),
               FH=(190, 222), FK=(205, 268), FA=(205, 312), BH=(140, 222), BK=(140, 270), BA=(125, 312),
               CS=(120, 120), CM=(80, 200), CB=(45, 290)),
        poly=dict(
            rigid=[(208, 165), (236, 160), (262, 148), (262, 100), (290, 90), (320, 95), (368, 150), (368, 185), (350, 212), (300, 212), (282, 190), (252, 200), (240, 224), (208, 222)],
            fore=[(170, 168), (210, 163), (210, 200), (195, 198), (172, 195)],
            upper=[(186, 116), (214, 116), (220, 165), (210, 168), (176, 168), (182, 150)],
            fleg=[(172, 225), (214, 222), (222, 252), (226, 290), (244, 300), (248, 340), (168, 340), (172, 295), (182, 282), (180, 248)],
            head=[(80, 8), (205, 8), (208, 95), (196, 118), (178, 124), (150, 122), (118, 112), (85, 108), (72, 95)],
            barm=[(92, 112), (148, 108), (150, 150), (130, 158), (128, 200), (148, 205), (150, 240), (118, 242), (95, 215), (88, 160)],
            torso=[(108, 100), (215, 105), (222, 170), (224, 230), (215, 252), (130, 252), (112, 225), (100, 160)],
            bleg=[(95, 222), (170, 222), (168, 292), (160, 340), (88, 340), (96, 292)],
            cape=[(15, 95), (135, 100), (165, 150), (168, 225), (110, 235), (60, 300), (20, 300)]),
    ),
    'torfen': dict(
        top=12, feet=330,
        J=dict(H=(165, 215), N=(165, 118), HT=(160, 30),
               FS=(196, 140), FE=(198, 180), FW=(238, 182), BS=(120, 140), BE=(105, 180), BW=(122, 218),
               FH=(190, 220), FK=(203, 262), FA=(205, 305), BH=(140, 220), BK=(138, 262), BA=(122, 305),
               CS=(120, 125), CM=(75, 200), CB=(35, 270)),
        poly=dict(
            rigid=[(212, 158), (232, 148), (250, 145), (268, 158), (300, 140), (368, 118), (370, 145), (300, 175), (272, 188), (272, 210), (250, 214), (225, 212), (212, 207)],
            fore=[(196, 166), (214, 160), (214, 205), (198, 198)],
            upper=[(184, 110), (210, 110), (216, 160), (200, 170), (182, 150)],
            fleg=[(172, 222), (214, 220), (222, 248), (222, 285), (240, 295), (245, 335), (165, 335), (170, 290), (180, 278), (178, 248)],
            head=[(62, 8), (200, 10), (205, 85), (195, 108), (178, 118), (150, 118), (120, 112), (80, 100)],
            barm=[(92, 110), (146, 108), (148, 148), (128, 160), (124, 200), (142, 205), (142, 236), (104, 236), (88, 200), (86, 160)],
            torso=[(108, 100), (212, 105), (218, 170), (222, 230), (212, 250), (130, 250), (112, 225), (100, 160)],
            bleg=[(92, 222), (168, 222), (165, 290), (158, 335), (85, 335), (92, 290)],
            cape=[(10, 135), (135, 105), (165, 150), (168, 222), (105, 232), (50, 290), (10, 290)]),
    ),
}
C = CHARS[NAME]; J = C['J']; PL = C['poly']
SPPU = (C['feet'] - C['top']) / 100.0  # source px per game unit: char = 100 units tall

# ---------------------------------------------------------------- image io (row 0 = top)
def load(p):
    im = bpy.data.images.load(p); w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1].copy()
    bpy.data.images.remove(im); return a

def save(a, p, name='tmp'):
    h, w = a.shape[:2]; im = bpy.data.images.new(name, w, h, alpha=True)
    im.pixels.foreach_set(np.ascontiguousarray(a[::-1]).ravel().astype(np.float32))
    im.filepath_raw = p; im.file_format = 'PNG'; im.save(); return im

def in_poly(poly, xs, ys):  # even-odd point-in-polygon, vectorised
    inside = np.zeros(xs.shape, bool); n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        cond = (y1 > ys) != (y2 > ys)
        xi = (x2 - x1) * (ys - y1) / ((y2 - y1) or 1e-9) + x1
        inside ^= cond & (xs < xi)
    return inside

def shift(a, dy, dx):
    o = np.zeros_like(a)
    H, W = a.shape[:2]
    o[max(dy, 0):H + min(dy, 0), max(dx, 0):W + min(dx, 0)] = a[max(-dy, 0):H + min(-dy, 0), max(-dx, 0):W + min(-dx, 0)]
    return o

def pushpull(rgb, known):
    """Smooth hole fill: alpha-weighted pyramid down, then fill holes from coarser levels. ponytail: blurry by design, fine for costume fills."""
    w = known.astype(np.float32)
    if min(w.shape) <= 2 or w.all():
        tot = w.sum(); mean = (rgb * w[..., None]).sum((0, 1)) / max(tot, 1e-6)
        return np.where(known[..., None], rgb, mean)
    H, W = w.shape; h2, w2 = (H + 1) // 2, (W + 1) // 2
    pw = np.zeros((h2 * 2, w2 * 2), np.float32); pw[:H, :W] = w
    pc = np.zeros((h2 * 2, w2 * 2, 3), np.float32); pc[:H, :W] = rgb * w[..., None]
    sw = pw.reshape(h2, 2, w2, 2).sum((1, 3)); sc_ = pc.reshape(h2, 2, w2, 2, 3).sum((1, 3))
    coarse = pushpull(sc_ / np.maximum(sw, 1e-6)[..., None], sw > 0)
    up = np.repeat(np.repeat(coarse, 2, 0), 2, 1)[:H, :W]
    return np.where(known[..., None], rgb, up)

def dilate(m, r):
    for _ in range(r): m = m | shift(m, 1, 0) | shift(m, -1, 0) | shift(m, 0, 1) | shift(m, 0, -1)
    return m

# ---------------------------------------------------------------- segmentation into layers
src = load(os.path.join(ROOT, 'assets/creatures/horned-heroes', NAME + '.png'))
Hs, Ws = src.shape[:2]
yy, xx = np.mgrid[0:Hs, 0:Ws].astype(np.float32)
alpha = src[..., 3]; opaque = alpha > 0.02
pm = {k: in_poly(v, xx + 0.5, yy + 0.5) for k, v in PL.items()}
pm['rigid'] = dilate(pm['rigid'], 6)  # catch the art's soft halo so it rides the weapon
pm['farm'] = pm['rigid'] | pm['fore'] | pm['upper']

# bottom -> top draw order. barm sits above torso (its pauldron overlaps the chest in the art).
ORDER = ['cape', 'bleg', 'torso', 'barm', 'head', 'fleg', 'farm']
own = {}; taken = np.zeros_like(opaque)
for k in reversed(ORDER[1:]):
    own[k] = opaque & pm[k] & ~taken; taken |= own[k]
own['cape'] = opaque & ~taken
stray = own['cape'] & (xx > J['H'][0] - 15) & (yy > J['H'][1])  # gap pixels between the legs: pin to hips, not the cape
own['torso'] |= stray; own['cape'] &= ~stray
EXTENT = dict(cape=pm['cape'] | own['cape'], bleg=pm['bleg'], torso=pm['torso'], barm=pm['barm'], head=pm['head'], fleg=pm['fleg'], farm=pm['farm'])

layers = {}
above = np.zeros_like(opaque)
for k in reversed(ORDER):
    hole = EXTENT[k] & opaque & above & ~own[k] if k != 'cape' else (EXTENT[k] & ~own[k]) & dilate(opaque, 2)
    mask = own[k] | hole
    known = own[k] & (alpha > 0.6)
    rgb = pushpull(src[..., :3], known)  # holes + transparent border get smooth bled colour (no filtering fringe)
    for _ in range(8):  # soften pyramid blockiness inside the fill only
        b = sum(shift(rgb, dy, dx) for dy in (-2, 0, 2) for dx in (-2, 0, 2)) / 9.0
        rgb = np.where(known[..., None], rgb, b)
    a = np.where(own[k], alpha, np.where(hole, 1.0, 0.0)).astype(np.float32)
    layers[k] = np.dstack([rgb, a]); above |= own[k]

os.makedirs(SCRATCH, exist_ok=True)
if SEGONLY:
    cols = dict(cape=(.3, .3, .3), bleg=(0, .6, 0), torso=(.9, .6, 0), barm=(0, .6, .9), head=(.9, .9, 0), fleg=(0, 1, .4), farm=(1, 0, .3))
    o = np.ones((Hs, Ws * 2, 4), np.float32); o[..., :3] = 0.85
    for k in ORDER:
        m = own[k]; o[:, :Ws][m, :3] = 0.5 * src[m, :3] + 0.5 * np.array(cols[k])
    # right half: the layer stack with the top layers hidden -> shows inpainting of torso/cape
    for k in ['cape', 'bleg', 'torso']:
        L = layers[k]; a = L[..., 3:4]; o[:, Ws:, :3] = L[..., :3] * a + o[:, Ws:, :3] * (1 - a)
    for k, (x, y) in J.items():
        o[int(y) - 1:int(y) + 2, int(x) - 1:int(x) + 2] = (1, 0, 0, 1)
    o[:, Ws:][own['cape'], :3] = (1, 0, 0)  # cape-owned pixels in red over the stack
    save(np.repeat(np.repeat(o, 2, 0), 2, 1), os.path.join(SCRATCH, NAME + '_seg.png'))
    raise SystemExit

# ---------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
W2 = lambda p: Vector(((p[0] - J['H'][0]) / SPPU, 0.0, (C['feet'] - p[1]) / SPPU))  # source px -> world (game units, z up)

BONES = [  # name, head, tail, parent
    ('root', 'H', None, None), ('torso', 'H', 'N', 'root'), ('head', 'N', 'HT', 'torso'),
    ('fu', 'FS', 'FE', 'torso'), ('fl', 'FE', 'FW', 'fu'), ('bu', 'BS', 'BE', 'torso'), ('bl', 'BE', 'BW', 'bu'),
    ('ft', 'FH', 'FK', 'root'), ('fs', 'FK', 'FA', 'ft'), ('bt', 'BH', 'BK', 'root'), ('bs', 'BK', 'BA', 'bt'),
    ('cape1', 'CS', 'CM', 'torso'), ('cape2', 'CM', 'CB', 'cape1'),
]
arm_data = bpy.data.armatures.new(NAME + '_rig'); arm = bpy.data.objects.new(NAME + '_rig', arm_data)
sc.collection.objects.link(arm); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for n, h, t, par in BONES:
    b = arm_data.edit_bones.new(n); b.head = W2(J[h]); b.tail = W2(J[t]) if t else W2(J[h]) + Vector((0, 0, 8))
    b.roll = 0
    if par: b.parent = arm_data.edit_bones[par]
bpy.ops.object.mode_set(mode='OBJECT')

# --- chain weights: smoothstep across each joint's bisector line
def unit(v): v = np.asarray(v, np.float32); return v / (np.linalg.norm(v) + 1e-9)
def bdir(n):
    _, h, t, _ = next(b for b in BONES if b[0] == n)
    return unit(np.subtract(J[t], J[h])) if t else np.array([0, -1], np.float32)
def sstep(sd, b):
    x = np.clip((sd + b) / (2 * b), 0, 1); return x * x * (3 - 2 * x)
def joint_s(px, py, jname, a, b, width):
    da, db = bdir(a), bdir(b); n = da + db
    n = unit(n) if np.linalg.norm(n) > 0.5 else db
    if a in ('root', 'torso') and b in ('torso', 'head'): n = db
    jx, jy = J[jname]
    return sstep((px - jx) * n[0] + (py - jy) * n[1], width)

CHAINS = {  # layer: [(bone, joint into it, blend width px)]
    'farm': [('torso', None, 0), ('fu', 'FS', 6), ('fl', 'FE', 5)],
    'barm': [('torso', None, 0), ('bu', 'BS', 6), ('bl', 'BE', 5)],
    'fleg': [('root', None, 0), ('ft', 'FH', 6), ('fs', 'FK', 5)],
    'bleg': [('root', None, 0), ('bt', 'BH', 6), ('bs', 'BK', 5)],
    'torso': [('root', None, 0), ('torso', 'H', 10)],
    'head': [('torso', None, 0), ('head', 'N', 5)],
    'cape': [('torso', None, 0), ('cape1', 'CS', 10), ('cape2', 'CM', 14)],
}

def weights(layer, px, py):
    ch = CHAINS[layer]; w = {}; carry = np.ones_like(px)
    for i, (bn, _, _) in enumerate(ch):
        if i + 1 < len(ch):
            nb, nj, wd = ch[i + 1]; s = joint_s(px, py, nj, bn, nb, wd)
            w[bn] = carry * (1 - s); carry = carry * s
        else: w[bn] = carry
    if layer == 'farm':  # fist + weapon ride the forearm rigidly
        r = pm['rigid'][np.clip(py.astype(int), 0, Hs - 1), np.clip(px.astype(int), 0, Ws - 1)]
        for bn in w: w[bn] = np.where(r, 1.0 if bn == 'fl' else 0.0, w[bn])
    return w

def make_layer(k, depth, grid=3):
    L = layers[k]; img_path = os.path.join(SCRATCH, f'{NAME}_{k}.png')
    im = save(L, img_path, f'{NAME}_{k}'); im.pack()
    m = dilate(L[..., 3] > 0.01, 2)
    ys, xs = np.nonzero(m); x0, x1, y0, y1 = xs.min() // grid * grid, xs.max() + grid, ys.min() // grid * grid, ys.max() + grid
    gx = np.arange(x0, x1 + 1, grid); gy = np.arange(y0, y1 + 1, grid)
    idx = {}; verts = []; faces = []
    for j in range(len(gy) - 1):
        for i in range(len(gx) - 1):
            if not m[gy[j]:gy[j + 1], gx[i]:gx[i + 1]].any(): continue
            q = []
            for (ii, jj) in [(i, j + 1), (i + 1, j + 1), (i + 1, j), (i, j)]:  # CCW seen from -Y
                key = (ii, jj)
                if key not in idx: idx[key] = len(verts); verts.append((gx[ii], gy[jj]))
                q.append(idx[key])
            faces.append(q)
    V = np.array(verts, np.float32)
    co = [((x - J['H'][0]) / SPPU, depth, (C['feet'] - y) / SPPU) for x, y in V]
    me = bpy.data.meshes.new(f'{NAME}_{k}'); me.from_pydata(co, [], faces); me.update()
    uv = me.uv_layers.new(name='UV')
    for poly in me.polygons:
        for li in poly.loop_indices:
            x, y = V[me.loops[li].vertex_index]; uv.data[li].uv = (x / Ws, 1 - y / Hs)
    ob = bpy.data.objects.new(f'{NAME}_{k}', me); sc.collection.objects.link(ob)
    for bn, wv in weights(k, V[:, 0], V[:, 1]).items():
        vg = ob.vertex_groups.new(name=bn)
        for vi, wt in enumerate(wv):
            if wt > 1e-4: vg.add([vi], float(wt), 'REPLACE')
    ob.parent = arm; md = ob.modifiers.new('rig', 'ARMATURE'); md.object = arm
    mat = bpy.data.materials.new(f'{NAME}_{k}'); mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = im; tex.interpolation = 'Linear'; tex.extension = 'CLIP'
    em = nt.nodes.new('ShaderNodeEmission'); tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader'); out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(tex.outputs['Color'], em.inputs['Color'])
    nt.links.new(tex.outputs['Alpha'], mix.inputs[0]); nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    me.materials.append(mat)
    return ob

for i, k in enumerate(ORDER): make_layer(k, -0.5 * i)

# --- posing: deltas from POSES.idle, so idle == source art
IDLE = POSES['idle']
def ccw_for(p):  # screen counter-clockwise rotation (radians) of each bone in its parent's frame
    d = {k: p[k] - IDLE[k] for k in p}
    return dict(root=-p['r'], torso=-d['t'], head=-d['h'],
                fu=d['fu'] + d['t'], fl=d['fl'], bu=d['bu'] + d['t'], bl=d['bl'],
                ft=d['ft'], fs=d['fs'], bt=d['bt'], bs=d['bs'],
                cape1=0.5 * d['t'] - 0.5 * d['tail'], cape2=-0.3 * d['tail']), d['y']

def apply_pose(p):
    rots, dy = ccw_for(p)
    for pb in arm.pose.bones:
        R = pb.bone.matrix_local.to_3x3().inverted()
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion(R @ Vector((0, 1, 0)), -rots[pb.name])  # viewed from -Y, +rotY is clockwise
        pb.location = R @ Vector((0, 0, -dy)) if pb.name == 'root' else Vector()
    bpy.context.view_layer.update()

# self-check: forearm +ccw must move the hand toward +x when the forearm hangs down-ish; front thigh + must move knee forward
apply_pose(IDLE); k0 = (arm.matrix_world @ arm.pose.bones['ft'].tail).copy()
apply_pose({**IDLE, 'ft': IDLE['ft'] + 0.5}); k1 = arm.matrix_world @ arm.pose.bones['ft'].tail
assert k1.x > k0.x, 'thigh rotation sign wrong'
apply_pose({**IDLE, 't': IDLE['t'] + 0.5}); n1 = arm.matrix_world @ arm.pose.bones['torso'].tail
assert n1.x > W2(J['N']).x + 1, 'torso lean sign wrong'

FRAMES = frame_list()
for i, (fname, p) in enumerate(FRAMES):
    apply_pose(p)
    for pb in arm.pose.bones:
        pb.keyframe_insert('rotation_quaternion', frame=i + 1); pb.keyframe_insert('location', frame=i + 1)
    sc.timeline_markers.new(fname, frame=i + 1)
sc.frame_start, sc.frame_end = 1, len(FRAMES)

# --- camera + render settings
X0, X1, Z0, Z1 = -115, 165, -35, 185  # canvas in game units (hip x = 0, feet z = 0)
cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = max(X1 - X0, Z1 - Z0)
cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
cam.location = ((X0 + X1) / 2, -100, (Z0 + Z1) / 2); cam.rotation_euler = (math.pi / 2, 0, 0)
r = sc.render; r.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 16; sc.cycles.use_denoising = False
sc.cycles.transparent_max_bounces = 32; sc.cycles.max_bounces = 32; sc.cycles.diffuse_bounces = 0; sc.cycles.glossy_bounces = 0
sc.cycles.filter_width = 1.0
r.resolution_x = int((X1 - X0) * OUT_PX_PER_UNIT); r.resolution_y = int((Z1 - Z0) * OUT_PX_PER_UNIT); r.resolution_percentage = 100
r.film_transparent = True; r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = 0; sc.view_settings.gamma = 1
fdir = os.path.join(SCRATCH, NAME + '_frames'); os.makedirs(fdir, exist_ok=True)
r.filepath = os.path.join(fdir, 'f_')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'games/brawler/sprites', NAME + '.blend'))
bpy.ops.render.render(animation=True)

# ---------------------------------------------------------------- atlas
imgs = [load(os.path.join(fdir, f'f_{i + 1:04d}.png')) for i in range(len(FRAMES))]
union = np.zeros(imgs[0].shape[:2], bool)
for a in imgs: union |= a[..., 3] > 0.01
ys, xs = np.nonzero(union); PAD = 4
cx0, cx1 = max(xs.min() - PAD, 0), min(xs.max() + PAD + 1, union.shape[1])
cy0, cy1 = max(ys.min() - PAD, 0), min(ys.max() + PAD + 1, union.shape[0])
cw, ch = cx1 - cx0, cy1 - cy0
cols = min(len(imgs), 4096 // cw); rows = math.ceil(len(imgs) / cols)
sheet = np.zeros((rows * ch, cols * cw, 4), np.float32)
for i, a in enumerate(imgs):
    rr, cc = divmod(i, cols); sheet[rr * ch:(rr + 1) * ch, cc * cw:(cc + 1) * cw] = a[cy0:cy1, cx0:cx1]
feet_px = ((0 - X0) * OUT_PX_PER_UNIT - cx0, (Z1 - 0) * OUT_PX_PER_UNIT - cy0)
odir = os.path.join(ROOT, 'games/brawler/client/public/chars', NAME); os.makedirs(odir, exist_ok=True)
save(sheet, os.path.join(odir, 'sheet.png'), 'sheet')
meta = {'cell': [int(cw), int(ch)], 'cols': int(cols), 'anchor': [round(float(feet_px[0]), 1), round(float(feet_px[1]), 1)],
        'pxPerUnit': OUT_PX_PER_UNIT, 'frames': {n: i for i, (n, _) in enumerate(FRAMES)}}
with open(os.path.join(odir, 'sheet.json'), 'w') as f: json.dump(meta, f, indent=1)

# contact sheet preview: grey bg, cell borders, red feet anchor
pv = np.ones_like(sheet); pv[..., :3] = 0.8
pv[..., :3] = sheet[..., :3] * sheet[..., 3:4] + pv[..., :3] * (1 - sheet[..., 3:4])
for rr in range(rows):
    for cc in range(cols):
        pv[rr * ch, cc * cw:(cc + 1) * cw, :3] = 0.3; pv[rr * ch:(rr + 1) * ch, cc * cw, :3] = 0.3
        ax, ay = int(cc * cw + feet_px[0]), int(rr * ch + feet_px[1])
        pv[ay - 1:ay + 2, ax - 8:ax + 9, :3] = (1, 0, 0); pv[ay - 8:ay + 9, ax - 1:ax + 2, :3] = (1, 0, 0)
pv[..., 3] = 1
save(pv, os.path.join(SCRATCH, NAME + '_preview.png'), 'pv')
print('SHEET', NAME, meta['cell'], cols, rows, meta['anchor'])
