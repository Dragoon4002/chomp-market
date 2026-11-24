//! Monster Siege lockstep relay. Env: PORT (default 8790).
use std::env::var;

#[tokio::main]
async fn main() {
    let port = var("PORT").unwrap_or_else(|_| "8790".into());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await.expect("bind");
    eprintln!("monster-siege relay ws on :{port}");
    axum::serve(listener, monster_siege_server::router(monster_siege_server::App::new())).await.expect("serve");
}
