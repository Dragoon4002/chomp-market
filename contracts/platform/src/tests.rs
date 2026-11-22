use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const N: u128 = 1_000_000_000_000_000_000_000_000; // 1 NEAR
const G: &str = "brawler";
const T: u128 = UNIT / 10_000; // yocto per share per bps

// Shared vector, same in brawler-server referee.rs: secret ed25519 seed = [7; 32].
const REF_PK: &str = "ed25519:GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB";
const TAPE: &str = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
const SIG_W0: &str = "STnlao6cZwgpaAVfd7Gf9TaqDn8Vlc2qsysR0aoiF4iTnC5OKwMHrxauK5gizwqk5R546eEt0Vj3MciVG1CeCA=="; // match 0, w 0, kos 3,1
const SIG_VOID: &str = "Y3yusdEP9IO9qm7FS4hmkFZQWaz1D/rA4YA9xuWXsvr4ZE2r6YQJjwqTmDmMnV+RmpTvFmA0qlBLYu5Y40WMDg=="; // match 0, none, 1,1
const SIG_EVIL: &str = "WpNdO2n933WdKZzwgc09PfZiDeuu0W0kR66khTgW6bME7mEw2V54t90lWTR8ktfeQ3Tj12t6J4lC2+iHsMxKDw=="; // contract "evil"

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn as_(who: &str, deposit: u128) {
    as_at(who, deposit, 0);
}

fn as_at(who: &str, deposit: u128, ts: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("arena"))
        .predecessor_account_id(acc(who))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .block_timestamp(ts);
    testing_env!(b.build());
}

fn bal(c: &Arena, who: &str) -> u128 {
    c.balance_of(acc(who)).0
}

fn fund(c: &mut Arena, who: &str, amt: u128) {
    if amt > 0 {
        as_(who, amt);
        c.deposit();
    }
}

fn create_in(c: &mut Arena, game: &str, host: &str, stake: u128, bettable: bool) -> u64 {
    fund(c, host, stake);
    as_(host, 1);
    match c.create_match(game.into(), U128(stake), bettable, None) {
        PromiseOrValue::Value(v) => v.unwrap(),
        _ => panic!("expected value"),
    }
}

fn create(c: &mut Arena, host: &str, stake: u128, bettable: bool) -> u64 {
    create_in(c, G, host, stake, bettable)
}

fn join(c: &mut Arena, who: &str, id: u64) {
    fund(c, who, c.get_match(id).unwrap().stake.0);
    as_(who, 1);
    assert!(matches!(c.join_match(id, None), PromiseOrValue::Value(true)));
}

/// Funds the limit cost, then bids on match `id`.
fn order_on(c: &mut Arena, id: u64, who: &str, side: u8, price: u16, qty: u64) -> OrderResult {
    fund(c, who, price as u128 * T * qty as u128);
    as_(who, 1);
    c.place_order(id, side, price, qty)
}

fn order(c: &mut Arena, who: &str, side: u8, price: u16, qty: u64) -> OrderResult {
    order_on(c, 0, who, side, price, qty)
}

/// Fresh contract, game "brawler" (referee "ref", assets "mon", attestation key REF_PK).
fn setup() -> Arena {
    as_("arena", 0);
    let mut c = Arena::new(acc("arena"));
    as_("arena", 1);
    c.register_game(G.into(), acc("ref"), Some(acc("mon")), Some(REF_PK.parse().unwrap()));
    c
}

/// Live bettable match 0, host vs guest, `stake` each.
fn live(stake: u128) -> Arena {
    let mut c = setup();
    assert_eq!(create(&mut c, "host", stake, true), 0);
    join(&mut c, "guest", 0);
    c
}

fn claim_as(c: &mut Arena, who: &str) -> u128 {
    as_(who, 0);
    c.claim(0).0
}

fn b64(s: &str) -> Base64VecU8 {
    Base64VecU8(near_sdk::base64::Engine::decode(&near_sdk::base64::engine::general_purpose::STANDARD, s).unwrap())
}

fn settle_as(c: &mut Arena, who: &str, winner: Option<u8>, kos: [u8; 2], sig: &str) {
    as_(who, 0);
    c.settle(0, winner, kos, TAPE.into(), b64(sig));
}

fn panics(f: impl FnOnce()) -> String {
    let e = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)).expect_err("expected panic");
    e.downcast_ref::<String>().cloned().or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_default()
}

#[test]
fn escrow_and_join() {
    let mut c = setup();
    create(&mut c, "host", N, false);
    assert_eq!((c.get_match(0).unwrap().status.as_str(), bal(&c, "host")), ("open", 0));
    assert_eq!(c.get_match(0).unwrap().game, G);
    join(&mut c, "guest", 0);
    let m = c.get_match(0).unwrap();
    assert_eq!((m.status.as_str(), m.guest, bal(&c, "guest")), ("live", Some(acc("guest")), 0));
}

#[test]
#[should_panic(expected = "Insufficient balance")]
fn join_insufficient_balance() {
    let mut c = setup();
    create(&mut c, "host", N, false);
    fund(&mut c, "guest", N / 2);
    as_("guest", 1);
    let _ = c.join_match(0, None);
}

