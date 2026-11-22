"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { art, change24, fmt, KIND_LABEL, useAssets, type Dna, type Kind, type Point, type Rarity, type Skill } from "@/lib/assets";
import { cn } from "@/lib/utils";
import { Button } from "@/components/shadcn/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/shadcn/dropdown-menu";
import { Bell, ChevronDown, Gamepad2 } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function useLoad<T>(f: () => Promise<T>, deps: unknown[]): [T | undefined, () => void] {
  const [v, set] = useState<T>();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    f().then((x) => live && set(x)).catch((e) => live && toast(`Couldn't load: ${String(e?.message ?? e).slice(0, 120)}`));
    return () => { live = false; };
  }, [...deps, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return [v, useCallback(() => setTick((t) => t + 1), [])];
}

const bus = new EventTarget();
export const toast = (msg: string) => bus.dispatchEvent(new CustomEvent("t", { detail: msg }));
export async function act(fn: () => Promise<unknown>, done: string, after?: () => void) {
  toast("Confirm in your wallet…");
  try { await fn(); toast(done); after?.(); } catch (e) { toast(String((e as Error)?.message ?? e).slice(0, 160)); }
}
function Toaster() {
  const [m, set] = useState("");
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const on = (e: Event) => { set((e as CustomEvent).detail); clearTimeout(t); t = setTimeout(() => set(""), 3500); };
    bus.addEventListener("t", on);
    return () => bus.removeEventListener("t", on);
  }, []);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-5 z-50 flex justify-center">
      {m && <p className="rounded-2xl border-3 border-ink bg-panel-2 px-5 py-3 font-bold shadow-drop">{m}</p>}
    </div>
  );
}

const NAV = [["/", "Dashboard"], ["/#games", "Games"], ["/search", "Market"], ["/create", "Create"], ["/economy", "Analytic"]] as const;

export function Shell({ children }: { children: ReactNode }) {
  const a = useAssets();
  const path = usePathname();
  const q = useSearchParams().get("q") ?? "";
  const [b] = useLoad(async () => {
    const now = Date.now();
    const [p, h, m] = await Promise.all([a.presales(), a.account ? a.holdings() : [], a.account ? a.myMonsters() : []]);
    return { live: p.filter((x) => !x.ended && x.start_ms <= now && (!x.end_ms || x.end_ms > now)).length, lib: h.length + m.length };
  }, [a.account]);
  const name = a.account && (/^[0-9a-f]{64}$/.test(a.account) ? `${a.account.slice(0, 6)}…${a.account.slice(-4)}` : a.account.replace(/\.testnet$/, ""));
  const round = "size-10 rounded-full border-white/10 bg-white/5 [&_svg]:size-5";
  const pill = (n?: number) => !!n && <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-extrabold text-white">{n}</span>;
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/5 bg-sky-0/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 lg:flex-nowrap">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <Gamepad2 className="size-7 text-indigo-400" />
            <span className="font-display text-lg leading-none">Chomp Market</span>
          </Link>
          <nav className="order-last -mx-1 flex w-full min-w-0 gap-1 overflow-x-auto lg:order-none lg:mx-0 lg:ml-4 lg:w-auto">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} aria-current={path === href ? "page" : undefined}
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-muted hover:text-cream aria-[current=page]:bg-indigo-600 aria-[current=page]:text-white">
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button asChild variant="outline" size="icon" className={cn(round, "relative hidden sm:inline-flex")}>
              <Link href="/collection" title={b?.live ? `${b.live} live presale(s)` : "Presales"}>
                <Bell />{!!b?.live && <span className="absolute right-2 top-2 size-2 rounded-full bg-danger" />}
              </Link>
            </Button>
            {a.account ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-auto gap-2 px-1 py-1">
                    <img src={art("avatar.png")} alt="" className="size-9 rounded-full" />
                    <span className="hidden min-w-0 max-w-36 text-left sm:block">
                      <span className="block truncate text-sm font-extrabold">{name}</span>
                      <span className="block truncate text-xs font-bold text-muted">{a.demo ? "Demo mode" : "Signed in"}</span>
                    </span>
                    <ChevronDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild><Link href="/me" className="font-bold">My Library{pill(b?.lib)}</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link href="/collection" className="font-bold">Collections{pill(b?.live)}</Link></DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" className="font-bold" onClick={a.signOut}>Log Out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : <Btn onClick={a.signIn} small>Connect</Btn>}
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-3"><SearchBar key={q} initial={q} /></div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6">{children}</main>
      <Toaster />
    </>
  );
}

