// Monster Siege sim: pure + deterministic. step(state, inputs) -> new state. 30 Hz, integer math, no clocks.
// Geometry from map.js (hex board, 1 hex = 1000 units). Units walk PATH by integer distance d (0 = seat 0 core, right).
// Spec numbers: ../INTAKE.md.
import { PATH_LEN, CORE, center, dropKind, pathPos } from './map.js?v=1';

// ---- genes: ported from games/brawler/client/src/lib/genes.ts (Dna, STAT_KEYS, rng, randomDna, nameFor, sanitize, SKILL_KINDS, sanitizeSkills) ----
export const STAT_KEYS = ['str', 'dex', 'def', 'spd'];
const STAT_SUM = 22;
// mulberry32
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
function normalize(d, r) {
  for (const k of STAT_KEYS) d[k] = Math.max(3, Math.min(9, Math.round(d[k])));
  let sum = STAT_KEYS.reduce((s, k) => s + d[k], 0);
  while (sum !== STAT_SUM) {
    const k = pick(r, STAT_KEYS);
    if (sum > STAT_SUM && d[k] > 3) { d[k]--; sum--; }
    else if (sum < STAT_SUM && d[k] < 9) { d[k]++; sum++; }
  }
  return d;
}
export function randomDna(seed) {
  const r = rng(seed);
  return normalize({
    str: int(r, 3, 9), dex: int(r, 3, 9), def: int(r, 3, 9), spd: int(r, 3, 9),
    hue: int(r, 0, 359), accent: int(r, 0, 359),
    horn: int(r, 0, 3), tail: int(r, 0, 2), pattern: int(r, 0, 2), eye: int(r, 0, 3),
    size: int(r, 92, 112),
  }, r);
}
const SYL = ['gro', 'mak', 'zu', 'rha', 'vel', 'tor', 'ki', 'bram', 'ox', 'nyx', 'pel', 'dra', 'su', 'qua', 'lor', 'fen'];
export function nameFor(seed) {
  const r = rng(seed ^ 0x9e3779b9);
  const n = pick(r, SYL) + pick(r, SYL) + (r() < 0.4 ? pick(r, SYL) : '');
  return n[0].toUpperCase() + n.slice(1);
}
// Trust boundary: DNA from a peer / storage / chain gets clamped into valid ranges.
export function sanitize(x) {
  const n = (v, lo, hi, dflt) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : dflt);
  return normalize({
    str: n(x?.str, 3, 9, 6), dex: n(x?.dex, 3, 9, 5), def: n(x?.def, 3, 9, 5), spd: n(x?.spd, 3, 9, 6),
    hue: n(x?.hue, 0, 359, 170), accent: n(x?.accent, 0, 359, 40),
    horn: n(x?.horn, 0, 3, 0), tail: n(x?.tail, 0, 2, 0), pattern: n(x?.pattern, 0, 2, 0), eye: n(x?.eye, 0, 3, 0),
    size: n(x?.size, 90, 115, 100),
  }, rng(1));
}
export const statsOf = (d) => ({ str: d.str, dex: d.dex, def: d.def, spd: d.spd });
export const SKILL_KINDS = ['Power', 'Agility', 'Durability', 'Speed', 'AirJump', 'Lifesteal', 'QuickDodge', 'SecondWind'];
const SKILL_SLOTS = 3, SKILL_STAT_MAX = 2, SKILL_TOTAL_MAX = 3, SKILL_FX_MAX = 2;
export function sanitizeSkills(x) {
  const out = [], per = [0, 0, 0, 0];
  let total = 0, fx = 0;
  if (!Array.isArray(x)) return out;
  for (const s of x) {
    if (out.length >= SKILL_SLOTS) break;
    const kind = s?.kind, i = SKILL_KINDS.indexOf(kind);
    if (i < 0) continue;
    if (i >= 4) {
      if (fx >= SKILL_FX_MAX || out.some((o) => o.kind === kind)) continue;
      fx++; out.push({ kind, mag: 1 }); continue;
    }
    const m = s.mag, v = m !== null && typeof m === 'object' ? NaN : +m;
    if (!Number.isFinite(v)) continue;
    const mag = Math.max(1, Math.min(2, Math.round(v)));
    if (per[i] + mag > SKILL_STAT_MAX || total + mag > SKILL_TOTAL_MAX) continue;
    per[i] += mag; total += mag; out.push({ kind, mag });
  }
  return out;
}
// ---- end port ----

