// node games/monster-siege/build/smoke.mjs : archetypes, drop rules, mirror symmetry, determinism, bot-vs-bot end.
import assert from 'node:assert/strict';
import { newMatch, step, archetypeOf, demoLoadout, demoMonster, scoreOf, MATCH_T, OT_T } from './sim.js?v=2';
import { makeBot } from './bot.js?v=2';
import { PATH, CORE, HEXES, BLOCKED, key, mirror, center, dropKind } from './map.js?v=1';

// archetype: highest stat, ties str > dex > spd > def
const A = (str, dex, def, spd) => archetypeOf({ str, dex, def, spd });
assert.equal(A(9, 5, 4, 4), 'cannon');
assert.equal(A(4, 9, 4, 5), 'rapid');
assert.equal(A(4, 5, 4, 9), 'sniper');
assert.equal(A(4, 5, 9, 4), 'bulwark');
assert.equal(A(7, 7, 4, 4), 'cannon'); // str > dex
assert.equal(A(3, 7, 5, 7), 'rapid'); // dex > spd
assert.equal(A(3, 5, 7, 7), 'sniper'); // spd > def

// ---- drop rules: a fresh match with full energy and a known hand ----
const LO = { deck: [0, 1, 2, 3, 4, 5, 6].map((i) => demoMonster(1 + i)).concat([null]) }; // card 7 = Grunt
function fresh() {
  const s = newMatch(5, [LO, LO]);
  for (const p of s.P) { p.e = 600; p.hand = [0, 1, 2, 7]; p.q = [3, 4, 5, 6]; }
  return s;
}
const ground0 = HEXES.filter((h) => dropKind(0, ...h) === 'defend');
const g = ground0[0], enemyGround = mirror(g), blocked = HEXES.find((h) => BLOCKED.has(key(...h)));
{
  let s = step(fresh(), [{ seat: 0, card: 0, x2: PATH[12][0], y: PATH[12][1] }]); // mid-path drop -> attack from own core
  const [cx] = center(...CORE[0]);
  assert.equal(s.units.length, 4, 'squad of leader + 3');
  assert.ok(s.units.every((u) => u.seat === 0 && u.x > cx - 2500), 'squad spawns at own core, not at the drop hex');
  assert.equal(s.P[0].e, 600 - s.P[0].cards[0].cost * 60 + 1);
  s = step(fresh(), [{ seat: 0, card: 1, x2: g[0], y: g[1] }]);
  assert.equal(s.P[0].defs.length, 1, 'own ground -> defender');
  assert.deepEqual([s.P[0].defs[0].hx, s.P[0].defs[0].hy], g);
  assert.equal(s.units.length, 0);
  const rejected = (st, inp) => {
    const s1 = step(st, [inp]);
    assert.equal(s1.P[inp.seat].e, Math.min(600, st.P[inp.seat].e + 1), `no energy spent ${JSON.stringify(inp)}`);
    assert.deepEqual(s1.P[inp.seat].hand, st.P[inp.seat].hand, 'card stays in hand');
    assert.equal(s1.units.length + s1.P[inp.seat].defs.length, st.units.length + st.P[inp.seat].defs.length);
  };
  rejected(fresh(), { seat: 0, card: 0, x2: enemyGround[0], y: enemyGround[1] }); // enemy-zone ground
  rejected(fresh(), { seat: 0, card: 0, x2: 18, y: 3 }); // neutral ground
  rejected(fresh(), { seat: 0, card: 0, x2: blocked[0], y: blocked[1] }); // blocked
  rejected(fresh(), { seat: 0, card: 0, x2: CORE[0][0], y: CORE[0][1] }); // core
  rejected(fresh(), { seat: 0, card: 7, x2: g[0], y: g[1] }); // grunt on ground
  const occ = step(fresh(), [{ seat: 0, card: 1, x2: g[0], y: g[1] }]);
  rejected(occ, { seat: 0, card: 0, x2: g[0], y: g[1] }); // occupied
  assert.equal(step(fresh(), [{ seat: 0, card: 7, x2: PATH[3][0], y: PATH[3][1] }]).units.length, 3, 'grunt on path -> 3 grunts');
}

