// Portal registry. next.config.ts reads games/*/game.json at build and inlines it as CHOMP_GAMES.
export type Game = {
  slug: string; name: string; desc: string; engine: "html5" | "godot" | "unity" | "next";
  thumb: string; tags: string[]; settle: "result" | "frames";
  entry?: string; url?: string; license?: string; source?: string; soon?: boolean;
};

export const GAMES: Game[] = JSON.parse(process.env.CHOMP_GAMES || "[]");
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const gameSrc = (g: Game) => g.url ?? `${BASE}/g/${g.slug}/${g.entry}`;
export const gameThumb = (g: Game) => (g.thumb.startsWith("/") ? BASE + g.thumb : `${BASE}/g/${g.slug}/${g.thumb}`);
