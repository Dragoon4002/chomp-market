//! Pure game logic, no Anchor types. Mirrored 1:1 by build/game.js (same splitmix64 stream),
//! so a lot opened in the browser equals the lot the VRF callback writes on chain.

pub const MAX_ITEMS: usize = 7;
pub const EMPTY: u8 = 0xFF;
/// Tier odds per slot, cumulative per mille: common 60%, uncommon 25%, rare 10%, epic 4%, legendary 1%.
pub const TIER_CUM: [u64; 5] = [600, 850, 950, 990, 1000];
/// Item kinds per tier (art variants). Must match KINDS in build/game.js.
pub const KINDS: [u64; 5] = [3, 4, 4, 2, 1];
/// Listed value per tier, in coins.
pub const VALUE: [u64; 5] = [10, 30, 90, 300, 1500];
/// Weight per tier in tenths of a kg (junk is heavy, gems are light), plus 0..9 jitter.
pub const WEIGHT: [u64; 5] = [40, 30, 20, 20, 10];
pub const FEE_BPS: u64 = 500; // 5% of the winning bid to the fee vault
pub const BUYBACK_BPS: u64 = 9000; // house buys items back at 90% of listed value

pub struct Rng(u64);
impl Rng {
    pub fn new(seed: u64) -> Self { Rng(seed) }
    /// splitmix64
    pub fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
}

pub fn seed_of(randomness: &[u8; 32], at: usize) -> u64 {
    u64::from_le_bytes(randomness[at..at + 8].try_into().unwrap())
}

/// item byte = tier << 4 | kind
pub const fn tier(item: u8) -> usize { (item >> 4) as usize }
pub fn value(item: u8) -> u64 { if item == EMPTY { 0 } else { VALUE[tier(item)] } }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Contents {
    pub items: [u8; MAX_ITEMS],
    pub n: u8,
    /// hint 1: total weight, tenths of a kg
    pub weight: u16,
    /// hint 2: items[0] is shown face up
    /// hint 3: how many items glow (rare or better)
    pub glow: u8,
}

pub fn contents(seed: u64) -> Contents {
    let mut r = Rng::new(seed);
    let n = 3 + (r.next() % 5) as usize; // 3..=7 items
    let mut c = Contents { items: [EMPTY; MAX_ITEMS], n: n as u8, weight: 0, glow: 0 };
    for i in 0..n {
        let roll = r.next() % 1000;
        let t = TIER_CUM.iter().position(|&x| roll < x).unwrap();
        let kind = r.next() % KINDS[t];
        c.items[i] = ((t as u8) << 4) | kind as u8;
        c.weight += (WEIGHT[t] + r.next() % 10) as u16;
        c.glow += (t >= 2) as u8;
    }
    c
}

/// House bots (build/game.js BOTS/estimate/botBids, same f64 op order so results match bit for bit).
/// They read the same 3 hints a player sees. Their max is the lot's reserve price.
pub const BOT_STYLE: [f64; 3] = [0.45, 0.6, 0.72];
pub fn estimate(c: &Contents) -> f64 {
    const AVG_HI: f64 = (100.0 * 90.0 + 40.0 * 300.0 + 10.0 * 1500.0) / 150.0; // mean value of a glowing item
    const AVG_LO: f64 = (600.0 * 10.0 + 250.0 * 30.0) / 850.0;
    const W_HI: f64 = 23.8;
    const W_LO: f64 = 41.6;
    let shown = c.items[0];
    let shown_hi = (tier(shown) >= 2) as u8;
    let hid_hi = (c.glow - shown_hi) as f64;
    let rest = c.weight as f64 - (WEIGHT[tier(shown)] as f64 + 4.5) - hid_hi * W_HI;
    let lo = (rest / W_LO).round().max(0.0);
    value(shown) as f64 + hid_hi * AVG_HI + lo * AVG_LO
}
pub fn bot_bids(c: &Contents, contents_seed: u64) -> [u64; 3] {
    let mut r = Rng::new(contents_seed ^ 0xb075);
    let est = estimate(c);
    BOT_STYLE.map(|s| {
        let unit = (r.next() >> 11) as f64 / 9_007_199_254_740_992.0; // 2^53
        (est * s * (0.7 + 0.6 * unit)).round().max(0.0) as u64
    })
}

