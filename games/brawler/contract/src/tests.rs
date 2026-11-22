use super::*;
use near_sdk::test_utils::{VMContextBuilder, get_created_receipts};
use near_sdk::mock::MockAction;
use near_sdk::testing_env;

const N: u128 = 1_000_000_000_000_000_000_000_000; // 1 NEAR
const T0: u64 = 1_700_000_000_000; // ms

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn as_(who: &str, deposit: u128) {
    as_at(who, deposit, T0);
}

fn as_at(who: &str, deposit: u128, ms: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("monsters"))
        .predecessor_account_id(acc(who))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(1_000))
        .random_seed([7; 32])
        .block_timestamp(ms * 1_000_000);
    testing_env!(b.build());
}

/// (receiver, yocto) for every transfer scheduled in the current call.
fn transfers() -> Vec<(String, u128)> {
    get_created_receipts()
        .iter()
        .flat_map(|r| {
            r.actions.iter().filter_map(|a| match a {
                MockAction::Transfer { deposit, .. } => Some((r.receiver_id.to_string(), deposit.as_yoctonear())),
                _ => None,
            })
        })
        .collect()
}

fn setup() -> Monsters {
    as_("owner", 0);
    Monsters::new(acc("owner"), acc("arena"))
}

/// alice owns 0,1,2 (gen 0).
fn with_starters() -> Monsters {
    let mut c = setup();
    as_("alice", N);
    c.hatch_starters();
    c
}

fn dna(v: [u16; 11]) -> Dna {
    Dna {
        str: v[0] as u8,
        dex: v[1] as u8,
        def: v[2] as u8,
        spd: v[3] as u8,
        hue: v[4],
        accent: v[5],
        horn: v[6] as u8,
        tail: v[7] as u8,
        pattern: v[8] as u8,
        eye: v[9] as u8,
        size: v[10] as u8,
    }
}

fn give(c: &mut Monsters, from: &str, to: &str, id: &str) {
    as_(from, 1);
    c.nft_transfer(acc(to), id.into(), None, None);
}

fn result(c: &mut Monsters, match_id: u64, a: &str, b: &str, winner: Option<u8>, ms: u64) {
    as_at("arena", 0, ms);
    c.record_result(match_id, [Some(a.into()), Some(b.into())], winner, [2, 1], None);
}

/// Tournament match: the only kind that counts for season wins.
fn t_result(c: &mut Monsters, match_id: u64, a: &str, b: &str, ms: u64) {
    as_at("arena", 0, ms);
    c.record_result(match_id, [Some(a.into()), Some(b.into())], Some(0), [2, 1], Some(1));
}

/// Callback context: arena-free, called by the contract itself with one promise result.
fn as_callback(ok: bool) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("monsters")).predecessor_account_id(acc("monsters")).block_timestamp(T0 * 1_000_000);
    let r = if ok { near_sdk::PromiseResult::Successful(vec![]) } else { near_sdk::PromiseResult::Failed };
    testing_env!(b.build(), near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), vec![r]);
}

/* ---------- genes ---------- */

#[test]
fn gene_vectors_match_ts() {
    // from `node --experimental-strip-types` against client/src/lib/genes.ts
    let rand: [(u32, [u16; 11], &str); 5] = [
        (0, [5, 4, 7, 6, 168, 196, 2, 1, 1, 2, 97], "Tormak"),
        (1, [4, 3, 6, 9, 348, 101, 2, 2, 1, 3, 101], "Rhator"),
        (42, [6, 5, 5, 6, 62, 189, 1, 1, 2, 1, 97], "Bramfen"),
        (0xdeadbeef, [9, 3, 5, 5, 171, 301, 0, 0, 0, 0, 108], "Brammak"),
        (u32::MAX, [6, 3, 7, 6, 304, 194, 2, 1, 0, 3, 110], "Fenbramox"),
    ];
    for (s, d, name) in rand {
        assert_eq!(genes::random_dna(s), dna(d), "randomDna({s})");
        assert_eq!(genes::name_for(s), name, "nameFor({s})");
    }
    // breed(randomDna(1), randomDna(2), seed); covers no mutation + each mutation kind
    let (a, b) = (genes::random_dna(1), genes::random_dna(2));
    let bred: [(u32, [u16; 11], &str); 10] = [
        (0, [6, 3, 6, 7, 339, 101, 2, 2, 1, 0, 106], "Tormak"),
        (6, [6, 4, 3, 9, 282, 101, 1, 2, 2, 3, 102], "Pelveltor"), // hue
        (14, [6, 3, 6, 7, 333, 101, 1, 2, 1, 3, 106], "Zupel"),    // dex
        (18, [5, 4, 6, 7, 335, 227, 1, 2, 2, 2, 107], "Zumak"),    // eye
        (27, [4, 3, 6, 9, 335, 101, 1, 2, 2, 3, 103], "Bramzuqua"), // horn
        (28, [4, 5, 7, 6, 334, 227, 1, 1, 1, 3, 105], "Bramsu"),   // def
        (34, [6, 3, 5, 8, 328, 227, 2, 2, 1, 0, 105], "Rhamakbram"), // str
        (40, [4, 3, 6, 9, 327, 227, 2, 1, 1, 0, 106], "Quasu"),    // pattern
        (58, [7, 4, 4, 7, 332, 227, 1, 2, 2, 3, 105], "Quavel"),   // spd
        (134, [6, 3, 4, 9, 327, 227, 1, 1, 1, 0, 102], "Zubramdra"), // tail
    ];
    for (s, d, name) in bred {
        assert_eq!(genes::breed(&a, &b, s), dna(d), "breed seed {s}");
        assert_eq!(genes::name_for(s), name);
    }
    // hue mix rounding to 360 wraps to 0
    let (x, y) = (genes::random_dna(104), genes::random_dna(111));
    assert_eq!(genes::breed(&x, &y, 104), dna([9, 5, 3, 5, 0, 275, 1, 1, 0, 0, 112]));
}

