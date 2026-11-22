// Ribbon Rush sim. Integer only; must match client/src/sim.ts bit for bit.
pub const W: i32 = 48;
pub const H: i32 = 32;
pub const TICK_HZ: u32 = 15;
pub const FADE: u32 = 90;
pub const CLOSE_AT: u32 = 300;
pub const CLOSE_EVERY: u32 = 75;
pub const MAX_RING: i32 = 12;
pub const BOOST_TICKS: u32 = 15;
pub const FREEZE: u32 = 30;
pub const WIN_ROUNDS: u32 = 2;
pub const MAX_ROUNDS: u32 = 9;
const DX: [i32; 4] = [0, 1, 0, -1];
const DY: [i32; 4] = [-1, 0, 1, 0];

pub fn input(dir: Option<u8>, boost: bool) -> u8 {
    dir.unwrap_or(7) | if boost { 8 } else { 0 }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Rider {
    pub x: i32,
    pub y: i32,
    pub dir: u8,
    pub boost_left: u32,
    pub boost_used: bool,
    pub alive: bool,
}

#[derive(Clone)]
pub struct Sim {
    pub tick: u32,
    pub round_tick: u32,
    pub rounds: u32,
    pub score: [u32; 2],
    pub riders: [Rider; 2],
    pub ring: i32,
    pub freeze: u32,
    pub done: bool,
    pub winner: i8,
    expire: Vec<u32>,
    owner: Vec<u8>,
}

fn spawn() -> [Rider; 2] {
    let r = |x, y, dir| Rider { x, y, dir, boost_left: 0, boost_used: false, alive: true };
    [r(8, 16, 1), r(39, 15, 3)]
}

impl Default for Sim {
    fn default() -> Self {
        Self::new()
    }
}

impl Sim {
    pub fn new() -> Self {
        let n = (W * H) as usize;
        Sim {
            tick: 0, round_tick: 0, rounds: 0, score: [0; 2], riders: spawn(), ring: 0, freeze: 0, done: false,
            winner: -1, expire: vec![0; n], owner: vec![0; n],
        }
    }

    pub fn cell(&self, x: i32, y: i32) -> u8 {
        if x < 0 || y < 0 || x >= W || y >= H { return 0; }
        let i = (y * W + x) as usize;
        if self.expire[i] > self.tick { self.owner[i] + 1 } else { 0 }
    }

    pub fn step(&mut self, ins: [u8; 2]) {
        self.tick += 1;
        if self.done { return; }
        if self.freeze > 0 {
            self.freeze -= 1;
            if self.freeze == 0 {
                self.riders = spawn();
                self.expire.fill(0);
                self.round_tick = 0;
                self.ring = 0;
            }
            return;
        }
        self.round_tick += 1;
        self.ring = if self.round_tick < CLOSE_AT { 0 } else { MAX_RING.min(1 + ((self.round_tick - CLOSE_AT) / CLOSE_EVERY) as i32) };
        let mut moves = [0u32; 2];
        for (i, r) in self.riders.iter_mut().enumerate() {
            let d = ins[i] & 7;
            if d < 4 && d != (r.dir + 2) % 4 { r.dir = d; }
            if ins[i] & 8 != 0 && !r.boost_used { r.boost_used = true; r.boost_left = BOOST_TICKS; }
            moves[i] = if r.boost_left > 0 { 2 } else { 1 };
            r.boost_left = r.boost_left.saturating_sub(1);
        }
        let mut crashed = [false; 2];
        for sub in 0..2 {
            let mut moved = [false; 2];
            for i in 0..2 {
                let r = &mut self.riders[i];
                if !r.alive || moves[i] <= sub { continue; }
                let c = (r.y * W + r.x) as usize;
                self.expire[c] = self.tick + FADE;
                self.owner[c] = i as u8;
                r.x += DX[r.dir as usize];
                r.y += DY[r.dir as usize];
                moved[i] = true;
            }
            let g = self.ring;
            for i in 0..2 {
                let Rider { x, y, .. } = self.riders[i];
                if moved[i] && (x < g || y < g || x >= W - g || y >= H - g || self.cell(x, y) != 0) { crashed[i] = true; }
            }
            let [a, b] = self.riders;
            if moved == [true, true] && a.x == b.x && a.y == b.y { crashed = [true, true]; }
            if crashed[0] || crashed[1] { break; }
        }
        if !crashed[0] && !crashed[1] { return; }
        for i in 0..2 {
            if crashed[i] { self.riders[i].alive = false; }
        }
        if crashed[0] != crashed[1] { self.score[crashed[0] as usize] += 1; }
        self.rounds += 1;
        if let Some(w) = (0..2).find(|&i| self.score[i] == WIN_ROUNDS) {
            self.done = true;
            self.winner = w as i8;
        } else if self.rounds >= MAX_ROUNDS {
            self.done = true;
            let [s0, s1] = self.score;
            self.winner = if s0 > s1 { 0 } else if s1 > s0 { 1 } else { -1 };
        } else {
            self.freeze = FREEZE;
        }
    }

    pub fn hash(&self) -> u32 {
        let mut h: u32 = 2166136261;
        let mut feed = |v: u32| for b in v.to_le_bytes() { h = (h ^ b as u32).wrapping_mul(16777619); };
        for v in [self.tick, self.round_tick, self.rounds, self.score[0], self.score[1], self.ring as u32, self.freeze, self.done as u32, (self.winner + 1) as u32] {
            feed(v);
        }
        for r in &self.riders {
            for v in [r.x as u32, r.y as u32, r.dir as u32, r.boost_left, r.boost_used as u32, r.alive as u32] { feed(v); }
        }
        h
    }
}
