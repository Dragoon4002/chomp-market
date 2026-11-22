"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { change24, fmt, KIND_LABEL, KINDS, RARITIES, skillKey, useAssets, type Point } from "@/lib/assets";
import { Chip, cx, Empty, Loading, MonsterArt, Pct, prices, RARITY_TEXT, SkillArt, Sparkline, STATS, useLoad } from "@/components/ui";

const TYPES = [["", "All"], ["skill", "Skills"], ["monster", "Monsters"], ["collection", "Collections"]] as const;

export default function Search() {
  const a = useAssets();
  const sp = useSearchParams();
  const router = useRouter();
  const q = sp.get("q") ?? "", type = sp.get("type") ?? "", kind = sp.get("kind") ?? "", rarity = sp.get("rarity") ?? "", sort = sp.get("sort") ?? "price";
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v); else n.delete(k);
    router.replace(`/search?${n}`, { scroll: false });
  };
  const [d] = useLoad(async () => {
    const [skills, cols, mons] = await Promise.all([a.skills(), a.collections(), a.monsters()]);
    const hist: Record<number, Point[]> = Object.fromEntries(await Promise.all(skills.map(async (s) => [s.id, await a.history(skillKey(s.id))])));
    return { skills, cols, mons, hist };
  }, [a.account]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (...f: string[]) => words.every((w) => f.join(" ").toLowerCase().includes(w));
  const colName = (id: number) => d?.cols.find((c) => c.id === id)?.name ?? "";
  const by = <T,>(xs: T[], key: (x: T) => number) => xs.sort((x, y) => key(y) - key(x));
  const skills = d ? by(d.skills.filter((s) => (!kind || s.kind === kind) && (!rarity || s.rarity === rarity) && hit(s.name, s.kind, KIND_LABEL[s.kind], s.rarity, colName(s.collection), s.creator)),
    (s) => sort === "change" ? change24(d.hist[s.id]) : sort === "new" ? s.id : -Number(BigInt(s.floor ?? s.last_price ?? "0") / 10n ** 18n)) : [];
  const mons = d && !kind && !rarity ? by(d.mons.filter((m) => hit(m.name, m.token_id, m.owner_id)), (m) => sort === "new" ? Number(m.token_id) : sort === "change" ? m.record.w : -Number(BigInt(m.price ?? "0") / 10n ** 18n)) : [];
  const cols = d && !kind && !rarity ? d.cols.filter((c) => hit(c.name, c.description, c.creator)) : [];
  const show = (t: string) => !type || type === t;
  const count = (show("skill") ? skills.length : 0) + (show("monster") ? mons.length : 0) + (show("collection") ? cols.length : 0);

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">{TYPES.map(([v, l]) => <Chip key={v} on={type === v} onClick={() => set("type", v)}>{l}</Chip>)}</div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip on={!kind} onClick={() => set("kind", "")}>Any kind</Chip>
          {KINDS.map((k) => <Chip key={k} on={kind === k} onClick={() => set("kind", kind === k ? "" : k)}>{KIND_LABEL[k]}</Chip>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RARITIES.map((r) => <Chip key={r} on={rarity === r} onClick={() => set("rarity", rarity === r ? "" : r)}>{r}</Chip>)}
          <select aria-label="Sort" value={sort} onChange={(e) => set("sort", e.target.value)} className="ml-auto h-9 rounded-xl border-3 border-ink bg-panel px-3 text-sm font-extrabold text-cream">
            <option value="price">Price: low → high</option><option value="change">Top gainers</option><option value="new">Newest</option>
          </select>
        </div>
      </div>
      <p className="mb-4 mt-6 text-sm font-extrabold text-muted">{d ? `${count} result${count === 1 ? "" : "s"}${q ? ` for “${q}”` : ""}` : "Loading…"}</p>
      {!d ? <Loading /> : !count ? <Empty>Nothing matches. Try fewer filters.</Empty> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {show("skill") && skills.map((s) => (
            <Link key={`s${s.id}`} href={`/item?id=skill:${s.id}`} className="rounded-3xl border-3 border-ink bg-panel p-4 shadow-drop transition hover:-translate-y-1 hover:bg-panel-2">
              <div className="flex items-center gap-3">
                <SkillArt kind={s.kind} rarity={s.rarity} mag={s.mag} size={52} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-xl leading-tight">{s.name}</span>
                  <span className={cx("text-xs font-extrabold uppercase tracking-wide", RARITY_TEXT[s.rarity])}>{s.rarity} · {KIND_LABEL[s.kind]}</span>
                </span>
              </div>
              <Sparkline data={prices(d.hist[s.id])} className="my-3 h-12" />
              <div className="flex items-end justify-between text-sm">
                <span><span className="block text-xs font-extrabold text-muted">{s.floor ? "Floor" : "Last"}</span><span className="font-display text-xl">{s.floor ?? s.last_price ? `${fmt(s.floor ?? s.last_price)} Ⓝ` : "—"}</span></span>
                <span className="text-right"><span className="block text-xs font-extrabold text-muted">{s.listed_qty} listed</span><Pct v={change24(d.hist[s.id])} /></span>
              </div>
            </Link>
          ))}
          {show("monster") && mons.map((m) => (
            <Link key={`m${m.token_id}`} href={`/item?id=monster:${m.token_id}`} className="rounded-3xl border-3 border-ink bg-panel p-4 shadow-drop transition hover:-translate-y-1 hover:bg-panel-2">
              <div className="flex items-center gap-3">
                <MonsterArt dna={m.dna} size={52} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-xl leading-tight">{m.name} <span className="text-muted">#{m.token_id}</span></span>
                  <span className="text-xs font-extrabold uppercase tracking-wide text-teal">Monster · Gen {m.gen}</span>
                </span>
              </div>
              <div className="my-3 grid grid-cols-4 gap-1.5 text-center text-xs font-extrabold">
                {STATS.map(([k, t]) => <span key={k} className="rounded-lg bg-sky-0 py-1.5"><span className="block text-muted uppercase">{k}</span><span className={cx(t, "text-base")}>{m.dna[k]}</span></span>)}
              </div>
              <div className="flex items-end justify-between text-sm">
                <span><span className="block text-xs font-extrabold text-muted">Price</span><span className="font-display text-xl">{fmt(m.price)} Ⓝ</span></span>
                <span className="font-extrabold text-muted">{m.record.w}W · {m.record.l}L</span>
              </div>
            </Link>
          ))}
          {show("collection") && cols.map((c) => (
            <Link key={`c${c.id}`} href={`/collection?id=${c.id}`} className="rounded-3xl border-3 border-ink bg-gradient-to-br from-panel-2 to-panel p-5 shadow-drop transition hover:-translate-y-1">
              <span className="text-xs font-extrabold uppercase tracking-wide text-ember">Collection</span>
              <h3 className="mt-1 text-2xl">{c.name}</h3>
              <p className="mt-1 line-clamp-2 text-sm font-bold text-muted">{c.description}</p>
              <div className="mt-4 flex -space-x-2">{d.skills.filter((s) => s.collection === c.id).slice(0, 6).map((s) => <SkillArt key={s.id} kind={s.kind} rarity={s.rarity} size={34} />)}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
