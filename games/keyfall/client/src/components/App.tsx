import { useEffect, useState } from 'react';
import { NearProvider, NETWORK } from '@xyz/platform';
import type { OnlineReq } from '@/lib/match.ts';
import { Title } from '@/components/Title.tsx';
import { LocalGame, OnlineGame } from '@/components/Game.tsx';
import { unlock } from '@/components/sfx.ts';

export type Screen =
  | { k: 'title' }
  | { k: 'practice'; name: string; n: number }
  | { k: 'online'; req: OnlineReq; stake?: string; n?: number };

function Root() {
  const [s, set] = useState<Screen>({ k: 'title' });
  // music starts on the first user gesture (autoplay policy) and persists across screens, like MusicManager
  useEffect(() => {
    const go = () => unlock();
    addEventListener('pointerdown', go, { once: true });
    addEventListener('keydown', go, { once: true });
    return () => { removeEventListener('pointerdown', go); removeEventListener('keydown', go); };
  }, []);
  const menu = () => set({ k: 'title' });
  if (s.k === 'practice') return <LocalGame key={s.n} name={s.name} onMenu={menu} onAgain={() => set({ ...s, n: s.n + 1 })} />;
  if (s.k === 'online') {
    // rematch = fresh free room as host (stake needs a new on-chain match, do that from the menu)
    const again = () => set({ k: 'online', req: { ...s.req, kind: 'host', code: undefined, matchId: undefined }, n: (s.n ?? 0) + 1 });
    return <OnlineGame key={s.n} req={s.req} stake={s.stake} onMenu={menu} onAgain={again} />;
  }
  return <Title go={set} />;
}

export const App = () => (
  <NearProvider config={{ network: NETWORK }}>
    <Root />
  </NearProvider>
);