/* ---------- hatch ---------- */

#[test]
fn hatch_once_and_refund() {
    let mut c = setup();
    as_("alice", N);
    let v = c.hatch_starters();
    assert_eq!(v.iter().map(|m| m.token_id.as_str()).collect::<Vec<_>>(), ["0", "1", "2"]);
    assert!(v.iter().all(|m| m.r#gen == 0 && m.owner_id == acc("alice") && m.parents.is_none()));
    let t = transfers();
    assert_eq!(t.len(), 1);
    assert_eq!(t[0].0, "alice");
    let storage = N - t[0].1;
    assert!(storage > 0 && storage < N / 10, "storage {storage}");
    // seeds base, base+1, base+2 from random_seed[0..4]
    let base = u32::from_le_bytes([7; 4]);
    assert_eq!(v[1].dna, genes::random_dna(base + 1));
    assert_eq!(v[1].name, genes::name_for(base + 1));
    assert!(c.starters_claimed(acc("alice")));
    assert_eq!(c.monsters_of(acc("alice"), 0, 10).len(), 3);
    assert_eq!(c.nft_total_supply().0, 3);
    assert_eq!(c.nft_token("0".into()).unwrap().metadata.unwrap().title, Some(v[0].name.clone()));
    // JSON keeps the spec field name
    let j = serde_json::to_value(&v[0]).unwrap();
    assert_eq!(j["gen"], 0);
}

#[test]
#[should_panic(expected = "Starters already claimed")]
fn hatch_twice() {
    let mut c = with_starters();
    as_("alice", N);
    c.hatch_starters();
}

#[test]
#[should_panic(expected = "Attach at least")]
fn hatch_needs_storage_deposit() {
    let mut c = setup();
    as_("alice", 0);
    c.hatch_starters();
}

/* ---------- breed ---------- */

#[test]
fn breed_child_fee_and_cooldown() {
    let mut c = with_starters();
    as_("alice", N);
    let k = c.breed("0".into(), "1".into());
    assert_eq!(k.token_id, "3");
    assert_eq!(k.r#gen, 1);
    assert_eq!(k.parents, Some(["0".to_string(), "1".to_string()]));
    assert_eq!(k.breeder, acc("alice"));
    let (a, b) = (c.get_monster("0".into()).unwrap(), c.get_monster("1".into()).unwrap());
    assert_eq!(k.dna, genes::breed(&a.dna, &b.dna, u32::from_le_bytes([7; 4])));
    assert_eq!(a.cooldown_until_ms, T0 + HOUR_MS);
    assert_eq!(c.config().treasury.0, N / 10);
    let t = transfers();
    assert_eq!(t.len(), 1);
    assert!(t[0].1 < N - N / 10 && t[0].1 > N - N / 5); // refund = 1 - 0.1 fee - storage

    // grandchild after cooldown: gen = max + 1
    as_at("alice", N, T0 + HOUR_MS);
    let g = c.breed("3".into(), "2".into());
    assert_eq!(g.r#gen, 2);
}

#[test]
#[should_panic(expected = "Monster is on breeding cooldown")]
fn breed_cooldown() {
    let mut c = with_starters();
    as_("alice", N);
    c.breed("0".into(), "1".into());
    as_at("alice", N, T0 + HOUR_MS - 1);
    c.breed("0".into(), "2".into());
}

#[test]
#[should_panic(expected = "Attach at least")]
fn breed_needs_fee() {
    let mut c = with_starters();
    as_("alice", N / 10); // fee only, no storage
    c.breed("0".into(), "1".into());
}

#[test]
#[should_panic(expected = "Pick two different monsters")]
fn breed_same() {
    let mut c = with_starters();
    as_("alice", N);
    c.breed("0".into(), "0".into());
}

#[test]
#[should_panic(expected = "Not your monster")]
fn breed_not_owner() {
    let mut c = with_starters();
    as_("bob", N);
    c.breed("0".into(), "1".into());
}

/* ---------- market ---------- */

#[test]
fn buy_pays_seller_royalty_and_fee() {
    let mut c = with_starters();
    as_("alice", N);
    c.breed("0".into(), "1".into()); // 3: gen 1, breeder alice
    give(&mut c, "alice", "bob", "3");
    as_("bob", 1);
    c.list("3".into(), U128(10 * N));
    assert_eq!(c.listings(0, 10).len(), 1);
    let before = c.config().treasury.0;

    as_("carol", 10 * N);
    c.buy("3".into());
    let mut t = transfers();
    t.sort();
    assert_eq!(t, vec![("alice".into(), N / 2), ("bob".into(), 10 * N - N / 4 - N / 2)]);
    assert_eq!(c.config().treasury.0 - before, N / 4);
    let m = c.get_monster("3".into()).unwrap();
    assert_eq!(m.owner_id, acc("carol"));
    assert!(m.price.is_none());
    assert!(c.listings(0, 10).is_empty());
}

#[test]
fn buy_gen0_or_own_bred_has_no_royalty() {
    let mut c = with_starters();
    as_("alice", 1);
    c.list("0".into(), U128(4 * N));
    as_("bob", 4 * N);
    c.buy("0".into());
    assert_eq!(transfers(), vec![("alice".to_string(), 4 * N - N / 10)]);
}

#[test]
#[should_panic(expected = "Deposit must equal price")]
fn buy_wrong_deposit() {
    let mut c = with_starters();
    as_("alice", 1);
    c.list("0".into(), U128(N));
    as_("bob", N + 1);
    c.buy("0".into());
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn list_needs_one_yocto() {
    let mut c = with_starters();
    as_("alice", 0);
    c.list("0".into(), U128(N));
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn offer_rent_needs_one_yocto() {
    let mut c = with_starters();
    as_("alice", 0);
    c.offer_rent("0".into(), U128(N), 3);
}

#[test]
#[should_panic(expected = "Not your monster")]
fn list_not_owner() {
    let mut c = with_starters();
    as_("bob", 1);
    c.list("0".into(), U128(N));
}

#[test]
fn transfer_clears_listing_and_offer() {
    let mut c = with_starters();
    as_("alice", 1);
    c.list("0".into(), U128(N));
    c.offer_rent("0".into(), U128(N), 3);
    give(&mut c, "alice", "bob", "0");
    let m = c.get_monster("0".into()).unwrap();
    assert!(m.price.is_none() && m.rent_offer.is_none());
    assert!(c.listings(0, 10).is_empty() && c.rent_offers(0, 10).is_empty());
}

/* ---------- rentals ---------- */

fn rented() -> Monsters {
    let mut c = with_starters();
    as_("alice", 1);
    c.offer_rent("0".into(), U128(N), 3);
    as_("bob", 2 * N);
    c.rent("0".into(), 2);
    c
}

#[test]
fn rent_pays_owner_and_gives_fight_rights() {
    let mut c = rented();
    assert_eq!(transfers(), vec![("alice".to_string(), 2 * N - 2 * N / 40)]);
    assert_eq!(c.config().treasury.0, 2 * N / 40);
    let m = c.get_monster("0".into()).unwrap();
    assert_eq!(m.rental.as_ref().unwrap().until_ms, T0 + 2 * DAY_MS);
    assert!(m.rent_offer.is_some()); // stays for the next renter
    assert_eq!(c.rented_by(acc("bob")).len(), 1);
    as_("arena", 0);
    c.lock("0".into(), acc("bob"), T0 + 1000);
}

#[test]
#[should_panic(expected = "Rental ends before the match")]
fn renter_lock_capped_by_rental() {
    let mut c = rented();
    as_("arena", 0);
    c.lock("0".into(), acc("bob"), T0 + 2 * DAY_MS + 1);
}

#[test]
fn bounced_transfer_call_clears_rental() {
    let mut c = with_starters();
    as_("alice", 1);
    let _ = c.nft_transfer_call(acc("dex"), "0".into(), None, None, "".into());
    // receiver rents it out before nft_on_transfer returns "give it back"
    as_("dex", 1);
    c.offer_rent("0".into(), U128(N), 3);
    as_("bob", N);
    c.rent("0".into(), 1);
    // nft_on_transfer returned true = return the token
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("monsters")).predecessor_account_id(acc("monsters")).block_timestamp(T0 * 1_000_000);
    let ret = near_sdk::PromiseResult::Successful(serde_json::to_vec(&true).unwrap());
    testing_env!(b.build(), near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), vec![ret]);
    assert!(!c.nft_resolve_transfer(acc("alice"), acc("dex"), "0".into(), None));
    let m = c.get_monster("0".into()).unwrap();
    assert_eq!(m.owner_id, acc("alice"));
    assert!(m.rental.is_none() && m.rent_offer.is_none());
    give(&mut c, "alice", "carol", "0"); // free again
}

#[test]
#[should_panic(expected = "Monster is rented out")]
fn owner_cannot_fight_while_rented() {
    let mut c = rented();
    as_("arena", 0);
    c.lock("0".into(), acc("alice"), T0 + 1000);
}

#[test]
#[should_panic(expected = "Monster is busy")]
fn owner_cannot_transfer_while_rented() {
    let mut c = rented();
    give(&mut c, "alice", "carol", "0");
}

#[test]
#[should_panic(expected = "Monster is busy")]
fn owner_cannot_list_while_rented() {
    let mut c = rented();
    as_("alice", 1);
    c.list("0".into(), U128(N));
}

#[test]
#[should_panic(expected = "Monster is busy")]
fn owner_cannot_breed_while_rented() {
    let mut c = rented();
    as_("alice", N);
    c.breed("0".into(), "1".into());
}

#[test]
#[should_panic(expected = "Not your monster")]
fn renter_cannot_list() {
    let mut c = rented();
    as_("bob", 1);
    c.list("0".into(), U128(N));
}

#[test]
#[should_panic(expected = "Monster is busy")]
fn no_double_rent() {
    let mut c = rented();
    as_("carol", N);
    c.rent("0".into(), 1);
}

#[test]
#[should_panic(expected = "Bad rental length")]
fn rent_too_long() {
    let mut c = with_starters();
    as_("alice", 1);
    c.offer_rent("0".into(), U128(N), 3);
    as_("bob", 4 * N);
    c.rent("0".into(), 4);
}

#[test]
fn rental_expires() {
    let mut c = rented();
    as_at("alice", 1, T0 + 2 * DAY_MS);
    c.list("0".into(), U128(N));
    assert!(c.get_monster("0".into()).unwrap().rental.is_none());
    assert!(c.rented_by(acc("bob")).is_empty());
}

/* ---------- arena ---------- */

#[test]
fn lock_blocks_transfer_until_unlock() {
    let mut c = with_starters();
    as_("arena", 0);
    let d = c.lock("0".into(), acc("alice"), T0 + 1000);
    assert_eq!(d, c.get_monster("0".into()).unwrap().dna);
    as_("alice", 1);
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.nft_transfer(acc("bob"), "0".into(), None, None)
    }));
    assert!(r.is_err());
    as_("arena", 0);
    c.unlock(vec![("0".into(), T0 + 1000), ("nope".into(), 1)]);
    assert_eq!(c.get_monster("0".into()).unwrap().locked_until_ms, 0);
    give(&mut c, "alice", "bob", "0");
    // expired lock is free again
    as_("arena", 0);
    c.lock("1".into(), acc("alice"), T0 + 1000);
    as_at("arena", 0, T0 + 1000);
    c.lock("1".into(), acc("alice"), T0 + 2000);
}

#[test]
fn stale_unlock_keeps_newer_lock() {
    let mut c = with_starters();
    as_("arena", 0);
    c.lock("0".into(), acc("alice"), T0 + 1000);
    as_at("arena", 0, T0 + 1000); // old lock expired, new match locks it
    c.lock("0".into(), acc("alice"), T0 + 5000);
    c.unlock(vec![("0".into(), T0 + 1000)]); // late unlock from the old match
    assert_eq!(c.get_monster("0".into()).unwrap().locked_until_ms, T0 + 5000);
    c.unlock(vec![("0".into(), T0 + 5000)]);
    assert_eq!(c.get_monster("0".into()).unwrap().locked_until_ms, 0);
}

#[test]
#[should_panic(expected = "Monster is busy")]
fn double_lock() {
    let mut c = with_starters();
    as_("arena", 0);
    c.lock("0".into(), acc("alice"), T0 + 1000);
    c.lock("0".into(), acc("alice"), T0 + 1000);
}

#[test]
#[should_panic(expected = "Monster is listed for sale")]
fn lock_listed() {
    let mut c = with_starters();
    as_("alice", 1);
    c.list("0".into(), U128(N));
    as_("arena", 0);
    c.lock("0".into(), acc("alice"), T0 + 1000);
}

#[test]
#[should_panic(expected = "Only arena")]
fn lock_arena_only() {
    let mut c = with_starters();
    as_("alice", 0);
    c.lock("0".into(), acc("alice"), T0 + 1000);
}

#[test]
#[should_panic(expected = "Only arena")]
fn unlock_arena_only() {
    let mut c = with_starters();
    as_("alice", 0);
    c.unlock(vec![("0".into(), 0)]);
}

#[test]
#[should_panic(expected = "Only arena")]
fn record_arena_only() {
    let mut c = with_starters();
    as_("alice", 0);
    c.record_result(0, [Some("0".into()), None], Some(0), [1, 0], None);
}

#[test]
#[should_panic(expected = "Only arena")]
fn add_title_arena_only() {
    let mut c = with_starters();
    as_("alice", 0);
    c.add_title("0".into(), "x".into());
}

#[test]
fn record_result_and_history_cap() {
    let mut c = with_starters();
    for i in 0..60 {
        result(&mut c, i, "0", "1", Some(0), T0 + i);
    }
    result(&mut c, 60, "0", "1", None, T0 + 60);
    let a = c.get_monster("0".into()).unwrap().record;
    assert_eq!(a, Record { w: 60, l: 0, ko: 122 });
    assert_eq!(c.get_monster("1".into()).unwrap().record, Record { w: 0, l: 60, ko: 61 });
    let h = c.get_history("0".into());
    assert_eq!(h.len(), MAX_HISTORY);
    assert_eq!(h[0], HistoryEntry { match_id: 60, vs: Some("1".into()), won: None, kos: 2, ms: T0 + 60, tournament: None });
    assert_eq!(h[1].won, Some(true));
    assert_eq!(h[49].match_id, 11);
    // unknown tokens are ignored, not a panic
    as_("arena", 0);
    c.record_result(61, [Some("zzz".into()), None], Some(0), [0, 0], Some(4));
    c.add_title("0".into(), "Tournament #4 Champion".into());
    assert_eq!(c.get_monster("0".into()).unwrap().titles, ["Tournament #4 Champion"]);
}

/* ---------- seasons ---------- */

#[test]
fn season_leaderboard_and_titles() {
    let mut c = with_starters();
    as_("owner", 1);
    c.start_season("S1".into(), T0 + DAY_MS);
    for (i, (w, l)) in [("1", "0"), ("1", "0"), ("2", "0"), ("1", "2"), ("2", "0"), ("2", "1"), ("0", "1")]
        .into_iter()
        .enumerate()
    {
        t_result(&mut c, i as u64, w, l, T0 + 1);
    }
    t_result(&mut c, 99, "0", "1", T0 + DAY_MS); // after ends_ms: not counted
    result(&mut c, 100, "0", "1", Some(0), T0 + 1); // free match: record only, no season win
    assert_eq!(c.get_monster("0".into()).unwrap().record.w, 3);
    assert_eq!(c.get_leaderboard(10), vec![("1".into(), 3), ("2".into(), 3), ("0".into(), 1)]);
    as_("owner", 1);
    c.end_season();
    assert!(!c.get_season().unwrap().active);
    assert_eq!(c.get_monster("1".into()).unwrap().titles, ["S1 Champion"]);
    assert_eq!(c.get_monster("2".into()).unwrap().titles, ["S1 Runner-up"]);
    assert_eq!(c.get_monster("0".into()).unwrap().titles, ["S1 Third"]);

    as_("owner", 1);
    c.start_season("S2".into(), T0 + 2 * DAY_MS);
    assert_eq!(c.get_season().unwrap().id, 2);
    assert!(c.get_leaderboard(10).is_empty());
}

#[test]
#[should_panic(expected = "A season is already active")]
fn one_season_at_a_time() {
    let mut c = setup();
    as_("owner", 1);
    c.start_season("S1".into(), T0 + DAY_MS);
    c.start_season("S2".into(), T0 + DAY_MS);
}

#[test]
#[should_panic(expected = "Only owner")]
fn season_owner_only() {
    let mut c = setup();
    as_("alice", 1);
    c.start_season("S1".into(), T0 + DAY_MS);
}

#[test]
fn season_top3_tracks_overtakes() {
    let mut c = with_starters();
    as_("alice", N);
    c.breed("0".into(), "1".into()); // 3
    as_("owner", 1);
    c.start_season("S1".into(), T0 + DAY_MS);
    // 0:2, 1:1, 2:1, then 3 climbs to 3 and pushes 2 (reached 1 later than 1) out
    for (i, w) in ["0", "0", "1", "2", "3", "3", "3"].into_iter().enumerate() {
        t_result(&mut c, i as u64, w, "0", T0 + 1);
    }
    assert_eq!(c.get_leaderboard(10), vec![("3".into(), 3), ("0".into(), 2), ("1".into(), 1), ("2".into(), 1)]);
    as_("owner", 1);
    c.end_season();
    assert_eq!(c.get_monster("3".into()).unwrap().titles, ["S1 Champion"]);
    assert_eq!(c.get_monster("1".into()).unwrap().titles, ["S1 Third"]);
    assert!(c.get_monster("2".into()).unwrap().titles.is_empty());
}

/* ---------- payouts ---------- */

#[test]
fn failed_payout_is_owed_not_treasury() {
    let mut c = rented(); // alice paid 2 NEAR - fee
    let treasury = c.config().treasury.0;
    as_callback(false);
    assert!(!c.on_pay(acc("alice"), U128(N)));
    assert_eq!(c.owed_of(acc("alice")).0, N);
    assert_eq!(c.config().treasury.0, treasury);
    as_callback(true);
    assert!(c.on_pay(acc("alice"), U128(N)));
    assert_eq!(c.owed_of(acc("alice")).0, N);

    as_("alice", 0);
    assert_eq!(c.withdraw_owed().0, N);
    assert_eq!(transfers(), vec![("alice".to_string(), N)]);
    assert_eq!(c.owed_of(acc("alice")).0, 0);
    as_callback(false); // withdrawal bounced: restored
    c.on_pay(acc("alice"), U128(N));
    assert_eq!(c.owed_of(acc("alice")).0, N);
}

#[test]
#[should_panic(expected = "Nothing owed")]
fn withdraw_owed_empty() {
    let mut c = setup();
    as_("alice", 0);
    c.withdraw_owed();
}

/* ---------- owner ---------- */

#[test]
fn withdraw_treasury() {
    let mut c = with_starters();
    as_("alice", N);
    c.breed("0".into(), "1".into());
    as_("owner", 1);
    c.withdraw_treasury(U128(N / 10));
    assert_eq!(transfers(), vec![("owner".to_string(), N / 10)]);
    assert_eq!(c.config().treasury.0, 0);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn owner_needs_one_yocto() {
    let mut c = setup();
    as_("owner", 0);
    c.set_arena(acc("arena2"));
}

/* ---------- skills ---------- */

const P: u128 = N / 20;

fn panics(msg: &str, f: impl FnOnce()) {
    let e = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)).expect_err(msg);
    let s = e.downcast_ref::<String>().cloned().or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_default();
    assert!(s.contains(msg), "expected '{msg}', got '{s}'");
}

