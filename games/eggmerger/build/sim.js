// EggMerger sim: pure + deterministic. Browser and Node (referee). Spec: ../INTAKE.md.
// Fixed 60 Hz Engine.update, no wall clock, no Math.random. Randomness = mulberry32(seed) → piece queue only.
// Browser: index.html loads vendor/matter.min.js first (global Matter). Node: read + run it once here.
if (!globalThis.Matter) {
  const [{ readFileSync }, { runInThisContext }] = await Promise.all([import('node:fs'), import('node:vm')]);
  runInThisContext(readFileSync(new URL('./vendor/matter.min.js', import.meta.url), 'utf8'));
}
const { Engine, Bodies, Composite, Common } = globalThis.Matter;

// V8's libm changes between versions (Node 22 and Chrome 158 disagree in the last bits of sin/cos), and matter
// rotates bodies with Math.sin/cos, so runs drifted between browser and referee. The sim swaps in versions built
// only from + - * / and Math.round (IEEE-exact everywhere) while it runs. sqrt is IEEE-exact; matter's pow/acos/atan2
// are only in chamfer/Vector.angle, which circles never touch.
const TAU = 6.283185307179586, HALF = 1.5707963267948966, PI = 3.141592653589793;
function dsin(x) {
  x -= Math.round(x / TAU) * TAU; // → [-π, π]
  if (x > HALF) x = PI - x; else if (x < -HALF) x = -PI - x; // → [-π/2, π/2]
  const q = x * x; // Taylor to x^17, error < 1e-13
  return x * (1 - q / 6 * (1 - q / 20 * (1 - q / 42 * (1 - q / 72 * (1 - q / 110 * (1 - q / 156 * (1 - q / 210 * (1 - q / 272))))))));
}
const dcos = (x) => dsin(x + HALF);
const det = (f) => (...a) => {
  const { sin, cos } = Math;
  Math.sin = dsin; Math.cos = dcos;
  try { return f(...a); } finally { Math.sin = sin; Math.cos = cos; }
};

export const W = 400, H = 600, LID = 100, SPAWN_Y = 50, HZ = 60, WALL = 15; // WALL = stone side walls in art/nest.webp
export const R = [0, 16, 22, 29, 37, 46, 56, 67, 79, 92]; // radius by tier 1..9
export const COOLDOWN = 30; // 500 ms
export const OVER_TICKS = 120; // settled above the lid for 2 s
export const CAP = 600 * HZ; // run cap 600 s

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// tiers 1-4, weights 40/30/20/10
const roll = (r) => { const v = r(); return v < 0.4 ? 1 : v < 0.7 ? 2 : v < 0.9 ? 3 : 4; };

const piece = (x, y, tier) => {
  const b = Bodies.circle(x, y, R[tier], { restitution: 0.15, friction: 0.4, frictionAir: 0.01, density: 0.001 });
  b.tier = tier;
  b.above = 0; // ticks settled above the lid
  return b;
};

export const create = det(function create(seed) {
  Common._nextId = 0; // ponytail: body ids feed pair order; reset so every run starts identical (one sim at a time per process)
  const engine = Engine.create({ enableSleeping: false });
  const wall = (x, y, w, h) => Bodies.rectangle(x, y, w, h, { isStatic: true, friction: 0.5 });
  Composite.add(engine.world, [wall(W / 2, H + 50, W + 200, 100), wall(WALL - 50, H / 2 - 300, 100, H * 2), wall(W - WALL + 50, H / 2 - 300, 100, H * 2)]);
  const r = rng(seed);
  return { engine, r, tick: 0, score: 0, elders: 0, over: false, reason: null, cur: roll(r), next: roll(r), readyAt: 0, danger: 0, events: [] };
});

export const canDrop = (s) => !s.over && s.tick >= s.readyAt;

// x is clamped to the nest and rounded; returns the {tick, x} tape entry, or null if refused.
export const drop = det(function drop(s, x) {
  if (!canDrop(s)) return null;
  const r = R[s.cur];
  x = Math.round(Math.min(W - WALL - r, Math.max(WALL + r, Number(x) || 0)));
  Composite.add(s.engine.world, piece(x, SPAWN_Y, s.cur));
  s.cur = s.next;
  s.next = roll(s.r);
  s.readyAt = s.tick + COOLDOWN;
  return { tick: s.tick, x };
});

export const step = det(function step(s) {
  s.events = [];
  if (s.over) return s;
  Engine.update(s.engine, 1000 / HZ);
  s.tick++;
  const gone = new Set();
  for (const p of s.engine.pairs.list) {
    if (!p.isActive) continue;
    const a = p.bodyA, b = p.bodyB;
    if (!a.tier || a.tier !== b.tier || gone.has(a) || gone.has(b)) continue;
    gone.add(a).add(b);
    Composite.remove(s.engine.world, [a, b]);
    const t = a.tier, x = (a.position.x + b.position.x) / 2, y = (a.position.y + b.position.y) / 2;
    s.score += 2 ** t;
    if (t === 9) {
      s.elders++; // Elder pop: no piece, pays from the pot (referee)
      s.events.push({ type: 'elder', x, y });
    } else {
      const n = piece(x, y, t + 1);
      Composite.add(s.engine.world, n);
      s.events.push({ type: 'merge', x, y, tier: t + 1, id: n.id });
    }
  }
  let worst = 0;
  for (const b of Composite.allBodies(s.engine.world)) {
    if (!b.tier) continue;
    b.above = b.position.y - R[b.tier] < LID && b.speed < 0.2 ? b.above + 1 : 0;
    worst = Math.max(worst, b.above);
  }
  s.danger = worst / OVER_TICKS;
  if (worst >= OVER_TICKS) end(s, 'overflow');
  else if (s.tick >= CAP) end(s, 'cap');
  return s;
});

const end = (s, reason) => { s.over = true; s.reason = reason; s.events.push({ type: 'over', reason }); };

export const pieces = (s) => Composite.allBodies(s.engine.world).filter((b) => b.tier);

// Referee: same seed + tape → same result. tape = [{tick, x}] in tick order; entries the live game refused are refused here too.
export function replay(seed, tape) {
  const s = create(seed);
  let i = 0;
  while (!s.over) {
    while (i < tape.length && tape[i].tick <= s.tick) drop(s, tape[i++].x);
    step(s);
  }
  return { score: s.score, elders: s.elders };
}
