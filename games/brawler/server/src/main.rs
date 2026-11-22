//! Brawler ws server. Env: PORT, HISTORY_FILE.
use chain::Chain;
use std::{env::var, sync::Arc};

#[tokio::main]
async fn main() {
    let history = var("HISTORY_FILE").unwrap_or_else(|_| "history.jsonl".into());
    // TODO(solana): Chain::new(program id) + monsters program id from env once crates/chain is real.
    let app = brawler_server::App::with_history(Arc::new(Chain::default()), String::new(), history);
    let port = var("PORT").unwrap_or_else(|_| "8787".into());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("bind");
    eprintln!("brawler ws on :{port}");
    axum::serve(listener, brawler_server::router(app))
        .await
        .expect("serve");
}