fn skill(c: &mut Monsters, kind: SkillKind, mag: u8, rarity: Rarity, sup: Option<u32>) -> u32 {
    as_("maker", N);
    c.create_skill(0, format!("{kind:?} {mag}"), kind, mag, rarity, sup, 1000, "".into())
}

/// maker = creator. 0 Power1 C, 1 Speed2 R (supply 5), 2 AirJump R, 3 Lifesteal R, 4 QuickDodge R, 5 Power2 R, 6 Agility1 C
fn with_skills() -> Monsters {
    let mut c = setup();
    as_("owner", 1);
    c.add_creator(acc("maker"));
    as_("maker", N);
    assert_eq!(c.create_collection("Arena Basics".into(), "".into(), "".into()), 0);
    use Rarity::*;
    use SkillKind::*;
    for (k, m, r, s) in [(Power, 1, Common, None), (Speed, 2, Rare, Some(5)), (AirJump, 1, Rare, None), (Lifesteal, 1, Rare, None)] {
        skill(&mut c, k, m, r, s);
    }
    for (k, m, r) in [(QuickDodge, 1, Rare), (Power, 2, Rare), (Agility, 1, Common)] {
        skill(&mut c, k, m, r, None);
    }
    c
}

fn grant(c: &mut Monsters, to: &str, skill: u32, qty: u32) {
    as_("maker", N);
    c.mint_skill(skill, acc(to), qty);
}

