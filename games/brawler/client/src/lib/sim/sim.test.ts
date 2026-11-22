import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, hash, IN, FX, STAGES, MAX_HP, DEFAULT_STATS, type GameState } from './sim.ts';
import { STAGE_IDS } from '../stages.ts';

const STAGE = { main: STAGES.ember.solids[0], blast: STAGES.ember.blast };

const run = (s: GameState, n: number, inputs: () => number[]) => { for (let i = 0; i < n; i++) step(s, inputs()); };

// Two grounded fighters standing close, facing each other.
function faceOff(gap = 60) {
  const s = newGame();
  run(s, 60, () => [0, 0]); // fall onto soft platforms
  const [a, b] = s.fighters;
  Object.assign(a, { x: 800 - gap / 2, y: STAGE.main.y, facing: 1 });
  Object.assign(b, { x: 800 + gap / 2, y: STAGE.main.y, facing: -1 });
  run(s, 2, () => [0, 0]);
  return s;
}

for (const id of STAGE_IDS) test(`deterministic on ${id}: same input script -> same hash`, () => {
  const play = () => {
    const s = newGame(undefined, id);
    let seed = 42;
    const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) & 255;
    for (let f = 0; f < 3000; f++) step(s, [rnd(), rnd()]);
    return s;
  };
  const a = play(), b = play();
  assert.equal(hash(a), hash(b));
  assert.notEqual(hash(a), hash(newGame()));
});

test('jab lands, damages, hitstuns', () => {
  const s = faceOff();
  step(s, [IN.LIGHT, 0]);
  run(s, 12, () => [0, 0]);
  const b = s.fighters[1];
  assert.ok(b.damage > 0, 'damage dealt');
  assert.ok(b.state === 'hitstun' || b.hitlag > 0);
});

test('block: front hits chip, back hits land in full', () => {
  const hitWith = (blockerFacing: 1 | -1) => {
    const s = faceOff();
    s.fighters[1].facing = blockerFacing;
    run(s, 2, () => [0, IN.BLOCK]);
    assert.equal(s.fighters[1].state, 'block');
    step(s, [IN.HEAVY | IN.RIGHT, IN.BLOCK]);
    run(s, 30, () => [0, IN.BLOCK]);
    return s.fighters[1];
  };
  const front = hitWith(-1), back = hitWith(1);
  assert.ok(front.damage > 0 && back.damage >= 4 * front.damage, `front=${front.damage} back=${back.damage}`);
  assert.equal(front.state, 'block');
  assert.notEqual(back.state, 'block');
});

test('knockback grows with damage', () => {
  const launch = (pct: number) => {
    const s = faceOff(80);
    s.fighters[1].damage = pct;
    step(s, [IN.HEAVY | IN.RIGHT, 0]);
    let vx = 0;
    for (let i = 0; i < 40 && !vx; i++) { step(s, [0, 0]); if (s.fighters[1].state === 'hitstun') vx = s.fighters[1].vx; }
    return vx;
  };
  const low = launch(0), high = launch(120);
  assert.ok(low > 0 && high > low * 2, `low=${low} high=${high}`);
});

test('dodge i-frames avoid the hit', () => {
  const s = faceOff();
  step(s, [0, IN.DODGE]);
  step(s, [IN.LIGHT, 0]);
  run(s, 10, () => [0, 0]);
  assert.equal(s.fighters[1].damage, 0);
});

test('leaving blast zone costs a stock, then respawn', () => {
  const s = faceOff();
  s.fighters[1].x = STAGE.blast.x1 + 10;
  step(s, [0, 0]);
  assert.equal(s.fighters[1].stocks, 2);
  assert.equal(s.fighters[1].state, 'dead');
  run(s, 100, () => [0, 0]);
  assert.notEqual(s.fighters[1].state, 'dead');
  assert.equal(s.fighters[1].damage, 0);
});

test('last stock lost -> winner', () => {
  const s = faceOff();
  s.fighters[0].stocks = 1;
  s.fighters[0].y = STAGE.blast.y1 + 10;
  step(s, [0, 0]);
  assert.equal(s.winner, 1);
});

