import { useState } from 'react';
import { STAGES } from '@/lib/stages.ts';
import { useLobby, type LobbyRoom } from '@/lib/lobby.ts';
import { fmt, UNIT, useArena } from '@/lib/chain.ts';
import type { Monster } from '@/lib/genes.ts';
import { monsters } from '@/lib/store.ts';
import { errText } from '@/lib/format.ts';
import { asset, BotTag, Ico, Portrait, STAGE_ICON } from '@/components/ui.tsx';
import { joinRoom } from './OnlineStart.tsx';

function RoomCard({ r, onJoin }: { r: LobbyRoom; onJoin: () => void }) {
  const [a, b] = r.players;
  return (
    <article className="tile room-card">
      <div className="room-vs">
        <div><Portrait dna={a.dna} size={110} /><b>{a.name} <BotTag account={a.account} /></b></div>
        <span className="vs">vs</span>
        {b ? <div><Portrait dna={b.dna} size={110} flip /><b>{b.name} <BotTag account={b.account} /></b></div> : <div className="ghost-slot small"><span>?</span><b>Open seat</b></div>}
      </div>
      <div className="row">
        {r.status === 'live' ? <img className="tag-img" src={asset('tag-live')} alt="Live" /> : <span className="chip row-ico"><Ico n="icon-timer" />Waiting</span>}
        {!r.pub && <span className="chip row-ico"><Ico n="icon-lock" />Private, watch only</span>}
        <span className="chip row-ico"><Ico n={STAGE_ICON[r.stage]} />{STAGES[r.stage].name}</span>
        {r.stake !== '0' && <span className="chip row-ico"><Ico n="coin" />Stake {fmt(r.stake)} {UNIT}</span>}
        {r.bettable && <span className="chip row-ico"><Ico n="icon-bet" />Bets open</span>}
        {r.watchers > 0 && <span className="chip row-ico"><Ico n="icon-watch" />{r.watchers} watching</span>}
      </div>
      <div className="row">
        {r.status === 'waiting' && r.pub && <button className="btn" onClick={onJoin}><span><Ico n="icon-play" />{r.stake !== '0' ? `Join · ${fmt(r.stake)} ${UNIT}` : 'Join fight'}</span></button>}
        <a className="btn alt" href={`/watch/${r.code}`}><span><Ico n={r.bettable ? 'icon-bet' : 'icon-watch'} />{r.bettable ? 'Watch and bet' : 'Watch'}</span></a>
      </div>
    </article>
  );
}

export function RoomList({ mon }: { mon: Monster }) {
  const { rooms, err } = useLobby();
  const arena = useArena();
  const [msg, setMsg] = useState('');
  const join = (code: string) => joinRoom(arena, code, mon, setMsg).catch((e) => setMsg(errText(e)));
  const live = rooms?.filter((r) => r.status === 'live') ?? [];
  const open = rooms?.filter((r) => r.status === 'waiting') ?? [];
  return (
    <>
      {msg && <p className="note" role="status">{msg}</p>}
      {err && <p className="note">{err}</p>}
      {rooms === null ? <p>Connecting to the arena…</p> : rooms.length === 0 ? (
        <section className="slab"><h3>No public rooms right now</h3><p className="sub">Create one and it shows up here for everyone.</p></section>
      ) : (
        <>
          {open.length > 0 && <><h2 className="row-ico"><Ico n="icon-room-public" />Open seats</h2><div className="grid rooms">{open.map((r) => <RoomCard key={r.code} r={r} onJoin={() => join(r.code)} />)}</div></>}
          {live.length > 0 && <><h2 className="row-ico"><Ico n="icon-live" />Live now</h2><div className="grid rooms">{live.map((r) => <RoomCard key={r.code} r={r} onJoin={() => join(r.code)} />)}</div></>}
        </>
      )}
    </>
  );
}

export function Lobby() {
  const mon = monsters()[0];
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><h1 className="row-ico"><Ico n="icon-lobby" className="ico h" />Lobby</h1><p className="sub">Join an open seat with {mon.name}, or watch any fight for free and back a side.</p></div>
        <a className="btn" href="/play"><span><Ico n="icon-room-public" />Create a room</span></a>
      </div>
      <RoomList mon={mon} />
    </>
  );
}
