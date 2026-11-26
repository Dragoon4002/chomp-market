//! Coinflip http server. Env: PORT, SOLANA_RPC, CHOMP_PROGRAM_ID, REFEREE_KEYPAIR (see crates/chain).
use chain::Chain;
use std::{env::var, sync::Arc};

#[tokio::main]
async fn main() {
    let app = coinflip_server::App::new(Arc::new(Chain::from_env("coinflip")));
    let port = var("PORT").unwrap_or_else(|_| "8791".into());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("bind");
    eprintln!("coinflip http on :{port}");
    axum::serve(listener, coinflip_server::router(app))
        .await
        .expect("serve");
}
