// Thin chain adapter. Two backends, same API:
//  - real: inside the portal with a wallet (Chomp.tx/rpc/pda bridge, tasks/devnet-spec.md §3) -> pet_den program on
//    Solana devnet, base layer. Pet stats live on chain; the client only projects decay between txs (same catch_up as
//    lib.rs) and sends a tx on user actions only (create / care / evolve / release). No tick txs: care + evolve catch up.
//  - mock: standalone or signed out -> in-memory copy of the program running the same sim (free play, smoke.mjs).
// The den's soft economy (coins/gems/items/quests/jobs/breeding/names) is client-only in both.
// Real-time -> ticks happens here (the edge), never in sim.js.
import { newStats, advance, act, evolve } from './sim.js?v=2';

export const TICK_MS = 2000; // ponytail: demo speed for the mock + client features (jobs, breeding rest)
export const TICK_SECS = 60; // == TICK_SECS in lib.rs: on-chain pet stats tick once a minute
export const MAX_PETS = 8; // pets + eggs, same as MAX_PETS in lib.rs
export const PROGRAM = '2shkiB14DfoCSKawmYMv3qsGTBCxuN4onKQuztYyG2ue';
const SYSTEM = '11111111111111111111111111111111';
// sha256("global:<ix>")[..8]
const DISC = {
  create_pet: [31, 116, 155, 96, 251, 101, 128, 164],
  care: [110, 222, 254, 89, 135, 196, 90, 106],
  evolve: [139, 139, 160, 98, 252, 226, 106, 81],
  release: [253, 249, 15, 206, 28, 127, 193, 241],
};
const ACTION = { feed: 0, play: 1, clean: 2, sleep: 3, train: 4, interact: 5, habitat: 6 };
const ERRS = ['Dead', 'Asleep', 'Tired', 'NotReady', 'MaxTier', 'Sick', 'NotOwner', 'BadAction', 'RosterFull', 'Cooldown']; // PetError, code 6000+i

const KEY = 'petden.v2';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }; // portal sandbox: throws -> in-memory
const save = (st) => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* sandboxed */ } };

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const u32le = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

// Pet account: disc 8 | owner 32 | idx u8 | dna u32 | Stats (field order of sim.rs) | last_ts i64 | bump u8 = 86 bytes.
export function decodePet(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), u32 = (o) => v.getUint32(o, true);
  return {
    idx: b[40], dna: u32(41), last_ts: Number(v.getBigInt64(77, true)),
    stats: {
      full: b[45], joy: b[46], energy: b[47], hygiene: b[48], health: b[49], asleep: !!b[50], alive: !!b[51], tier: b[52],
      xp: u32(53), str: b[57], int: b[58], kind: b[59], habitat: b[60], calm_until: u32(61), age: u32(65), streak: u32(69), best_streak: u32(73),
    },
  };
}

