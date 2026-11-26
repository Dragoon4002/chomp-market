//! Chain seam shared by game servers: reads `chomp` Match PDAs, posts referee `settle`, checks seat signatures.
//! Spec: tasks/devnet-spec.md §1 + §4. Env: SOLANA_RPC, CHOMP_PROGRAM_ID, REFEREE_SECRET or REFEREE_KEYPAIR (unset = free rooms only).
use base64::{Engine, engine::general_purpose::STANDARD as B64};
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::time::Duration;

pub const DEVNET: &str = "https://api.devnet.solana.com";
pub const CHOMP_ID: &str = "4m5U9NJaLNyDzZj926jE9Y9nvKYJf82MQEcabbbGqcNf";

#[derive(Debug, PartialEq)]
pub struct MatchInfo {
    pub a: String,
    /// None = seat open.
    pub b: Option<String>,
    pub stake: u64,
    pub created: i64,
}

#[derive(Default)]
pub struct Chain {
    rpc: String,
    program: [u8; 32],
    game: [u8; 32],
    referee: Option<SigningKey>,
}

impl Chain {
    pub fn from_env(game_slug: &str) -> Self {
        let env = |k: &str, d: &str| std::env::var(k).ok().filter(|v| !v.is_empty()).unwrap_or(d.into());
        let program = pubkey(&env("CHOMP_PROGRAM_ID", CHOMP_ID)).expect("CHOMP_PROGRAM_ID");
        // REFEREE_SECRET = keypair JSON array (hosted env, e.g. Render); else REFEREE_KEYPAIR = file path (local)
        let secret = std::env::var("REFEREE_SECRET").ok().filter(|v| !v.is_empty());
        let file = || std::env::var("REFEREE_KEYPAIR").ok().filter(|p| !p.is_empty())
            .map(|p| std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("REFEREE_KEYPAIR {p}: {e}")));
        let referee = secret.or_else(file).map(|raw| {
            let bytes: Vec<u8> = serde_json::from_str(&raw).expect("REFEREE_KEYPAIR: not a json byte array");
            let kp: [u8; 64] = bytes.try_into().expect("REFEREE_KEYPAIR: need 64 bytes");
            SigningKey::from_keypair_bytes(&kp).expect("REFEREE_KEYPAIR: bad keypair")
        });
        Chain {
            rpc: env("SOLANA_RPC", DEVNET),
            game: pda(&[b"game", game_slug.as_bytes()], &program),
            program,
            referee,
        }
    }

    /// Referee key loaded: staked matches can be checked + settled.
    pub fn enabled(&self) -> bool {
        self.referee.is_some()
    }

    fn match_pda(&self, id: u64) -> [u8; 32] {
        pda(&[b"match", &self.game, &id.to_le_bytes()], &self.program)
    }

    /// Match PDA of this game. None = never opened, already settled/cancelled, or RPC failure.
    pub async fn match_info(&self, id: u64) -> Option<MatchInfo> {
        self.fetch_match(id).await.inspect_err(|e| eprintln!("match_info {id}: {e}")).ok().flatten()
    }

    /// Like `match_info`, but an RPC failure is Err (not "missing"), so settle can tell them apart.
    async fn fetch_match(&self, id: u64) -> Result<Option<MatchInfo>, String> {
        let addr = b58(&self.match_pda(id));
        let r = self.rpc("getAccountInfo", json!([addr, { "encoding": "base64", "commitment": "confirmed" }])).await?;
        let v = &r["value"];
        if v["owner"].as_str() != Some(&b58(&self.program)) {
            return Ok(None);
        }
        let Some(data) = v["data"][0].as_str().and_then(|d| B64.decode(d).ok()) else { return Ok(None) };
        Ok(decode_match(&data).filter(|_| data[8..40] == self.game))
    }

    /// Referee posts the result: winner 0 = a, 1 = b, 2 = draw (refund). `pair` = [a, b] the room seated.
    /// Waits for `confirmed` (≤30 s, rebroadcasting the same tx), so Ok means the pot moved. Returns tx signature.
    pub async fn settle(&self, id: u64, winner: u8, pair: &[String; 2]) -> Result<String, String> {
        let referee = self.referee.as_ref().ok_or("no referee key")?;
        let m = self.fetch_match(id).await?.ok_or("match not found")?;
        // stale/replayed settle on a reused id must not pay whoever sits in it now
        if m.a != pair[0] || m.b.as_deref() != Some(pair[1].as_str()) {
            return Err(format!("seats changed: chain {} / {:?}, room {pair:?}", m.a, m.b));
        }
        let (a, b) = (pubkey(&pair[0]).ok_or("bad a")?, pubkey(&pair[1]).ok_or("bad b")?);
        let r = self.rpc("getLatestBlockhash", json!([{ "commitment": "confirmed" }])).await?;
        let hash = pubkey(r["value"]["blockhash"].as_str().ok_or("no blockhash")?).ok_or("bad blockhash")?;
        let config = pda(&[b"config"], &self.program);
        let tx = B64.encode(settle_tx(referee, &self.program, &self.game, &self.match_pda(id), &a, &b, &config, &hash, winner));
        let send = |skip: bool| {
            let opts = json!({ "encoding": "base64", "skipPreflight": skip, "preflightCommitment": "confirmed" });
            self.rpc("sendTransaction", json!([tx, opts]))
        };
        let sig = send(false).await?;
        let sig = sig.as_str().ok_or_else(|| format!("bad sendTransaction result {sig}"))?.to_string();
        for t in 1..=30 {
            tokio::time::sleep(Duration::from_secs(1)).await;
            if t % 10 == 0 {
                // dropped? same signed tx again (idempotent; blockhash lives ~60 s)
                let _ = send(true).await;
            }
            let Ok(st) = self.rpc("getSignatureStatuses", json!([[sig]])).await else { continue };
            let s = &st["value"][0];
            if !s["err"].is_null() {
                return Err(format!("settle {sig} failed: {}", s["err"]));
            }
            if matches!(s["confirmationStatus"].as_str(), Some("confirmed" | "finalized")) {
                return Ok(sig);
            }
        }
        Err(format!("settle {sig} not confirmed in 30 s"))
    }

    async fn rpc(&self, method: &str, params: Value) -> Result<Value, String> {
        let body = json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params }).to_string();
        let mut backoff = Duration::from_millis(500);
        loop {
            let (url, body) = (self.rpc.clone(), body.clone());
            // ponytail: blocking ureq on the blocking pool; switch to an async client if RPC volume grows
            let r = tokio::task::spawn_blocking(move || {
                let agent: ureq::Agent = ureq::Agent::config_builder()
                    .timeout_global(Some(Duration::from_secs(15)))
                    .build()
                    .into();
                agent.post(&url).header("content-type", "application/json").send(body.as_str())?.body_mut().read_to_string()
            })
            .await
            .map_err(|e| e.to_string())?;
            // devnet rate limit = HTTP 429 or a 200 whose JSON error says "Too many requests"
            let limited = match &r {
                Err(ureq::Error::StatusCode(429)) => true,
                Ok(t) => t.contains("Too many requests"),
                _ => false,
            };
            if limited && backoff < Duration::from_secs(8) {
                tokio::time::sleep(backoff).await;
                backoff *= 2;
                continue;
            }
            let mut v: Value = serde_json::from_str(&r.map_err(|e| format!("{method}: {e}"))?).map_err(|e| e.to_string())?;
            if !v["error"].is_null() {
                return Err(format!("{method}: {}", v["error"]));
            }
            return Ok(v["result"].take());
        }
    }
}

