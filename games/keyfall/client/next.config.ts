import type { NextConfig } from 'next';

// Static export served by the market at /g/keyfall/ (games/keyfall/build, see export.mjs).
// Dev: http://localhost:3004/g/keyfall/ (talks to ws://localhost:8789 directly, see lib/match.ts).
const basePath = '/g/keyfall';

export default {
  basePath,
  output: process.env.EXPORT === '1' ? 'export' : process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  transpilePackages: ['@xyz/platform'], // ships raw .ts
  devIndicators: false,
  agentRules: false, // don't generate AGENTS.md on dev
} satisfies NextConfig;
