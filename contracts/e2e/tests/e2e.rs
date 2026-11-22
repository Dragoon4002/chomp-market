// Sandbox e2e: platform + monsters wasm, real xcc. `make e2e` builds wasm first.
#![allow(unused_must_use)] // ok/clean assert, return value optional
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{AccessKey, Gas, KeyType, NearToken, SecretKey};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{Value, json};

const N: u128 = 1_000_000_000_000_000_000_000_000;
const FEE_BPS: u128 = 10;
const Y1: NearToken = NearToken::from_yoctonear(1);
const UNIT: u128 = N / 100; // share face value
const T: u128 = UNIT / 10_000; // yocto per share per bps
const TAPE: &str = "abababababababababababababababababababababababababababababababab";

struct Env {
    w: Worker<Sandbox>,
    p: Contract, // platform
    m: Contract, // monsters
    owner: Account,
    referee: Account,
    referee2: Account,
    alice: Account,
    bob: Account,
    carol: Account,
    dave: Account,
    rk: near_crypto::SecretKey, // referee attestation key
}

async fn setup() -> anyhow::Result<Env> {
    let w = near_workspaces::sandbox().await?;
    let root = w.root_account()?;
    let acct = |name: &'static str, near: u128| {
        let root = root.clone();
        async move { anyhow::Ok(root.create_subaccount(name).initial_balance(NearToken::from_near(near)).transact().await?.into_result()?) }
    };
    let (owner, referee, referee2) = (acct("owner", 50).await?, acct("referee", 10).await?, acct("referee2", 10).await?);
    let (alice, bob, carol, dave) = (acct("alice", 20).await?, acct("bob", 20).await?, acct("carol", 20).await?, acct("dave", 20).await?);
    let p = acct("platform", 30).await?.deploy(&std::fs::read("../platform/target/near/arena.wasm")?).await?.into_result()?;
    let m = acct("monsters", 30).await?.deploy(&std::fs::read("../../games/brawler/contract/target/near/monsters.wasm")?).await?.into_result()?;
    ok(p.call("new").args_json(json!({"owner_id": owner.id()})).transact().await?);
    ok(m.call("new").args_json(json!({"owner_id": owner.id(), "arena_id": p.id()})).transact().await?);
    let rk = near_crypto::SecretKey::from_seed(near_crypto::KeyType::ED25519, "referee");
    let g = json!({"game": "brawler", "referee_id": referee.id(), "assets_id": m.id(), "referee_key": rk.public_key().to_string()});
    ok(owner.call(p.id(), "register_game").args_json(g).deposit(Y1).transact().await?);
    ok(owner.call(p.id(), "register_game").args_json(json!({"game": "other", "referee_id": referee2.id(), "assets_id": null})).deposit(Y1).transact().await?);
    Ok(Env { w, p, m, owner, referee, referee2, alice, bob, carol, dave, rk })
}

