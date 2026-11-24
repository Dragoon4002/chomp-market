import { useEffect, useRef, useState } from 'react';
import { balanceChanged } from '@xyz/platform';
import type { Monster } from '@/lib/genes.ts';
import { STAGES, STAGE_IDS, type StageId } from '@/lib/stages.ts';
import { getAudio, toggleMute } from '@/lib/audio.ts';
import { DEMO_ROOMS, demoChat } from '@/lib/demo.ts';
import { useArena, useSignMatch, type Attestation } from '@/lib/chain.ts';
import { errText } from '@/lib/format.ts';
import { startBotFight, startOnline, type ChatLine, type HostOpts, type Player, type RoomState } from '@/lib/session.ts';
import { monsters, recordResult } from '@/lib/store.ts';
import { usePlayable } from '@/hooks/useMons.ts';
import { asset, Ico, StageThumb } from '@/components/ui.tsx';
import { RoomLobby } from '@/components/rooms/RoomLobby.tsx';
import { go } from '@/lib/nav.ts';
import { setTouch } from '@/lib/input.ts';
import { IN } from '@/lib/sim/sim.ts';

export type FightSetup =
  | { kind: 'host'; mon: Monster; stage: StageId; opts: HostOpts }
  | { kind: 'join'; mon: Monster; code: string; stage: StageId; account: string; matchId: number | null }
  | { kind: 'match'; mon: Monster; stage: StageId; matchId: number; account: string } // on-chain (tournament) match via relay `match` msg
  | { kind: 'rejoin'; mon: Monster; stage: StageId; code: string; account: string; matchId: number | null; tournament?: boolean };

let setup: FightSetup | null = null;
// Live fight survives a reload: this tab rejoins its seat (cleared when the fight ends or we leave the page).
const LIVE = 'brawler-live-fight';
const saved = (): FightSetup | null => { try { return JSON.parse(sessionStorage.getItem(LIVE) ?? 'null'); } catch { return null; } };
const forget = () => { try { sessionStorage.removeItem(LIVE); } catch { /* storage blocked */ } };
export const prepareFight = (s: FightSetup) => { setup = s; go('/fight'); };

const asPlayer = (m: Monster): Player => ({ name: m.name, dna: m.dna, skills: m.skills }); // skills: local fights only, the server sends seats for online ones

// Demo states for /fight/<state>?demo : waiting (host lobby) | challenger (guest lobby) | fight | victory | defeat | void
const DEMO_STAGE = (new URLSearchParams(location.search).get('stage') ?? 'ember') as StageId; // ?demo&stage=grove
const demoSetup = (): FightSetup => ({ kind: 'host', mon: monsters()[0], stage: DEMO_STAGE in STAGES ? DEMO_STAGE : 'ember', opts: { pub: true, view: true, bettable: true, matchId: 99, stake: '500000000', account: '' } });
const demoRoom = (mon: Monster, seat: number): RoomState => {
  const me = { name: mon.name, dna: mon.dna, account: 'demo-player.testnet', connected: true }, rival = { ...DEMO_ROOMS[2].players[0], connected: true };
  return { code: 'DEMO', status: 'waiting', stage: 'ember', stake: '500000000', matchId: 99, bettable: true, pub: true, view: true, seats: seat ? [rival, me] : [me, rival], spectators: 3 };
};

// Re-hosting from the end screen keeps the /fight path, so bump a key to remount (the fight effect is mount-only).
export function Arena({ demo }: { demo?: string }) {
  const [n, setN] = useState(0);
  return <Fight key={n} demo={demo} again={() => setN((x) => x + 1)} />;
}

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

