// Tiny dependency-free NEAR client (the agents image has no npm install): views, balances, signed function calls.
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';

const RPC = process.env.NEAR_RPC ?? 'https://test.rpc.fastnear.com';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export const b58decode = (s: string) => {
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(B58.indexOf(c));
  const out: number[] = [];
  while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; }
  for (const c of s) { if (c !== '1') break; out.unshift(0); }
  return Buffer.from(out);
};
export const b58encode = (b: Uint8Array) => {
  let n = BigInt('0x' + (Buffer.from(b).toString('hex') || '0')), s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const x of b) { if (x) break; s = '1' + s; }
  return s;
};

export async function rpc<T = any>(method: string, params: unknown, tries = 6): Promise<T> {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json().catch(() => ({ error: { code: r.status } })) as any;
  if ((r.status === 429 || j.error?.code === -429) && tries > 1) { // public RPC rate limit: back off, same body is safe to resend
    await new Promise((ok) => setTimeout(ok, (7 - tries) * 2000));
    return rpc(method, params, tries - 1);
  }
  if (j.error) throw new Error(JSON.stringify(j.error.data ?? j.error).slice(0, 300));
  if (j.result?.error) throw new Error(String(j.result.error).slice(0, 300));
  return j.result;
}

export async function view<T = any>(contract: string, method: string, args: object = {}): Promise<T> {
  const r = await rpc('query', { request_type: 'call_function', finality: 'optimistic', account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
  return JSON.parse(Buffer.from(r.result).toString());
}

export const balance = async (account: string) => BigInt((await rpc('query', { request_type: 'view_account', finality: 'optimistic', account_id: account })).amount);

// borsh pieces
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u64 = (n: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b; };
const u128 = (n: bigint) => Buffer.concat([u64(n & (2n ** 64n - 1n)), u64(n >> 64n)]);
const str = (s: string) => { const b = Buffer.from(s); return Buffer.concat([u32(b.length), b]); };

export type Action = Buffer;
export const functionCall = (method: string, args: object, deposit: bigint, gas = 100n * 10n ** 12n): Action => {
  const a = Buffer.from(JSON.stringify(args));
  return Buffer.concat([Buffer.from([2]), str(method), u32(a.length), a, u64(gas), u128(deposit)]);
};
export const createAccount = (): Action => Buffer.from([0]);
export const transfer = (deposit: bigint): Action => Buffer.concat([Buffer.from([3]), u128(deposit)]);
export const addFullAccessKey = (pub: Buffer): Action => Buffer.concat([Buffer.from([5, 0]), pub, u64(0n), Buffer.from([1])]);

export function signer(account: string, secret: string) {
  const seed = b58decode(secret.replace('ed25519:', '')).subarray(0, 32);
  const key = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
  const pub = createPublicKey(key).export({ format: 'der', type: 'spki' }).subarray(-32) as Buffer;
  const pk = 'ed25519:' + b58encode(pub);
  let nonce = 0n, chain = Promise.resolve() as Promise<unknown>; // serialize txs per signer so nonces don't race
  const send = async (receiver: string, actions: Action[]) => {
    if (!nonce) nonce = BigInt((await rpc('query', { request_type: 'view_access_key', finality: 'optimistic', account_id: account, public_key: pk })).nonce);
    const block = (await rpc('block', { finality: 'final' })).header.hash;
    nonce++;
    const tx = Buffer.concat([str(account), Buffer.from([0]), pub, u64(nonce), str(receiver), b58decode(block), u32(actions.length), ...actions]);
    const sig = sign(null, createHash('sha256').update(tx).digest(), key);
    const signed = Buffer.concat([tx, Buffer.from([0]), sig]).toString('base64');
    const r = await rpc('send_tx', { signed_tx_base64: signed, wait_until: 'EXECUTED_OPTIMISTIC' }).catch((e) => { nonce = 0n; throw e; });
    const fail = r.receipts_outcome.find((o: any) => o.outcome.status.Failure);
    if (fail) throw new Error(`${r.transaction.hash}: ${JSON.stringify(fail.outcome.status.Failure).slice(0, 300)}`);
    return r.transaction.hash as string;
  };
  return {
    account, pk,
    send: (receiver: string, actions: Action[]) => { const p = chain.then(() => send(receiver, actions)); chain = p.catch(() => {}); return p; },
    call: (contract: string, method: string, args: object, deposit = 0n) => { const p = chain.then(() => send(contract, [functionCall(method, args, deposit)])); chain = p.catch(() => {}); return p; },
  };
}
