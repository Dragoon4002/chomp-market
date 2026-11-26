"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { amount, change24, explorer, fmt, KIND_LABEL, short, useAssets, type Dna, type Kind, type Monster, type Point, type Rarity, type Skill } from "@/lib/assets";
import { cart, cartKey, cartOpen, removeFromCart, toggleWatch, watch } from "@/lib/local";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/shadcn/dropdown-menu";
import { BASE, bs58, burnerKey, connectBurner, getWallet, loginPrivy, PRIVY_APP_ID, requestFaucet, useSol } from "@/lib/wallet";
import { ChevronDown, ChevronLeft, ChevronRight, Search, ShoppingCart, Star as StarIcon, X } from "lucide-react";

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
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-5 z-[60] flex justify-center">
      {m && <p className="rounded-2xl border-3 border-ink bg-panel-2 px-5 py-3 font-bold shadow-drop">{m}</p>}
    </div>
  );
}

const NAV = [["/", "Market"], ["/search", "Browse"], ["/collections", "Collections"], ["/launchpad", "Launchpad"], ["/spin", "Spin"], ["/activity", "Activity"], ["/play", "Games"], ["/create", "Create"]] as const;
const iconBtn = "grid size-10 shrink-0 place-items-center rounded-xl border-3 border-ink bg-panel text-cream shadow-drop-sm transition hover:bg-panel-2 active:translate-y-0.5 active:shadow-none";

export function Shell({ children }: { children: ReactNode }) {
  const a = useAssets();
  const path = usePathname();
  const router = useRouter();
  const lines = cart.useValue();
  useEffect(() => {
    // Ctrl/⌘K: SearchBar handles it when mounted; otherwise jump to Browse
    const on = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !document.querySelector("form[role=search]")) { e.preventDefault(); router.push("/search"); } };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [router]);
  const on = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/collections" && path === "/collection") || (href === "/launchpad" && path === "/launch"));
  return (
    <>
      <header className="sticky top-0 z-40 border-b-3 border-ink bg-sky-0/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 xl:flex-nowrap">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="grid size-10 place-items-center rounded-xl border-3 border-ink bg-ember font-display text-2xl text-ink shadow-drop-sm">C</span>
            <span className="font-display text-xl text-ember sm:text-2xl">Chomp</span>
          </Link>
          <nav className="no-scrollbar order-last -mx-1 flex w-full min-w-0 gap-1 overflow-x-auto px-1 pb-1 xl:order-none xl:mx-0 xl:ml-3 xl:w-auto xl:pb-0">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} aria-current={on(href) ? "page" : undefined}
                className="shrink-0 rounded-lg px-2.5 py-1.5 font-display text-[17px] text-muted transition hover:text-cream aria-[current=page]:bg-panel aria-[current=page]:text-cream aria-[current=page]:outline-3 aria-[current=page]:outline-ink">
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {path !== "/search" && <Link href="/search" className={iconBtn} aria-label="Search (Ctrl K)" title="Search (Ctrl K)"><Search className="size-5" /></Link>}
            <button type="button" className={cx(iconBtn, "relative")} aria-label={`Cart, ${lines.length} items`} onClick={() => cartOpen.set(true)}>
              <ShoppingCart className="size-5" />
              {!!lines.length && <span className="absolute -right-2 -top-2 grid min-w-5 place-items-center rounded-full border-2 border-ink bg-ember px-1 text-[11px] font-extrabold text-ink">{lines.length}</span>}
            </button>
            {a.account ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex h-10 items-center gap-2 rounded-full border-3 border-ink bg-panel pl-2 pr-3 font-bold shadow-drop-sm transition hover:bg-panel-2">
                    <span className="size-4 rounded-full border-2 border-ink bg-gradient-to-br from-gold to-ember" />
                    <span className="hidden text-sm sm:inline">{short(a.account)}</span>
                    {a.demo && <span className="rounded-md bg-gold px-1.5 text-[10px] font-extrabold uppercase leading-4 text-ink">Demo</span>}
                    <ChevronDown className="size-4 text-muted" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 rounded-2xl border-3 border-ink bg-panel-2 p-1.5 shadow-drop">
                  {!a.demo && <WalletItems account={a.account} />}
                  {[["/me", "My stuff"], ["/me?tab=watchlist", "Watchlist"], ["/me?tab=proceeds", "Proceeds"], ["/economy", "Economy sim"]].map(([h, l]) => (
                    <DropdownMenuItem key={h} asChild><Link href={h} className="rounded-xl font-bold">{l}</Link></DropdownMenuItem>
                  ))}
                  <DropdownMenuItem variant="destructive" className="rounded-xl font-bold" onClick={a.signOut}>Log out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : <ConnectMenu />}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6">{children}</main>
      <footer className="border-t-3 border-ink bg-sky-0/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm font-bold text-muted">
          <span className="font-display text-lg text-ember">Chomp</span>
          <span>Trade game skills and monsters on Solana.</span>
          <span className="ml-auto flex gap-4">{[["/launchpad", "Launchpad"], ["/create", "Creators"], ["/economy", "Economy"], ["/play", "Games"]].map(([h, l]) => <Link key={h} href={h} className="hover:text-cream">{l}</Link>)}</span>
        </div>
      </footer>
      <CartDrawer />
      <Toaster />
    </>
  );
}

