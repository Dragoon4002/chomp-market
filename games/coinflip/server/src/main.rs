//! Coinflip http server. Env: PORT.
use chain::Chain;
use std::{env::var, sync::Arc};

#[tokio::main]
async fn main() {
    // TODO(solana): Chain::new(program id from env) once crates/chain is real.
    let app = coinflip_server::App::new(Arc::new(Chain::default()));
    let port = var("PORT").unwrap_or_else(|_| "8790".into());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("bind");
    eprintln!("coinflip http on :{port}");
    axum::serve(listener, coinflip_server::router(app))
        .await
        .expect("serve");
}