#[test]
#[should_panic(expected = "Insufficient balance")]
fn create_insufficient_balance() {
    let mut c = setup();
    as_("host", 1);
    let _ = c.create_match(G.into(), U128(N), false, None);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn spend_needs_one_yocto() {
    let mut c = setup();
    fund(&mut c, "host", N);
    as_("host", 0);
    let _ = c.create_match(G.into(), U128(N), false, None);
}

#[test]
#[should_panic(expected = "Unknown game")]
fn unknown_game() {
    let mut c = setup();
    create_in(&mut c, "nope", "host", 0, false);
}

#[test]
#[should_panic(expected = "Game has no assets")]
fn monster_needs_assets() {
    let mut c = setup();
    as_("arena", 1);
    c.register_game("plain".into(), acc("ref"), None, None);
    as_("host", 1);
    let _ = c.create_match("plain".into(), U128(0), false, Some("1".into()));
}

#[test]
#[should_panic(expected = "Host cannot join own match")]
fn host_cannot_join() {
    let mut c = setup();
    create(&mut c, "host", N, false);
    join(&mut c, "host", 0);
}

/* ---------- settle by attestation ---------- */

#[test]
fn settle_message_format() {
    assert_eq!(settle_msg(G, "arena", 0, Some(0), [3, 1], TAPE), format!("brawler-settle|arena|0|0|3,1|{TAPE}"));
    assert_eq!(settle_msg(G, "arena", 12, None, [1, 1], "ab"), "brawler-settle|arena|12|none|1,1|ab");
}

#[test]
fn anyone_settles_with_referee_signature() {
    let mut c = live(N);
    settle_as(&mut c, "rando", Some(0), [3, 1], SIG_W0);
    let m = c.get_match(0).unwrap();
    assert_eq!((m.status.as_str(), m.winner, m.kos, m.tape_hash.as_deref()), ("settled", Some(0), 4, Some(TAPE)));
    assert_eq!(bal(&c, "host"), 2 * N - 2 * N / 1000); // credited, no claim
    assert_eq!((bal(&c, "guest"), c.config().treasury.0), (0, 2 * N / 1000));
    as_("host", 0);
    assert!(
        panics(|| {
            c.claim(0);
        })
        .contains("Nothing to claim")
    );
}

#[test]
fn settle_rejects_bad_or_reused_attestations() {
    let mut flipped = b64(SIG_W0).0;
    flipped[5] ^= 1;
    let flipped = near_sdk::base64::Engine::encode(&near_sdk::base64::engine::general_purpose::STANDARD, flipped);
    for (w, kos, sig) in [
        (Some(0), [3, 1], flipped.as_str()),
        (Some(1), [3, 1], SIG_W0),   // winner swapped
        (Some(0), [3, 2], SIG_W0),   // kos changed
        (Some(0), [3, 1], SIG_EVIL), // signed for another contract
        (None, [3, 1], SIG_W0),      // void claimed
        (Some(0), [3, 1], "AAAA"),   // not 64 bytes
    ] {
        let mut c = live(N);
        assert!(panics(|| settle_as(&mut c, "rando", w, kos, sig)).contains("Bad signature"));
    }
    let mut c = live(N);
    as_("rando", 0);
    assert!(panics(|| c.settle(0, Some(0), [3, 1], TAPE.replace('9', "8"), b64(SIG_W0))).contains("Bad signature"));
    settle_as(&mut c, "guest", Some(0), [3, 1], SIG_W0);
    assert!(panics(|| settle_as(&mut c, "host", Some(0), [3, 1], SIG_W0)).contains("Match not live")); // replay
    as_("ref", 0);
    assert!(panics(|| c.report_result(0, Some(1), None, None)).contains("Match not live"));
}

#[test]
fn settle_void_refunds_stakes() {
    let mut c = live(N);
    settle_as(&mut c, "host", None, [1, 1], SIG_VOID);
    assert_eq!(c.get_match(0).unwrap().status, "refund");
    assert_eq!((bal(&c, "host"), bal(&c, "guest"), c.config().treasury.0), (N, N, 0));
}

#[test]
fn fallback_report_after_settle_window_still_works() {
    let mut c = live(N);
    as_("ref", 0);
    c.report_result(0, Some(1), Some([1, 3]), Some(TAPE.into()));
    assert_eq!(bal(&c, "guest"), 2 * N - 2 * N / 1000);
    assert!(panics(|| settle_as(&mut c, "host", Some(0), [3, 1], SIG_W0)).contains("Match not live"));
}

#[test]
fn referee_key_needed_and_rotatable() {
    let mut c = setup();
    as_("arena", 1);
    c.register_game(G.into(), acc("ref"), Some(acc("mon")), None);
    create(&mut c, "host", 0, false);
    join(&mut c, "guest", 0);
    assert!(panics(|| settle_as(&mut c, "host", Some(0), [3, 1], SIG_W0)).contains("No referee key"));
    as_("evil", 1);
    assert!(panics(|| c.set_referee_key(G.into(), Some(REF_PK.parse().unwrap()))).contains("Only owner"));
    as_("ref", 0); // referee rotates its own key, no yocto
    c.set_referee_key(G.into(), Some(REF_PK.parse().unwrap()));
    assert_eq!(c.get_game(G.into()).unwrap().referee_key, Some(REF_PK.parse().unwrap()));
    settle_as(&mut c, "host", Some(0), [3, 1], SIG_W0);
    as_("arena", 1);
    c.set_referee_key(G.into(), None);
    assert_eq!(c.get_game(G.into()).unwrap().referee_key, None);
}

/* ---------- order book ---------- */

#[test]
#[should_panic(expected = "Players cannot bet on their own match")]
fn player_cannot_bet() {
    let mut c = live(N);
    order(&mut c, "guest", 0, 5000, 1);
}

#[test]
#[should_panic(expected = "Match not bettable")]
fn unbettable() {
    let mut c = setup();
    create(&mut c, "host", 0, false);
    order(&mut c, "bob", 0, 5000, 1);
}

#[test]
fn guards() {
    let mut c = live(N);
    for (price, qty, err) in [(0, 1, "Bad price"), (10_000, 1, "Bad price"), (5000, 0, "Bad qty"), (9999, 100_001, "Order above maximum")] {
        assert!(
            panics(|| {
                order(&mut c, "bob", 0, price, qty);
            })
            .contains(err),
            "{err}"
        );
    }
    as_("cat", 1);
    assert!(
        panics(|| {
            c.place_order(0, 0, 5000, 1);
        })
        .contains("Insufficient balance")
    );
    as_("cat", 0);
    assert!(
        panics(|| {
            c.place_order(0, 0, 5000, 1);
        })
        .contains("exactly 1 yoctoNEAR")
    );
    as_("arena", 1);
    c.set_limits(U128(N));
    assert!(
        panics(|| {
            order(&mut c, "bob", 0, 5000, 201);
        })
        .contains("Order above maximum")
    );
}

#[test]
fn book_open_before_live_any_room_bettable() {
    let mut c = setup();
    create(&mut c, "host", 0, true); // free room, no seed needed
    let r = order(&mut c, "bob", 0, 5500, 3);
    assert_eq!((r.id, r.filled, r.cost.0), (Some(0), 0, 3 * 5500 * T));
    assert_eq!(c.get_book(0), [vec![(5500, 3)], vec![]]);
}

#[test]
fn match_partial_fill_and_price_improvement() {
    let mut c = live(N);
    assert_eq!(order(&mut c, "aa", 0, 6000, 10).id, Some(0)); // rests
    assert_eq!(bal(&c, "aa"), 0);
    let r = order_on(&mut c, 0, "bb", 1, 5000, 4); // 6000 + 5000 >= 10000: fills at maker's 6000 -> bb pays 4000
    assert_eq!((r.id, r.filled, r.cost.0), (None, 4, 4 * 4000 * T));
    assert_eq!(bal(&c, "bb"), 4 * 1000 * T); // improvement never left bb's balance
    assert_eq!(c.get_book(0), [vec![(6000, 6)], vec![]]);
    let m = c.get_match(0).unwrap();
    assert_eq!((m.price_bps, m.fills, m.collateral.0), (6000, 1, 4 * UNIT));
    let pa = c.get_position(0, acc("aa")).unwrap();
    assert_eq!((pa.shares, pa.paid[0].0, pa.open.0), ([4, 0], 4 * 6000 * T, 6 * 6000 * T));
    let pb = c.get_position(0, acc("bb")).unwrap();
    assert_eq!((pb.shares, pb.paid[1].0, pb.open.0), ([0, 4], 4 * 4000 * T, 0));
    let f = &c.get_fills(0, 5)[0];
    assert_eq!((f.taker.as_str(), f.maker.as_str(), f.side, f.price_bps, f.qty), ("bb", "aa", 1, 4000, 4));
    // taker walks two levels, best first, rest rests at its limit
    order(&mut c, "cc", 0, 5500, 2);
    let r = order(&mut c, "dd", 1, 4500, 10); // hits 6000 x6 (pays 4000), 5500 x2 (pays 4500), rests 2 @ 4500
    assert_eq!((r.id, r.filled, r.cost.0), (Some(2), 8, (6 * 4000 + 2 * 4500 + 2 * 4500) * T));
    assert_eq!(c.get_book(0), [vec![], vec![(4500, 2)]]);
    assert_eq!(c.get_prices(0).iter().map(|p| p.1).collect::<Vec<_>>(), vec![6000, 6000, 5500]);
    assert_eq!(c.get_fills(0, 99).iter().map(|f| f.id).collect::<Vec<_>>(), vec![2, 1, 0]);
}

#[test]
fn levels_aggregate_best_first_fifo() {
    let mut c = live(N);
    order(&mut c, "aa", 0, 5000, 1);
    order(&mut c, "bb", 0, 5200, 2);
    order(&mut c, "cc", 0, 5000, 3);
    assert_eq!(c.get_book(0)[0], vec![(5200, 2), (5000, 4)]);
    order(&mut c, "dd", 1, 5000, 3); // 5200 x2 then oldest 5000 (aa) x1
    assert_eq!(c.get_position(0, acc("aa")).unwrap().shares, [1, 0]);
    assert_eq!(c.get_position(0, acc("cc")).unwrap().shares, [0, 0]);
}

#[test]
fn self_orders_never_match() {
    let mut c = live(N);
    order(&mut c, "aa", 0, 6000, 5);
    let r = order(&mut c, "aa", 1, 5000, 5);
    assert_eq!((r.id, r.filled), (Some(1), 0)); // rests, crossed with own bid
    let r = order(&mut c, "bb", 1, 4000, 5); // skips nothing of bb's, fills aa's side-0 bid
    assert_eq!(r.filled, 5);
    let r = order(&mut c, "cc", 0, 5000, 5); // aa's side-1 bid at 5000
    assert_eq!(r.filled, 5);
    assert_eq!(c.get_position(0, acc("aa")).unwrap().shares, [5, 5]);
}

#[test]
fn fills_capped_per_call() {
    let mut c = live(N);
    for _ in 0..25 {
        order(&mut c, "aa", 0, 5000, 1);
    }
    let r = order(&mut c, "bb", 1, 5000, 25);
    assert_eq!((r.filled, r.id), (MAX_FILLS as u64, Some(25)));
    assert_eq!(c.get_book(0), [vec![(5000, 5)], vec![(5000, 5)]]);
}

#[test]
#[should_panic(expected = "Book full")]
fn book_capped() {
    let mut c = live(N);
    for _ in 0..=MAX_BOOK {
        order(&mut c, "aa", 0, 5000, 1);
    }
}

#[test]
fn cancel_refunds_unfilled() {
    let mut c = live(N);
    order(&mut c, "aa", 0, 6000, 10);
    order(&mut c, "bb", 1, 4000, 3);
    as_("bb", 0);
    assert!(
        panics(|| {
            c.cancel_order(0, 0);
        })
        .contains("No such order")
    ); // not bb's
    as_("aa", 0);
    assert_eq!(c.get_orders(0, acc("aa")).iter().map(|o| (o.id, o.qty, o.filled)).collect::<Vec<_>>(), vec![(0, 7, 3)]);
    assert_eq!(c.cancel_order(0, 0).0, 7 * 6000 * T);
    assert_eq!((bal(&c, "aa"), c.get_position(0, acc("aa")).unwrap().open.0), (7 * 6000 * T, 0));
    assert!(c.get_orders(0, acc("aa")).is_empty());
    assert!(
        panics(|| {
            c.cancel_order(0, 0);
        })
        .contains("No such order")
    );
}

#[test]
fn book_closes_at_result_and_claim_refunds_rest() {
    let mut c = live(N);
    order(&mut c, "aa", 0, 6000, 10);
    order(&mut c, "bb", 1, 4000, 4);
    settle_as(&mut c, "host", Some(0), [3, 1], SIG_W0);
    assert_eq!(c.get_book(0), [vec![], vec![]]);
    assert!(c.get_orders(0, acc("aa")).is_empty());
    assert!(
        panics(|| {
            order(&mut c, "cc", 0, 5000, 1);
        })
        .contains("Book closed")
    );
    as_("aa", 0);
    assert!(
        panics(|| {
            c.cancel_order(0, 0);
        })
        .contains("Book closed")
    );
    let win = 4 * UNIT;
    assert_eq!(c.claimable(0, acc("aa")).0, win - win / 1000 + 6 * 6000 * T);
    assert_eq!(claim_as(&mut c, "aa"), win - win / 1000 + 6 * 6000 * T);
    assert_eq!(c.claimable(0, acc("bb")).0, 0);
    assert!(
        panics(|| {
            claim_as(&mut c, "bb");
        })
        .contains("Nothing to claim")
    );
    assert!(
        panics(|| {
            claim_as(&mut c, "aa");
        })
        .contains("Nothing to claim")
    );
}

const ACTORS: [&str; 6] = ["host", "guest", "aa", "bb", "cc", "dd"];

/// balances + treasury: everything the contract owes outside open escrow.
fn ledger(c: &Arena) -> u128 {
    ACTORS.iter().map(|w| bal(c, w)).sum::<u128>() + c.config().treasury.0
}

/// Everyone deposits first; trade, result, everyone claims: ledger back to start exactly, fees = treasury.
fn conserve(winner: Option<u8>) {
    let stake = 3 * N;
    let mut c = setup();
    let orders = [
        ("aa", 0, 6100, 70),
        ("bb", 1, 4200, 30),
        ("cc", 1, 3900, 55),
        ("aa", 1, 2000, 9),
        ("dd", 0, 6500, 40),
        ("bb", 0, 7777, 13),
        ("cc", 1, 5000, 20),
    ];
    fund(&mut c, "host", stake);
    fund(&mut c, "guest", stake);
    for (who, _, p, q) in orders {
        fund(&mut c, who, p as u128 * T * q as u128);
    }
    let l0 = ledger(&c);
    as_("host", 1);
    let _ = c.create_match(G.into(), U128(stake), true, None);
    as_("guest", 1);
    let _ = c.join_match(0, None);
    for (who, side, p, q) in orders {
        as_(who, 1);
        c.place_order(0, side, p, q);
    }
    assert!(c.get_match(0).unwrap().fills > 3);
    as_("ref", 0);
    c.report_result(0, winner, None, None);
    for who in ACTORS {
        if c.claimable(0, acc(who)).0 > 0 {
            claim_as(&mut c, who);
        }
        assert_eq!(c.claimable(0, acc(who)).0, 0);
    }
    assert_eq!(ledger(&c), l0, "paid in = paid out + fees");
    let m = c.get_match(0).unwrap();
    let fees = match winner {
        Some(_) => 2 * stake / 1000 + m.collateral.0 / 1000,
        None => 0,
    };
    assert_eq!(c.config().treasury.0, fees);
    if winner.is_none() {
        for (who, _, _, _) in orders {
            let paid: u128 = orders.iter().filter(|o| o.0 == who).map(|o| o.2 as u128 * T * o.3 as u128).sum();
            assert_eq!(bal(&c, who), paid, "{who} gets back exactly what it paid");
        }
    }
}

#[test]
fn settle_a_conserves() {
    conserve(Some(0));
}

#[test]
fn settle_b_conserves() {
    conserve(Some(1));
}

#[test]
fn refund_conserves() {
    conserve(None);
}

#[test]
fn history_capped() {
    let mut c = live(N);
    for i in 0..(MAX_HISTORY + 5) {
        order(&mut c, "aa", 0, 5000, 1);
        fund(&mut c, "bb", 5000 * T);
        as_at("bb", 1, i as u64 * 1_000_000);
        c.place_order(0, 1, 5000, 1);
    }
    let h = c.get_prices(0);
    assert_eq!(h.len(), MAX_HISTORY);
    assert_eq!(h.last().unwrap().0, (MAX_HISTORY + 4) as u64);
}

#[test]
#[should_panic(expected = "Market has trades")]
fn unjoin_rejected_after_fills() {
    let mut c = live(N);
    order(&mut c, "aa", 0, 5000, 1);
    as_("ref", 0);
    c.unjoin(0); // resting only: fine
    join(&mut c, "g2", 0);
    order(&mut c, "bb", 1, 5000, 1);
    as_("ref", 0);
    c.unjoin(0);
}
/// Context for a `#[private]` callback whose promise 0 succeeded or failed.
fn cb(ok: bool) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("arena")).predecessor_account_id(acc("arena"));
    let r = if ok { near_sdk::PromiseResult::Successful(vec![]) } else { near_sdk::PromiseResult::Failed };
    testing_env!(b.build(), near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), vec![r]);
}

