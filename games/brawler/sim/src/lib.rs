//! Deterministic 60 Hz fight sim. Bit-exact port of client src/lib/sim/sim.ts (golden test guards it).
//! All numbers f64 like JS; Math.min/max/round via js_* helpers (sign of zero, ties).
//! ponytail: no SimEvent list, server only needs stocks/winner. Add if server ever renders.
pub mod genes;
pub mod moves;
pub mod stages;

use moves::{MoveDef, MoveId};
pub use stages::{STAGE_IDS, StageDef, StageId};

pub mod input {
    pub const LEFT: i32 = 1;
    pub const RIGHT: i32 = 2;
    pub const UP: i32 = 4;
    pub const DOWN: i32 = 8;
    pub const JUMP: i32 = 16;
    pub const LIGHT: i32 = 32;
    pub const HEAVY: i32 = 64;
    pub const DODGE: i32 = 128;
    pub const BLOCK: i32 = 256;
}
use input::*;
const ACTIONS: i32 = JUMP | LIGHT | HEAVY | DODGE;

#[derive(Clone, Copy, Debug)]
pub struct Stats {
    pub str: f64,
    pub dex: f64,
    pub def: f64,
    pub spd: f64,
    /// Effect skill bits, see `fx`.
    pub fx: u8,
}
pub const DEFAULT_STATS: Stats = Stats {
    str: 6.,
    dex: 5.,
    def: 5.,
    spd: 6.,
    fx: 0,
};

