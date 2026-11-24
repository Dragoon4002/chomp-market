"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Clock, Crown, Flame, Gamepad2, Play, Rocket, Sparkles, Trophy, Zap } from "lucide-react";
import { ago, change24, fmt, short, useAssets, type Machine, type Monster, type Skill } from "@/lib/assets";
import { collectionStats, loadMarket, salesFeed, type Range } from "@/lib/stats";
import { GAMES, gameHero, gameThumb, type Game } from "@/lib/games";
import { GameCard } from "@/components/game-card";
import { cx, Empty, KIND_COLOR, MonsterArt, Panel, Pct, Pill, prices, RARITY_TEXT, Row, SectionHead, Skel, SkillArt, Sparkline, Tabs, useLoad } from "@/components/ui";

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

const PLAYABLE = GAMES.filter((g) => !g.soon);
// ponytail: registry order (playable first). TODO(solana): rank by plays/volume once the indexer tracks matches.
const TOP5 = [...PLAYABLE, ...GAMES.filter((g) => g.soon)].slice(0, 5);
const playHref = (g: Game) => (g.soon ? "/play" : `/play/${g.slug}`);
const hideBroken = (e: { currentTarget: HTMLImageElement }) => { e.currentTarget.style.visibility = "hidden"; };
const btn = "inline-flex h-12 items-center gap-2 rounded-xl border-3 border-ink px-5 font-display text-xl shadow-drop-sm transition active:translate-y-0.5 active:shadow-none";

// Fractal-style hero: rotating featured game over its art, top-5 strip along the bottom
function Hero() {
  const [i, setI] = useState(0);
  const n = PLAYABLE.length;
  useEffect(() => {
    if (n < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 7000);
    return () => clearInterval(t);
  }, [n, i]); // i: manual nav restarts the timer
  const g = PLAYABLE[i];
  if (!g) return null;
  return (
    <section className="relative overflow-hidden rounded-3xl border-3 border-ink bg-sky-0 shadow-drop">
      {PLAYABLE.map((x, j) => {
        const h = gameHero(x);
        return (
          <div key={x.slug} aria-hidden className={cx("absolute inset-0 transition-opacity duration-700", j === i ? "opacity-100" : "opacity-0")}>
            {h ? <img src={h} alt="" onError={hideBroken} className="size-full object-cover" /> : <>
              <img src={gameThumb(x)} alt="" onError={hideBroken} className="size-full scale-110 object-cover opacity-60 blur-2xl" />
              <img src={gameThumb(x)} alt="" onError={hideBroken} className="absolute right-[6%] top-24 hidden w-[36%] rotate-2 rounded-3xl border-3 border-ink shadow-drop md:block" />
            </>}
          </div>
        );
      })}
      <div className="absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/45 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />

      <div className="relative px-5 pt-8 sm:px-10 sm:pt-14">
        <div key={g.slug} className="max-w-xl animate-in fade-in slide-in-from-left-4 duration-500">
          <Pill tone="gold">Featured game</Pill>
          <h1 className="mt-4 text-5xl drop-shadow-[0_5px_0_var(--color-ink)] sm:text-7xl">{g.name}</h1>
          <p className="mt-4 text-base font-bold text-cream/90 sm:text-lg">{g.desc}</p>
          <p className="mt-3 flex flex-wrap gap-1.5">{g.tags.map((t) => <Pill key={t}>{t}</Pill>)}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={`/play/${g.slug}`} className={cx(btn, "bg-ember text-ink hover:bg-ember-hi")}><Play className="size-5 fill-current" /> Play now</Link>
            <Link href="/play" className={cx(btn, "bg-panel hover:bg-panel-2")}>All games</Link>
          </div>
        </div>

        <div className="mt-10 flex items-center gap-3 sm:mt-14">
          <h2 className="flex items-center gap-2 whitespace-nowrap text-2xl sm:text-3xl"><Crown className="size-7 text-gold" />Top 5 Games</h2>
          {n > 1 && <div className="ml-auto flex items-center gap-2">
            {PLAYABLE.map((x, j) => <button key={x.slug} type="button" aria-label={`Show ${x.name}`} onClick={() => setI(j)}
              className={cx("hidden h-3 rounded-full sm:block border-2 border-ink transition-all", j === i ? "w-8 bg-gold" : "w-3 bg-cream/40 hover:bg-cream/70")} />)}
            {[-1, 1].map((d) => <button key={d} type="button" aria-label={d < 0 ? "Previous game" : "Next game"} onClick={() => setI((x) => (x + d + n) % n)}
              className="grid size-10 place-items-center rounded-full border-3 border-ink bg-panel shadow-drop-sm transition hover:bg-panel-2">
              {d < 0 ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}</button>)}
          </div>}
        </div>
        <Row className="pb-6 pt-4">
          {TOP5.map((x, j) => (
            <Link key={x.slug} href={playHref(x)} className="group relative flex w-64 shrink-0 snap-start items-end pl-12 transition hover:-translate-y-1 sm:w-72">
              <span className="outline-text pointer-events-none absolute -bottom-2 left-0 z-10 font-display text-[130px] leading-[0.8] group-hover:[-webkit-text-stroke-color:var(--color-gold)]">{j + 1}</span>
              <span className={cx("relative block w-full overflow-hidden rounded-2xl border-3 border-ink bg-panel-2 shadow-drop", x.slug === g.slug && "outline-3 outline-offset-2 outline-gold")}>
                <img src={gameThumb(x)} alt="" onError={hideBroken} className={cx("aspect-[274/166] w-full object-cover", x.soon && "grayscale-[60%]")} />
                {x.soon && <Pill className="absolute right-2 top-2">Soon</Pill>}
                <span className="block truncate border-t-3 border-ink px-3 py-2 font-display text-lg">{x.name}</span>
              </span>
            </Link>
          ))}
        </Row>
      </div>
    </section>
  );
}

