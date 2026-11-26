import { useEffect, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { CHOMP_ID, NETWORK, SYSTEM_ID, WalletProvider, balanceChanged, bs58, conn, fmt, ix, pda, readMatch, requestFaucet, toLamports, useBalance, useWallet } from '@xyz/platform';
import { BOOST_TICKS, CLOSE_AT, Sim, TICK_HZ, WIN_ROUNDS, input } from './sim.ts';
import { bot } from './bot.ts';
import { COLORS, NAMES, render } from './draw.ts';
import { ROSTER } from './riders.ts';
import { fromCode, toCode } from './code.ts';

const DEMO = new URLSearchParams(location.search).has('demo');
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''; // /g/ribbon: public/ files live under it
// Chomp portal bridge (market/public/chomp-sdk.js, loaded in layout). Absent when run standalone.
declare global { interface Window { Chomp?: { ready(): void; result(r: { winner: number | null }): void } } }
// brawler lib/format.ts: never show raw 64-hex implicit ids
const short = (a: string | null | undefined) =>
  !a ? '—' : /^[0-9a-f]{64}$/.test(a) ? `${a.slice(0, 3)}...${a.slice(-3)}` : a.length > 22 ? `${a.slice(0, 20)}…` : a;
const GAME = 'ribbon';

interface MatchView { id: number; game: string; host: string; guest: string | null; stake: string; bettable: boolean; status: string; winner: number | null }
interface Api {
  account: string | null; balance: string | null; kind: string;
  signIn: () => void; signOut: () => void; faucet: () => Promise<unknown>;
  list: () => Promise<MatchView[]>;
  get: (id: number) => Promise<MatchView | null>;
  cancel: (id: number) => Promise<unknown>;
  create: (stakeAmt: string) => Promise<number>;
  join: (id: number) => Promise<unknown>;
  sign: (id: number, nonceHex: string) => Promise<string>; // base58 sig
}
type Screen = { s: 'home'; create?: boolean } | { s: 'play'; id: number; watch: boolean; practice?: boolean };
type Line = { from: string; seat: number; text: string; ts: number };
type Result = { id: number; seat: number; winner: number | null; score: number[]; reason: string; practice?: boolean };

let demoCreated = 0; // 1 = demo race #8 open
const demoApi: Api = {
  account: 'demo-player.testnet', balance: (25n * 10n ** 9n).toString(), kind: '',
  signIn: () => {}, signOut: () => alert('Demo: no wallet'), faucet: async () => {},
  list: async () => [
    { id: 7, game: GAME, host: 'kestrel.testnet', guest: null, stake: toLamports(0.5), bettable: false, status: 'open', winner: null },
    { id: 6, game: GAME, host: 'moth.testnet', guest: null, stake: toLamports(1), bettable: false, status: 'open', winner: null },
    { id: 5, game: GAME, host: 'quill.testnet', guest: 'ferro.testnet', stake: toLamports(2), bettable: false, status: 'live', winner: null },
  ],
  get: async (id) => {
    if (id === 8) return { id, game: GAME, host: 'demo-player.testnet', guest: null, stake: toLamports(0.1), bettable: false, status: demoCreated ? 'open' : 'refund', winner: null };
    return (await demoApi.list()).find((m) => m.id === id) ?? null;
  },
  cancel: async () => { demoCreated = 0; },
  create: async () => { demoCreated = 1; return 8; }, // demo: nobody joins, the bot fills in after BOT_WAIT
  join: async () => {},
  sign: async () => '',
};

// Chain seam: chomp program escrows stakes (Match PDA id = room code), ribbon server referee settles.
const MATCH_LEN = 129; // 8 disc | game 32 | id 8 | a 32 | b 32 | stake 8 | created 8 | bump 1
const toView = (id: number, m: { a: string; b: string | null; stake: bigint }): MatchView =>
  ({ id, game: GAME, host: m.a, guest: m.b, stake: String(m.stake), bettable: false, status: m.b ? 'live' : 'open', winner: null });
function Live() {
  const w = useWallet();
  const { balance } = useBalance();
  const me = w.signedAccountId;
  const api: Api = {
    account: me || null, balance, kind: w.kind,
    signIn: () => w.signIn(), signOut: () => w.signOut(),
    faucet: () => requestFaucet(me),
    // every unsettled ribbon Match PDA (settled/cancelled ones are closed)
    list: async () => (await conn().getProgramAccounts(new PublicKey(CHOMP_ID), {
      filters: [{ dataSize: MATCH_LEN }, { memcmp: { offset: 8, bytes: pda.game(GAME) } }],
    })).map(({ account: { data: d } }) => {
      const v = new DataView(d.buffer, d.byteOffset, d.byteLength), b = new PublicKey(d.subarray(80, 112)).toBase58();
      return toView(Number(v.getBigUint64(40, true)), { a: new PublicKey(d.subarray(48, 80)).toBase58(), b: b === SYSTEM_ID ? null : b, stake: v.getBigUint64(112, true) });
    }),
    get: async (id) => { const m = await readMatch(GAME, id); return m && toView(id, m); },
    cancel: (id) => w.sendIxs([ix.cancel(me, GAME, id, me, null)]),
    create: async (stake) => {
      // ponytail: id < 24^4 so the 4-letter room code round-trips (code.ts); a clash with a live match just fails the tx, retry
      const id = Math.floor(Math.random() * 24 ** 4);
      await w.sendIxs([ix.openMatch(me, GAME, id, toLamports(stake || 0))]);
      return id;
    },
    join: (id) => w.sendIxs([ix.joinMatch(me, GAME, id)]),
    sign: async (id, nonceHex) => bs58.encode(await w.signBytes(new TextEncoder().encode(`chomp:${GAME}:${id}:${nonceHex}`))),
  };
  return <Screens api={api} />;
}

export const App = () => (DEMO ? <Screens api={demoApi} /> : <WalletProvider config={{ network: NETWORK }}><Live /></WalletProvider>);

function Screens({ api }: { api: Api }) {
  const [sc, go] = useState<Screen>({ s: 'home' });
  useEffect(() => { window.Chomp?.ready(); }, []); // portal replies with the session (wallet)
  if (sc.s === 'home') return <Home api={api} go={go} create={sc.create} />;
  return <Play key={sc.id} api={api} id={sc.id} watch={sc.watch} practice={sc.practice} go={go} />;
}

// Portal iframe is sandboxed without allow-forms: the browser drops submission before `submit` fires.
// So a click on the submit button (or Enter in an input) calls `go` directly.
function Form({ go, className, children }: { go: () => void; className?: string; children: React.ReactNode }) {
  return (
    <form className={className} onSubmit={(e) => e.preventDefault()}
      onKeyDownCapture={(e) => {
        if (e.key !== 'Enter' || (e.target as HTMLElement).tagName !== 'INPUT') return;
        e.preventDefault();
        const btn = e.currentTarget.querySelector<HTMLButtonElement>('button:not([type=button])');
        if (btn) btn.click(); else go(); // via the button so its disabled state applies
      }}
      onClick={(e) => { if ((e.target as HTMLElement).closest('button:not([type=button])')) go(); }}>
      {children}
    </form>
  );
}

// Native <dialog>: Esc, focus trap and backdrop for free.
function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="modal" onClose={close} onClick={(e) => e.target === ref.current && close()}>
      <div className="modal-head"><h2>{title}</h2><button className="x" aria-label="Close" onClick={close}>✕</button></div>
      {children}
    </dialog>
  );
}

