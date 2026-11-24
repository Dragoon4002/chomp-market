// Staked matches this browser opened or joined, so a stake stuck on-chain (tab closed, server died) survives a reload.
// Same file in keyfall + coinflip clients (no shared client package to put it in).
export const EXPIRE_S = 7200; // chomp `cancel`: anyone may refund both seats once now > created + 2h

type Entry = { slug: string; id: number };
export type Chain = { a: string; b: string | null; stake: bigint; created: number };
export type Reclaim = { id: number; m: Chain; at: number }; // at = unix s when cancel opens (0 = now)

const mem = new Map<string, string>(); // localStorage throws in the sandboxed portal iframe
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return mem.get(k) ?? null; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { mem.set(k, v); } };
const key = (slug: string) => `chomp:matches:${slug}`;
export const saved = (slug: string): Entry[] => { try { return JSON.parse(get(key(slug)) ?? '[]') as Entry[]; } catch { return []; } };
const save = (slug: string, es: Entry[]) => put(key(slug), JSON.stringify(es));
export const remember = (slug: string, id: number) => save(slug, [...saved(slug).filter((e) => e.id !== id), { slug, id }]);
export const forget = (slug: string, id: number) => save(slug, saved(slug).filter((e) => e.id !== id));

// null = nothing `me` can cancel; else unix s from which cancel succeeds
export function reclaimAt(m: Chain, me: string): number | null {
  if (!m.b) return m.a === me ? 0 : null; // open seat: host only, anytime
  return m.created + EXPIRE_S; // filled: anyone, after expiry
}

// Re-read every saved match; closed accounts (settled/cancelled) are dropped from storage.
export async function reclaims(slug: string, me: string, read: (id: number) => Promise<Chain | null>): Promise<Reclaim[]> {
  const out: Reclaim[] = [];
  for (const { id } of saved(slug)) {
    const m = await read(id).catch(() => undefined); // RPC hiccup: keep the entry
    if (m === null) { forget(slug, id); continue; }
    const at = m && reclaimAt(m, me);
    if (m && at != null) out.push({ id, m, at });
  }
  return out;
}
