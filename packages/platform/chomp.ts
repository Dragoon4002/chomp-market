// React-free Solana core: wallet store (burner / bridge / injected e.g. Privy), chomp program helpers.
// The market imports this file directly (its React copy differs from the game clients'), so keep React out.
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import bs58 from 'bs58';

export const NETWORK = 'devnet' as const;
export const RPC: string = process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://api.devnet.solana.com';
export const ER_RPC: string = process.env.NEXT_PUBLIC_ER_RPC || 'https://devnet.magicblock.app';
export const CHOMP_ID: string = process.env.NEXT_PUBLIC_CHOMP_ID || '4m5U9NJaLNyDzZj926jE9Y9nvKYJf82MQEcabbbGqcNf';
export const PET_DEN_ID: string = process.env.NEXT_PUBLIC_PET_DEN_ID || '2shkiB14DfoCSKawmYMv3qsGTBCxuN4onKQuztYyG2ue';
export const SEALED_HOUSE_ID: string = process.env.NEXT_PUBLIC_SEALED_HOUSE_ID || 'FGYiydgg6XWauRUq9eyMwHFuwJjG5TM2ndLNQVEJjfR4';
export const MARKET_URL: string = process.env.NEXT_PUBLIC_MARKET_URL ?? 'http://localhost:3100';
export const SYSTEM_ID = '11111111111111111111111111111111';
export { bs58 }; // signBytes → bs58.encode(sig) for game-server seat auth

export type Ix = { programId: string; keys: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string /* base64 */ };
export interface Wallet {
  signedAccountId: string; // base58 pubkey, '' = signed out
  loading: boolean;
  network: typeof NETWORK;
  kind: 'burner' | 'privy' | 'bridge' | '';
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  getBalance(account: string): Promise<bigint>; // lamports
  sendIxs(ixs: Ix[], opts?: { er?: boolean }): Promise<string>;
  signBytes(msg: Uint8Array): Promise<Uint8Array>; // 64-byte ed25519
}

// ---- amounts (lamports) ----
export const UNIT = 'SOL';
export const toLamports = (amount: string | number) => {
  const [i, f = ''] = String(amount).split('.');
  return (BigInt(i || '0') * 1_000_000_000n + BigInt((f + '000000000').slice(0, 9))).toString();
};
export const fmt = (lamports: string | bigint | undefined | null) => {
  if (lamports == null) return '0';
  const n = Number(BigInt(lamports)) / 1e9;
  return n === 0 ? '0' : n < 0.01 ? n.toPrecision(2) : n.toFixed(n < 10 ? 3 : 2).replace(/\.?0+$/, '');
};

// tx done -> every balance view refetches
export const bus = new EventTarget();
export const balanceChanged = () => bus.dispatchEvent(new Event('bal'));

// ---- wallet store ----
export const SIGNED_OUT: Wallet = {
  signedAccountId: '', loading: false, network: NETWORK, kind: '',
  signIn: () => connectBurner(), signOut: async () => {},
  getBalance: (a) => balance(a),
  sendIxs: () => Promise.reject(new Error('Connect a wallet first')),
  signBytes: () => Promise.reject(new Error('Connect a wallet first')),
};
let cur = SIGNED_OUT;
const subs = new Set<() => void>();
export const getWallet = () => cur;
export const subscribe = (f: () => void) => (subs.add(f), () => { subs.delete(f); });
export const setWallet = (w: Wallet) => { cur = w; subs.forEach((f) => f()); }; // hook point: market injects its Privy wallet here
export const KIND_KEY = 'chomp:wallet'; // last chosen wallet kind, so reloads reconnect

export const conn = (er?: boolean) => new Connection(er ? ER_RPC : RPC, 'confirmed');
export const balance = async (account: string) => BigInt(await conn().getBalance(new PublicKey(account)));

