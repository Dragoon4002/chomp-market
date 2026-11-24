import { useMemo } from 'react';
import { balanceChanged, bs58, ix, myMatches, randomMatchId, readMatch, useWallet } from '@xyz/platform';
import { commitOf, flip, hex } from '@/lib/flip.ts';
import { type Reclaim, reclaims, remember } from '@/lib/stakes.ts';

export type Side = 0 | 1; // 0 heads, 1 tails
export type Room = {
  matchId: number; host: string; guest?: string; stake: string; side: Side; commit: string;
  status: 'open' | 'live' | 'done'; result?: Side; seed?: string; clientSeed?: string; winner?: Side; bot?: boolean;
  createdMs: number;
};
export type Api = {
  demo: boolean; me: string | null;
  listRooms(): Promise<Room[]>;
  createRoom(side: Side, stakeLamports: string): Promise<number>;
  joinRoom(matchId: number): Promise<void>;
  cancelRoom(matchId: number): Promise<void>;
  watchRoom(matchId: number, cb: (r: Room | null) => void): () => void; // returns stop
  chat(matchId: number, cb: (lines: Line[]) => void): () => void; // returns stop
  say(matchId: number, from: string, text: string): Promise<void>; // rejects on 429 / bad room
  reclaims(): Promise<Reclaim[]>; // stuck stakes from matches this browser opened/joined
  reclaim(r: Reclaim): Promise<void>;
};
export type Line = { from: string; text: string; ts: number };

const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
export const BOT_MS = q.has('fast') ? 5_000 : 60_000;
export const FEE_BPS = 250; // ponytail: mirrors chomp Config.fee_bps; read the Config PDA if it changes
// Under the portal (/g/) the market proxies /g/coinflip-ws -> :8791. location.origin is "null" in the sandboxed iframe, so build it.
const SERVER_URL = q.get('server') ?? (typeof location !== 'undefined' && location.pathname.startsWith('/g/') ? `${location.protocol}//${location.host}/g/coinflip-ws` : 'http://localhost:8791');
const GAME = 'coinflip';
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));

const poll = <T,>(f: () => Promise<T>, cb: (r: T) => void) => {
  let on = true;
  const tick = () => f().then((r) => on && cb(r)).catch(() => {}).finally(() => on && setTimeout(tick, 1000));
  tick();
  return () => { on = false; };
};

/* ---------- demo: all local ---------- */
const rooms = new Map<number, Room>();
let nextId = 100;
const ME = 'you.demo';
const seeds = new Map<number, Uint8Array>();

async function open(host: string, side: Side, stake: string) {
  const seed = rand(32);
  const r: Room = { matchId: nextId++, host, side, stake, commit: await commitOf(seed), status: 'open', createdMs: Date.now() };
  rooms.set(r.matchId, r);
  seeds.set(r.matchId, seed);
  return r;
}
async function settle(id: number) {
  const r = rooms.get(id), seed = seeds.get(id);
  if (!r || !seed || r.status !== 'live') return;
  const clientSeed = hex(rand(8));
  const result = await flip(seed, clientSeed);
  rooms.set(id, { ...r, status: 'done', result, seed: hex(seed), clientSeed, winner: result === r.side ? 0 : 1 });
}
// in-play showcase: someone vs house bot, settles when first watched, then a fresh one appears
const showcase = async () => {
  const r = await open('whale.sol', 0, '1500000000');
  rooms.set(r.matchId, { ...r, guest: 'house-bot', bot: true, status: 'live' });
};
const watched = new Set<number>();
const chats = new Map<number, Line[]>();
const post = (id: number, from: string, text: string) => {
  const old = chats.get(id) ?? [];
  chats.set(id, [...old, { from, text, ts: Math.max(Date.now(), (old.at(-1)?.ts ?? 0) + 1) }].slice(-50));
  return old.length === 0;
};
const seeded = Promise.all([
  open('alice.testnet', 0, '500000000'),
  open('degen.sol', 1, '2000000000'),
  open('free-roller.testnet', 1, '0'),
  showcase(),
]);

const demoApi: Api = {
  demo: true, me: ME,
  reclaims: async () => [], reclaim: async () => {},
  listRooms: async () => { await seeded; return [...rooms.values()].filter((r) => r.status !== 'done').reverse(); },
  createRoom: async (side, stake) => {
    const r = await open(ME, side, stake);
    setTimeout(() => {
      const cur = rooms.get(r.matchId);
      if (cur?.status !== 'open') return;
      rooms.set(r.matchId, { ...cur, guest: 'house-bot', bot: true, status: 'live' });
      setTimeout(() => settle(r.matchId), 1500);
    }, BOT_MS);
    return r.matchId;
  },
  joinRoom: async (id) => {
    const r = rooms.get(id);
    if (r?.status !== 'open') throw new Error('room gone');
    rooms.set(id, { ...r, guest: ME, status: 'live' });
    setTimeout(() => settle(id), 1500);
  },
  cancelRoom: async (id) => { rooms.delete(id); },
  watchRoom: (id, cb) => {
    const r = rooms.get(id);
    if (r?.status === 'live' && r.host !== ME && r.guest !== ME && !watched.has(id)) {
      watched.add(id);
      setTimeout(() => settle(id).then(showcase), 1500);
    }
    return poll(async () => rooms.get(id) ?? null, cb);
  },
  chat: (id, cb) => poll(async () => chats.get(id) ?? [], cb),
  say: async (id, from, text) => { if (post(id, from, text.slice(0, 200))) setTimeout(() => post(id, 'house-bot', 'gl hf'), 800); },
};

