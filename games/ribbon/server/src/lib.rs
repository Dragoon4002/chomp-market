//! Ribbon Rush server: authoritative sim per matchId, ws protocol + referee per tasks/ribbon-spec.md.
//! Chat per room: {t:'chat', text} from seats/watchers (<=200 chars, 1 per 500 ms) -> {t:'chat', from, seat, text, ts}
//! (seat -1 = spectator); last 50 kept, sent as {t:'chatlog', lines} on auth/watch.
use axum::extract::ws::{Message, Utf8Bytes, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::{Router, routing::get};
use futures_util::{SinkExt, StreamExt};
use near_svc::Near;
use ribbon_sim::Sim;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::mpsc::{self, UnboundedSender};

const GAME: &str = "ribbon";
const COUNTDOWN_MS: u64 = 3000;
const FORFEIT: Duration = Duration::from_secs(10);
const NO_SHOW: Duration = Duration::from_secs(300);
/// Done rooms kept this long so late reconnects still get sync + over.
const LINGER: Duration = Duration::from_secs(60);
const MAX_MSG: usize = 4096;
const CHAT_MAX: usize = 200;
const CHAT_KEEP: usize = 50;
const CHAT_GAP: Duration = Duration::from_millis(500);

type Conn = (u64, UnboundedSender<Message>);

#[derive(Default)]
struct Seat {
    account: String,
    conn: Option<Conn>,
    gone: Option<Instant>,
}

struct Room {
    seats: [Seat; 2],
    watchers: Vec<Conn>,
    sim: Sim,
    tape: Vec<[u8; 2]>,
    /// Pending input per seat for next tick: dir (7 = none) | boost latch.
    ins: [u8; 2],
    start_at: Option<u64>,
    over: Option<Value>,
    /// Last CHAT_KEEP lines `{from, seat, text, ts}`.
    chat: VecDeque<Value>,
}

impl Room {
    fn new() -> Self {
        Room {
            seats: Default::default(),
            watchers: vec![],
            sim: Sim::new(),
            tape: vec![],
            ins: [7, 7],
            start_at: None,
            over: None,
            chat: VecDeque::new(),
        }
    }

    fn broadcast(&self, v: &Value) {
        let t: Utf8Bytes = v.to_string().into();
        let seats = self.seats.iter().filter_map(|s| s.conn.as_ref());
        for (_, tx) in seats.chain(&self.watchers) {
            let _ = tx.send(Message::Text(t.clone()));
        }
    }

    /// sync (+ start / over if already sent) to a newcomer.
    fn greet(&self, tx: &UnboundedSender<Message>, seat: i8) {
        send(
            tx,
            &json!({ "t": "sync", "seat": seat, "ticks": self.tape }),
        );
        if let Some(at) = self.start_at {
            send(tx, &json!({ "t": "start", "at": at }));
        }
        if let Some(o) = &self.over {
            send(tx, o);
        }
        send(tx, &json!({ "t": "chatlog", "lines": self.chat }));
    }
}

#[derive(Deserialize)]
struct ChainMatch {
    status: String,
    host: String,
    guest: Option<String>,
    #[serde(default)]
    game: String,
}

pub struct App {
    near: Arc<Near>,
    tape_dir: PathBuf,
    tick_ms: u64,
    // ponytail: one global lock over all rooms; per-room locks if match count gets large
    rooms: Mutex<HashMap<u64, Room>>,
    ids: AtomicU64,
}

fn send(tx: &UnboundedSender<Message>, v: &Value) {
    let _ = tx.send(Message::Text(v.to_string().into()));
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

fn match_id(v: &Value) -> Option<u64> {
    v.as_u64().or_else(|| v.as_str()?.parse().ok())
}

/// sha256 hex of every tick's [a,b] bytes concatenated.
pub fn tape_hash(tape: &[[u8; 2]]) -> String {
    hex(&Sha256::digest(tape.as_flattened()))
}

impl App {
    pub fn new(near: Arc<Near>, tape_dir: impl Into<PathBuf>, tick_ms: u64) -> Arc<Self> {
        Arc::new(App {
            near,
            tape_dir: tape_dir.into(),
            tick_ms,
            rooms: Mutex::default(),
            ids: AtomicU64::new(1),
        })
    }

    /// (matchId, account, chain seat). Dev mode (no CONTRACT_ID): no checks, seat picked by arrival.
    async fn check(
        &self,
        m: &Value,
        nonce: [u8; 32],
    ) -> Result<(u64, String, Option<usize>), &'static str> {
        let id = match_id(&m["matchId"]).ok_or("bad matchId")?;
        let account = m["account"]
            .as_str()
            .filter(|a| !a.is_empty())
            .ok_or("no account")?;
        if self.near.contract.is_empty() {
            return Ok((id, account.into(), None));
        }
        let cm: ChainMatch = self
            .near
            .view(&self.near.contract, "get_match", json!({ "match_id": id }))
            .await
            .ok_or("match not found")?;
        if cm.game != GAME {
            return Err("match is for another game");
        }
        if cm.status != "live" {
            return Err("match not live");
        }
        let seat = if account == cm.host {
            0
        } else if cm.guest.as_deref() == Some(account) {
            1
        } else {
            return Err("not a player in this match");
        };
        let msg = format!("{GAME}:{id}");
        if !self
            .near
            .verify_auth(&m["auth"], account, &msg, nonce)
            .await
        {
            return Err("wallet signature check failed");
        }
        Ok((id, account.into(), Some(seat)))
    }

    async fn auth(self: &Arc<Self>, m: &Value, conn: &Conn, nonce: [u8; 32]) -> Option<(u64, i8)> {
        let (id, account, chain_seat) = match self.check(m, nonce).await {
            Ok(x) => x,
            Err(e) => {
                send(&conn.1, &json!({ "t": "error", "msg": e }));
                return None;
            }
        };
        let mut rooms = self.rooms.lock().unwrap();
        if !rooms.contains_key(&id) {
            tokio::spawn(self.clone().no_show(id));
        }
        let room = rooms.entry(id).or_insert_with(Room::new);
        let seat = chain_seat
            .or_else(|| room.seats.iter().position(|s| s.account == account))
            .or_else(|| room.seats.iter().position(|s| s.account.is_empty()));
        let Some(seat) = seat else {
            send(&conn.1, &json!({ "t": "error", "msg": "match full" }));
            return None;
        };
        // reconnect replaces any older socket of the same seat
        room.seats[seat] = Seat {
            account,
            conn: Some(conn.clone()),
            gone: None,
        };
        room.greet(&conn.1, seat as i8);
        if room.start_at.is_none() && room.seats.iter().all(|s| s.conn.is_some()) {
            let at = now_ms() + COUNTDOWN_MS;
            room.start_at = Some(at);
            room.broadcast(&json!({ "t": "start", "at": at }));
            tokio::spawn(self.clone().run_match(id));
        }
        Some((id, seat as i8))
    }

    fn watch(&self, m: &Value, conn: &Conn) -> Option<(u64, i8)> {
        let id = match_id(&m["matchId"]);
        let mut rooms = self.rooms.lock().unwrap();
        let Some((id, room)) = id.and_then(|id| Some((id, rooms.get_mut(&id)?))) else {
            send(&conn.1, &json!({ "t": "error", "msg": "no such match" }));
            return None;
        };
        room.watchers.push(conn.clone());
        room.greet(&conn.1, -1);
        Some((id, -1))
    }

    fn input(&self, id: u64, seat: usize, v: u8) {
        if let Some(r) = self.rooms.lock().unwrap().get_mut(&id) {
            let p = &mut r.ins[seat];
            let d = v & 7;
            *p = (if d < 4 { d } else { *p & 7 }) | (*p & 8) | (v & 8);
        }
    }

    /// Seats + watchers of room `id` chat; seat -1 = spectator.
    fn chat(&self, id: u64, seat: i8, text: &str) {
        let text: String = text.trim().chars().take(CHAT_MAX).collect();
        let mut rooms = self.rooms.lock().unwrap();
        let Some(r) = rooms.get_mut(&id).filter(|_| !text.is_empty()) else {
            return;
        };
        let from = match seat {
            0 | 1 => r.seats[seat as usize].account.clone(),
            _ => "Spectator".into(),
        };
        let line = json!({ "from": from, "seat": seat, "text": text, "ts": now_ms() });
        let mut msg = line.clone();
        msg["t"] = "chat".into();
        r.broadcast(&msg);
        if r.chat.len() == CHAT_KEEP {
            r.chat.pop_front();
        }
        r.chat.push_back(line);
    }

    fn leave(&self, id: u64, seat: i8, cid: u64) {
        let mut rooms = self.rooms.lock().unwrap();
        let Some(r) = rooms.get_mut(&id) else { return };
        if seat < 0 {
            r.watchers.retain(|w| w.0 != cid);
        } else {
            let s = &mut r.seats[seat as usize];
            if s.conn.as_ref().is_some_and(|c| c.0 == cid) {
                s.conn = None;
                s.gone = Some(Instant::now());
            }
        }
    }

    async fn run_match(self: Arc<Self>, id: u64) {
        tokio::time::sleep(Duration::from_millis(COUNTDOWN_MS)).await;
        let mut iv = tokio::time::interval(Duration::from_millis(self.tick_ms));
        loop {
            iv.tick().await;
            let mut rooms = self.rooms.lock().unwrap();
            let Some(r) = rooms.get_mut(&id) else { return };
            let d = std::mem::replace(&mut r.ins, [7, 7]);
            r.sim.step(d);
            r.tape.push(d);
            r.broadcast(&json!({ "t": "tick", "n": r.tape.len() - 1, "d": d }));
            let gone = r
                .seats
                .each_ref()
                .map(|s| s.gone.is_some_and(|g| g.elapsed() >= FORFEIT));
            let absent = r.seats.iter().all(|s| s.conn.is_none());
            let end = if r.sim.done {
                let w = u8::try_from(r.sim.winner).ok();
                Some((w, if w.is_some() { "win" } else { "void" }))
            } else if absent && (gone[0] || gone[1]) {
                Some((None, "void"))
            } else if gone[0] || gone[1] {
                Some((Some(gone[0] as u8), "forfeit"))
            } else {
                None
            };
            if let Some((w, reason)) = end {
                self.finish(id, r, w, reason);
                break;
            }
        }
        tokio::time::sleep(LINGER).await;
        self.rooms.lock().unwrap().remove(&id);
    }

    /// Broadcast over, save tape, report on chain (no-op without referee).
    fn finish(&self, id: u64, r: &mut Room, winner: Option<u8>, reason: &str) {
        let kos = r.sim.score.map(|s| s as u8);
        let over = json!({ "t": "over", "winner": winner, "kos": kos, "reason": reason });
        r.broadcast(&over);
        r.over = Some(over);
        // ponytail: sync write under the lock; tapes are a few KB
        let path = self.tape_dir.join(format!("{id}.json"));
        let body = json!({ "ticks": r.tape }).to_string();
        if let Err(e) =
            std::fs::create_dir_all(&self.tape_dir).and_then(|_| std::fs::write(&path, body))
        {
            eprintln!("tape {id}: {e}");
        }
        let args = json!({ "match_id": id, "winner": winner, "kos": kos, "tape_hash": tape_hash(&r.tape) });
        self.near.call(id, "report_result", args, 100);
    }

    /// Second seat never came: host alone -> unjoin (refund guest, reopen), else / on failure void.
    async fn no_show(self: Arc<Self>, id: u64) {
        tokio::time::sleep(NO_SHOW).await;
        let host_alone = {
            let rooms = self.rooms.lock().unwrap();
            let Some(r) = rooms.get(&id) else { return };
            if r.start_at.is_some() {
                return;
            }
            r.seats[0].conn.is_some() && r.seats[1].account.is_empty()
        };
        let on_chain = !self.near.contract.is_empty();
        let unjoined = on_chain
            && host_alone
            && self
                .near
                .call_now(id, "unjoin", json!({ "match_id": id }), 30)
                .await;
        let mut rooms = self.rooms.lock().unwrap();
        let Some(r) = rooms.get_mut(&id) else { return };
        if r.start_at.is_some() {
            return;
        }
        if unjoined {
            r.broadcast(&json!({ "t": "over", "winner": null, "kos": [0, 0], "reason": "void" }));
        } else {
            self.finish(id, r, None, "void");
        }
        rooms.remove(&id);
    }
}

pub fn router(app: Arc<App>) -> Router {
    Router::new()
        .route("/tape/{id}", get(tape))
        .fallback(ws_handler)
        .with_state(app)
}

async fn tape(State(app): State<Arc<App>>, Path(id): Path<u64>) -> Response {
    let cors = (header::ACCESS_CONTROL_ALLOW_ORIGIN, "*");
    match std::fs::read(app.tape_dir.join(format!("{id}.json"))) {
        Ok(b) => (
            StatusCode::OK,
            [cors, (header::CONTENT_TYPE, "application/json")],
            b,
        )
            .into_response(),
        Err(_) => (StatusCode::NOT_FOUND, [cors], "no tape").into_response(),
    }
}

async fn ws_handler(State(app): State<Arc<App>>, ws: WebSocketUpgrade) -> Response {
    ws.max_message_size(MAX_MSG)
        .on_upgrade(move |s| run(app, s))
}

// ponytail: no ws ping; a half-open socket counts as present until the OS notices
async fn run(app: Arc<App>, sock: WebSocket) {
    let (mut sink, mut stream) = sock.split();
    let (tx, mut rx) = mpsc::unbounded_channel();
    tokio::spawn(async move {
        while let Some(m) = rx.recv().await {
            if sink.send(m).await.is_err() {
                break;
            }
        }
    });
    let conn: Conn = (app.ids.fetch_add(1, Ordering::Relaxed), tx);
    let nonce: [u8; 32] = rand::random();
    send(&conn.1, &json!({ "t": "hello", "nonce": hex(&nonce) }));
    let mut at: Option<(u64, i8)> = None;
    let mut last_chat: Option<Instant> = None;
    while let Some(Ok(msg)) = stream.next().await {
        let raw = match msg {
            Message::Text(raw) => raw,
            Message::Close(_) => break,
            _ => continue,
        };
        let Ok(m) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };
        match (m["t"].as_str(), at) {
            (Some("auth"), None) => at = app.auth(&m, &conn, nonce).await,
            (Some("watch"), None) => at = app.watch(&m, &conn),
            (Some("in"), Some((id, s @ 0..=1))) => {
                if let Some(v) = m["v"].as_u64() {
                    app.input(id, s as usize, v as u8);
                }
            }
            (Some("chat"), Some((id, s))) => {
                if last_chat.is_none_or(|t| t.elapsed() >= CHAT_GAP) {
                    last_chat = Some(Instant::now());
                    app.chat(id, s, m["text"].as_str().unwrap_or(""));
                }
            }
            _ => {}
        }
    }
    if let Some((id, s)) = at {
        app.leave(id, s, conn.0);
    }
}
