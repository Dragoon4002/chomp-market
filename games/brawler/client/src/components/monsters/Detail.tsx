import { Fragment, useState } from 'react';
import { archetype, type Dna } from '@/lib/genes.ts';
import { fmt, toYocto, useWallet } from '@/lib/near.ts';
import { useMonsters, type HistoryEntry, type NftMonster } from '@/lib/nft.ts';
import { when } from '@/lib/format.ts';
import { useAct, useLoad } from '@/hooks/async.ts';
import { useMons } from '@/hooks/useMons.ts';
import { Ico, Portrait, Stats, TYPE_ICON } from '@/components/ui.tsx';
import { Badges } from './Badges.tsx';
import { GENE_NAMES } from './text.ts';

const geneRows = (d: Dna) => [
  ['Horns', GENE_NAMES.horn[d.horn]], ['Tail', GENE_NAMES.tail[d.tail]], ['Hide', GENE_NAMES.pattern[d.pattern]],
  ['Eyes', GENE_NAMES.eye[d.eye]], ['Colour', `hue ${d.hue}, accent ${d.accent}`], ['Size', `${d.size}%`],
];

function Trade({ m, me, reload }: { m: NftMonster; me: string; reload: () => void }) {
  const api = useMonsters();
  const { signIn } = useWallet();
  const act = useAct(reload);
  const [price, setPrice] = useState('1'), [rate, setRate] = useState('0.1'), [maxDays, setMaxDays] = useState('7'), [days, setDays] = useState('1');
  const now = Date.now();
  const rented = !!m.rental && m.rental.untilMs > now;
  const held = m.lockedUntil > now || rented; // in a match or rented out: owner can't list/offer
  const d = Math.min(Math.max(1, Math.floor(+days) || 1), m.rentOffer?.maxDays ?? 1);
  const gate = (f: () => Promise<unknown>, ok: string) => (me ? act.run(f, ok) : signIn());
  const owner = me !== '' && m.owner === me;
  if (!owner && !m.price && !(m.rentOffer && !rented)) return null;
  return (
    <section className="slab" aria-label="Trade" style={{ display: 'grid', gap: 14 }}>
      <h2 className="row-ico"><Ico n="coin-stack" />{owner ? 'Sell or rent out' : 'Get this monster'}</h2>
      {owner ? (
        <>
          {held && <p className="note">Busy right now (in a match or rented out), so it cannot be listed or offered.</p>}
          <div className="row">
            {m.price ? (
              <><span className="chip gold row-ico"><Ico n="coin" />Listed at {fmt(m.price)} NEAR</span>
                <button className="btn ghost" disabled={act.busy} onClick={() => act.run(() => api.delist(m.id), 'Listing removed.')}><span><Ico n="icon-close" />Delist</span></button></>
            ) : (
              <><label className="row">Price <input type="number" min="0" step="0.1" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Sale price in NEAR" style={{ width: 100 }} /> NEAR</label>
                <button className="btn" disabled={act.busy || held || !(+price > 0)} onClick={() => act.run(() => api.list(m.id, toYocto(price)), 'Listed for sale.')}><span><Ico n="coin" />List for sale</span></button></>
            )}
          </div>
          <div className="row">
            {m.rentOffer ? (
              <><span className="chip gold row-ico"><Ico n="icon-timer" />Rent {fmt(m.rentOffer.pricePerDay)} NEAR/day, max {m.rentOffer.maxDays} days</span>
                <button className="btn ghost" disabled={act.busy} onClick={() => act.run(() => api.cancelRent(m.id), 'Offer cancelled.')}><span><Ico n="icon-close" />Cancel offer</span></button></>
            ) : (
              <><label className="row">Per day <input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} aria-label="Rent per day in NEAR" style={{ width: 90 }} /> NEAR</label>
                <label className="row">Max days <input type="number" min="1" step="1" value={maxDays} onChange={(e) => setMaxDays(e.target.value)} aria-label="Maximum rental days" style={{ width: 70 }} /></label>
                <button className="btn alt" disabled={act.busy || held || !(+rate > 0) || !(+maxDays >= 1)} onClick={() => act.run(() => api.offerRent(m.id, toYocto(rate), Math.floor(+maxDays)), 'Rent offer published.')}><span><Ico n="icon-timer" />Offer for rent</span></button></>
            )}
          </div>
        </>
      ) : (
        <>
          {m.price && <div className="row"><b className="row-ico"><Ico n="coin" />{fmt(m.price)} NEAR</b>
            <button className="btn big" disabled={act.busy} onClick={() => gate(() => api.buy(m.id, m.price!), 'Bought! It is yours now.')}><span><Ico n="coin" />Buy</span></button></div>}
          {m.rentOffer && !rented && !m.price && (
            <div className="row">
              <label className="row">Days <input type="number" min="1" max={m.rentOffer.maxDays} step="1" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Days to rent" style={{ width: 70 }} /> (max {m.rentOffer.maxDays})</label>
              <b className="row-ico"><Ico n="coin" />{fmt((BigInt(m.rentOffer.pricePerDay) * BigInt(d)).toString())} NEAR total</b>
              <button className="btn alt" disabled={act.busy || m.lockedUntil > now} onClick={() => gate(() => api.rent(m.id, d, (BigInt(m.rentOffer!.pricePerDay) * BigInt(d)).toString()), 'Rented. You can fight with it now.')}><span><Ico n="icon-timer" />Rent for {d} day{d > 1 ? 's' : ''}</span></button>
            </div>
          )}
        </>
      )}
      {act.msg && <p className="note" role="status">{act.msg}</p>}
    </section>
  );
}

