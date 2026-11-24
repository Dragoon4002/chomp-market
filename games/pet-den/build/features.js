// Den features around the sim: shop, jobs, breeding, quests, achievements, leaderboard.
// Plain functions on the chain state `st` (chain.js). They return a message or throw Error(msg). No DOM, no clock: time = st.t ticks.
import { rng, breed, lookOf, level, valueOf } from './sim.js?v=2';
import { MAX_PETS } from './chain.js?v=2';

export const SHOP = [
  { id: 'treat', icon: '🍖', name: 'Moon Treat', price: 20, info: 'Feed boost: +15 food, +5 joy' },
  { id: 'toy', icon: '🧸', name: 'Star Ball', price: 30, info: 'Play boost: +10 joy' },
  { id: 'soap', icon: '🫧', name: 'Bubble Soap', price: 15, info: 'Clean boost: +5 health' },
  { id: 'egg', icon: '🥚', name: 'Mystery Egg', price: 10, gems: true, info: 'A new egg for your roster' },
];
export const EGG_COINS = 150; // "+" on the roster rail
export const BREED_COST = 50, BREED_CD = 30; // coins, ticks per parent

export function buy(st, id) {
  const it = SHOP.find((x) => x.id === id);
  const wallet = it.gems ? 'gems' : 'coins';
  if (st[wallet] < it.price) throw new Error(`Not enough ${wallet}.`);
  if (id === 'egg') addEgg(st, eggDna(st));
  else st.inv[id] = (st.inv[id] || 0) + 1;
  st[wallet] -= it.price; // TODO(solana): SPL transfer / item mint
  return `Bought ${it.name}.`;
}

// ---- eggs: DNA from the session seed + a counter, standing in for VRF. TODO(solana): VRF hatch + Core NFT mint ----
export const eggDna = (st) => (Math.floor(rng((st.seedU ^ Math.imul(++st.nid, 0x9e3779b9)) >>> 0)() * 2 ** 32)) >>> 0;
export function addEgg(st, dna) {
  if (st.pets.length + st.eggs.length >= MAX_PETS) throw new Error('Roster full (8).');
  st.eggs.push(dna);
}
export function buyEgg(st) {
  if (st.coins < EGG_COINS) throw new Error(`An egg costs ${EGG_COINS} coins.`);
  addEgg(st, eggDna(st)); st.coins -= EGG_COINS;
  return 'A new egg! Tap it to hatch.';
}

// ---- city jobs: the earn loop. Pet is busy for `ticks`, keeps decaying, pays on return. ----
export const JOBS = [
  { name: 'Courier Run', icon: '📦', ticks: 10, pay: 20 },
  { name: 'Library Helper', icon: '📚', int: 35, ticks: 15, pay: 40 },
  { name: 'Quarry Hauler', icon: '⛏️', str: 35, ticks: 15, pay: 40 },
  { name: 'Arcane Scholar', icon: '🔮', int: 60, ticks: 25, pay: 110 },
  { name: 'Arena Guard', icon: '🛡️', str: 60, ticks: 25, pay: 110 },
];
export function startJob(st, i, j) {
  const p = st.pets[i], s = p.stats, job = JOBS[j];
  if (!s.alive) throw new Error('Pet ran away.');
  if (p.job) throw new Error('Already working.');
  if (s.asleep) throw new Error('Wake it up first.');
  if ((job.int && s.int < job.int) || (job.str && s.str < job.str)) throw new Error('Not skilled enough yet.');
  p.job = { j, end: st.t + job.ticks };
  return `${name(p)} left for ${job.name}.`;
}
// Called after every tick: pays finished jobs. TODO(solana): job pay lands in the pet's earnings vault (Magic Action).
export function settleJobs(st) {
  const out = [];
  for (const p of st.pets) {
    if (!p.job || st.t < p.job.end) continue;
    const job = JOBS[p.job.j]; p.job = null;
    if (!p.stats.alive) continue;
    st.coins += job.pay; st.n.earned += job.pay; st.n.job++;
    out.push(`${name(p)} earned ${job.pay} coins at ${job.name}.`);
  }
  return out;
}

// ---- breeding: two Adult+ pets -> egg with mixed DNA ----
export const canBreed = (st, p) => p.stats.alive && p.stats.tier >= 2 && !p.job && st.t >= p.breedAt;
export function breedPets(st, i, j) {
  const a = st.pets[i], b = st.pets[j];
  if (i === j || !a || !b) throw new Error('Pick two different pets.');
  if (!canBreed(st, a) || !canBreed(st, b)) throw new Error('Both need to be Adult+, free and rested.');
  if (st.coins < BREED_COST) throw new Error(`Breeding costs ${BREED_COST} coins.`);
  const { dna, mutated } = breed(a.dna, b.dna, (st.seedU ^ Math.imul(st.t + 1, 0x85ebca6b) ^ a.id * 31 ^ b.id) >>> 0);
  addEgg(st, dna);
  st.coins -= BREED_COST; a.breedAt = b.breedAt = st.t + BREED_CD; st.n.breed++;
  return `A new egg${mutated !== null ? ' (mutation!)' : ''}. Hatch it from the roster.`;
}