#[test]
fn withdraw_and_failed_transfer_recredits() {
    let mut c = setup();
    fund(&mut c, "bob", 3 * N);
    as_("bob", 0);
    let _ = c.withdraw(U128(2 * N));
    assert_eq!(bal(&c, "bob"), N);
    has(&format!("bob<-{}", 2 * N));
    cb(false);
    assert!(!c.on_withdraw(acc("bob"), U128(2 * N)));
    assert_eq!(bal(&c, "bob"), 3 * N);
    cb(true);
    assert!(c.on_withdraw(acc("bob"), U128(2 * N)));
    assert_eq!(bal(&c, "bob"), 3 * N);
}

#[test]
#[should_panic(expected = "Insufficient balance")]
fn withdraw_over_balance() {
    let mut c = setup();
    fund(&mut c, "bob", N);
    as_("bob", 0);
    let _ = c.withdraw(U128(N + 1));
}

#[test]
fn expire_live_and_open() {
    let mut c = live(N);
    create(&mut c, "host", N, true); // id 1, open
    as_at("anyone", 0, EXPIRY_NS + 1);
    c.expire(0);
    c.expire(1);
    assert_eq!(c.get_match(0).unwrap().status, "refund");
    assert_eq!((bal(&c, "host"), bal(&c, "guest")), (2 * N, N)); // both stakes credited, no claim
}

