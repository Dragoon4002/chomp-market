//! Coinflip http server. Env: PORT, NEAR_RPC, CONTRACT_ID, REFEREE_ID, REFEREE_KEY.
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
    let app = coinflip_server::App::new(Arc::new(Near::new(&rpc, contract, referee)));
    let port = var("PORT").unwrap_or_else(|_| "8790".into());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("bind");
    eprintln!("coinflip http on :{port}");
    axum::serve(listener, coinflip_server::router(app))
        .await
        .expect("serve");
}