fn free(c: &Monsters, who: &str, skill: u32) -> u128 {
    c.mt_balance_of(acc(who), format!("skill:{skill}")).0
}

fn events() -> Vec<serde_json::Value> {
    near_sdk::test_utils::get_logs()
        .iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .map(|j| serde_json::from_str(j).unwrap())
        .collect()
}

#[test]
fn creator_gating() {
    let mut c = with_skills();
    as_("alice", N);
    panics("Only creators", || {
        c.create_collection("x".into(), "".into(), "".into());
    });
    as_("alice", 1);
    panics("Only owner", || c.add_creator(acc("alice")));
    as_("owner", 1);
    c.add_creator(acc("alice"));
    assert!(c.is_creator(acc("alice")));
    as_("alice", N);
    panics("Not your collection", || {
        c.create_skill(0, "x".into(), SkillKind::Power, 1, Rarity::Common, None, 0, "".into());
    });
    as_("maker", N);
    panics("Bad magnitude", || {
        c.create_skill(0, "x".into(), SkillKind::AirJump, 2, Rarity::Rare, None, 0, "".into());
    });
    panics("Bad magnitude", || {
        c.create_skill(0, "x".into(), SkillKind::Power, 3, Rarity::Rare, None, 0, "".into());
    });
    panics("Royalty too high", || {
        c.create_skill(0, "x".into(), SkillKind::Power, 1, Rarity::Rare, None, 1001, "".into());
    });
    as_("alice", N);
    panics("Not your skill", || c.mint_skill(0, acc("alice"), 1));
    as_("owner", 1);
    c.remove_creator(acc("alice"));
    assert!(!c.is_creator(acc("alice")));
    let t = c.skill_types(0, 50);
    assert_eq!(t.len(), 7);
    let j = serde_json::to_value(&t[1]).unwrap();
    assert_eq!((j["kind"].as_str(), j["rarity"].as_str(), j["mag"].as_u64(), j["max_supply"].as_u64()), (Some("Speed"), Some("Rare"), Some(2), Some(5)));
    assert_eq!(c.collections(0, 10)[0].name, "Arena Basics");
}