type Pop = 'play' | 'how' | 'matches' | 'settings' | 'wait' | 'funds' | 'account' | null;
const ROOM = new URLSearchParams(location.search).get('room'); // shared room link: ?room=<4-letter code>

// Title screen: art (public/title.gif) is the background; buttons and popups on top.
function Home({ api, go, create }: { api: Api; go: (s: Screen) => void; create?: boolean }) {
  const [pop, setPop] = useState<Pop>(create ? 'play' : ROOM ? 'matches' : null);
  const [waitId, setWaitId] = useState(0);
  const [code, setCode] = useState(ROOM ?? '');
  const [rows, setRows] = useState<MatchView[] | null>(null);
  const [stake, setStake] = useState('0.1');
  const lam = (() => { try { return toLamports(stake.trim() || '0'); } catch { return null; } })(); // null = unparseable (e.g. 1e-7)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = () => { setRows(null); api.list().then(setRows).catch((e) => { setRows([]); setErr(String(e)); }); };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (f: () => Promise<void>) => {
    setBusy(true); setErr('');
    try { await f(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const me = api.account;
  const shown = rows?.filter((m) => m.status === 'open' || m.status === 'live') ?? [];
  const close = () => { setPop(null); setErr(''); };
  const wait = (id: number) => { setWaitId(id); setPop('wait'); };
  // Room code = on-chain match id. Open -> join (or wait if it's yours), live -> play/watch.
  const enter = (raw: string) => run(async () => {
    const id = fromCode(raw);
    const m = id == null ? null : await api.get(id);
    if (id == null || !m || m.game !== GAME) throw new Error(`No Ribbon Rush race with code ${raw.toUpperCase()}`);
    const mine = me != null && (me === m.host || me === m.guest);
    if (m.status === 'open') {
      if (mine) return wait(id);
      if (!me) throw new Error('Connect a wallet to join');
      await api.join(id); go({ s: 'play', id, watch: false });
    } else if (m.status === 'live') go({ s: 'play', id, watch: !mine });
    else throw new Error(`Race ${toCode(id)} is already ${m.status === 'refund' ? 'cancelled' : 'finished'}`);
  });
  return (
    <div className="title">
      <h1 className="sr">Ribbon Rush</h1>
      {/* Buttons sit in % of the art (1671x941) so they keep their place in the scene at any crop. */}
      <div className="art">
        <button className="btn-play hot-play" onClick={() => (me ? setPop('play') : api.signIn())}><span className="tri" />Play</button>
        <button className="btn-out hot-how" onClick={() => setPop('how')}><BookIcon />How to Play</button>
        <button className="btn-out hot-matches" onClick={() => { load(); setPop('matches'); }}><PadIcon />Matches
          {rows && shown.length > 0 && <span className="count">{shown.length}</span>}
        </button>
        {/* brawler Title.tsx hub-counters: balance chip -> funds, wallet chip -> account, demo exit */}
        <div className="counters">
          {me && <button className="chip ctr" onClick={() => setPop('funds')} title="Wallet balance"><img src={`${BASE}/ui/coin.webp`} alt="" /><i>Balance</i>{api.balance === null ? '…' : `${fmt(api.balance)} SOL`}</button>}
          <button className="chip ctr wallet" onClick={() => (me ? setPop('account') : api.signIn())}><img src={`${BASE}/ui/icon-wallet.webp`} alt="" />{me ? short(me) : 'Connect wallet'}</button>
          {DEMO && <a className="chip ctr demo-exit" href={location.pathname}>Demo mode · exit</a>}
        </div>
        <button className="chip gear" aria-label="Settings" onClick={() => setPop('settings')} />
      </div>

      {pop === 'play' && (
        <Modal title="New race" close={close}>
          <Form className="create" go={() => run(async () => { setWaitId(await api.create(stake)); setPop('wait'); })}>
            <label className="field">Stake
              <span className="stake"><input type="number" min="0" step="0.05" value={stake} autoFocus onChange={(e) => setStake(e.target.value)} /><b>SOL</b></span>
            </label>
            <div className="presets">{['0.1', '0.5', '1', '5'].map((v) => <button type="button" key={v} className={`preset${stake === v ? ' on' : ''}`} onClick={() => setStake(v)}>{v}</button>)}</div>
            {lam == null
              ? <p className="err">Enter a plain decimal stake (max 9 decimals).</p>
              : <p className="muted small">Winner takes the {fmt(2n * BigInt(lam))} SOL pot, minus a 2.5% fee. Balance: {fmt(api.balance)} SOL</p>}
            <button className="btn-play wide" disabled={busy || lam == null}><span className="tri" />{busy ? 'Creating…' : 'Start race'}</button>
          </Form>
          {err && <p className="err">{err}</p>}
        </Modal>
      )}

      {pop === 'how' && (
        <Modal title="How to play" close={close}>
          <Preview />
          <ol className="rules">
            <li><b>Steer</b> with arrows/WASD, or swipe on phones. Hit a wall or a ribbon and you crash.</li>
            <li>Ribbons <b>fade after 6 s</b>. After 20 s the <b>ring closes in</b>.</li>
            <li><b>One boost</b> per round (Space / tap). First to <b>{WIN_ROUNDS} rounds</b> wins.</li>
            <li>Both riders stake the same. <b>Winner takes the pot.</b></li>
          </ol>
        </Modal>
      )}

      {pop === 'matches' && (
        <Modal title="Matches" close={close}>
          <Form className="code-join" go={() => { if (code) enter(code); }}>
            <label htmlFor="room">Room code</label>
            <div className="code-row">
              <input id="room" maxLength={4} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ABCD" value={code} autoFocus={!!ROOM} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              <button className="btn-sm" disabled={busy || !code}>Enter</button>
            </div>
          </Form>
          {rows == null ? <p className="muted">Loading matches…</p> : !shown.length ? (
            <div className="empty"><p className="muted">No open races right now.</p><button className="btn-play" onClick={() => setPop(me ? 'play' : null)}>Create one</button></div>
          ) : (
            <ul className="rows">{shown.map((m) => {
              const mine = me != null && (me === m.host || me === m.guest);
              return (
                <li key={m.id}>
                  <span className="mid">{toCode(m.id)}</span>
                  <span className="who">{m.host}{m.guest && <><i> vs </i>{m.guest}</>}</span>
                  <span className="money">{fmt(m.stake)} SOL · pot {fmt(2n * BigInt(m.stake))}{m.bettable && <em className="badge">bettable</em>}</span>
                  <span className={`pill ${m.status}`}>{m.status}</span>
                  {mine ? <button className="btn-sm" onClick={() => (m.status === 'open' ? wait(m.id) : go({ s: 'play', id: m.id, watch: false }))}>{m.status === 'open' ? 'Room' : 'Play'}</button>
                    : m.status === 'open' ? <button className="btn-sm" disabled={busy || !me} onClick={() => run(async () => { await api.join(m.id); go({ s: 'play', id: m.id, watch: false }); })}>Join</button>
                    : <button className="btn-sm ghost" onClick={() => go({ s: 'play', id: m.id, watch: true })}>Watch</button>}
                </li>
              );
            })}</ul>
          )}
          {err && <p className="err">{err}</p>}
        </Modal>
      )}

      {pop === 'wait' && <Waiting api={api} id={waitId} go={go} close={() => { close(); load(); }} />}

      {pop === 'funds' && (
        <Modal title="Balance" close={close}>
          <div className="funds">
            <img src={`${BASE}/ui/coin.webp`} alt="" />
            <b>{fmt(api.balance)} <small>SOL</small></b>
            <span className="muted small">Wallet balance (devnet). Stakes are held by the match account; the referee pays the winner.</span>
          </div>
          {api.kind === 'burner' && <div className="acts"><button className="btn-play" disabled={busy} onClick={() => run(async () => { await api.faucet(); })}>Get devnet SOL</button></div>}
          {err && <p className="err">{err}</p>}
        </Modal>
      )}

      {pop === 'account' && (
        <Modal title="Account" close={close}>
          <dl className="kv">
            <dt>Account</dt><dd>{me}</dd>
            <dt>Balance</dt><dd>{fmt(api.balance)} SOL · <button className="link" onClick={() => setPop('funds')}>manage</button></dd>
            <dt>Network</dt><dd>{NETWORK}{DEMO && ' (demo)'}</dd>
          </dl>
          {api.kind !== 'bridge' && <div className="acts"><button className="btn-out" onClick={() => { api.signOut(); close(); }}>Disconnect</button></div>}
        </Modal>
      )}

      {pop === 'settings' && (
        <Modal title="Settings" close={close}>
          <dl className="kv">
            <dt>Steer</dt><dd>Arrows / WASD · swipe</dd>
            <dt>Boost</dt><dd>Space · tap</dd>
            <dt>Network</dt><dd>{NETWORK}{DEMO && ' (demo)'}</dd>
            <dt>Wallet</dt><dd>{me ? <button className="link" onClick={() => setPop('account')}>{short(me)}</button> : <button className="link" onClick={api.signIn}>Connect wallet</button>}</dd>
          </dl>
        </Modal>
      )}
    </div>
  );
}

// Waiting room: host polls chain until a guest joins (status live), then enters the race.
// No one in BOT_WAIT s -> cancel on chain (stake refunded) and race the bot as unstaked practice; bots never touch money (same rule as brawler).
// ponytail: chain poll, no server push; host only connects to the referee once the match is live.
const BOT_WAIT = 20;
function Waiting({ api, id, go, close }: { api: Api; id: number; go: (s: Screen) => void; close: () => void }) {
  const [m, setM] = useState<MatchView | null>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');
  const [left, setLeft] = useState(BOT_WAIT);
  const done = useRef(false);
  const bot = async () => {
    if (done.current) return;
    done.current = true;
    try { await api.cancel(id); go({ s: 'play', id, watch: false, practice: true }); }
    catch { // cancel refused: someone joined in the meantime -> real race
      const v = await api.get(id).catch(() => null);
      if (v?.status === 'live') go({ s: 'play', id, watch: false });
      else { done.current = false; setErr('Could not start the bot race. Try again.'); }
    }
  };
  useEffect(() => {
    const t = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (left === 0 && m?.status === 'open') bot(); }, [left, m]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const v = await api.get(id);
        if (!live) return;
        setM(v);
        if (v?.status === 'live') { live = false; done.current = true; setTimeout(() => go({ s: 'play', id, watch: false }), 900); }
        else if (v && v.status !== 'open' && !done.current) { live = false; setErr('This race was closed.'); }
      } catch (e) { setErr(String(e)); }
    };
    poll();
    const t = setInterval(poll, DEMO ? 1000 : 3000);
    return () => { live = false; clearInterval(t); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const code = toCode(id);
  const link = `${location.origin}${location.pathname}?room=${code}${DEMO ? '&demo' : ''}`;
  const copy = (what: string, v: string) => navigator.clipboard?.writeText(v).then(() => { setCopied(what); setTimeout(() => setCopied(''), 1500); });
  const joined = m?.status === 'live';
  return (
    <Modal title="Waiting room" close={close}>
      <div className="room-code">
        <span className="muted">Room code</span>
        <b>{code}</b>
        <div className="copy-row">
          <button className="btn-sm ghost" onClick={() => copy('code', code)}>{copied === 'code' ? 'Copied!' : 'Copy code'}</button>
          {location.origin !== 'null' && /* portal sandbox: opaque origin, no shareable game URL */ <button className="btn-sm ghost" onClick={() => copy('link', link)}>{copied === 'link' ? 'Copied!' : 'Copy link'}</button>}
        </div>
      </div>
      {!joined && <div className="bot-bar"><span style={{ width: `${(left / BOT_WAIT) * 100}%` }} /></div>}
      <div className="slots">
        <div className="slot" style={{ '--c': COLORS[0] } as React.CSSProperties}><span className="ava" /><b>{m?.host ?? api.account}</b><i>{NAMES[0]} · host</i></div>
        <span className="vs">VS</span>
        <div className={`slot${joined ? '' : ' empty-slot'}`} style={{ '--c': COLORS[1] } as React.CSSProperties}>
          <span className="ava" /><b>{m?.guest ?? 'Waiting for opponent'}</b><i>{joined ? `${NAMES[1]} · ready` : <>bot joins in <b className="secs">{left}s</b></>}</i>
        </div>
      </div>
      {m && <p className="muted small center">Stake {fmt(m.stake)} SOL · pot {fmt(2n * BigInt(m.stake))} SOL{m.bettable && ' · bettable'}</p>}
      {joined ? <p className="go-banner">Opponent joined — get ready!</p> : (
        <div className="acts">
          <button className="btn-out" disabled={!m || m.status !== 'open'} onClick={async () => { try { done.current = true; await api.cancel(id); close(); } catch (e) { done.current = false; setErr(String(e)); } }}>Cancel race</button>
          <button className="btn-sm" disabled={!m || m.status !== 'open'} onClick={bot}>Race the bot now</button>
        </div>
      )}
      {!joined && <p className="muted small center">Share the code or link. Bot races are practice: your race is cancelled and the stake refunded.</p>}
      {err && <p className="err">{err}</p>}
    </Modal>
  );
}

// Bot-vs-bot attract loop; restarts after each match.
function Preview() {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let sim = new Sim(), raf = 0, wait = 0;
    const t = setInterval(() => {
      if (!sim.done) sim.step([bot(sim, 0), bot(sim, 1)]);
      else if (++wait > TICK_HZ * 2) { sim = new Sim(); wait = 0; }
    }, 1000 / TICK_HZ);
    const draw = () => { if (cv.current) render(cv.current, sim, 0, -1); raf = requestAnimationFrame(draw); };
    draw();
    return () => { clearInterval(t); cancelAnimationFrame(raf); };
  }, []);
  return <canvas ref={cv} className="board preview" aria-label="bot-vs-bot preview" />;
}

