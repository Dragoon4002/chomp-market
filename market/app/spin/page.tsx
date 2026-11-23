"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ago, fmt, KIND_LABEL, short, useAssets, type Drop, type Machine, type Skill } from "@/lib/assets";
import { Breadcrumb, Btn, cx, Empty, Panel, Pill, RARITY_TEXT, SkillArt, Skel, Tabs, toast, useLoad } from "@/components/ui";

const TINT = ["#ff8a3d", "#ff5d6c", "#b59cff", "#3fc1b0", "#ffd166", "#6fa8ff"];
const SERIES = { Gaming: "Gaming Series", Others: "Others" } as const;
const total = (m: Machine) => m.pool.reduce((x, p) => x + p.weight, 0);
// ball spots inside the dome (% of dome box)
const SPOTS = [[18, 58], [42, 64], [66, 58], [30, 34], [56, 36], [78, 34], [44, 14]];

// capsule machine: glass dome over a tinted body w/ coin slot + chute. `inner` replaces the balls (reel on detail page)
function MachineArt({ m, sk, big, inner }: { m: Machine; sk: (id: number) => Skill | undefined; big?: boolean; inner?: ReactNode }) {
  const c = TINT[m.id % TINT.length];
  const ball = big ? 44 : 30;
  return (
    <div className={cx("relative mx-auto flex w-full flex-col items-center", big ? "max-w-sm" : "max-w-[220px]")}>
      <div className="relative z-10 aspect-[5/4] w-[86%] overflow-hidden rounded-t-[999px] rounded-b-2xl border-3 border-ink"
        style={{ background: "radial-gradient(circle at 30% 20%, rgb(255 255 255 / .28), transparent 40%), linear-gradient(#2e2350cc, #140f24ee)" }}>
        {inner ?? m.pool.slice(0, SPOTS.length).map((p, i) => {
          const s = sk(p.skill);
          return s && (
            <span key={i} className="absolute -translate-x-1/2" style={{ left: `${SPOTS[i][0]}%`, top: `${SPOTS[i][1]}%` }}>
              <SkillArt kind={s.kind} rarity={s.rarity} size={ball} />
            </span>
          );
        })}
        <span className="pointer-events-none absolute left-[14%] top-[12%] h-[28%] w-[10%] -rotate-[25deg] rounded-full bg-white/25" />
      </div>
      <div className="relative -mt-2 w-full rounded-2xl border-3 border-ink px-4 pb-3 pt-4 shadow-drop"
        style={{ background: `linear-gradient(160deg, color-mix(in oklab, ${c} 92%, white), color-mix(in oklab, ${c} 55%, #0c0816))` }}>
        <div className="flex items-center justify-between gap-3">
          <span className={cx("grid place-items-center rounded-full border-3 border-ink bg-sky-0", big ? "size-16" : "size-11")}>
            <span className={cx("w-1.5 rounded-full bg-gold", big ? "h-8" : "h-5")} />
          </span>
          <span className={cx("whitespace-nowrap rounded-lg border-3 border-ink bg-sky-0/80 font-display text-gold", big ? "px-3 py-1 text-xl" : "px-2 text-sm")}>{fmt(m.price)} SOL</span>
          <span className={cx("rounded-t-xl rounded-b-md border-3 border-ink bg-ink/70", big ? "h-12 w-16" : "h-8 w-11")} />
        </div>
      </div>
    </div>
  );
}

function Bubble({ d, s }: { d: Drop; s?: Skill }) {
  if (!s) return null;
  return (
    <Link href={`/item?id=skill:${s.id}`} className="flex w-20 shrink-0 flex-col items-center gap-1 text-center">
      <span className={cx("grid size-16 place-items-center rounded-full border-3 border-ink bg-panel-2 ring-3", d.lucky ? "ring-gold" : "ring-teal/60")}>
        <SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={38} />
      </span>
      <span className="w-full truncate text-[11px] font-extrabold leading-tight">{s.name}</span>
      <span className="text-[10px] font-bold text-muted">{short(d.account)}</span>
    </Link>
  );
}

function Strip({ title, drops, sk, className }: { title: ReactNode; drops: Drop[]; sk: (id: number) => Skill | undefined; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <p className="mb-2 text-xs font-extrabold uppercase tracking-widest text-muted">{title}</p>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1 pt-1">
        {drops.length ? drops.map((d, i) => <Bubble key={`${d.t}-${i}`} d={d} s={sk(d.skill)} />) : <span className="text-sm font-bold text-muted">None yet. Epic pulls land here.</span>}
      </div>
    </div>
  );
}

