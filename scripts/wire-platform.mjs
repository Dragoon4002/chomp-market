// Wire a platform deploy to its referee + assets. Idempotent upserts, rerun after any new platform/monsters deploy.
// node scripts/wire-platform.mjs   (env: PLATFORM_ID, OWNER_ID, REFEREE_ID, MONSTERS_ID, NEAR_RPC)
// 1. platform owner: register_game("brawler", referee, monsters, referee public key from ~/.near-credentials)
// 2. monsters owner: set_arena(platform)
import { Account, JsonRpcProvider } from 'near-api-js';
import fs from 'node:fs';
import os from 'node:os';

const env = process.env;
const P = env.PLATFORM_ID ?? 'v3.brawler-platform-5c8e2b.testnet';
const OWNER = env.OWNER_ID ?? 'brawler-platform-5c8e2b.testnet';
const REF = env.REFEREE_ID ?? 'referee.v2.brawler-platform-5c8e2b.testnet';
const M = env.MONSTERS_ID ?? 'v2.brawler-monsters-5c8e2b.testnet';
const rpc = new JsonRpcProvider({ url: env.NEAR_RPC ?? 'https://test.rpc.fastnear.com' });
const cred = (id) => JSON.parse(fs.readFileSync(`${os.homedir()}/.near-credentials/testnet/${id}.json`));
const local = (id) => new Account(id, rpc, cred(id).private_key);
const view = (contractId, method, args = {}) => rpc.callFunction({ contractId, method, args, blockQuery: { finality: 'optimistic' } });
const call = async (who, contractId, methodName, args) => {
  const r = await local(who).callFunctionRaw({ contractId, methodName, args, deposit: 1n, gas: 30n * 10n ** 12n });
  console.log(`${contractId}.${methodName} by ${who}: ${r.transaction.hash}`);
};

const referee_key = cred(REF).public_key;
await call(OWNER, P, 'register_game', { game: 'brawler', referee_id: REF, assets_id: M, referee_key });
const mOwner = (await view(M, 'config')).owner;
await call(mOwner, M, 'set_arena', { arena_id: P });
const g = await view(P, 'get_game', { game: 'brawler' });
if (g.referee_key !== referee_key || g.assets_id !== M || (await view(M, 'config')).arena !== P) throw new Error('wiring check failed');
console.log(`wired ${P}: referee ${REF} (${referee_key}), assets ${M}`);
