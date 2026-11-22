"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { BRAWLER_URL, change24, fmt, KIND_DESC, KIND_LABEL, amount, skillKey, toYocto, useAssets, type Point, type Presale, type SkillListing } from "@/lib/assets";
import { MERCHANTS, merchantName, reasoning } from "@/lib/merchants";
import { act, Btn, Chip, cx, Empty, Field, inputCls, Loading, MonsterArt, Panel, Pct, prices, RARITY_TEXT, SkillArt, Sparkline, STATS, useLoad } from "@/components/ui";

const RANGES = [["24H", 864e5], ["3D", 2592e5], ["All", Infinity]] as const;

function Chart({ h }: { h: Point[] }) {
  const [r, setR] = useState(2);
  const cut = Date.now() - RANGES[r][1];
  const pts = h.filter(([t]) => t >= cut);
  const xs = prices(pts.length > 1 ? pts : h.slice(-2));
  return (
    <Panel className="p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted">Last sale</p>
          <p className="font-display text-4xl">{xs.length ? xs[xs.length - 1].toFixed(3) : "—"} <span className="text-2xl text-muted">SOL</span></p>
        </div>
        <div className="flex gap-1.5">{RANGES.map(([l], i) => <Chip key={l} on={r === i} onClick={() => setR(i)}>{l}</Chip>)}</div>
      </div>
      {h.length < 2 ? <Empty>No sales yet.</Empty> : (
        <div className="relative">
          <Sparkline data={xs} className="h-48 sm:h-64" />
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between text-[11px] font-extrabold text-muted/80">
            <span>{Math.max(...xs).toFixed(3)}</span><span>{Math.min(...xs).toFixed(3)}</span>
          </div>
        </div>
      )}
      <div className="mt-2 flex justify-between text-xs font-bold text-muted">
        <span>{pts[0] ? new Date(pts[0][0]).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</span><span>now</span>
      </div>
    </Panel>
  );
}

const Stat = ({ k, v, className }: { k: string; v: React.ReactNode; className?: string }) => (
  <div className={cx("rounded-2xl border-3 border-ink bg-sky-0/60 px-3 py-2", className)}><p className="text-[11px] font-extrabold uppercase tracking-wider text-muted">{k}</p><p className="font-display text-xl">{v}</p></div>
);

function MerchantBadge({ l, h, presales }: { l: SkillListing; h: Point[]; presales: Presale[] }) {
  const [q] = useLoad(() => reasoning(l.seller, l.skill, h, presales), [l.seller, l.skill, l.price_each]);
  return (
    <span className="group relative ml-2 inline-block align-middle">
      <button type="button" data-why className="rounded-md border-2 border-ink bg-teal px-1.5 text-[11px] font-extrabold uppercase leading-5 text-ink">Merchant (NPC)</button>
      <span role="tooltip" className="pointer-events-none invisible absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border-3 border-ink bg-panel-2 p-3 text-sm font-bold text-cream opacity-0 shadow-drop transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <span className="block font-display text-base">{merchantName(l.seller)} prices by rule</span>
        {q ? <>{q.why}.{Math.abs(q.ask - amount(l.price_each)) / q.ask > 0.03 && <span className="mt-1 block text-muted">Listed at {fmt(l.price_each)}; re-lists on its next 2-min tick (when off by &gt;3%).</span>}</> : "Working it out…"}
        <span className="mt-1 block text-xs text-muted">Recomputed here from public chain data with the bot&apos;s own rules file.</span>
      </span>
    </span>
  );
}

function Buy({ l, me, onDone, h, presales }: { l: SkillListing; me: boolean; onDone: () => void; h: Point[]; presales: Presale[] }) {
  const a = useAssets();
  const [q, setQ] = useState(1);
  const max = Number(l.qty);
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border-3 border-ink bg-panel-2 p-3">
      <span className="min-w-0 flex-1 basis-32">
        <span className="block truncate font-bold">{me ? "You" : MERCHANTS.includes(l.seller) ? merchantName(l.seller) : l.seller}</span>
        <span className="text-sm font-extrabold text-muted">{l.qty} available</span>{MERCHANTS.includes(l.seller) && <MerchantBadge l={l} h={h} presales={presales} />}
      </span>
      <span className="font-display text-xl tabular-nums">{fmt(l.price_each)} SOL</span>
      {me ? <Btn small tone="ghost" onClick={() => act(() => a.cancelSkillListing(l.skill), "Listing cancelled.", onDone)}>Cancel</Btn> : (
        <span className="flex w-full items-center gap-2 sm:w-auto">
          <input type="number" min={1} max={max} value={q} onChange={(e) => setQ(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} aria-label="Quantity" className={cx(inputCls, "h-9 w-16 px-2 text-center")} />
          <Btn small className="flex-1 sm:flex-none" onClick={() => act(() => a.buySkill(l, q), `Bought ${q}.`, onDone)} disabled={!a.account}>Buy {fmt(BigInt(l.price_each) * BigInt(q))}</Btn>
        </span>
      )}
    </li>
  );
}

function SkillItem({ id }: { id: number }) {
  const a = useAssets();
  const [d, reload] = useLoad(async () => {
    const [skills, cols, h, ls, mine, ps] = await Promise.all([a.skills(), a.collections(), a.history(skillKey(id)), a.skillListings(id), a.holdings(), a.presales()]);
    return { s: skills.find((x) => x.id === id), cols, h, ls, ps, held: mine.find((x) => x.skill === id), presale: ps.find((p) => p.skill === id && !p.ended && (!p.end_ms || p.end_ms > Date.now())) };
  }, [id, a.account]);
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  if (!d) return <Loading />;
  const { s, h, ls, held } = d;
  if (!s) return <Empty>Skill not found.</Empty>;
  const col = d.cols.find((c) => c.id === s.collection);
  const free = Number(held?.free ?? 0);
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex items-center gap-4 sm:gap-5">
          <SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={88} />
          <div className="min-w-0">
            <p className={cx("text-sm font-extrabold uppercase tracking-wider", RARITY_TEXT[s.rarity])}>{s.rarity} · {KIND_LABEL[s.kind]}{s.mag > 1 && " ×2"}</p>
            <h1 className="text-4xl drop-shadow-[0_4px_0_var(--color-ink)] sm:text-5xl">{s.name}</h1>
            <p className="mt-1 font-bold text-muted">{KIND_DESC[s.kind].replace("+", s.mag > 1 ? "+2 " : "+1 ")}</p>
          </div>
        </div>
        <Chart h={h} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat k="Floor" v={s.floor ? `${fmt(s.floor)} SOL` : "—"} />
          <Stat k="24h" v={<Pct v={change24(h)} />} />
          <Stat k="Listed" v={s.listed_qty} />
          <Stat k="Minted" v={`${s.minted}${s.max_supply ? ` / ${s.max_supply}` : ""}`} />
        </div>
        <Panel className="p-4 sm:p-5">
          <h2 className="mb-3 text-2xl">Listings</h2>
          {ls.length ? <ul className="flex flex-col gap-2.5">{ls.map((l) => <Buy key={l.seller} l={l} me={l.seller === a.account} onDone={reload} h={h} presales={d.ps} />)}</ul> : <Empty>No one is selling right now.</Empty>}
        </Panel>
      </div>
      <aside className="flex flex-col gap-5">
        {d.presale && (
          <Link href={`/collection?id=${s.collection}`} className="rounded-3xl border-3 border-ink bg-gradient-to-br from-ember to-gold p-5 text-ink shadow-drop transition hover:-translate-y-1">
            <p className="text-xs font-extrabold uppercase tracking-wider">{d.presale.start_ms > Date.now() ? "Presale soon" : "Presale live"}</p>
            <p className="font-display text-3xl">{fmt(d.presale.price)} SOL each</p>
            <p className="font-bold">{d.presale.cap_total ? `${d.presale.sold}/${d.presale.cap_total} minted` : "Always in stock"} → Mint</p>
          </Link>
        )}
        <Panel className="p-5">
          <h2 className="text-2xl">List yours</h2>
          <p className="mt-1 text-sm font-bold text-muted">You have {free} free{held && Number(held.listed) ? `, ${held.listed} listed` : ""}{held?.equipped ? `, ${held.equipped} equipped` : ""}.</p>
          <form className="mt-4 grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); act(() => a.listSkill(id, Number(qty), toYocto(price)), "Listed.", reload); }}>
            <Field label="Quantity"><input className={inputCls} type="number" min={1} max={free} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
            <Field label="Price each (SOL)"><input className={inputCls} type="number" min="0.001" step="0.001" inputMode="decimal" placeholder={s.floor ? amount(s.floor).toFixed(3) : "0.5"} value={price} onChange={(e) => setPrice(e.target.value)} required /></Field>
            <Btn className="col-span-2" disabled={!free || !a.account}>{free ? "List for sale" : "None to list"}</Btn>
          </form>
        </Panel>
        <Panel className="p-5 text-sm font-bold">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted">Collection</dt><dd className="truncate text-right"><Link className="text-gold hover:underline" href={`/collection?id=${s.collection}`}>{col?.name}</Link></dd>
            <dt className="text-muted">Creator</dt><dd className="truncate text-right">{s.creator}</dd>
            <dt className="text-muted">Royalty</dt><dd className="text-right">{s.royalty_bps / 100}%</dd>
            <dt className="text-muted">Token</dt><dd className="text-right">skill:{s.id}</dd>
          </dl>
        </Panel>
      </aside>
    </div>
  );
}

