# Parses the SVG path subset used by client/src/lib/render/parts.ts into polygons Godot can draw.
# Supports M L C Q A Z (absolute) and a (relative arc). Result is cached per string:
#   [{ "pts": PackedVector2Array, "closed": bool, "ok": bool (triangulates) }]
# ponytail: arcs ignore x-axis-rotation (always 0 in our parts); add it if a rotated ellipse ever shows up.
class_name SvgPath
extends RefCounted

const CURVE_STEPS := 10
static var _cache := {}
static var _re: RegEx

static func parse(d: String) -> Array:
	if _cache.has(d):
		return _cache[d]
	if _re == null:
		_re = RegEx.new()
		_re.compile("[MLCQAZmlcqaz]|[-+]?(?:\\d*\\.\\d+|\\d+\\.?)(?:[eE][-+]?\\d+)?")
	var toks: Array[String] = []
	for m in _re.search_all(d):
		toks.append(m.get_string())
	var out := []
	var cur: Array = []
	var p := Vector2.ZERO
	var start := Vector2.ZERO
	var cmd := ""
	var i := 0
	while i < toks.size():
		var tok: String = toks[i]
		if tok.length() == 1 and "MLCQAZmlcqaz".contains(tok):
			cmd = tok
			i += 1
			if cmd == "Z" or cmd == "z":
				_flush(out, cur, true)
				cur = []
				p = start
			continue
		var n := func(k: int) -> float: return float(toks[i + k])
		match cmd:
			"M":
				_flush(out, cur, false)
				p = Vector2(n.call(0), n.call(1))
				start = p
				cur = [p]
				i += 2
				cmd = "L" # extra pairs after M are lines
			"L":
				p = Vector2(n.call(0), n.call(1))
				cur.append(p)
				i += 2
			"C":
				var c1 := Vector2(n.call(0), n.call(1))
				var c2 := Vector2(n.call(2), n.call(3))
				var e := Vector2(n.call(4), n.call(5))
				for k in range(1, CURVE_STEPS + 1):
					var t := float(k) / CURVE_STEPS
					var u := 1.0 - t
					cur.append(u * u * u * p + 3.0 * u * u * t * c1 + 3.0 * u * t * t * c2 + t * t * t * e)
				p = e
				i += 6
			"Q":
				var c := Vector2(n.call(0), n.call(1))
				var e := Vector2(n.call(2), n.call(3))
				for k in range(1, CURVE_STEPS + 1):
					var t := float(k) / CURVE_STEPS
					var u := 1.0 - t
					cur.append(u * u * p + 2.0 * u * t * c + t * t * e)
				p = e
				i += 4
			"A", "a":
				var e := Vector2(n.call(5), n.call(6))
				if cmd == "a":
					e += p
				_arc(cur, p, e, n.call(0), n.call(1), n.call(3) != 0.0, n.call(4) != 0.0)
				p = e
				i += 7
			_:
				i += 1
	_flush(out, cur, false)
	_cache[d] = out
	return out

static func _flush(out: Array, cur: Array, closed: bool) -> void:
	var pts := PackedVector2Array()
	for v in cur:
		if pts.is_empty() or pts[pts.size() - 1].distance_to(v) > 0.01:
			pts.append(v)
	if closed and pts.size() > 2 and pts[0].distance_to(pts[pts.size() - 1]) < 0.2:
		pts.remove_at(pts.size() - 1)
	if pts.size() < 2:
		return
	var ok := closed and pts.size() > 2 and not Geometry2D.triangulate_polygon(pts).is_empty()
	out.append({"pts": pts, "closed": closed, "ok": ok})

# SVG endpoint arc -> points (spec F.6.5, rotation 0).
static func _arc(cur: Array, p1: Vector2, p2: Vector2, rx: float, ry: float, large: bool, sweep: bool) -> void:
	rx = absf(rx)
	ry = absf(ry)
	var h := (p1 - p2) / 2.0
	var lam := h.x * h.x / (rx * rx) + h.y * h.y / (ry * ry)
	if lam > 1.0:
		rx *= sqrt(lam)
		ry *= sqrt(lam)
	var num := rx * rx * ry * ry - rx * rx * h.y * h.y - ry * ry * h.x * h.x
	var den := rx * rx * h.y * h.y + ry * ry * h.x * h.x
	var co := sqrt(maxf(0.0, num / den)) * (-1.0 if large == sweep else 1.0)
	var cp := Vector2(co * rx * h.y / ry, -co * ry * h.x / rx)
	var c := cp + (p1 + p2) / 2.0
	var a1 := atan2((h.y - cp.y) / ry, (h.x - cp.x) / rx)
	var a2 := atan2((-h.y - cp.y) / ry, (-h.x - cp.x) / rx)
	var da := a2 - a1
	if sweep and da < 0.0:
		da += TAU
	elif not sweep and da > 0.0:
		da -= TAU
	var steps := maxi(6, int(absf(da) / TAU * 32.0))
	for k in range(1, steps + 1):
		var a := a1 + da * k / steps
		cur.append(c + Vector2(cos(a) * rx, sin(a) * ry))