// Highest stat sets the archetype; ties str > dex > spd > def.
const ARCH_OF = { str: 'cannon', dex: 'rapid', spd: 'sniper', def: 'bulwark' };
export function archetypeOf(d) {
  const top = ['str', 'dex', 'spd', 'def'].reduce((a, k) => (d[k] > d[a] ? k : a), 'str');
  return ARCH_OF[top];
}
export const COST = { cannon: 5, rapid: 3, sniper: 4, bulwark: 4, grunt: 2 };
export const GLYPH = { cannon: '◎', rapid: '⋯', sniper: '⌖', bulwark: '▣', grunt: '•' };
// Defender: dmg, fire rate x100 (/s), range (mt). Cannon splash r1, bulwark slows 30%.
const DEF = { cannon: [120, 67, 4000], rapid: [25, 400, 3500], sniper: [200, 33, 8000], bulwark: [40, 100, 3000] };
// Squad leader: hp, dmg, rate x100, move (mt/s), range (mt). Not in INTAKE; picked to match the role text.
const LEAD = { cannon: [4000, 220, 67, 800, 1500], rapid: [1500, 55, 300, 1300, 1500], sniper: [1800, 280, 50, 1800, 2500], bulwark: [5000, 70, 100, 900, 1000] };
const GRUNT = [600, 70, 100, 1200, 1000];

export const HZ = 30;
export const MATCH_T = 180 * HZ, OT_T = 60 * HZ, DOUBLE_T = MATCH_T - 60 * HZ;
export const CORE_HP = 3000, PAD_HP = 1200, E_MAX = 600; // energy in 1/60ths (1 per tick = +1 per 2 s)
export const APPLY_DELAY = 1; // live: plays apply at server tick + 1 (server/src/lib.rs)
const R_UNIT = 300, R_DEF = 600, R_CORE = 1000, SPLASH = 1000, HOP = 3000, SPAWN_D = 1500;
const FX = { AirJump: 1, Lifesteal: 2, QuickDodge: 4, SecondWind: 8 };
const coreXY = (seat) => center(...CORE[seat]);

const pct = (stat, mag) => 100 + 8 * (stat - 5) + 10 * mag;
function skillInfo(skills) {
  const mag = { Power: 0, Agility: 0, Durability: 0, Speed: 0 };
  let fx = 0;
  for (const s of skills) s.kind in FX ? (fx |= FX[s.kind]) : (mag[s.kind] += s.mag);
  return { mag, fx };
}
const cdOf = (rate100, p) => Math.max(1, Math.floor((HZ * 10000) / (rate100 * p)));

export function defenderStats(m) {
  const a = archetypeOf(m.dna), [dmg, rate, range] = DEF[a], { mag, fx } = skillInfo(m.skills), d = m.dna;
  const hp = Math.floor((PAD_HP * pct(d.def, mag.Durability)) / 100);
  return {
    arch: a, hp, max: hp, fx,
    dmg: Math.floor((dmg * pct(d.str, mag.Power)) / 100),
    cdMax: cdOf(rate, pct(d.dex, mag.Agility)),
    range: Math.floor((range * pct(d.spd, 0)) / 100) + 500 * mag.Speed,
  };
}
export function leaderStats(m) {
  const a = archetypeOf(m.dna), [hp, dmg, rate, move, range] = LEAD[a], { mag, fx } = skillInfo(m.skills), d = m.dna;
  const h = Math.floor((hp * pct(d.def, mag.Durability)) / 100);
  return {
    arch: a, hp: h, max: h, fx, range,
    dmg: Math.floor((dmg * pct(d.str, mag.Power)) / 100),
    cdMax: cdOf(rate, pct(d.dex, mag.Agility)),
    spd: Math.floor((move * pct(d.spd, mag.Speed)) / 100 / HZ),
  };
}

const cleanMon = (m) => (m && m.dna ? { name: String(m.name ?? '?').slice(0, 24), dna: sanitize(m.dna), skills: sanitizeSkills(m.skills) } : null);

