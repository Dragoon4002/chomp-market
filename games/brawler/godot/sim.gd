# Port of client/src/lib/sim/sim.ts: deterministic 60 Hz platform-fighter rules, same numbers.
# Moves + stages come from data.json (exported from the TS source by tools/export-data.ts).
# ponytail: not yet verified bit-for-bit against the TS sim. Add a replay-hash parity test before Godot <-> web cross-play.
class_name Sim
extends RefCounted

const LEFT := 1
const RIGHT := 2
const UP := 4
const DOWN := 8
const JUMP := 16
const LIGHT := 32
const HEAVY := 64
const DODGE := 128
const BLOCK := 256
const ACTIONS := JUMP | LIGHT | HEAVY | DODGE

const HURT_W := 50.0
const HURT_H := 90.0
const G := 0.85
const HIT_G := 0.55
const MAX_FALL := 13.0
const FAST_FALL := 19.0
const GROUND_ACC := 1.2
const FRICTION := 0.8
const AIR_ACC := 0.6
const JUMP_V := 16.5
const SHORT_HOP_V := 11.0
const AIR_JUMP_V := 14.5
const JUMPSQUAT := 3
# Blocked hit: damage / 5, knockback x 0.25, horizontal only.
const BLOCK_CHIP := 5
const BLOCK_PUSH := 0.25
const BUFFER := 6
const RESPAWN := 90
const RESPAWN_INVULN := 120
const STOCKS := 3
const MAX_HP := 200

var MOVES: Dictionary
var STAGES: Dictionary
var ST: Dictionary

func _init(moves: Dictionary, stages: Dictionary) -> void:
	MOVES = moves
	STAGES = stages

static func stat_mods(s: Dictionary) -> Dictionary:
	return {
		"dmg": 0.85 + 0.05 * (s["str"] - 3),
		"kbTaken": 1.12 - 0.04 * (s["def"] - 3),
		"startup": floori((5 - s["dex"]) / 2.0),
		"run": 4.5 + 0.35 * s["spd"],
	}

func _new_fighter(i: int, stats: Dictionary) -> Dictionary:
	var sp: Dictionary = ST.spawns[i]
	return {
		"x": float(sp.x), "y": float(sp.y), "vx": 0.0, "vy": 0.0, "facing": 1 if i == 0 else -1,
		"state": "air", "t": 0, "grounded": false,
		"airJumps": 2, "recoveryUsed": false, "airDodged": false, "fastFall": false,
		"move": null, "moveHit": false, "combo": 0, "comboT": 0,
		"damage": 0, "stocks": STOCKS,
		"hitstun": 0, "hitlag": 0, "invuln": 0, "dodgeCd": 0, "landLag": 0, "dropT": 0,
		"prevIn": 0, "buf": 0, "bufT": 0,
		"mod": stat_mods(stats),
	}

func new_game(stats: Array, stage: String) -> Dictionary:
	ST = STAGES[stage]
	var fs := []
	for i in stats.size():
		fs.append(_new_fighter(i, stats[i]))
	return {"frame": 0, "stage": stage, "fighters": fs, "winner": -1, "events": []}

static func _approach(v: float, target: float, stp: float) -> float:
	return minf(v + stp, target) if v < target else maxf(v - stp, target)

static func dir_x(inp: int) -> int:
	return (1 if inp & RIGHT else 0) - (1 if inp & LEFT else 0)

static func _set_state(f: Dictionary, s: String) -> void:
	f.state = s
	f.t = 0

func startup(f: Dictionary, m: Dictionary) -> int:
	return maxi(2, int(m.startup) + int(f.mod.startup))

func _pick_move(f: Dictionary, inp: int, heavy: bool):
	var down := inp & DOWN
	var side := dir_x(inp)
	if f.grounded:
		if heavy:
			return "dHeavy" if down else ("sHeavy" if side else "nHeavy")
		if down:
			return "downLight"
		if side:
			return "sideLight"
		if f.comboT > 0 and f.combo == 1:
			return "jab2"
		if f.comboT > 0 and f.combo == 2:
			return "jab3"
		return "jab1"
	if heavy:
		if down:
			return "groundPound"
		if side:
			return "airSideHeavy"
		return null if f.recoveryUsed else "recovery"
	return "airDown" if down else ("airSide" if side else "airNeutral")

