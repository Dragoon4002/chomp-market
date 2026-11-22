import { useMemo, useState } from 'react';
import type { Monster } from '@/lib/genes.ts';
import { DEMO } from '@/lib/demo.ts';
import { useWallet } from '@/lib/near.ts';
import { useMonsters } from '@/lib/nft.ts';
import { useAct, useLoad } from '@/hooks/async.ts';
import { Ico, MonsterCard } from '@/components/ui.tsx';
import { Badges } from './Badges.tsx';
import { DEMO_NOTE } from './text.ts';

const SORTS = { newest: (a: Monster, b: Monster) => b.born - a.born, wins: (a: Monster, b: Monster) => b.record.w - a.record.w, gen: (a: Monster, b: Monster) => b.gen - a.gen };
export function Collection() {
  const api = useMonsters();
  const { signedAccountId, signIn } = useWallet();
  const me = signedAccountId ?? '';
  const [sort, setSort] = useState<keyof typeof SORTS>('newest');
  const [all, reload, err] = useLoad(() => api.mine(), [me]);
  const [claimed, reloadClaimed] = useLoad(() => api.startersClaimed().catch(() => true), [me]);
  const act = useAct(() => { reload(); reloadClaimed(); });
  const list = useMemo(() => [...(all ?? [])].sort(SORTS[sort]), [all, sort]);
  const empty = all !== null && !all.some((m) => m.owner === me);
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><h1 className="row-ico"><Ico n="icon-monster" className="ico h" />My monsters</h1><p className="sub">{all ? `${list.length} in your stable.` : 'Loading your stable…'} Genes decide how each one fights.</p></div>
        <label className="row">Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)}>
            <option value="newest">Newest</option><option value="wins">Most wins</option><option value="gen">Generation</option>
          </select>
        </label>
      </div>
      {err && <p className="note">{err}</p>}
      {!me && <section className="slab" style={{ display: 'grid', gap: 12, justifyItems: 'start' }}><h3>Connect your wallet</h3><p className="sub">Sign in to see and claim your monsters.</p><button className="btn big" onClick={() => signIn()}><span><Ico n="icon-wallet" />Connect wallet</span></button></section>}
      {me && empty && claimed === false && (
        <section className="slab" style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
          <h2 className="row-ico"><Ico n="egg-gold" />Start your stable</h2>
          <p className="sub">Every account gets three free first-generation monsters.</p>
          <button className="btn big" disabled={act.busy} onClick={() => (me ? act.run(() => api.hatchStarters(), 'Hatched!') : signIn())}><span><Ico n="egg-hatch" />Claim 3 starter monsters</span></button>
          {act.msg && <p className="note" role="status">{act.msg}</p>}
        </section>
      )}
      {me && all !== null && !all.length && claimed !== false && <section className="slab"><h3>No monsters yet</h3><p className="sub">Buy or rent one from the <a href="/market">market</a>.</p></section>}
      <div className="grid">{list.map((m) => <MonsterCard key={m.id} m={m} href={`/monster/${m.id}`} extra={<Badges m={m} me={me} />} />)}</div>
      {DEMO && <p className="note">{DEMO_NOTE}</p>}
    </>
  );
}