function MonsterItem({ id }: { id: string }) {
  const a = useAssets();
  const [d, reload] = useLoad(async () => ({ m: await a.monster(id), h: await a.history("monsters"), skills: await a.skills() }), [id, a.account]);
  const [price, setPrice] = useState("");
  if (!d) return <Loading />;
  const { m } = d;
  if (!m) return <Empty>Monster not found.</Empty>;
  const mine = m.owner_id === a.account;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex items-center gap-4 sm:gap-5">
          <MonsterArt dna={m.dna} size={96} />
          <div className="min-w-0">
            <p className="text-sm font-extrabold uppercase tracking-wider text-teal">Monster #{m.token_id} · Gen {m.gen}</p>
            <h1 className="text-4xl drop-shadow-[0_4px_0_var(--color-ink)] sm:text-5xl">{m.name}</h1>
            <p className="mt-1 truncate font-bold text-muted">Owned by {mine ? "you" : m.owner_id}</p>
          </div>
        </div>
        <Panel className="p-5">
          <h2 className="mb-4 text-2xl">Stats</h2>
          <div className="flex flex-col gap-3">
            {STATS.map(([k, t, bg]) => {
              const bonus = m.skills.filter((s) => ({ Power: "str", Agility: "dex", Durability: "def", Speed: "spd" } as Record<string, string>)[s.kind] === k).reduce((x, s) => x + s.mag, 0);
              return (
                <div key={k} className="flex items-center gap-3">
                  <span className={cx("w-10 font-display text-lg uppercase", t)}>{k}</span>
                  <span className="relative h-5 flex-1 overflow-hidden rounded-full border-3 border-ink bg-sky-0">
                    <span className={cx("absolute inset-y-0 left-0", bg)} style={{ width: `${(m.dna[k] / 11) * 100}%` }} />
                    {bonus > 0 && <span className={cx("absolute inset-y-0 opacity-50", bg)} style={{ left: `${(m.dna[k] / 11) * 100}%`, width: `${(bonus / 11) * 100}%` }} />}
                  </span>
                  <span className="w-12 text-right font-display text-lg">{m.dna[k]}{bonus > 0 && <span className="text-up">+{bonus}</span>}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Stat k="Wins" v={m.record.w} /><Stat k="Losses" v={m.record.l} /><Stat k="KOs" v={m.record.ko} />
          </div>
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-3 text-2xl">Equipped skills</h2>
          <p className="mb-3 text-sm font-bold text-muted">Loadouts travel with the monster: the buyer gets these equipped.</p>
          {m.skills.length ? <div className="flex flex-wrap gap-2">{m.skills.map((x, i) => {
            const s = d.skills.find((y) => y.id === x.id);
            return <Link key={i} href={`/item?id=skill:${x.id}`} className="flex items-center gap-2 rounded-2xl border-3 border-ink bg-panel-2 py-1.5 pl-1.5 pr-3 font-bold hover:bg-sky-2"><SkillArt kind={x.kind} rarity={s?.rarity ?? "Common"} size={32} mag={x.mag} />{s?.name ?? KIND_LABEL[x.kind]}</Link>;
          })}</div> : <Empty>No skills equipped.</Empty>}
        </Panel>
      </div>
      <aside className="flex flex-col gap-5">
        <Panel className="p-5">
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted">{m.price ? "Price" : "Not for sale"}</p>
          <p className="font-display text-5xl">{m.price ? <>{fmt(m.price)} <span className="text-3xl text-muted">SOL</span></> : "—"}</p>
          {mine ? (
            m.price ? <Btn className="mt-4 w-full" tone="ghost" onClick={() => act(() => a.delistMonster(m.token_id), "Delisted.", reload)}>Delist</Btn> : (
              <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); act(() => a.listMonster(m.token_id, toYocto(price)), "Listed.", reload); }}>
                <input className={cx(inputCls, "flex-1")} type="number" min="0.01" step="0.01" placeholder="Price SOL" value={price} onChange={(e) => setPrice(e.target.value)} required aria-label="Price in SOL" />
                <Btn>List</Btn>
              </form>
            )
          ) : m.price && <Btn className="mt-4 w-full" disabled={!a.account} onClick={() => act(() => a.buyMonster(m), `${m.name} is yours!`, reload)}>Buy now</Btn>}
          <a href={BRAWLER_URL} className="mt-3 block text-center text-sm font-extrabold text-gold hover:underline">Fight with it in Brawler Arena ↗</a>
        </Panel>
        <Panel className="p-5">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-xl">Monster sales</h2><Pct v={change24(d.h)} className="text-sm" /></div>
          <Sparkline data={prices(d.h)} className="h-28" />
        </Panel>
      </aside>
    </div>
  );
}

export default function Item() {
  const id = useSearchParams().get("id") ?? "";
  const [kind, n] = id.split(":");
  return kind === "skill" ? <SkillItem id={Number(n)} /> : kind === "monster" ? <MonsterItem id={n} /> : <Empty>Pick something from <Link className="text-gold" href="/search">Browse</Link>.</Empty>;
}
