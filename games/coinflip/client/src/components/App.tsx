import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { NETWORK, WalletProvider, fmt, requestFaucet, toLamports, useBalance, useWallet } from '@xyz/platform';
import { BOT_MS, FEE_BPS, useApi, type Api, type Line, type Room, type Side } from '@/lib/api.ts';
import type { Reclaim } from '@/lib/stakes.ts';
import { commitOf, flip, unhex } from '@/lib/flip.ts';

const FACE = ['Heads', 'Tails'];
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''; // basePath prefix for public/ files
// Chomp portal bridge (market/public/chomp-sdk.js, loaded in layout). Absent when run standalone.
declare global { interface Window { Chomp?: { ready(): void } } }
const short = (h: string) => (h ? `${h.slice(0, 6)}…${h.slice(-4)}` : '—');
// account display (brawler lib/format.ts): implicit 64-hex -> abc...xyz, long -> 20 + …
const shortAcct = (a: string) => (/^[0-9a-f]{64}$/.test(a) ? `${a.slice(0, 3)}...${a.slice(-3)}` : a.length > 22 ? `${a.slice(0, 20)}…` : a);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)) || 'failed';
const yocto = (amt: string) => { try { return toLamports(amt.trim() || '0'); } catch { return null; } };
const payout = (stake: string) => (2n * BigInt(stake) * BigInt(10_000 - FEE_BPS)) / 10_000n;
// exact lamports -> SOL string (fmt rounds; MAX must never exceed balance)
const whole = (y: bigint) => { const s = y.toString().padStart(10, '0'); return `${s.slice(0, -9)}.${s.slice(-9)}`.replace(/\.?0+$/, '') || '0'; };
const amt = (stake: string) => (stake === '0' ? 'FREE' : fmt(stake));

function useImg(src: string) {
  const [ok, set] = useState<boolean | null>(null);
  useEffect(() => { const i = new Image(); i.onload = () => set(true); i.onerror = () => set(false); i.src = src; }, [src]);
  return ok;
}

// spin.png = 24 frames (0 heads, 12 tails). land: from face -> 3 loops -> to face (4 cases: 0->0, 0->1, 1->0, 1->1).
function Coin({ face, from = face, mode = 'still', size, onDone }: { face: Side; from?: Side; mode?: 'still' | 'spin' | 'land'; size: number; onDone?: () => void }) {
  const strip = useImg(`${BASE}/coin/spin.png`);
  const still = useImg(`${BASE}/coin/${FACE[face].toLowerCase()}.png`);
  const style = { '--s': `${size}px`, '--f': 72 + (face ^ from) * 12, '--at': `${-from * 12 * size}px` } as CSSProperties;
  if (mode === 'still' && still) return <div className="coin" role="img" aria-label={FACE[face]} style={{ ...style, backgroundImage: `url(${BASE}/coin/${FACE[face].toLowerCase()}.png)` }} />;
  if (strip) return <div className={`coin strip ${mode}`} style={style} onAnimationEnd={onDone} />;
  return <div className={`coin gold ${mode}`} style={style} onAnimationEnd={onDone}><span>{face ? '★' : 'N'}</span></div>;
}

// Remotion toss videos (games/coinflip/video): toss-<from><to>.webm, 1200x800, coin 300px wide at centre, transparent.
// Idle = first frame of toss-<side><side>; result known -> play toss-<side><result> on top, onDone at end.
// ponytail: WebM alpha = Chrome/Firefox only; add HEVC/opaque fallback if Safari matters.
const HT = 'ht';
function Toss({ from, to, size, onDone }: { from: Side; to?: Side; size: number; onDone: () => void }) {
  const [playing, setPlaying] = useState(false);
  const vid = (a: Side, b: Side, play: boolean) => (
    <video key={`${play ? "play" : "idle"}${a}${b}`} className="toss" src={`${BASE}/coin/toss-${HT[a]}${HT[b]}.webm`} muted playsInline preload="auto" autoPlay={play}
      style={{ width: size * 4, opacity: play || !playing ? 1 : 0 }} onPlaying={play ? () => setPlaying(true) : undefined} onEnded={play ? onDone : undefined} />
  );
  return <>{vid(from, from, false)}{to != null && vid(from, to, true)}</>;
}

const N = () => <span className="n" aria-hidden>N</span>; // currency glyph

