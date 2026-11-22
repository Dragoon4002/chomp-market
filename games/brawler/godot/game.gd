# Port of client/src/lib/render/draw.ts + session loop. Sim = sim.gd, art = rig.gd (original gen-1 monster-folk).
# Wallet goes through the Near autoload (near_bridge.gd) -> parent page /godot -> user's wallet.
extends Node2D

const W := 1280.0
const H := 720.0
const INK := Color("#1b1426")

# P1: WASD + Space/Z/X/C, Q block. P2: arrows + Numpad 0/1/2/3 (or Shift , . /). Gamepads: A jump, X light, B heavy, bumpers dodge.
const KEYS := [
	{KEY_A: Sim.LEFT, KEY_D: Sim.RIGHT, KEY_W: Sim.UP, KEY_S: Sim.DOWN, KEY_SPACE: Sim.JUMP, KEY_Z: Sim.LIGHT, KEY_X: Sim.HEAVY, KEY_C: Sim.DODGE, KEY_Q: Sim.BLOCK},
	{KEY_LEFT: Sim.LEFT, KEY_RIGHT: Sim.RIGHT, KEY_UP: Sim.UP, KEY_DOWN: Sim.DOWN, KEY_KP_0: Sim.JUMP, KEY_KP_1: Sim.LIGHT, KEY_KP_2: Sim.HEAVY, KEY_KP_3: Sim.DODGE,
		KEY_SHIFT: Sim.JUMP, KEY_COMMA: Sim.LIGHT, KEY_PERIOD: Sim.HEAVY, KEY_SLASH: Sim.DODGE},
]

# Original stage palettes: [sky top, sky bottom, ground, ground top, ledge, accent]
const PALETTE := {
	"ember": [Color("#2a1630"), Color("#c2563a"), Color("#4a3540"), Color("#8a5a4a"), Color("#6b4a3a"), Color("#ffb347")],
	"grove": [Color("#10283a"), Color("#4f8f6a"), Color("#3b3328"), Color("#5fae4f"), Color("#7a5a3a"), Color("#c8f07a")],
	"docks": [Color("#0b1030"), Color("#2b4a7a"), Color("#4a3a30"), Color("#8a6a4a"), Color("#6a5040"), Color("#9ad8ff")],
}

var data: Dictionary
var parts: Dictionary
var sim: Sim
var state = null # sim state while fighting, null in menu
var picks := [0, 1]
var stage_id := "ember"
var frame := 0
var cam := Vector2(800, 450)
var cam_z := 0.8
var shake := 0.0
var fx := []
var squash := [0.0, 0.0]
var hp_shown := [200.0, 200.0]
var match_id := -1
var demo := false
var demo_in := [0, 0]

var menu: Control
var status: Label
var account_lbl: Label
var btn_cancel: Button

func _ready() -> void:
	Engine.physics_ticks_per_second = 60
	data = JSON.parse_string(FileAccess.get_file_as_string("res://data.json"))
	parts = data.parts
	sim = Sim.new(data.moves, data.stages)
	_build_menu()
	Near.account_changed.connect(func(a): account_lbl.text = "Wallet: %s" % (a if a else "not connected"))
	if "--demo" in OS.get_cmdline_user_args(): # attract mode: both fighters mash random inputs (also used for headless smoke tests)
		demo = true
		_start()

func _physics_process(_dt: float) -> void:
	frame += 1
	if state != null:
		if Input.is_key_pressed(KEY_ESCAPE):
			_to_menu()
		elif state.winner >= 0:
			if Input.is_key_pressed(KEY_ENTER) or (demo and frame % 120 == 0):
				_start()
		else:
			if demo and frame % 8 == 0:
				demo_in = [randi() & 0xFF, randi() & 0xFF]
			sim.step(state, demo_in if demo else [_input_for(0), _input_for(1)])
			_on_events(state.events)
	queue_redraw()

func _input_for(i: int) -> int:
	var b := 0
	for k in KEYS[i]:
		if Input.is_physical_key_pressed(k):
			b |= KEYS[i][k]
	var pads := Input.get_connected_joypads()
	if i < pads.size():
		var d: int = pads[i]
		var ax := Input.get_joy_axis(d, JOY_AXIS_LEFT_X)
		var ay := Input.get_joy_axis(d, JOY_AXIS_LEFT_Y)
		if ax < -0.4 or Input.is_joy_button_pressed(d, JOY_BUTTON_DPAD_LEFT): b |= Sim.LEFT
		if ax > 0.4 or Input.is_joy_button_pressed(d, JOY_BUTTON_DPAD_RIGHT): b |= Sim.RIGHT
		if ay < -0.5 or Input.is_joy_button_pressed(d, JOY_BUTTON_DPAD_UP): b |= Sim.UP
		if ay > 0.5 or Input.is_joy_button_pressed(d, JOY_BUTTON_DPAD_DOWN): b |= Sim.DOWN
		if Input.is_joy_button_pressed(d, JOY_BUTTON_A): b |= Sim.JUMP
		if Input.is_joy_button_pressed(d, JOY_BUTTON_X): b |= Sim.LIGHT
		if Input.is_joy_button_pressed(d, JOY_BUTTON_B): b |= Sim.HEAVY
		if Input.is_joy_button_pressed(d, JOY_BUTTON_LEFT_SHOULDER) or Input.is_joy_button_pressed(d, JOY_BUTTON_RIGHT_SHOULDER): b |= Sim.DODGE
	return b