// Under /g/ (portal or dev basePath) the host proxies /g/ribbon-ws -> :8788; else standalone default.
const serverUrl = () =>
  new URLSearchParams(location.search).get('server') ?? process.env.NEXT_PUBLIC_SERVER_URL ??
  (location.pathname.startsWith('/g/') ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/g/ribbon-ws` : `ws://${location.hostname}:8788`);

const SWIPE = 20; // px
const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(pointer:coarse)').matches;
const KEYS: Record<string, number> = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };

function Play({ api, id, watch, practice, go }: { api: Api; id: number; watch: boolean; practice?: boolean; go: (s: Screen) => void }) {
  const local = DEMO || !!practice; // local sim vs bot, no server
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState(local ? '' : 'connecting…');
  const [seat, setSeat] = useState(local && !watch ? 0 : -1);
  const [hud, setHud] = useState<Hud>(HUD0);
  const [res, setRes] = useState<Result | null>(null);
  const [chat, setChat] = useState<Line[]>([]);
  const say = useRef<(text: string) => void>(() => {});
  useEffect(() => {
    let sim = new Sim(), startAt = 0, mySeat = local && !watch ? 0 : -1, pend = 7, raf = 0, ws: WebSocket | null = null, timer = 0;
    const send = (m: object) => ws?.readyState === 1 && ws.send(JSON.stringify(m));
    say.current = (text) => send({ t: 'chat', text });
    const over = (winner: number | null, score: number[], reason: string) => setRes({ id, seat: mySeat, winner, score, reason, practice });

    const feed = (d: number | null, boost: boolean) => {
      if (mySeat < 0) return;
      if (local) pend = (d ?? (pend & 7)) | (boost ? 8 : pend & 8); // latest dir, boost latched until the tick
      else send({ t: 'in', v: input(d, boost) });
    };
    const onKey = (e: KeyboardEvent) => {
      const d = KEYS[e.code], boost = e.code === 'Space';
      if (mySeat < 0 || (d == null && !boost)) return;
      e.preventDefault();
      feed(d ?? null, boost);
    };
    addEventListener('keydown', onKey);
    // touch: swipe steers (dominant axis, re-anchors so one finger can chain turns), tap boosts
    const cv = canvas.current!;
    let px = 0, py = 0, down = false, swiped = false;
    const pDown = (e: PointerEvent) => { down = true; swiped = false; px = e.clientX; py = e.clientY; cv.setPointerCapture(e.pointerId); };
    const pMove = (e: PointerEvent) => {
      const dx = e.clientX - px, dy = e.clientY - py;
      if (!down || Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return;
      feed(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0), false);
      swiped = true; px = e.clientX; py = e.clientY;
    };
    const pUp = () => { if (down && !swiped) feed(null, true); down = false; };
    const pCancel = () => { down = false; };
    cv.addEventListener('pointerdown', pDown); cv.addEventListener('pointermove', pMove);
    cv.addEventListener('pointerup', pUp); cv.addEventListener('pointercancel', pCancel);

    if (local) {
      startAt = Date.now() + 3000;
      timer = window.setInterval(() => {
        if (Date.now() < startAt || sim.done) return;
        sim.step([watch ? bot(sim, 0) : pend, bot(sim, 1)]);
        pend = 7;
        if (sim.done) setTimeout(() => over(sim.winner < 0 ? null : sim.winner, sim.score, 'win'), 1200);
      }, 1000 / TICK_HZ);
    } else {
      ws = new WebSocket(serverUrl());
      ws.onclose = () => setStatus((s) => s || 'disconnected');
      ws.onerror = () => setStatus('server unreachable');
      ws.onmessage = async (e) => {
        const m = JSON.parse(e.data);
        if (m.t === 'hello') {
          if (watch) return send({ t: 'watch', matchId: id });
          if (!api.account) return setStatus('connect wallet to play');
          try { send({ t: 'auth', matchId: id, account: api.account, sig: await api.sign(id, m.nonce) }); setStatus('waiting for opponent…'); }
          catch (err) { setStatus(`sign failed: ${err instanceof Error ? err.message : err}`); }
        } else if (m.t === 'sync') {
          mySeat = m.seat; setSeat(m.seat);
          sim = new Sim();
          for (const d of m.ticks) sim.step(d);
          if (m.ticks.length) setStatus('');
        } else if (m.t === 'start') { startAt = m.at; setStatus(''); }
        else if (m.t === 'tick') { if (m.n === sim.tick) sim.step(m.d); } // ponytail: gap = drop; server re-syncs on reconnect
        else if (m.t === 'over') over(m.winner, m.kos ?? sim.score, m.reason);
        else if (m.t === 'chatlog') setChat(m.lines);
        else if (m.t === 'chat') setChat((c) => [...c.slice(-49), m]); // server keeps 50 too
        else if (m.t === 'error') setStatus(m.msg);
      };
    }

    let hudKey = '';
    const draw = () => {
      if (canvas.current) render(canvas.current, sim, startAt, mySeat);
      const h = hudOf(sim), k = JSON.stringify(h);
      if (k !== hudKey) { hudKey = k; setHud(h); } // ponytail: diffed snapshot, re-renders only when a card changes
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      removeEventListener('keydown', onKey);
      cv.removeEventListener('pointerdown', pDown); cv.removeEventListener('pointermove', pMove);
      cv.removeEventListener('pointerup', pUp); cv.removeEventListener('pointercancel', pCancel);
      cancelAnimationFrame(raf); clearInterval(timer); ws?.close(); };
  }, [id, watch]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="play duel">
      <div className="duel-bg" aria-hidden="true" />
      <header className="duel-top">
        <button className="logo" onClick={() => go({ s: 'home' })} aria-label="Ribbon Rush home"><span>Ribbon</span><span>Rush</span></button>
        <span className="chip ctr wallet">{api.account ? <>{short(api.account)} · {fmt(api.balance)} SOL</> : 'Spectator'}{DEMO && <em className="demo">demo</em>}</span>
      </header>
      <div className="frame">
        <div className="frame-top">
          <RiderChip i={0} you={seat === 0} h={hud} />
          <span className={`round-pill${hud.warn ? ' warn' : ''}`}>{hud.mid}</span>
          <RiderChip i={1} you={seat === 1} h={hud} />
        </div>
        <canvas ref={canvas} className="board" />
        <div className="frame-bot">
          {seat >= 0 ? <>You ride <b style={{ color: COLORS[seat] }}>{NAMES[seat]}</b><i className="sep" />
            {COARSE ? 'swipe to steer · tap to boost' : <><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> / WASD steer · <kbd>Space</kbd> boost (once per round)</>}</>
            : <>Spectating</>}
          {' · '}<span className="muted">{practice ? 'practice' : toCode(id)}</span>
          {status && <> · <i>{status}</i></>}
          {' · '}<button className="link" onClick={() => go({ s: 'home' })}>Leave</button>
        </div>
      </div>
      {!local && <Chat lines={chat} say={(t) => say.current(t)} />}
      {res && <Over api={api} sc={res} go={go} />}
    </section>
  );
}

