# Coinflip coin: blender -b -P games/coinflip/art/coin.py [-- --engine cycles|eevee]
# Outputs heads.png, tails.png, spin.png (24x256 strip, 15deg/frame about X) to client/public/coin/.
import bpy, bmesh, math, os, re, sys, time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "client", "public", "coin"))
TMP = os.path.join(OUT, "_frames")
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ENGINE = ARGS[ARGS.index("--engine") + 1] if "--engine" in ARGS else "eevee"
SIZE, FRAMES = 256, 24

R, T = 1.0, 0.1  # radius, half-thickness (diameter:thickness = 10:1)
RELIEF = 0.035

# Old chain-brand "N" mark, 90x90 viewBox, y down. TODO(solana): swap for the new logo + re-render.
LOGO_PATH = ("M72.2 4.6L53.4 32.5c-1.3 1.9 1.2 4.2 3 2.6L74.9 19c.5-.4 1.2-.1 1.2.6v50.3c0 .7-.9 1-1.3.5"
             "l-56-67C17 1.2 14.4 0 11.5 0h-2C4.3 0 0 4.3 0 9.6v70.8C0 85.7 4.3 90 9.6 90c3.3 0 6.4-1.7 8.2-4.6"
             "l18.8-27.9c1.3-1.9-1.2-4.2-3-2.6l-18.5 16c-.5.4-1.2.1-1.2-.6V20.1c0-.7.9-1 1.3-.5l56 67"
             "c1.8 2.2 4.5 3.4 7.3 3.4h2c5.3 0 9.6-4.3 9.6-9.6V9.6c0-5.3-4.3-9.6-9.6-9.6-3.4 0-6.5 1.7-8.3 4.6z")


def parse_path(d, steps=6):
    # ponytail: handles only the commands LOGO_PATH uses (M L l H h V v C c z)
    toks = re.findall(r"[A-Za-z]|-?\d*\.?\d+", d)
    pts, i, cmd, x, y = [], 0, None, 0.0, 0.0
    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]; i += 1
            if cmd in "zZ":
                continue
        n = lambda k: float(toks[i + k])
        rel = cmd.islower()
        c = cmd.upper()
        if c in "ML":
            x, y = (x + n(0), y + n(1)) if rel else (n(0), n(1)); i += 2; pts.append((x, y))
        elif c == "H":
            x = x + n(0) if rel else n(0); i += 1; pts.append((x, y))
        elif c == "V":
            y = y + n(0) if rel else n(0); i += 1; pts.append((x, y))
        elif c == "C":
            v = [n(k) for k in range(6)]; i += 6
            if rel:
                v = [v[k] + (x if k % 2 == 0 else y) for k in range(6)]
            p0, p1, p2, p3 = (x, y), (v[0], v[1]), (v[2], v[3]), (v[4], v[5])
            for s in range(1, steps + 1):
                t = s / steps; u = 1 - t
                pts.append(tuple(u**3 * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t**3 * p3[k] for k in (0, 1)))
            x, y = p3
    out = []
    for p in pts:  # drop near-duplicates (incl. closing point)
        if not out or math.dist(p, out[-1]) > 1e-3:
            out.append(p)
    if math.dist(out[0], out[-1]) < 1e-3:
        out.pop()
    return out


def mesh_obj(name, bm, mat, bevel=0.0):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(mat)
    if bevel:
        m = ob.modifiers.new("bev", "BEVEL"); m.width = bevel; m.segments = 2; m.limit_method = "ANGLE"
    return ob


def prism(bm, poly, z0, z1):
    """Extrude 2D polygon (CCW) from z0 to z1; caps are ngons."""
    lo = [bm.verts.new((x, y, z0)) for x, y in poly]
    hi = [bm.verts.new((x, y, z1)) for x, y in poly]
    bm.faces.new(hi); bm.faces.new(lo[::-1])
    n = len(poly)
    for k in range(n):
        j = (k + 1) % n
        bm.faces.new((lo[k], lo[j], hi[j], hi[k]))


