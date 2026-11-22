use crate::room::{Room, Status};
use brawler_sim::StageId;
use serde_json::{Value, json};
use std::collections::HashMap;

pub fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|f| f != 0.),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}

pub fn str_of(v: &Value, max: usize) -> String {
    match v {
        Value::String(s) => s.chars().take(max).collect(),
        Value::Number(x) => x.to_string().chars().take(max).collect(),
        Value::Bool(b) => b.to_string(),
        _ => String::new(),
    }
}

pub fn int_id(v: &Value) -> Option<u64> {
    v.as_u64().or_else(|| {
        v.as_f64()
            .filter(|f| f.fract() == 0. && *f >= 0. && *f < 9007199254740992.)
            .map(|f| f as u64)
    })
}

pub fn stake_ok(s: &str) -> bool {
    (1..=40).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_digit())
}

pub fn stage_of(v: &Value) -> StageId {
    v.as_str()
        .and_then(StageId::parse)
        .unwrap_or(StageId::Ember)
}

/// One tape frame `host << 16 | guest` (JS `Number(v) >>> 0`).
pub fn tape_of(v: &Value) -> i32 {
    let f = match v {
        Value::Number(n) => n.as_f64().unwrap_or(0.),
        Value::Bool(b) => *b as u8 as f64,
        Value::String(s) => s.trim().parse().unwrap_or(0.),
        _ => 0.,
    };
    if f.is_finite() {
        f.trunc().rem_euclid(4294967296.) as u32 as i32
    } else {
        0
    }
}

pub fn players(r: &Room) -> Value {
    r.seats
        .iter()
        .map(|s| json!({ "name": s.name, "dna": s.dna, "skills": s.skills, "account": s.account }))
        .collect()
}

pub fn room_row(r: &Room) -> Value {
    json!({
        "code": r.code, "pub": r.public, "status": r.status.as_str(), "stage": r.stage.name(), "bettable": r.bettable,
        "matchId": r.match_id, "stake": r.stake, "winner": r.winner, "players": players(r), "watchers": r.spectators.len(),
        "wantsBot": r.wants_bot && r.seats.len() == 1 && r.match_id.is_none(),
    })
}

pub fn room_state(r: &Room) -> Value {
    let seats: Vec<Value> = r
        .seats
        .iter()
        .map(|s| json!({ "name": s.name, "dna": s.dna, "skills": s.skills, "account": s.account, "connected": s.conn.is_some() }))
        .collect();
    json!({
        "t": "roomstate", "code": r.code, "status": r.status.as_str(), "stage": r.stage.name(), "stake": r.stake,
        "matchId": r.match_id, "bettable": r.bettable, "pub": r.public, "view": r.view, "seats": seats,
        "spectators": r.spectators.len(),
    })
}

pub fn spec_msg(r: &Room) -> Value {
    json!({
        "t": "spec", "code": r.code, "stage": r.stage.name(), "status": r.status.as_str(), "winner": r.winner,
        "matchId": r.match_id, "bettable": r.bettable, "players": players(r), "frames": r.frames,
    })
}

/// `start` minus per-seat fields (`seat`, `delay`).
pub fn start_msg(r: &Room) -> Value {
    json!({ "t": "start", "matchId": r.match_id, "bettable": r.bettable, "players": players(r) })
}

pub fn lobby_msg(rooms: &HashMap<String, Room>) -> Value {
    let rows: Vec<Value> = rooms
        .values()
        .filter(|r| {
            (r.public || r.view)
                && r.status != Status::Done
                && r.seats.iter().any(|s| s.conn.is_some())
        })
        .map(room_row)
        .collect();
    json!({ "t": "lobby", "rooms": rows })
}
