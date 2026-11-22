// Deterministic fixed-step (60 Hz) platform-fighter simulation. No DOM, no RNG, no trig, no clock:
// same inputs -> same state on every machine (required for lockstep netplay).
import { MOVES, type MoveDef, type MoveId } from './moves.ts';
import { STAGES, type StageDef, type StageId } from '../stages.ts';
export { STAGES, type StageId };

export const IN = { LEFT: 1, RIGHT: 2, UP: 4, DOWN: 8, JUMP: 16, LIGHT: 32, HEAVY: 64, DODGE: 128, BLOCK: 256 } as const;
const ACTIONS = IN.JUMP | IN.LIGHT | IN.HEAVY | IN.DODGE;

// Monster stats, 3..9 each, sum 22. This is the hook for NFT genes.
export interface Stats { str: number; dex: number; def: number; spd: number; fx?: number }
// Effect skill bits (Stats.fx / Fighter.fx).
export const FX = { AIR_JUMP: 1, LIFESTEAL: 2, QUICK_DODGE: 4, SECOND_WIND: 8 } as const;
export const DEFAULT_STATS: Stats = { str: 6, dex: 5, def: 5, spd: 6 };

export type St = 'idle' | 'run' | 'jumpsquat' | 'air' | 'land' | 'dodge' | 'attack' | 'hitstun' | 'dead' | 'block';

export interface Fighter {
  x: number; y: number; vx: number; vy: number;
  facing: 1 | -1;
  state: St; t: number; // frames in state
  grounded: boolean;
  airJumps: number; recoveryUsed: boolean; airDodged: boolean; fastFall: boolean;
  move: MoveId | null; moveHit: boolean; combo: number; comboT: number;
  damage: number; stocks: number;
  hitstun: number; hitlag: number; invuln: number; dodgeCd: number; landLag: number; dropT: number;
  prevIn: number; buf: number; bufT: number;
  mod: { dmg: number; kbTaken: number; startup: number; run: number };
  fx: number; windUsed: boolean;
}

export interface SimEvent { kind: 'hit' | 'ko' | 'jump' | 'land'; who: number; x: number; y: number; power: number }
export interface GameState { frame: number; stage: StageId; fighters: Fighter[]; winner: number; events: SimEvent[] }

// Geometry of the stage being simulated. Set from GameState at the top of step()/newGame(), so every
// helper below reads it without threading the state through. ponytail: module-level, fine while one sim runs per tick.
let ST: StageDef = STAGES.ember;

export const HURT_W = 50, HURT_H = 90;
const G = 0.85, HIT_G = 0.55, MAX_FALL = 13, FAST_FALL = 19;
const GROUND_ACC = 1.2, FRICTION = 0.8, AIR_ACC = 0.6;
const JUMP_V = 16.5, SHORT_HOP_V = 11, AIR_JUMP_V = 14.5, JUMPSQUAT = 3;
const BLOCK_CHIP = 5, BLOCK_PUSH = 0.25; // blocked hit: damage / 5, knockback x 0.25, horizontal only
const BUFFER = 6, RESPAWN = 90, RESPAWN_INVULN = 120, STOCKS = 3;
export const MAX_HP = 200; // damage >= MAX_HP also costs a stock (besides ring-outs)

export function statMods(s: Stats) {
  return {
    dmg: 0.85 + 0.05 * (s.str - 3),
    kbTaken: 1.12 - 0.04 * (s.def - 3),
    startup: Math.floor((5 - s.dex) / 2),
    run: 4.5 + 0.35 * s.spd,
  };
}

const jumps = (fx: number) => (fx & FX.AIR_JUMP ? 3 : 2);
const dodgeCd = (f: Fighter, n: number) => (f.fx & FX.QUICK_DODGE ? n - Math.floor(n / 3) : n);

function newFighter(i: number, stats: Stats): Fighter {
  const sp = ST.spawns[i], fx = stats.fx ?? 0;
  return {
    x: sp.x, y: sp.y, vx: 0, vy: 0, facing: i === 0 ? 1 : -1,
    state: 'air', t: 0, grounded: false,
    airJumps: jumps(fx), recoveryUsed: false, airDodged: false, fastFall: false,
    move: null, moveHit: false, combo: 0, comboT: 0,
    damage: 0, stocks: STOCKS,
    hitstun: 0, hitlag: 0, invuln: 0, dodgeCd: 0, landLag: 0, dropT: 0,
    prevIn: 0, buf: 0, bufT: 0,
    mod: statMods(stats),
    fx, windUsed: false,
  };
}

export function newGame(stats: Stats[] = [DEFAULT_STATS, DEFAULT_STATS], stage: StageId = 'ember'): GameState {
  ST = STAGES[stage];
  return { frame: 0, stage, fighters: stats.map((s, i) => newFighter(i, s)), winner: -1, events: [] };
}