#[test]
#[should_panic(expected = "Not expired yet")]
fn expire_too_early() {
    let mut c = live(N);
    as_at("anyone", 0, EXPIRY_NS - 1);
    c.expire(0);
}

#[test]
fn cancel_refunds_host() {
    let mut c = setup();
    create(&mut c, "host", N, true);
    as_("host", 0);
    c.cancel_match(0);
    assert_eq!(c.get_match(0).unwrap().status, "refund");
    assert_eq!(c.claimable(0, acc("host")).0, 0); // already credited
    assert_eq!(bal(&c, "host"), N);
}

#[test]
fn list_newest_first_and_game_filter() {
    let mut c = setup();
    as_("arena", 1);
    c.register_game("other".into(), acc("ref2"), None, None);
    for g in [G, "other", G] {
        create_in(&mut c, g, "host", 0, false);
    }
    let ids = |v: Vec<MatchView>| v.iter().map(|m| m.id).collect::<Vec<u64>>();
    assert_eq!(ids(c.list_matches(0, 10, None)), vec![2, 1, 0]);
    assert_eq!(ids(c.list_matches(1, 1, None)), vec![1]);
    assert_eq!(ids(c.list_matches(0, 10, Some(G.into()))), vec![2, 0]);
    assert_eq!(ids(c.list_matches(1, 10, Some("other".into()))), vec![1]);
    assert_eq!(c.list_games().len(), 2);
    assert_eq!(c.get_game("other".into()).unwrap().referee_id, acc("ref2"));
}

