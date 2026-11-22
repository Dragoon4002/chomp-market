import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DURATION_MS, HP, STUN_MS, Sim, type Fx, type View } from './game.ts';

const WORDS = ('ace air gun jet sky war red zap ion arc nuke bomb tank fire base halo ' +
  'alpha bravo delta eagle storm radar sabre falcon hornet cobalt rocket bandit ' +
  'striker phantom typhoon gunship harrier avenger sentinel warlord').split(' ');

type Log = { fx: Fx[]; views: View[] };
const run = (s: Sim, ticks: number, until?: (v: View, log: Log) => boolean): Log => {
  const log: Log = { fx: [], views: [] };
  for (let i = 0; i < ticks; i++) {
    s.step();
    const v = s.view();
    log.fx.push(...v.fx); log.views.push(v);
    if (until?.(v, log)) break;
  }
  return log;
};
const typeWord = (s: Sim, w: string) => { for (const c of w) s.key(c); };
const balloonAt1s = () => { const s = new Sim(WORDS, 42, 'me'); run(s, 50); return s; };
const wrongLetter = (s: Sim) => [...'abcdefghijklmnopqrstuvwxyz'].find((c) => !s.ents.some((e) => e.w.startsWith(c)))!;

test('balloons: first one early on the empty sky (1 s / 1.2), then 3 s gaps', () => {
  const s = new Sim(WORDS, 1), seen = new Map<number, number>();
  run(s, 500, (v) => { for (const e of v.ents) if (!seen.has(e.id)) seen.set(e.id, v.t_ms); return false; });
  const balloons = [...seen].filter(([id]) => id <= 3).map(([, t]) => t);
  assert.deepEqual(balloons, [840, 3840, 6840]);
});

test('typing a word: turret aims, laser kills, wpm rises', () => {
  const s = balloonAt1s(), b = s.ents[0];
  assert.equal(b.k, 'balloon');
  const v0 = s.view();
  assert.equal(v0.names[0], 'me');
  typeWord(s, b.w);
  const v1 = s.view();
  assert.equal(v1.target, b.id);
  assert.equal(v1.fx.filter((f) => f.e === 'key').length, b.w.length - 1); // no click on the locking key
  const log = run(s, 200, (_, l) => l.fx.some((f) => f.e === 'laser'));
  const laser = log.fx.find((f) => f.e === 'laser');
  assert.ok(laser, 'laser fired');
  assert.ok(log.views.length >= 8, 'auto-submit waits 150 ms (8 steps) before the turret fires');
  assert.ok(!s.ents.some((e) => e.id === b.id));
  assert.ok(log.fx.some((f) => f.e === 'boom'));
  const v = s.view();
  assert.equal(v.input, '');
  assert.ok(v.wpm > 0);
  assert.ok(Math.abs(Math.atan2(laser.y + 3.65, laser.x) - v.gun) < 0.02, 'gun points at kill');
});

test('wrong first key = strike', () => {
  const s = balloonAt1s();
  s.key(wrongLetter(s));
  const v = s.view();
  assert.equal(v.strikes, 1);
  assert.deepEqual(v.fx, [{ e: 'strike' }]);
});

test('3 strikes = 1 s stun ignoring keys', () => {
  const s = balloonAt1s(), w = s.ents[0].w, z = wrongLetter(s);
  s.key(z); s.key(z); s.key(z);
  let v = s.view();
  assert.equal(v.strikes, 0);
  assert.equal(v.stun_ms, STUN_MS);
  assert.equal(v.input, '');
  assert.ok(v.fx.some((f) => f.e === 'stun'));
  typeWord(s, w);
  assert.equal(s.view().input, '');
  run(s, 50);
  v = s.view();
  assert.equal(v.stun_ms, 0);
  typeWord(s, w);
  assert.equal(s.view().input, w);
});

test('backspace never strikes', () => {
  const s = balloonAt1s(), w = s.ents[0].w;
  s.key(w[0]); s.key([...'abcdefghijklmnopqrstuvwxyz'].find((c) => !s.ents.some((e) => e.w.startsWith(w[0] + c)))!);
  assert.equal(s.view().strikes, 1);
  s.key('\b'); s.key('\b'); s.key('\b'); s.key('\b');
  assert.equal(s.view().strikes, 1);
  const t = new Sim(WORDS, 42); run(t, 50);
  t.key(wrongLetter(t)); t.key('\b');
  assert.equal(t.view().strikes, 1);
});

