# Port of client/src/lib/render/rig.ts: keyframed poses on a bone rig + cel-shaded vector parts (gen-1 monster-folk).
# Parts are the SVG path strings from parts.ts (via data.json), parsed by SvgPath. Render-only: never touches sim state.
class_name Rig
extends RefCounted

const INK := Color("#1b1426")
const SHADE := Color(20 / 255.0, 8 / 255.0, 40 / 255.0, 0.32)
const LIGHT := Color(1, 1, 1, 0.36)
const DIM := Color(20 / 255.0, 8 / 255.0, 40 / 255.0, 0.28)
const METAL := Color("#cfd6e6")
const LEATHER := Color("#6b4530")
const BOOT := Color("#3a2c40")
const MOUTH_COL := Color("#5a1830")
const EDGE := Color(1, 1, 1, 0.7)

static func P(p: Dictionary) -> Dictionary:
	var d := {"y": 0.0, "t": 0.08, "h": -0.05, "r": 0.0, "fu": 0.4, "fl": 1.4, "bu": -0.1, "bl": 1.2, "ft": 0.25, "fs": -0.3, "bt": -0.2, "bs": -0.2, "tail": 0.3, "jaw": 0.0, "blink": 0.0}
	d.merge(p, true)
	return d

static var POSES := {
	"idle": P({}),
	"idle2": P({"y": 2, "t": 0.13, "h": 0, "fu": 0.48, "fl": 1.55, "bl": 1.35, "tail": 0.45}),
	"run1": P({"y": -2, "t": 0.32, "fu": -0.6, "fl": 1.2, "bu": 0.8, "bl": 1.0, "ft": 0.95, "fs": -0.4, "bt": -0.6, "bs": -1.3, "tail": 0.1}),
	"run2": P({"y": 3, "t": 0.3, "fu": 0.8, "fl": 1.0, "bu": -0.6, "bl": 1.2, "ft": -0.6, "fs": -1.3, "bt": 0.95, "bs": -0.4, "tail": 0.25}),
	"squat": P({"y": 11, "t": 0.42, "h": 0.1, "fu": -0.3, "fl": 0.8, "bu": -0.5, "bl": 0.8, "ft": 0.95, "fs": -1.7, "bt": 0.55, "bs": -1.6}),
	"rise": P({"y": -2, "t": 0.1, "h": -0.15, "fu": 2.2, "fl": 0.3, "bu": -0.8, "bl": 0.6, "ft": 0.75, "fs": -1.4, "bt": -0.2, "bs": -0.6, "tail": -0.2}),
	"fall": P({"t": 0.05, "fu": 1.4, "fl": 0.4, "bu": -1.0, "bl": 0.5, "ft": 0.3, "fs": -0.2, "bt": -0.1, "bs": -0.3, "tail": 0.6}),
	"tuck": P({"y": 6, "t": 0.6, "h": 0.3, "fu": 0.8, "fl": 1.9, "bu": 0.6, "bl": 1.9, "ft": 1.4, "fs": -2.3, "bt": 1.0, "bs": -2.3, "tail": 1.0, "blink": 1}),
	"hurt": P({"t": -0.5, "h": -0.45, "fu": -1.2, "fl": 0.5, "bu": -1.6, "bl": 0.3, "ft": 0.5, "fs": -0.2, "bt": -0.4, "bs": -0.3, "tail": 1.1, "jaw": 0.5, "blink": 1}),
	"tumble": P({"t": -0.9, "h": -0.6, "fu": -2.4, "fl": 0.4, "bu": 2.4, "bl": 0.4, "ft": 1.0, "fs": -0.6, "bt": -0.8, "bs": -0.6, "tail": 1.4, "jaw": 0.6, "blink": 1}),
}

