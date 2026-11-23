// Market stats derived from on-chain price history (each point = one sale: time + price). No indexer.
import { amount, skillKey, type Api, type Collection, type Point, type Skill } from "./assets";

export const RANGE = { "24H": 864e5, "7D": 6048e5, "30D": 2592e6, All: Infinity } as const;
export type Range = keyof typeof RANGE;

export interface Window { volume: number; sales: number; dVolume: number; dSales: number }
// volume/sales inside the window + % change vs the window before it
export function windowStats(h: Point[], range: Range, now = Date.now()): Window {
  const span = RANGE[range];
  const sum = (from: number, to: number) => h.reduce((a, [t, p]) => (t >= from && t < to ? [a[0] + amount(p), a[1] + 1] : a), [0, 0]);
  const [volume, sales] = sum(now - span, Infinity);
  if (span === Infinity) return { volume, sales, dVolume: 0, dSales: 0 };
  const [pv, ps] = sum(now - 2 * span, now - span);
  const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);
  return { volume, sales, dVolume: pct(volume, pv), dSales: pct(sales, ps) };
}

// daily volume buckets for sparklines/bars
export const daily = (h: Point[], days = 7, now = Date.now()) =>
  Array.from({ length: days }, (_, i) => {
    const to = now - (days - 1 - i) * 864e5, from = to - 864e5;
    return h.reduce((a, [t, p]) => (t >= from && t < to ? a + amount(p) : a), 0);
  });

export interface ColStats extends Window { c: Collection; skills: Skill[]; floor: number | null; supply: number; listed: number; trend: number[]; history: Point[] }
export function collectionStats(cols: Collection[], skills: Skill[], hist: Record<number, Point[]>, range: Range): ColStats[] {
  return cols.map((c) => {
    const ss = skills.filter((s) => s.collection === c.id);
    const history = ss.flatMap((s) => hist[s.id] ?? []).sort((a, b) => a[0] - b[0]);
    const floors = ss.map((s) => s.floor).filter((f): f is string => !!f).map(amount);
    return {
      c, skills: ss, history, ...windowStats(history, range), trend: daily(history, 7),
      floor: floors.length ? Math.min(...floors) : null,
      supply: ss.reduce((a, s) => a + s.minted, 0), listed: ss.reduce((a, s) => a + s.listed_qty, 0),
    };
  });
}

// one fetch for pages that need skills + collections + every skill's history
export async function loadMarket(a: Api) {
  const [skills, cols, presales] = await Promise.all([a.skills(), a.collections(), a.presales()]);
  const hist: Record<number, Point[]> = Object.fromEntries(await Promise.all(skills.map(async (s) => [s.id, await a.history(skillKey(s.id))])));
  return { skills, cols, presales, hist };
}

export interface Sale { t: number; price: string; key: string; skill?: Skill }
// global sales feed, newest first
export const salesFeed = (skills: Skill[], hist: Record<number, Point[]>, monsters: Point[] = []): Sale[] =>
  [...skills.flatMap((s) => (hist[s.id] ?? []).map(([t, price]) => ({ t, price, key: skillKey(s.id), skill: s }))),
   ...monsters.map(([t, price]) => ({ t, price, key: "monsters" }))].sort((a, b) => b.t - a.t);

export type PresaleState = "live" | "soon" | "ended";
export const presaleState = (p: { ended: boolean; start_ms: number; end_ms: number | null; cap_total: number | null; sold: number }, now = Date.now()): PresaleState =>
  p.ended || (p.end_ms && p.end_ms <= now) || (p.cap_total != null && p.sold >= p.cap_total) ? "ended" : p.start_ms > now ? "soon" : "live";
