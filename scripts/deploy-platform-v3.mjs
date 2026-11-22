// Fresh platform v3 deploy (state layout changed: no migration). Preflight checks balances first and exits
// without any tx if short. node scripts/deploy-platform-v3.mjs [--preflight]
// env: PLATFORM_ID, OWNER_ID, WASM (default contracts/platform/target/near/arena.wasm), NEAR_RPC; wiring env: see wire-platform.mjs
import { Account, JsonRpcProvider, KeyPair, actions, yoctoToNear } from 'near-api-js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

const env = process.env;
const P = env.PLATFORM_ID ?? 'v3.brawler-platform-5c8e2b.testnet';
const OWNER = env.OWNER_ID ?? 'brawler-platform-5c8e2b.testnet';
const M = env.MONSTERS_ID ?? 'brawler-monsters-5c8e2b.testnet';
const WASM = env.WASM ?? new URL('../contracts/platform/target/near/arena.wasm', import.meta.url).pathname;
const rpc = new JsonRpcProvider({ url: env.NEAR_RPC ?? 'https://test.rpc.fastnear.com' });
const CREDS = `${os.homedir()}/.near-credentials/testnet`;
const N = 10n ** 24n, BYTE = 10n ** 19n; // storage: 1e19 yocto per byte
const STATE = N / 2n, GAS = N / 20n; // state headroom on the new account, gas for the txs

const acct = (id) => rpc.query({ request_type: 'view_account', account_id: id, finality: 'final' }).catch(() => null);
const spendable = (a) => (a ? BigInt(a.amount) - BigInt(a.storage_usage) * BYTE : 0n);
const near = (y) => `${yoctoToNear(y < 0n ? -y : y)} NEAR`;

const code = fs.readFileSync(WASM);
const init = BigInt(code.length) * BYTE + STATE;
const [own, mon, target] = await Promise.all([acct(OWNER), acct(M), acct(P)]);
const mOwner = (await rpc.callFunction({ contractId: M, method: 'config', args: {} })).owner;
const need = [
  [OWNER, own, init + GAS, `create ${P} with ${near(init)} (wasm ${code.length} B + ${near(STATE)} state) + gas`],
  [mOwner, mOwner === M ? mon : await acct(mOwner), GAS / 5n, 'set_arena gas'],
];
let short = false;
if (target) console.log(`!! ${P} already exists: deploy is for a fresh account; use wire-platform.mjs to rewire`), (short = true);
for (const [id, a, amt, why] of need) {
  const have = spendable(a), gap = amt - have;
  console.log(`${id}: spendable ${near(have)}, needs ${near(amt)} (${why})${gap > 0n ? `  SHORT BY ${near(gap)}` : '  ok'}`);
  if (gap > 0n) short = true;
}
for (const id of [OWNER, mOwner, env.REFEREE_ID ?? 'referee.v2.brawler-platform-5c8e2b.testnet']) {
  if (!fs.existsSync(`${CREDS}/${id}.json`)) console.log(`!! missing key ${CREDS}/${id}.json`), (short = true);
}
if (short) {
  console.log('preflight FAILED: nothing sent');
  process.exit(1);
}
console.log('preflight ok');
if (process.argv.includes('--preflight')) process.exit(0);

const kp = KeyPair.fromRandom('ed25519');
fs.writeFileSync(`${CREDS}/${P}.json`, JSON.stringify({ account_id: P, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }), { mode: 0o600 });
const owner = new Account(OWNER, rpc, JSON.parse(fs.readFileSync(`${CREDS}/${OWNER}.json`)).private_key);
const r = await owner.signAndSendTransaction({
  receiverId: P,
  actions: [
    actions.createAccount(),
    actions.transfer(init),
    actions.addFullAccessKey(kp.getPublicKey()),
    actions.deployContract(code),
    actions.functionCall('new', { owner_id: OWNER }, 30n * 10n ** 12n, 0n),
  ],
});
console.log(`create + deploy + new ${P}: ${r.transaction.hash}`);
execFileSync('node', [new URL('./wire-platform.mjs', import.meta.url).pathname], { stdio: 'inherit', env: { ...env, PLATFORM_ID: P } });