/// ed25519 `sig_b58` over `message` by `pubkey_b58` (seat auth).
pub fn verify_sig(pubkey_b58: &str, message: &[u8], sig_b58: &str) -> bool {
    let (Some(pk), Ok(sig)) = (pubkey(pubkey_b58), bs58::decode(sig_b58).into_vec()) else {
        return false;
    };
    let (Ok(vk), Ok(sig)) = (VerifyingKey::from_bytes(&pk), Signature::from_slice(&sig)) else {
        return false;
    };
    vk.verify_strict(message, &sig).is_ok()
}

fn pubkey(s: &str) -> Option<[u8; 32]> {
    bs58::decode(s).into_vec().ok()?.try_into().ok()
}

fn b58(b: &[u8]) -> String {
    bs58::encode(b).into_string()
}

fn disc(s: &str) -> [u8; 8] {
    Sha256::digest(s)[..8].try_into().unwrap()
}

/// Solana find_program_address (address only).
fn pda(seeds: &[&[u8]], program: &[u8; 32]) -> [u8; 32] {
    (0..=255u8)
        .rev()
        .map(|bump| {
            let mut h = Sha256::new();
            seeds.iter().for_each(|s| h.update(s));
            h.update([bump]);
            h.update(program);
            h.update(b"ProgramDerivedAddress");
            <[u8; 32]>::from(h.finalize())
        })
        .find(|k| VerifyingKey::from_bytes(k).is_err()) // off curve
        .expect("no viable bump")
}

/// Anchor `Match`: disc ‖ game 32 ‖ id u64 ‖ a 32 ‖ b 32 ‖ stake u64 ‖ created i64 ‖ bump u8.
fn decode_match(d: &[u8]) -> Option<MatchInfo> {
    if d.len() < 121 || d[..8] != disc("account:Match") {
        return None;
    }
    let u = |at: usize| u64::from_le_bytes(d[at..at + 8].try_into().unwrap());
    let b = &d[80..112];
    Some(MatchInfo {
        a: b58(&d[48..80]),
        b: (b != [0; 32]).then(|| b58(b)),
        stake: u(112),
        created: u(120) as i64,
    })
}

