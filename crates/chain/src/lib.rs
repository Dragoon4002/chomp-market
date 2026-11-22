//! Chain seam shared by game servers. Every read/auth is a stub, so servers run free rooms only.
//! TODO(solana): program account reads (`view`), wallet signature seat auth (`verify_auth`), and referee
//! result posting (MagicBlock ER commit) go here.
use serde::de::DeserializeOwned;
use serde_json::Value;

#[derive(Default)]
pub struct Chain {
    /// Platform program id; empty = no chain (free rooms only).
    pub contract: String,
}

impl Chain {
    pub fn new(contract: String) -> Self {
        Chain { contract }
    }

    /// Read `method` on `contract`. TODO(solana): fetch + decode program account.
    pub async fn view<T: DeserializeOwned>(&self, _contract: &str, _method: &str, _args: Value) -> Option<T> {
        None
    }

    /// Proof the socket controls `account` (signed `message` + server `nonce`). TODO(solana): ed25519 wallet sig.
    pub async fn verify_auth(&self, _auth: &Value, _account: &str, _message: &str, _nonce: [u8; 32]) -> bool {
        false
    }
}
