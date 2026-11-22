'use client';
import dynamic from 'next/dynamic';

// Reads window/wallet/WebSocket at import time, so it never renders on the server.
const App = dynamic(() => import('@/components/App.tsx').then((m) => m.App), { ssr: false });

export default function Page() {
  return <App />;
}
