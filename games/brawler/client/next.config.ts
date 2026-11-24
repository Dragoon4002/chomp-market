import type { NextConfig } from 'next';

// Static export served by the market at /g/brawler/ (games/brawler/build, see export.mjs).
// Dev: http://localhost:3000/g/brawler/ ; /g/brawler-ws proxies to the game server like the market does.
const basePath = '/g/brawler';
const exporting = process.env.EXPORT === '1';

export default {
  basePath,
  output: exporting ? 'export' : process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  transpilePackages: ['@xyz/platform'], // ships raw .ts
  agentRules: false, // don't generate AGENTS.md on dev
  ...(exporting ? {} : {
    headers: async () => ['ui', 'stages', 'title', 'chars'].map((d) => ({
      source: `/${d}/:path*`,
      headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
    })),
    rewrites: async () => [{ source: '/g/brawler-ws/:path*', destination: 'http://127.0.0.1:8787/:path*', basePath: false as const }],
  }),
} satisfies NextConfig;
