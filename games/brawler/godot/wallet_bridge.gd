# Wallet bridge for the Godot web export hosted at /godot (Godot 4). Host page handler removed with the old chain.
# TODO(solana): parent page answers wallet:* messages via @xyz/platform.
# Add as an Autoload named "Wallet" (Project Settings > Autoload). Web builds only.
#
#   var r = await Wallet.connect_wallet()          # {ok, data: "<account>" | null}
#   var r = await Wallet.sign("hello from godot")  # {ok, data: {account, message, recipient, nonce, publicKey, signature}}
#   var r = await Wallet.create_match()            # {ok, data: {matchId}}  free, non-bettable test room
#   var r = await Wallet.cancel_match(id)          # {ok, data: {matchId, cancelled}}
#   Wallet.account_changed.connect(func(acct): ...)
extends Node

signal account_changed(account)  # String, or null when signed out
signal _result(id, res)

var account = null
var _cb  # keep a reference or the JS callback is collected
var _next := 0

func _ready() -> void:
	if not OS.has_feature("web"):
		push_warning("Wallet bridge: web export only")
		return
	_cb = JavaScriptBridge.create_callback(_on_message)
	JavaScriptBridge.get_interface("window").addEventListener("message", _cb)
	# The page may have announced the account before we were listening: ask once now.
	var r := await get_account()
	if r.ok:
		account = r.data
		account_changed.emit(account)

func connect_wallet() -> Dictionary: return await _request("wallet:connect")
func get_account() -> Dictionary: return await _request("wallet:account")
func sign(message: String) -> Dictionary: return await _request("wallet:sign", {"message": message})
func create_match() -> Dictionary: return await _request("wallet:createMatch")
func cancel_match(match_id: int) -> Dictionary: return await _request("wallet:cancelMatch", {"matchId": match_id})

func _request(type: String, args: Dictionary = {}) -> Dictionary:
	if not OS.has_feature("web"):
		return {"ok": false, "error": "web export only"}
	_next += 1
	var id := str(_next)
	var msg := args.duplicate()
	msg["type"] = type
	msg["id"] = id
	var win = JavaScriptBridge.get_interface("window")
	win.parent.postMessage(JSON.stringify(msg), win.location.origin)
	while true:  # wait for the reply with our id (wallet popups can take a while; no timeout on purpose)
		var got = await _result
		if got[0] == id:
			return got[1]
	return {}

func _on_message(args) -> void:
	var ev = args[0]
	var win = JavaScriptBridge.get_interface("window")
	if ev.origin != win.location.origin or typeof(ev.data) != TYPE_STRING:
		return
	var m = JSON.parse_string(ev.data)
	if typeof(m) != TYPE_DICTIONARY:
		return
	match m.get("type", ""):
		"wallet:account":
			account = m.get("account")
			account_changed.emit(account)
		"wallet:result":
			_result.emit(str(m.get("id", "")), {"ok": m.get("ok", false), "data": m.get("data"), "error": m.get("error", "")})