pub mod fx {
    pub const AIR_JUMP: u8 = 1;
    pub const LIFESTEAL: u8 = 2;
    pub const QUICK_DODGE: u8 = 4;
    pub const SECOND_WIND: u8 = 8;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum St {
    Idle,
    Run,
    Jumpsquat,
    Air,
    Land,
    Dodge,
    Attack,
    Hitstun,
    Dead,
    Block,
}

#[derive(Clone, Copy, Debug)]
pub struct Mods {
    pub dmg: f64,
    pub kb_taken: f64,
    pub startup: f64,
    pub run: f64,
}

#[derive(Clone, Debug)]
pub struct Fighter {
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub facing: f64,
    pub state: St,
    pub t: f64,
    pub grounded: bool,
    pub air_jumps: f64,
    pub recovery_used: bool,
    pub air_dodged: bool,
    pub fast_fall: bool,
    pub mv: Option<MoveId>,
    pub move_hit: bool,
    pub combo: f64,
    pub combo_t: f64,
    pub damage: f64,
    pub stocks: f64,
    pub hitstun: f64,
    pub hitlag: f64,
    pub invuln: f64,
    pub dodge_cd: f64,
    pub land_lag: f64,
    pub drop_t: f64,
    pub prev_in: i32,
    pub buf: i32,
    pub buf_t: f64,
    pub m: Mods,
    pub fx: u8,
    pub wind_used: bool,
}

#[derive(Clone, Debug)]
pub struct GameState {
    pub frame: u64,
    pub stage: StageId,
    pub fighters: [Fighter; 2],
    pub winner: i32,
}

pub const HURT_W: f64 = 50.;
pub const HURT_H: f64 = 90.;
const G: f64 = 0.85;
const HIT_G: f64 = 0.55;
const MAX_FALL: f64 = 13.;
const FAST_FALL: f64 = 19.;
const GROUND_ACC: f64 = 1.2;
const FRICTION: f64 = 0.8;
const AIR_ACC: f64 = 0.6;
const JUMP_V: f64 = 16.5;
const SHORT_HOP_V: f64 = 11.;
const AIR_JUMP_V: f64 = 14.5;
const JUMPSQUAT: f64 = 3.;
/// Blocked hit: damage / 5, knockback x 0.25, horizontal only.
const BLOCK_CHIP: f64 = 5.;
const BLOCK_PUSH: f64 = 0.25;
const BUFFER: f64 = 6.;
const RESPAWN: f64 = 90.;
const RESPAWN_INVULN: f64 = 120.;
const STOCKS: f64 = 3.;
pub const MAX_HP: f64 = 200.;

/// JS Math.min: -0 < +0.
pub fn js_min(a: f64, b: f64) -> f64 {
    if a < b {
        a
    } else if b < a {
        b
    } else if a.is_sign_negative() {
        a
    } else {
        b
    }
}
/// JS Math.max: +0 > -0.
pub fn js_max(a: f64, b: f64) -> f64 {
    if a > b {
        a
    } else if b > a {
        b
    } else if a.is_sign_positive() {
        a
    } else {
        b
    }
}
/// JS Math.round: ties -> +inf. ponytail: sign of zero off for x in (-0.5,0), never hit (inputs >= 0).
pub fn js_round(x: f64) -> f64 {
    let r = x.floor();
    if x - r >= 0.5 { r + 1. } else { r }
}

pub fn stat_mods(s: Stats) -> Mods {
    Mods {
        dmg: 0.85 + 0.05 * (s.str - 3.),
        kb_taken: 1.12 - 0.04 * (s.def - 3.),
        startup: ((5. - s.dex) / 2.).floor(),
        run: 4.5 + 0.35 * s.spd,
    }
}

fn jumps(f: u8) -> f64 {
    if f & fx::AIR_JUMP != 0 { 3. } else { 2. }
}

fn dodge_cd(f: &Fighter, n: f64) -> f64 {
    if f.fx & fx::QUICK_DODGE != 0 {
        n - (n / 3.).floor()
    } else {
        n
    }
}

fn new_fighter(st: &StageDef, i: usize, stats: Stats) -> Fighter {
    let (x, y) = st.spawns[i];
    Fighter {
        x,
        y,
        vx: 0.,
        vy: 0.,
        facing: if i == 0 { 1. } else { -1. },
        state: St::Air,
        t: 0.,
        grounded: false,
        air_jumps: jumps(stats.fx),
        recovery_used: false,
        air_dodged: false,
        fast_fall: false,
        mv: None,
        move_hit: false,
        combo: 0.,
        combo_t: 0.,
        damage: 0.,
        stocks: STOCKS,
        hitstun: 0.,
        hitlag: 0.,
        invuln: 0.,
        dodge_cd: 0.,
        land_lag: 0.,
        drop_t: 0.,
        prev_in: 0,
        buf: 0,
        buf_t: 0.,
        m: stat_mods(stats),
        fx: stats.fx,
        wind_used: false,
    }
}

pub fn new_game(stats: [Stats; 2], stage: StageId) -> GameState {
    let st = stage.def();
    GameState {
        frame: 0,
        stage,
        fighters: [new_fighter(st, 0, stats[0]), new_fighter(st, 1, stats[1])],
        winner: -1,
    }
}

fn approach(v: f64, target: f64, step: f64) -> f64 {
    if v < target {
        js_min(v + step, target)
    } else {
        js_max(v - step, target)
    }
}

fn dir_x(inp: i32) -> f64 {
    (if inp & RIGHT != 0 { 1. } else { 0. }) - (if inp & LEFT != 0 { 1. } else { 0. })
}

fn set_state(f: &mut Fighter, s: St) {
    f.state = s;
    f.t = 0.;
}

pub fn startup(f: &Fighter, m: &MoveDef) -> f64 {
    js_max(2., m.startup + f.m.startup)
}

fn pick_move(f: &Fighter, inp: i32, heavy: bool) -> Option<MoveId> {
    use MoveId::*;
    let down = inp & DOWN != 0;
    let side = dir_x(inp) != 0.;
    if f.grounded {
        if heavy {
            return Some(if down {
                DHeavy
            } else if side {
                SHeavy
            } else {
                NHeavy
            });
        }
        if down {
            return Some(DownLight);
        }
        if side {
            return Some(SideLight);
        }
        return Some(if f.combo_t > 0. && f.combo == 1. {
            Jab2
        } else if f.combo_t > 0. && f.combo == 2. {
            Jab3
        } else {
            Jab1
        });
    }
    if heavy {
        return if down {
            Some(GroundPound)
        } else if side {
            Some(AirSideHeavy)
        } else if f.recovery_used {
            None
        } else {
            Some(Recovery)
        };
    }
    Some(if down {
        AirDown
    } else if side {
        AirSide
    } else {
        AirNeutral
    })
}

fn start_attack(f: &mut Fighter, id: MoveId, inp: i32) {
    let side = dir_x(inp);
    if side != 0. {
        f.facing = side;
    }
    if id == MoveId::Recovery {
        f.recovery_used = true;
    }
    f.combo = match id {
        MoveId::Jab1 => 1.,
        MoveId::Jab2 => 2.,
        _ => 0.,
    };
    f.combo_t = 0.;
    if f.grounded {
        f.vx *= 0.4;
    }
    f.mv = Some(id);
    f.move_hit = false;
    f.fast_fall = false;
    set_state(f, St::Attack);
}

fn start_dodge(f: &mut Fighter, inp: i32) {
    let dx = dir_x(inp);
    if f.grounded {
        f.vx = dx * 9.;
        f.vy = 0.;
        f.invuln = 15.;
        f.dodge_cd = dodge_cd(f, 50.);
    } else {
        let dy = (if inp & DOWN != 0 { 1. } else { 0. }) - (if inp & UP != 0 { 1. } else { 0. });
        let k = if dx != 0. && dy != 0. { 7.07 } else { 10. };
        f.vx = dx * k;
        f.vy = dy * k;
        f.invuln = 17.;
        f.dodge_cd = dodge_cd(f, 60.);
        f.air_dodged = true;
        f.fast_fall = false;
    }
    set_state(f, St::Dodge);
}

fn on_soft(st: &StageDef, f: &Fighter) -> bool {
    st.soft
        .iter()
        .any(|p| f.y == p.y && f.x >= p.x0 && f.x <= p.x1)
}

fn control(st: &StageDef, f: &mut Fighter, inp: i32, pressed: i32, act: i32) {
    let dx = dir_x(inp);
    if f.grounded && inp & BLOCK != 0 {
        f.vx = approach(f.vx, 0., FRICTION);
        if f.state != St::Block {
            set_state(f, St::Block);
        }
        return;
    }
    if act & DODGE != 0 && f.dodge_cd <= 0. && (f.grounded || !f.air_dodged) {
        f.buf_t = 0.;
        start_dodge(f, inp);
        return;
    }
    if act & (LIGHT | HEAVY) != 0
        && let Some(id) = pick_move(f, inp, act & HEAVY != 0)
    {
        f.buf_t = 0.;
        start_attack(f, id, inp);
        return;
    }
    if act & JUMP != 0 {
        if f.grounded {
            f.buf_t = 0.;
            set_state(f, St::Jumpsquat);
            return;
        }
        if f.air_jumps > 0. {
            f.buf_t = 0.;
            f.air_jumps -= 1.;
            f.vy = -AIR_JUMP_V;
            f.fast_fall = false;
        }
    }
    if f.grounded {
        if pressed & DOWN != 0 && on_soft(st, f) {
            f.drop_t = 12.;
            f.grounded = false;
            f.y += 1.;
            set_state(f, St::Air);
            return;
        }
        if dx != 0. {
            f.facing = dx;
            f.vx = approach(f.vx, dx * f.m.run, GROUND_ACC);
            if f.state != St::Run {
                set_state(f, St::Run);
            }
        } else {
            f.vx = approach(f.vx, 0., FRICTION);
            if f.state != St::Idle {
                set_state(f, St::Idle);
            }
        }
    } else {
        if f.state != St::Air {
            set_state(f, St::Air);
        }
        f.vx = approach(
            f.vx,
            dx * f.m.run * 0.9,
            if dx != 0. { AIR_ACC } else { 0.15 },
        );
        if pressed & DOWN != 0 && f.vy > -2. {
            f.fast_fall = true;
        }
    }
}

fn run_attack(f: &mut Fighter, inp: i32, act: i32) {
    let id = f.mv.unwrap();
    let m = moves::get(id);
    let su = startup(f, m);
    let end = su + m.active;
    if f.t == su {
        if let Some(v) = m.self_vx {
            f.vx = f.facing * v;
        }
        if let Some(v) = m.self_vy {
            f.vy = v;
        }
    }
    if m.until_land {
        if f.t < su {
            f.vy = 0.;
        } else if f.t <= end {
            if f.grounded {
                f.t = end;
            } else {
                f.t = su;
                f.vy = m.self_vy.unwrap();
            }
        }
    }
    let jab = id == MoveId::Jab1 || id == MoveId::Jab2;
    if jab && f.t >= end && act & LIGHT != 0 && dir_x(inp) == 0. && inp & DOWN == 0 && f.grounded {
        f.buf_t = 0.;
        start_attack(
            f,
            if id == MoveId::Jab1 {
                MoveId::Jab2
            } else {
                MoveId::Jab3
            },
            inp,
        );
        return;
    }
    if f.grounded {
        f.vx = approach(
            f.vx,
            0.,
            if f.t >= su && f.t < end {
                0.3
            } else {
                FRICTION
            },
        );
    } else {
        f.vx = approach(f.vx, dir_x(inp) * f.m.run * 0.9, AIR_ACC * 0.5);
    }
    if f.t >= end + m.recovery {
        if jab {
            f.combo_t = 18.;
        }
        f.mv = None;
        set_state(f, if f.grounded { St::Idle } else { St::Air });
    }
}

fn physics(st: &StageDef, f: &mut Fighter) -> bool {
    let m = f.mv.map(moves::get);
    let floaty = f.state == St::Dodge && !f.grounded && f.t < 12.;
    let hover = m.is_some_and(|m| m.until_land && f.state == St::Attack && f.t < startup(f, m));
    if !floaty && !hover {
        let g = if f.state == St::Hitstun { HIT_G } else { G };
        let cap = if f.fast_fall {
            FAST_FALL
        } else if f.state == St::Hitstun {
            40.
        } else {
            MAX_FALL
        };
        f.vy = js_min(
            f.vy + if f.fast_fall { g * 2. } else { g },
            js_max(cap, f.vy),
        );
    }
    let (px, py, was) = (f.x, f.y, f.grounded);
    f.x += f.vx;
    f.y += f.vy;
    f.grounded = false;
    let hw = HURT_W / 2.;
    for mn in st.solids {
        if !(f.x + hw > mn.x0 && f.x - hw < mn.x1 && f.y > mn.y && f.y - HURT_H < mn.y1) {
            continue;
        }
        if py <= mn.y {
            f.y = mn.y;
            f.vy = 0.;
            f.grounded = true;
        } else if py - HURT_H >= mn.y1 {
            f.y = mn.y1 + HURT_H;
            f.vy = 0.;
        } else {
            f.x = if px < (mn.x0 + mn.x1) / 2. {
                mn.x0 - hw
            } else {
                mn.x1 + hw
            };
            f.vx = 0.;
        }
    }
    if !f.grounded && f.vy >= 0. && f.drop_t <= 0. && f.state != St::Hitstun {
        for p in st.soft {
            if f.x >= p.x0 && f.x <= p.x1 && py <= p.y && f.y >= p.y {
                f.y = p.y;
                f.vy = 0.;
                f.grounded = true;
            }
        }
    }
    !was && f.grounded
}

fn respawn(st: &StageDef, f: &mut Fighter, i: usize) {
    let (x, y) = st.spawns[i];
    f.x = x;
    f.y = y - 150.;
    f.vx = 0.;
    f.vy = 0.;
    f.damage = 0.;
    f.invuln = RESPAWN_INVULN;
    f.air_jumps = jumps(f.fx);
    f.wind_used = false;
    f.recovery_used = false;
    f.air_dodged = false;
    f.mv = None;
    f.hitlag = 0.;
    set_state(f, St::Air);
}

fn update(st: &StageDef, f: &mut Fighter, inp: i32, pressed: i32, i: usize) {
    f.t += 1.;
    if f.invuln > 0. {
        f.invuln -= 1.;
    }
    if f.dodge_cd > 0. {
        f.dodge_cd -= 1.;
    }
    if f.drop_t > 0. {
        f.drop_t -= 1.;
    }
    if f.combo_t > 0. {
        f.combo_t -= 1.;
    }
    let act = if f.buf_t > 0. { f.buf } else { 0 };
    if f.buf_t > 0. {
        f.buf_t -= 1.;
    }

    match f.state {
        St::Dead => {
            if f.stocks > 0. && f.t >= RESPAWN {
                respawn(st, f, i);
            }
            return;
        }
        St::Hitstun => {
            f.vx *= if f.grounded { 0.85 } else { 0.975 };
            f.hitstun -= 1.;
            if f.hitstun <= 0. {
                set_state(f, if f.grounded { St::Idle } else { St::Air });
            }
        }
        St::Attack => run_attack(f, inp, act),
        St::Dodge => {
            f.vx *= 0.88;
            if !f.grounded {
                f.vy *= 0.88;
            }
            if f.t >= if f.grounded { 22. } else { 24. } {
                set_state(f, if f.grounded { St::Idle } else { St::Air });
            }
        }
        St::Jumpsquat => {
            if f.t >= JUMPSQUAT {
                f.vy = if inp & JUMP != 0 {
                    -JUMP_V
                } else {
                    -SHORT_HOP_V
                };
                f.grounded = false;
                set_state(f, St::Air);
            }
        }
        St::Land => {
            f.vx = approach(f.vx, 0., FRICTION);
            if f.t >= f.land_lag {
                set_state(f, St::Idle);
            }
        }
        _ => control(st, f, inp, pressed, act),
    }

    if physics(st, f) {
        f.air_jumps = jumps(f.fx);
        f.recovery_used = false;
        f.air_dodged = false;
        f.fast_fall = false;
        if f.state == St::Air {
            set_state(f, St::Idle);
        } else if f.state == St::Attack {
            let m = moves::get(f.mv.unwrap());
            if m.air && !m.until_land {
                f.mv = None;
                f.land_lag = 6.;
                set_state(f, St::Land);
            }
        }
    } else if !f.grounded && matches!(f.state, St::Idle | St::Run | St::Block) {
        set_state(f, St::Air);
    }
}

#[derive(Clone, Copy)]
struct Box2 {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

fn hitbox_of(f: &Fighter) -> Option<Box2> {
    if f.state != St::Attack {
        return None;
    }
    let m = moves::get(f.mv?);
    let su = startup(f, m);
    if f.t < su || f.t >= su + m.active {
        return None;
    }
    Some(Box2 {
        x: if f.facing == 1. {
            f.x + m.hb.x
        } else {
            f.x - m.hb.x - m.hb.w
        },
        y: f.y + m.hb.y,
        w: m.hb.w,
        h: m.hb.h,
    })
}

fn overlap(a: Box2, b: Box2) -> bool {
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

pub fn step(s: &mut GameState, inputs: [i32; 2]) {
    let st = s.stage.def();
    s.frame += 1;
    if s.winner >= 0 {
        return;
    }
    for (i, f) in s.fighters.iter_mut().enumerate() {
        let inp = inputs[i];
        let pressed = inp & !f.prev_in;
        f.prev_in = inp;
        if pressed & ACTIONS != 0 {
            f.buf = pressed & ACTIONS;
            f.buf_t = BUFFER;
        }
        if f.hitlag > 0. {
            f.hitlag -= 1.;
            continue;
        }
        update(st, f, inp, pressed, i);
    }

    // Resolve hits simultaneously so trades are symmetric.
    let mut hits: Vec<(usize, usize, MoveId)> = vec![];
    for (i, a) in s.fighters.iter().enumerate() {
        let Some(hb) = hitbox_of(a) else { continue };
        if a.move_hit {
            continue;
        }
        for (j, b) in s.fighters.iter().enumerate() {
            if i == j || b.state == St::Dead || b.invuln > 0. {
                continue;
            }
            if overlap(
                hb,
                Box2 {
                    x: b.x - HURT_W / 2.,
                    y: b.y - HURT_H,
                    w: HURT_W,
                    h: HURT_H,
                },
            ) {
                hits.push((i, j, a.mv.unwrap()));
            }
        }
    }
    for (i, j, id) in hits {
        let m = moves::get(id);
        let (a_x, a_facing, a_dmg, a_fx) = {
            let a = &s.fighters[i];
            (a.x, a.facing, a.m.dmg, a.fx)
        };
        let dmg = js_round(m.dmg * a_dmg);
        let lag = 3. + (dmg / 4.).floor();
        let a = &mut s.fighters[i];
        a.hitlag = lag;
        a.move_hit = true;
        let b = &mut s.fighters[j];
        b.hitlag = lag;
        let sx = if m.away {
            if b.x >= a_x { 1. } else { -1. }
        } else {
            a_facing
        };
        // only blocks hits from the front
        if b.state == St::Block && (a_x - b.x) * b.facing >= 0. {
            b.damage += (dmg / BLOCK_CHIP).floor();
            let kb = (m.base + b.damage * m.growth) * b.m.kb_taken;
            b.vx = sx * kb * BLOCK_PUSH;
            continue;
        }
        b.damage += dmg;
        if a_fx & fx::LIFESTEAL != 0 {
            let heal = (dmg / 5.).floor();
            let a = &mut s.fighters[i];
            a.damage = js_max(0., a.damage - heal);
        }
        let b = &mut s.fighters[j];
        let kb = (m.base + b.damage * m.growth) * b.m.kb_taken;
        b.vx = sx * m.ax * kb;
        b.vy = m.ay * kb;
        if b.vy > 0. && b.grounded {
            b.vy = -b.vy * 0.6;
        }
        b.grounded = false;
        b.facing = -sx;
        b.mv = None;
        b.fast_fall = false;
        b.recovery_used = false;
        b.hitstun = (kb * 0.9).floor() + 8.;
        set_state(b, St::Hitstun);
    }

    for f in s.fighters.iter_mut() {
        if f.fx & fx::SECOND_WIND != 0
            && !f.wind_used
            && f.state != St::Dead
            && f.damage >= MAX_HP - 50.
        {
            f.damage -= 30.;
            f.wind_used = true;
        }
    }
    let bz = &st.blast;
    for f in s.fighters.iter_mut() {
        let in_bounds = f.x > bz.x0 && f.x < bz.x1 && f.y > bz.y0 && f.y < bz.y1;
        if f.state == St::Dead || (in_bounds && f.damage < MAX_HP) {
            continue;
        }
        f.stocks -= 1.;
        f.mv = None;
        f.vx = 0.;
        f.vy = 0.;
        f.hitlag = 0.;
        set_state(f, St::Dead);
    }
    let alive: Vec<usize> = (0..2).filter(|&i| s.fighters[i].stocks > 0.).collect();
    if alive.len() <= 1 {
        s.winner = alive.first().map_or(0, |&i| i as i32);
    }
}
