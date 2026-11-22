// Dev mode (no contract): room -> flip -> reveal checks out; chat is per room; vectors match client lib/flip.ts.
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

async fn req(addr: &str, method: &str, path: &str, body: Option<Value>) -> (u16, Value) {
    let mut s = tokio::net::TcpStream::connect(addr).await.unwrap();
    let b = body.map(|b| b.to_string()).unwrap_or_default();
    let head = format!(
        "{method} {path} HTTP/1.1\r\nHost: x\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
        b.len()
    );
    s.write_all((head + &b).as_bytes()).await.unwrap();
    let mut resp = String::new();
    s.read_to_string(&mut resp).await.unwrap();
    let code = resp[9..12].parse().unwrap();
    let body = resp.split("\r\n\r\n").nth(1).unwrap_or("");
    (code, serde_json::from_str(body).unwrap_or(Value::Null))
}

#[test]
fn flip_matches_client() {
    let seed: Vec<u8> = (0..32).collect();
    assert_eq!(
        hex::<32>(Sha256::digest(&seed).into()),
        "630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd"
    );
    for (cs, want) in [("abc", 0), ("x", 0), ("hello", 1), ("q", 0)] {
        assert_eq!(coinflip_server::flip(&seed, cs), want, "{cs}");
    }
}

fn hex<const N: usize>(b: [u8; N]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

#[tokio::test]
async fn rooms_flip_and_chat() {
    let chain = Arc::new(chain::Chain::default());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap().to_string();
    let app = coinflip_server::App::new(chain);
    tokio::spawn(async move { axum::serve(listener, coinflip_server::router(app)).await });

    for (id, side) in [(1, 0), (2, 1)] {
        let (c, r) = req(
            &addr,
            "POST",
            "/room",
            Some(json!({ "matchId": id, "account": "a", "side": side })),
        )
        .await;
        assert_eq!(c, 200);
        assert!(r.get("seed").is_none(), "seed hidden before flip");
    }
    assert_eq!(
        req(
            &addr,
            "POST",
            "/room",
            Some(json!({ "matchId": 1, "side": 1 }))
        )
        .await
        .0,
        400,
        "no side swap"
    );
    assert_eq!(
        req(&addr, "GET", "/rooms", None)
            .await
            .1
            .as_array()
            .unwrap()
            .len(),
        2
    );

    let (_, before) = req(&addr, "GET", "/room/1", None).await;
    let (_, r) = req(
        &addr,
        "POST",
        "/flip",
        Some(json!({ "matchId": "1", "account": "a", "clientSeed": "abc" })),
    )
    .await;
    let seed: Vec<u8> = (0..32)
        .map(|i| u8::from_str_radix(&r["seed"].as_str().unwrap()[i * 2..i * 2 + 2], 16).unwrap())
        .collect();
    assert_eq!(
        hex::<32>(Sha256::digest(&seed).into()),
        before["commit"].as_str().unwrap()
    );
    assert_eq!(r["result"], coinflip_server::flip(&seed, "abc"));
    let (_, again) = req(
        &addr,
        "POST",
        "/flip",
        Some(json!({ "matchId": 1, "clientSeed": "zzz" })),
    )
    .await;
    assert_eq!(again["clientSeed"], "abc", "first flip sticks");

    let (c, l) = req(
        &addr,
        "POST",
        "/chat/1",
        Some(json!({ "from": "ann", "text": " hi " })),
    )
    .await;
    assert_eq!((c, l["text"].clone()), (200, json!("hi")));
    assert_eq!(
        req(&addr, "POST", "/chat/1", Some(json!({ "text": "spam" })))
            .await
            .0,
        429
    );
    assert_eq!(
        req(&addr, "GET", "/chat/1", None)
            .await
            .1
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        req(&addr, "GET", "/chat/2", None).await.1,
        json!([]),
        "rooms don't share chat"
    );
    let ts = l["ts"].as_u64().unwrap();
    assert_eq!(
        req(&addr, "GET", &format!("/chat/1?since={ts}"), None)
            .await
            .1,
        json!([])
    );
    assert_eq!(req(&addr, "OPTIONS", "/room", None).await.0, 204);
}
