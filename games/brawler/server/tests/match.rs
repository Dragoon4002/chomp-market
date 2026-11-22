// E2E: host + join + begin free room, golden KO tape -> {t:'over', reason:'ko'}; rematch restarts the same room.
// Room lobby: set, chat, begin guards, leaving while waiting.
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// Client: auto-answers pings, other msgs -> rx; send via returned tx (`{t:'__close'}` closes the socket).
async fn client(url: &str) -> (mpsc::UnboundedSender<Value>, mpsc::UnboundedReceiver<Value>) {
    let (ws, _) = connect_async(url).await.unwrap();
    let (mut sink, mut stream) = ws.split();
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Value>();
    let (in_tx, in_rx) = mpsc::unbounded_channel();
    let pong = out_tx.clone();
    tokio::spawn(async move {
        while let Some(v) = out_rx.recv().await {
            if v["t"] == "__close" {
                return sink.close().await.unwrap();
            }
            sink.send(Message::Text(v.to_string().into()))
                .await
                .unwrap();
        }
    });
    tokio::spawn(async move {
        while let Some(Ok(Message::Text(t))) = stream.next().await {
            let v: Value = serde_json::from_str(&t).unwrap();
            if v["t"] == "ping" {
                pong.send(json!({ "t": "pong" })).unwrap();
            } else {
                in_tx.send(v).unwrap();
            }
        }
    });
    (out_tx, in_rx)
}

async fn next(rx: &mut mpsc::UnboundedReceiver<Value>) -> Value {
    tokio::time::timeout(std::time::Duration::from_secs(10), rx.recv())
        .await
        .expect("timeout")
        .expect("closed")
}

async fn until(rx: &mut mpsc::UnboundedReceiver<Value>, t: &str) -> Value {
    loop {
        let v = next(rx).await;
        if v["t"] == t {
            return v;
        }
    }
}

type Tx = mpsc::UnboundedSender<Value>;
type Rx = mpsc::UnboundedReceiver<Value>;

