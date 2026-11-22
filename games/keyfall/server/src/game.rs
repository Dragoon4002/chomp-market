//! Keyfall v2 sim: port of Typewriter Command (Unity, decompiled), one independent sim per seat.
//! Rules: tasks/keyfall-spec.md (changes) + tasks/keyfall-reference.md (everything else).
//! World units (view x ±8.889, y ±5), fixed 50 Hz step, times in integer ms.
use serde_json::{Value, json};
use std::f64::consts::TAU;
use std::sync::LazyLock;

// ---- match ----
pub const DURATION_MS: i64 = 120_000;
/// No typeable enemy on screen -> spawn schedule runs 1.2x (24 ms per 20 ms step). Same enemies/words/order, just sooner.
const EMPTY_DT_MS: i64 = 24;
pub const COUNTDOWN_MS: f64 = 3_000.;
pub const GRACE_MS: f64 = 15_000.;
pub const DT_MS: i64 = 20;
const DT: f64 = DT_MS as f64 / 1000.;
const HP: i32 = 100;
const BOMB_DMG: i32 = 10;
const FIREBALL_DMG: i32 = 5;

// ---- schedule (spec item 3; other ramps as original scene values) ----
const SPAWN_X: f64 = 12.; // spawn distance and bomber wrap / balloon exit boundary
const BALLOONS: u32 = 3;
const BALLOON_FIRST_MS: i64 = 1_000;
const BALLOON_GAP_MS: i64 = 3_000;
const TUTORIAL_MS: i64 = 10_000; // fixed: never ends early on kills (spec item 4)
const BALLOON_SPEED: f64 = 1.4;
const BALLOON_Y: (f64, f64) = (1.8, 3.4);
const BOB_AMP: f64 = 0.15;
const BOB_FREQ: f64 = 1.;
const BOMBERS_PER_LEVEL: u32 = 8; // word-length ramp step per bombers SPAWNED
const BOMBER_FIRST_MS: i64 = 4_000;
const BOMBER_GAP0_MS: i64 = 9_000;
const BOMBER_GAP_MIN_MS: i64 = 1_500;
const BOMBER_GAP_DEC_MS: i64 = 150;
const BOMBER_SPEED: (f64, f64, f64) = (1.45, 0.085, 4.2); // initial, +per spawn, max
const BOMBER_Y: (f64, f64) = (2.4, 3.8);
const BOMBER_HALF_W: f64 = 0.9375; // collider 1.875 wide
const DROP_ZONE_HALF_W: f64 = 0.5;
const BOMB_SPEED: f64 = 1.3;
const BOMB_BOX: (f64, f64, f64) = (0.25, 0.25, 0.5); // half w, y offset, half h
const CHOPPER_PHASE_MS: i64 = 45_000;
const CHOPPER_FIRST_MS: i64 = 12_000;
const CHOPPER_GAP0_MS: i64 = 20_000;
const CHOPPER_GAP_MIN_MS: i64 = 8_000;
const CHOPPER_GAP_DEC_MS: i64 = 500;
const CHOPPER_SPEED: f64 = 1.1;
const CHOPPER_Y: (f64, f64) = (2.5, 3.5);
const CHOPPER_HALF_W: f64 = 1.;
const ATTACK_ZONE_HALF_W: f64 = 3.75;
const TILT_DEG: f64 = 15.;
const TILT_SPEED: f64 = 2.;
const FIRE_MS: i64 = 1_000;
const FIREBALL_SPEED: f64 = 3.;
const FIREBALL_HALF: f64 = 0.25;

// ---- city + turret ----
const CITY_HALF_W: f64 = 1.5; // trigger x[-1.5,1.5] y[-4,-3]
const CITY_Y: (f64, f64) = (-4., -3.);
const CITY_TARGET: (f64, f64) = (0., -3.);
const TURRET_Y: f64 = -3.65; // GunPivot + TurretGun origin, x = 0
const TURN_DEG_S: f64 = 180.;
const FIRE_TOL_DEG: f64 = 1.;
const LASER_MS: i64 = 200;

// ---- typing ----
const MAX_STRIKES: u8 = 3;
const STUN_MS: i64 = 1_000;
const AUTO_SUBMIT_MS: i64 = 150;
const MAX_INPUT: usize = 16;
const RECENT: usize = 20;

