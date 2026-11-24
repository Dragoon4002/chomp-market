//! Ribbon Rush server: authoritative sim per matchId, ws protocol + referee per tasks/ribbon-spec.md.
//! Chat per room: {t:'chat', text} from seats/watchers (<=200 chars, 1 per 500 ms) -> {t:'chat', from, seat, text, ts}
//! (seat -1 = spectator); last 50 kept, sent as {t:'chatlog', lines} on auth/watch.
//! Staked: {t:'auth', matchId, account, sig}; sig = base58 ed25519 over utf8 `chomp:ribbon:<matchId>:<hello.nonce>`
//! (nonce = hex string from `hello`); account must be Match.a (seat 0) or Match.b (seat 1), both filled.
//! On `over` the referee posts `settle(matchId, winner ?? 2)`.
use axum::extract::ws::{Message, Utf8Bytes, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::{Router, routing::get};
use futures_util::{SinkExt, StreamExt};
use chain::Chain;
use ribbon_sim::Sim;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet, VecDeque};
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
    /// On-chain [a, b] (empty in dev mode); settle pays only these.
    pair: [String; 2],
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
            pair: Default::default(),
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

pub struct App {
    chain: Arc<Chain>,
    tape_dir: PathBuf,
    tick_ms: u64,
    // ponytail: one global lock over all rooms; per-room locks if match count gets large
    rooms: Mutex<HashMap<u64, Room>>,
    /// Match ids already played: never reopened, so a dropped settle can't be replayed (e.g. loser → void).
    // ponytail: in memory, lost on restart; a settled match's closed account still rejects it
    finished: Mutex<HashSet<u64>>,
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
    pub fn new(chain: Arc<Chain>, tape_dir: impl Into<PathBuf>, tick_ms: u64) -> Arc<Self> {
        Arc::new(App {
            chain,
            tape_dir: tape_dir.into(),
            tick_ms,
            rooms: Mutex::default(),
            finished: Mutex::default(),
            ids: AtomicU64::new(1),
        })
    }

    /// (matchId, account, chain seat, chain [a, b]). Dev mode (no REFEREE_KEYPAIR): no checks, seat picked by arrival.
    async fn check(
        &self,
        m: &Value,
        nonce: &str,
    ) -> Result<(u64, String, Option<usize>, [String; 2]), &'static str> {
        let id = match_id(&m["matchId"]).ok_or("bad matchId")?;
        let account = m["account"]
            .as_str()
            .filter(|a| !a.is_empty())
            .ok_or("no account")?;
        if !self.chain.enabled() {
            return Ok((id, account.into(), None, Default::default()));
        }
        let cm = self.chain.match_info(id).await.ok_or("match not found")?;
        if cm.b.is_none() {
            return Err("match not live");
        }
        let seat = if account == cm.a {
            0
        } else if cm.b.as_deref() == Some(account) {
            1
        } else {
            return Err("not a player in this match");
        };
        let msg = format!("chomp:{GAME}:{id}:{nonce}");
        if !chain::verify_sig(account, msg.as_bytes(), m["sig"].as_str().unwrap_or("")) {
            return Err("wallet signature check failed");
        }
        let pair = [cm.a, cm.b.unwrap_or_default()];
        Ok((id, account.into(), Some(seat), pair))
    }

    async fn auth(self: &Arc<Self>, m: &Value, conn: &Conn, nonce: &str) -> Option<(u64, i8)> {
        let (id, account, chain_seat, pair) = match self.check(m, nonce).await {
            Ok(x) => x,
            Err(e) => {
                send(&conn.1, &json!({ "t": "error", "msg": e }));
                return None;
            }
        };
        let mut rooms = self.rooms.lock().unwrap();
        if !rooms.contains_key(&id) {
            if self.finished.lock().unwrap().contains(&id) {
                send(&conn.1, &json!({ "t": "error", "msg": "match already played" }));
                return None;
            }
            tokio::spawn(self.clone().no_show(id));
        }
        let room = rooms.entry(id).or_insert_with(Room::new);
        room.pair = pair;
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

    /// Broadcast over, save tape, referee settles staked matches.
    fn finish(&self, id: u64, r: &mut Room, winner: Option<u8>, reason: &str) {
        self.finished.lock().unwrap().insert(id);
        if self.chain.enabled() {
            let (chain, w, pair) = (self.chain.clone(), winner.unwrap_or(2), r.pair.clone());
            tokio::spawn(async move {
                // confirm + rebroadcast inside; still unsettled → `cancel` refunds both after 2 h
                match chain.settle(id, w, &pair).await {
                    Ok(sig) => eprintln!("settle {id} winner {w}: {sig}"),
                    Err(e) => eprintln!("settle {id} winner {w} failed: {e}"),
                }
            });
        }
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
    }

    /// Second seat never came: void (settle draw refunds both).
    async fn no_show(self: Arc<Self>, id: u64) {
        tokio::time::sleep(NO_SHOW).await;
        let mut rooms = self.rooms.lock().unwrap();
        let Some(r) = rooms.get_mut(&id) else { return };
        if r.start_at.is_some() {
            return;
        }
        self.finish(id, r, None, "void");
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
    let nonce = hex(&rand::random::<[u8; 32]>());
    send(&conn.1, &json!({ "t": "hello", "nonce": nonce }));
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
            (Some("auth"), None) => at = app.auth(&m, &conn, &nonce).await,
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
