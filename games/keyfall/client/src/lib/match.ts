import { useEffect, useRef, useState } from 'react';
import { COUNTDOWN_MS, DT_MS, DURATION_MS, Sim, loadWords, type Fx, type View } from './game.ts';

// view = latest snapshot, at = performance.now() when it arrived (renderer extrapolates ents by vx/vy).
// fx arrive inside views; they are also queued here, takeFx() drains them once per render.
export type Match = { view: View | null; at: number; seat: 0 | 1 | -1; code: string | null; matchId: number | null; error: string | null; send(c: string): void; takeFx(): Fx[]; leave(): void; chat?: ChatLine[]; say?(text: string): void };
export type ChatLine = { from: string; seat: 0 | 1; text: string; ts: number };
export type OnlineReq = { kind: 'host' | 'join'; name: string; code?: string; matchId?: number; account?: string; sign?: (matchId: number, nonce: string) => Promise<{ publicKey: string; signature: string }> };
type Snap = { view: View; at: number } | null;

const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
export const SERVER: string = params.get('server') ?? process.env.NEXT_PUBLIC_SERVER_URL ?? 'ws://localhost:8789';
const GRACE_MS = 15_000;
const KEY = 'keyfall:seat';
type Saved = { code: string; token: string; matchId: number | null; at: number };
const load = (): Saved | null => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); } catch { return null; } };
const save = (s: Saved | null) => { try { if (s) sessionStorage.setItem(KEY, JSON.stringify(s)); else sessionStorage.removeItem(KEY); } catch { /* no storage */ } };

// Solo practice vs the waves (like the original game): 3 s countdown, then the Sim at 50 Hz.
export function useLocalMatch(opts: { name: string } | null): Match {
  const [snap, setSnap] = useState<Snap>(null);
  const [error, setError] = useState<string | null>(null);
  const sim = useRef<Sim | null>(null);
  const live = useRef(false);
  const fxq = useRef<Fx[]>([]);
  const stop = useRef(() => {});
  const on = !!opts, name = opts?.name ?? '';
  useEffect(() => {
    if (!on) return;
    let iv: ReturnType<typeof setInterval> | undefined, dead = false;
    stop.current = () => { dead = true; clearInterval(iv); };
    loadWords().then((words) => {
      if (dead) return;
      const s = new Sim(words, (Math.random() * 2 ** 32) >>> 0, name || 'You');
      sim.current = s; live.current = false; fxq.current = [];
      const t0 = performance.now();
      let steps = 0;
      const tick = () => {
        const now = performance.now(), el = now - t0 - COUNTDOWN_MS;
        if (el < 0) return setSnap({ view: { ...s.view(), phase: 'count', count_ms: Math.ceil(-el), left_ms: DURATION_MS }, at: now });
        live.current = true;
        const due = Math.floor(el / DT_MS);
        steps = Math.max(steps, due - 10); // ponytail: catch up at most 200 ms after a stall (background tab), drop the rest
        while (steps < due && !s.over()) { s.step(); steps++; }
        const v = s.view();
        fxq.current.push(...v.fx);
        setSnap({ view: v, at: now });
        if (s.over()) clearInterval(iv);
      };
      iv = setInterval(tick, DT_MS);
      tick();
    }, (e) => setError(String(e?.message ?? e)));
    return () => { stop.current(); sim.current = null; };
  }, [on, name]);
  return {
    view: snap?.view ?? null, at: snap?.at ?? 0, seat: 0, code: null, matchId: null, error,
    send: (c) => { const s = sim.current; if (s && live.current) s.key(c); },
    takeFx: () => fxq.current.splice(0),
    leave: () => { stop.current(); sim.current = null; setSnap(null); },
  };
}

