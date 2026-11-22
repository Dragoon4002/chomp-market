// Bit-exact vs TS sim. Regen: node --experimental-strip-types scripts/golden.ts
use brawler_sim::{Fighter, GameState, St, StageId, genes, new_game, step};
use serde_json::Value;

fn fields(f: &Fighter) -> [f64; 33] {
    let b = |v: bool| v as u8 as f64;
    let st = [
        St::Idle,
        St::Run,
        St::Jumpsquat,
        St::Air,
        St::Land,
        St::Dodge,
        St::Attack,
        St::Hitstun,
        St::Dead,
        St::Block,
    ]
    .iter()
    .position(|s| *s == f.state)
    .unwrap() as f64;
    [
        f.x,
        f.y,
        f.vx,
        f.vy,
        f.facing,
        st,
        f.t,
        b(f.grounded),
        f.air_jumps,
        b(f.recovery_used),
        b(f.air_dodged),
        b(f.fast_fall),
        f.mv.map_or(-1., |m| m as u8 as f64),
        b(f.move_hit),
        f.combo,
        f.combo_t,
        f.damage,
        f.stocks,
        f.hitstun,
        f.hitlag,
        f.invuln,
        f.dodge_cd,
        f.land_lag,
        f.drop_t,
        f.prev_in as f64,
        f.buf as f64,
        f.buf_t,
        f.m.dmg,
        f.m.kb_taken,
        f.m.startup,
        f.m.run,
        f.fx as f64,
        b(f.wind_used),
    ]
}

fn fnv(s: &GameState) -> u32 {
    let mut h: u32 = 2166136261;
    let vals = s.fighters.iter().flat_map(fields).chain([s.winner as f64]);
    for v in vals {
        for byte in v.to_le_bytes() {
            h = (h ^ byte as u32).wrapping_mul(16777619);
        }
    }
    h
}

fn golden() -> Value {
    serde_json::from_str(include_str!("../testdata/golden.json")).unwrap()
}

#[test]
fn bit_exact_vs_ts() {
    let g = golden();
    let runs = g["runs"].as_array().unwrap();
    assert!(runs.len() >= 13);
    for (n, r) in runs.iter().enumerate() {
        let dna: Vec<_> = r["dna"]
            .as_array()
            .unwrap()
            .iter()
            .map(genes::sanitize)
            .collect();
        let st = |i: usize| {
            genes::apply_skills(
                genes::stats_of(&dna[i]),
                &genes::sanitize_skills(&r["skills"][i]),
            )
        };
        let mut s = new_game(
            [st(0), st(1)],
            StageId::parse(r["stage"].as_str().unwrap()).unwrap(),
        );
        let hashes = r["hashes"].as_array().unwrap();
        for (f, (t, h)) in r["tape"].as_array().unwrap().iter().zip(hashes).enumerate() {
            let t = t.as_i64().unwrap() as i32;
            step(&mut s, [t >> 16, t & 0xffff]);
            assert_eq!(
                fnv(&s) as u64,
                h.as_u64().unwrap(),
                "run {n} frame {f}: {:?}",
                s.fighters
            );
        }
        assert_eq!(
            s.winner as i64,
            r["winner"].as_i64().unwrap(),
            "run {n} winner"
        );
    }
}

#[test]
fn sanitize_matches_ts() {
    for c in golden()["sanitize"].as_array().unwrap() {
        assert_eq!(
            serde_json::to_value(genes::sanitize(&c["in"])).unwrap(),
            c["out"],
            "in {}",
            c["in"]
        );
    }
}