const toIx = (i: Ix) => new TransactionInstruction({
  programId: new PublicKey(i.programId),
  keys: i.keys.map((k) => ({ pubkey: new PublicKey(k.pubkey), isSigner: !!k.isSigner, isWritable: !!k.isWritable })),
  data: fromB64(i.data) as Buffer, // web3.js only bs58-encodes it; plain Uint8Array is fine (no Buffer global in browsers)
});
// Build legacy tx with payer as fee payer, let `sign` sign the serialized bytes, send + confirm. Shared by burner and Privy.
export async function sendTx(payer: string, ixs: Ix[], er: boolean, sign: (tx: Uint8Array) => Promise<Uint8Array>) {
  const c = conn(er);
  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash();
  const tx = new Transaction({ feePayer: new PublicKey(payer), blockhash, lastValidBlockHeight }).add(...ixs.map(toIx));
  const raw = await sign(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
  const sig = await c.sendRawTransaction(raw).catch((e) => { // preflight failed: lead with the program's error log line
    const l = (e?.logs as string[] | undefined)?.find((x) => /error/i.test(x));
    throw l ? new Error(l) : e;
  });
  try {
    const r = await c.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    if (r.value.err) { // surface the program's own error line (AnchorError …) when the logs are reachable
      const logs = (await c.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }).catch(() => null))?.meta?.logMessages ?? [];
      throw new Error(`tx ${sig} failed: ${logs.find((l) => /error/i.test(l)) ?? JSON.stringify(r.value.err)}`);
    }
  } finally { balanceChanged(); }
  return sig;
}

export const toB64 = (b: Uint8Array) => btoa(Array.from(b, (c) => String.fromCharCode(c)).join(''));
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// WebCrypto Ed25519 (Chrome 137+, Firefox, Safari, Node 20+): seed → PKCS#8 → detached 64-byte sig
async function ed25519Sign(seed: Uint8Array, msg: Uint8Array) {
  const pkcs8 = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20, ...seed]);
  const key = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('Ed25519', key, msg as BufferSource));
}

// ---- burner: Keypair in localStorage (devnet only; anyone with this browser profile holds the key) ----
const BURNER = 'chomp:burner';
export function burnerKey(create = false): Keypair | null {
  const s = localStorage.getItem(BURNER);
  if (s) return Keypair.fromSecretKey(bs58.decode(s));
  if (!create) return null;
  const kp = Keypair.generate();
  localStorage.setItem(BURNER, bs58.encode(kp.secretKey));
  return kp;
}
const burnerWallet = (kp: Keypair): Wallet => ({
  signedAccountId: kp.publicKey.toBase58(), loading: false, network: NETWORK, kind: 'burner',
  signIn: async () => {},
  signOut: async () => { localStorage.removeItem(KIND_KEY); setWallet(SIGNED_OUT); }, // key kept: burner funds survive log out
  getBalance: (a) => balance(a),
  sendIxs: (ixs, o) => sendTx(kp.publicKey.toBase58(), ixs, !!o?.er, async (b) => { const t = Transaction.from(b); t.partialSign(kp); return t.serialize(); }),
  signBytes: (m) => ed25519Sign(kp.secretKey.subarray(0, 32), m),
});
export async function connectBurner() {
  const kp = burnerKey(true)!;
  localStorage.setItem(KIND_KEY, 'burner');
  setWallet(burnerWallet(kp));
}

