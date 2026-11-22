import { breed, nameFor, randomDna, sanitize, type Monster } from './genes.ts';

const KEY = 'ba.monsters.v1';
const HISTORY = 'ba.history.v1';
export interface MatchLog {
  at: number; mine: string; vs: string; won: boolean; mode: 'local' | 'online';
  kos?: number; vsAccount?: string; stake?: string; matchId?: number | null; tournament?: boolean;
}

const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? '') as T; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const newSeed = () => (crypto.getRandomValues(new Uint32Array(1))[0]);

function hatch(seed: number, gen = 0, parents: Monster['parents'] = null, dna = randomDna(seed)): Monster {
  return { id: seed.toString(36), name: nameFor(seed), gen, parents, born: Date.now(), record: { w: 0, l: 0, ko: 0 }, dna };
}

export function monsters(): Monster[] {
  let list = read<Monster[]>(KEY, []);
  if (!Array.isArray(list) || !list.length) { list = [hatch(newSeed()), hatch(newSeed()), hatch(newSeed())]; write(KEY, list); }
  return list.map((m) => ({ ...m, dna: sanitize(m.dna) }));
}
export const monster = (id: string) => monsters().find((m) => m.id === id) ?? null;

export function breedPair(a: Monster, b: Monster) {
  const seed = newSeed();
  const { dna, mutated } = breed(a.dna, b.dna, seed);
  const child = hatch(seed, Math.max(a.gen, b.gen) + 1, [a.id, b.id], dna);
  write(KEY, [...monsters(), child]);
  return { child, mutated };
}

export function recordResult(id: string, won: boolean, kos: number, vs: string, mode: MatchLog['mode'], extra: Partial<MatchLog> = {}) {
  write(KEY, monsters().map((m) => (m.id === id ? { ...m, record: { w: m.record.w + +won, l: m.record.l + +!won, ko: m.record.ko + kos } } : m)));
  write(HISTORY, [{ ...extra, at: Date.now(), mine: id, vs, won, mode, kos }, ...history()].slice(0, 200));
}
export const history = () => read<MatchLog[]>(HISTORY, []);