/// words.txt bucketed by length (file order = alphabetical, like the original's sorted lists).
static BY_LEN: LazyLock<Vec<Vec<&'static str>>> = LazyLock::new(|| {
    let mut v = vec![vec![]; 13];
    for w in include_str!("../../client/public/words.txt").split_whitespace() {
        if let Some(b) = v.get_mut(w.len()) {
            b.push(w);
        }
    }
    v
});

fn words_in(lo: usize, hi: usize) -> impl Iterator<Item = &'static str> {
    (lo..=hi).flat_map(|l| BY_LEN[l].iter().copied())
}

/// splitmix64; one stream per entity = hash(seed, entity id) (spec item 4).
struct Rng(u64);

impl Rng {
    fn of(seed: u64, id: u32) -> Self {
        Rng(seed ^ (id as u64).wrapping_mul(0xD1B5_4A32_D192_ED03))
    }
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    fn f(&mut self) -> f64 {
        (self.next() >> 11) as f64 / (1u64 << 53) as f64
    }
    fn range(&mut self, (a, b): (f64, f64)) -> f64 {
        a + (b - a) * self.f()
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
}

// ponytail: the original clears the recent queue when every word is excluded; buckets (>=91) never empty out at 20.
/// Bomb/balloon word: lengths 2-4, len<=3 weight 3, len 4 weight 1 (SelectWeightedBombWord).
fn pick_short(r: &mut Rng, recent: &[&str]) -> &'static str {
    let short: Vec<_> = words_in(2, 3).filter(|w| !recent.contains(w)).collect();
    let four: Vec<_> = words_in(4, 4).filter(|w| !recent.contains(w)).collect();
    let n = r.f() * (short.len() * 3 + four.len()) as f64;
    if (n < (short.len() * 3) as f64 && !short.is_empty()) || four.is_empty() {
        short[r.below(short.len())]
    } else {
        four[r.below(four.len())]
    }
}

