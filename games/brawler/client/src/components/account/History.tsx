import { useState } from 'react';
import { fmt, UNIT, useArena, type MatchView } from '@/lib/chain.ts';
import { history, monster } from '@/lib/store.ts';
import { SERVER } from '@/lib/session.ts';
import { short } from '@/lib/format.ts';
import { useLoad } from '@/hooks/async.ts';
import { Ico } from '@/components/ui.tsx';

export interface Fight { at: number; won: boolean | null; mine: string; vs: string; vsAccount?: string; stake: string; kind: 'Friendly' | 'Staked' | 'Tournament'; matchId: number | null; key?: string | null }

interface Rec { at: number; match_id: number | null; stake: string; winner: number | null; reason: string; players: { account: string; name: string }[]; key?: string | null }

const kindOf = (stake: string | undefined, tournament: boolean | number | null | undefined, matchId?: number | null): Fight['kind'] =>
  tournament || tournament === 0 ? 'Tournament' : (stake && stake !== '0') || matchId != null ? 'Staked' : 'Friendly';

const HTTP = SERVER.replace(/^ws/, 'http');

// Server log (every finished fight, any device) + on-chain matches (tournament flag, fights older than the log).
// `local` adds this browser's log for fights from before the server kept history.
export function useFights(account: string | null | undefined, local = false) {
  const arena = useArena();
  const [data] = useLoad(async () => {
    if (!account) return { recs: [] as Rec[], chain: [] as MatchView[] };
    const recs = await fetch(`${HTTP}/history/${encodeURIComponent(account)}`).then((r) => r.json() as Promise<Rec[]>).catch(() => [] as Rec[]);
    const chain: MatchView[] = [];
    // ponytail: client-side scan of list_matches; an indexer replaces this when match count grows
    for (let from = 0; from < 1000; from += 50) {
      const page = await arena.listMatches(from, 50).catch(() => [] as MatchView[]);
      chain.push(...page.filter((m) => m.host === account || m.guest === account));
      if (page.length < 50) break;
    }
    return { recs, chain };
  }, [account]);
  const recs = data?.recs ?? [], chain = data?.chain ?? [];
  const fights: Fight[] = recs.map((r) => {
    const me = r.players[0].account === account ? 0 : 1, them = r.players[1 - me], c = chain.find((m) => m.id === r.match_id);
    return { at: r.at, won: r.winner === null ? null : r.winner === me, mine: r.players[me].name, vs: them.name, vsAccount: them.account, stake: r.stake || '0', kind: kindOf(r.stake, c?.tournament, r.match_id), matchId: r.match_id, key: r.key };
  });
  const seen = new Set(recs.map((r) => r.match_id).filter((x) => x != null));
  for (const m of chain) {
    if (seen.has(m.id) || (m.status !== 'settled' && m.status !== 'refund') || !m.guest) continue;
    const seat = m.host === account ? 0 : 1, vsAccount = seat ? m.host : m.guest;
    fights.push({ at: m.started_ms || m.created_ms, won: m.status === 'refund' || m.winner === null ? null : m.winner === seat, mine: m.monsters[seat] ? `#${m.monsters[seat]}` : '—', vs: vsAccount, vsAccount, stake: m.stake, kind: kindOf(m.stake, m.tournament, m.id), matchId: m.id });
  }
  if (local) {
    const oldest = recs.length ? Math.min(...recs.map((r) => r.at)) : Infinity;
    for (const l of history()) if (l.at < oldest && (l.matchId == null || !seen.has(l.matchId))) {
      fights.push({ at: l.at, won: l.won, mine: monster(l.mine)?.name ?? 'Unknown', vs: l.vs, vsAccount: l.vsAccount, stake: l.stake ?? '0', kind: kindOf(l.stake, l.tournament, l.matchId), matchId: l.matchId ?? null });
    }
  }
  return { fights: fights.sort((a, b) => b.at - a.at), loading: !!account && !data };
}

export function Stats({ fights }: { fights: Fight[] }) {
  const wins = fights.filter((f) => f.won === true).length, losses = fights.filter((f) => f.won === false).length;
  const won = fights.reduce((t, f) => (f.won && f.kind !== 'Friendly' ? t + BigInt(f.stake) : t), 0n);
  const tiles: [string, string, string][] = [
    ['trophy', 'Wins', String(wins)], ['skull', 'Losses', String(losses)],
    ['icon-history', 'Win rate', wins + losses ? `${Math.round((wins / (wins + losses)) * 100)}%` : '—'],
    ['coin', `${UNIT} won`, fmt(won.toString())],
  ];
  return (
    <section className="slab stat-tiles" aria-label="Record">
      {tiles.map(([icon, label, v]) => <div key={label} className="stat-tile"><Ico n={icon} /><b>{v}</b><small>{label}</small></div>)}
    </section>
  );
}

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function History({ fights, loading }: { fights: Fight[]; loading?: boolean }) {
  const [n, setN] = useState(10);
  return (
    <section className="slab" aria-label="Match history">
      <h2 className="row-ico"><Ico n="icon-history" />Match history</h2>
      {fights.length === 0 ? <p className="sub">{loading ? 'Loading…' : 'No fights yet.'}</p> : (
        <div className="history-wrap">
          <table className="history">
            <thead><tr><th>Result</th><th>Monster</th><th>Opponent</th><th>Stake</th><th>Type</th><th>When</th><th>Replay</th></tr></thead>
            <tbody>
              {fights.slice(0, n).map((f, i) => (
                <tr key={`${f.at}-${i}`}>
                  <td><span className={`chip row-ico ${f.won ? 'gold' : ''}`}><Ico n={f.won ? 'trophy' : f.won === null ? 'icon-refresh' : 'skull'} />{f.won ? 'Won' : f.won === null ? (f.stake === '0' ? 'No result' : 'Refund') : 'Lost'}</span></td>
                  <td>{f.mine}</td>
                  <td>{f.vsAccount ? <a className="history-vs" href={`/player/${encodeURIComponent(f.vsAccount)}`}><b>{short(f.vsAccount)}</b>{f.vs !== f.vsAccount && <small>{f.vs}</small>}</a> : f.vs}</td>
                  <td>{fmt(f.stake)} {UNIT}</td>
                  <td><span className={`chip kind-${f.kind.toLowerCase()}`}>{f.kind}{f.matchId != null ? ` #${f.matchId}` : ''}</span></td>
                  <td className="muted">{when(f.at)}</td>
                  <td>{f.key && <a className="row-ico" href={`/replay/${encodeURIComponent(f.key)}`}><Ico n="icon-play" />Replay</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {fights.length > n && <button type="button" className="btn ghost" style={{ marginTop: 12 }} onClick={() => setN(n + 20)}><span>Show more ({fights.length - n})</span></button>}
    </section>
  );
}