const itemCls = "rounded-xl font-bold";
// signed out: pick a wallet. Opened by any useAssets().signIn() (event from lib/wallet openConnect).
function ConnectMenu() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => (PRIVY_APP_ID ? loginPrivy() : setOpen(true));
    addEventListener("chomp:connect", on);
    return () => removeEventListener("chomp:connect", on);
  }, []);
  if (PRIVY_APP_ID) return <Btn small onClick={loginPrivy}>Connect</Btn>; // Privy modal: email/social embedded wallet or Phantom etc.
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild><Btn small>Connect</Btn></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-2xl border-3 border-ink bg-panel-2 p-1.5 shadow-drop">
        <DropdownMenuItem className={cx(itemCls, "flex-col items-start gap-0")} onClick={() => void connectBurner()}>
          Burner wallet<span className="text-xs font-semibold text-muted">Devnet key kept in this browser (no NEXT_PUBLIC_PRIVY_APP_ID)</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WalletItems({ account }: { account: string }) {
  const sol = useSol(account);
  const burner = getWallet().kind === "burner";
  const copy = (v: string, done: string) => navigator.clipboard.writeText(v).then(() => toast(done), () => toast("Couldn't copy"));
  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-2 px-2 font-bold">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted" title={account}>{short(account)}</span>
        <Pill tone="gold">{sol == null ? "…" : fmt(sol)} SOL</Pill>
      </DropdownMenuLabel>
      <DropdownMenuItem className={itemCls} onClick={() => act(() => requestFaucet(account, BASE), "Devnet SOL on its way")}>Get devnet SOL</DropdownMenuItem>
      <DropdownMenuItem className={itemCls} onClick={() => copy(account, "Address copied")}>Copy address</DropdownMenuItem>
      <DropdownMenuItem asChild><a href={explorer("address", account)} target="_blank" rel="noreferrer" className={itemCls}>View on explorer ↗</a></DropdownMenuItem>
      {burner && (
        <DropdownMenuItem className={itemCls} onClick={() => { const kp = burnerKey(); if (kp && confirm("Copy the burner's secret key? Anyone with it controls this wallet.")) copy(bs58.encode(kp.secretKey), "Secret key copied"); }}>
          Export burner key
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator className="bg-ink" />
    </>
  );
}

function CartDrawer() {
  const a = useAssets();
  const open = cartOpen.useValue();
  const lines = cart.useValue();
  const [busy, setBusy] = useState(false);
  const total = lines.reduce((x, l) => x + (l.kind === "skill" ? amount(l.price_each) * l.qty : amount(l.price)), 0);
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === "Escape" && cartOpen.set(false);
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [open]);
  // TODO(solana): pack every line into one transaction; demo buys them one by one
  const checkout = async () => {
    setBusy(true);
    let ok = 0;
    for (const l of lines) {
      try {
        await (l.kind === "skill" ? a.buySkill({ seller: l.seller, skill: l.skill, qty: l.qty, price_each: l.price_each }, l.qty) : a.buyMonster({ token_id: l.token_id, price: l.price } as Monster));
        removeFromCart(cartKey(l)); ok++;
      } catch (e) { toast(`${l.name}: ${String((e as Error)?.message ?? e).slice(0, 100)}`); }
    }
    setBusy(false);
    if (ok) toast(`Bought ${ok} item${ok > 1 ? "s" : ""}.`);
  };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/60" onClick={() => cartOpen.set(false)}>
      <aside role="dialog" aria-label="Cart" onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-sm flex-col border-l-3 border-ink bg-panel animate-in slide-in-from-right">
        <div className="flex items-center justify-between border-b-3 border-ink p-4">
          <h2 className="text-2xl">Cart <span className="text-muted">({lines.length})</span></h2>
          <button type="button" aria-label="Close cart" className={iconBtn} onClick={() => cartOpen.set(false)}><X className="size-5" /></button>
        </div>
        <ul className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
          {!lines.length && <Empty>Cart is empty. Add listings from any item page.</Empty>}
          {lines.map((l) => (
            <li key={cartKey(l)} className="flex items-center gap-3 rounded-2xl border-3 border-ink bg-panel-2 p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-lg leading-tight">{l.name}</span>
                <span className="text-xs font-extrabold text-muted">{l.kind === "skill" ? `${l.qty} × ${fmt(l.price_each)} SOL · ${short(l.seller)}` : `Monster #${l.token_id}`}</span>
              </span>
              <span className="font-extrabold tabular-nums">{fmt(l.kind === "skill" ? BigInt(l.price_each) * BigInt(l.qty) : l.price)} SOL</span>
              <button type="button" aria-label={`Remove ${l.name}`} onClick={() => removeFromCart(cartKey(l))} className="text-muted hover:text-down"><X className="size-4" /></button>
            </li>
          ))}
        </ul>
        <div className="border-t-3 border-ink p-4">
          <p className="mb-3 flex justify-between font-extrabold"><span className="text-muted">Total</span><span className="font-display text-2xl">{total.toFixed(3).replace(/\.?0+$/, "")} SOL</span></p>
          <Btn className="w-full" disabled={!lines.length || busy || !a.account} onClick={checkout}>{busy ? "Buying…" : `Buy ${lines.length} item${lines.length === 1 ? "" : "s"}`}</Btn>
          {!!lines.length && <button type="button" onClick={() => cart.set([])} className="mt-2 w-full text-center text-sm font-bold text-muted hover:text-cream">Clear cart</button>}
        </div>
      </aside>
    </div>
  );
}