def ring(bm, r0, r1, z0, z1, n=128):
    c = lambda r, z: [bm.verts.new((r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n), z)) for k in range(n)]
    ot, it, ob, ib = c(r1, z1), c(r0, z1), c(r1, z0), c(r0, z0)
    for k in range(n):
        j = (k + 1) % n
        bm.faces.new((it[k], it[j], ot[j], ot[k]))  # top
        bm.faces.new((ob[k], ob[j], ib[j], ib[k]))  # bottom
        bm.faces.new((ob[k], ot[k], ot[j], ob[j]))  # outer
        bm.faces.new((ib[k], ib[j], it[j], it[k]))  # inner


def ccw(poly):
    a = sum(poly[k][0] * poly[(k + 1) % len(poly)][1] - poly[(k + 1) % len(poly)][0] * poly[k][1] for k in range(len(poly)))
    return poly if a > 0 else poly[::-1]


def rot(poly, a):
    s, c = math.sin(a), math.cos(a)
    return [(x * c - y * s, x * s + y * c) for x, y in poly]


def make_mat(name, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (1.0, 0.70, 0.28, 1)
    b.inputs["Metallic"].default_value = 1.0
    b.inputs["Roughness"].default_value = rough
    return m


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    field = make_mat("field", 0.5)   # frosted field
    polish = make_mat("polish", 0.12)  # polished rim + relief
    parts = []

    # body with reeded edge: 360 verts, radius alternates in pairs -> 90 ridges
    bm = bmesh.new()
    n = 360
    edge = [((R if (k // 2) % 2 == 0 else R * 0.985) * math.cos(2 * math.pi * k / n),
             (R if (k // 2) % 2 == 0 else R * 0.985) * math.sin(2 * math.pi * k / n)) for k in range(n)]
    prism(bm, edge, -T, T)
    parts.append(mesh_obj("body", bm, field))

    for sgn in (1, -1):  # rims + inner rings, both faces
        z0, z1 = sgn * T, sgn * (T + RELIEF * 1.3)
        bm = bmesh.new(); ring(bm, 0.86, 0.975, min(z0, z1), max(z0, z1))
        parts.append(mesh_obj("rim", bm, polish, 0.01))
        z1 = sgn * (T + RELIEF * 0.8)
        bm = bmesh.new(); ring(bm, 0.74, 0.77, min(z0, z1), max(z0, z1))
        parts.append(mesh_obj("inner", bm, polish, 0.006))

    # HEADS (+Z): N logo, 90 units -> 0.92 wide, centred, y flipped (SVG y-down)
    s = 0.92 / 90
    logo = ccw([((x - 45) * s, (45 - y) * s) for x, y in parse_path(LOGO_PATH)])
    bm = bmesh.new(); prism(bm, logo, T - 0.005, T + RELIEF)
    parts.append(mesh_obj("logo", bm, polish, 0.014))

    # TAILS (-Z): 8-point star + ring of 32 radial bars + dot ring
    z0, z1 = -T - RELIEF, -T + 0.005
    star = []
    for k in range(16):
        r = 0.42 if k % 2 == 0 else 0.17
        a = math.pi / 2 + k * math.pi / 8
        star.append((r * math.cos(a), r * math.sin(a)))
    bm = bmesh.new(); prism(bm, ccw(star), z0, z1)
    for k in range(32):
        a = k * 2 * math.pi / 32
        L = 0.11 if k % 2 == 0 else 0.07
        bar = [(0.54, -0.012), (0.54 + L, -0.012), (0.54 + L, 0.012), (0.54, 0.012)]
        prism(bm, ccw(rot(bar, a)), z0, z1)
    ring(bm, 0.47, 0.495, z0, z1, 96)
    ring(bm, 0.07, 0.1, z0 - 0.004, z0 + RELIEF, 48)  # tiny center boss... sits on star
    parts.append(mesh_obj("tails", bm, polish, 0.008))

    coin = bpy.data.objects.new("coin", None)
    bpy.context.collection.objects.link(coin)
    for p in parts:
        p.parent = coin
    return coin


def scene_setup():
    sc = bpy.context.scene
    sc.render.resolution_x = sc.render.resolution_y = SIZE
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.compression = 100
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    if ENGINE == "cycles":
        sc.render.engine = "CYCLES"
        sc.cycles.device = "CPU"
        sc.cycles.use_denoising = True
    else:
        sc.render.engine = "BLENDER_EEVEE"

    # world: vertical gradient so metal has something to reflect
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
    nt = w.node_tree; nd = nt.nodes
    tc = nd.new("ShaderNodeTexCoord"); sep = nd.new("ShaderNodeSeparateXYZ")
    ramp = nd.new("ShaderNodeValToRGB"); bg = nd["Background"]
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    ramp.color_ramp.elements[0].position = 0.35; ramp.color_ramp.elements[0].color = (0.14, 0.13, 0.12, 1)
    ramp.color_ramp.elements[1].position = 0.75; ramp.color_ramp.elements[1].color = (0.42, 0.41, 0.4, 1)
    bg.inputs["Strength"].default_value = 0.9

    def area(name, loc, power, size):
        ld = bpy.data.lights.new(name, "AREA"); ld.energy = power; ld.size = size
        ob = bpy.data.objects.new(name, ld); sc.collection.objects.link(ob)
        ob.location = loc
        ob.rotation_euler = (0, 0, 0)
        d = -ob.location.normalized()
        ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    area("key", (-3, 3, 4), 600, 2)
    area("fill", (4, -2, 3), 150, 3)
    area("rimlight", (0, 4, -2), 200, 3)

    cam = bpy.data.cameras.new("cam"); cam.lens = 85
    co = bpy.data.objects.new("cam", cam); sc.collection.objects.link(co); sc.camera = co
    # slight tilt: camera a bit below, looking up at coin
    co.location = (0, -0.5, 5.6)
    co.rotation_euler = (-co.location).normalized().to_track_quat("-Z", "Y").to_euler()
    cam.sensor_width = 36
    return sc


def render(sc, path, samples):
    if ENGINE == "cycles":
        sc.cycles.samples = samples
    else:
        sc.eevee.taa_render_samples = samples
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    t0 = time.time()
    os.makedirs(TMP, exist_ok=True)
    coin = build()
    sc = scene_setup()
    for name, ang in (("heads", 0), ("tails", 180)):
        coin.rotation_euler = (math.radians(ang), 0, 0)
        render(sc, os.path.join(OUT, name + ".png"), 256 if ENGINE == "cycles" else 64)
    strip = np.zeros((SIZE, SIZE * FRAMES, 4), np.float32)
    for f in range(FRAMES):
        coin.rotation_euler = (math.radians(15 * f), 0, 0)
        p = os.path.join(TMP, f"{f:02d}.png")
        render(sc, p, 48 if ENGINE == "cycles" else 32)
        img = bpy.data.images.load(p)
        px = np.empty(SIZE * SIZE * 4, np.float32); img.pixels.foreach_get(px)
        strip[:, f * SIZE:(f + 1) * SIZE] = px.reshape(SIZE, SIZE, 4)
        bpy.data.images.remove(img)
    out = bpy.data.images.new("spin", SIZE * FRAMES, SIZE, alpha=True)
    out.pixels.foreach_set(strip.ravel())
    out.filepath_raw = os.path.join(OUT, "spin.png"); out.file_format = "PNG"
    sc.render.image_settings.compression = 100
    out.save()
    for f in os.listdir(TMP):
        os.remove(os.path.join(TMP, f))
    os.rmdir(TMP)
    print(f"COIN DONE engine={ENGINE} {time.time() - t0:.1f}s")


main()
