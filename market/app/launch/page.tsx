"use client";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { ago, fmt, KIND_DESC, KIND_LABEL, skillKey, useAssets } from "@/lib/assets";
import { presaleState } from "@/lib/stats";
import { PresaleCard } from "@/components/presale-card";
import { Breadcrumb, Countdown, cx, Empty, KIND_COLOR, Panel, RARITY_TEXT, SkillArt, Skel, useLoad } from "@/components/ui";
import { StatePill } from "../launchpad/drop-card";

const when = (t: number) => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const Stat = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="rounded-2xl border-3 border-ink bg-sky-0/70 px-4 py-2.5"><p className="text-xs font-extrabold uppercase text-muted">{k}</p><p className="font-display text-2xl">{v}</p></div>
);

export default function Launch() {
  const id = Number(useSearchParams().get("id"));
  const a = useAssets();
  const [d, reload] = useLoad(async () => {
    const p = (await a.presales()).find((x) => x.id === id);
    if (!p) return null;
    const [skills, cols, hist, bought] = await Promise.all([a.skills(), a.collections(), a.history(skillKey(p.skill)), a.presaleBought(p.id)]);
    const s = skills.find((x) => x.id === p.skill);
    if (!s) return null;
    // ponytail: history has no buyer, so "mints" = sales at presale price inside the window
    const mints = hist.filter(([t, pr]) => t >= p.start_ms && (!p.end_ms || t <= p.end_ms) && pr === p.price).reverse().slice(0, 12);
    return { p, s, col: cols.find((c) => c.id === s.collection), mints, bought };
  }, [id, a.account]);

  if (d === undefined) return <><Skel className="mb-6 h-64" /><div className="grid gap-6 lg:grid-cols-[1fr_380px]"><Skel className="h-96" /><Skel className="h-80" /></div></>;
  if (!d) return <Empty>Drop not found.</Empty>;
  const { p, s, col, mints, bought } = d;
  const st = presaleState(p);
  const c = KIND_COLOR[s.kind];
  const phases = [...(p.allowlist ? ["Allowlist"] : []), "Public", "Ended"];
  const cur = st === "ended" ? "Ended" : st === "soon" ? null : p.allowlist ? "Allowlist" : "Public";

  return (
    <>
      <Breadcrumb items={[["Market", "/"], ["Launchpad", "/launchpad"], [s.name]]} />
      <section className="relative mb-8 overflow-hidden rounded-3xl border-3 border-ink p-5 shadow-drop sm:p-8"
        style={{ background: `linear-gradient(120deg, color-mix(in oklab, ${c} 45%, var(--color-sky-1)), var(--color-sky-0) 70%)` }}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={112} />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2"><span className="font-extrabold uppercase text-muted">{col?.name}</span><StatePill p={p} /></div>
            <h1 className="break-words text-4xl drop-shadow-[0_4px_0_var(--color-ink)] sm:text-6xl">{s.name}</h1>
            <p className="mt-1 font-bold text-muted">{when(p.start_ms)} → {p.end_ms ? when(p.end_ms) : "no end"}</p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat k="Price" v={`${fmt(p.price)} SOL`} />
          <Stat k="Minted" v={p.cap_total ? `${p.sold}/${p.cap_total}` : p.sold} />
          <Stat k="Per wallet" v={p.per_wallet ?? "No limit"} />
          <Stat k={st === "soon" ? "Starts in" : st === "live" && p.end_ms ? "Ends in" : "Status"}
            v={st === "soon" ? <Countdown to={p.start_ms} /> : st === "live" && p.end_ms ? <Countdown to={p.end_ms} /> : st === "live" ? "Open" : "Closed"} />
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel className="p-5 sm:p-6">
            <h2 className="mb-3 text-3xl">About</h2>
            <p className="font-bold"><span className={RARITY_TEXT[s.rarity]}>{s.rarity}</span> · {KIND_LABEL[s.kind]}{s.mag === 2 ? " II" : ""}: {KIND_DESC[s.kind]}</p>
            {col?.description && <p className="mt-2 font-bold text-muted">{col.description}</p>}
            <h3 className="mb-3 mt-6 text-xl">Phases</h3>
            <ol className="flex flex-wrap items-center gap-2">
              {phases.map((ph, i) => (
                <li key={ph} className="flex items-center gap-2">
                  {i > 0 && <span className="text-muted">→</span>}
                  <span className={cx("rounded-full border-3 border-ink px-3 py-1 text-sm font-extrabold", ph === cur ? "bg-gold text-ink shadow-drop-sm" : "bg-sky-0 text-muted")}>
                    {ph === "Allowlist" ? "Allowlist phase" : ph}{ph === cur && " ●"}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel className="p-5 sm:p-6">
            <h2 className="mb-3 text-3xl">Recent mints</h2>
            {!mints.length ? <Empty>No mints recorded yet.</Empty> : (
              <table className="w-full text-left font-bold">
                <thead><tr className="border-b-3 border-ink text-xs uppercase text-muted"><th className="py-2">Time</th><th className="py-2 text-right">Price</th></tr></thead>
                <tbody>{mints.map(([t, pr], i) => <tr key={i} className="border-b-2 border-ink/60 last:border-0"><td className="py-2 text-muted">{ago(t)}</td><td className="py-2 text-right tabular-nums">{fmt(pr)} SOL</td></tr>)}</tbody>
              </table>
            )}
          </Panel>

          <Panel className="p-5 sm:p-6">
            <h2 className="mb-3 text-3xl">Rules</h2>
            <ul className="list-disc space-y-1.5 pl-5 font-bold text-muted">
              <li>{p.per_wallet ? `Max ${p.per_wallet} per wallet.` : "No per-wallet limit."}</li>
              <li>{p.cap_total ? `Supply capped at ${p.cap_total} for this drop.` : "Uncapped: mints stay open while the shop runs."}{s.max_supply ? ` Skill max supply ${s.max_supply}.` : ""}</li>
              {p.allowlist && <li>Allowlist phase: only listed wallets can mint.</li>}
              <li>Refunds only via the presale contract (e.g. failed mint); no manual refunds.</li>
              <li>Every mint settles on Solana; skills land in your wallet instantly.</li>
            </ul>
          </Panel>
        </div>

        <div className="order-first flex flex-col gap-6 lg:sticky lg:top-24 lg:order-none">
          <PresaleCard p={p} s={s} onDone={reload} />
          <Panel className="p-5">
            <h2 className="text-2xl">Your mints</h2>
            {!a.account ? <p className="mt-1 font-bold text-muted">Connect a wallet to see your mints.</p>
              : <p className="mt-1 font-bold text-muted"><span className="font-display text-3xl text-cream">{bought}</span>{p.per_wallet ? ` / ${p.per_wallet} allowed` : " minted"}</p>}
          </Panel>
        </div>
      </div>
    </>
  );
}
