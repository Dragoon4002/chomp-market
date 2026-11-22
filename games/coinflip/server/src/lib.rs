//! Coinflip server: one commit-reveal coin + one chatroom per platform matchId. Plain JSON over HTTP
//! (the client polls every 1 s), shape set by games/coinflip/client/src/lib/api.ts.
//!
//! - `POST /room {matchId, account, side, auth}`: host binds a side to its open match. Server picks a 32-byte
//!   seed, publishes `commit = sha256(seed)`. auth = wallet signature over `coinflip:<id>:<side>`.
//! - `GET /rooms`, `GET /room/{id}`: `{matchId, side, commit, result?, seed?, clientSeed?, bot}`; seed only after the flip.
//! - `POST /flip {matchId, account, clientSeed, auth}`: a seated player of the live match supplies the client seed
//!   (first one wins). `result = sha256(seed ‖ clientSeed)[0] & 1`, winner seat = 0 if result == host side,
//!   else 1 (TODO(solana): post result on-chain). auth = wallet signature over `coinflip:<id>:<clientSeed>`.
//! - `GET /chat/{id}?since=<ts>` -> `[{from, text, ts}]` newer than `since`; `POST /chat/{id} {from, text}`.
//!   Last 50 lines per room, text <= 200 chars, `from` is display only.
//!
//! Signature nonce = sha256(message) (the client can't get a server nonce over plain HTTP).
//! Without CONTRACT_ID: dev mode, no chain checks and nothing reported.
use axum::extract::{Path, Query, Request, State};
use axum::http::{HeaderValue, Method, StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use chain::Chain;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const GAME: &str = "coinflip";
const CHAT_MAX: usize = 200;
const CHAT_KEEP: usize = 50;
// ponytail: per-room gap (no sockets to rate-limit per sender); per-IP limit if a room gets spammed
const CHAT_GAP: Duration = Duration::from_millis(250);
/// Contract expires unsettled matches after 2 h; rooms older than this are dropped.
const ROOM_TTL: Duration = Duration::from_secs(3 * 3600);

struct Room {
    side: u8,
    seed: [u8; 32],
    client_seed: Option<String>,
    result: Option<u8>,
    chat: VecDeque<Value>,
    last_chat: Option<Instant>,
    born: Instant,
}

impl Room {
    fn new(side: u8) -> Self {
        Room {
            side,
            seed: rand::random(),
            client_seed: None,
            result: None,
            chat: VecDeque::new(),
            last_chat: None,
            born: Instant::now(),
        }
    }

    fn view(&self, id: u64) -> Value {
        let mut v = json!({ "matchId": id, "side": self.side, "commit": hex(&Sha256::digest(self.seed)), "bot": false });
        if let Some(r) = self.result {
            v["result"] = r.into();
            v["seed"] = hex(&self.seed).into();
            v["clientSeed"] = self.client_seed.clone().into();
        }
        v
    }
}

/// 0 heads, 1 tails. Same as client lib/flip.ts.
pub fn flip(seed: &[u8], client_seed: &str) -> u8 {
    Sha256::new()
        .chain_update(seed)
        .chain_update(client_seed.as_bytes())
        .finalize()[0]
        & 1
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

fn match_id(v: &Value) -> Option<u64> {
    v.as_u64().or_else(|| v.as_str()?.parse().ok())
}

type Res = Result<Json<Value>, (StatusCode, Json<Value>)>;

fn bad(msg: &str) -> (StatusCode, Json<Value>) {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": msg })))
}

pub struct App {
    chain: Arc<Chain>,
    // ponytail: one global lock over all rooms; per-room locks if match count gets large
    rooms: Mutex<HashMap<u64, Room>>,
}

impl App {
    pub fn new(chain: Arc<Chain>) -> Arc<Self> {
        Arc::new(App {
            chain,
            rooms: Mutex::default(),
        })
    }

    /// Chain match must be ours, in `status`, with `account` seated per `seated`, and auth must sign `msg`.
    async fn check(
        &self,
        id: u64,
        m: &Value,
        msg: &str,
        status: &str,
        seated: fn(&Value, &str) -> bool,
    ) -> Result<(), &'static str> {
        if self.chain.contract.is_empty() {
            return Ok(());
        }
        let account = m["account"].as_str().unwrap_or("");
        let cm: Value = self
            .chain
            .view(&self.chain.contract, "get_match", json!({ "match_id": id }))
            .await
            .ok_or("match not found")?;
        if cm["game"] != GAME
            || cm["status"] != status
            || account.is_empty()
            || !seated(&cm, account)
        {
            return Err("not your coinflip match");
        }
        let nonce: [u8; 32] = Sha256::digest(msg).into();
        if !self.chain.verify_auth(&m["auth"], account, msg, nonce).await {
            return Err("wallet signature check failed");
        }
        Ok(())
    }
}

pub fn router(app: Arc<App>) -> Router {
    Router::new()
        .route("/rooms", get(rooms))
        .route("/room", post(create))
        .route("/room/{id}", get(room))
        .route("/flip", post(do_flip))
        .route("/chat/{id}", get(chat_log).post(chat_post))
        .layer(middleware::from_fn(cors))
        .with_state(app)
}

async fn cors(req: Request, next: Next) -> Response {
    let mut res = if req.method() == Method::OPTIONS {
        StatusCode::NO_CONTENT.into_response()
    } else {
        next.run(req).await
    };
    let h = res.headers_mut();
    let any = HeaderValue::from_static("*");
    h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, any.clone());
    h.insert(header::ACCESS_CONTROL_ALLOW_HEADERS, any);
    h.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, POST"),
    );
    res
}

