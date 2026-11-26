import type { NextConfig } from 'next';

// Static export served by the market at /g/coinflip/ (games/coinflip/build, see export.mjs).
// Dev: http://localhost:3003/g/coinflip/ ; /g/coinflip-ws proxies to the game server like the market does.
const basePath = '/g/coinflip';
const exporting = process.env.EXPORT === '1';

export default {
  basePath,
  output: exporting ? 'export' : process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  transpilePackages: ['@xyz/platform'], // ships raw .ts
  agentRules: false, // don't generate AGENTS.md on dev
  ...(exporting ? {} : {
    rewrites: async () => [{ source: '/g/coinflip-ws/:path*', destination: 'http://127.0.0.1:8791/:path*', basePath: false as const }],
  }),
} satisfies NextConfig;