func _start_attack(f: Dictionary, id: String, inp: int) -> void:
	var side := dir_x(inp)
	if side:
		f.facing = side
	if id == "recovery":
		f.recoveryUsed = true
	f.combo = 1 if id == "jab1" else (2 if id == "jab2" else 0)
	f.comboT = 0
	if f.grounded:
		f.vx *= 0.4
	f.move = id
	f.moveHit = false
	f.fastFall = false
	_set_state(f, "attack")

func _start_dodge(f: Dictionary, inp: int) -> void:
	var dx := dir_x(inp)
	if f.grounded:
		f.vx = dx * 9.0
		f.vy = 0.0
		f.invuln = 15
		f.dodgeCd = 50
	else:
		var dy := (1 if inp & DOWN else 0) - (1 if inp & UP else 0)
		var k := 7.07 if (dx and dy) else 10.0
		f.vx = dx * k
		f.vy = dy * k
		f.invuln = 17
		f.dodgeCd = 60
		f.airDodged = true
		f.fastFall = false
	_set_state(f, "dodge")

func _control(f: Dictionary, inp: int, pressed: int, act: int) -> void:
	var dx := dir_x(inp)
	if f.grounded and inp & BLOCK:
		f.vx = _approach(f.vx, 0.0, FRICTION)
		if f.state != "block":
			_set_state(f, "block")
		return
	if act & DODGE and f.dodgeCd <= 0 and (f.grounded or not f.airDodged):
		f.bufT = 0
		_start_dodge(f, inp)
		return
	if act & (LIGHT | HEAVY):
		var id = _pick_move(f, inp, bool(act & HEAVY))
		if id != null:
			f.bufT = 0
			_start_attack(f, id, inp)
			return
	if act & JUMP:
		if f.grounded:
			f.bufT = 0
			_set_state(f, "jumpsquat")
			return
		if f.airJumps > 0:
			f.bufT = 0
			f.airJumps -= 1
			f.vy = -AIR_JUMP_V
			f.fastFall = false
	if f.grounded:
		if pressed & DOWN and _on_soft(f):
			f.dropT = 12
			f.grounded = false
			f.y += 1.0
			_set_state(f, "air")
			return
		if dx:
			f.facing = dx
			f.vx = _approach(f.vx, dx * f.mod.run, GROUND_ACC)
			if f.state != "run":
				_set_state(f, "run")
		else:
			f.vx = _approach(f.vx, 0.0, FRICTION)
			if f.state != "idle":
				_set_state(f, "idle")
	else:
		if f.state != "air":
			_set_state(f, "air")
		f.vx = _approach(f.vx, dx * f.mod.run * 0.9, AIR_ACC if dx else 0.15)
		if pressed & DOWN and f.vy > -2.0:
			f.fastFall = true

func _run_attack(f: Dictionary, inp: int, act: int) -> void:
	var m: Dictionary = MOVES[f.move]
	var su := startup(f, m)
	var end := su + int(m.active)
	if f.t == su:
		if m.has("selfVx"):
			f.vx = f.facing * float(m.selfVx)
		if m.has("selfVy"):
			f.vy = float(m.selfVy)
	if m.get("untilLand", false):
		if f.t < su:
			f.vy = 0.0
		elif f.t <= end:
			if f.grounded:
				f.t = end
			else:
				f.t = su
				f.vy = float(m.selfVy)
	if (f.move == "jab1" or f.move == "jab2") and f.t >= end and act & LIGHT and not dir_x(inp) and not (inp & DOWN) and f.grounded:
		f.bufT = 0
		_start_attack(f, "jab2" if f.move == "jab1" else "jab3", inp)
		return
	if f.grounded:
		f.vx = _approach(f.vx, 0.0, 0.3 if (f.t >= su and f.t < end) else FRICTION)
	else:
		f.vx = _approach(f.vx, dir_x(inp) * f.mod.run * 0.9, AIR_ACC * 0.5)
	if f.t >= end + int(m.recovery):
		if f.move == "jab1" or f.move == "jab2":
			f.comboT = 18
		f.move = null
		_set_state(f, "idle" if f.grounded else "air")

func _on_soft(f: Dictionary) -> bool:
	for p in ST.soft:
		if f.y == p.y and f.x >= p.x0 and f.x <= p.x1:
			return true
	return false