// Demo monsters for the no-wallet loadout, fixed seeds. Skills picked from the same seed.
export function demoMonster(seed) {
  const r = rng(seed * 7919 + 13);
  const skills = sanitizeSkills([{ kind: SKILL_KINDS[int(r, 0, 3)], mag: int(r, 1, 2) }, { kind: SKILL_KINDS[int(r, 4, 7)], mag: 1 }]);
  return { name: nameFor(seed), dna: randomDna(seed), skills };
}
export function demoLoadout(base) {
  const ms = Array.from({ length: 7 }, (_, i) => demoMonster(base + i));
  return { deck: ms.slice(0, 7).concat([null]) };
}

function shuffle(r, xs) {
  for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; }
  return xs;
}
const nextRand = (s) => { const r = rng(s.rs); const v = r(); s.rs = (s.rs + 0x6d2b79f5) >>> 0; return v; }; // same stream as rng(seed)

// seed: u32. loadouts: [{deck:[m|null x8]}, ...] (sanitized here: trust boundary for live peers).
export function newMatch(seed, loadouts) {
  // TODO(solana): VRF deck order seed (free play uses the session seed).
  const r = rng(seed);
  const P = [0, 1].map((seat) => {
    const l = loadouts[seat] ?? {};
    const cards = Array.from({ length: 8 }, (_, i) => {
      const m = cleanMon(l.deck?.[i]);
      const arch = m ? archetypeOf(m.dna) : 'grunt';
      return { arch, cost: COST[arch], m };
    });
    const order = shuffle(r, [0, 1, 2, 3, 4, 5, 6, 7]);
    return {
      e: 5 * 60, cards, hand: order.slice(0, 4), q: order.slice(4),
      core: CORE_HP, kills: 0, defs: [], // defs: defenders placed this match (one per hex, removed when destroyed)
    };
  });
  return { t: 0, rs: (seed ^ 0xa5a5a5a5) >>> 0, nid: 1, P, units: [], fx: [], over: null };
}

const d2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
const inR = (ax, ay, bx, by, r) => d2(ax, ay, bx, by) <= r * r;

const setD = (u, d) => { u.d = Math.max(0, Math.min(PATH_LEN, d)); [u.x, u.y] = pathPos(u.d); };

// Attack: leader + 3 minions (or 3 grunts) at the player's own core, walking the path toward the enemy core.
function spawn(s, seat, card) {
  const sq = s.nid, lead = card.m ? leaderStats(card.m) : null, dir = seat ? -1 : 1, d0 = seat ? PATH_LEN - SPAWN_D : SPAWN_D;
  const hue = card.m ? card.m.dna.hue : 0, accent = card.m ? card.m.dna.accent : 0;
  const mk = (st, isLead, back) => {
    const u = { id: s.nid++, seat, sq, lead: isLead, arch: isLead ? st.arch : 'minion', from: card.arch, dir,
      hp: st.hp, max: st.max, dmg: st.dmg, cd: st.cdMax, cdMax: st.cdMax, spd: st.spd, range: st.range,
      fx: isLead ? st.fx : st.fx & ~FX.SecondWind, hue, accent, hits: 0, revived: 0, jumped: 0, guard: 0, atk: 0 };
    setD(u, d0 - dir * back);
    s.units.push(u);
  };
  let mini;
  if (lead) {
    mk(lead, true, 0);
    mini = { ...lead, hp: Math.floor((lead.hp * 40) / 100), max: Math.floor((lead.max * 40) / 100), dmg: Math.floor((lead.dmg * 40) / 100) };
  } else {
    const [hp, dmg, rate, move, range] = GRUNT;
    mini = { hp, max: hp, dmg, cdMax: cdOf(rate, 100), spd: Math.floor(move / HZ), range, fx: 0 };
  }
  for (const k of [1, 2, 3]) mk(mini, false, k * 350 + Math.floor(nextRand(s) * 150)); // minions trail the leader
}
// Defend: the monster is stationed on the hex for the rest of the match (or until destroyed).
function place(s, seat, card, hx, hy) {
  const [x, y] = center(hx, hy);
  s.P[seat].defs.push({ ...defenderStats(card.m), m: card.m, id: s.nid++, hx, hy, x, y, cd: 0, revived: 0, hits: 0 });
}

