"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { fmt, type Kind, type Presale, type Rarity } from "@/lib/assets";
import { presaleState } from "@/lib/stats";
import { Countdown, cx, KIND_COLOR, Pill, Progress, SkillArt } from "@/components/ui";

type P = Pick<Presale, "price" | "start_ms" | "end_ms" | "cap_total" | "sold" | "allowlist" | "ended">;
type S = { name: string; kind: Kind; rarity: Rarity; mag: number };

export function StatePill({ p }: { p: P }) {
  const st = presaleState(p);
  return st === "live" ? <Pill tone="up"><span className="size-1.5 animate-pulse rounded-full bg-ink" />Live</Pill>
    : st === "soon" ? <Pill tone="gold">Starts <Countdown to={p.start_ms} /></Pill>
    : <Pill>Completed</Pill>;
}

// launchpad grid card (also the /create live preview); colocated, not in components/ (shared files frozen)
export function DropCard({ p, s, col, href }: { p: P; s: S; col?: string; href?: string }) {
  const cap = p.cap_total;
  const pct = cap ? (p.sold / cap) * 100 : 100;
  const soldOut = cap != null && p.sold >= cap;
  const c = KIND_COLOR[s.kind];
  const body: ReactNode = (
    <>
      <div className="relative grid aspect-[16/9] place-items-center sm:aspect-[4/3] border-b-3 border-ink" style={{ background: `radial-gradient(circle at 50% 40%, color-mix(in oklab, ${c} 70%, transparent), color-mix(in oklab, ${c} 18%, #140f24) 70%)` }}>
        <SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={96} />
        <span className="absolute left-2.5 top-2.5"><StatePill p={p} /></span>
        {p.allowlist && <span className={cx("absolute", soldOut ? "left-2.5 top-10" : "right-2.5 top-2.5")}><Pill tone="teal">Allowlist</Pill></span>}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <p className="truncate text-xs font-extrabold uppercase tracking-wide text-muted">{col ?? "—"}</p>
        <h3 className="truncate text-xl">{s.name || "Untitled skill"}</h3>
        <p className="font-extrabold tabular-nums">{fmt(p.price)} <span className="text-muted">SOL</span></p>
        <div className="mt-2">
          <p className="mb-1 flex justify-between text-xs font-extrabold text-muted"><span>{cap ? `${pct.toFixed(0)}% minted` : `${p.sold} minted`}</span>{cap && <span className="tabular-nums">{p.sold}/{cap}</span>}</p>
          <Progress pct={pct} className="h-2.5" />
        </div>
      </div>
      <p className="flex justify-between border-t-3 border-ink bg-sky-0/50 px-3.5 py-2 text-xs font-extrabold text-muted">
        {cap ? <><span>Cap {cap}</span><span className={soldOut ? "text-down" : "text-cream"}>{cap - p.sold}/{cap} available</span></> : <span>Always in stock</span>}
      </p>
      {soldOut && (
        <span className="pointer-events-none absolute -right-10 top-6 w-40 rotate-45 shadow-drop-sm border-y-2 border-ink bg-down py-0.5 text-center font-display text-sm text-ink">SOLD OUT</span>
      )}
    </>
  );
  const cls = "relative flex flex-col overflow-hidden rounded-3xl border-3 border-ink bg-panel shadow-drop";
  return href ? <Link href={href} className={cx(cls, "transition hover:-translate-y-1 hover:bg-panel-2")}>{body}</Link> : <div className={cls}>{body}</div>;
}
