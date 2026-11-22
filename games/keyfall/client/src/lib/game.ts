// Keyfall solo sim: TS port of Typewriter Command (tasks/keyfall-spec.md v2, tasks/keyfall-reference.md).
// Same rules as games/keyfall/server/src/game.rs. World units, y up: view x ∈ [-VIEW_W, VIEW_W], y ∈ [-VIEW_H, VIEW_H].
export const DURATION_MS = 120_000;
// No typeable enemy on screen -> the spawn schedule runs this much faster (same enemies/words/order, just sooner).
export const EMPTY_BOOST = 1.2;
export const COUNTDOWN_MS = 3_000;
export const DT_MS = 20;
export const HP = 100;
export const STRIKES = 3;
export const STUN_MS = 1_000;
export const VIEW_W = 8.889;
export const VIEW_H = 5;
export const GUN = { x: 0, y: -3.65 }; // GunPivot/TurretGun origin = laser start

export type Kind = 'balloon' | 'bomber' | 'bomb' | 'chopper' | 'fireball';
export type Ent = { id: number; k: Kind; x: number; y: number; vx: number; vy: number; w: string; flip: boolean }; // w = '' for fireball
export type Fx =
  | { e: 'key' } | { e: 'strike' } | { e: 'stun' } | { e: 'laser'; x: number; y: number } | { e: 'boom'; x: number; y: number }
  | { e: 'bombfall' } | { e: 'chopperfire' } | { e: 'cityhit'; dmg: number } | { e: 'siren' };
export type View = {
  phase: 'wait' | 'count' | 'live' | 'over'; count_ms: number; left_ms: number; t_ms: number;
  hp: number; wpm: number; strikes: number; stun_ms: number;
  input: string; target: number | null;
  gun: number; pivot: number; // radians, CCW from +x (TurretGun world, GunPivot)
  ents: Ent[]; fx: Fx[];
  names: [string, string]; conn: [boolean, boolean];
  result?: { winner: 0 | 1 | null; reason: 'ko' | 'time' | 'forfeit'; hp: [number, number]; wpm: [number, number] };
};

const DT = DT_MS / 1000;
const EDGE = 12; // spawn / wrap / despawn x
const MAX_INPUT = 16;
const RECENT = 20;
const TURN = 180 * DT; // turret deg per tick
const TP: Record<Kind, number> = { balloon: 0, bomber: 0.4, bomb: 0.5, chopper: 0.4, fireball: 0 }; // TargetPoint local y

type E = Ent & { sp: number; dir: number; fired: boolean; pass: number; y0: number; bob: number; rot: number; zone: boolean; cd: number; shots: number; dead: boolean };

const mulberry = (a: number) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// fairness: every entity's side/height/word comes from hash(seed, id), so both seats see the same schedule
const rngFor = (seed: number, id: number) => mulberry((seed ^ Math.imul(id, 0x9e3779b1)) >>> 0);
const pick = <T,>(l: T[], r: () => number) => l[Math.floor(r() * l.length)];

const norm = (a: number) => ((a % 360) + 360) % 360;
const deltaAngle = (a: number, b: number) => { const d = norm(b - a); return d > 180 ? d - 360 : d; };
const toward = (c: number, t: number, max: number) => { const d = deltaAngle(c, t); return norm(Math.abs(d) < max ? t : c + Math.sign(d) * max); }; // Mathf.MoveTowardsAngle
const aim = (x: number, y: number) => (Math.atan2(y - GUN.y, x - GUN.x) * 180) / Math.PI;
const rad = (deg: number) => { const d = norm(deg); return ((d > 180 ? d - 360 : d) * Math.PI) / 180; };
const sortWords = (l: string[]) => l.sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)); // WordDictionary order

// bomb/balloon pick: 2-3 letters weight 3, 4 letters weight 1
function weighted(list: string[], r: () => number) {
  const s = list.filter((w) => w.length <= 3), l = list.filter((w) => w.length === 4);
  const g = r() * (s.length * 3 + l.length) < s.length * 3 && s.length ? s : l.length ? l : list;
  return pick(g, r);
}
// anti-repeat: exclude the last RECENT picks of this category (clear when nothing is left)
function fresh(list: string[], recent: string[]) {
  const l = list.filter((w) => !recent.includes(w));
  if (l.length) return l;
  recent.length = 0;
  return list;
}
const remember = (recent: string[], w: string) => { recent.push(w); if (recent.length > RECENT) recent.shift(); return w; };

