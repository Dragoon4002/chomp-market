// Pet sim: pure, integer-only, no clock. Mirrors build/sim.js 1:1 (same constants, same order).
use anchor_lang::prelude::*;

pub const MAX: u8 = 100;
pub const SICK_BELOW: u8 = 20;
pub const HAPPY_AT: u8 = 50;
/// xp needed to evolve out of tier i (0 Baby, 1 Junior, 2 Adult, 3 Elder). The egg is pre-tier (hatch = create).
pub const NEED: [u32; 3] = [20, 60, 150];
pub const MAX_CATCHUP: u32 = 10_000;
pub const SPECIES: u8 = 5;
pub const HABITATS: u8 = 3;
/// Readiness bonuses in %: any habitat aura, home habitat for the species, intelligence >= SMART.
pub const HAB_AURA: u32 = 20;
pub const HOME_BONUS: u32 = 25;
pub const SMART: u8 = 50;
pub const SMART_BONUS: u32 = 15;
pub const INTERACT_CD: u32 = 5; // ticks
pub const LEVEL_XP: u32 = 10;

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
    /// Growth: base from DNA, Train raises str, Play raises int.
    pub str: u8,
    pub int: u8,
    /// Species index (DNA byte 0 % 5) and current habitat (0 Moonlit Grove, 1 Crystal Lagoon, 2 Ember Cliffs).
    pub kind: u8,
    pub habitat: u8,
    /// Interact allowed again once age >= calm_until.
    pub calm_until: u32,
    pub age: u32,
    /// EF hook: consecutive happy ticks. Best streak lifts the pet's market value.
    pub streak: u32,
    pub best_streak: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    /// arg: item boost (0 none, 1 treat/toy/soap from the inventory).
    Feed(u8),
    Play(u8, u8), // (mini-game score 0-10, toy boost)
    Clean(u8),
    Sleep,
    Train,
    Interact,
    Habitat(u8),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SimError {
    Dead,
    Asleep,
    Tired,
    NotReady,
    MaxTier,
    Sick,
    Cooldown,
    BadAction,
}

impl Default for Stats {
    fn default() -> Self {
        Stats::new(0)
    }
}

fn up(v: u8, d: u32) -> u8 {
    (v as u32 + d).min(MAX as u32) as u8
}

impl Stats {
    /// DNA bytes: 0 species, 1 hue (client), 2 str base, 3 int base.
    pub fn new(dna: u32) -> Self {
        let b = dna.to_le_bytes();
        Stats {
            full: 80, joy: 80, energy: 80, hygiene: 80, health: 100, asleep: false, alive: true, tier: 0, xp: 0, age: 0, streak: 0, best_streak: 0,
            str: 10 + b[2] % 21, int: 10 + b[3] % 21, kind: b[0] % SPECIES, habitat: 0, calm_until: 0,
        }
    }
    pub fn level(&self) -> u32 {
        1 + self.xp / LEVEL_XP
    }
    /// % bonus the environment adds to evolve readiness.
    pub fn bonus(&self) -> u32 {
        let home = if (self.kind + 2) % HABITATS == self.habitat { HOME_BONUS } else { 0 };
        let smart = if self.int >= SMART { SMART_BONUS } else { 0 };
        HAB_AURA + home + smart
    }
    /// Evolve readiness 0-100: xp boosted by the bonus, against this tier's need.
    pub fn ready(&self) -> u32 {
        match NEED.get(self.tier as usize) {
            Some(&need) => (self.xp * (100 + self.bonus()) / need).min(100),
            None => 100,
        }
    }
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
            Action::Feed(b) => {
                let b = b.min(1) as u32;
                if self.full >= 90 {
                    self.joy = self.joy.saturating_sub(10); // overfed
                }
                self.full = up(self.full, 25 + 15 * b);
                self.hygiene = self.hygiene.saturating_sub(5);
                self.joy = up(self.joy, 5 * b);
            }
            Action::Play(score, b) => {
                if self.energy < 10 {
                    return Err(SimError::Tired);
                }
                let score = score.min(10) as u32;
                self.energy -= 10;
                self.joy = up(self.joy, 5 + 3 * score + 10 * b.min(1) as u32);
                self.xp += score;
                self.int = up(self.int, 1 + score / 4);
            }
            Action::Clean(b) => {
                self.hygiene = MAX;
                self.health = up(self.health, 5 * b.min(1) as u32);
            }
            Action::Sleep => self.asleep = !self.asleep,
            Action::Train => {
                if self.energy < 15 {
                    return Err(SimError::Tired);
                }
                self.energy -= 15;
                self.full = self.full.saturating_sub(5);
                self.str = up(self.str, 2);
                self.xp += 1;
            }
            Action::Interact => {
                if self.age < self.calm_until {
                    return Err(SimError::Cooldown);
                }
                self.joy = up(self.joy, 10);
                self.calm_until = self.age + INTERACT_CD;
            }
            Action::Habitat(h) => {
                if h >= HABITATS {
                    return Err(SimError::BadAction);
                }
                self.habitat = h;
            }
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
        if self.ready() < 100 {
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
        assert_eq!(s.act(Action::Feed(0)), Err(SimError::Dead));
        let age = s.age;
        s.advance(5);
        assert_eq!(s.age, age, "dead pets don't age");
    }