const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

const dirX = (inp: number) => (inp & IN.RIGHT ? 1 : 0) - (inp & IN.LEFT ? 1 : 0);

function setState(f: Fighter, s: St) { f.state = s; f.t = 0; }

export function startup(f: Fighter, m: MoveDef) { return Math.max(2, m.startup + f.mod.startup); }

function pickMove(f: Fighter, inp: number, heavy: boolean): MoveId | null {
  const down = inp & IN.DOWN, side = dirX(inp);
  if (f.grounded) {
    if (heavy) return down ? 'dHeavy' : side ? 'sHeavy' : 'nHeavy';
    if (down) return 'downLight';
    if (side) return 'sideLight';
    return f.comboT > 0 && f.combo === 1 ? 'jab2' : f.comboT > 0 && f.combo === 2 ? 'jab3' : 'jab1';
  }
  if (heavy) return down ? 'groundPound' : side ? 'airSideHeavy' : f.recoveryUsed ? null : 'recovery';
  return down ? 'airDown' : side ? 'airSide' : 'airNeutral';
}

function startAttack(f: Fighter, id: MoveId, inp: number) {
  const side = dirX(inp);
  if (side) f.facing = side as 1 | -1;
  if (id === 'recovery') f.recoveryUsed = true;
  f.combo = id === 'jab1' ? 1 : id === 'jab2' ? 2 : 0;
  f.comboT = 0;
  if (f.grounded) f.vx *= 0.4;
  f.move = id; f.moveHit = false; f.fastFall = false;
  setState(f, 'attack');
}

function startDodge(f: Fighter, inp: number) {
  const dx = dirX(inp);
  if (f.grounded) {
    f.vx = dx * 9; f.vy = 0;
    f.invuln = 15; f.dodgeCd = dodgeCd(f, 50);
  } else {
    const dy = (inp & IN.DOWN ? 1 : 0) - (inp & IN.UP ? 1 : 0);
    const k = dx && dy ? 7.07 : 10; // 10 / sqrt(2) on diagonals
    f.vx = dx * k; f.vy = dy * k;
    f.invuln = 17; f.dodgeCd = dodgeCd(f, 60); f.airDodged = true; f.fastFall = false;
  }
  setState(f, 'dodge');
}

// Idle / run / air: full control.
function control(f: Fighter, inp: number, pressed: number, act: number) {
  const dx = dirX(inp);
  if (f.grounded && inp & IN.BLOCK) {
    f.vx = approach(f.vx, 0, FRICTION);
    if (f.state !== 'block') setState(f, 'block');
    return;
  }
  if (act & IN.DODGE && f.dodgeCd <= 0 && (f.grounded || !f.airDodged)) { f.bufT = 0; startDodge(f, inp); return; }
  if (act & (IN.LIGHT | IN.HEAVY)) {
    const id = pickMove(f, inp, !!(act & IN.HEAVY));
    if (id) { f.bufT = 0; startAttack(f, id, inp); return; }
  }
  if (act & IN.JUMP) {
    if (f.grounded) { f.bufT = 0; setState(f, 'jumpsquat'); return; }
    if (f.airJumps > 0) { f.bufT = 0; f.airJumps--; f.vy = -AIR_JUMP_V; f.fastFall = false; }
  }
  if (f.grounded) {
    if (pressed & IN.DOWN && onSoft(f)) { f.dropT = 12; f.grounded = false; f.y += 1; setState(f, 'air'); return; }
    if (dx) { f.facing = dx as 1 | -1; f.vx = approach(f.vx, dx * f.mod.run, GROUND_ACC); if (f.state !== 'run') setState(f, 'run'); }
    else { f.vx = approach(f.vx, 0, FRICTION); if (f.state !== 'idle') setState(f, 'idle'); }
  } else {
    if (f.state !== 'air') setState(f, 'air');
    f.vx = approach(f.vx, dx * f.mod.run * 0.9, dx ? AIR_ACC : 0.15);
    if (pressed & IN.DOWN && f.vy > -2) f.fastFall = true;
  }
}

function runAttack(f: Fighter, inp: number, act: number) {
  const m: MoveDef = MOVES[f.move!];
  const su = startup(f, m), end = su + m.active;
  if (f.t === su) {
    if (m.selfVx !== undefined) f.vx = f.facing * m.selfVx;
    if (m.selfVy !== undefined) f.vy = m.selfVy;
  }
  if (m.untilLand) {
    if (f.t < su) f.vy = 0; // hover during wind-up
    else if (f.t <= end) {
      if (f.grounded) f.t = end; // impact -> recovery
      else { f.t = su; f.vy = m.selfVy!; } // hold active frame until landing
    }
  }
  // Light combo: jab1 -> jab2 -> jab3, cancel in recovery.
  if ((f.move === 'jab1' || f.move === 'jab2') && f.t >= end && act & IN.LIGHT && !dirX(inp) && !(inp & IN.DOWN) && f.grounded) {
    f.bufT = 0; startAttack(f, f.move === 'jab1' ? 'jab2' : 'jab3', inp); return;
  }
  if (f.grounded) f.vx = approach(f.vx, 0, f.t >= su && f.t < end ? 0.3 : FRICTION);
  else f.vx = approach(f.vx, dirX(inp) * f.mod.run * 0.9, AIR_ACC * 0.5);
  if (f.t >= end + m.recovery) {
    if (f.move === 'jab1' || f.move === 'jab2') f.comboT = 18;
    f.move = null; setState(f, f.grounded ? 'idle' : 'air');
  }
}

