//! NEAR helpers shared by game servers: view, NEP-413 seat auth, per-match referee tx queue.
use base64::{Engine, engine::general_purpose::STANDARD as B64};
use near_api::{
    Account, Contract, NetworkConfig, RPCEndpoint, SecretKey, Signer,
    signer::NEP413Payload,
    types::{AccessKeyPermission, AccountId, NearGas, NearToken, PublicKey, Signature},
};
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::{
    collections::HashMap,
    future::Future,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::mpsc;

type Call = (String, Value, u64);

pub struct Near {
    net: NetworkConfig,
    pub contract: String,
    referee: Option<(AccountId, Arc<Signer>, SecretKey)>,
    queues: Mutex<HashMap<u64, mpsc::UnboundedSender<Call>>>,
}

impl Near {
    /// referee = (account, ed25519 secret key). None or bad -> reporting off (log only).
    pub fn new(rpc: &str, contract: String, referee: Option<(String, String)>) -> Self {
        let net = NetworkConfig {
            rpc_endpoints: vec![RPCEndpoint::new(rpc.parse().expect("NEAR_RPC url"))],
            ..NetworkConfig::testnet()
        };
        let referee = referee.and_then(|(id, key)| {
            let id: AccountId = id.parse().ok()?;
            let key: SecretKey = key.parse().ok()?;
            Some((id, Signer::from_secret_key(key.clone()).ok()?, key))
        });
        if referee.is_none() {
            eprintln!(
                "referee: CONTRACT_ID/REFEREE_ID/REFEREE_KEY not set, on-chain reporting off"
            );
        }
        Near {
            net,
            contract,
            referee,
            queues: Mutex::default(),
        }
    }

    /// View call; None when contract unset, rpc down, or bad response.
    pub async fn view<T: DeserializeOwned + Send + Sync>(
        &self,
        contract: &str,
        method: &str,
        args: Value,
    ) -> Option<T> {
        if contract.is_empty() {
            return None;
        }
        let id: AccountId = contract.parse().ok()?;
        match Contract(id)
            .call_function(method, args)
            .read_only::<T>()
            .fetch_from(&self.net)
            .await
        {
            Ok(d) => Some(d.data),
            Err(e) => {
                eprintln!("view {method}: {e}");
                None
            }
        }
    }

    /// NEP-413 proof socket controls `account`: FullAccess key signed `message` for recipient = contract, nonce = server nonce.
    pub async fn verify_auth(
        &self,
        auth: &Value,
        account: &str,
        message: &str,
        nonce: [u8; 32],
    ) -> bool {
        verify_with(
            auth,
            account,
            message,
            &self.contract,
            nonce,
            |acct, pk| async move {
                Account(acct)
                    .access_key(pk)
                    .fetch_from(&self.net)
                    .await
                    .is_ok_and(|k| k.data.permission == AccessKeyPermission::FullAccess)
            },
        )
        .await
    }

    /// Fn call by referee. Ordered per match (KO reports land before result), 5 tries w/ backoff. Needs tokio runtime.
    pub fn call(self: &Arc<Self>, match_id: u64, method: &str, args: Value, tgas: u64) {
        if self.referee.is_none() {
            return;
        }
        let mut qs = self.queues.lock().unwrap();
        let tx = qs.entry(match_id).or_insert_with(|| {
            let (tx, mut rx) = mpsc::unbounded_channel::<Call>();
            let me = self.clone();
            tokio::spawn(async move {
                while let Some((m, a, g)) = rx.recv().await {
                    me.send(match_id, &m, a, g, 0).await;
                }
            });
            tx
        });
        let _ = tx.send((method.into(), args, tgas));
        if method == "report_result" {
            qs.remove(&match_id);
        } // last call: worker drains + exits
    }

    pub fn referee_id(&self) -> Option<&str> {
        self.referee.as_ref().map(|r| r.0.as_str())
    }

    pub fn can_sign(&self) -> bool {
        self.referee.is_some()
    }

    pub fn public_key(&self) -> Option<String> {
        Some(self.referee.as_ref()?.2.public_key().to_string())
    }

    /// Referee key's ed25519 signature over a 32-byte digest, base64. None without a referee key.
    pub fn sign(&self, digest: [u8; 32]) -> Option<String> {
        match self
            .referee
            .as_ref()?
            .2
            .sign(near_api::types::CryptoHash(digest))
        {
            Signature::ED25519(s) => Some(B64.encode(s.to_bytes())),
            _ => None,
        }
    }

    /// Unqueued referee call, awaited: true once it landed OK (same retries as `call`).
    pub async fn call_now(&self, match_id: u64, method: &str, args: Value, tgas: u64) -> bool {
        self.send(match_id, method, args, tgas, 0).await
    }

    /// `call_now` with `yocto` attached (e.g. 1 yocto for payable `join_match`).
    pub async fn call_deposit(
        &self,
        match_id: u64,
        method: &str,
        args: Value,
        tgas: u64,
        yocto: u128,
    ) -> bool {
        self.send(match_id, method, args, tgas, yocto).await
    }

    async fn send(&self, match_id: u64, method: &str, args: Value, tgas: u64, yocto: u128) -> bool {
        let (Some((id, signer, _)), Ok(contract)) =
            (&self.referee, self.contract.parse::<AccountId>())
        else {
            return false;
        };
        for i in 0..5 {
            let tx = Contract(contract.clone())
                .call_function(method, args.clone())
                .transaction()
                .gas(NearGas::from_tgas(tgas))
                .deposit(NearToken::from_yoctonear(yocto))
                .with_signer(id.clone(), signer.clone())
                .send_to(&self.net)
                .await;
            let err = match tx.map(|r| r.into_result()) {
                Ok(Ok(_)) => return true,
                Ok(Err(e)) => e.to_string(),
                Err(e) => e.to_string(),
            };
            if i == 4 {
                eprintln!("referee gave up {method} {match_id}: {err}"); // 2 h expiry refunds
            } else {
                tokio::time::sleep(Duration::from_millis(1500 << i)).await;
            }
        }
        false
    }
}

/// Sig check + caller-supplied FullAccess check (rpc in prod, stub in tests).
pub async fn verify_with<F, Fut>(
    auth: &Value,
    account: &str,
    message: &str,
    recipient: &str,
    nonce: [u8; 32],
    full_access: F,
) -> bool
where
    F: FnOnce(AccountId, PublicKey) -> Fut,
    Fut: Future<Output = bool>,
{
    let (Some(pk), Some(sig)) = (auth["publicKey"].as_str(), auth["signature"].as_str()) else {
        return false;
    };
    let (Ok(acct), Ok(pk)) = (account.parse::<AccountId>(), pk.parse::<PublicKey>()) else {
        return false;
    };
    let Ok(sig) = B64.decode(sig) else {
        return false;
    };
    let Ok(sig) = Signature::from_parts(pk.key_type(), &sig) else {
        return false;
    };
    let payload = NEP413Payload {
        message: message.into(),
        nonce,
        recipient: recipient.into(),
        callback_url: None,
    };
    let Ok(hash) = payload.compute_hash() else {
        return false;
    };
    sig.verify(hash, pk) && full_access(acct, pk).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sign(sk: &SecretKey, msg: &str, nonce: [u8; 32]) -> Value {
        let p = NEP413Payload {
            message: msg.into(),
            nonce,
            recipient: "arena.testnet".into(),
            callback_url: None,
        };
        let near_api::types::Signature::ED25519(s) = sk.sign(p.compute_hash().unwrap()) else {
            unreachable!()
        };
        json!({ "publicKey": sk.public_key().to_string(), "signature": B64.encode(s.to_bytes()) })
    }

    #[tokio::test]
    async fn seat_auth() {
        let sk = near_api::signer::generate_secret_key().unwrap();
        let nonce = [7u8; 32];
        let auth = sign(&sk, "brawler-arena:7", nonce);
        let v = |a: Value, m: &'static str, n: [u8; 32], full: bool| async move {
            verify_with(
                &a,
                "alice.testnet",
                m,
                "arena.testnet",
                n,
                |_, _| async move { full },
            )
            .await
        };
        assert!(v(auth.clone(), "brawler-arena:7", nonce, true).await);
        assert!(!v(auth.clone(), "brawler-arena:8", nonce, true).await); // other match
        assert!(!v(auth.clone(), "brawler-arena:7", [8; 32], true).await); // replay on other conn
        let mut bad = B64.decode(auth["signature"].as_str().unwrap()).unwrap();
        bad[0] ^= 1;
        assert!(
            !v(
                json!({ "publicKey": auth["publicKey"], "signature": B64.encode(bad) }),
                "brawler-arena:7",
                nonce,
                true
            )
            .await
        );
        assert!(!v(auth.clone(), "brawler-arena:7", nonce, false).await); // not FullAccess
        assert!(!v(Value::Null, "brawler-arena:7", nonce, true).await);
    }
}
