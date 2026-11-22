import { useState } from 'react';
import { fmt, UNIT, useWallet } from '@/lib/chain.ts';
import { useMonsters, type NftMonster } from '@/lib/nft.ts';
import { short } from '@/lib/format.ts';
import { useLoad } from '@/hooks/async.ts';
import { Badges } from '@/components/monsters/Badges.tsx';
import { Ico, Portrait } from '@/components/ui.tsx';

function MarketCard({ m, rent, me }: { m: NftMonster; rent: boolean; me: string }) {
  return (
    <a className="tile" href={`/monster/${m.id}`}>
      <Portrait dna={m.dna} size={180} />
      <div className="tile-head"><h3>{m.name}</h3><span className="chip">Gen {m.gen}</span></div>
      <span className="tile-meta">{m.record.w}W {m.record.l}L · {m.record.ko} KOs</span>
      <span className="tile-meta" title={m.owner}>{m.owner === me ? 'Yours' : `Owner ${short(m.owner)}`}</span>
      {m.titles.length > 0 && <Badges m={{ ...m, price: undefined }} me={me} />}
      <b className="price row-ico"><Ico n="coin" />
        {rent && m.rentOffer ? `${fmt(m.rentOffer.pricePerDay)} ${UNIT} / day, up to ${m.rentOffer.maxDays} days` : `${fmt(m.price)} ${UNIT}`}
      </b>
    </a>
  );
}

export function Market() {
  const api = useMonsters();
  const me = useWallet().signedAccountId ?? '';
  const [tab, setTab] = useState<'sale' | 'rent'>('sale');
  const [sale, , e1] = useLoad(() => api.listings());
  const [rent, , e2] = useLoad(() => api.rentOffers());
  const list = tab === 'sale' ? sale : rent;
  return (
    <>
      <div><h1 className="row-ico"><Ico n="coin-stack" className="ico h" />Market</h1><p className="sub">Buy a monster outright, or rent one by the day to fight with.</p></div>
      <div className="row" role="tablist" aria-label="Market">
        <button role="tab" aria-selected={tab === 'sale'} className={`btn ${tab === 'sale' ? '' : 'ghost'}`} onClick={() => setTab('sale')}><span><Ico n="coin" />For sale</span></button>
        <button role="tab" aria-selected={tab === 'rent'} className={`btn ${tab === 'rent' ? '' : 'ghost'}`} onClick={() => setTab('rent')}><span><Ico n="icon-timer" />For rent</span></button>
      </div>
      {(e1 || e2) && <p className="note">{e1 || e2}</p>}
      {list === null ? <p>Loading the market…</p> : list.length === 0 ? (
        <section className="slab"><h3>Nothing {tab === 'sale' ? 'for sale' : 'for rent'} right now</h3><p className="sub">Owners list their monsters from the monster page.</p></section>
      ) : <div className="grid">{list.map((m) => <MarketCard key={m.id} m={m} rent={tab === 'rent'} me={me} />)}</div>}
    </>
  );
}
