"use client";
import Link from "next/link";
import { useState } from "react";
import { fmt, KIND_LABEL, useAssets, type Presale, type Skill } from "@/lib/assets";
import { act, Btn, Countdown, cx, inputCls, Panel, RARITY_TEXT, SkillArt, useLoad } from "@/components/ui";

export function PresaleCard({ p, s, onDone }: { p: Presale; s: Skill; onDone: () => void }) {
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
        <div><p className="text-xs font-extrabold uppercase text-muted">Price</p><p className="font-display text-3xl">{fmt(p.price)} SOL</p></div>
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
            {soldOut ? "Sold out" : left <= 0 ? "Wallet limit hit" : me?.ok === false ? "Not on allowlist" : `Mint · ${fmt(BigInt(p.price) * BigInt(q))} SOL`}
          </Btn>
        </div>
      )}
    </Panel>
  );
}
