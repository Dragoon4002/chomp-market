use crate::protocol::{
    int_id, lobby_msg, room_row, spec_msg, stage_of, stake_ok, str_of, tape_of, truthy,
};
use crate::room::{RoomRef, Seat, Status};
use crate::{App, GAME, game};
use axum::extract::State;
use axum::extract::ws::{Message, Utf8Bytes, WebSocket, WebSocketUpgrade};
use axum::response::Response;
use base64::{Engine, engine::general_purpose::STANDARD as B64};
use brawler_sim::StageId;
use brawler_sim::genes::sanitize;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::{Notify, mpsc};

/// Netplay/signaling messages forwarded verbatim to the other seat.
const NO_WALLET: &str = "Connect your wallet to play";
const RELAYED: [&str; 6] = ["in", "hash", "sdp", "ice", "go", "pick"];
const MAX_MSG: usize = 16 * 1024;
const TAPE_BATCH: usize = 600;
const DENIED: &str = "Wallet signature check failed";
const OTHER_GAME: &str = "Match is for another game";
const CHAT_MAX: usize = 200;
const CHAT_GAP: Duration = Duration::from_millis(500);

pub struct Conn {
    pub id: u64,
    tx: mpsc::UnboundedSender<Message>,
    pub pong: Notify,
}

impl Conn {
    pub fn send(&self, v: &Value) {
        self.send_text(v.to_string().into());
    }

    pub fn error(&self, msg: &str) {
        self.send(&json!({ "t": "error", "msg": msg }));
    }

    pub fn close(&self) {
        let _ = self.tx.send(Message::Close(None));
    }

    fn send_text(&self, text: Utf8Bytes) {
        let _ = self.tx.send(Message::Text(text));
    }
}

pub fn broadcast<'a>(conns: impl IntoIterator<Item = &'a Arc<Conn>>, v: &Value) {
    let text: Utf8Bytes = v.to_string().into();
    for c in conns {
        c.send_text(text.clone());
    }
}

pub async fn ws_handler(State(app): State<Arc<App>>, ws: WebSocketUpgrade) -> Response {
    ws.max_message_size(MAX_MSG)
        .max_frame_size(MAX_MSG)
        .on_upgrade(move |sock| run(app, sock))
}