// Room chat on the match socket. Native <details> = collapse for free; column-reverse keeps the newest line in view.
function Chat({ lines, say }: { lines: Line[]; say: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <details className="chat" open>
      <summary>Chat</summary>
      <ol>{[...lines].reverse().map((l, i) => (
        <li key={lines.length - i}><b style={l.seat >= 0 ? { color: COLORS[l.seat] } : undefined}>{l.seat >= 0 ? short(l.from) : 'Spectator'}</b> {l.text}</li>
      ))}</ol>
      <Form go={() => { if (text.trim()) { say(text); setText(''); } }}>
        {/* stopPropagation: steering keys (WASD / Space) listen on window */}
        <input value={text} maxLength={200} placeholder="Say something…" aria-label="Chat message" autoComplete="off"
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </Form>
    </details>
  );
}

// Frame chips: hex portrait, name in the rider's colour, boost meter, round pips (Duel reference).
type Hud = { score: number[]; boost: number[]; alive: boolean[]; mid: string; warn: boolean };
const HUD0: Hud = { score: [0, 0], boost: [1, 1], alive: [true, true], mid: 'Round 1', warn: false };
const hudOf = (s: Sim): Hud => ({
  mid: s.done ? 'Final' : `Round ${s.rounds + (s.freeze ? 0 : 1)}` + (s.roundTick < CLOSE_AT ? ` · Ring ${Math.ceil((CLOSE_AT - s.roundTick) / TICK_HZ)}s` : ` · Ring ${s.ring}`),
  warn: !s.done && s.roundTick >= CLOSE_AT - 3 * TICK_HZ,
  score: [...s.score],
  boost: s.riders.map((r) => (r.boostUsed ? Math.round((r.boostLeft / BOOST_TICKS) * 10) / 10 : 1)),
  alive: s.riders.map((r) => r.alive),
});
function RiderChip({ i, you, h }: { i: number; you: boolean; h: Hud }) {
  const r = ROSTER[i];
  return (
    <div className={`rider-chip side-${i}${h.alive[i] ? '' : ' crashed'}`} style={{ '--c': r.color } as React.CSSProperties}>
      <div className="hex">{r.art ? <img src={r.art} alt="" /> : <SnailGlyph />}</div>
      <div className="rc-body">
        <b>{r.name}{you && <small> (you)</small>}</b>
        <div className="boost" title={h.boost[i] === 1 ? 'Boost ready' : h.boost[i] > 0 ? 'Boosting' : 'Boost used'}><span style={{ width: `${h.boost[i] * 100}%` }} /></div>
      </div>
      <div className="pips" aria-label={`${h.score[i]} rounds won`}>{Array.from({ length: WIN_ROUNDS }, (_, p) => <span key={p} className={p < h.score[i] ? 'on' : ''} />)}</div>
    </div>
  );
}
// Stand-in portrait until monster art lands: a shell spiral in the rider's colour.
const SnailGlyph = () => (
  <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="34" cy="30" r="20" fill="none" stroke="currentColor" strokeWidth="5" /><path d="M34 30m-11 0a11 11 0 1 1 11 11a6 6 0 1 1-6-6" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /><path d="M6 52h44a8 8 0 0 0 8-8" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /><path d="M54 40l4-10M50 40l-1-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
);

