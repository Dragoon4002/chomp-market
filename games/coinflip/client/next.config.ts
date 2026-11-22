import type { NextConfig } from 'next';

export default {
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  transpilePackages: ['@xyz/platform'], // ships raw .ts
  agentRules: false, // don't generate AGENTS.md on dev
} satisfies NextConfig;
