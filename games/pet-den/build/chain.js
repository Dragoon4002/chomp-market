// Thin chain adapter. Today: in-memory mock of program/ (pet_den) running the same sim, plus the den's
// soft economy (coins/gems/items/quests), which is client-only for now.
// Real-time -> ticks happens here (the edge), never in sim.js.
import { newStats, advance, act, evolve } from './sim.js?v=2';

export const TICK_MS = 2000; // ponytail: demo speed; the program uses TICK_SECS = 60
export const MAX_PETS = 8; // pets + eggs, same as MAX_PETS in lib.rs
const KEY = 'petden.v2';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }; // portal sandbox: throws -> in-memory
const save = (st) => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* sandboxed */ } };

export function createChain(owner, now) {
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

  return {
    get st() { return st; },
    save: () => save(st),
    // TODO(solana): PER auth: verifyTeeRpcIntegrity(TEE) + getAuthToken(TEE, wallet, sign) -> Connection(`https://devnet-tee.magicblock.app?token=${token}`)
    //   then fetch Pet PDAs ["pet", owner, [idx]] from the TEE (owner-only read via the permission program).
    async createPet(dna) {
      // TODO(solana): VRF hatch + Core NFT mint. Base tx pet_den.create_pet(idx, dna) (+ CreatePermission CPI, member = owner).
      if (st.pets.length + st.eggs.length >= MAX_PETS) return ok('RosterFull');
      st.pets.push({ id: ++st.nid, dna, name: null, stats: newStats(dna), delegated: false, job: null, breedAt: 0 });
      return ok();
    },
    async delegate(i) {
      // TODO(solana): base tx pet_den.delegate_pet(idx), remainingAccounts = [TEE validator MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo].
      pet(i).delegated = true;
      return ok();
    },
    // Mirrors catch_up() for every pet: whole ticks since lastMs. Returns ticks advanced.
    async tick(now) {
      // TODO(solana): PER tx pet_den.tick (gasless) when the client wants a fresh read; reads are free via TEE RPC.
      const n = Math.max(0, Math.floor((now - st.lastMs) / TICK_MS));
      for (const p of st.pets) advance(p.stats, n);
      st.lastMs += n * TICK_MS; st.t += Math.min(n, 10000);
      ok(); return n;
    },
    async care(i, kind, score, boost, now) {
      // TODO(solana): PER tx pet_den.care(action, score, item), signed by a session key (gum-sdk V2), no wallet popup.
      await this.tick(now);
      return ok(act(pet(i).stats, kind, score, boost));
    },
    async evolve(i, now) {
      // TODO(solana): PER tx pet_den.evolve -> commit_and_undelegate pet + permission (tier public on base),
      //   then base tx delegate_pet again to keep caring. Magic Action: update Core NFT tier attribute.
      await this.tick(now);
      const err = evolve(pet(i).stats);
      if (!err) pet(i).delegated = false;
      return ok(err);
    },
  };
}