// Result overlay on top of the duel (arena stays visible behind it).
function Over({ api, sc, go }: { api: Api; sc: Result; go: (s: Screen) => void }) {
  const won = sc.winner != null && sc.winner === sc.seat;
  const head = sc.winner == null ? (sc.reason === 'void' ? 'Match void' : 'Draw')
    : won ? 'You win!' : sc.seat >= 0 ? 'You lose' : `${NAMES[sc.winner]} wins`;
  useEffect(() => { window.Chomp?.result({ winner: sc.winner }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (sc.practice || DEMO) return; const t = setTimeout(balanceChanged, 6000); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- referee settles on-chain
  return (
    <div className="result-overlay" role="dialog" aria-modal="true" aria-label={head}>
    <section className={`over${won ? ' won' : sc.seat >= 0 && sc.winner != null ? ' lost' : ''}`} style={{ '--c': sc.winner == null ? 'var(--purple)' : COLORS[sc.winner] } as React.CSSProperties}>
      <p className="muted">{sc.practice ? "Practice vs bot · no stake" : `Race ${toCode(sc.id)}`}</p>
      <h2 className="result" style={{ color: sc.winner == null ? undefined : sc.seat >= 0 && !won ? 'var(--muted)' : COLORS[sc.winner] }}>{head}</h2>
      <p className="big"><span style={{ color: COLORS[0] }}>{sc.score[0]}</span> : <span style={{ color: COLORS[1] }}>{sc.score[1]}</span></p>
      {sc.reason !== 'win' && <p className="muted">({sc.reason})</p>}
      <div className="acts">
        <button className="ghost" onClick={() => go({ s: 'home', create: true })}>Rematch</button>
        <button className="ghost" onClick={() => go({ s: 'home' })}>Back</button>
      </div>
    </section>
    </div>
  );
}

const Svg = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const BookIcon = () => <Svg d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zm20 0h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z" />;
const PadIcon = () => <Svg d="M6 11h4M8 9v4m7-1h.01M18 10h.01M7 6h10a5 5 0 0 1 4.9 6l-.7 3.6a2.5 2.5 0 0 1-4.4 1L15 15H9l-1.8 1.6a2.5 2.5 0 0 1-4.4-1L2.1 12A5 5 0 0 1 7 6z" />;
