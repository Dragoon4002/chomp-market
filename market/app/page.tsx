"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { art, change24, fmt, GAMES, amount, skillKey, useAssets, type Point } from "@/lib/assets";
import { Card as UiCard, CardContent, CardDescription, CardTitle } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Play } from "lucide-react";
import { cx, Empty, Loading, MonsterArt, Panel, Pct, prices, SkillArt, SkillRow, Sparkline, useLoad } from "@/components/ui";

function Card({ label, href, chart, icon, name, value, delta }: { label: string; href: string; chart: number[]; icon: ReactNode; name: string; value: string; delta: ReactNode }) {
  return (
    <Link href={href} className="glow group block rounded-2xl bg-panel p-5 transition hover:bg-panel-2">
      <p className="text-sm font-extrabold uppercase tracking-wider text-muted">{label}</p>
      <Sparkline data={chart} className="my-4 h-16 sm:h-24" />
      <div className="flex items-center gap-3 border-t-2 border-ink/60 pt-4">
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-xl leading-tight">{name}</span>
          <span className="text-sm font-bold text-muted tabular-nums">{value}</span>
        </span>
        {delta}
      </div>
    </Link>
  );
}

const Blank = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="glow rounded-2xl bg-panel p-5">
    <p className="mb-4 text-sm font-extrabold uppercase tracking-wider text-muted">{label}</p>
    <Empty>{children}</Empty>
  </div>
);

