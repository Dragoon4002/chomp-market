"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy as CopyIcon, ExternalLink, Minus, Plus, Share2 } from "lucide-react";
import { ago, amount, ASSETS_ID, BRAWLER_URL, change24, CLUSTER, explorer, fmt, KIND_DESC, KIND_LABEL, short, skillKey, toLamports, useAssets, type Point, type Presale, type SkillListing } from "@/lib/assets";
import { MERCHANTS, merchantName, reasoning } from "@/lib/merchants";
import { windowStats } from "@/lib/stats";
import { addToCart, cartOpen, type CartLine } from "@/lib/local";
import { act, Breadcrumb, Btn, cx, Empty, Field, inputCls, MonsterArt, Panel, Pct, prices, RARITY_TEXT, Skel, SkillArt, Sparkline, Star, STATS, Tabs, toast, useLoad } from "@/components/ui";

const RANGES = { "24H": 864e5, "3D": 2592e5, "7D": 6048e5, "30D": 2592e6, All: Infinity } as const;
type R = keyof typeof RANGES;

function Chart({ h, title = "Last sale" }: { h: Point[]; title?: string }) {
  const [r, setR] = useState<R>("All");
  const cut = Date.now() - RANGES[r];
  const pts = h.filter(([t]) => t >= cut);
  const xs = prices(pts.length > 1 ? pts : h.slice(-2));
  return (
    <Panel className="p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted">{title}</p>
          <p className="font-display text-4xl">{xs.length ? xs[xs.length - 1].toFixed(3) : "—"} <span className="text-2xl text-muted">SOL</span></p>
        </div>
        <Tabs value={r} options={Object.keys(RANGES) as R[]} onChange={setR} />
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

const Stat = ({ k, v, className }: { k: string; v: ReactNode; className?: string }) => (
  <div className={cx("min-w-0 rounded-2xl border-3 border-ink bg-sky-0/60 px-3 py-2", className)}><p className="truncate text-[11px] font-extrabold uppercase tracking-wider text-muted">{k}</p><p className="truncate font-display text-xl">{v}</p></div>
);

const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => toast(`${what} copied.`), () => toast("Couldn't copy."));
function CopyBtn({ text, what }: { text: string; what: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={`Copy ${what}`} title={`Copy ${what}`} className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-panel-2 hover:text-cream"
      onClick={() => { copy(text, what); setDone(true); setTimeout(() => setDone(false), 1200); }}>
      {done ? <Check className="size-4" /> : <CopyIcon className="size-4" />}
    </button>
  );
}
const ShareBtn = () => (
  <button type="button" aria-label="Copy link" title="Copy link" onClick={() => copy(location.href, "Link")} className="grid size-9 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-panel-2 hover:text-cream"><Share2 className="size-5" /></button>
);

// key/value 2-col grid (attributes / chain facts)
function Facts({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  return (
    <Panel className="p-5">
      <h2 className="mb-3 text-xl">{title}</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {rows.map(([k, v]) => <div key={k} className="min-w-0 has-[a[target=_blank]]:col-span-2 sm:has-[a[target=_blank]]:col-span-1"><dt className="text-xs font-extrabold uppercase tracking-wider text-muted">{k}</dt><dd className="flex min-w-0 items-center gap-1 font-bold [&>span]:truncate">{v}</dd></div>)}
      </dl>
    </Panel>
  );
}
const Addr = ({ id }: { id: string }) => (
  <><span title={id}>{short(id)}</span><CopyBtn text={id} what="Address" /><a href={explorer("address", id)} target="_blank" rel="noreferrer" aria-label="View on explorer" className="grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-panel-2 hover:text-cream"><ExternalLink className="size-4" /></a></>
);
const chainRows = (token: string, who: [string, string]): [string, ReactNode][] => [
  ["Program", ASSETS_ID ? <Addr id={ASSETS_ID} /> : <span>not deployed</span>],
  ["Token id", <span key="t">{token}</span>],
  [who[0], who[1] ? <Addr id={who[1]} /> : <span>—</span>],
  ["Network", <span key="n" className="capitalize">{CLUSTER}</span>],
];

function History({ h, type = "Sale" }: { h: Point[]; type?: string }) {
  const [p, setP] = useState(0);
  const rows = [...h].reverse(), pages = Math.max(1, Math.ceil(rows.length / 10));
  return (
    <details open className="group rounded-3xl border-3 border-ink bg-panel shadow-drop">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
        <h2 className="text-2xl">Sales history <span className="text-base text-muted">({rows.length})</span></h2>
        <ChevronDown className="size-6 transition group-open:rotate-180" />
      </summary>
      <div className="px-3 pb-4 sm:px-5">
        {rows.length ? <>
          <table className="w-full text-left font-bold">
            <thead className="text-xs uppercase tracking-wider text-muted"><tr><th className="px-2 py-2">Type</th><th className="px-2 py-2">Price</th><th className="px-2 py-2 text-right">Time</th></tr></thead>
            <tbody>{rows.slice(p * 10, p * 10 + 10).map(([t, price], i) => (
              <tr key={i} className="border-t-2 border-panel-2"><td className="px-2 py-2.5">{type}</td><td className="px-2 py-2.5 tabular-nums">{fmt(price)} SOL</td><td className="px-2 py-2.5 text-right text-teal" title={new Date(t).toLocaleString()}>{ago(t)}</td></tr>
            ))}</tbody>
          </table>
          {pages > 1 && <div className="mt-3 flex items-center justify-end gap-2 text-sm font-bold text-muted">
            <Btn small tone="ghost" disabled={!p} onClick={() => setP(p - 1)}>Prev</Btn><span className="tabular-nums">{p + 1} / {pages}</span><Btn small tone="ghost" disabled={p >= pages - 1} onClick={() => setP(p + 1)}>Next</Btn>
          </div>}
        </> : <Empty>No sales yet.</Empty>}
      </div>
    </details>
  );
}

// mobile: art, main, then facts (reordered via `contents`); lg: art+facts left 2/5, main right 3/5
const Layout = ({ art, side, main }: { art: ReactNode; side: ReactNode; main: ReactNode }) => (
  <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[2fr_3fr] lg:items-start">
    <div className="contents lg:sticky lg:top-24 lg:flex lg:flex-col lg:gap-5">
      <Panel className="order-1 grid place-items-center bg-gradient-to-b from-panel-2 to-panel p-6 sm:p-10">{art}</Panel>
      <div className="order-3 flex flex-col gap-5">{side}</div>
    </div>
    <div className="order-2 flex min-w-0 flex-col gap-5">{main}</div>
  </div>
);

const Skeleton = () => (
  <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[2fr_3fr]">
    <div className="flex flex-col gap-5"><Skel className="h-72" /><Skel className="h-40" /></div>
    <div className="flex flex-col gap-5"><Skel className="h-48" /><Skel className="h-80" /><Skel className="h-56" /></div>
  </div>
);

function MerchantBadge({ l, h, presales }: { l: SkillListing; h: Point[]; presales: Presale[] }) {
  const [q] = useLoad(() => reasoning(l.seller, l.skill, h, presales), [l.seller, l.skill, l.price_each]);
  return (
    <span className="group relative ml-1 inline-block align-middle">
      <button type="button" data-why className="rounded-md border-2 border-ink bg-teal px-1.5 text-[11px] font-extrabold uppercase leading-5 text-ink">Merchant (NPC)</button>
      <span role="tooltip" className="pointer-events-none invisible absolute left-0 top-full z-30 mt-2 w-72 max-w-[80vw] rounded-2xl border-3 border-ink bg-panel-2 p-3 text-sm font-bold text-cream opacity-0 shadow-drop transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <span className="block font-display text-base">{merchantName(l.seller)} prices by rule</span>
        {q ? <>{q.why}.{Math.abs(q.ask - amount(l.price_each)) / q.ask > 0.03 && <span className="mt-1 block text-muted">Listed at {fmt(l.price_each)}; re-lists on its next 2-min tick (when off by &gt;3%).</span>}</> : "Working it out…"}
        <span className="mt-1 block text-xs text-muted">Recomputed here from public chain data with the bot&apos;s own rules file.</span>
      </span>
    </span>
  );
}

// take qty from same-price sellers, in order
const fill = (ls: SkillListing[], q: number) => ls.flatMap((l) => { const n = Math.min(q, l.qty); q -= n; return n > 0 ? [[l, n] as const] : []; });
const sellerName = (s: string) => (MERCHANTS.includes(s) ? merchantName(s) : short(s));

function PriceRow({ ls, name, onDone, h, presales }: { ls: SkillListing[]; name: string; onDone: () => void; h: Point[]; presales: Presale[] }) {
  const a = useAssets();
  const max = ls.reduce((x, l) => x + l.qty, 0);
  const [q, setQ] = useState(1);
  const n = Math.min(q, max), price = ls[0].price_each;
  const buy = () => act(async () => { for (const [l, k] of fill(ls, n)) await a.buySkill(l, k); }, `Bought ${n}.`, onDone);
  const cartAdd = () => { for (const [l, k] of fill(ls, n)) addToCart({ kind: "skill", seller: l.seller, skill: l.skill, qty: k, price_each: l.price_each, name }); toast(`${n} × ${name} added to cart.`); cartOpen.set(true); };
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border-3 border-ink bg-panel-2 p-3">
      <span className="min-w-0 flex-1 basis-40">
        <span className="block font-display text-xl tabular-nums">{fmt(price)} SOL</span>
        <span className="text-sm font-extrabold text-muted">{max} available · {ls.length > 1 ? `${ls.length} sellers` : sellerName(ls[0].seller)}</span>
        {ls.filter((l) => MERCHANTS.includes(l.seller)).map((l) => <MerchantBadge key={l.seller} l={l} h={h} presales={presales} />)}
      </span>
      <span className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <span className="flex h-9 items-center rounded-xl border-3 border-ink bg-sky-0">
          <button type="button" aria-label="Fewer" disabled={n <= 1} onClick={() => setQ(n - 1)} className="grid h-full w-8 place-items-center disabled:opacity-40"><Minus className="size-4" /></button>
          <span className="w-7 text-center font-display tabular-nums" aria-live="polite">{n}</span>
          <button type="button" aria-label="More" disabled={n >= max} onClick={() => setQ(n + 1)} className="grid h-full w-8 place-items-center disabled:opacity-40"><Plus className="size-4" /></button>
        </span>
        <Btn small className="flex-1 sm:flex-none" onClick={buy} disabled={!a.account}>Buy {fmt(BigInt(price) * BigInt(n))}</Btn>
        <Btn small tone="ghost" className="flex-1 sm:flex-none" onClick={cartAdd}>Add to cart</Btn>
      </span>
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
  if (!d) return <Skeleton />;
  const { s, h, ls, held } = d;
  if (!s) return <Empty>Skill not found.</Empty>;
  const col = d.cols.find((c) => c.id === s.collection);
  const free = Number(held?.free ?? 0);
  const mine = ls.filter((l) => l.seller === a.account);
  // same price merges sellers; listings arrive sorted by price
  const groups: SkillListing[][] = [];
  for (const l of ls) if (l.seller !== a.account) { const g = groups.find((x) => x[0].price_each === l.price_each); if (g) g.push(l); else groups.push([l]); }
  const floor = groups[0]?.[0];
  const effect = KIND_DESC[s.kind].replace("+", s.mag > 1 ? "+2 " : "+1 ");
  return (
    <>
      <Breadcrumb items={[["Market", "/"], ["Collections", "/collection"], [col?.name ?? "Collection", `/collection?id=${s.collection}`], [s.name]]} />
      <Layout
        art={<><span className="sm:hidden"><SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={150} /></span><span className="max-sm:hidden"><SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={220} /></span></>}
        side={<>
          <Facts title="Attributes" rows={[
            ["Kind", <span key="k">{KIND_LABEL[s.kind]}</span>],
            ["Rarity", <span key="r" className={RARITY_TEXT[s.rarity]}>{s.rarity}</span>],
            ["Effect", <span key="e" className="!whitespace-normal">{effect}</span>],
            ["Magnitude", <span key="m">×{s.mag}</span>],
            ["Collection", <Link key="c" className="truncate text-gold hover:underline" href={`/collection?id=${s.collection}`}>{col?.name ?? `#${s.collection}`}</Link>],
            ["Max supply", <span key="x">{s.max_supply ?? "Unlimited"}</span>],
          ]} />
          <Facts title="On-chain" rows={[...chainRows(skillKey(s.id), ["Creator", s.creator]), ["Royalty", <span key="ry">{s.royalty_bps / 100}%</span>]]} />
        </>}
        main={<>
          <Panel className="p-5 sm:p-6">
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <p className={cx("text-sm font-extrabold uppercase tracking-wider", RARITY_TEXT[s.rarity])}>{s.rarity} · {KIND_LABEL[s.kind]}{s.mag > 1 && " ×2"}</p>
                <h1 className="break-words text-4xl drop-shadow-[0_4px_0_var(--color-ink)] sm:text-5xl">{s.name}</h1>
                <p className="mt-1 font-bold text-muted">{effect}</p>
              </div>
              <Star k={skillKey(s.id)} /><ShareBtn />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t-3 border-panel-2 pt-4">
              {floor ? <>
                <div className="mr-auto"><p className="text-xs font-extrabold uppercase tracking-wider text-muted">Lowest price · {s.listed_qty} listed</p><p className="font-display text-3xl">{fmt(floor.price_each)} <span className="text-xl text-muted">SOL</span></p></div>
                <Btn className="flex-1 sm:flex-none" disabled={!a.account} onClick={() => act(() => a.buySkill(floor, 1), "Bought 1.", reload)}>Buy</Btn>
                <Btn tone="ghost" className="flex-1 sm:flex-none" onClick={() => { addToCart({ kind: "skill", seller: floor.seller, skill: s.id, qty: 1, price_each: floor.price_each, name: s.name }); toast(`${s.name} added to cart.`); cartOpen.set(true); }}>Add to cart</Btn>
              </> : <p className="font-bold">Not currently listed.</p>}
            </div>
          </Panel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <Stat k="Floor" v={s.floor ? `${fmt(s.floor)} SOL` : "—"} />
            <Stat k="24h" v={<Pct v={change24(h)} />} />
            <Stat k="7D volume" v={`${windowStats(h, "7D").volume.toFixed(2)} SOL`} />
            <Stat k="Listed" v={s.listed_qty} />
            <Stat k="Minted" v={`${s.minted}${s.max_supply ? ` / ${s.max_supply}` : ""}`} />
          </div>
          <Chart h={h} />
          <Panel className="p-4 sm:p-5">
            <h2 className="mb-3 text-2xl">Listings</h2>
            {ls.length ? <ul className="flex flex-col gap-2.5">
              {mine.map((l) => (
                <li key="me" className="flex flex-wrap items-center gap-3 rounded-2xl border-3 border-gold bg-panel-2 p-3">
                  <span className="min-w-0 flex-1"><span className="block font-display text-xl tabular-nums">{fmt(l.price_each)} SOL</span><span className="text-sm font-extrabold text-muted">You · {l.qty} listed</span></span>
                  <Btn small tone="ghost" onClick={() => act(() => a.cancelSkillListing(l.skill), "Listing cancelled.", reload)}>Cancel</Btn>
                </li>
              ))}
              {groups.map((g) => <PriceRow key={g[0].price_each} ls={g} name={s.name} onDone={reload} h={h} presales={d.ps} />)}
            </ul> : <Empty>No one is selling right now.</Empty>}
          </Panel>
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
            <form className="mt-4 grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); act(() => a.listSkill(id, Number(qty), toLamports(price)), "Listed.", reload); }}>
              <Field label="Quantity"><input className={inputCls} type="number" min={1} max={free} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
              <Field label="Price each (SOL)"><input className={inputCls} type="number" min="0.001" step="0.001" inputMode="decimal" placeholder={s.floor ? amount(s.floor).toFixed(3) : "0.5"} value={price} onChange={(e) => setPrice(e.target.value)} required /></Field>
              <Btn className="col-span-2" disabled={!free || !a.account}>{free ? "List for sale" : "None to list"}</Btn>
            </form>
          </Panel>
        </>}
      />
      <div className="mt-5"><History h={h} /></div>
    </>
  );
}

const BONUS: Record<string, string> = { Power: "str", Agility: "dex", Durability: "def", Speed: "spd" };

function MonsterItem({ id }: { id: string }) {
  const a = useAssets();
  const [d, reload] = useLoad(async () => { const [m, h, skills] = await Promise.all([a.monster(id), a.history("monsters"), a.skills()]); return { m, h, skills }; }, [id, a.account]);
  const [price, setPrice] = useState("");
  if (!d) return <Skeleton />;
  const { m } = d;
  if (!m) return <Empty>Monster not found.</Empty>;
  const mine = m.owner_id === a.account;
  return (
    <>
      <Breadcrumb items={[["Market", "/"], ["Monsters", "/search?type=monster"], [m.name]]} />
      <Layout
        art={<><MonsterArt dna={m.dna} size={160} className="sm:hidden" /><MonsterArt dna={m.dna} size={220} className="max-sm:hidden" /></>}
        side={<>
          <Facts title="Attributes" rows={[
            ["Gen", <span key="g">{m.gen}</span>],
            ...STATS.map(([k, t]) => [k.toUpperCase(), <span key={k} className={t}>{m.dna[k]}</span>] as [string, ReactNode]),
            ["Hue", <span key="h" className="flex items-center gap-1.5"><i className="size-3 rounded-full border-2 border-ink" style={{ background: `hsl(${m.dna.hue} 60% 50%)` }} />{m.dna.hue}</span>],
            ["Accent", <span key="a">{m.dna.accent}</span>],
          ]} />
          <Facts title="On-chain" rows={chainRows(`monster:${m.token_id}`, ["Owner", m.owner_id])} />
        </>}
        main={<>
          <Panel className="p-5 sm:p-6">
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold uppercase tracking-wider text-teal">Monster #{m.token_id} · Gen {m.gen}</p>
                <h1 className="break-words text-4xl drop-shadow-[0_4px_0_var(--color-ink)] sm:text-5xl">{m.name}</h1>
                <p className="mt-1 truncate font-bold text-muted">Owned by {mine ? "you" : short(m.owner_id)}</p>
              </div>
              <Star k={`monster:${m.token_id}`} /><ShareBtn />
            </div>
            <div className="mt-4 border-t-3 border-panel-2 pt-4">
              {m.price ? <><p className="text-xs font-extrabold uppercase tracking-wider text-muted">Price</p><p className="font-display text-4xl">{fmt(m.price)} <span className="text-2xl text-muted">SOL</span></p></> : <p className="font-bold">Not currently listed.</p>}
              {mine ? (
                m.price ? <Btn className="mt-4 w-full" tone="ghost" onClick={() => act(() => a.delistMonster(m.token_id), "Delisted.", reload)}>Delist</Btn> : (
                  <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); act(() => a.listMonster(m.token_id, toLamports(price)), "Listed.", reload); }}>
                    <input className={cx(inputCls, "min-w-0 flex-1")} type="number" min="0.01" step="0.01" placeholder="Price SOL" value={price} onChange={(e) => setPrice(e.target.value)} required aria-label="Price in SOL" />
                    <Btn>List</Btn>
                  </form>
                )
              ) : m.price && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <Btn className="flex-1" disabled={!a.account} onClick={() => act(() => a.buyMonster(m), `${m.name} is yours!`, reload)}>Buy now</Btn>
                  <Btn tone="ghost" className="flex-1" onClick={() => { addToCart({ kind: "monster", token_id: m.token_id, price: m.price!, name: m.name } satisfies CartLine); toast(`${m.name} added to cart.`); cartOpen.set(true); }}>Add to cart</Btn>
                </div>
              )}
              <a href={BRAWLER_URL} className="mt-3 block text-center text-sm font-extrabold text-gold hover:underline">Fight with it in Brawler Arena →</a>
            </div>
          </Panel>
          <Panel className="p-5">
            <h2 className="mb-4 text-2xl">Stats</h2>
            <div className="flex flex-col gap-3">
              {STATS.map(([k, t, bg]) => {
                const bonus = m.skills.filter((s) => BONUS[s.kind] === k).reduce((x, s) => x + s.mag, 0);
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
          <Chart h={d.h} title="Monster sales · last" />
        </>}
      />
      <div className="mt-5"><History h={d.h} /></div>
    </>
  );
}

export default function Item() {
  const id = useSearchParams().get("id") ?? "";
  const [kind, n] = id.split(":");
  return kind === "skill" ? <SkillItem id={Number(n)} /> : kind === "monster" ? <MonsterItem id={n} /> : <Empty>Pick something from <Link className="text-gold" href="/search">Browse</Link>.</Empty>;
}