export function Btn({ children, tone = "ember", small, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "ember" | "gold" | "ghost" | "teal"; small?: boolean }) {
  const t = { ember: "bg-ember text-ink hover:bg-ember-hi", gold: "bg-gold text-ink hover:brightness-110", teal: "bg-teal text-ink hover:brightness-110", ghost: "bg-panel-2 text-cream hover:bg-sky-2" }[tone];
  return (
    <button {...p} className={cx("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border-3 border-ink font-display shadow-drop-sm transition active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0",
      small ? "h-9 px-3 text-base" : "h-12 px-5 text-xl", t, className)}>{children}</button>
  );
}

export const Panel = ({ children, className }: { children: ReactNode; className?: string }) => (
  <section className={cx("rounded-3xl border-3 border-ink bg-panel shadow-drop", className)}>{children}</section>
);

export function Chip({ on, children, onClick }: { on?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cx("shrink-0 rounded-full border-3 border-ink px-3 py-1 text-sm font-extrabold transition", on ? "bg-gold text-ink shadow-drop-sm" : "bg-panel text-muted hover:text-cream")}>
      {children}
    </button>
  );
}

// segmented tabs (24H/7D/30D, All/Live/…) — `under` = underline style for page-level tabs
export function Tabs<T extends string>({ value, options, onChange, under, className }: { value: T; options: readonly (T | readonly [T, ReactNode])[]; onChange: (v: T) => void; under?: boolean; className?: string }) {
  const opts = options.map((o) => (typeof o === "string" ? [o, o] as const : o));
  return (
    <div role="tablist" className={cx("no-scrollbar flex shrink-0 overflow-x-auto", under ? "gap-1 border-b-3 border-ink" : "gap-1 rounded-full border-3 border-ink bg-sky-0 p-1", className)}>
      {opts.map(([v, l]) => (
        <button key={v} role="tab" type="button" aria-selected={v === value} onClick={() => onChange(v)}
          className={cx("shrink-0 font-display transition", under
            ? "-mb-[3px] border-b-3 border-transparent px-3 py-2 text-lg text-muted hover:text-cream aria-selected:border-ember aria-selected:text-cream"
            : "rounded-full px-3 py-1 text-sm text-muted hover:text-cream aria-selected:bg-panel-2 aria-selected:text-cream")}>{l}</button>
      ))}
    </div>
  );
}