// ---- quests: 3 at a time, picked from the seed; claim all 3 to roll the next set ----
const QUESTS = [
  { k: 'feed', need: 3, label: 'Feed your pets 3×', coins: 30 },
  { k: 'train', need: 2, label: 'Train 2×', coins: 40 },
  { k: 'win', need: 1, label: 'Win a mini-game (6+)', gems: 2 },
  { k: 'play', need: 3, label: 'Play 3×', coins: 30 },
  { k: 'job', need: 1, label: 'Finish a city job', coins: 50 },
  { k: 'hatch', need: 1, label: 'Hatch an egg', gems: 1 },
];
export function quests(st) {
  const q = st.quests;
  if (!q.base) q.base = { ...st.n };
  const r = rng((st.seedU ^ Math.imul(q.round + 1, 0x27d4eb2d)) >>> 0), pool = [...QUESTS], pick = [];
  for (let i = 0; i < 3; i++) pick.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return pick.map((x, i) => ({ ...x, i, prog: Math.min(x.need, st.n[x.k] - q.base[x.k]), claimed: q.claimed.includes(i) }));
}
export function claimQuest(st, i) {
  const x = quests(st)[i];
  if (x.claimed || x.prog < x.need) throw new Error('Not done yet.');
  st.quests.claimed.push(i); pay(st, x);
  if (st.quests.claimed.length === 3) st.quests = { round: st.quests.round + 1, base: { ...st.n }, claimed: [] };
  return `Quest done: ${reward(x)}.`;
}

// ---- achievements ----
const best = (st, f) => Math.max(0, ...st.pets.map((p) => f(p.stats)));
export const ACH = [
  { id: 'evolve', icon: '🧬', label: 'First Evolution', test: (st) => st.n.evolve >= 1, gems: 3 },
  { id: 'pets3', icon: '🐾', label: 'Own 3 pets', test: (st) => st.pets.filter((p) => p.stats.alive).length >= 3, coins: 60 },
  { id: 'breed', icon: '💞', label: 'First Breeding', test: (st) => st.n.breed >= 1, gems: 3 },
  { id: 'earn', icon: '💰', label: 'Earn 100 coins in the City', test: (st) => st.n.earned >= 100, gems: 2 },
  { id: 'games', icon: '🎮', label: 'Play 5 mini-games', test: (st) => st.n.games >= 5, coins: 40 },
  { id: 'lv5', icon: '👑', label: 'Reach Lv. 5', test: (st) => best(st, level) >= 5, coins: 50 },
  { id: 'streak', icon: '🔥', label: '20-tick care streak', test: (st) => best(st, (s) => s.best_streak) >= 20, gems: 2 },
  { id: 'elder', icon: '🌕', label: 'Raise an Elder', test: (st) => best(st, (s) => s.tier) >= 3, gems: 10 },
];
export const achs = (st) => ACH.map((a) => ({ ...a, done: a.test(st), claimed: st.ach.includes(a.id) }));
export function claimAch(st, id) {
  const a = achs(st).find((x) => x.id === id);
  if (!a.done || a.claimed) throw new Error('Not unlocked yet.');
  st.ach.push(id); pay(st, a);
  return `${a.label}: ${reward(a)}.`;
}

// ---- leaderboard: your pets vs seeded bots, by level then listed value ----
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function leaderboard(st) {
  const r = rng(st.seedU ^ 0x5eed);
  const bots = Array.from({ length: 7 }, (_, i) => {
    const dna = Math.floor(r() * 2 ** 32) >>> 0, tier = Math.floor(r() * 4), xp = [5, 25, 70, 160][tier] + Math.floor(r() * 30);
    const w = () => Array.from({ length: 4 }, () => B58[Math.floor(r() * 58)]).join('');
    return { name: lookOf(dna).name, owner: `${w()}…${w()}`, dna, lv: 1 + Math.floor(xp / 10), value: valueOf({ tier, best_streak: Math.floor(r() * 60) }) };
  });
  const mine = st.pets.filter((p) => p.stats.alive).map((p) => ({ name: name(p), owner: 'you', dna: p.dna, lv: level(p.stats), value: valueOf(p.stats), you: true }));
  return [...mine, ...bots].sort((a, b) => b.lv - a.lv || b.value - a.value);
}

export const name = (p) => p.name || lookOf(p.dna).name;
const reward = (x) => [x.coins && `+${x.coins} coins`, x.gems && `+${x.gems} gems`].filter(Boolean).join(' ');
const pay = (st, x) => { st.coins += x.coins || 0; st.gems += x.gems || 0; }; // TODO(solana): reward vault payout