#[test]
fn supply_cap() {
    let mut c = with_skills();
    grant(&mut c, "alice", 1, 4);
    assert_eq!(c.mt_supply("skill:1".into()), Some(U128(4)));
    as_("maker", N);
    panics("Exceeds max supply", || c.mint_skill(1, acc("alice"), 2));
    grant(&mut c, "alice", 1, 1);
    assert_eq!(free(&c, "alice", 1), 5);
}

#[test]
fn presale_window_and_proceeds() {
    let mut c = with_skills();
    as_("maker", N);
    let id = c.create_presale(0, U128(P), T0 + 100, Some(T0 + 1000), None, None, None);
    as_("alice", N);
    panics("Presale not open", || c.buy_presale(id, 1));
    as_at("alice", N, T0 + 1000);
    panics("Presale not open", || c.buy_presale(id, 1));
    as_at("alice", N, T0 + 500);
    c.buy_presale(id, 2);
    assert_eq!(free(&c, "alice", 0), 2);
    let fee = 2 * P * 250 / BPS;
    assert_eq!(c.config().treasury.0, fee);
    assert_eq!(c.owed_of(acc("maker")).0, 2 * P - fee);
    let t = transfers();
    assert_eq!(t.len(), 1);
    assert!(t[0].0 == "alice" && t[0].1 < N - 2 * P && t[0].1 > N - 2 * P - N / 100, "refund {t:?}");
    assert_eq!(c.presales(0, 10)[0].sold, 2);
    assert_eq!(c.presale_bought(id, acc("alice")), 2);
    assert_eq!(c.price_history("skill:0".into()), vec![(T0 + 500, U128(P))]);
    let e = events();
    assert!(e.iter().any(|e| e["standard"] == "nep245" && e["event"] == "mt_mint" && e["data"][0]["amounts"][0] == "2"));
    assert!(e.iter().any(|e| e["standard"] == "brawler" && e["event"] == "presale_buy" && e["data"][0]["key"] == "skill:0"));

    as_("maker", 0);
    assert_eq!(c.withdraw_owed().0, 2 * P - fee);
    as_("maker", 0);
    c.end_presale(id);
    as_at("alice", N, T0 + 500);
    panics("Presale not open", || c.buy_presale(id, 1));
}

