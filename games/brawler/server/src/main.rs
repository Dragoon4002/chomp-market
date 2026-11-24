//! Brawler ws server. Env: PORT, HISTORY_FILE, SOLANA_RPC, CHOMP_PROGRAM_ID, REFEREE_KEYPAIR (see crates/chain).
use chain::Chain;
use std::{env::var, sync::Arc};

#[tokio::main]
async fn main() {
    let history = var("HISTORY_FILE").unwrap_or_else(|_| "history.jsonl".into());
    let app = brawler_server::App::with_history(Arc::new(Chain::from_env("brawler")), history);
    let port = var("PORT").unwrap_or_else(|_| "8787".into());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("bind");
    eprintln!("brawler ws on :{port}");
    axum::serve(listener, brawler_server::router(app))
        .await
        .expect("serve");
}
