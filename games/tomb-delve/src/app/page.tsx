'use client';
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { CARDS, CLASSES, ITEMS, MONS, RELICS, ROOMS, advance, atCamp, deckOf, endTurn, ignoreChest, newRun, nextSet, openChest, playCard, sha256, stMax, useItem, type CardId, type ItemId, type Run } from '../lib/sim.ts';
import * as chain from '../lib/chain.ts';
import type { Dna } from '../lib/genes.ts';
import { drawHero, hero, heroOf, tintOf } from '../lib/render/cutout.ts';
import { heroPose, type Anim } from '../lib/render/rig.ts';

type Session = { wallet: string; mode: string; stake: string; seed: string };
declare global {
  interface Window { Chomp?: { ready(): void; start(): void; result(r: object): void; onSession(f: (s: Session) => void): void } }
}
type Screen = 'title' | 'pick' | 'entry' | 'room' | 'walk' | 'camp' | 'pawn' | 'end';
type Pop = '' | 'inv' | 'relics' | 'deck' | 'map';
type AnimRef = { current: { kind: Anim; at: number } };

const W = 1672, H = 941; // design stage, scaled uniformly to fit
const art = (p: string) => `/g/tomb-delve/art/${p}.svg?v=2`;
const bg = (p: string) => ({ backgroundImage: `url(${art('bg/' + p)})` });
const sol = (l: number) => `${chain.fmt(l)} SOL`;
const relicName = (t: number) => RELICS[t].name + (t === 4 ? ` #${chain.state.legendaries + 1}` : '');
const tally = (ids: CardId[]) => Object.entries(ids.reduce<Record<string, number>>((o, id) => ({ ...o, [id]: (o[id] ?? 0) + 1 }), {}))
  .sort(([a], [b]) => CARDS[a as CardId].name.localeCompare(CARDS[b as CardId].name)) as [CardId, number][];

// Cutout hero on a canvas. Origin at feet (fx, fy), facing right, s px per game unit (rig is 100 units tall).
function Hero({ dna, anim, w, h, s, fx, fy, className, style }: { dna: Dna; anim?: AnimRef; w: number; h: number; s: number; fx: number; fy: number; className?: string; style?: CSSProperties }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const name = heroOf(dna), tint = tintOf(dna);
    let id = 0;
    const loop = (now: number) => {
      id = requestAnimationFrame(loop);
      const g = cv.current?.getContext('2d'), rig = hero(name);
      if (!g || !rig) return;
      const a = anim?.current ?? { kind: 'idle' as Anim, at: 0 }, ms = now - a.at;
      g.clearRect(0, 0, w, h);
      g.save(); g.translate(fx, fy); g.scale(s, s);
      drawHero(g, heroPose(a.kind, ms, now), rig, a.kind === 'hurt' && ms < 110, tint);
      g.restore();
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [dna, anim, w, h, s, fx, fy]);
  return <canvas ref={cv} width={w} height={h} className={className} style={style} />;
}

const Bar = ({ v, max, cls }: { v: number; max: number; cls: string }) => (
  <div className={'hp ' + cls} style={{ backgroundImage: `url(${art('ui/hpbar')})` }}><i style={{ width: `${(v / max) * 100}%` }} /></div>
);

