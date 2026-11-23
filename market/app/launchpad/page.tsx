"use client";
import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import { KIND_LABEL, useAssets, type Kind } from "@/lib/assets";
import { presaleState, type PresaleState } from "@/lib/stats";
import { Countdown, cx, Empty, inputCls, Panel, Progress, SectionHead, SkillArt, Skel, Tabs, useLoad } from "@/components/ui";
import { DropCard, StatePill } from "./drop-card";

const TABS = [["all", "All"], ["live", "Live"], ["soon", "Upcoming"], ["ended", "Completed"]] as const;
type Tab = (typeof TABS)[number][0];
const linkBtn = "inline-flex h-12 items-center justify-center rounded-xl border-3 border-ink px-5 font-display text-xl shadow-drop-sm transition active:translate-y-0.5 active:shadow-none";
const HERO_KINDS: Kind[] = ["Lifesteal", "AirJump", "Power"];

export default function Launchpad() {
  const a = useAssets();
  const [d] = useLoad(async () => {
    const [ps, skills, cols] = await Promise.all([a.presales(), a.skills(), a.collections()]);
    return ps.flatMap((p) => {
      const s = skills.find((x) => x.id === p.skill);
      return s ? [{ p, s, col: cols.find((c) => c.id === s.collection), st: presaleState(p) }] : [];
    });
  }, [a.account]);
  const [tab, setTab] = useState<Tab>("all");
  const [col, setCol] = useState("");
  const [q, setQ] = useState("");

  const cols = [...new Map((d ?? []).flatMap((x) => (x.col ? [[x.col.id, x.col.name] as const] : []))).entries()];
  const count = (t: Tab) => (d ?? []).filter((x) => t === "all" || x.st === t).length;
  const rows = (d ?? []).filter((x) => (tab === "all" || x.st === tab) && (!col || String(x.col?.id) === col) && x.s.name.toLowerCase().includes(q.trim().toLowerCase()));
  const order: Record<PresaleState, number> = { live: 0, soon: 1, ended: 2 };
  rows.sort((x, y) => order[x.st] - order[y.st] || y.p.start_ms - x.p.start_ms);
  const feat = (d ?? []).filter((x) => x.st === "live" && x.p.cap_total).sort((x, y) => y.p.cap_total! - x.p.cap_total!)[0];

  return (
    <>
      {/* hero */}
      <section className="relative mb-10 overflow-hidden rounded-3xl border-3 border-ink bg-gradient-to-br from-sky-2 via-sky-1 to-sky-0 p-6 shadow-drop sm:p-10">
        <div className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-ember/25 blur-3xl" />
        <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <p className="mb-2 font-display text-lg text-gold">🚀 Chomp Launchpad</p>
            <h1 className="text-4xl drop-shadow-[0_4px_0_var(--color-ink)] sm:text-6xl">Launch your skill collection</h1>
            <p className="mt-3 max-w-xl font-bold text-muted">Mint fresh skills straight to brawlers. Set the price, cap and allowlist; sales settle on Solana.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/create" className={cx(linkBtn, "bg-ember text-ink hover:bg-ember-hi")}>Apply now</Link>
              <a href="#how" className={cx(linkBtn, "bg-panel-2 text-cream hover:bg-sky-2")}>How it works</a>
            </div>
          </div>
          {/* CSS illustration: fanned skill cards on a ring */}
          <div aria-hidden className="relative mx-auto hidden size-64 md:block">
            <div className="absolute inset-0 rounded-full border-3 border-dashed border-gold/40" />
            <div className="absolute inset-6 rounded-full bg-sky-0/50" />
            {HERO_KINDS.map((k, i) => (
              <div key={k} className="absolute left-1/2 top-1/2 grid h-36 w-28 place-items-center rounded-2xl border-3 border-ink bg-panel shadow-drop"
                style={{ transform: `translate(-50%,-50%) translateX(${(i - 1) * 72}px) rotate(${(i - 1) * 14}deg)`, zIndex: i === 1 ? 2 : 1 }}>
                <SkillArt kind={k} rarity={i === 1 ? "Epic" : "Rare"} size={64} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* featured */}
      {!d ? <Skel className="mb-10 h-72" /> : feat && (
        <Panel className="mb-10 grid overflow-hidden md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="grid min-h-56 place-items-center border-b-3 border-ink md:border-b-0 md:border-r-3"
            style={{ background: `radial-gradient(circle at 50% 45%, color-mix(in oklab, var(--color-ember) 60%, transparent), var(--color-sky-0) 75%)` }}>
            <SkillArt kind={feat.s.kind} rarity={feat.s.rarity} mag={feat.s.mag} size={150} />
          </div>
          <div className="flex min-w-0 flex-col gap-4 p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2"><span className="font-display text-gold">Featured drop</span><StatePill p={feat.p} /></div>
            <div>
              <p className="text-sm font-extrabold uppercase text-muted">{feat.col?.name}</p>
              <h2 className="text-4xl">{feat.s.name}</h2>
              <p className="font-bold text-muted">{feat.s.rarity} · {KIND_LABEL[feat.s.kind]}</p>
            </div>
            {feat.p.end_ms && <p className="font-extrabold text-muted">Ends in <span className="font-display text-3xl text-ember"><Countdown to={feat.p.end_ms} /></span></p>}
            <div>
              <p className="mb-1 flex justify-between text-sm font-extrabold text-muted"><span>{feat.p.sold}/{feat.p.cap_total} minted</span><span>{((feat.p.sold / feat.p.cap_total!) * 100).toFixed(0)}%</span></p>
              <Progress pct={(feat.p.sold / feat.p.cap_total!) * 100} className="h-4" />
            </div>
            <Link href={`/launch?id=${feat.p.id}`} className={cx(linkBtn, "self-start bg-ember text-ink hover:bg-ember-hi")}>Mint now</Link>
          </div>
        </Panel>
      )}

      {/* all drops */}
      <SectionHead title="All drops" />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onChange={setTab} options={TABS.map(([v, l]) => [v, `${l} ${d ? count(v) : ""}`] as const)} />
        <select value={col} onChange={(e) => setCol(e.target.value)} aria-label="Collection" className={cx(inputCls, "w-full sm:w-48")}>
          <option value="">All collections</option>
          {cols.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <label className="flex h-11 min-w-0 flex-1 basis-56 items-center gap-2 rounded-xl border-3 border-ink bg-sky-0 px-3 focus-within:border-gold">
          <Search className="size-5 shrink-0 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search drops" className="w-full bg-transparent font-bold outline-none placeholder:text-muted/50 focus-visible:outline-none" />
        </label>
      </div>
      {!d ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skel key={i} className="h-80" />)}</div>
      ) : !rows.length ? <Empty>No drops match.</Empty> : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map(({ p, s, col }) => <DropCard key={p.id} p={p} s={s} col={col?.name} href={`/launch?id=${p.id}`} />)}
        </div>
      )}

      {/* how it works */}
      <section id="how" className="mt-14 scroll-mt-24">
        <SectionHead title="How it works" />
        <div className="grid gap-5 md:grid-cols-3">
          {[["Create collection", "Name a themed set and describe its style."], ["Add skills", "Pick kind, rarity, strength, supply and royalty."], ["Open presale", "Set price, window, caps and an optional allowlist. Go live."]].map(([t, b], i) => (
            <Panel key={t} className="flex gap-4 p-5">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl border-3 border-ink bg-gold font-display text-2xl text-ink shadow-drop-sm">{i + 1}</span>
              <div><h3 className="text-2xl">{t}</h3><p className="font-bold text-muted">{b}</p></div>
            </Panel>
          ))}
        </div>
        <Link href="/create" className={cx(linkBtn, "mt-6 bg-gold text-ink hover:brightness-110")}>Start creating</Link>
      </section>
    </>
  );
}