/// Highest revealed bid wins. Ties: sort tied bidders by key, pick one with `tie_seed`.
/// `None` amount = not revealed (can't win).
pub fn winner(bids: &[([u8; 32], Option<u64>)], tie_seed: u64) -> Option<usize> {
    let top = bids.iter().filter_map(|b| b.1).filter(|&a| a > 0).max()?;
    let mut tied: Vec<usize> = (0..bids.len()).filter(|&i| bids[i].1 == Some(top)).collect();
    tied.sort_by_key(|&i| bids[i].0);
    Some(tied[(Rng::new(tie_seed).next() % tied.len() as u64) as usize])
}

/// Winning bid split: (to treasury, to fee vault).
pub fn split(price: u64) -> (u64, u64) {
    let fee = price * FEE_BPS / 10_000;
    (price - fee, fee)
}

/// Buyback payout for the items selected by `mask` (bit i = items[i]).
pub fn buyback(items: &[u8; MAX_ITEMS], mask: u8) -> u64 {
    let listed: u64 = (0..MAX_ITEMS).filter(|i| mask >> i & 1 == 1).map(|i| value(items[i])).sum();
    listed * BUYBACK_BPS / 10_000
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splitmix_known_vector() {
        // reference splitmix64 output for seed 0
        assert_eq!(Rng::new(0).next(), 0xE220_A839_7B1D_CDAF);
    }

    #[test]
    fn contents_parity_with_js() {
        // same vector is asserted in build/smoke.mjs
        let c = contents(42);
        println!("{:?}", c);
        assert_eq!((c.n, c.weight, c.glow), (PARITY.0, PARITY.1, PARITY.2));
        assert_eq!(c.items, PARITY.3);
    }
    const PARITY: (u8, u16, u8, [u8; MAX_ITEMS]) = (6, 228, 2, [0x00, 0x00, 0x21, 0x01, 0x02, 0x31, EMPTY]);

    #[test]
    fn bots_parity_with_js() {
        // same vectors as build/smoke.mjs: botBids(contents(s), s)
        for (s, want) in [(42u64, [306, 226, 496]), (7, [42, 44, 65]), (123_456_789, [39, 41, 69])] {
            assert_eq!(bot_bids(&contents(s), s), want, "seed {s}");
        }
    }

    #[test]
    fn contents_invariants() {
        let mut tiers = [0u64; 5];
        for s in 0..20_000u64 {
            let c = contents(s);
            assert!((3..=7).contains(&c.n));
            assert!(c.items[c.n as usize..].iter().all(|&x| x == EMPTY));
            let live = &c.items[..c.n as usize];
            assert_eq!(c.glow as usize, live.iter().filter(|&&x| tier(x) >= 2).count());
            for &x in live { tiers[tier(x)] += 1; assert!(((x & 15) as u64) < KINDS[tier(x)]); }
        }
        let total: u64 = tiers.iter().sum();
        let common = tiers[0] * 1000 / total;
        assert!((570..630).contains(&common), "common {common}/1000");
        assert!(tiers[4] > 0, "legendary drops");
    }

    #[test]
    fn winner_rules() {
        let k = |b: u8| [b; 32];
        assert_eq!(winner(&[], 1), None);
        assert_eq!(winner(&[(k(1), None), (k(2), Some(0))], 1), None, "unrevealed / zero bids never win");
        assert_eq!(winner(&[(k(1), Some(5)), (k(2), Some(9)), (k(3), None)], 1), Some(1));
        // tie: result independent of account order, and both tied bidders can win for some seed
        let a = [(k(1), Some(9)), (k(2), Some(9)), (k(3), Some(4))];
        let b = [(k(3), Some(4)), (k(2), Some(9)), (k(1), Some(9))];
        let mut seen = [false; 2];
        for s in 0..64 {
            let wa = winner(&a, s).unwrap();
            let wb = winner(&b, s).unwrap();
            assert_eq!(a[wa].0, b[wb].0);
            seen[(a[wa].0[0] - 1) as usize] = true;
        }
        assert_eq!(seen, [true, true]);
    }

    #[test]
    fn payouts() {
        assert_eq!(split(1000), (950, 50));
        assert_eq!(split(7), (7, 0));
        let items = [0x00, 0x20, 0x40, EMPTY, EMPTY, EMPTY, EMPTY]; // 10 + 90 + 1500
        assert_eq!(buyback(&items, 0b111), 1440);
        assert_eq!(buyback(&items, 0b010), 81);
        assert_eq!(buyback(&items, 0b1111000), 0, "empty slots pay nothing");
    }
}