export function Btn({ children, tone = "ember", small, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "ember" | "gold" | "ghost" | "teal"; small?: boolean }) {
  const t = { ember: "btn-primary hover:brightness-110", gold: "btn-primary hover:brightness-110", teal: "bg-teal text-ink", ghost: "bg-panel-2 text-cream hover:bg-sky-2" }[tone];
  return (
    <button {...p} className={cx("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border-3 border-ink font-display shadow-drop-sm transition active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0",
      small ? "h-9 px-3 text-base" : "h-12 px-5 text-xl", t, className)}>{children}</button>
  );
}

export const Panel = ({ children, className }: { children: ReactNode; className?: string }) => (
  <section className={cx("glow rounded-3xl bg-panel", className)}>{children}</section>
);

export function Chip({ on, children, onClick }: { on?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cx("shrink-0 rounded-full border-3 border-ink px-3 py-1 text-sm font-extrabold transition", on ? "bg-gold text-ink shadow-drop-sm" : "bg-panel text-muted hover:text-cream")}>
      {children}
    </button>
  );
}

export function Pct({ v, className }: { v: number; className?: string }) {
  const up = v >= 0;
  return <span className={cx("font-extrabold tabular-nums", up ? "text-up" : "text-down", className)}>{up ? "▲" : "▼"} {Math.abs(v).toFixed(1)}%</span>;
}

export function Sparkline({ data, className, color, fill = true }: { data: number[]; className?: string; color?: string; fill?: boolean }) {
  const id = useId();
  if (data.length < 2) data = [data[0] ?? 0, data[0] ?? 0];
  const lo = Math.min(...data), hi = Math.max(...data), span = hi - lo || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${36 - ((v - lo) / span) * 32}`).join(" ");
  const c = color ?? (data[data.length - 1] >= data[0] ? "var(--color-up)" : "var(--color-down)");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className={cx("block w-full", className)} aria-hidden>
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={c} stopOpacity="0.35" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient></defs>
      {fill && <polygon points={`0,40 ${pts} 100,40`} fill={`url(#${id})`} />}
      <polyline points={pts} fill="none" stroke={c} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
export const prices = (h: Point[] | undefined) => (h ?? []).map(([, p]) => Number(BigInt(p) / 10n ** 18n) / 1e6);

export const KIND_COLOR: Record<Kind, string> = {
  Power: "#ff7a59", Agility: "#ffd166", Durability: "#6fa8ff", Speed: "#5be0a6",
  AirJump: "#8ad8ff", Lifesteal: "#ff5d6c", QuickDodge: "#b59cff", SecondWind: "#ff9ec7",
};
const KIND_PATH: Record<Kind, ReactNode> = {
  Power: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  Agility: <path d="M3 17c5 0 9-3 11-8l2 3 5-9c-7 1-12 4-14 10-1-1-2-3-2-5-2 3-2 6-2 9z" />,
  Durability: <path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z" />,
  Speed: <path d="M3 5h5l7 7-7 7H3l7-7zm8 0h5l7 7-7 7h-5l7-7z" />,
  AirJump: <path d="M12 2l8 8h-5v5H9v-5H4zM6 18h12v3H6z" />,
  Lifesteal: <path d="M12 2s7 8 7 13a7 7 0 0 1-14 0c0-5 7-13 7-13z" />,
  QuickDodge: <path d="M14 3l7 9-7 9h-4l7-9-7-9zM2 7h8v3H2zm2 7h6v3H4z" />,
  SecondWind: <path d="M12 21s-9-5.5-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.5-9 12-9 12z" />,
};
const RARITY_RING: Record<Rarity, string> = { Common: "ring-muted/40", Rare: "ring-def", Epic: "ring-gold" };
export const STATS = [["str", "text-str", "bg-str"], ["dex", "text-dex", "bg-dex"], ["def", "text-def", "bg-def"], ["spd", "text-spd", "bg-spd"]] as const;
export const RARITY_TEXT:Record<Rarity, string> = { Common: "text-muted", Rare: "text-def", Epic: "text-gold" };

export function SkillArt({ kind, rarity, size = 48, mag }: { kind: Kind; rarity: Rarity; size?: number; mag?: number }) {
  const c = KIND_COLOR[kind];
  return (
    <span className={cx("relative grid shrink-0 place-items-center rounded-[28%] border-3 border-ink ring-3 ring-offset-0", RARITY_RING[rarity])}
      style={{ width: size, height: size, background: `radial-gradient(circle at 35% 25%, ${c}, color-mix(in oklab, ${c} 45%, #0c0816))` }}>
      <svg viewBox="0 0 24 24" className="w-[58%] drop-shadow-[0_2px_0_rgb(12_8_22/0.6)]" fill="#f6ecd9" stroke="#0c0816" strokeWidth="1.4" strokeLinejoin="round">{KIND_PATH[kind]}</svg>
      {mag === 2 && <span className="absolute -bottom-1.5 -right-1.5 rounded-md border-2 border-ink bg-gold px-1 text-[10px] font-extrabold leading-4 text-ink">II</span>}
    </span>
  );
}

export function MonsterArt({ dna, size = 48 }: { dna: Dna; size?: number }) {
  const h = dna.hue, a = dna.accent;
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-[28%] border-3 border-ink" style={{ width: size, height: size, background: `radial-gradient(circle at 50% 30%, hsl(${h} 45% 34%), hsl(${h} 50% 14%))` }}>
      <svg viewBox="0 0 40 40" className="w-[86%] translate-y-[8%]" stroke="#0c0816" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M11 12 8 3l8 6zM29 12l3-9-8 6z" fill={`hsl(${a} 55% 88%)`} />
        <ellipse cx="20" cy="24" rx="14" ry="13" fill={`hsl(${h} 58% 56%)`} />
        <ellipse cx="20" cy="29" rx="8.5" ry="7" fill={`hsl(${h} 70% 86%)`} strokeWidth="0" />
        <circle cx="14.5" cy="20" r="3.2" fill="#fff" /><circle cx="25.5" cy="20" r="3.2" fill="#fff" />
        <circle cx="15.3" cy="20.6" r="1.6" fill="#1b1426" stroke="none" /><circle cx="24.7" cy="20.6" r="1.6" fill="#1b1426" stroke="none" />
        <path d="M17 26q3 2.5 6 0" fill="none" />
        <circle cx="9" cy="27" r="2" fill={`hsl(${a} 70% 42%)`} stroke="none" /><circle cx="31" cy="27" r="2" fill={`hsl(${a} 70% 42%)`} stroke="none" />
      </svg>
    </span>
  );
}

export function SearchBar({ initial = "", big }: { initial?: string; big?: boolean }) {
  const r = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const mac = typeof navigator !== "undefined" && /Mac|iP/.test(navigator.platform);
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); r.current?.focus(); r.current?.select(); } };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, []);
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); router.push(`/search?q=${encodeURIComponent(q.trim())}`); }}
      className={cx("glow group flex w-full items-center gap-3 rounded-full bg-sky-1 transition focus-within:bg-panel-2", big ? "h-16 px-5 sm:h-[72px] sm:px-7" : "h-12 px-4")}>
      <svg viewBox="0 0 24 24" className="size-6 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
      <input ref={r} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search games, skills, monsters…"
        aria-label="Search" className={cx("w-full flex-1 bg-transparent font-bold text-cream outline-none placeholder:text-muted/70 focus-visible:outline-none", big ? "text-lg sm:text-xl" : "text-base")} />
      <kbd className="hidden shrink-0 rounded-lg border-2 border-ink bg-sky-1 px-2 py-0.5 font-body text-sm font-extrabold text-muted sm:block">{mac ? "⌘K" : "Ctrl K"}</kbd>
    </form>
  );
}

