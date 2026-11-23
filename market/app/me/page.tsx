"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Copy } from "lucide-react";
import { fmt, KIND_LABEL, RARITIES, short, toLamports, useAssets, type Holding, type Rarity, type Skill } from "@/lib/assets";
import { watch } from "@/lib/local";
import { act, Btn, Chip, cx, Empty, inputCls, MonsterArt, Panel, Pill, RARITY_TEXT, SkillArt, Skel, Star, Tabs, toast, useLoad } from "@/components/ui";

const TABS = [["inventory", "Inventory"], ["listings", "Listings"], ["monsters", "Monsters"], ["watchlist", "Watchlist"], ["proceeds", "Proceeds"]] as const;
type Tab = (typeof TABS)[number][0];

function HoldingRow({ h, s, onDone }: { h: Holding; s: Skill; onDone: () => void }) {
  const a = useAssets();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  return (
    <li className="rounded-2xl border-3 border-ink bg-panel-2 p-3">
      <div className="flex items-center gap-3">
        <SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={44} />
        <Link href={`/item?id=skill:${s.id}`} className="min-w-0 flex-1">
          <span className="block truncate font-display text-lg leading-tight hover:text-gold">{s.name}</span>
          <span className={cx("text-xs font-extrabold uppercase", RARITY_TEXT[s.rarity])}>{s.rarity} · {KIND_LABEL[s.kind]}</span>
        </Link>
        <Btn small tone="ghost" disabled={h.free === 0} onClick={() => setOpen(!open)}>{open ? "Close" : "Sell"}</Btn>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-extrabold">
        {([["Free", h.free, "text-cream"], ["Equipped", h.equipped, "text-teal"], ["Listed", h.listed, "text-gold"]] as const).map(([k, v, c]) => (
          <span key={k} className="rounded-xl bg-sky-0/70 py-1.5"><span className="block text-muted">{k}</span><span className={cx("font-display text-lg", c)}>{v}</span></span>
        ))}
      </div>
      {open && (
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); act(() => a.listSkill(s.id, Number(qty), toLamports(price)), "Listed.", () => { setOpen(false); onDone(); }); }}>
          <input className={cx(inputCls, "w-20")} type="number" min={1} max={Number(h.free)} value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity" />
          <input className={cx(inputCls, "flex-1")} type="number" min="0.001" step="0.001" required placeholder={`Each, SOL (floor ${fmt(s.floor)})`} value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Price each" />
          <Btn small className="h-11">List</Btn>
        </form>
      )}
    </li>
  );
}

function Inventory({ holdings, skill, reload }: { holdings: Holding[]; skill: (id: number) => Skill; reload: () => void }) {
  const [q, setQ] = useState("");
  const [r, setR] = useState<Rarity | "All">("All");
  if (!holdings.length) return <Empty>No skills yet. <Link className="text-gold underline" href="/search?type=skill">Browse skills</Link></Empty>;
  const xs = holdings.filter((h) => { const s = skill(h.skill); return (r === "All" || s.rarity === r) && s.name.toLowerCase().includes(q.trim().toLowerCase()); });
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className={cx(inputCls, "w-full sm:w-64")} placeholder="Search your skills" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your skills" />
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">{(["All", ...RARITIES] as const).map((x) => <Chip key={x} on={r === x} onClick={() => setR(x)}>{x}</Chip>)}</div>
      </div>
      {xs.length ? <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{xs.map((h) => <HoldingRow key={h.skill} h={h} s={skill(h.skill)} onDone={reload} />)}</ul> : <Empty>No skills match.</Empty>}
    </>
  );
}