#[test]
fn presale_caps_and_allowlist() {
    let mut c = with_skills();
    as_("maker", N);
    let id = c.create_presale(1, U128(P), 0, None, Some(3), Some(2), None);
    as_("alice", N);
    c.buy_presale(id, 2);
    panics("Per-wallet limit reached", || c.buy_presale(id, 1));
    as_("bob", N);
    c.buy_presale(id, 1);
    as_("carol", N);
    panics("Presale sold out", || c.buy_presale(id, 1));

    as_("maker", N);
    let al = c.create_presale(0, U128(P), 0, None, None, None, Some(vec![acc("alice")]));
    assert!(c.presale_allowed(al, acc("alice")) && !c.presale_allowed(al, acc("bob")));
    as_("bob", N);
    panics("Not on allowlist", || c.buy_presale(al, 1));
    as_("alice", N);
    c.buy_presale(al, 1);
    assert!(c.presales(0, 10)[1].allowlist);
}

#[test]
fn presale_respects_max_supply() {
    let mut c = with_skills();
    grant(&mut c, "bob", 1, 4);
    as_("maker", N);
    let id = c.create_presale(1, U128(P), 0, None, None, None, None);
    as_("alice", N);
    panics("Exceeds max supply", || c.buy_presale(id, 2));
}

