// Moveset scenes: input scripts run through the real deterministic sim. Pure (no DOM), so check.ts can run it in node.
import { IN, newGame, step, type Fighter, type SimEvent } from '../../client/src/lib/sim/sim.ts';
import type { MoveId } from '../../client/src/lib/sim/moves.ts';
import { lookOf, nameFor, randomDna, statsOf, archetype, type Dna } from '../../client/src/lib/genes.ts';

const { LEFT: L, RIGHT: R, UP: U, DOWN: D, JUMP: J, LIGHT: Z, HEAVY: X, DODGE: C } = IN;

// Gen-1 roster entry i (same formula as godot/tools/export-data.ts).
const rosterDna = (i: number): Dna => ({ ...randomDna(1000 + i * 7919), horn: i % 4, tail: i % 3, pattern: (i >> 1) % 3, eye: (i + (i >> 2)) % 4, hue: (i * 47 + 10) % 360 });
const fighter = (i: number, art: string) => {
  const dna = rosterDna(i);
  return { name: nameFor(1000 + i * 7919), type: archetype(dna), dna, stats: statsOf(dna), look: lookOf(dna), art };
};
export const HEROES = {
  lortor: { hero: fighter(4, 'lortor.png'), dummy: fighter(1, 'veloxpel.png') },
  veloxpel: { hero: fighter(1, 'veloxpel.png'), dummy: fighter(4, 'lortor.png') },
};
export type HeroId = keyof typeof HEROES;

export type Section = 'Movement' | 'Defense' | 'Ground attacks' | 'Air attacks' | 'Getting hit';
interface Place { x: number; y?: number; facing?: 1 | -1; damage?: number }
export interface Scene {
  section: Section;
  title: string;
  input: string; // P1 keyboard
  script: [frames: number, hero: number, dummy?: number][];
  hero: Place;
  dummy?: Place; // omitted = movement demo, dummy parked off to the side and not drawn
  cam: { x: number; y: number; z: number }; // world point at screen centre, zoom in 1280x720 logical px
  expect: string[]; // hero must enter these states/moves (check.ts)
  hits?: number; // min hits that must land (check.ts)
}

const CAM = { x: 760, y: 500, z: 1.1 };
const AIR = { x: 760, y: 420, z: 1.1 };
const VS = (x = 760, damage = 30): Place => ({ x, facing: -1, damage });

