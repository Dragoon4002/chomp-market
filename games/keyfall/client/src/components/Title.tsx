import { useState } from 'react';
import { fmt, toYocto } from '@xyz/platform';
import { peek } from '@/lib/match.ts';
import { DEMO, useKeyfall } from '@/lib/chain.ts';
import type { Screen } from '@/components/App.tsx';
import { Backdrop } from '@/components/scene.tsx';
import { MuteButton } from '@/components/Match.tsx';
import { play } from '@/components/sfx.ts';

const cleanCode = (c: string) => c.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)) || 'failed';
const click = () => play('typewriter_press'); // UIButtonSound

// MainMenu scene: sky + city behind, centred column of flat mauve buttons, OpenDyslexic.
export function Title({ go }: { go: (s: Screen) => void }) {
  const k = useKeyfall();
  const [code, setCode] = useState(() => cleanCode(new URLSearchParams(location.search).get('room') ?? ''));
  const [stake, setStake] = useState('0.1');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [help, setHelp] = useState(false);
  const [confirm, setConfirm] = useState<{ code: string; matchId: number; stake: string; host: string } | null>(null);

  const nick = (k.account ?? 'Guest').replace(/\.testnet$/, '').slice(0, 24);
  const account = k.account ?? undefined;
  const run = async (label: string, f: () => Promise<void>) => {
    click(); setErr(''); setBusy(label);
    try { await f(); } catch (e) { setErr(DEMO ? `${label}: needs server (${errMsg(e)})` : `${label}: ${errMsg(e)}`); } finally { setBusy(''); }
  };

  const practice = () => { click(); go({ k: 'practice', name: nick, n: 0 }); };
  const hostFree = () => { click(); go({ k: 'online', req: { kind: 'host', name: nick, account, sign: k.sign } }); };
  const hostStaked = () => run('Host staked', async () => {
    if (!k.account) throw new Error('connect wallet first');
    const y = toYocto(stake);
    const matchId = await k.createMatch(y);
    go({ k: 'online', req: { kind: 'host', name: nick, matchId, account, sign: k.sign }, stake: y });
  });
  const join = () => run('Join', async () => {
    const c = cleanCode(code);
    if (!c) throw new Error('enter a room code');
    const p = await peek(c);
    if (p.full) throw new Error('room is full');
    if (p.matchId != null && p.stake !== '0') {
      if (!k.account) throw new Error(`staked room (${fmt(p.stake)} NEAR) — connect wallet first`);
      setConfirm({ code: c, matchId: p.matchId, stake: p.stake, host: p.host });
      return;
    }
    go({ k: 'online', req: { kind: 'join', name: nick, code: c, matchId: p.matchId ?? undefined, account, sign: k.sign } });
  });
  const confirmJoin = () => run('Join staked', async () => {
    const c = confirm!;
    await k.joinMatch(c.matchId);
    go({ k: 'online', req: { kind: 'join', name: nick, code: c.code, matchId: c.matchId, account, sign: k.sign }, stake: c.stake });
  });

  return (
    <main className="menu">
      <Backdrop />
      <header className="topbar">
        {DEMO && <span className="tag">demo</span>}
        <div className="wallet">
          {k.account ? (
            <><span className="acct" title={k.account}>{k.account}</span><span className="bal">{k.balance == null ? '—' : fmt(k.balance)} NEAR</span></>
          ) : (
            <button className="btn sm" onClick={() => { click(); void k.signIn(); }}>Connect wallet</button>
          )}
        </div>
        <MuteButton />
      </header>

      <div className="col">
        <h1 className="logo"><img src="/art/logo.png" alt="Keyfall" width={1000} height={164} /></h1>
        <p className="sub">Defend your city. Out-type your rival.</p>

        <button className="btn big" onClick={practice}>Practice</button>
        <button className="btn" onClick={hostFree} disabled={!!busy}>Host duel</button>

        <div className="field-row">
          <input className="field code-in" value={code} onChange={(e) => { setCode(cleanCode(e.target.value)); setConfirm(null); }}
            onKeyDown={(e) => e.key === 'Enter' && join()} placeholder="CODE" maxLength={8} spellCheck={false} autoCapitalize="characters" aria-label="Room code" />
          <button className="btn sm" onClick={join} disabled={!!busy}>{busy === 'Join' ? 'Checking…' : 'Join'}</button>
        </div>

        <div className="field-row">
          <input className="field stake-in" value={stake} onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" aria-label="Stake in NEAR" />
          <button className="btn sm" onClick={hostStaked} disabled={!!busy || !k.account || DEMO || !(+stake > 0)} title={k.account ? undefined : 'Connect wallet to stake'}>
            {busy === 'Host staked' ? 'Signing…' : 'Stake NEAR'}
          </button>
        </div>

        {confirm && (
          <div className="confirm" role="dialog" aria-label="Confirm stake">
            <p>Room {confirm.code} by {confirm.host} is staked at <b>{fmt(confirm.stake)} NEAR</b>. Winner takes the pot.</p>
            <div className="field-row">
              <button className="btn sm" onClick={confirmJoin} disabled={!!busy}>{busy ? 'Signing…' : 'Stake & join'}</button>
              <button className="btn sm" onClick={() => { click(); setConfirm(null); }}>Cancel</button>
            </div>
          </div>
        )}
        {err && <p className="err" role="alert">{err}</p>}

        <button className="btn wide" onClick={() => { click(); setHelp(true); }}>How to play</button>
      </div>

      {help && (
        <div className="howto" role="dialog" aria-modal="true" aria-labelledby="howto-h">
          <h2 id="howto-h">How to play</h2>
          <div className="howto-text">
            <p>Objective:<br />Defend your city from incoming threats!<br />Keep more health than your rival after 2:00.</p>
            <p>Controls:<br />Type the words that appear on enemies to destroy them<br />Complete the word before they reach your city<br />3 wrong keys jam your turret for 1 second</p>
            <p>Tips:<br />• Fast typing = higher WPM, the tiebreaker<br />• Bombs, bombers, choppers: watch for different enemy types<br />• You never see your rival. Same waves, same words.</p>
          </div>
          <button className="btn" onClick={() => { click(); setHelp(false); }} autoFocus>Close</button>
        </div>
      )}
    </main>
  );
}