function onSoft(f: Fighter) {
  return ST.soft.some((p) => f.y === p.y && f.x >= p.x0 && f.x <= p.x1);
}

function physics(f: Fighter) {
  const m = f.move ? MOVES[f.move] : null;
  const floaty = f.state === 'dodge' && !f.grounded && f.t < 12;
  const hover = m?.untilLand && f.state === 'attack' && f.t < startup(f, m);
  if (!floaty && !hover) {
    const g = f.state === 'hitstun' ? HIT_G : G;
    const cap = f.fastFall ? FAST_FALL : f.state === 'hitstun' ? 40 : MAX_FALL;
    f.vy = Math.min(f.vy + (f.fastFall ? g * 2 : g), Math.max(cap, f.vy));
  }
  const px = f.x, py = f.y, wasGrounded = f.grounded;
  f.x += f.vx; f.y += f.vy;
  f.grounded = false;
  const hw = HURT_W / 2;
  for (const mn of ST.solids) {
    if (!(f.x + hw > mn.x0 && f.x - hw < mn.x1 && f.y > mn.y && f.y - HURT_H < mn.y1)) continue;
    if (py <= mn.y) { f.y = mn.y; f.vy = 0; f.grounded = true; }
    else if (py - HURT_H >= mn.y1) { f.y = mn.y1 + HURT_H; f.vy = 0; }
    else { f.x = px < (mn.x0 + mn.x1) / 2 ? mn.x0 - hw : mn.x1 + hw; f.vx = 0; }
  }
  if (!f.grounded && f.vy >= 0 && f.dropT <= 0 && f.state !== 'hitstun') {
    for (const p of ST.soft) {
      if (f.x >= p.x0 && f.x <= p.x1 && py <= p.y && f.y >= p.y) { f.y = p.y; f.vy = 0; f.grounded = true; }
    }
  }
  return !wasGrounded && f.grounded;
}

function update(f: Fighter, inp: number, pressed: number, s: GameState, i: number) {
  f.t++;
  if (f.invuln > 0) f.invuln--;
  if (f.dodgeCd > 0) f.dodgeCd--;
  if (f.dropT > 0) f.dropT--;
  if (f.comboT > 0) f.comboT--;
  const act = f.bufT > 0 ? f.buf : 0;
  if (f.bufT > 0) f.bufT--;

  switch (f.state) {
    case 'dead':
      if (f.stocks > 0 && f.t >= RESPAWN) respawn(f, i);
      return;
    case 'hitstun':
      f.vx *= f.grounded ? 0.85 : 0.975;
      if (--f.hitstun <= 0) setState(f, f.grounded ? 'idle' : 'air');
      break;
    case 'attack': runAttack(f, inp, act); break;
    case 'dodge':
      f.vx *= 0.88; if (!f.grounded) f.vy *= 0.88;
      if (f.t >= (f.grounded ? 22 : 24)) setState(f, f.grounded ? 'idle' : 'air');
      break;
    case 'jumpsquat':
      if (f.t >= JUMPSQUAT) {
        f.vy = inp & IN.JUMP ? -JUMP_V : -SHORT_HOP_V;
        f.grounded = false; setState(f, 'air');
        s.events.push({ kind: 'jump', who: i, x: f.x, y: f.y, power: 0 });
      }
      break;
    case 'land':
      f.vx = approach(f.vx, 0, FRICTION);
      if (f.t >= f.landLag) setState(f, 'idle');
      break;
    default: control(f, inp, pressed, act);
  }

  const landed = physics(f);
  if (landed) {
    f.airJumps = jumps(f.fx); f.recoveryUsed = false; f.airDodged = false; f.fastFall = false;
    s.events.push({ kind: 'land', who: i, x: f.x, y: f.y, power: f.vy });
    if (f.state === 'air') setState(f, 'idle');
    else if (f.state === 'attack' && MOVES[f.move!].air && !MOVES[f.move!].untilLand) { f.move = null; f.landLag = 6; setState(f, 'land'); }
  } else if (!f.grounded && (f.state === 'idle' || f.state === 'run' || f.state === 'block')) setState(f, 'air');
}

