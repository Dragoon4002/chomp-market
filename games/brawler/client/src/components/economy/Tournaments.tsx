import { useState } from 'react';
import { DEMO } from '@/lib/demo.ts';
import { fmt, UNIT, toYocto, useArena, useWallet, type TournamentView } from '@/lib/chain.ts';
import { useAct, useLoad } from '@/hooks/async.ts';
import { Ico } from '@/components/ui.tsx';
import { go } from '@/lib/nav.ts';

export const STATUS_ICON = { open: 'icon-room-public', live: 'icon-live', done: 'trophy', cancelled: 'icon-close' } as const;

function TCard({ t }: { t: TournamentView }) {
  return (
    <a className="tile" href={`/tournament/${t.id}`}>
      <div className="tile-head"><h3>Tournament #{t.id}</h3><span className={`chip row-ico ${t.status === 'live' ? 'gold' : ''}`}><Ico n={STATUS_ICON[t.status]} />{t.status}</span></div>
      <span className="tile-meta row-ico"><Ico n="icon-monster" />{t.entrants.length} / {t.size} entered</span>
      <span className="tile-meta row-ico"><Ico n="coin" />Entry {fmt(t.entry_fee)} {UNIT}, pot {fmt(t.pot)} {UNIT}</span>
      {t.bettable && <span className="tile-meta row-ico"><Ico n="icon-bet" />Bets open</span>}
    </a>
  );
}

function CreateTournament({ done }: { done: (id: number) => void }) {
  const arena = useArena();
  const [size, setSize] = useState(4), [fee, setFee] = useState('0.1'), [bet, setBet] = useState(true);
  const { msg, busy, run } = useAct();
  return (
    <section className="slab" aria-label="Create tournament" style={{ display: 'grid', gap: 14 }}>
      <h3 className="row-ico"><Ico n="trophy" />Create a tournament</h3>
      <div className="row">
        <label className="row">Players <select value={size} onChange={(e) => setSize(+e.target.value)}><option value={4}>4</option><option value={8}>8</option></select></label>
        <label className="row">Entry fee <input type="number" min="0" step="0.05" value={fee} onChange={(e) => setFee(e.target.value)} style={{ width: 110 }} aria-label={`Entry fee in ${UNIT}`} /> {UNIT}</label>
      </div>
      <label className="toggle"><input type="checkbox" checked={bet} onChange={(e) => setBet(e.target.checked)} /> Let spectators bet on matches</label>
      <button className="btn" disabled={busy || !(Number(fee) >= 0)} onClick={() => run(async () => done(await arena.createTournament(size, toYocto(fee || '0'), bet)), 'Created.')}><span><Ico n="icon-check" />Create</span></button>
      {msg && <p className="note" role="status">{msg}</p>}
    </section>
  );
}

export function Tournaments() {
  const arena = useArena();
  const me = useWallet().signedAccountId ?? '';
  const [list, reload, err] = useLoad(() => arena.listTournaments());
  const [cfg] = useLoad(() => arena.config().catch(() => null));
  const isOwner = DEMO || (!!me && cfg?.owner === me);
  const group = (f: (t: TournamentView) => boolean) => (list ?? []).filter(f);
  const sections: [string, string, TournamentView[]][] = [
    ['Open for entries', 'icon-room-public', group((t) => t.status === 'open')],
    ['Live now', 'icon-live', group((t) => t.status === 'live')],
    ['Finished', 'trophy', group((t) => t.status === 'done' || t.status === 'cancelled')],
  ];
  return (
    <>
      <div><h1 className="row-ico"><Ico n="trophy" className="ico h" />Tournaments</h1><p className="sub">Enter a monster, win the bracket, take the pot. Monsters are locked while a tournament runs.</p></div>
      {isOwner && <CreateTournament done={(id) => { reload(); go(`/tournament/${id}`); }} />}
      {err && <p className="note">{err}</p>}
      {list === null ? <p>Loading tournaments…</p> : list.length === 0 ? <section className="slab"><h3>No tournaments yet</h3></section> : sections.map(([title, ico, ts]) => ts.length > 0 && (
        <section key={title} style={{ display: 'grid', gap: 14 }}>
          <h2 className="row-ico"><Ico n={ico} />{title}</h2>
          <div className="grid">{ts.map((t) => <TCard key={t.id} t={t} />)}</div>
        </section>
      ))}
    </>
  );
}
