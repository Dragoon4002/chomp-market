// Idempotent chomp init(250) + register_game for every slug (tasks/devnet-spec.md §1).
// Run: node --experimental-strip-types scripts/devnet-init.ts   (env CHOMP_PROGRAM_ID, SOLANA_RPC optional)
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROGRAM = new PublicKey(process.env.CHOMP_PROGRAM_ID ?? '4m5U9NJaLNyDzZj926jE9Y9nvKYJf82MQEcabbbGqcNf');
const conn = new Connection(process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com', 'confirmed');
const load = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, 'utf8'))));
const authority = load(`${homedir()}/.config/solana/id.json`);

const REFEREED = ['brawler', 'keyfall', 'coinflip', 'ribbon', 'monster-siege'];
const SCORE_ONLY = ['2048', 'tomb-delve', 'pet-den', 'sealed-house'];

const disc = (s: string) => createHash('sha256').update(s).digest().subarray(0, 8);
const pda = (...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM)[0];
const config = pda(Buffer.from('config'));
const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const str = (s: string) => { const b = Buffer.from(s); const l = Buffer.alloc(4); l.writeUInt32LE(b.length); return Buffer.concat([l, b]); };
const ix = (name: string, args: Buffer, keys: [PublicKey, boolean, boolean][]) => new TransactionInstruction({
  programId: PROGRAM,
  keys: keys.map(([pubkey, isSigner, isWritable]) => ({ pubkey, isSigner, isWritable })),
  data: Buffer.concat([disc(`global:${name}`), args]),
});
const send = (i: TransactionInstruction) => sendAndConfirmTransaction(conn, new Transaction().add(i), [authority]);
const me = authority.publicKey, sys = SystemProgram.programId;

if (!(await conn.getAccountInfo(config))) {
  console.log('init(250)', await send(ix('init', u16(250), [[me, true, true], [config, false, true], [sys, false, false]])));
} else console.log('config exists', config.toBase58());

for (const slug of [...REFEREED, ...SCORE_ONLY]) {
  const kp = `${ROOT}.keys/referee-${slug}.json`;
  if (REFEREED.includes(slug) && !existsSync(kp)) throw new Error(`missing ${kp}`);
  const referee = REFEREED.includes(slug) ? load(kp).publicKey : me;
  const game = pda(Buffer.from('game'), Buffer.from(slug));
  const acc = await conn.getAccountInfo(game);
  // Game data: disc(8) ‖ slug(4+len) ‖ referee(32)
  if (acc && new PublicKey(acc.data.subarray(12 + slug.length, 44 + slug.length)).equals(referee)) {
    console.log(`game ${slug} ok`, game.toBase58());
    continue;
  }
  const sig = await send(ix('register_game', Buffer.concat([str(slug), referee.toBuffer()]),
    [[me, true, true], [config, false, false], [game, false, true], [sys, false, false]]));
  console.log(`register_game ${slug} -> ${referee.toBase58()}`, sig);
}