#[test]
fn per_game_referee() {
    let mut c = setup();
    as_("arena", 1);
    c.register_game("other".into(), acc("ref2"), None, None);
    create_in(&mut c, "other", "host", 0, false);
    join(&mut c, "guest", 0);
    as_("ref2", 0);
    c.report_result(0, Some(0), None, None);
    assert_eq!(c.get_match(0).unwrap().status, "settled");
}

#[test]
#[should_panic(expected = "Only referee")]
fn other_game_referee_rejected() {
    let mut c = live(N);
    as_("arena", 1);
    c.register_game("other".into(), acc("ref2"), None, None);
    as_("ref2", 0);
    c.report_result(0, Some(0), None, None);
}

#[test]
fn owner_limits_need_one_yocto() {
    let mut c = setup();
    as_("arena", 1);
    c.set_limits(U128(N));
    assert_eq!(c.config().max_bet.0, N);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn owner_without_yocto_rejected() {
    let mut c = setup();
    as_("arena", 0);
    c.register_game("evil".into(), acc("evil"), None, None);
}

#[test]
#[should_panic(expected = "Only owner")]
fn register_game_owner_only() {
    let mut c = setup();
    as_("evil", 1);
    c.register_game(G.into(), acc("evil"), None, None);
}

/* ---------- monsters + tournaments ---------- */

/// Receipts of last call: "receiver.method(args)" or "receiver<-yocto".
fn calls() -> Vec<String> {
    use near_sdk::mock::MockAction;
    near_sdk::test_utils::get_created_receipts()
        .iter()
        .flat_map(|r| {
            r.actions.iter().filter_map(move |a| match a {
                MockAction::FunctionCallWeight { method_name, args, .. } => {
                    Some(format!("{}.{}({})", r.receiver_id, String::from_utf8_lossy(method_name), String::from_utf8_lossy(args)))
                }
                MockAction::Transfer { deposit, .. } => Some(format!("{}<-{}", r.receiver_id, deposit.as_yoctonear())),
                _ => None,
            })
        })
        .collect()
}

fn has(call: &str) -> bool {
    let c = calls();
    c.iter().any(|x| x == call) || panic!("{call} not in {c:?}")
}

/// create_match w/ monster: stake debited now, match only after lock lands.
fn create_mon(c: &mut Arena, host: &str, stake: u128, bettable: bool, mon: &str) {
    fund(c, host, stake);
    as_(host, 1);
    assert!(matches!(c.create_match(G.into(), U128(stake), bettable, Some(mon.into())), PromiseOrValue::Promise(_)));
}

#[test]
fn monster_match_full_flow() {
    let mut c = setup();
    create_mon(&mut c, "host", N, false, "1");
    assert!(calls().iter().any(|x| { x.starts_with(r#"mon.lock({"token_id":"1","account_id":"host","until_ms":18000000}"#) }));
    assert!(c.get_match(0).is_none());
    assert_eq!(bal(&c, "host"), 0);
    cb(true);
    assert_eq!(c.on_create(G.into(), acc("host"), U128(N), false, "1".into(), 7), Some(0));
    fund(&mut c, "guest", N);
    as_("guest", 1);
    let _ = c.join_match(0, Some("2".into()));
    assert_eq!((c.get_match(0).unwrap().status.as_str(), bal(&c, "guest")), ("open", 0));
    cb(true);
    assert!(c.on_join(0, acc("guest"), U128(N), "2".into(), 7));
    let m = c.get_match(0).unwrap();
    assert_eq!((m.status.as_str(), m.monsters.clone(), m.tournament), ("live", [Some("1".into()), Some("2".into())], None));
    as_("ref", 0);
    c.report_result(0, Some(1), Some([0, 2]), None);
    has(r#"mon.record_result({"match_id":0,"tokens":["1","2"],"winner":1,"kos":[0,2],"tournament":null})"#);
    has(r#"mon.unlock({"locks":[["1",7],["2",7]]})"#);
}

#[test]
fn failed_lock_recredits_without_unlock() {
    let mut c = setup();
    create_mon(&mut c, "host", N, false, "1");
    cb(false);
    assert_eq!(c.on_create(G.into(), acc("host"), U128(N), false, "1".into(), 7), None);
    assert!(calls().is_empty());
    assert!(c.get_match(0).is_none());
    assert_eq!(bal(&c, "host"), N);
}

#[test]
fn join_callback_after_someone_else_joined() {
    let mut c = setup();
    create(&mut c, "host", N, false);
    fund(&mut c, "g1", N);
    as_("g1", 1);
    let _ = c.join_match(0, Some("7".into()));
    join(&mut c, "g2", 0);
    cb(true);
    assert!(!c.on_join(0, acc("g1"), U128(N), "7".into(), 7));
    assert_eq!(calls(), vec![r#"mon.unlock({"locks":[["7",7]]})"#.to_string()]);
    assert_eq!(c.get_match(0).unwrap().guest, Some(acc("g2")));
    assert_eq!(bal(&c, "g1"), N);
}

#[test]
fn cancel_and_expire_unlock() {
    let mut c = setup();
    cb(true);
    c.on_create(G.into(), acc("host"), U128(0), false, "1".into(), 7);
    as_("host", 0);
    c.cancel_match(0);
    has(r#"mon.unlock({"locks":[["1",7]]})"#);
    cb(true);
    c.on_create(G.into(), acc("host"), U128(0), false, "2".into(), 7);
    as_at("anyone", 0, EXPIRY_NS + 1);
    c.expire(1);
    has(r#"mon.unlock({"locks":[["2",7]]})"#);
}

fn tourney(size: u8) -> Arena {
    let mut c = setup();
    as_("arena", 1);
    assert_eq!(c.create_tournament(G.into(), size, U128(N), true), 0);
    c
}

fn enter(c: &mut Arena, who: &str) -> bool {
    fund(c, who, N);
    as_(who, 1);
    let _ = c.enter_tournament(0, format!("m-{who}"));
    assert!(calls()[0].starts_with(&format!(r#"mon.lock({{"token_id":"m-{who}","account_id":"{who}","until_ms":{}}}"#, 72 * 3_600_000)));
    assert_eq!(bal(c, who), 0);
    cb(true);
    c.on_enter(0, acc(who), U128(N), format!("m-{who}"), 259200000)
}

fn result(c: &mut Arena, id: u64, w: Option<u8>) {
    as_("ref", 0);
    c.report_result(id, w, None, None);
}

#[test]
fn tournament_4_full_run() {
    let mut c = tourney(4);
    for p in ["p0", "p1", "p2", "p3"] {
        assert!(enter(&mut c, p));
    }
    let t = c.get_tournament(0).unwrap();
    assert_eq!(
        (t.status.as_str(), t.pot.0, t.rounds.clone(), t.game.as_str()),
        ("live", 4 * N, vec![vec![Some(0), Some(1)], vec![None]], G)
    );
    let m = c.get_match(1).unwrap();
    assert_eq!(
        (m.host, m.guest, m.stake.0, m.status, m.tournament, m.game),
        (acc("p2"), Some(acc("p3")), 0, "live".into(), Some(0), G.into())
    );
    assert_eq!(m.monsters, [Some("m-p2".into()), Some("m-p3".into())]);
    assert!(m.bettable);
    order(&mut c, "bob", 1, 4000, 10);
    order(&mut c, "cat", 0, 6000, 10);
    result(&mut c, 0, Some(1));
    has(r#"mon.record_result({"match_id":0,"tokens":["m-p0","m-p1"],"winner":1,"kos":[0,0],"tournament":0})"#);
    assert_eq!(calls()[1], r#"mon.unlock({"locks":[["m-p0",259200000]]})"#); // loser only
    assert_eq!(c.get_tournament(0).unwrap().rounds[1], vec![None]);
    assert_eq!(claim_as(&mut c, "bob"), 10 * UNIT - 10 * UNIT / 1000);
    assert_eq!(c.claimable(0, acc("p1")).0, 0);
    result(&mut c, 1, Some(0));
    let f = c.get_match(2).unwrap();
    assert_eq!((f.host, f.guest, f.monsters), (acc("p1"), Some(acc("p2")), [Some("m-p1".into()), Some("m-p2".into())]));
    let t0 = c.config().treasury.0;
    result(&mut c, 2, Some(1));
    has(r#"mon.add_title({"token_id":"m-p2","title":"Tournament #0 Champion"})"#);
    has(r#"mon.unlock({"locks":[["m-p2",259200000]]})"#);
    has(r#"mon.unlock({"locks":[["m-p1",259200000]]})"#);
    let t = c.get_tournament(0).unwrap();
    assert_eq!((t.status.as_str(), t.champion), ("done", Some(acc("p2"))));
    let fee = c.config().treasury.0 - t0;
    as_("p2", 0);
    let prize = c.claim_tournament(0).0;
    assert_eq!(prize + fee, 4 * N);
    assert_eq!(fee, 4 * N / 1000);
    assert_eq!(bal(&c, "p2"), prize);
    assert_eq!(c.get_tournament(0).unwrap().claimed, vec![false, false, true, false]);
}

#[test]
#[should_panic(expected = "Nothing to claim")]
fn tournament_loser_cannot_claim() {
    let mut c = tourney(4);
    for p in ["p0", "p1", "p2", "p3"] {
        enter(&mut c, p);
    }
    for id in 0..3 {
        result(&mut c, id, Some(0));
    }
    as_("p1", 0);
    c.claim_tournament(0);
}

#[test]
fn tournament_8_with_voids() {
    let mut c = tourney(8);
    let ps: Vec<String> = (0..8).map(|i| format!("p{i}")).collect();
    for p in &ps {
        assert!(enter(&mut c, p));
    }
    assert_eq!(c.get_tournament(0).unwrap().rounds[0], vec![Some(0), Some(1), Some(2), Some(3)]);
    result(&mut c, 0, Some(1)); // p1
    result(&mut c, 1, None); // void, no KOs -> seat 0: p2
    has(r#"mon.unlock({"locks":[["m-p3",259200000]]})"#);
    result(&mut c, 3, Some(1)); // p7
    as_at("anyone", 0, EXPIRY_NS + 1);
    c.expire(2); // tie -> seat 0: p4
    let r = c.get_tournament(0).unwrap().rounds;
    assert_eq!(r[1], vec![Some(4), Some(5)]);
    let (a, b) = (c.get_match(4).unwrap(), c.get_match(5).unwrap());
    assert_eq!((a.host, a.guest), (acc("p1"), Some(acc("p2"))));
    assert_eq!((b.host, b.guest), (acc("p4"), Some(acc("p7"))));
    result(&mut c, 5, Some(0)); // p4
    result(&mut c, 4, Some(1)); // p2, later slot first: host still even slot
    let f = c.get_match(6).unwrap();
    assert_eq!((f.host, f.guest, f.tournament), (acc("p2"), Some(acc("p4")), Some(0)));
    result(&mut c, 6, Some(0));
    let t = c.get_tournament(0).unwrap();
    assert_eq!((t.status.as_str(), t.champion, t.rounds[2].clone()), ("done", Some(acc("p2")), vec![Some(6)]));
    as_("p2", 0);
    assert_eq!(c.claim_tournament(0).0, 8 * N - 8 * N / 1000);
}

#[test]
#[should_panic(expected = "Already entered")]
fn duplicate_entry_rejected() {
    let mut c = tourney(4);
    enter(&mut c, "p0");
    fund(&mut c, "p0", N);
    as_("p0", 1);
    let _ = c.enter_tournament(0, "other".into());
}

#[test]
fn duplicate_or_late_entry_in_flight_bounces() {
    let mut c = tourney(4);
    enter(&mut c, "p0");
    cb(true); // 2nd p0 entry passed upfront check before 1st landed
    assert!(!c.on_enter(0, acc("p0"), U128(N), "x".into(), 7));
    assert_eq!(calls(), vec![r#"mon.unlock({"locks":[["x",7]]})"#.to_string()]);
    assert_eq!(bal(&c, "p0"), N);
    for p in ["p1", "p2", "p3"] {
        enter(&mut c, p);
    }
    cb(true); // 5th entry landed after fill
    assert!(!c.on_enter(0, acc("p4"), U128(N), "y".into(), 7));
    assert_eq!(calls(), vec![r#"mon.unlock({"locks":[["y",7]]})"#.to_string()]);
    let mut c = tourney(4);
    cb(false); // lock failed: re-credit, nothing to unlock
    assert!(!c.on_enter(0, acc("p9"), U128(N), "z".into(), 7));
    assert!(calls().is_empty());
    assert_eq!((c.get_tournament(0).unwrap().pot.0, bal(&c, "p9")), (0, N));
}

#[test]
#[should_panic(expected = "Insufficient balance")]
fn entry_needs_balance() {
    let mut c = tourney(4);
    fund(&mut c, "p0", N / 2);
    as_("p0", 1);
    let _ = c.enter_tournament(0, "1".into());
}

#[test]
fn cancel_tournament_refunds() {
    let mut c = tourney(4);
    enter(&mut c, "p0");
    enter(&mut c, "p1");
    as_at("anyone", 0, TOURNEY_CANCEL_NS + 1);
    c.cancel_tournament(0);
    has(r#"mon.unlock({"locks":[["m-p0",259200000],["m-p1",259200000]]})"#);
    assert_eq!(c.get_tournament(0).unwrap().status, "cancelled");
    for p in ["p0", "p1"] {
        as_(p, 0);
        assert_eq!(c.claim_tournament(0).0, N);
        assert_eq!(bal(&c, p), N);
    }
    assert_eq!(c.get_tournament(0).unwrap().claimed, vec![true, true]);
}

#[test]
#[should_panic(expected = "Not expired yet")]
fn cancel_tournament_too_early() {
    let mut c = tourney(4);
    as_at("anyone", 0, TOURNEY_CANCEL_NS - 1);
    c.cancel_tournament(0);
}

#[test]
#[should_panic(expected = "Size must be 4 or 8")]
fn tournament_size() {
    let mut c = setup();
    as_("arena", 1);
    c.create_tournament(G.into(), 6, U128(N), false);
}

#[test]
fn list_tournaments_newest_first() {
    let mut c = setup();
    as_("arena", 1);
    c.register_game("other".into(), acc("ref2"), None, None);
    for g in [G, "other", G] {
        as_("arena", 1);
        c.create_tournament(g.into(), 4, U128(N), false);
    }
    let ids = |v: Vec<TournamentView>| v.iter().map(|t| t.id).collect::<Vec<u64>>();
    assert_eq!(ids(c.list_tournaments(1, 5, None)), vec![1, 0]);
    assert_eq!(ids(c.list_tournaments(0, 5, Some(G.into()))), vec![2, 0]);
}

/// Void tournament match w/ `kos` under random seed `r`: more KOs advances, tie -> seat 0; seed ignored.
fn void_with(kos: Option<[u8; 2]>, r: u8) -> Arena {
    let mut c = tourney(4);
    for p in ["p0", "p1", "p2", "p3"] {
        enter(&mut c, p);
    }
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("arena")).predecessor_account_id(acc("ref")).random_seed([r; 32]);
    testing_env!(b.build());
    c.report_result(0, None, kos, None);
    c
}

#[test]
fn void_advances_by_kos_not_seed() {
    for (kos, adv, out) in [(None, "p0", "p1"), (Some([1, 1]), "p0", "p1"), (Some([2, 1]), "p0", "p1"), (Some([0, 3]), "p1", "p0")] {
        for r in [0, 1, 255] {
            let mut c = void_with(kos, r);
            has(&format!(r#"mon.unlock({{"locks":[["m-{out}",259200000]]}})"#));
            result(&mut c, 1, Some(0));
            assert_eq!(c.get_match(2).unwrap().host, acc(adv));
        }
    }
}

#[test]
fn tape_hash_stored() {
    let mut c = live(N);
    assert_eq!(c.get_match(0).unwrap().tape_hash, None);
    as_("ref", 0);
    c.report_result(0, Some(0), None, Some(TAPE.into()));
    assert_eq!(c.get_match(0).unwrap().tape_hash.as_deref(), Some(TAPE));
}

#[test]
fn tape_hash_validated() {
    for bad in [&TAPE[1..], &TAPE.to_uppercase(), &format!("{}z", &TAPE[1..])] {
        let mut c = live(N);
        as_("ref", 0);
        let bad = bad.to_string();
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.report_result(0, Some(0), None, Some(bad)))).is_err());
    }
}

#[test]
fn unjoin_refunds_guest_and_reopens() {
    let mut c = setup();
    create(&mut c, "host", N, true);
    fund(&mut c, "g1", N);
    as_("g1", 1);
    let _ = c.join_match(0, Some("7".into()));
    cb(true);
    assert!(c.on_join(0, acc("g1"), U128(N), "7".into(), 9));
    as_("ref", 0);
    c.unjoin(0);
    has(r#"mon.unlock({"locks":[["7",9]]})"#);
    let m = c.get_match(0).unwrap();
    assert_eq!((m.status.as_str(), m.guest, m.monsters[1].clone(), bal(&c, "g1")), ("open", None, None, N));
    join(&mut c, "g2", 0);
    assert_eq!(c.get_match(0).unwrap().guest, Some(acc("g2")));
    as_("ref", 0);
    c.report_result(0, Some(1), None, None);
    assert_eq!(bal(&c, "g2"), 2 * N - 2 * N / 1000);
    assert_eq!(c.claimable(0, acc("g1")).0, 0);
}

#[test]
#[should_panic(expected = "Only referee")]
fn unjoin_referee_only() {
    let mut c = live(N);
    as_("host", 0);
    c.unjoin(0);
}

#[test]
#[should_panic(expected = "Match not unjoinable")]
fn unjoin_open_rejected() {
    let mut c = setup();
    create(&mut c, "host", N, false);
    as_("ref", 0);
    c.unjoin(0);
}

#[test]
#[should_panic(expected = "Entry closed")]
fn entry_window_closes() {
    let mut c = tourney(4);
    as_at("p0", 1, TOURNEY_CANCEL_NS + 1);
    let _ = c.enter_tournament(0, "1".into());
}

#[test]
#[should_panic(expected = "Attach 150 Tgas")]
fn entry_needs_gas() {
    let mut c = tourney(4);
    fund(&mut c, "p0", N);
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("arena"))
        .predecessor_account_id(acc("p0"))
        .attached_deposit(NearToken::from_yoctonear(1))
        .prepaid_gas(Gas::from_tgas(100));
    testing_env!(b.build());
    let _ = c.enter_tournament(0, "1".into());
}
