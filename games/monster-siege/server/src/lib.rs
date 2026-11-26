//! Monster Siege ws relay: lockstep, does NOT run the sim. Room/session pattern from games/keyfall/server.
//! Server owns the clock (30 Hz). A card play is stamped apply_tick = tick + APPLY_DELAY and broadcast to both seats;
//! `{t:'beat', tick}` every 3 ticks; clients only simulate ticks < latest beat. Clients ack their sim tick; the clock
//! pauses while a seat trails it by > PAUSE_LAG (or is disconnected), and a seat stalled for GRACE_TICKS forfeits. Protocol: README.md.
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::Response;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::mpsc;

const MAX_MSG: usize = 8 * 1024; // deck of 8 monsters fits
const RATE: u32 = 20; // msgs/s per socket
const PLAY_RATE: u32 = 4; // card plays/s per socket (energy caps real play far below this)
pub const APPLY_DELAY: u64 = 1; // a play is sent before any beat > its tick, so +1 is already safe; more = input lag
const BEAT_EVERY: u64 = 3;
const COUNT_TICKS: u32 = 90; // 3 s
const GRACE_TICKS: u32 = 600; // 20 s stalled (lagging or gone) = forfeit
const PAUSE_LAG: u64 = 45; // seat's acked sim tick trails the clock by 1.5 s (~RTT + buffer; 500 ms RTT ≈ 25) → pause
const RESUME_LAG: u64 = 15; // every seat back within 0.5 s → resume
const END_TICKS: u64 = 7200 + 150; // 3:00 + 60 s OT (+5 s slack): sim has ended by then

type Tx = mpsc::UnboundedSender<Message>;

fn send(tx: &Tx, v: &Value) {
    let _ = tx.send(Message::Text(v.to_string().into()));
}

#[derive(PartialEq)]
enum Phase {
    Wait,
    Count(u32),
    Live,
}

struct Room {
    seed: u32,
    names: [String; 2],
    tokens: [String; 2],
    conns: [Option<(u64, Tx)>; 2],
    gone: [u32; 2],
    acked: [u64; 2],
    paused: bool,
    phase: Phase,
    tick: u64,
    loadouts: [Value; 2],
    plays: Vec<Value>,
    over: [bool; 2],
}

impl Room {
    fn all(&self, v: &Value) {
        self.conns.iter().flatten().for_each(|(_, tx)| send(tx, v));
    }
    fn start_msg(&self) -> Value {
        json!({ "t": "start", "seed": self.seed, "loadouts": self.loadouts, "names": self.names, "plays": self.plays, "tick": self.tick })
    }
    fn peer(&self) {
        self.all(&json!({ "t": "peer", "conn": [self.conns[0].is_some(), self.conns[1].is_some()] }));
    }
    /// One 30 Hz tick; true = remove the room.
    fn step(&mut self) -> bool {
        if self.phase == Phase::Wait {
            return false;
        }
        if self.conns.iter().all(Option::is_none) {
            return true;
        }
        let live = self.phase == Phase::Live;
        let lag: [u64; 2] = std::array::from_fn(|i| match &self.conns[i] {
            None => u64::MAX,
            Some(_) if live => self.tick - self.acked[i],
            Some(_) => 0,
        });
        if self.paused && lag.iter().all(|&l| l <= RESUME_LAG) {
            self.paused = false;
            self.all(&json!({ "t": "pause", "on": false }));
        } else if !self.paused && let Some(i) = (0..2).find(|&i| lag[i] > PAUSE_LAG) {
            self.paused = true;
            self.all(&json!({ "t": "pause", "on": true, "seat": i, "secs": GRACE_TICKS / 30 }));
        }
        // ponytail: per-episode stall budget (resets on recovery); cumulative budget if players abuse pauses
        for (g, &l) in self.gone.iter_mut().zip(&lag) {
            *g = if self.paused && l > RESUME_LAG { *g + 1 } else { 0 };
        }
        let out: Vec<usize> = (0..2).filter(|&i| self.gone[i] >= GRACE_TICKS).collect();
        if !out.is_empty() {
            let winner = if out.len() == 2 { Value::Null } else { json!(1 - out[0]) }; // both stalled: draw
            self.all(&json!({ "t": "forfeit", "winner": winner }));
            return true;
        }
        if self.paused {
            return false;
        }
        match self.phase {
            Phase::Count(n) if n > 1 => self.phase = Phase::Count(n - 1),
            Phase::Count(_) => {
                self.phase = Phase::Live;
                self.all(&self.start_msg());
            }
            _ => {
                self.tick += 1;
                if self.tick.is_multiple_of(BEAT_EVERY) {
                    self.all(&json!({ "t": "beat", "tick": self.tick }));
                }
                return self.tick > END_TICKS || self.over.iter().all(|&o| o);
            }
        }
        false
    }
}

pub struct App {
    rooms: Mutex<HashMap<String, Room>>,
}