// deterministic gradient + initials from account name; empty slot when no one seated
function Avatar({ name, side, bot, big }: { name?: string; side: Side; bot?: boolean; big?: boolean }) {
  let h = 0;
  for (const c of name ?? '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const ini = (name ?? '').split('.')[0].split(/[-_]/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return (
    <span className={`av ${name ? '' : 'empty'} ${big ? 'big' : ''}`} style={{ '--h': h % 360 } as CSSProperties} title={name}>
      {ini}
      {bot && !big && <i className="bot">BOT</i>}
      <span className="badge"><Coin face={side} size={big ? 30 : 18} /></span>
    </span>
  );
}

const Eye = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

function Top({ api }: { api: Api }) {
  const w = useWallet();
  const { balance } = useBalance();
  const [faucet, setFaucet] = useState('');
  const drip = () => { setFaucet('…'); requestFaucet(w.signedAccountId).then(() => setFaucet(''), (e) => setFaucet(errMsg(e))); };
  return (
    <header className="top">
      {api.demo && <span className="chip">demo</span>}
      <div className="wallet">
        <span className="wchip">
          <Coin face={0} size={26} />
          {api.me && <span className="acct">{shortAcct(api.me)}</span>}
          <span className="bal">{api.demo ? '25' : fmt(balance)} <small>SOL</small></span>
        </span>
        {/* standalone burner only; inside the portal the portal owns the wallet */}
        {w.kind === 'burner' && !api.demo && <button className="btn connect" disabled={faucet === '…'} title={faucet || undefined} onClick={drip}>Get devnet SOL</button>}
        {!w.signedAccountId
          ? <button className="btn connect" onClick={() => w.signIn()}>Connect</button>
          : w.kind !== 'bridge' && <button className="btn connect" onClick={() => w.signOut()}>Disconnect</button>}
      </div>
    </header>
  );
}

