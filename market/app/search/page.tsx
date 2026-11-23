"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import { amount, change24, fmt, KIND_LABEL, KINDS, RARITIES, skillKey, useAssets, type Monster, type Point, type Skill } from "@/lib/assets";
import { watch } from "@/lib/local";
import { presaleState, windowStats } from "@/lib/stats";
import { Btn, cx, Empty, inputCls, MonsterArt, Panel, Pct, prices, RARITY_TEXT, SearchBar, Skel, SkillArt, Sparkline, Star, STATS, Tabs, useLoad } from "@/components/ui";

const SORTS = [["price", "Price: low → high"], ["price_desc", "Price: high → low"], ["change", "Top gainers 24h"], ["listed", "Most listed"], ["new", "Newest"]] as const;
// every URL key that counts as a filter (q/type/sort/view are not filters)
const FILTERS = ["kind", "rarity", "col", "min", "max", "listed", "presale", "str", "dex", "def", "spd", "gen", "mine", "watch"] as const;
const card = "group relative flex flex-col rounded-3xl border-3 border-ink bg-panel p-4 shadow-drop transition hover:-translate-y-1 hover:bg-panel-2";
type ChipT = [string, () => void];

export default function Search() {
  const a = useAssets();
  const sp = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const P = (k: string) => sp.get(k) ?? "";
  const L = (k: string) => P(k).split(",").filter(Boolean);
  const q = P("q"), type = P("type"), sort = P("sort") || "price", list = P("view") === "list";
  const set = (patch: Record<string, string>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) if (v) n.set(k, v); else n.delete(k);
    router.replace(`/search?${n}`.replace(/\?$/, ""), { scroll: false });
  };
  const toggle = (k: string, v: string) => { const l = L(k); set({ [k]: (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]).join(",") }); };
  const clear = (all = false) => set(Object.fromEntries([...FILTERS, ...(all ? ["q"] : [])].map((k) => [k, ""])));

  const [d, reload] = useLoad(async () => {
    const [skills, cols, mons, presales, holds, mine] = await Promise.all([a.skills(), a.collections(), a.monsters(), a.presales(), a.holdings(), a.myMonsters()]);
    const hist: Record<number, Point[]> = Object.fromEntries(await Promise.all(skills.map(async (s) => [s.id, await a.history(skillKey(s.id))])));
    return {
      skills, cols, mons, mine, hist,
      presale: new Set(presales.filter((p) => presaleState(p) !== "ended").map((p) => p.skill)),
      mySkills: new Set(holds.map((h) => h.skill)), myMons: new Set(mine.map((m) => m.token_id)),
    };
  }, [a.account]);
  const watched = watch.useValue();

  // --- filtering: skill-only filters hide monsters, stat/gen filters hide skills, any item filter hides collections (except col) ---
  const kinds = L("kind"), rars = L("rarity"), colsSel = L("col"), gen = L("gen");
  const min = parseFloat(P("min")), max = parseFloat(P("max"));
  const stat = Object.fromEntries(STATS.map(([k]) => [k, Number(P(k)) || 3])) as Record<"str" | "dex" | "def" | "spd", number>;
  const skillOnly = kinds.length + rars.length + colsSel.length > 0 || !!P("presale");
  const monOnly = STATS.some(([k]) => stat[k] > 3) || gen.length > 0;
  const priced = !isNaN(min) || !isNaN(max);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (...f: string[]) => words.every((w) => f.join(" ").toLowerCase().includes(w));
  const colName = (id: number) => d?.cols.find((c) => c.id === id)?.name ?? "";
  const inPrice = (y: string | null) => !priced || (y != null && !(amount(y) < min) && !(amount(y) > max));
  const skillPrice = (s: Skill) => s.floor ?? s.last_price;

  const qSkills = d ? d.skills.filter((s) => hit(s.name, s.kind, KIND_LABEL[s.kind], s.rarity, colName(s.collection), s.creator)) : [];
  // only-mine includes my unlisted monsters (a.monsters() = listed only)
  const qMons = d ? (P("mine") ? d.mine : d.mons).filter((m) => hit(m.name, m.token_id, m.owner_id)) : [];
  const ord = <T,>(xs: T[], price: (x: T) => string | null, chg: (x: T) => number, listed: (x: T) => number, nu: (x: T) => number) => {
    const p = (x: T) => { const y = price(x); return y == null ? Infinity : amount(y); }; // unpriced last
    const key = { price: p, price_desc: (x: T) => (isFinite(p(x)) ? -p(x) : Infinity), change: (x: T) => -chg(x), listed: (x: T) => -listed(x), new: (x: T) => -nu(x) }[sort] ?? p;
    return [...xs].sort((x, y) => key(x) - key(y) || 0);
  };
  const skills = d && !monOnly ? ord(qSkills.filter((s) => (!kinds.length || kinds.includes(s.kind)) && (!rars.length || rars.includes(s.rarity)) && (!colsSel.length || colsSel.includes(String(s.collection)))
    && inPrice(skillPrice(s)) && (!P("listed") || s.listed_qty > 0) && (!P("presale") || d.presale.has(s.id))
    && (!P("mine") || d.mySkills.has(s.id)) && (!P("watch") || watched.includes(skillKey(s.id)))),
    skillPrice, (s) => change24(d.hist[s.id]), (s) => s.listed_qty, (s) => s.id) : [];
  const mons = d && !skillOnly ? ord(qMons.filter((m) => STATS.every(([k]) => m.dna[k] >= stat[k]) && (!gen.length || gen.includes(String(m.gen)))
    && inPrice(m.price) && (!P("listed") || m.price != null) && (!P("mine") || d.myMons.has(m.token_id)) && (!P("watch") || watched.includes(`monster:${m.token_id}`))),
    (m: Monster) => m.price, (m) => m.record.w, (m) => (m.price ? 1 : 0), (m) => Number(m.token_id)) : [];
  const cols = d && !kinds.length && !rars.length && !P("presale") && !monOnly && !P("mine") && !P("listed") && !priced
    ? d.cols.filter((c) => hit(c.name, c.description, c.creator) && (!colsSel.length || colsSel.includes(String(c.id))) && (!P("watch") || watched.includes(`collection:${c.id}`))) : [];
  const show = (t: string) => !type || type === t;
  const count = (show("skill") ? skills.length : 0) + (show("monster") ? mons.length : 0) + (show("collection") ? cols.length : 0);
  const tabCount = (t: string) => (t === "skill" ? skills.length : t === "monster" ? mons.length : t === "collection" ? cols.length : skills.length + mons.length + cols.length);

  // --- active filter chips ---
  const chips: ChipT[] = [
    ...kinds.map((k): ChipT => [KIND_LABEL[k as Skill["kind"]] ?? k, () => toggle("kind", k)]),
    ...rars.map((r): ChipT => [r, () => toggle("rarity", r)]),
    ...colsSel.map((c): ChipT => [colName(Number(c)) || `Collection ${c}`, () => toggle("col", c)]),
    ...gen.map((g): ChipT => [`Gen ${g}`, () => toggle("gen", g)]),
    ...STATS.filter(([k]) => stat[k] > 3).map(([k]): ChipT => [`${k.toUpperCase()} ≥ ${stat[k]}`, () => set({ [k]: "" })]),
  ];
  if (priced) chips.push([`${isNaN(min) ? 0 : min}–${isNaN(max) ? "∞" : max} SOL`, () => set({ min: "", max: "" })]);
  if (P("listed")) chips.push(["Listed only", () => set({ listed: "" })]);
  if (P("presale")) chips.push(["Has presale", () => set({ presale: "" })]);
  if (P("mine")) chips.push(["Only mine", () => set({ mine: "" })]);
  if (P("watch")) chips.push(["Watchlist", () => set({ watch: "" })]);

  // --- sidebar ---
  const floors = d ? d.skills.map((s) => s.floor).filter((f): f is string => !!f).map(amount) : [];
  const box = (checked: boolean, onChange: () => void, label: ReactNode, n?: number, key?: string) => (
    <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-sm font-bold hover:bg-panel-2">
      <input type="checkbox" className="size-4 shrink-0 accent-ember" checked={checked} onChange={onChange} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {n != null && <span className="rounded-full bg-sky-0 px-2 text-xs font-extrabold text-muted">{n}</span>}
    </label>
  );
  const multi = (k: string, v: string, label: ReactNode, n: number) => box(L(k).includes(v), () => toggle(k, v), label, n, v);
  const flag = (k: string, label: string) => box(!!P(k), () => set({ [k]: P(k) ? "" : "1" }), label, undefined, k);

  const sidebar = (
    <div className="flex flex-col gap-3">
      <Panel className="p-4">
        <p className="text-xs font-extrabold uppercase tracking-wide text-ember">Market</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          {[["Floor", floors.length ? Math.min(...floors).toFixed(2) : "—"], ["24h vol", d ? windowStats(Object.values(d.hist).flat(), "24H").volume.toFixed(1) : "—"], ["Listed", d ? String(d.skills.reduce((x, s) => x + s.listed_qty, 0)) : "—"]].map(([l, v]) => (
            <span key={l} className="rounded-xl bg-sky-0 py-2"><span className="block font-display text-lg leading-none">{v}</span><span className="text-[11px] font-extrabold text-muted">{l}</span></span>
          ))}
        </div>
      </Panel>
      <Panel className="divide-y-3 divide-ink overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-display text-xl">Filters</span>
          <button type="button" onClick={() => clear()} disabled={!chips.length} className="text-sm font-extrabold text-gold hover:underline disabled:opacity-40 disabled:no-underline">Clear all</button>
        </div>
        <Group title="Kind" n={kinds.length}>{KINDS.map((k) => multi("kind", k, KIND_LABEL[k], qSkills.filter((s) => s.kind === k).length))}</Group>
        <Group title="Rarity" n={rars.length}>{RARITIES.map((r) => multi("rarity", r, <span className={RARITY_TEXT[r]}>{r}</span>, qSkills.filter((s) => s.rarity === r).length))}</Group>
        <Group title="Collection" n={colsSel.length}>{d?.cols.map((c) => multi("col", String(c.id), c.name, qSkills.filter((s) => s.collection === c.id).length))}</Group>
        <Group title="Price (SOL)" n={Number(priced)}>
          <div className="flex items-center gap-2">
            <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="Min" aria-label="Min price" value={P("min")} onChange={(e) => set({ min: e.target.value })} className={cx(inputCls, "h-10 w-full min-w-0")} />
            <span className="text-muted">–</span>
            <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="Max" aria-label="Max price" value={P("max")} onChange={(e) => set({ max: e.target.value })} className={cx(inputCls, "h-10 w-full min-w-0")} />
          </div>
        </Group>
        <Group title="Status" n={Number(!!P("listed")) + Number(!!P("presale"))}>{flag("listed", "Listed only")}{flag("presale", "Has presale")}</Group>
        <Group title="Monster stats" n={STATS.filter(([k]) => stat[k] > 3).length + gen.length}>
          {STATS.map(([k, t]) => (
            <label key={k} className="flex items-center gap-3 py-1 text-sm font-extrabold">
              <span className={cx("w-9 uppercase", t)}>{k}</span>
              <input type="range" min={3} max={9} value={stat[k]} onChange={(e) => set({ [k]: e.target.value === "3" ? "" : e.target.value })} className="min-w-0 flex-1 accent-ember" aria-label={`Min ${k}`} />
              <span className="w-8 text-right tabular-nums">≥{stat[k]}</span>
            </label>
          ))}
          <div className="mt-2">{[...new Set(d?.mons.map((m) => m.gen))].sort().map((g) => multi("gen", String(g), `Gen ${g}`, qMons.filter((m) => m.gen === g).length))}</div>
        </Group>
      </Panel>
    </div>
  );

  const grid = "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3";
  return (
    <>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="shrink-0">
          <h1 className="text-4xl sm:text-5xl">Browse</h1>
          <p className="text-sm font-extrabold text-muted">{d ? `${count} result${count === 1 ? "" : "s"}${q ? ` for “${q}”` : ""}` : "Loading…"}</p>
        </div>
        <div className="min-w-0 flex-1 lg:ml-auto lg:max-w-xl"><SearchBar key={q} initial={q} /></div>
      </div>

      <Tabs under value={type} onChange={(v) => set({ type: v })} className="mb-5"
        options={([["", "All"], ["skill", "Skills"], ["monster", "Monsters"], ["collection", "Collections"]] as const).map(([v, l]) => [v, <>{l} <span className="text-sm text-muted">{d ? tabCount(v) : ""}</span></>] as const)} />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <Btn tone="ghost" small className="self-start lg:hidden" onClick={() => setOpen(!open)} aria-expanded={open}>
          <SlidersHorizontal className="size-4" /> Filters{chips.length ? ` (${chips.length})` : ""}
        </Btn>
        <aside className={cx("w-full shrink-0 lg:sticky lg:top-4 lg:block lg:w-72", open ? "block" : "hidden")}>{sidebar}</aside>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-3">
            <select aria-label="Sort" value={sort} onChange={(e) => set({ sort: e.target.value === "price" ? "" : e.target.value })} className="h-10 rounded-xl border-3 border-ink bg-panel px-3 text-sm font-extrabold text-cream">
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button type="button" onClick={reload} aria-label="Refresh" title="Refresh" className="grid size-10 place-items-center rounded-xl border-3 border-ink bg-panel shadow-drop-sm transition hover:bg-panel-2 active:translate-y-0.5 active:shadow-none"><RefreshCw className="size-4" /></button>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-extrabold"><input type="checkbox" className="size-4 accent-ember" checked={!!P("mine")} onChange={() => set({ mine: P("mine") ? "" : "1" })} />Only mine</label>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-extrabold"><input type="checkbox" className="size-4 accent-ember" checked={!!P("watch")} onChange={() => set({ watch: P("watch") ? "" : "1" })} />Watchlist only</label>
            <div role="group" aria-label="Layout" className="ml-auto flex rounded-xl border-3 border-ink bg-sky-0 p-0.5">
              {([["", LayoutGrid, "Grid view"], ["list", List, "List view"]] as const).map(([v, I, l]) => (
                <button key={l} type="button" aria-label={l} aria-pressed={list === !!v} onClick={() => set({ view: v })}
                  className={cx("grid size-8 place-items-center rounded-lg transition", list === !!v ? "bg-panel-2 text-cream" : "text-muted hover:text-cream")}><I className="size-4" /></button>
              ))}
            </div>
          </div>

          {chips.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {chips.map(([l, rm]) => (
                <button key={l} type="button" onClick={rm} aria-label={`Remove ${l}`} className="inline-flex items-center gap-1 rounded-full border-3 border-ink bg-gold px-3 py-0.5 text-sm font-extrabold text-ink shadow-drop-sm transition hover:brightness-110">
                  {l}<X className="size-3.5" strokeWidth={3} />
                </button>
              ))}
              <button type="button" onClick={() => clear()} className="text-sm font-extrabold text-muted hover:text-cream">Clear all</button>
            </div>
          )}

          {!d ? (
            <div className={list ? "flex flex-col gap-2" : grid}>{Array.from({ length: 6 }, (_, i) => <Skel key={i} className={list ? "h-14" : "h-52"} />)}</div>
          ) : !count ? (
            <Empty>Nothing matches. <button type="button" onClick={() => clear(true)} className="ml-1 text-gold underline">Clear filters</button></Empty>
          ) : list ? (
            <div className="overflow-hidden rounded-3xl border-3 border-ink bg-panel shadow-drop">
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b-3 border-ink px-4 py-2 text-xs font-extrabold uppercase text-muted sm:grid-cols-[1fr_7rem_6rem_4rem_auto]">
                <span>Item</span><span className="text-right">Price</span><span className="hidden text-right sm:block">24h</span><span className="hidden text-right sm:block">Listed</span><span className="w-9" />
              </div>
              {show("skill") && skills.map((s) => <LRow key={`s${s.id}`} href={`/item?id=skill:${s.id}`} k={skillKey(s.id)} art={<SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={36} />}
                name={s.name} sub={<span className={RARITY_TEXT[s.rarity]}>{s.rarity} · {KIND_LABEL[s.kind]}</span>} price={skillPrice(s)} chg={<Pct v={change24(d.hist[s.id])} />} listed={s.listed_qty} />)}
              {show("monster") && mons.map((m) => <LRow key={`m${m.token_id}`} href={`/item?id=monster:${m.token_id}`} k={`monster:${m.token_id}`} art={<MonsterArt dna={m.dna} size={36} />}
                name={`${m.name} #${m.token_id}`} sub={<span className="text-teal">Gen {m.gen} · {m.record.w}W {m.record.l}L</span>} price={m.price} chg={<span className="text-muted">—</span>} listed={m.price ? 1 : 0} />)}
              {show("collection") && cols.map((c) => {
                const ss = d.skills.filter((s) => s.collection === c.id);
                return <LRow key={`c${c.id}`} href={`/collection?id=${c.id}`} k={`collection:${c.id}`} art={<span className="grid size-9 place-items-center rounded-xl border-2 border-ink bg-ember font-display text-ink">{c.name[0]}</span>}
                  name={c.name} sub={<span className="text-ember">Collection · {ss.length} skills</span>} price={null} chg={<span className="text-muted">—</span>} listed={ss.reduce((x, s) => x + s.listed_qty, 0)} />;
              })}
            </div>
          ) : (
            <div className={grid}>
              {show("skill") && skills.map((s) => (
                <Link key={`s${s.id}`} href={`/item?id=skill:${s.id}`} className={card}>
                  <div className="flex items-start gap-3">
                    <SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={52} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-xl leading-tight">{s.name}</span>
                      <span className={cx("text-xs font-extrabold uppercase tracking-wide", RARITY_TEXT[s.rarity])}>{s.rarity} · {KIND_LABEL[s.kind]}</span>
                    </span>
                    <Star k={skillKey(s.id)} className="-mr-2 -mt-2" />
                  </div>
                  <Sparkline data={prices(d.hist[s.id])} className="my-3 h-12" />
                  <div className="mt-auto flex items-end justify-between gap-2 text-sm">
                    <span><span className="block text-xs font-extrabold text-muted">{s.floor ? "Floor" : "Last"}</span><span className="font-display text-xl">{skillPrice(s) ? `${fmt(skillPrice(s))} SOL` : "—"}</span></span>
                    <span className="text-right"><span className="block text-xs font-extrabold text-muted">{s.listed_qty} listed</span><Pct v={change24(d.hist[s.id])} /></span>
                  </div>
                </Link>
              ))}
              {show("monster") && mons.map((m) => (
                <Link key={`m${m.token_id}`} href={`/item?id=monster:${m.token_id}`} className={card}>
                  <div className="flex items-start gap-3">
                    <MonsterArt dna={m.dna} size={52} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-xl leading-tight">{m.name} <span className="text-muted">#{m.token_id}</span></span>
                      <span className="text-xs font-extrabold uppercase tracking-wide text-teal">Monster · Gen {m.gen}</span>
                    </span>
                    <Star k={`monster:${m.token_id}`} className="-mr-2 -mt-2" />
                  </div>
                  <div className="my-3 grid grid-cols-4 gap-1.5 text-center text-xs font-extrabold">
                    {STATS.map(([k, t]) => <span key={k} className="rounded-lg bg-sky-0 py-1.5"><span className="block uppercase text-muted">{k}</span><span className={cx(t, "text-base")}>{m.dna[k]}</span></span>)}
                  </div>
                  <div className="mt-auto flex items-end justify-between text-sm">
                    <span><span className="block text-xs font-extrabold text-muted">Price</span><span className="font-display text-xl">{m.price ? `${fmt(m.price)} SOL` : "—"}</span></span>
                    <span className="font-extrabold text-muted">{m.record.w}W · {m.record.l}L</span>
                  </div>
                </Link>
              ))}
              {show("collection") && cols.map((c) => (
                <Link key={`c${c.id}`} href={`/collection?id=${c.id}`} className={cx(card, "bg-gradient-to-br from-panel-2 to-panel")}>
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-ember">Collection</span>
                    <Star k={`collection:${c.id}`} className="-mr-2 -mt-2" />
                  </div>
                  <h3 className="text-2xl">{c.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm font-bold text-muted">{c.description}</p>
                  <div className="mt-auto flex -space-x-2 pt-4">{d.skills.filter((s) => s.collection === c.id).slice(0, 6).map((s) => <SkillArt key={s.id} kind={s.kind} rarity={s.rarity} size={34} />)}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// native <details> accordion with active-count badge
function Group({ title, n, children }: { title: string; n: number; children: ReactNode }) {
  return (
    <details open className="group px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-display text-lg [&::-webkit-details-marker]:hidden">
        {title}
        {n > 0 && <span className="grid size-5 place-items-center rounded-full bg-ember font-body text-xs font-extrabold text-ink">{n}</span>}
        <span className="ml-auto text-muted transition group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

function LRow({ href, k, art, name, sub, price, chg, listed }: { href: string; k: string; art: ReactNode; name: string; sub: ReactNode; price: string | null; chg: ReactNode; listed: number }) {
  return (
    <Link href={href} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b-2 border-ink/60 px-4 py-2 transition last:border-0 hover:bg-panel-2 sm:grid-cols-[1fr_7rem_6rem_4rem_auto]">
      <span className="flex min-w-0 items-center gap-3">
        {art}
        <span className="min-w-0"><span className="block truncate font-display text-lg leading-tight">{name}</span><span className="block truncate text-xs font-extrabold uppercase">{sub}</span></span>
      </span>
      <span className="text-right font-display">{price ? `${fmt(price)} SOL` : "—"}</span>
      <span className="hidden text-right text-sm sm:block">{chg}</span>
      <span className="hidden text-right text-sm font-extrabold text-muted sm:block">{listed}</span>
      <Star k={k} />
    </Link>
  );
}
