// node games/eggmerger/build/smoke.mjs : scripted run, determinism (replay x2), merges happen, overflow ends the run.
import assert from 'node:assert/strict';
import { create, drop, step, replay, rng, canDrop, pieces, R, W, WALL } from './sim.js';

const SEED = 1234567;
const r = rng(99); // tape script RNG (not the game's)
const s = create(SEED), tape = [];
while (!s.over) {
  if (tape.length < 300 && canDrop(s) && s.tick % 40 === 0) tape.push(drop(s, R[s.cur] + r() * (W - 2 * R[s.cur])));
  step(s);
}
const live = { score: s.score, elders: s.elders };
const a = replay(SEED, tape), b = replay(SEED, JSON.parse(JSON.stringify(tape)));
console.log({ drops: tape.length, ticks: s.tick, reason: s.reason, live, a, b });
assert.deepEqual(a, live, 'replay matches live');
assert.deepEqual(b, a, 'replay x2 identical');
assert.ok(s.score > 0, 'at least one merge');
assert.equal(s.reason, 'overflow', 'overflow ends the run');
assert.notDeepEqual(replay(SEED + 1, tape), a, 'seed matters');

// drop rules: cooldown + clamp
const t = create(1);
const cur = t.cur;
assert.equal(drop(t, -500).x, WALL + R[cur], 'x clamped');
step(t);
assert.equal(drop(t, 200), null, 'cooldown refuses');
// elder pop: two touching T9 → elders++, score += 2^9, no piece left
const e = create(2);
for (const x of [WALL + R[9], WALL + 3 * R[9] - 4]) Object.assign(globalThis.Matter.Composite.add(e.engine.world, globalThis.Matter.Bodies.circle(x, 600 - R[9], R[9])).bodies.at(-1), { tier: 9, above: 0 });
let ev = [];
for (let i = 0; i < 30 && !e.elders; i++) ev = step(e).events;
assert.equal(e.elders, 1, 'elder popped');
assert.equal(e.score, 512);
assert.ok(ev.some((v) => v.type === 'elder') && !pieces(e).length, 'elder event, no piece spawned');
console.log('smoke ok');