func _start() -> void:
	var r: Array = data.roster
	state = sim.new_game([r[picks[0]].stats, r[picks[1]].stats], stage_id)
	fx.clear()
	hp_shown = [200.0, 200.0]
	menu.visible = false

func _to_menu() -> void:
	state = null
	menu.visible = true

func _burst(p: Vector2, n: int, speed: float, c: Color, kind: String, size := 4.0, life := 22) -> void:
	for i in n:
		var a := randf() * TAU
		var v := speed * (0.4 + randf() * 0.6)
		fx.append({"p": p, "v": Vector2(cos(a), sin(a)) * v, "life": life, "max": life, "size": size * (0.6 + randf() * 0.8), "c": c, "kind": kind})

func _on_events(events: Array) -> void:
	for e in events:
		var p := Vector2(e.x, e.y)
		match e.kind:
			"hit":
				var big: bool = e.power > 14
				_burst(p, 22 if big else 10, 16.0 if big else 10.0, Color("#ffe36b") if big else Color.WHITE, "spark", 5.0 if big else 3.5)
				fx.append({"p": p, "v": Vector2.ZERO, "life": 12, "max": 12, "size": 90.0 if big else 50.0, "c": Color.WHITE, "kind": "ring"})
				shake = maxf(shake, minf(22.0, e.power * 0.7))
			"ko":
				var bz: Dictionary = sim.ST.blast
				var q := Vector2(clampf(e.x, bz.x0 + 120, bz.x1 - 120), clampf(e.y, bz.y0 + 120, bz.y1 - 120))
				var c := Color(data.roster[picks[e.who]].look.body)
				fx.append({"p": q, "v": Vector2.ZERO, "life": 40, "max": 40, "size": 1.0, "c": c, "kind": "beam"})
				_burst(q, 40, 26.0, c, "spark", 7.0, 34)
				shake = 30.0
			"land":
				squash[e.who] = minf(0.3, e.power / 45.0)
				_burst(p, 6, 3.0, Color(0.86, 0.82, 0.75, 0.8), "dust", 6.0, 18)
			"jump":
				_burst(p, 5, 2.5, Color(0.86, 0.82, 0.75, 0.8), "dust", 5.0, 14)

func _update_camera(fs: Array) -> void:
	var b: Dictionary = data.stages[stage_id].cam
	var x0: float = b.x0
	var x1: float = b.x1
	var y0: float = b.y0
	var y1: float = b.y1
	for f in fs:
		if f.state == "dead":
			continue
		x0 = minf(x0, f.x); x1 = maxf(x1, f.x)
		y0 = minf(y0, f.y - 45); y1 = maxf(y1, f.y - 45)
	var z := clampf(minf(W / (x1 - x0 + 520), H / (y1 - y0 + 380)), 0.42, 1.0)
	cam += (Vector2((x0 + x1) / 2, (y0 + y1) / 2) - cam) * 0.1
	cam_z += (z - cam_z) * 0.08