// Apply damage; returns dealt amount (0 = dodged).
function hurt(s, tgt, dmg) {
  if (tgt.fx & FX.QuickDodge && ++tgt.hits % 5 === 0) { s.fx.push({ k: 'miss', x: tgt.x, y: tgt.y }); return 0; }
  if (tgt.guard) dmg = Math.floor((dmg * 70) / 100);
  tgt.hp -= dmg;
  if (tgt.hp <= 0 && tgt.fx & FX.SecondWind && !tgt.revived) { tgt.revived = 1; tgt.hp = Math.floor((tgt.max * 30) / 100); s.fx.push({ k: 'revive', x: tgt.x, y: tgt.y }); }
  return dmg;
}
function leech(src, dealt) {
  if (src.fx & FX.Lifesteal && dealt > 0) src.hp = Math.min(src.max, src.hp + Math.floor((dealt * 15) / 100));
}

// Units only fight what is in range from the path: preferred enemy bulwark leader, else nearest enemy unit
// (snipers skip units), else nearest enemy defender, else the enemy core. null = keep walking.
function pickTarget(s, u) {
  const foe = 1 - u.seat;
  let best = null, bd = Infinity, bul = false;
  if (u.arch !== 'sniper') for (const v of s.units) {
    if (v.seat === u.seat || v.hp <= 0 || !inR(u.x, u.y, v.x, v.y, u.range + R_UNIT)) continue;
    const dd = d2(u.x, u.y, v.x, v.y), vb = v.lead && v.arch === 'bulwark';
    if ((vb && !bul) || (vb === bul && dd < bd)) { best = { k: 'u', v, x: v.x, y: v.y }; bd = dd; bul = vb; }
  }
  if (best) return best;
  for (const p of s.P[foe].defs) {
    if (p.hp <= 0 || !inR(u.x, u.y, p.x, p.y, u.range + R_DEF)) continue;
    const dd = d2(u.x, u.y, p.x, p.y);
    if (dd < bd) { best = { k: 'p', v: p, x: p.x, y: p.y }; bd = dd; }
  }
  if (best) return best;
  const [cx, cy] = coreXY(foe);
  return inR(u.x, u.y, cx, cy, u.range + R_CORE) ? { k: 'c', x: cx, y: cy } : null;
}

// Role of a play: 'attack' (any path hex), 'defend' (free own-zone ground, monsters only) or null (rejected).
export function dropOf(s, seat, ci, hx, hy) {
  const p = s.P[seat], kind = p && dropKind(seat, hx, hy);
  if (!kind || !p.hand.includes(ci)) return null;
  if (kind === 'defend' && (!p.cards[ci].m || p.defs.some((d) => d.hx === hx && d.hy === hy))) return null; // grunts: path only
  return kind;
}

