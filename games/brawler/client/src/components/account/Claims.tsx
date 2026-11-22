import { useEffect, useState } from 'react';
import { fmt, useArena, type MatchView } from '@/lib/near.ts';
import { errText } from '@/lib/format.ts';
import { Ico } from '@/components/ui.tsx';

export function Claims() {
  const arena = useArena();
  const [rows, setRows] = useState<{ m: MatchView; amt: string; act: 'claim' | 'cancel' | 'expire' }[] | null>(null);
  const [msg, setMsg] = useState('');
  const load = async () => {
    if (!arena.ready || !arena.account) return setRows([]);
    try {
      const list = await arena.listMatches(0, 50);
      const out = [];
      const me = arena.account, stale = (ms: number) => Date.now() - ms > 2 * 3600_000;
      for (const m of list) {
        if (m.status === 'open' && m.host === me) out.push({ m, amt: m.stake, act: 'cancel' as const });
        else if (m.status === 'live' && stale(m.started_ms) && (m.host === me || m.guest === me || await arena.getPosition(m.id, me))) out.push({ m, amt: '0', act: 'expire' as const });
        else if (m.status === 'settled' || m.status === 'refund') {
          const amt = await arena.claimable(m.id, me);
          if (BigInt(amt) > 0n) out.push({ m, amt, act: 'claim' as const });
        }
      }
      setRows(out);
    } catch (e) { setMsg(errText(e)); setRows([]); }
  };
  useEffect(() => { load(); }, [arena.account]);
  if (!arena.account) return null;
  return (
    <section className="slab">
      <h2 className="row-ico"><Ico n="icon-claim" />Winnings and stakes</h2>
      {rows === null ? <p className="sub">Checking the arena contract…</p> : rows.length === 0 ? <p className="sub">Nothing to claim right now.</p> : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 8 }}>
          {rows.map(({ m, amt, act }) => (
            <li key={m.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span>Match #{m.id}: {act === 'expire' ? 'no result after 2 h, release for refund' : act === 'cancel' ? `unjoined room, ${fmt(amt)} NEAR stake` : `${fmt(amt)} NEAR${m.status === 'refund' ? ' refund' : ''}`}</span>
              <button className="btn" onClick={async () => {
                try { await (act === 'cancel' ? arena.cancelMatch(m.id) : act === 'expire' ? arena.expire(m.id) : arena.claim(m.id)); load(); }
                catch (e) { setMsg(errText(e)); }
              }}><span><Ico n={act === 'claim' ? 'icon-claim' : 'icon-refresh'} />{act === 'cancel' ? 'Cancel and refund' : act === 'expire' ? 'Release' : 'Claim'}</span></button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="note">{msg}</p>}
    </section>
  );
}
