// Seed the monsters contract with the "Arena Basics" skills + presales. Skips anything already there.
// node scripts/seed-skills.mjs   (env: MONSTERS_ID, OWNER_ID, MARKET_URL, NEAR_RPC; keys from ~/.near-credentials/testnet)
import { Account, JsonRpcProvider, nearToYocto } from 'near-api-js';
import fs from 'node:fs';
import os from 'node:os';

const env = process.env;
const M = env.MONSTERS_ID ?? 'v2.brawler-monsters-5c8e2b.testnet';
const OWNER = env.OWNER_ID ?? 'brawler-platform-5c8e2b.testnet';
const MARKET = env.MARKET_URL ?? 'https://market.13-54-190-122.sslip.io';
const rpc = new JsonRpcProvider({ url: env.NEAR_RPC ?? 'https://test.rpc.fastnear.com' });
const key = JSON.parse(fs.readFileSync(`${os.homedir()}/.near-credentials/testnet/${OWNER}.json`)).private_key;
const owner = new Account(OWNER, rpc, key);
const Y = (n) => nearToYocto(String(n)).toString();
const DEP = Y(0.02); // storage; excess refunded
const view = (method, args = {}) => rpc.callFunction({ contractId: M, method, args, blockQuery: { finality: 'final' } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(step, method, args, deposit = DEP) {
  const r = await owner.callFunctionRaw({ contractId: M, methodName: method, args, deposit, gas: 50n * 10n ** 12n });
  const fail = r.receipts_outcome.find((o) => o.outcome.status.Failure);
  if (fail) throw new Error(`${step}: ${JSON.stringify(fail.outcome.status.Failure)}`);
  console.log(`${step.padEnd(36)} ${r.transaction.hash}`);
  await sleep(1500);
  const v = r.status.SuccessValue;
  return v ? JSON.parse(Buffer.from(v, 'base64').toString() || 'null') : null;
}

const STATS = [['Power', 'Power'], ['Agility', 'Agility'], ['Durability', 'Durability'], ['Speed', 'Speed']];
const EFFECTS = [['AirJump', 'Air Jump'], ['Lifesteal', 'Lifesteal'], ['QuickDodge', 'Quick Dodge'], ['SecondWind', 'Second Wind']];
const SKILLS = [
  ...STATS.map(([kind, n]) => ({ kind, name: `${n} I`, mag: 1, rarity: 'Common', max_supply: null })),
  ...STATS.map(([kind, n]) => ({ kind, name: `${n} II`, mag: 2, rarity: 'Rare', max_supply: 200 })),
  ...EFFECTS.map(([kind, name]) => ({ kind, name, mag: 1, rarity: 'Rare', max_supply: 200 })),
];
const RARE_PRESALE = env.RARE_PRESALE ?? 'Air Jump';
const DAY = 86_400_000;

if (!(await view('is_creator', { account_id: OWNER }))) await call('add_creator', 'add_creator', { account_id: OWNER }, '1');

let col = (await view('collections', { from: 0, limit: 50 })).find((c) => c.name === 'Arena Basics' && c.creator === OWNER)?.id;
col ??= await call('create_collection Arena Basics', 'create_collection', {
  name: 'Arena Basics',
  description: 'The starter set: stat boosts and fight-changing effects.',
  media: `${MARKET}/skills/collection.svg`,
});

const have = await view('skill_types', { from: 0, limit: 50 });
const ids = {};
for (const s of SKILLS) {
  ids[s.name] = have.find((t) => t.collection === col && t.name === s.name)?.id ??
    (await call(`create_skill ${s.name}`, 'create_skill', { collection: col, ...s, royalty_bps: 500, media: `${MARKET}/skills/${s.kind.toLowerCase()}.svg` }));
}

const sales = await view('presales', { from: 0, limit: 50 });
const open = (id) => sales.some((p) => p.skill === id && !p.ended);
for (const s of SKILLS.filter((s) => s.rarity === 'Common')) {
  const id = ids[s.name];
  if (!open(id)) await call(`shop ${s.name}`, 'create_presale', { skill: id, price: Y(0.05), start_ms: 0, end_ms: null, cap_total: null, per_wallet: null, allowlist: null });
}
const rare = ids[RARE_PRESALE];
if (!open(rare)) {
  const now = Date.now();
  await call(`presale ${RARE_PRESALE} 24h`, 'create_presale', { skill: rare, price: Y(env.RARE_PRICE ?? 0.2), start_ms: now, end_ms: now + DAY, cap_total: 200, per_wallet: 2, allowlist: null });
}
console.log('seeded', M, ids);