func _physics(f: Dictionary) -> bool:
	var m = MOVES[f.move] if f.move != null else null
	var floaty: bool = f.state == "dodge" and not f.grounded and f.t < 12
	var hover: bool = m != null and m.get("untilLand", false) and f.state == "attack" and f.t < startup(f, m)
	if not floaty and not hover:
		var g := HIT_G if f.state == "hitstun" else G
		var cap := FAST_FALL if f.fastFall else (40.0 if f.state == "hitstun" else MAX_FALL)
		f.vy = minf(f.vy + (g * 2.0 if f.fastFall else g), maxf(cap, f.vy))
	var px: float = f.x
	var py: float = f.y
	var was_grounded: bool = f.grounded
	f.x += f.vx
	f.y += f.vy
	f.grounded = false
	var hw := HURT_W / 2.0
	for mn in ST.solids:
		if not (f.x + hw > mn.x0 and f.x - hw < mn.x1 and f.y > mn.y and f.y - HURT_H < mn.y1):
			continue
		if py <= mn.y:
			f.y = float(mn.y)
			f.vy = 0.0
			f.grounded = true
		elif py - HURT_H >= mn.y1:
			f.y = mn.y1 + HURT_H
			f.vy = 0.0
		else:
			f.x = mn.x0 - hw if px < (mn.x0 + mn.x1) / 2.0 else mn.x1 + hw
			f.vx = 0.0
	if not f.grounded and f.vy >= 0 and f.dropT <= 0 and f.state != "hitstun":
		for p in ST.soft:
			if f.x >= p.x0 and f.x <= p.x1 and py <= p.y and f.y >= p.y:
				f.y = float(p.y)
				f.vy = 0.0
				f.grounded = true
	return not was_grounded and f.grounded

func _update(f: Dictionary, inp: int, pressed: int, s: Dictionary, i: int) -> void:
	f.t += 1
	if f.invuln > 0: f.invuln -= 1
	if f.dodgeCd > 0: f.dodgeCd -= 1
	if f.dropT > 0: f.dropT -= 1
	if f.comboT > 0: f.comboT -= 1
	var act: int = f.buf if f.bufT > 0 else 0
	if f.bufT > 0: f.bufT -= 1

	match f.state:
		"dead":
			if f.stocks > 0 and f.t >= RESPAWN:
				_respawn(f, i)
			return
		"hitstun":
			f.vx *= 0.85 if f.grounded else 0.975
			f.hitstun -= 1
			if f.hitstun <= 0:
				_set_state(f, "idle" if f.grounded else "air")
		"attack":
			_run_attack(f, inp, act)
		"dodge":
			f.vx *= 0.88
			if not f.grounded:
				f.vy *= 0.88
			if f.t >= (22 if f.grounded else 24):
				_set_state(f, "idle" if f.grounded else "air")
		"jumpsquat":
			if f.t >= JUMPSQUAT:
				f.vy = -JUMP_V if inp & JUMP else -SHORT_HOP_V
				f.grounded = false
				_set_state(f, "air")
				s.events.append({"kind": "jump", "who": i, "x": f.x, "y": f.y, "power": 0.0})
		"land":
			f.vx = _approach(f.vx, 0.0, FRICTION)
			if f.t >= f.landLag:
				_set_state(f, "idle")
		_:
			_control(f, inp, pressed, act)

	var landed := _physics(f)
	if landed:
		f.airJumps = 2
		f.recoveryUsed = false
		f.airDodged = false
		f.fastFall = false
		s.events.append({"kind": "land", "who": i, "x": f.x, "y": f.y, "power": f.vy})
		if f.state == "air":
			_set_state(f, "idle")
		elif f.state == "attack" and MOVES[f.move].air and not MOVES[f.move].get("untilLand", false):
			f.move = null
			f.landLag = 6
			_set_state(f, "land")
	elif not f.grounded and (f.state == "idle" or f.state == "run" or f.state == "block"):
		_set_state(f, "air")

func hitbox_of(f: Dictionary):
	if f.state != "attack" or f.move == null:
		return null
	var m: Dictionary = MOVES[f.move]
	var su := startup(f, m)
	if f.t < su or f.t >= su + int(m.active):
		return null
	var hb: Dictionary = m.hb
	var x: float = f.x + hb.x if f.facing == 1 else f.x - hb.x - hb.w
	return Rect2(x, f.y + hb.y, hb.w, hb.h)

