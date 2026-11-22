//! Keyfall ws server: rooms by 4-letter code, one authoritative sim per seat (same seed), 20 Hz views, referee report on end.
//! Protocol + rules: tasks/keyfall-spec.md.
//! Chat per room: {t:'chat', text} from seats (<=200 chars, 1 per 500 ms) -> {t:'chat', from, seat, text, ts};
//! last 50 kept, sent as {t:'chatlog', lines} after host/join/rejoin.
pub mod game;

use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::Response;
use base64::{Engine, engine::general_purpose::STANDARD as B64};
use futures_util::{SinkExt, StreamExt};
use game::{COUNTDOWN_MS, DT_MS, DURATION_MS, GRACE_MS, Sim, rank, verdict};
use near_svc::Near;
use serde_json::{Value, json};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::mpsc;

const GAME: &str = "keyfall";
const MAX_MSG: usize = 4 * 1024;
const RATE: u32 = 30;
const CHAT_MAX: usize = 200;
const CHAT_KEEP: usize = 50;
const CHAT_GAP: Duration = Duration::from_millis(500);
const TICK_MS: f64 = 50.; // 20 Hz views; sims step at 50 Hz via `acc`

type Tx = mpsc::UnboundedSender<Message>;

fn send(tx: &Tx, v: &Value) {
    let _ = tx.send(Message::Text(v.to_string().into()));
}

fn err(tx: &Tx, msg: &str) {
    send(tx, &json!({ "t": "error", "msg": msg }));
}

struct Room {
    match_id: Option<u64>,
    stake: String,
    names: [String; 2],
    tokens: [String; 2],
    conns: [Option<(u64, Tx)>; 2],
    gone_ms: [f64; 2],
    phase: &'static str,
    count_ms: f64,
    acc: f64,
    sims: [Sim; 2],
    dirty: bool,
    /// Last CHAT_KEEP lines `{from, seat, text, ts}`.
    chat: VecDeque<Value>,
}

impl Room {
    /// Seat's own View (never the opponent's sim); drains its fx.
    fn view(&mut self, seat: usize, t: &str) -> Value {
        let mut v = self.sims[seat].view();
        v["t"] = t.into();
        v["phase"] = self.phase.into();
        v["count_ms"] = self.count_ms.into();
        v["left_ms"] = (DURATION_MS - self.sims[seat].t).into();
        v["names"] = json!(self.names);
        v["conn"] = json!([self.conns[0].is_some(), self.conns[1].is_some()]);
        v
    }

    /// Send each connected seat its own view (`extra` merged in, e.g. result).
    fn send_views(&mut self, t: &str, extra: Option<(&str, Value)>) {
        for seat in 0..2 {
            let mut v = self.view(seat, t);
            if let Some((k, x)) = &extra {
                v[*k] = x.clone();
            }
            if let Some((_, tx)) = &self.conns[seat] {
                send(tx, &v);
            }
        }
    }

    /// `room` reply + chat backlog to a newly seated socket.
    fn seated(&self, tx: &Tx, code: &str, seat: usize) {
        send(
            tx,
            &json!({ "t": "room", "code": code, "seat": seat, "token": self.tokens[seat], "matchId": self.match_id }),
        );
        send(tx, &json!({ "t": "chatlog", "lines": self.chat }));
    }

    /// Advance 1 tick; Some(winner, reason) when the match ended.
    fn step(&mut self) -> Option<(Option<u8>, &'static str)> {
        if self.phase == "wait" {
            return None;
        }
        for i in 0..2 {
            self.gone_ms[i] = if self.conns[i].is_some() {
                0.
            } else {
                self.gone_ms[i] + TICK_MS
            };
        }
        if self.conns.iter().all(Option::is_none) {
            return Some((rank(&self.sims), "forfeit"));
        }
        if let Some(i) = (0..2).find(|&i| self.gone_ms[i] >= GRACE_MS) {
            return Some((Some(1 - i as u8), "forfeit"));
        }
        if self.phase == "count" {
            self.count_ms -= TICK_MS;
            if self.count_ms <= 0. {
                self.count_ms = 0.;
                self.phase = "live";
            }
            return None;
        }
        // disconnected seats keep simulating (enemies keep attacking)
        self.acc += TICK_MS;
        while self.acc >= DT_MS as f64 {
            self.acc -= DT_MS as f64;
            self.sims.iter_mut().for_each(Sim::step);
            if let Some(v) = verdict(&self.sims) {
                return Some(v);
            }
        }
        None
    }
}

pub struct App {
    rooms: Mutex<HashMap<String, Room>>,
    near: Arc<Near>,
}

impl App {
    pub fn new(near: Arc<Near>) -> Arc<Self> {
        Arc::new(App {
            rooms: Mutex::default(),
            near,
        })
    }

    fn on_chain(&self) -> bool {
        !self.near.contract.is_empty()
    }