export class Sim {
  t_ms = 0;
  hp = HP; // ponytail: public so tests can poke it
  chars = 0;
  strikes = 0;
  input = '';
  ents: E[] = [];
  seed: number;
  name: string;
  private fx: Fx[] = [];
  private short: string[]; private mid: string[]; private long: string[];
  private recent = { bomb: [] as string[], bomber: [] as string[], chopper: [] as string[] };
  // PlayerInput
  private target: number | null = null; private lastValid = ''; private prev = ''; private stunUntil = 0; private pending: [number, string][] = [];
  // turrets (degrees): gun is a child of the pivot, so gun world = pivot + gunLocal
  private pivot = 0; private gunLocal = 0; private gunTarget: number | null = null;
  // spawners
  private nextId = 1;
  private st = 0; // schedule clock (ms), runs EMPTY_BOOST x while the sky is empty
  private tutorial = true; private bombers = false; private choppers = false;
  private spawned = 0; private nextBalloon = 1_000;
  private bomberTimer = 4_000; private bomberInterval = 9_000; private bomberCount = 0;
  private chopperTimer = 12_000; private chopperInterval = 20_000;

  constructor(words: string[], seed: number, name = '') {
    this.seed = seed >>> 0;
    this.name = name;
    this.short = sortWords(words.filter((w) => w.length >= 2 && w.length <= 4));
    this.mid = sortWords(words.filter((w) => w.length >= 4 && w.length <= 7));
    this.long = sortWords(words.filter((w) => w.length >= 6 && w.length <= 8));
  }

  over() { return this.hp <= 0 || this.t_ms >= DURATION_MS; }
  private stunned() { return this.t_ms < this.stunUntil; }
  private alive(id: number | null) { return id == null ? undefined : this.ents.find((e) => e.id === id && !e.dead); }
  private tp(e: E): [number, number] {
    if (e.k !== 'chopper') return [e.x, e.y + TP[e.k]];
    const r = (e.rot * Math.PI) / 180;
    return [e.x - TP.chopper * Math.sin(r), e.y + TP.chopper * Math.cos(r)];
  }

  // ---- typing (PlayerInput.OnInputChanged / OnWordSubmitted) ----
  key(c: string) {
    if (this.over() || this.stunned()) return;
    if (c === '\n') return this.submit(this.input);
    if (c === '\b') { if (!this.input) return; this.input = this.input.slice(0, -1); }
    else { c = c.toLowerCase(); if (!/^[a-z]$/.test(c) || this.input.length >= MAX_INPUT) return; this.input += c; }
    this.changed(this.input);
  }

  private changed(cur: string) {
    const back = cur.length < this.prev.length; // prev is reset by clear(): faithful quirk
    if (!cur) { this.clear(); return; }
    let m: E | undefined;
    for (const e of this.ents) if (!e.dead && e.w && e.w.startsWith(cur) && (!m || e.w.length < m.w.length)) m = e;
    if (m) {
      const isNew = this.target !== m.id;
      if (isNew) { this.clear(); this.target = m.id; }
      if (cur.length > this.lastValid.length && !isNew) this.fx.push({ e: 'key' });
      this.lastValid = cur;
      if (m.w === cur) this.pending.push([this.t_ms + 150, cur]); // auto-submit after 0.15 s
    } else if (!back) {
      const tg = this.alive(this.target);
      if (this.lastValid && tg) { if (tg.w.startsWith(this.lastValid) && !tg.w.startsWith(cur)) this.strike(); }
      else if (!this.lastValid) { this.clear(); this.strike(); }
      // else: target died meanwhile -> no strike
    }
    this.prev = cur;
  }

  private clear() { this.target = null; this.lastValid = ''; this.prev = ''; }

  private submit(word: string) {
    if (!word || this.stunned()) return;
    const e = this.ents.find((x) => !x.dead && x.w === word);
    if (e) { this.gunTarget = e.id; this.strikes = 0; } // wrong word: silently cleared
    this.clear();
    this.input = '';
  }

  private strike() {
    if (this.stunned()) return;
    if (++this.strikes < STRIKES) { this.fx.push({ e: 'strike' }); return; }
    this.strikes = 0;
    this.stunUntil = this.t_ms + STUN_MS;
    this.clear();
    this.input = '';
    this.fx.push({ e: 'stun' });
  }