#[test]
fn skill_listing_escrow_and_buy() {
    let mut c = with_skills();
    grant(&mut c, "alice", 0, 3);
    as_("alice", 0);
    panics("Attach 1 yoctoNEAR", || c.list_skill(0, 2, U128(P)));
    as_("alice", N);
    c.list_skill(0, 2, U128(P));
    assert_eq!(c.skills_of(acc("alice")), vec![(0, 1, 2)]);
    as_("alice", 1);
    panics("Not enough free skill units", || c.mt_transfer(acc("bob"), "skill:0".into(), U128(2), None, None));
    as_("alice", N);
    c.list_skill(0, 3, U128(2 * P)); // relist replaces
    assert_eq!(c.skills_of(acc("alice")), vec![(0, 0, 3)]);

    as_("bob", N);
    c.buy_skill(acc("alice"), 0, 2);
    let total = 4 * P;
    let (fee, royalty) = (total * 250 / BPS, total / 10);
    let mut t = transfers();
    t.sort();
    assert_eq!(t[0], ("alice".to_string(), total - fee - royalty));
    assert!(t[1].0 == "bob" && t[1].1 < N - total, "refund {t:?}");
    assert_eq!(c.owed_of(acc("maker")).0, royalty);
    assert_eq!(c.config().treasury.0, fee);
    assert_eq!(free(&c, "bob", 0), 2);
    let v = &c.skill_types(0, 1)[0];
    assert_eq!((v.floor, v.last_price, v.listed_qty), (Some(U128(2 * P)), Some(U128(2 * P)), 1));
    let e = events();
    let sale = e.iter().find(|e| e["event"] == "sale").unwrap();
    assert_eq!(sale["standard"], "brawler");
    assert_eq!(sale["data"][0], serde_json::json!({"key": "skill:0", "qty": 2, "price": (2 * P).to_string(), "seller": "alice", "buyer": "bob"}));
    let mt = e.iter().find(|e| e["event"] == "mt_transfer").unwrap();
    assert_eq!(mt["data"][0]["token_ids"][0], "skill:0");
    as_("bob", N);
    panics("Not enough listed", || c.buy_skill(acc("alice"), 0, 2));

    as_("alice", 0);
    c.cancel_skill_listing(0);
    assert_eq!(c.skills_of(acc("alice")), vec![(0, 1, 0)]);
    assert!(c.skill_listings(0, 0, 10).is_empty());
    panics("Not listed", || c.cancel_skill_listing(0));
}

#[test]
fn creator_sale_has_no_royalty() {
    let mut c = with_skills();
    grant(&mut c, "maker", 0, 1);
    as_("maker", N);
    c.list_skill(0, 1, U128(P));
    as_("bob", N);
    c.buy_skill(acc("maker"), 0, 1);
    assert_eq!(c.owed_of(acc("maker")).0, 0);
}

#[test]
fn mt_transfer_moves_free_units() {
    let mut c = with_skills();
    grant(&mut c, "alice", 0, 3);
    grant(&mut c, "alice", 2, 1);
    as_("alice", 0);
    panics("exactly 1 yoctoNEAR", || c.mt_transfer(acc("bob"), "skill:0".into(), U128(1), None, None));
    as_("alice", 1);
    c.mt_batch_transfer(acc("bob"), vec!["skill:0".into(), "skill:2".into()], vec![U128(2), U128(1)], None, None);
    assert_eq!(c.mt_batch_balance_of(acc("bob"), vec!["skill:0".into(), "skill:2".into(), "skill:99".into()]), vec![U128(2), U128(1), U128(0)]);
    assert_eq!(free(&c, "alice", 0), 1);
    panics("Bad token_id", || c.mt_transfer(acc("bob"), "0".into(), U128(1), None, None));
    assert!(c.mt_token(vec!["skill:0".into(), "skill:99".into()])[1].is_none());
}

fn equipped() -> Monsters {
    let mut c = with_skills();
    as_("alice", N);
    c.hatch_starters();
    for s in [0, 1, 2, 3, 4, 5] {
        grant(&mut c, "alice", s, 1);
    }
    c
}