fn ok(r: ExecutionFinalResult) -> ExecutionFinalResult {
    assert!(r.is_success(), "tx failed: {:#?}", r.failures());
    r
}
/// tx ok + no failed receipt anywhere (detached unlock/record included)
fn clean(r: ExecutionFinalResult) -> ExecutionFinalResult {
    let r = ok(r);
    assert!(r.receipt_failures().is_empty(), "receipt failed: {:#?}", r.receipt_failures());
    r
}
fn fails(r: ExecutionFinalResult, msg: &str) {
    assert!(r.is_failure(), "expected failure '{msg}', got success");
    let s = format!("{:?}", r.failures());
    assert!(s.contains(msg), "expected '{msg}' in {s}");
}
fn n(v: &Value) -> u128 {
    v.as_str().unwrap_or_else(|| panic!("not U128: {v}")).parse().unwrap()
}
async fn view(c: &Contract, method: &str, args: Value) -> Value {
    c.view(method).args_json(args).await.unwrap().json().unwrap()
}
async fn bal(e: &Env, a: &Account) -> u128 {
    n(&view(&e.p, "balance_of", json!({"account_id": a.id()})).await)
}
async fn treasury(e: &Env) -> u128 {
    n(&view(&e.p, "config", json!({})).await["treasury"])
}
async fn deposit(e: &Env, a: &Account, near: u128) {
    ok(a.call(e.p.id(), "deposit").deposit(NearToken::from_near(near)).transact().await.unwrap());
}
/// staked create (1 yocto), returns match id or null
async fn create(e: &Env, a: &Account, game: &str, stake: u128, bettable: bool, mon: Option<&str>) -> ExecutionFinalResult {
    a.call(e.p.id(), "create_match")
        .args_json(json!({"game": game, "stake": stake.to_string(), "bettable": bettable, "monster_id": mon}))
        .deposit(Y1)
        .gas(Gas::from_tgas(100))
        .transact()
        .await
        .unwrap()
}
async fn join(e: &Env, a: &Account, id: u64, mon: Option<&str>) -> ExecutionFinalResult {
    a.call(e.p.id(), "join_match").args_json(json!({"match_id": id, "monster_id": mon})).deposit(Y1).gas(Gas::from_tgas(100)).transact().await.unwrap()
}
async fn result(e: &Env, by: &Account, id: u64, winner: Option<u8>, kos: [u8; 2]) -> ExecutionFinalResult {
    by.call(e.p.id(), "report_result").args_json(json!({"match_id": id, "winner": winner, "kos": kos})).gas(Gas::from_tgas(100)).transact().await.unwrap()
}
/// Anyone posts the referee's signed result; `sign_id` != id forges a bad signature.
async fn settle_as(e: &Env, by: &Account, id: u64, sign_id: u64, winner: Option<u8>, kos: [u8; 2]) -> ExecutionFinalResult {
    use base64::Engine;
    use sha2::Digest;
    let w = winner.map_or("none".into(), |w| w.to_string());
    let msg = format!("brawler-settle|{}|{sign_id}|{w}|{},{}|{TAPE}", e.p.id(), kos[0], kos[1]);
    let near_crypto::Signature::ED25519(sig) = e.rk.sign(&sha2::Sha256::digest(msg.as_bytes())) else { unreachable!() };
    let sig = base64::engine::general_purpose::STANDARD.encode(sig.to_bytes());
    by.call(e.p.id(), "settle")
        .args_json(json!({"match_id": id, "winner": winner, "kos": kos, "tape_hash": TAPE, "signature": sig}))
        .gas(Gas::from_tgas(100))
        .transact()
        .await
        .unwrap()
}
async fn order(e: &Env, who: &Account, id: u64, side: u8, price: u16, qty: u64) -> ExecutionFinalResult {
    who.call(e.p.id(), "place_order")
        .args_json(json!({"match_id": id, "side": side, "price_bps": price, "qty": qty}))
        .deposit(Y1)
        .gas(Gas::from_tgas(100))
        .transact()
        .await
        .unwrap()
}
async fn claim(e: &Env, a: &Account, id: u64) -> ExecutionFinalResult {
    a.call(e.p.id(), "claim").args_json(json!({"match_id": id})).transact().await.unwrap()
}
async fn hatch(e: &Env, a: &Account) -> Vec<String> {
    let r = clean(a.call(e.m.id(), "hatch_starters").deposit(NearToken::from_near(1)).gas(Gas::from_tgas(100)).transact().await.unwrap());
    r.json::<Vec<Value>>().unwrap().iter().map(|m| m["token_id"].as_str().unwrap().to_string()).collect()
}
async fn monster(e: &Env, id: &str) -> Value {
    view(&e.m, "get_monster", json!({"token_id": id})).await
}
fn gas_log(name: &str, r: &ExecutionFinalResult, attached_tgas: u64) {
    let burnt = r.total_gas_burnt.as_gas();
    eprintln!("gas {name}: {:.1} Tgas (attached {attached_tgas})", burnt as f64 / 1e12);
    assert!(burnt < attached_tgas * 1_000_000_000_000, "{name} burnt over attached");
}

#[tokio::test]
async fn deposit_withdraw() -> anyhow::Result<()> {
    let e = setup().await?;
    fails(e.alice.call(e.p.id(), "deposit").transact().await?, "Attach a deposit");
    deposit(&e, &e.alice, 5).await;
    assert_eq!(bal(&e, &e.alice).await, 5 * N);

    let before = e.alice.view_account().await?.balance.as_yoctonear();
    let r = clean(e.alice.call(e.p.id(), "withdraw").args_json(json!({"amount": (2 * N).to_string()})).transact().await?);
    gas_log("withdraw", &r, 30);
    let after = e.alice.view_account().await?.balance.as_yoctonear();
    assert_eq!(bal(&e, &e.alice).await, 3 * N);
    // +-0.01 N: gas cost + late gas refunds of earlier txs
    assert!(after.abs_diff(before + 2 * N) < N / 100, "real NEAR out: {before} -> {after}");

    fails(e.alice.call(e.p.id(), "withdraw").args_json(json!({"amount": (4 * N).to_string()})).transact().await?, "Insufficient balance");
    fails(e.alice.call(e.p.id(), "withdraw").args_json(json!({"amount": "0"})).transact().await?, "Bad amount");
    assert_eq!(bal(&e, &e.alice).await, 3 * N);

    // failed transfer -> re-credit: delete carol while withdraw transfer in flight
    deposit(&e, &e.carol, 1).await;
    let pending = e.carol.call(e.p.id(), "withdraw").args_json(json!({"amount": N.to_string()})).transact_async().await?;
    e.carol.clone().delete_account(e.owner.id()).await?.into_result()?;
    let r = pending.await?;
    let credited = bal(&e, &e.carol).await;
    eprintln!("withdraw-to-deleted: tx ok={} receipt fails={} balance={credited}", r.is_success(), r.receipt_failures().len());
    assert_eq!(credited, N, "transfer to deleted acct must re-credit");
    Ok(())
}

