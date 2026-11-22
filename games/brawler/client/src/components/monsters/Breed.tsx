import { Fragment, useState } from 'react';
import { STAT_KEYS } from '@/lib/genes.ts';
import { DEMO } from '@/lib/demo.ts';
import { fmt, useWallet } from '@/lib/near.ts';
import { useMonsters, type NftMonster } from '@/lib/nft.ts';
import { useAct, useLoad } from '@/hooks/async.ts';
import { Ico, MonsterCard, Portrait } from '@/components/ui.tsx';
import { DEMO_NOTE, GENE_NAMES } from './text.ts';

export function Breed() {
  const api = useMonsters();
  const me = useWallet().signedAccountId ?? '';
  const [all, reload, err] = useLoad(() => api.mine(), [me]);
  const [cfg] = useLoad(() => api.config().catch(() => null));
  const [sel, setSel] = useState<string[]>([]);
  const [born, setBorn] = useState<NftMonster | null>(null);
  const act = useAct(reload);
  const now = Date.now();
  const list = (all ?? []).filter((m) => m.owner === me); // rented-in monsters can't breed
  const why = (m: NftMonster) => (m.lockedUntil > now ? 'In match' : m.rental && m.rental.untilMs > now ? 'Rented out' : m.cooldownUntil > now ? 'Breeding cooldown' : '');
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2)));
  const [a, b] = sel.map((id) => list.find((m) => m.id === id)).filter(Boolean) as NftMonster[];
  const hatch = () => act.run(async () => { const c = await api.breed(a.id, b.id); setBorn(c); setSel([]); }, '');
  return (
    <>
      <div><h1 className="row-ico"><Ico n="icon-breed" className="ico h" />Breed</h1><p className="sub">Pick two parents. The egg inherits a mix of their genes, and sometimes a mutation. Each parent then rests for an hour.</p></div>
      {born && (
        <section className="slab reveal" style={{ display: 'grid', justifyItems: 'center', gap: 10, textAlign: 'center' }} aria-live="polite">
          <Ico n="egg-hatch" className="ico egg-big" />
          <h2>{born.name} hatched</h2>
          <Portrait dna={born.dna} size={260} />
          <p>Generation {born.gen}.</p>
          <a className="btn" href={`/monster/${born.id}`}><span><Ico n="icon-monster" />Meet {born.name}</span></a>
        </section>
      )}
      {a && b && (
        <section className="slab" aria-label="Inheritance preview">
          <h2 className="row-ico"><Ico n="egg-purple" className="ico h" />{a.name} and {b.name}</h2>
          <dl className="kv" style={{ marginTop: 12 }}>
            {STAT_KEYS.map((k) => <Fragment key={k}><dt>{k}</dt><dd>{Math.min(a.dna[k], b.dna[k])} to {Math.max(a.dna[k], b.dna[k])}</dd></Fragment>)}
            <dt>Horns</dt><dd>{GENE_NAMES.horn[a.dna.horn]} or {GENE_NAMES.horn[b.dna.horn]}</dd>
            <dt>Tail</dt><dd>{GENE_NAMES.tail[a.dna.tail]} or {GENE_NAMES.tail[b.dna.tail]}</dd>
            <dt>Fee</dt><dd className="row-ico"><Ico n="coin" />{cfg ? `${fmt(cfg.breed_fee)} NEAR + storage` : '…'}</dd>
          </dl>
          <div className="row" style={{ marginTop: 16 }}><button className="btn big" disabled={act.busy} onClick={hatch}><span><Ico n="egg-teal" />{act.busy ? 'Hatching…' : 'Hatch egg'}</span></button></div>
        </section>
      )}
      {(act.msg || err) && <p className="note" role="status">{act.msg || err}</p>}
      {all === null ? <p>Loading your monsters…</p> : list.length < 2 && <p className="note">You need two monsters of your own to breed.</p>}
      <div className="grid">{list.map((m) => <MonsterCard key={m.id} m={m} selected={sel.includes(m.id)} disabled={!!why(m)} onClick={() => toggle(m.id)} extra={why(m) ? <span className="chip warn">{why(m)}</span> : undefined} />)}</div>
      {DEMO && <p className="note">{DEMO_NOTE}</p>}
    </>
  );
}
