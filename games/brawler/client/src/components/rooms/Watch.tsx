import { useEffect, useRef, useState } from 'react';
import { lookOf } from '@/lib/genes.ts';
import { DEMO, DEMO_ROOMS, demoChat, demoSettle } from '@/lib/demo.ts';
import { fmt, UNIT as COIN, toYocto, useArena, type Book, type FillView, type Limits, type MatchView, type OrderView, type PositionView } from '@/lib/chain.ts';
import { UNIT, cost, sweep } from '@/lib/market.ts';
import { startBotFight, startSpectate, type ChatLine, type RoomState } from '@/lib/session.ts';
import { errText, signed } from '@/lib/format.ts';
import { asset, BotTag, Ico, Portrait } from '@/components/ui.tsx';
import { Chat } from './Chat.tsx';
import { PriceChart } from './PriceChart.tsx';

type Player = { name: string; account: string; dna: any };

const col = (p?: Player) => (p?.dna ? lookOf(p.dna).body : 'var(--ember)'); // fighter's HUD colour
const tint = (p?: Player) => ({ '--c': col(p) } as React.CSSProperties);
const pc = (bps: number) => `${+(bps / 100).toFixed(2)}%`;
const win = (qty: number) => BigInt(qty) * UNIT; // what `qty` shares pay if their fighter wins

