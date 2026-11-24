import type { NextConfig } from 'next';

// Static export served by the portal at /g/tomb-delve/ (games/tomb-delve/build).
export default {
  output: 'export',
  basePath: '/g/tomb-delve',
  images: { unoptimized: true },
} satisfies NextConfig;