#[tokio::test]
async fn spend_needs_one_yocto() -> anyhow::Result<()> {
    let e = setup().await?;
    deposit(&e, &e.alice, 3).await;
    let args = json!({"game": "brawler", "stake": N.to_string(), "bettable": false, "monster_id": null});
    fails(e.alice.call(e.p.id(), "create_match").args_json(&args).transact().await?, "Requires attached deposit of exactly 1 yoctoNEAR");

    // fn-call key (what wallet login makes) can't attach deposit -> can't spend
    let sk = SecretKey::from_random(KeyType::ED25519);
    ok(e.alice.batch(e.alice.id()).add_key(sk.public_key(), AccessKey::function_call_access(e.p.id(), &[], Some(NearToken::from_near(1)))).transact().await?);
    let fc = Account::from_secret_key(e.alice.id().clone(), sk, &e.w);
    let r = fc.call(e.p.id(), "create_match").args_json(&args).deposit(Y1).transact().await;
    assert!(r.map(|r| r.is_failure()).unwrap_or(true), "fn-call key spent balance");
    let r = fc.call(e.p.id(), "withdraw").args_json(json!({"amount": N.to_string()})).transact().await;
    eprintln!("fn-call key withdraw ok={:?} (sends only to alice herself)", r.as_ref().map(|r| r.is_success()));
    let left = bal(&e, &e.alice).await;
    assert!(left == 3 * N || left == 2 * N, "only self-withdraw possible via fn key");

    let id: u64 = clean(create(&e, &e.alice, "brawler", N / 2, false, None).await).json::<Option<u64>>()?.unwrap();
    deposit(&e, &e.bob, 1).await;
    fails(e.bob.call(e.p.id(), "join_match").args_json(json!({"match_id": id, "monster_id": null})).transact().await?, "exactly 1 yoctoNEAR");
    clean(join(&e, &e.bob, id, None).await);
    fails(
        e.carol.call(e.p.id(), "place_order").args_json(json!({"match_id": id, "side": 0, "price_bps": 5000, "qty": 1})).transact().await?,
        "exactly 1 yoctoNEAR",
    );
    ok(e.owner.call(e.p.id(), "create_tournament").args_json(json!({"game": "brawler", "size": 4, "entry_fee": "1", "bettable": false})).deposit(Y1).transact().await?);
    fails(
        e.carol.call(e.p.id(), "enter_tournament").args_json(json!({"id": 0, "monster_id": "0"})).gas(Gas::from_tgas(150)).transact().await?,
        "exactly 1 yoctoNEAR",
    );
    Ok(())
}

#[tokio::test]
async fn staked_match_settles() -> anyhow::Result<()> {
    let e = setup().await?;
    deposit(&e, &e.alice, 3).await;
    deposit(&e, &e.bob, 3).await;
    fails(create(&e, &e.alice, "nope", N, false, None).await, "Unknown game");
    fails(create(&e, &e.alice, "brawler", 4 * N, false, None).await, "Insufficient balance");
    let r = clean(create(&e, &e.alice, "brawler", N, false, None).await);
    gas_log("create_match", &r, 100);
    let id = r.json::<Option<u64>>()?.unwrap();
    fails(join(&e, &e.alice, id, None).await, "Host cannot join own match");
    clean(join(&e, &e.bob, id, None).await);
    assert_eq!((bal(&e, &e.alice).await, bal(&e, &e.bob).await), (2 * N, 2 * N));
    let mv = view(&e.p, "get_match", json!({"match_id": id})).await;
    assert_eq!((mv["status"].as_str(), mv["game"].as_str()), (Some("live"), Some("brawler")));

    fails(join(&e, &e.carol, id, None).await, "Match not open");
    clean(e.referee.call(e.p.id(), "report_kos").args_json(json!({"match_id": id, "kos": 2})).transact().await?);
    let r = clean(result(&e, &e.referee, id, Some(0), [3, 1]).await);
    gas_log("report_result", &r, 100);
    fails(result(&e, &e.referee, id, Some(1), [0, 0]).await, "Match not live");

    let fee = 2 * N * FEE_BPS / 10_000;
    assert_eq!(treasury(&e).await, fee);
    fails(claim(&e, &e.alice, id).await, "Nothing to claim"); // seats credited at result
    fails(claim(&e, &e.bob, id).await, "Nothing to claim");
    let (a, b) = (bal(&e, &e.alice).await, bal(&e, &e.bob).await);
    assert_eq!((a, b), (4 * N - fee, 2 * N));
    assert_eq!(a + b + treasury(&e).await, 6 * N, "conservation");
    Ok(())
}