impl App {
    pub fn new() -> Arc<Self> {
        Arc::new(App { rooms: Mutex::default() })
    }
    fn tick(&self) {
        let mut rooms = self.rooms.lock().unwrap();
        rooms.retain(|_, r| {
            let end = r.step();
            if end {
                r.conns.iter().flatten().for_each(|(_, tx)| {
                    let _ = tx.send(Message::Close(None));
                });
            }
            !end
        });
    }
}

pub fn router(app: Arc<App>) -> axum::Router {
    let ticker = app.clone();
    tokio::spawn(async move {
        let mut iv = tokio::time::interval(Duration::from_micros(33_333));
        iv.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Burst);
        loop {
            iv.tick().await;
            ticker.tick();
        }
    });
    axum::Router::new().fallback(ws_handler).with_state(app)
}

// One port for page + relay (so a single tunnel works): upgrades go to the relay, plain GETs get build/ files.
async fn ws_handler(
    State(app): State<Arc<App>>,
    ws: Result<WebSocketUpgrade, axum::extract::ws::rejection::WebSocketUpgradeRejection>,
    uri: axum::http::Uri,
) -> Response {
    match ws {
        Ok(ws) => ws.max_message_size(MAX_MSG).max_frame_size(MAX_MSG).on_upgrade(move |s| run(app, s)),
        Err(_) => static_file(uri.path()),
    }
}

// ponytail: tiny static server (no tower-http). Env STATIC overrides the build/ dir.
fn static_file(path: &str) -> Response {
    use axum::http::{StatusCode, header};
    use axum::response::IntoResponse;
    let rel = path.trim_start_matches('/');
    let rel = if rel.is_empty() || rel.ends_with('/') { format!("{rel}index.html") } else { rel.to_string() };
    if rel.split('/').any(|seg| seg == ".." || seg.starts_with('.')) {
        return StatusCode::NOT_FOUND.into_response();
    }
    let dir = std::env::var("STATIC").unwrap_or_else(|_| concat!(env!("CARGO_MANIFEST_DIR"), "/../build").into());
    let Ok(body) = std::fs::read(std::path::Path::new(&dir).join(&rel)) else { // sync read: files are small
        return StatusCode::NOT_FOUND.into_response();
    };
    let ct = match rel.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript",
        "json" => "application/json",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "css" => "text/css",
        _ => "application/octet-stream",
    };
    ([(header::CONTENT_TYPE, ct), (header::CACHE_CONTROL, "no-cache")], body).into_response()
}

fn str_of(v: &Value, max: usize) -> String {
    v.as_str().unwrap_or("").trim().chars().take(max).collect()
}

struct Session {
    app: Arc<App>,
    id: u64,
    tx: Tx,
    at: Option<(String, usize)>,
    plays: (Instant, u32),
}

async fn run(app: Arc<App>, sock: WebSocket) {
    let (mut sink, mut stream) = sock.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    tokio::spawn(async move {
        while let Some(m) = rx.recv().await {
            let close = matches!(m, Message::Close(_));
            if sink.send(m).await.is_err() || close {
                break;
            }
        }
    });
    let mut s = Session { app, id: rand::random(), tx, at: None, plays: (Instant::now(), 0) };
    let (mut window, mut n) = (Instant::now(), 0);
    let born = Instant::now();
    let why = loop {
        let msg = match stream.next().await {
            None => break "eof".to_string(),
            Some(Err(e)) => break format!("error: {e}"),
            Some(Ok(Message::Close(f))) => break format!("close {:?}", f.map(|f| (f.code, f.reason.to_string()))),
            Some(Ok(m)) => m,
        };
        let Message::Text(raw) = msg else { continue };
        if window.elapsed() >= Duration::from_secs(1) {
            (window, n) = (Instant::now(), 0);
        }
        n += 1;
        if n > RATE {
            continue;
        }
        if let Ok(m) = serde_json::from_str::<Value>(&raw)
            && let Err(e) = s.on_msg(&m)
        {
            eprintln!("[{:x}] error reply: {e}", s.id & 0xffff);
            send(&s.tx, &json!({ "t": "error", "msg": e }));
        }
    };
    // ponytail: one log line per socket end; enough to tell network drops from protocol errors
    eprintln!("[{:x}] socket end after {:.1}s room={:?}: {why}", s.id & 0xffff, born.elapsed().as_secs_f32(), s.at);
    s.leave();
}

fn new_code(rooms: &HashMap<String, Room>) -> String {
    loop {
        let c: String = (0..4).map(|_| (b'A' + rand::random_range(0..26u8)) as char).collect();
        if !rooms.contains_key(&c) {
            return c;
        }
    }
}

fn token() -> String {
    rand::random::<[u8; 16]>().iter().map(|b| format!("{b:02x}")).collect()
}

/// Loadout is relayed opaque; clients sanitize it in sim.js (trust boundary there). Only shape-checked here.
fn loadout_of(v: &Value) -> Value {
    if v["deck"].is_array() { json!({ "deck": v["deck"] }) } else { Value::Null }
}

