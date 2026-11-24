import { BASE } from './nav.ts';
import { newGame, step, hash, type GameState } from './sim/sim.ts';
import { createRenderer } from './render/draw.ts';
import { readInput } from './input.ts';
import { Netplay, linkPeer } from './net.ts';
import { applySkills, sanitize, sanitizeSkills, statsOf, type Dna, type Skill } from './genes.ts';
import { STAGE_IDS, type StageId } from './stages.ts';
import { music, playEvents } from './audio.ts';
import { bot } from './bot.ts';
import type { Attestation, SignMatch } from './chain.ts';
import { unpack } from './tape.ts';

export interface Player { name: string; dna: Dna; account?: string; skills?: Skill[] }
const toPlayer = (p: any): Player => ({ name: String(p.name ?? 'Rival').slice(0, 24) || 'Rival', dna: sanitize(p.dna), account: typeof p.account === 'string' ? p.account.slice(0, 64) : undefined, skills: sanitizeSkills(p.skills) });
export interface Hooks {
  status?: (text: string) => void; // lobby text (room code, connecting…)
  started?: (players: Player[], seat: number) => void;
  result?: (winnerSeat: number, kos: number[], seat: number) => void; // once per finished game; kos[i] = stocks player i took
  over?: (winner: number | null, reason: string, settle?: Attestation) => void; // server referee verdict (online / spectate)
  room?: (info: { code: string; matchId: number | null; bettable: boolean; seat: number }) => void;
  rematch?: () => void; // opponent asked for a rematch
  left?: () => void; // opponent (or our socket) gone: no rematch in this room
  gone?: (why: string) => void; // room closed before the fight (host left / socket lost)
  roomstate?: (rs: RoomState) => void;
  chat?: (line: ChatLine) => void;
  chatlog?: (lines: ChatLine[]) => void;
}
export interface Seat { name: string; dna: Dna; skills?: Skill[]; account: string; connected: boolean }
export interface RoomState {
  code: string; status: 'waiting' | 'live' | 'done'; stage: StageId; stake: string; matchId: number | null;
  bettable: boolean; pub: boolean; view: boolean; seats: Seat[]; spectators: number;
}
export interface ChatLine { from: string; seat: number; text: string; ts: number }
export interface PlayerSet { name?: string; dna?: Dna; stage?: StageId }

// Shared by players and spectators: room/chat messages that aren't part of the fight.
function roomMsg(m: any, hooks: Hooks) {
  if (m.t === 'roomstate') hooks.roomstate?.({ ...m, stage: STAGE_IDS.includes(m.stage) ? m.stage : 'ember', seats: (m.seats ?? []).map((p: any) => ({ ...p, dna: sanitize(p.dna), skills: sanitizeSkills(p.skills) })) });
  else if (m.t === 'chat') hooks.chat?.(m);
  else if (m.t === 'chatlog') hooks.chatlog?.(m.lines ?? []);
  else return false;
  return true;
}
export interface HostOpts { pub: boolean; view: boolean; bettable: boolean; matchId: number | null; stake: string; account: string }

const params = new URLSearchParams(location.search);
const FORCE_RELAY = params.has('relay'); // ?relay -> skip P2P (debug fallback path)
const WS = location.protocol === 'https:' ? 'wss' : 'ws';
export const SERVER = params.get('server') ?? process.env.NEXT_PUBLIC_SERVER_URL ?? `${WS}://${location.host}${BASE}-ws`; // market proxies /g/brawler-ws -> :8787;

