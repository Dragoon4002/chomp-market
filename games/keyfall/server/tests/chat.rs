// Two rooms in one server: chat reaches both seats of its own room only; rejoin replays the backlog.
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
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

async fn until(rx: &mut Rx, t: &str) -> Value {
    loop {
        let v = tokio::time::timeout(Duration::from_secs(5), rx.recv())
            .await
            .expect("timeout")
            .expect("closed");
        if v["t"] == t {
            return v;
        }
    }
}

#[tokio::test]
async fn chat_per_room() {
    let near = Arc::new(near_svc::Near::new(
        "http://127.0.0.1:9",
        String::new(),
        None,
    ));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("ws://{}", listener.local_addr().unwrap());
    let app = keyfall_server::App::new(near);
    tokio::spawn(async move { axum::serve(listener, keyfall_server::router(app)).await });

    let (h, mut rh) = client(&url).await;
    h.send(json!({ "t": "host", "name": "ann" })).unwrap();
    let code = until(&mut rh, "room").await["code"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(until(&mut rh, "chatlog").await["lines"], json!([]));
    let (o, mut ro) = client(&url).await; // other room
    o.send(json!({ "t": "host", "name": "olga" })).unwrap();
    until(&mut ro, "chatlog").await;

    let (g, mut rg) = client(&url).await;
    g.send(json!({ "t": "join", "code": code, "name": "ben" }))
        .unwrap();
    let token = until(&mut rg, "room").await["token"]
        .as_str()
        .unwrap()
        .to_string();
    until(&mut rg, "chatlog").await;
    g.send(json!({ "t": "chat", "text": " hi ann " })).unwrap();
    g.send(json!({ "t": "chat", "text": "dropped" })).unwrap(); // inside 500 ms gap
    let line = until(&mut rh, "chat").await;
    assert_eq!(
        (
            line["from"].clone(),
            line["seat"].clone(),
            line["text"].clone()
        ),
        (json!("ben"), json!(1), json!("hi ann"))
    );
    assert!(
        tokio::time::timeout(Duration::from_millis(300), until(&mut ro, "chat"))
            .await
            .is_err(),
        "leaked"
    );

    drop((g, rg)); // guest drops, rejoins within grace: gets backlog
    let (g2, mut rg2) = client(&url).await;
    g2.send(json!({ "t": "rejoin", "code": code, "token": token }))
        .unwrap();
    let log = until(&mut rg2, "chatlog").await;
    assert_eq!(log["lines"].as_array().unwrap().len(), 1);
}