fn settle_data(winner: u8) -> Vec<u8> {
    let mut d = disc("global:settle").to_vec();
    d.push(winner);
    d
}

/// Legacy tx, fee payer = referee. Keys: [referee (w,s)], [match, a, b, config] (w), [game, program] (ro).
#[allow(clippy::too_many_arguments)]
fn settle_tx(
    referee: &SigningKey,
    program: &[u8; 32],
    game: &[u8; 32],
    match_pda: &[u8; 32],
    a: &[u8; 32],
    b: &[u8; 32],
    config: &[u8; 32],
    blockhash: &[u8; 32],
    winner: u8,
) -> Vec<u8> {
    let keys = [referee.verifying_key().to_bytes(), *match_pda, *a, *b, *config, *game, *program];
    let data = settle_data(winner);
    let mut msg = vec![1, 0, 2, keys.len() as u8];
    keys.iter().for_each(|k| msg.extend(k));
    msg.extend(blockhash);
    // 1 ix: program idx 6; accounts referee, game, match, a, b, config (spec order)
    msg.extend([1, 6, 6, 0, 5, 1, 2, 3, 4, data.len() as u8]);
    msg.extend(data);
    let mut tx = vec![1];
    tx.extend(referee.sign(&msg).to_bytes());
    tx.extend(msg);
    tx
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pda_ix_decode() {
        let p = pubkey(CHOMP_ID).unwrap();
        // expected values from `solana find-program-derived-address`
        assert_eq!(b58(&pda(&[b"config"], &p)), "MtaUB6EcA2K7exQKtk6k2uoChDmsQL1i935JVx11BNn");
        let g = pda(&[b"game", b"brawler"], &p);
        assert_eq!(b58(&g), "91nkMTboqgt8Gqt7mrDzFCp85PUvYxwA7PUt2LnUmxNs");
        let c = Chain { program: p, game: g, ..Default::default() };
        assert_eq!(b58(&c.match_pda(42)), "96V7NrMPRfgbRrp4rG6UYCt22WcNXyEq3Q4Dbyvwc5fs");
        assert_eq!(settle_data(1), [0xaf, 0x2a, 0xb9, 0x57, 0x90, 0x83, 0x66, 0xd4, 1]);

        let (a, b) = ([7u8; 32], [9u8; 32]);
        let mut d = disc("account:Match").to_vec();
        d.extend(g);
        d.extend(42u64.to_le_bytes());
        d.extend(a);
        d.extend([0; 32]);
        d.extend(5_000u64.to_le_bytes());
        d.extend((-3i64).to_le_bytes());
        d.push(254);
        let want = MatchInfo { a: b58(&a), b: None, stake: 5_000, created: -3 };
        assert_eq!(decode_match(&d), Some(want));
        d[80..112].copy_from_slice(&b);
        assert_eq!(decode_match(&d).unwrap().b, Some(b58(&b)));
        d[0] ^= 1;
        assert_eq!(decode_match(&d), None);

        let k = SigningKey::from_bytes(&[3; 32]);
        let pk = b58(&k.verifying_key().to_bytes());
        let sig = b58(&k.sign(b"chomp:brawler:42:x").to_bytes());
        assert!(verify_sig(&pk, b"chomp:brawler:42:x", &sig));
        assert!(!verify_sig(&pk, b"chomp:brawler:43:x", &sig));
    }

    /// Live devnet read (no SOL spent): `cargo test -p chain -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn devnet_missing_match() {
        let c = Chain::from_env("brawler");
        assert!(c.rpc("getSlot", json!([])).await.is_ok(), "rpc reachable");
        assert_eq!(c.match_info(u64::MAX).await, None);
    }

    /// Live devnet settle of an open+joined brawler match (spends referee fee):
    /// `REFEREE_KEYPAIR=.keys/referee-brawler.json MATCH_ID=.. A=.. B=.. cargo test -p chain devnet_settle -- --ignored`
    #[tokio::test]
    #[ignore]
    async fn devnet_settle() {
        let c = Chain::from_env("brawler");
        let env = |k| std::env::var(k).unwrap();
        let id: u64 = env("MATCH_ID").parse().unwrap();
        let pair = [env("A"), env("B")];
        let swapped = [pair[1].clone(), pair[0].clone()];
        assert!(c.settle(id, 0, &swapped).await.unwrap_err().contains("seats changed"));
        let sig = c.settle(id, 0, &pair).await.unwrap();
        eprintln!("settled {id}: {sig}");
        assert_eq!(c.match_info(id).await, None, "closed after confirm");
    }
}