/* ---------- live: chomp program (stake escrow) + coinflip server (commit-reveal, referee settles) ---------- */
type ServerRoom = { matchId: number; side: Side; commit: string; result?: Side; seed?: string; clientSeed?: string; bot?: boolean };
type Chain = { a: string; b: string | null; stake: bigint; created: number };

const getJson = <T,>(path: string, body?: unknown): Promise<T> =>
  fetch(SERVER_URL + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)
    .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => null))?.error ?? `${path}: ${r.status}`))));

// Match account is closed on settle/cancel, so the last seen chain view is kept for finished rooms.
const seen = new Map<number, Chain>();
const merge = (id: number, m: Chain | null, s?: ServerRoom): Room | null => {
  if (m) seen.set(id, m);
  const c = m ?? seen.get(id);
  if (!c) return null;
  return {
    matchId: id, host: c.a, guest: c.b ?? undefined, stake: String(c.stake), createdMs: c.created * 1000,
    side: s?.side ?? 0, commit: s?.commit ?? '', result: s?.result, seed: s?.seed, clientSeed: s?.clientSeed, bot: s?.bot,
    status: !m ? 'done' : m.b ? 'live' : 'open', // gone = settled or cancelled
    winner: s?.result == null ? undefined : ((s.result === s.side ? 0 : 1) as Side),
  };
};

export function useApi(): Api {
  const w = useWallet();
  const me = w.signedAccountId || null;
  return useMemo(() => {
    if (q.has('demo') || !me) return demoApi;
    const sig = async (message: string) => bs58.encode(await w.signBytes(new TextEncoder().encode(message)));
    const flipped = new Set<number>(), paid = new Set<number>();
    const get = async (id: number) => {
      const [m, s] = await Promise.all([readMatch(GAME, id), getJson<ServerRoom>(`/room/${id}`).catch(() => undefined)]);
      return merge(id, m, s);
    };
    return {
      demo: false, me,
      listRooms: async () => {
        const ss = await getJson<ServerRoom[]>('/rooms');
        const rs = await Promise.all(ss.filter((s) => s.result == null).map((s) => readMatch(GAME, s.matchId).then((m) => merge(s.matchId, m, s))));
        return rs.filter((r): r is Room => r != null && r.status !== 'done'); // live too, so a seated player can get back in after a reload
      },
      createRoom: async (side, stake) => {
        const id = randomMatchId(), n = Number(id);
        remember(GAME, n); // before send: survives reload if the server loses the room
        await w.sendIxs([ix.openMatch(me, GAME, id, stake)]);
        try { await getJson('/room', { matchId: n, account: me, side, sig: await sig(`${GAME}:${n}:${side}`) }); }
        catch (e) { await w.sendIxs([ix.cancel(me, GAME, id, me, null)]).catch(() => {}); throw e; } // server refused: refund
        return n;
      },
      joinRoom: async (id) => { remember(GAME, id); await w.sendIxs([ix.joinMatch(me, GAME, id)]); },
      reclaims: async () => {
        for (const id of await myMatches(GAME, me).catch(() => [])) remember(GAME, id);
        return reclaims(GAME, me, (id) => readMatch(GAME, id));
      },
      reclaim: async (r) => { await w.sendIxs([ix.cancel(me, GAME, r.id, r.m.a, r.m.b)]); balanceChanged(); },
      cancelRoom: async (id) => { await w.sendIxs([ix.cancel(me, GAME, id, me, null)]); },
      watchRoom: (id, cb) => poll(async () => {
        const r = await get(id);
        // seated + live + no result yet -> send our client seed once (first seed wins server-side)
        if (r?.status === 'live' && r.result == null && (r.host === me || r.guest === me) && !flipped.has(id)) {
          flipped.add(id);
          const clientSeed = hex(rand(8));
          getJson('/flip', { matchId: id, account: me, clientSeed, sig: await sig(`${GAME}:${id}:${clientSeed}`) }).catch(() => flipped.delete(id));
        }
        if (r?.status === 'done' && !paid.has(id)) { paid.add(id); balanceChanged(); } // referee paid out
        return r;
      }, cb),
      chat: (id, cb) => {
        let lines: Line[] = [];
        return poll(async () => {
          const n = await getJson<Line[]>(`/chat/${id}?since=${lines.at(-1)?.ts ?? 0}`);
          if (n.length) lines = [...lines, ...n].slice(-50);
          return lines;
        }, cb);
      },
      say: async (id, from, text) => { await getJson(`/chat/${id}`, { from, text }); },
    };
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps
}