#[tokio::test]
async fn referee_per_game() -> anyhow::Result<()> {
    let e = setup().await?;
    deposit(&e, &e.alice, 3).await;
    deposit(&e, &e.bob, 3).await;
    let b = clean(create(&e, &e.alice, "brawler", N, false, None).await).json::<Option<u64>>()?.unwrap();
    clean(join(&e, &e.bob, b, None).await);
    let o = clean(create(&e, &e.alice, "other", N, false, None).await).json::<Option<u64>>()?.unwrap();
    clean(join(&e, &e.bob, o, None).await);

    fails(result(&e, &e.referee2, b, Some(0), [0, 0]).await, "Only referee");
    fails(result(&e, &e.alice, b, Some(0), [0, 0]).await, "Only referee");
    fails(result(&e, &e.referee, o, Some(0), [0, 0]).await, "Only referee");
    fails(e.referee.call(e.p.id(), "report_kos").args_json(json!({"match_id": o, "kos": 1})).transact().await?, "Only referee");
    clean(result(&e, &e.referee2, o, Some(1), [0, 3]).await);
    clean(result(&e, &e.referee, b, Some(0), [3, 0]).await);

    let list = view(&e.p, "list_matches", json!({"from": 0, "limit": 10, "game": "other"})).await;
    assert_eq!(list.as_array().unwrap().len(), 1);
    fails(
        e.alice.call(e.p.id(), "register_game").args_json(json!({"game": "x", "referee_id": e.alice.id(), "assets_id": null})).deposit(Y1).transact().await?,
        "Only owner",
    );
    Ok(())
}

