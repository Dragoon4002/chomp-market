"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { fmt, KIND_DESC, KIND_LABEL, skillKey, useAssets, type Point, type Presale, type Skill } from "@/lib/assets";
import { act, Btn, Countdown, cx, Empty, inputCls, Loading, Panel, RARITY_TEXT, SkillArt, SkillRow, useLoad } from "@/components/ui";

function PresaleCard({ p, s, onDone }: { p: Presale; s: Skill; onDone: () => void }) {
  const a = useAssets();
  const [q, setQ] = useState(1);
  const [me] = useLoad(async () => ({ bought: Number(await a.presaleBought(p.id)), ok: !p.allowlist || (await a.presaleAllowed(p.id)) }), [p.id, p.sold, a.account]);
  const now = Date.now();
  const state = p.ended || (p.end_ms && p.end_ms <= now) ? "ended" : p.start_ms > now ? "soon" : "live";
  const cap = p.cap_total ? Number(p.cap_total) : null;
  const pct = cap ? Math.min(100, (Number(p.sold) / cap) * 100) : 0;
  const left = p.per_wallet ? Number(p.per_wallet) - (me?.bought ?? 0) : 99;
  const soldOut = cap != null && Number(p.sold) >= cap;
  const max = Math.max(1, Math.min(left, cap ? cap - Number(p.sold) : 99));
  return (
    <Panel className={cx("flex flex-col gap-4 p-5", state === "live" && "ring-3 ring-ember/70")}>
      <div className="flex items-start gap-3">
        <SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={56} />
        <div className="min-w-0 flex-1">
          <Link href={`/item?id=skill:${s.id}`} className="block truncate font-display text-2xl leading-tight hover:text-gold">{s.name}</Link>
          <p className={cx("text-xs font-extrabold uppercase tracking-wide", RARITY_TEXT[s.rarity])}>{s.rarity} · {KIND_LABEL[s.kind]}</p>
        </div>
        <span className={cx("shrink-0 rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-extrabold uppercase", { live: "bg-up text-ink", soon: "bg-gold text-ink", ended: "bg-panel-2 text-muted" }[state])}>
          {state === "live" ? "● Live" : state === "soon" ? "Soon" : "Ended"}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 text-xs font-extrabold">
        {p.allowlist && <span className={cx("rounded-full border-2 border-ink px-2.5 py-0.5", me?.ok ? "bg-teal text-ink" : "bg-panel-2 text-muted")}>{me?.ok ? "✓ On allowlist" : "Allowlist only"}</span>}
        {p.per_wallet && <span className="rounded-full border-2 border-ink bg-panel-2 px-2.5 py-0.5 text-muted">{p.per_wallet} per wallet{me?.bought ? ` · you have ${me.bought}` : ""}</span>}
        {!cap && !p.end_ms && <span className="rounded-full border-2 border-ink bg-panel-2 px-2.5 py-0.5 text-muted">Permanent shop</span>}
      </div>
      <div className="mt-auto flex items-end justify-between gap-3">
        <div><p className="text-xs font-extrabold uppercase text-muted">Price</p><p className="font-display text-3xl">{fmt(p.price)} Ⓝ</p></div>
        <div className="text-right text-sm font-extrabold">
          {state === "soon" ? <><p className="text-muted">Starts in</p><p className="font-display text-2xl text-gold"><Countdown to={p.start_ms} /></p></>
            : state === "live" && p.end_ms ? <><p className="text-muted">Ends in</p><p className="font-display text-2xl text-ember"><Countdown to={p.end_ms} /></p></>
            : <p className="text-muted">{state === "ended" ? "Closed" : `${p.sold} minted`}</p>}
        </div>
      </div>
      {cap != null && (
        <div>
          <div className="h-4 overflow-hidden rounded-full border-3 border-ink bg-sky-0"><div className="h-full bg-gradient-to-r from-ember to-gold" style={{ width: `${pct}%` }} /></div>
          <p className="mt-1.5 flex justify-between text-xs font-extrabold text-muted"><span>{p.sold} / {cap} minted</span><span>{pct.toFixed(0)}%</span></p>
        </div>
      )}
      {state === "live" && (
        <div className="flex gap-2">
          <input type="number" min={1} max={max} value={q} onChange={(e) => setQ(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} aria-label="Quantity" className={cx(inputCls, "w-20 text-center")} />
          <Btn className="flex-1" disabled={!a.account || soldOut || left <= 0 || me?.ok === false} onClick={() => act(() => a.buyPresale(p, q), `Minted ${q} ${s.name}.`, onDone)}>
            {soldOut ? "Sold out" : left <= 0 ? "Wallet limit hit" : me?.ok === false ? "Not on allowlist" : `Mint · ${fmt(BigInt(p.price) * BigInt(q))} Ⓝ`}
          </Btn>
        </div>
      )}
    </Panel>
  );
}

export default function CollectionPage() {
  const a = useAssets();
  const id = useSearchParams().get("id");
  const [d, reload] = useLoad(async () => {
    const [cols, skills, presales] = await Promise.all([a.collections(), a.skills(), a.presales()]);
    const hist: Record<number, Point[]> = Object.fromEntries(await Promise.all(skills.map(async (s) => [s.id, await a.history(skillKey(s.id))])));
    return { cols, skills, presales, hist };
  }, [a.account]);
  if (!d) return <Loading />;
  if (id == null) return (
    <>
      <h1 className="mb-6 text-5xl drop-shadow-[0_4px_0_var(--color-ink)]">Collections</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{d.cols.map((c) => (
        <Link key={c.id} href={`/collection?id=${c.id}`} className="rounded-3xl border-3 border-ink bg-panel p-5 shadow-drop transition hover:-translate-y-1"><h2 className="text-2xl">{c.name}</h2><p className="mt-1 text-sm font-bold text-muted">{c.description}</p></Link>
      ))}</div>
    </>
  );
  const c = d.cols.find((x) => x.id === Number(id));
  if (!c) return <Empty>Collection not found.</Empty>;
  const skills = d.skills.filter((s) => s.collection === c.id);
  const ps = d.presales.filter((p) => skills.some((s) => s.id === p.skill)).sort((x, y) => Number(x.ended) - Number(y.ended) || (y.cap_total ? 1 : 0) - (x.cap_total ? 1 : 0));
  return (
    <>
      <div className="mb-8 rounded-3xl border-3 border-ink bg-gradient-to-br from-sky-2 via-panel-2 to-panel p-6 shadow-drop sm:p-8">
        <p className="text-xs font-extrabold uppercase tracking-widest text-gold">Collection · by {c.creator}</p>
        <h1 className="mt-1 text-5xl drop-shadow-[0_4px_0_var(--color-ink)] sm:text-6xl">{c.name}</h1>
        <p className="mt-2 max-w-2xl font-bold text-muted">{c.description}</p>
        <div className="mt-5 flex flex-wrap gap-5 text-sm font-extrabold">
          <span><span className="block text-muted">Skills</span><span className="font-display text-2xl">{skills.length}</span></span>
          <span><span className="block text-muted">Minted</span><span className="font-display text-2xl">{skills.reduce((x, s) => x + Number(s.minted), 0).toLocaleString()}</span></span>
          <span><span className="block text-muted">Live presales</span><span className="font-display text-2xl">{ps.filter((p) => !p.ended && p.start_ms <= Date.now() && (!p.end_ms || p.end_ms > Date.now())).length}</span></span>
        </div>
      </div>
      <h2 className="mb-4 text-3xl">Presales</h2>
      {ps.length ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{ps.map((p) => <PresaleCard key={p.id} p={p} s={skills.find((s) => s.id === p.skill)!} onDone={reload} />)}</div> : <Empty>No presales.</Empty>}
      <h2 className="mb-4 mt-10 text-3xl">Skills</h2>
      <Panel className="p-3">
        {skills.map((s) => <div key={s.id}><SkillRow s={s} h={d.hist[s.id]} /><p className="-mt-1 pb-2 pl-[68px] text-xs font-bold text-muted/80">{KIND_DESC[s.kind]}</p></div>)}
      </Panel>
    </>
  );
}