export function SkillRow({ s, h, href }: { s: Skill; h?: Point[]; href?: string }) {
  return (
    <Link href={href ?? `/item?id=skill:${s.id}`} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-panel-2">
      <SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-lg leading-tight">{s.name}</span>
        <span className={cx("text-xs font-extrabold uppercase tracking-wide", RARITY_TEXT[s.rarity])}>{s.rarity} · {KIND_LABEL[s.kind]}</span>
      </span>
      {h && <span className="hidden w-24 shrink-0 sm:block"><Sparkline data={prices(h)} fill={false} className="h-8" /></span>}
      <span className="shrink-0 text-right">
        <span className="block font-extrabold tabular-nums">{s.floor ?? s.last_price ? `${fmt(s.floor ?? s.last_price)} SOL` : "—"}</span>
        {h && <Pct v={change24(h)} className="text-xs" />}
      </span>
    </Link>
  );
}

export function Countdown({ to }: { to: number }) {
  const [now, set] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => set(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((to - now) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return <span className="tabular-nums">{d ? `${d}d ` : ""}{String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}</span>;
}

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex min-w-0 flex-col gap-1.5 text-sm font-extrabold text-muted">{label}{children}</label>
);
export const inputCls = "h-11 rounded-xl border-3 border-ink bg-sky-0 px-3 font-bold text-cream outline-none placeholder:text-muted/50 focus:border-gold";

export const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-2xl border-3 border-dashed border-panel-2 p-6 text-center font-bold text-muted">{children}</p>;
export const Loading = () => <div className="h-40 animate-pulse rounded-3xl border-3 border-ink bg-panel/60" />;