function Fight({ demo, again }: { demo?: string; again: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const arena = useArena();
  const sign = useSignMatch();
  const [status, setStatus] = useState('');
  const [live, setLive] = useState(false);
  const [room, setRoom] = useState<{ code: string; matchId: number | null; bettable: boolean; seat: number } | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [over, setOver] = useState<{ winner: number | null; reason: string; seat: number; settle?: Attestation } | null>(null);
  useEffect(() => { if (over) window.Chomp?.result({ winner: over.winner }); }, [over]);
  useEffect(() => { if (over && room?.matchId != null) { const t = setTimeout(balanceChanged, 6000); return () => clearTimeout(t); } }, [over]); // eslint-disable-line react-hooks/exhaustive-deps -- referee settles on-chain
  const [claimMsg, setClaimMsg] = useState('');
  const [muted, setMuted] = useState(getAudio().muted);
  const [rs, setRs] = useState<RoomState | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [closed, setClosed] = useState(''); // room closed before the fight
  const { free, local } = usePlayable();
  // rematch: asked = we pressed R, wants = opponent did, gone = opponent/socket gone (R hosts a new room)
  const [rm, setRm] = useState({ asked: false, wants: false, gone: false });
  const onR = useRef<(() => void) | null>(null);
  const ctl = useRef<ReturnType<typeof startOnline> | null>(null);
  const bots = useRef<{ stop(): void } | null>(null);
  const [s] = useState(() => (demo ? demoSetup() : setup ?? saved()));
  const [mine, setMine] = useState(s?.mon);

  useEffect(() => {
    if (!s) { go('/play'); return; }
    if (demo && s.kind === 'host') {
      const seat = demo === 'challenger' ? 1 : 0;
      setRoom({ code: 'DEMO', matchId: 99, bettable: true, seat });
      if (demo === 'waiting' || demo === 'challenger') {
        const r = demoRoom(s.mon, seat);
        setRs(r); setChat(demoChat(r.seats[0].name, r.seats[1].name));
        return () => bots.current?.stop();
      }
      setLive(true);
      const w = demo === 'void' ? null : demo === 'victory' ? 0 : 1;
      if (demo !== 'fight') setOver({ winner: w, reason: demo === 'void' ? 'both left' : 'ko', seat: 0, settle: { match_id: 99, winner: w, kos: [3, 1], tape_hash: '0'.repeat(64), signature: '' } });
      const players = [asPlayer(s.mon), asPlayer(monsters()[1] ?? s.mon)];
      setNames(players.map((p) => p.name));
      const g = startBotFight(canvas.current!, players, s.stage);
      return () => g.stop();
    }
    let seat = -1, code = '';
    const account = s.kind === 'host' ? s.opts.account : s.account;
    const tournament = s.kind === 'match' || (s.kind === 'rejoin' && !!s.tournament);
    const back = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      if (e.code === 'Escape') go('/lobby');
      if (e.code === 'KeyM') setMuted(toggleMute().muted);
      if (e.code === 'KeyR') onR.current?.();
    };
    addEventListener('keydown', back);
    const hooks = {
      status: setStatus,
      room: (r: { code: string; matchId: number | null; bettable: boolean; seat: number }) => { seat = r.seat; code = r.code; setRoom(r); },
      started: (players: Player[]) => {
        setNames(players.map((p) => p.name)); setLive(true); setOver(null); setRm((x) => ({ ...x, asked: false, wants: false }));
        const live: FightSetup = { kind: 'rejoin', mon: monRef.current, stage: s.stage, code, account, matchId: rsRef.current?.matchId ?? (s.kind === 'host' ? s.opts.matchId : s.matchId), tournament };
        try { sessionStorage.setItem(LIVE, JSON.stringify(live)); } catch { /* storage blocked: no reload rejoin */ }
      },
      rematch: () => setRm((x) => ({ ...x, wants: true })),
      left: () => setRm((x) => ({ ...x, gone: true })),
      gone: setClosed,
      roomstate: setRs,
      chat: (l: ChatLine) => setChat((c) => [...c, l].slice(-200)),
      chatlog: setChat,
      over: (winner: number | null, reason: string, settle?: Attestation) => { forget(); setTimeout(() => setOver({ winner, reason, seat, settle }), reason === 'ko' ? 1000 : 0); },
      result: (winner: number, kos: number[], st: number) => {
        const r = rsRef.current, them = r?.seats[1 - st];
        recordResult(monRef.current.id, winner === st, kos[st], them?.name || 'Online rival', 'online',
          { vsAccount: them?.account || undefined, stake: r?.stake ?? '0', matchId: r?.matchId ?? (s.kind === 'match' ? s.matchId : null), tournament });
      },
    };
    const game = startOnline(canvas.current!, s.kind === 'host' ? { t: 'host', ...s.opts } : s.kind === 'match' ? { t: 'match', matchId: s.matchId, account: s.account } : { t: s.kind, code: s.code, account: s.account, matchId: s.matchId }, asPlayer(s.mon), s.stage, hooks, sign);
    ctl.current = game;
    return () => { removeEventListener('keydown', back); game.stop(); forget(); };
  }, []);

  const monRef = useRef(s?.mon as Monster);
  const rsRef = useRef(rs);
  rsRef.current = rs;
  monRef.current = mine ?? monRef.current;
  useEffect(() => { if (closed) { const t = setTimeout(() => { go('/lobby'); }, 4000); return () => clearTimeout(t); } }, [closed]);

  const leaveTried = useRef(false); // 2nd leave after a failed refund just leaves (Balance > Reclaim stake has it)
  const cancel = async () => {
    if (!leaveTried.current && room?.matchId != null && s?.kind === 'host' && !rs?.seats[1]) {
      try { await arena.cancelMatch(room.matchId); }
      catch (e) {
        leaveTried.current = true;
        return setStatus(`Refund failed: ${errText(e)}. If a rival already staked on-chain they are still connecting: wait for them, or leave again and reclaim both stakes in Balance after 2 h.`);
      }
    }
    go('/lobby');
  };
  // winner (or anyone on a void) submits the referee's signed result: one tx pays the seats, then back to the lobby
  const settle = async () => {
    const id = room?.matchId, a = over?.settle;
    if (id == null || !a) return;
    const done = async () => { const m = await arena.getMatch(id).catch(() => null); return m?.status === 'settled' || m?.status === 'refund'; };
    setClaimMsg('Confirm in your wallet…');
    if (await done()) return go('/lobby');
    try { await arena.settle(a); go('/lobby'); }
    catch (e) { if (await done()) return go('/lobby'); setClaimMsg(errText(e)); }
  };

  // Room lobby actions. Demo has no server, so it applies them locally (and Start runs a bot fight).
  const patch = (p: Partial<RoomState>) => setRs((r) => (r ? { ...r, ...p } : r));
  const pickMon = (m: Monster) => {
    setMine(m); ctl.current?.set({ name: m.name, dna: m.dna });
    if (room) setRs((r) => r && { ...r, seats: r.seats.map((x, i) => (i === room.seat ? { ...x, name: m.name, dna: m.dna } : x)) });
  };
  const pickStage = (stage: StageId) => { ctl.current?.set({ stage }); patch({ stage }); };
  const say = (text: string) => {
    if (ctl.current) ctl.current.chat(text);
    else setChat((c) => [...c, { from: mine?.name ?? 'You', seat: room?.seat ?? 0, text, ts: Date.now() }]);
  };
  const start = () => {
    if (ctl.current) return ctl.current.begin();
    if (!rs) return;
    setLive(true);
    bots.current = startBotFight(canvas.current!, rs.seats.map((x) => ({ name: x.name, dna: x.dna, account: x.account })), rs.stage);
  };
  const hostOpts = s?.kind === 'host' ? s.opts : null;
  const lobbyRs: RoomState | null = rs ?? (room && s ? { // until the server's first roomstate
    code: room.code, status: 'waiting', stage: s.stage, stake: hostOpts?.stake ?? '0', matchId: room.matchId, bettable: room.bettable,
    pub: !!hostOpts?.pub, view: true, seats: room.seat ? [] : [{ name: s.mon.name, dna: s.mon.dna, account: '', connected: true }], spectators: 0,
  } : null);
  // Staked rooms lock the on-chain monster from create/join; only casual browser monsters can swap in.
  const locked = room?.matchId != null && !!s && 'owner' in s.mon;
  const options = room?.matchId != null ? local : [...free, ...local];
  const canRematch = !!over && !!s && room?.matchId == null; // staked/on-chain: stakes need a new on-chain match
  const gone = rm.gone || over?.reason === 'opponent left' || over?.reason === 'no-show' || over?.reason === 'forfeit';
  const rematch = () => {
    if (!canRematch || !s) return;
    if (gone) {
      prepareFight(s.kind === 'host' ? s : { kind: 'host', mon: s.mon, stage: s.stage, opts: { pub: true, view: true, bettable: false, matchId: null, stake: '0', account: s.account } });
      return again();
    }
    if (rm.asked) return;
    ctl.current?.rematch();
    setRm((x) => ({ ...x, asked: true }));
  };
  onR.current = rematch;
  return (
    <div className="arena">
      <canvas ref={canvas} aria-label="Fight arena" />
      {live && !over && <TouchPad />}
      <button type="button" className="chip sound-toggle row-ico" aria-pressed={muted} onClick={() => setMuted(toggleMute().muted)}>
        <Ico n={muted ? 'icon-sound-off' : 'icon-sound-on'} />{muted ? 'Sound off (M)' : 'Sound on (M)'}
      </button>

      {!live && !over && s && mine && (closed ? (
        <div className="arena-overlay">
          <div className="slab" role="alert"><p>{closed} Back to the lobby…</p><a className="btn" href="/lobby"><span><Ico n="icon-lobby" />Lobby now</span></a></div>
        </div>
      ) : room && lobbyRs ? (
        <RoomLobby rs={lobbyRs} seat={room.seat} mine={mine} options={options} locked={locked} status={status} chat={chat}
          leaveLabel={room.matchId != null && s.kind === 'host' && !lobbyRs.seats[1] ? 'Cancel and refund' : 'Leave'}
          onPick={pickMon} onStage={pickStage} onStart={start} onChat={say} onLeave={cancel} onCallBot={() => ctl.current?.callBot()} />
      ) : (
        <div className="arena-overlay">
          <div className="slab" role="status"><p>{status || 'Loading…'}</p><button className="btn ghost" onClick={cancel}><span><Ico n="icon-back" />Back</span></button></div>
        </div>
      ))}

      {over && (
        <div className="arena-overlay">
          <div className="slab waiting" role="status">
            <img className="title-img" src={asset(over.winner === null ? 'title-void' : over.winner === over.seat ? 'title-victory' : 'title-defeat')} alt={over.winner === null ? 'Match void' : over.winner === over.seat ? 'Victory' : 'Defeat'} />
            <p>{over.winner === null ? `No result (${over.reason}). Stakes and bets are refunded.` : <><b>{names[over.winner] ?? 'Winner'}</b> wins {over.reason === 'ko' ? 'by three knockouts' : `by ${over.reason}`}.</>}</p>
            {room?.matchId != null && (over.winner === over.seat || over.winner === null) && (
              <>
                {over.settle
                  ? <button className="btn big" onClick={settle}><span><Ico n="icon-claim" />{over.winner === null ? 'Settle and return to lobby' : 'Claim and return to lobby'}</span></button>
                  : <p className="note">{over.winner === null ? 'The referee refunds both stakes on-chain.' : 'The referee pays the pot on-chain in a few seconds.'}</p>}
                {claimMsg && <p className="note" role="status">{claimMsg}</p>}
              </>
            )}
            {canRematch && !gone && rm.wants && !rm.asked && <p className="note">Opponent wants a rematch — press R</p>}
            <div className="end-actions">
              {canRematch && (
                <button className="btn" disabled={rm.asked && !gone} onClick={rematch}>
                  <span><Ico n="icon-refresh" />{gone ? 'New room (R)' : rm.asked ? 'Waiting for opponent… (R)' : 'Rematch (R)'}</span>
                </button>
              )}
              <a className="btn alt" href="/lobby"><span><Ico n="icon-lobby" />Back to lobby (Esc)</span></a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Practice: you (P1) vs the scripted bot, local only. No wallet, no server.
let practiceMon: Monster | null = null;
export const practice = (m: Monster) => { practiceMon = m; go('/practice'); };
const pick = <T,>(l: T[]) => l[Math.floor(Math.random() * l.length)];

export function Practice() {
  const [n, setN] = useState(0);
  const [stage, setStage] = useState<StageId | null>(null);
  if (!stage) return <PracticePick onPick={setStage} />;
  return <PracticeFight key={n} stage={stage} again={() => setN((x) => x + 1)} change={() => setStage(null)} />;
}

function PracticePick({ onPick }: { onPick: (id: StageId) => void }) {
  return (
    <div className="arena">
      <div className="arena-overlay">
        <div className="slab practice-pick" role="dialog" aria-label="Pick an arena">
          <h2>Pick an arena</h2>
          <div className="room-stages" role="group" aria-label="Choose arena">
            {STAGE_IDS.map((id) => (
              <button key={id} type="button" className="hub-card" onClick={() => onPick(id)}>
                <StageThumb id={id} />
                <b>{STAGES[id].name}</b>
              </button>
            ))}
          </div>
          <div className="end-actions">
            <button className="btn" onClick={() => onPick(pick(STAGE_IDS))}><span><Ico n="icon-refresh" />Random</span></button>
            <a className="btn alt" href="/"><span><Ico n="icon-back" />Back</span></a>
          </div>
        </div>
      </div>
    </div>
  );
}

function PracticeFight({ stage, again, change }: { stage: StageId; again: () => void; change: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [over, setOver] = useState<number | null>(null);
  useEffect(() => { if (over !== null) window.Chomp?.result({ winner: over }); }, [over]);
  const [names, setNames] = useState<string[]>([]);
  const [muted, setMuted] = useState(getAudio().muted);
  const account = useArena().account ?? '';
  useEffect(() => {
    const list = monsters(), me = practiceMon ?? list[0];
    const players = [{ ...asPlayer(me), account }, { ...asPlayer(pick(list.filter((m) => m.id !== me.id)) ?? me), account: 'bot-0.brawler' }];
    setNames(players.map((p) => p.name));
    const g = startBotFight(canvas.current!, players, stage, { result: (w) => setTimeout(() => setOver(w), 1000) }, true);
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Escape') go('/');
      if (e.code === 'KeyM') setMuted(toggleMute().muted);
      if (e.code === 'KeyR') again();
    };
    addEventListener('keydown', key);
    return () => { removeEventListener('keydown', key); g.stop(); };
  }, []);
  return (
    <div className="arena">
      <canvas ref={canvas} aria-label="Practice arena" />
      {over === null && <TouchPad />}
      <button type="button" className="chip sound-toggle row-ico" aria-pressed={muted} onClick={() => setMuted(toggleMute().muted)}>
        <Ico n={muted ? 'icon-sound-off' : 'icon-sound-on'} />{muted ? 'Sound off (M)' : 'Sound on (M)'}
      </button>
      <span className="chip practice-hint">Practice: nothing on-chain</span>
      {over !== null && (
        <div className="arena-overlay">
          <div className="slab waiting" role="status">
            <img className="title-img" src={asset(over === 0 ? 'title-victory' : 'title-defeat')} alt={over === 0 ? 'Victory' : 'Defeat'} />
            <p><b>{names[over]}</b> wins by three knockouts.</p>
            <div className="end-actions">
              <button className="btn" onClick={again}><span><Ico n="icon-refresh" />Play again (R)</span></button>
              <button className="btn alt" onClick={change}><span><Ico n="icon-refresh" />Change arena</span></button>
              <a className="btn alt" href="/"><span><Ico n="icon-back" />Back (Esc)</span></a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Virtual pad for touch screens: stick (move, up = jump) + action buttons, each finger tracked by pointerId.
const coarse = () => matchMedia('(pointer: coarse)').matches;
const ACTIONS = [['Light', IN.LIGHT], ['Heavy', IN.HEAVY], ['Block', IN.BLOCK], ['Jump', IN.JUMP], ['Dodge', IN.DODGE]] as const;
function TouchPad() {
  const [on, setOn] = useState(coarse);
  useEffect(() => {
    if (on) return;
    const t = () => setOn(true);
    addEventListener('touchstart', t, { once: true });
    return () => removeEventListener('touchstart', t);
  }, [on]);
  if (!on) return null;
  const off = (e: React.PointerEvent) => setTouch(e.pointerId, 0);
  const stick = (e: React.PointerEvent<HTMLElement>) => {
    if (e.type === 'pointermove' && !e.buttons) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
    setTouch(e.pointerId, (dx < -0.15 ? IN.LEFT : dx > 0.15 ? IN.RIGHT : 0) | (dy < -0.25 ? IN.UP | IN.JUMP : dy > 0.25 ? IN.DOWN : 0));
  };
  return (
    <div className="touchpad" onContextMenu={(e) => e.preventDefault()}>
      <div className="touch-stick" aria-hidden onPointerDown={stick} onPointerMove={stick} onPointerUp={off} onPointerCancel={off} />
      <div className="touch-btns">
        {ACTIONS.map(([label, bit]) => (
          <button key={label} type="button" className="touch-btn" onPointerDown={(e) => setTouch(e.pointerId, bit)} onPointerUp={off} onPointerCancel={off}>{label}</button>
        ))}
      </div>
    </div>
  );
}