function MachineCard({ m, sk }: { m: Machine; sk: (id: number) => Skill | undefined }) {
  const out = m.stock === 0;
  return (
    <Link href={`/spin?id=${m.id}`} className={cx("group relative flex flex-col rounded-3xl border-3 border-ink bg-panel p-4 pt-12 shadow-drop transition hover:-translate-y-1 hover:bg-panel-2", out && "opacity-80")}>
      <span className="absolute left-3 right-3 top-3 flex flex-wrap gap-1.5">
        {out ? <Pill tone="down">Out of stock</Pill> : <Pill tone="teal">{m.spins.toLocaleString()} spins</Pill>}
        {m.vrf_free && <Pill tone="gold">No VRF fee</Pill>}
      </span>
      <MachineArt m={m} sk={sk} />
      <h3 className="mt-4 truncate text-center text-2xl">{m.name}</h3>
      <p className="text-center font-extrabold">{fmt(m.price)} <span className="text-muted">SOL</span></p>
    </Link>
  );
}

function List({ ms, drops, sk }: { ms: Machine[]; drops: Drop[]; sk: (id: number) => Skill | undefined }) {
  const [tab, setTab] = useState<"All" | "Gaming" | "Others">("All");
  const newest = [...drops].sort((x, y) => y.t - x.t);
  return (
    <>
      <Panel className="mb-8 grid gap-4 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]">
        <Strip title={<span className="text-gold">★ Lucky drop</span>} drops={newest.filter((d) => d.lucky)} sk={sk} className="lg:border-r-3 lg:border-ink lg:pr-4" />
        <Strip title="Latest drop" drops={newest.slice(0, 20)} sk={sk} />
      </Panel>
      <h1 className="text-5xl drop-shadow-[0_4px_0_var(--color-ink)] sm:text-6xl">Fortune Spin</h1>
      <p className="mb-5 mt-2 font-bold text-muted">Spin a machine, win a skill. Odds are on chain; randomness from VRF.</p>
      <Tabs value={tab} onChange={setTab} options={[["All", "All machines"], ["Gaming", "Gaming"], ["Others", "Others"]]} className="mb-8 w-fit max-w-full" />
      {!ms.length && <Empty>No machines yet.</Empty>}
      {(["Gaming", "Others"] as const).filter((s) => tab === "All" || tab === s).map((s) => {
        const xs = ms.filter((m) => m.series === s);
        return !!xs.length && (
          <section key={s} className="mb-10">
            <h2 className="mb-4 text-3xl">{SERIES[s]}</h2>
            <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{xs.map((m) => <MachineCard key={m.id} m={m} sk={sk} />)}</div>
          </section>
        );
      })}
    </>
  );
}