// ---- bridge: inside the portal iframe, the portal's wallet signs (protocol: tasks/devnet-spec.md §3) ----
function bridgeWallet(): Wallet {
  let n = 0;
  const pending = new Map<number, [(v: any) => void, (e: Error) => void]>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const req = <T,>(method: string, params?: unknown) => new Promise<T>((res, rej) => {
    const id = ++n;
    // connect waits on a human login (email OTP, wallet popup): give it 5 min
    const t = setTimeout(() => { pending.delete(id); rej(new Error(`portal ${method} timed out`)); }, method === 'connect' ? 300_000 : 60_000);
    pending.set(id, [(v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }]);
    parent.postMessage({ chomp: 1, type: 'req', data: { id, method, params } }, '*');
  });
  addEventListener('message', (e) => {
    if (e.source !== parent || e.data?.chomp !== 1) return;
    const d = e.data.data;
    if (e.data.type === 'session') setWallet({ ...cur, signedAccountId: d?.wallet || '' });
    if (e.data.type !== 'res' || !pending.has(d?.id)) return;
    const [ok, err] = pending.get(d.id)!;
    pending.delete(d.id);
    if (d.ok) ok(d.value); else err(new Error(d.error || 'portal error'));
  });
  return {
    signedAccountId: '', loading: false, network: NETWORK, kind: 'bridge',
    // abandoned/failed login = still signed out, not an uncaught error in the game
    signIn: async () => { const r = await req<{ wallet: string }>('connect').catch(() => null); if (r?.wallet) setWallet({ ...cur, signedAccountId: r.wallet }); },
    signOut: async () => {}, // portal owns the wallet
    getBalance: async (a) => BigInt((await req<{ value: number }>('rpc', { method: 'getBalance', params: [a] })).value),
    sendIxs: (ixs, o) => req<string>('tx', { ixs, er: !!o?.er }).finally(balanceChanged),
    // ponytail: bridge `sign` takes utf8 text (spec), so non-utf8 bytes get mangled; seat-auth messages are text
    signBytes: async (m) => bs58.decode(await req<string>('sign', { message: new TextDecoder().decode(m) })),
  };
}

if (typeof window !== 'undefined') {
  if (window.parent !== window) cur = bridgeWallet();
  else try { const kp = localStorage.getItem(KIND_KEY) === 'burner' && burnerKey(); if (kp) cur = burnerWallet(kp); } catch { /* storage blocked */ }
}

// ---- chomp program ----
const u64 = (v: bigint | number | string) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(v), true); return b; };
const utf8 = (s: string) => new TextEncoder().encode(s);
const pk = (s: string) => new PublicKey(s).toBytes();
const b64 = (...parts: Uint8Array[]) => toB64(Uint8Array.from(parts.flatMap((p) => Array.from(p))));
const DISC = { // sha256("global:<ix>")[..8]
  openMatch: [208, 231, 100, 44, 102, 12, 220, 99], joinMatch: [244, 8, 47, 130, 192, 59, 179, 44],
  settle: [175, 42, 185, 87, 144, 131, 102, 212], cancel: [232, 219, 223, 41, 219, 236, 220, 190],
  submitScore: [212, 128, 45, 22, 112, 82, 85, 235],
};
const d = (k: keyof typeof DISC) => Uint8Array.from(DISC[k]);
const ACC_MATCH = '236,63,169,38,15,56,196,162', ACC_SCORE = '187,110,62,119,232,235,185,90'; // sha256("account:<Name>")[..8]

export const findPda = (programId: string, seeds: Uint8Array[]) => {
  const [a, bump] = PublicKey.findProgramAddressSync(seeds, new PublicKey(programId));
  return { address: a.toBase58(), bump };
};
const chompPda = (...seeds: Uint8Array[]) => findPda(CHOMP_ID, seeds).address;
export const pda = {
  config: () => chompPda(utf8('config')),
  game: (slug: string) => chompPda(utf8('game'), utf8(slug)),
  match: (slug: string, id: bigint | number) => chompPda(utf8('match'), pk(pda.game(slug)), u64(id)),
  score: (slug: string, player: string) => chompPda(utf8('score'), pk(pda.game(slug)), pk(player)),
};
const k = (pubkey: string, isSigner = false, isWritable = false) => ({ pubkey, isSigner, isWritable });
const mk = (keys: Ix['keys'], data: string): Ix => ({ programId: CHOMP_ID, keys, data });
type Amt = bigint | number | string;
export const ix = {
  openMatch: (a: string, slug: string, id: Amt, stake: Amt) =>
    mk([k(a, true, true), k(pda.game(slug)), k(pda.match(slug, BigInt(id)), false, true), k(SYSTEM_ID)], b64(d('openMatch'), u64(id), u64(stake))),
  joinMatch: (b: string, slug: string, id: Amt) =>
    mk([k(b, true, true), k(pda.match(slug, BigInt(id)), false, true), k(SYSTEM_ID)], b64(d('joinMatch'))),
  // winner: 0 = a, 1 = b, 2 = draw/refund
  settle: (referee: string, slug: string, id: Amt, winner: 0 | 1 | 2, a: string, b: string) =>
    mk([k(referee, true), k(pda.game(slug)), k(pda.match(slug, BigInt(id)), false, true), k(a, false, true), k(b, false, true), k(pda.config(), false, true)], b64(d('settle'), Uint8Array.of(winner))),
  // b = null while the seat is open
  cancel: (caller: string, slug: string, id: Amt, a: string, b: string | null) =>
    mk([k(caller, true), k(pda.match(slug, BigInt(id)), false, true), k(a, false, true), b ? k(b, false, true) : k(SYSTEM_ID)], b64(d('cancel'))),
  // tape: 32 bytes (zeros if none)
  submitScore: (player: string, slug: string, score: Amt, tape: Uint8Array = new Uint8Array(32)) => {
    if (tape.length !== 32) throw new Error('tape must be 32 bytes');
    return mk([k(player, true, true), k(pda.game(slug)), k(pda.score(slug, player), false, true), k(SYSTEM_ID)], b64(d('submitScore'), u64(score), tape));
  },
};

