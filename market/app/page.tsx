"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Clock, Flame, Gamepad2, Rocket, Sparkles, Trophy } from "lucide-react";
import { ago, amount, change24, fmt, useAssets, type Machine, type Skill } from "@/lib/assets";
import { collectionStats, loadMarket, salesFeed, windowStats, type Range } from "@/lib/stats";
import { GAMES, gameThumb } from "@/lib/games";
import { cx, Empty, KIND_COLOR, MonsterArt, Panel, Pct, Pill, prices, RARITY_TEXT, Row, SearchBar, SectionHead, Skel, SkillArt, SkillRow, Sparkline, Tabs, useLoad } from "@/components/ui";

const card = "rounded-3xl border-3 border-ink bg-panel shadow-drop transition hover:-translate-y-1";

function Stat({ label, href, chart, icon, name, value, delta }: { label: string; href: string; chart: number[]; icon: ReactNode; name: string; value: string; delta: ReactNode }) {
  return (
    <Link href={href} className={cx(card, "block p-5 hover:bg-panel-2")}>
      <p className="text-sm font-extrabold uppercase tracking-wider text-muted">{label}</p>
      <Sparkline data={chart} className="my-4 h-16 sm:h-24" />
      <div className="flex items-center gap-3 border-t-3 border-ink/60 pt-4">
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
  <div className={cx(card, "p-5")}><p className="mb-4 text-sm font-extrabold uppercase tracking-wider text-muted">{label}</p><Empty>{children}</Empty></div>
);

// capsule machine drawn in CSS: glass dome holding pool skills, tinted by the rarest pool skill
function MachineArt({ m, pool }: { m: Machine; pool: Skill[] }) {
  const c = KIND_COLOR[pool[0]?.kind ?? "Power"];
  return (
    <div className={cx("relative mx-auto flex h-44 w-40 flex-col items-center", m.stock === 0 && "opacity-50 grayscale")} aria-hidden>
      <div className="relative z-10 grid size-32 place-items-center overflow-hidden rounded-full border-3 border-ink shadow-drop-sm"
        style={{ background: `radial-gradient(circle at 35% 30%, color-mix(in oklab, ${c} 55%, white), color-mix(in oklab, ${c} 35%, #0c0816))` }}>
        <span className="absolute left-5 top-3 h-8 w-4 -rotate-12 rounded-full bg-white/35" />
        <div className="flex flex-wrap justify-center gap-1 px-3 pt-3">
          {pool.slice(0, 4).map((s, i) => <span key={i} className={cx(i % 2 === 1 && "translate-y-2")}><SkillArt kind={s.kind} rarity={s.rarity} size={36} /></span>)}
        </div>
      </div>
      <div className="-mt-4 flex h-16 w-36 items-end justify-center rounded-2xl border-3 border-ink pb-2" style={{ background: `linear-gradient(${c}, color-mix(in oklab, ${c} 50%, #0c0816))` }}>
        <span className="grid size-9 place-items-center rounded-full border-3 border-ink bg-gold"><span className="h-4 w-1 rounded bg-ink" /></span>
      </div>
    </div>
  );
}

// stacked skill tiles as collection art
const Stack = ({ skills, size = 44 }: { skills: Skill[]; size?: number }) => (
  <span className="flex shrink-0 -space-x-4">
    {skills.slice(0, 3).map((s, i) => <span key={s.id} style={{ transform: `rotate(${(i - 1) * 8}deg)` }}><SkillArt kind={s.kind} rarity={s.rarity} size={size} /></span>)}
  </span>
);

const RANGES = [["24H", "24h"], ["7D", "7d"], ["30D", "30d"]] as const;

export default function Home() {
  const a = useAssets();
  const [range, setRange] = useState<Range>("24H");
  const [d] = useLoad(async () => {
    const [m, machines, monsters, mh] = await Promise.all([loadMarket(a), a.machines(), a.monsters(), a.history("monsters")]);
    return { ...m, machines, monsters, mh };
  }, [a.account]);

  const now = Date.now();
  const byId = (id: number) => d?.skills.find((s) => s.id === id);
  const top = d?.skills.filter((s) => d.hist[s.id].length > 1).sort((x, y) => change24(d.hist[y.id]) - change24(d.hist[x.id]))[0];
  const hot = d?.monsters.slice().sort((x, y) => y.record.w - x.record.w)[0];
  const live = d?.presales.filter((p) => !p.ended && p.start_ms <= now && (!p.end_ms || p.end_ms > now)).sort((x, y) => Number(!!y.cap_total) - Number(!!x.cap_total))[0];
  const liveSkill = live && byId(live.skill);
  const soldCurve = live && d ? d.hist[live.skill].filter(([t]) => t >= live.start_ms).map((_, i) => i + 1) : [];
  const movers = d?.skills.filter((s) => d.hist[s.id].length > 1 && s.rarity !== "Common").sort((x, y) => Math.abs(change24(d.hist[y.id])) - Math.abs(change24(d.hist[x.id]))).slice(0, 6);
  const cols = d && collectionStats(d.cols, d.skills, d.hist, range).sort((x, y) => y.volume - x.volume);
  const topSkills = d?.skills.map((s) => ({ s, v: windowStats(d.hist[s.id], "7D").volume })).sort((x, y) => y.v - x.v).slice(0, 10);
  const sales = d && salesFeed(d.skills, d.hist, d.mh).slice(0, 18);
  const pool = (m: Machine) => m.pool.slice().sort((x, y) => x.weight - y.weight).map((p) => byId(p.skill)).filter((s): s is Skill => !!s);

  return (
    <div>
      {/* hero */}
      <section className="flex flex-col items-center px-2 pb-10 pt-8 text-center sm:pt-14">
        <Pill className="text-gold">Skills · Monsters · Presales</Pill>
        <h1 className="mt-5 text-5xl drop-shadow-[0_6px_0_var(--color-ink)] sm:text-7xl lg:text-8xl">Trade in the <span className="text-ember">Arena</span></h1>
        <p className="mt-5 max-w-lg text-base font-bold text-muted sm:text-lg">Buy skills, gear up your monster, win more fights. Everything settles on Solana.</p>
        <div className="mt-8 w-full max-w-3xl"><SearchBar big /></div>
      </section>

      {/* stat cards */}
      <div className="grid gap-5 md:grid-cols-3">
        {!d ? [0, 1, 2].map((i) => <Skel key={i} className="h-60" />) : <>
          {top ? <Stat label="Top Skill (24H)" href={`/item?id=skill:${top.id}`} chart={prices(d.hist[top.id])}
            icon={<SkillArt kind={top.kind} rarity={top.rarity} mag={top.mag} size={44} />} name={top.name} value={`${fmt(top.last_price)} SOL`} delta={<Pct v={change24(d.hist[top.id])} />} /> : <Blank label="Top Skill (24H)">No skill sales yet.</Blank>}
          {hot ? <Stat label="Hottest Monster" href={`/item?id=monster:${hot.token_id}`} chart={prices(d.mh)}
            icon={<MonsterArt dna={hot.dna} size={44} />} name={hot.name} value={`${fmt(hot.price)} SOL · ${hot.record.w}W`} delta={<Pct v={change24(d.mh)} />} /> : <Blank label="Hottest Monster">No monsters listed.</Blank>}
          {live && liveSkill ? <Stat label="Live Presale" href={`/collection?id=${liveSkill.collection}`} chart={soldCurve.length > 1 ? soldCurve : [0, Number(live.sold)]}
            icon={<SkillArt kind={liveSkill.kind} rarity={liveSkill.rarity} mag={liveSkill.mag} size={44} />} name={liveSkill.name}
            value={live.cap_total ? `${live.sold}/${live.cap_total} sold · ${fmt(live.price)} SOL` : `${live.sold} sold · ${fmt(live.price)} SOL`}
            delta={<span className="font-extrabold text-up">{live.cap_total ? `${Math.round((Number(live.sold) / Number(live.cap_total)) * 100)}%` : "Open"}</span>} /> : <Blank label="Live Presale">No live presale.</Blank>}
        </>}
      </div>

      {/* fortune spin */}
      <section className="mt-12">
        <SectionHead title="Fortune Spin" icon={<Sparkles className="size-7 text-gold" />} href="/spin" />
        <Panel className="bg-[radial-gradient(ellipse_at_10%_100%,color-mix(in_oklab,var(--color-ember)_30%,transparent),transparent_60%)] px-4 py-3">
          <Row className="py-2">
            <div className="flex w-44 shrink-0 snap-start flex-col justify-between p-2 sm:w-56 sm:p-3">
              <div>
                <p className="font-display text-3xl uppercase leading-none">Meet the<br /><span className="text-gold">machines</span></p>
                <p className="mt-3 font-bold text-muted">Spin to win skills. Every pull is drawn by on-chain randomness.</p>
              </div>
              <Link href="/spin" className="mt-6 inline-flex h-11 w-fit items-center rounded-xl border-3 border-ink bg-ember px-5 font-display text-lg text-ink shadow-drop-sm transition hover:bg-ember-hi">Learn more</Link>
            </div>
            {!d ? [0, 1, 2].map((i) => <Skel key={i} className="h-80 w-64 shrink-0" />) : d.machines.map((m) => (
              <Link key={m.id} href={`/spin?id=${m.id}`} className={cx(card, "flex w-64 shrink-0 snap-start flex-col bg-panel-2 p-4")}>
                <span className="mb-2 flex flex-wrap gap-1.5">
                  {m.stock === 0 ? <Pill tone="down">Out of stock</Pill> : <Pill tone="teal">{m.spins.toLocaleString()} spins</Pill>}
                  {m.vrf_free && <Pill tone="gold">No VRF fee</Pill>}
                </span>
                <MachineArt m={m} pool={pool(m)} />
                <span className="mt-3 text-center font-display text-xl">{m.name}</span>
                <span className="text-center font-extrabold tabular-nums">{fmt(m.price)} <span className="text-muted">SOL</span></span>
              </Link>
            ))}
          </Row>
        </Panel>
      </section>

      {/* trending collections */}
      <section className="mt-12">
        <SectionHead title="Trending Collections" icon={<Flame className="size-7 text-ember" />} href="/collections">
          <Tabs value={range} options={RANGES} onChange={setRange} />
        </SectionHead>
        <Row>
          <div className="grid shrink-0 auto-cols-[300px] grid-flow-col grid-rows-2 gap-3">
            {!cols ? Array.from({ length: 8 }, (_, i) => <Skel key={i} className="h-24" />) : cols.map((x) => (
              <Link key={x.c.id} href={`/collection?id=${x.c.id}`} className={cx(card, "flex snap-start items-center gap-3 p-3 shadow-drop-sm hover:bg-panel-2")}>
                <span className="grid h-[72px] w-20 shrink-0 place-items-center rounded-2xl border-3 border-ink bg-sky-1"><Stack skills={x.skills} size={34} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-lg leading-tight">{x.c.name}</span>
                  <span className="mt-1 grid grid-cols-2 gap-2 text-xs font-bold text-muted">
                    <span>Volume<span className="block whitespace-nowrap text-sm text-cream tabular-nums">{x.volume.toFixed(2)} <span className="text-xs text-muted">SOL</span></span><Pct v={x.dVolume} className="text-[11px]" /></span>
                    <span>Sales<span className="block text-sm text-cream tabular-nums">{x.sales}</span><Pct v={x.dSales} className="text-[11px]" /></span>
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </Row>
      </section>

      {/* top skills */}
      <section className="mt-12">
        <SectionHead title="Top Skills" icon={<Trophy className="size-7 text-gold" />} href="/search?type=skill" />
        <Row>
          {!topSkills ? Array.from({ length: 5 }, (_, i) => <Skel key={i} className="h-56 w-56 shrink-0" />) : topSkills.map(({ s, v }, i) => (
            <Link key={s.id} href={`/item?id=skill:${s.id}`} className="group relative flex w-64 shrink-0 snap-start items-end pl-14 transition hover:-translate-y-1">
              <span className="outline-text pointer-events-none absolute bottom-0 left-0 font-display text-[150px] leading-[0.8] group-hover:[-webkit-text-stroke-color:var(--color-gold)]">{i + 1}</span>
              <span className="relative flex w-full flex-col items-center rounded-3xl border-3 border-ink bg-panel-2 p-4 shadow-drop">
                <SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={96} />
                <span className="mt-3 w-full truncate text-center font-display text-lg">{s.name}</span>
                <span className={cx("text-xs font-extrabold uppercase", RARITY_TEXT[s.rarity])}>{s.rarity}</span>
                <span className="mt-2 text-sm font-bold text-muted">7D vol <span className="text-cream tabular-nums">{v.toFixed(2)} SOL</span></span>
              </span>
            </Link>
          ))}
        </Row>
      </section>

      {/* featured games */}
      <section className="mt-12">
        <SectionHead title="Featured Games" icon={<Gamepad2 className="size-7 text-teal" />} href="/play" />
        <Row>
          {GAMES.map((g) => (
            <Link key={g.slug} href={g.soon ? "/play" : `/play/${g.slug}`} className={cx(card, "relative block h-44 w-72 shrink-0 snap-start overflow-hidden")}>
              <img src={gameThumb(g)} alt="" className={cx("absolute inset-0 size-full object-cover", g.soon && "grayscale-[60%]")} />
              <span className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
              {g.soon && <Pill className="absolute right-3 top-3">Coming soon</Pill>}
              <span className="absolute inset-x-3 bottom-3">
                <span className="block truncate font-display text-2xl drop-shadow-[0_2px_0_var(--color-ink)]">{g.name}</span>
                <span className="mt-1 flex gap-1">{g.tags.slice(0, 3).map((t) => <Pill key={t}>{t}</Pill>)}</span>
              </span>
            </Link>
          ))}
        </Row>
      </section>

      {/* recent sales */}
      <section className="mt-12">
        <SectionHead title="Recent Sales" icon={<Clock className="size-7 text-muted" />} href="/activity" />
        {sales && !sales.length ? <Empty>No sales yet.</Empty> : <Row>
          <div className="grid shrink-0 auto-cols-[260px] grid-flow-col grid-rows-3 gap-3">
            {!sales ? Array.from({ length: 12 }, (_, i) => <Skel key={i} className="h-[72px]" />) : sales.map((x, i) => (
              <Link key={i} href={x.skill ? `/item?id=${x.key}` : "/search?type=monster"} className="flex snap-start items-center gap-3 rounded-2xl border-3 border-ink bg-panel p-2.5 shadow-drop-sm transition hover:-translate-y-1 hover:bg-panel-2">
                {x.skill ? <SkillArt kind={x.skill.kind} rarity={x.skill.rarity} mag={x.skill.mag} size={44} />
                  : <span className="grid size-11 shrink-0 place-items-center rounded-[28%] border-3 border-ink bg-sky-2 font-display text-lg">M</span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display leading-tight">{x.skill?.name ?? "Monster"}</span>
                  <span className="block truncate text-xs font-bold text-muted">{x.skill ? d!.cols.find((c) => c.id === x.skill!.collection)?.name : "Monsters"}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-extrabold tabular-nums">{fmt(x.price)} SOL</span>
                  <span className="text-[11px] font-bold text-muted">{ago(x.t)}</span>
                </span>
              </Link>
            ))}
          </div>
        </Row>}
      </section>

      {/* movers | monsters */}
      <div className="mt-12 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="p-3 sm:p-4">
          <div className="flex items-baseline justify-between px-3 pb-2 pt-1">
            <h2 className="text-2xl">Top movers</h2>
            <Link href="/search?type=skill&sort=change" className="text-sm font-extrabold text-gold hover:underline">See all →</Link>
          </div>
          {!movers ? <Skel /> : movers.length ? movers.map((s) => <SkillRow key={s.id} s={s} h={d!.hist[s.id]} />) : <Empty>No trades yet.</Empty>}
        </Panel>
        <Panel className="p-3 sm:p-4">
          <div className="flex items-baseline justify-between px-3 pb-2 pt-1">
            <h2 className="text-2xl">Monsters for sale</h2>
            <Link href="/search?type=monster" className="text-sm font-extrabold text-gold hover:underline">See all →</Link>
          </div>
          {!d ? <Skel /> : !d.monsters.length ? <Empty>No monsters for sale.</Empty> : d.monsters.slice(0, 6).map((m) => (
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

      {/* launchpad banner */}
      <section className="relative mt-12 overflow-hidden rounded-3xl border-3 border-ink bg-gradient-to-br from-sky-2 via-panel-2 to-[color-mix(in_oklab,var(--color-ember)_45%,var(--color-panel-2))] p-6 shadow-drop sm:p-10">
        <div className="relative z-10 max-w-xl">
          <p className="flex items-center gap-2 font-display text-lg text-gold"><Rocket className="size-5" /> Chomp Launchpad</p>
          <h2 className="mt-2 text-4xl sm:text-5xl">Launch your skill collection</h2>
          <p className="mt-3 font-bold text-muted">Mint skills for every fighter, run a presale, and earn royalties on each trade.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/create" className="inline-flex h-12 items-center rounded-xl border-3 border-ink bg-ember px-5 font-display text-xl text-ink shadow-drop-sm transition hover:bg-ember-hi">Apply now</Link>
            <Link href="/launchpad" className="inline-flex h-12 items-center rounded-xl border-3 border-ink bg-panel px-5 font-display text-xl shadow-drop-sm transition hover:bg-sky-2">Browse drops</Link>
          </div>
        </div>
        {/* decorative: orbit of skill tiles */}
        <div className="pointer-events-none absolute -right-16 top-1/2 hidden size-80 -translate-y-1/2 place-items-center rounded-full border-3 border-dashed border-gold/40 md:grid lg:right-12" aria-hidden>
          <div className="grid size-56 place-items-center rounded-full border-3 border-ink bg-sky-0/50">
            <div className="flex -space-x-5">
              {(["Power", "SecondWind", "Speed"] as const).map((k, i) => <span key={k} style={{ transform: `rotate(${(i - 1) * 12}deg) translateY(${i === 1 ? -12 : 0}px)` }}><SkillArt kind={k} rarity={i === 1 ? "Epic" : "Rare"} size={72} /></span>)}
            </div>
          </div>
          <Rocket className="absolute bottom-10 left-6 size-12 -rotate-12 fill-ember text-ink" />
        </div>
      </section>
    </div>
  );
}