export function Watch({ code }: { code: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const arena = useArena();
  const [spec, setSpec] = useState<any>(null);
  const [rs, setRs] = useState<RoomState | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const send = useRef<(t: string) => void>(() => {});
  const [status, setStatus] = useState('Connecting…');
  const [over, setOver] = useState<{ winner: number | null; reason: string } | null>(null);
  const [match, setMatch] = useState<MatchView | null>(null);
  const [pos, setPos] = useState<PositionView | null>(null);
  const [due, setDue] = useState(0n);
  const [hist, setHist] = useState<[number, number][]>([]);
  const [feed, setFeed] = useState<FillView[]>([]);
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [book, setBook] = useState<Book>([[], []]);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [tick, setTick] = useState(0); // bump to re-poll right away (after a trade)
  const [msg, setMsg] = useState('');
  const [amount, setAmount] = useState('0.1');
  const [adv, setAdv] = useState(false);
  const [side, setSide] = useState(0);
  const [pricePct, setPricePct] = useState('50');
  const [pops, setPops] = useState<FillView[]>([]); // new fills, shown over the fight for a few seconds
  const seen = useRef<number | null>(null); // newest fill id already shown (null until first poll, so old fills don't flood in)

  useEffect(() => {
    const hooks = {
      status: setStatus, info: setSpec, started: () => { setStatus(''); setOver(null); }, over: (w: number | null, r: string) => setOver({ winner: w, reason: r }),
      roomstate: setRs, chatlog: setChat, chat: (l: ChatLine) => setChat((c) => [...c, l].slice(-200)),
    };
    const demoRoom = DEMO && (DEMO_ROOMS.find((r) => r.code === code) ?? DEMO_ROOMS[0]);
    if (demoRoom) {
      const players = [...demoRoom.players, DEMO_ROOMS[0].players[1]].slice(0, 2).map((p) => ({ ...p }));
      setSpec({ ...demoRoom, players, status: 'live' }); setChat(demoChat(players[0].name, players[1].name));
      send.current = (text) => setChat((c) => [...c, { from: arena.account ?? 'Spectator', seat: -1, text, ts: Date.now() }]);
      const g = startBotFight(canvas.current!, players, demoRoom.stage, { ...hooks, result: (w: number) => hooks.over(w, 'ko') });
      return () => g.stop();
    }
    const g = startSpectate(canvas.current!, code, hooks, arena.account);
    send.current = g.chat;
    return () => g.stop();
  }, [code]);

  const matchId: number | null = spec?.matchId ?? rs?.matchId ?? null;
  useEffect(() => { if (DEMO && over) demoSettle(matchId, over.winner); }, [over]); // demo: the fight result settles the in-browser book
  useEffect(() => {
    if (matchId === null || !arena.ready) return;
    let dead = false;
    const me = arena.account;
    const poll = async () => {
      try {
        const [m, h, f, b, p, o, d] = await Promise.all([arena.getMatch(matchId), arena.getPrices(matchId), arena.getFills(matchId), arena.getBook(matchId),
          me ? arena.getPosition(matchId, me) : null, me ? arena.getOrders(matchId, me) : [], me ? arena.claimable(matchId, me) : '0']);
        if (!dead) { setMatch(m); setHist(h); setFeed(f); setBook(b); setPos(p); setOrders(o); setDue(BigInt(d)); }
      } catch { /* RPC hiccup; next poll */ }
    };
    poll();
    const t = setInterval(poll, 2500);
    return () => { dead = true; clearInterval(t); };
  }, [matchId, arena.account, tick, over]);
  useEffect(() => { if (matchId !== null && arena.ready) arena.config().then(setLimits, () => {}); }, [matchId]);
  useEffect(() => {
    if (!feed.length) return;
    const last = seen.current;
    seen.current = Math.max(last ?? -1, ...feed.map((f) => f.id));
    if (last === null) return;
    const fresh = feed.filter((f) => f.id > last).reverse(); // oldest first
    if (!fresh.length) return;
    setPops((p) => [...p, ...fresh].slice(-6));
    fresh.forEach((f) => setTimeout(() => setPops((p) => p.filter((x) => x.id !== f.id)), 4000));
  }, [feed]);

  // roomstate may know the challenger before the spec does (waiting rooms)
  const players: Player[] = (rs?.seats.length ?? 0) > (spec?.players?.length ?? 0) ? rs!.seats : spec?.players ?? [];
  const name = (i?: number) => (i === undefined ? '' : players[i]?.name ?? '?');
  const mine = !!arena.account && players.some((p) => p.account === arena.account);
  const bettable = !!(spec?.bettable ?? rs?.bettable);
  const open = match?.status === 'live' || match?.status === 'open';
  const canTrade = bettable && open && !over && !mine;
  const ask = (s: number) => (book[1 - s][0] ? 10_000 - book[1 - s][0][0] : null); // cheapest price to back fighter s now
  const bid0 = book[0][0]?.[0], ask0 = ask(0);
  const bps = match?.fills ? match.price_bps : bid0 && ask0 ? Math.round((bid0 + ask0) / 2) : 5000;
  const series = hist.length ? hist.map(([, b]) => b / 1e4) : [bps / 1e4];
  if (open) series.push(bps / 1e4); // extend the line to now
  const settledW = match?.status === 'settled' ? match.winner : null;
  const paid = pos ? BigInt(pos.paid[0]) + BigInt(pos.paid[1]) : 0n;

  const yocto = (a: string) => { try { const y = BigInt(toYocto(a.trim())); return y > 0n ? y : null; } catch { return null; } };
  const budget = yocto(amount);
  const quick = [0, 1].map((s) => (budget ? sweep(book, s, budget) : null));
  const advPrice = Math.round(Number(pricePct) * 100), advQty = budget && advPrice >= 1 && advPrice <= 9999 ? Number(budget / cost(advPrice, 1)) : 0;

  // mirrors contract `place_order` checks so the wallet opens only for a landable order
  const place = async (s: number, price: number, qty: number) => {
    if (!arena.account) { setMsg('Connect your wallet, then trade.'); return arena.signIn(); }
    if (!budget) return setMsg(`Enter an amount in ${COIN}, like 0.5.`);
    if (!(price >= 1 && price <= 9999)) return setMsg('Price must be between 0.01% and 99.99%.');
    if (qty < 1) return setMsg(`Too little for one share at ${pc(price)} (${fmt(cost(price, 1))} ${COIN}).`);
    if (limits && cost(price, qty) > BigInt(limits.max_bet)) return setMsg(`Maximum order is ${fmt(limits.max_bet)} ${COIN}.`);
    try {
      setMsg(`Confirm in your wallet: ${qty} ${name(s)} shares at up to ${pc(price)}.`);
      const r = await arena.placeOrder(matchId!, s, price, qty);
      setMsg(r.filled === qty ? `Bought ${qty} ${name(s)} shares.` : `Bought ${r.filled}; ${qty - r.filled} waiting at ${pc(price)} for a seller.`);
      setTick((t) => t + 1);
    } catch (e) { setMsg(errText(e)); }
  };
  const act = async (f: () => Promise<unknown>, ok: string) => {
    try { setMsg('Confirm in your wallet…'); await f(); setMsg(ok); setTick((t) => t + 1); } catch (e) { setMsg(errText(e)); }
  };

  const market = bettable && matchId !== null;
  const note = !spec && !rs ? null : !market ? 'Spectator bets are off in this room. Chat only.'
    : mine ? 'You are fighting in this match, so its market is hidden from you.' : !arena.ready ? 'Betting contract not configured on this build.' : null;
  const who = (a: string) => (a === arena.account ? 'You' : a.replace(/\.testnet$/, ''));
  const pct = [Math.round(bps / 100), 100 - Math.round(bps / 100)];
  const lead = pct[0] >= pct[1] ? 0 : 1;
  const colors = { '--c0': col(players[0]), '--c1': col(players[1]) } as React.CSSProperties;

  return (
    <div className="watch" style={colors}>
      <header className="watch-top">
        <a className="btn ghost watch-back" href="/lobby"><span><Ico n="icon-back" />Lobby</span></a>
        <div className="wwin" aria-label="Who will win?">
          <h1>{market && players[lead] ? `${name(lead)} wins @ ${pct[lead]}%` : 'Who will win?'}</h1>
          <div className="wwin-row">
            {[0, 1].map((i) => (
              <div key={i} className={`wwin-side s${i}`} style={tint(players[i])}>
                <span className="wwin-pic">{players[i]?.dna && <Portrait dna={players[i].dna} size={64} flip={i === 1} />}</span>
                <b>{players[i]?.name ?? 'Open seat'} <BotTag account={(players[i] as { account?: string } | undefined)?.account} /></b>
                {market && <span className="wwin-pct">{pct[i]}%</span>}
              </div>
            ))}
            {market
              ? <div className="odds-bar" role="img" aria-label={`Market odds: ${name(0)} ${pct[0]}%, ${name(1)} ${pct[1]}%`}><span style={{ width: `${pct[0]}%` }} /></div>
              : <span className="wwin-vs" aria-hidden="true">VS</span>}
          </div>
        </div>
        <div className="watch-chips">
          {spec?.status === 'live' && !over && <img className="tag-img" src={asset('tag-live')} alt="Live" />}
          {(rs?.spectators ?? spec?.watchers ?? 0) > 0 && <span className="chip row-ico"><Ico n="icon-watch" />{rs?.spectators ?? spec?.watchers} watching</span>}
        </div>
      </header>

      <main className="watch-stage">
        <div className="watch-canvas"><canvas ref={canvas} aria-label="Fight arena" /></div>
        {[0, 1].map((s) => pops.some((f) => f.side === s) && ( // new fills pop up over the fight, on the backed fighter's side
          <ul key={s} className={`bet-pops ${s ? 'right' : 'left'}`} aria-live="polite" aria-label="New bets">
            {pops.filter((f) => f.side === s).map((f) => (
              <li key={f.id} className="bet-pop" style={tint(players[f.side])}><b>{who(f.taker)}</b> backed {name(f.side)} <b>{fmt(cost(f.price_bps, f.qty))} {COIN}</b> @ {pc(f.price_bps)}</li>
            ))}
          </ul>
        ))}
        {status && <div className="watch-status" role="status"><p>{status}</p></div>}
      </main>

      <aside className="watch-side">
        {note ? <section className="slab bet"><h3 className="row-ico"><Ico n="icon-bet" />Betting</h3><p className="note">{note}</p></section> : spec && (
          <section className="slab bet" aria-label="Back a fighter">
            <h3 className="row-ico"><Ico n="icon-bet" />Back a fighter</h3>
            <label className="bet-amt"><span>Amount</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!canTrade} /><b>{COIN}</b></label>
            {!adv && <>
              <div className="side-pick">
                {[0, 1].map((s) => (
                  <button key={s} type="button" className="btn" style={tint(players[s])} disabled={!canTrade || !quick[s]} onClick={() => quick[s] && place(s, quick[s]!.price, quick[s]!.qty)}>
                    <span>Back {name(s)}{ask(s) !== null && ` @ ${pc(ask(s)!)}`}</span>
                  </button>
                ))}
              </div>
              <p className="note bet-quote" aria-live="polite">
                {!canTrade ? (over || !open ? 'Betting closed.' : 'Betting opens with the room.')
                  : quick[side] ?? quick[1 - side] ? [0, 1].filter((s) => quick[s]).map((s) => `${name(s)}: ${quick[s]!.qty} shares, pays ${fmt(win(quick[s]!.qty))} ${COIN} if they win`).join(' · ')
                  : 'No one is offering yet — set your own price below.'}
              </p>
            </>}
            <button type="button" className="chip" aria-expanded={adv} onClick={() => setAdv(!adv)}>{adv ? 'Simple: back at best price' : 'Advanced: set price'}</button>
            {adv && <>
              <fieldset className="side-pick" disabled={!canTrade}>
                <legend className="note">Fighter</legend>
                {[0, 1].map((i) => (
                  <label key={i} style={tint(players[i])}>
                    <input type="radio" name="side" checked={side === i} onChange={() => setSide(i)} />
                    <b>{name(i)}</b><span>best {ask(i) === null ? '—' : pc(ask(i)!)}</span>
                  </label>
                ))}
              </fieldset>
              <label className="bet-amt"><span>Price</span><input type="number" min="0.01" max="99.99" step="1" inputMode="decimal" value={pricePct} onChange={(e) => setPricePct(e.target.value)} disabled={!canTrade} /><b>%</b></label>
              <p className="note">{advQty} shares · pays {fmt(win(advQty))} {COIN} if {name(side)} wins. Unmatched shares wait on the book until someone takes them or you cancel.</p>
              <button type="button" className="btn" disabled={!canTrade || advQty < 1} onClick={() => place(side, advPrice, advQty)}><span><Ico n="coin" />Place order</span></button>
            </>}
            {msg && <p className="note" role="status">{msg}</p>}
            <PriceChart pts={series} />
            <div className="book-ladder" aria-label="Order book">
              {[0, 1].map((s) => (
                <div key={s} style={tint(players[s])}>
                  <b>{name(s)} bids</b>
                  {book[s].length ? book[s].slice(0, 5).map(([p, q]) => <span key={p}>{pc(p)}<i>{q} sh</i></span>) : <span className="note">none</span>}
                </div>
              ))}
            </div>
            <p className="note">{fmt(match?.collateral)} {COIN} matched · {match?.kos ?? 0} KO{match?.kos === 1 ? '' : 's'} · each winning share pays 0.01 {COIN}.</p>
            {over && <b>{over.winner === null ? 'Match void, everyone gets back what they paid.' : `${name(over.winner)} wins${over.reason === 'ko' ? '' : ` by ${over.reason}`}.`}</b>}
            {over && match?.status === 'live' && <p className="note">Waiting for the result to post on-chain…</p>}
            {due > 0n && <button className="btn big" onClick={() => act(() => arena.claim(matchId!), 'Added to your balance.')}><span><Ico n="icon-claim" />Claim {fmt(due)} {COIN}</span></button>}
            {DEMO && !over && ( // demo bots rarely finish a fight; end it here to see settlement and payouts
              <span className="row demo-end">End fight:
                {[0, 1, null].map((w) => <button key={String(w)} className="chip" onClick={() => setOver({ winner: w, reason: 'ko' })}>{w === null ? 'Void' : `${name(w)} wins`}</button>)}
              </span>
            )}
            {(orders.length > 0 || (pos && paid > 0n)) && (
              <div className="bet-pos" aria-label="Your position">
                <h4>Your bets</h4>
                {orders.map((o) => (
                  <div key={o.id} className="bet-pos-row" style={tint(players[o.side])}>
                    <b>{name(o.side)}</b><span>{o.qty} waiting @ {pc(o.price_bps)}</span>
                    <button className="chip" disabled={!open} onClick={() => act(() => arena.cancelOrder(matchId!, o.id), 'Order cancelled, refunded to your balance.')}>Cancel</button>
                  </div>
                ))}
                {pos && [0, 1].filter((s) => pos.shares[s] > 0).map((s) => (
                  <div key={s} className="bet-pos-row" style={tint(players[s])}>
                    <b>{name(s)}</b><span>{pos.shares[s]} shares · {fmt(pos.paid[s])} in</span>
                    {settledW === null ? <span>pays {fmt(win(pos.shares[s]))}</span> : settledW === s ? <b className="pnl-up">Won {fmt(win(pos.shares[s]))}</b> : <b className="pnl-down">Lost</b>}
                  </div>
                ))}
                {pos && settledW !== null && <span>Result: <b className={win(pos.shares[settledW]) >= paid ? 'pnl-up' : 'pnl-down'}>{signed(win(pos.shares[settledW]) - paid)} {COIN}</b></span>}
              </div>
            )}
          </section>
        )}
        <Chat lines={chat} onSend={(t) => send.current(t)} />
      </aside>
    </div>
  );
}
