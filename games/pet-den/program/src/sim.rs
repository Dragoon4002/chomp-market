// Pet sim: pure, integer-only, no clock. Mirrors build/sim.js 1:1 (same constants, same order).
use anchor_lang::prelude::*;

pub const MAX: u8 = 100;
pub const SICK_BELOW: u8 = 20;
pub const HAPPY_AT: u8 = 50;
/// xp needed to evolve out of tier i (0 Hatchling, 1 Junior, 2 Adult, 3 Elder).
pub const NEED: [u32; 3] = [20, 60, 150];
pub const MAX_CATCHUP: u32 = 10_000;

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Debug, PartialEq, Eq)]
pub struct Stats {
    pub full: u8,
    pub joy: u8,
    pub energy: u8,
    pub hygiene: u8,
    pub health: u8,
    pub asleep: bool,
    pub alive: bool,
    pub tier: u8,
    pub xp: u32,
    pub age: u32,
    /// EF hook: consecutive happy ticks. Best streak lifts the pet's market value.
    pub streak: u32,
    pub best_streak: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    Feed,
    Play(u8),
    Clean,
    Sleep,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SimError {
    Dead,
    Asleep,
    Tired,
    NotReady,
    MaxTier,
    Sick,
}

impl Default for Stats {
    fn default() -> Self {
        Stats { full: 80, joy: 80, energy: 80, hygiene: 80, health: 100, asleep: false, alive: true, tier: 0, xp: 0, age: 0, streak: 0, best_streak: 0 }
    }
}

impl Stats {
    fn low(&self) -> u8 {
        self.full.min(self.joy).min(self.energy).min(self.hygiene)
    }
    pub fn sick(&self) -> bool {
        self.low() < SICK_BELOW
    }

    fn tick1(&mut self) {
        self.age += 1;
        self.full = self.full.saturating_sub(1);
        self.hygiene = self.hygiene.saturating_sub(1);
        if self.asleep {
            self.energy = (self.energy + 3).min(MAX);
            if self.energy == MAX {
                self.asleep = false;
            }
        } else {
            self.energy = self.energy.saturating_sub(1);
            self.joy = self.joy.saturating_sub(1);
        }
        if self.sick() {
            self.health = self.health.saturating_sub(2);
            self.streak = 0;
            if self.health == 0 {
                self.alive = false; // ran away
            }
        } else if self.low() >= HAPPY_AT {
            self.health = (self.health + 1).min(MAX);
            self.xp += 1;
            self.streak += 1;
            self.best_streak = self.best_streak.max(self.streak);
        }
    }

    pub fn advance(&mut self, n: u32) {
        for _ in 0..n.min(MAX_CATCHUP) {
            if !self.alive {
                return;
            }
            self.tick1();
        }
    }

    pub fn act(&mut self, a: Action) -> core::result::Result<(), SimError> {
        if !self.alive {
            return Err(SimError::Dead);
        }
        if self.asleep && a != Action::Sleep {
            return Err(SimError::Asleep);
        }
        match a {
            Action::Feed => {
                if self.full >= 90 {
                    self.joy = self.joy.saturating_sub(10); // overfed
                }
                self.full = (self.full + 25).min(MAX);
                self.hygiene = self.hygiene.saturating_sub(5);
            }
            Action::Play(score) => {
                if self.energy < 10 {
                    return Err(SimError::Tired);
                }
                let score = score.min(10);
                self.energy -= 10;
                self.joy = (self.joy as u16 + 5 + 3 * score as u16).min(MAX as u16) as u8;
                self.xp += score as u32;
            }
            Action::Clean => self.hygiene = MAX,
            Action::Sleep => self.asleep = !self.asleep,
        }
        Ok(())
    }

    pub fn evolve(&mut self) -> core::result::Result<(), SimError> {
        if !self.alive {
            return Err(SimError::Dead);
        }
        if self.tier as usize >= NEED.len() {
            return Err(SimError::MaxTier);
        }
        if self.xp < NEED[self.tier as usize] {
            return Err(SimError::NotReady);
        }
        if self.sick() {
            return Err(SimError::Sick);
        }
        self.tier += 1;
        self.health = MAX;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decay_and_neglect_kills() {
        let mut s = Stats::default();
        s.advance(10);
        assert_eq!((s.full, s.joy, s.energy, s.hygiene, s.age), (70, 70, 70, 70, 10));
        assert_eq!((s.xp, s.streak, s.health), (10, 10, 100)); // happy ticks
        s.advance(MAX_CATCHUP);
        assert!(!s.alive);
        assert_eq!(s.health, 0);
        assert_eq!(s.streak, 0);
        assert_eq!(s.best_streak, 30); // happy until stats < 50
        assert_eq!(s.act(Action::Feed), Err(SimError::Dead));
        let age = s.age;
        s.advance(5);
        assert_eq!(s.age, age, "dead pets don't age");
    }

    #[test]
    fn care_actions() {
        let mut s = Stats::default();
        s.act(Action::Feed).unwrap();
        assert_eq!((s.full, s.hygiene), (100, 75));
        s.act(Action::Feed).unwrap();
        assert_eq!(s.joy, 70, "overfeeding costs joy");
        s.act(Action::Clean).unwrap();
        assert_eq!(s.hygiene, 100);
        s.act(Action::Play(99)).unwrap(); // clamped to 10
        assert_eq!((s.energy, s.joy, s.xp), (70, 100, 10));
        s.energy = 5;
        assert_eq!(s.act(Action::Play(3)), Err(SimError::Tired));
        s.act(Action::Sleep).unwrap();
        assert_eq!(s.act(Action::Feed), Err(SimError::Asleep));
        s.advance(32); // +3/tick, auto-wake at 100
        assert!(!s.asleep);
        assert_eq!(s.energy, 100);
    }

    #[test]
    fn evolve_gates() {
        let mut s = Stats::default();
        assert_eq!(s.evolve(), Err(SimError::NotReady));
        s.xp = 20;
        s.full = 10;
        assert_eq!(s.evolve(), Err(SimError::Sick));
        s.full = 80;
        s.evolve().unwrap();
        assert_eq!(s.tier, 1);
        s.xp = 1000;
        s.evolve().unwrap();
        s.evolve().unwrap();
        assert_eq!(s.evolve(), Err(SimError::MaxTier));
    }

    #[test]
    fn deterministic() {
        let run = || {
            let mut s = Stats::default();
            for i in 0..200u32 {
                s.advance(i % 7);
                let _ = s.act([Action::Feed, Action::Play((i % 11) as u8), Action::Clean, Action::Sleep][(i % 4) as usize]);
            }
            s
        };
        assert_eq!(run(), run());
    }
}