fn pick(r: &mut Rng, (lo, hi): (usize, usize), recent: &mut Vec<&'static str>) -> &'static str {
    let c: Vec<_> = words_in(lo, hi).filter(|w| !recent.contains(w)).collect();
    let w = c[r.below(c.len())];
    recent.push(w);
    if recent.len() > RECENT {
        recent.remove(0);
    }
    w
}

/// Mathf.DeltaAngle: shortest signed b - a in (-180, 180].
fn delta_angle(a: f64, b: f64) -> f64 {
    let d = (b - a).rem_euclid(360.);
    if d > 180. { d - 360. } else { d }
}

/// Mathf.MoveTowardsAngle, result normalized like Transform.eulerAngles.
fn move_towards_angle(cur: f64, target: f64, max: f64) -> f64 {
    let d = delta_angle(cur, target);
    let z = if d.abs() < max {
        target
    } else {
        cur + max * d.signum()
    };
    z.rem_euclid(360.)
}

fn aim_from_turret((x, y): (f64, f64)) -> f64 {
    (y - TURRET_Y).atan2(x).to_degrees()
}

fn r3(v: f64) -> f64 {
    (v * 1000.).round() / 1000.
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
enum Kind {
    #[default]
    Balloon,
    Bomber,
    Bomb,
    Chopper,
    Fireball,
}

impl Kind {
    fn name(self) -> &'static str {
        match self {
            Kind::Balloon => "balloon",
            Kind::Bomber => "bomber",
            Kind::Bomb => "bomb",
            Kind::Chopper => "chopper",
            Kind::Fireball => "fireball",
        }
    }
    /// TargetPoint local y (aim, crosshair, laser end).
    fn aim_dy(self) -> f64 {
        match self {
            Kind::Bomber | Kind::Chopper => 0.4,
            Kind::Bomb => 0.5,
            _ => 0.,
        }
    }
}

/// One flat struct for every kind; unused fields stay default.
#[derive(Default)]
struct Ent {
    id: u32,
    kind: Kind,
    word: &'static str, // "" = fireball (untypeable)
    x: f64,
    y: f64,
    vx: f64,
    vy: f64,
    dir: f64, // +1 moving right, -1 left (flipX), 0 bomb/fireball
    speed: f64,
    y0: f64,   // balloon bob base
    bob: f64,  // balloon bob timer (rad)
    pass: u32, // bomber wrap count / chopper shot count
    dropped: bool,
    tilt: f64, // chopper z rotation, deg
    hover: bool,
    fired: bool,
    cool_ms: i64,
    gone: bool,
}

impl Ent {
    fn aim(&self) -> (f64, f64) {
        let a = self.tilt.to_radians();
        let d = self.kind.aim_dy();
        (self.x - a.sin() * d, self.y + a.cos() * d)
    }
    fn hits_city(&self, half_w: f64, bottom: f64, top: f64) -> bool {
        self.x.abs() < CITY_HALF_W + half_w && bottom < CITY_Y.1 && top > CITY_Y.0
    }
}

pub struct Sim {
    seed: u64,
    pub t: i64,
    pub hp: i32,
    chars: u32,
    ents: Vec<Ent>,
    fx: Vec<Value>,
    // schedule (TutorialManager + spawners)
    /// schedule clock (ms): advances EMPTY_DT_MS per step while no typeable enemy is up
    sched_t: i64,
    tutorial: bool,
    bombers_on: bool,
    balloons: u32,
    next_balloon: i64,
    bomber_timer: i64,
    bombers: u32,
    chopper_timer: i64,
    choppers: u32,
    recent_balloon: Vec<&'static str>,
    recent_bomber: Vec<&'static str>,
    recent_chopper: Vec<&'static str>,
    // PlayerInput
    input: String,
    prev: String,
    last_valid: String,
    target: Option<u32>,
    strikes: u8,
    stun_ms: i64,
    submit: Option<(i64, String)>,
    // two TurretControllers: GunPivot (world deg) and TurretGun (local deg, child of pivot)
    pivot: f64,
    gun_local: f64,
    gun_target: Option<u32>,
    laser_ms: i64,
}

impl Sim {
    pub fn new(seed: u64) -> Self {
        Sim {
            seed,
            t: 0,
            hp: HP,
            chars: 0,
            ents: vec![],
            fx: vec![],
            sched_t: 0,
            tutorial: true,
            bombers_on: false,
            balloons: 0,
            next_balloon: BALLOON_FIRST_MS,
            bomber_timer: BOMBER_FIRST_MS,
            bombers: 0,
            chopper_timer: CHOPPER_FIRST_MS,
            choppers: 0,
            recent_balloon: vec![],
            recent_bomber: vec![],
            recent_chopper: vec![],
            input: String::new(),
            prev: String::new(),
            last_valid: String::new(),
            target: None,
            strikes: 0,
            stun_ms: 0,
            submit: None,
            pivot: 0.,
            gun_local: 0.,
            gun_target: None,
            laser_ms: 0,
        }
    }

    pub fn wpm(&self) -> f64 {
        if self.t < 1000 {
            0.
        } else {
            (self.chars as f64 / 5. / (self.t as f64 / 60_000.)).round()
        }
    }

    fn ent(&self, id: Option<u32>) -> Option<&Ent> {
        id.and_then(|id| self.ents.iter().find(|e| e.id == id))
    }

    /// One fixed 20 ms step: schedule, movement + triggers, input timers, turret.
    pub fn step(&mut self) {
        self.t += DT_MS;
        self.schedule();
        self.physics();
        self.reap();
        self.stun_ms = (self.stun_ms - DT_MS).max(0);
        if let Some((ms, _)) = &mut self.submit {
            *ms -= DT_MS;
            if *ms <= 0 {
                let (_, w) = self.submit.take().unwrap();
                self.submit_word(&w);
            }
        }
        self.turret();
        self.reap();
    }

    fn schedule(&mut self) {
        let empty = self.ents.iter().all(|e| e.kind == Kind::Fireball);
        let dt = if empty { EMPTY_DT_MS } else { DT_MS };
        self.sched_t += dt;
        let t = self.sched_t;
        if self.tutorial {
            if t >= TUTORIAL_MS {
                self.tutorial = false;
                self.bombers_on = true;
            } else if self.balloons < BALLOONS && t >= self.next_balloon {
                self.spawn(Kind::Balloon);
                self.next_balloon = t + BALLOON_GAP_MS;
            }
        }
        if self.bombers_on {
            self.bomber_timer -= dt;
            if self.bomber_timer <= 0 {
                self.spawn(Kind::Bomber);
                let k = (self.bombers - 1) as i64;
                self.bomber_timer = (BOMBER_GAP0_MS - BOMBER_GAP_DEC_MS * k).max(BOMBER_GAP_MIN_MS);
            }
        }
        if t >= CHOPPER_PHASE_MS {
            self.chopper_timer -= dt;
            if self.chopper_timer <= 0 {
                self.spawn(Kind::Chopper);
                let k = (self.choppers - 1) as i64;
                self.chopper_timer =
                    (CHOPPER_GAP0_MS - CHOPPER_GAP_DEC_MS * k).max(CHOPPER_GAP_MIN_MS);
            }
        }
    }

    /// Scheduled spawn. Ids per kind (balloon 1+k, chopper 100+k, bomber 1000+k) so they match across
    /// seats even when the tutorial ends at different times; side/height/bob/word all from hash(seed, id).
    fn spawn(&mut self, kind: Kind) {
        let (id, y, speed, word);
        let mut r;
        match kind {
            Kind::Balloon => {
                id = 1 + self.balloons;
                self.balloons += 1;
                r = Rng::of(self.seed, id);
                (y, speed) = (r.range(BALLOON_Y), BALLOON_SPEED);
                word = pick_short(&mut r, &self.recent_balloon);
                self.recent_balloon.push(word);
            }
            Kind::Bomber => {
                id = 1000 + self.bombers;
                let lvl = (self.bombers / BOMBERS_PER_LEVEL) as usize; // original: killed / 5
                self.bombers += 1;
                r = Rng::of(self.seed, id);
                y = r.range(BOMBER_Y);
                let k = self.bombers as f64 - 1.;
                speed = (BOMBER_SPEED.0 + BOMBER_SPEED.1 * k).min(BOMBER_SPEED.2);
                let lens = ((4 + lvl / 5).clamp(4, 7), (5 + lvl / 2).clamp(5, 7));
                word = pick(&mut r, lens, &mut self.recent_bomber);
            }
            _ => {
                id = 100 + self.choppers;
                self.choppers += 1;
                r = Rng::of(self.seed, id);
                (y, speed) = (r.range(CHOPPER_Y), CHOPPER_SPEED);
                word = pick(&mut r, (6, 8), &mut self.recent_chopper);
            }
        }
        // drawn after the word so word picks don't depend on it; Unity: value > 0.5 -> spawn left, move right
        let dir = if r.f() > 0.5 { 1. } else { -1. };
        let bob = r.f() * TAU;
        self.ents.push(Ent {
            id,
            kind,
            word,
            x: -SPAWN_X * dir,
            y,
            y0: y,
            dir,
            speed,
            bob,
            ..Default::default()
        });
    }

    fn physics(&mut self) {
        let (seed, fx, hp) = (self.seed, &mut self.fx, &mut self.hp);
        let mut born = vec![];
        let mut hit = |e: &Ent, dmg: i32, fx: &mut Vec<Value>| {
            *hp = (*hp - dmg).max(0);
            fx.push(json!({ "e": "cityhit", "dmg": dmg }));
            fx.push(json!({ "e": "siren" }));
            fx.push(json!({ "e": "boom", "x": r3(e.x), "y": r3(e.y) }));
        };
        for e in &mut self.ents {
            match e.kind {
                Kind::Balloon => {
                    e.bob += DT * BOB_FREQ;
                    e.y = e.y0 + e.bob.sin() * BOB_AMP;
                    (e.vx, e.vy) = (e.dir * e.speed, e.bob.cos() * BOB_AMP * BOB_FREQ);
                    e.x += e.vx * DT;
                    e.gone = e.x.abs() > SPAWN_X;
                }
                Kind::Bomber => {
                    e.x += e.dir * e.speed * DT;
                    if e.x.abs() > SPAWN_X {
                        e.dir = e.x.signum();
                        e.x = -SPAWN_X * e.dir;
                        e.dropped = false;
                        e.pass += 1;
                    }
                    e.vx = e.dir * e.speed;
                    // ponytail: zones are tall (y -4..6) so only x overlap is checked
                    if !e.dropped && e.x.abs() < BOMBER_HALF_W + DROP_ZONE_HALF_W {
                        e.dropped = true;
                        let id = e.id * 1000 + e.pass;
                        let word = pick_short(&mut Rng::of(seed, id), &[]);
                        born.push(Ent {
                            id,
                            kind: Kind::Bomb,
                            word,
                            x: e.x,
                            y: e.y,
                            vy: -BOMB_SPEED,
                            ..Default::default()
                        });
                        fx.push(json!({ "e": "bombfall" }));
                    }
                }
                Kind::Chopper => {
                    let tilt_to = if e.hover {
                        (e.vx, e.vy) = (0., 0.);
                        e.cool_ms -= DT_MS;
                        if e.cool_ms <= 0 {
                            let (dx, dy) = (CITY_TARGET.0 - e.x, CITY_TARGET.1 - e.y);
                            let n = dx.hypot(dy);
                            let (vx, vy) = (dx / n * FIREBALL_SPEED, dy / n * FIREBALL_SPEED);
                            let id = e.id * 1000 + e.pass; // chopper ids 100.. -> 100_000..; bombs are 1_000_000..
                            e.pass += 1;
                            born.push(Ent {
                                id,
                                kind: Kind::Fireball,
                                x: e.x,
                                y: e.y,
                                vx,
                                vy,
                                ..Default::default()
                            });
                            fx.push(json!({ "e": "chopperfire" }));
                            e.fired = true;
                            e.cool_ms = FIRE_MS;
                        }
                        0.
                    } else {
                        // local-space Translate: the tilt makes it sink while approaching (reference quirk 5)
                        let a = e.tilt.to_radians();
                        (e.vx, e.vy) = (a.cos() * e.dir * e.speed, a.sin() * e.dir * e.speed);
                        e.x += e.vx * DT;
                        e.y += e.vy * DT;
                        -e.dir * TILT_DEG
                    };
                    e.tilt += delta_angle(e.tilt, tilt_to) * (TILT_SPEED * DT).min(1.);
                    // ponytail: rotation is frozen on the body, so the box never shrinks out of the zone; no exit check
                    if !e.hover && e.x.abs() < ATTACK_ZONE_HALF_W + CHOPPER_HALF_W {
                        e.hover = true;
                        e.cool_ms = if e.fired { FIRE_MS } else { 0 };
                    }
                }
                Kind::Bomb => {
                    e.y += e.vy * DT;
                    let (hw, off, hh) = BOMB_BOX;
                    if e.hits_city(hw, e.y + off - hh, e.y + off + hh) {
                        e.gone = true;
                        hit(e, BOMB_DMG, fx);
                    }
                }
                Kind::Fireball => {
                    e.x += e.vx * DT;
                    e.y += e.vy * DT;
                    if e.hits_city(FIREBALL_HALF, e.y - FIREBALL_HALF, e.y + FIREBALL_HALF) {
                        e.gone = true;
                        hit(e, FIREBALL_DMG, fx);
                    }
                }
            }
        }
        self.ents.extend(born);
    }

    /// Drop `gone` entities and run their OnDestroy effects.
    fn reap(&mut self) {
        while let Some(i) = self.ents.iter().position(|e| e.gone) {
            let e = self.ents.remove(i);
            if self.target == Some(e.id) {
                self.target = None;
            }
            if self.gun_target == Some(e.id) {
                self.gun_target = None;
            }
        }
    }

    fn turret(&mut self) {
        self.laser_ms = (self.laser_ms - DT_MS).max(0);
        if self.stun_ms > 0 {
            return;
        }
        let max = TURN_DEG_S * DT;
        if let Some(a) = self.ent(self.target).map(|e| aim_from_turret(e.aim())) {
            self.pivot = move_towards_angle(self.pivot, a, max);
        }
        let Some(i) = self
            .gun_target
            .and_then(|id| self.ents.iter().position(|e| e.id == id))
        else {
            return;
        };
        let e = &mut self.ents[i];
        let (aim, g) = (e.aim(), self.pivot + self.gun_local);
        let a = aim_from_turret(aim);
        self.gun_local = move_towards_angle(g, a, max) - self.pivot;
        if delta_angle(g, a).abs() < FIRE_TOL_DEG {
            e.gone = true;
            self.chars += e.word.len() as u32;
            self.laser_ms = LASER_MS;
            self.fx
                .push(json!({ "e": "laser", "x": r3(aim.0), "y": r3(aim.1) }));
            self.fx
                .push(json!({ "e": "boom", "x": r3(e.x), "y": r3(e.y) }));
            self.gun_target = None;
        }
    }

    /// One key: 'a'..='z', '\u{8}' backspace, '\n' enter. Ignored while stunned.
    pub fn key(&mut self, c: char) {
        if self.stun_ms > 0 {
            return;
        }
        match c {
            'a'..='z' if self.input.len() < MAX_INPUT => {
                self.input.push(c);
                self.changed();
            }
            '\u{8}' => {
                if self.input.pop().is_some() {
                    self.changed();
                }
            }
            '\n' => {
                let w = std::mem::take(&mut self.input);
                self.submit_word(&w);
            }
            _ => {}
        }
    }

    fn clear_targeting(&mut self) {
        self.target = None;
        self.last_valid.clear();
        self.prev.clear();
    }

    /// PlayerInput.OnInputChanged.
    fn changed(&mut self) {
        let cur = self.input.clone();
        let back = cur.len() < self.prev.len();
        if cur.is_empty() {
            self.clear_targeting();
            return;
        }
        let partial = self
            .ents
            .iter()
            .filter(|e| !e.word.is_empty() && e.word.starts_with(&cur))
            .min_by_key(|e| e.word.len())
            .map(|e| (e.id, e.word));
        if let Some((id, word)) = partial {
            let new = self.target != Some(id);
            if new {
                self.clear_targeting();
                self.target = Some(id);
            }
            if cur.len() > self.last_valid.len() && !new {
                self.fx.push(json!({ "e": "key" }));
            }
            if word == cur {
                self.submit = Some((AUTO_SUBMIT_MS, cur.clone()));
            }
            self.last_valid = cur.clone();
        } else if !back {
            if self.last_valid.is_empty() {
                self.clear_targeting();
                self.strike();
            } else if let Some(e) = self.ent(self.target)
                && e.word.starts_with(&self.last_valid)
                && !e.word.starts_with(&cur)
            {
                self.strike();
            }
        }
        if self.stun_ms == 0 {
            self.prev = cur;
        }
    }

    fn strike(&mut self) {
        self.strikes += 1;
        if self.strikes >= MAX_STRIKES {
            self.strikes = 0;
            self.stun_ms = STUN_MS;
            self.submit = None;
            self.input.clear();
            self.clear_targeting();
            self.fx.push(json!({ "e": "stun" }));
        } else {
            self.fx.push(json!({ "e": "strike" }));
        }
    }

    /// PlayerInput.OnWordSubmitted (auto-submit or Enter).
    fn submit_word(&mut self, w: &str) {
        if w.is_empty() || self.stun_ms > 0 {
            return;
        }
        if let Some(e) = self.ents.iter().find(|e| !e.word.is_empty() && e.word == w) {
            self.gun_target = Some(e.id);
            self.strikes = 0;
        }
        self.submit = None;
        self.clear_targeting();
        self.input.clear();
    }

    /// Own-sim part of the View (spec); drains fx accumulated since the last call.
    pub fn view(&mut self) -> Value {
        let rad = |d: f64| r3(delta_angle(0., d).to_radians());
        let ents: Vec<Value> = self
            .ents
            .iter()
            .map(|e| {
                json!({
                    "id": e.id, "k": e.kind.name(), "x": r3(e.x), "y": r3(e.y), "vx": r3(e.vx), "vy": r3(e.vy),
                    "w": e.word, "flip": e.dir < 0.,
                })
            })
            .collect();
        json!({
            "t_ms": self.t, "hp": self.hp, "wpm": self.wpm(), "strikes": self.strikes, "stun_ms": self.stun_ms,
            "input": self.input, "target": self.target,
            "gun": rad(self.pivot + self.gun_local), "pivot": rad(self.pivot),
            "ents": ents, "fx": std::mem::take(&mut self.fx),
        })
    }
}

/// Ranking: higher hp, then higher wpm, else draw (None).
pub fn rank(s: &[Sim; 2]) -> Option<u8> {
    let key = |s: &Sim| (s.hp, s.wpm() as i64);
    match key(&s[0]).cmp(&key(&s[1])) {
        std::cmp::Ordering::Greater => Some(0),
        std::cmp::Ordering::Less => Some(1),
        _ => None,
    }
}

/// End rules (spec item 6): Some((winner, reason)) once the match is decided.
pub fn verdict(s: &[Sim; 2]) -> Option<(Option<u8>, &'static str)> {
    match (s[0].hp <= 0, s[1].hp <= 0) {
        (true, false) => Some((Some(1), "ko")),
        (false, true) => Some((Some(0), "ko")),
        (true, true) => Some((rank(s), "ko")), // both 0 hp -> wpm decides
        _ if s[0].t >= DURATION_MS => Some((rank(s), "time")),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn run(s: &mut Sim, ms: i64) {
        (0..ms / DT_MS).for_each(|_| s.step());
    }
    fn has(s: &Sim, e: &str) -> bool {
        s.fx.iter().any(|f| f["e"] == e)
    }
    fn typ(s: &mut Sim, w: &str) {
        w.chars().for_each(|c| s.key(c));
    }
    /// letter no active word starts with
    fn miss(s: &Sim) -> char {
        ('a'..='z')
            .find(|&c| s.ents.iter().all(|e| !e.word.starts_with(c)))
            .unwrap()
    }

    #[test]
    fn tutorial_balloons() {
        let mut s = Sim::new(1);
        let mut at = vec![];
        while s.t < 9_000 {
            let n = s.ents.len();
            s.step();
            if s.ents.len() > n {
                at.push(s.t);
            }
        }
        // sky empty until the first balloon: schedule runs 1.2x (1000 / 1.2 ≈ 840), then 3 s gaps while it's up
        assert_eq!(at, [840, 3_840, 6_840]);
        assert!(
            s.ents
                .iter()
                .all(|e| e.kind == Kind::Balloon && (2..=4).contains(&e.word.len()))
        );
    }

    #[test]
    fn kill_balloon() {
        let mut s = Sim::new(2);
        run(&mut s, 1_000);
        let (id, w) = (s.ents[0].id, s.ents[0].word);
        typ(&mut s, w);
        assert_eq!((s.target, s.input.as_str()), (Some(id), w));
        assert!(has(&s, "key"));
        let mut n = 0;
        while s.ents.iter().any(|e| e.id == id) {
            s.step();
            n += 1;
            assert!(n < 150, "turret never fired");
        }
        // 150 ms auto-submit, while the pivot (gun's parent) already turns toward the locked target
        assert!(
            n as i64 * DT_MS >= AUTO_SUBMIT_MS && s.pivot != 0.,
            "fired before submit/turn"
        );
        assert!(has(&s, "laser") && has(&s, "boom"));
        assert!(s.input.is_empty() && s.target.is_none());
        assert!(s.wpm() > 0.);
        assert_eq!(s.hp, HP);
        // killing it emptied the sky, so the schedule ran 1.2x: next balloon earlier than the unboosted 3.84 s
        while s.balloons < 2 {
            s.step();
        }
        assert!(s.t < 3_840, "no empty-sky boost: {}", s.t);
    }

    #[test]
    fn strikes_stun_backspace() {
        let mut s = Sim::new(3);
        run(&mut s, 1_000);
        let x = miss(&s);
        s.key(x);
        assert_eq!(s.strikes, 1);
        assert!(has(&s, "strike"));
        s.key(x);
        assert_eq!(s.strikes, 2);
        s.key(x);
        assert_eq!((s.strikes, s.stun_ms, s.input.as_str()), (0, STUN_MS, ""));
        assert!(has(&s, "stun"));
        let w = s.ents[0].word;
        s.key(w.chars().next().unwrap());
        assert!(s.input.is_empty(), "keys ignored while stunned");
        run(&mut s, STUN_MS);
        assert_eq!(s.stun_ms, 0);
        s.key(w.chars().next().unwrap());
        assert_eq!(s.input, w[..1]);

        // valid prefix + wrong char = strike; backspace never strikes
        let wrong = ('a'..='z').find(|&c| !w[1..].starts_with(c)).unwrap();
        s.key(wrong);
        assert_eq!(s.strikes, 1);
        for _ in 0..3 {
            s.key('\u{8}');
        }
        assert_eq!((s.strikes, s.input.as_str()), (1, ""));
    }

    #[test]
    fn bomber_drops_bomb() {
        let mut s = Sim::new(4);
        while !s.ents.iter().any(|e| e.kind == Kind::Bomb) {
            s.step();
            assert!(s.t < 45_000);
        }
        let b = s.ents.iter().find(|e| e.kind == Kind::Bomb).unwrap();
        let src = s.ents.iter().find(|e| e.id == b.id / 1000).unwrap();
        assert!(src.x.abs() < BOMBER_HALF_W + DROP_ZONE_HALF_W && src.dropped);
        assert_eq!((b.x, b.id % 1000), (src.x, 0));
        assert!(has(&s, "bombfall"));
        s.fx.clear();
        while !has(&s, "cityhit") {
            s.step();
        }
        assert_eq!(s.hp, HP - BOMB_DMG);
        assert!(
            s.fx.iter()
                .any(|f| f["e"] == "cityhit" && f["dmg"] == BOMB_DMG)
        );
        assert!(!s.ents.iter().any(|e| e.kind == Kind::Bomb));
    }

    #[test]
    fn chopper_fireball() {
        let mut s = Sim::new(5);
        while !has(&s, "cityhit") {
            s.ents
                .retain(|e| !matches!(e.kind, Kind::Bomber | Kind::Bomb));
            s.step();
            assert!(s.t < 90_000);
        }
        assert_eq!(s.hp, HP - FIREBALL_DMG);
        let c = s.ents.iter().find(|e| e.kind == Kind::Chopper).unwrap();
        assert!(
            c.hover && (c.x.abs() - 4.75).abs() < 0.05,
            "hovers at |x|~4.75: {}",
            c.x
        );
        assert!(c.y < c.y0, "sank while approaching");
    }

    #[test]
    fn same_seed_same_schedule() {
        let (mut a, mut b) = (Sim::new(42), Sim::new(42));
        let (mut sa, mut sb) = (BTreeMap::new(), BTreeMap::new());
        let mut kills = 0;
        while a.t < 60_000 {
            // seat a kills everything it can, seat b kills nothing
            if a.input.is_empty()
                && a.gun_target.is_none()
                && let Some(w) = a.ents.iter().find(|e| !e.word.is_empty()).map(|e| e.word)
            {
                typ(&mut a, w);
                kills += 1;
            }
            a.step();
            b.step();
            for (s, m) in [(&a, &mut sa), (&b, &mut sb)] {
                for e in s
                    .ents
                    .iter()
                    .filter(|e| matches!(e.kind, Kind::Balloon | Kind::Bomber | Kind::Chopper))
                {
                    m.entry(e.id)
                        .or_insert((s.t, e.kind, e.word, e.dir, (e.y0 * 1e6) as i64));
                }
            }
        }
        assert!(kills >= 8 && a.hp == HP && b.hp < HP && b.chars == 0);
        assert!(sa.len() >= 10 && sa.keys().any(|k| (100..1000).contains(k)));
        // same enemies, words, sides and heights in the same order; the clearer gets them sooner (empty-sky boost)
        assert!(sa.len() > sb.len(), "clearing seat should reach more spawns");
        for (id, (tb, kb, wb, db, yb)) in &sb {
            let (ta, ka, wa, da, ya) = sa[id];
            assert_eq!((ka, wa, da, ya), (*kb, *wb, *db, *yb), "id {id}");
            assert!(ta <= *tb, "id {id} later for clearer");
        }
    }

    #[test]
    fn end_rules() {
        let pair = || [Sim::new(1), Sim::new(1)];
        let mut s = pair();
        assert_eq!(verdict(&s), None);
        s[1].hp = 0;
        assert_eq!(verdict(&s), Some((Some(0), "ko")));
        s[0].hp = 0;
        assert_eq!(verdict(&s), Some((None, "ko")));
        (s[0].t, s[1].t, s[0].chars) = (60_000, 60_000, 50);
        assert_eq!(verdict(&s), Some((Some(0), "ko")));

        let mut s = pair();
        (s[0].t, s[1].t) = (DURATION_MS, DURATION_MS);
        assert_eq!(verdict(&s), Some((None, "time")));
        s[1].chars = 100;
        assert_eq!(verdict(&s), Some((Some(1), "time")));
        s[0].hp = 90;
        s[1].hp = 80;
        assert_eq!(verdict(&s), Some((Some(0), "time")));
    }
}