export default function Game() {
  const [seed, setSeed] = useState('');
  const [screen, setScreen] = useState<Screen>('title');
  const [charId, setCharId] = useState('');
  const [run, setRun] = useState<Run | null>(null);
  const [note, setNote] = useState('');
  const [pawn, setPawn] = useState<{ left: number[]; got: number; scan: number; scanned: boolean; drop: string }>({ left: [], got: 0, scan: -1, scanned: false, drop: '' });
  const [pop, setPop] = useState<Pop>('');
  const [k, setK] = useState(0);
  const [fx, setFx] = useState({ mon: 0, monDmg: 0, me: 0, meDmg: 0 });
  const [ghost, setGhost] = useState<{ id: CardId; x: number; y: number; n: number } | null>(null);
  const [, tick] = useState(0); // chain mock is mutable module state; bump to re-render
  const tape = useRef<unknown[]>([]);
  const sent = useRef(false);
  const stage = useRef<HTMLElement>(null);
  const anim = useRef({ kind: 'idle' as Anim, at: 0 });
  const ch = chain.getChars().find((c) => c.id === charId);
  const pose = (kind: Anim) => (anim.current = { kind, at: performance.now() });

  useEffect(() => {
    const C = window.Chomp;
    if (C && parent !== window) { C.onSession((s) => setSeed(s.seed)); C.ready(); }
    else setSeed(String(Math.random())); // standalone: no portal session, any seed works
    const fit = () => setK(Math.min(innerWidth / W, innerHeight / H));
    fit(); addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, []);

  // Record + apply. The tape is what the ER would see as transactions.
  const act = (name: string, f: (r: Run) => Run, x?: unknown) => {
    if (!run) return;
    tape.current.push(x === undefined ? name : [name, x]);
    const before = run.relics.length, r = f(run), c0 = run.c, c1 = r.c;
    if (r.relics.length > before) setNote(`Found: ${r.relics.slice(before).map(relicName).join(', ')}`);
    if (name === 'card' && c0) pose(CARDS[c0.hand[x as number]].dmg !== undefined ? 'attack' : 'guard');
    const monDmg = c0 && c1 && c1.mon.id === c0.mon.id ? c0.mon.hp - c1.mon.hp : 0, meDmg = run.hp - r.hp;
    if (monDmg > 0 || meDmg > 0) setFx((o) => ({ mon: o.mon + (monDmg > 0 ? 1 : 0), monDmg: monDmg > 0 ? monDmg : o.monDmg, me: o.me + (meDmg > 0 ? 1 : 0), meDmg: meDmg > 0 ? meDmg : o.meDmg }));
    if (meDmg > 0) pose('hurt');
    if (r.dead) pose('dead');
    setRun(r);
    if (r.dead && !sent.current) finish(0, r);
  };
  const finish = (score: number, r: Run) => {
    sent.current = true;
    if (r.dead) chain.lockChar(charId, Date.now());
    window.Chomp?.result({ score, tapeHash: sha256(JSON.stringify(tape.current)) });
  };
  const resetFx = () => { setFx({ mon: 0, monDmg: 0, me: 0, meDmg: 0 }); setGhost(null); pose('idle'); };

  const enter = () => {
    const runId = chain.payEntry();
    if (!runId || !ch) return setNote('Not enough SOL for entry.');
    window.Chomp?.start();
    // TODO(solana): PER — run PDA {mint, HP, inventory, setIdx, roomIdx, pity, H hidden}; only the current room is revealed.
    const vrf = chain.requestVrf(seed + runId, 1);
    tape.current = [vrf, runId, ch.id];
    sent.current = false;
    setRun(newRun(vrf, runId, ch.cls, ch.skills));
    setNote(''); resetFx();
    setScreen('room');
  };
  const cont = () => { act('advance', advance); setNote(''); resetFx(); setScreen('walk'); };
  const walked = () => setScreen(run && atCamp(run) ? 'camp' : 'room');
  const buy = (item: ItemId) => {
    if (!chain.buyItem(item)) return setNote('Not enough SOL.');
    act('buy', (r) => useItem(r, item, true), item);
    setNote(`Bought ${ITEMS[item].name}.`);
  };
  const extract = () => { setPop(''); setPawn({ left: run!.relics.slice(), got: 0, scan: -1, scanned: false, drop: '' }); setScreen('pawn'); };
  const sellOne = () => {
    const t = pawn.left[pawn.scan], now = Date.now(), before = chain.quote(t, now), amt = chain.sell(t, now), after = chain.quote(t, now);
    const left = pawn.left.filter((_, i) => i !== pawn.scan);
    setPawn({ left, got: pawn.got + amt, scan: -1, scanned: false, drop: `${RELICS[t].name} sold for ${sol(amt)} · price ${chain.fmt(before)} → ${chain.fmt(after)}` });
  };
  const leavePawn = () => { finish(pawn.got, run!); setScreen('end'); };
  const playAt = (e: MouseEvent<HTMLButtonElement>, i: number, id: CardId) => {
    const a = e.currentTarget.getBoundingClientRect(), s = stage.current!.getBoundingClientRect();
    setGhost({ id, x: (a.left - s.left) / k, y: (a.top - s.top) / k, n: (ghost?.n ?? 0) + 1 });
    act('card', (r) => playCard(r, i), i);
  };

  // DEMO ONLY: shortcuts for manual end-to-end testing. Each edit is recorded in the tape as 'demo:*'.
  const [demoOpen, setDemoOpen] = useState(false);
  const cheat = (name: string, f: (r: Run) => void) => {
    if (!run) return;
    const r = structuredClone(run); f(r);
    tape.current.push(['demo', name]); setRun(r); setNote(`Demo: ${name}`);
    if (r.dead) pose('dead');
    if (atCamp(r) && screen === 'room') setScreen('camp');
    if (r.dead && !sent.current) finish(0, r);
  };
  const demoPanel = (
    <div className="demo">
      <button onClick={() => setDemoOpen(!demoOpen)}>{demoOpen ? '× Demo' : '🛠 Demo'}</button>
      {demoOpen && <div className="demo-list">
        <small>SOL {chain.fmt(chain.state.balance)} · treasury {chain.fmt(chain.state.treasury)}</small>
        <button onClick={() => { chain.demo.faucet(); tick((n) => n + 1); }}>+1 SOL</button>
        <button onClick={() => { chain.demo.unlockAll(); tick((n) => n + 1); }}>Unlock characters</button>
        <button onClick={() => { chain.demo.resetMarket(); tick((n) => n + 1); }}>Reset pawn prices</button>
        {run && !run.dead && <>
          <button disabled={!run.c || run.c.won} onClick={() => cheat('win fight', (r) => { r.c!.mon.hp = 0; r.c!.won = true; r.done = true; r.c!.log = `${r.c!.mon.name} falls.`; })}>Win fight</button>
          <button onClick={() => cheat('full heal', (r) => { r.hp = r.max; })}>Full heal</button>
          <button disabled={atCamp(run)} onClick={() => cheat('skip to camp', (r) => { r.room = ROOMS; r.c = null; r.done = false; })}>Skip to camp</button>
          <button onClick={() => cheat('die', (r) => { r.hp = 0; r.dead = true; })}>Die</button>
          <div className="demo-row">{RELICS.map((x, t) => (
            <button key={t} title={x.name} onClick={() => cheat(`+${x.name}`, (r) => { r.relics.push(t); })}><img src={art('relics/' + x.art)} alt={x.name} /></button>
          ))}</div>
        </>}
      </div>}
    </div>
  );

  const c = run?.c, camp = run ? atCamp(run) : false, room = run && !camp ? run.rooms[run.room] : null;
  const deck = run ? deckOf(run.cls, run.skills) : [];
  const banner = (text: string) => (
    <div className="banner" style={{ backgroundImage: `url(${art('ui/banner')})` }}><span>{text}</span></div>
  );
  const plate = run && (
    <div className="plate" style={{ backgroundImage: `url(${art('ui/plate')})` }}>
      <small>Set {run.set}</small>{camp ? 'Camp' : `Room ${run.room + 1}/${ROOMS}`}
    </div>
  );
  const heroPanel = run && ch && (
    <div className="panel hero-panel" style={{ backgroundImage: `url(${art('ui/panel-hero')})` }}>
      <Hero dna={ch.dna} w={100} h={100} s={2} fx={42} fy={196} className="portrait" />
      <b className="name">{ch.name}</b>
      <Bar v={run.hp} max={run.max} cls="green" />
      <span className="num">{run.hp}/{run.max}</span>
      <span className="badge blk"><img src={art('icons/block')} alt="block" />{c && !c.won ? c.block + c.carry : 0}</span>
      <span className="badge st"><img src={art('icons/stamina')} alt="stamina" />{c && !c.won ? c.st : stMax(run)}/{stMax(run)}</span>
      {fx.me > 0 && <b className="pop me" key={fx.me}>-{fx.meDmg}</b>}
    </div>
  );
  const bottom = (center: ReactNode) => run && (
    <div className="bottom">
      <button className="btn b1" style={{ backgroundImage: `url(${art('ui/btn')})` }} onClick={() => setPop('inv')}><img src={art('icons/inventory')} alt="" />Inventory</button>
      <button className="btn b2" style={{ backgroundImage: `url(${art('ui/btn')})` }} onClick={() => setPop('relics')}><img src={art('icons/relic')} alt="" />Relics ({run.relics.length})</button>
      {center}
      <button className="btn b4" style={{ backgroundImage: `url(${art('ui/btn')})` }} onClick={() => setPop('deck')}><img src={art('icons/deck')} alt="" />Deck ({deck.length})</button>
      <button className="btn b5" style={{ backgroundImage: `url(${art('ui/btn')})` }} onClick={() => setPop('map')}><img src={art('icons/map')} alt="" />Map</button>
    </div>
  );
  const endBtn = (label: ReactNode, onClick: () => void, disabled = false) => (
    <button className="btn-end" disabled={disabled} style={{ backgroundImage: `url(${art('ui/btn-end')})` }} onClick={onClick}>{label}</button>
  );
  const btn = (label: ReactNode, onClick: () => void, disabled = false) => (
    <button className="btn" disabled={disabled} style={{ backgroundImage: `url(${art('ui/btn')})` }} onClick={onClick}>{label}</button>
  );
  const tray = (body: ReactNode) => <div className="tray" style={{ backgroundImage: `url(${art('ui/tray')})` }}>{body}</div>;
  const card = (id: CardId, extra: object = {}) => {
    const x = CARDS[id];
    return (
      <>
        <span className="cost">{x.cost}</span>
        <img className="pic" src={art('cards/art/' + id)} alt="" {...extra} />
        <b>{x.name}</b><small>{x.text}</small>
      </>
    );
  };
  const frame = (id: CardId) => ({ backgroundImage: `url(${art('cards/l-frame-' + CARDS[id].kind)})` });
  const potionOk = !!run && run.potions > 0 && run.hp < run.max && !run.dead, tonicOk = !!run && run.tonics > 0 && !!c && !c.won && !run.dead;

  const modal = run && pop && (
    <div className="backdrop" onClick={() => setPop('')}>
      <div className="modal" style={{ backgroundImage: `url(${art('ui/modal')})` }} onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={() => setPop('')} aria-label="close">×</button>
        {pop === 'inv' && <>
          <h2>Inventory</h2>
          <div className="rows">
            <div className="row"><img src={art('items/potion-hp')} alt="" /><b>Health Potion ×{run.potions}</b><small>{ITEMS.potion.text}</small>
              <button disabled={!potionOk} onClick={() => act('use', (r) => useItem(r, 'potion'), 'potion')}>Use</button></div>
            <div className="row"><img src={art('items/tonic')} alt="" /><b>Stamina Tonic ×{run.tonics}</b><small>{ITEMS.tonic.text} · in combat</small>
              <button disabled={!tonicOk} onClick={() => act('use', (r) => useItem(r, 'tonic'), 'tonic')}>Use</button></div>
          </div>
          <p className="dim">HP {run.hp}/{run.max}{run.dmg ? ` · Iron Blade +${run.dmg} dmg` : ''}. Everything carried is lost on death.</p>
        </>}
        {pop === 'relics' && <>
          <h2>Relics ({run.relics.length})</h2>
          <div className="rows">
            {run.relics.map((t, i) => (
              <div className="row" key={i}><img src={art('relics/' + RELICS[t].art)} alt="" /><b>{relicName(t)}</b><small>Tier {t + 1}/5</small><span>{sol(chain.quote(t, Date.now()))}</span></div>
            ))}
            {!run.relics.length && <p className="dim">Nothing yet. Chests and loose relics fill this.</p>}
          </div>
          <p className="dim">Pawn quotes right now. Sell at camp by extracting.</p>
        </>}
        {pop === 'deck' && <>
          <h2>Deck ({deck.length})</h2>
          {c && !c.won ? <>
            <p>Draw pile {c.draw.length} · Hand {c.hand.length} · Discard {c.disc.length}</p>
            {([['Draw pile (sorted)', c.draw], ['Hand', c.hand], ['Discard', c.disc]] as const).map(([t, ids]) => (
              <div key={t} className="chips"><b>{t}</b>{tally([...ids]).map(([id, n]) => <span key={id}>{CARDS[id].name} ×{n}</span>)}</div>
            ))}
          </> : <div className="chips">{tally(deck).map(([id, n]) => <span key={id}>{CARDS[id].name} ×{n} <small>{CARDS[id].cost}⚡ {CARDS[id].text}</small></span>)}</div>}
        </>}
        {pop === 'map' && <>
          <h2>Map · Set {run.set}</h2>
          <div className="map">
            {Array.from({ length: ROOMS }, (_, i) => <span key={i} className={i < run.room ? 'done' : i === run.room ? 'here' : ''}>{i < run.room ? '✓' : i === run.room ? '◆' : '?'}</span>)}
            <span className={camp ? 'here' : ''}>⛺</span>
          </div>
          <p>Rooms cleared {Math.min(run.room, ROOMS)}/{ROOMS} · camp after room {ROOMS}</p>
          <p className="dim">Rooms ahead stay hidden in the Private ER until you step in.</p>
        </>}
      </div>
    </div>
  );

  return (
    <main className="app" ref={stage} style={{ transform: `translate(-50%, -50%) scale(${k})`, visibility: k ? 'visible' : 'hidden' }}>
      {screen === 'title' && (
        <div className="scene center" style={bg('title-l')}>
          <h1>Tomb Delve</h1>
          <p>Card-battle through a cursed pyramid. Extract relics at camp, or die and lose it all.</p>
          {endBtn(seed ? 'Enter the tomb' : 'Connecting…', () => setScreen('pick'), !seed)}
        </div>
      )}

      {screen === 'pick' && (
        <div className="scene" style={bg('title-l')}>
          {banner('Pick your monster')}
          <div className="picks">
            {chain.getChars().map((x) => {
              const kk = CLASSES[x.cls], lock = x.lockedUntil - Date.now();
              return (
                <button key={x.id} className="char" disabled={lock > 0} onClick={() => { setCharId(x.id); setScreen('entry'); }}>
                  <Hero dna={x.dna} w={300} h={300} s={2.5} fx={140} fy={285} />
                  <b>{x.name} · {kk.name}</b>
                  <small>STR {x.dna.str} DEX {x.dna.dex} DEF {x.dna.def} SPD {x.dna.spd} · HP {kk.hp} · ST {kk.st}</small>
                  <small>{CARDS[kk.sig].name}: {CARDS[kk.sig].text}</small>
                  <small>{kk.passive}</small>
                  <small>Skills: {x.skills.join(', ')}</small>
                  {lock > 0 && <small className="bad">Dead: locked {Math.ceil(lock / 60000)}m</small>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {screen === 'entry' && ch && (
        <div className="scene" style={bg('title-l')}>
          {banner(`${ch.name} the ${CLASSES[ch.cls].name}`)}
          <div className="ring big-ring" />
          <Hero dna={ch.dna} w={500} h={520} s={4.4} fx={240} fy={500} className="entry-hero" />
          <div className="info">
            <h2>Entry {sol(50_000_000)}</h2>
            <p>Balance {sol(chain.state.balance)}</p>
            <p className="dim">Death loses everything carried and locks this monster for 1h.</p>
            {endBtn(<><img src={art('icons/sol')} alt="" />Pay entry</>, enter)}
            {btn('Back', () => setScreen('pick'))}
            {note && <p className="bad">{note}</p>}
          </div>
        </div>
      )}

      {screen === 'room' && run && room && (
        <div className="scene zoom" key={`${run.set}-${run.room}`} style={bg('room-l')}>
          {banner(run.dead ? 'You died. Everything you carried is lost.' : note || c?.log || (room.kind === 'chest' ? (run.done ? 'You leave the chest behind.' : 'A sealed chest sits in the dark.') : 'A loose relic lies in the dust.'))}
          {plate}
          {c ? <>
            <div className="panel mon-panel" style={{ backgroundImage: `url(${art('ui/panel-monster')})` }}>
              <img className="portrait" src={art('monsters/l-' + c.mon.id)} alt="" />
              <b className="name" title={MONS[c.mon.id].rule}>{c.mon.name}</b>
              <Bar v={c.mon.hp} max={c.mon.max} cls="red" />
              <span className="num">{c.mon.hp}/{c.mon.max}</span>
              <span className="badge blk"><img src={art('icons/block')} alt="block" />{c.mon.block}</span>
            </div>
            <div className="foe bob">
              <img key={fx.mon} className={'mon' + (fx.mon ? ' hit' : '') + (c.won ? ' dead' : '')} src={art('monsters/l-' + c.mon.id)} alt={c.mon.name} />
            </div>
            {fx.mon > 0 && <b className="pop" key={fx.mon}>-{fx.monDmg}</b>}
          </> : room.kind === 'chest' ? (
            <div className="foe chest">
              <img className="mon" src={art(run.done ? 'chests/chest-open' : 'chests/chest')} alt="chest" />
              {run.cls === 'thief' && room.mimic && !run.done && <b className="bad hint">Mimic! (your thief can tell)</b>}
            </div>
          ) : (
            <div className="foe chest"><img className="mon" src={art('relics/' + RELICS[room.relic].art)} alt="" /></div>
          )}
          {ch && <Hero dna={ch.dna} anim={anim} w={380} h={380} s={2.5} fx={170} fy={355} className={'me' + (run.dead ? ' dead' : '')} />}
          {heroPanel}
          {tray(run.dead ? <div className="acts">{btn('Leave the tomb', () => setScreen('end'))}</div>
            : c && !c.won ? (
              <div className={'hand' + (c.hand.length > 5 ? ' six' : '')}>
                {c.hand.map((id, i) => (
                  <button key={`${c.turn}-${i}-${id}`} className="card" disabled={CARDS[id].cost > c.st} style={frame(id)} onClick={(e) => playAt(e, i, id)}>{card(id)}</button>
                ))}
              </div>
            ) : !run.done ? (
              <div className="acts">{btn('Open', () => act('open', openChest))}{btn('Ignore', () => act('ignore', ignoreChest))}</div>
            ) : <div className="acts">{btn('Continue', cont)}</div>)}
          {ghost && <div className="fly" key={ghost.n} style={{ ...frame(ghost.id), left: ghost.x, top: ghost.y, '--dx': `${836 - ghost.x - 115}px`, '--dy': `${300 - ghost.y - 100}px` } as CSSProperties} onAnimationEnd={() => setGhost(null)}>{card(ghost.id)}</div>}
          {bottom(c && !c.won && !run.dead ? endBtn(<><img src={art('icons/intent-attack')} alt="" />End Turn</>, () => act('end', endTurn)) : null)}
        </div>
      )}

      {screen === 'walk' && (
        <div className="scene walk" onAnimationEnd={(e) => e.target === e.currentTarget.lastElementChild && walked()}>
          <div className="layer far" style={bg('corridor-far-l')} />
          <div className="layer mid" style={bg('corridor-mid-l')} />
          <div className="layer near" style={bg('corridor-near-l')} />
        </div>
      )}

      {screen === 'camp' && run && (
        <div className="scene zoom" style={bg('camp-l')}>
          {banner(note || `Camp · set ${run.set} cleared · ${sol(chain.state.balance)}`)}
          {plate}
          <div className="ring" />
          {ch && <Hero dna={ch.dna} anim={anim} w={380} h={380} s={2.5} fx={170} fy={355} className="me" />}
          {heroPanel}
          <div className="carry"><b>Carrying</b> {run.relics.map(relicName).join(', ') || 'nothing'}</div>
          {tray(<div className="acts shop">
            {(Object.keys(ITEMS) as ItemId[]).map((it) => (
              <button key={it} className="slot" onClick={() => buy(it)}><img src={art('items/' + ITEMS[it].art)} alt="" /><b>{ITEMS[it].name}</b><small>{ITEMS[it].text}</small><small>{sol(ITEMS[it].price)}</small></button>
            ))}
            {btn(`Delve to set ${run.set + 1}`, () => { setNote(''); resetFx(); const vrf = chain.requestVrf(seed + run.runId, run.set + 1); act('next', (r) => nextSet(r, vrf), vrf); setScreen('walk'); })}
          </div>)}
          {bottom(endBtn('Extract', extract))}
        </div>
      )}

      {screen === 'pawn' && (
        <div className="scene" style={bg('camp-l')}>
          {banner(pawn.drop || '“Let me take a look at what you dragged out of there.”')}
          <img className="npc" src={art('npc/archaeologist')} alt="archaeologist" />
          {pawn.scan >= 0 && (
            <div className="scanbox">
              <div className="scan" onAnimationEnd={() => setPawn({ ...pawn, scanned: true })}>
                <img src={art('relics/' + RELICS[pawn.left[pawn.scan]].art)} alt="" />
              </div>
              {pawn.scanned && <>
                <b>{relicName(pawn.left[pawn.scan])}: {sol(chain.quote(pawn.left[pawn.scan], Date.now()))}</b>
                {btn('Sell', sellOne)}
              </>}
            </div>
          )}
          <div className="market" style={{ backgroundImage: `url(${art('ui/modal')})` }}>
            <h2>Pawn prices</h2>
            <table><tbody>
              {RELICS.map((x, t) => (
                <tr key={t}><td>{x.name}</td><td>sell {chain.fmt(chain.quote(t, Date.now()))}</td>
                  <td><button onClick={() => { if (chain.buyRelic(t, Date.now())) setPawn({ ...pawn, left: [...pawn.left, t] }); tick((n) => n + 1); }}>buy {chain.fmt(chain.buyQuote(t, Date.now()))}</button></td></tr>
              ))}
            </tbody></table>
            <p>Earned {sol(pawn.got)} · balance {sol(chain.state.balance)}{chain.state.owed ? ` · owed ${sol(chain.state.owed)}` : ''}</p>
          </div>
          {tray(<div className="acts shop">
            {pawn.left.map((t, i) => (
              <button key={i} className="slot" disabled={pawn.scan >= 0 && !pawn.scanned} onClick={() => setPawn({ ...pawn, scan: i, scanned: false })}>
                <img src={art('relics/' + RELICS[t].art)} alt="" /><b>{RELICS[t].name}</b><small>Scan</small>
              </button>
            ))}
            {!pawn.left.length && <p>Nothing left to sell.</p>}
          </div>)}
          <div className="bottom">{endBtn('Done', leavePawn)}</div>
        </div>
      )}

      {screen === 'end' && run && (
        <div className="scene center" style={bg('title-l')}>
          <h1>{run.dead ? 'Lost in the tomb' : 'Back in the sun'}</h1>
          <p>{run.dead ? `${ch?.name} is locked for 1h. Everything carried is gone.` : `You pawned relics for ${sol(pawn.got)}.`}</p>
          <p>Reached set {run.set} · balance {sol(chain.state.balance)}</p>
          {endBtn('Delve again', () => { setRun(null); setPop(''); setScreen('pick'); })}
        </div>
      )}
      {(screen === 'room' || screen === 'camp') && modal}
      {demoPanel}
    </main>
  );
}
