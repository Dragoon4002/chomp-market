import type { NftMonster } from '@/lib/nft.ts';
import { when } from '@/lib/format.ts';
import { Ico } from '@/components/ui.tsx';

export const isFree = (m: NftMonster, me: string) =>
  m.lockedUntil <= Date.now() && !m.price && (!m.rental || m.rental.untilMs <= Date.now() || m.rental.renter === me);

export function Badges({ m, me }: { m: NftMonster; me: string }) {
  const now = Date.now();
  const rented = m.rental && m.rental.untilMs > now ? m.rental : null;
  return (
    <span className="badges">
      {m.lockedUntil > now && <span className="chip warn row-ico"><Ico n="icon-lock" />In match</span>}
      {rented && (rented.renter === me
        ? <span className="chip gold row-ico"><Ico n="icon-timer" />Rented until {when(rented.untilMs)}</span>
        : <span className="chip warn row-ico"><Ico n="icon-timer" />Rented out</span>)}
      {m.price && <span className="chip row-ico"><Ico n="coin" />Listed</span>}
      {m.cooldownUntil > now && <span className="chip row-ico"><Ico n="egg-gold" />Breeding cooldown</span>}
      {m.titles.map((t) => <span key={t} className="chip gold row-ico"><Ico n="trophy" />{t}</span>)}
    </span>
  );
}
