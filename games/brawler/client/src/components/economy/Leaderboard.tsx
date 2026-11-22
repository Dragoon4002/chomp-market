import { useState } from 'react';
import { fmt, useArena, type MatchView } from '@/lib/near.ts';
import { rank } from '@/lib/leaderboard.ts';
import { short } from '@/lib/format.ts';
import { useLoad } from '@/hooks/async.ts';
import { Ico } from '@/components/ui.tsx';

const SORTS = [['wins', 'Most wins'], ['won', 'Most NEAR won']] as const;

export function Leaderboard() {
  const arena = useArena();
  const [by, setBy] = useState<'wins' | 'won'>('wins');
  const [data, , err] = useLoad(async () => {
    // ponytail: scans list_matches client-side (≤20 pages of 50); move to an indexer when matches grow
    const seen = new Map<number, MatchView>();
    for (let from = 0; from < 1000; from += 50) {
      const page = await arena.listMatches(from, 50);
      page.forEach((x) => seen.set(x.id, x));
      if (page.length < 50) break;
    }
    const fee = ((await arena.config().catch(() => null)) as { fee_bps?: number } | null)?.fee_bps ?? 10;
    return { matches: [...seen.values()], fee };
  });
  const rows = data ? rank(data.matches, data.fee, by).slice(0, 50) : null;
  return (
    <>
      <div><h1 className="row-ico"><Ico n="trophy" className="ico h" />Leaderboard</h1><p className="sub">Ranked from settled on-chain fights. Friendly (free) rooms don't count.</p></div>
      <div className="stake-presets" role="group" aria-label="Sort by">
        {SORTS.map(([k, label]) => <button key={k} type="button" className="chip" aria-pressed={by === k} onClick={() => setBy(k)}>{label}</button>)}
      </div>
      <section className="slab" aria-label="Leaderboard">
        {err ? <p className="note">{err}</p> : rows === null ? <p className="sub">Loading…</p> : rows.length === 0 ? <p className="sub">No settled fights yet. Win a staked fight to get on the board.</p> : (
          <ol className="lb">
            {rows.map((r, i) => (
              <li key={r.account} className="lb-row">
                <b className={`rank r${i + 1}`}>{i + 1}</b>
                <a className="lb-who" href={`/player/${encodeURIComponent(r.account)}`}><b title={r.account}>{short(r.account)}</b><small>{r.played} fights · {r.played - r.wins} losses</small></a>
                <span className={`chip row-ico${by === 'wins' ? ' on' : ''}`}><Ico n="trophy" />{r.wins} wins</span>
                <span className={`chip row-ico${by === 'won' ? ' on' : ''}`}><Ico n="coin" />{fmt(r.won.toString())} NEAR</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
