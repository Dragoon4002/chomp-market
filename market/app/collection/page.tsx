"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, ExternalLink, Search } from "lucide-react";
import { ago, amount, change24, explorer, fmt, KIND_LABEL, LAMPORTS, RARITIES, short, useAssets, type Api, type Rarity, type Skill } from "@/lib/assets";
import { collectionStats, loadMarket, presaleState, RANGE, salesFeed, type Range } from "@/lib/stats";
import { watch } from "@/lib/local";
import { Bars, Breadcrumb, Chip, cx, Empty, inputCls, Pager, Panel, Pct, Pill, prices, RARITY_TEXT, Skel, SkillArt, Sparkline, Star, Tabs, useLoad } from "@/components/ui";
import { PresaleCard } from "@/components/presale-card";

// /collection (no id) = collections table (also served at /collections); /collection?id= = detail
export default function CollectionPage() {
  const id = useSearchParams().get("id");
  return id == null ? <Collections /> : <Detail id={Number(id)} />;
}

const sol = (n: number) => `${fmt(String(Math.round(n * LAMPORTS)))} SOL`;
const RANK: Record<Rarity, number> = { Common: 0, Rare: 1, Epic: 2 };
const cell = "px-3 py-3";
// market + my holdings, stamped with load time
const useMarket = (a: Api) => useLoad(async () => ({ ...(await loadMarket(a)), held: await a.holdings(), at: Date.now() }), [a.account]);

// up to 3 rarest skills fanned out as the collection's tile
function ColArt({ skills, size }: { skills: Skill[]; size: number }) {
  const top = [...skills].sort((x, y) => RANK[y.rarity] - RANK[x.rarity] || y.mag - x.mag).slice(0, 3);
  if (!top.length) return <span className="grid shrink-0 place-items-center rounded-[28%] border-3 border-ink bg-panel-2 font-display text-muted" style={{ width: size, height: size }}>?</span>;
  return (
    <span className="relative block shrink-0" style={{ width: size * (1 + 0.45 * (top.length - 1)), height: size }}>
      {top.map((s, i) => (
        <span key={s.id} className="absolute top-0" style={{ left: i * size * 0.45, zIndex: 3 - i, transform: `rotate(${(i - (top.length - 1) / 2) * 7}deg)` }}>
          <SkillArt kind={s.kind} rarity={s.rarity} size={size} />
        </span>
      ))}
    </span>
  );
}

