import { useEffect, useState } from 'react';
import type { Monster } from '@/lib/genes.ts';
import { DEMO } from '@/lib/demo.ts';
import { peekRoom } from '@/lib/lobby.ts';
import { fmt, toYocto, useArena } from '@/lib/near.ts';
import { errText } from '@/lib/format.ts';
import { prepareFight } from '@/components/Arena.tsx';
import { Ico } from '@/components/ui.tsx';

type Arena = ReturnType<typeof useArena>;

// On-chain monsters (NftMonster has `owner`) are locked in the match; local demo-store monsters aren't.
const BUSY = 'Monster busy or unavailable. Stake refunded.';
const chainId = (m: Monster) => ('owner' in m ? m.id : undefined);

const NEED_WALLET = 'Connect your NEAR wallet to play.';

export async function joinRoom(arena: Arena, code: string, mon: Monster, say: (t: string) => void) {
  if (!arena.account) { say(NEED_WALLET); return arena.signIn(); }
  say('Looking up room…');
  const r = await peekRoom(code);
  if (!r) return say('Room not found.');
  if (r.status !== 'waiting') return say('That fight already started. You can watch it from the lobby.');
  if (r.matchId !== null) {
    if (!arena.ready) return say('Betting contract not configured on this build.');
    if (r.players[0]?.account === arena.account) return say('You are the host of that room.');
    say(r.stake === '0' ? 'Confirm the join in your wallet…' : `Joining stakes ${fmt(r.stake)} NEAR from your balance (matches the host; winner takes both). Confirm in your wallet…`);
    if ((await arena.joinMatch(r.matchId, r.stake, chainId(mon))) !== true && !DEMO) return say(BUSY); // demo returns null
  }
  prepareFight({ kind: 'join', mon, code: r.code, stage: r.stage, account: arena.account ?? '', matchId: r.matchId });
}

export function CreateRoom({ mon }: { mon: Monster }) {
  const arena = useArena();
  const [pub, setPub] = useState(true);
  const [bettable, setBettable] = useState(false);
  const [view, setView] = useState(true);
  const [stake, setStake] = useState('0');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const onChain = bettable || Number(stake) > 0;

  const create = async () => {
    if (!arena.account) { setMsg(NEED_WALLET); return arena.signIn(); }
    setBusy(true); setMsg('');
    try {
      let matchId: number | null = null;
      const stakeY = Number(stake) > 0 ? toYocto(stake) : '0';
      if (onChain) {
        if (!arena.ready) throw new Error('Betting contract not configured on this build.');
        setMsg('Confirm in your wallet…');
        matchId = await arena.createMatch(bettable, stakeY, chainId(mon));
        if (typeof matchId !== 'number' || !Number.isInteger(matchId)) { setMsg(BUSY); return; }
      }
      prepareFight({ kind: 'host', mon, stage: 'ember', opts: { pub, view: pub || view, bettable, matchId, stake: stakeY, account: arena.account ?? '' } });
    } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };

  const st = Number(stake) > 0 ? Number(stake) : 0;
  return (
    <div className="play-create">
      <div className="play-form">
        <label className="stake-field">
          <span className="row-ico"><Ico n="coin-stack" />Stake</span>
          <span className="stake-input"><input type="number" min="0" step="0.01" inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} aria-describedby="stake-help" /><b>NEAR</b></span>
        </label>
        <div className="stake-presets" role="group" aria-label="Quick stake">
          {['0', '0.5', '1', '5'].map((v) => <button key={v} type="button" className="chip" aria-pressed={stake === v} onClick={() => setStake(v)}>{v === '0' ? 'Free' : `${v} NEAR`}</button>)}
        </div>
        <p id="stake-help" className="note">{st ? `Your opponent matches ${stake} NEAR. Winner takes both, minus 0.1%.` : bettable ? 'No stake: only spectators bet.' : '0 = friendly match, nothing on-chain.'}</p>
        <fieldset className="seg" aria-label="Visibility">
          <legend>Visibility</legend>
          <label><input type="radio" name="vis" checked={pub} onChange={() => setPub(true)} /><span className="row-ico"><Ico n="icon-room-public" />Public</span><small>Listed in the lobby</small></label>
          <label><input type="radio" name="vis" checked={!pub} onChange={() => setPub(false)} /><span className="row-ico"><Ico n="icon-room-private" />Private</span><small>Join by code or link</small></label>
        </fieldset>
        {!pub && <label className="toggle row"><input type="checkbox" checked={view} onChange={(e) => setView(e.target.checked)} /><span>Let anyone watch<small>Shown in the lobby as watch-only</small></span></label>}
        <label className="toggle row"><input type="checkbox" checked={bettable} onChange={(e) => setBettable(e.target.checked)} /><span>Let spectators bet<small>Opens a prediction market on this fight, with or without a stake</small></span></label>
      </div>
      <aside className="ticket" aria-label="Match summary">
        <h3>Match ticket</h3>
        <dl>
          <dt>Fighter</dt><dd>{mon.name}</dd>
          <dt>Your stake</dt><dd>{st ? `${stake} NEAR` : 'Free'}</dd>
          <dt>Winner gets</dt><dd className="gold">{st ? `${+(st * 2 * 0.999).toFixed(4)} NEAR` : 'Bragging rights'}</dd>
          <dt>Room</dt><dd>{pub ? 'Listed in lobby' : view ? 'Code only · watchable' : 'Code only'}</dd>
          <dt>Spectator bets</dt><dd>{bettable ? 'On' : 'Off'}</dd>
        </dl>
        <button className="btn big" disabled={busy} onClick={create}><span><Ico n={!arena.account ? 'icon-wallet' : onChain ? 'coin' : 'icon-check'} />{!arena.account ? 'Connect wallet' : onChain ? 'Create and stake' : 'Create room'}</span></button>
        {onChain && <p className="note">Needs a wallet signature{st ? `; ${stake} NEAR is held until the fight ends` : ''}.</p>}
        {msg && <p className="note" role="status">{msg}</p>}
      </aside>
    </div>
  );
}

export function JoinByCode({ mon, invite }: { mon: Monster; invite?: string }) {
  const arena = useArena();
  const [code, setCode] = useState(invite?.toUpperCase() ?? '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    try { await joinRoom(arena, code, mon, setMsg); } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };
  useEffect(() => { // invite link: free rooms join straight away; staked ones need a click so the wallet popup isn't blocked
    if (!invite) return;
    peekRoom(invite).then((r) => {
      if (!r) setMsg('Invite link: room not found or already closed.');
      else if (r.matchId === null) join();
      else setMsg(`Invite to a staked room: ${fmt(r.stake)} NEAR. Press Join to stake and enter.`);
    }, () => {});
  }, []);
  return (
    <form className="code-join" onSubmit={(e) => { e.preventDefault(); if (code.length === 4) join(); }}>
      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="CODE" maxLength={4} aria-label="Room code" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
      <button className="btn" disabled={busy || code.length !== 4}><span><Ico n="icon-check" />Join</span></button>
      {msg && <p className="note" role="status">{msg}</p>}
    </form>
  );
}