// Stakes still escrowed in matches this browser opened/joined: host can cancel an open seat; a filled seat refunds both after 2 h.
function ReclaimList({ api }: { api: Api }) {
  const [rows, setRows] = useState<Reclaim[]>([]);
  const [msg, setMsg] = useState('');
  const load = () => { api.reclaims().then(setRows, () => {}); };
  useEffect(load, [api]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows.length) return null;
  const now = Date.now() / 1000;
  const go = async (r: Reclaim) => {
    setMsg('Confirm in your wallet…');
    try { await api.reclaim(r); setMsg('Stake refunded.'); load(); } catch (e) { setMsg(`Reclaim: ${errMsg(e)}`); }
  };
  return (
    <section className="hint" aria-label="Reclaim stake">
      <b>Reclaim stake</b>
      {rows.map((r) => (
        <p key={r.id}>
          {fmt(String(r.m.stake))} SOL · {r.m.b ? 'rival joined' : 'seat open'}{' '}
          {now > r.at
            ? <button className="btn connect" onClick={() => go(r)}>Reclaim</button>
            : <small>refund opens {new Date(r.at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>}
        </p>
      ))}
      {msg && <p className="err">{msg}</p>}
    </section>
  );
}

function Lobby({ api, go }: { api: Api; go: (id: number) => void }) {
  const { balance } = useBalance();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [side, setSide] = useState<Side>(0);
  const [stake, setStake] = useState('0.01');
  const [sort, setSort] = useState('high');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    let on = true;
    const load = () => api.listRooms().then((r) => on && setRooms(r)).catch((e) => on && setErr(errMsg(e)));
    load();
    const t = setInterval(load, 3000);
    return () => { on = false; clearInterval(t); };
  }, [api]);
  const run = async (label: string, f: () => Promise<void>) => {
    setErr(''); setBusy(label);
    try { await f(); } catch (e) { setErr(`${label}: ${errMsg(e)}`); } finally { setBusy(''); }
  };
  const create = () => run('create', async () => {
    const y = yocto(stake);
    if (y == null || y.startsWith('-')) throw new Error('bad stake');
    go(await api.createRoom(side, y));
  });
  const join = (id: number) => run(`join ${id}`, async () => { await api.joinRoom(id); go(id); });
  const bal = BigInt(api.demo ? toLamports('25') : balance ?? '0');
  const scale = (f: (y: bigint) => bigint) => setStake(whole(f(BigInt(yocto(stake) ?? '0'))));
  const sorted = [...rooms].sort((a, b) => +(a.status === 'open') - +(b.status === 'open')
    || (sort === 'new' ? b.matchId - a.matchId : (sort === 'high' ? -1 : 1) * Math.sign(Number(BigInt(a.stake) - BigInt(b.stake)))));

  return (
    <main>
      <h1 className="sr">Coinflip: heads or tails, settled on-chain</h1>{/* title art lives in the bg image */}
      <section className="hero">
        <div className="ttl">
          <p className="acc">Pick a side and flip</p>
          <h1>COINFLIP</h1>
        </div>
        <div className="ctl">
          <div className="fld grow">
            <span className="lbl">Bet Amount <small>win {fmt(payout(yocto(stake) ?? '0'))}</small></span>
            <div className="bet">
              <N />
              <input inputMode="decimal" aria-label="Bet amount in SOL" value={stake} onChange={(e) => setStake(e.target.value)} />
              <button onClick={() => scale((y) => y / 2n)}>1/2</button>
              <button onClick={() => scale((y) => (y * 2n > bal ? bal : y * 2n))}>2x</button>
              <button onClick={() => setStake(whole(bal))}>MAX</button>
            </div>
          </div>
          <div className="fld">
            <span className="lbl">Choose Side</span>
            <div className="sides" role="radiogroup" aria-label="Your side">
              {([0, 1] as Side[]).map((s) => (
                <button key={s} role="radio" aria-checked={side === s} aria-label={FACE[s]} className={`side ${side === s ? 'on' : ''}`} onClick={() => setSide(s)}>
                  <Coin face={s} size={30} />
                </button>
              ))}
            </div>
          </div>
          <button className="btn primary create" disabled={!!busy} onClick={create}>{busy === 'create' ? 'Creating…' : <><b>+</b> Create Flip</>}</button>
        </div>
      </section>
      {err && <p className="err">{err}</p>}
      <ReclaimList api={api} />

      <div className="bar">
        <h2>ALL GAMES</h2>
        <label>Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="high">Highest stake</option>
            <option value="low">Lowest stake</option>
            <option value="new">Newest</option>
          </select>
        </label>
      </div>
      {sorted.length === 0 && <p className="hint">No games yet. Create one{api.demo && `; no taker in ${BOT_MS / 1000}s and the house bot steps in`}.</p>}
      <ul className="rooms">
        {sorted.map((r) => (
          <li key={r.matchId} className={r.status}>
            <div className="vs">
              <Avatar name={r.host} side={r.side} />
              <b>VS</b>
              <Avatar name={r.guest} side={(1 - r.side) as Side} bot={r.bot} />
            </div>
            <span className="amt"><N />{amt(r.stake)}</span>
            <div className="act">
              {r.status !== 'open' ? <i className="inplay">IN-PLAY</i>
                : r.host === api.me ? <span className="wait">Waiting</span>
                : <button className="btn join" disabled={!!busy} onClick={() => join(r.matchId)} aria-label={`Join as ${FACE[1 - r.side]}`}>
                    <Coin face={(1 - r.side) as Side} size={22} />{busy === `join ${r.matchId}` ? '…' : 'Join'}
                  </button>}
              <button className="btn eye" aria-label={`Watch game #${r.matchId}`} onClick={() => go(r.matchId)}><Eye /></button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Verify({ r }: { r: Room }) {
  const [ok, set] = useState<boolean | null>(null);
  useEffect(() => {
    if (!r.seed) return;
    const seed = unhex(r.seed);
    Promise.all([commitOf(seed), r.clientSeed != null ? flip(seed, r.clientSeed) : r.result])
      .then(([c, res]) => set(c === r.commit && res === r.result));
  }, [r.seed, r.commit, r.clientSeed, r.result]);
  return (
    <p className="reveal">
      seed <code>{short(r.seed ?? '')}</code> · commit <code>{short(r.commit)}</code> · verify{' '}
      <b className={ok ? 'ok' : 'bad'}>{ok == null ? '…' : ok ? '✓' : '✗'}</b>
    </p>
  );
}

function Chat({ api, id }: { api: Api; id: number }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState('');
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => api.chat(id, setLines), [api, id]);
  useEffect(() => { list.current?.scrollTo(0, list.current.scrollHeight); }, [lines]);
  const send = () => { const t = text.trim(); if (t) api.say(id, shortAcct(api.me ?? 'Guest'), t).then(() => setText(''), () => {}); }; // 429 etc: keep text
  return (
    <div className="chat">
      <ol ref={list}>
        {lines.length === 0 && <li className="hint">No messages yet.</li>}
        {lines.map((l) => <li key={l.ts}><b>{l.from}</b> {l.text}</li>)}
      </ol>
      <input value={text} maxLength={200} placeholder="Say something… (Enter)" aria-label="Chat message"
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
    </div>
  );
}

const FLIP_DELAY_MS = 3000;

function RoomView({ api, id, back }: { api: Api; id: number; back: () => void }) {
  const [r, setR] = useState<Room | null>(null);
  const [landed, setLanded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState('');
  const [fair, setFair] = useState(false);
  const [liveAt, setLiveAt] = useState(0); // both seated -> FLIP_DELAY_MS countdown, then coin moves
  useEffect(() => api.watchRoom(id, setR), [api, id]);
  useEffect(() => { if (r && r.status !== 'open' && !liveAt) setLiveAt(Date.now()); }, [r, liveAt]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && back(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [back]);

  const body = () => {
    if (!r) return <p className="hint mid">Loading room #{id}…</p>;
    const seat = r.host === api.me ? 0 : r.guest === api.me ? 1 : null;
    const sides: Side[] = [r.side, (1 - r.side) as Side];
    const count = liveAt ? Math.ceil((liveAt + FLIP_DELAY_MS - now) / 1000) : 0;
    const flipped = r.status === 'done' && r.result != null && count <= 0;
    const cancelled = r.status === 'done' && r.result == null && r.winner == null;
    const left = Math.max(0, Math.ceil((r.createdMs + BOT_MS - now) / 1000));
    const cancel = async () => { try { await api.cancelRoom(id); back(); } catch (e) { setErr(errMsg(e)); } };
    const big = innerWidth < 640 ? 120 : 200;
    const names = [r.host, r.guest];
    const winner = landed && r.winner != null ? names[r.winner] : undefined;
    return (
      <>
        <div className="duel" style={{ '--big': `${big}px` } as CSSProperties}>
          {names.map((who, i) => {
            const res = landed && r.winner != null ? (r.winner === i ? 'win' : 'lose') : '';
            return (
              <div key={i} className={`pl ${res}`} style={{ order: i * 2 }}>
                <Avatar name={who} side={sides[i]} big />
                <b className="nm">{i === 1 && r.bot && <i className="bot">BOT</i>}<span>{who ?? 'Waiting…'}</span></b>
                {seat === i && <small className="you">you · {FACE[sides[i]]}</small>}
                <span className="stk"><N />{res === 'win' ? fmt(payout(r.stake)) : res === 'lose' ? '0' : amt(r.stake)}</span>
              </div>
            );
          })}
          <div className="mid" style={{ order: 1 }}>
            <div className="halo">
              {cancelled ? <p className="count">ROOM<br />CLOSED</p>
                : count > 0 ? <p className="count">FLIPPING<br />IN {count}...</p>
                : <Toss from={r.side} to={flipped ? r.result! : undefined} size={big} onDone={() => setLanded(true)} />}
            </div>
            {r.status === 'open' && <p className="wait">{!api.demo ? 'Waiting for opponent' : left ? `Waiting for opponent · bot in ${left}s` : 'Calling the house bot…'}</p>}
            {r.status === 'open' && seat === 0 && <button className="btn sm ghost" onClick={cancel}>Cancel</button>}
            {winner && <p className="won"><i>{(r.winner === seat ? 'You' : winner).toUpperCase()}</i><b>WON</b></p>}
            {err && <p className="err">{err}</p>}
          </div>
        </div>
        <footer>
          <button className="pill" aria-expanded={fair} onClick={() => setFair(!fair)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" /></svg>
            Fairness
          </button>
          {fair && (r.seed ? <Verify r={r} /> : <p className="reveal">Seed is revealed after the flip; commit = sha256(seed), result = sha256(seed ‖ client seed)[0] &amp; 1.</p>)}
          <p className="hash">Hashed seed: <code>{r.commit || '—'}</code></p>
          <Chat api={api} id={id} />
        </footer>
      </>
    );
  };

  return (
    <div className="scrim" onClick={back}>
      <section className="modal" role="dialog" aria-modal aria-label={`Coinflip game #${id}`} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>COINFLIP <small>#{id}</small></h2>
          <button className="x" aria-label="Close" onClick={back}>×</button>
        </header>
        {body()}
      </section>
    </div>
  );
}

function Root() {
  const api = useApi();
  const [id, setId] = useState<number | null>(null);
  return (
    <div className="wrap">
      <Top api={api} />
      <Lobby api={api} go={setId} />
      {id != null && <RoomView key={id} api={api} id={id} back={() => setId(null)} />}
    </div>
  );
}

export const App = () => {
  useEffect(() => { window.Chomp?.ready(); }, []);
  return (
  <WalletProvider config={{ network: NETWORK }}>
    <Root />
  </WalletProvider>
  );
};