function History({ rows }: { rows: HistoryEntry[] }) {
  const vs = useMons(rows.map((h) => h.vs ?? '').filter(Boolean));
  return rows.length === 0 ? <p className="sub">No fights recorded yet.</p> : (
    <ul className="hist">
      {rows.map((h) => (
        <li key={h.match_id}>
          <span className={`chip row-ico ${h.won ? 'gold' : h.won === false ? 'warn' : ''}`}><Ico n={h.won ? 'trophy' : h.won === false ? 'skull' : 'icon-refresh'} />{h.won ? 'Won' : h.won === false ? 'Lost' : 'Void'}</span>
          <span>vs {h.vs ? <a href={`/monster/${h.vs}`}>{vs[h.vs]?.name ?? `#${h.vs}`}</a> : 'unknown'}</span>
          <span className="row-ico"><Ico n="ko" />{h.kos}</span>
          {h.tournament != null && <a className="chip row-ico" href={`/tournament/${h.tournament}`}><Ico n="trophy" />Tournament #{h.tournament}</a>}
          <small>{when(h.ms)}</small>
        </li>
      ))}
    </ul>
  );
}

export function Detail({ id }: { id: string }) {
  const api = useMonsters();
  const me = useWallet().signedAccountId ?? '';
  const [data, reload, err] = useLoad(async () => ({ m: await api.get(id) }), [id]);
  const [hist] = useLoad(() => api.history(id).catch(() => [] as HistoryEntry[]), [id]);
  const m = data?.m;
  const parents = useMons(m?.parents ?? []);
  if (!data) return <p>{err || 'Loading monster…'}</p>;
  if (!m) return <div className="slab"><h2>Monster not found</h2><a className="btn ghost" href="/collection"><span><Ico n="icon-back" />Back</span></a></div>;
  return (
    <>
      <a className="navlink row-ico" href="/collection"><Ico n="icon-back" />Back to collection</a>
      <div className="split">
        <div className="slab" style={{ display: 'grid', justifyItems: 'center', gap: 12 }}>
          <Portrait dna={m.dna} size={340} />
          <h1>{m.name}</h1>
          <div className="row"><span className="chip gold row-ico"><Ico n={TYPE_ICON[archetype(m.dna)]} />{archetype(m.dna)}</span><span className="chip row-ico"><Ico n="dna" />Gen {m.gen}</span></div>
          <Badges m={m} me={me} />
        </div>
        <div style={{ display: 'grid', gap: 20 }}>
          <Trade m={m} me={me} reload={reload} />
          <section className="slab"><h2 className="row-ico"><Ico n="icon-play" />Fight stats</h2><div style={{ marginTop: 14 }}><Stats dna={m.dna} /></div></section>
          <section className="slab">
            <h2 className="row-ico"><Ico n="trophy" />Career</h2>
            <dl className="kv" style={{ marginTop: 14 }}>
              <dt>Record</dt><dd className="row-ico"><Ico n="trophy" />{m.record.w} wins, {m.record.l} losses</dd>
              <dt>Knockouts</dt><dd className="row-ico"><Ico n="ko" />{m.record.ko}</dd>
              <dt>Owner</dt><dd style={{ overflowWrap: 'anywhere' }}>{m.owner === me ? 'You' : m.owner}</dd>
              <dt>Hatched</dt><dd>{new Date(m.born).toLocaleDateString()}</dd>
            </dl>
          </section>
          <section className="slab">
            <h2 className="row-ico"><Ico n="icon-history" />Fight history</h2>
            <div style={{ marginTop: 12 }}>{hist === null ? <p className="sub">Loading…</p> : <History rows={hist} />}</div>
          </section>
          <section className="slab">
            <h2 className="row-ico"><Ico n="dna" />Genes</h2>
            <dl className="kv" style={{ marginTop: 14 }}>{geneRows(m.dna).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
          </section>
          <section className="slab">
            <h2 className="row-ico"><Ico n="egg-gold" />Lineage</h2>
            <p className="sub">{m.parents ? 'Parents' : 'A wild first-generation monster.'}</p>
            <div className="row" style={{ marginTop: 10 }}>{(m.parents ?? []).map((p) => <a key={p} className="chip" href={`/monster/${p}`}>{parents[p]?.name ?? `#${p}`}</a>)}</div>
          </section>
          <div className="row">
            <a className="btn" href="/play"><span><Ico n="icon-play" />Fight</span></a>
            <a className="btn alt" href="/breed"><span><Ico n="icon-breed" />Breed</span></a>
          </div>
        </div>
      </div>
    </>
  );
}