    fn tick(&self) {
        let mut rooms = self.rooms.lock().unwrap();
        let mut ended = vec![];
        for (code, r) in rooms.iter_mut() {
            if let Some((winner, reason)) = r.step() {
                r.phase = "over";
                let res = json!({
                    "winner": winner, "reason": reason,
                    "hp": [r.sims[0].hp, r.sims[1].hp], "wpm": [r.sims[0].wpm(), r.sims[1].wpm()],
                });
                r.send_views("over", Some(("result", res)));
                if let Some(id) = r.match_id {
                    let args =
                        json!({ "match_id": id, "winner": winner, "kos": null, "tape_hash": null });
                    self.near.call(id, "report_result", args, 100);
                }
                ended.push(code.clone());
            } else if r.phase != "wait" || std::mem::take(&mut r.dirty) {
                r.send_views("state", None);
            }
        }
        for c in ended {
            if let Some(r) = rooms.remove(&c) {
                r.conns.iter().flatten().for_each(|(_, tx)| {
                    let _ = tx.send(Message::Close(None));
                });
            }
        }
    }

    async fn get_match(&self, id: u64) -> Option<Value> {
        let m: Value = self
            .near
            .view(&self.near.contract, "get_match", json!({ "match_id": id }))
            .await?;
        (m["game"] == GAME).then_some(m)
    }

    async fn authed(&self, m: &Value, account: &str, id: u64, nonce: [u8; 32]) -> bool {
        self.near
            .verify_auth(&m["auth"], account, &format!("keyfall:{id}"), nonce)
            .await
    }
}

pub fn router(app: Arc<App>) -> axum::Router {
    let ticker = app.clone();
    tokio::spawn(async move {
        let mut iv = tokio::time::interval(Duration::from_millis(TICK_MS as u64));
        loop {
            iv.tick().await;
            ticker.tick();
        }
    });
    axum::Router::new().fallback(ws_handler).with_state(app)
}

async fn ws_handler(State(app): State<Arc<App>>, ws: WebSocketUpgrade) -> Response {
    ws.max_message_size(MAX_MSG)
        .max_frame_size(MAX_MSG)
        .on_upgrade(move |s| run(app, s))
}

fn str_of(v: &Value, max: usize) -> String {
    v.as_str().unwrap_or("").trim().chars().take(max).collect()
}

fn match_id_of(v: &Value) -> Option<u64> {
    v.as_u64().or_else(|| v.as_str()?.parse().ok())
}

/// Per-socket state: where it sits (code, seat).
struct Session {
    app: Arc<App>,
    id: u64,
    tx: Tx,
    nonce: [u8; 32],
    at: Option<(String, usize)>,
    last_chat: Option<Instant>,
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
    let nonce: [u8; 32] = rand::random();
    send(&tx, &json!({ "t": "hello", "nonce": B64.encode(nonce) }));
    let mut s = Session {
        app,
        id: rand::random(),
        tx,
        nonce,
        at: None,
        last_chat: None,
    };
    let (mut window, mut n) = (Instant::now(), 0);
    while let Some(Ok(msg)) = stream.next().await {
        let Message::Text(raw) = msg else { continue };
        if window.elapsed() >= Duration::from_secs(1) {
            (window, n) = (Instant::now(), 0);
        }
        n += 1;
        if n > RATE {
            continue;
        }
        if let Ok(m) = serde_json::from_str::<Value>(&raw)
            && let Err(e) = s.on_msg(&m).await
        {
            err(&s.tx, e);
        }
    }
    s.leave();
}

fn new_code(rooms: &HashMap<String, Room>) -> String {
    loop {
        let c: String = (0..4)
            .map(|_| (b'A' + rand::random_range(0..26u8)) as char)
            .collect();
        if !rooms.contains_key(&c) {
            return c;
        }
    }
}

