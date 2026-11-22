// Testnet money-path e2e against a live deployment, local keys from ~/.near-credentials/testnet.
// node scripts/testnet-e2e.mjs   (env: PLATFORM_ID, MONSTERS_ID, OWNER_ID, REFEREE_ID, FUNDER_ID, NEAR_RPC)
// Creates throwaway subaccounts of FUNDER_ID, deletes them at the end (balance back to FUNDER_ID).
import { Account, JsonRpcProvider, KeyPair, nearToYocto, yoctoToNear } from 'near-api-js';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';

const env = process.env;
const P = env.PLATFORM_ID ?? 'v3.brawler-platform-5c8e2b.testnet';
const M = env.MONSTERS_ID ?? 'v2.brawler-monsters-5c8e2b.testnet';
const OWNER = env.OWNER_ID ?? 'brawler-platform-5c8e2b.testnet';
const REF = env.REFEREE_ID ?? 'referee.v2.brawler-platform-5c8e2b.testnet';
const FUNDER = env.FUNDER_ID ?? 'brawler-monsters-5c8e2b.testnet';
const rpc = new JsonRpcProvider({ url: env.NEAR_RPC ?? 'https://test.rpc.fastnear.com' });
const CREDS = `${os.homedir()}/.near-credentials/testnet`;
const key = (id) => JSON.parse(fs.readFileSync(`${CREDS}/${id}.json`)).private_key;
const local = (id) => new Account(id, rpc, key(id));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const Y = (n) => nearToYocto(String(n)).toString();
const TG = (n) => BigInt(n) * 10n ** 12n;

const txs = [];
async function tx(step, a, contractId, methodName, args = {}, deposit = '0', gas = TG(100)) {
  const r = await a.callFunctionRaw({ contractId, methodName, args, deposit, gas });
  const hash = r.transaction.hash;
  const fail = r.receipts_outcome.find((o) => o.outcome.status.Failure);
  txs.push({ step, hash });
  await sleep(2000); // load-balanced RPC: let views catch up
  console.log(`${step.padEnd(34)} ${hash}${fail ? '  RECEIPT FAILED ' + JSON.stringify(fail.outcome.status.Failure) : ''}`);
  const v = r.status.SuccessValue;
  return v ? JSON.parse(Buffer.from(v, 'base64').toString() || 'null') : null;
}
const view = (contractId, method, args = {}) => rpc.callFunction({ contractId, method, args, blockQuery: { finality: 'optimistic' } });
const bal = async (who) => BigInt(await view(P, 'balance_of', { account_id: who.accountId }));
const tape = (s) => createHash('sha256').update(s).digest('hex');
const UNIT = 10n ** 22n, TICK = UNIT / 10000n;
// referee attestation, same as brawler-server referee::attestation: ed25519 over sha256(settle_msg), base64
const attest = (match_id, winner, kos, tape_hash) => {
  const msg = `brawler-settle|${P}|${match_id}|${winner ?? 'none'}|${kos[0]},${kos[1]}|${tape_hash}`;
  const signature = Buffer.from(KeyPair.fromString(key(REF)).sign(createHash('sha256').update(msg).digest()).signature).toString('base64');
  return { match_id, winner, kos, tape_hash, signature };
};
const rejects = async (step, p, msg) => {
  const e = await p.then(() => null, (e) => e);
  assert.ok(e && String(e.message ?? e).includes(msg), `${step}: expected '${msg}', got ${e?.message ?? 'success'}`);
  console.log(`${step.padEnd(34)} rejected: ${msg}`);
};

const funder = local(FUNDER), owner = local(OWNER), ref = local(REF);
const tag = `e2e${Date.now().toString(36)}`;
// key saved before create: a crashed run's accounts stay recoverable
async function mk(name, near) {
  const id = `${tag}${name}.${FUNDER}`;
  const kp = KeyPair.fromRandom('ed25519');
  fs.writeFileSync(`${CREDS}/${id}.json`, JSON.stringify({ account_id: id, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }), { mode: 0o600 });
  const r = await funder.createAccount({ newAccountId: id, publicKey: kp.getPublicKey(), nearToTransfer: Y(near) });
  txs.push({ step: `create ${name}`, hash: r.transaction.hash });
  await sleep(2000);
  return new Account(id, rpc, kp.toString());
}
const drop = async (x) => {
  txs.push({ step: `delete ${x.accountId.slice(tag.length)}`, hash: (await x.deleteAccount(FUNDER)).transaction.hash });
  fs.rmSync(`${CREDS}/${x.accountId}.json`);
};

