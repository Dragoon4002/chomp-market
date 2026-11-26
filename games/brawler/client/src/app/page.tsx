'use client';
import dynamic from 'next/dynamic';

// The game reads window/canvas/wallet at import time, so it never renders on the server.
const App = dynamic(() => import('@/components/App.tsx').then((m) => m.App), { ssr: false });

export default function Page() {
  return <App />;
}
