//! Ribbon Rush ws server. Env: PORT, TAPE_DIR, TICK_MS, SOLANA_RPC, CHOMP_PROGRAM_ID, REFEREE_KEYPAIR.
use chain::Chain;
use std::{env::var, sync::Arc};

#[tokio::main]
async fn main() {
    let tape_dir = var("TAPE_DIR").unwrap_or_else(|_| "./tapes".into());
    let tick_ms = var("TICK_MS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(66);
    let app = ribbon_server::App::new(
        Arc::new(Chain::from_env("ribbon")),
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