#[tokio::test]
async fn monsters_lock_record_unlock() -> anyhow::Result<()> {
    let e = setup().await?;
    let before = e.alice.view_account().await?.balance.as_yoctonear();
    let am = hatch(&e, &e.alice).await;
    let spent = before - e.alice.view_account().await?.balance.as_yoctonear();
    eprintln!("hatch_starters cost {:.4} NEAR (1 attached, excess refunded)", spent as f64 / N as f64);
    assert!(spent < N / 2, "excess not refunded: {spent}");
    let bm = hatch(&e, &e.bob).await;
    deposit(&e, &e.alice, 3).await;
    deposit(&e, &e.bob, 3).await;

    let r = clean(create(&e, &e.alice, "brawler", N, false, Some(&am[0])).await);
    gas_log("create_match+lock", &r, 100);
    let id = r.json::<Option<u64>>()?.expect("created");
    assert!(monster(&e, &am[0]).await["locked_until_ms"].as_u64().unwrap() > 0);
    fails(e.alice.call(e.m.id(), "list").args_json(json!({"token_id": am[0], "price": "1"})).deposit(Y1).transact().await?, "Monster is busy");
    let r = clean(join(&e, &e.bob, id, Some(&bm[0])).await);
    gas_log("join_match+lock", &r, 100);
    assert_eq!(r.json::<bool>()?, true);
    assert_eq!(view(&e.p, "get_match", json!({"match_id": id})).await["monsters"], json!([am[0], bm[0]]));

    let r = clean(result(&e, &e.referee, id, Some(1), [1, 3]).await);
    gas_log("report_result+record+unlock", &r, 100);
    let (a, b) = (monster(&e, &am[0]).await, monster(&e, &bm[0]).await);
    assert_eq!((a["locked_until_ms"].as_u64(), b["locked_until_ms"].as_u64()), (Some(0), Some(0)));
    assert_eq!((a["record"]["l"].as_u64(), a["record"]["ko"].as_u64()), (Some(1), Some(1)));
    assert_eq!((b["record"]["w"].as_u64(), b["record"]["ko"].as_u64()), (Some(1), Some(3)));
    let h = view(&e.m, "get_history", json!({"token_id": bm[0]})).await;
    assert_eq!((h[0]["match_id"].as_u64(), h[0]["won"].as_bool(), h[0]["vs"].as_str()), (Some(id), Some(true), Some(am[0].as_str())));

    // not owned: lock fails -> re-credit, null, nothing locked/created
    let bob_bal = bal(&e, &e.bob).await;
    let r = ok(create(&e, &e.bob, "brawler", N, false, Some(&am[1])).await);
    assert_eq!(r.json::<Option<u64>>()?, None);
    assert_eq!(bal(&e, &e.bob).await, bob_bal);
    assert_eq!(monster(&e, &am[1]).await["locked_until_ms"].as_u64(), Some(0));
    assert_eq!(view(&e.p, "list_matches", json!({"from": 0, "limit": 10, "game": null})).await.as_array().unwrap().len(), 1);

    // join w/ not-owned: false, re-credit, match stays open, host monster still locked
    let id2 = clean(create(&e, &e.alice, "brawler", N, false, Some(&am[1])).await).json::<Option<u64>>()?.unwrap();
    let r = ok(join(&e, &e.bob, id2, Some(&am[2])).await);
    assert_eq!(r.json::<bool>()?, false);
    assert_eq!(bal(&e, &e.bob).await, bob_bal);
    assert_eq!(view(&e.p, "get_match", json!({"match_id": id2})).await["status"].as_str(), Some("open"));
    // busy monster can't enter second match
    let id3 = ok(create(&e, &e.alice, "brawler", 0, false, Some(&am[1])).await).json::<Option<u64>>()?;
    assert_eq!(id3, None, "locked monster double-booked");

    // game w/o assets
    let a_bal = bal(&e, &e.alice).await;
    fails(create(&e, &e.alice, "other", N, false, Some(&am[2])).await, "Game has no assets");
    assert_eq!(bal(&e, &e.alice).await, a_bal);
    Ok(())
}

#[tokio::test]
async fn settle_by_attestation() -> anyhow::Result<()> {
    let e = setup().await?;
    deposit(&e, &e.alice, 3).await;
    deposit(&e, &e.bob, 3).await;
    let id = clean(create(&e, &e.alice, "brawler", N, false, None).await).json::<Option<u64>>()?.unwrap();
    clean(join(&e, &e.bob, id, None).await);
    fails(settle_as(&e, &e.carol, id, id + 1, Some(0), [3, 1]).await, "Bad signature");
    let r = clean(settle_as(&e, &e.alice, id, id, Some(0), [3, 1]).await);
    gas_log("settle", &r, 100);
    let fee = 2 * N * FEE_BPS / 10_000;
    let mv = view(&e.p, "get_match", json!({"match_id": id})).await;
    assert_eq!((mv["status"].as_str(), mv["tape_hash"].as_str(), mv["kos"].as_u64()), (Some("settled"), Some(TAPE), Some(4)));
    assert_eq!((bal(&e, &e.alice).await, bal(&e, &e.bob).await), (4 * N - fee, 2 * N), "winner paid in the settle tx");
    fails(settle_as(&e, &e.bob, id, id, Some(0), [3, 1]).await, "Match not live");
    fails(result(&e, &e.referee, id, Some(1), [0, 3]).await, "Match not live");
    let v = clean(create(&e, &e.alice, "brawler", N, false, None).await).json::<Option<u64>>()?.unwrap();
    clean(join(&e, &e.bob, v, None).await);
    clean(settle_as(&e, &e.bob, v, v, None, [1, 1]).await);
    assert_eq!((bal(&e, &e.alice).await, bal(&e, &e.bob).await), (4 * N - fee, 2 * N), "void: stakes back");
    Ok(())
}