function loop(canvas: HTMLCanvasElement, players: Player[], seat: number, stage: StageId, hooks: Hooks, tap?: (inputs: number[], end: boolean) => void) {
  const renderer = createRenderer(canvas);
  const state: GameState = newGame(players.map((p) => applySkills(statsOf(p.dna), p.skills ?? [])), stage);
  let raf = 0;
  let net: Netplay | null = null;
  let banner = '', link = '';
  let spectate: ((advance: (inputs: number[]) => void, s: GameState) => void) | null = null;
  renderer.setPlayers(players.map((p, i) => (seat < 0 ? p.name : i === seat ? `${p.name} (you)` : p.name)), players.map((p) => p.dna), players.map((p) => p.account ?? ''));

  let shown = 0; // first frame whose effects haven't played yet (predicted frames play once, never replayed)
  function fx(s: GameState) {
    if (s.frame <= shown) return;
    shown = s.frame;
    renderer.onEvents(s.events);
    playEvents(s, seat);
  }
  function advance(inputs: number[]) {
    if (state.winner >= 0) return; // match is over; server verdict decides
    step(state, inputs);
    tap?.(inputs, state.winner >= 0);
    fx(state);
    if (state.winner >= 0) hooks.result?.(state.winner, state.fighters.map((_, i) => 3 - state.fighters[1 - i].stocks), seat);
  }
  // Confirmed state + predicted frames up to the local head. ~1 µs per step, so resimulating every tick is free.
  function view(): GameState {
    if (!net || state.winner >= 0) return state;
    const v = structuredClone(state);
    for (const inputs of net.predicted()) { if (v.winner >= 0) break; step(v, inputs); fx(v); }
    return v;
  }

  const DT = 1000 / 60;
  let acc = 0, last = performance.now();
  function pump(now: number) {
    if (!renderer.ready(stage)) { last = now; return; }
    acc = Math.min(acc + now - last, 250); last = now;
    while (acc >= DT) {
      acc -= DT;
      if (net && !banner) net.tick(readInput, advance, () => hash(state));
      else if (spectate) spectate(advance, state);
    }
  }
  // rAF pauses in background/occluded windows, which froze the sim and stalled the opponent. Worker timers keep running.
  const clock = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 8)'])));
  clock.onmessage = () => pump(performance.now());
  function frame(now: number) {
    pump(now);
    const b = banner || (state.winner >= 0 ? '' : net?.desync ? 'DESYNC detected' : net?.lagging ? 'waiting for opponent…' : '');
    renderer.draw(view(), b, net ? `${link} · ${net.stats()}` : link);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  music(stage);
  (globalThis as any).__net = () => ({ net, link, frame: state.frame, state }); // debug/test hook

  return {
    attach(n: Netplay, label: string) { net = n; link = label; },
    // fast-forward silently over already-confirmed frames (reconnect / replay seek)
    skip(frames: number[]) { for (const f of frames) { if (state.winner >= 0) break; step(state, unpack(f)); } shown = state.frame; },
    feed(fn: (advance: (inputs: number[]) => void, s: GameState) => void) { spectate = fn; },
    setBanner(t: string) { banner = t; },
    stop() { cancelAnimationFrame(raf); clock.terminate(); renderer.destroy(); music(null); },
  };
}

// Free-tier hosts sleep when idle and refuse the first connections while waking (~30-60 s), so retry for ~75 s.
// The host's arena wins; the guest's choice is ignored. me/stage change in the room lobby via set().
// `rejoin`: back into our live seat after a reload / dropped socket (server forfeits after ~30 s). Relay only.
export type First = ({ t: 'host' } & HostOpts) | { t: 'join' | 'rejoin'; code: string; account: string; matchId: number | null } | { t: 'match'; matchId: number; account: string };
const RESUME_DELAY = 8;

