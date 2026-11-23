"use client";
import Link from "next/link";
import { useState } from "react";
import { ago, amount, fmt, useAssets } from "@/lib/assets";
import { loadMarket, RANGE, salesFeed } from "@/lib/stats";
import { cx, Empty, inputCls, MonsterArt, Pager, Pill, Skel, SkillArt, Tabs, useLoad } from "@/components/ui";

const RANGES = ["24H", "7D", "30D"] as const;
const PAGE = 25;
const cell = "px-3 py-3";
// monster history is one aggregate series (no per-token id) → one generic tile
const MON_DNA = { str: 0, dex: 0, def: 0, spd: 0, hue: 280, accent: 0 };

export default function Activity() {
  const a = useAssets();
  const [type, setType] = useState<"all" | "skills" | "monsters">("all");
  const [col, setCol] = useState("");
  const [range, setRange] = useState<(typeof RANGES)[number]>("7D");
  const [page, setPage] = useState(1);
  const [d] = useLoad(async () => {
    const [m, mon] = await Promise.all([loadMarket(a), a.history("monsters")]);
    return { ...m, feed: salesFeed(m.skills, m.hist, mon) };
  }, [a.account]);

  const cut = Date.now() - RANGE[range];
  const rows = (d?.feed ?? []).filter((x) => x.t >= cut
    && (type === "all" || (type === "skills") === !!x.skill)
    && (!col || type === "monsters" || x.skill?.collection === Number(col)));
  const vol = rows.reduce((s, x) => s + amount(x.price), 0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE)), p = Math.min(page, pages);
  const colName = (id: number) => d?.cols.find((c) => c.id === id)?.name ?? "—";
  const reset = <T,>(f: (v: T) => void) => (v: T) => { f(v); setPage(1); };

  return (
    <>
      <h1 className="mb-4 text-5xl drop-shadow-[0_4px_0_var(--color-ink)]">Activity</h1>
      <Tabs under value={type} onChange={reset(setType)} options={[["all", "All"], ["skills", "Skills"], ["monsters", "Monsters"]]} />
      <div className="my-4 flex flex-wrap items-center gap-3">
        <select value={col} onChange={(e) => reset(setCol)(e.target.value)} disabled={type === "monsters"} aria-label="Collection" className={cx(inputCls, "min-w-0 max-w-full disabled:opacity-50")}>
          <option value="">All collections</option>
          {d?.cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Tabs value={range} onChange={reset(setRange)} options={RANGES} />
        {d && (
          <span className="flex flex-wrap gap-2 sm:ml-auto">
            <Pill tone="gold">{rows.length.toLocaleString()} sales</Pill>
            <Pill tone="teal">{fmt(String(Math.round(vol * 1e9)))} SOL volume</Pill>
          </span>
        )}
      </div>

      {!d ? <div className="flex flex-col gap-3">{Array.from({ length: 8 }, (_, i) => <Skel key={i} className="h-14" />)}</div>
        : !rows.length ? <Empty>No sales in this window.</Empty> : (
          <>
            <div className="overflow-x-auto rounded-3xl border-3 border-ink bg-panel shadow-drop">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b-3 border-ink text-left text-xs font-extrabold uppercase tracking-wide text-muted">
                  <tr><th className={cell}>Type</th><th className={cell}>Item</th><th className={cell}>Collection</th><th className={cx(cell, "text-right")}>Price</th><th className={cx(cell, "text-right")}>Time</th></tr>
                </thead>
                <tbody>
                  {rows.slice((p - 1) * PAGE, p * PAGE).map((x, i) => (
                    <tr key={`${x.key}-${x.t}-${i}`} className="border-b-2 border-ink/60 font-bold last:border-0 hover:bg-panel-2">
                      <td className={cell}><Pill tone="up">Sale</Pill></td>
                      <td className={cell}>
                        {x.skill ? (
                          <Link href={`/item?id=${x.key}`} className="flex items-center gap-3 hover:text-gold">
                            <SkillArt kind={x.skill.kind} rarity={x.skill.rarity} mag={x.skill.mag} size={34} />
                            <span className="truncate font-display text-base">{x.skill.name}</span>
                          </Link>
                        ) : (
                          <Link href="/search?type=monster" className="flex items-center gap-3 hover:text-gold">
                            <MonsterArt dna={MON_DNA} size={34} />
                            <span className="font-display text-base">Monster</span>
                          </Link>
                        )}
                      </td>
                      <td className={cx(cell, "text-muted")}>
                        {x.skill ? <Link href={`/collection?id=${x.skill.collection}`} className="hover:text-cream">{colName(x.skill.collection)}</Link> : "Monsters"}
                      </td>
                      <td className={cx(cell, "text-right tabular-nums")}>{fmt(x.price)} SOL</td>
                      <td className={cx(cell, "text-right text-muted")} title={new Date(x.t).toLocaleString()}>{ago(x.t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={p} pages={pages} set={setPage} />
          </>
        )}
    </>
  );
}
