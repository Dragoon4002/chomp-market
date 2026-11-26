import type { NextConfig } from 'next';

// Static export served by the market at /g/ribbon/ (games/ribbon/build, see export.mjs), like brawler.
// Dev: http://localhost:3001/g/ribbon/ ; /g/ribbon-ws proxies to the game server like the market does.
const basePath = '/g/ribbon';
const exporting = process.env.EXPORT === '1';

export default {
  basePath,
  output: exporting ? 'export' : process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  transpilePackages: ['@xyz/platform'], // ships raw .ts
  agentRules: false, // don't generate AGENTS.md on dev
  ...(exporting ? {} : {
    rewrites: async () => [{ source: '/g/ribbon-ws/:path*', destination: 'http://127.0.0.1:8788/:path*', basePath: false as const }],
  }),
} satisfies NextConfig;
