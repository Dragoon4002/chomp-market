import { useMemo } from 'react';
import { PLATFORM_ID, usePlatform } from '@xyz/platform';
import { commitOf, flip, hex } from '@/lib/flip.ts';

export type Side = 0 | 1; // 0 heads, 1 tails
export type Room = {
  matchId: number; host: string; guest?: string; stake: string; side: Side; commit: string;
  status: 'open' | 'live' | 'done'; result?: Side; seed?: string; clientSeed?: string; winner?: Side; bot?: boolean;
  createdMs: number;
};
export type Api = {
  demo: boolean; me: string | null;
  listRooms(): Promise<Room[]>;
  createRoom(side: Side, stakeYocto: string): Promise<number>;
  joinRoom(matchId: number): Promise<void>;
  cancelRoom(matchId: number): Promise<void>;
  watchRoom(matchId: number, cb: (r: Room | null) => void): () => void; // returns stop
  chat(matchId: number, cb: (lines: Line[]) => void): () => void; // returns stop
  say(matchId: number, from: string, text: string): Promise<void>; // rejects on 429 / bad room
};
export type Line = { from: string; text: string; ts: number };

const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
export const BOT_MS = q.has('fast') ? 5_000 : 60_000;
export const FEE_BPS = 10; // ponytail: mirrors contract default; read config().fee_bps if it changes
const SERVER_URL = q.get('server') ?? 'http://localhost:8790';
const GAME = 'coinflip';
const ONE_YOCTO = '1';
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
  const r = await open('whale.near', 0, '1500000000000000000000000');
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
  open('alice.testnet', 0, '500000000000000000000000'),
  open('degen.near', 1, '2000000000000000000000000'),
  open('free-roller.testnet', 1, '0'),
  showcase(),
]);

const demoApi: Api = {
  demo: true, me: ME,
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

/* ---------- live: platform contract + coinflip server ---------- */
type MatchView = { id: number; host: string; guest: string | null; stake: string; status: string; winner: number | null; created_ms: number };
// TODO backend: server room shape may shift
type ServerRoom = { matchId: number; side: Side; commit: string; result?: Side; seed?: string; clientSeed?: string; bot?: boolean };

const getJson = <T,>(path: string, body?: unknown): Promise<T> =>
  fetch(SERVER_URL + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${path}: ${r.status}`))));

const merge = (m: MatchView, s?: ServerRoom): Room => ({
  matchId: m.id, host: m.host, guest: m.guest ?? undefined, stake: m.stake, createdMs: m.created_ms,
  side: s?.side ?? 0, commit: s?.commit ?? '', result: s?.result, seed: s?.seed, clientSeed: s?.clientSeed, bot: s?.bot,
  status: m.status === 'open' ? 'open' : m.status === 'live' ? 'live' : 'done', // refund = done w/o winner
  winner: m.winner == null ? undefined : (m.winner as Side),
});

export function useApi(): Api {
  const p = usePlatform();
  const me = p.w.signedAccountId || null;
  return useMemo(() => {
    if (q.has('demo') || !me) return demoApi;
    // NEP-413 auth, nonce = sha256(message)
    const auth = async (message: string) => {
      const nonce = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message)));
      const s = await p.w.signNEP413Message({ message, recipient: PLATFORM_ID, nonce });
      return { publicKey: String(s.publicKey), signature: String(s.signature) };
    };
    const flipped = new Set<number>();
    const get = async (id: number) => {
      const [m, s] = await Promise.all([p.view<MatchView | null>('get_match', { match_id: id }), getJson<ServerRoom>(`/room/${id}`).catch(() => undefined)]);
      return m && merge(m, s);
    };
    return {
      demo: false, me,
      listRooms: async () => {
        const [ms, ss] = await Promise.all([
          p.view<MatchView[]>('list_matches', { from: 0, limit: 50, game: GAME }),
          getJson<ServerRoom[]>('/rooms').catch(() => []),
        ]);
        const byId = new Map(ss.map((s) => [s.matchId, s]));
        return ms.filter((m) => m.status === 'open').map((m) => merge(m, byId.get(m.id)));
      },
      createRoom: async (side, stake) => {
        const id = Number(await p.call('create_match', { game: GAME, stake, bettable: false, monster_id: null }, ONE_YOCTO));
        await getJson('/room', { matchId: id, account: me, side, auth: await auth(`${GAME}:${id}:${side}`) });
        return id;
      },
      joinRoom: async (id) => { await p.call('join_match', { match_id: id, monster_id: null }, ONE_YOCTO); },
      cancelRoom: async (id) => { await p.call('cancel_match', { match_id: id }); },
      watchRoom: (id, cb) => poll(async () => {
        const r = await get(id);
        // seated + live + no result yet -> send our client seed once. TODO backend: who seeds may shift
        if (r?.status === 'live' && r.result == null && (r.host === me || r.guest === me) && !flipped.has(id)) {
          flipped.add(id);
          const clientSeed = hex(rand(8));
          getJson('/flip', { matchId: id, account: me, clientSeed, auth: await auth(`${GAME}:${id}:${clientSeed}`) }).catch(() => flipped.delete(id));
        }
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