# Per-move [wind-up, strike].
static var ATTACK := {
	"jab1": [{"fu": 0.2, "fl": 1.9, "t": 0.0}, {"fu": 1.55, "fl": 0.05, "t": 0.25, "jaw": 0.3}],
	"jab2": [{"bu": 0.1, "bl": 1.9, "fu": 0.3, "fl": 1.6}, {"bu": 1.55, "bl": 0.05, "fu": 0.2, "fl": 1.5, "t": 0.3, "jaw": 0.3}],
	"jab3": [{"fu": -0.3, "fl": 1.7, "y": 7, "t": 0.3}, {"fu": 2.5, "fl": 0.2, "t": 0.05, "y": -4, "h": -0.3, "jaw": 0.6}],
	"sideLight": [{"fu": -0.9, "fl": 1.2, "t": -0.1}, {"fu": 1.6, "fl": 0.1, "t": 0.5, "ft": 0.85, "fs": -0.3, "bt": -0.75, "bs": -0.4, "jaw": 0.5}],
	"downLight": [{"y": 10, "t": 0.25, "ft": 0.9, "fs": -1.7}, {"y": 13, "t": -0.2, "ft": 1.55, "fs": 0, "bt": -0.2, "bs": -1.6, "fu": -0.6, "bu": 0.6}],
	"airNeutral": [{"fu": -1.6, "fl": 0.4, "bu": -1.4, "bl": 0.4, "t": 0.3}, {"fu": 3.0, "fl": 0.2, "bu": 2.6, "bl": 0.2, "t": -0.2, "h": -0.4, "jaw": 0.5}],
	"airSide": [{"ft": 0.9, "fs": -2.1, "t": -0.2, "bt": 0.4, "bs": -1.6}, {"ft": 1.65, "fs": 0, "t": -0.45, "bt": -0.4, "bs": -1.2, "fu": -1.0, "bu": -1.0, "jaw": 0.3}],
	"airDown": [{"ft": 0.8, "fs": -1.9, "bt": 0.6, "bs": -1.9, "t": 0.3}, {"ft": 0.1, "fs": 0, "bt": -0.1, "bs": 0, "y": 6, "t": 0.1, "fu": 2.4, "bu": 2.4}],
	"nHeavy": [{"y": 13, "t": 0.5, "fu": -0.6, "fl": 1.7, "bu": -0.6, "bl": 1.7, "ft": 0.85, "fs": -1.5, "bt": 0.4, "bs": -1.4}, {"y": -7, "t": -0.2, "h": -0.55, "fu": 3.0, "fl": 0.1, "bu": 2.8, "bl": 0.1, "ft": 0.1, "fs": -0.1, "bt": -0.1, "bs": -0.1, "jaw": 0.8}],
	"sHeavy": [{"t": -0.45, "fu": -2.3, "fl": 0.5, "bu": -1.9, "bl": 0.4, "ft": 0.4, "bt": -0.5}, {"t": 0.65, "fu": 1.6, "fl": 0, "bu": 1.2, "bl": 0.2, "ft": 0.95, "fs": -0.2, "bt": -0.85, "bs": -0.3, "jaw": 0.8}],
	"dHeavy": [{"y": 9, "t": 0.35, "tail": -0.6, "fu": 0.9, "fl": 1.4}, {"y": 11, "t": 0.1, "tail": 2.6, "fu": 1.6, "fl": 0, "bu": -1.6, "bl": 0, "ft": 0.9, "fs": -0.6, "bt": -0.9, "bs": -0.6, "jaw": 0.6}],
	"airSideHeavy": [{"t": -0.3, "ft": 1.2, "fs": -2.1, "bt": 1.2, "bs": -2.1}, {"t": -0.85, "ft": 1.7, "fs": 0, "bt": 1.5, "bs": 0, "fu": -2.0, "bu": -2.0, "jaw": 0.6}],
	"recovery": [{"y": 6, "t": 0.35, "fu": -0.4, "fl": 1.7}, {"t": -0.1, "fu": 3.05, "fl": 0, "bu": -0.8, "bl": 0.5, "ft": 0.2, "fs": -1.2, "bt": -0.4, "bs": -0.4, "h": -0.4, "jaw": 0.7}],
	"groundPound": [{"t": 0.5, "ft": 1.3, "fs": -2.1, "bt": 1.1, "bs": -2.1, "fu": 2.6, "fl": 0.8, "bu": 2.6, "bl": 0.8}, {"t": 0.2, "fu": 0.1, "fl": 0, "bu": 0.1, "bl": 0, "ft": 0.2, "fs": -0.3, "bt": -0.3, "bs": -0.3, "jaw": 0.8}],
}