// --cleanup: withdraw + delete leftovers of crashed runs
if (process.argv.includes('--cleanup')) {
  for (const f of fs.readdirSync(CREDS).filter((f) => /^e2e[0-9a-z]+\./.test(f) && f.endsWith(`.${FUNDER}.json`))) {
    const x = local(f.slice(0, -5));
    const left = await bal(x).catch(() => 0n);
    if (left > 0n) await tx(`withdraw ${x.accountId}`, x, P, 'withdraw', { amount: left.toString() }).catch((e) => console.log(e.message));
    await drop(x).catch((e) => console.log(x.accountId, e.message));
  }
  process.exit(0);
}

const [a, b, c, d] = await Promise.all(['a', 'b', 'c', 'd'].map((n) => mk(n, n === 'a' ? 0.5 : 0.4)));
console.log('accounts', [a, b, c, d].map((x) => x.accountId));
for (const x of [a, b, c, d]) await tx(`deposit ${x.accountId.slice(tag.length, tag.length + 1)}`, x, P, 'deposit', {}, Y(0.12), TG(30));

// staked bettable match, order book both sides, winner settles with the referee's attestation (no referee gas)
const stake = Y(0.05);
const m1 = await tx('create_match bettable 0.05', a, P, 'create_match', { game: 'brawler', stake, bettable: true, monster_id: null }, '1');
await tx('join_match', b, P, 'join_match', { match_id: m1, monster_id: null }, '1');
await rejects('player order', a.callFunction({ contractId: P, methodName: 'place_order', args: { match_id: m1, side: 0, price_bps: 5000, qty: 1 }, deposit: 1n, gas: TG(100) }), 'Players cannot bet');
const c0 = await bal(c), d0 = await bal(d);
await tx('order c side0 @60% x5 (rests)', c, P, 'place_order', { match_id: m1, side: 0, price_bps: 6000, qty: 5 }, '1');
const fill = await tx('order d side1 @50% x3 (fills @40%)', d, P, 'place_order', { match_id: m1, side: 1, price_bps: 5000, qty: 3 }, '1');
assert.deepEqual([fill.id, fill.filled, fill.cost], [null, 3, (3n * 4000n * TICK).toString()], 'price improvement to taker');
assert.equal(d0 - (await bal(d)), 3n * 4000n * TICK);
assert.deepEqual(await view(P, 'get_book', { match_id: m1 }), [[[6000, 2]], []]);
const [oc] = await view(P, 'get_orders', { match_id: m1, account_id: c.accountId });
assert.equal(await tx('cancel c rest', c, P, 'cancel_order', { match_id: m1, order_id: oc.id }), (2n * 6000n * TICK).toString());
assert.equal(c0 - (await bal(c)), 3n * 6000n * TICK);
assert.equal((await view(P, 'get_fills', { match_id: m1, limit: 5 }))[0].price_bps, 4000);
const h1 = tape(`${tag} match ${m1}`);
const s1 = attest(m1, 0, [3, 1], h1);
await rejects('settle forged', a.callFunction({ contractId: P, methodName: 'settle', args: { ...s1, winner: 1 }, gas: TG(100) }), 'Bad signature');
const aBefore = await bal(a);
await tx('settle by winner a (attestation)', a, P, 'settle', s1);
const mv = await view(P, 'get_match', { match_id: m1 });
assert.equal(mv.status, 'settled');
assert.equal(mv.tape_hash, h1);
assert.equal(await bal(a) - aBefore, 2n * BigInt(stake) - (2n * BigInt(stake)) / 1000n, 'winner credited by settle, no claim');
await rejects('settle replay', b.callFunction({ contractId: P, methodName: 'settle', args: s1, gas: TG(100) }), 'Match not live');
const cBefore = await bal(c);
await tx('claim bettor c', c, P, 'claim', { match_id: m1 });
assert.equal(await bal(c) - cBefore, 3n * UNIT - (3n * UNIT) / 1000n, 'winning shares pay UNIT - fee');
assert.equal(await view(P, 'claimable', { match_id: m1, account_id: d.accountId }), '0');

// unjoin: guest refunded, room reopens, new challenger joins
const m2 = await tx('create_match 0.05', a, P, 'create_match', { game: 'brawler', stake, bettable: false, monster_id: null }, '1');
const bB = await bal(b);
await tx('join_match b', b, P, 'join_match', { match_id: m2, monster_id: null }, '1');
await tx('unjoin (referee)', ref, P, 'unjoin', { match_id: m2 });
let v2 = await view(P, 'get_match', { match_id: m2 });
assert.equal(v2.status, 'open');
assert.equal(v2.guest, null);
assert.equal(await bal(b), bB);
await tx('join_match c', c, P, 'join_match', { match_id: m2, monster_id: null }, '1');
const [a2, c2] = [await bal(a), await bal(c)];
await tx('report_result void (fallback path)', ref, P, 'report_result', { match_id: m2, winner: null, kos: null, tape_hash: null }, '0', TG(100));
assert.deepEqual([await bal(a) - a2, await bal(c) - c2], [BigInt(stake), BigInt(stake)], 'void stakes credited');

