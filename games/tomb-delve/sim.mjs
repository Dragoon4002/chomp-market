// Economy + determinism check. Run: node --experimental-strip-types --no-warnings sim.mjs
// 10k bot runs split across extract-after-set 1/2/3; exit 1 if overall return-to-player is outside 80–92%
// or if extracting after set 1 pays back the entry (set 1 must not cover the fee).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rng, SKILL_KINDS } from './src/lib/genes.ts';
import { sha256, newRun, nextSet, advance, openChest, ignoreChest, playCard, endTurn, playTurn, useItem, atCamp, pawnQuote,
  CARDS, CLASSES, RELICS, ITEMS, ENTRY, T_TARGET } from './src/lib/sim.ts';

for (const m of ['', 'abc', 'x'.repeat(200)]) assert.equal(sha256(m), createHash('sha256').update(m).digest('hex'), 'sha256');

const CLS = Object.keys(CLASSES);
const incoming = (c) => (c.intent.kind === 'attack' ? c.intent.n * c.intent.hits : 0);

// One turn: cautious blocks the hit first, greedy swings first. Returns the hand indices it played (for replay).
function botTurn(r, cautious) {
  const played = [];
  for (;;) {
    const c = r.c, need = incoming(c) - c.block - c.carry;
    const ok = c.hand.map((id, i) => [CARDS[id], i]).filter(([k]) => k.cost <= c.st);
    if (!ok.length) break;
    const atk = ok.filter(([k]) => k.dmg !== undefined), def = ok.filter(([k]) => k.dmg === undefined);
    const lethal = atk.reduce((s, [k]) => s + k.dmg, 0) >= c.mon.hp + c.mon.block;
    const wantDef = !lethal && need > 0 && def.length && (cautious || r.hp - need < r.max * 0.4);
    const [, i] = (wantDef ? def : atk.length ? atk : def)[0];
    r = playCard(r, i); played.push(i);
    if (r.c.won) break;
  }
  return { r: r.c.won ? r : endTurn(r), played };
}

function sell(relics) {
  const net = RELICS.map(() => 0); // ponytail: decay only within this run's own sales; live 24h window depends on traffic
  return relics.reduce((s, t) => s + pawnQuote(RELICS[t].base, t === 4 ? 0 : net[t]++, T_TARGET), 0);
}

// Every state change goes through act() so the tape can be replayed through playTurn.
const APPLY = {
  turn: (r, cards) => playTurn(r, cards), open: openChest, ignore: ignoreChest, advance,
  next: (r, vrf) => nextSet(r, vrf), buy: (r, item) => useItem(r, item, true), use: (r, item) => useItem(r, item),
};
const start = (seed, cls, skills) => newRun(sha256(String(seed)), `run-${seed}`, cls, skills);

function botRun(seed, stopAt) {
  const cautious = true; // ponytail: all bots block smart; strategy differs only in when they extract
  const R = rng(seed), cls = CLS[Math.floor(R() * 4)];
  const skills = [...SKILL_KINDS].sort(() => R() - 0.5).slice(0, 2);
  let r = start(seed, cls, skills), paid = ENTRY;
  const tape = [], act = (a, x) => { tape.push([a, x]); r = APPLY[a](r, x); };
  const done = (out) => ({ paid, out, r, tape, cls, skills });
  for (let steps = 0; steps < 5000; steps++) {
    if (r.dead) return done(0);
    if (atCamp(r)) {
      const stop = r.set >= stopAt || (cautious && r.hp < r.max * 0.6);
      if (stop) return done(sell(r.relics));
      const buy = (item) => { paid += ITEMS[item].price; act('buy', item); };
      while (r.hp < r.max - 10) { buy('potion'); act('use', 'potion'); }
      if (!cautious && r.set === 1) buy('blade');
      buy('potion');
      act('next', sha256(`${r.vrf}|${r.set}`));
    } else if (r.c && !r.c.won) {
      if (r.potions && r.hp < 12) act('use', 'potion');
      const t = botTurn(r, cautious);
      tape.push(['turn', t.played]); r = t.r;
    } else if (!r.done) act(r.cls === 'thief' && r.rooms[r.room].mimic ? 'ignore' : 'open');
    else act('advance');
  }
  throw new Error('stuck run ' + seed);
}

// Determinism: same seed → same end state, and replaying the tape (playTurn per turn) → identical state.
for (const seed of [7, 8, 9, 10]) {
  const a = botRun(seed, 1 + (seed % 3)), b = botRun(seed, 1 + (seed % 3));
  assert.deepEqual(a.r, b.r, 'same seed, same end state');
  const re = a.tape.reduce((r, [k, x]) => APPLY[k](r, x), start(seed, a.cls, a.skills));
  assert.deepEqual(re, a.r, 'same turns, same end state');
}
console.log('PASS determinism (same seed + same turns -> identical end state)');

let paid = 0, out = 0, deaths = 0;
const by = { 1: [0, 0], 2: [0, 0], 3: [0, 0] };
for (let i = 0; i < 10_000; i++) {
  const stopAt = 1 + (i % 3), x = botRun(i + 1, stopAt);
  paid += x.paid; out += x.out; deaths += x.out === 0 && x.r.dead ? 1 : 0;
  by[stopAt][0] += x.paid; by[stopAt][1] += x.out;
}
const rtp = (out / paid) * 100, pct = ([p, o]) => (o / p) * 100;
for (const k of [1, 2, 3]) console.log(`extract after set ${k}: RTP ${pct(by[k]).toFixed(1)}%`);
console.log(`deaths ${(deaths / 100).toFixed(1)}%  RTP ${rtp.toFixed(1)}%`);
const inBand = rtp >= 80 && rtp <= 92, set1 = pct(by[1]) < 100;
console.log(`${inBand ? 'PASS' : 'FAIL'} RTP in 80–92%`);
console.log(`${set1 ? 'PASS' : 'FAIL'} set 1 alone doesn't cover entry`);
process.exit(inBand && set1 ? 0 : 1);
