// Bit-exact vs TS twin. Regen: node --experimental-strip-types scripts/ribbon-golden.ts
use ribbon_sim::{FADE, Sim, input};
use serde_json::Value;

#[test]
fn golden() {
    let g: Value = serde_json::from_str(include_str!("../testdata/golden.json")).unwrap();
    let runs = g["runs"].as_array().unwrap();
    assert_eq!(runs.len(), 10);
    for (n, run) in runs.iter().enumerate() {
        let mut s = Sim::new();
        let hashes = run["hashes"].as_array().unwrap();
        for (t, ab) in run["ins"].as_array().unwrap().iter().enumerate() {
            s.step([0, 1].map(|i| ab[i].as_u64().unwrap() as u8));
            assert_eq!(s.hash() as u64, hashes[t].as_u64().unwrap(), "run {n} tick {}", t + 1);
        }
    }
}

const N: u8 = 7;

#[test]
fn wall_crash_scores_other() {
    let mut s = Sim::new();
    for _ in 0..16 { s.step([input(Some(0), false), N]); }
    assert!(s.riders[0].alive);
    s.step([N, N]);
    assert!(!s.riders[0].alive);
    assert_eq!((s.score, s.rounds), ([0, 1], 1));
}

#[test]
fn no_reversal() {
    let mut s = Sim::new();
    s.step([input(Some(3), false), input(Some(1), false)]);
    assert_eq!((s.riders[0].dir, s.riders[1].dir, s.riders[0].x), (1, 3, 9));
}

#[test]
fn head_on_draw() {
    let mut s = Sim::new();
    s.riders[1].x = 10;
    s.riders[1].y = 16;
    s.step([N, N]);
    assert!(!s.riders[0].alive && !s.riders[1].alive);
    assert_eq!((s.score, s.rounds), ([0, 0], 1));
}

#[test]
fn boost_moves_two_once() {
    let mut s = Sim::new();
    s.step([input(None, true), N]);
    assert_eq!((s.riders[0].x, s.cell(8, 16), s.cell(9, 16)), (10, 1, 1));
    for _ in 0..14 { s.step([N, N]); }
    assert_eq!(s.riders[0].x, 38);
    s.step([input(None, true), N]);
    assert_eq!(s.riders[0].x, 39);
}

#[test]
fn fade_frees_cell() {
    for (tick, alive) in [(FADE - 1, false), (FADE, true)] {
        let mut s = Sim::new();
        s.step([N, N]); // lays (8,16), expires 1+FADE
        s.tick = tick;
        s.riders[0].y = 15;
        s.riders[0].x = 8;
        s.riders[0].dir = 2;
        s.step([N, N]);
        assert_eq!(s.riders[0].alive, alive);
    }
}

#[test]
fn match_ends_at_two() {
    let mut s = Sim::new();
    while !s.done && s.tick < 1000 { s.step([input(Some(0), false), N]); }
    assert!(s.done);
    assert_eq!((s.winner, s.score), (1, [0, 2]));
    s.step([N, N]);
    assert_eq!(s.rounds, 2);
}
