import path from "node:path";
import type { NextConfig } from "next";

const root = path.resolve(process.cwd(), ".."); // market imports agents/pricing.ts

const basePath = process.env.MARKET_BASE_PATH || "";

export default {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath }, // plain <img> src needs the prefix
  output: "standalone",
  outputFileTracingRoot: root,
  reactCompiler: true,
  devIndicators: false,
  agentRules: false,
  turbopack: { root, rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } },
} satisfies NextConfig;