func _draw() -> void:
	var st: Dictionary = data.stages[stage_id]
	var pal: Array = PALETTE[stage_id]
	var fs: Array = state.fighters if state != null else _menu_fighters(st)
	_update_camera(fs)

	draw_set_transform_matrix(Transform2D.IDENTITY)
	draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(W, 0), Vector2(W, H), Vector2(0, H)]), PackedColorArray([pal[0], pal[0], pal[1], pal[1]]))
	for k in 24:
		var x := fmod(k * 173.0 + frame * (0.2 + k % 3 * 0.1), W)
		draw_circle(Vector2(x, fmod(k * 97.0, H * 0.7)), 1.5 + k % 3, Color(pal[5], 0.25))

	var sx := (randf() - 0.5) * shake
	var sy := (randf() - 0.5) * shake
	shake *= 0.85
	var world := Transform2D(0.0, Vector2(cam_z, cam_z), 0.0, Vector2(W / 2 + sx, H / 2 + sy)) * Transform2D(0.0, -cam)
	draw_set_transform_matrix(world)

	for s in st.solids:
		var r := Rect2(s.x0, s.y, s.x1 - s.x0, s.y1 - s.y)
		draw_rect(Rect2(r.position + Vector2(0, 14), r.size + Vector2(0, 60)), pal[2].darkened(0.35))
		draw_rect(r, pal[2])
		draw_rect(Rect2(r.position, Vector2(r.size.x, 14)), pal[3])
		draw_rect(r, INK, false, 4.0)
	for s in st.soft:
		var r := Rect2(s.x0, s.y, s.x1 - s.x0, 12)
		draw_rect(r, pal[4])
		draw_rect(r, INK, false, 3.0)

	var r: Array = data.roster
	for i in fs.size():
		var f: Dictionary = fs[i]
		if f.state == "dead":
			continue
		squash[i] *= 0.82
		var pose := Rig.pose_for(f, frame, sim) if state != null else Rig.idle_pose(frame + i * 40)
		var alpha := 1.0
		if f.invuln > 0 and (frame / 4) % 2:
			alpha = 0.55 if f.state == "dodge" else 0.35
		var base := world * Transform2D(0.0, Vector2(f.facing * (1 + squash[i]), 1 - squash[i]), 0.0, Vector2(f.x, f.y))
		Rig.draw(self, base, pose, r[picks[i]].look, parts, f.hitlag > 0 and f.state == "hitstun", alpha)
		draw_set_transform_matrix(world)
		var hb = sim.hitbox_of(f) if state != null else null
		if hb != null:
			var c: Vector2 = hb.get_center()
			var pts := PackedVector2Array()
			var a0 := -1.4 if f.facing == 1 else PI - 0.9
			for k in 13:
				var a := a0 + 2.3 * k / 12.0
				pts.append(c + Vector2(cos(a) * hb.size.x / 2, sin(a) * hb.size.y / 2))
			draw_polyline(pts, Color(1, 1, 1, 0.55), 6.0, true)

	for i in range(fx.size() - 1, -1, -1):
		var p: Dictionary = fx[i]
		p.p += p.v
		p.v *= 0.9
		if p.kind == "dust":
			p.v.y -= 0.1
		var k: float = float(p.life) / p.max
		var c: Color = p.c
		match p.kind:
			"ring": draw_arc(p.p, p.size * (1 - k) + 10, 0, TAU, 32, Color(c, k), 5 * k, true)
			"beam":
				draw_rect(Rect2(p.p.x - 60 * k, -2000, 120 * k, 5000), Color(c, k))
				draw_rect(Rect2(p.p.x - 20 * k, -2000, 40 * k, 5000), Color(1, 1, 1, k))
			"spark": draw_line(p.p, p.p - p.v * 2, Color(c, k), maxf(0.5, p.size * k), true)
			_: draw_circle(p.p, p.size * (1.4 - k), Color(c, c.a * k))
		p.life -= 1
		if p.life <= 0:
			fx.remove_at(i)

	draw_set_transform_matrix(Transform2D.IDENTITY)
	if state != null:
		_hud()

func _menu_fighters(st: Dictionary) -> Array:
	var fs := []
	for i in 2:
		var ground: Dictionary = st.solids[0] if i == 0 else st.solids[-1] # stand at the outer edges, clear of the menu panel
		var x: float = ground.x0 + 70 if i == 0 else ground.x1 - 70
		fs.append({"x": x, "y": float(ground.y), "facing": 1 if i == 0 else -1, "state": "idle", "invuln": 0, "hitlag": 0, "t": 0})
	return fs

func _hud() -> void:
	var font := ThemeDB.fallback_font
	var r: Array = data.roster
	for i in state.fighters.size():
		var f: Dictionary = state.fighters[i]
		var x := 40.0 if i == 0 else W - 280
		var bw := 224.0
		var hp := 0.0 if f.state == "dead" else maxf(0.0, Sim.MAX_HP - f.damage)
		var k := hp / Sim.MAX_HP
		hp_shown[i] = hp if hp > hp_shown[i] else hp_shown[i] + (hp - hp_shown[i]) * 0.06
		var col := Color(r[picks[i]].look.body)
		draw_rect(Rect2(x, 20, 240, 86), Color(0.06, 0.04, 0.12, 0.6))
		draw_rect(Rect2(x, 20, 6, 86), col)
		draw_string(font, Vector2(x + 16, 42), r[picks[i]].name, HORIZONTAL_ALIGNMENT_LEFT, -1, 16)
		for n in f.stocks:
			draw_circle(Vector2(x + 226 - n * 20, 36), 7, col)
		draw_rect(Rect2(x + 10, 52, bw, 22), Color("#2a2140"))
		draw_rect(Rect2(x + 10, 52, bw * hp_shown[i] / Sim.MAX_HP, 22), Color.WHITE)
		draw_rect(Rect2(x + 10, 52, bw * k, 22), Color.from_hsv(k / 3.0, 0.75, 0.85))
		draw_rect(Rect2(x + 10, 52, bw, 22), Color.BLACK, false, 2)
		draw_string(font, Vector2(x + 10, 68), "%d / %d" % [ceili(hp), Sim.MAX_HP], HORIZONTAL_ALIGNMENT_CENTER, bw, 14)
		draw_string(font, Vector2(x + 16, 96), "knockback +%d%%" % f.damage, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(1, 1, 1, 0.75))
	draw_string(font, Vector2(0, H - 12), "Esc: menu   ·   P1 WASD + Space/Z/X/C   ·   P2 arrows + Numpad 0/1/2/3", HORIZONTAL_ALIGNMENT_CENTER, W, 12, Color(1, 1, 1, 0.45))
	if state.winner >= 0:
		draw_rect(Rect2(0, H / 2 - 40, W, 70), Color(0, 0, 0, 0.5))
		draw_string(font, Vector2(0, H / 2 + 8), "%s WINS — Enter: rematch · Esc: menu" % r[picks[state.winner]].name, HORIZONTAL_ALIGNMENT_CENTER, W, 28)