func _respawn(f: Dictionary, i: int) -> void:
	var sp: Dictionary = ST.spawns[i]
	f.x = float(sp.x)
	f.y = sp.y - 150.0
	f.vx = 0.0
	f.vy = 0.0
	f.damage = 0
	f.invuln = RESPAWN_INVULN
	f.airJumps = 2
	f.recoveryUsed = false
	f.airDodged = false
	f.move = null
	f.hitlag = 0
	_set_state(f, "air")

func step(s: Dictionary, inputs: Array) -> void:
	ST = STAGES[s.stage]
	s.events.clear()
	s.frame += 1
	if s.winner >= 0:
		return
	var fs: Array = s.fighters

	for i in fs.size():
		var f: Dictionary = fs[i]
		var inp: int = inputs[i]
		var pressed: int = inp & ~int(f.prevIn)
		f.prevIn = inp
		if pressed & ACTIONS:
			f.buf = pressed & ACTIONS
			f.bufT = BUFFER
		if f.hitlag > 0:
			f.hitlag -= 1
			continue
		_update(f, inp, pressed, s, i)

	# Resolve hits simultaneously so trades are symmetric.
	var hits := []
	for i in fs.size():
		var a: Dictionary = fs[i]
		var hb = hitbox_of(a)
		if hb == null or a.moveHit:
			continue
		for j in fs.size():
			var b: Dictionary = fs[j]
			if i == j or b.state == "dead" or b.invuln > 0:
				continue
			if hb.intersects(Rect2(b.x - HURT_W / 2.0, b.y - HURT_H, HURT_W, HURT_H)):
				hits.append([i, j, a.move])
	for h in hits:
		var a: Dictionary = fs[h[0]]
		var b: Dictionary = fs[h[1]]
		var m: Dictionary = MOVES[h[2]]
		var dmg := roundi(m.dmg * a.mod.dmg)
		var sx: int = (1 if b.x >= a.x else -1) if m.get("away", false) else a.facing
		var lag := 3 + floori(dmg / 4.0)
		a.hitlag = lag
		b.hitlag = lag
		a.moveHit = true
		if b.state == "block" and (a.x - b.x) * b.facing >= 0: # only blocks hits from the front
			b.damage += floori(dmg / float(BLOCK_CHIP))
			var bkb: float = (m.base + b.damage * m.growth) * b.mod.kbTaken
			b.vx = sx * bkb * BLOCK_PUSH
			s.events.append({"kind": "hit", "who": h[1], "x": (a.x + b.x) / 2.0, "y": b.y - HURT_H / 2.0, "power": bkb * BLOCK_PUSH})
			continue
		b.damage += dmg
		var kb: float = (m.base + b.damage * m.growth) * b.mod.kbTaken
		b.vx = sx * m.ax * kb
		b.vy = m.ay * kb
		if b.vy > 0 and b.grounded:
			b.vy = -b.vy * 0.6
		b.grounded = false
		b.facing = -sx
		b.move = null
		b.fastFall = false
		b.recoveryUsed = false
		b.hitstun = floori(kb * 0.9) + 8
		_set_state(b, "hitstun")
		s.events.append({"kind": "hit", "who": h[1], "x": (a.x + b.x) / 2.0, "y": b.y - HURT_H / 2.0, "power": kb})

	var bz: Dictionary = ST.blast
	for i in fs.size():
		var f: Dictionary = fs[i]
		var in_bounds: bool = f.x > bz.x0 and f.x < bz.x1 and f.y > bz.y0 and f.y < bz.y1
		if f.state == "dead" or (in_bounds and f.damage < MAX_HP):
			continue
		s.events.append({"kind": "ko", "who": i, "x": f.x, "y": f.y, "power": 0.0})
		f.stocks -= 1
		f.move = null
		f.vx = 0.0
		f.vy = 0.0
		f.hitlag = 0
		_set_state(f, "dead")
	var alive := []
	for i in fs.size():
		if fs[i].stocks > 0:
			alive.append(i)
	if alive.size() <= 1:
		s.winner = alive[0] if alive.size() else 0
