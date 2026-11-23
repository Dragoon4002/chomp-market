// Portal registry. next.config.ts reads games/*/game.json at build and inlines it as CHOMP_GAMES.
export type Game = {
  slug: string; name: string; desc: string; engine: "html5" | "godot" | "unity" | "next";
  thumb: string; tags: string[]; settle: "result" | "frames";
  entry?: string; url?: string; license?: string; source?: string; soon?: boolean;
};

export const GAMES: Game[] = JSON.parse(process.env.CHOMP_GAMES || "[]");
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
// NEXT_PUBLIC_GAMES_ORIGIN (e.g. http://localhost:3200, `node scripts/serve-games.ts`): builds served off the market server,
// so games keep running while the market reloads, and get their own origin (safe to allow storage).
const GAMES_ORIGIN = process.env.NEXT_PUBLIC_GAMES_ORIGIN?.replace(/\/$/, "");
export const gameSrc = (g: Game) => g.url ?? (GAMES_ORIGIN ? `${GAMES_ORIGIN}/g/${g.slug}/${g.entry}` : `${BASE}/g/${g.slug}/${g.entry}`);
export const ownOrigin = (g: Game) => !!(g.url || GAMES_ORIGIN);
export const gameThumb = (g: Game) => (g.thumb.startsWith("/") ? BASE + g.thumb : `${BASE}/g/${g.slug}/${g.thumb}`);
