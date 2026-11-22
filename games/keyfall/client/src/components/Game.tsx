import { useEffect, useRef, useState } from 'react';
import { fmt } from '@xyz/platform';
import { useLocalMatch, useOnlineMatch, type Match, type OnlineReq } from '@/lib/match.ts';
import { HP } from '@/lib/game.ts';
import { MatchView } from '@/components/Match.tsx';
import { Backdrop } from '@/components/scene.tsx';
import { play } from '@/components/sfx.ts';

type Nav = { onMenu: () => void; onAgain?: () => void };
const click = () => play('typewriter_press'); // UIButtonSound

export function LocalGame({ name, ...nav }: Nav & { name: string }) {
  const [opts] = useState(() => ({ name }));
  return <Stage m={useLocalMatch(opts)} solo {...nav} />;
}

export function OnlineGame({ req, stake, ...nav }: Nav & { req: OnlineReq; stake?: string }) {
  const [r] = useState(req);
  return <Stage m={useOnlineMatch(r)} stake={stake} {...nav} />;
}

function Stage({ m, stake, solo, onMenu, onAgain }: Nav & { m: Match; stake?: string; solo?: boolean }) {
  const menu = () => { click(); m.leave(); onMenu(); };
  const v = m.view;
  if (!v) {
    return (
      <main className="menu">
        <Backdrop />
        <div className="sheet">
          {m.error ? (
            <>
              <h2 className="h-red">Link down</h2>
              <p className="err" role="alert">{m.error}</p>
              <p className="hint">Online rooms need the Keyfall server. Practice works offline.</p>
            </>
          ) : (
            <p className="loading" aria-live="polite">Connecting<span className="dots" /></p>
          )}
          <button className="btn" onClick={menu}>Main Menu</button>
        </div>
      </main>
    );
  }
  if (v.phase === 'wait') return <Waiting m={m} stake={stake} onMenu={menu} />;
  return (
    <>
      <MatchView m={m} onMenu={menu} />
      {v.phase === 'over' && <Result m={m} solo={solo} onMenu={menu} onAgain={onAgain ? () => { click(); m.leave(); onAgain(); } : undefined} />}
    </>
  );
}

function shareLink(code: string) {
  const u = new URL(location.href);
  u.search = '';
  const keep = new URLSearchParams(location.search);
  for (const k of ['demo', 'server']) if (keep.has(k)) u.searchParams.set(k, keep.get(k)!);
  u.searchParams.set('room', code);
  return u.toString();
}

function Waiting({ m, stake, onMenu }: { m: Match; stake?: string; onMenu: () => void }) {
  const [copied, setCopied] = useState(false);
  const code = m.code ?? '····';
  const link = m.code ? shareLink(m.code) : '';
  const copy = async () => {
    click();
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* insecure ctx */ }
  };
  const names = m.view!.names;
  return (
    <main className="menu">
      <Backdrop />
      <div className="sheet">
        <h2 className="h-gold">Room code</h2>
        <p className="room-code" aria-live="polite">{code}</p>
        {stake && stake !== '0' && <p className="stake-chip">Stake {fmt(stake)} NEAR · winner takes pot</p>}
        <div className="row">
          <input className="field" readOnly value={link} aria-label="Share link" onFocus={(e) => e.target.select()} />
          <button className="btn sm" onClick={copy} disabled={!link}>{copied ? 'Copied' : 'Copy link'}</button>
        </div>
        <ul className="seats">
          <li className="on">{names[0] || 'host'}</li>
          <li className={names[1] ? 'on' : ''}>{names[1] || <em>waiting for rival<span className="dots" /></em>}</li>
        </ul>
        <Chat m={m} />
        {m.error && <p className="err" role="alert">{m.error}</p>}
        <button className="btn" onClick={onMenu}>Leave room</button>
      </div>
    </main>
  );
}

const REASON = { ko: 'City destroyed', time: 'Time up', forfeit: 'Forfeit' } as const;

// GameOverPanel look: black .9, 72pt headline, 48/36pt stat lines, 200x60 buttons.
function Result({ m, solo, onMenu, onAgain }: { m: Match; solo?: boolean; onMenu: () => void; onAgain?: () => void }) {
  const v = m.view!, r = v.result;
  const me = m.seat === 1 ? 1 : 0;
  const w = r?.winner ?? null;
  const head = solo ? (r?.reason === 'ko' ? 'Game Over' : 'City Saved') : w == null ? 'Draw' : w === me ? 'Victory' : 'Defeat';
  const tone = solo ? (r?.reason === 'ko' ? 'lose' : 'win') : w == null ? 'draw' : w === me ? 'win' : 'lose';
  const seats = solo ? [0] as const : [me, (1 - me) as 0 | 1] as const;
  return (
    <div className="over" role="dialog" aria-modal="true" aria-labelledby="over-h">
      <h2 id="over-h" className={`over-h ${tone}`}>{head}</h2>
      {r && <p className="over-sub">{REASON[r.reason]}</p>}
      <div className="over-grid">
        {seats.map((s) => (
          <div key={s} className={`over-col ${!solo && w === s ? 'won' : ''}`}>
            <p className="over-name">{solo ? 'Final' : v.names[s] || `Seat ${s + 1}`}{!solo && s === me && <small> (you)</small>}</p>
            <p className="over-stat"><img src="/svg/hp.svg" alt="" />Health: {Math.max(0, r?.hp[s] ?? v.hp)}<small>/{HP}</small></p>
            <p className="over-stat"><img src="/svg/wpm.svg" alt="" />WPM: {Math.round(r?.wpm[s] ?? v.wpm)}</p>
          </div>
        ))}
      </div>
      <Chat m={m} />
      <div className="row">
        {onAgain && <button className="btn sm" onClick={onAgain} autoFocus>Try Again</button>}
        <button className="btn sm" onClick={onMenu} autoFocus={!onAgain}>Main Menu</button>
      </div>
    </div>
  );
}

// Room chat (online only: m.say). Shown in waiting room + result; hidden during count/live so typing never splits.
function Chat({ m }: { m: Match }) {
  const [t, setT] = useState('');
  const log = useRef<HTMLUListElement>(null);
  const n = m.chat?.length ?? 0;
  useEffect(() => { const u = log.current; if (u) u.scrollTop = u.scrollHeight; }, [n]);
  if (!m.say) return null;
  return (
    <form className="chat" onSubmit={(e) => { e.preventDefault(); if (t.trim()) { m.say!(t); setT(''); } }}>
      <ul ref={log} aria-live="polite" aria-label="Room chat">
        {m.chat!.map((l, i) => <li key={`${l.ts}-${i}`} className={l.seat === m.seat ? 'me' : ''}><b>{l.from}:</b> {l.text}</li>)}
      </ul>
      <input className="field" value={t} maxLength={200} placeholder="Say something..." aria-label="Chat message" autoComplete="off"
        onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
    </form>
  );
}
