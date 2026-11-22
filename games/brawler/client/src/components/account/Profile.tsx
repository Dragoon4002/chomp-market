import { Ico } from '@/components/ui.tsx';
import { History, Stats, useFights } from './History.tsx';
import { short } from '@/lib/format.ts';

export function Profile({ account }: { account: string }) {
  const { fights, loading } = useFights(account);
  return (
    <>
      <div><h1 className="row-ico" style={{ overflowWrap: 'anywhere' }}><Ico n="icon-wallet" className="ico h" />{short(account)}</h1><p className="sub">Player record from finished fights.</p></div>
      <Stats fights={fights} />
      <History fights={fights} loading={loading} />
    </>
  );
}