#[test]
fn equip_caps() {
    let mut c = equipped();
    as_("alice", 1);
    panics("Max 3 skills", || c.equip("0".into(), vec![0, 2, 3, 4]));
    panics("Skill equipped twice", || c.equip("0".into(), vec![2, 2]));
    panics("Max +2 per stat", || c.equip("0".into(), vec![5, 0]));
    panics("Max +3 total stat bonus", || c.equip("0".into(), vec![5, 1]));
    panics("Max 2 effect skills", || c.equip("0".into(), vec![2, 3, 4]));
    panics("No such skill", || c.equip("0".into(), vec![99]));
    as_("bob", 1);
    panics("Not your monster", || c.equip("0".into(), vec![0]));
    as_("alice", 0);
    panics("exactly 1 yoctoNEAR", || c.equip("0".into(), vec![0]));

    as_("alice", 1);
    c.equip("0".into(), vec![5, 2, 3]);
    let j = serde_json::to_value(c.get_monster("0".into()).unwrap()).unwrap();
    assert_eq!(j["skills"], serde_json::json!([{"id": 5, "kind": "Power", "mag": 2}, {"id": 2, "kind": "AirJump", "mag": 1}, {"id": 3, "kind": "Lifesteal", "mag": 1}]));
    assert_eq!((free(&c, "alice", 5), free(&c, "alice", 2)), (0, 0));
    assert!(events().iter().any(|e| e["event"] == "equip" && e["data"][0]["skills"] == serde_json::json!([5, 2, 3])));
    panics("Not enough free skill units", || c.equip("1".into(), vec![2]));
    panics("Not enough free skill units", || c.mt_transfer(acc("bob"), "skill:2".into(), U128(1), None, None));
    c.equip("0".into(), vec![2, 1]); // swap: old units back first
    assert_eq!((free(&c, "alice", 5), free(&c, "alice", 2), free(&c, "alice", 1)), (1, 0, 0));
    c.equip("0".into(), vec![]);
    assert_eq!((free(&c, "alice", 2), free(&c, "alice", 1)), (1, 1));
    assert!(c.get_monster("0".into()).unwrap().skills.is_empty());
}

#[test]
fn equip_blocked_while_locked_rented_or_listed() {
    let mut c = equipped();
    as_("arena", 0);
    c.lock("0".into(), acc("alice"), T0 + 1000);
    as_("alice", 1);
    panics("Monster is busy", || c.equip("0".into(), vec![2]));
    as_("arena", 0);
    c.unlock(vec![("0".into(), T0 + 1000)]);
    as_("alice", 1);
    c.equip("0".into(), vec![2]);

    c.list("1".into(), U128(N));
    panics("Monster is listed for sale", || c.equip("1".into(), vec![3]));

    c.offer_rent("2".into(), U128(N), 3);
    as_("bob", N);
    c.rent("2".into(), 1);
    as_("alice", 1);
    panics("Monster is busy", || c.equip("2".into(), vec![3]));
    as_("bob", 1);
    panics("Not your monster", || c.equip("2".into(), vec![]));
}

#[test]
fn loadout_travels_on_transfer_and_buy() {
    let mut c = equipped();
    as_("alice", 1);
    c.equip("0".into(), vec![2, 0]);
    let alice_before = c.skills_of(acc("alice"));
    give(&mut c, "alice", "bob", "0");
    assert_eq!(c.get_monster("0".into()).unwrap().skills.len(), 2);
    assert_eq!(c.skills_of(acc("alice")), alice_before);
    as_("bob", 1);
    c.equip("0".into(), vec![2]);
    assert_eq!((free(&c, "bob", 0), free(&c, "bob", 2)), (1, 0));

    c.list("0".into(), U128(N));
    as_("carol", N);
    c.buy("0".into());
    let m = c.get_monster("0".into()).unwrap();
    assert_eq!((m.owner_id, m.skills), (acc("carol"), vec![SkillRef { id: 2, kind: SkillKind::AirJump, mag: 1 }]));
    assert_eq!(c.price_history("monsters".into()), vec![(T0, U128(N))]);
    let sale = events().into_iter().find(|e| e["event"] == "sale").unwrap();
    assert_eq!(sale["data"][0]["key"], "monsters");
    assert_eq!(sale["data"][0]["buyer"], "carol");
    as_("carol", 1);
    c.equip("0".into(), vec![]);
    assert_eq!(free(&c, "carol", 2), 1);
}

#[test]
fn hatch_credits_starter_commons() {
    let mut c = with_skills();
    as_("alice", N);
    c.hatch_starters();
    let base = u32::from_le_bytes([7; 4]);
    let mut want = [0u32; 2]; // pool = Common mag-1 stat skills [0, 6]
    for i in 0..3 {
        want[((base + i) % 2) as usize] += 1;
    }
    assert_eq!(c.skills_of(acc("alice")), vec![(0, want[0], 0), (6, want[1], 0)]);
    assert!(transfers()[0].1 > N - N / 10, "storage still < 0.1 N");
}

#[test]
#[should_panic(expected = "Attach at least")]
fn presale_needs_price_plus_storage() {
    let mut c = with_skills();
    as_("maker", N);
    let id = c.create_presale(0, U128(P), 0, None, None, None, None);
    as_("alice", 2 * P);
    c.buy_presale(id, 2);
}
