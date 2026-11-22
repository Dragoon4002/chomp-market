import { useEffect, useState } from 'react';
import { STAGE_IDS } from '@/lib/stages.ts';
import { DEMO } from '@/lib/demo.ts';
import { useLobby } from '@/lib/lobby.ts';
import { fmt, UNIT, useArena, useWallet, type MatchView } from '@/lib/chain.ts';
import { useMonsters, type NftMonster } from '@/lib/nft.ts';
import { short } from '@/lib/format.ts';
import { useAct, useLoad } from '@/hooks/async.ts';
import { useMons } from '@/hooks/useMons.ts';
import { prepareFight } from '@/components/Arena.tsx';
import { isFree } from '@/components/monsters/Badges.tsx';
import { Ico, Portrait } from '@/components/ui.tsx';
import { STATUS_ICON } from './Tournaments.tsx';

interface SlotInfo { acct: string | null; mon: string | null }
function Slot({ s, mons, win, lose, me }: { s: SlotInfo; mons: Record<string, NftMonster>; win: boolean; lose: boolean; me: string }) {
  const m = s.mon ? mons[s.mon] : undefined;
  return (
    <div className={`slot ${win ? 'win' : ''} ${lose ? 'lose' : ''}`}>
      {m ? <Portrait dna={m.dna} size={44} className="" /> : <span className="lb-ph" />}
      <span className="lb-who"><b>{m?.name ?? (s.acct ? `#${s.mon}` : 'TBD')}</b><small title={s.acct ?? ''}>{s.acct === me ? 'You' : short(s.acct)}</small></span>
      {win && <Ico n="trophy" />}
    </div>
  );
}

const roundName = (r: number, n: number) => (r === n - 1 ? 'Final' : r === n - 2 && n > 2 ? 'Semifinals' : `Round ${r + 1}`);

