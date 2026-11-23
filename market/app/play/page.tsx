"use client";
import { useState } from "react";
import { GameCard } from "@/components/game-card";
import { cx } from "@/components/ui";
import { GAMES } from "@/lib/games";

const TAGS = [...new Set(GAMES.flatMap((g) => g.tags))].sort();

export default function Play() {
  const [tag, setTag] = useState("");
  const list = GAMES.filter((g) => !tag || g.tags.includes(tag)).sort((a, b) => Number(!!a.soon) - Number(!!b.soon));
  const chip = (t: string, label: string) => (
    <button key={t} onClick={() => setTag(t)} aria-pressed={tag === t}
      className={cx("rounded-full border-3 border-ink px-3 py-1 text-sm font-extrabold", tag === t ? "bg-gold text-ink" : "bg-panel text-muted hover:text-cream")}>{label}</button>
  );
  return (
    <>
      <h1 className="text-5xl drop-shadow-[0_4px_0_var(--color-ink)]">Games</h1>
      <p className="mt-1 text-sm font-semibold text-muted">Click and play. Connect a wallet to play for stakes.</p>
      <div className="my-4 flex flex-wrap gap-2">{chip("", "All")}{TAGS.map((t) => chip(t, t))}</div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{list.map((g) => <GameCard key={g.slug} g={g} />)}</div>
    </>
  );
}