export function Breadcrumb({ items }: { items: [string, string?][] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-bold text-muted">
      {items.map(([l, h], i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          {i > 0 && <ChevronRight className="size-4 shrink-0" />}
          {h ? <Link href={h} className="truncate hover:text-cream">{l}</Link> : <span className="truncate text-cream" aria-current="page">{l}</span>}
        </span>
      ))}
    </nav>
  );
}

export function Star({ k, className }: { k: string; className?: string }) {
  const on = watch.useValue().includes(k);
  return (
    <button type="button" aria-pressed={on} aria-label={on ? "Remove from watchlist" : "Add to watchlist"} title={on ? "Watching" : "Watch"}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWatch(k); }}
      className={cx("grid size-9 shrink-0 place-items-center rounded-xl transition hover:bg-panel-2", on ? "text-gold" : "text-muted", className)}>
      <StarIcon className={cx("size-5", on && "fill-current")} />
    </button>
  );
}

export const SectionHead = ({ title, icon, href, children }: { title: string; icon?: ReactNode; href?: string; children?: ReactNode }) => (
  <div className="mb-4 flex flex-wrap items-center gap-3">
    <h2 className="flex items-center gap-2 text-2xl sm:text-3xl">{icon}{title}</h2>
    {children}
    {href && <Link href={href} className="ml-auto shrink-0 rounded-full border-3 border-ink bg-panel px-3 py-1 text-sm font-extrabold text-gold shadow-drop-sm transition hover:bg-panel-2">View all →</Link>}
  </div>
);

