// Fresh monsters (skills) deploy: create account, deploy + init, point platform "brawler" at it, seed skills.
// node scripts/deploy-monsters-v2.mjs [--check]   (build first: make wasm)
// env: MONSTERS_ID, FUNDER_ID, OWNER_ID, PLATFORM_ID, REFEREE_ID, POOL_NEAR, NEAR_RPC. Keys: ~/.near-credentials/testnet.
// Preflight checks balances and exits with the exact shortfall before sending anything.
import { Account, JsonRpcProvider, KeyPair, actions, nearToYocto, yoctoToNear } from 'near-api-js';
import fs from 'node:fs';
import os from 'node:os';

const env = process.env;
const FUNDER = env.FUNDER_ID ?? 'brawler-monsters-5c8e2b.testnet';
const M = env.MONSTERS_ID ?? `v2.${FUNDER}`;
const OWNER = env.OWNER_ID ?? 'brawler-platform-5c8e2b.testnet';
const P = env.PLATFORM_ID ?? 'v3.brawler-platform-5c8e2b.testnet';
const REF = env.REFEREE_ID ?? `referee.${P}`;
const WASM = env.WASM ?? new URL('../games/brawler/contract/target/near/monsters.wasm', import.meta.url);
const rpc = new JsonRpcProvider({ url: env.NEAR_RPC ?? 'https://test.rpc.fastnear.com' });
const CREDS = `${os.homedir()}/.near-credentials/testnet`;
const local = (id) => new Account(id, rpc, JSON.parse(fs.readFileSync(`${CREDS}/${id}.json`)).private_key);
const Y = (n) => BigInt(nearToYocto(String(n)));
const TG = (n) => BigInt(n) * 10n ** 12n;
const BYTE = 10n ** 19n; // storage cost per byte

const code = fs.readFileSync(WASM);
const state = (id) => new Account(id, rpc).getState().catch(() => null);
const [mState, fState, oState] = await Promise.all([state(M), state(FUNDER), state(OWNER)]);
const deployed = mState && mState.codeHash !== '11111111111111111111111111111111';

// new account: code storage + ~10 KB state + storage pool (contract-paid mt_transfer/equip/history) + gas
const need = {
  [FUNDER]: mState ? 0n : BigInt(code.length) * BYTE + 10_000n * BYTE + Y(env.POOL_NEAR ?? 1) + Y(0.05),
  [OWNER]: Y(0.3), // register_game + ~20 seed calls (storage deposits, refunded excess) + gas
};
const have = { [FUNDER]: fState?.balance.available ?? 0n, [OWNER]: oState?.balance.available ?? 0n };
if (mState && !deployed) {
  need[M] = BigInt(code.length) * BYTE + 10_000n * BYTE;
  have[M] = mState.balance.available;
}
let short = false;
console.log(`wasm ${code.length} bytes; ${M} ${mState ? (deployed ? 'deployed' : 'exists, no code') : 'new'}`);
for (const [id, n] of Object.entries(need)) {
  const gap = n > have[id] ? n - have[id] : 0n;
  short ||= gap > 0n;
  console.log(`${id.padEnd(40)} need ${yoctoToNear(n)}  have ${yoctoToNear(have[id])}${gap ? `  SHORT ${yoctoToNear(gap)} NEAR` : '  ok'}`);
}
if (short || process.argv.includes('--check')) process.exit(short ? 1 : 0);

const ok = (step, r) => {
  const fail = r.receipts_outcome.find((o) => o.outcome.status.Failure);
  if (fail) throw new Error(`${step}: ${JSON.stringify(fail.outcome.status.Failure)}`);
  console.log(`${step.padEnd(36)} ${r.transaction.hash}`);
};
const init = actions.functionCall('new', { owner_id: OWNER, arena_id: P }, TG(30), 0n);

if (!mState) {
  const kp = KeyPair.fromRandom('ed25519');
  fs.writeFileSync(`${CREDS}/${M}.json`, JSON.stringify({ account_id: M, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }), { mode: 0o600 });
  ok('create + deploy + new', await local(FUNDER).signAndSendTransaction({
    receiverId: M,
    actions: [actions.createAccount(), actions.transfer(need[FUNDER] - Y(0.05)), actions.addFullAccessKey(kp.getPublicKey()), actions.deployContract(code), init],
  }));
} else if (!deployed) {
  ok('deploy + new', await local(M).signAndSendTransaction({ receiverId: M, actions: [actions.deployContract(code), init] }));
}

const game = await rpc.callFunction({ contractId: P, method: 'get_game', args: { game: 'brawler' }, blockQuery: { finality: 'final' } });
if (game?.assets_id !== M || game?.referee_id !== REF) {
  ok('register_game brawler', await local(OWNER).callFunctionRaw({ contractId: P, methodName: 'register_game', args: { game: 'brawler', referee_id: REF, assets_id: M }, deposit: '1', gas: TG(30) }));
}

process.env.MONSTERS_ID = M;
process.env.OWNER_ID = OWNER;
await import('./seed-skills.mjs');
console.log(`\nset MONSTERS_ID / NEXT_PUBLIC_MONSTERS_ID / NEXT_PUBLIC_ASSETS_ID = ${M}`);
