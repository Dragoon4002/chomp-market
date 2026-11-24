// Hash routing (#/practice): the market embeds this export at /g/brawler/ inside an opaque-origin sandbox,
// where pushState is unreliable and the server has no SPA fallback for deep paths.
export const route = () => location.hash.replace(/^#/, '').split(/[/?]/).filter(Boolean);

export function go(path: string) {
  location.hash = path;
}

// basePath of the static export ('/g/brawler'); prefix for files in public/.
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// Chomp portal bridge (market/public/chomp-sdk.js, loaded in layout). Absent when run standalone.
declare global { interface Window { Chomp?: { ready(): void; result(r: { winner: number | null }): void } } }