export const SCENES: Scene[] = [
  // Movement
  { section: 'Movement', title: 'Idle', input: 'No input', hero: { x: 760 }, script: [[110, 0]], cam: CAM, expect: ['idle'] },
  { section: 'Movement', title: 'Run, stop, turn', input: 'Hold D · release · hold A', hero: { x: 560 }, script: [[15, 0], [60, R], [30, 0], [50, L], [40, 0]], cam: { ...CAM, x: 780 }, expect: ['run'] },
  { section: 'Movement', title: 'Full jump', input: 'Space (hold)', hero: { x: 760 }, script: [[15, 0], [22, J], [70, 0]], cam: AIR, expect: ['jumpsquat', 'air', 'idle'] },
  { section: 'Movement', title: 'Short hop', input: 'Space (tap)', hero: { x: 760 }, script: [[15, 0], [2, J], [60, 0]], cam: AIR, expect: ['jumpsquat', 'air'] },
  { section: 'Movement', title: 'Double jump', input: 'Space ×3', hero: { x: 760 }, script: [[15, 0], [12, J], [14, 0], [4, J], [14, 0], [4, J], [90, 0]], cam: { ...AIR, y: 380 }, expect: ['air', 'airJump2'] },
  { section: 'Movement', title: 'Fast fall', input: 'Space, then S at apex', hero: { x: 760 }, script: [[15, 0], [24, J], [4, D], [55, 0]], cam: AIR, expect: ['fastFall'] },
  { section: 'Movement', title: 'Drop through platform', input: 'S on a soft ledge', hero: { x: 600, y: 430 }, script: [[30, 0], [3, D], [60, 0]], cam: { x: 640, y: 470, z: 1.1 }, expect: ['drop'] },
  { section: 'Movement', title: 'Landing lag', input: 'Space (tap), Z, land mid-move', hero: { x: 760 }, script: [[15, 0], [2, J], [6, 0], [2, Z], [60, 0]], cam: AIR, expect: ['airNeutral', 'land'] },
  // Defense
  { section: 'Defense', title: 'Ground dodge', input: 'C + D · C + A', hero: { x: 700 }, script: [[15, 0], [3, C | R], [60, 0], [3, C | L], [55, 0]], cam: CAM, expect: ['dodge'] },
  { section: 'Defense', title: 'Air dodge (diagonal)', input: 'Space, then C + W + D', hero: { x: 680 }, script: [[15, 0], [14, J], [4, 0], [3, C | R | U], [75, 0]], cam: AIR, expect: ['airDodge'] },
  // Ground attacks
  { section: 'Ground attacks', title: 'Jab 1 → Jab 2 → Jab 3', input: 'Z · Z · Z', hero: { x: 700 }, dummy: VS(), script: [[15, 0], [2, Z], [8, 0], [2, Z], [8, 0], [2, Z], [70, 0]], cam: CAM, expect: ['jab1', 'jab2', 'jab3'], hits: 3 },
  { section: 'Ground attacks', title: 'Side light', input: 'D + Z', hero: { x: 700 }, dummy: VS(800), script: [[15, 0], [2, R | Z], [70, 0]], cam: CAM, expect: ['sideLight'], hits: 1 },
  { section: 'Ground attacks', title: 'Down light', input: 'S + Z', hero: { x: 700 }, dummy: VS(770), script: [[15, 0], [2, D | Z], [70, 0]], cam: CAM, expect: ['downLight'], hits: 1 },
  { section: 'Ground attacks', title: 'Neutral heavy', input: 'X', hero: { x: 700 }, dummy: VS(740), script: [[15, 0], [2, X], [90, 0]], cam: { ...CAM, y: 460 }, expect: ['nHeavy'], hits: 1 },
  { section: 'Ground attacks', title: 'Side heavy', input: 'D + X', hero: { x: 640 }, dummy: VS(760), script: [[15, 0], [2, R | X], [90, 0]], cam: CAM, expect: ['sHeavy'], hits: 1 },
  { section: 'Ground attacks', title: 'Down heavy', input: 'S + X', hero: { x: 700 }, dummy: VS(770), script: [[15, 0], [2, D | X], [90, 0]], cam: CAM, expect: ['dHeavy'], hits: 1 },
  // Air attacks: the dummy jumps alongside so the hitboxes meet it mid-air.
  { section: 'Air attacks', title: 'Neutral air', input: 'Z (airborne)', hero: { x: 700 }, dummy: VS(750), script: [[15, 0, 0], [12, J, J], [2, Z], [75, 0]], cam: AIR, expect: ['airNeutral'], hits: 1 },
  { section: 'Air attacks', title: 'Side air', input: 'D + Z (airborne)', hero: { x: 700 }, dummy: VS(770), script: [[15, 0, 0], [12, J, J], [2, R | Z], [75, 0]], cam: AIR, expect: ['airSide'], hits: 1 },
  { section: 'Air attacks', title: 'Down air (spike)', input: 'S + Z (airborne)', hero: { x: 700 }, dummy: VS(720), script: [[15, 0], [22, J], [3, 0], [2, D | Z], [75, 0]], cam: AIR, expect: ['airDown'], hits: 1 },
  { section: 'Air attacks', title: 'Side air heavy', input: 'D + X (airborne)', hero: { x: 680 }, dummy: VS(800), script: [[15, 0, 0], [6, J, J], [2, R | X, J], [10, 0, J], [80, 0]], cam: AIR, expect: ['airSideHeavy'], hits: 1 },
  { section: 'Air attacks', title: 'Recovery', input: 'X (airborne, no direction)', hero: { x: 600 }, dummy: { x: 640, y: 430, facing: -1, damage: 30 }, script: [[15, 0], [2, J], [4, 0], [2, X], [95, 0]], cam: { x: 660, y: 420, z: 1.1 }, expect: ['recovery'], hits: 1 },
  { section: 'Air attacks', title: 'Ground pound', input: 'S + X (airborne)', hero: { x: 745 }, dummy: VS(775), script: [[15, 0], [14, J], [6, 0], [3, J], [10, 0], [2, D | X], [85, 0]], cam: { ...AIR, y: 380 }, expect: ['groundPound'], hits: 1 },
  // Getting hit: the dummy attacks the hero.
  { section: 'Getting hit', title: 'Hitstun', input: 'Hit by a jab', hero: { x: 700 }, dummy: VS(760, 0), script: [[15, 0, 0], [2, 0, Z], [70, 0, 0]], cam: CAM, expect: ['hurt'] },
  { section: 'Getting hit', title: 'Tumble', input: 'Hit by side heavy at 40%', hero: { x: 1060, damage: 40 }, dummy: VS(1150, 0), script: [[15, 0, 0], [2, 0, L | X], [110, 0, 0]], cam: { x: 800, y: 470, z: 0.9 }, expect: ['tumble'] },
  { section: 'Getting hit', title: 'KO + respawn', input: 'Hit by side heavy at 150%', hero: { x: 560, damage: 150 }, dummy: VS(620, 0), script: [[15, 0, 0], [2, 0, L | X], [250, 0, 0]], cam: { x: 720, y: 400, z: 0.6 }, expect: ['dead', 'respawn'] },
];

export const sceneLength = (s: Scene) => s.script.reduce((n, [f]) => n + f, 0);

export interface Frame { fighters: Fighter[]; events: SimEvent[] }

// Whole scene simulated once and kept: frame k = state after k steps (0 = pre-warmed start).
const memo = new Map<string, Frame[]>();
export function simulate(hero: HeroId, idx: number): Frame[] {
  const key = `${hero}/${idx}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const sc = SCENES[idx], h = HEROES[hero];
  const s = newGame([h.hero.stats, h.dummy.stats], 'ember');
  const place = (f: Fighter, p: Place, facing: 1 | -1) => { f.x = p.x; f.y = p.y ?? 560; f.facing = p.facing ?? facing; f.vy = 0; };
  place(s.fighters[0], sc.hero, 1);
  place(s.fighters[1], sc.dummy ?? { x: 1150 }, -1);
  for (let i = 0; i < 300 && !s.fighters.every((f) => f.grounded && f.state === 'idle'); i++) step(s, [0, 0]); // pre-warm
  s.fighters[0].damage = sc.hero.damage ?? 0;
  s.fighters[1].damage = sc.dummy?.damage ?? 0;
  const out: Frame[] = [{ fighters: structuredClone(s.fighters), events: [] }];
  for (const [n, hi, di = 0] of sc.script) {
    for (let k = 0; k < n; k++) {
      step(s, [hi, di]);
      out.push({ fighters: structuredClone(s.fighters), events: [...s.events] });
    }
  }
  memo.set(key, out);
  return out;
}