    #[test]
    fn care_actions() {
        let mut s = Stats::default();
        s.act(Action::Feed(0)).unwrap();
        assert_eq!((s.full, s.hygiene), (100, 75));
        s.act(Action::Feed(0)).unwrap();
        assert_eq!(s.joy, 70, "overfeeding costs joy");
        s.act(Action::Clean(0)).unwrap();
        assert_eq!(s.hygiene, 100);
        s.act(Action::Play(99, 0)).unwrap(); // clamped to 10
        assert_eq!((s.energy, s.joy, s.xp), (70, 100, 10));
        s.energy = 5;
        assert_eq!(s.act(Action::Play(3, 0)), Err(SimError::Tired));
        s.act(Action::Sleep).unwrap();
        assert_eq!(s.act(Action::Feed(0)), Err(SimError::Asleep));
        s.advance(32); // +3/tick, auto-wake at 100
        assert!(!s.asleep);
        assert_eq!(s.energy, 100);
    }

    #[test]
    fn evolve_gates() {
        let mut s = Stats::default();
        assert_eq!(s.evolve(), Err(SimError::NotReady));
        s.xp = 16; // +20% aura: 16*120/20 = 96%
        assert_eq!((s.ready(), s.evolve()), (96, Err(SimError::NotReady)));
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

    /// Same vector as smoke.mjs ("growth + new actions").
    #[test]
    fn growth_and_new_actions() {
        let mut s = Stats::new(0xA1B2C3D4);
        assert_eq!((s.str, s.int, s.kind), (20, 24, 2));
        s.act(Action::Feed(1)).unwrap();
        s.act(Action::Play(7, 1)).unwrap();
        s.act(Action::Train).unwrap();
        s.act(Action::Interact).unwrap();
        assert_eq!(s.act(Action::Interact), Err(SimError::Cooldown));
        s.advance(5);
        s.act(Action::Interact).unwrap();
        assert_eq!(s.act(Action::Habitat(3)), Err(SimError::BadAction));
        s.act(Action::Habitat(1)).unwrap(); // lortor's home
        s.act(Action::Clean(1)).unwrap();
        assert_eq!((s.full, s.joy, s.energy, s.hygiene, s.health), (90, 100, 50, 100, 100));
        assert_eq!((s.xp, s.age, s.str, s.int, s.habitat, s.calm_until), (13, 5, 22, 26, 1, 10));
        assert_eq!((s.ready(), s.bonus(), s.level()), (94, 45, 2));
        assert_eq!(s.evolve(), Err(SimError::NotReady));
    }

    #[test]
    fn deterministic() {
        let run = || {
            let mut s = Stats::default();
            for i in 0..200u32 {
                s.advance(i % 7);
                let _ = s.act([Action::Feed(0), Action::Play((i % 11) as u8, 0), Action::Clean(0), Action::Sleep, Action::Train, Action::Interact][(i % 6) as usize]);
            }
            s
        };
        assert_eq!(run(), run());
    }
}
