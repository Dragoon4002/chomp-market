// node games/sealed-house/program/devnet.mjs   (SOLANA_RPC overrides devnet, DEPLOYER overrides ~/.config/solana/id.json)
// 1) init_house (deployer, funds the buyback treasury) if the House PDA is missing.
// 2) one solo lot through the real adapter (build/chain.js) with a throwaway wallet funded from the deployer:
//    create_lot → VRF fill → commit → reveal + settle → sell back, then sweeps the throwaway back.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { solanaChain, initHouseIx, PROGRAM, HOUSE } from '../build/chain.js';

const RPC = process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com';
const TREASURY = 0.04 * LAMPORTS_PER_SOL, PLAYER = 0.03 * LAMPORTS_PER_SOL;
const conn = new Connection(RPC, 'confirmed');
const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.DEPLOYER ?? `${homedir()}/.config/solana/id.json`, 'utf8'))));

const toIx = (i) => new TransactionInstruction({ programId: new PublicKey(i.programId), keys: i.keys.map((k) => ({ ...k, pubkey: new PublicKey(k.pubkey) })), data: Buffer.from(i.data, 'base64') });
const sendAs = (kp) => async (ixs) => {
  const tx = new Transaction().add(...ixs.map((i) => (i instanceof TransactionInstruction ? i : toIx(i))));
  tx.feePayer = kp.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(kp);
  return conn.sendRawTransaction(tx.serialize()); // preflight throws with program logs
};
const confirm = async (sig) => { await conn.confirmTransaction(sig, 'confirmed'); return sig; };
const rpc = async (method, params) => {
  const r = await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json();
  if (r.error) throw new Error(r.error.message);
  return r.result;
};
const seed = (x) => x.s != null ? Buffer.from(x.s) : x.pk ? new PublicKey(x.pk).toBuffer() : x.u8 != null ? Buffer.from([x.u8])
  : x.u64 != null ? (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(x.u64)); return b; })() : Buffer.from(x.hex, 'hex');
const pda = async (programId, seeds) => { const [a, bump] = PublicKey.findProgramAddressSync(seeds.map(seed), new PublicKey(programId)); return { address: a.toBase58(), bump }; };
const bal = (k) => conn.getBalance(new PublicKey(k));

if (!(await conn.getAccountInfo(new PublicKey(PROGRAM)))?.executable) { console.log(`program ${PROGRAM} not deployed on ${RPC}`); process.exit(1); }
if (!(await conn.getAccountInfo(new PublicKey(HOUSE)))) {
  console.log('init_house', await confirm(await sendAs(deployer)([initHouseIx(deployer.publicKey.toBase58(), TREASURY)])));
}

const p = Keypair.generate(), me = p.publicKey.toBase58();
await confirm(await sendAs(deployer)([SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: p.publicKey, lamports: PLAYER })]));
const before = { me: await bal(me), house: await bal(HOUSE) };
try {
  const chain = solanaChain(me, { tx: sendAs(p), rpc, pda });
  let t = Date.now();
  const lot = await chain.openLot(0);
  console.log(`lot ${lot.addr} filled by VRF in ${((Date.now() - t) / 1000).toFixed(1)}s: n=${lot.n} weight=${lot.weight} glow=${lot.glow} shown=0x${lot.shown.toString(16)} bots=${lot.bots} ui secs=${lot.secs}`);
  const bid = Math.min(1000, Math.max(...lot.bots) + 1); // reads the bots off chain: a test, and the known leak
  const c = await chain.commitBid(0, bid, 1000);
  console.log(`commit ${bid} coins (deposit 1000) ${c.commitment}`);
  t = Date.now();
  const r = await chain.revealAndSettle(0, c);
  console.log(`settled after ${((Date.now() - t) / 1000).toFixed(1)}s: winner=${r.w === 0 ? 'player' : r.w < 0 ? 'nobody' : 'bot ' + r.w} price=${r.price} items=${r.lot.items.map((x) => x.toString(16))}`);
  if (r.w === 0) console.log(`sell_back paid ${await chain.sellBack(r.lot, (1 << r.lot.n) - 1)} coins`);
  console.log(`player Δ ${(await bal(me)) - before.me} lamports, house Δ ${(await bal(HOUSE)) - before.house} lamports`);
} finally {
  const left = await bal(me);
  if (left > 5000) await confirm(await sendAs(p)([SystemProgram.transfer({ fromPubkey: p.publicKey, toPubkey: deployer.publicKey, lamports: left - 5000 })]));
}