export function step(prev, inputs = []) {
  const s = structuredClone(prev);
  if (s.over) return s;
  s.fx = [];
  // 1. card plays {seat, card, x2, y}: role by drop hex (map.dropKind). Invalid / unaffordable plays are ignored
  //    (no energy spent, card stays in hand), same on every client.
  for (const inp of inputs) {
    const seat = inp?.seat, ci = inp?.card, hx = inp?.x2, hy = inp?.y;
    if ((seat !== 0 && seat !== 1) || ![ci, hx, hy].every(Number.isInteger)) continue;
    const p = s.P[seat], h = p.hand.indexOf(ci), kind = dropOf(s, seat, ci, hx, hy);
    if (!kind) continue;
    const card = p.cards[ci];
    if (p.e < card.cost * 60) continue;
    p.e -= card.cost * 60;
    p.hand[h] = p.q.shift();
    p.q.push(ci);
    // TODO(solana): ER (optional, phase 3) write this card play to a delegated match PDA for an on-chain tape.
    if (kind === 'attack') spawn(s, seat, card); else place(s, seat, card, hx, hy);
  }
  // 2. energy
  const gain = s.t >= DOUBLE_T ? 2 : 1;
  for (const p of s.P) p.e = Math.min(E_MAX, p.e + gain);
  // 3. defenders shoot
  for (let seat = 0; seat < 2; seat++) for (const p of s.P[seat].defs) {
    if (p.cd > 0) { p.cd--; continue; }
    const px = p.x, py = p.y;
    let tgt = null, bd = Infinity, bul = false;
    for (const v of s.units) {
      if (v.seat === seat || v.hp <= 0 || !inR(px, py, v.x, v.y, p.range + R_UNIT)) continue;
      const dd = d2(px, py, v.x, v.y), vb = v.lead && v.arch === 'bulwark';
      if ((vb && !bul) || (vb === bul && dd < bd)) { tgt = v; bd = dd; bul = vb; }
    }
    if (!tgt) continue;
    p.cd = p.cdMax;
    s.fx.push({ k: 'shot', a: p.arch, x1: px, y1: py, x: tgt.x, y: tgt.y, seat });
    let dealt = 0;
    if (p.arch === 'cannon') {
      s.fx.push({ k: 'splash', x: tgt.x, y: tgt.y });
      for (const v of s.units) if (v.seat !== seat && v.hp > 0 && inR(tgt.x, tgt.y, v.x, v.y, SPLASH)) dealt += hurt(s, v, p.dmg);
    } else dealt = hurt(s, tgt, p.dmg);
    leech(p, dealt);
  }
  // 4. units: attack what is in range, else walk the path
  for (const u of s.units) {
    if (u.hp <= 0) continue;
    let tgt = pickTarget(s, u);
    if (tgt?.k === 'p' && u.fx & FX.AirJump && !u.jumped) { // AirJump: hop 3 hexes down the path past the first defender met
      u.jumped = 1; setD(u, u.d + u.dir * HOP); s.fx.push({ k: 'hop', x: u.x, y: u.y });
      tgt = pickTarget(s, u);
    }
    if (u.cd > 0) u.cd--;
    u.atk = 0;
    if (tgt) {
      if (u.cd > 0) continue;
      u.cd = u.cdMax; u.atk = 1;
      s.fx.push({ k: 'hit', x: tgt.x, y: tgt.y, x1: u.x, y1: u.y, seat: u.seat });
      if (tgt.k === 'c') { const foe = s.P[1 - u.seat]; const d = Math.min(foe.core, u.dmg); foe.core -= d; leech(u, d); }
      else {
        leech(u, hurt(s, tgt.v, u.dmg));
        if (tgt.k === 'p' && tgt.v.hp <= 0) { tgt.v.hp = 0; s.P[u.seat].kills++; s.fx.push({ k: 'padDead', x: tgt.x, y: tgt.y }); }
      }
      continue;
    }
    let spd = u.spd;
    for (const p of s.P[1 - u.seat].defs) if (p.hp > 0 && p.arch === 'bulwark' && inR(p.x, p.y, u.x, u.y, p.range + R_UNIT)) {
      spd = Math.floor((spd * 70) / 100); break;
    }
    setD(u, u.d + u.dir * spd);
  }
  // 5. deaths: leader gone -> its minions take -30% damage; destroyed defenders free their hex
  for (const u of s.units) if (u.hp <= 0) {
    s.fx.push({ k: 'die', x: u.x, y: u.y });
    if (u.lead) for (const v of s.units) if (v.sq === u.sq) v.guard = 1;
  }
  s.units = s.units.filter((u) => u.hp > 0);
  for (const p of s.P) p.defs = p.defs.filter((d) => d.hp > 0);
  s.t++;
  s.over = verdict(s);
  return s;
}

function verdict(s) {
  const [a, b] = [s.P[0].core, s.P[1].core]; // same max, so HP % compares as raw HP
  if (a <= 0 || b <= 0) return { winner: a <= 0 && b <= 0 ? null : a > 0 ? 0 : 1, reason: 'core' };
  if (s.t < MATCH_T) return null;
  if (a !== b) return { winner: a > b ? 0 : 1, reason: s.t === MATCH_T ? 'time' : 'overtime' };
  if (s.t >= MATCH_T + OT_T) return { winner: null, reason: 'draw' };
  return null; // overtime: first core damage wins
}

// Chomp.result score: own core HP % x100 + enemy defenders destroyed x500.
export const scoreOf = (s, seat) => Math.floor((s.P[seat].core * 10000) / CORE_HP) + s.P[seat].kills * 500;