test('bomber drops bomb in drop zone; bomb hit = -10 + cityhit', () => {
  const s = new Sim(WORDS, 3);
  let bomber: View['ents'][number] | undefined;
  const log = run(s, 3000, (v) => {
    const bomb = v.ents.find((e) => e.k === 'bomb');
    if (bomb && !bomber) {
      bomber = v.ents.find((e) => e.id === Math.floor(bomb.id / 1000));
      assert.ok(bomber && Math.abs(bomber.x) < 1.44);
      assert.ok(Math.abs(bomb.x - bomber.x) < 0.1 && bomb.y === bomber.y);
    }
    return v.fx.some((f) => f.e === 'cityhit');
  });
  assert.ok(bomber);
  assert.ok(log.fx.some((f) => f.e === 'bombfall'));
  assert.deepEqual(log.fx.filter((f) => f.e === 'cityhit'), [{ e: 'cityhit', dmg: 10 }]);
  assert.equal(s.view().hp, HP - 10);
});

test('fireball hit = -5', () => {
  const s = new Sim(WORDS, 5);
  s.hp = 1e6;
  let last = s.hp, fire = 0;
  run(s, 6000, (v) => {
    const dmg = v.fx.reduce((a, f) => a + (f.e === 'cityhit' ? f.dmg : 0), 0);
    assert.equal(last - v.hp, dmg);
    last = v.hp;
    if (v.fx.some((f) => f.e === 'cityhit' && f.dmg === 5)) fire++;
    return fire > 0;
  });
  assert.equal(fire, 1);
  assert.ok(s.t_ms > 57_000);
});

test('same seed = identical scheduled spawns', () => {
  const sched = (seed: number) => {
    const s = new Sim(WORDS, seed), seen = new Map<number, string>();
    s.hp = 1e6;
    run(s, 6000, (v) => { for (const e of v.ents) if (e.id < 1000 && !seen.has(e.id)) seen.set(e.id, JSON.stringify([v.t_ms, e.k, e.x, e.y, e.w, e.flip])); return false; });
    return [...seen.values()];
  };
  const a = sched(9);
  assert.ok(a.some((x) => x.includes('chopper')) && a.some((x) => x.includes('bomber')));
  assert.deepEqual(a, sched(9));
  assert.notDeepEqual(a, sched(10));
});

test('end: city 0 = loss (ko), survive 5:00 = win (time)', () => {
  const s = new Sim(WORDS, 3);
  s.hp = 10;
  run(s, 3000, (v) => v.phase === 'over');
  let v = s.view();
  assert.ok(s.over());
  assert.deepEqual(v.result, { winner: 1, reason: 'ko', hp: [0, 0], wpm: [0, 0] });
  const t = s.t_ms; s.step(); assert.equal(s.t_ms, t); // frozen after end

  const u = new Sim(WORDS, 3);
  u.hp = 1e6;
  run(u, DURATION_MS / 20 + 10);
  v = u.view();
  assert.equal(u.t_ms, DURATION_MS);
  assert.equal(v.phase, 'over');
  assert.deepEqual(v.result, { winner: 0, reason: 'time', hp: [u.hp, 0], wpm: [0, 0] });
});

test('same enemies + words in the same order; clearing the sky only brings them sooner', () => {
  const sched = (play: boolean) => {
    const s = new Sim(WORDS, 11), seen = new Map<number, string>(), at = new Map<number, number>();
    s.hp = 1e6;
    for (let i = 0; i < 3000; i++) {
      s.step();
      for (const e of s.ents) if (e.id < 1000 && !seen.has(e.id)) { seen.set(e.id, JSON.stringify([e.k, e.x, e.y, e.w, e.flip])); at.set(e.id, s.t_ms); }
      if (play && !s.input) { const e = s.ents.find((x) => x.k === 'balloon' || x.k === 'bomber'); if (e) { s.key('\n'); typeWord(s, e.w); } }
    }
    return { seen: [...seen.values()], at, wpm: s.view().wpm };
  };
  const a = sched(true), b = sched(false);
  assert.ok(a.wpm > 0 && b.wpm === 0, 'A actually killed things');
  assert.ok(a.seen.length > 5);
  assert.ok(a.seen.length >= b.seen.length, 'clearer reaches at least as many spawns');
  assert.deepEqual(a.seen.slice(0, b.seen.length), b.seen);
  for (const [id, t] of b.at) assert.ok(a.at.get(id)! <= t, `id ${id} later for clearer`);
});
