import { useEffect, useMemo, useState } from 'react';
import type { Monster } from '@/lib/genes.ts';
import { useWallet } from '@/lib/near.ts';
import { useMonsters, type NftMonster } from '@/lib/nft.ts';
import { monsters } from '@/lib/store.ts';
import { useLoad } from '@/hooks/async.ts';
import { isFree } from '@/components/monsters/Badges.tsx';

export function useMons(ids: string[]) {
  const api = useMonsters();
  const key = [...new Set(ids)].sort().join(',');
  const [m, setM] = useState<Record<string, NftMonster>>({});
  useEffect(() => {
    let dead = false;
    Promise.all(key ? key.split(',').map((id) => api.get(id).catch(() => null)) : []).then((r) => {
      if (!dead) setM(Object.fromEntries(r.filter((x): x is NftMonster => !!x).map((x) => [x.id, x])));
    });
    return () => { dead = true; };
  }, [key]);
  return m;
}

// Monsters you can fight with: free on-chain ones (lockable in staked matches) + browser ones (casual only).
export function usePlayable() {
  const api = useMonsters();
  const me = useWallet().signedAccountId ?? '';
  const [chain] = useLoad(() => api.mine().catch(() => []), [me]);
  const local = useMemo(monsters, []);
  const free = (chain ?? []).filter((m) => isFree(m, me));
  return { free, local, all: [...free, ...local] as Monster[] };
}