function Detail({ m, drops, sk, reload }: { m: Machine; drops: Drop[]; sk: (id: number) => Skill | undefined; reload: () => void }) {
  const a = useAssets();
  const [spinning, setSpinning] = useState(false);
  const [wins, setWins] = useState<number[]>([]);
  const out = m.stock === 0;
  const tot = total(m);
  const pool = [...m.pool].sort((x, y) => y.weight - x.weight);
  const last = wins.length ? sk(wins[wins.length - 1]) : undefined;

  const spin = async (n: number) => {
    setSpinning(true); setWins([]);
    toast("Confirm in your wallet…");
    const got: number[] = [];
    try {
      for (let i = 0; i < n; i++) { got.push((await a.spin(m)).skill); setWins([...got]); }
      toast(n > 1 ? `Won ${n} skills!` : `You won ${sk(got[0])?.name ?? "a skill"}!`);
    } catch (e) { toast(String((e as Error)?.message ?? e).slice(0, 160)); }
    setSpinning(false); reload();
  };

  const strip = [...m.pool, ...m.pool].map((p, i) => { const s = sk(p.skill); return s && <span key={i} className="grid h-24 place-items-center"><SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={64} /></span>; });
  const reel = (
    <div className="absolute inset-x-[18%] bottom-[10%] top-[22%] overflow-hidden rounded-2xl border-3 border-ink bg-sky-0/80">
      <div className="absolute inset-x-0 top-1/2 h-24 -translate-y-1/2">
        {spinning ? <div style={{ animation: "reel .35s linear infinite" }}>{strip}</div>
          : last ? <span key={wins.length} className="grid h-24 place-items-center" style={{ animation: "pop .45s ease-out" }}><SkillArt kind={last.kind} rarity={last.rarity} mag={last.mag} size={72} /></span>
          : <span className="grid h-24 place-items-center font-display text-4xl text-muted">?</span>}
      </div>
      <span className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-sky-0 to-transparent" />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-sky-0 to-transparent" />
    </div>
  );

  return (
    <>
      <Breadcrumb items={[["Market", "/"], ["Fortune Spin", "/spin"], [m.name]]} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Panel className="flex flex-col gap-5 self-start p-5 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-auto text-4xl sm:text-5xl">{m.name}</h1>
            {out && <Pill tone="down">Out of stock</Pill>}
            {m.vrf_free && <Pill tone="gold">No VRF fee</Pill>}
          </div>
          <MachineArt m={m} sk={sk} big inner={reel} />
          {!!wins.length && !spinning && last && (
            <div className="rounded-2xl border-3 border-ink bg-panel-2 p-4 text-center shadow-drop-sm" style={{ animation: "pop .45s ease-out" }}>
              <p className="font-display text-3xl text-gold">You won {last.name}!</p>
              {wins.length > 1 && (
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {wins.map((w, i) => { const s = sk(w); return s && <Link key={i} href={`/item?id=skill:${s.id}`} title={s.name}><SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={40} /></Link>; })}
                </div>
              )}
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Link href={`/item?id=skill:${last.id}`} className="inline-flex h-9 items-center rounded-xl border-3 border-ink bg-panel px-3 font-display shadow-drop-sm hover:bg-sky-2">View item</Link>
                <Btn small onClick={() => spin(1)} disabled={out || !a.account}>Spin again</Btn>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <p className="text-xs font-extrabold uppercase tracking-wider text-muted">Price per spin</p>
              <p className="font-display text-4xl">{fmt(m.price)} <span className="text-2xl text-muted">SOL</span></p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <Btn tone="ghost" className="flex-1" disabled={out || !a.account || spinning || (m.stock != null && m.stock < 5)} onClick={() => spin(5)}>Spin ×5</Btn>
              <Btn className="flex-[2]" disabled={out || !a.account || spinning} onClick={() => spin(1)}>{spinning ? "Spinning…" : `Spin · ${fmt(m.price)} SOL`}</Btn>
            </div>
          </div>
          {!a.account && <p className="text-sm font-bold text-muted">Connect a wallet to spin. <button type="button" className="text-gold underline" onClick={a.signIn}>Connect</button></p>}
        </Panel>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[["Spins", m.spins.toLocaleString()], ["Stock", m.stock == null ? "∞" : m.stock.toLocaleString()], ["VRF fee", m.vrf_free ? "Free" : "Paid"]].map(([k, v]) => (
              <Panel key={k} className="p-3"><p className="text-xs font-extrabold uppercase text-muted">{k}</p><p className="font-display text-2xl">{v}</p></Panel>
            ))}
          </div>
          <Panel className="p-4">
            <h2 className="mb-3 text-2xl">Odds</h2>
            <ul className="flex flex-col gap-1">
              {pool.map((p) => { const s = sk(p.skill); const pct = (p.weight / tot) * 100; return s && (
                <li key={p.skill}>
                  <Link href={`/item?id=skill:${s.id}`} className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-panel-2">
                    <SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-lg leading-tight">{s.name}</span>
                      <span className={cx("text-xs font-extrabold uppercase", RARITY_TEXT[s.rarity])}>{s.rarity} · {KIND_LABEL[s.kind]}</span>
                    </span>
                    <span className="w-16 shrink-0 text-right font-extrabold tabular-nums">{pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}%</span>
                  </Link>
                </li>
              ); })}
            </ul>
          </Panel>
          <Panel className="p-4">
            <h2 className="mb-3 text-2xl">Recent wins</h2>
            {drops.length ? (
              <ul className="flex flex-col gap-1">
                {drops.slice(0, 8).map((d, i) => { const s = sk(d.skill); return s && (
                  <li key={`${d.t}-${i}`} className="flex items-center gap-3 rounded-2xl p-2">
                    <SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={32} />
                    <span className="min-w-0 flex-1 truncate font-bold">{s.name}{d.lucky && <span className="ml-1 text-gold">★</span>}</span>
                    <span className="shrink-0 text-sm font-bold text-muted">{d.account === a.account ? "You" : short(d.account)}</span>
                    <span className="w-16 shrink-0 text-right text-xs font-bold text-muted">{ago(d.t)}</span>
                  </li>
                ); })}
              </ul>
            ) : <Empty>No spins yet.</Empty>}
          </Panel>
        </div>
      </div>
    </>
  );
}

export default function Spin() {
  const a = useAssets();
  const id = useSearchParams().get("id");
  const [d, reload] = useLoad(async () => {
    const [machines, drops, skills] = await Promise.all([a.machines(), a.drops(), a.skills()]);
    return { machines, drops, skills };
  }, [a.account]);
  if (!d) return id == null ? (
    <><Skel className="mb-8 h-32" /><Skel className="mb-6 h-14 w-72" /><div className="grid gap-5 min-[480px]:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skel key={i} className="h-80" />)}</div></>
  ) : <div className="grid gap-6 lg:grid-cols-2"><Skel className="h-[560px]" /><Skel className="h-[560px]" /></div>;
  const sk = (sid: number) => d.skills.find((s) => s.id === sid);
  if (id == null) return <List ms={d.machines} drops={d.drops} sk={sk} />;
  const m = d.machines.find((x) => String(x.id) === id);
  if (!m) return <Empty>Machine not found. <Link href="/spin" className="text-gold underline">All machines</Link></Empty>;
  return <Detail m={m} drops={d.drops.filter((x) => x.machine === m.id).sort((x, y) => y.t - x.t)} sk={sk} reload={reload} />;
}
