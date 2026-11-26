// Two clients join a room; one plays a card; both get the same apply_tick (= server tick + APPLY_DELAY) and the same seed.
// A seat that stops acking pauses the clock; acking again resumes it.
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
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
            let _ = sink.send(Message::Text(v.to_string().into())).await;
        }
    });
    tokio::spawn(async move {
        while let Some(Ok(Message::Text(t))) = stream.next().await {
            let _ = in_tx.send(serde_json::from_str::<Value>(&t).unwrap());
        }
    });
    (out_tx, in_rx)
}

async fn until_any(rx: &mut Rx) -> Value {
    tokio::time::timeout(Duration::from_secs(8), rx.recv()).await.expect("timeout").expect("closed")
}

async fn until(rx: &mut Rx, t: &str) -> Value {
    loop {
        let v = tokio::time::timeout(Duration::from_secs(8), rx.recv()).await.expect("timeout").expect("closed");
        if v["t"] == t {
            return v;
        }
    }
}

async fn pair() -> (Tx, Rx, Tx, Rx) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("ws://{}", listener.local_addr().unwrap());
    let app = monster_siege_server::App::new();
    tokio::spawn(async move { axum::serve(listener, monster_siege_server::router(app)).await });

    let lo = json!({ "deck": [] });
    let (h, mut rh) = client(&url).await;
    h.send(json!({ "t": "host", "name": "ann", "loadout": lo })).unwrap();
    let code = until(&mut rh, "room").await["code"].as_str().unwrap().to_string();
    let (g, mut rg) = client(&url).await;
    g.send(json!({ "t": "join", "code": code, "name": "ben", "loadout": lo })).unwrap();
    assert_eq!(until(&mut rg, "room").await["seat"], 1);
    (h, rh, g, rg)
}

#[tokio::test]
async fn laggy_seat_pauses_clock_then_resumes() {
    let (h, mut rh, g, mut rg) = pair().await;
    until(&mut rh, "start").await;
    // host acks every beat, guest goes silent → pause names the guest
    let p = loop {
        let v = until_any(&mut rh).await;
        if v["t"] == "beat" {
            h.send(json!({ "t": "ack", "tick": v["tick"] })).unwrap();
        } else if v["t"] == "pause" {
            break v;
        }
    };
    assert_eq!((p["on"].clone(), p["seat"].clone()), (json!(true), json!(1)));
    assert_eq!(until(&mut rg, "pause").await["on"], true);
    // guest acks past the clock (clamped) → resume
    g.send(json!({ "t": "ack", "tick": 1_000_000 })).unwrap();
    assert_eq!(until(&mut rh, "pause").await["on"], false);
}

#[tokio::test]
async fn play_reaches_both_with_same_apply_tick() {
    let (h, mut rh, _g, mut rg) = pair().await;

    let (sh, sg) = (until(&mut rh, "start").await, until(&mut rg, "start").await);
    assert_eq!(sh["seed"], sg["seed"]);
    assert_eq!(sh["loadouts"], sg["loadouts"]);
    let beat = until(&mut rh, "beat").await["tick"].as_u64().unwrap();

    h.send(json!({ "t": "play", "card": 3, "x2": 23, "y": 2 })).unwrap();
    let (ph, pg) = (until(&mut rh, "play").await, until(&mut rg, "play").await);
    assert_eq!(ph, pg);
    assert_eq!((ph["seat"].clone(), ph["card"].clone(), ph["x2"].clone(), ph["y"].clone()), (json!(0), json!(3), json!(23), json!(2)));
    let at = ph["apply_tick"].as_u64().unwrap();
    assert!(at >= beat + monster_siege_server::APPLY_DELAY, "apply_tick {at} after beat {beat}");

    // every beat a client sees after the play keeps the lockstep invariant: play arrives before beat >= apply_tick
    let next = until(&mut rg, "beat").await["tick"].as_u64().unwrap();
    assert!(next < at + 3);
}