export function hitboxOf(f: Fighter) {
  if (f.state !== 'attack' || !f.move) return null;
  const m: MoveDef = MOVES[f.move];
  const su = startup(f, m);
  if (f.t < su || f.t >= su + m.active) return null;
  return { x: f.facing === 1 ? f.x + m.hb.x : f.x - m.hb.x - m.hb.w, y: f.y + m.hb.y, w: m.hb.w, h: m.hb.h };
}

const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function respawn(f: Fighter, i: number) {
  const sp = ST.spawns[i];
  Object.assign(f, { x: sp.x, y: sp.y - 150, vx: 0, vy: 0, damage: 0, invuln: RESPAWN_INVULN, airJumps: jumps(f.fx), recoveryUsed: false, airDodged: false, move: null, hitlag: 0, windUsed: false });
  setState(f, 'air');
}

export function step(s: GameState, inputs: number[]) {
  ST = STAGES[s.stage];
  s.events.length = 0;
  s.frame++;
  if (s.winner >= 0) return;
  const fs = s.fighters;

  fs.forEach((f, i) => {
    const inp = inputs[i] | 0;
    const pressed = inp & ~f.prevIn;
    f.prevIn = inp;
    if (pressed & ACTIONS) { f.buf = pressed & ACTIONS; f.bufT = BUFFER; }
    if (f.hitlag > 0) { f.hitlag--; return; }
    update(f, inp, pressed, s, i);
  });

  // Resolve hits simultaneously so trades are symmetric.
  const hits: [number, number, MoveId][] = [];
  fs.forEach((a, i) => {
    const hb = hitboxOf(a);
    if (!hb || a.moveHit) return;
    fs.forEach((b, j) => {
      if (i === j || b.state === 'dead' || b.invuln > 0) return;
      if (overlap(hb, { x: b.x - HURT_W / 2, y: b.y - HURT_H, w: HURT_W, h: HURT_H })) hits.push([i, j, a.move!]);
    });
  });
  for (const [i, j, id] of hits) {
    const a = fs[i], b = fs[j], m: MoveDef = MOVES[id];
    const dmg = Math.round(m.dmg * a.mod.dmg);
    const sx = m.away ? (b.x >= a.x ? 1 : -1) : a.facing;
    const lag = 3 + Math.floor(dmg / 4);
    a.hitlag = lag; b.hitlag = lag; a.moveHit = true;
    if (b.state === 'block' && (a.x - b.x) * b.facing >= 0) { // only blocks hits from the front
      b.damage += Math.floor(dmg / BLOCK_CHIP);
      const kb = (m.base + b.damage * m.growth) * b.mod.kbTaken;
      b.vx = sx * kb * BLOCK_PUSH;
      s.events.push({ kind: 'hit', who: j, x: (a.x + b.x) / 2, y: b.y - HURT_H / 2, power: kb * BLOCK_PUSH });
      continue;
    }
    b.damage += dmg;
    if (a.fx & FX.LIFESTEAL) a.damage = Math.max(0, a.damage - Math.floor(dmg / 5));
    const kb = (m.base + b.damage * m.growth) * b.mod.kbTaken;
    b.vx = sx * m.ax * kb; b.vy = m.ay * kb;
    if (b.vy > 0 && b.grounded) b.vy = -b.vy * 0.6; // spike into floor bounces
    b.grounded = false; b.facing = -sx as 1 | -1;
    b.move = null; b.fastFall = false; b.recoveryUsed = false; // getting hit restores recovery
    b.hitstun = Math.floor(kb * 0.9) + 8;
    setState(b, 'hitstun');
    s.events.push({ kind: 'hit', who: j, x: (a.x + b.x) / 2, y: b.y - HURT_H / 2, power: kb });
  }

  for (const f of fs) {
    if (f.fx & FX.SECOND_WIND && !f.windUsed && f.state !== 'dead' && f.damage >= MAX_HP - 50) { f.damage -= 30; f.windUsed = true; }
  }
  const bz = ST.blast;
  fs.forEach((f, i) => {
    const inBounds = f.x > bz.x0 && f.x < bz.x1 && f.y > bz.y0 && f.y < bz.y1;
    if (f.state === 'dead' || (inBounds && f.damage < MAX_HP)) return;
    s.events.push({ kind: 'ko', who: i, x: f.x, y: f.y, power: 0 });
    f.stocks--; f.move = null; f.vx = f.vy = 0; f.hitlag = 0;
    setState(f, 'dead');
  });
  const alive = fs.filter((f) => f.stocks > 0);
  if (alive.length <= 1) s.winner = alive.length ? fs.indexOf(alive[0]) : 0;
}

// FNV-1a over fighter state: cheap desync check for netplay + determinism tests.
export function hash(s: GameState) {
  const str = JSON.stringify(s.fighters);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
