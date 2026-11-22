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

export default {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath, CHOMP_GAMES: JSON.stringify(games) }, // plain <img> src needs the prefix
  output: "standalone",
  outputFileTracingRoot: root,
  reactCompiler: true,
  devIndicators: false,
  agentRules: false,
  turbopack: { root, rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } },
} satisfies NextConfig;