export async function createChain(owner, now, session = {}) {
  let st = load();
  if (!st || st.owner !== owner) {
    st = {
      owner, t: 0, lastMs: now, sel: 0, nid: 0, pets: [], eggs: [],
      // TODO(solana): coins = SPL soft token, gems = premium SPL; items = SPL item tokens burned by care(item=1).
      coins: 120, gems: 5, inv: { treat: 2, toy: 1, soap: 1 },
      n: { feed: 0, play: 0, train: 0, win: 0, evolve: 0, breed: 0, job: 0, earned: 0, hatch: 0, games: 0 },
      quests: { round: 0, base: null, claimed: [] }, ach: [], log: [],
    };
  }
  const ok = (err) => { save(st); if (err) throw new Error(err); return st; };
  const pet = (i) => st.pets[i];
  // Demo clock for client features (jobs, breeding rest). Returns ticks advanced.
  const clock = (now) => {
    const n = Math.max(0, Math.floor((now - st.lastMs) / TICK_MS));
    st.lastMs += n * TICK_MS; st.t += Math.min(n, 10000);
    return n;
  };

  const C = globalThis.Chomp;
  if (!(session.wallet && C?.tx && globalThis.parent !== globalThis)) {
    return { // ---- mock ----
      get st() { return st; },
      save: () => save(st),
      async createPet(dna) {
        if (st.pets.length >= MAX_PETS) return ok('RosterFull');
        st.pets.push({ id: ++st.nid, dna, name: null, stats: newStats(dna), delegated: false, job: null, breedAt: 0 });
        return ok();
      },
      async delegate(i) { pet(i).delegated = true; return ok(); },
      async release() { return ok(); },
      // Mirrors catch_up() for every pet: whole ticks since lastMs. Returns ticks advanced.
      async tick(now) {
        const n = clock(now);
        for (const p of st.pets) advance(p.stats, n);
        ok(); return n;
      },
      async care(i, kind, score, boost, now) {
        await this.tick(now);
        return ok(act(pet(i).stats, kind, score, boost));
      },
      async evolve(i, now) {
        await this.tick(now);
        const err = evolve(pet(i).stats);
        if (!err) pet(i).delegated = false;
        return ok(err);
      },
    };
  }

  // ---- real: pet_den on devnet, base layer ----
  // ponytail: base layer, not the Private ER. The bridge's rpc can't carry a TEE auth token, so PER reads are out of
  // reach from the iframe; program keeps create_permission / delegate_pet / evolve_commit for when it can.
  const pid = session.programs?.petDen || PROGRAM, me = session.wallet;
  const pdas = (await Promise.all([...Array(MAX_PETS)].map((_, i) => C.pda(pid, [{ s: 'pet' }, { pk: me }, { u8: i }])))).map((r) => r.address);
  const read = async (idxs) => {
    const r = await C.rpc('getMultipleAccounts', [idxs.map((i) => pdas[i]), { encoding: 'base64', commitment: 'confirmed' }]);
    return r.value.map((a) => (a && a.owner === pid ? decodePet(unb64(a.data[0])) : null));
  };
  // On-chain stats + whole TICK_SECS since last_ts (catch_up in lib.rs). Display only; the next tx makes it real.
  const project = (p, now) => { p.stats = advance({ ...p.chain.stats }, Math.max(0, Math.floor((now / 1000 - p.chain.last_ts) / TICK_SECS))); };
  const errName = (code) => ERRS[code - 6000] || `Program error ${code}`;
  async function send(data, pda, write = false, extra = []) {
    let sig;
    try {
      sig = await C.tx([{ programId: pid, data: b64(data), keys: [
        { pubkey: me, isSigner: true, isWritable: write },
        { pubkey: pda, isSigner: false, isWritable: true },
        ...extra,
      ] }]);
    } catch (e) {
      const m = String(e?.message || e).match(/custom program error: 0x([0-9a-f]+)/i);
      throw new Error(m ? errName(parseInt(m[1], 16)) : String(e?.message || e));
    }
    for (let i = 0; i < 30; i++) { // ~30 s
      const s = (await C.rpc('getSignatureStatuses', [[sig]])).value[0];
      if (s?.err) throw new Error(s.err.InstructionError?.[1]?.Custom !== undefined ? errName(s.err.InstructionError[1].Custom) : JSON.stringify(s.err));
      if (s && s.confirmationStatus !== 'processed') return sig;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('Transaction not confirmed, try again.');
  }
  const refresh = async (p) => { [p.chain] = await read([p.idx]); project(p, Date.now()); };

  const old = new Map(st.pets.filter((p) => p.idx !== undefined).map((p) => [p.idx, p]));
  st.pets = (await read(pdas.map((_, i) => i))).filter(Boolean).map((c) => ({ name: null, job: null, breedAt: 0, ...old.get(c.idx), id: old.get(c.idx)?.id ?? ++st.nid, idx: c.idx, dna: c.dna, chain: c, delegated: false }));
  st.pets.forEach((p) => project(p, now));
  st.sel = Math.min(st.sel, Math.max(0, st.pets.length - 1));

  return {
    get st() { return st; },
    save: () => save(st),
    async createPet(dna) {
      if (st.pets.length >= MAX_PETS) return ok('RosterFull');
      const used = new Set(st.pets.map((p) => p.idx)), idx = [...Array(MAX_PETS).keys()].find((i) => !used.has(i));
      await send([...DISC.create_pet, idx, ...u32le(dna)], pdas[idx], true, [{ pubkey: SYSTEM, isSigner: false, isWritable: false }]);
      const p = { id: ++st.nid, idx, dna, name: null, job: null, breedAt: 0, delegated: false };
      await refresh(p);
      st.pets.push(p);
      return ok();
    },
    async delegate() { return ok(); }, // base layer: nothing to delegate
    async release(i) { await send(DISC.release, pdas[pet(i).idx], true); return ok(); },
    async tick(now) {
      const n = clock(now);
      for (const p of st.pets) project(p, now);
      ok(); return n;
    },
    async care(i, kind, score, boost, now) {
      const p = pet(i); project(p, now);
      const err = act({ ...p.stats }, kind, score, boost); // same rules locally first: no fee for a doomed tx
      if (err) return ok(err);
      await send([...DISC.care, ACTION[kind], Math.max(0, Math.min(255, score | 0)), boost ? 1 : 0], pdas[p.idx]);
      await refresh(p);
      return ok();
    },
    async evolve(i, now) {
      const p = pet(i); project(p, now);
      const err = evolve({ ...p.stats });
      if (err) return ok(err);
      await send(DISC.evolve, pdas[p.idx]);
      await refresh(p);
      return ok();
    },
  };
}