static func _ease(x: float) -> float:
	return 0.0 if x <= 0.0 else (1.0 if x >= 1.0 else x * x * (3.0 - 2.0 * x))

static func lerp_pose(a: Dictionary, b: Dictionary, k: float) -> Dictionary:
	var o := {}
	for key in a:
		o[key] = a[key] + (b[key] - a[key]) * k
	return o

static func _with(base: Dictionary, over: Dictionary) -> Dictionary:
	var d := base.duplicate()
	d.merge(over, true)
	return d

static func _blink(now: int) -> float:
	return 1.0 if now % 170 < 6 else 0.0

static func idle_pose(now: int) -> Dictionary:
	return _with(lerp_pose(POSES.idle, POSES.idle2, (sin(now / 9.0) + 1.0) / 2.0), {"blink": _blink(now)})

static func pose_for(f: Dictionary, now: int, sim: Sim) -> Dictionary:
	var rest: Dictionary = POSES.idle if f.grounded else POSES.fall
	match f.state:
		"idle":
			return idle_pose(now)
		"run":
			var c: float = (int(f.t) % 24) / 24.0
			return _with(lerp_pose(POSES.run1, POSES.run2, _ease(c * 2.0 if c < 0.5 else 2.0 - c * 2.0)), {"blink": _blink(now)})
		"jumpsquat", "land":
			return POSES.squat
		"air":
			return lerp_pose(POSES.rise, POSES.fall, _ease((f.vy + 8.0) / 16.0))
		"dodge":
			return _with(POSES.tuck, {"r": 0.0 if f.grounded else f.t * 0.45 * f.facing})
		"hitstun":
			if Vector2(f.vx, f.vy).length() > 10.0:
				return _with(POSES.tumble, {"r": -f.t * 0.35})
			return POSES.hurt
		"attack":
			var m: Dictionary = sim.MOVES[f.move]
			var wh: Array = ATTACK[f.move]
			var su := sim.startup(f, m)
			var end := su + int(m.active)
			var wind := _with(rest, wh[0])
			var hit := _with(wind, wh[1])
			if f.t < su:
				return lerp_pose(rest, wind, _ease(float(f.t) / su))
			if f.t < end:
				var p := lerp_pose(wind, hit, minf(1.0, (f.t - su + 1) / 2.0))
				return _with(p, {"r": (f.t - su) * 0.55}) if f.move == "recovery" else p
			return lerp_pose(hit, rest, _ease(float(f.t - end) / m.recovery))
	return rest

static func _down(o: Vector2, a: float, l: float) -> Vector2:
	return o + Vector2(sin(a) * l, cos(a) * l)

static func _circle(c: Vector2, r: float) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for k in 20:
		pts.append(c + Vector2(cos(k * TAU / 20), sin(k * TAU / 20)) * r)
	return pts

# Canvas-style transform stack over a CanvasItem's _draw().
class Painter:
	var ci: CanvasItem
	var base: Transform2D
	var L := Transform2D.IDENTITY
	var light := Transform2D.IDENTITY # fighter space captured before spins: rims stay world-vertical
	var stack: Array[Transform2D] = []
	var alpha := 1.0
	var parts: Dictionary

	func push() -> void: stack.append(L)
	func pop() -> void: L = stack.pop_back()
	func translate(v: Vector2) -> void: L = L.translated_local(v)
	func rotate(a: float) -> void: L = L.rotated_local(a)
	func scale(v: Vector2) -> void: L = L.scaled_local(v)
	func apply() -> void: ci.draw_set_transform_matrix(base * L)
	func col(c: Color) -> Color: return Color(c, c.a * alpha)

	func bone(at: Vector2, a: float, fn: Callable) -> void:
		push(); translate(at); rotate(-a); fn.call(); pop()

	func part(d: String, fill: Color, line := 2.5, dim := false) -> void:
		apply()
		var shift_basis := L.affine_inverse() * light
		for sp in SvgPath.parse(d):
			if not sp.ok:
				continue
			var poly: PackedVector2Array = sp.pts
			ci.draw_colored_polygon(poly, col(fill))
			for rim in [[-3.5, SHADE], [2.5, LIGHT]]:
				var v := shift_basis.basis_xform(Vector2(0, rim[0]))
				for r in Geometry2D.clip_polygons(poly, Transform2D(0, v) * poly):
					if not Geometry2D.triangulate_polygon(r).is_empty(): # a shifted copy of itself never leaves a hole
						ci.draw_colored_polygon(r, col(rim[1]))
			if dim:
				ci.draw_colored_polygon(poly, col(DIM))
			if line > 0.0:
				_outline(poly, true, INK, line)

	func flat(d: String, fill: Color, line := 0.0) -> void:
		apply()
		for sp in SvgPath.parse(d):
			if sp.ok:
				ci.draw_colored_polygon(sp.pts, col(fill))
			if line > 0.0:
				_outline(sp.pts, sp.closed, INK, line)

	func stroke(d: String, c: Color, w: float) -> void:
		apply()
		for sp in SvgPath.parse(d):
			_outline(sp.pts, sp.closed, c, w)

	func _outline(pts: PackedVector2Array, closed: bool, c: Color, w: float) -> void:
		var p := pts
		if closed:
			p = pts.duplicate()
			p.append(pts[0])
		ci.draw_polyline(p, col(c), w, true)