  // ---- world ----
  private spawn(k: 'balloon' | 'bomber' | 'chopper') {
    const id = this.nextId++, r = rngFor(this.seed, id);
    const left = r() > 0.5, dir = left ? 1 : -1;
    const [lo, hi] = k === 'balloon' ? [1.8, 3.4] : k === 'bomber' ? [2.4, 3.8] : [2.5, 3.5];
    const y = lo + r() * (hi - lo);
    let w: string, sp: number, bob = 0;
    if (k === 'balloon') {
      bob = r() * Math.PI * 2; sp = 1.4;
      w = this.short.length ? remember(this.recent.bomb, weighted(fresh(this.short, this.recent.bomb), r)) : 'bomb';
    } else if (k === 'bomber') {
      const n = this.bomberCount++;
      sp = Math.min(4.2, 1.45 + 0.085 * n);
      w = this.mid.length ? remember(this.recent.bomber, pick(fresh(this.bomberWords(n), this.recent.bomber), r)) : 'bomber';
    } else {
      sp = 1.1;
      w = this.long.length ? remember(this.recent.chopper, pick(fresh(this.long, this.recent.chopper), r)) : 'chopper';
    }
    this.add({ id, k, x: left ? -EDGE : EDGE, y, w, flip: !left, sp, dir, y0: y, bob });
  }

  // GameManager length ramp; fairness: level = bombers spawned / 8 (original: killed / 5)
  private bomberWords(spawned: number) {
    const L = Math.floor(spawned / 8);
    const lo = Math.min(7, 4 + Math.floor(L / 5)), hi = Math.min(7, 5 + Math.floor(L / 2));
    const within = (a: number, b: number) => this.mid.filter((w) => w.length >= a && w.length <= b);
    let l = within(lo, hi);
    if (!l.length) return this.mid;
    for (let i = 1; l.length < RECENT / 2 && i <= 3; i++) l = within(Math.max(2, lo - i), Math.min(8, hi + i));
    return l.length ? l : this.mid;
  }

  private add(p: Partial<E> & Pick<E, 'id' | 'k' | 'x' | 'y'>) {
    this.ents.push({ vx: 0, vy: 0, w: '', flip: false, sp: 0, dir: 1, fired: false, pass: 0, y0: p.y, bob: 0, rot: 0, zone: false, cd: 0, shots: 0, dead: false, ...p });
  }


  private kill(e: E, byPlayer: boolean) { // Enemy.DestroyWithExplosion
    e.dead = true;
    this.fx.push({ e: 'boom', x: e.x, y: e.y });
    if (byPlayer) this.chars += e.w.length;
  }

  private cityHit(dmg: number) {
    this.hp = Math.max(0, this.hp - dmg);
    this.fx.push({ e: 'cityhit', dmg }, { e: 'siren' });
  }

