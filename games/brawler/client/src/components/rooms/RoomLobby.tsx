import { useEffect, useState } from 'react';
import { archetype, type Dna, type Monster } from '@/lib/genes.ts';
import { STAGES, STAGE_IDS, type StageId } from '@/lib/stages.ts';
import { fmt, UNIT } from '@/lib/chain.ts';
import type { ChatLine, RoomState } from '@/lib/session.ts';
import { ArenaBackdrop, asset, BotTag, HubDialog, Ico, Portrait, STAGE_ICON, StageThumb, TYPE_ICON } from '@/components/ui.tsx';
import { Chat } from './Chat.tsx';

export interface RoomLobbyProps {
  rs: RoomState; seat: number; mine: Monster; options: Monster[]; locked: boolean; status: string;
  chat: ChatLine[]; leaveLabel: string;
  onPick: (m: Monster) => void; onStage: (id: StageId) => void; onStart: () => void; onChat: (t: string) => void; onLeave: () => void; onCallBot?: () => void;
}

function SeatCard({ i, who, you, connected, onChange, locked }: {
  i: number; who?: { name: string; dna: Dna; account?: string }; you: boolean; connected: boolean; onChange?: () => void; locked: boolean;
}) {
  const role = i ? 'Challenger' : 'Host';
  if (!who) return (
    <article className="seat-card empty" aria-label={`${role} seat, empty`}>
      <span className="seat-role">{role}</span>
      <div className="ghost-slot"><span>?</span></div>
      <h3>Open seat</h3>
      <p className="note">Waiting for a challenger to join…</p>
    </article>
  );
  const type = archetype(who.dna);
  return (
    <article className={`seat-card s${i}`} aria-label={`${role}: ${who.name}${you ? ' (you)' : ''}`}>
      <span className="seat-role">{role}{you && <b> · You</b>}</span>
      <Portrait dna={who.dna} size={160} flip={i === 1} />
      <h3>{who.name} <BotTag account={who.account} /></h3>
      <span className="tile-meta row-ico"><Ico n={TYPE_ICON[type]} />{type}{!connected && ' · reconnecting…'}</span>
      {onChange && (locked
        ? <span className="chip row-ico"><Ico n="icon-lock" />Locked on-chain for this match</span>
        : <button type="button" className="btn ghost" onClick={onChange}><span><Ico n="icon-monster" />Change monster</span></button>)}
    </article>
  );
}

export function RoomLobby(p: RoomLobbyProps) {
  const { rs, seat } = p;
  const [pick, setPick] = useState(false);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const host = seat === 0;
  const ready = !!rs.seats[1]?.connected;
  const [called, setCalled] = useState(false);
  const joined = !!rs.seats[1];
  useEffect(() => { if (!joined) setCalled(false); }, [joined]);
  const invite = `${location.origin}/play/join/${rs.code}${location.search}`;
  const copy = (what: 'code' | 'link') => navigator.clipboard?.writeText(what === 'code' ? rs.code : invite).then(() => { setCopied(what); setTimeout(() => setCopied(null), 1500); }, () => {});
  const who = (i: number) => (i === seat ? p.mine : rs.seats[i]); // own card updates instantly, before the server echo
  const card = (i: number) => <SeatCard i={i} who={who(i)} you={i === seat} connected={i === seat || !!rs.seats[i]?.connected} locked={p.locked} onChange={i === seat ? () => setPick(true) : undefined} />;
  return (
    <div className="room">
      <ArenaBackdrop id={rs.stage} className="room-bg" />
      <header className="room-top">
        <button type="button" className="btn ghost" onClick={p.onLeave}><span><Ico n="icon-back" />{p.leaveLabel} <kbd>Esc</kbd></span></button>
        <img className="title-img room-title" src={asset('title-ready')} alt="Room lobby" />
        <div className="room-code">
          <small>Room code</small>
          <b>{rs.code}</b>
          <div className="room-code-actions">
            <button type="button" className="chip row-ico" onClick={() => copy('code')} aria-label={`Copy room code ${rs.code}`}><Ico n="icon-copy" />{copied === 'code' ? 'Copied!' : 'Copy code'}</button>
            <button type="button" className="chip row-ico" onClick={() => copy('link')} aria-label="Copy invite link"><Ico n="icon-copy" />{copied === 'link' ? 'Copied!' : 'Copy link'}</button>
          </div>
        </div>
      </header>

      <div className="room-body">
        <section className="room-main slab" aria-label="Fighters">
          <div className="row room-chips">
            <span className="chip row-ico"><Ico n={rs.pub ? 'icon-room-public' : 'icon-room-private'} />{rs.pub ? 'Public' : 'Private'}</span>
            {rs.stake !== '0' ? <span className="chip gold row-ico"><Ico n="coin" />Stake {fmt(rs.stake)} {UNIT} each</span> : <span className="chip row-ico">Friendly · no stake</span>}
            {rs.bettable && <span className="chip gold row-ico"><Ico n="icon-bet" />Open for bets</span>}
            {rs.spectators > 0 && <span className="chip row-ico"><Ico n="icon-watch" />{rs.spectators} watching</span>}
          </div>

          <div className="room-versus">
            {card(0)}
            <span className="vs" aria-hidden="true">VS</span>
            {card(1)}
          </div>

          <div className="room-arena">
            <h3 className="row-ico"><Ico n={STAGE_ICON[rs.stage]} />Arena: {STAGES[rs.stage].name}</h3>
            {host ? (
              <div className="room-stages" role="group" aria-label="Choose arena">
                {STAGE_IDS.map((id) => (
                  <button key={id} type="button" className="hub-card" aria-pressed={id === rs.stage} onClick={() => p.onStage(id)}>
                    <StageThumb id={id} />
                    <b>{STAGES[id].name}</b>
                  </button>
                ))}
              </div>
            ) : <p className="note">{STAGES[rs.stage].blurb} The host picks the arena.</p>}
          </div>

          <div className="room-go">
            {host ? (
              <>
                <button type="button" className="btn big" disabled={!ready} onClick={p.onStart}><span><Ico n="icon-play" />Start fight</span></button>
                {!ready && p.onCallBot && rs.matchId == null && (rs.pub || rs.view) && (
                  <button type="button" className="btn ghost" disabled={called} onClick={() => { setCalled(true); p.onCallBot!(); }}><span><Ico n="icon-monster" />{called ? 'Bot on the way…' : 'Call bot'}</span></button>
                )}
                <p className="note" role="status">{p.status || (ready ? 'Both fighters ready.' : rs.pub ? 'Listed in the lobby. Share the code to invite a friend.' : 'Share the code with your opponent.')}</p>
              </>
            ) : <p className="room-wait" role="status"><Ico n="icon-timer" />{p.status || 'Waiting for host to start…'}</p>}
          </div>
        </section>
        <Chat lines={p.chat} onSend={p.onChat} />
      </div>

      {pick && (
        <HubDialog title="Choose your monster" onClose={() => setPick(false)}>
          <div className="hub-pick">
            {p.options.map((m) => (
              <button key={m.id} type="button" className="hub-card" aria-pressed={m.id === p.mine.id} onClick={() => { p.onPick(m); setPick(false); }}>
                <Portrait dna={m.dna} size={200} className="" />
                <b>{m.name}</b>
                <span className="row-ico"><Ico n={TYPE_ICON[archetype(m.dna)]} />Gen {m.gen} · {archetype(m.dna)}</span>
              </button>
            ))}
          </div>
        </HubDialog>
      )}
    </div>
  );
}