async fn serve() -> String {
    let chain = Arc::new(chain::Chain::default());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("ws://{}", listener.local_addr().unwrap());
    static N: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
    let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!("brawler-test-{}-{n}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let history = dir.join("h.jsonl").to_string_lossy().into_owned();
    let app = brawler_server::App::with_history(chain, String::new(), history);
    tokio::spawn(async move {
        axum::serve(listener, brawler_server::router(app))
            .await
            .unwrap()
    });
    url
}

fn golden() -> Value {
    let g: Value = serde_json::from_str(include_str!("../../sim/testdata/golden.json")).unwrap();
    g["runs"][4].clone()
}

/// Host + join (optionally on-chain matchId, unchecked w/o a contract), seated in the waiting room.
async fn seated(url: &str, run: &Value, match_id: Value) -> (Tx, Rx, Tx, Rx, Value) {
    let (a, mut ar) = client(url).await;
    let (b, mut br) = client(url).await;
    until(&mut ar, "hello").await;
    until(&mut br, "hello").await;
    a.send(json!({ "account": "a.testnet", "t": "host", "name": "A", "dna": run["dna"][0], "stage": run["stage"], "pub": true, "matchId": match_id, "stake": "5" }))
        .unwrap();
    let code = until(&mut ar, "room").await["code"].clone();
    let rs = until(&mut ar, "roomstate").await;
    assert_eq!(
        (rs["status"].as_str(), rs["stake"].as_str()),
        (Some("waiting"), Some("5"))
    );
    assert_eq!(rs["seats"].as_array().unwrap().len(), 1);
    until(&mut ar, "chatlog").await;
    b.send(json!({ "account": "b.testnet", "t": "join", "code": code, "name": "B", "dna": run["dna"][1] }))
        .unwrap();
    assert_eq!(until(&mut br, "room").await["seat"], 1);
    until(&mut br, "chatlog").await;
    let rs = until(&mut ar, "roomstate").await;
    assert_eq!(rs["seats"][1]["name"], "B");
    assert_eq!(rs["seats"][1]["connected"], true);
    (a, ar, b, br, code)
}

/// `seated` + host `begin`, both got `start`.
async fn pair(url: &str, run: &Value, match_id: Value) -> (Tx, Rx, Tx, Rx, Value) {
    let (a, mut ar, b, mut br, code) = seated(url, run, match_id).await;
    a.send(json!({ "t": "begin" })).unwrap();
    let (sa, sb) = (until(&mut ar, "start").await, until(&mut br, "start").await);
    assert_eq!(
        (sa["seat"].as_u64(), sb["seat"].as_u64()),
        (Some(0), Some(1))
    );
    assert!((3..=15).contains(&sa["delay"].as_u64().unwrap()));
    (a, ar, b, br, code)
}

async fn play_ko(run: &Value, a: &Tx, ar: &mut Rx, b: &Tx, br: &mut Rx) {
    let tape: Vec<Value> = run["tape"].as_array().unwrap().clone();
    for (i, chunk) in tape.chunks(600).enumerate() {
        let msg = json!({ "t": "tape", "f0": i * 600, "ins": chunk });
        a.send(msg.clone()).unwrap();
        b.send(msg).unwrap();
    }
    let over = until(ar, "over").await;
    assert_eq!(over["reason"], "ko");
    assert_eq!(over["winner"], run["winner"]);
    assert_eq!(until(br, "over").await["winner"], run["winner"]);
}

#[tokio::test(flavor = "multi_thread")]
async fn free_room_to_ko() {
    let url = serve().await;
    let run = golden();
    let (a, mut ar, b, mut br, _) = pair(&url, &run, Value::Null).await;
    play_ko(&run, &a, &mut ar, &b, &mut br).await;
    let h = http_get(&url, "/history/b.testnet").await;
    assert_eq!(h.as_array().unwrap().len(), 1);
    assert_eq!(h[0]["players"][0]["account"], "a.testnet");
    assert_eq!(h[0]["players"][1]["account"], "b.testnet");
    assert_eq!(h[0]["winner"], run["winner"]);
    assert_eq!(h[0]["stake"], "5");
    let key = h[0]["key"].as_str().unwrap();
    assert!(key.starts_with('r'));
    let tape = http_get(&url, &format!("/tape/{key}")).await;
    assert_eq!(tape["frames"], run["tape"]);
    assert_eq!(tape["stage"], run["stage"]);
    assert_eq!(tape["winner"], run["winner"]);
    assert_eq!(tape["reason"], "ko");
    assert_eq!(tape["players"][1]["dna"], run["dna"][1]);
    let frames = run["tape"].as_array().unwrap().iter();
    let hash = brawler_server::referee::tape_hash(
        run["stage"].as_str().unwrap(),
        frames.map(|f| f.as_u64().unwrap() as u32),
    );
    assert_eq!(tape["tape_hash"], hash);
    assert_eq!(
        http_status(&url, "/tape/nope").await,
        404,
        "missing tape is a 404"
    );
    assert_eq!(http_status(&url, "/tape/..%2Fh").await, 404);
    assert!(
        http_get(&url, "/history/nobody.testnet")
            .await
            .as_array()
            .unwrap()
            .is_empty()
    );
}

async fn http_get(ws_url: &str, path: &str) -> Value {
    let buf = http_raw(ws_url, path).await;
    serde_json::from_str(buf.split("\r\n\r\n").nth(1).unwrap()).unwrap()
}

async fn http_status(ws_url: &str, path: &str) -> u16 {
    let buf = http_raw(ws_url, path).await;
    buf.split(' ').nth(1).unwrap().parse().unwrap()
}

async fn http_raw(ws_url: &str, path: &str) -> String {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let host = ws_url.trim_start_matches("ws://");
    let mut s = tokio::net::TcpStream::connect(host).await.unwrap();
    s.write_all(
        format!("GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n").as_bytes(),
    )
    .await
    .unwrap();
    let mut buf = String::new();
    s.read_to_string(&mut buf).await.unwrap();
    buf
}

fn send_tape(tx: &Tx, tape: &[Value], from: usize, to: usize) {
    for f0 in (from..to).step_by(100) {
        let ins = &tape[f0..to.min(f0 + 100)];
        tx.send(json!({ "t": "tape", "f0": f0, "ins": ins }))
            .unwrap();
    }
}

// Guest drops mid-fight, same account rejoins: host flushes + resyncs, guest resumes from the host's tape, KO counts.
#[tokio::test(flavor = "multi_thread")]
async fn rejoin_resumes_fight() {
    let url = serve().await;
    let run = golden();
    let tape = run["tape"].as_array().unwrap().clone();
    let (a, mut ar, b, br, code) = pair(&url, &run, Value::Null).await;
    send_tape(&a, &tape, 0, 300);
    send_tape(&b, &tape, 0, 200); // guest's last batches never reached the server
    b.send(json!({ "t": "__close" })).unwrap();
    until(&mut ar, "left").await;
    drop(br);
    let (c, mut cr) = client(&url).await;
    until(&mut cr, "hello").await;
    c.send(json!({ "t": "rejoin", "code": code, "account": "a.testnet" }))
        .unwrap();
    assert_eq!(
        err(&mut cr).await,
        "Opponent is gone",
        "a's own seat is live"
    );
    c.send(json!({ "t": "rejoin", "code": "ZZZZ", "account": "b.testnet" }))
        .unwrap();
    assert_eq!(err(&mut cr).await, "No live fight to rejoin");
    c.send(json!({ "t": "rejoin", "code": code, "account": "b.testnet" }))
        .unwrap();
    until(&mut ar, "rejoin").await;
    a.send(json!({ "t": "resync" })).unwrap();
    let r = until(&mut cr, "resume").await;
    assert_eq!(r["seat"], 1);
    assert_eq!(r["stage"], run["stage"]);
    assert_eq!(r["players"][0]["dna"], run["dna"][0]);
    assert_eq!(r["frames"].as_array().unwrap()[..], tape[..300]);
    send_tape(&a, &tape, 300, tape.len());
    send_tape(&c, &tape, 300, tape.len());
    let over = until(&mut cr, "over").await;
    assert_eq!(
        (over["reason"].as_str(), &over["winner"]),
        (Some("ko"), &run["winner"])
    );
    assert_eq!(until(&mut ar, "over").await["winner"], run["winner"]);
}

#[tokio::test(flavor = "multi_thread")]
async fn play_needs_wallet() {
    let url = serve().await;
    let (a, mut ar) = client(&url).await;
    a.send(json!({ "t": "host", "name": "A" })).unwrap();
    assert_eq!(err(&mut ar).await, "Connect your wallet to play");
    a.send(json!({ "t": "join", "code": "ABCD", "name": "A" }))
        .unwrap();
    assert_eq!(err(&mut ar).await, "Connect your wallet to play");
}

#[tokio::test(flavor = "multi_thread")]
async fn rematch_restarts_room() {
    let url = serve().await;
    let run = golden();
    let (a, mut ar, b, mut br, code) = pair(&url, &run, Value::Null).await;
    let (w, mut wr) = client(&url).await;
    w.send(json!({ "t": "watch", "code": code })).unwrap();
    until(&mut wr, "spec").await;
    w.send(json!({ "t": "rematch" })).unwrap();
    assert_eq!(
        until(&mut wr, "error").await["msg"],
        "Spectators can't rematch"
    );
    a.send(json!({ "t": "rematch" })).unwrap();
    assert_eq!(until(&mut ar, "error").await["msg"], "Match is not over");

    play_ko(&run, &a, &mut ar, &b, &mut br).await;
    a.send(json!({ "t": "rematch" })).unwrap();
    until(&mut br, "rematch").await;
    b.send(json!({ "t": "rematch" })).unwrap();
    let (sa, sb) = (until(&mut ar, "start").await, until(&mut br, "start").await);
    assert_eq!(
        (sa["seat"].as_u64(), sb["seat"].as_u64()),
        (Some(0), Some(1))
    );
    let spec = until(&mut wr, "spec").await;
    assert_eq!(spec["status"], "live");
    assert_eq!(spec["frames"].as_array().unwrap().len(), 0);
    play_ko(&run, &a, &mut ar, &b, &mut br).await;
}

#[tokio::test(flavor = "multi_thread")]
async fn on_chain_room_rejected_without_contract() {
    let url = serve().await;
    let run = golden();
    let (a, mut ar) = client(&url).await;
    until(&mut ar, "hello").await;
    a.send(json!({ "account": "a.testnet", "t": "host", "name": "A", "dna": run["dna"][0], "stage": run["stage"], "pub": true, "matchId": 7 }))
        .unwrap();
    let msg = until(&mut ar, "error").await["msg"].clone();
    assert!(
        msg.as_str()
            .unwrap()
            .starts_with("This server has no contract configured")
    );
}

async fn err(rx: &mut Rx) -> String {
    until(rx, "error").await["msg"].as_str().unwrap().into()
}

async fn watcher(url: &str, code: &Value, account: &str) -> (Tx, Rx) {
    let (w, mut wr) = client(url).await;
    w.send(json!({ "t": "watch", "code": code, "account": account }))
        .unwrap();
    until(&mut wr, "spec").await;
    until(&mut wr, "roomstate").await;
    (w, wr)
}

#[tokio::test(flavor = "multi_thread")]
async fn set_updates_roomstate() {
    let url = serve().await;
    let run = golden();
    let (a, mut ar, b, mut br, _) = seated(&url, &run, Value::Null).await;
    let dna = run["dna"][0].clone();
    b.send(json!({ "t": "set", "name": "B2", "dna": dna }))
        .unwrap();
    let rs = until(&mut ar, "roomstate").await;
    assert_eq!(rs["seats"][1]["name"], "B2");
    assert_eq!(rs["seats"][1]["dna"], rs["seats"][0]["dna"]);
    b.send(json!({ "t": "set", "stage": "ember" })).unwrap();
    assert_eq!(err(&mut br).await, "Only the host can change the arena");
    a.send(json!({ "t": "set", "stage": "nope" })).unwrap();
    assert_eq!(err(&mut ar).await, "Unknown arena");
    let stage = if run["stage"] == "ember" {
        "grove"
    } else {
        "ember"
    };
    a.send(json!({ "t": "set", "stage": stage })).unwrap();
    assert_eq!(until(&mut br, "roomstate").await["stage"], stage);
    a.send(json!({ "t": "begin" })).unwrap();
    until(&mut ar, "start").await;
    b.send(json!({ "t": "set", "name": "late" })).unwrap();
    assert_eq!(err(&mut br).await, "Match already started");
}

#[tokio::test(flavor = "multi_thread")]
async fn chat_reaches_room_and_late_watcher() {
    let url = serve().await;
    let run = golden();
    let (a, mut ar, b, mut br, code) = seated(&url, &run, Value::Null).await;
    let (w, mut wr) = watcher(&url, &code, "bob.sol").await;
    a.send(json!({ "t": "chat", "text": "  hi  " })).unwrap();
    for rx in [&mut ar, &mut br, &mut wr] {
        let c = until(rx, "chat").await;
        assert_eq!(
            (c["from"].as_str(), c["seat"].as_i64(), c["text"].as_str()),
            (Some("A"), Some(0), Some("hi"))
        );
        assert!(c["ts"].as_u64().unwrap() > 0);
    }
    w.send(json!({ "t": "chat", "text": "go B" })).unwrap();
    let c = until(&mut ar, "chat").await;
    assert_eq!(
        (c["from"].as_str(), c["seat"].as_i64()),
        (Some("bob.sol"), Some(-1))
    );
    // 2nd msg inside 500 ms dropped; the `set` after it on the same socket proves it was processed
    b.send(json!({ "t": "chat", "text": "x".repeat(300) }))
        .unwrap();
    b.send(json!({ "t": "chat", "text": "spam" })).unwrap();
    b.send(json!({ "t": "chat", "text": "   " })).unwrap();
    b.send(json!({ "t": "set", "name": "B2" })).unwrap();
    let mut chats = vec![];
    loop {
        let v = next(&mut ar).await;
        if v["t"] == "chat" {
            chats.push(v["text"].as_str().unwrap().to_string());
        } else if v["t"] == "roomstate" && v["seats"][1]["name"] == "B2" {
            break;
        }
    }
    assert_eq!(chats, ["x".repeat(200)]);
    let (l, mut lr) = watcher(&url, &code, "").await;
    let log = until(&mut lr, "chatlog").await;
    let texts: Vec<&str> = log["lines"]
        .as_array()
        .unwrap()
        .iter()
        .map(|x| x["text"].as_str().unwrap())
        .collect();
    assert_eq!(texts, ["hi", "go B", &"x".repeat(200)]);
    l.send(json!({ "t": "chat", "text": "anon" })).unwrap();
    assert_eq!(until(&mut ar, "chat").await["from"], "Spectator");
}

#[tokio::test(flavor = "multi_thread")]
async fn begin_guards() {
    let url = serve().await;
    let run = golden();
    let (a, mut ar) = client(&url).await;
    a.send(json!({ "account": "a.testnet", "t": "host", "name": "A" }))
        .unwrap();
    let code = until(&mut ar, "room").await["code"].clone();
    a.send(json!({ "t": "begin" })).unwrap();
    assert_eq!(err(&mut ar).await, "Waiting for a challenger");
    let (b, mut br) = client(&url).await;
    b.send(json!({ "account": "b.testnet", "t": "join", "code": code, "dna": run["dna"][1] }))
        .unwrap();
    until(&mut br, "room").await;
    b.send(json!({ "t": "begin" })).unwrap();
    assert_eq!(err(&mut br).await, "Only the host can start");
}

#[tokio::test(flavor = "multi_thread")]
async fn guest_leave_frees_seat() {
    let url = serve().await;
    let run = golden();
    let (_a, mut ar, b, _br, code) = seated(&url, &run, Value::Null).await;
    b.send(json!({ "t": "__close" })).unwrap();
    let rs = until(&mut ar, "roomstate").await;
    assert_eq!(rs["status"], "waiting");
    assert_eq!(rs["seats"].as_array().unwrap().len(), 1);
    let (c, mut cr) = client(&url).await;
    c.send(json!({ "account": "c.testnet", "t": "join", "code": code, "name": "C" }))
        .unwrap();
    assert_eq!(until(&mut cr, "room").await["seat"], 1);
    assert_eq!(until(&mut ar, "roomstate").await["seats"][1]["name"], "C");
}

#[tokio::test(flavor = "multi_thread")]
async fn host_leave_closes_room() {
    let url = serve().await;
    let run = golden();
    let (a, _ar, b, mut br, code) = seated(&url, &run, Value::Null).await;
    a.send(json!({ "t": "__close" })).unwrap();
    until(&mut br, "left").await;
    b.send(json!({ "t": "peek", "code": code })).unwrap();
    assert!(until(&mut br, "peek").await["room"].is_null());
}

#[tokio::test(flavor = "multi_thread")]
async fn call_bot_flags_room_in_lobby() {
    let url = serve().await;
    let (a, mut ar) = client(&url).await;
    a.send(json!({ "t": "host", "name": "A", "account": "a.testnet", "pub": true }))
        .unwrap();
    let code = until(&mut ar, "room").await["code"].clone();
    let (l, mut lr) = client(&url).await;
    l.send(json!({ "t": "lobby" })).unwrap();
    assert_eq!(until(&mut lr, "lobby").await["rooms"][0]["wantsBot"], false);
    a.send(json!({ "t": "callbot" })).unwrap();
    assert_eq!(until(&mut lr, "lobby").await["rooms"][0]["wantsBot"], true);
    let (b, mut br) = client(&url).await;
    b.send(json!({ "t": "join", "code": code, "name": "Bot", "account": "bot-1.brawler" }))
        .unwrap();
    until(&mut br, "roomstate").await;
    let row = loop {
        let m = until(&mut lr, "lobby").await;
        if m["rooms"][0]["players"].as_array().unwrap().len() == 2 {
            break m;
        }
    };
    assert_eq!(row["rooms"][0]["wantsBot"], false);
    b.send(json!({ "t": "callbot" })).unwrap();
    assert_eq!(
        err(&mut br).await,
        "Only a host waiting alone can call a bot"
    );
}