#[tokio::test]
async fn order_book_settle_and_refund() -> anyhow::Result<()> {
    let e = setup().await?;
    for a in [&e.alice, &e.bob, &e.carol, &e.dave] {
        deposit(&e, a, 1).await;
    }
    let total = || async { bal(&e, &e.carol).await + bal(&e, &e.dave).await + bal(&e, &e.alice).await + bal(&e, &e.bob).await + treasury(&e).await };
    let t0 = total().await;
    let id = clean(create(&e, &e.alice, "brawler", N / 10, true, None).await).json::<Option<u64>>()?.unwrap();
    let r = clean(order(&e, &e.carol, id, 0, 6000, 10).await); // book open before the guest joins
    assert_eq!(r.json::<Value>()?["id"], json!(0));
    clean(join(&e, &e.bob, id, None).await);
    fails(order(&e, &e.alice, id, 1, 5000, 1).await, "Players cannot bet");
    let d0 = bal(&e, &e.dave).await;
    let r = clean(order(&e, &e.dave, id, 1, 5000, 4).await).json::<Value>()?; // crosses carol's 6000: dave pays 4000
    assert_eq!((r["filled"].as_u64(), n(&r["cost"]), r["id"].is_null()), (Some(4), 4 * 4000 * T, true));
    assert_eq!(d0 - bal(&e, &e.dave).await, 4 * 4000 * T, "price improvement stays with taker");
    assert_eq!(view(&e.p, "get_book", json!({"match_id": id})).await, json!([[[6000, 6]], []]));
    let f = view(&e.p, "get_fills", json!({"match_id": id, "limit": 5})).await;
    assert_eq!((f[0]["side"].as_u64(), f[0]["price_bps"].as_u64(), f[0]["qty"].as_u64()), (Some(1), Some(4000), Some(4)));
    let c0 = bal(&e, &e.carol).await;
    fails(e.dave.call(e.p.id(), "cancel_order").args_json(json!({"match_id": id, "order_id": 0})).transact().await?, "No such order");
    clean(e.carol.call(e.p.id(), "cancel_order").args_json(json!({"match_id": id, "order_id": 0})).transact().await?);
    assert_eq!(bal(&e, &e.carol).await - c0, 6 * 6000 * T, "unfilled escrow back");
    for _ in 0..20 {
        clean(order(&e, &e.carol, id, 0, 5000, 1).await);
    }
    let r = clean(order(&e, &e.dave, id, 1, 5000, 25).await);
    gas_log("place_order 20 fills", &r, 100);
    let v = r.json::<Value>()?;
    assert_eq!((v["filled"].as_u64(), v["id"].is_null()), (Some(20), false));
    let p = view(&e.p, "get_position", json!({"match_id": id, "account_id": e.dave.id()})).await;
    assert_eq!((p["shares"].clone(), n(&p["open"])), (json!([0, 24]), 5 * 5000 * T));
    clean(settle_as(&e, &e.alice, id, id, Some(0), [3, 0]).await);
    assert_eq!(view(&e.p, "get_book", json!({"match_id": id})).await, json!([[], []]));
    let win = 24 * UNIT;
    assert_eq!(n(&clean(claim(&e, &e.carol, id).await).json::<Value>()?), win - win * FEE_BPS / 10_000);
    assert_eq!(n(&clean(claim(&e, &e.dave, id).await).json::<Value>()?), 5 * 5000 * T, "loser gets resting escrow back");
    fails(claim(&e, &e.alice, id).await, "Nothing to claim");
    assert_eq!(total().await, t0, "conservation after settle");

    let (c1, d1) = (bal(&e, &e.carol).await, bal(&e, &e.dave).await);
    let v = clean(create(&e, &e.alice, "brawler", N / 10, true, None).await).json::<Option<u64>>()?.unwrap();
    clean(join(&e, &e.bob, v, None).await);
    clean(order(&e, &e.carol, v, 0, 3000, 5).await);
    clean(order(&e, &e.dave, v, 1, 7000, 5).await);
    clean(result(&e, &e.referee, v, None, [0, 0]).await);
    clean(claim(&e, &e.carol, v).await);
    clean(claim(&e, &e.dave, v).await);
    assert_eq!((bal(&e, &e.carol).await, bal(&e, &e.dave).await), (c1, d1), "void: exactly what was paid");
    assert_eq!(total().await, t0, "conservation after void");
    Ok(())
}

