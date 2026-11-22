//! Brawler ws server. Env: PORT, NEAR_RPC, CONTRACT_ID, MONSTERS_ID, REFEREE_ID, REFEREE_KEY, HISTORY_FILE, SETTLE_FALLBACK_S.
use near_svc::Near;
use std::{env::var, sync::Arc};

#[tokio::main]
async fn main() {
    let env = |k: &str| var(k).unwrap_or_default();
    let contract = env("CONTRACT_ID");
    let monsters = env("MONSTERS_ID");
    let referee_id = env("REFEREE_ID");
    let referee =
        (!contract.is_empty() && !referee_id.is_empty()).then(|| (referee_id, env("REFEREE_KEY")));
    let rpc = var("NEAR_RPC").unwrap_or_else(|_| "https://test.rpc.fastnear.com".into());
    if !contract.is_empty() && monsters.is_empty() {
        eprintln!(
            "!!! CONTRACT_ID set but MONSTERS_ID empty: matches w/ on-chain monsters will fail to start"
        );
    }
    let history = var("HISTORY_FILE").unwrap_or_else(|_| "history.jsonl".into());
    let app = brawler_server::App::with_history(
        Arc::new(Near::new(&rpc, contract, referee)),
        monsters,
        history,
    );
    let port = var("PORT").unwrap_or_else(|_| "8787".into());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("bind");
    eprintln!("brawler ws on :{port}");
    axum::serve(listener, brawler_server::router(app))
        .await
        .expect("serve");
}
