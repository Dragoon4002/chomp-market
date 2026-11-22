//! Ribbon Rush ws server. Env: PORT, NEAR_RPC, CONTRACT_ID, REFEREE_ID, REFEREE_KEY, TAPE_DIR, TICK_MS.
use near_svc::Near;
use std::{env::var, sync::Arc};

#[tokio::main]
async fn main() {
    let env = |k: &str| var(k).unwrap_or_default();
    let contract = env("CONTRACT_ID");
    let referee_id = env("REFEREE_ID");
    let referee =
        (!contract.is_empty() && !referee_id.is_empty()).then(|| (referee_id, env("REFEREE_KEY")));
    let rpc = var("NEAR_RPC").unwrap_or_else(|_| "https://test.rpc.fastnear.com".into());
    let tape_dir = var("TAPE_DIR").unwrap_or_else(|_| "./tapes".into());
    let tick_ms = var("TICK_MS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(66);
    let app = ribbon_server::App::new(
        Arc::new(Near::new(&rpc, contract, referee)),
        tape_dir,
        tick_ms,
    );
    let port = var("PORT").unwrap_or_else(|_| "8788".into());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("bind");
    eprintln!("ribbon ws on :{port}");
    axum::serve(listener, ribbon_server::router(app))
        .await
        .expect("serve");
}