static func _face(g: Painter, look: Dictionary, angry: bool, blink: float, open: bool) -> void:
	var P2: Dictionary = g.parts
	var style: int = look.eyeStyle
	if style == 3:
		g.flat(P2.VISOR, METAL, 2.0)
		g.stroke(P2.VISOR_SLIT, INK if blink > 0.5 else Color(look.horn), 2.2)
	elif blink > 0.5:
		g.stroke("M3-4.5Q7.5-2.5 12-4.5", INK, 2.0)
	else:
		g.flat(P2.EYE, Color.WHITE)
		var eye: PackedVector2Array = SvgPath.parse(P2.EYE)[0].pts
		var c := Vector2(P2.EYE_C[0], P2.EYE_C[1])
		var r: float = P2.EYE_C[2]
		for poly in Geometry2D.intersect_polygons(eye, _circle(c, r)):
			g.ci.draw_colored_polygon(poly, g.col(Color(look.mark)))
		g.ci.draw_colored_polygon(_circle(c + Vector2(0.5, 0), r * 0.55), g.col(Color(look.eye)))
		if style == 2 and not angry: # sleepy lid
			var lid := PackedVector2Array([Vector2(0, -10), Vector2(14, -10), Vector2(14, -5.4), Vector2(0, -5.4)])
			for poly in Geometry2D.intersect_polygons(eye, lid):
				g.ci.draw_colored_polygon(poly, g.col(Color(look.body)))
		g._outline(eye, true, INK, 1.8)
	if style != 3:
		g.flat(P2.BROW_ANGRY if (angry or style == 1) else P2.BROW, INK)
	if open:
		g.flat(P2.MOUTH_OPEN, MOUTH_COL, 1.6)
	else:
		g.stroke(P2.MOUTH, INK, 1.6)