export function startOnline(canvas: HTMLCanvasElement, first: First, me: Player, stage: StageId, hooks: Hooks = {}, sign?: SignMatch) {
  let ws: WebSocket | null = null;
  let peer: ReturnType<typeof linkPeer> | null = null;
  let game: ReturnType<typeof loop> | null = null;
  let stopped = false;
  let hb: ReturnType<typeof setInterval> | undefined, leftIv: ReturnType<typeof setInterval> | undefined;
  const say = (t: string) => hooks.status?.(t);
  const send = (o: object) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(o));

  function connect(tries: number) {
    if (stopped) return;
    if (!tries) say('Connecting…');
    const sock = new WebSocket(SERVER);
    ws = sock;
    let opened = false;
    let code = '';
    let seat = -1, delay = 4;
    let net: Netplay | null = null;
    let theirStage: StageId = 'ember';
    let chain: Player[] | null = null; // server-sent seats (chain DNA); must win so our sim matches the referee's
    let theirs: Player | null = null, ready: { send: any; delay: number; label: string } | null = null;
    let ended = false;
    let flush = () => {};

    // Mirror confirmed inputs to the server referee (packed host<<16|guest, 6-frame batches from f0) + 1 s heartbeat.
    const play = (players: Player[], st: StageId, n: Netplay, label: string, frames: number[] = []) => {
      let batch: number[] = [], f0 = frames.length;
      flush = () => { if (batch.length) { sock.send(JSON.stringify({ t: 'tape', f0, ins: batch })); f0 += batch.length; batch = []; } };
      const tap = (ins: number[], end: boolean) => { batch.push((ins[0] << 16) | ins[1]); if (batch.length >= 6 || end) flush(); };
      hb = setInterval(() => sock.readyState === WebSocket.OPEN && sock.send('{"t":"hb"}'), 1000);
      game = loop(canvas, players, seat, st, hooks, tap);
      game.skip(frames);
      net = n;
      game.attach(n, label);
      hooks.started?.(players, seat);
    };
    // Fight starts once we know the opponent's monster AND the input channel is up.
    const maybeStart = () => {
      if (!theirs || !ready || game) return;
      play(chain ?? (seat === 0 ? [me, theirs] : [theirs, me]), seat === 0 ? stage : theirStage, new Netplay(ready.send, seat, ready.delay), `${ready.label} · ${ready.delay}f delay`);
    };

    sock.onopen = () => { opened = true; };
    sock.onerror = () => {
      if (opened || ws !== sock || stopped) return;
      if (tries >= 30) return say(`Can't reach server ${SERVER}`);
      say('Waking up server… (can take up to a minute)');
      setTimeout(() => ws === sock && connect(tries + 1), 2500);
    };
    sock.onclose = () => {
      clearInterval(leftIv);
      if (game && code && !ended && !stopped && ws === sock) { // mid-fight drop: take the seat back
        clearInterval(hb); game.setBanner('Reconnecting…');
        first = { t: 'rejoin', code, account: first.account, matchId: first.matchId };
        return void setTimeout(() => connect(0), 1000);
      }
      if (game) game.setBanner('Connection closed'); else if (opened && !stopped) hooks.gone?.('Lost connection to the server.');
      if (opened) hooks.left?.();
    };
    sock.onmessage = async (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'ping') sock.send('{"t":"pong"}');
      else if (m.t === 'hello') { // on-chain seats prove the account: wallet signs `chomp:brawler:<matchId>:<nonce>`
        let sig;
        if (first.matchId != null && sign) {
          say('Sign the login message in your wallet…');
          try { sig = await sign(first.matchId, m.nonce); } catch { return say('Wallet signature needed to take your seat.'); }
        }
        sock.send(JSON.stringify({ ...first, name: me.name, dna: me.dna, stage, sig }));
      } else if (m.t === 'room') { code = m.code; seat = m.seat ?? 0; say(''); hooks.room?.({ code: m.code, matchId: first.matchId, bettable: first.t === 'host' && first.bettable, seat }); }
      else if (m.t === 'error') {
        say(m.msg);
        if (first.t === 'rejoin' && !net) { if (game) game.setBanner(m.msg); else hooks.gone?.(m.msg); }
      } else if (m.t === 'resume') { // we're back in our seat: fast-forward over the confirmed tape, continue over the relay
        clearInterval(hb); clearInterval(leftIv); peer?.close(); peer = null; game?.stop(); game = null;
        code = m.code; seat = m.seat;
        hooks.room?.({ code, matchId: m.matchId ?? null, bettable: !!m.bettable, seat });
        const frames: number[] = m.frames ?? [];
        const players = (m.players ?? []).map(toPlayer);
        play(players, STAGE_IDS.includes(m.stage) ? m.stage : 'ember', new Netplay(send, seat, RESUME_DELAY, frames.length), `RELAY · resumed · ${RESUME_DELAY}f delay`, frames);
      } else if (m.t === 'rejoin') { // opponent is back: hand it our confirmed frame, both continue over the relay
        if (!net || !game || ended) return;
        flush(); peer?.close(); peer = null; net.resync(send); game.attach(net, 'RELAY · opponent rejoined');
        clearInterval(leftIv); game.setBanner('');
        sock.send('{"t":"resync"}');
      }
      else if (roomMsg(m, hooks)) { if (m.t === 'roomstate' && STAGE_IDS.includes(m.stage)) theirStage = m.stage; }
      else if (m.t === 'start') {
        // 2nd+ start = rematch in the same room: drop the old game, link and per-game state
        clearInterval(hb); clearInterval(leftIv); peer?.close(); game?.stop();
        game = null; net = null; theirs = null; ready = null; chain = null; ended = false;
        seat = m.seat; delay = m.delay;
        if (Array.isArray(m.players) && m.players.length === 2) chain = m.players.map(toPlayer);
        if (seat === 1 || first.t === 'match') hooks.room?.({ code: first.t === 'join' ? first.code : code, matchId: m.matchId ?? null, bettable: !!m.bettable, seat });
        say('Opponent found — connecting…');
        sock.send(JSON.stringify({ t: 'pick', name: me.name.slice(0, 24), dna: me.dna, stage }));
        peer = linkPeer(sock, seat, delay, FORCE_RELAY, (d) => net?.onMessage(d), (send, d, label) => { ready = { send, delay: d, label }; maybeStart(); });
      } else if (m.t === 'pick') {
        theirs = { name: String(m.name ?? 'Rival').slice(0, 24) || 'Rival', dna: sanitize(m.dna) };
        theirStage = STAGE_IDS.includes(m.stage) ? m.stage : 'ember';
        maybeStart();
      } else if (m.t === 'sdp' || m.t === 'ice' || m.t === 'go') peer?.signal(m);
      else if (m.t === 'left') {
        if (!game && seat === 1) return hooks.gone?.('The host left the room.'); // waiting: guest leaving just updates roomstate
        if (ended || !game) return hooks.left?.(); // mid-fight they may still rejoin; a forfeit `over` ends it
        const until = Date.now() + 30_000; // server forfeits ~30 s after their last message
        const tick = () => game?.setBanner(`Opponent reconnecting… forfeit in ${Math.max(0, Math.ceil((until - Date.now()) / 1000))} s`);
        clearInterval(leftIv); tick(); leftIv = setInterval(tick, 1000);
      } else if (m.t === 'over') { ended = true; clearInterval(leftIv); hooks.over?.(m.winner, m.reason, m.settle ?? undefined); if (m.reason !== 'ko') game?.setBanner(verdict(m.winner, m.reason, seat)); }
      else if (m.t === 'rematch') hooks.rematch?.();
      else net?.onMessage(m);
    };
  }

  connect(0);
  return {
    rematch() { send({ t: 'rematch' }); },
    begin() { send({ t: 'begin' }); },
    callBot() { send({ t: 'callbot' }); },
    chat(text: string) { send({ t: 'chat', text }); },
    set(p: PlayerSet) {
      if (p.name !== undefined || p.dna) me = { name: p.name ?? me.name, dna: p.dna ?? me.dna };
      if (p.stage) stage = p.stage;
      send({ t: 'set', ...p });
    },
    stop() { stopped = true; clearInterval(hb); clearInterval(leftIv); ws?.close(); peer?.close(); game?.stop(); },
  };
}