fn token() -> String {
    rand::random::<[u8; 16]>()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

impl Session {
    async fn on_msg(&mut self, m: &Value) -> Result<(), &'static str> {
        let free = self.at.is_none();
        match m["t"].as_str().unwrap_or("") {
            "host" if free => self.host(m).await,
            "join" if free => self.join(m).await,
            "rejoin" if free => self.rejoin(m),
            "peek" => self.peek(m),
            "chat" => {
                self.chat(m);
                Ok(())
            }
            "k" => {
                let mut cs = m["c"].as_str().unwrap_or("").chars();
                if let (Some(c), None) = (cs.next(), cs.next())
                    && let Some((code, seat)) = &self.at
                    && let Some(r) = self.app.rooms.lock().unwrap().get_mut(code)
                    && r.phase == "live"
                {
                    r.sims[*seat].key(c.to_ascii_lowercase());
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }

    async fn host(&mut self, m: &Value) -> Result<(), &'static str> {
        let match_id = match_id_of(&m["matchId"]);
        let mut stake = "0".to_string();
        if let Some(id) = match_id {
            if !self.app.on_chain() {
                return Err("This server has no contract configured; create a free room");
            }
            let account = str_of(&m["account"], 64);
            let mv = self
                .app
                .get_match(id)
                .await
                .filter(|v| v["status"] == "open" && v["host"] == account.as_str());
            let Some(mv) = mv else {
                return Err("Not the host of this on-chain keyfall match");
            };
            if !self.app.authed(m, &account, id, self.nonce).await {
                return Err("Wallet signature check failed");
            }
            stake = mv["stake"].as_str().unwrap_or("0").into();
        }
        let mut rooms = self.app.rooms.lock().unwrap();
        if match_id.is_some() && rooms.values().any(|r| r.match_id == match_id) {
            return Err("Room for this match already exists");
        }
        let code = new_code(&rooms);
        let name = Some(str_of(&m["name"], 24))
            .filter(|n| !n.is_empty())
            .unwrap_or("Host".into());
        let room = Room {
            match_id,
            stake,
            names: [name, String::new()],
            tokens: [token(), token()],
            conns: [Some((self.id, self.tx.clone())), None],
            gone_ms: [0.; 2],
            phase: "wait",
            count_ms: COUNTDOWN_MS,
            acc: 0.,
            sims: {
                let seed = rand::random();
                [Sim::new(seed), Sim::new(seed)]
            },
            dirty: true,
            chat: VecDeque::new(),
        };
        room.seated(&self.tx, &code, 0);
        rooms.insert(code.clone(), room);
        self.at = Some((code, 0));
        Ok(())
    }

    async fn join(&mut self, m: &Value) -> Result<(), &'static str> {
        let code = str_of(&m["code"], 8).to_uppercase();
        let match_id = {
            let rooms = self.app.rooms.lock().unwrap();
            let r = rooms
                .get(&code)
                .filter(|r| r.phase == "wait")
                .ok_or("Room not found or full")?;
            r.match_id
        };
        if let Some(id) = match_id {
            let account = str_of(&m["account"], 64);
            let ok = self
                .app
                .get_match(id)
                .await
                .is_some_and(|v| v["status"] == "live" && v["guest"] == account.as_str());
            if !ok {
                return Err("Not the guest of this on-chain match");
            }
            if !self.app.authed(m, &account, id, self.nonce).await {
                return Err("Wallet signature check failed");
            }
        }
        let mut rooms = self.app.rooms.lock().unwrap();
        let r = rooms
            .get_mut(&code)
            .filter(|r| r.phase == "wait" && r.match_id == match_id)
            .ok_or("Room not found or full")?;
        r.names[1] = Some(str_of(&m["name"], 24))
            .filter(|n| !n.is_empty())
            .unwrap_or("Guest".into());
        r.conns[1] = Some((self.id, self.tx.clone()));
        r.phase = "count";
        r.seated(&self.tx, &code, 1);
        self.at = Some((code, 1));
        Ok(())
    }

    fn rejoin(&mut self, m: &Value) -> Result<(), &'static str> {
        let code = str_of(&m["code"], 8).to_uppercase();
        let token = str_of(&m["token"], 64);
        let mut rooms = self.app.rooms.lock().unwrap();
        let r = rooms
            .get_mut(&code)
            .filter(|r| r.phase != "wait")
            .ok_or("Room not found")?;
        let seat = (0..2)
            .find(|&i| !token.is_empty() && r.tokens[i] == token)
            .ok_or("Bad seat token")?;
        r.conns[seat] = Some((self.id, self.tx.clone()));
        r.seated(&self.tx, &code, seat);
        self.at = Some((code, seat));
        Ok(())
    }

    fn peek(&self, m: &Value) -> Result<(), &'static str> {
        let code = str_of(&m["code"], 8).to_uppercase();
        let rooms = self.app.rooms.lock().unwrap();
        let r = rooms.get(&code).ok_or("Room not found")?;
        send(
            &self.tx,
            &json!({
                "t": "peek", "code": code, "matchId": r.match_id, "stake": r.stake,
                "host": r.names[0], "full": r.phase != "wait",
            }),
        );
        Ok(())
    }

    fn chat(&mut self, m: &Value) {
        let text = str_of(&m["text"], CHAT_MAX);
        if text.is_empty() || self.last_chat.is_some_and(|t| t.elapsed() < CHAT_GAP) {
            return;
        }
        let Some((code, seat)) = &self.at else { return };
        let mut rooms = self.app.rooms.lock().unwrap();
        let Some(r) = rooms.get_mut(code) else { return };
        self.last_chat = Some(Instant::now());
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_millis() as u64);
        let line = json!({ "from": r.names[*seat], "seat": seat, "text": text, "ts": ts });
        let mut msg = line.clone();
        msg["t"] = "chat".into();
        r.conns.iter().flatten().for_each(|(_, tx)| send(tx, &msg));
        if r.chat.len() == CHAT_KEEP {
            r.chat.pop_front();
        }
        r.chat.push_back(line);
    }

    fn leave(&self) {
        let Some((code, seat)) = &self.at else { return };
        let mut rooms = self.app.rooms.lock().unwrap();
        let Some(r) = rooms.get_mut(code) else { return };
        r.dirty = true;
        if r.conns[*seat]
            .as_ref()
            .is_some_and(|(id, _)| *id == self.id)
        {
            r.conns[*seat] = None;
            if r.phase == "wait" {
                // only the host sits in a waiting room: close it
                rooms.remove(code);
            }
        }
    }
}
