"use client";
import { useEffect, useMemo, useState } from "react";
import { FLOOR, RESERVE, price, restock, targetFor } from "../../../agents/pricing";
import { Btn, Chip, cx, KIND_COLOR, Panel } from "@/components/ui";
import type { Kind } from "@/lib/assets";

// A week of NPC merchant trading fast-forwarded in the browser, run on the same rules file the live merchants use.
const HOURS = 168, STEP_MS = 357, NET = 0.925; // seller keeps 92.5% (2.5% market fee + 5% creator royalty)
const MERCHANTS: { name: string; cash: number; skills: [string, Kind, number][] }[] = [
  { name: "Smithy", cash: 1.6, skills: [["Power I", "Power", 0.05], ["Agility I", "Agility", 0.05], ["Durability I", "Durability", 0.05], ["Speed I", "Speed", 0.05], ["Power II", "Power", 0.15], ["Agility II", "Agility", 0.15], ["Durability II", "Durability", 0.15], ["Speed II", "Speed", 0.15]] },
  { name: "Alchemist", cash: 0.6, skills: [["Air Jump", "AirJump", 0.2], ["Lifesteal", "Lifesteal", 0.25], ["Quick Dodge", "QuickDodge", 0.25], ["Second Wind", "SecondWind", 0.25]] },
];
const FLOOD = { from: 40, to: 50, skills: ["Air Jump", "Lifesteal", "Quick Dodge", "Second Wind"] }, HYPE = { from: 108, to: 120 };

const mulberry32 = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const poisson = (rnd: () => number, l: number) => { let k = 0, p = 1; const L = Math.exp(-l); while ((p *= rnd()) > L) k++; return k; };

type Frame = { cash: number; stock: number; open: boolean; ask: number[] };
type Log = { h: number; who: string; text: string; tone?: "up" | "down" | "gold" };

function simulate(seed: number) {
  const rnd = mulberry32(seed);
  const log: Log[] = [{ h: 0, who: "World", text: `Seed ${seed}. Two NPC merchants open shop, each with its own wallet.` }];
  const ms = MERCHANTS.map((m) => ({ ...m, open: true, frames: [] as Frame[], shelf: m.skills.map(([name, kind, base]) => ({ name, kind, base, target: targetFor(base), stock: targetFor(base), sold: 0 })) }));
  for (let h = 0; h < HOURS; h++) {
    const day = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((2 * Math.PI * (h - 9)) / 24));
    if (h === FLOOD.from) log.push({ h, who: "World", text: "Flood: players dump every effect skill at a third of the mint price.", tone: "gold" });
    if (h === FLOOD.to) log.push({ h, who: "World", text: "Flood over." });
    if (h === HYPE.from) log.push({ h, who: "World", text: "Tournament weekend: stat skill demand ×3.", tone: "gold" });
    if (h === HYPE.to) log.push({ h, who: "World", text: "Tournament over." });
    for (const m of ms) {
      const ask: number[] = [], restocked: string[] = [];
      for (const s of m.shelf) {
        const shelf = () => ({ base: s.base, stock: s.stock, target: s.target, soldLastHour: s.sold, cash: m.cash });
        const q = price(shelf());
        if (q.open !== m.open) {
          m.open = q.open;
          log.push({ h, who: m.name, text: q.open ? `Reopens. ${s.name}: ${q.why}` : q.why, tone: q.open ? "up" : "down" });
        }
        const flood = h >= FLOOD.from && h < FLOOD.to && FLOOD.skills.includes(s.name);
        const hype = h >= HYPE.from && h < HYPE.to && m.name === "Smithy";
        const rate = (s.base <= 0.05 ? 0.8 : 0.22) * day * (hype ? 3 : 1) * (flood ? 0.2 : 1) * Math.exp(-2.2 * (q.ask / s.base - 1));
        let sold = 0;
        for (let k = poisson(rnd, rate); k > 0 && s.stock > 0; k--) { s.stock--; sold++; m.cash += q.ask * NET; }
        s.sold = sold;
        if (sold && !s.stock) log.push({ h, who: m.name, text: `Sold out of ${s.name}. Now: ${price(shelf()).why}`, tone: "gold" });
        if (flood && q.bid) {
          let n = 0, spent = 0;
          for (let k = poisson(rnd, 3); k > 0; k--) {
            const p = Math.round(s.base * (0.3 + 0.15 * rnd()) * 1000) / 1000;
            if (p > q.bid || m.cash - p < RESERVE) break;
            m.cash -= p; s.stock++; n++; spent += p;
          }
          if (n) log.push({ h, who: m.name, text: `Buys back ${n} dumped ${s.name} for ${spent.toFixed(3)} (bid ≤ ${q.bid}). Cash ${m.cash.toFixed(3)}.` });
        }
        const r = restock(shelf());
        if (r) { m.cash -= r * s.base; s.stock += r; restocked.push(`${r} × ${s.name}`); }
        ask.push(price(shelf()).ask);
      }
      if (restocked.length) log.push({ h, who: m.name, text: `Restocks ${restocked.join(", ")} from presale.`, tone: "up" });
      m.frames.push({ cash: m.cash, stock: m.shelf.reduce((a, s) => a + s.stock, 0), open: m.open, ask });
    }
  }
  return { ms, log };
}

const when = (h: number) => `D${Math.floor(h / 24) + 1} ${String(h % 24).padStart(2, "0")}:00`;