func _build_menu() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	menu = PanelContainer.new()
	menu.position = Vector2(W / 2 - 230, 60)
	menu.custom_minimum_size = Vector2(460, 0)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.11, 0.08, 0.2, 0.92)
	sb.border_color = INK
	sb.set_border_width_all(4)
	sb.set_corner_radius_all(16)
	sb.set_content_margin_all(18)
	menu.add_theme_stylebox_override("panel", sb)
	layer.add_child(menu)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	menu.add_child(v)

	var title := Label.new()
	title.text = "BRAWLER ARENA"
	title.add_theme_font_size_override("font_size", 34)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(title)

	var names: Array = data.roster.map(func(m): return "%s · %s" % [m.name, m.type])
	for i in 2:
		v.add_child(_picker("Player %d (%s)" % [i + 1, "WASD" if i == 0 else "arrows"], names, picks[i], func(k): picks[i] = k))
	var stage_ids: Array = data.stages.keys()
	v.add_child(_picker("Arena", stage_ids.map(func(s): return data.stages[s].name), 0, func(k): stage_id = stage_ids[k]))

	var start := Button.new()
	start.text = "FIGHT"
	start.add_theme_font_size_override("font_size", 24)
	start.pressed.connect(_start)
	v.add_child(start)

	v.add_child(HSeparator.new())
	account_lbl = Label.new()
	account_lbl.text = "Wallet: not connected"
	v.add_child(account_lbl)
	var row := HBoxContainer.new()
	v.add_child(row)
	for b in [["Connect", _on_connect], ["Sign message", _on_sign], ["Create room", _on_create]]:
		var btn := Button.new()
		btn.text = b[0]
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		btn.pressed.connect(b[1])
		btn.disabled = not OS.has_feature("web")
		row.add_child(btn)
	btn_cancel = Button.new()
	btn_cancel.visible = false
	btn_cancel.pressed.connect(_on_cancel)
	v.add_child(btn_cancel)
	status = Label.new()
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.custom_minimum_size = Vector2(420, 0)
	status.text = "Wallet runs in the web page (/godot)." if OS.has_feature("web") else "Wallet buttons work in the web export at /godot."
	v.add_child(status)

func _picker(label: String, items: Array, sel: int, on_pick: Callable) -> Control:
	var h := HBoxContainer.new()
	var l := Label.new()
	l.text = label
	l.custom_minimum_size = Vector2(150, 0)
	h.add_child(l)
	var o := OptionButton.new()
	for it in items:
		o.add_item(it)
	o.select(sel)
	o.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	o.item_selected.connect(on_pick)
	h.add_child(o)
	return h

func _show(label: String, r: Dictionary) -> void:
	status.text = "%s: %s" % [label, JSON.stringify(r.data) if r.ok else "failed — " + str(r.error)]

func _on_connect() -> void:
	status.text = "Connecting…"
	var r := await Near.connect_wallet()
	_show("Connect", r)
	if r.ok and r.data:
		account_lbl.text = "Wallet: %s" % r.data

func _on_sign() -> void:
	status.text = "Check your wallet to sign…"
	_show("Signed", await Near.sign("brawler-arena:godot:%d" % Time.get_unix_time_from_system()))

func _on_create() -> void:
	status.text = "Confirm the transaction in your wallet…"
	var r := await Near.create_match()
	_show("Room", r)
	if r.ok:
		match_id = int(r.data.matchId)
		btn_cancel.text = "Cancel room #%d" % match_id
		btn_cancel.visible = true

func _on_cancel() -> void:
	status.text = "Confirm cancel in your wallet…"
	var r := await Near.cancel_match(match_id)
	_show("Cancel", r)
	if r.ok:
		btn_cancel.visible = false