#[tokio::test]
async fn cancel_and_expire() -> anyhow::Result<()> {
    let e = setup().await?;
    let am = hatch(&e, &e.alice).await;
    deposit(&e, &e.alice, 3).await;
    deposit(&e, &e.bob, 3).await;

    let id = clean(create(&e, &e.alice, "brawler", N, false, Some(&am[0])).await).json::<Option<u64>>()?.unwrap();
    fails(e.bob.call(e.p.id(), "cancel_match").args_json(json!({"match_id": id})).transact().await?, "Only host");
    let r = clean(e.alice.call(e.p.id(), "cancel_match").args_json(json!({"match_id": id})).gas(Gas::from_tgas(30)).transact().await?);
    gas_log("cancel_match+unlock", &r, 30); // client attaches 30
    assert_eq!(bal(&e, &e.alice).await, 3 * N);
    assert_eq!(monster(&e, &am[0]).await["locked_until_ms"].as_u64(), Some(0));

    let open = clean(create(&e, &e.alice, "brawler", N, false, None).await).json::<Option<u64>>()?.unwrap();
    let live = clean(create(&e, &e.alice, "brawler", N, false, None).await).json::<Option<u64>>()?.unwrap();
    clean(join(&e, &e.bob, live, None).await);
    fails(e.bob.call(e.p.id(), "expire").args_json(json!({"match_id": live})).transact().await?, "Not expired yet");
    let t0 = e.w.view_block().await?.timestamp();
    let mut blocks = 0;
    while e.w.view_block().await?.timestamp() - t0 < 2 * 3600 * 1_000_000_000 + 60_000_000_000 {
        e.w.fast_forward(2_000).await?;
        blocks += 2_000;
    }
    eprintln!("fast_forward {blocks} blocks for 2h");
    for id in [open, live] {
        clean(e.carol.call(e.p.id(), "expire").args_json(json!({"match_id": id})).gas(Gas::from_tgas(30)).transact().await?);
    }
    assert_eq!((bal(&e, &e.alice).await, bal(&e, &e.bob).await), (3 * N, 3 * N));
    fails(result(&e, &e.referee, live, Some(0), [0, 0]).await, "Match not live");
    Ok(())
}

#[tokio::test]
async fn tournament_of_four() -> anyhow::Result<()> {
    let e = setup().await?;
    let players = [&e.alice, &e.bob, &e.carol, &e.dave];
    let mut mons = vec![];
    for p in players {
        mons.push(hatch(&e, p).await[0].clone());
        deposit(&e, p, 1).await;
    }
    let fee_in = N / 2;
    let tid = ok(e.owner.call(e.p.id(), "create_tournament").args_json(json!({"game": "brawler", "size": 4, "entry_fee": fee_in.to_string(), "bettable": false})).deposit(Y1).transact().await?)
        .json::<u64>()?;
    fails(
        e.alice.call(e.p.id(), "enter_tournament").args_json(json!({"id": tid, "monster_id": mons[0]})).deposit(Y1).gas(Gas::from_tgas(100)).transact().await?,
        "Attach 150 Tgas",
    );
    for (p, mon) in players.iter().zip(&mons) {
        let r = clean(p.call(e.p.id(), "enter_tournament").args_json(json!({"id": tid, "monster_id": mon})).deposit(Y1).gas(Gas::from_tgas(150)).transact().await?);
        gas_log("enter_tournament", &r, 150);
        assert_eq!(r.json::<bool>()?, true);
        assert_eq!(bal(&e, p).await, N - fee_in);
    }
    let t = view(&e.p, "get_tournament", json!({"id": tid})).await;
    assert_eq!((t["status"].as_str(), n(&t["pot"])), (Some("live"), 4 * fee_in));
    let r0: Vec<u64> = t["rounds"][0].as_array().unwrap().iter().map(|v| v.as_u64().unwrap()).collect();
    assert_eq!(r0.len(), 2);

    // alice beats bob, dave beats carol, final alice vs dave -> dave
    fails(settle_as(&e, &e.alice, r0[0], r0[0] + 9, Some(0), [3, 0]).await, "Bad signature");
    let r = clean(settle_as(&e, &e.alice, r0[0], r0[0], Some(0), [3, 0]).await); // winner settles, referee pays no gas
    gas_log("settle tournament semi", &r, 100);
    assert_eq!(monster(&e, &mons[1]).await["locked_until_ms"].as_u64(), Some(0), "loser unlocked");
    assert!(monster(&e, &mons[0]).await["locked_until_ms"].as_u64().unwrap() > 0, "winner stays locked");
    clean(result(&e, &e.referee, r0[1], Some(1), [1, 3]).await);
    let t = view(&e.p, "get_tournament", json!({"id": tid})).await;
    let fin = t["rounds"][1][0].as_u64().expect("final created");
    let fm = view(&e.p, "get_match", json!({"match_id": fin})).await;
    assert_eq!((fm["host"].as_str(), fm["guest"].as_str()), (Some(e.alice.id().as_str()), Some(e.dave.id().as_str())));
    let r = clean(result(&e, &e.referee, fin, Some(1), [2, 3]).await);
    gas_log("report_result final", &r, 100);

    let t = view(&e.p, "get_tournament", json!({"id": tid})).await;
    assert_eq!((t["status"].as_str(), t["champion"].as_str()), (Some("done"), Some(e.dave.id().as_str())));
    let pot = 4 * fee_in;
    let cut = pot * FEE_BPS / 10_000;
    fails(e.alice.call(e.p.id(), "claim_tournament").args_json(json!({"id": tid})).transact().await?, "Nothing to claim");
    assert_eq!(n(&clean(e.dave.call(e.p.id(), "claim_tournament").args_json(json!({"id": tid})).transact().await?).json::<Value>()?), pot - cut);
    fails(e.dave.call(e.p.id(), "claim_tournament").args_json(json!({"id": tid})).transact().await?, "Nothing to claim");
    assert_eq!(bal(&e, &e.dave).await, N - fee_in + pot - cut);
    assert_eq!(treasury(&e).await, cut);
    let champ = monster(&e, &mons[3]).await;
    assert!(champ["titles"].as_array().unwrap().iter().any(|t| t == &json!(format!("Tournament #{tid} Champion"))));
    for m in &mons {
        assert_eq!(monster(&e, m).await["locked_until_ms"].as_u64(), Some(0), "{m} unlocked at end");
    }
    let total: u128 = {
        let mut s = treasury(&e).await;
        for p in players {
            s += bal(&e, p).await;
        }
        s
    };
    assert_eq!(total, 4 * N, "conservation");
    Ok(())
}

