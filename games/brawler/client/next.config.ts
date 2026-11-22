import type { NextConfig } from 'next';

export default {
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  transpilePackages: ['@xyz/platform'], // ships raw .ts
  agentRules: false, // don't generate AGENTS.md on dev
  headers: async () => ['ui', 'stages', 'title', 'chars'].map((d) => ({
    source: `/${d}/:path*`,
    headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
  })),
  rewrites: async () => {
    const o = process.env.MARKET_DEV_ORIGIN; // local: serve the market at /shop on this origin (shares the NEAR Auth login)
    return o ? [{ source: '/shop', destination: `${o}/shop` }, { source: '/shop/:path*', destination: `${o}/shop/:path*` }] : [];
  },
} satisfies NextConfig;