// monsters: starters, breed, market, rent, failed payout -> withdraw_owed
const hatch = async (x) => (await tx(`hatch_starters ${x.accountId.slice(tag.length, tag.length + 1)}`, x, M, 'hatch_starters', {}, Y(0.1))).map((m) => m.token_id);
const [ma, mb, mc, md] = [await hatch(a), await hatch(b), await hatch(c), await hatch(d)];
const cfg = await view(M, 'config');
const child = await tx('breed', a, M, 'breed', { a: ma[0], b: ma[1] }, (BigInt(cfg.breed_fee) + BigInt(Y(0.05))).toString());
assert.equal(child.gen, 1);
await tx('list', a, M, 'list', { token_id: ma[2], price: Y(0.05) }, '1');
await tx('buy monster', b, M, 'buy', { token_id: ma[2] }, Y(0.05));
assert.equal((await view(M, 'get_monster', { token_id: ma[2] })).owner_id, b.accountId);
await tx('offer_rent', b, M, 'offer_rent', { token_id: mb[0], price_per_day: Y(0.01), max_days: 3 }, '1');
await tx('rent 1 day', c, M, 'rent', { token_id: mb[0], days: 1 }, Y(0.01));
assert.equal((await view(M, 'get_monster', { token_id: mb[0] })).rental.renter, c.accountId);
// seller account gone at sale time -> payout parks in owed; recreate it, withdraw
const e = await mk('e', 0.4);
const me = await hatch(e);
await tx('list (seller e)', e, M, 'list', { token_id: me[0], price: Y(0.05) }, '1');
await drop(e);
await tx('buy from deleted seller (payout fails, expected)', c, M, 'buy', { token_id: me[0] }, Y(0.05));
const owed = BigInt(await view(M, 'owed_of', { account_id: e.accountId }));
assert.ok(owed > 0n, 'failed payout owed');
const e2 = await mk('e', 0.2);
assert.equal(await tx('withdraw_owed', e2, M, 'withdraw_owed', {}), owed.toString());

// 4-player tournament: settle, void decided by KOs, final, champion claims
const tid = await tx('create_tournament 4', owner, P, 'create_tournament', { game: 'brawler', size: 4, entry_fee: Y(0.02), bettable: true }, '1');
for (const [x, mon] of [[a, child.token_id], [b, mb[1]], [c, mc[0]], [d, md[0]]]) {
  await tx(`enter_tournament ${x.accountId.slice(tag.length, tag.length + 1)}`, x, P, 'enter_tournament', { id: tid, monster_id: mon }, '1', TG(150));
}
let t = await view(P, 'get_tournament', { id: tid });
assert.equal(t.status, 'live');
const [r0, r1] = t.rounds[0];
await tx('settle t-semi1 w1 by b', b, P, 'settle', attest(r0, 1, [1, 3], tape(`${tag} ${r0}`)));
await tx('report t-semi2 void kos[0,2]', ref, P, 'report_result', { match_id: r1, winner: null, kos: [0, 2], tape_hash: null }, '0', TG(100));
t = await view(P, 'get_tournament', { id: tid });
const fin = await view(P, 'get_match', { match_id: t.rounds[1][0] });
assert.deepEqual([fin.host, fin.guest], [b.accountId, d.accountId], 'void semi: more KOs (d) advances');
await tx('report final w1 (d)', ref, P, 'report_result', { match_id: fin.id, winner: 1, kos: [2, 3], tape_hash: tape(`${tag} ${fin.id}`) }, '0', TG(100));
t = await view(P, 'get_tournament', { id: tid });
assert.equal(t.champion, d.accountId);
assert.equal(await tx('claim_tournament', d, P, 'claim_tournament', { id: tid }), (BigInt(Y(0.08)) - BigInt(Y(0.08)) / 1000n).toString());

// withdraw everything, delete throwaways
for (const x of [a, b, c, d]) {
  const left = await bal(x);
  if (left > 0n) await tx(`withdraw ${x.accountId.slice(tag.length, tag.length + 1)} ${yoctoToNear(left)}`, x, P, 'withdraw', { amount: left.toString() });
  assert.equal(await bal(x), 0n);
}
for (const x of [a, b, c, d, e2]) await drop(x);

console.log('\nOK\n| step | tx |\n|---|---|');
for (const { step, hash } of txs) console.log(`| ${step} | [${hash.slice(0, 10)}…](https://testnet.nearblocks.io/txns/${hash}) |`);