// watch keys "skill:N" | "monster:N" | "collection:N" → cards
function Watchlist({ skills }: { skills: Skill[] }) {
  const a = useAssets();
  const keys = watch.useValue();
  const [items] = useLoad(async () => {
    const cols = await a.collections();
    return Promise.all(keys.map(async (k) => {
      const [t, id] = k.split(":");
      if (t === "skill") { const s = skills.find((x) => String(x.id) === id); return s && { k, href: `/item?id=${k}`, name: s.name, sub: `${s.rarity} · ${KIND_LABEL[s.kind]}`, art: <SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={52} />, price: s.floor }; }
      if (t === "monster") { const m = await a.monster(id); return m && { k, href: `/item?id=${k}`, name: `${m.name} #${m.token_id}`, sub: `${m.record.w}W ${m.record.l}L · Gen ${m.gen}`, art: <MonsterArt dna={m.dna} size={52} />, price: m.price }; }
      if (t === "collection") {
        const c = cols.find((x) => String(x.id) === id), s = skills.find((x) => String(x.collection) === id);
        return c && { k, href: `/collection?id=${id}`, name: c.name, sub: "Collection", art: s ? <SkillArt kind={s.kind} rarity={s.rarity} size={52} /> : <span className="grid size-[52px] place-items-center rounded-[28%] border-3 border-ink bg-sky-2 font-display text-2xl">{c.name[0]}</span>, price: null };
      }
    }));
  }, [keys.join()]);
  if (!keys.length) return <Empty>Nothing watched yet. Tap the ★ on any skill, monster or collection.</Empty>;
  if (!items) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{keys.map((k) => <Skel key={k} className="h-20" />)}</div>;
  const xs = items.filter((x) => !!x);
  if (!xs.length) return <Empty>Watched items are no longer available.</Empty>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {xs.map((x) => (
        <li key={x.k}>
          <Link href={x.href} className="flex items-center gap-3 rounded-2xl border-3 border-ink bg-panel p-3 shadow-drop-sm transition hover:bg-panel-2">
            {x.art}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-lg leading-tight">{x.name}</span>
              <span className="text-xs font-extrabold uppercase text-muted">{x.sub}</span>
              {x.price && <span className="block text-sm font-extrabold">{fmt(x.price)} SOL</span>}
            </span>
            <Star k={x.k} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Me() {
  const a = useAssets();
  const router = useRouter(), path = usePathname(), sp = useSearchParams();
  const watched = watch.useValue().length;
  const tab: Tab = TABS.find(([t]) => t === sp.get("tab"))?.[0] ?? "inventory";
  const setTab = (t: Tab) => { const p = new URLSearchParams(sp); p.set("tab", t); router.replace(`${path}?${p}`, { scroll: false }); };
  const [d, reload] = useLoad(async () => {
    const [skills, holdings, monsters, owed] = await Promise.all([a.skills(), a.holdings(), a.myMonsters(), a.owed()]);
    const listings = (await Promise.all(holdings.filter((h) => h.listed !== 0).map((h) => a.skillListings(h.skill)))).flat().filter((l) => l.seller === a.account);
    return { skills, holdings, monsters, owed, listings };
  }, [a.account]);
  if (!a.account) return <Empty>Connect a wallet to see your stuff. <button className="text-gold underline" onClick={a.signIn}>Connect</button></Empty>;
  if (!d) return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><Skel className="h-24 w-72 max-w-full" /><Skel className="h-20 w-full sm:w-72" /></div>
      <Skel className="mb-6 h-12" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skel key={i} className="h-36" />)}</div>
    </>
  );
  const skill = (id: number) => d.skills.find((s) => s.id === id)!;
  const total = d.holdings.reduce((x, h) => x + Number(h.free) + Number(h.listed) + h.equipped, 0);
  const listedMonsters = d.monsters.filter((m) => m.price);
  const withdraw = () => act(a.withdrawOwed, `Withdrew ${fmt(d.owed)} SOL.`, reload);
  const count: Partial<Record<Tab, number>> = { inventory: d.holdings.length, listings: d.listings.length + listedMonsters.length, monsters: d.monsters.length, watchlist: watched };
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-widest text-gold">My stuff</p>
          <div className="flex items-center gap-2">
            <h1 className="truncate text-4xl drop-shadow-[0_4px_0_var(--color-ink)] sm:text-5xl" title={a.account}>{short(a.account)}</h1>
            <button type="button" aria-label="Copy address" title="Copy address" className="grid size-9 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-panel-2 hover:text-cream"
              onClick={() => navigator.clipboard.writeText(a.account!).then(() => toast("Address copied."), () => toast("Couldn't copy."))}><Copy className="size-5" /></button>
          </div>
          <p className="mt-1 font-bold text-muted">{total} skills · {d.monsters.length} monsters · {count.listings} listings</p>
        </div>
        <Panel className="flex w-full items-center gap-4 p-4 sm:w-auto">
          <div><p className="text-xs font-extrabold uppercase text-muted">Proceeds owed</p><p className="font-display text-3xl">{fmt(d.owed)} SOL</p></div>
          <Btn tone="gold" className="ml-auto" disabled={d.owed === "0"} onClick={withdraw}>Withdraw</Btn>
        </Panel>
      </div>

      <Tabs under value={tab} onChange={setTab} className="mb-6"
        options={TABS.map(([t, l]) => [t, <>{l}{count[t] != null && <span className="ml-1.5 text-sm text-muted">{count[t]}</span>}</>] as const)} />

      {tab === "inventory" && <Inventory holdings={d.holdings} skill={skill} reload={reload} />}

      {tab === "listings" && (d.listings.length || listedMonsters.length ? (
        <Panel className="max-w-3xl p-2">
          {d.listings.map((l) => { const s = skill(l.skill); return (
            <div key={l.skill} className="flex items-center gap-3 rounded-2xl p-2.5">
              <SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={40} />
              <Link href={`/item?id=skill:${s.id}`} className="min-w-0 flex-1"><span className="block truncate font-display text-lg hover:text-gold">{s.name}</span><span className="text-xs font-extrabold text-muted">{l.qty} × {fmt(l.price_each)} SOL</span></Link>
              <Btn small tone="ghost" onClick={() => act(() => a.cancelSkillListing(l.skill), "Listing cancelled.", reload)}>Cancel</Btn>
            </div>
          ); })}
          {listedMonsters.map((m) => (
            <div key={m.token_id} className="flex items-center gap-3 rounded-2xl p-2.5">
              <MonsterArt dna={m.dna} size={40} />
              <Link href={`/item?id=monster:${m.token_id}`} className="min-w-0 flex-1"><span className="block truncate font-display text-lg hover:text-gold">{m.name}</span><span className="text-xs font-extrabold text-muted">{fmt(m.price)} SOL</span></Link>
              <Btn small tone="ghost" onClick={() => act(() => a.delistMonster(m.token_id), "Delisted.", reload)}>Cancel</Btn>
            </div>
          ))}
        </Panel>
      ) : <Empty>Nothing listed. Sell from your Inventory.</Empty>)}

      {tab === "monsters" && (d.monsters.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {d.monsters.map((m) => (
            <Link key={m.token_id} href={`/item?id=monster:${m.token_id}`} className="flex flex-col gap-3 rounded-3xl border-3 border-ink bg-panel p-4 shadow-drop transition hover:-translate-y-1 hover:bg-panel-2">
              <div className="flex items-center gap-4">
                <MonsterArt dna={m.dna} size={88} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-2xl leading-tight">{m.name} <span className="text-muted">#{m.token_id}</span></p>
                  <p className="text-sm font-extrabold text-muted">Gen {m.gen} · <span className="text-up">{m.record.w}W</span> <span className="text-down">{m.record.l}L</span> · {m.record.ko} KO</p>
                  {m.price && <Pill tone="gold" className="mt-1">Listed {fmt(m.price)} SOL</Pill>}
                </div>
              </div>
              <div className="rounded-2xl bg-sky-0/70 p-2.5">
                <p className="mb-1.5 text-xs font-extrabold uppercase text-muted">Equipped {m.skills.length}/3</p>
                {m.skills.length ? (
                  <div className="flex flex-col gap-1.5">{m.skills.map((x, i) => { const s = skill(x.id); return (
                    <span key={i} className="flex items-center gap-2 text-sm font-bold"><SkillArt kind={x.kind} rarity={s?.rarity ?? "Common"} mag={x.mag} size={26} /><span className="truncate">{s?.name ?? KIND_LABEL[x.kind]}</span></span>
                  ); })}</div>
                ) : <p className="text-sm font-bold text-muted">No skills equipped.</p>}
              </div>
            </Link>
          ))}
        </div>
      ) : <Empty>No monsters. Hatch starters in the game.</Empty>)}

      {tab === "watchlist" && <Watchlist skills={d.skills} />}

      {tab === "proceeds" && (
        <Panel className="max-w-2xl p-6">
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted">Proceeds owed</p>
          <p className="font-display text-5xl">{fmt(d.owed)} <span className="text-3xl text-muted">SOL</span></p>
          <p className="mt-3 font-bold text-muted">Sales of your listings and creator royalties on your skills are credited here on chain. Nothing is pushed to you automatically; withdraw to pull the balance into your wallet.</p>
          <Btn tone="gold" className="mt-5" disabled={d.owed === "0"} onClick={withdraw}>Withdraw {fmt(d.owed)} SOL</Btn>
        </Panel>
      )}
    </>
  );
}