// horizontal snap row with prev/next buttons (Ronin carousels)
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  const r = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<[boolean, boolean]>([true, true]); // [at start, at end]
  const sync = useCallback(() => { const e = r.current; if (e) setEdge([e.scrollLeft < 8, e.scrollLeft + e.clientWidth > e.scrollWidth - 8]); }, []);
  useEffect(() => { sync(); addEventListener("resize", sync); return () => removeEventListener("resize", sync); }, [sync, children]);
  const go = (d: number) => r.current?.scrollBy({ left: d * r.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <div className="group relative">
      <div ref={r} onScroll={sync} className={cx("no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3 pt-1", className)}>{children}</div>
      {[-1, 1].map((d) => !edge[d < 0 ? 0 : 1] && (
        <button key={d} type="button" aria-label={d < 0 ? "Scroll left" : "Scroll right"} onClick={() => go(d)}
          className={cx(iconBtn, "absolute top-1/2 z-10 hidden -translate-y-1/2 rounded-full md:grid", d < 0 ? "-left-3" : "-right-3")}>
          {d < 0 ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
        </button>
      ))}
    </div>
  );
}

export const Pill = ({ children, tone = "panel", className }: { children: ReactNode; tone?: "panel" | "up" | "gold" | "ember" | "teal" | "down"; className?: string }) => (
  <span className={cx("inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-extrabold uppercase",
    { panel: "bg-panel-2 text-muted", up: "bg-up text-ink", gold: "bg-gold text-ink", ember: "bg-ember text-ink", teal: "bg-teal text-ink", down: "bg-down text-ink" }[tone], className)}>{children}</span>
);

export const Progress = ({ pct, className }: { pct: number; className?: string }) => (
  <div className={cx("h-3 overflow-hidden rounded-full border-2 border-ink bg-sky-0", className)}><div className="h-full bg-gradient-to-r from-ember to-gold" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>
);

// "Go to page n of N" (Ronin tables); hidden when one page
export function Pager({ page, pages, set }: { page: number; pages: number; set: (p: number) => void }) {
  if (pages <= 1) return null;
  const btn = "grid size-9 place-items-center rounded-full border-3 border-ink bg-panel text-cream shadow-drop-sm transition hover:bg-panel-2 disabled:opacity-40";
  return (
    <div className="mt-5 flex items-center justify-center gap-2 text-sm font-bold text-muted">
      <button type="button" aria-label="Previous page" className={btn} disabled={page <= 1} onClick={() => set(page - 1)}><ChevronLeft className="size-4" /></button>
      <span>Go to page</span>
      <input type="number" min={1} max={pages} value={page} aria-label="Page" onChange={(e) => set(Math.min(pages, Math.max(1, Number(e.target.value) || 1)))} className={cx(inputCls, "h-9 w-16 text-center")} />
      <span>of {pages}</span>
      <button type="button" aria-label="Next page" className={btn} disabled={page >= pages} onClick={() => set(page + 1)}><ChevronRight className="size-4" /></button>
    </div>
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
// bar trend (Ronin 7D trend column)
export function Bars({ data, className }: { data: number[]; className?: string }) {
  const hi = Math.max(...data, 1e-9);
  return (
    <span className={cx("flex h-10 items-end gap-[3px]", className)} aria-hidden>
      {data.map((v, i) => <span key={i} className="flex-1 rounded-t-sm bg-def/80" style={{ height: `${Math.max(4, (v / hi) * 100)}%` }} />)}
    </span>
  );
}
export const prices = (h: Point[] | undefined) => (h ?? []).map(([, p]) => amount(p));

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
export const RARITY_TEXT: Record<Rarity, string> = { Common: "text-muted", Rare: "text-def", Epic: "text-gold" };

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

// hero sprite picked + tinted from DNA (hosted recipe)
const HEROES = ["bramdra", "makvel", "grodrasu", "lortor", "torfen"];
export function MonsterArt({ dna, size = 48, className }: { dna: Dna; size?: number; className?: string }) {
  const h = dna.hue, a = dna.accent;
  return (
    <span className={cx("grid shrink-0 place-items-center overflow-hidden rounded-[28%] border-3 border-ink", className)} style={{ width: size, height: size, background: `radial-gradient(circle at 50% 30%, hsl(${h} 45% 34%), hsl(${h} 50% 14%))` }}>
      <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/heroes/${HEROES[Math.round(h / 72) % 5]}.webp`} alt="" draggable={false}
        className="h-[88%] w-[88%] object-contain" style={{ filter: `hue-rotate(${(5 * h + a) % 360}deg) saturate(.85)` }} />
    </span>
  );
}

export function SearchBar({ initial = "", big, placeholder = "Search skills, monsters, collections…" }: { initial?: string; big?: boolean; placeholder?: string }) {
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
      className={cx("group flex w-full items-center gap-3 rounded-full border-3 border-ink bg-panel shadow-drop transition focus-within:bg-panel-2", big ? "h-16 px-5 sm:h-[72px] sm:px-7" : "h-12 px-4")}>
      <Search className="size-6 shrink-0 text-muted" strokeWidth={2.6} />
      <input ref={r} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
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
export const Skel = ({ className }: { className?: string }) => <div className={cx("animate-pulse rounded-3xl border-3 border-ink bg-panel/60", className ?? "h-40")} />;
export const Loading = () => <Skel />;