type Sort = "floor" | "volume" | "sales";
function Collections() {
  const a = useAssets();
  const router = useRouter();
  const w = watch.useValue();
  const [tab, setTab] = useState<"all" | "watch" | "owned">("all");
  const [range, setRange] = useState<Range>("24H");
  const [[by, dir], setSort] = useState<[Sort, number]>(["volume", -1]);
  const [page, setPage] = useState(1);
  const [d] = useMarket(a);

  const owned = new Set(d?.held.map((h) => d.skills.find((s) => s.id === h.skill)?.collection));
  const rows = d ? collectionStats(d.cols, d.skills, d.hist, range)
    .filter((r) => tab === "all" || (tab === "watch" ? w.includes(`collection:${r.c.id}`) : owned.has(r.c.id)))
    .sort((x, y) => dir * ((x[by] ?? -1) - (y[by] ?? -1))) : [];
  const pages = Math.max(1, Math.ceil(rows.length / 10)), p = Math.min(page, pages);
  const th = (k: Sort, label: string) => (
    <th className={cx(cell, "text-right")} aria-sort={by === k ? (dir > 0 ? "ascending" : "descending") : undefined}>
      <button type="button" onClick={() => { setSort([k, by === k ? -dir : -1]); setPage(1); }} className={cx("inline-flex items-center gap-1 uppercase hover:text-cream", by === k && "text-cream")}>
        {label}{by !== k ? <ChevronsUpDown className="size-3.5" /> : dir > 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
      </button>
    </th>
  );
  const delta = (v: number) => (range === "All" || !v ? <span className="block text-xs font-bold text-muted">—</span> : <Pct v={v} className="block text-xs" />);

  return (
    <>
      <h1 className="mb-4 text-5xl drop-shadow-[0_4px_0_var(--color-ink)]">Collections</h1>
      <Tabs under value={tab} onChange={(t) => { setTab(t); setPage(1); }} options={[["all", "All collections"], ["watch", "Watchlist"], ["owned", "Owned collections"]]} />
      <div className="my-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-bold text-muted">{d ? `Last updated ${ago(d.at)}.` : "Loading…"}</p>
        <Tabs value={range} onChange={(r) => { setRange(r); setPage(1); }} options={Object.keys(RANGE) as Range[]} />
      </div>
      {!d ? <div className="flex flex-col gap-3">{Array.from({ length: 6 }, (_, i) => <Skel key={i} className="h-16" />)}</div>
        : !rows.length ? <Empty>{tab === "watch" ? "No watched collections yet. Tap ☆ on any row." : tab === "owned" ? "You don't own skills from any collection yet." : "No collections yet."}</Empty> : (
          <>
            <div className="overflow-x-auto rounded-3xl border-3 border-ink bg-panel shadow-drop">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="border-b-3 border-ink text-left text-xs font-extrabold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="w-12 px-2"><span className="sr-only">Watch</span></th><th className={cx(cell, "w-10")}>#</th><th className={cell}>Collection</th>
                    {th("floor", "Floor price")}{th("volume", "Volume")}{th("sales", "Sales")}
                    <th className={cx(cell, "text-center")}>7D trend</th><th className={cx(cell, "text-right")}>Supply</th><th className={cx(cell, "text-right")}>Listed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice((p - 1) * 10, p * 10).map((r, i) => (
                    <tr key={r.c.id} onClick={() => router.push(`/collection?id=${r.c.id}`)} className="cursor-pointer border-b-2 border-ink/60 font-bold transition last:border-0 hover:bg-panel-2">
                      <td className="px-2"><Star k={`collection:${r.c.id}`} /></td>
                      <td className={cx(cell, "tabular-nums text-muted")}>{(p - 1) * 10 + i + 1}</td>
                      <td className={cell}>
                        <Link href={`/collection?id=${r.c.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                          <ColArt skills={r.skills} size={40} />
                          <span className="min-w-0">
                            <span className="block truncate font-display text-lg leading-tight text-cream">{r.c.name}</span>
                            <span className="text-xs text-muted">{short(r.c.creator)}</span>
                          </span>
                        </Link>
                      </td>
                      <td className={cx(cell, "text-right tabular-nums")}>{r.floor == null ? <span className="text-muted">—</span> : sol(r.floor)}</td>
                      <td className={cx(cell, "text-right tabular-nums")}>{sol(r.volume)}{delta(r.dVolume)}</td>
                      <td className={cx(cell, "text-right tabular-nums")}>{r.sales.toLocaleString()}{delta(r.dSales)}</td>
                      <td className={cell}><Bars data={r.trend} className="mx-auto w-28" /></td>
                      <td className={cx(cell, "text-right tabular-nums")}>{r.supply.toLocaleString()}</td>
                      <td className={cx(cell, "text-right tabular-nums")}>{r.listed.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={p} pages={pages} set={setPage} />
          </>
        )}
    </>
  );
}

const Stat = ({ k, v, className }: { k: string; v: ReactNode; className?: string }) => (
  <div className={cx("min-w-0 rounded-2xl border-3 border-ink bg-panel-2 px-4 py-3", className)}>
    <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{k}</p>
    <p className="mt-0.5 truncate font-display text-2xl tabular-nums">{v}</p>
  </div>
);
const KV = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-3 py-2.5"><dt className="font-bold text-muted">{k}</dt><dd className="min-w-0 truncate text-right font-extrabold">{children}</dd></div>
);

const SORTS = [["floor-asc", "Price: low to high"], ["floor-desc", "Price: high to low"], ["change", "Top movers 24h"], ["name", "Name"]] as const;
type Tab = "items" | "activity" | "presales";

function Detail({ id }: { id: number }) {
  const a = useAssets();
  const sp = useSearchParams();
  const router = useRouter();
  const tab = (["items", "activity", "presales"].includes(sp.get("tab") ?? "") ? sp.get("tab") : "items") as Tab;
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); n.set("tab", t); router.replace(`/collection?${n}`, { scroll: false }); };
  const [d, reload] = useMarket(a);
  const [q, setQ] = useState("");
  const [sort, setSortBy] = useState<(typeof SORTS)[number][0]>("floor-asc");
  const [mine, setMine] = useState(false);
  const [rar, setRar] = useState<Rarity | "">("");
  const [page, setPage] = useState(1);

  if (!d) return (
    <div className="flex flex-col gap-5">
      <Skel className="h-6 w-64" /><Skel className="h-56" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skel key={i} className="h-20" />)}</div>
      <Skel className="h-80" />
    </div>
  );
  const c = d.cols.find((x) => x.id === id);
  if (!c) return <Empty>Collection not found. <Link href="/collections" className="text-gold">Browse collections →</Link></Empty>;
  const st = collectionStats([c], d.skills, d.hist, "7D")[0];
  const skills = st.skills;
  const ps = d.presales.filter((p) => skills.some((s) => s.id === p.skill)).sort((x, y) => Number(x.ended) - Number(y.ended) || (y.cap_total ? 1 : 0) - (x.cap_total ? 1 : 0));
  const live = ps.filter((p) => presaleState(p) === "live").length;
  const roy = skills.map((s) => s.royalty_bps / 100);
  const royalty = !roy.length ? "—" : Math.min(...roy) === Math.max(...roy) ? `${roy[0]}%` : `${Math.min(...roy)}–${Math.max(...roy)}%`;
  const held = new Set(d.held.map((h) => h.skill));
  const price = (s: Skill) => (s.floor ?? s.last_price ? amount(s.floor ?? s.last_price) : null);
  const none = sort === "floor-asc" ? Infinity : -1; // unpriced sink to the bottom either way

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const items = skills
    .filter((s) => (!mine || held.has(s.id)) && (!rar || s.rarity === rar) && words.every((w) => `${s.name} ${KIND_LABEL[s.kind]} ${s.rarity}`.toLowerCase().includes(w)))
    .sort((x, y) => sort === "name" ? x.name.localeCompare(y.name) : sort === "change" ? change24(d.hist[y.id] ?? []) - change24(d.hist[x.id] ?? [])
      : (sort === "floor-asc" ? 1 : -1) * ((price(x) ?? none) - (price(y) ?? none)));
  const feed = salesFeed(skills, d.hist);
  const pages = Math.max(1, Math.ceil(feed.length / 15)), p = Math.min(page, pages);

  return (
    <>
      <Breadcrumb items={[["Market", "/"], ["Collections", "/collections"], [c.name]]} />
      <div className="relative mb-6 overflow-hidden rounded-3xl border-3 border-ink bg-gradient-to-br from-sky-2 via-panel-2 to-panel p-6 shadow-drop sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-ember/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold uppercase tracking-widest text-gold">Collection · by {short(c.creator)}</p>
            <div className="mt-1 flex items-center gap-2">
              <h1 className="min-w-0 break-words text-4xl drop-shadow-[0_4px_0_var(--color-ink)] sm:text-6xl">{c.name}</h1>
              <Star k={`collection:${c.id}`} className="bg-panel/60" />
            </div>
            <p className="mt-2 max-w-2xl font-bold text-muted">{c.description}</p>
          </div>
          <div className="shrink-0 self-center pr-2"><ColArt skills={skills} size={96} /></div>
        </div>
      </div>

      <div className="mb-8 grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="grid content-start grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat k="Floor" v={st.floor == null ? "—" : sol(st.floor)} />
          <Stat k="Volume 7D" v={sol(st.volume)} />
          <Stat k="Sales 7D" v={st.sales.toLocaleString()} />
          <Stat k="Supply" v={st.supply.toLocaleString()} />
          <Stat k="Listed" v={st.listed.toLocaleString()} />
          <Stat k="Skills" v={skills.length} />
          <Stat k="Live presales" v={live} className="col-span-2" />
        </div>
        <Panel className="px-5 py-2">
          <dl className="divide-y-2 divide-ink/60 text-sm">
            <KV k="Creator"><a href={explorer("address", c.creator)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gold hover:underline">{short(c.creator)}<ExternalLink className="size-3.5" /></a></KV>
            <KV k="Royalty">{royalty}</KV>
            <KV k="Network">Solana devnet</KV>
            <KV k="Created skills">{skills.length}</KV>
            <KV k="Status">{live ? <Pill tone="up">● Presale live</Pill> : <Pill tone="teal">Trading</Pill>}</KV>
          </dl>
        </Panel>
      </div>

      <Tabs under value={tab} onChange={setTab} className="mb-5" options={[["items", `Items (${skills.length})`], ["activity", "Activity"], ["presales", `Presales (${ps.length})`]]} />

      {tab === "items" && (
        <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
          <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
            <Panel className="grid grid-cols-2 gap-2 p-4 text-center">
              <span><span className="block font-display text-lg">{st.floor == null ? "—" : sol(st.floor)}</span><span className="text-xs font-extrabold uppercase text-muted">Floor</span></span>
              <span><span className="block font-display text-lg">{sol(st.volume)}</span><span className="text-xs font-extrabold uppercase text-muted">Volume 7D</span></span>
            </Panel>
            <div>
              <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted">Rarity</p>
              <div className="flex flex-wrap gap-2">
                <Chip on={!rar} onClick={() => setRar("")}>All</Chip>
                {RARITIES.map((r) => <Chip key={r} on={rar === r} onClick={() => setRar(r)}>{r}</Chip>)}
              </div>
            </div>
          </aside>
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="flex h-11 min-w-0 flex-1 basis-56 items-center gap-2 rounded-xl border-3 border-ink bg-sky-0 px-3 focus-within:border-gold">
                <Search className="size-4 shrink-0 text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${c.name}…`} aria-label="Search in collection" className="w-full min-w-0 bg-transparent font-bold outline-none placeholder:text-muted/50" />
              </label>
              <select value={sort} onChange={(e) => setSortBy(e.target.value as typeof sort)} aria-label="Sort" className={cx(inputCls, "min-w-0")}>
                {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm font-extrabold text-muted">
                <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="size-4 accent-[var(--color-gold)]" />Only mine
              </label>
            </div>
            {!items.length ? <Empty>{mine ? "You don't own any skills here yet." : "No skills match."}</Empty> : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
                {items.map((s) => {
                  const h = d.hist[s.id] ?? [];
                  const fl = price(s);
                  return (
                    <Link key={s.id} href={`/item?id=skill:${s.id}`} className="flex min-w-0 flex-col gap-2.5 rounded-3xl border-3 border-ink bg-panel p-3 shadow-drop transition hover:-translate-y-1 hover:bg-panel-2 sm:p-4">
                      <div className="flex items-start justify-between gap-2">
                        <SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={60} />
                        {held.has(s.id) && <Pill tone="teal">Owned</Pill>}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-display text-xl leading-tight">{s.name}</p>
                        <p className={cx("truncate text-xs font-extrabold uppercase tracking-wide", RARITY_TEXT[s.rarity])}>{s.rarity} · {KIND_LABEL[s.kind]}</p>
                      </div>
                      <Sparkline data={prices(h)} fill={false} className="h-9" />
                      <div className="flex flex-wrap items-end justify-between gap-x-2">
                        <span><span className="block text-[11px] font-extrabold uppercase text-muted">Floor</span><span className="font-extrabold tabular-nums">{fl == null ? "—" : sol(fl)}</span></span>
                        <Pct v={change24(h)} className="text-xs" />
                      </div>
                      <p className="text-xs font-bold text-muted">{s.listed_qty} listed · {s.minted.toLocaleString()} minted</p>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "activity" && (!feed.length ? <Empty>No sales yet.</Empty> : (
        <>
          <div className="overflow-x-auto rounded-3xl border-3 border-ink bg-panel shadow-drop">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b-3 border-ink text-left text-xs font-extrabold uppercase tracking-wide text-muted">
                <tr><th className={cell}>Type</th><th className={cell}>Item</th><th className={cx(cell, "text-right")}>Price</th><th className={cx(cell, "text-right")}>Time</th></tr>
              </thead>
              <tbody>
                {feed.slice((p - 1) * 15, p * 15).map((x, i) => (
                  <tr key={`${x.key}-${x.t}-${i}`} className="border-b-2 border-ink/60 font-bold last:border-0 hover:bg-panel-2">
                    <td className={cell}><Pill tone="up">Sale</Pill></td>
                    <td className={cell}>
                      <Link href={`/item?id=${x.key}`} className="flex items-center gap-3 hover:text-gold">
                        <SkillArt kind={x.skill!.kind} rarity={x.skill!.rarity} mag={x.skill!.mag} size={34} />
                        <span className="truncate font-display text-base">{x.skill!.name}</span>
                      </Link>
                    </td>
                    <td className={cx(cell, "text-right tabular-nums")}>{fmt(x.price)} SOL</td>
                    <td className={cx(cell, "text-right text-muted")} title={new Date(x.t).toLocaleString()}>{ago(x.t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={p} pages={pages} set={setPage} />
        </>
      ))}

      {tab === "presales" && (ps.length
        ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{ps.map((x) => <PresaleCard key={x.id} p={x} s={skills.find((s) => s.id === x.skill)!} onDone={reload} />)}</div>
        : <Empty>No presales for this collection.</Empty>)}
    </>
  );
}