# Draw one fighter. base = canvas transform at the fighter's feet (facing + squash already applied). Faces +x.
static func draw(ci: CanvasItem, base: Transform2D, p: Dictionary, look: Dictionary, parts: Dictionary, flash := false, alpha := 1.0) -> void:
	var g := Painter.new()
	g.ci = ci
	g.base = base
	g.alpha = alpha
	g.parts = parts
	var W := Color.WHITE
	var skin := W if flash else Color(look.body)
	var cloth := Color("#dddddd") if flash else Color(look.dark)
	var armor := W if flash else Color(look.mark)
	var horn_c := W if flash else Color(look.horn)
	var boot := Color("#eeeeee") if flash else BOOT
	var metal := W if flash else METAL
	var leather := Color("#eeeeee") if flash else LEATHER
	var tail_style: int = look.tailStyle
	var LIMB: Dictionary = parts.LIMB

	var hip := Vector2(0, -44 + p.y)
	g.scale(Vector2(look.scale, look.scale))
	g.light = g.L
	if p.r != 0.0:
		g.translate(hip); g.rotate(p.r); g.translate(-hip)
	var up: float = PI - p.t
	var neck := _down(hip, up, 30)
	var shoulder := _down(hip, up, 24)

	var leg := func(u: float, l: float, far: bool) -> void:
		var knee := _down(hip, u, 22)
		var ankle := _down(knee, u + l, 23)
		g.bone(hip, u, func(): g.part(LIMB.thigh, cloth, 2.5, far))
		g.bone(knee, u + l, func():
			g.part(LIMB.shin, boot, 2.5, far)
			g.stroke(parts.BOOT_TOP, metal, 2.0)
			g.part(parts.KNEE, armor, 1.8, far))
		g.push(); g.translate(ankle); g.rotate(clampf(-(u + l) * 0.3, -0.5, 0.5))
		g.part(parts.FOOT, boot, 2.5, far)
		g.pop()

	var arm := func(u: float, l: float, far: bool) -> void:
		var elbow := _down(shoulder, u, 20)
		g.bone(shoulder, u, func(): g.part(LIMB.upper, skin, 2.5, far))
		g.bone(elbow, u + l, func():
			g.part(LIMB.fore, skin, 2.5, far)
			g.part(parts.GAUNTLET, leather, 2.2, far)
			g.stroke(parts.CUFF, metal, 2.5)
			if not far: # weapon in the front fist, under the fingers (cosmetic: hitboxes come from the sim)
				var wp: Dictionary = parts.WEAPON[tail_style]
				g.part(wp.grip, leather, 2.0)
				g.part(wp.head, metal, 2.2)
				g.stroke(parts.BLADE_EDGE[tail_style], EDGE, 1.4)
				if wp.has("guard"):
					g.part(wp.guard, horn_c, 2.0)
			g.part(parts.FIST, skin, 2.2, far)
			g.stroke(parts.KNUCKLES, Color(INK, 0.4), 1.2))
		if not far:
			g.bone(shoulder, u, func(): g.part(parts.PAULDRON, armor, 2.5))

	var ta: float = -(1.0 + p.tail * 0.5)
	var ta2 := ta - 0.7
	g.bone(hip, ta, func(): g.part(LIMB.tail1, skin, 2.2, true))
	g.bone(_down(hip, ta, 18), ta2, func():
		g.part(parts.TAIL_TIP[tail_style], armor, 2.0)
		g.part(LIMB.tail2, skin, 2.0, true))

	leg.call(p.bt, p.bs, true)
	arm.call(p.bu, p.bl, true)

	g.push(); g.translate((hip + neck) / 2.0); g.rotate(p.t)
	g.part(parts.TORSO, cloth)
	g.part(parts.PLATE, armor, 2.2)
	var trim: String = parts.TRIM[look.pattern]
	if trim != "":
		g.flat(trim, horn_c, 1.2)
	g.part(parts.TASSET, cloth, 2.2)
	g.part(parts.BELT, leather, 2.0)
	g.part(parts.BUCKLE, metal, 1.6)
	g.pop()

	var ha: float = p.t + p.h
	g.bone(_down(neck, up, -4), PI - ha, func(): g.part(LIMB.neck, skin, 2.2))
	var head := _down(neck, PI - ha, 14)
	var horn: Dictionary = parts.HORNS[look.hornStyle]
	g.push(); g.translate(head); g.rotate(ha)
	if horn.has("far"):
		g.part(horn.far, horn_c, 2.2, true)
	g.part(parts.HEAD, skin)
	g.part(parts.HAIR, armor, 2.2)
	g.part(parts.EAR, skin, 2.0)
	if horn.has("near"):
		g.part(horn.near, horn_c, 2.2)
	if horn.has("curl"):
		g.stroke(horn.curl, INK, 9.0)
		g.stroke(horn.curl, horn_c, 5.0)
	_face(g, look if not flash else _with(look, {"body": "#ffffff", "mark": "#eeeeee", "horn": "#ffffff", "eye": "#ffffff"}), p.jaw > 0.4, p.blink, p.jaw > 0.2)
	g.pop()

	leg.call(p.ft, p.fs, false)
	arm.call(p.fu, p.fl, false)
	ci.draw_set_transform_matrix(Transform2D.IDENTITY)