export function TournamentPage({ id }: { id: number }) {
  const arena = useArena(), api = useMonsters();
  const me = useWallet().signedAccountId ?? '';
  const { rooms } = useLobby();
  const [data, reload, err] = useLoad(async () => {
    const t = await arena.getTournament(id);
    if (!t) return null;
    const ids = t.rounds.flat().filter((x): x is number => x != null);
    const ms = (await Promise.all(ids.map((i) => arena.getMatch(i).catch(() => null)))).filter((x): x is MatchView => !!x);
    return { t, ms: Object.fromEntries(ms.map((m) => [m.id, m])) as Record<number, MatchView> };
  }, [id]);
  useEffect(() => { const i = setInterval(reload, 10_000); return () => clearInterval(i); }, []);
  const [mine, reloadMine] = useLoad(() => api.mine(), [me]);
  const t = data?.t;
  const mons = useMons([...(t?.entrants.map((e) => e.monster) ?? []), ...Object.values(data?.ms ?? {}).flatMap((m) => m.monsters.filter((x): x is string => !!x))]);
  const [pick, setPick] = useState('');
  const act = useAct(reload);
  const [note, setNote] = useState('');

  if (!data) return <>{err ? <p className="note">{err}</p> : <p>Loading tournament…</p>}<a className="navlink row-ico" href="/tournaments"><Ico n="icon-back" />All tournaments</a></>;
  if (!t) return <section className="slab"><h2>Tournament not found</h2><a className="btn ghost" href="/tournaments"><span><Ico n="icon-back" />Back</span></a></section>;

  const entered = t.entrants.some((e) => e.account === me);
  const free = (mine ?? []).filter((m) => isFree(m, me));
  const chosen = pick || free[0]?.id || '';
  const myLive = Object.values(data.ms).find((m) => m.status === 'live' && (m.host === me || m.guest === me));
  // Seat = on-chain order; the relay pairs both players by matchId, same arena for both (derived from the id).
  const play = (mv: MatchView) => {
    const mon = mons[mv.monsters[mv.host === me ? 0 : 1] ?? ''];
    if (!mon) return setNote('Your monster is still loading, try again.');
    prepareFight({ kind: 'match', mon, stage: STAGE_IDS[mv.id % STAGE_IDS.length], matchId: mv.id, account: me });
  };
  const watchHref = (mv: MatchView) => { const r = rooms?.find((x) => x.matchId === mv.id); return r ? `/watch/${r.code}` : DEMO ? '/watch/LIVE' : ''; };
  const myIdx = t.entrants.findIndex((e) => e.account === me);
  const canClaim = !t.claimed?.[myIdx] && ((t.status === 'done' && t.champion === me) || (t.status === 'cancelled' && entered));
  const stale = t.status === 'open' && Date.now() - t.created_ms > 24 * 3600_000;

  return (
    <>
      <a className="navlink row-ico" href="/tournaments"><Ico n="icon-back" />All tournaments</a>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><h1 className="row-ico"><Ico n="trophy" className="ico h" />Tournament #{t.id}</h1>
          <p className="sub">{t.size} players, entry {fmt(t.entry_fee)} {UNIT}, pot {fmt(t.pot)} {UNIT}{t.bettable ? ', bets open' : ''}</p></div>
        <span className={`chip row-ico ${t.status === 'live' ? 'gold' : ''}`}><Ico n={STATUS_ICON[t.status]} />{t.status}</span>
      </div>
      {t.champion && <section className="slab"><h2 className="row-ico"><Ico n="trophy" />Champion: {short(t.champion)}{t.champion === me ? ' (you)' : ''}</h2></section>}

      {myLive && (
        <section className="slab" aria-label="Your match" style={{ display: 'grid', gap: 12 }}>
          <h3 className="row-ico"><Ico n="icon-live" />Your match is live</h3>
          <button className="btn big" onClick={() => play(myLive)}><span><Ico n="icon-play" />Play my match</span></button>
        </section>
      )}

      {t.status === 'open' && !entered && (
        <section className="slab" aria-label="Enter" style={{ display: 'grid', gap: 14 }}>
          <h3 className="row-ico"><Ico n="icon-monster" />Enter a monster ({t.entrants.length} / {t.size})</h3>
          {!me ? <button className="btn" onClick={() => arena.signIn()}><span><Ico n="icon-wallet" />Connect wallet to enter</span></button>
            : mine === null ? <p className="sub">Loading your monsters…</p>
            : free.length === 0 ? <p className="sub">No free monster. Hatch, buy or rent one first (rented out, listed and busy monsters cannot enter).</p> : (
              <>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 140px), 1fr))' }}>
                  {free.map((m) => (
                    <button key={m.id} type="button" className="tile" aria-pressed={m.id === chosen} onClick={() => setPick(m.id)}>
                      <Portrait dna={m.dna} size={110} /><b>{m.name}</b><span className="tile-meta">Gen {m.gen}, {m.record.w}W {m.record.l}L</span>
                    </button>
                  ))}
                </div>
                <button className="btn big" disabled={act.busy || !chosen} onClick={() => act.run(async () => {
                  const ok = (await arena.enterTournament(t.id, chosen, t.entry_fee)) === true || DEMO; // demo returns null
                  reloadMine();
                  const now = await arena.getTournament(t.id);
                  if (!ok || !now?.entrants.some((x) => x.account === me)) throw new Error('Monster busy or unavailable. Fee refunded.');
                }, 'Entered. Good luck!')}><span><Ico n="coin" />Enter for {fmt(t.entry_fee)} {UNIT}</span></button>
              </>
            )}
        </section>
      )}
      {t.status === 'open' && entered && <p className="note">You are in. The bracket starts as soon as {t.size} players have entered.</p>}

      <section className="slab" aria-label="Bracket">
        <h2 className="row-ico"><Ico n="icon-lobby" />Bracket</h2>
        <div className="bracket">
          {t.rounds.map((ids, r) => (
            <div key={r} className="round">
              <h4>{roundName(r, t.rounds.length)}</h4>
              {ids.map((mid, i) => {
                const mv = mid != null ? data.ms[mid] : undefined;
                const e = (n: number): SlotInfo => ({ acct: t.entrants[n]?.account ?? null, mon: t.entrants[n]?.monster ?? null });
                const s: [SlotInfo, SlotInfo] = mv ? [{ acct: mv.host, mon: mv.monsters[0] }, { acct: mv.guest, mon: mv.monsters[1] }]
                  : r === 0 ? [e(2 * i), e(2 * i + 1)] : [{ acct: null, mon: null }, { acct: null, mon: null }];
                const w = mv?.status === 'settled' && mv.winner != null ? mv.winner : -1;
                const href = mv?.status === 'live' ? watchHref(mv) : '';
                return (
                  <div key={i} className="bmatch">
                    <Slot s={s[0]} mons={mons} win={w === 0} lose={w === 1} me={me} />
                    <Slot s={s[1]} mons={mons} win={w === 1} lose={w === 0} me={me} />
                    {mv && (
                      <div className="bfoot">
                        <span className="chip">{mv.status === 'live' ? 'Live' : mv.status === 'settled' ? 'Done' : mv.status}</span>
                        {mv.status === 'live' && (mv.host === me || mv.guest === me
                          ? <button className="btn" onClick={() => play(mv)}><span><Ico n="icon-play" />Play</span></button>
                          : href ? <a className="btn alt" href={href}><span><Ico n={t.bettable ? 'icon-bet' : 'icon-watch'} />{t.bettable ? 'Watch and bet' : 'Watch'}</span></a>
                            : <span className="tile-meta">Not streaming yet</span>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {(canClaim || stale) && (
        <section className="slab row" aria-label="Payouts">
          {canClaim && <button className="btn big" disabled={act.busy} onClick={() => act.run(() => arena.claimTournament(t.id), t.status === 'done' ? 'Prize added to your balance.' : 'Refund added to your balance.')}><span><Ico n="icon-claim" />{t.status === 'done' ? 'Claim prize' : 'Claim refund'}</span></button>}
          {stale && <button className="btn ghost" disabled={act.busy} onClick={() => act.run(() => arena.cancelTournament(t.id), 'Cancelled. Entrants can claim refunds.')}><span><Ico n="icon-close" />Cancel (not filled in 24 h)</span></button>}
        </section>
      )}
      {(act.msg || note || err) && <p className="note" role="status">{act.msg || note || err}</p>}
    </>
  );
}