async fn rooms(State(app): State<Arc<App>>) -> Json<Value> {
    let rooms = app.rooms.lock().unwrap();
    Json(rooms.iter().map(|(id, r)| r.view(*id)).collect())
}

async fn room(State(app): State<Arc<App>>, Path(id): Path<u64>) -> Res {
    let rooms = app.rooms.lock().unwrap();
    let r = rooms
        .get(&id)
        .ok_or((StatusCode::NOT_FOUND, Json(json!({ "error": "no room" }))))?;
    Ok(Json(r.view(id)))
}

async fn create(State(app): State<Arc<App>>, Json(m): Json<Value>) -> Res {
    let id = match_id(&m["matchId"]).ok_or(bad("bad matchId"))?;
    let side = m["side"]
        .as_u64()
        .filter(|s| *s < 2)
        .ok_or(bad("side must be 0 or 1"))? as u8;
    let msg = format!("{GAME}:{id}:{side}");
    app.check(id, &m, &msg, "open", |cm, a| cm["host"] == a)
        .await
        .map_err(bad)?;
    let mut rooms = app.rooms.lock().unwrap();
    rooms.retain(|_, r| r.born.elapsed() < ROOM_TTL);
    if rooms.contains_key(&id) {
        return Err(bad("room already exists"));
    }
    let r = rooms.entry(id).or_insert(Room::new(side));
    Ok(Json(r.view(id)))
}

async fn do_flip(State(app): State<Arc<App>>, Json(m): Json<Value>) -> Res {
    let id = match_id(&m["matchId"]).ok_or(bad("bad matchId"))?;
    let cs = m["clientSeed"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 64)
        .ok_or(bad("bad clientSeed"))?;
    let msg = format!("{GAME}:{id}:{cs}");
    app.check(id, &m, &msg, "live", |cm, a| {
        cm["host"] == a || cm["guest"] == a
    })
    .await
    .map_err(bad)?;
    let mut rooms = app.rooms.lock().unwrap();
    let r = rooms.get_mut(&id).ok_or(bad("no room"))?;
    if r.result.is_none() {
        let result = flip(&r.seed, cs);
        r.result = Some(result);
        r.client_seed = Some(cs.into());
        // TODO(solana): post winner seat (`result == r.side` -> 0, else 1) on-chain (was report_result).
    }
    Ok(Json(r.view(id)))
}

async fn chat_log(
    State(app): State<Arc<App>>,
    Path(id): Path<u64>,
    Query(q): Query<HashMap<String, String>>,
) -> Res {
    let since: u64 = q.get("since").and_then(|s| s.parse().ok()).unwrap_or(0);
    let rooms = app.rooms.lock().unwrap();
    let r = rooms.get(&id).ok_or(bad("no room"))?;
    let lines: Vec<&Value> = r
        .chat
        .iter()
        .filter(|l| l["ts"].as_u64() > Some(since))
        .collect();
    Ok(Json(json!(lines)))
}

async fn chat_post(State(app): State<Arc<App>>, Path(id): Path<u64>, Json(m): Json<Value>) -> Res {
    let clip = |v: &Value, n| {
        v.as_str()
            .unwrap_or("")
            .trim()
            .chars()
            .take(n)
            .collect::<String>()
    };
    let text = clip(&m["text"], CHAT_MAX);
    let from = Some(clip(&m["from"], 24))
        .filter(|f| !f.is_empty())
        .unwrap_or("Guest".into());
    let mut rooms = app.rooms.lock().unwrap();
    let r = rooms.get_mut(&id).ok_or(bad("no room"))?;
    if text.is_empty() || r.last_chat.is_some_and(|t| t.elapsed() < CHAT_GAP) {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({ "error": "slow down" })),
        ));
    }
    r.last_chat = Some(Instant::now());
    // strictly increasing ts so `since` polling never skips a line
    let ts = now_ms().max(
        r.chat
            .back()
            .and_then(|l| l["ts"].as_u64())
            .map_or(0, |t| t + 1),
    );
    let line = json!({ "from": from, "text": text, "ts": ts });
    if r.chat.len() == CHAT_KEEP {
        r.chat.pop_front();
    }
    r.chat.push_back(line.clone());
    Ok(Json(line))
}