export default function Home() {
  const a = useAssets();
  const [d] = useLoad(async () => {
    const [skills, presales, monsters, mh] = await Promise.all([a.skills(), a.presales(), a.monsters(), a.history("monsters")]);
    const hist: Record<number, Point[]> = Object.fromEntries(await Promise.all(skills.map(async (s) => [s.id, await a.history(skillKey(s.id))])));
    return { skills, presales, monsters, mh, hist };
  }, [a.account]);

  const now = Date.now();
  const top = d?.skills.filter((s) => d.hist[s.id].length > 1).sort((x, y) => change24(d.hist[y.id]) - change24(d.hist[x.id]))[0];
  const hot = d?.monsters.slice().sort((x, y) => y.record.w - x.record.w)[0];
  const live = d?.presales.filter((p) => !p.ended && p.start_ms <= now && (!p.end_ms || p.end_ms > now)).sort((x, y) => Number(!!y.cap_total) - Number(!!x.cap_total))[0];
  const liveSkill = live && d?.skills.find((s) => s.id === live.skill);
  const soldCurve = live && d ? d.hist[live.skill].filter(([t]) => t >= live.start_ms).map((_, i) => i + 1) : [];
  const movers = d?.skills.filter((s) => d.hist[s.id].length > 1 && s.rarity !== "Common").sort((x, y) => Math.abs(change24(d.hist[y.id])) - Math.abs(change24(d.hist[x.id]))).slice(0, 6);

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl">
        <img src={art("hero.jpg")} alt="" className="absolute inset-0 size-full object-cover object-[70%_40%]" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
        <div className="relative max-w-xl px-6 py-10 sm:px-14 sm:py-14">
          <h1 className="text-3xl sm:text-4xl">New Skills Every Week<br />For Every Player</h1>
          <p className="mt-4 max-w-sm text-sm font-semibold text-neutral-300">Fresh skills and monsters drop in presales. Gear up, then jump into any game.</p>
          <Link href="/collection" className="btn-primary mt-6 inline-flex h-11 items-center rounded-full px-6 text-sm font-extrabold">Check Now</Link>
        </div>
      </section>

      <section id="games" className="mt-6 scroll-mt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl">Most Popular Games</h2>
          <Link href="/search" className="shrink-0 text-sm font-bold text-indigo-400 hover:underline">View All</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {GAMES.map((g) => (
            <UiCard key={g.id} className="glow gap-0 overflow-hidden rounded-2xl bg-panel py-0">
              <div className="relative">
                <img src={art(`${g.id}.png`)} alt="" className={cx("aspect-[274/166] w-full object-cover", "soon" in g && "opacity-60 grayscale-[60%]")} />
                {"soon" in g && <Badge variant="outline" className="absolute right-3 top-3 border-white/10 bg-black/70 font-bold text-neutral-200">Coming Soon</Badge>}
              </div>
              <CardContent className="flex flex-1 flex-col p-4">
                <CardTitle className="text-lg">{g.name}</CardTitle>
                <CardDescription className="mt-1 flex-1 text-xs font-semibold text-muted">{g.desc}</CardDescription>
                <p className="my-3 text-lg leading-none text-amber-400" aria-label="4 out of 5 stars">★★★★☆</p>
                {"soon" in g
                  ? <Button disabled variant="outline" className="h-9 rounded-full border-white/10 bg-transparent text-sm font-bold">Coming Soon</Button>
                  : <Button asChild variant="outline" className="h-9 rounded-full border-indigo-500 bg-transparent text-sm font-bold text-indigo-400 hover:bg-indigo-600 hover:text-white dark:border-indigo-500 dark:bg-transparent dark:hover:bg-indigo-600"><a href={g.url}><Play className="fill-current" /> Play Now</a></Button>}
              </CardContent>
            </UiCard>
          ))}
        </div>
      </section>

      <Panel className="mt-8 p-4 sm:p-5">
        <h2 className="mb-4 text-xl">News Games In This Week</h2>
      <div className="grid gap-5 md:grid-cols-3">
        {!d ? [0, 1, 2].map((i) => <Loading key={i} />) : <>
          {top ? <Card label="Top Skill (24H)" href={`/item?id=skill:${top.id}`} chart={prices(d.hist[top.id])}
            icon={<SkillArt kind={top.kind} rarity={top.rarity} mag={top.mag} size={44} />} name={top.name} value={`${fmt(top.last_price)} SOL`} delta={<Pct v={change24(d.hist[top.id])} />} /> : <Blank label="Top Skill (24H)">No skill sales yet.</Blank>}
          {hot ? <Card label="Hottest Monster" href={`/item?id=monster:${hot.token_id}`} chart={prices(d.mh)}
            icon={<MonsterArt dna={hot.dna} size={44} />} name={hot.name} value={`${fmt(hot.price)} SOL · ${hot.record.w}W`} delta={<Pct v={change24(d.mh)} />} /> : <Blank label="Hottest Monster">No monsters listed.</Blank>}
          {live && liveSkill ? <Card label="Live Presale" href={`/collection?id=${liveSkill.collection}`} chart={soldCurve.length > 1 ? soldCurve : [0, Number(live.sold)]}
            icon={<SkillArt kind={liveSkill.kind} rarity={liveSkill.rarity} mag={liveSkill.mag} size={44} />} name={liveSkill.name}
            value={live.cap_total ? `${live.sold}/${live.cap_total} sold · ${fmt(live.price)} SOL` : `${live.sold} sold · ${fmt(live.price)} SOL`}
            delta={live.cap_total ? <span className="font-extrabold text-up">{Math.round((Number(live.sold) / Number(live.cap_total)) * 100)}%</span> : <span className="font-extrabold text-up">Open</span>} /> : <Blank label="Live Presale">No live presale.</Blank>}
        </>}
      </div>
      </Panel>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="p-3 sm:p-4">
          <div className="flex items-baseline justify-between px-3 pb-2 pt-1">
            <h2 className="text-xl">Top movers</h2>
            <Link href="/search?type=skill&sort=change" className="text-sm font-bold text-indigo-400 hover:underline">See all →</Link>
          </div>
          {!movers ? <Loading /> : movers.length ? movers.map((s) => <SkillRow key={s.id} s={s} h={d!.hist[s.id]} />) : <Empty>No trades yet.</Empty>}
        </Panel>
        <Panel className="p-3 sm:p-4">
          <div className="flex items-baseline justify-between px-3 pb-2 pt-1">
            <h2 className="text-xl">Monsters for sale</h2>
            <Link href="/search?type=monster" className="text-sm font-bold text-indigo-400 hover:underline">See all →</Link>
          </div>
          {!d ? <Loading /> : !d.monsters.length ? <Empty>No monsters for sale.</Empty> : d.monsters.slice(0, 6).map((m) => (
            <Link key={m.token_id} href={`/item?id=monster:${m.token_id}`} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-panel-2">
              <MonsterArt dna={m.dna} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-lg leading-tight">{m.name} <span className="text-muted">#{m.token_id}</span></span>
                <span className="text-xs font-extrabold text-muted">Gen {m.gen} · {m.record.w}W {m.record.l}L</span>
              </span>
              <span className="font-extrabold tabular-nums">{amount(m.price).toFixed(2)} SOL</span>
            </Link>
          ))}
        </Panel>
      </div>
    </>
  );
}