  step() {
    if (this.over()) return;
    const t = (this.t_ms += DT_MS);

    const due = this.pending.filter((p) => p[0] <= t);
    this.pending = this.pending.filter((p) => p[0] > t);
    for (const [, w] of due) this.submit(w);

    const dt = this.ents.some((e) => e.k !== 'fireball') ? DT_MS : DT_MS * EMPTY_BOOST;
    const st = (this.st += dt);
    // spawners (run before phase flags flip so timers start counting the tick after)
    if (this.bombers && (this.bomberTimer -= dt) <= 0) {
      this.spawn('bomber');
      this.bomberTimer = this.bomberInterval;
      this.bomberInterval = Math.max(1_500, this.bomberInterval - 150);
    }
    if (this.choppers && (this.chopperTimer -= dt) <= 0) {
      this.spawn('chopper');
      this.chopperTimer = this.chopperInterval;
      this.chopperInterval = Math.max(8_000, this.chopperInterval - 500);
    }
    if (this.tutorial) {
      // fairness: fixed 10 s, balloons at 1/4/7 s regardless of kills
      if (st >= 10_000) { this.tutorial = false; this.bombers = true; }
      else if (this.spawned < 3 && st >= this.nextBalloon) { this.spawn('balloon'); this.spawned++; this.nextBalloon = st + 3_000; }
    }
    if (st >= 45_000) this.choppers = true;

    // turrets: pivot follows the partial target, gun rotates to the submitted target and fires when |Δ| < 1°
    const g = this.alive(this.gunTarget);
    if (!g) this.gunTarget = null;
    if (!this.stunned()) {
      const tg = this.alive(this.target);
      if (tg) this.pivot = toward(this.pivot, aim(...this.tp(tg)), TURN);
      if (g) {
        const [x, y] = this.tp(g), z = norm(this.pivot + this.gunLocal), a = aim(x, y);
        this.gunLocal = toward(z, a, TURN) - this.pivot;
        if (Math.abs(deltaAngle(z, a)) < 1) {
          this.fx.push({ e: 'laser', x, y });
          this.kill(g, true);
          this.gunTarget = null;
        }
      }
    }

    for (const e of this.ents.slice()) {
      if (e.dead) continue;
      if (e.k === 'balloon') {
        e.bob += DT;
        e.vx = e.dir * e.sp; e.vy = Math.cos(e.bob) * 0.15;
        e.x += e.vx * DT; e.y = e.y0 + Math.sin(e.bob) * 0.15;
        if (Math.abs(e.x) > EDGE) e.dead = true; // escaped, no boom
      } else if (e.k === 'bomber') {
        e.vx = e.dir * e.sp;
        e.x += e.vx * DT;
        if (Math.abs(e.x) > EDGE) { e.dir = e.x > 0 ? 1 : -1; e.x = -e.dir * EDGE; e.flip = e.dir < 0; e.fired = false; e.pass++; e.vx = e.dir * e.sp; }
        if (!e.fired && Math.abs(e.x) < 0.5 + 1.875 / 2) { // enters BombDropZone
          e.fired = true;
          const id = e.id * 1000 + e.pass;
          this.add({ id, k: 'bomb', x: e.x, y: e.y, vy: -1.3, w: this.short.length ? weighted(this.short, rngFor(this.seed, id)) : 'bomb' });
          this.fx.push({ e: 'bombfall' });
        }
      } else if (e.k === 'bomb') {
        e.y += e.vy * DT;
        if (Math.abs(e.x) < 1.75 && e.y - 0.25 < -3) { this.cityHit(10); this.kill(e, false); }
      } else if (e.k === 'chopper') {
        let tilt = 0;
        if (!e.zone) {
          const r = (e.rot * Math.PI) / 180; // local-space translate: sinks while tilted
          e.vx = e.dir * e.sp * Math.cos(r); e.vy = e.dir * e.sp * Math.sin(r);
          e.x += e.vx * DT; e.y += e.vy * DT;
          tilt = e.dir > 0 ? -15 : 15;
        } else {
          e.vx = e.vy = 0;
          if ((e.cd -= DT_MS) <= 0) {
            const dx = GUN.x - e.x, dy = -3 - e.y, n = Math.hypot(dx, dy) || 1; // aim City/TargetPoint (0,-3)
            this.add({ id: e.id * 1000 + e.shots++, k: 'fireball', x: e.x, y: e.y, vx: (dx / n) * 3, vy: (dy / n) * 3 });
            this.fx.push({ e: 'chopperfire' });
            e.cd = 1_000;
          }
        }
        let r = e.rot > 180 ? e.rot - 360 : e.rot;
        r += deltaAngle(r, tilt) * Math.min(1, 2 * DT); // Mathf.LerpAngle
        e.rot = norm(r);
        if (!e.zone && Math.abs(e.x) - 1 < 3.75 && e.y - 0.25 < 6 && e.y + 0.25 > -4) { e.zone = true; e.cd = e.shots ? 1_000 : 0; }
      } else {
        e.x += e.vx * DT; e.y += e.vy * DT;
        if (Math.abs(e.x) < 1.75 && e.y - 0.25 < -3 && e.y + 0.25 > -4) { this.cityHit(5); this.kill(e, false); }
      }
    }
    this.ents = this.ents.filter((e) => !e.dead);
  }

  wpm() { return this.t_ms < 1000 ? 0 : Math.round(this.chars / 5 / (this.t_ms / 60_000)); }

  view(): View {
    const over = this.over(), wpm = this.wpm(), fx = this.fx;
    this.fx = [];
    return {
      phase: over ? 'over' : 'live', count_ms: 0, left_ms: Math.max(0, DURATION_MS - this.t_ms), t_ms: this.t_ms,
      hp: this.hp, wpm, strikes: this.strikes, stun_ms: Math.max(0, this.stunUntil - this.t_ms),
      input: this.input, target: this.alive(this.target)?.id ?? null,
      gun: rad(this.pivot + this.gunLocal), pivot: rad(this.pivot),
      ents: this.ents.map(({ id, k, x, y, vx, vy, w, flip }) => ({ id, k, x, y, vx, vy, w, flip })), fx,
      names: [this.name, ''], conn: [true, false],
      ...(over && { result: { winner: this.hp > 0 ? 0 : 1, reason: this.hp > 0 ? 'time' : 'ko', hp: [this.hp, 0], wpm: [wpm, 0] } }),
    };
  }
}

let cache: Promise<string[]> | null = null;
export const loadWords = () => (cache ??= fetch('/words.txt').then((r) => r.text())
  .then((t) => t.split(/[\s,]+/).map((w) => w.trim().toLowerCase()).filter((w) => /^[a-z]+$/.test(w)))
  .catch((e) => { cache = null; throw e; }));