// ---- mirror symmetry: seat 0 attacks into seat 1's defenders, vs the same tape mirrored with seats swapped ----
{
  const near = HEXES.filter((h) => dropKind(1, ...h) === 'defend' && PATH.some((p) => Math.abs(p[0] - h[0]) + Math.abs(p[1] - h[1]) <= 2));
  const tape = [
    { tick: 0, seat: 1, card: 1, x2: near[0][0], y: near[0][1] }, { tick: 0, seat: 1, card: 2, x2: near[3][0], y: near[3][1] },
    { tick: 30, seat: 0, card: 0, x2: PATH[5][0], y: PATH[5][1] }, { tick: 200, seat: 0, card: 7, x2: PATH[2][0], y: PATH[2][1] },
    { tick: 400, seat: 0, card: 3, x2: PATH[9][0], y: PATH[9][1] }, { tick: 900, seat: 0, card: 4, x2: PATH[1][0], y: PATH[1][1] },
  ];
  const flip = (i) => { const [x2, y] = mirror([i.x2, i.y]); return { ...i, seat: 1 - i.seat, x2, y }; };
  const run = (tp) => { let s = fresh(); while (s.t < 1500 && !s.over) s = step(s, tp.filter((i) => i.tick === s.t).map(({ tick, ...i }) => i)); return s; };
  const a = run(tape), b = run(tape.map(flip));
  const side = (p) => [p.core, p.e, p.kills, p.hand, p.defs.map((d) => [d.hp, d.id])];
  const W = 21000, H = 9660;
  assert.ok(a.P[1].core < 3000 || a.P[0].kills > 0, 'mirror scenario does something');
  assert.deepEqual(side(a.P[0]), side(b.P[1]));
  assert.deepEqual(side(a.P[1]), side(b.P[0]));
  assert.deepEqual(a.units.map((u) => [u.id, u.hp, u.x, u.y]), b.units.map((u) => [u.id, u.hp, W - u.x, H - u.y]));
  console.log(`mirror ok: cores ${a.P[0].core}/${a.P[1].core}, defs ${a.P[1].defs.length}, kills ${a.P[0].kills}`);
}

// ---- bots + determinism ----
function botMatch(seed, a, b) {
  let s = newMatch(seed, [demoLoadout(1), demoLoadout(50)]);
  const bots = [makeBot(0, a, seed), makeBot(1, b, seed)], tape = [];
  while (!s.over) {
    const ins = bots.map((f) => f(s)).filter(Boolean);
    ins.forEach((i) => tape.push({ tick: s.t, ...i }));
    s = step(s, ins);
  }
  return { s, tape };
}
function replay(seed, tape) {
  let s = newMatch(seed, [demoLoadout(1), demoLoadout(50)]);
  while (!s.over) s = step(s, tape.filter((i) => i.tick === s.t));
  return s;
}
const sig = (s) => JSON.stringify([s.t, s.over, s.P.map((p) => [p.core, p.e, p.kills, p.hand, p.defs]), s.units]);

let hurtCore = 0;
for (const [seed, a, b] of [[7, 'easy', 'hard'], [12345, 'hard', 'hard'], [99, 'easy', 'easy'], [3, 'hard', 'easy']]) {
  const { s, tape } = botMatch(seed, a, b);
  assert.ok(s.t <= MATCH_T + OT_T, `ends within 4:00 (t=${s.t})`);
  assert.ok(tape.length > 5, 'bots played cards');
  const r1 = replay(seed, tape), r2 = replay(seed, tape);
  assert.equal(sig(r1), sig(s), 'replay matches live run');
  assert.equal(sig(r1), sig(r2), 'same seed + tape twice -> same result');
  if (s.P[0].core < 3000 || s.P[1].core < 3000) hurtCore++;
  const defs = tape.filter((i) => dropKind(i.seat, i.x2, i.y) === 'defend').length;
  console.log(`seed ${seed} ${a} vs ${b}: ${tape.length} plays (${defs} defend), ${(s.t / 30).toFixed(1)}s, winner ${s.over.winner} (${s.over.reason}), cores ${s.P[0].core}/${s.P[1].core}, score ${scoreOf(s, 0)}/${scoreOf(s, 1)}`);
}
assert.ok(hurtCore > 0, 'bots damage a core');
console.log('smoke ok');
