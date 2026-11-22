// E2E dev mode: two seats hold dir until match ends; tape replays to same result. Watcher mid-match gets sync then ticks.
use futures_util::{SinkExt, StreamExt};
use ribbon_sim::Sim;
use serde_json::{Value, json};
use std::io::{Read, Write};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

type Tx = mpsc::UnboundedSender<Value>;
type Rx = mpsc::UnboundedReceiver<Value>;

async fn client(url: &str) -> (Tx, Rx) {
    let (ws, _) = connect_async(url).await.unwrap();
    let (mut sink, mut stream) = ws.split();
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Value>();
    let (in_tx, in_rx) = mpsc::unbounded_channel();
    tokio::spawn(async move {
        while let Some(v) = out_rx.recv().await {
            sink.send(Message::Text(v.to_string().into()))
                .await
                .unwrap();
        }
    });
    tokio::spawn(async move {
        while let Some(Ok(Message::Text(t))) = stream.next().await {
            let _ = in_tx.send(serde_json::from_str::<Value>(&t).unwrap());
        }
    });
    (out_tx, in_rx)
}

async fn next(rx: &mut Rx) -> Value {
    tokio::time::timeout(Duration::from_secs(20), rx.recv())
        .await
        .expect("timeout")
        .expect("closed")
}

async fn until(rx: &mut Rx, t: &str) -> Value {
    loop {
        let v = next(rx).await;
        if v["t"] == t {
            return v;
        }
    }
}

/// Returns (ws url, http addr).
async fn serve() -> (String, String) {
    let chain = Arc::new(chain::Chain::default());
    let dir =
        std::env::temp_dir().join(format!("ribbon-test-{}-{}", std::process::id(), rand_id()));
    let app = ribbon_server::App::new(chain, dir, 5);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap().to_string();
    tokio::spawn(async move {
        axum::serve(listener, ribbon_server::router(app))
            .await
            .unwrap()
    });
    (format!("ws://{addr}"), addr)
}

fn rand_id() -> u64 {
    static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
}

async fn seat(url: &str, id: u64, account: &str) -> (Tx, Rx) {
    let (tx, mut rx) = client(url).await;
    let hello = next(&mut rx).await;
    assert_eq!(hello["nonce"].as_str().unwrap().len(), 64);
    tx.send(json!({ "t": "auth", "matchId": id, "account": account }))
        .unwrap();
    (tx, rx)
}

fn ticks(v: &Value) -> Vec<[u8; 2]> {
    serde_json::from_value(v.clone()).unwrap()
}

#[tokio::test(flavor = "multi_thread")] // blocking http GET below
async fn match_plays_to_over_and_tape_replays() {
    let (url, addr) = serve().await;
    let (_a, mut ra) = seat(&url, 7, "alice").await;
    let (b, mut rb) = seat(&url, 7, "bob").await;
    assert_eq!(until(&mut ra, "sync").await["seat"], 0);
    assert_eq!(until(&mut rb, "sync").await["seat"], 1);
    until(&mut ra, "start").await;
    until(&mut rb, "start").await;
    b.send(json!({ "t": "in", "v": 8 | 3 })).unwrap(); // bob boosts into the wall first
    let collect = |mut rx: Rx| async move {
        let mut tape = vec![];
        loop {
            let v = next(&mut rx).await;
            match v["t"].as_str() {
                Some("tick") => {
                    assert_eq!(v["n"], tape.len());
                    tape.push(serde_json::from_value::<[u8; 2]>(v["d"].clone()).unwrap());
                }
                Some("over") => return (tape, v),
                _ => {}
            }
        }
    };
    let ((ta, oa), (tb, ob)) = tokio::join!(collect(ra), collect(rb));
    assert_eq!(ta, tb);
    assert_eq!(oa, ob);
    assert_eq!(ta[0], [7, 11], "boost + dir latched into first tick");

    let mut sim = Sim::new();
    ta.iter().for_each(|&d| sim.step(d));
    assert!(sim.done);
    assert_eq!(oa["winner"], json!(u8::try_from(sim.winner).ok()));
    assert_eq!(oa["kos"], json!(sim.score));
    assert_eq!(oa["reason"], if sim.winner < 0 { "void" } else { "win" });

    let mut s = std::net::TcpStream::connect(&addr).unwrap();
    write!(
        s,
        "GET /tape/7 HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"
    )
    .unwrap();
    let mut resp = String::new();
    s.read_to_string(&mut resp).unwrap();
    let body: Value = serde_json::from_str(resp.split("\r\n\r\n").nth(1).unwrap()).unwrap();
    assert_eq!(ticks(&body["ticks"]), ta);
}

#[tokio::test]
async fn watcher_mid_match_gets_sync_then_ticks() {
    let (url, _) = serve().await;
    let (_a, mut ra) = seat(&url, 9, "alice").await;
    let (_b, _rb) = seat(&url, 9, "bob").await;
    loop {
        let v = next(&mut ra).await;
        if v["t"] == "tick" && v["n"].as_u64() >= Some(5) {
            break;
        }
    }
    let (w, mut rw) = client(&url).await;
    until(&mut rw, "hello").await;
    w.send(json!({ "t": "watch", "matchId": "9" })).unwrap();
    let sync = until(&mut rw, "sync").await;
    assert_eq!(sync["seat"], -1);
    let n = sync["ticks"].as_array().unwrap().len();
    assert!(n >= 6);
    assert_eq!(next(&mut rw).await["t"], "start");
    assert_eq!(until(&mut rw, "tick").await["n"], n);
}

#[tokio::test]
async fn chat_stays_in_its_room_and_replays_to_newcomers() {
    let (url, _) = serve().await;
    let (a, mut ra) = seat(&url, 21, "alice").await;
    let (_c, mut rc) = seat(&url, 22, "carol").await;
    until(&mut ra, "chatlog").await;
    until(&mut rc, "chatlog").await;
    a.send(json!({ "t": "chat", "text": "  gl hf  " })).unwrap();
    a.send(json!({ "t": "chat", "text": "spam" })).unwrap(); // inside 500 ms gap: dropped
    let line = until(&mut ra, "chat").await;
    assert_eq!(
        (
            line["from"].as_str(),
            line["seat"].as_i64(),
            line["text"].as_str()
        ),
        (Some("alice"), Some(0), Some("gl hf"))
    );
    let (w, mut rw) = client(&url).await;
    until(&mut rw, "hello").await;
    w.send(json!({ "t": "watch", "matchId": 21 })).unwrap();
    let log = until(&mut rw, "chatlog").await;
    assert_eq!(log["lines"].as_array().unwrap().len(), 1, "spam dropped");
    w.send(json!({ "t": "chat", "text": "go alice" })).unwrap();
    assert_eq!(until(&mut ra, "chat").await["seat"], -1);
    // room 22 never sees room 21's chat
    let leak = tokio::time::timeout(Duration::from_millis(300), until(&mut rc, "chat")).await;
    assert!(leak.is_err());
}