const verdict = (winner: number | null, reason: string, seat: number) =>
  winner === null ? `Match void (${reason}). Stakes and bets refunded.` : winner === seat ? `You win (${reason})` : `You lose (${reason})`;

// Watch a live fight: replay the server's confirmed input tape with the same sim. Small jitter buffer.
export function startSpectate(canvas: HTMLCanvasElement, code: string, hooks: Hooks & { info?: (spec: any) => void } = {}, account?: string | null) {
  const sock = new WebSocket(SERVER);
  let game: ReturnType<typeof loop> | null = null;
  const queue: number[][] = [];
  let buffering = true;
  sock.onopen = () => sock.send(JSON.stringify({ t: 'watch', code, account: account || undefined }));
  sock.onerror = () => hooks.status?.(`Can't reach server ${SERVER}`);
  sock.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'error') hooks.status?.(m.msg);
    else if (roomMsg(m, hooks)) return;
    else if (m.t === 'spec') {
      hooks.info?.(m);
      game?.stop(); queue.length = 0; buffering = true; // fresh spec (room went live with final DNA): rebuild
      const players = m.players.map(toPlayer);
      if (players.length < 2) { hooks.status?.('Waiting for a challenger…'); players.push({ name: '???', dna: players[0].dna }); }
      game = loop(canvas, players, -2, STAGE_IDS.includes(m.stage) ? m.stage : 'ember', hooks);
      // Catch up instantly on everything played so far, then stream.
      queue.push(...m.frames);
      game.feed((advance) => {
        if (buffering && queue.length < 12 && m.status === 'live') return; // ~200 ms cushion
        buffering = false;
        const n = queue.length > 60 ? queue.length - 30 : queue.length > 20 ? 2 : queue.length ? 1 : 0;
        for (let i = 0; i < n; i++) advance(queue.shift()!);
        if (!queue.length) buffering = true;
      });
      hooks.started?.(players, -2);
    } else if (m.t === 'frames') queue.push(...m.ins);
    else if (m.t === 'over') { hooks.over?.(m.winner, m.reason); if (m.reason !== 'ko') game?.setBanner(m.winner === null ? 'Match void, bets refunded' : `Winner by ${m.reason}`); }
  };
  return {
    chat(text: string) { if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ t: 'chat', text })); },
    stop() { sock.close(); game?.stop(); },
  };
}

// Recorded tape on the normal renderer. speed = frames per 60 Hz tick (0 = paused).
export function startReplay(canvas: HTMLCanvasElement, players: Player[], stage: StageId, frames: number[], hooks: Hooks = {}) {
  const game = loop(canvas, players, -2, stage, hooks);
  const ctl = { speed: 1, at: 0, stop: game.stop };
  game.feed((advance) => { for (let k = 0; k < ctl.speed && ctl.at < frames.length; k++) advance(unpack(frames[ctl.at++])); });
  hooks.started?.(players, -2);
  return ctl;
}

// human: you drive P1 with keyboard/pad/touch (practice, or ?play on demo fights)
export function startBotFight(canvas: HTMLCanvasElement, players: Player[], stage: StageId, hooks: Hooks = {}, human = params.has('play')) {
  const game = loop(canvas, players, human ? 0 : -2, stage, hooks);
  game.feed((advance, s) => advance([human ? readInput() : bot(s, 0), bot(s, 1)]));
  hooks.started?.(players, -2);
  return game;
}
