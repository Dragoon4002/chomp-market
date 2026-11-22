// NPC skill merchants: each is its own testnet wallet that mints stock from presales, prices it with pricing.ts,
// re-lists when the price moves, and buys back cheap player listings. Run alone: `node merchant.ts` (ONCE=1 for one pass).
import fs from 'node:fs';
import os from 'node:os';
import { balance, signer, view } from './near.ts';
import { near2yocto, price, RESERVE, restock, soldSince, targetFor, yocto2near } from './pricing.ts';

const env = process.env;
const M = env.ASSETS_ID ?? 'v2.brawler-monsters-5c8e2b.testnet';
const STORAGE = 20n * 10n ** 21n; // 0.02 N, contract refunds the unused part
const CATALOG: Record<string, number[]> = { smithy: [0, 1, 2, 3, 4, 5, 6, 7], alchemist: [8, 9, 10, 11] }; // by account prefix
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

const keyOf = (id: string): string => JSON.parse(env.MERCHANT_KEYS || '{}')[id]
  ?? JSON.parse(fs.readFileSync(`${os.homedir()}/.near-credentials/testnet/${id}.json`, 'utf8')).private_key;

interface Presale { id: number; skill: number; price: string; start_ms: number; end_ms: number | null; cap_total: number | null; per_wallet: number | null; sold: number; ended: boolean }
interface Listing { seller: string; skill: number; qty: number; price_each: string }

export function merchant(id: string, all: string[]) {
  const w = signer(id, keyOf(id));
  const skills = CATALOG[id.split('.')[0]] ?? [];
  const tag = id.split('.')[0];
  const last = new Map<number, number>();
  return async function tick() {
    const [presales, held, bal] = await Promise.all([view<Presale[]>(M, 'presales', { from: 0, limit: 50 }), view<[number, number, number][]>(M, 'skills_of', { account_id: id }), balance(id)]);
    let cash = yocto2near(bal);
    const now = Date.now();
    for (const skill of skills) {
      const p = presales.find((x) => x.skill === skill);
      if (!p) continue;
      const base = yocto2near(p.price), target = targetFor(base);
      const [, free = 0, listed = 0] = held.find(([s]) => s === skill) ?? [];
      let stock = free + listed;
      const [hist, listings] = await Promise.all([view<[number, string][]>(M, 'price_history', { key: `skill:${skill}` }), view<Listing[]>(M, 'skill_listings', { skill, from: 0, limit: 50 })]);
      const soldLastHour = soldSince(hist, base, now);
      if (last.has(skill) && last.get(skill)! > stock) log(`${tag} skill ${skill}: sold ${last.get(skill)! - stock} since last tick`);
      const shelf = () => ({ base, stock, target, soldLastHour, cash });
      try {
        const live = !p.ended && p.start_ms <= now && (!p.end_ms || p.end_ms > now);
        if (live && restock(shelf())) {
          const bought = p.per_wallet == null ? 0 : await view<number>(M, 'presale_bought', { id: p.id, account_id: id });
          const n = Math.min(restock(shelf()), (p.per_wallet ?? Infinity) - bought, (p.cap_total ?? Infinity) - p.sold);
          if (n > 0) {
            const tx = await w.call(M, 'buy_presale', { id: p.id, qty: n }, BigInt(p.price) * BigInt(n) + STORAGE);
            stock += n; cash -= base * n;
            log(`${tag} restocked ${n}× skill ${skill} @ ${base} ${tx}`);
          }
        }
        const bid = price(shelf()).bid;
        for (const l of listings.filter((l) => !all.includes(l.seller) && bid && yocto2near(l.price_each) <= bid).sort((a, b) => yocto2near(a.price_each) - yocto2near(b.price_each))) {
          const each = yocto2near(l.price_each);
          const n = Math.min(l.qty, Math.floor((cash - RESERVE) / each), 2 * target - stock);
          if (n <= 0) break;
          const tx = await w.call(M, 'buy_skill', { seller: l.seller, skill, qty: n }, BigInt(l.price_each) * BigInt(n) + STORAGE);
          stock += n; cash -= each * n;
          log(`${tag} bought back ${n}× skill ${skill} from ${l.seller} @ ${each} ${tx}`);
        }
        const q = price(shelf());
        const mine = listings.find((l) => l.seller === id);
        const moved = !mine || Math.abs(yocto2near(mine.price_each) - q.ask) / q.ask > 0.03 || mine.qty !== stock;
        if (stock > 0 && moved) log(`${tag} skill ${skill}: ${q.why} ${await w.call(M, 'list_skill', { skill, qty: stock, price_each: near2yocto(q.ask) }, STORAGE)}`);
        else log(`${tag} skill ${skill}: ${q.why} (unchanged)`);
      } catch (e) { log(`${tag} skill ${skill}: ${(e as Error).message}`); }
      last.set(skill, stock);
    }
  };
}

export function merchants(ids = (env.MERCHANTS ?? '').split(',').map((s) => s.trim()).filter(Boolean), every = Number(env.MERCHANT_EVERY_S ?? 120) * 1000) {
  const ticks = ids.map((id) => merchant(id, ids));
  const run = () => Promise.all(ticks.map((t, i) => t().catch((e) => log(`${ids[i]}: ${(e as Error).message}`))));
  if (ids.length) log(`merchants: ${ids.join(', ')} every ${every / 1000}s`);
  return env.ONCE === '1' ? run() : run().then(() => setInterval(run, every));
}

if (process.argv[1]?.endsWith('merchant.ts')) merchants();