export function useOnlineMatch(req: OnlineReq | null): Match {
  const [snap, setSnap] = useState<Snap>(null);
  const fxq = useRef<Fx[]>([]);
  const [seat, setSeat] = useState<0 | 1 | -1>(-1);
  const [code, setCode] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const ws = useRef<WebSocket | null>(null);
  const stop = useRef(() => {});
  const key = req && JSON.stringify([req.kind, req.name, req.code, req.matchId, req.account]);
  const sign = useRef(req?.sign);
  sign.current = req?.sign;

  useEffect(() => {
    if (!req) return;
    let stopped = false, done = false, dropAt = 0;
    // reload into a live seat: reuse the stored token if it's for this room/match and still in grace
    const prev = load();
    let seated: Saved | null = prev && Date.now() - prev.at < GRACE_MS &&
      (req.kind === 'join' ? prev.code.toUpperCase() === req.code?.toUpperCase() : req.matchId != null && prev.matchId === req.matchId) ? prev : null;

    const connect = () => {
      if (stopped) return;
      const sock = new WebSocket(SERVER);
      ws.current = sock;
      const enter = async (nonce: string) => {
        if (seated) return sock.send(JSON.stringify({ t: 'rejoin', code: seated.code, token: seated.token }));
        let auth;
        if (req.matchId != null && req.sign) {
          try { auth = await sign.current!(req.matchId, nonce); } catch { return setError('Wallet signature needed to take your seat.'); }
        }
        const base = { name: req.name, account: req.account, auth };
        sock.send(JSON.stringify(req.kind === 'host' ? { t: 'host', ...base, matchId: req.matchId } : { t: 'join', ...base, code: req.code }));
      };
      let nonce = '';
      sock.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.t === 'hello') { nonce = m.nonce; void enter(nonce); }
        else if (m.t === 'room') {
          dropAt = 0; setError(null);
          setCode(m.code); setSeat(m.seat); setMatchId(m.matchId ?? null);
          seated = { code: m.code, token: m.token, matchId: m.matchId ?? null, at: Date.now() };
          save(seated);
        } else if (m.t === 'chatlog') setChat(m.lines ?? []);
        else if (m.t === 'chat') { const { t: _, ...l } = m; setChat((c) => [...c.slice(-49), l]); } // server keeps 50 too
        else if (m.t === 'state') {
          dropAt = 0;
          const { t: _, ...v } = m;
          fxq.current.push(...(v.fx ?? []));
          setSnap({ view: v, at: performance.now() });
          if (seated) { seated.at = Date.now(); save(seated); }
        } else if (m.t === 'over') {
          done = true; save(null);
          const { t: _, ...v } = m;
          fxq.current.push(...(v.fx ?? []));
          setSnap({ view: v, at: performance.now() });
        } else if (m.t === 'error') {
          setError(m.msg);
          if (seated && !done && dropAt === 0 && seated === prev) { seated = null; save(null); void enter(nonce); } // stale token from reload: enter fresh
        }
      };
      sock.onclose = () => {
        if (stopped || done || ws.current !== sock) return;
        if (!seated) return setError('Lost connection to the server.');
        dropAt ||= Date.now();
        if (Date.now() - dropAt > GRACE_MS) return setError('Lost connection to the server.');
        setError('Reconnecting…');
        setTimeout(connect, 1000);
      };
    };
    connect();
    stop.current = () => { stopped = true; ws.current?.close(); ws.current = null; save(null); };
    return () => { stopped = true; ws.current?.close(); ws.current = null; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    view: snap?.view ?? null, at: snap?.at ?? 0, seat, code, matchId, error,
    send: (c) => { if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ t: 'k', c })); },
    takeFx: () => fxq.current.splice(0),
    leave: () => stop.current(),
    chat,
    say: (text) => { if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ t: 'chat', text })); },
  };
}

// Room info before joining (stake to match, host name). Short-lived socket.
export function peek(code: string): Promise<{ code: string; matchId: number | null; stake: string; host: string; full: boolean }> {
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(SERVER);
    const end = (f: () => void) => { clearTimeout(to); sock.onclose = null; sock.close(); f(); };
    const to = setTimeout(() => end(() => reject(new Error("Can't reach server"))), 5000);
    sock.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'hello') sock.send(JSON.stringify({ t: 'peek', code }));
      else if (m.t === 'peek') end(() => resolve({ code: m.code, matchId: m.matchId ?? null, stake: m.stake ?? '0', host: m.host, full: !!m.full }));
      else if (m.t === 'error') end(() => reject(new Error(m.msg)));
    };
    sock.onclose = () => end(() => reject(new Error("Can't reach server")));
  });
}
