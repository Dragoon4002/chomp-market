import { useEffect, useRef, useState } from 'react';
import { sanitize, sanitizeSkills } from '@/lib/genes.ts';
import { useArena, type MatchView } from '@/lib/chain.ts';
import { SERVER, startReplay } from '@/lib/session.ts';
import { simulate, tapeHash, type Tape } from '@/lib/tape.ts';
import { Ico } from '@/components/ui.tsx';

const HTTP = SERVER.replace(/^ws/, 'http');
const SPEEDS = [1, 2];

interface Check { winner: number | null; hash: string; chain: MatchView | null | undefined }

// /replay/<key>: re-run the server's input tape locally, prove winner + tape hash, then play it back.
export function Replay({ tapeKey }: { tapeKey: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const arena = useArena();
  const [tape, setTape] = useState<Tape | null>(null);
  const [err, setErr] = useState('');
  const [check, setCheck] = useState<Check | null>(null);
  const [run, setRun] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const ctl = useRef<ReturnType<typeof startReplay> | null>(null);

  useEffect(() => {
    fetch(`${HTTP}/tape/${encodeURIComponent(tapeKey)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? 'No recorded tape for this match.' : `Server error ${r.status}`))))
      .then(async (t: Tape) => {
        setTape(t);
        const s = simulate(t);
        const chain = t.match_id == null ? undefined : await arena.getMatch(t.match_id).catch(() => null);
        setCheck({ winner: s.winner >= 0 ? s.winner : null, hash: await tapeHash(t.stage, t.frames), chain });
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [tapeKey]);

  useEffect(() => {
    if (!tape) return;
    const g = startReplay(canvas.current!, tape.players.map((p) => ({ name: p.name, dna: sanitize(p.dna), skills: sanitizeSkills(p.skills) })), tape.stage, tape.frames);
    ctl.current = g;
    setPaused(false);
    return () => g.stop();
  }, [tape, run]);
  useEffect(() => { if (ctl.current) ctl.current.speed = paused ? 0 : speed; }, [speed, paused, run, tape]);

  const name = (i: number | null) => (i === null ? 'No winner' : tape?.players[i]?.name ?? `P${i + 1}`);
  // KO: the sim must reach the same KO. Otherwise (forfeit, void) the tape must hold no KO and the reason decides.
  const winnerOk = check && tape && (tape.reason === 'ko' ? check.winner === tape.winner : check.winner === null);
  const chainHash = check?.chain?.tape_hash;

  return (
    <div className="watch">
      <header className="watch-top">
        <a className="btn ghost watch-back" href="/account"><span><Ico n="icon-back" />Account</span></a>
        <h1 style={{ margin: 0, fontSize: 28 }}>Replay {tape ? `· ${tape.players[0]?.name} vs ${tape.players[1]?.name}` : ''}</h1>
        <div className="watch-chips">{tape && <span className="chip">{tape.match_id != null ? `Match #${tape.match_id}` : 'Friendly'}</span>}</div>
      </header>
      <main className="watch-stage">
        <div className="watch-canvas"><canvas ref={canvas} aria-label="Fight replay" /></div>
        {(err || !tape) && <div className="watch-status" role="status"><p>{err || 'Loading tape…'}</p></div>}
      </main>
      <aside className="watch-side">
        <section className="slab" aria-label="Playback">
          <h2>Playback</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="btn" disabled={!tape} onClick={() => setPaused(!paused)}><span>{paused ? 'Play' : 'Pause'}</span></button>
            {SPEEDS.map((x) => (
              <button key={x} type="button" className={`btn ${speed === x ? '' : 'ghost'}`} aria-pressed={speed === x} disabled={!tape} onClick={() => setSpeed(x)}><span>{x}x</span></button>
            ))}
            <button type="button" className="btn ghost" disabled={!tape} onClick={() => setRun(run + 1)}><span><Ico n="icon-refresh" />Restart</span></button>
          </div>
        </section>
        <section className="slab" aria-label="Fairness check">
          <h2>Fairness check</h2>
          {!check || !tape ? <p className="sub">{err ? '—' : 'Re-running the fight…'}</p> : (
            <ul className="verify">
              <Row ok={!!winnerOk} label="Winner">
                Re-run: <b>{tape.reason === 'ko' ? name(check.winner) : check.winner === null ? 'no KO in tape' : `KO by ${name(check.winner)}`}</b> · recorded: <b>{name(tape.winner)}</b> ({tape.reason})
              </Row>
              <Row ok={check.hash === tape.tape_hash} label="Tape hash vs server record">
                <code>{check.hash.slice(0, 16)}…</code> {check.hash === tape.tape_hash ? 'matches' : `≠ ${tape.tape_hash.slice(0, 16)}…`}
              </Row>
              {tape.match_id == null ? <Row ok={null} label="On-chain">Friendly match, nothing on-chain.</Row> : (
                <Row ok={chainHash ? chainHash === check.hash : null} label={`Tape hash vs on-chain match #${tape.match_id}`}>
                  {check.chain === null ? 'Could not load the match.' : !chainHash ? 'No tape hash on-chain for this match.' : chainHash === check.hash ? 'matches the hash the referee posted' : <>on-chain <code>{chainHash.slice(0, 16)}…</code> differs</>}
                  {/* TODO(solana): explorer link for the match account */}
                </Row>
              )}
              <li className="note">{tape.frames.length} frames · {tape.stage} · hash = sha256(stage ‖ 0x00 ‖ frames u32 LE)</li>
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function Row({ ok, label, children }: { ok: boolean | null; label: string; children: React.ReactNode }) {
  return (
    <li>
      <span className={`chip ${ok ? 'gold' : ok === false ? 'warn' : ''}`} aria-label={ok ? 'verified' : ok === false ? 'mismatch' : 'n/a'}>{ok ? '✓' : ok === false ? '✗' : '–'}</span>
      {' '}<b>{label}</b><br />{children}
    </li>
  );
}
