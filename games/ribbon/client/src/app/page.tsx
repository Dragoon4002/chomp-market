'use client';
import dynamic from 'next/dynamic';

// reads window/canvas/wallet at import time -> client only
const App = dynamic(() => import('@/App.tsx').then((m) => m.App), { ssr: false });

export default function Page() {
  return <App />;
}
