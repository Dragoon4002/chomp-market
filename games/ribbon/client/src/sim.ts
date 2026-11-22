// Ribbon Rush sim. Integer only; must match games/ribbon/sim/src/lib.rs bit for bit.
export const W = 48, H = 32, TICK_HZ = 15, FADE = 90, CLOSE_AT = 300, CLOSE_EVERY = 75, MAX_RING = 12;
export const BOOST_TICKS = 15, FREEZE = 30, WIN_ROUNDS = 2, MAX_ROUNDS = 9;
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

export function input(dir: number | null, boost: boolean): number {
  return (dir ?? 7) | (boost ? 8 : 0);
}

export type Rider = { x: number; y: number; dir: number; boostLeft: number; boostUsed: boolean; alive: boolean };

const spawn = (): Rider[] => [
  { x: 8, y: 16, dir: 1, boostLeft: 0, boostUsed: false, alive: true },
  { x: 39, y: 15, dir: 3, boostLeft: 0, boostUsed: false, alive: true },
];

export class Sim {
  tick = 0; roundTick = 0; rounds = 0; score = [0, 0]; riders = spawn(); ring = 0; freeze = 0; done = false; winner = -1;
  expire = new Uint32Array(W * H);
  owner = new Uint8Array(W * H);

  cell(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    const i = y * W + x;
    return this.expire[i] > this.tick ? this.owner[i] + 1 : 0;
  }

  step(ins: number[]) {
    this.tick++;
    if (this.done) return;
    if (this.freeze > 0) {
      if (--this.freeze === 0) {
        this.riders = spawn();
        this.expire.fill(0);
        this.roundTick = 0;
        this.ring = 0;
      }
      return;
    }
    this.roundTick++;
    this.ring = this.roundTick < CLOSE_AT ? 0 : Math.min(MAX_RING, 1 + Math.floor((this.roundTick - CLOSE_AT) / CLOSE_EVERY));
    const moves = this.riders.map((r, i) => {
      const d = ins[i] & 7;
      if (d < 4 && d !== (r.dir + 2) % 4) r.dir = d;
      if (ins[i] & 8 && !r.boostUsed) { r.boostUsed = true; r.boostLeft = BOOST_TICKS; }
      const m = r.boostLeft > 0 ? 2 : 1;
      if (r.boostLeft > 0) r.boostLeft--;
      return m;
    });
    const crashed = [false, false];
    for (let sub = 0; sub < 2; sub++) {
      const moved = [false, false];
      this.riders.forEach((r, i) => {
        if (!r.alive || moves[i] <= sub) return;
        const c = r.y * W + r.x;
        this.expire[c] = this.tick + FADE;
        this.owner[c] = i;
        r.x += DX[r.dir];
        r.y += DY[r.dir];
        moved[i] = true;
      });
      const g = this.ring;
      this.riders.forEach(({ x, y }, i) => {
        if (moved[i] && (x < g || y < g || x >= W - g || y >= H - g || this.cell(x, y))) crashed[i] = true;
      });
      const [a, b] = this.riders;
      if (moved[0] && moved[1] && a.x === b.x && a.y === b.y) crashed[0] = crashed[1] = true;
      if (crashed[0] || crashed[1]) break;
    }
    if (!crashed[0] && !crashed[1]) return;
    crashed.forEach((c, i) => { if (c) this.riders[i].alive = false; });
    if (crashed[0] !== crashed[1]) this.score[crashed[0] ? 1 : 0]++;
    this.rounds++;
    const w = this.score.indexOf(WIN_ROUNDS);
    if (w >= 0) { this.done = true; this.winner = w; }
    else if (this.rounds >= MAX_ROUNDS) {
      this.done = true;
      const [s0, s1] = this.score;
      this.winner = s0 > s1 ? 0 : s1 > s0 ? 1 : -1;
    } else this.freeze = FREEZE;
  }

  hash(): number {
    let h = 2166136261;
    const feed = (v: number) => { for (let k = 0; k < 4; k++) h = Math.imul(h ^ ((v >>> (8 * k)) & 255), 16777619); };
    [this.tick, this.roundTick, this.rounds, this.score[0], this.score[1], this.ring, this.freeze, +this.done, this.winner + 1].forEach(feed);
    for (const r of this.riders) [r.x, r.y, r.dir, r.boostLeft, +r.boostUsed, +r.alive].forEach(feed);
    return h >>> 0;
  }
}
