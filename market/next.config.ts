import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const root = path.resolve(process.cwd(), ".."); // market imports agents/pricing.ts

const basePath = process.env.MARKET_BASE_PATH || "";

// portal registry: every games/<slug>/game.json (dirs starting "_" skipped). NEXT_PUBLIC_<SLUG>_URL overrides url per deploy.
// ponytail: read at build, so a new game needs a dev restart / rebuild.
const gamesDir = path.join(root, "games");
const games = fs.readdirSync(gamesDir)
  .filter((d) => !d.startsWith("_") && fs.existsSync(path.join(gamesDir, d, "game.json")))
  .map((slug) => {
    const g = JSON.parse(fs.readFileSync(path.join(gamesDir, slug, "game.json"), "utf8"));
    const url = process.env[`NEXT_PUBLIC_${slug.toUpperCase().replace(/-/g, "_")}_URL`];
    return { ...g, slug, ...(g.url && url ? { url } : {}) };
  });

// game server default ports (keep in sync with scripts/serve-games.ts)
const SERVERS: Record<string, number> = { brawler: 8787, ribbon: 8788, keyfall: 8789, "monster-siege": 8790, coinflip: 8791 };

export default {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath, CHOMP_GAMES: JSON.stringify(games) }, // plain <img> src needs the prefix
  output: "standalone",
  outputFileTracingRoot: root,
  // Vercel serves game builds statically from public/g (scripts/vercel-games.mjs), so keep them out of the function bundle
  ...(process.env.VERCEL && { outputFileTracingExcludes: { "*": ["../games/**"] } }),
  // same sandbox as app/g/[slug]/[...path]/route.ts, for the static copies on Vercel
  headers: async () => [{
    source: "/g/:path*",
    headers: [
      { key: "Content-Security-Policy", value: "sandbox allow-scripts allow-forms allow-pointer-lock allow-downloads" },
      { key: "Access-Control-Allow-Origin", value: "*" },
    ],
  }],
  reactCompiler: true,
  devIndicators: false,
  // Game servers (WS + HTTP) behind the market origin at /g/<slug>-ws, so one tunnel/domain serves every game. <SLUG>_SERVER overrides.
  rewrites: async () => Object.entries(SERVERS).map(([slug, port]) => ({
    source: `/g/${slug}-ws/:path*`,
    destination: `${process.env[`${slug.toUpperCase().replace(/-/g, "_")}_SERVER`] || `http://127.0.0.1:${port}`}/:path*`,
  })),
  agentRules: false,
  turbopack: { root, resolveAlias: { "@solana-program/memo": "./lib/memo-stub.ts" }, rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } },
} satisfies NextConfig;
