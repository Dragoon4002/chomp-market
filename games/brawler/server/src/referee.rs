// Replays confirmed input tape w/ same sim as players -> winner, KOs, tape hash.
// TODO(solana): sign/post the result on-chain (MagicBlock ER commit).
use brawler_sim::{
    GameState, StageId,
    Stats,
    new_game, step,
};
use sha2::{Digest, Sha256};

/// Fairness proof: sha256(utf8(stage) ++ 0x00 ++ each confirmed frame `host << 16 | guest` as u32 LE), lowercase hex.
pub fn tape_hash(stage: &str, frames: impl IntoIterator<Item = u32>) -> String {
    let mut h = Sha256::new();
    h.update(stage.as_bytes());
    h.update([0]);
    frames.into_iter().for_each(|f| h.update(f.to_le_bytes()));
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

pub struct Referee {
    pub state: GameState,
    pub frame: usize,
}

impl Referee {
    pub fn new(stats: [Stats; 2], stage: StageId) -> Self {
        Referee {
            state: new_game(stats, stage),
            frame: 0,
        }
    }

    /// Step one confirmed frame. Winner seat once decided, else -1.
    pub fn step(&mut self, ins: [i32; 2]) -> i32 {
        if self.state.winner >= 0 {
            return self.state.winner;
        }
        step(&mut self.state, ins);
        self.frame += 1;
        self.state.winner
    }

    /// kos[i] = KOs scored BY seat i = 3 - opponent stocks.
    pub fn kos(&self) -> [u8; 2] {
        let [a, b] = &self.state.fighters;
        [3 - b.stocks as u8, 3 - a.stocks as u8]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tape_hash_vector() {
        // same vector in client src/lib/tape.test.ts
        assert_eq!(
            tape_hash("grove", [0, 131073, 33488896, 511]),
            "91912f4e425ec1507030483e503bb4c7a7d60c2abd476ce4447ca3b226b1a57c"
        );
    }
}