#[tokio::test]
async fn skills_presale_equip_lock() -> anyhow::Result<()> {
    let e = setup().await?;
    let m = e.m.id();
    let dep = NearToken::from_millinear(100);
    ok(e.owner.call(m, "add_creator").args_json(json!({"account_id": e.owner.id()})).deposit(Y1).transact().await?);
    ok(e.owner.call(m, "create_collection").args_json(json!({"name": "Arena Basics", "description": "", "media": ""})).deposit(dep).transact().await?);
    let skill = |kind: &str, mag: u8| {
        e.owner.call(m, "create_skill").args_json(json!({"collection": 0, "name": kind, "kind": kind, "mag": mag, "rarity": "Rare", "max_supply": 200, "royalty_bps": 500, "media": ""})).deposit(dep).transact()
    };
    assert_eq!(ok(skill("AirJump", 1).await?).json::<u32>()?, 0);
    let price = N / 20;
    let pid = ok(e.owner.call(m, "create_presale").args_json(json!({"skill": 0, "price": price.to_string(), "start_ms": 0, "end_ms": null, "cap_total": 200, "per_wallet": 2, "allowlist": null})).deposit(dep).transact().await?).json::<u32>()?;
    let buy = |qty: u32| e.alice.call(m, "buy_presale").args_json(json!({"id": pid, "qty": qty})).deposit(NearToken::from_near(1)).gas(Gas::from_tgas(50)).transact();
    let r = clean(buy(2).await?);
    gas_log("buy_presale", &r, 50);
    fails(buy(1).await?, "Per-wallet limit reached");
    assert_eq!(n(&view(&e.m, "owed_of", json!({"account_id": e.owner.id()})).await), 2 * price - 2 * price * 250 / 10_000);

    let am = hatch(&e, &e.alice).await;
    let equip = |skills: Value| e.alice.call(m, "equip").args_json(json!({"token_id": am[0], "skills": skills})).deposit(Y1).transact();
    let r = clean(equip(json!([0])).await?);
    gas_log("equip", &r, 30);
    assert_eq!(monster(&e, &am[0]).await["skills"], json!([{"id": 0, "kind": "AirJump", "mag": 1}]));
    assert_eq!(n(&view(&e.m, "mt_balance_of", json!({"account_id": e.alice.id(), "token_id": "skill:0"})).await), 1);

    deposit(&e, &e.alice, 3).await;
    deposit(&e, &e.bob, 3).await;
    let bm = hatch(&e, &e.bob).await;
    let id = clean(create(&e, &e.alice, "brawler", N, false, Some(&am[0])).await).json::<Option<u64>>()?.unwrap();
    clean(join(&e, &e.bob, id, Some(&bm[0])).await);
    fails(equip(json!([])).await?, "Monster is busy");
    clean(result(&e, &e.referee, id, Some(0), [3, 0]).await);
    clean(equip(json!([])).await?);
    assert_eq!(monster(&e, &am[0]).await["skills"], json!([]));
    assert_eq!(n(&view(&e.m, "mt_balance_of", json!({"account_id": e.alice.id(), "token_id": "skill:0"})).await), 2);
    Ok(())
}
