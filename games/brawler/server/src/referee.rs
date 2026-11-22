// Replays confirmed input tape w/ same sim as players. On-chain result: signed attestation anyone can `settle` with;
// referee's own report_result only as fallback.
use brawler_sim::{
    GameState, StageId,
    Stats,
    new_game, step,
};
use near_svc::Near;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

/// Fairness proof: sha256(utf8(stage) ++ 0x00 ++ each confirmed frame `host << 16 | guest` as u32 LE), lowercase hex.
pub fn tape_hash(stage: &str, frames: impl IntoIterator<Item = u32>) -> String {
    let mut h = Sha256::new();
    h.update(stage.as_bytes());
    h.update([0]);
    frames.into_iter().for_each(|f| h.update(f.to_le_bytes()));
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// Same string as platform contract `settle_msg`; the referee key signs sha256 of it.
pub fn settle_msg(
    contract: &str,
    match_id: u64,
    winner: Option<i32>,
    kos: [u8; 2],
    tape_hash: &str,
) -> String {
    let w = winner.map_or("none".into(), |w| w.to_string());
    format!(
        "{}-settle|{contract}|{match_id}|{w}|{},{}|{tape_hash}",
        crate::GAME,
        kos[0],
        kos[1]
    )
}

/// `settle` args for the platform contract, None without a referee key.
pub fn attestation(
    near: &Near,
    match_id: u64,
    winner: Option<i32>,
    kos: [u8; 2],
    tape_hash: &str,
) -> Option<Value> {
    let msg = settle_msg(&near.contract, match_id, winner, kos, tape_hash);
    let sig = near.sign(Sha256::digest(msg.as_bytes()).into())?;
    Some(
        json!({ "match_id": match_id, "winner": winner, "kos": kos, "tape_hash": tape_hash, "signature": sig }),
    )
}

/// Nobody settled in time: referee pays gas for report_result. True if it reported.
pub async fn fallback(near: &Near, settle: &Value) -> bool {
    let Some(id) = settle["match_id"].as_u64() else {
        return false;
    };
    let m: Option<Value> = near
        .view(&near.contract, "get_match", json!({ "match_id": id }))
        .await;
    if m.is_some_and(|m| m["status"] != "live") {
        return false;
    }
    let args = json!({ "match_id": id, "winner": settle["winner"], "kos": settle["kos"], "tape_hash": settle["tape_hash"] });
    near.call_now(id, "report_result", args, 100).await
}

pub struct Referee {
    pub state: GameState,
    pub frame: usize,
}

impl Referee {
    pub fn new(stats: [Stats; 2], stage: StageId) -> Self {
        Referee {
            state: new_game(stats, stage),
            frame: 0,
        }
    }

    /// Step one confirmed frame. Winner seat once decided, else -1.
    pub fn step(&mut self, ins: [i32; 2]) -> i32 {
        if self.state.winner >= 0 {
            return self.state.winner;
        }
        step(&mut self.state, ins);
        self.frame += 1;
        self.state.winner
    }

    /// kos[i] = KOs scored BY seat i = 3 - opponent stocks.
    pub fn kos(&self) -> [u8; 2] {
        let [a, b] = &self.state.fighters;
        [3 - b.stocks as u8, 3 - a.stocks as u8]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tape_hash_vector() {
        // same vector in client src/lib/tape.test.ts
        assert_eq!(
            tape_hash("grove", [0, 131073, 33488896, 511]),
            "91912f4e425ec1507030483e503bb4c7a7d60c2abd476ce4447ca3b226b1a57c"
        );
    }

    // Shared vector with contracts/platform tests.rs (REF_PK / SIG_W0 / SIG_VOID): key seed [7; 32], contract "arena".
    const SK: &str = "ed25519:99eUso3aSbE9tqGSTXzo3TLfKb9RkMTURrHKQ1K7Zh3StnzFNUx8FKCPPPPpR479qsw5zv2WNBKmgiz7WqgAJfM";
    const TAPE: &str = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

    #[test]
    fn attestation_matches_contract_vector() {
        let near = Near::new(
            "http://127.0.0.1:9",
            "arena".into(),
            Some(("ref.testnet".into(), SK.into())),
        );
        assert_eq!(
            settle_msg("arena", 0, Some(0), [3, 1], TAPE),
            format!("brawler-settle|arena|0|0|3,1|{TAPE}")
        );
        let a = attestation(&near, 0, Some(0), [3, 1], TAPE).unwrap();
        assert_eq!(
            a,
            json!({ "match_id": 0, "winner": 0, "kos": [3, 1], "tape_hash": TAPE,
                "signature": "STnlao6cZwgpaAVfd7Gf9TaqDn8Vlc2qsysR0aoiF4iTnC5OKwMHrxauK5gizwqk5R546eEt0Vj3MciVG1CeCA==" })
        );
        let v = attestation(&near, 0, None, [1, 1], TAPE).unwrap();
        assert_eq!(v["winner"], Value::Null);
        assert_eq!(
            v["signature"],
            "Y3yusdEP9IO9qm7FS4hmkFZQWaz1D/rA4YA9xuWXsvr4ZE2r6YQJjwqTmDmMnV+RmpTvFmA0qlBLYu5Y40WMDg=="
        );
        let off = Near::new("http://127.0.0.1:9", "arena".into(), None);
        assert!(attestation(&off, 0, Some(0), [3, 1], TAPE).is_none());
    }

    /// Fake RPC: get_match answers `status`; any other request (access key / block lookup = tx attempt) is counted.
    async fn rpc(status: &'static str) -> (String, std::sync::Arc<std::sync::atomic::AtomicU32>) {
        use std::sync::{Arc, atomic::*};
        let txs = Arc::new(AtomicU32::new(0));
        let n = txs.clone();
        let app = axum::Router::new().route(
            "/",
            axum::routing::post(move |axum::Json(b): axum::Json<Value>| async move {
                if b["params"]["request_type"] != "call_function" {
                    n.fetch_add(1, Ordering::SeqCst);
                    return axum::Json(
                        json!({ "jsonrpc": "2.0", "id": b["id"], "error": { "code": -32000, "message": "nope", "name": "INTERNAL_ERROR", "cause": { "name": "INTERNAL_ERROR", "info": {} } } }),
                    );
                }
                let bytes: Vec<u8> = json!({ "status": status }).to_string().into_bytes();
                axum::Json(
                    json!({ "jsonrpc": "2.0", "id": b["id"], "result": { "result": bytes, "logs": [], "block_height": 1, "block_hash": "11111111111111111111111111111111" } }),
                )
            }),
        );
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", l.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(l, app).await.unwrap() });
        (url, txs)
    }

    #[tokio::test]
    async fn fallback_reports_only_unsettled() {
        use std::sync::atomic::Ordering;
        let settle = json!({ "match_id": 4, "winner": 1, "kos": [1, 3], "tape_hash": TAPE, "signature": "x" });
        let (url, txs) = rpc("settled").await;
        let near = Near::new(
            &url,
            "arena.testnet".into(),
            Some(("ref.testnet".into(), SK.into())),
        );
        assert!(!fallback(&near, &settle).await);
        assert_eq!(txs.load(Ordering::SeqCst), 0);

        let (url, txs) = rpc("live").await;
        let near = std::sync::Arc::new(Near::new(
            &url,
            "arena.testnet".into(),
            Some(("ref.testnet".into(), SK.into())),
        ));
        let n = near.clone();
        let task = tokio::spawn(async move { fallback(&n, &settle).await });
        for _ in 0..50 {
            if txs.load(Ordering::SeqCst) > 0 {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        assert!(
            txs.load(Ordering::SeqCst) > 0,
            "live match: referee sends report_result"
        );
        task.abort();
    }
}
