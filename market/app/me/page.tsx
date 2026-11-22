"use client";
import Link from "next/link";
import { useState } from "react";
import { fmt, KIND_LABEL, amount, toYocto, useAssets, type Holding, type Skill } from "@/lib/assets";
import { act, Btn, cx, Empty, inputCls, Loading, MonsterArt, Panel, RARITY_TEXT, SkillArt, useLoad } from "@/components/ui";

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
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); act(() => a.listSkill(s.id, Number(qty), toYocto(price)), "Listed.", () => { setOpen(false); onDone(); }); }}>
          <input className={cx(inputCls, "w-20")} type="number" min={1} max={Number(h.free)} value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity" />
          <input className={cx(inputCls, "flex-1")} type="number" min="0.001" step="0.001" required placeholder={`Each, SOL (floor ${fmt(s.floor)})`} value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Price each" />
          <Btn small className="h-11">List</Btn>
        </form>
      )}
    </li>
  );
}

export default function Me() {
  const a = useAssets();
  const [d, reload] = useLoad(async () => {
    const [skills, holdings, monsters, owed] = await Promise.all([a.skills(), a.holdings(), a.myMonsters(), a.owed()]);
    const listings = (await Promise.all(holdings.filter((h) => h.listed !== 0).map((h) => a.skillListings(h.skill)))).flat().filter((l) => l.seller === a.account);
    return { skills, holdings, monsters, owed, listings };
  }, [a.account]);
  if (!a.account) return <Empty>Connect a wallet to see your stuff. <button className="text-gold underline" onClick={a.signIn}>Connect</button></Empty>;
  if (!d) return <Loading />;
  const skill = (id: number) => d.skills.find((s) => s.id === id)!;
  const total = d.holdings.reduce((x, h) => x + Number(h.free) + Number(h.listed) + h.equipped, 0);
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-widest text-gold">My stuff</p>
          <h1 className="truncate text-4xl drop-shadow-[0_4px_0_var(--color-ink)] sm:text-5xl">{a.account}</h1>
          <p className="mt-1 font-bold text-muted">{total} skills · {d.monsters.length} monsters · {d.listings.length + d.monsters.filter((m) => m.price).length} listings</p>
        </div>
        <Panel className="flex w-full items-center gap-4 p-4 sm:w-auto">
          <div><p className="text-xs font-extrabold uppercase text-muted">Proceeds owed</p><p className="font-display text-3xl">{fmt(d.owed)} SOL</p></div>
          <Btn tone="gold" className="ml-auto" disabled={d.owed === "0"} onClick={() => act(a.withdrawOwed, `Withdrew ${fmt(d.owed)} SOL.`, reload)}>Withdraw</Btn>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section>
          <h2 className="mb-3 text-3xl">Skills</h2>
          {d.holdings.length ? <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{d.holdings.map((h) => <HoldingRow key={h.skill} h={h} s={skill(h.skill)} onDone={reload} />)}</ul>
            : <Empty>No skills yet. <Link className="text-gold underline" href="/search?type=skill">Browse skills</Link></Empty>}
        </section>
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="mb-3 text-3xl">My listings</h2>
            {d.listings.length || d.monsters.some((m) => m.price) ? (
              <Panel className="p-2">
                {d.listings.map((l) => { const s = skill(l.skill); return (
                  <div key={l.skill} className="flex items-center gap-3 rounded-2xl p-2.5">
                    <SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={40} />
                    <span className="min-w-0 flex-1"><span className="block truncate font-display text-lg">{s.name}</span><span className="text-xs font-extrabold text-muted">{l.qty} × {fmt(l.price_each)} SOL</span></span>
                    <Btn small tone="ghost" onClick={() => act(() => a.cancelSkillListing(l.skill), "Listing cancelled.", reload)}>Cancel</Btn>
                  </div>
                ); })}
                {d.monsters.filter((m) => m.price).map((m) => (
                  <div key={m.token_id} className="flex items-center gap-3 rounded-2xl p-2.5">
                    <MonsterArt dna={m.dna} size={40} />
                    <span className="min-w-0 flex-1"><span className="block truncate font-display text-lg">{m.name}</span><span className="text-xs font-extrabold text-muted">{fmt(m.price)} SOL</span></span>
                    <Btn small tone="ghost" onClick={() => act(() => a.delistMonster(m.token_id), "Delisted.", reload)}>Cancel</Btn>
                  </div>
                ))}
              </Panel>
            ) : <Empty>Nothing listed.</Empty>}
          </section>
          <section>
            <h2 className="mb-3 text-3xl">Monsters</h2>
            {d.monsters.length ? <div className="grid gap-3">{d.monsters.map((m) => (
              <Link key={m.token_id} href={`/item?id=monster:${m.token_id}`} className="flex items-center gap-3 rounded-2xl border-3 border-ink bg-panel p-3 shadow-drop-sm transition hover:bg-panel-2">
                <MonsterArt dna={m.dna} size={52} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-xl leading-tight">{m.name} <span className="text-muted">#{m.token_id}</span></span>
                  <span className="text-xs font-extrabold text-muted">{m.record.w}W {m.record.l}L · {m.skills.length}/3 skills{m.price ? ` · listed ${amount(m.price).toFixed(2)} SOL` : ""}</span>
                </span>
                <span className="flex -space-x-2">{m.skills.map((x, i) => <SkillArt key={i} kind={x.kind} rarity={skill(x.id)?.rarity ?? "Common"} size={30} />)}</span>
              </Link>
            ))}</div> : <Empty>No monsters. Hatch starters in the game.</Empty>}
          </section>
        </div>
      </div>
    </>
  );
}