fn seated(tx: &Tx, code: &str, seat: usize, token: &str) {
    send(tx, &json!({ "t": "room", "code": code, "seat": seat, "token": token }));
}

impl Session {
    fn on_msg(&mut self, m: &Value) -> Result<(), &'static str> {
        let free = self.at.is_none();
        match m["t"].as_str().unwrap_or("") {
            "host" if free => {
                let mut rooms = self.app.rooms.lock().unwrap();
                let code = new_code(&rooms);
                let room = Room {
                    seed: rand::random(),
                    names: [Some(str_of(&m["name"], 24)).filter(|n| !n.is_empty()).unwrap_or("Host".into()), String::new()],
                    tokens: [token(), token()],
                    conns: [Some((self.id, self.tx.clone())), None],
                    gone: [0; 2],
                    acked: [0; 2],
                    paused: false,
                    phase: Phase::Wait,
                    tick: 0,
                    loadouts: [loadout_of(&m["loadout"]), Value::Null],
                    plays: vec![],
                    over: [false; 2],
                };
                eprintln!("[{:x}] host {code}", self.id & 0xffff);
                seated(&self.tx, &code, 0, &room.tokens[0]);
                rooms.insert(code.clone(), room);
                self.at = Some((code, 0));
                Ok(())
            }
            "join" if free => {
                let code = str_of(&m["code"], 8).to_uppercase();
                let mut rooms = self.app.rooms.lock().unwrap();
                let r = rooms.get_mut(&code).filter(|r| r.phase == Phase::Wait).ok_or("Room not found or full")?;
                r.names[1] = Some(str_of(&m["name"], 24)).filter(|n| !n.is_empty()).unwrap_or("Guest".into());
                r.loadouts[1] = loadout_of(&m["loadout"]);
                r.conns[1] = Some((self.id, self.tx.clone()));
                r.phase = Phase::Count(COUNT_TICKS);
                eprintln!("[{:x}] join {code}", self.id & 0xffff);
                seated(&self.tx, &code, 1, &r.tokens[1]);
                r.peer();
                self.at = Some((code, 1));
                Ok(())
            }
            "rejoin" if free => {
                let code = str_of(&m["code"], 8).to_uppercase();
                let tok = str_of(&m["token"], 64);
                let mut rooms = self.app.rooms.lock().unwrap();
                let r = rooms.get_mut(&code).filter(|r| r.phase != Phase::Wait).ok_or("Room not found")?;
                let seat = (0..2).find(|&i| !tok.is_empty() && r.tokens[i] == tok).ok_or("Bad seat token")?;
                r.conns[seat] = Some((self.id, self.tx.clone()));
                eprintln!("[{:x}] rejoin {code} seat {seat}", self.id & 0xffff);
                seated(&self.tx, &code, seat, &r.tokens[seat]);
                if r.phase == Phase::Live {
                    send(&self.tx, &r.start_msg()); // full play log: client re-indexes and catches up
                }
                r.peer();
                self.at = Some((code, seat));
                Ok(())
            }
            "play" => {
                let Some((code, seat)) = &self.at else { return Ok(()) };
                if self.plays.0.elapsed() >= Duration::from_secs(1) {
                    self.plays = (Instant::now(), 0);
                }
                self.plays.1 += 1;
                if self.plays.1 > PLAY_RATE {
                    return Ok(());
                }
                let (Some(card), Some(x2), Some(y)) =
                    (m["card"].as_u64().filter(|&c| c < 8), m["x2"].as_u64().filter(|&x| x <= 40), m["y"].as_u64().filter(|&y| y <= 10))
                else {
                    return Err("bad play");
                };
                let mut rooms = self.app.rooms.lock().unwrap();
                let Some(r) = rooms.get_mut(code).filter(|r| r.phase == Phase::Live) else { return Ok(()) };
                let p = json!({ "t": "play", "seat": seat, "card": card, "x2": x2, "y": y, "apply_tick": r.tick + APPLY_DELAY });
                r.all(&p);
                r.plays.push(p);
                Ok(())
            }
            "ack" => {
                if let Some((code, seat)) = &self.at
                    && let Some(t) = m["tick"].as_u64()
                    && let Some(r) = self.app.rooms.lock().unwrap().get_mut(code)
                {
                    r.acked[*seat] = r.acked[*seat].max(t.min(r.tick)); // clamp: lag = tick - acked never underflows
                }
                Ok(())
            }
            "over" => {
                if let Some((code, seat)) = &self.at
                    && let Some(r) = self.app.rooms.lock().unwrap().get_mut(code)
                {
                    r.over[*seat] = true;
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }

    fn leave(&self) {
        let Some((code, seat)) = &self.at else { return };
        let mut rooms = self.app.rooms.lock().unwrap();
        let Some(r) = rooms.get_mut(code) else { return };
        if r.conns[*seat].as_ref().is_some_and(|(id, _)| *id == self.id) {
            r.conns[*seat] = None;
            if r.phase == Phase::Wait {
                rooms.remove(code); // only the host sits in a waiting room
            } else {
                r.peer();
            }
        }
    }
}