const disc = (b: Uint8Array) => Array.from(b.subarray(0, 8)).join(',');
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const b58at = (b: Uint8Array, o: number) => new PublicKey(b.subarray(o, o + 32)).toBase58();
// null = no account (finished/never opened)
// Open (unsettled) match ids of `slug` where `me` sits in seat a or b. Lets reclaim lists survive reloads in the
// sandboxed portal iframe (no localStorage). Match = 8 disc | game 32 | id 8 | a 32 | b 32 | stake 8 | created 8 | bump 1.
export async function myMatches(slug: string, me: string): Promise<number[]> {
  const game = pda.game(slug);
  const found = await Promise.all([48, 80].map((offset) => conn().getProgramAccounts(new PublicKey(CHOMP_ID), {
    dataSlice: { offset: 40, length: 8 },
    filters: [{ dataSize: 129 }, { memcmp: { offset: 8, bytes: game } }, { memcmp: { offset, bytes: me } }],
  })));
  return [...new Set(found.flat().map((a) => Number(view(a.account.data).getBigUint64(0, true))))];
}

export async function readMatch(slug: string, id: bigint | number) {
  const acc = await conn().getAccountInfo(new PublicKey(pda.match(slug, id)));
  if (!acc || disc(acc.data) !== ACC_MATCH) return null;
  const v = view(acc.data); // 8 disc | game 32 | id 8 | a 32 | b 32 | stake 8 | created 8 | bump 1
  const b = b58at(acc.data, 80);
  return { a: b58at(acc.data, 48), b: b === SYSTEM_ID ? null : b, stake: v.getBigUint64(112, true), created: Number(v.getBigInt64(120, true)) };
}
export async function readScore(slug: string, player: string) {
  const acc = await conn().getAccountInfo(new PublicKey(pda.score(slug, player)));
  if (!acc || disc(acc.data) !== ACC_SCORE) return null;
  const v = view(acc.data); // 8 disc | best 8 | last 8 | plays 4 | tape 32 | bump 1
  return { best: v.getBigUint64(8, true), last: v.getBigUint64(16, true), plays: v.getUint32(24, true), tape: Array.from(acc.data.subarray(28, 60), (x) => x.toString(16).padStart(2, '0')).join('') };
}
// < 2^53 so game servers can pass it as a JSON number
export const randomMatchId = () => { const [h, l] = crypto.getRandomValues(new Uint32Array(2)); return (BigInt(h & 0x1fffff) << 32n) | BigInt(l); };

// POST {pubkey} → { sig } (throws the faucet's error message)
export async function requestFaucet(pubkey: string, base = MARKET_URL): Promise<string> {
  const r = await fetch(`${base}/api/faucet`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `faucet ${r.status}`);
  balanceChanged();
  return j.sig;
}
