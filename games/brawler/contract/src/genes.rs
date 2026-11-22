//! Exact port of `client/src/lib/genes.ts` (mulberry32, randomDna, nameFor, breed, normalize).
//! Same u32 seed -> same monster on chain and in the app. Keep the two in lockstep.

use near_sdk::near;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Dna {
    pub str: u8,
    pub dex: u8,
    pub def: u8,
    pub spd: u8,
    pub hue: u16,
    pub accent: u16,
    pub horn: u8,
    pub tail: u8,
    pub pattern: u8,
    pub eye: u8,
    pub size: u8,
}

const STAT_SUM: f64 = 22.0;

/// mulberry32. Returns raw u32; `/ 2^32` gives the TS float.
struct Rng(u32);
impl Rng {
    fn next(&mut self) -> u32 {
        self.0 = self.0.wrapping_add(0x6d2b79f5);
        let mut t = self.0;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }
    fn f(&mut self) -> f64 {
        self.next() as f64 / 4294967296.0
    }
    /// floor(r() * n), exact in integers.
    fn below(&mut self, n: u32) -> u32 {
        ((self.next() as u64 * n as u64) >> 32) as u32
    }
    fn int(&mut self, lo: i32, hi: i32) -> i32 {
        lo + self.below((hi - lo + 1) as u32) as i32
    }
}

/// Stats as floats while breeding (TS averages can be x.5). Order: str, dex, def, spd.
fn normalize(mut s: [f64; 4], r: &mut Rng) -> [u8; 4] {
    // Math.round == f64::round for positives (ties go up both ways)
    for v in s.iter_mut() {
        *v = v.round().clamp(3.0, 9.0);
    }
    let mut sum: f64 = s.iter().sum();
    while sum != STAT_SUM {
        let k = r.below(4) as usize;
        if sum > STAT_SUM && s[k] > 3.0 {
            s[k] -= 1.0;
            sum -= 1.0;
        } else if sum < STAT_SUM && s[k] < 9.0 {
            s[k] += 1.0;
            sum += 1.0;
        }
    }
    s.map(|v| v as u8)
}

fn with_stats(mut d: Dna, s: [u8; 4]) -> Dna {
    [d.str, d.dex, d.def, d.spd] = s;
    d
}

pub fn random_dna(seed: u32) -> Dna {
    let r = &mut Rng(seed);
    let s = [r.int(3, 9), r.int(3, 9), r.int(3, 9), r.int(3, 9)].map(|v| v as f64);
    let d = Dna {
        str: 0,
        dex: 0,
        def: 0,
        spd: 0,
        hue: r.int(0, 359) as u16,
        accent: r.int(0, 359) as u16,
        horn: r.int(0, 3) as u8,
        tail: r.int(0, 2) as u8,
        pattern: r.int(0, 2) as u8,
        eye: r.int(0, 3) as u8,
        size: r.int(92, 112) as u8,
    };
    let s = normalize(s, r);
    with_stats(d, s)
}

const SYL: [&str; 16] = ["gro", "mak", "zu", "rha", "vel", "tor", "ki", "bram", "ox", "nyx", "pel", "dra", "su", "qua", "lor", "fen"];

pub fn name_for(seed: u32) -> String {
    let r = &mut Rng(seed ^ 0x9e3779b9);
    let mut n = String::new();
    n += SYL[r.below(16) as usize];
    n += SYL[r.below(16) as usize];
    if r.f() < 0.4 {
        n += SYL[r.below(16) as usize];
    }
    n[..1].to_uppercase() + &n[1..]
}

/// Shortest-arc hue blend (359.5+ wraps to 0, same as TS).
fn hue_mix(a: u16, b: u16, k: f64) -> u16 {
    let d = (b as i32 - a as i32 + 540) % 360 - 180;
    ((a as f64 + d as f64 * k + 360.0) % 360.0).round() as u16 % 360
}

/// Each gene from one parent (stats may blend), hue drifts, 20% chance of one mutation.
pub fn breed(a: &Dna, b: &Dna, seed: u32) -> Dna {
    let r = &mut Rng(seed);
    let from = |x: u16, y: u16, r: &mut Rng| if r.f() < 0.5 { x } else { y };
    // TS object literal order: hue, accent, horn, tail, pattern, eye, size
    let hue = hue_mix(a.hue, b.hue, r.f());
    let mut d = Dna {
        str: 0,
        dex: 0,
        def: 0,
        spd: 0,
        hue,
        accent: from(a.accent, b.accent, r),
        horn: from(a.horn as u16, b.horn as u16, r) as u8,
        tail: from(a.tail as u16, b.tail as u16, r) as u8,
        pattern: from(a.pattern as u16, b.pattern as u16, r) as u8,
        eye: from(a.eye as u16, b.eye as u16, r) as u8,
        size: 0,
    };
    let mut size = ((a.size as f64 + b.size as f64) / 2.0 + r.int(-3, 3) as f64).round();
    let (sa, sb) = ([a.str, a.dex, a.def, a.spd], [b.str, b.dex, b.def, b.spd]);
    let mut s = [0f64; 4];
    for i in 0..4 {
        s[i] = if r.f() < 0.7 {
            from(sa[i] as u16, sb[i] as u16, r) as f64
        } else {
            (sa[i] as f64 + sb[i] as f64) / 2.0
        };
    }
    if r.f() < 0.2 {
        // ['str','dex','def','spd','hue','horn','tail','pattern','eye']
        match r.below(9) {
            i @ 0..=3 => s[i as usize] += if r.f() < 0.5 { -2.0 } else { 2.0 },
            4 => d.hue = r.int(0, 359) as u16,
            5 => d.horn = r.int(0, 3) as u8,
            6 => d.tail = r.int(0, 2) as u8,
            7 => d.pattern = r.int(0, 2) as u8,
            _ => d.eye = r.int(0, 3) as u8,
        }
    }
    size = size.clamp(90.0, 115.0);
    d.size = size as u8;
    let s = normalize(s, r);
    with_stats(d, s)
}