test('ground pound holds until landing', () => {
  const s = faceOff();
  const a = s.fighters[0];
  Object.assign(a, { x: 800, y: 100, grounded: false, state: 'air' }); // above the gap between soft platforms
  step(s, [IN.HEAVY | IN.DOWN, 0]);
  run(s, 15, () => [0, 0]);
  assert.equal(a.state, 'attack');
  assert.ok(a.vy > 15, 'falling fast');
  run(s, 60, () => [0, 0]);
  assert.equal(a.grounded, true);
  assert.notEqual(a.move, 'groundPound');
});

test('health depleted -> stock lost', () => {
  const s = faceOff();
  s.fighters[1].damage = MAX_HP - 1;
  step(s, [IN.LIGHT, 0]);
  run(s, 12, () => [0, 0]);
  assert.equal(s.fighters[1].stocks, 2);
});

for (const id of STAGE_IDS) test(`${id}: both fighters land from spawn within 120 frames`, () => {
  const s = newGame(undefined, id);
  const landed = [false, false];
  for (let f = 0; f < 120; f++) { step(s, [0, 0]); s.fighters.forEach((x, i) => { if (x.grounded) landed[i] = true; }); }
  assert.deepEqual(landed, [true, true]);
  assert.equal(s.fighters[0].x, 1600 - s.fighters[1].x, 'mirror-symmetric spawns');
});

for (const id of STAGE_IDS) test(`${id}: layout is mirror-symmetric around x=800`, () => {
  const st = STAGES[id];
  const key = (r: { x0: number; x1: number; y: number }) => `${r.x0},${r.x1},${r.y}`;
  const mirror = (r: { x0: number; x1: number; y: number }) => key({ x0: 1600 - r.x1, x1: 1600 - r.x0, y: r.y });
  for (const list of [st.solids, st.soft] as { x0: number; x1: number; y: number }[][]) {
    const keys = new Set(list.map(key));
    for (const r of list) assert.ok(keys.has(mirror(r)), `${key(r)} has no mirror`);
  }
});

test('AirJump skill: 3 air jumps instead of 2', () => {
  for (const [fx, n] of [[0, 2], [FX.AIR_JUMP, 3]]) {
    const s = newGame([{ ...DEFAULT_STATS, fx }, DEFAULT_STATS]);
    s.fighters[0].y -= 300;
    let jumps = 0;
    for (let i = 0; i < 10; i++) { const left = s.fighters[0].airJumps; step(s, [i % 2 ? 0 : IN.JUMP, 0]); if (s.fighters[0].airJumps < left && s.fighters[0].vy < 0) jumps++; }
    assert.equal(jumps, n);
  }
});

test('Lifesteal heals floor(dealt / 5), never below 0', () => {
  for (const start of [10, 0]) {
    const s = faceOff(), a = s.fighters[0];
    Object.assign(a, { fx: FX.LIFESTEAL, damage: start });
    step(s, [IN.LIGHT, 0]);
    run(s, 12, () => [0, 0]);
    assert.ok(s.fighters[1].damage >= 5);
    assert.equal(a.damage, Math.max(0, start - Math.floor(s.fighters[1].damage / 5)));
  }
});

test('QuickDodge cuts dodge cooldown by a third', () => {
  const s = faceOff();
  s.fighters[0].fx = FX.QUICK_DODGE;
  step(s, [IN.DODGE, IN.DODGE]);
  assert.deepEqual(s.fighters.map((f) => f.dodgeCd), [34, 50]);
});

test('SecondWind heals 30 once per stock at HP <= 50', () => {
  const s = faceOff(), b = s.fighters[1];
  Object.assign(b, { fx: FX.SECOND_WIND, damage: MAX_HP - 51 });
  step(s, [IN.LIGHT, 0]);
  run(s, 12, () => [0, 0]);
  assert.ok(b.windUsed);
  const dealt = b.damage + 30 - (MAX_HP - 51);
  assert.ok(dealt > 0);
  const t = faceOff();
  Object.assign(t.fighters[1], { fx: FX.SECOND_WIND, damage: MAX_HP - 51, windUsed: true });
  step(t, [IN.LIGHT, 0]);
  run(t, 12, () => [0, 0]);
  assert.equal(t.fighters[1].damage, MAX_HP - 51 + dealt, 'no second heal this stock');
});