function Chart({ label, series, t, closed, floor, unit, lo = 0, digits = 3 }: { label: string; series: { color: string; data: number[] }[]; t: number; closed: boolean[]; floor?: number; unit: string; lo?: number; digits?: number }) {
  const all = series.flatMap((s) => s.data).concat(floor ?? []);
  const hi = Math.max(...all) * 1.08 || 1, H = 60;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const now = series[0].data[Math.max(0, t - 1)];
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-extrabold uppercase tracking-wider text-muted"><span>{label}</span><span className="tabular-nums text-cream">{series.length === 1 && now != null ? `${now.toFixed(digits)} ${unit}` : unit}</span></div>
      <svg viewBox={`0 0 ${HOURS} ${H}`} preserveAspectRatio="none" className="block h-28 w-full rounded-xl border-3 border-ink bg-sky-0/60" aria-hidden>
        {[1, 2, 3, 4, 5, 6].map((d) => <line key={d} x1={d * 24} x2={d * 24} y1={0} y2={H} stroke="var(--color-panel-2)" vectorEffect="non-scaling-stroke" />)}
        {closed.slice(0, t).map((c, h) => c && <rect key={h} x={h} width={1.02} y={0} height={H} fill="var(--color-down)" opacity={0.18} />)}
        {floor != null && <line x1={0} x2={HOURS} y1={y(floor)} y2={y(floor)} stroke="var(--color-down)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
        {series.map((s, i) => <polyline key={i} points={s.data.slice(0, t).map((v, h) => `${h + 0.5},${y(v)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
      </svg>
    </div>
  );
}

export default function Economy() {
  const [seed, setSeed] = useState(7);
  const [t, setT] = useState(0);
  const [play, setPlay] = useState(true);
  const [all, setAll] = useState(false);
  const sim = useMemo(() => simulate(seed), [seed]);
  useEffect(() => {
    if (!play || t >= HOURS) return;
    const id = setTimeout(() => setT((x) => x + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [play, t]);
  const restart = (s: number) => { setSeed(s); setT(0); setPlay(true); };
  const log = sim.log.filter((l) => l.h < t && (all || !l.text.startsWith("Restocks"))).reverse();
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-extrabold uppercase tracking-wider text-gold">Fast-forward · seed {seed}</p>
          <h1 className="text-4xl drop-shadow-[0_4px_0_var(--color-ink)] sm:text-5xl">A week of NPC merchants</h1>
          <p className="mt-1 max-w-2xl font-bold text-muted">Simulated players trade with Smithy and Alchemist for 7 days in about a minute. Every ask, buyback, restock and closing comes from the same pricing rules the live merchants run on testnet.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 font-display text-2xl tabular-nums">{when(Math.min(t, HOURS - 1))}</span>
          <Btn small tone="ghost" onClick={() => setPlay(!play)} disabled={t >= HOURS}>{play ? "Pause" : "Play"}</Btn>
          <Btn small tone="ghost" onClick={() => setT(HOURS)}>Skip to end</Btn>
          <Btn small tone="ghost" onClick={() => restart(seed)}>Replay</Btn>
          <Btn small onClick={() => restart(seed + 1)}>New seed</Btn>
        </div>
      </div>
      <div className="h-3 overflow-hidden rounded-full border-3 border-ink bg-sky-0"><div className="h-full bg-gold transition-[width]" style={{ width: `${(t / HOURS) * 100}%` }} /></div>
      <div className="grid gap-5 lg:grid-cols-2">
        {sim.ms.map((m) => {
          const f = m.frames[Math.max(0, t - 1)], closed = m.frames.map((x) => !x.open);
          return (
            <Panel key={m.name} className="flex flex-col gap-4 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="text-2xl">{m.name}</h2><p className="text-sm font-bold text-muted">{m.name === "Smithy" ? "Stat skills" : "Effect skills"} · NPC wallet</p></div>
                <span className={cx("rounded-full border-3 border-ink px-3 py-1 text-sm font-extrabold text-ink", f.open ? "bg-up" : "bg-down")}>{f.open ? "Open" : "Broke"}</span>
              </div>
              <Chart label="Ask ÷ mint price" unit="× mint" lo={0.4} t={t} closed={closed} series={m.shelf.map((s, i) => ({ color: KIND_COLOR[s.kind], data: m.frames.map((x) => x.ask[i] / s.base) }))} />
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-extrabold">
                {m.shelf.map((s, i) => <span key={s.name} className="flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: KIND_COLOR[s.kind], opacity: s.base > 0.05 || m.name !== "Smithy" ? 1 : 0.6 }} />{s.name} <span className="tabular-nums text-muted">{f.ask[i]}</span></span>)}
              </div>
              <Chart label="Units in stock" unit="units" digits={0} t={t} closed={closed} series={[{ color: "var(--color-teal)", data: m.frames.map((x) => x.stock) }]} />
              <Chart label={`Cash (floor ${FLOOR} dashed)`} unit="NEAR" t={t} closed={closed} floor={FLOOR} series={[{ color: "var(--color-gold)", data: m.frames.map((x) => x.cash) }]} />
            </Panel>
          );
        })}
      </div>
      <Panel className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-2xl">Event log</h2><Chip on={all} onClick={() => setAll(!all)}>Show restocks</Chip></div>
        <ol className="flex max-h-96 flex-col gap-1.5 overflow-y-auto pr-1 text-sm font-bold">
          {log.map((l, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-16 shrink-0 tabular-nums text-muted">{when(l.h)}</span>
              <span className="w-20 shrink-0 text-cream">{l.who}</span>
              <span className={cx("min-w-0", l.tone === "up" ? "text-up" : l.tone === "down" ? "text-down" : l.tone === "gold" ? "text-gold" : "text-muted")}>{l.text}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