type Player = { id: string; w: number; l: number; ko: number; best: Monster };
// TODO(solana): weekly window needs match results from the indexer; aggregates lifetime monster records for now.
const rankPlayers = (ms: Monster[]) => Object.values(ms.reduce<Record<string, Player>>((acc, m) => {
  const p = (acc[m.owner_id] ??= { id: m.owner_id, w: 0, l: 0, ko: 0, best: m });
  p.w += m.record.w; p.l += m.record.l; p.ko += m.record.ko;
  if (m.record.w > p.best.record.w) p.best = m;
  return acc;
}, {})).sort((x, y) => y.w - x.w || y.ko - x.ko).slice(0, 5);
const MEDAL = ["bg-gold", "bg-cream", "bg-ember"];

export default function Home() {
  const a = useAssets();
  const [range, setRange] = useState<Range>("24H");
  const [d] = useLoad(async () => {
    const [m, machines, monsters, mine, mh] = await Promise.all([loadMarket(a), a.machines(), a.monsters(), a.myMonsters(), a.history("monsters")]);
    const all = [...new Map([...monsters, ...mine].map((x) => [x.token_id, x])).values()];
    return { ...m, machines, monsters, mh, players: rankPlayers(all) };
  }, [a.account]);

  const now = Date.now();
  const byId = (id: number) => d?.skills.find((s) => s.id === id);
  const hottest = d?.skills.filter((s) => d.hist[s.id].length > 1).sort((x, y) => change24(d.hist[y.id]) - change24(d.hist[x.id])).slice(0, 8);
  const top = hottest?.[0];
  const hot = d?.monsters.slice().sort((x, y) => y.record.w - x.record.w)[0];
  const live = d?.presales.filter((p) => !p.ended && p.start_ms <= now && (!p.end_ms || p.end_ms > now)).sort((x, y) => Number(!!y.cap_total) - Number(!!x.cap_total))[0];
  const liveSkill = live && byId(live.skill);
  const soldCurve = live && d ? d.hist[live.skill].filter(([t]) => t >= live.start_ms).map((_, i) => i + 1) : [];
  const cols = d && collectionStats(d.cols, d.skills, d.hist, range).sort((x, y) => y.volume - x.volume);
  const sales = d && salesFeed(d.skills, d.hist, d.mh).slice(0, 18);
  const pool = (m: Machine) => m.pool.slice().sort((x, y) => x.weight - y.weight).map((p) => byId(p.skill)).filter((s): s is Skill => !!s);

  return (
    <div>
{/* hero + top 5 */}
      <Hero />

      {/* featured games */}
      <section className="mt-12">
        <SectionHead title="Featured Games" icon={<Gamepad2 className="size-7 text-teal" />} href="/play" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{GAMES.slice(0, 8).map((g) => <GameCard key={g.slug} g={g} />)}</div>
      </section>

      {/* market highlights */}
      <section className="mt-12">
        <SectionHead title="Market Highlights" icon={<Zap className="size-7 text-gold" />} href="/activity" />
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
      </section>

      {/* top players */}
      <section className="mt-12">
        <SectionHead title="Top Players of the Week" icon={<Trophy className="size-7 text-gold" />} />
        <Panel className="p-2 sm:p-3">
          {!d ? <Skel /> : !d.players.length ? <Empty>No matches played yet.</Empty> : d.players.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 sm:gap-4 sm:px-3">
              <span className={cx("grid size-9 shrink-0 place-items-center rounded-full border-3 border-ink font-display text-lg text-ink", MEDAL[i] ?? "bg-panel-2 text-cream")}>{i + 1}</span>
              <MonsterArt dna={p.best.dna} size={44} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 truncate font-display text-lg leading-tight">{short(p.id)}{p.id === a.account && <Pill tone="teal">You</Pill>}</span>
                <span className="block truncate text-xs font-extrabold text-muted">Best: {p.best.name} #{p.best.token_id}</span>
              </span>
              <span className="hidden w-20 text-right text-sm font-bold text-muted sm:block">KO <span className="text-cream tabular-nums">{p.ko}</span></span>
              <span className="hidden w-20 text-right text-sm font-bold text-muted sm:block">Win <span className="text-cream tabular-nums">{Math.round((p.w / Math.max(1, p.w + p.l)) * 100)}%</span></span>
              <span className="w-20 shrink-0 text-right font-display text-xl tabular-nums">{p.w}<span className="text-sm text-muted">W</span> {p.l}<span className="text-sm text-muted">L</span></span>
            </div>
          ))}
        </Panel>
      </section>

      {/* hottest items */}
      <section className="mt-12">
        <SectionHead title="Hottest in the Store" icon={<Flame className="size-7 text-ember" />} href="/search?type=skill&sort=change" />
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {!hottest ? Array.from({ length: 8 }, (_, i) => <Skel key={i} className="h-52" />) : !hottest.length ? <Empty>No trades yet.</Empty> : hottest.map((s) => (
            <Link key={s.id} href={`/item?id=skill:${s.id}`} className={cx(card, "flex flex-col p-3 hover:bg-panel-2 sm:p-4")}>
              <span className="flex items-center gap-3">
                <SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={48} />
                <span className="min-w-0">
                  <span className="block truncate font-display text-lg leading-tight">{s.name}</span>
                  <span className={cx("text-xs font-extrabold uppercase", RARITY_TEXT[s.rarity])}>{s.rarity}</span>
                </span>
              </span>
              <Sparkline data={prices(d!.hist[s.id])} className="my-3 h-12" />
              <span className="mt-auto flex flex-wrap items-end justify-between gap-x-2">
                <span className="whitespace-nowrap text-sm font-extrabold tabular-nums">{fmt(s.floor ?? s.last_price)} <span className="text-muted">SOL</span></span>
                <Pct v={change24(d!.hist[s.id])} />
              </span>
            </Link>
          ))}
        </div>
      </section>

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