async fn run(app: Arc<App>, sock: WebSocket) {
    let (mut sink, mut stream) = sock.split();
    let (tx, mut rx) = mpsc::unbounded_channel();
    let conn = Arc::new(Conn {
        id: app.conn_ids.fetch_add(1, Ordering::Relaxed),
        tx,
        pong: Notify::new(),
    });
    tokio::spawn(async move {
        while let Some(m) = rx.recv().await {
            let close = matches!(m, Message::Close(_));
            if sink.send(m).await.is_err() || close {
                break;
            }
        }
    });
    let nonce: [u8; 32] = rand::random();
    conn.send(&json!({ "t": "hello", "nonce": B64.encode(nonce) }));
    let mut session = Session {
        app,
        conn,
        nonce,
        room: None,
        watcher: String::new(),
        last_chat: None,
    };
    while let Some(Ok(msg)) = stream.next().await {
        match msg {
            Message::Text(raw) => {
                let Ok(m) = serde_json::from_str::<Value>(&raw) else {
                    continue;
                };
                session.on_msg(&m, &raw).await;
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
    session.close();
}

struct Session {
    app: Arc<App>,
    conn: Arc<Conn>,
    /// Sent in `hello`; NEP-413 seat auth must sign it (no replay across sockets).
    nonce: [u8; 32],
    room: Option<RoomRef>,
    /// Spectator's chat name (`account` from `watch`).
    watcher: String,
    last_chat: Option<Instant>,
}

type Reply = Result<(), &'static str>;

impl Session {
    async fn on_msg(&mut self, m: &Value, raw: &Utf8Bytes) {
        self.touch();
        let joined = self.room.is_some();
        let res = match m["t"].as_str().unwrap_or("") {
            "host" if !joined => self.host(m).await,
            "join" if !joined => self.join(m).await,
            "match" if !joined => self.join_match(m).await,
            "watch" if !joined => self.watch(m),
            "rejoin" if !joined => self.rejoin(m).await,
            "resync" => {
                self.resync();
                Ok(())
            }
            "peek" => {
                self.peek(m);
                Ok(())
            }
            "lobby" => {
                self.subscribe_lobby();
                Ok(())
            }
            "tape" => {
                self.tape(m);
                Ok(())
            }
            "rematch" => self.rematch(),
            "set" => self.set(m),
            "begin" => self.begin(),
            "callbot" => self.call_bot(),
            "chat" => {
                self.chat(m);
                Ok(())
            }
            "pong" => {
                self.conn.pong.notify_one();
                Ok(())
            }
            t if RELAYED.contains(&t) => {
                self.relay(raw);
                Ok(())
            }
            _ => Ok(()),
        };
        if let Err(msg) = res {
            self.conn.error(msg);
        }
    }

    /// Any message from a seated player counts as alive (seat can shift when a match room fills).
    fn touch(&self) {
        let Some(at) = &self.room else { return };
        let mut st = self.app.lock();
        if let Some(r) = at.get_mut(&mut st.rooms)
            && let Some(i) = r.seat_of(&self.conn)
        {
            r.seats[i].seen = Instant::now();
        }
    }

    async fn authed(&self, m: &Value, account: &str, match_id: u64) -> bool {
        !self.app.on_chain()
            || self.app.chain
                .verify_auth(
                    &m["auth"],
                    account,
                    &format!("brawler-arena:{match_id}"),
                    self.nonce,
                )
                .await
    }

    fn seat(&self, m: &Value, default_name: &str, account: String) -> Seat {
        let name = str_of(&m["name"], 24);
        let name = if name.is_empty() {
            default_name.into()
        } else {
            name
        };
        Seat::new(self.conn.clone(), name, sanitize(&m["dna"]), account)
    }

    async fn host(&mut self, m: &Value) -> Reply {
        let match_id = int_id(&m["matchId"]);
        let account = str_of(&m["account"], 64);
        if account.is_empty() {
            return Err(NO_WALLET);
        }
        if match_id.is_some() && !self.app.on_chain() {
            return Err(
                "This server has no contract configured; cancel the match and create a free room",
            );
        }
        if let Some(id) = match_id {
            let Some(mv) = self
                .app
                .get_match(id)
                .await
                .filter(|mv| mv.status == "open" && mv.host == account)
            else {
                return Err("Not the host of this on-chain match");
            };
            if mv.game != GAME {
                return Err(OTHER_GAME);
            }
            if !self.authed(m, &account, id).await {
                return Err(DENIED);
            }
            if self
                .app
                .lock()
                .rooms
                .values()
                .any(|r| r.match_id == Some(id) && r.status != Status::Done)
            {
                return Err("Room for this match already exists");
            }
        }
        let stake = m["stake"]
            .as_str()
            .filter(|s| stake_ok(s))
            .unwrap_or("0")
            .to_string();
        let seat = self.seat(m, "Host", account);
        let mut st = self.app.lock();
        let at = st.open_room(seat, |r| {
            r.public = truthy(&m["pub"]);
            r.view = r.public || truthy(&m["view"]);
            r.bettable = truthy(&m["bettable"]);
            r.match_id = match_id;
            r.stake = stake;
            r.stage = stage_of(&m["stage"]);
        });
        self.conn.send(&json!({ "t": "room", "code": at.code }));
        if let Some(r) = at.get_mut(&mut st.rooms) {
            r.welcome(&self.conn);
        }
        st.lobby.push(&self.app);
        self.room = Some(at);
        Ok(())
    }

    async fn join(&mut self, m: &Value) -> Reply {
        let code = str_of(&m["code"], 8).to_uppercase();
        let account = str_of(&m["account"], 64);
        if account.is_empty() {
            return Err(NO_WALLET);
        }
        let (at, match_id) = self
            .app
            .lock()
            .rooms
            .get(&code)
            .filter(|r| r.status == Status::Waiting && r.seats.len() == 1)
            .map(|r| (r.handle(), r.match_id))
            .ok_or("Room not found or already full")?;
        if let Some(id) = match_id {
            match &self.app.get_match(id).await {
                None if self.app.on_chain() => return Err("Match not found on-chain"),
                Some(x) if x.game != GAME => return Err(OTHER_GAME),
                Some(x) if x.status != "live" => {
                    return Err("Join the match on-chain first (stake not paid yet)");
                }
                Some(x) if x.guest.as_deref() != Some(account.as_str()) => {
                    return Err("Another account paid for this seat");
                }
                _ => {}
            }
            if !self.authed(m, &account, id).await {
                return Err(DENIED);
            }
        }
        let mut st = self.app.lock();
        let r = at
            .get_mut(&mut st.rooms)
            .filter(|r| r.seats.len() == 1 && r.status == Status::Waiting)
            .ok_or("Room already full")?;
        r.seats.push(self.seat(m, "Guest", account));
        r.wants_bot = false;
        self.conn
            .send(&json!({ "t": "room", "code": at.code, "seat": 1 }));
        r.welcome(&self.conn);
        st.lobby.push(&self.app);
        self.room = Some(at);
        Ok(())
    }

    /// On-chain match without a pre-made room: 1st arrival opens it, 2nd takes the other seat and starts.
    async fn join_match(&mut self, m: &Value) -> Reply {
        let account = str_of(&m["account"], 64);
        let id = int_id(&m["matchId"]).ok_or("Bad matchId")?;
        let mv = self.app.get_match(id).await.ok_or("Match not found")?;
        if mv.game != GAME {
            return Err(OTHER_GAME);
        }
        if mv.status != "live" {
            return Err("Match is not live on-chain");
        }
        let me: i32 = if account == mv.host {
            0
        } else if mv.guest.as_deref() == Some(account.as_str()) {
            1
        } else {
            return Err("Not a player in this match");
        };
        if !self.authed(m, &account, id).await {
            return Err(DENIED);
        }
        let mine = self.seat(m, if me == 1 { "Guest" } else { "Host" }, account);
        let mut st = self.app.lock();
        match st
            .rooms
            .values_mut()
            .find(|r| r.match_id == Some(id) && r.status == Status::Waiting)
        {
            None => {
                let stake = if stake_ok(&mv.stake) {
                    mv.stake
                } else {
                    "0".into()
                };
                let at = st.open_room(mine, |r| {
                    r.public = mv.bettable;
                    r.view = true;
                    r.bettable = mv.bettable;
                    r.match_id = Some(id);
                    r.stake = stake;
                    r.stage = stage_of(&m["stage"]);
                    r.no_show = Some(me);
                });
                self.conn
                    .send(&json!({ "t": "room", "code": at.code, "seat": me }));
                if let Some(r) = at.get_mut(&mut st.rooms) {
                    r.welcome(&self.conn);
                }
                st.lobby.push(&self.app);
                self.room = Some(at);
            }
            Some(r) => {
                let other = if me == 1 {
                    Some(mv.host.as_str())
                } else {
                    mv.guest.as_deref()
                };
                if r.seats.len() != 1 || Some(r.seats[0].account.as_str()) != other {
                    return Err("Room already taken");
                }
                if me == 1 {
                    r.seats.push(mine);
                } else {
                    r.seats.insert(0, mine);
                }
                self.conn
                    .send(&json!({ "t": "room", "code": r.code, "seat": me }));
                r.welcome(&self.conn);
                let at = r.handle();
                drop(st);
                self.room = Some(at.clone());
                // tournaments have no host to press Start
                tokio::spawn(game::begin(self.app.clone(), at, Some(mv)));
            }
        }
        Ok(())
    }

    /// Same account back in its live seat (reload / dropped socket) within the forfeit window. Opponent gets
    /// `rejoin`, flushes its tape and answers `resync`; then we get `resume` (see `resync`).
    async fn rejoin(&mut self, m: &Value) -> Reply {
        let code = str_of(&m["code"], 8).to_uppercase();
        let account = str_of(&m["account"], 64);
        if account.is_empty() {
            return Err(NO_WALLET);
        }
        let find = |st: &mut crate::room::Shared| {
            let r = st
                .rooms
                .get_mut(&code)
                .filter(|r| r.status == Status::Live)?;
            let mine = |s: &Seat| s.account == account;
            let i = r
                .seats
                .iter()
                .position(|s| mine(s) && s.conn.is_none())
                .or_else(|| r.seats.iter().position(mine))?;
            Some((r.handle(), r.match_id, i))
        };
        let (at, match_id, _) = find(&mut self.app.lock()).ok_or("No live fight to rejoin")?;
        if let Some(id) = match_id
            && !self.authed(m, &account, id).await
        {
            return Err(DENIED);
        }
        let mut st = self.app.lock();
        let (_, _, i) = find(&mut st)
            .filter(|(a, ..)| a.uid == at.uid)
            .ok_or("No live fight to rejoin")?;
        let r = at.get_mut(&mut st.rooms).expect("just found");
        let other = r.opponent(i).cloned().ok_or("Opponent is gone")?;
        let seat = &mut r.seats[i];
        if let Some(old) = seat.conn.replace(self.conn.clone()) {
            old.close();
        }
        seat.seen = Instant::now();
        other.send(&json!({ "t": "rejoin" }));
        r.push_state();
        self.room = Some(at);
        Ok(())
    }

    /// Survivor answers `rejoin` with its tape flushed: both seats continue from its confirmed frames.
    fn resync(&self) {
        let Some(at) = &self.room else { return };
        let mut st = self.app.lock();
        let Some(r) = at
            .get_mut(&mut st.rooms)
            .filter(|r| r.status == Status::Live)
        else {
            return;
        };
        let Some(i) = r.seat_of(&self.conn) else {
            return;
        };
        let tape = r.seats[i].tape.clone();
        r.seats[1 - i].tape = tape.clone();
        if let Some(c) = r.opponent(i) {
            c.send(&json!({
                "t": "resume", "code": r.code, "seat": 1 - i, "stage": r.stage.name(), "matchId": r.match_id,
                "bettable": r.bettable, "frames": tape,
                "players": crate::protocol::players(r),
            }));
        }
    }

    fn watch(&mut self, m: &Value) -> Reply {
        let mut st = self.app.lock();
        let st = &mut *st;
        let r = st
            .rooms
            .get_mut(&str_of(&m["code"], 8).to_uppercase())
            .ok_or("Room not found")?;
        if !r.view {
            return Err("This private room is closed to spectators");
        }
        r.spectators.insert(self.conn.id, self.conn.clone());
        self.room = Some(r.handle());
        self.watcher = str_of(&m["account"], 64);
        self.conn.send(&spec_msg(r));
        r.welcome(&self.conn);
        st.lobby.push(&self.app);
        Ok(())
    }

    /// Room info by code (private rooms too: code is the secret).
    fn peek(&self, m: &Value) {
        let st = self.app.lock();
        let row = st
            .rooms
            .get(&str_of(&m["code"], 8).to_uppercase())
            .map(room_row);
        self.conn.send(&json!({ "t": "peek", "room": row }));
    }

    fn subscribe_lobby(&self) {
        let mut st = self.app.lock();
        st.lobby.subs.insert(self.conn.id, self.conn.clone());
        self.conn.send(&lobby_msg(&st.rooms));
    }

    fn tape(&self, m: &Value) {
        let (Some(at), Some(f0), Some(ins)) = (&self.room, m["f0"].as_u64(), m["ins"].as_array())
        else {
            return;
        };
        let mut st = self.app.lock();
        let st = &mut *st;
        let Some(r) = at.get_mut(&mut st.rooms) else {
            return;
        };
        let Some(i) = r.seat_of(&self.conn) else {
            return;
        };
        let tape = &mut r.seats[i].tape;
        if f0 != tape.len() as u64 {
            return; // batches arrive in order on one socket; drop dupes
        }
        tape.extend(ins.iter().take(TAPE_BATCH).map(tape_of));
        game::replay(&self.app, r, &mut st.lobby);
    }

    /// Free rooms only: both seats ask -> same room restarts. Opponent gone -> `left` (client hosts anew).
    fn rematch(&self) -> Reply {
        let Some(at) = &self.room else {
            return Err("Not in a room");
        };
        let mut st = self.app.lock();
        let Some(r) = at.get_mut(&mut st.rooms) else {
            self.conn.send(&json!({ "t": "left" }));
            return Ok(());
        };
        let i = r.seat_of(&self.conn).ok_or("Spectators can't rematch")?;
        if r.match_id.is_some() {
            return Err("On-chain matches need a new match");
        }
        if r.status != Status::Done {
            return Err("Match is not over");
        }
        let Some(other) = r.opponent(i).cloned() else {
            self.conn.send(&json!({ "t": "left" }));
            return Ok(());
        };
        r.rematch[i] = true;
        if !r.rematch[1 - i] {
            other.send(&json!({ "t": "rematch" }));
            return Ok(());
        }
        r.reset();
        r.push_state();
        drop(st);
        tokio::spawn(game::begin(self.app.clone(), at.clone(), None));
        Ok(())
    }

    /// Waiting room: sender updates own name/dna; host also the stage.
    fn set(&self, m: &Value) -> Reply {
        let at = self.room.as_ref().ok_or("Not in a room")?;
        let mut st = self.app.lock();
        let st = &mut *st;
        let r = at.get_mut(&mut st.rooms).ok_or("Not in a room")?;
        let i = r
            .seat_of(&self.conn)
            .ok_or("Spectators can't change the room")?;
        if r.status != Status::Waiting {
            return Err("Match already started");
        }
        let stage = match &m["stage"] {
            Value::Null => None,
            _ if i != 0 => return Err("Only the host can change the arena"),
            v => Some(v.as_str().and_then(StageId::parse).ok_or("Unknown arena")?),
        };
        let name = str_of(&m["name"], 24);
        let seat = &mut r.seats[i];
        if !name.is_empty() {
            seat.name = name;
        }
        if !m["dna"].is_null() {
            seat.dna = sanitize(&m["dna"]);
        }
        if let Some(stage) = stage {
            r.stage = stage;
        }
        r.push_state();
        st.lobby.push(&self.app);
        Ok(())
    }

    fn begin(&self) -> Reply {
        let at = self.room.as_ref().ok_or("Not in a room")?;
        let mut st = self.app.lock();
        let r = at.get_mut(&mut st.rooms).ok_or("Not in a room")?;
        if r.seat_of(&self.conn) != Some(0) {
            return Err("Only the host can start");
        }
        if r.status != Status::Waiting {
            return Err("Match already started");
        }
        if r.players().count() != 2 {
            return Err("Waiting for a challenger");
        }
        drop(st);
        tokio::spawn(game::begin(self.app.clone(), at.clone(), None));
        Ok(())
    }

    fn call_bot(&self) -> Reply {
        let at = self.room.as_ref().ok_or("Not in a room")?;
        let mut st = self.app.lock();
        let r = at.get_mut(&mut st.rooms).ok_or("Not in a room")?;
        if r.seat_of(&self.conn) != Some(0) || r.status != Status::Waiting || r.seats.len() != 1 {
            return Err("Only a host waiting alone can call a bot");
        }
        if r.match_id.is_some() {
            return Err("Bots can't join on-chain rooms");
        }
        if !r.public && !r.view {
            return Err("Make the room public or watchable to call a bot");
        }
        r.wants_bot = true;
        st.lobby.push(&self.app);
        Ok(())
    }

    fn chat(&mut self, m: &Value) {
        let text: String = str_of(&m["text"], usize::MAX)
            .trim()
            .chars()
            .take(CHAT_MAX)
            .collect();
        if text.is_empty() || self.last_chat.is_some_and(|t| t.elapsed() < CHAT_GAP) {
            return;
        }
        let Some(at) = &self.room else { return };
        let mut st = self.app.lock();
        let Some(r) = at.get_mut(&mut st.rooms) else {
            return;
        };
        let (from, seat) = match r.seat_of(&self.conn) {
            Some(i) => (r.seats[i].name.clone(), i as i32),
            None if self.watcher.is_empty() => ("Spectator".into(), -1),
            None => (self.watcher.clone(), -1),
        };
        self.last_chat = Some(Instant::now());
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_millis() as u64);
        let line = json!({ "from": from, "seat": seat, "text": text, "ts": ts });
        let mut msg = line.clone();
        msg["t"] = "chat".into();
        broadcast(r.everyone(), &msg);
        r.add_chat(line);
    }

    fn relay(&self, raw: &Utf8Bytes) {
        let Some(at) = &self.room else { return };
        let mut st = self.app.lock();
        let Some(r) = at.get_mut(&mut st.rooms) else {
            return;
        };
        if let Some(other) = r.seat_of(&self.conn).and_then(|i| r.opponent(i)) {
            other.send_text(raw.clone());
        }
    }

    fn close(self) {
        let mut st = self.app.lock();
        let st = &mut *st;
        st.lobby.subs.remove(&self.conn.id);
        let Some(at) = self.room else { return };
        let Some(r) = at.get_mut(&mut st.rooms) else {
            return;
        };
        match r.seat_of(&self.conn) {
            None => {
                r.spectators.remove(&self.conn.id);
            }
            // host left, or `match` room (its no_show tracks the 1st arrival): room goes away
            Some(i) if r.status == Status::Waiting && (i == 0 || r.no_show.is_some()) => {
                let r = st.rooms.remove(&at.code).expect("just found");
                broadcast(
                    r.everyone().filter(|c| c.id != self.conn.id),
                    &json!({ "t": "left" }),
                );
                return st.lobby.push(&self.app);
            }
            Some(i) if r.status == Status::Waiting => {
                r.seats.remove(i);
                // TODO(solana): paid guest left a chain room -> refund + reopen (was `unjoin`).
            }
            Some(i) => {
                r.seats[i].conn = None;
                if let Some(other) = r.opponent(i) {
                    other.send(&json!({ "t": "left" }));
                }
            }
        }
        r.push_state();
        st.lobby.push(&self.app);
    }
}
